import {
  Color
  , Vector3
  , Euler
} from 'three'
// import _uniq from 'lodash/uniq'
import _compact from 'lodash/compact'

export default {
  props: {
    name: String
    , visible: {
      type: Boolean
      , default: true
    }
    , castShadow: {
      type: Boolean
      , default: false
    }
    , receiveShadow: {
      type: Boolean
      , default: false
    }
    , depthTest: {
      type: Boolean
      , default: true
    }
    , depthWrite: {
      type: Boolean
      , default: true
    }
  }
  // v3parent ersetzt $parent-Traversal ($children/$parent-Semantik ändert
  // sich in Vue 3, u.a. um <Transition> herum); jede Mixin-Komponente
  // stellt sich selbst als Parent bereit und führt ein Kind-Register.
  , inject: {
    threeVue: 'threeVue'
    , v3parent: { default: null }
  }
  , provide(){
    return { v3parent: this }
  }
  , created(){
    this.disposables = []
    this._teardown = []   // Aufräum-Callbacks, laufen in beforeDestroy
    this.v3children = []  // Mixin-Kinder (für fade.transition)
  }
  , mounted(){
    if ( !this.v3object ){
      throw new Error('Please set component v3object property')
    }

    const p = this.v3parent
    if ( p ){
      p.v3children.push( this )
      this._teardown.push(() => {
        const idx = p.v3children.indexOf( this )
        if ( idx > -1 ) p.v3children.splice( idx, 1 )
      })
    }

    const parent = (p && p.v3object) || (this.$parent && this.$parent.v3object)

    if ( !parent ){ return }

    parent.add( this.v3object )
    this._teardown.push(() => {
      parent.remove( this.v3object )
    })

    this.threeVue.events.emit('scene:changed', { type: 'add', component: this, object: this.v3object })
  }
  , beforeDestroy(){
    this.threeVue.events.emit('scene:changed', { type: 'remove', component: this, object: this.v3object })

    // set this to false to prevent autoclean
    if ( this.autoClean !== false ){
      this.registerDisposables([ this.v3object, this.v3object.geometry, this.v3object.material ])
    }

    this.disposables.forEach( thing => {
      thing.dispose()
    })

    this._teardown.forEach( fn => fn() )
    this._teardown = []
  }
  , render(h){
    if ( !this.v3object ){
      this.createObject()
    }
    this.updateObjects()
    let obj = this.v3object
    let material = obj.material
    obj.name = this.name
    obj.visible = this.visible
    obj.castShadow = this.castShadow
    obj.receiveShadow = this.receiveShadow
    if ( material ){
      material.depthTest = this.depthTest
      material.depthWrite = this.depthWrite
    }
    return h(
      'div'
      , this.visible ? this.$slots.default : []
    )
  }
  , methods: {

    updateObjects(){
      // abstract
    }

    , registerDisposables( thing, deep ){
      if ( !thing || this.disposables.indexOf(thing) > -1 ){ return this }
      if ( deep ){
        if ( thing.children ){
          this.registerDisposables(thing.children, deep)
        }
        if ( thing.material ){
          this.registerDisposables(thing.material, deep)
        }
        if ( thing.geometry ){
          this.registerDisposables(thing.material, deep)
        }
      }
      if ( thing.dispose ){
        this.disposables.push( thing )

        thing = _compact(thing)
        Array.prototype.push.apply( this.disposables, thing )

      } else if ( Array.isArray( thing ) ){

        for ( let th of thing ){
          this.registerDisposables( th, deep )
        }
      }

      // this.disposables = _uniq(this.disposables)
      return this
    }

    // add frame listner
    , beforeDraw( fn ){
      this.threeVue.events.on( 'beforeDraw', fn )

      this._teardown.push(() => {
        this.threeVue.events.off( 'beforeDraw', fn )
      })
    }

    , assignProps( dest, props ){
      if ( !dest ){ return }
      for ( let prop of Object.keys(props) ){
        if ( prop in dest ){
          let val = this[prop]
          let cur = dest[prop]

          if (
            cur instanceof Color ||
            cur instanceof Vector3 ||
            cur instanceof Euler
          ){
            if ( Array.isArray(val) ){
              cur.fromArray( val )
              this.$emit(`update:${prop}`, cur)
            } else if ( typeof val === 'object' ){
              cur.copy( val )
              this.$emit(`update:${prop}`, cur)
            } else {
              cur.set( val )
              this.$emit(`update:${prop}`, cur)
            }
          } else {
            dest[ prop ] = val
            this.$emit(`update:${prop}`, val)
          }
        }
      }
    }
  }
}
