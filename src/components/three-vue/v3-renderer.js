import { h } from 'vue'
import * as THREE from 'three'
import mitt from 'mitt'
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js'
// (Der alte FullScreenQuad-Memory-Leak-Monkeypatch aus der r111-Ära ist
// obsolet — modernes Pass.js hat ein korrektes dispose().)

// Die ganze Szene (Kenney-Tints, Vertex-Farben, chroma-Hexwerte) wurde im
// r111-Gamma-Workflow kalibriert. Das moderne sRGB-Farbmanagement (r152+)
// würde alle Farben umrechnen und den Look verschieben — daher aus.
THREE.ColorManagement.enabled = false

export default {
  name: 'v3-renderer'
  , props: {
    width: Number
    , height: Number
    , outlineColor: {
      type: Number
      , default: 0xFFFFFF
    }
    , outlineColorBehind: {
      type: Number
      , default: 0x666666
    }
		, clearColor: {
			type: Number
			, default: 0x000000
		}
		, clearAlpha: {
			type: Number
			, default: 0
		}
		, shadows: Boolean
  }
  , components: {
  }
  , data: () => ({
  })
  , provide(){
    const threeVue = this

    return { threeVue }
  }
  , created(){
    // Framework-freier Event-Bus für beforeDraw/scene:changed —
    // Komponenten-Instanz-$on/$emit gibt es in Vue 3 nicht mehr
    this.events = mitt()
    this._readyQueue = []

    this.afterReady(() => { this.isReady = true })

    this.renderer = new THREE.WebGLRenderer({
      alpha: true
      , antialias: true
      , logarithmicDepthBuffer: true
      // , canvas: this.$el
    })

		this.renderer.shadowMap.enabled = this.shadows
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.setPixelRatio( window.devicePixelRatio )
    // gammaOutput/gammaFactor sind entfernt — sRGB-Output explizit setzen
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.LinearToneMapping
    this.renderer.toneMappingExposure = 0.85

    this.cssRenderer = new CSS2DRenderer({})

    // https://threejs.org/examples/webgl_postprocessing_outline.html
    let composer = this.composer = new EffectComposer( this.renderer )
    let renderPass = this.renderPass = new RenderPass( null, null, null, new THREE.Color(this.clearColor), this.clearAlpha )
    composer.addPass( renderPass )

    let effectFXAA = this.effectFXAA = new ShaderPass( FXAAShader )
    let pixelRatio = this.renderer.getPixelRatio()
		effectFXAA.material.uniforms[ 'resolution' ].value.x = 1 / ( this.width * pixelRatio )
		effectFXAA.material.uniforms[ 'resolution' ].value.y = 1 / ( this.height * pixelRatio )
    composer.addPass( effectFXAA )

    // sRGB-Ausgabe + Tone-Mapping: passiert seit r155 nicht mehr implizit,
    // sondern explizit als letzter Pass (ersetzt das alte gammaOutput)
    this.outputPass = new OutputPass()
    composer.addPass( this.outputPass )

    this.$watch(() => this.width + ~this.height, () => {
      this.renderer.setSize( this.width, this.height )
      this.cssRenderer.setSize( this.width, this.height )
      this.composer.setSize( this.width, this.height )
      effectFXAA.material.uniforms[ 'resolution' ].value.x = 1 / ( this.width * pixelRatio )
      effectFXAA.material.uniforms[ 'resolution' ].value.y = 1 / ( this.height * pixelRatio )
      this.$emit('resize')
    }, { immediate: true })
  }
  , beforeUnmount(){
    this.renderer.dispose()
    this.effectFXAA.dispose()
    this.composer.dispose()
    if ( this.outlinePass ){
      this.outlinePass.dispose()
    }
  }
  , mounted(){
    // afterReady-Queue flushen (ersetzt $once('hook:mounted'))
    const queue = this._readyQueue
    this._readyQueue = null
    queue.forEach(fn => fn())

    // append renderers
    this.cssRenderer.domElement.style.position = 'absolute'
    this.cssRenderer.domElement.style.top = '0'
    this.cssRenderer.domElement.style.left = '0'
    this.cssRenderer.domElement.style.zIndex = '1'
    this.cssRenderer.domElement.style.userSelect = 'none'
    this.cssRenderer.domElement.style.lineHeight = 'normal'
    this.cssRenderer.domElement.className = 'no-events'
    this.$el.appendChild( this.renderer.domElement )
    this.$el.appendChild( this.cssRenderer.domElement )
  }
  , computed: {
  }
  , watch: {
    outlineColor(){
      this.outlinePass.visibleEdgeColor.set(this.outlineColor)
    }
    , outlineColorBehind(){
      this.outlinePass.hiddenEdgeColor.set(this.outlineColorBehind)
    }
		, shadows(){
			this.renderer.shadowMap.enabled = this.shadows
		}
		, clearColor(){
			this.renderPass.clearColor = new THREE.Color(this.clearColor)
		}
		, clearAlpha(){
			this.renderPass.clearAlpha = this.clearAlpha
		}
  }
  , methods: {
    draw(){
      if ( !this.scene ){
        this.draw = () => {}
        throw new Error('No scene added to the renderer')
      }

      if ( !this.camera ){
        this.draw = () => {}
        throw new Error('No camera added to the renderer')
      }

      this.events.emit('beforeDraw')

      this.initOutlinePass()

      this.renderPass.camera = this.camera
      this.renderPass.scene = this.scene
      // this.renderer.render( this.scene, this.camera )
      this.composer.render()
      this.cssRenderer.render( this.scene, this.camera )
    }
    , getObjectByName( name ){
      return this.scene.getObjectByName( name )
    }
    , afterReady( fn ){
      if ( this.isReady || !this._readyQueue ){
        fn()
        return this
      }

      this._readyQueue.push(fn)
    }
    , checkClear(){
      let idx = this.composer.passes.indexOf(this.renderPass)
      this.renderPass.clear = idx === 0
    }
    , insertRenderPass( pass, idx ){
      if ( this.composer.passes.indexOf( pass ) > -1 ){ return }
      if ( idx === undefined ){
        idx = this.composer.passes.length
      }

      this.composer.insertPass( pass, idx )
      this.checkClear()
    }
    , removeRenderPass( pass ){
      let idx = this.composer.passes.indexOf( pass )
      if ( idx < 0 ){ return }
      this.composer.passes.splice( idx, 1 )
    }
    , initOutlinePass(){
      if (
        !this.outlinePass ||
        this.outlinePass.renderCamera !== this.camera ||
        this.outlinePass.renderScene !== this.scene
      ){
        if ( this.outlinePass ){
          let idx = this.composer.passes.indexOf(this.outlinePass)
          this.composer.passes.splice( idx, 1 )
          this.outlinePass.dispose()
        }
        const dims = new THREE.Vector2( this.width, this.height )
        let outlinePass = this.outlinePass = new OutlinePass( dims, this.scene, this.camera )

        outlinePass.edgeStrength = 3
        outlinePass.edgeThickness = 1
        // outlinePass.pulsePeriod = 2
        outlinePass.overlayMaterial.blending = THREE.NormalBlending
        // outlinePass.overlayMaterial.blendEquation = THREE.ReverseSubtractEquation
        // outlinePass.overlayMaterial.blendSrc = THREE.SrcColorFactor
        // outlinePass.overlayMaterial.blendDst = THREE.DstAlphaFactor
        outlinePass.visibleEdgeColor.set(this.outlineColor)
        outlinePass.hiddenEdgeColor.set(this.outlineColorBehind)

        // vor dem OutputPass einfügen — die sRGB-Ausgabe muss zuletzt laufen
        this.composer.insertPass( outlinePass, this.composer.passes.indexOf(this.outputPass) )
      }
    }
    , addOutline( v3object ){
      let idx = this.outlinePass.selectedObjects.indexOf( v3object )
      if ( idx > -1 ) return
      this.outlinePass.selectedObjects.push( v3object )
    }
    , removeOutline( v3object ){
      if ( v3object === undefined ){
        // remove all
        this.outlinePass.selectedObjects = []
      }
      let idx = this.outlinePass.selectedObjects.indexOf( v3object )
      if ( idx < 0 ) return
      this.outlinePass.selectedObjects.splice( idx, 1 )
    }
  }
  , render(){
    return h('div'
      , {
        style: {
          position: 'relative'
          , overflow: 'hidden'
          , lineHeight: 0
        }
      }
      , this.$slots.default ? this.$slots.default() : []
    )
  }
}
