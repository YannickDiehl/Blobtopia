/**
 * City labels: named buildings and outdoor zones displayed as floating text.
 * Coordinates are world-space (matching blobtopia-city.json placements).
 * Labels appear/disappear based on camera zoom level.
 */

// Outdoor zone labels (from OUTDOOR_ZONES in blob-locations.js)
const ZONE_LABELS = [
  { x: 368, z: 528, label: 'Steinweg-Park', category: 'zone', icon: '🌳' }
  ,{ x: 752, z: 784, label: 'Hafenpromenade', category: 'zone', icon: '⚓' }
  ,{ x: 528, z: 560, label: 'Marktplatz', category: 'zone', icon: '🏛' }
  ,{ x: 340, z: 400, label: 'Flussufer', category: 'zone', icon: '🌊' }
  ,{ x: 688, z: 176, label: 'Ringstraßen-Allee', category: 'zone', icon: '🌲' }
,]

// Building labels per district
const BUILDING_LABELS = [
  // Grüntal (green villa district)
  { x: 400, z: 480, label: 'Bioladen Grüntal', category: 'shop' }
  ,{ x: 320, z: 560, label: 'Café am Steinweg', category: 'gastro' }

  // Sonnenberg (warm rowhouse district)
  ,{ x: 180, z: 300, label: 'Bäckerei Sonnenberg', category: 'gastro' }
  ,{ x: 140, z: 400, label: 'Buchhandlung', category: 'culture' }
  ,{ x: 200, z: 500, label: 'Café Sonnenberg', category: 'gastro' }

  // Hafenviertel (cool apartment district)
  ,{ x: 800, z: 850, label: 'Hafenkneipe', category: 'gastro' }
  ,{ x: 850, z: 900, label: 'Fischmarkt', category: 'shop' }
  ,{ x: 780, z: 820, label: 'Hafencafé', category: 'gastro' }

  // Mittelfeld (orange rowhouse district)
  ,{ x: 120, z: 700, label: 'Supermarkt', category: 'shop' }
  ,{ x: 100, z: 600, label: 'Apotheke', category: 'shop' }
  ,{ x: 150, z: 800, label: 'Friseur', category: 'shop' }

  // Industriezone
  ,{ x: 850, z: 500, label: 'Kantine', category: 'gastro' }
  ,{ x: 900, z: 400, label: 'Spätkauf', category: 'shop' }

  // Civic center (already named landmarks)
  ,{ x: 496, z: 560, label: 'Rathaus', category: 'civic' }
  ,{ x: 560, z: 600, label: 'Kirche', category: 'civic' }
  ,{ x: 880, z: 112, label: 'Universität', category: 'culture' }
,]

export const CITY_LABELS = [...ZONE_LABELS, ...BUILDING_LABELS]

// Category colors for label styling
export const CATEGORY_COLORS = {
  zone: '#4CAF50'    // green — outdoor zones
  ,gastro: '#FF9800'  // orange — restaurants, cafes, bars
  ,shop: '#2196F3'    // blue — shops, markets
  ,culture: '#9C27B0' // purple — libraries, bookshops
  ,civic: '#F44336',   // red — government, civic
}
