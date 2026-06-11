/**
 * Contract-Tests für src/city/catalog.js — die eine Asset-Quelle von
 * Editor UND Welt-Renderer.
 *
 * Tripwires:
 *  1. scaleFor() reproduziert die historische Skalierungs-Kette
 *     (CIVIC_SCALE → MODEL_SCALE_MAP → EDITOR_SCALE_MAP[type] → 16)
 *     für JEDE Platzierung der ausgelieferten Stadt-Layouts —
 *     sonst verschöbe sich die Welt sichtbar.
 *  2. Jedes GLB-Modell des Katalogs existiert in public/models/kenney/.
 *  3. Jedes von den Layouts referenzierte Modell ist dem Katalog bekannt.
 *  4. FUNCTIONAL_TYPES spiegelt das Rust-Enum (stage/city.rs) exakt.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  CATEGORIES, ASSET_MAP, EXTRA_MODELS, scaleFor, allModelNames
  , FUNCTIONAL_TYPES, TYPE_TO_FUNCTIONAL, FUNCTIONAL_MAP
} from '../src/city/catalog.js'

let passed = 0
function ok (name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ── Historische Skalierungs-Kette (Snapshot Stand der Migration) ────────
const OLD_EDITOR_SCALE_MAP = {
  villa: 37, rowhouse: 28, apartment: 30, office: 30, factory: 28
  , road: 32, deco: 16, building: 24, water: 32, civic: 0.5
}
const OLD_MODEL_SCALE_MAP = {
  'pavement': 34, 'pavement-fountain': 34
  , 'nature-path_stone': 34, 'nature-path_stoneCorner': 43, 'nature-path_stoneEnd': 53
  , 'suburban-path-long': 82, 'suburban-path-short': 162
  , 'suburban-path-stones-long': 82, 'suburban-path-stones-short': 162, 'suburban-path-stones-messy': 90
  , 'nature-tree_small': 14, 'nature-tree_tall': 18
  , 'nature-plant_bush': 12, 'nature-plant_bushLarge': 14
  , 'nature-flower_redA': 10, 'nature-flower_yellowA': 10, 'nature-flower_purpleA': 10
  , 'nature-grass_large': 12, 'nature-rock_smallA': 12, 'nature-rock_largeA': 14
  , 'nature-log_stack': 12, 'nature-sign': 12
  , 'fantasy-stall': 22, 'fantasy-stall-green': 22, 'fantasy-stall-red': 22
  , 'fantasy-cart': 14, 'fantasy-lantern': 14, 'fantasy-hedge': 14
  , 'fantasy-banner-green': 14, 'fantasy-banner-red': 14, 'fantasy-fence': 14
  , 'fantasy-wall-arch': 22
  , 'industrial-chimney-medium': 15, 'industrial-chimney-small': 14
  , 'suburban-tree-small': 12
}
const OLD_CIVIC_SCALE = {
  'civic-church': 75, 'civic-townhall': 24, 'civic-school': 2.52, 'civic-hospital': 0.288
}
const oldScale = (model, type) =>
  OLD_CIVIC_SCALE[model] || OLD_MODEL_SCALE_MAP[model] || OLD_EDITOR_SCALE_MAP[type] || 16

// ── Layout-Daten ────────────────────────────────────────────────────────
const layouts = []
for (const path of ['public/blobtopia-city.json', 'data/blobtopia-city.json']) {
  if (existsSync(path)) layouts.push({ path, data: JSON.parse(readFileSync(path, 'utf8')) })
}

ok('mindestens das ausgelieferte Layout ist vorhanden', () => {
  assert.ok(layouts.length >= 1)
})

ok('scaleFor() == historische Kette für jede ausgelieferte Platzierung', () => {
  let checked = 0
  for (const { path, data } of layouts) {
    for (const p of data.placements) {
      const want = oldScale(p.model, p.type)
      const got = scaleFor(p.model, p.type)
      assert.equal(got, want, `${path}: ${p.model} (${p.type}) → ${got}, erwartet ${want}`)
      checked++
    }
  }
  assert.ok(checked > 1000, `nur ${checked} Platzierungen geprüft`)
})

ok('jedes von Layouts referenzierte Modell ist dem Katalog bekannt', () => {
  const known = new Set(allModelNames())
  known.add('water-tile').add('water-tile-small') // Pseudo-Modelle (Planes, kein GLB)
  for (const { path, data } of layouts) {
    for (const p of data.placements) {
      assert.ok(known.has(p.model), `${path}: unbekanntes Modell ${p.model}`)
    }
  }
})

// Die GLBs sind bewusst NICHT in git (.gitignore: „tracked via Vercel
// upload") — auf CI/frischen Clones fehlt das Verzeichnis, dann nur Skip.
if (existsSync('public/models/kenney')) {
  ok('jedes GLB-Modell des Katalogs existiert in public/models/kenney/', () => {
    for (const name of allModelNames()) {
      assert.ok(existsSync(`public/models/kenney/${name}.glb`), `fehlt: ${name}.glb`)
    }
  })
} else {
  console.log('  – GLB-Existenz übersprungen (public/models/kenney fehlt — CI/frischer Clone)')
}

ok('keine Modell-Duplikate zwischen Palette und EXTRA_MODELS', () => {
  for (const ex of EXTRA_MODELS) {
    assert.ok(!ASSET_MAP[ex.model], `${ex.model} ist Palette UND Extra`)
  }
})

ok('Palette-Einträge sind vollständig (label/icon/type/scale)', () => {
  for (const cat of CATEGORIES) {
    for (const it of cat.items) {
      assert.ok(it.label && it.icon && it.type && typeof it.scale === 'number'
        , `unvollständig: ${it.model}`)
    }
  }
})

// ── functional_type ↔ Rust-Enum ────────────────────────────────────────
ok('FUNCTIONAL_TYPES spiegelt das Rust-Enum exakt', () => {
  const rs = readFileSync('crates/simulation-core/src/stage/city.rs', 'utf8')
  const enumBody = rs.match(/pub enum FunctionalType \{([\s\S]*?)\n\}/)[1]
  const variants = [...enumBody.matchAll(/^\s{4}([A-Z]\w+),/gm)]
    .map(m => m[1].replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase())
  const rust = new Set(variants)
  const js = new Set(FUNCTIONAL_TYPES.map(f => f.value))
  assert.ok(rust.size >= 20, `Rust-Enum-Parse verdächtig klein (${rust.size})`)
  for (const v of rust) assert.ok(js.has(v), `fehlt im Katalog: ${v}`)
  for (const v of js) assert.ok(rust.has(v), `nicht im Rust-Enum: ${v}`)
})

ok('TYPE_TO_FUNCTIONAL liefert nur gültige functional_types', () => {
  for (const [vt, ft] of Object.entries(TYPE_TO_FUNCTIONAL)) {
    assert.ok(FUNCTIONAL_MAP[ft], `${vt} → ${ft} ist kein gültiger functional_type`)
  }
})

ok('alle functional_types in den Layouts sind gültig', () => {
  for (const { path, data } of layouts) {
    for (const p of data.placements) {
      if (p.functional_type == null) continue
      assert.ok(FUNCTIONAL_MAP[p.functional_type]
        , `${path}: Platzierung ${p.id} hat unbekannten functional_type ${p.functional_type}`)
    }
  }
})

console.log(`\n${passed} passed, 0 failed`)
