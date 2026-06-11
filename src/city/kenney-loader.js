/**
 * kenney-loader.js — Kenney-GLB-Laden, Klonen und Distrikt-Tinting.
 *
 * Die Modellliste kommt aus catalog.js (eine Quelle für Editor UND Welt);
 * geladen wird nur, was tatsächlich gebraucht wird.
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { allModelNames } from './catalog'
import { DISTRICT_PALETTES, DEFAULT_PALETTE } from './districts'

// ── Kenney Model Loader ──────────────────────────────────────
export const loadedModels = {} // cache: name -> THREE.Group
const pendingLoads = {} // name -> Promise (dedupliziert parallele Anfragen)
const gltfLoader = new GLTFLoader()

/**
 * Lädt ein einzelnes Kenney-Modell (lazy, dedupliziert). Löst mit dem
 * Template in loadedModels auf — oder mit null bei Fehlschlag (Konsument
 * fällt dann auf eine Fallback-Box zurück).
 */
export function loadKenneyModel (name) {
  if (loadedModels[name]) return Promise.resolve(loadedModels[name])
  if (pendingLoads[name]) return pendingLoads[name]
  pendingLoads[name] = new Promise((resolve) => {
    gltfLoader.load(
      '/models/kenney/' + name + '.glb',
      (gltf) => {
        loadedModels[name] = gltf.scene
        delete pendingLoads[name]
        resolve(gltf.scene)
      },
      undefined,
      (err) => {
        console.warn('Failed to load Kenney model:', name, err)
        delete pendingLoads[name]
        resolve(null)
      }
    )
  })
  return pendingLoads[name]
}

/**
 * Lädt eine Menge von Modellen parallel (Default: kompletter Katalog).
 * layout-renderer übergibt nur die im Layout referenzierten Namen.
 */
export function loadKenneyModels (names = allModelNames()) {
  return Promise.all([...new Set(names)].map(loadKenneyModel))
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

// ── Fallback-Box (sichtbar bis das GLB geladen ist) ──────────
export function createFallbackBuilding (type) {
  const group = new THREE.Group()

  // Water fallback: flat blue plane
  if (type === 'water') {
    const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a7cbd, transparent: true, opacity: 0.75 })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), waterMat)
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
