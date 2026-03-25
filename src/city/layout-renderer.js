/**
 * layout-renderer.js — Create city from editor-saved layout (localStorage or JSON)
 */
import * as THREE from 'three'
import { autoConnectRoads } from '@/lib/road-auto-connect'
import { CELL_SIZE, GRID_SIZE } from '@/config/world'
import {
  mulberry32, GRID, EDITOR_STORAGE_KEY, EDITOR_SCALE_MAP, CIVIC_SCALE, MODEL_SCALE_MAP,
} from './constants'
import { DISTRICTS, LANDMARKS_DATA, getDistrictAt, setEditorDistrictMap } from './districts'
import {
  buildingRegistry, walkableGrid,
  advanceBuildingId, resetBuildingId, tagBuildingMesh,
} from './building-registry'
import {
  loadKenneyModels, loadedModels, createFallbackBuilding, tintModelByDistrict,
} from './kenney-loader'

export async function createCityFromLayout () {
  let layoutData
  const CITY_CACHE_VERSION = 6  // Bump when city data changes (walkable grid fix)
  try {
    // Try new key first, fall back to legacy key
    const raw = localStorage.getItem(EDITOR_STORAGE_KEY) || localStorage.getItem('globtopia-city-layout')
    if (raw) {
      const parsed = JSON.parse(raw)
      // Only use cached data if it has enough placements AND matching version
      if (parsed && parsed.placements && parsed.placements.length > 100 && parsed.version >= CITY_CACHE_VERSION) {
        layoutData = parsed
      } else {
        console.warn('[city] Cache outdated (version ' + (parsed && parsed.version) + ' < ' + CITY_CACHE_VERSION + '), clearing')
        localStorage.removeItem(EDITOR_STORAGE_KEY)
        localStorage.removeItem('globtopia-city-layout')
      }
    }
  } catch (e) {
    localStorage.removeItem(EDITOR_STORAGE_KEY)
    localStorage.removeItem('globtopia-city-layout')
  }
  // Auto-load from public/ if localStorage is empty or invalid
  if (!layoutData || !layoutData.placements || layoutData.placements.length === 0) {
    try {
      let resp = await fetch('/blobtopia-city.json').catch(() => null)
      if (!resp || !resp.ok) resp = await fetch('/globtopia-city.json').catch(() => null)
      if (resp && resp.ok) {
        layoutData = await resp.json()
        // Cache in localStorage for next time
        try { localStorage.setItem(EDITOR_STORAGE_KEY, JSON.stringify(layoutData)) } catch (e) { /* quota */ }
        console.log('[city] Auto-loaded blobtopia-city.json (' + (layoutData.placements || []).length + ' placements)')
      }
    } catch (e) {
      console.warn('[city] Could not auto-load blobtopia-city.json:', e)
    }
  }
  if (!layoutData || !layoutData.placements || layoutData.placements.length === 0) {
    return null // fall back to procedural
  }

  const rng = mulberry32(42)
  const group = new THREE.Group()

  // ── District map from editor ──
  const editorDistrictMap = layoutData.districtMap || {}
  const hasEditorDistricts = Object.keys(editorDistrictMap).length > 0

  // Register districtMap for getDistrictAt() lookups (replaces bounds-based fallback)
  if (hasEditorDistricts) {
    setEditorDistrictMap(editorDistrictMap, CELL_SIZE)
  }

  const S = GRID_SIZE / 2000  // scaling factor for all absolute coordinates
  const CX = GRID_SIZE / 2
  const CZ = GRID_SIZE / 2

  console.log('[layout-renderer] hasEditorDistricts:', hasEditorDistricts, 'entries:', Object.keys(editorDistrictMap).length)
  if (hasEditorDistricts) {
    console.log('[layout-renderer] Using EDITOR-STYLE terrain (flat green + overlays)')
    // ── Editor-style terrain: flat base + simple district overlays ──
    const groundGeo = new THREE.PlaneBufferGeometry(GRID_SIZE, GRID_SIZE)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a5a3a })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(GRID_SIZE / 2, -0.1, GRID_SIZE / 2)
    group.add(ground)

    // District overlays disabled in simulation — only used in editor
  } else {
    // ── Legacy terrain: vertex-color blending ──
    const BASE_COLOR = [0.66, 0.78, 0.53]
    const CIVIC_COLOR = [0.83, 0.77, 0.66]
    const RIVER_POINTS_V = [
      [-40, 380], [200, 352], [480, 400], [800, 368],
      [1120, 328], [1440, 288], [1760, 260], [2040, 232],
    ].map(p => new THREE.Vector3(p[0] * S, 0, p[1] * S))
    const riverCurve = new THREE.CatmullRomCurve3(RIVER_POINTS_V)
    const civicRadius = 520 * S
    const districtBlend = 140 * S
    const riverBlend = 88 * S

    function getTerrainColor (x, z) {
      let r = BASE_COLOR[0] * 0.15, g = BASE_COLOR[1] * 0.15, b = BASE_COLOR[2] * 0.15
      let tw = 0.15
      const cd = Math.sqrt((x - CX) ** 2 + (z - CZ) ** 2)
      if (cd < civicRadius) {
        const w = ((1 - cd / civicRadius) ** 2) * 0.7
        r += CIVIC_COLOR[0] * w; g += CIVIC_COLOR[1] * w; b += CIVIC_COLOR[2] * w; tw += w
      }
      for (const d of DISTRICTS) {
        const dx = Math.max(d.x1 - x, x - d.x2, 0)
        const dz = Math.max(d.y1 - z, z - d.y2, 0)
        const dist = Math.sqrt(dx * dx + dz * dz)
        const inside = x >= d.x1 && x <= d.x2 && z >= d.y1 && z <= d.y2
        let w = 0
        if (inside) w = 1.2
        else if (dist < districtBlend) w = ((1 - dist / districtBlend) ** 2) * 0.9
        if (w > 0) { r += d.groundColor[0] * w; g += d.groundColor[1] * w; b += d.groundColor[2] * w; tw += w }
      }
      for (let t = 0; t <= 1; t += 0.05) {
        const rp = riverCurve.getPointAt(t)
        const rd = Math.sqrt((x - rp.x) ** 2 + (z - rp.z) ** 2)
        if (rd < riverBlend) {
          const rw = ((1 - rd / riverBlend) ** 2) * 0.4
          r += 0.29 * rw; g += 0.56 * rw; b += 0.85 * rw; tw += rw
          break
        }
      }
      return [r / tw, g / tw, b / tw]
    }

    const seg = 80
    const terrainGeo = new THREE.PlaneBufferGeometry(GRID_SIZE, GRID_SIZE, seg, seg)
    terrainGeo.rotateX(-Math.PI / 2)
    terrainGeo.translate(GRID_SIZE / 2, 0, GRID_SIZE / 2)
    const tPos = terrainGeo.getAttribute('position')
    const tColors = new Float32Array(tPos.count * 3)
    for (let i = 0; i < tPos.count; i++) {
      const [cr, cg, cb] = getTerrainColor(tPos.getX(i), tPos.getZ(i))
      tColors[i * 3] = cr; tColors[i * 3 + 1] = cg; tColors[i * 3 + 2] = cb
    }
    terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(tColors, 3))
    const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: THREE.VertexColors })
    const terrain = new THREE.Mesh(terrainGeo, terrainMat)
    terrain.position.y = -0.3
    group.add(terrain)
  }

  // ── River (nur ohne Editor-Distrikte) ──
  if (!hasEditorDistricts) {
  const riverCurve = new THREE.CatmullRomCurve3([
    [-40, 380], [200, 352], [480, 400], [800, 368],
    [1120, 328], [1440, 288], [1760, 260], [2040, 232],
  ].map(p => new THREE.Vector3(p[0] * S, 0, p[1] * S)))
  const riverWidth = 64 * S
  const riverSamples = 60
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
        const bi = i * 2
        indices.push(bi, bi + 1, bi + 2, bi + 1, bi + 3, bi + 2)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return new THREE.Mesh(geo, mat)
  }
  const riverMat = new THREE.MeshLambertMaterial({ color: 0x2563a8, transparent: true, opacity: 0.85 })
  group.add(createRibbonMesh(riverCurve, riverWidth, riverSamples, riverMat, -0.05))
  // River banks
  const bankMat = new THREE.MeshLambertMaterial({ color: 0x4a6a3a })
  group.add(createRibbonMesh(riverCurve, riverWidth + 12 * S, riverSamples, bankMat, -0.15))

  } // end if (!hasEditorDistricts) — river

  // ── Trees ──
  const treeMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 })
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a })
  function addTree (tx, tz) {
    const treeScale = 0.6 + rng() * 0.8
    const trunkGeo = new THREE.CylinderBufferGeometry(0.3 * treeScale, 0.4 * treeScale, 3 * treeScale, 5)
    const trunk = new THREE.Mesh(trunkGeo, trunkMat)
    trunk.position.set(tx, 1.5 * treeScale, tz)
    group.add(trunk)
    const leafGeo = rng() > 0.5
      ? new THREE.ConeBufferGeometry(1.8 * treeScale, 4 * treeScale, 5)
      : new THREE.IcosahedronBufferGeometry(2 * treeScale, 1)
    const leaf = new THREE.Mesh(leafGeo, treeMat)
    leaf.position.set(tx, 4 * treeScale, tz)
    group.add(leaf)
  }
  if (hasEditorDistricts) {
    // Scatter trees randomly across the map (sparse, ~15 total)
    for (let ti = 0; ti < 15; ti++) {
      addTree(rng() * GRID_SIZE, rng() * GRID_SIZE)
    }
  } else {
    for (const d of DISTRICTS) {
      const count = d.treeCount || 0
      for (let ti = 0; ti < count; ti++) {
        addTree(d.x1 + rng() * (d.x2 - d.x1), d.y1 + rng() * (d.y2 - d.y1))
      }
    }
  }

  // Walkable-Grid wird nach Platzierungen aufgebaut (siehe unten)
  // Resolution: 16px per cell -> 125x125 grid. Coarse enough for fast A*, fine enough for 32px tiles.
  const gridRes = 16
  const gridCells = Math.ceil(GRID / gridRes)

  // Registry zurücksetzen
  buildingRegistry.length = 0
  resetBuildingId(1)

  // District colors are now rendered via terrain vertex-color blending (above)

  // Auto-Connect: Korrekte Tile-Typen + Rotationen für Straßen
  autoConnectRoads(layoutData.placements, CELL_SIZE)

  // Place editor buildings — sofort als Fallbacks, dann Kenney nachladen
  const placements = layoutData.placements
  console.log('[Blobtopia] Editor-Layout geladen:', placements.length, 'Platzierungen')

  // Walkable-Grid aus Tile-Map aufbauen
  // Weighted costs: 0=blocked, 1=road (cheapest), 2=deco/park, 3=building-entrance, 4=sidewalk
  // A* uses these costs: roads are preferred, cutting through green areas costs more.
  const tileGrid = layoutData.walkableGrid
  const wGrid = new Uint8Array(gridCells * gridCells) // 0 = blocked, 1-4 = walkable with cost

  if (tileGrid && tileGrid.map && tileGrid.cells && tileGrid.cellSize) {
    // Precise tile-based grid from generate-city.js
    // Each tile is cellSize (32) world units. Map each tile to pathfinding grid cells.
    const tileCells = tileGrid.cells      // 62
    const tileSize = tileGrid.cellSize    // 32
    const tileMap = tileGrid.map          // string of R/B/D/. chars

    // Build lookup: tile position → model name (to distinguish pavement from trees/grass)
    const tileModelLookup = {}
    for (const p of placements) {
      const tx = Math.floor(p.x / tileSize)
      const tz = Math.floor(p.z / tileSize)
      tileModelLookup[tz * tileCells + tx] = p.model || ''
    }

    // Phase 1: Roads (cost 1), Gehwege/Pavement (cost 2), other deco as grass (cost 4)
    for (let tz = 0; tz < tileCells; tz++) {
      for (let tx = 0; tx < tileCells; tx++) {
        const ch = tileMap[tz * tileCells + tx]
        if (ch === 'W' || ch === 'B' || ch === '.') continue // water, building, empty → skip (blocked)

        let cost
        if (ch === 'R') {
          cost = 1 // Road
        } else if (ch === 'D') {
          // Only pavement/path models are real Gehwege (cost 2); everything else is grass (cost 4)
          const model = tileModelLookup[tz * tileCells + tx] || ''
          const isPavement = model.startsWith('pavement') || model.startsWith('nature-path') || model.startsWith('suburban-path')
          cost = isPavement ? 2 : 4
        } else {
          continue
        }

        const worldX0 = tx * tileSize
        const worldZ0 = tz * tileSize
        const gx0 = Math.floor(worldX0 / gridRes)
        const gz0 = Math.floor(worldZ0 / gridRes)
        const gx1 = Math.ceil((worldX0 + tileSize) / gridRes)
        const gz1 = Math.ceil((worldZ0 + tileSize) / gridRes)
        for (let gz = gz0; gz <= gz1; gz++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            if (gx >= 0 && gx < gridCells && gz >= 0 && gz < gridCells) {
              wGrid[gz * gridCells + gx] = cost
            }
          }
        }
      }
    }
    // Phase 2: Building entrances (cost 3) — ring around buildings, buildings themselves blocked
    for (let tz = 0; tz < tileCells; tz++) {
      for (let tx = 0; tx < tileCells; tx++) {
        if (tileMap[tz * tileCells + tx] !== 'B') continue
        const worldX0 = tx * tileSize
        const worldZ0 = tz * tileSize
        // Outer ring: ±1 cell around building → cost 3 (entrance)
        const gx0 = Math.floor(worldX0 / gridRes) - 1
        const gz0 = Math.floor(worldZ0 / gridRes) - 1
        const gx1 = Math.ceil((worldX0 + tileSize) / gridRes) + 1
        const gz1 = Math.ceil((worldZ0 + tileSize) / gridRes) + 1
        for (let gz = gz0; gz <= gz1; gz++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            if (gx >= 0 && gx < gridCells && gz >= 0 && gz < gridCells) {
              if (wGrid[gz * gridCells + gx] === 0) wGrid[gz * gridCells + gx] = 3
            }
          }
        }
        // Building interior: block the building cells themselves (cost 0)
        const bx0 = Math.floor(worldX0 / gridRes)
        const bz0 = Math.floor(worldZ0 / gridRes)
        const bx1 = Math.ceil((worldX0 + tileSize) / gridRes)
        const bz1 = Math.ceil((worldZ0 + tileSize) / gridRes)
        for (let gz = bz0; gz < bz1; gz++) {
          for (let gx = bx0; gx < bx1; gx++) {
            if (gx >= 0 && gx < gridCells && gz >= 0 && gz < gridCells) {
              wGrid[gz * gridCells + gx] = 0 // blocked — no walking through buildings
            }
          }
        }
      }
    }
    // Phase 3: Sidewalks (cost 4) — empty tiles within city radius near content
    const cx = tileCells / 2, cz = tileCells / 2
    for (let tz = 0; tz < tileCells; tz++) {
      for (let tx = 0; tx < tileCells; tx++) {
        if (tileMap[tz * tileCells + tx] !== '.') continue
        const dr = Math.sqrt((tx - cx) * (tx - cx) + (tz - cz) * (tz - cz))
        if (dr > 26) continue
        let nearContent = false
        for (let dtx = -2; dtx <= 2 && !nearContent; dtx++) {
          for (let dtz = -2; dtz <= 2 && !nearContent; dtz++) {
            const ntx = tx + dtx, ntz = tz + dtz
            if (ntx >= 0 && ntx < tileCells && ntz >= 0 && ntz < tileCells) {
              if (tileMap[ntz * tileCells + ntx] !== '.') nearContent = true
            }
          }
        }
        if (!nearContent) continue
        const worldX0 = tx * tileSize
        const worldZ0 = tz * tileSize
        const gx0 = Math.floor(worldX0 / gridRes)
        const gz0 = Math.floor(worldZ0 / gridRes)
        const gx1 = Math.ceil((worldX0 + tileSize) / gridRes)
        const gz1 = Math.ceil((worldZ0 + tileSize) / gridRes)
        for (let gz = gz0; gz <= gz1; gz++) {
          for (let gx = gx0; gx <= gx1; gx++) {
            if (gx >= 0 && gx < gridCells && gz >= 0 && gz < gridCells) {
              if (wGrid[gz * gridCells + gx] === 0) wGrid[gz * gridCells + gx] = 4
            }
          }
        }
      }
    }

    console.log('[Blobtopia] Walkable grid built from tile map (' + tileCells + 'x' + tileCells + ' tiles)')
  } else {
    // Fallback: derive from placement coordinates
    for (const p of placements) {
      const gcx = Math.floor(p.x / gridRes)
      const gcz = Math.floor(p.z / gridRes)
      const radius = p.type === 'road' ? 3 : 2
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const gx = gcx + dx
          const gz = gcz + dz
          if (gx >= 0 && gx < gridCells && gz >= 0 && gz < gridCells) {
            wGrid[gz * gridCells + gx] = 1
          }
        }
      }
    }
    console.log('[Blobtopia] Walkable grid built from placement fallback')
  }

  walkableGrid.grid = wGrid
  walkableGrid.size = gridCells
  walkableGrid.gridRes = gridRes

  // Log walkability coverage
  var walkableCount = 0
  for (var wi = 0; wi < wGrid.length; wi++) { if (wGrid[wi] === 1) walkableCount++ }
  console.log('[Blobtopia] Walkable: ' + walkableCount + '/' + wGrid.length + ' cells (' + (walkableCount / wGrid.length * 100).toFixed(1) + '%)')

  // Sofort Fallback-Boxen platzieren (sichtbar bis Kenney-Modelle laden)
  const buildingGroup = new THREE.Group()
  for (const p of placements) {
    const type = p.type || 'building'
    if (type === 'water') continue // water handled in Phase 2
    const fallback = createFallbackBuilding(type, rng)
    // Phase 1: nur Typ-basierte Skalierung (CIVIC_SCALE erst in Phase 2 mit echten Modellen)
    const scale = MODEL_SCALE_MAP[p.model] || EDITOR_SCALE_MAP[type] || 16
    fallback.scale.setScalar(scale * (p.scale || 1))
    fallback.position.set(p.x, -0.3, p.z)
    fallback.rotation.y = p.rotation || 0

    const dist = getDistrictAt(p.x, p.z)
    const bId = p.id || advanceBuildingId()
    const info = {
      id: bId
      , name: p.label || type
      , label: p.label || type
      , description: 'Platziert im Editor'
      , x: p.x
      , z: p.z
      , type
      , functional_type: p.functional_type || type
      , capacity: p.capacity || 0
      , district: p.district != null ? p.district : (dist ? dist.id : -1)
      , districtName: dist ? dist.name : (DISTRICTS[p.district] || {}).name || 'Zentrum'
    }
    tagBuildingMesh(fallback, info)
    buildingGroup.add(fallback)

    buildingRegistry.push({
      id: bId
      , x: p.x
      , z: p.z
      , type
      , district: info.district
      , functional_type: p.functional_type || type
    })
  }
  group.add(buildingGroup)

  // Kenney-Modelle nachladen und Fallbacks ersetzen
  loadKenneyModels().then(() => {
    console.log('[Blobtopia] Kenney-Modelle geladen, ersetze', placements.length, 'Gebäude')

    // Neuen Gebäude-Container erstellen
    const kenneyGroup = new THREE.Group()

    // Registry neu aufbauen (Landmarks behalten)
    buildingRegistry.length = 0
    resetBuildingId(1)
    for (const lm of LANDMARKS_DATA) {
      const dist = getDistrictAt(lm.x, lm.y)
      buildingRegistry.push({ x: lm.x, z: lm.y, type: 'landmark', district: dist ? dist.id : -1 })
    }

    var replacedCount = 0
    var fallbackCount = 0
    for (const p of placements) {
      const type = p.type || 'building'
      const modelName = p.model

      // Water tiles: render as flat blue plane (same as editor), skip normal model path
      if (type === 'water') {
        const tileSize = modelName === 'water-tile-small' ? CELL_SIZE / 2 : CELL_SIZE
        const waterGeo = new THREE.PlaneBufferGeometry(tileSize, tileSize)
        const waterMat = new THREE.MeshLambertMaterial({ color: 0x2563a8, transparent: true, opacity: 0.8 })
        const waterPlane = new THREE.Mesh(waterGeo, waterMat)
        waterPlane.rotation.x = -Math.PI / 2
        waterPlane.position.set(p.x, 0.1, p.z)
        const dist = getDistrictAt(p.x, p.z)
        const bId = p.id || advanceBuildingId()
        tagBuildingMesh(waterPlane, {
          id: bId, name: p.label || 'Wasser', label: p.label || 'Wasser',
          description: 'Wasserfläche', x: p.x, z: p.z, type,
          functional_type: p.functional_type || 'water', capacity: 0,
          district: p.district != null ? p.district : (dist ? dist.id : -1),
          districtName: dist ? dist.name : (DISTRICTS[p.district] || {}).name || 'Zentrum'
        })
        kenneyGroup.add(waterPlane)
        buildingRegistry.push({ id: bId, x: p.x, z: p.z, type, district: p.district, functional_type: 'water' })
        replacedCount++
        continue
      }

      // Per-model scale (civic → model-specific → type default)
      const scale = CIVIC_SCALE[modelName] || MODEL_SCALE_MAP[modelName] || EDITOR_SCALE_MAP[type] || 16

      var obj
      if (loadedModels[modelName]) {
        obj = loadedModels[modelName].clone(true)
        obj.scale.setScalar(scale * (p.scale || 1))
        // Material overrides matching editor (pavement → gray, fountain → light blue)
        if ((modelName || '').startsWith('pavement') && !modelName.includes('fountain')) {
          obj.traverse(c => { if (c.isMesh) c.material = new THREE.MeshLambertMaterial({ color: 0x999999 }) })
        } else if (modelName === 'pavement-fountain') {
          obj.traverse(c => { if (c.isMesh) c.material = new THREE.MeshLambertMaterial({ color: 0xaabbcc }) })
        }
        replacedCount++
      } else {
        console.warn('[Blobtopia] Kenney-Modell nicht gefunden:', modelName)
        obj = createFallbackBuilding(type, rng)
        obj.scale.setScalar(scale * (p.scale || 1))
        fallbackCount++
      }
      const isRoadTile = (modelName || '').startsWith('road-')
      const isBridge = (modelName || '').startsWith('nature-bridge')
      const isPavement = (modelName || '').startsWith('pavement')
      const isPath = (modelName || '').startsWith('nature-path') || (modelName || '').startsWith('suburban-path') || isPavement
      const yPos = isRoadTile ? 0.8 : isBridge ? 0.5 : isPath ? -0.08 : -0.3
      obj.position.set(p.x, yPos, p.z)
      // Flatten pavement/path models so they lie flat on the ground
      if (isPath) {
        obj.scale.y = 0.5
      }
      // Straßen-Rotation auf 90-Schritte snappen
      var rot = p.rotation || 0
      if (isRoadTile || isBridge) rot = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2)
      obj.rotation.y = rot

      // Road tiles: add flat road-colored ground plane underneath to fill gaps
      // and apply polygonOffset to road meshes to prevent z-fighting
      if (isRoadTile) {
        var roadGroundGeo = new THREE.PlaneBufferGeometry(CELL_SIZE, CELL_SIZE)
        var roadGroundMat = new THREE.MeshLambertMaterial({ color: 0x444444, depthWrite: false })
        var roadGroundPlane = new THREE.Mesh(roadGroundGeo, roadGroundMat)
        roadGroundPlane.rotation.x = -Math.PI / 2
        roadGroundPlane.position.set(p.x, 0.0, p.z)
        roadGroundPlane.renderOrder = -1
        kenneyGroup.add(roadGroundPlane)
        // Fix z-fighting within Kenney road models
        obj.traverse(function (c) {
          if (c.isMesh && c.material) {
            c.material.polygonOffset = true
            c.material.polygonOffsetFactor = -1
            c.material.polygonOffsetUnits = -1
          }
        })
      }

      // Bridge tiles over water: add blue water surface underneath
      if (isBridge) {
        var waterGeo = new THREE.PlaneBufferGeometry(CELL_SIZE, CELL_SIZE)
        var waterSurfaceMat = new THREE.MeshLambertMaterial({
          color: 0x3a7cbd, transparent: true, opacity: 0.75
        })
        var waterPlane = new THREE.Mesh(waterGeo, waterSurfaceMat)
        waterPlane.rotation.x = -Math.PI / 2
        waterPlane.position.set(p.x, isBridge ? 0.2 : 0.1, p.z)
        kenneyGroup.add(waterPlane)
      }

      // Dead-end caps removed — they caused Z-fighting with road surface

      const dist = getDistrictAt(p.x, p.z)
      const kbId = p.id || advanceBuildingId()
      const info = {
        id: kbId
        , name: p.label || type
        , label: p.label || type
        , description: 'Platziert im Editor'
        , x: p.x
        , z: p.z
        , type
        , functional_type: p.functional_type || type
        , capacity: p.capacity || 0
        , district: p.district != null ? p.district : (dist ? dist.id : -1)
        , districtName: dist ? dist.name : (DISTRICTS[p.district] || {}).name || 'Zentrum'
      }
      // Distrikt-spezifische Farbgebung für Gebäude (nicht für Straßen/Deko)
      if (!isRoadTile && type !== 'deco') {
        tintModelByDistrict(obj, info.district, rng)
      }
      tagBuildingMesh(obj, info)
      kenneyGroup.add(obj)

      buildingRegistry.push({
        id: kbId
        , x: p.x
        , z: p.z
        , type
        , label: p.label || type
        , district: info.district
        , functional_type: p.functional_type || type
      })
    }

    // Fallbacks entfernen, Kenney einfügen
    group.remove(buildingGroup)
    group.add(kenneyGroup)
    console.log('[Blobtopia] Ersetzt:', replacedCount, 'Kenney |', fallbackCount, 'Fallback')

  }).catch(function (err) {
    console.warn('[Blobtopia] Kenney-Modelle konnten nicht geladen werden, behalte Fallbacks', err)
  })

  return group
}
