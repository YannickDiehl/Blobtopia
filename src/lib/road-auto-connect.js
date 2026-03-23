/**
 * road-auto-connect.js — Nachbarschafts-basierter Auto-Connect für Kenney-Straßentiles
 *
 * Analysiert für jede Straßenzelle die 4 kardinalen Nachbarn (N/S/E/W)
 * und weist den korrekten Tile-Typ + Rotation zu.
 */

var PI = Math.PI
var HALF_PI = PI / 2

// Bitmask: N=1, E=2, S=4, W=8
// Kenney-Konvention (empirisch verifiziert):
//   road-straight rot=0 verläuft N↔S (vertikal)
//   road-corner   rot=0 verbindet S+W (Gras oben-rechts)
//   road-split    rot=0 offen E+S+W, geschlossen N
var ROAD_TILE_MAP = {
  // Keine oder 1 Nachbar — Sackgasse als Gerade
  0:  { model: 'road-straight', rotation: 0 }           // isoliert
  , 1:  { model: 'road-straight', rotation: 0 }         // nur N → vertikal
  , 2:  { model: 'road-straight', rotation: HALF_PI }   // nur E → horizontal
  , 4:  { model: 'road-straight', rotation: 0 }         // nur S → vertikal
  , 8:  { model: 'road-straight', rotation: HALF_PI }   // nur W → horizontal

  // 2 Nachbarn gegenüber — Gerade
  , 5:  { model: 'road-straight', rotation: 0 }         // N+S → vertikal
  , 10: { model: 'road-straight', rotation: HALF_PI }   // E+W → horizontal

  // 2 Nachbarn Ecke — Corner (rot=0: S+W, +π/2 pro Drehung CCW)
  , 12: { model: 'road-corner', rotation: 0 }           // S+W
  , 6:  { model: 'road-corner', rotation: HALF_PI }     // E+S
  , 3:  { model: 'road-corner', rotation: PI }          // N+E
  , 9:  { model: 'road-corner', rotation: HALF_PI * 3 } // N+W

  // 3 Nachbarn — T-Kreuzung
  // road-split rot=0: T öffnet nach Norden (offen N+E+W, geschlossen S)
  , 14: { model: 'road-split', rotation: 0 }              // E+S+W (offen S) → rot 0° (N-S gespiegelt)
  , 7:  { model: 'road-split', rotation: HALF_PI }        // N+E+S (offen E) → rot 90°
  , 11: { model: 'road-split', rotation: PI }              // N+E+W (offen N) → rot 180° (N-S gespiegelt)
  , 13: { model: 'road-split', rotation: HALF_PI * 3 }    // N+S+W (offen W) → rot 270°

  // 4 Nachbarn — Kreuzung
  , 15: { model: 'road-intersection', rotation: 0 }     // alle 4
}

/**
 * Auto-Connect: Korrekten Tile-Typ + Rotation für alle Straßen setzen.
 *
 * @param {Array} placements — Array von {id, model, x, z, rotation, type, ...}
 * @param {number} cellSize — Zellgröße (default 32)
 * @returns {Array} dasselbe Array (mutiert in-place)
 */
function autoConnectRoads (placements, cellSize) {
  cellSize = cellSize || 32
  var halfCell = cellSize / 2

  // 1. Lookup-Grid aufbauen: "cx,cz" → placement
  var roadGrid = {}
  for (var i = 0; i < placements.length; i++) {
    var p = placements[i]
    if (p.type !== 'road') continue
    // Welt-Koordinaten → Grid-Zelle
    var cx = Math.round((p.x - halfCell) / cellSize)
    var cz = Math.round((p.z - halfCell) / cellSize)
    roadGrid[cx + ',' + cz] = p
  }

  // 2. Für jede Straßenzelle Nachbar-Bitmask berechnen
  var keys = Object.keys(roadGrid)
  for (var k = 0; k < keys.length; k++) {
    var parts = keys[k].split(',')
    var cx = parseInt(parts[0], 10)
    var cz = parseInt(parts[1], 10)
    var p = roadGrid[keys[k]]

    // Bitmask: N=1(cz-1), E=2(cx+1), S=4(cz+1), W=8(cx-1)
    var mask = 0
    if (roadGrid[cx + ',' + (cz - 1)]) mask |= 1 // N
    if (roadGrid[(cx + 1) + ',' + cz]) mask |= 2  // E
    if (roadGrid[cx + ',' + (cz + 1)]) mask |= 4  // S
    if (roadGrid[(cx - 1) + ',' + cz]) mask |= 8  // W

    var tile = ROAD_TILE_MAP[mask]
    if (!tile) continue

    // Brücken-Tiles nicht überschreiben
    if (p.label === 'Brücke' || (p.model && p.model.startsWith('nature-bridge'))) continue

    // Mark dead-ends (0 or 1 neighbor)
    var neighborCount = (mask & 1 ? 1 : 0) + (mask & 2 ? 1 : 0) + (mask & 4 ? 1 : 0) + (mask & 8 ? 1 : 0)
    if (neighborCount <= 1) {
      p.deadEnd = true
      p.deadEndMask = mask  // which direction the single neighbor is (0 = isolated)
    }

    // road-straight-lightposts beibehalten wenn schon gesetzt und Typ passt
    if (p.model === 'road-straight-lightposts' && tile.model === 'road-straight') {
      p.rotation = tile.rotation
    } else {
      p.model = tile.model
      p.rotation = tile.rotation
    }
  }

  return placements
}

export { autoConnectRoads, ROAD_TILE_MAP }
