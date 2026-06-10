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
Vue-2-Frontend (statisch, Vercel)  ←→  api/chat.js  ←→  Anthropic
```

## Module und ihre Verantwortung

| Modul | Rolle | Status |
|---|---|---|
| `crates/simulation-core` | Agentenmodell (Einstellungen, 21 latente Indikatoren, Events, Parteien). Deterministisch pro Seed (Test: `tests/determinism.rs`) | aktiv (offline) |
| `crates/precompute` | Simulationslauf → SQLite | aktiv (offline) |
| `crates/server` | alter Live-Server | **LEGACY**, aus Workspace ausgeschlossen, s. `crates/server/README.md` |
| `scripts/export-timeline.js` | SQLite → kompaktes Tick-JSON | aktiv |
| `scripts/*.py` + `scripts/validation/` | Artefakt-Generierung (Tweets, Zeitungen, Personas) + 7-Layer-Validierung; Deps: `requirements.txt` | aktiv (offline) |
| `src/` | Vue-2-Frontend (Three.js-Stadt, Inspector, Chat, Befragungsinstitut, Feed, Zeitung) | aktiv |
| `api/chat.js` | Anthropic-Proxy (Rate-Limit, Prompt-Validierung, Leak-Filter) | aktiv (Produktion) |

## Die zwei Datenverträge (Vorsicht beim Refactoring)

1. **SQLite-Schema** — definiert in
   `crates/simulation-core/src/society/timeline_db.rs`, gelesen von
   `scripts/export-timeline.js`.
2. **Kompaktes `s[]`-Tick-Format** (positionsbasiert, 20 Felder pro Blob) —
   geschrieben von `export-timeline.js`, dekodiert von
   `src/lib/timeline-decode.js` (dort vollständig dokumentiert).
   Tripwire-Test: `scripts/test-timeline-decode.mjs`.

## Eine Quelle der Wahrheit für den Persona-Prompt

`src/lib/build-system-prompt.js` ist die **kanonische** Implementierung.
Bekannte (veraltete) Kopien: `crates/server/src/stats.rs` (Legacy) und eine
Minimal-Approximation in `scripts/validation/layer4_llm_calibration.py`.
Änderungen am Prompt nur in der JS-Version.

## Befehle

```bash
npm run dev      # Dev-Server :8080 (OpenSSL-Legacy-Flag ist in den Scripts encodiert)
npm test         # alle scripts/test-*.mjs Suiten (survey + timeline-decode)
npm run build    # Produktions-Build → dist/
npm run export   # SQLite → public/data/timeline/ (braucht die DB, s.o.)
cargo test --workspace   # Rust-Tests (simulation-core)
node scripts/start-api-server.js  # Chat-API lokal ohne Vercel (.env: ANTHROPIC_API_KEY)
```

## Bekannte Migrations-Lasten (Stand Audit 2026-06-10)

Vue 2 + Buefy 0.8 + Webpack 4 + Chart.js 2 + Three r111 sind EOL und nur im
Verbund migrierbar (Buefy hat keinen Vue-3-Pfad → UI-Kit-Entscheidung nötig,
z. B. Oruga). Three.js ist unabhängig migrierbar (kein `THREE.Geometry` im
Code; nur `three-orbit-controls` ersetzen). 51 Komponenten nutzen
Pug-Templates. Details: Audit-Bericht / Git-History dieses Commits.
