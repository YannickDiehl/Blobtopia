/**
 * procedural.js — Procedural city generation: terrain, streets, river, bridges,
 * landmarks, trees, decorations, and the main createCity() entry point.
 */
import * as THREE from 'three'
import {
  mulberry32, GRID, CX, CY, RIVER_POINTS,
  streetMat, sidewalkMat, waterMat, riverBankMat, bridgeMat, trunkMat,
  trunkGeo, leafSphereGeo, leafConeGeo,
  TYPE_LABELS, DISTRICT_LABELS,
} from './constants'
import {
  DISTRICTS, CIVIC_COLOR, BASE_COLOR, LANDMARKS_DATA,
  isExcluded, getDistrictAt,
} from './districts'
import {
  buildingRegistry, walkableGrid,
  advanceBuildingId, resetBuildingId, tagBuildingMesh,
} from './building-registry'
import {
  loadKenneyModels, cloneKenneyModel, createFallbackBuilding,
  tintModelByDistrict, placeAllRoadTiles,
} from './kenney-loader'

// ── Helper: Terrain color blending ───────────────────────────
function getTerrainColor (x, y) {
  let r = BASE_COLOR[0] * 0.15, g = BASE_COLOR[1] * 0.15, b = BASE_COLOR[2] * 0.15
  let tw = 0.15

  // Civic center
  const cd = Math.sqrt((x - CX) ** 2 + (y - CY) ** 2)
  if (cd < 520) {
    const w = ((1 - cd / 520) ** 2) * 0.7
    r += CIVIC_COLOR[0] * w; g += CIVIC_COLOR[1] * w; b += CIVIC_COLOR[2] * w; tw += w
  }

  for (const d of DISTRICTS) {
    const dx = Math.max(d.x1 - x, x - d.x2, 0)
    const dy = Math.max(d.y1 - y, y - d.y2, 0)
    const dist = Math.sqrt(dx * dx + dy * dy)
    const inside = x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2
    let w = 0
    if (inside) w = 1.2
    else if (dist < 140) w = ((1 - dist / 140) ** 2) * 0.9
    if (w > 0) { r += d.groundColor[0] * w; g += d.groundColor[1] * w; b += d.groundColor[2] * w; tw += w }
  }

  // River influence (horizontal)
  const riverCurve = new THREE.CatmullRomCurve3(RIVER_POINTS.map(p => new THREE.Vector3(p[0], 0, p[1])))
  for (let t = 0; t <= 1; t += 0.05) {
    const rp = riverCurve.getPointAt(t)
    const rd = Math.sqrt((x - rp.x) ** 2 + (y - rp.z) ** 2)
    if (rd < 88) {
      const rw = ((1 - rd / 88) ** 2) * 0.4
      r += 0.29 * rw; g += 0.56 * rw; b += 0.85 * rw; tw += rw
      break
    }
  }

  return [r / tw, g / tw, b / tw]
}

// ── Terrain ──────────────────────────────────────────────────
function createTerrain () {
  const seg = 100
  const geo = new THREE.PlaneGeometry(GRID, GRID, seg, seg)
  geo.rotateX(-Math.PI / 2)
  geo.translate(GRID / 2, 0, GRID / 2)

  const pos = geo.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const [cr, cg, cb] = getTerrainColor(pos.getX(i), pos.getZ(i))
    colors[i * 3] = cr; colors[i * 3 + 1] = cg; colors[i * 3 + 2] = cb
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.position.y = -0.3
  mesh.receiveShadow = true
  return mesh
}

