# ⚠️ LEGACY — nicht mehr in Produktion

Dieser Crate war der ursprüngliche Live-Server (Axum + WebSocket + SQLite-Stats
+ Anthropic-Chat) aus der Zeit **vor** dem statischen Export. Er ist seit der
Umstellung auf die statische Architektur **nicht mehr eingebunden**:

- Das Frontend lädt die Timeline als statische JSON-Dateien
  (`public/data/timeline/`, erzeugt via `npm run export`).
- Der Chat läuft über die Vercel-Function `api/chat.js`.
- `vercel.json` referenziert diesen Server nirgends.

Der Crate ist aus dem Workspace ausgeschlossen (`exclude` im Root-`Cargo.toml`)
und wird bei `cargo build/test --workspace` nicht mehr mitgebaut.

**Bekannte Drift:** Der Prompt-Builder in `src/stats.rs` ist eine veraltete
Kopie — kanonisch ist `src/lib/build-system-prompt.js` (JS). Die Rust-Version
hat eine zusätzliche Aktivität (`STROLLING`) und es fehlen die Policy- und
Trait-Label-Schwellen. Nicht als Referenz verwenden.

Löschen ist unkritisch, sobald niemand mehr die alten Stats-SQL-Queries als
Vorlage braucht — die Git-History bewahrt alles.
