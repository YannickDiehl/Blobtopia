import _throttle from 'lodash/throttle'
import _pull from 'lodash/pull'

/**
 * $onResize(fn): throttled window-resize callback, automatisch an den
 * Komponenten-Lebenszyklus gebunden. Als globales Mixin implementiert —
 * die frühere Variante über $on('hook:beforeDestroy') existiert in Vue 3
 * nicht mehr; echte Lifecycle-Hooks funktionieren auf beiden Versionen.
 */
export default {
  install( Vue ){
    const listeners = []

    window.addEventListener('resize', () => {
      for (let i = 0, l = listeners.length; i < l; i++){
        listeners[i]()
      }
    })

    Vue.mixin({
      activated(){
        if ( !this._resizeCbs ) return
        for ( const cb of this._resizeCbs ){
          _pull(listeners, cb)
          listeners.push(cb)
          cb()
        }
      }
      , deactivated(){
        if ( !this._resizeCbs ) return
        for ( const cb of this._resizeCbs ){ _pull(listeners, cb) }
      }
      , beforeDestroy(){
        if ( !this._resizeCbs ) return
        for ( const cb of this._resizeCbs ){ _pull(listeners, cb) }
        this._resizeCbs = null
      }
    })

    Vue.prototype.$onResize = function( fn, throttleTime = 50 ){
      const cb = _throttle(fn, throttleTime)
      if ( !this._resizeCbs ){ this._resizeCbs = [] }
      this._resizeCbs.push(cb)
      listeners.push(cb)
    }
  }
}