// ── Curved Road Ribbon Mesh ──────────────────────────────────
function createRibbonMesh (curve, width, samples, mat, yOffset) {
  const pts = curve.getPoints(samples)
  const verts = [], indices = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const t = i / (pts.length - 1)
    const tan = curve.getTangentAt(Math.min(t, 0.9999))
    const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
    const hw = width / 2
    verts.push(p.x + perp.x * hw, yOffset, p.z + perp.z * hw)
    verts.push(p.x - perp.x * hw, yOffset, p.z - perp.z * hw)
    if (i < pts.length - 1) {
      const b = i * 2
      indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return new THREE.Mesh(geo, mat)
}

// ── Ring Roads ───────────────────────────────────────────────
function makeRingCurve (radius, numPts, jitter, rng) {
  const pts = []
  for (let i = 0; i < numPts; i++) {
    const a = (i / numPts) * Math.PI * 2
    const r = radius + (rng() - 0.5) * jitter * 2
    pts.push(new THREE.Vector3(CX + Math.cos(a) * r, 0, CY + Math.sin(a) * r))
  }
  pts.push(pts[0].clone()) // close the loop
  return new THREE.CatmullRomCurve3(pts, true)
}

// ── Radial Roads ─────────────────────────────────────────────
const RADIAL_DEFS = [
  { label: 'N', pts: [[1000, 820], [992, 520], [1008, 220]] }
  ,{ label: 'NE', pts: [[1192, 848], [1472, 580], [1700, 340]] }
  ,{ label: 'E', pts: [[1220, 1000], [1540, 992], [1900, 1008]] }
  ,{ label: 'SE', pts: [[1192, 1152], [1488, 1472], [1700, 1740]] }
  ,{ label: 'S', pts: [[1000, 1180], [992, 1500], [1000, 1820]] }
  ,{ label: 'SW', pts: [[808, 1152], [528, 1460], [300, 1740]] }
  ,{ label: 'W', pts: [[780, 1000], [460, 1008], [100, 992]] }
  ,{ label: 'NW', pts: [[808, 848], [540, 568], [312, 340]] }
,]

// ── District Internal Lanes ──────────────────────────────────
const DISTRICT_LANES = [
  // Grüntal (6 winding lanes to fill the larger district)
  [[80, 1600], [220, 1660], [360, 1620], [520, 1680]]
  ,[[120, 1840], [280, 1880], [440, 1820], [560, 1920]]
  ,[[60, 1720], [200, 1740], [380, 1710], [540, 1760]]
  ,[[100, 1560], [250, 1590], [400, 1550], [580, 1600]]
  ,[[80, 1940], [220, 1960], [380, 1930], [540, 1970]]
  ,[[140, 1680], [300, 1700], [460, 1670], [580, 1720]]
  // Sonnenberg (6 lanes)
  ,[[1480, 1600], [1640, 1680], [1800, 1640], [1940, 1720]]
  ,[[1460, 1840], [1600, 1900], [1780, 1860], [1960, 1920]]
  ,[[1420, 1720], [1580, 1750], [1740, 1710], [1920, 1760]]
  ,[[1500, 1560], [1660, 1590], [1820, 1550], [1960, 1600]]
  ,[[1440, 1940], [1600, 1960], [1760, 1930], [1940, 1970]]
  ,[[1520, 1680], [1680, 1700], [1840, 1670], [1960, 1720]]
  // Hafenviertel (6 dense lanes)
  ,[[60, 140], [200, 180], [360, 120], [540, 200]]
  ,[[80, 380], [240, 420], [400, 360], [560, 400]]
  ,[[40, 60], [180, 80], [340, 50], [520, 100]]
  ,[[100, 260], [260, 290], [420, 240], [560, 300]]
  ,[[60, 440], [200, 460], [360, 430], [540, 470]]
  ,[[120, 320], [280, 340], [440, 310], [560, 360]]
  // Mittelfeld (6 lanes)
  ,[[1460, 140], [1600, 200], [1760, 160], [1940, 220]]
  ,[[1440, 360], [1580, 400], [1740, 340], [1920, 400]]
  ,[[1420, 60], [1560, 80], [1720, 50], [1940, 100]]
  ,[[1480, 260], [1640, 290], [1800, 240], [1960, 300]]
  ,[[1500, 440], [1660, 460], [1820, 430], [1960, 470]]
  ,[[1460, 320], [1620, 340], [1780, 310], [1940, 360]]
  // Industriezone (4 lanes)
  ,[[560, 160], [800, 140], [1120, 180], [1440, 152]]
  ,[[580, 80], [840, 60], [1100, 100], [1400, 70]]
  ,[[600, 240], [860, 220], [1140, 260], [1420, 230]]
  ,[[540, 40], [780, 50], [1060, 30], [1380, 60]]
,]

// ── Create Streets ───────────────────────────────────────────
function addSidewalks (group, curve, roadWidth, samples) {
  const sidewalkWidth = 2
  const pts = curve.getPoints(samples)
  for (const side of [-1, 1]) {
    const verts = [], indices = []
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i]
      const t = i / (pts.length - 1)
      const tan = curve.getTangentAt(Math.min(t, 0.9999))
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const hw = roadWidth / 2
      const innerEdge = hw
      const outerEdge = hw + sidewalkWidth
      verts.push(
        p.x + perp.x * side * innerEdge, -0.05, p.z + perp.z * side * innerEdge,
        p.x + perp.x * side * outerEdge, -0.05, p.z + perp.z * side * outerEdge
      )
      if (i < pts.length - 1) {
        const b = i * 2
        indices.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    group.add(new THREE.Mesh(geo, sidewalkMat))
  }
}

// ── Generate cross-streets between adjacent ring roads ───────
function generateCrossStreets (ringCurves, rng) {
  const crossCurves = []
  for (let ri = 0; ri < ringCurves.length - 1; ri++) {
    const inner = ringCurves[ri]
    const outer = ringCurves[ri + 1]
    const count = 16 + ri * 8 // more cross streets for outer rings
    for (let i = 0; i < count; i++) {
      const t = (i + rng() * 0.3) / count
      const p1 = inner.getPointAt(t % 1)
      const p2 = outer.getPointAt(t % 1)
      if (isExcluded(p1.x, p1.z) || isExcluded(p2.x, p2.z)) continue
      const mid = new THREE.Vector3(
        (p1.x + p2.x) / 2 + (rng() - 0.5) * 20,
        0,
        (p1.z + p2.z) / 2 + (rng() - 0.5) * 20
      )
      const curve = new THREE.CatmullRomCurve3([p1, mid, p2])
      crossCurves.push(curve)
    }
  }
  // Also connect outermost ring to edge of city (beyond ring 3)
  const outerRing = ringCurves[ringCurves.length - 1]
  for (let i = 0; i < 24; i++) {
    const t = i / 24
    const p1 = outerRing.getPointAt(t)
    const angle = Math.atan2(p1.z - CY, p1.x - CX)
    const edgeX = CX + Math.cos(angle) * 950
    const edgeZ = CY + Math.sin(angle) * 950
    if (edgeX < 20 || edgeX > 1980 || edgeZ < 20 || edgeZ > 1980) continue
    if (isExcluded(edgeX, edgeZ)) continue
    const p2 = new THREE.Vector3(edgeX, 0, edgeZ)
    const mid = new THREE.Vector3(
      (p1.x + p2.x) / 2 + (rng() - 0.5) * 15,
      0,
      (p1.z + p2.z) / 2 + (rng() - 0.5) * 15
    )
    crossCurves.push(new THREE.CatmullRomCurve3([p1, mid, p2]))
  }
  return crossCurves
}

// ── Road occupancy grid for fast building placement ──────────
function buildRoadGrid (allCurves) {
  const gridRes = 5
  const size = Math.ceil(GRID / gridRes)
  const grid = new Uint8Array(size * size)

  for (const curve of allCurves) {
    const len = curve.getLength()
    const steps = Math.max(30, Math.ceil(len / 3))
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(i / steps, 0.9999)
      const p = curve.getPointAt(t)
      // Mark cells within road clearance as occupied (wider for Kenney tiles)
      for (let dx = -14; dx <= 14; dx += gridRes) {
        for (let dz = -14; dz <= 14; dz += gridRes) {
          const gx = Math.floor((p.x + dx) / gridRes)
          const gz = Math.floor((p.z + dz) / gridRes)
          if (gx >= 0 && gx < size && gz >= 0 && gz < size) {
            grid[gz * size + gx] = 1
          }
        }
      }
    }
  }
  return { grid, size, gridRes }
}

