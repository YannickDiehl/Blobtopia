import _throttle from 'lodash/throttle'
import _pull from 'lodash/pull'

/**
 * $onResize(fn): throttled window-resize callback, automatisch an den
 * Komponenten-Lebenszyklus gebunden (globales Mixin mit echten Hooks).
 */
export default {
  install( app ){
    const listeners = []

    window.addEventListener('resize', () => {
      for (let i = 0, l = listeners.length; i < l; i++){
        listeners[i]()
      }
    })

    app.mixin({
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
      , beforeUnmount(){
        if ( !this._resizeCbs ) return
        for ( const cb of this._resizeCbs ){ _pull(listeners, cb) }
        this._resizeCbs = null
      }
    })

    app.config.globalProperties.$onResize = function( fn, throttleTime = 50 ){
      const cb = _throttle(fn, throttleTime)
      if ( !this._resizeCbs ){ this._resizeCbs = [] }
      this._resizeCbs.push(cb)
      listeners.push(cb)
    }
  }
}
