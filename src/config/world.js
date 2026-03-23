export const GRID_SIZE = 1000    // World coordinates (3D scene)
export const SIM_SIZE = 250      // Simulation coordinates (server)
export const WORLD_SCALE = GRID_SIZE / SIM_SIZE  // = 4
export const CELL_SIZE = 32      // Tile-grid cell size
export const GRID_CELLS = 31     // Tile-grid dimension (31×31 = 992 ≈ 1000)

// Tick-Pacing: Server teilt dem Client das Intervall mit (gemessen).
// Fallback wenn noch kein Tick gemessen wurde:
export const DEFAULT_TICK_INTERVAL_MS = 903800
export const HOURS_PER_DAY = 24  // voller Tag 0:00–23:00

// Globale Stellschraube: Wie viele Echtzeit-Sekunden ein Sim-Tag dauert (bei Speed 1x).
// 30s → 1 Stunde = 1,25s → Blobs laufen sichtbar, Transits (~11s) passen in 3 Sim-Stunden.
export const SECONDS_PER_DAY = 720

// Globale Stellschraube: Laufgeschwindigkeit aller Blobs.
// Wird multipliziert mit SPEED_MAP (0.6–1.5) und per-Blob wanderSpeed (0.3–0.6).
// 1.5 → Durchschnitts-Blob: ~36 u/s → 400-unit Pfad in ~11 sec.
// Hochdrehen = schneller, runterdrehen = langsamer.
export const TRANSIT_SPEED = 1.5