function isOnRoad (x, z, roadGrid) {
  const gx = Math.floor(x / roadGrid.gridRes)
  const gz = Math.floor(z / roadGrid.gridRes)
  if (gx < 0 || gx >= roadGrid.size || gz < 0 || gz >= roadGrid.size) return true
  return roadGrid.grid[gz * roadGrid.size + gx] === 1
}

// ── Fill entire city area with buildings ─────────────────────
function fillCityWithBuildings (roadGrid, rng, group, useKenney) {
  const spacing = 32 // distance between building centers
  const jitter = 7   // random offset for organic feel

  for (let x = 20; x < GRID - 20; x += spacing) {
    for (let z = 20; z < GRID - 20; z += spacing) {
      // Add slight random offset for organic placement
      const px = x + (rng() - 0.5) * jitter
      const pz = z + (rng() - 0.5) * jitter

      // Skip if on a road
      if (isOnRoad(px, pz, roadGrid)) continue
      // Skip if in exclusion zone (landmarks, river)
      if (isExcluded(px, pz)) continue

      // Determine building type from district
      const dist = getDistrictAt(px, pz)
      let type = dist ? dist.buildType : 'rowhouse'

      // Civic center area gets apartments/rowhouses
      const civicDist = Math.sqrt((px - CX) ** 2 + (pz - CY) ** 2)
      if (!dist && civicDist < 700) {
        type = civicDist < 300 ? 'apartment' : 'rowhouse'
      }

      // Skip some positions in Grüntal for a greener feel
      if (dist && dist.id === 0 && rng() < 0.3) continue

      let bldg = useKenney ? cloneKenneyModel(type, rng) : null
      if (!bldg) bldg = createFallbackBuilding(type, rng)

      // Distrikt-spezifische Farbgebung
      if (useKenney && bldg) {
        tintModelByDistrict(bldg, dist ? dist.id : -1, rng)
      }

      const bId = advanceBuildingId()
      const distName = dist ? DISTRICT_LABELS[dist.id] : 'Zentrum'
      const info = {
        id: bId
        ,name: 'Residential'
        ,label: TYPE_LABELS[type] || 'Gebäude'
        ,description: TYPE_LABELS[type] + ' im Stadtteil ' + distName
        ,type
        ,districtName: distName
        ,x: px
        ,z: pz,
      }
      tagBuildingMesh(bldg, info)

      bldg.rotation.y = rng() * Math.PI * 2
      bldg.position.set(px, -0.3, pz)
      group.add(bldg)

      buildingRegistry.push({ id: bId, x: px, z: pz, type, district: dist ? dist.id : -1 })
    }
  }
}

