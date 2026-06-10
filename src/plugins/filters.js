// Thin Vue-2 adapter: registers the plain functions from src/lib/format.js
// as global template filters. Goes away with Vue 3 (filters were removed);
// call sites then import from '@/lib/format' directly.
import * as format from '@/lib/format'

export default {
  install( Vue ){
    for ( const [name, fn] of Object.entries(format) ){
      Vue.filter(name, fn)
    }
  }
}
