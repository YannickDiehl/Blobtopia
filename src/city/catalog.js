/**
 * catalog.js — DIE eine Quelle der Wahrheit für platzierbare Stadt-Assets.
 *
 * Speist die Editor-Palette, den Kenney-Loader der Welt und die Skalierung
 * beider Renderer. Vorher drifteten drei getrennte Listen auseinander
 * (Editor-Katalog, KENNEY_MODELS, MODEL_SCALE_MAP/CIVIC_SCALE) — mit echten
 * Folgefehlern (Krankenhaus-Ghost 0.00045 vs. Welt 0.288; Editor-Modelle,
 * die die Welt nur als graue Fallback-Box kannte).
 *
 * `scale` ist IMMER die effektive Welt-Skalierung (entspricht der alten
 * Kette CIVIC_SCALE → MODEL_SCALE_MAP → EDITOR_SCALE_MAP[type] → 16).
 * scripts/test-city-catalog.mjs verifiziert die Äquivalenz gegen die
 * ausgelieferten Stadt-Layouts.
 */

// Default-Skalierung je visuellem Typ (ehemals EDITOR_SCALE_MAP)
export const TYPE_DEFAULT_SCALE = {
  villa: 37, rowhouse: 28, apartment: 30, office: 30, factory: 28
  , road: 32, deco: 16, building: 24, water: 32, civic: 0.5
}

// Kompakte Item-Fabrik
const item = (model, label, icon, previewColor, type, scale, extra = {}) =>
  ({ model, label, icon, previewColor, type, scale, ...extra })

const letters = (ls, fn) => ls.map(fn)

