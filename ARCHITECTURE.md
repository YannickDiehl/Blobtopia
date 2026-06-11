# Architektur — Blobtopia

> Die eine Seite, die man gelesen haben muss, bevor man hier etwas umbaut.

## Kernidee: statischer Timeline-Player

Blobtopia ist **keine Live-Simulation**. Die Gesellschaft (500 Blobs, 22 Jahre,
8.030 Ticks) wurde einmal offline in Rust durchgerechnet und als JSON
eingefroren. Das Vue-Frontend spielt diese Daten nur ab. Die **einzige
Live-Komponente** ist der LLM-Chat (`api/chat.js`, Vercel-Function → Anthropic
`claude-haiku-4-5`).

```
crates/precompute (Rust, offline, einmalig)
        │  cargo run -p blobtopia-precompute -- [seed=118] [out] [blobs=500]
        ▼
data/blobtopia_timeline.db (SQLite, ~2.5 GB, NICHT in git)
        │  npm run export   (scripts/export-timeline.js)
        ▼
public/data/timeline/  ─ meta, blobs-static, buildings, stats … (klein, in git)
                       └ ticks/NNNN-NNNN.json (~2.3 GB, NICHT in git)
        │  fetch zur Laufzeit, 100-Tick-Blöcke, gecacht
        ▼
Vue-3-Frontend (statisch, Vercel)  ←→  api/chat.js  ←→  Anthropic
```

## Module und ihre Verantwortung

| Modul | Rolle | Status |
|---|---|---|
| `crates/simulation-core` | Agentenmodell (Einstellungen, 21 latente Indikatoren, Events, Parteien). Deterministisch pro Seed (Test: `tests/determinism.rs`) | aktiv (offline) |
| `crates/precompute` | Simulationslauf → SQLite | aktiv (offline) |
| `crates/server` | alter Live-Server | **LEGACY**, aus Workspace ausgeschlossen, s. `crates/server/README.md` |
| `scripts/export-timeline.js` | SQLite → kompaktes Tick-JSON | aktiv |
| `scripts/*.py` + `scripts/validation/` | Artefakt-Generierung (Tweets, Zeitungen, Personas) + 7-Layer-Validierung; Deps: `requirements.txt` | aktiv (offline) |
| `src/` | Vue-3-Frontend (Three.js-Stadt, Inspector, Chat, Befragungsinstitut, Feed, Zeitung) | aktiv |
| `src/city/` | Stadt-Rendering der Welt; `catalog.js` ist die EINE Asset-Quelle (Palette, Loader, Skalen, functional_types) | aktiv |
| `src/editor/` + `src/pages/city-editor.vue` | Stadt-Editor (Authoring-Werkzeug der Stadt-Pipeline, s. eigener Abschnitt) | aktiv |
| `api/chat.js` | Anthropic-Proxy (Rate-Limit, Prompt-Validierung, Leak-Filter) | aktiv (Produktion) |

## Die zwei Datenverträge (Vorsicht beim Refactoring)

1. **SQLite-Schema** — definiert in
   `crates/simulation-core/src/society/timeline_db.rs`, gelesen von
   `scripts/export-timeline.js`.
2. **Kompaktes `s[]`-Tick-Format** (positionsbasiert, 20 Felder pro Blob) —
   geschrieben von `export-timeline.js`, dekodiert von
   `src/lib/timeline-decode.js` (dort vollständig dokumentiert).
   Tripwire-Test: `scripts/test-timeline-decode.mjs`.

## Stadt-Editor & Stadt-Pipeline

Die Stadt entsteht im **Stadt-Editor** (`/#/editor`) und fließt über zwei
Dateien in die Simulation:

```
Stadt-Editor (/#/editor)
   │  „In Repo speichern" (Dev-Endpoint, vite.config.js) — schreibt BEIDE synchron
   ├──▶ data/blobtopia-city.json     → Input für `cargo precompute` (Wohn-/Arbeits-
   │                                    zuordnung, functional_type + capacity zählen!)
   └──▶ public/blobtopia-city.json   → visuelles Welt-Layout (layout-renderer.js)
```

Nach Stadt-Änderungen, die die Simulation betreffen sollen: `cargo run -p
blobtopia-precompute` (~1 min für 500 Blobs) + `npm run export` + deployen.