function createStreets (rng) {
  const group = new THREE.Group()
  const roadWidth = 10

  // Ring roads
  const rings = [
    { radius: 220, pts: 32, jitter: 12 }
    ,{ radius: 420, pts: 40, jitter: 20 }
    ,{ radius: 640, pts: 48, jitter: 32 }
  ,]
  const ringCurves = []
  for (const ring of rings) {
    const curve = makeRingCurve(ring.radius, ring.pts, ring.jitter, rng)
    ringCurves.push(curve)
    group.add(createRibbonMesh(curve, roadWidth, 100, streetMat, -0.1))
    addSidewalks(group, curve, roadWidth, 100)
  }

  // Radial roads
  const radialCurves = []
  for (const rd of RADIAL_DEFS) {
    const pts = rd.pts.map(p => new THREE.Vector3(p[0], 0, p[1]))
    const curve = new THREE.CatmullRomCurve3(pts)
    radialCurves.push(curve)
    group.add(createRibbonMesh(curve, roadWidth, 50, streetMat, -0.1))
    addSidewalks(group, curve, roadWidth, 50)
  }

  // Cross-streets between ring roads
  const crossCurves = generateCrossStreets(ringCurves, rng)
  for (const curve of crossCurves) {
    group.add(createRibbonMesh(curve, 6, 20, streetMat, -0.1))
  }

  // District internal lanes (narrower, no sidewalks)
  const laneCurves = []
  for (const lane of DISTRICT_LANES) {
    const pts = lane.map(p => new THREE.Vector3(p[0], 0, p[1]))
    const curve = new THREE.CatmullRomCurve3(pts)
    laneCurves.push(curve)
    group.add(createRibbonMesh(curve, 6, 30, streetMat, -0.1))
  }

  // Collect ALL curves for road grid
  const allCurves = [...ringCurves, ...radialCurves, ...crossCurves, ...laneCurves]

  return { group, ringCurves, radialCurves, laneCurves, crossCurves, allCurves }
}

// ── River ────────────────────────────────────────────────────
function createRiver () {
  const group = new THREE.Group()
  const pts = RIVER_POINTS.map(p => new THREE.Vector3(p[0], 0, p[1]))
  const curve = new THREE.CatmullRomCurve3(pts)
  const width = 64

  // Water surface
  group.add(createRibbonMesh(curve, width, 80, waterMat, -0.05))

  // Banks
  const samples = curve.getPoints(80)
  for (const side of [1, -1]) {
    const bankVerts = [], bankIdx = []
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i]
      const t = i / (samples.length - 1)
      const tan = curve.getTangentAt(Math.min(t, 0.9999))
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const hw = (width / 2) * (0.9 + 0.2 * Math.sin(t * Math.PI * 3))
      const bankW = 10
      bankVerts.push(
        p.x + perp.x * side * hw, -0.05, p.z + perp.z * side * hw,
        p.x + perp.x * side * (hw + bankW), 0.8, p.z + perp.z * side * (hw + bankW)
      )
      if (i < samples.length - 1) {
        const b = i * 2
        bankIdx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2)
      }
    }
    const bankGeo = new THREE.BufferGeometry()
    bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(bankVerts, 3))
    bankGeo.setIndex(bankIdx)
    bankGeo.computeVertexNormals()
    group.add(new THREE.Mesh(bankGeo, riverBankMat))
  }

  return { group, curve }
}

