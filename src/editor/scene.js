/**
 * scene.js — Three.js-Szene des Stadt-Editors.
 *
 * Rein imperativ, kennt weder Store noch Vue: city-editor.vue ist der
 * Controller und ruft die Methoden hier nach jeder Datenänderung auf.
 * Nutzt dieselben Bausteine wie die Welt (kenney-loader, scaleFor,
 * tintModelByDistrict) — Editor-Bild und Welt-Bild driften nicht mehr.
 *
 * Ressourcen-Besitz: GLB-Templates (Geometrien + Originalmaterialien)
 * gehören dem kenney-loader-Cache und werden NIE disposed. Alles, was
 * die Szene selbst erzeugt (eigene Geometrien, geklonte/getintete
 * Materialien), wird mit `_owned` markiert und beim Entfernen entsorgt.
 */
import * as THREE from 'three'
import { GRID_SIZE, CELL_SIZE, GRID_CELLS } from '@/config/world'
import { mulberry32 } from '@/city/constants'
import { scaleFor } from '@/city/catalog'
import { DISTRICTS, DISTRICT_PALETTES, DEFAULT_PALETTE } from '@/city/districts'
import { loadKenneyModel, createFallbackBuilding } from '@/city/kenney-loader'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const GRID = GRID_SIZE
const CELLS = GRID_CELLS

// y-Versatz je Platzierungsart (Editor-Look, wie gehabt)
function yPosFor (p) {
  if (p.model.startsWith('road-')) return 0.3
  if (p.model.startsWith('nature-bridge')) return 0.5
  if (p.model.startsWith('nature-path') || p.model.startsWith('suburban-path') || p.model.startsWith('pavement')) return 0.15
  return -0.3
}

function markOwned (obj) {
  obj.traverse(c => {
    if (c.isMesh) {
      if (c.geometry) c.geometry.userData._owned = true
      if (c.material) c.material.userData._owned = true
    }
  })
  return obj
}

/** Entsorgt nur Ressourcen, die die Szene selbst besitzt (nie GLB-Templates). */
function disposeOwned (obj) {
  obj.traverse(c => {
    if (c.isMesh) {
      if (c.geometry && c.geometry.userData._owned) c.geometry.dispose()
      const mats = Array.isArray(c.material) ? c.material : [c.material]
      for (const m of mats) {
        if (m && m.userData._owned) m.dispose()
      }
    }
  })
}

export class EditorScene {
  constructor (canvas, container) {
    this.canvas = canvas
    this.container = container
    this.meshById = new Map() // placement.id → Object3D
    this._stopped = false
    this._keys = {}
    this._init()
  }

  _init () {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setClearColor(0x2c3e50)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.LinearToneMapping
    this.renderer.toneMappingExposure = 0.85

    this.scene = new THREE.Scene()

    // Kamera — schräge Draufsicht für Kartenübersicht
    this.camera = new THREE.PerspectiveCamera(50, 1, 10, 12000)
    this.camera.position.set(500, 400, 800)

    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.12
    this.controls.rotateSpeed = 0.2
    this.controls.zoomSpeed = 1.0
    this.controls.panSpeed = 1.5
    this.controls.minDistance = 50
    this.controls.maxDistance = 4000
    this.controls.maxPolarAngle = Math.PI * 0.45 // nicht unter den Boden
    this.controls.minPolarAngle = 0.15
    this.controls.screenSpacePanning = false
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN
      , MIDDLE: THREE.MOUSE.DOLLY
      , RIGHT: THREE.MOUSE.ROTATE
    }
    this.controls.target.set(GRID / 2, 0, GRID / 2)