export const CATEGORIES = [
  {
    name: 'suburban', label: 'Wohnhäuser (Villen)', items: [
      ...letters(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'm', 'n', 'o', 'r', 's', 't', 'u']
        , l => item(`suburban-building-type-${l}`, `Villa ${l.toUpperCase()}`, 'home', '#c8dcc8', 'villa', 37))
      , item('building-garage', 'Garage', 'garage', '#b0b0a0', 'villa', 37)
    ]
  }
  , {
    name: 'rowhouse', label: 'Reihenhäuser', items: [
      ...letters(['k', 'l', 'p', 'q']
        , l => item(`suburban-building-type-${l}`, `Reihenhaus ${l.toUpperCase()}`, 'home-group', '#e8d4a0', 'rowhouse', 28))
      , ...letters(['a', 'b', 'c', 'd']
        , l => item(`building-small-${l}`, `Kleingebäude ${l.toUpperCase()}`, 'home-group', '#d4c088', 'rowhouse', 28))
    ]
  }
  , {
    name: 'apartment', label: 'Mehrfamilienhäuser', items: letters(['j', 'l', 'm']
      , l => item(`commercial-building-${l}`, `Mehrfamilienhaus ${l.toUpperCase()}`, 'home-city', '#b8c0d0', 'apartment', 30))
  }
  , {
    name: 'commercial', label: 'Gewerbe / Büros', items: letters(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'k', 'n']
      , l => item(`commercial-building-${l}`, `Gewerbe ${l.toUpperCase()}`, 'office-building', '#a0b0c0', 'office', 30))
  }
  , {
    name: 'skyscraper', label: 'Hochhäuser / Fabriken', items: [
      ...letters(['a', 'b', 'c', 'd', 'e']
        , l => item(`commercial-building-skyscraper-${l}`, `Hochhaus ${l.toUpperCase()}`, 'city', '#888', 'factory', 28))
      , ...letters(['a', 'b']
        , l => item(`commercial-low-detail-building-wide-${l}`, `Fabrik ${l.toUpperCase()}`, 'factory', '#777', 'factory', 28))
    ]
  }
  , {
    name: 'roads', label: 'Straßen', items: [
      item('road-straight', 'Gerade', 'road', '#555', 'road', 32)
      , item('road-straight-lightposts', 'Gerade (Laternen)', 'road', '#555', 'road', 32)
      , item('road-intersection', 'Kreuzung', 'road', '#555', 'road', 32)
      , item('road-corner', 'Kurve', 'road', '#555', 'road', 32)
      , item('road-split', 'T-Kreuzung', 'road', '#555', 'road', 32)
    ]
  }
  , {
    name: 'fantasy', label: 'Fantasy Altstadt', items: [
      item('fantasy-windmill', 'Windmühle', 'weather-windy', '#8B6914', 'building', 24)
      , item('fantasy-watermill', 'Wassermühle', 'water', '#5B4513', 'building', 24)
      , item('fantasy-stall', 'Marktstand', 'store', '#C8A070', 'building', 22)
      , item('fantasy-stall-green', 'Marktstand (grün)', 'store', '#4a7c59', 'building', 22)
      , item('fantasy-stall-red', 'Marktstand (rot)', 'store', '#8B2500', 'building', 22)
      , item('fantasy-fountain-round-detail', 'Rundbrunnen', 'fountain', '#7ec8e3', 'deco', 16)
      , item('fantasy-cart', 'Wagen', 'truck', '#8B6914', 'deco', 14)
      , item('fantasy-lantern', 'Laterne', 'lamp', '#D4A520', 'deco', 14)
      , item('fantasy-hedge', 'Hecke', 'tree', '#2d6b3e', 'deco', 14)
      , item('fantasy-tree', 'Fantasy-Baum', 'tree', '#3a7a3a', 'deco', 16)
      , item('fantasy-tree-high', 'Hoher Fantasy-Baum', 'tree', '#2d5a2e', 'deco', 16)
      , item('fantasy-banner-green', 'Banner (grün)', 'flag', '#4a7c59', 'deco', 14)
      , item('fantasy-banner-red', 'Banner (rot)', 'flag', '#8B2500', 'deco', 14)
      , item('fantasy-wall-arch', 'Torbogen', 'arch', '#8B7355', 'deco', 22)
      , item('fantasy-fence', 'Zaun', 'fence', '#8B6914', 'deco', 14)
    ]
  }
  , {
    name: 'industrial', label: 'Industriegebäude', items: [
      ...letters(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't']
        , l => item(`industrial-building-${l}`, `Industrie ${l.toUpperCase()}`, 'factory', '#6a6a6a', 'factory', 28))
      , ...letters(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n']
        , l => item(`commercial-low-detail-building-${l}`, `Lagerhalle ${l.toUpperCase()}`, 'warehouse', '#8a8a8a', 'factory', 28))
      , item('industrial-chimney-basic', 'Schornstein (einfach)', 'factory', '#555', 'deco', 16)
      , item('industrial-chimney-large', 'Schornstein (groß)', 'factory', '#555', 'deco', 16)
      , item('industrial-chimney-medium', 'Schornstein (mittel)', 'factory', '#555', 'deco', 15)
      , item('industrial-chimney-small', 'Schornstein (klein)', 'factory', '#555', 'deco', 14)
      , item('industrial-detail-tank', 'Tank', 'barrel', '#777', 'deco', 16)
    ]
  }
  , {
    name: 'civic', label: 'Öffentliche Gebäude', items: [
      // Skalen = Welt-Werte (alte Editor-Palette hatte hier abweichende,
      // falsche Werte → Ghost passte nicht zum platzierten Gebäude)
      item('civic-church', 'Kirche', 'church', '#c8b080', 'civic', 75)
      , item('civic-hospital', 'Krankenhaus', 'hospital-box', '#e74c3c', 'civic', 0.288)
      , item('civic-school', 'Rathaus', 'bank', '#3498db', 'civic', 2.52)
      , item('civic-townhall', 'Rathausvorplatz', 'town-hall', '#7eb8da', 'civic', 24)
    ]
  }
  , {
    name: 'nature', label: 'Natur (Nature Kit)', items: [
      item('nature-tree_oak', 'Eiche', 'tree', '#3a7a3a', 'deco', 16)
      , item('nature-tree_default', 'Laubbaum', 'tree', '#4a8a4a', 'deco', 16)
      , item('nature-tree_detailed', 'Detailbaum', 'tree', '#3a6a3a', 'deco', 16)
      , item('nature-tree_cone', 'Nadelbaum', 'tree', '#2d5a2e', 'deco', 16)
      , item('nature-tree_pineDefaultA', 'Kiefer A', 'tree', '#1a4a1e', 'deco', 16)
      , item('nature-tree_pineRoundA', 'Rundkiefer', 'tree', '#2a5a2e', 'deco', 16)
      , item('nature-tree_thin', 'Birke', 'tree', '#5da36e', 'deco', 16)
      , item('nature-tree_small', 'Kleiner Baum', 'tree', '#6ab04c', 'deco', 14)
      , item('nature-tree_tall', 'Hoher Baum', 'tree', '#2d8a4e', 'deco', 18)
      , item('nature-plant_bush', 'Busch', 'tree', '#3a6a3a', 'deco', 12)
      , item('nature-plant_bushLarge', 'Großer Busch', 'tree', '#2d5a2e', 'deco', 14)
      , item('nature-flower_redA', 'Blume (rot)', 'flower', '#c0392b', 'deco', 10)
      , item('nature-flower_yellowA', 'Blume (gelb)', 'flower', '#f1c40f', 'deco', 10)
      , item('nature-flower_purpleA', 'Blume (lila)', 'flower', '#8e44ad', 'deco', 10)
      , item('nature-grass_large', 'Hohes Gras', 'grass', '#6ab04c', 'deco', 12)
      , item('nature-ground_grass', 'Grasfläche', 'grass', '#5a9a4a', 'deco', 16)
      , item('nature-rock_smallA', 'Kleiner Fels', 'terrain', '#888', 'deco', 12)
      , item('nature-rock_largeA', 'Großer Fels', 'terrain', '#777', 'deco', 14)
      , item('nature-bridge_stone', 'Steinbrücke', 'bridge', '#8B7355', 'road', 32)
      , item('nature-bridge_wood', 'Holzbrücke', 'bridge', '#8B6914', 'road', 32)
      , item('nature-log_stack', 'Holzstapel', 'pine-tree', '#8B6914', 'deco', 12)
      , item('nature-sign', 'Schild', 'sign-direction', '#8B6914', 'deco', 12)
      , item('water-tile', 'Wasser', 'water', '#2563a8', 'water', 32, { glb: false })
      , item('water-tile-small', 'Wasser (klein)', 'water', '#3a7cbd', 'water', 16, { glb: false })
      , item('pavement', 'Gehweg', 'road-variant', '#999', 'deco', 34)
      , item('pavement-fountain', 'Platz mit Brunnen', 'fountain', '#aaa', 'deco', 34)
      , item('nature-path_stone', 'Steinweg', 'road-variant', '#8a8070', 'deco', 34)
      , item('nature-path_stoneCorner', 'Steinweg (Ecke)', 'road-variant', '#8a8070', 'deco', 43)
      , item('nature-path_stoneEnd', 'Steinweg (Ende)', 'road-variant', '#8a8070', 'deco', 53)
      , item('suburban-path-long', 'Weg (lang)', 'road-variant', '#b0a890', 'deco', 82)
      , item('suburban-path-short', 'Weg (kurz)', 'road-variant', '#b0a890', 'deco', 162)
      , item('suburban-path-stones-long', 'Steinplatten (lang)', 'road-variant', '#9a9080', 'deco', 82)
      , item('suburban-path-stones-short', 'Steinplatten (kurz)', 'road-variant', '#9a9080', 'deco', 162)
      , item('suburban-path-stones-messy', 'Steinplatten (wild)', 'road-variant', '#9a9080', 'deco', 90)
    ]
  }
  , {
    name: 'decoration', label: 'Dekoration (Original)', items: [
      item('grass-trees', 'Bäume', 'tree', '#4a7c59', 'deco', 16)
      , item('grass-trees-tall', 'Hohe Bäume', 'tree', '#3d6b4b', 'deco', 16)
      , item('grass', 'Rasen', 'grass', '#6ab04c', 'deco', 16)
      , item('suburban-tree-large', 'Großer Baum', 'tree', '#2d8a4e', 'deco', 16)
      , item('suburban-tree-small', 'Kleiner Baum', 'tree', '#5da36e', 'deco', 12)
      , item('suburban-planter', 'Pflanzkübel', 'flower', '#c0a080', 'deco', 16)
    ]
  }
]