// ── Bridge ───────────────────────────────────────────────────
function createBridge (riverCurve, roadCurve) {
  // Find approximate intersection of road with river
  let bestDist = Infinity, bestRP = null, bestTan = null
  for (let t = 0; t <= 1; t += 0.01) {
    const rp = roadCurve.getPointAt(t)
    for (let rt = 0; rt <= 1; rt += 0.02) {
      const wp = riverCurve.getPointAt(rt)
      const d = rp.distanceTo(wp)
      if (d < bestDist) { bestDist = d; bestRP = rp; bestTan = roadCurve.getTangentAt(t) }
    }
  }
  if (!bestRP || bestDist > 80) return null

  const group = new THREE.Group()
  const angle = Math.atan2(bestTan.x, bestTan.z)

  const deck = new THREE.Mesh(new THREE.BoxGeometry(32, 1.5, 88), bridgeMat)
  deck.position.set(bestRP.x, 0.5, bestRP.z)
  deck.rotation.y = angle
  group.add(deck)

  for (const s of [-1, 1]) {
    const railing = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 88), bridgeMat)
    railing.position.set(
      bestRP.x + Math.cos(angle + Math.PI / 2) * s * 14,
      2, bestRP.z + Math.sin(angle + Math.PI / 2) * s * 14
    )
    railing.rotation.y = angle
    group.add(railing)
  }
  return group
}

// ── Landmark: Parliament ─────────────────────────────────────
function createParliament () {
  const group = new THREE.Group()
  const sandstone = new THREE.MeshLambertMaterial({ color: 0xd4c5a9 })
  const darkStone = new THREE.MeshLambertMaterial({ color: 0xb0a080 })
  const columnMat = new THREE.MeshLambertMaterial({ color: 0xf0ece0 })

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(30, 14, 18), sandstone)
  body.position.y = 7
  body.name = 'building'
  body.userData = { buildingInfo: LANDMARKS_DATA[0] }
  group.add(body)

  // Dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    darkStone
  )
  dome.position.y = 14
  group.add(dome)

  // Front steps (3 tiers)
  for (let i = 0; i < 3; i++) {
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(30 + i * 3, 1.5, 2.5), darkStone
    )
    step.position.set(0, (2 - i) * 1.5 + 0.75, 11 + i * 2.2)
    group.add(step)
  }

  // Columns (6)
  const colGeo = new THREE.CylinderGeometry(0.6, 0.7, 12, 8)
  for (let i = 0; i < 6; i++) {
    const col = new THREE.Mesh(colGeo, columnMat)
    col.position.set(-10 + i * 4, 7, 9.5)
    group.add(col)
  }

  // Pediment (thin rotated box instead of ExtrudeGeometry)
  const pedBox = new THREE.Mesh(
    new THREE.BoxGeometry(24, 1.2, 8),
    sandstone
  )
  pedBox.position.set(0, 15, 9.5)
  pedBox.rotation.x = Math.PI * 0.08
  group.add(pedBox)

  group.position.set(1000, -0.3, 1120)
  return group
}