    // Lichter — ×π-kalibrierte Werte (wie Welt-Viewer, Three r155+)
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.571))
    const dir = new THREE.DirectionalLight(0xfff8e8, 1.1)
    dir.position.set(300, 500, 200)
    this.scene.add(dir)
    const fill = new THREE.DirectionalLight(0xe8f0ff, 0.471)
    fill.position.set(-200, 300, -100)
    this.scene.add(fill)

    // Boden + Distrikt-Overlays
    this.groundGroup = new THREE.Group()
    this.scene.add(this.groundGroup)

    const gridHelper = new THREE.GridHelper(GRID, CELLS, 0x444444, 0x333333)
    gridHelper.position.set(GRID / 2, 0.1, GRID / 2)
    this.scene.add(gridHelper)
    this._gridHelper = gridHelper

    this.buildingGroup = new THREE.Group()
    this.scene.add(this.buildingGroup)

    this.ghostGroup = new THREE.Group()
    this.ghostGroup.visible = false
    this.scene.add(this.ghostGroup)

    // Straßenzug-Vorschau
    this.roadPreviewGroup = new THREE.Group()
    this.scene.add(this.roadPreviewGroup)

    this.selectionIndicator = this._createSelectionIndicator()
    this.selectionIndicator.visible = false
    this.scene.add(this.selectionIndicator)

    this.raycaster = new THREE.Raycaster()
    this.mouse = new THREE.Vector2()
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

    this.resize()
  }

  // ── Boden / Distrikte ──────────────────────────────────────
  buildGround (districtMap) {
    while (this.groundGroup.children.length) {
      const child = this.groundGroup.children[0]
      this.groundGroup.remove(child)
      disposeOwned(child)
    }
    const groundGeo = new THREE.PlaneGeometry(GRID, GRID)
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a5a3a })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.set(GRID / 2, -0.1, GRID / 2)
    this.groundGroup.add(markOwned(ground))

    for (const key of Object.keys(districtMap || {})) {
      const [cx, cz] = key.split(',').map(Number)
      const d = DISTRICTS[districtMap[key]]
      if (!d) continue
      const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE)
      const mat = new THREE.MeshLambertMaterial({
        color: new THREE.Color(d.groundColor[0], d.groundColor[1], d.groundColor[2])
        , transparent: true
        , opacity: 0.6
      })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(cx * CELL_SIZE + CELL_SIZE / 2, 0.05, cz * CELL_SIZE + CELL_SIZE / 2)
      this.groundGroup.add(markOwned(mesh))
    }
  }

  // ── Platzierungen ──────────────────────────────────────────
  async addPlacement (p) {
    let obj
    if (p.type === 'water') {
      const tileSize = p.model === 'water-tile-small' ? CELL_SIZE / 2 : CELL_SIZE
      const geo = new THREE.PlaneGeometry(tileSize, tileSize)
      const mat = new THREE.MeshLambertMaterial({ color: 0x2563a8, transparent: true, opacity: 0.8 })
      obj = new THREE.Mesh(geo, mat)
      obj.rotation.x = -Math.PI / 2
      obj.position.set(p.x, 0.1, p.z)
      markOwned(obj)
    } else {
      const template = await loadKenneyModel(p.model)
      obj = template ? template.clone(true) : markOwned(createFallbackBuilding(p.type))
      obj.scale.setScalar(scaleFor(p.model, p.type) * (p.scale || 1))
      obj.position.set(p.x, yPosFor(p), p.z)
      obj.rotation.y = p.rotation || 0
      this._tint(obj, p)
      if (p.model.startsWith('nature-bridge')) this._addBridgeWater(obj, p)
    }
    obj.userData.placementId = p.id
    obj.traverse(c => { if (c.isMesh) { c.name = 'building'; c.userData.placementId = p.id } })

    // Falls dieselbe id schon ein Mesh hat (Modellwechsel): erst entfernen
    this.removePlacement(p.id)
    this.meshById.set(p.id, obj)
    this.buildingGroup.add(obj)
    return obj
  }

  _tint (obj, p) {
    // Distrikt-Tint wie die Welt — deterministisch je Platzierung (Seed=id),
    // damit Verschieben/Drehen die Farbe nicht würfelt
    const isRoad = p.model.startsWith('road-')
    const isFlat = p.model.startsWith('pavement') || p.model.startsWith('grass') || p.model.startsWith('suburban-tree') || p.model.startsWith('suburban-planter')
    if (isRoad || isFlat) return
    const rng = mulberry32(1000 + (p.id || 0))
    const palette = (p.district != null && DISTRICT_PALETTES[p.district]) || DEFAULT_PALETTE
    const r = palette.r[0] + rng() * (palette.r[1] - palette.r[0])
    const g = palette.g[0] + rng() * (palette.g[1] - palette.g[0])
    const b = palette.b[0] + rng() * (palette.b[1] - palette.b[0])
    obj.traverse(child => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone()
        child.material.userData._owned = true
        const c = child.material.color
        c.setRGB(c.r * r, c.g * g, c.b * b)
      }
    })
  }

  _addBridgeWater (obj, p) {
    const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE)
    const mat = new THREE.MeshLambertMaterial({ color: 0x3a7cbd, transparent: true, opacity: 0.75 })
    const plane = new THREE.Mesh(geo, mat)
    plane.rotation.x = -Math.PI / 2
    // Position relativ zum (skalierten) Parent kompensieren
    plane.position.set(0, 0, 0)
    plane.scale.setScalar(1 / (scaleFor(p.model, p.type) * (p.scale || 1)))
    plane.position.y = -0.3 / (scaleFor(p.model, p.type) * (p.scale || 1))
    obj.add(markOwned(plane))
  }

  removePlacement (id) {
    const obj = this.meshById.get(id)
    if (!obj) return
    this.buildingGroup.remove(obj)
    disposeOwned(obj)
    this.meshById.delete(id)
  }

  updateTransform (p) {
    const obj = this.meshById.get(p.id)
    if (!obj) return
    obj.position.x = p.x
    obj.position.z = p.z
    obj.rotation.y = p.rotation || 0
  }

  async rebuildAll (placements, districtMap) {
    for (const id of [...this.meshById.keys()]) this.removePlacement(id)
    this.buildGround(districtMap)
    await Promise.all(placements.map(p => this.addPlacement(p)))
  }

  // ── Ghost (Platzierungs-Vorschau) ──────────────────────────
  async setGhost (model, type) {
    this.clearGhost()
    if (!model) return
    if (type === 'water') {
      const tileSize = model === 'water-tile-small' ? CELL_SIZE / 2 : CELL_SIZE
      const geo = new THREE.PlaneGeometry(tileSize, tileSize)
      const mat = new THREE.MeshLambertMaterial({ color: 0x2563a8, transparent: true, opacity: 0.4 })
      const plane = new THREE.Mesh(geo, mat)
      plane.rotation.x = -Math.PI / 2
      plane.position.y = 0.15
      this.ghostGroup.add(markOwned(plane))
      return
    }
    const template = await loadKenneyModel(model)
    if (!template) return
    const obj = template.clone(true)
    obj.scale.setScalar(scaleFor(model, type))
    obj.traverse(child => {
      if (child.isMesh) {
        child.material = child.material.clone()
        child.material.userData._owned = true
        child.material.transparent = true
        child.material.opacity = 0.5
      }
    })
    this.ghostGroup.add(obj)
  }

  clearGhost () {
    while (this.ghostGroup.children.length) {
      const child = this.ghostGroup.children[0]
      this.ghostGroup.remove(child)
      disposeOwned(child)
    }
    this.ghostGroup.visible = false
  }

  moveGhost (x, z, rotation) {
    this.ghostGroup.visible = this.ghostGroup.children.length > 0
    this.ghostGroup.position.set(x, 0, z)
    this.ghostGroup.rotation.y = rotation || 0
  }

  hideGhost () { this.ghostGroup.visible = false }

  // ── Straßenzug-Vorschau ────────────────────────────────────
  showRoadPreview (cellsList) {
    this.clearRoadPreview()
    const geo = new THREE.PlaneGeometry(CELL_SIZE * 0.9, CELL_SIZE * 0.9)
    const mat = new THREE.MeshBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.65 })
    geo.userData._owned = true
    mat.userData._owned = true
    for (const { cx, cz } of cellsList) {
      const mesh = new THREE.Mesh(geo, mat)
      mesh.rotation.x = -Math.PI / 2
      mesh.position.set(cx * CELL_SIZE + CELL_SIZE / 2, 0.4, cz * CELL_SIZE + CELL_SIZE / 2)
      this.roadPreviewGroup.add(mesh)
    }
  }

  clearRoadPreview () {
    const first = this.roadPreviewGroup.children[0]
    if (first) disposeOwned(first) // geo+mat sind über alle Tiles geteilt
    this.roadPreviewGroup.clear()
  }

  // ── Selektion ──────────────────────────────────────────────
  _createSelectionIndicator () {
    const group = new THREE.Group()
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.8 })
    arrowMat.userData._owned = true
    const radius = 18
    const segments = 24
    const arcAngle = Math.PI * 1.5
    for (let i = 0; i < segments; i++) {
      const a1 = (i / segments) * arcAngle
      const a2 = ((i + 1) / segments) * arcAngle
      const geo = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 4)
      geo.userData._owned = true
      const seg = new THREE.Mesh(geo, arrowMat)
      seg.position.set((Math.cos(a1) + Math.cos(a2)) / 2 * radius, 0, (Math.sin(a1) + Math.sin(a2)) / 2 * radius)
      seg.rotation.y = -Math.atan2(Math.sin(a2) - Math.sin(a1), Math.cos(a2) - Math.cos(a1))
      group.add(seg)
    }
    const arrowGeo = new THREE.ConeGeometry(2.5, 5, 6)
    arrowGeo.userData._owned = true
    const arrow = new THREE.Mesh(arrowGeo, arrowMat)
    arrow.position.set(Math.cos(arcAngle) * radius, 0, Math.sin(arcAngle) * radius)
    arrow.rotation.z = Math.PI / 2
    arrow.rotation.y = -arcAngle + Math.PI / 2
    group.add(arrow)
    // Unsichtbarer Klick-Ring fürs Raycasting (Klick = Drehen)
    const ringGeo = new THREE.TorusGeometry(radius, 4, 4, 24)
    ringGeo.userData._owned = true
    const ringMat = new THREE.MeshBasicMaterial({ visible: false })
    ringMat.userData._owned = true
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.name = 'rotateRing'
    group.add(ring)
    group.position.y = 15
    return group
  }

  showSelection (p) {
    if (p) {
      this.selectionIndicator.visible = true
      this.selectionIndicator.position.x = p.x
      this.selectionIndicator.position.z = p.z
    } else {
      this.selectionIndicator.visible = false
    }
  }

  // ── Picking ────────────────────────────────────────────────
  _setMouseFromEvent (event) {
    const rect = this.canvas.getBoundingClientRect()
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    this.raycaster.setFromCamera(this.mouse, this.camera)
  }

  pickCell (event) {
    this._setMouseFromEvent(event)
    const target = new THREE.Vector3()
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, target)) return null
    const cx = Math.max(0, Math.min(CELLS - 1, Math.floor(target.x / CELL_SIZE)))
    const cz = Math.max(0, Math.min(CELLS - 1, Math.floor(target.z / CELL_SIZE)))
    return { cx, cz, x: cx * CELL_SIZE + CELL_SIZE / 2, z: cz * CELL_SIZE + CELL_SIZE / 2 }
  }

  pickPlacementId (event) {
    this._setMouseFromEvent(event)
    const hits = this.raycaster.intersectObjects(this.buildingGroup.children, true)
    return hits.length ? hits[0].object.userData.placementId : null
  }

  pickRotateRing (event) {
    if (!this.selectionIndicator.visible) return false
    this._setMouseFromEvent(event)
    return this.raycaster.intersectObjects(this.selectionIndicator.children, true).length > 0
  }

  // ── Loop / Resize / Teardown ───────────────────────────────
  start () {
    const animate = () => {
      if (this._stopped) return
      requestAnimationFrame(animate)

      // WASD / Pfeiltasten: über die Karte gleiten (schneller bei Zoom-out)
      const dist = this.camera.position.distanceTo(this.controls.target)
      const panSpeed = Math.max(4, dist * 0.008)
      const forward = new THREE.Vector3()
      this.camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
      const dir = new THREE.Vector3()
      if (this._keys['w'] || this._keys['arrowup']) dir.add(forward)
      if (this._keys['s'] || this._keys['arrowdown']) dir.sub(forward)
      if (this._keys['a'] || this._keys['arrowleft']) dir.sub(right)
      if (this._keys['d'] || this._keys['arrowright']) dir.add(right)
      if (dir.lengthSq() > 0) {
        dir.normalize().multiplyScalar(panSpeed)
        this.camera.position.add(dir)
        this.controls.target.add(dir)
      }

      this.controls.update()
      this.renderer.render(this.scene, this.camera)
    }
    animate()
  }

  resize () {
    const w = this.container.offsetWidth
    const h = this.container.offsetHeight
    if (!w || !h) return
    // updateStyle=false: die CSS-Regel (100%/100%) behält die Kontrolle —
    // Inline-Pixelmaße froren in Safari den ersten (falschen) Layout-Stand ein
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  dispose () {
    this._stopped = true
    for (const id of [...this.meshById.keys()]) this.removePlacement(id)
    this.clearGhost()
    this.clearRoadPreview()
    while (this.groundGroup.children.length) {
      const child = this.groundGroup.children[0]
      this.groundGroup.remove(child)
      disposeOwned(child)
    }
    disposeOwned(this.selectionIndicator)
    this._gridHelper.geometry.dispose()
    this._gridHelper.material.dispose()
    this.controls.dispose()
    this.renderer.dispose()
  }
}