// Modell-Varianten, die nicht in der Palette stehen, aber von Layouts
// referenziert werden dürfen (Generator-Output, Alt-Layouts). Gleiche
// Skalierungs-Defaults über TYPE_DEFAULT_SCALE[type].
export const EXTRA_MODELS = [
  // Nature-Kit-Varianten (dark/fall/B/C …)
  ...['nature-tree_default_dark', 'nature-tree_default_fall'
    , 'nature-tree_oak_dark', 'nature-tree_oak_fall'
    , 'nature-tree_detailed_dark', 'nature-tree_detailed_fall'
    , 'nature-tree_cone_dark', 'nature-tree_cone_fall'
    , 'nature-tree_pineDefaultB', 'nature-tree_pineRoundB', 'nature-tree_pineRoundC'
    , 'nature-tree_small_dark', 'nature-tree_tall_dark', 'nature-tree_thin_dark'
    , 'nature-tree_fat', 'nature-tree_blocks', 'nature-tree_simple', 'nature-tree_plateau'
    , 'nature-plant_bushSmall', 'nature-plant_bushDetailed', 'nature-plant_bushTriangle'
    , 'nature-flower_purpleB', 'nature-flower_redB', 'nature-flower_yellowB'
    , 'nature-grass', 'nature-grass_leafs', 'nature-grass_leafsLarge'
    , 'nature-rock_smallB', 'nature-rock_largeB'
    , 'nature-ground_riverStraight', 'nature-ground_riverBend'
    , 'nature-ground_riverCorner', 'nature-ground_riverEnd'
    , 'nature-log', 'nature-stump_round', 'nature-statue_column'
  ].map(m => ({ model: m, type: 'deco' }))
  // Fantasy-Varianten
  , ...['fantasy-watermill-wide', 'fantasy-stall-bench', 'fantasy-stall-stool'
    , 'fantasy-fountain-square-detail', 'fantasy-fountain-center', 'fantasy-fountain-edge'
    , 'fantasy-wall-doorway-round', 'fantasy-cart-high'
    , 'fantasy-hedge-large', 'fantasy-fence-gate'
    , 'fantasy-tree-crooked', 'fantasy-tree-high-crooked', 'fantasy-tree-high-round'
    , 'fantasy-rock-large', 'fantasy-rock-small', 'fantasy-rock-wide'
  ].map(m => ({ model: m, type: 'deco' }))
]