// ── Landmark: Marketplace ────────────────────────────────────
function createMarketplace () {
  const group = new THREE.Group()
  const stallColors = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c]
  const woodMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 })

  // Ground
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(45, 45),
    new THREE.MeshLambertMaterial({ color: 0xccc0a8 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.25
  group.add(ground)

  // Stalls in a circle
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 + Math.PI / 6
    const r = 14
    const stall = new THREE.Group()

    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.5, 3, 2.5), woodMat)
    counter.position.y = 1.5
    stall.add(counter)

    const canopy = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 4.5),
      new THREE.MeshLambertMaterial({ color: stallColors[i], side: THREE.DoubleSide })
    )
    canopy.position.set(0, 4.5, 0)
    canopy.rotation.x = -0.25
    stall.add(canopy)

    for (const sx of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 4), woodMat)
      pole.position.set(sx * 2, 2.5, 1.2)
      stall.add(pole)
    }

    stall.position.set(Math.cos(angle) * r, 0, Math.sin(angle) * r)
    stall.rotation.y = -angle + Math.PI / 2
    group.add(stall)
  }

  // Fountain
  const fountainBase = new THREE.Mesh(
    new THREE.CylinderGeometry(3.5, 4.5, 2.5, 12),
    new THREE.MeshLambertMaterial({ color: 0x808080 })
  )
  fountainBase.position.y = 1.25
  fountainBase.name = 'building'
  fountainBase.userData = { buildingInfo: LANDMARKS_DATA[1] }
  group.add(fountainBase)

  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 1.8, 12),
    new THREE.MeshLambertMaterial({ color: 0x4a90d9, transparent: true, opacity: 0.6 })
  )
  water.position.y = 1.5
  group.add(water)

  const spout = new THREE.Mesh(
    new THREE.ConeGeometry(0.5, 2.5, 8),
    new THREE.MeshLambertMaterial({ color: 0x6ab0e8, transparent: true, opacity: 0.5 })
  )
  spout.position.y = 3.8
  group.add(spout)

  group.position.set(1000, -0.3, 960)
  return group
}

// ── Landmark: MediaCenter ────────────────────────────────────
function createMediaCenter () {
  const group = new THREE.Group()
  const modern = new THREE.MeshLambertMaterial({ color: 0x505560 })
  const glass = new THREE.MeshLambertMaterial({ color: 0x88aacc, transparent: true, opacity: 0.7 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 15, 12), modern)
  body.position.y = 7.5
  body.name = 'building'
  body.userData = { buildingInfo: LANDMARKS_DATA[2] }
  group.add(body)

  const facade = new THREE.Mesh(new THREE.PlaneGeometry(12, 11), glass)
  facade.position.set(0, 8, 6.05)
  group.add(facade)

  // Antenna
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.35, 18, 6),
    new THREE.MeshLambertMaterial({ color: 0x888888 })
  )
  antenna.position.set(4, 24, -2)
  group.add(antenna)

  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0xcc3333 })
  )
  tip.position.set(4, 34, -2)
  group.add(tip)

  // Satellite dish
  const dish = new THREE.Mesh(
    new THREE.CircleGeometry(2, 10),
    new THREE.MeshLambertMaterial({ color: 0xcccccc, side: THREE.DoubleSide })
  )
  dish.position.set(-4, 16, 1)
  dish.rotation.set(-0.3, 0.5, 0)
  group.add(dish)

  group.position.set(880, -0.3, 1040)
  return group
}

// ── Landmark: CentralSquare ──────────────────────────────────
function createCentralSquare () {
  const group = new THREE.Group()
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0xa0a098 })
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x5D4037 })

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(38, 38),
    new THREE.MeshLambertMaterial({ color: 0xc8c0b0 })
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.25
  group.add(ground)

  // Monument
  const column = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.3, 14, 8), stoneMat)
  column.position.y = 7
  column.name = 'building'
  column.userData = { buildingInfo: LANDMARKS_DATA[3] }
  group.add(column)

  const base = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2, 4.5), stoneMat)
  base.position.y = 1
  group.add(base)

  // Globe on top
  const blobe = new THREE.Mesh(
    new THREE.SphereGeometry(2.2, 12, 8),
    new THREE.MeshLambertMaterial({ color: 0x4ecca3 })
  )
  blobe.position.y = 16
  group.add(blobe)

  // Benches
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2
    const r = 11
    const bench = new THREE.Mesh(new THREE.BoxGeometry(4.5, 1, 1.3), benchMat)
    bench.position.set(Math.cos(angle) * r, 1, Math.sin(angle) * r)
    bench.rotation.y = -angle
    group.add(bench)

    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1, 1.3), benchMat)
      leg.position.set(
        Math.cos(angle) * r + side * 1.8 * Math.cos(angle + Math.PI / 2),
        0.5,
        Math.sin(angle) * r + side * 1.8 * Math.sin(angle + Math.PI / 2)
      )
      leg.rotation.y = -angle
      group.add(leg)
    }
  }

  group.position.set(1000, -0.3, 840)
  return group
}

