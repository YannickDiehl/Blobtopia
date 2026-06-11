# data/ — Quelldaten & Generierungsartefakte

Rolle jeder Datei und wie sie regeneriert wird. **Wichtig:** Die zentrale
SQLite-DB ist nicht in git — ohne sie ist `npm run export` nicht möglich.

## Simulations-Eingaben (in git)

| Datei | Rolle | Erzeugt durch |
|---|---|---|
| `blobtopia-city.json` | Stadt-Geometrie (Gebäude, Straßen, Distrikte) | City-Editor (`/editor`) + `scripts/generate_compact_city.py` |
| `blobtopia-events.json` | 27 Event-Definitionen über 22 Jahre | manuell gepflegt |
| `districts.json` | Distrikt-Metadaten | manuell |
| `osm/` | OpenStreetMap-Rohdaten (Marburg) als Geometrie-Quelle | OSM-Export |

## Simulations-Ausgabe (NICHT in git — Engpass!)

| Datei | Rolle |
|---|---|
| `blobtopia_timeline.db` | ~2.5 GB SQLite, kompletter Simulationslauf (Seed 118, 500 Blobs, 8030 Ticks) |

Regenerieren: `cargo run -p blobtopia-precompute --release -- 118 data/blobtopia_timeline.db 500`
(läuft vom Repo-Root; liest `data/blobtopia-city.json` + `blobtopia-events.json`).

**Achtung:** Ein Neulauf ist nur in der *Dynamik* seed-deterministisch — die
Blob-UUIDs kommen aus `Uuid::new_v4()` (OS-Zufall). Ein regenerierter Lauf hat
also neue IDs und passt damit NICHT zu bereits generierten Artefakten
(Tweets, Personas, change-summaries referenzieren die alten IDs!).
→ Die kanonische DB und `public/data/timeline/ticks/` sollten extern
archiviert werden (externe Platte / Uni-Speicher / GitHub-Release). Die
Produktiv-Tick-Daten liegen außerdem im Vercel-Deployment.

## LLM-Generierungsartefakte

| Datei(en) | Rolle | Erzeugt durch |
|---|---|---|
| `tweets-context.json`, `tweets-archive.json` | Tweet-Korpus (1.707 Tweets) | `scripts/generate_tweets.py` → `precompute_tweets.py` → `import_tweets.py` |
| `newspapers.json`, `newspaper-context.json`, `generated-articles*.json` | 50 Zeitungsausgaben (2 Blätter) | `scripts/generate_newspaper.py` → `precompute_newspapers.py` (Config: `newspaper_config.py`) |
| `all-events-mapping.json` | Event → Blob-Wirkung | Generierungspipeline |
| `_batch_*.json`, `_result_*.json`, `_tweet_*` | Zwischenstände der Batch-API-Läufe | temporär, gitignored, löschbar |

Python-Umgebung: `pip install -r requirements.txt` (nur numpy; die
Anthropic-API wird direkt per urllib angesprochen, Key via `ANTHROPIC_API_KEY`).

## Frischer Clone — was fehlt?

Nach `git clone` + `npm ci` funktioniert alles **außer** der 3D-Timeline
(`public/data/timeline/ticks/` fehlt, ~2.3 GB). Beschaffung: aus dem
Vercel-Deployment ziehen, von einem bestehenden Rechner kopieren oder via
`npm run export` aus der (extern archivierten) DB regenerieren.