// ── Lookup-Strukturen ───────────────────────────────────────────
export const ASSET_MAP = {}
for (const cat of CATEGORIES) {
  for (const it of cat.items) ASSET_MAP[it.model] = it
}

// Modell-Overrides: nur wo die Palette von ihrem Typ-Default abweicht.
// Entspricht exakt den alten CIVIC_SCALE + MODEL_SCALE_MAP Einträgen.
export const MODEL_SCALE_OVERRIDES = {}
for (const cat of CATEGORIES) {
  for (const it of cat.items) {
    if (it.glb !== false && it.scale !== TYPE_DEFAULT_SCALE[it.type]) {
      MODEL_SCALE_OVERRIDES[it.model] = it.scale
    }
  }
}

/**
 * Effektive Render-Skalierung — identisch für Editor (inkl. Ghost) und Welt.
 * Ersetzt die alte Kette CIVIC_SCALE → MODEL_SCALE_MAP → EDITOR_SCALE_MAP.
 * WICHTIG: hängt vom PLATZIERUNGS-Typ ab, nicht vom Palette-Typ — der
 * Generator nutzt z. B. Hochhaus-Modelle als 'apartment' (Skala 30, nicht 28).
 */
export function scaleFor (model, type) {
  if (MODEL_SCALE_OVERRIDES[model] != null) return MODEL_SCALE_OVERRIDES[model]
  return TYPE_DEFAULT_SCALE[type] || 16
}