// ── Landmark: University ─────────────────────────────────────
function createUniversity () {
  const group = new THREE.Group()
  const brick = new THREE.MeshLambertMaterial({ color: 0x8B5A2B })
  const trim = new THREE.MeshLambertMaterial({ color: 0xd4c5a9 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(28, 11, 16), brick)
  body.position.y = 5.5
  body.name = 'building'
  body.userData = { buildingInfo: LANDMARKS_DATA[4] }
  group.add(body)

  // Clock tower
  const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6), trim)
  tower.position.y = 11
  group.add(tower)

  const towerRoof = new THREE.Mesh(
    new THREE.ConeGeometry(5, 7, 4),
    new THREE.MeshLambertMaterial({ color: 0x4a6741 })
  )
  towerRoof.position.y = 25.5
  towerRoof.rotation.y = Math.PI / 4
  group.add(towerRoof)

  // Side wings
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 9, 12), brick)
    wing.position.set(side * 17, 4.5, 0)
    group.add(wing)
  }

  const arch = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 1), trim)
  arch.position.set(0, 11, 8.5)
  group.add(arch)

  group.position.set(1000, -0.3, 1800)
  return group
}

// ── Landmark: Library (in Grüntal) ───────────────────────────
function createLibrary () {
  const group = new THREE.Group()
  const stone = new THREE.MeshLambertMaterial({ color: 0xb8a88c })
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b4226 })

  const body = new THREE.Mesh(new THREE.BoxGeometry(18, 10, 14), stone)
  body.position.y = 5
  body.name = 'building'
  body.userData = { buildingInfo: LANDMARKS_DATA[5] }
  group.add(body)

  // Peaked roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(14, 7, 4), roofMat)
  roof.position.y = 13.5
  roof.rotation.y = Math.PI / 4
  group.add(roof)

  // Entrance columns
  const colGeo = new THREE.CylinderGeometry(0.5, 0.5, 9, 8)
  const colMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0 })
  for (const side of [-1, 1]) {
    const col = new THREE.Mesh(colGeo, colMat)
    col.position.set(side * 3, 4.5, 7.5)
    group.add(col)
  }

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(3.5, 6),
    new THREE.MeshLambertMaterial({ color: 0x3a2010 })
  )
  door.position.set(0, 3, 7.05)
  group.add(door)

  group.position.set(340, -0.3, 1720)
  return group
}

// ── Create all landmarks ─────────────────────────────────────
function createLandmarks () {
  const group = new THREE.Group()
  group.add(createParliament())
  group.add(createMarketplace())
  group.add(createMediaCenter())
  group.add(createCentralSquare())
  group.add(createUniversity())
  group.add(createLibrary())
  return group
}

// ── Trees ────────────────────────────────────────────────────
function createTree (x, z, rng, type) {
  const group = new THREE.Group()
  const scale = 0.7 + rng() * 0.6

  const trunk = new THREE.Mesh(trunkGeo, trunkMat)
  trunk.position.y = 2.5 * scale
  trunk.scale.set(scale, scale, scale)
  group.add(trunk)

  const leafColor = new THREE.Color(0.17 + rng() * 0.1, 0.42 + rng() * 0.3, 0.17 + rng() * 0.08)
  const leafMat = new THREE.MeshLambertMaterial({ color: leafColor })

  if (type === 'conifer') {
    const leaf = new THREE.Mesh(leafConeGeo, leafMat)
    leaf.position.y = 7.5 * scale
    leaf.scale.set(scale, scale, scale)
    group.add(leaf)
  } else {
    const leaf = new THREE.Mesh(leafSphereGeo, leafMat)
    leaf.position.y = 7 * scale
    leaf.scale.set(scale * 1.1, scale * 0.9, scale * 1.1)
    group.add(leaf)
  }

  group.position.set(x, -0.3, z)
  group.rotation.y = rng() * Math.PI * 2
  return group
}

