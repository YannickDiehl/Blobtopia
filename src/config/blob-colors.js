import chroma from 'chroma-js'
import sougy from '@/config/sougy-colors'
import districtsData from '../../data/districts.json'

export const blobColors = {
  'default': chroma(sougy.blue).desaturate(0.5).num()
  , 'orange': chroma(sougy.orange).num()
  , 'pink': chroma(sougy.pink).num()
}

// Generate district colors from shared JSON
for (const d of districtsData) {
  blobColors['district_' + d.id] = parseInt(d.color_3d, 16)
}