/** Alle GLB-gestützten Modellnamen (Palette + Extras) — Basis des Welt-Loaders. */
export function allModelNames () {
  const names = new Set()
  for (const cat of CATEGORIES) {
    for (const it of cat.items) {
      if (it.glb !== false) names.add(it.model)
    }
  }
  for (const ex of EXTRA_MODELS) names.add(ex.model)
  return [...names]
}

// ── Funktionale Typen (Spiegel des Rust-Enums in stage/city.rs) ─
// `residential`/`workplace` entsprechen is_residential()/is_workplace().
export const FUNCTIONAL_TYPES = [
  { value: 'villa', label: 'Villa / Einfamilienhaus', residential: true, defaultCapacity: 4 }
  , { value: 'rowhouse', label: 'Reihenhaus', residential: true, defaultCapacity: 3 }
  , { value: 'apartment', label: 'Mehrfamilienhaus', residential: true, defaultCapacity: 5 }
  , { value: 'residential', label: 'Wohngebäude (allgemein)', residential: true, defaultCapacity: 4 }
  , { value: 'office', label: 'Büro', workplace: true, defaultCapacity: 5 }
  , { value: 'factory', label: 'Fabrik', workplace: true, defaultCapacity: 10 }
  , { value: 'warehouse', label: 'Lager', workplace: true, defaultCapacity: 5 }
  , { value: 'shop', label: 'Geschäft', workplace: true, defaultCapacity: 3 }
  , { value: 'cafe', label: 'Café', workplace: true, defaultCapacity: 3 }
  , { value: 'restaurant', label: 'Restaurant', workplace: true, defaultCapacity: 4 }
  , { value: 'bar', label: 'Bar', workplace: true, defaultCapacity: 3 }
  , { value: 'university', label: 'Universität', workplace: true, defaultCapacity: 10 }
  , { value: 'library', label: 'Bibliothek', workplace: true, defaultCapacity: 4 }
  , { value: 'media_center', label: 'Medienzentrum', workplace: true, defaultCapacity: 5 }
  , { value: 'parliament', label: 'Rathaus / Parlament', workplace: true, defaultCapacity: 10 }
  , { value: 'school', label: 'Schule', defaultCapacity: 8 }
  , { value: 'marketplace', label: 'Marktplatz', defaultCapacity: 0 }
  , { value: 'central_square', label: 'Zentraler Platz', defaultCapacity: 0 }
  , { value: 'park', label: 'Park', defaultCapacity: 0 }
  , { value: 'sports_facility', label: 'Sportanlage', defaultCapacity: 0 }
  , { value: 'decoration', label: 'Dekoration (keine Funktion)', defaultCapacity: 0 }
  , { value: 'road', label: 'Straße', defaultCapacity: 0 }
  , { value: 'water', label: 'Wasser', defaultCapacity: 0 }
]

export const FUNCTIONAL_MAP = {}
for (const ft of FUNCTIONAL_TYPES) FUNCTIONAL_MAP[ft.value] = ft

/** Default-functional_type je visuellem Typ (für neue Platzierungen). */
export const TYPE_TO_FUNCTIONAL = {
  villa: 'villa', rowhouse: 'rowhouse', apartment: 'apartment'
  , office: 'office', factory: 'factory'
  , road: 'road', deco: 'decoration', water: 'water'
  , building: 'residential', civic: 'central_square'
}