// ── Decorations: Trees, Lamps, Benches ───────────────────────
function createDecorations (ringCurves, rng) {
  const group = new THREE.Group()

  // District trees
  for (const d of DISTRICTS) {
    for (let i = 0; i < d.treeCount; i++) {
      const x = d.x1 + 5 + rng() * (d.x2 - d.x1 - 10)
      const y = d.y1 + 5 + rng() * (d.y2 - d.y1 - 10)
      if (isExcluded(x, y)) continue
      const type = (d.id === 0 || rng() > 0.6) ? 'conifer' : 'deciduous'
      group.add(createTree(x, y, rng, type))
    }
  }

  // Formal trees along ring roads
  for (const curve of ringCurves) {
    const treeCount = 20
    for (let i = 0; i < treeCount; i++) {
      const t = i / treeCount
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t)
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const side = (i % 2 === 0) ? 1 : -1
      const tx = p.x + perp.x * side * 14
      const tz = p.z + perp.z * side * 14
      if (!isExcluded(tx, tz) && tx > 20 && tx < 1980 && tz > 20 && tz < 1980) {
        group.add(createTree(tx, tz, rng, 'deciduous'))
      }
    }
  }

  // Street lamps along ring roads
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x333333 })
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffe4b5 })
  const lampPoleGeo = new THREE.CylinderGeometry(0.2, 0.25, 8, 6)
  const lampHeadGeo = new THREE.SphereGeometry(0.6, 6, 4)

  for (const curve of ringCurves) {
    const lampCount = 24
    for (let i = 0; i < lampCount; i++) {
      const t = i / lampCount
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t)
      const perp = new THREE.Vector3(-tan.z, 0, tan.x).normalize()
      const side = (i % 2 === 0) ? 5 : -5
      const lamp = new THREE.Group()
      const pole = new THREE.Mesh(lampPoleGeo, lampMat)
      pole.position.y = 4
      lamp.add(pole)
      const head = new THREE.Mesh(lampHeadGeo, lightMat)
      head.position.y = 8.5
      lamp.add(head)
      lamp.position.set(p.x + perp.x * side, -0.3, p.z + perp.z * side)
      group.add(lamp)
    }
  }

  return group
}

// ── Place all buildings (area fill) ──────────────────────────
function createAllBuildings (allCurves, rng, useKenney) {
  const group = new THREE.Group()
  const roadGrid = buildRoadGrid(allCurves)
  // Expose road grid for pathfinding (creature.js uses this)
  walkableGrid.grid = roadGrid.grid
  walkableGrid.size = roadGrid.size
  walkableGrid.gridRes = roadGrid.gridRes
  fillCityWithBuildings(roadGrid, rng, group, useKenney)
  return group
}

// ── Main entry point ─────────────────────────────────────────
export function createCity () {
  const rng = mulberry32(42)
  const group = new THREE.Group()

  group.add(createTerrain())

  const { group: riverGroup, curve: riverCurve } = createRiver()
  group.add(riverGroup)

  const { group: streetGroup, ringCurves, radialCurves, crossCurves, allCurves } = createStreets(rng)
  group.add(streetGroup)

  // Bridges where radial roads cross river
  for (const rc of radialCurves) {
    const bridge = createBridge(riverCurve, rc)
    if (bridge) group.add(bridge)
  }

  group.add(createLandmarks())
  group.add(createDecorations(ringCurves, rng))

  // Immediately add procedural fallback buildings (area fill)
  const fallbackRng = mulberry32(42)
  const fallbackBuildings = createAllBuildings(allCurves, fallbackRng, false)
  group.add(fallbackBuildings)

  // Register landmarks in building registry
  for (const lm of LANDMARKS_DATA) {
    const dist = getDistrictAt(lm.x, lm.y)
    buildingRegistry.push({ x: lm.x, z: lm.y, type: 'landmark', district: dist ? dist.id : -1 })
  }

  // Load Kenney models in background, then replace fallback buildings + add road tiles
  loadKenneyModels().then(() => {
    console.log('Kenney models loaded — replacing procedural buildings, adding road tiles')
    group.remove(fallbackBuildings)
    // Clear registry and re-fill with Kenney placement
    buildingRegistry.length = 0
    resetBuildingId(1)
    for (const lm of LANDMARKS_DATA) {
      const dist = getDistrictAt(lm.x, lm.y)
      buildingRegistry.push({ x: lm.x, z: lm.y, type: 'landmark', district: dist ? dist.id : -1 })
    }
    const kenneyRng = mulberry32(42) // same seed for same placement
    const kenneyBuildings = createAllBuildings(allCurves, kenneyRng, true)
    group.add(kenneyBuildings)

    // Add Kenney road tiles on top of ribbon roads
    const roadTiles = placeAllRoadTiles(ringCurves, radialCurves, crossCurves)
    group.add(roadTiles)
  }).catch(err => {
    console.warn('Kenney models failed to load, keeping procedural buildings', err)
  })

  return group
}