**Layout-Contract** (`src/city/constants.js`): `CITY_LAYOUT_VERSION` stempelt
jeden Export; der Welt-Renderer akzeptiert nur passende Versionen. Drei
getrennte localStorage-Ebenen: `blobtopia-editor-draft` (Autosave-Arbeitsstand,
beeinflusst nichts), `blobtopia-city-preview` (explizite Welt-Vorschau via
„In Welt ansehen" — die Welt zeigt dann einen Hinweis-Toast; Blob-Verhalten
bleibt die precomputete Standard-Stadt), Export (Datei/Repo).

**Eine Asset-Quelle**: `src/city/catalog.js` definiert Palette, Modellliste
des Loaders, Skalierung (`scaleFor` — placement-typ-sensitiv!) und die
`functional_types` (Spiegel des Rust-Enums in `stage/city.rs`).
Tripwire-Test: `scripts/test-city-catalog.mjs` (Skalen-Äquivalenz gegen die
ausgelieferten Layouts, GLB-Existenz, Enum-Abgleich gegen die .rs-Datei).
Editor-Live-Prüfung (`src/editor/validation.js`): Wohnkapazität ≥ Population,
Straßennetz-Zusammenhang, Gebäude-Erreichbarkeit.

## Eine Quelle der Wahrheit für den Persona-Prompt

`src/lib/build-system-prompt.js` ist die **kanonische** Implementierung.
Bekannte (veraltete) Kopien: `crates/server/src/stats.rs` (Legacy) und eine
Minimal-Approximation in `scripts/validation/layer4_llm_calibration.py`.
Änderungen am Prompt nur in der JS-Version.

## Befehle

```bash
npm run dev      # Vite-Dev-Server :8080 (inkl. /api/chat-Middleware aus vite.config.js)
npm test         # alle scripts/test-*.mjs Suiten (survey + timeline-decode)
npm run e2e      # Browser-Smoke + iPad-Touch + Editor-Suite (braucht laufenden Dev-Server)
npm run build    # Produktions-Build → dist/ (Vite)
npm run export   # SQLite → public/data/timeline/ (braucht die DB, s.o.)
cargo test --workspace   # Rust-Tests (simulation-core)

# Produktions-Deploy (Vercel deployt NICHT per Git — CLI-Upload von lokal,
# weil ticks/ + GLB-Modelle bewusst nicht in git liegen). Prebuilt-Flow:
mv requirements.txt /tmp/ && npx vercel build --prod ; mv /tmp/requirements.txt .
#   (requirements.txt verwirrt die Vercel-Runtime-Detection → „spawn uv ENOENT")
npx vercel deploy --prebuilt --prod   # Upload dedupliziert per Datei-Hash
node scripts/start-api-server.js  # Chat-API lokal ohne Vercel (.env: ANTHROPIC_API_KEY)
```

## Stack-Migration (abgeschlossen 2026-06, Branch vue3-migration)

Migriert von Vue 2.7/Webpack 4/Vuex/Buefy/Chart.js 2 auf **Vue 3.5 + Vite 8 +
Pinia + vue-router 4 (Hash-Mode) + Oruga/Bulma 1 + Chart.js 4**. Wichtige
Architektur-Punkte daraus:
- `src/plugins/buefy-compat/` übersetzt die alten `b-*`-Tags in Oruga-Props —
  der `b-icon`-Shim ist DAUERHAFT (120 Call-Sites), die übrigen Shims sind
  bewusst beibehaltene dünne Wrapper (Inlining wäre reiner Churn).
- Die three-vue-Schicht nutzt einen mitt-Bus (`renderer.events`) und eine
  `v3parent`/`v3children`-Registry statt der in Vue 3 entfernten
  Instanz-Events/`$children`.
- Oruga 0.13: Komponenten via `createOruga(bulmaConfig, OrugaComponentPlugins)`
  (Default-Export registriert nichts!); Bulma 1 kommt precompiled aus
  `@oruga-ui/theme-bulma/style.css`, Markenfarben via
  `src/styles/_bulma-bridge.scss`.

Three.js läuft auf r184 (Phase II): `ColorManagement.enabled=false` +
expliziter `OutputPass` + Lichtintensitäten ×π halten den kalibrierten
r111-Look (pixel-histogramm-verifiziert). 51 Komponenten nutzen Pug (von
Vite nativ unterstützt).
