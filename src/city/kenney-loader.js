/**
 * kenney-loader.js — Kenney model loading, cloning, tinting, and road tile placement
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { KENNEY_ROAD_NAMES, ROAD_TILE_SCALE } from './constants'
import { DISTRICT_PALETTES, DEFAULT_PALETTE } from './districts'

// ── Kenney Model Definitions ─────────────────────────────────
export const KENNEY_MODELS = {
  // Grüntal — suburban houses with gardens, low density
  villa: [
    'suburban-building-type-a', 'suburban-building-type-b', 'suburban-building-type-c'
    ,'suburban-building-type-d', 'suburban-building-type-e', 'suburban-building-type-f'
    ,'suburban-building-type-g', 'suburban-building-type-h', 'suburban-building-type-i'
    ,'suburban-building-type-j', 'suburban-building-type-k', 'suburban-building-type-l'
  ,]
  // Sonnenberg + Mittelfeld — townhouses, denser suburban
  ,rowhouse: [
    'suburban-building-type-m', 'suburban-building-type-n', 'suburban-building-type-o'
    ,'suburban-building-type-p', 'suburban-building-type-q', 'suburban-building-type-r'
    ,'suburban-building-type-s', 'suburban-building-type-t', 'suburban-building-type-u'
    ,'building-small-a', 'building-small-b', 'building-small-c', 'building-small-d'
  ,]
  // Hafenviertel + Civic center — tall commercial/apartment buildings
  ,apartment: [
    'commercial-building-a', 'commercial-building-b', 'commercial-building-c'
    ,'commercial-building-d', 'commercial-building-e', 'commercial-building-f'
    ,'commercial-building-g', 'commercial-building-h', 'commercial-building-i'
    ,'commercial-building-j', 'commercial-building-k', 'commercial-building-l'
    ,'commercial-building-m', 'commercial-building-n'
  ,]
  // Industriezone — skyscrapers, large industrial buildings + Kenney Industrial
  ,factory: [
    'commercial-building-skyscraper-a', 'commercial-building-skyscraper-b'
    ,'commercial-building-skyscraper-c', 'commercial-building-skyscraper-d'
    ,'commercial-building-skyscraper-e'
    ,'commercial-low-detail-building-wide-a', 'commercial-low-detail-building-wide-b'
    ,'industrial-building-a', 'industrial-building-b', 'industrial-building-c'
    ,'industrial-building-d', 'industrial-building-e', 'industrial-building-f'
    ,'industrial-building-g', 'industrial-building-h', 'industrial-building-i'
    ,'industrial-building-j', 'industrial-building-k', 'industrial-building-l'
    ,'industrial-building-m', 'industrial-building-n', 'industrial-building-o'
    ,'industrial-building-p', 'industrial-building-q', 'industrial-building-r'
    ,'industrial-building-s', 'industrial-building-t'
  ,]
  // Fantasy Town Kit — Altstadt buildings and decorations
  ,fantasy: [
    'fantasy-windmill', 'fantasy-watermill', 'fantasy-watermill-wide'
    ,'fantasy-stall', 'fantasy-stall-green', 'fantasy-stall-red'
    ,'fantasy-stall-bench', 'fantasy-stall-stool'
    ,'fantasy-fountain-round-detail', 'fantasy-fountain-square-detail'
    ,'fantasy-fountain-center', 'fantasy-fountain-edge'
    ,'fantasy-wall-doorway-round', 'fantasy-wall-arch'
    ,'fantasy-cart', 'fantasy-cart-high'
  ,]
  // Dekoration — Bäume, Grünflächen, Gehwege (existing + Nature Kit)
  ,deco: [
    'grass', 'grass-trees', 'grass-trees-tall'
    ,'suburban-tree-large', 'suburban-tree-small', 'suburban-planter'
    ,'pavement', 'pavement-fountain'
    ,'nature-path_stone', 'nature-path_stoneCorner', 'nature-path_stoneEnd'
    ,'suburban-path-long', 'suburban-path-short'
    ,'suburban-path-stones-long', 'suburban-path-stones-short', 'suburban-path-stones-messy'
    // Nature Kit trees
    ,'nature-tree_default', 'nature-tree_default_dark', 'nature-tree_default_fall'
    ,'nature-tree_oak', 'nature-tree_oak_dark', 'nature-tree_oak_fall'
    ,'nature-tree_detailed', 'nature-tree_detailed_dark', 'nature-tree_detailed_fall'
    ,'nature-tree_cone', 'nature-tree_cone_dark', 'nature-tree_cone_fall'
    ,'nature-tree_pineDefaultA', 'nature-tree_pineDefaultB'
    ,'nature-tree_pineRoundA', 'nature-tree_pineRoundB', 'nature-tree_pineRoundC'
    ,'nature-tree_small', 'nature-tree_small_dark'
    ,'nature-tree_tall', 'nature-tree_tall_dark'
    ,'nature-tree_thin', 'nature-tree_thin_dark'
    ,'nature-tree_fat', 'nature-tree_blocks', 'nature-tree_simple', 'nature-tree_plateau'
    // Nature Kit plants/flowers
    ,'nature-plant_bush', 'nature-plant_bushLarge', 'nature-plant_bushSmall'
    ,'nature-plant_bushDetailed', 'nature-plant_bushTriangle'
    ,'nature-flower_purpleA', 'nature-flower_redA', 'nature-flower_yellowA'
    ,'nature-flower_purpleB', 'nature-flower_redB', 'nature-flower_yellowB'
    ,'nature-grass', 'nature-grass_large', 'nature-grass_leafs', 'nature-grass_leafsLarge'
    ,'nature-ground_grass'
    // Nature Kit misc
    ,'nature-rock_smallA', 'nature-rock_smallB', 'nature-rock_largeA', 'nature-rock_largeB'
    ,'nature-ground_riverStraight', 'nature-ground_riverBend'
    ,'nature-ground_riverCorner', 'nature-ground_riverEnd'
    ,'nature-bridge_stone', 'nature-bridge_wood'
    ,'nature-log', 'nature-log_stack', 'nature-stump_round'
    ,'nature-sign', 'nature-statue_column'
    // Fantasy decorations
    ,'fantasy-lantern', 'fantasy-hedge', 'fantasy-hedge-large'
    ,'fantasy-fence', 'fantasy-fence-gate'
    ,'fantasy-tree', 'fantasy-tree-high', 'fantasy-tree-crooked'
    ,'fantasy-tree-high-crooked', 'fantasy-tree-high-round'
    ,'fantasy-banner-green', 'fantasy-banner-red'
    ,'fantasy-rock-large', 'fantasy-rock-small', 'fantasy-rock-wide'
    // Industrial decorations
    ,'industrial-chimney-basic', 'industrial-chimney-large'
    ,'industrial-chimney-medium', 'industrial-chimney-small'
    ,'industrial-detail-tank'
  ,]
  // Civic buildings (poly.pizza — CC0/CC-BY)
  ,civic: [
    'civic-church', 'civic-hospital', 'civic-school', 'civic-townhall'
  ,],
}

// Scale per type
export const KENNEY_SCALE = {
  villa: 24
  ,rowhouse: 28
  ,apartment: 30
  ,factory: 28
  ,fantasy: 24
  ,civic: 1, // default, overridden per model below
}

// ── Kenney Model Loader ──────────────────────────────────────
export const loadedModels = {} // cache: name -> THREE.Group
const gltfLoader = new GLTFLoader()

export function loadKenneyModels () {
  // Collect unique model names from all types
  const allNames = new Set()
  for (const models of Object.values(KENNEY_MODELS)) {
    for (const name of models) allNames.add(name)
  }
  // Also load road tiles
  for (const name of KENNEY_ROAD_NAMES) {
    allNames.add(name)
  }

  const promises = []
  for (const name of allNames) {
    promises.push(new Promise((resolve) => {
      gltfLoader.load(
        '/models/kenney/' + name + '.glb',
        (gltf) => {
          loadedModels[name] = gltf.scene
          resolve()
        },
        undefined,
        (err) => {
          console.warn('Failed to load Kenney model:', name, err)
          resolve() // don't block on failure
        }
      )
    }))
  }
  return Promise.all(promises)
}

export function tintModelByDistrict (model, districtId, rng) {
  const palette = DISTRICT_PALETTES[districtId] || DEFAULT_PALETTE
  const r = palette.r[0] + rng() * (palette.r[1] - palette.r[0])
  const g = palette.g[0] + rng() * (palette.g[1] - palette.g[0])
  const b = palette.b[0] + rng() * (palette.b[1] - palette.b[0])
  model.traverse(child => {
    if (child.isMesh && child.material) {
      child.material = child.material.clone()
      // Bestehende Farbe mit Distrikt-Tint multiplizieren
      const c = child.material.color
      c.setRGB(c.r * r, c.g * g, c.b * b)
    }
  })
}

export function cloneKenneyModel (type, rng) {
  const models = KENNEY_MODELS[type] || KENNEY_MODELS.rowhouse
  const name = models[Math.floor(rng() * models.length)]
  const template = loadedModels[name]
  if (!template) return null

  const clone = template.clone(true)
  const s = KENNEY_SCALE[type] || 8
  const scaleVar = 0.85 + rng() * 0.3 // slight size variation
  clone.scale.set(s * scaleVar, s * scaleVar, s * scaleVar)
  return clone
}

// ── Procedural fallback (if models not yet loaded) ───────────
export function createFallbackBuilding (type) {
  const group = new THREE.Group()

  // Water fallback: flat blue plane
  if (type === 'water') {
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a7cbd, transparent: true, opacity: 0.75 })
    const plane = new THREE.Mesh(new THREE.PlaneBufferGeometry(1, 1), waterMat)
    plane.rotation.x = -Math.PI / 2
    plane.position.y = 0.5
    group.add(plane)
    return group
  }

  const dims = {
    villa: { w: 8, h: 16, d: 8 }
    ,rowhouse: { w: 9, h: 20, d: 8 }
    ,apartment: { w: 11, h: 28, d: 10 }
    ,factory: { w: 14, h: 18, d: 11 },
  }[type] || { w: 9, h: 18, d: 8 }

  const colors = { villa: 0xe8e0d0, rowhouse: 0xd4c088, apartment: 0x8898a8, factory: 0x707070 }
  const mat = new THREE.MeshLambertMaterial({ color: colors[type] || 0xcccccc })
  const body = new THREE.Mesh(new THREE.BoxGeometry(dims.w, dims.h, dims.d), mat)
  body.position.y = dims.h / 2
  group.add(body)

  if (type === 'villa') {
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(dims.w * 0.72, 4, 4),
      new THREE.MeshLambertMaterial({ color: 0x8B4513 })
    )
    roof.position.y = dims.h + 2
    roof.rotation.y = Math.PI / 4
    group.add(roof)
  }
  return group
}

// ── Place Kenney road tiles along a curve ────────────────────
export function placeRoadTilesAlongCurve (curve, group, useLightposts) {
  const straightModel = loadedModels[useLightposts ? 'road-straight-lightposts' : 'road-straight']
  if (!straightModel) return

  const tileSize = ROAD_TILE_SCALE
  const len = curve.getLength()
  const count = Math.max(1, Math.floor(len / tileSize))

  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    if (t < 0.01 || t > 0.99) continue
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(Math.min(t, 0.9999))
    const angle = Math.atan2(tan.x, tan.z)

    const tile = straightModel.clone(true)
    tile.scale.set(ROAD_TILE_SCALE, ROAD_TILE_SCALE, ROAD_TILE_SCALE)
    tile.position.set(p.x, -0.15, p.z)
    tile.rotation.y = angle
    group.add(tile)
  }
}

export function placeAllRoadTiles (ringCurves, radialCurves, crossCurves) {
  const group = new THREE.Group()
  // Ring roads get lightpost variant every other ring
  for (let i = 0; i < ringCurves.length; i++) {
    placeRoadTilesAlongCurve(ringCurves[i], group, i === 1)
  }
  // Radial roads
  for (const curve of radialCurves) {
    placeRoadTilesAlongCurve(curve, group, false)
  }
  // Cross-streets (narrower, no lightposts)
  for (const curve of crossCurves) {
    placeRoadTilesAlongCurve(curve, group, false)
  }
  return group
}
