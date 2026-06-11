<template lang="pug">
.world-viewer
  v3-renderer(
    ref="renderer"
    , :width="viewWidth"
    , :height="viewHeight"
    , :shadows="false"
    , :clear-color="0x2c3e50"
    , :clear-alpha="1"
  )
    Gestures(
      :names="interactiveObjects"
      , @tap="tapBlob"
      , @hover="onHover"
    )
    v3-scene
      //- v3-camera(
      //-   ref="camera"
      //-   , type="orthographic"
      //-   , :left="-viewWidth/2"
      //-   , :right="viewWidth/2"
      //-   , :top="viewHeight/2"
      //-   , :bottom="-viewHeight/2"
      //-   , :zoom="2"
      //-   , :near="0.01"
      //-   , :far="5000"
      //-   , :position="orthCameraPos"
      //-   , :look-at="origin"
      //- )

      //- v3-grid(
      //-   :size="gridSize - 10"
      //-   , :position="[0, 0.01, 0]",
      //-   , :divisions="50"
      //-   , :color1="0x999999"
      //-   , :color2="0x999999"
      //- )
      v3-camera(
        ref="camera"
        , :position="persCameraPos"
        , prevent-update
        , :far="12000"
        , :near="10"
        , :aspect="viewWidth / viewHeight"
      )
        v3-dom(ref="tour", :position="tourPosition")
          Tour
      //- Intensitäten ×π: three hat den Legacy-Lighting-Modus entfernt
      //- (physikalisch korrekte Lichter) — alte Werte: 0.5 / 0.35 / 0.15
      v3-light(type="ambient", :intensity="1.571")
      v3-light(
        type="directional"
        , :intensity="1.1"
        , :color="0xfff8e8"
        , :position="[300, 500, 200]"
        , :cast-shadow="false"
      )
      v3-light(
        type="directional"
        , :intensity="0.471"
        , :color="0xe8f0ff"
        , :position="[-200, 300, -100]"
        , :cast-shadow="false"
      )
      //- v3-fog(:near="1000", :far="3000", :color="0xc9d7e6")

      //- Board removed — background clearColor 0x2c3e50 serves as backdrop

      v3-group(v-if="showWorld", :position="[-gridSize * 0.5, 0, -gridSize * 0.5]")
        BlobCreature(
          :ref="collectBlobRef"
            , v-for="(g, index) in generation.blobs"
            , :key="index"
            , :creature="g"
            , :size="3"
            , v-bind="blobIndicators"
            , :color="getBlobColor(g.species)"
          )
          //- Status overlay only for selected/followed blob (emotion data stays in backend for inspector)
          v3-group(v-if="g.id === followBlobId")
            v3-dom(:position="[0, 13 * (g.size[0]/10 + 0.5), 0]")
              BlobStatus(:blob="g")
            v3-group(:position="[-100, 50, 0]", ref="cameraGoal")
            v3-group(:position="[0, 30, 0]", ref="cameraFocusGoal")
</template>

<script>
import { markRaw } from 'vue'
import Copilot from '@/lib/copilot-stub'
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import chroma from 'chroma-js'
import sougy from '@/config/sougy-colors'
import * as THREE from 'three'
import _throttle from 'lodash/throttle'
import _findIndex from 'lodash/findIndex'
import v3Renderer from '@/components/three-vue/v3-renderer'
import fadeTransition from '@/components/three-vue/fade.transition'
import Gestures from '@/components/three-vue/gestures'
import v3Scene from '@/components/three-vue/v3-scene'
import v3Camera from '@/components/three-vue/v3-camera'
import v3Light from '@/components/three-vue/v3-light'
import v3Group from '@/components/three-vue/v3-group'
import v3Dom from '@/components/three-vue/v3-dom'
import v3Grid from '@/components/three-vue/v3-grid'
import v3Plane from '@/components/three-vue/v3-plane'
import v3Box from '@/components/three-vue/v3-box'
import v3Fog from '@/components/three-vue/v3-fog'
import BlobCreature from '@/blobs'
import BlobStatus from '@/components/3d-objects/blob-status'
import { blobColors } from '@/config/blob-colors'
import { createCityFromLayout } from '@/city'
import { GRID_SIZE } from '@/config/world'
import Tour from '@/components/tour'

const defaultBlobColor = chroma(sougy.blue).desaturate(0.5).num()


const components = {
  v3Renderer
  , fadeTransition
  , Gestures
  , v3Scene
  , v3Camera
  , v3Light
  , v3Group
  , v3Dom
  , v3Grid
  , v3Plane
  , v3Box
  , v3Fog

  , BlobCreature
  , BlobStatus
  , Tour
}

const computed = {
  steps(){
    return this.generation.steps
  }
  , generation(){
    return this.getCurrentGeneration()
  }
  , blobIndicators(){
    return {
      showSightIndicator: this.sightIndicators
      , showEnergyIndicator: this.energyIndicators
    }
  }
  , tourStepNumber(){
    return this.$route.query.intro | 0
  }
  , showWorld(){
    return this.generation && !this.hideStage
  }
  , ...mapState(useSimulationStore, {
    'getCurrentGeneration': 'getCurrentGeneration'
    , 'statistics': 'statistics'
  })
}

const watch = {
  followBlobId(){
    this.checkFollowBlob()
  }
}

const tmpV = new THREE.Vector3()
const methods = {
  debug(){
    // The X axis is red. The Y axis is green. The Z axis is blue.
    var axesHelper = new THREE.AxesHelper( 5 )
    this.scene.add( axesHelper )
  }
  , getBlobColor(species){
    return blobColors[species] || defaultBlobColor
  }
  , collectBlobRef(el){
    if (el) this._blobRefs.push(el)
  }
  , initCamera(){
    const renderer = this.$refs.renderer.renderer
    const camera = this.camera = this.$refs.camera.v3object
    // controls — gleiche Kameraführung wie im Stadt-Editor
    let controls = this.controls = new OrbitControls( camera, renderer.domElement )
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.rotateSpeed = 0.2
    controls.zoomSpeed = 1.0
    controls.panSpeed = 1.5
    controls.enableZoom = true
    controls.enablePan = true
    controls.minDistance = 50
    controls.maxDistance = 1200
    controls.maxPolarAngle = Math.PI * 0.40 // nicht unter den Boden
    controls.minPolarAngle = 0.15 // nicht ganz flach
    controls.screenSpacePanning = false // Pan entlang der Bodenfläche
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN       // Linksklick + Ziehen = Kamera gleiten
      , MIDDLE: THREE.MOUSE.DOLLY // Mausrad-Klick = Zoom
      , RIGHT: THREE.MOUSE.ROTATE // Rechtsklick + Ziehen = Kamera drehen
    }
    // Linksklick: Drag = Pan, kurzer Klick = Blob-Auswahl (Gestures tap)
    controls.target.set(0, 0, 0) // Stadtzentrum (verschoben um -gridSize/2)

    // WASD / Pfeiltasten zum Gleiten
    this._keys = {}
    this._onKeyDown = (e) => { this._keys[e.key.toLowerCase()] = true }
    this._onKeyUp = (e) => { this._keys[e.key.toLowerCase()] = false }
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)

    controls.addEventListener('start', () => {
      this.cameraDragging = true
    })

    controls.addEventListener('end', () => {
      this.cameraDragging = false
    })
  }
  , draw(){
    // Blob-Kameraführung nur wenn aktiv ein Blob verfolgt wird
    if (this.followBlobId !== undefined) {
      this.followBlobCamera()
      if ( this.transitionCamera && !this.cameraDragging ){
        this.camera.position.lerp(this.cameraGoal, 0.05)
      }
      this.controls.target.copy(this.cameraFocusGoal)
    }

    // WASD / Pfeiltasten: Kamera über die Karte gleiten
    if (this._keys) {
      var dist = this.camera.position.distanceTo(this.controls.target)
      var panSpeed = Math.max(4, dist * 0.008)
      var forward = new THREE.Vector3()
      this.camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      var right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
      var dir = new THREE.Vector3()
      if (this._keys['w'] || this._keys['arrowup']) dir.add(forward)
      if (this._keys['s'] || this._keys['arrowdown']) dir.sub(forward)
      if (this._keys['a'] || this._keys['arrowleft']) dir.sub(right)
      if (this._keys['d'] || this._keys['arrowright']) dir.add(right)
      if (dir.lengthSq() > 0) {
        dir.normalize().multiplyScalar(panSpeed)
        this.camera.position.add(dir)
        this.controls.target.add(dir)
      }
    }

    this.controls.update()
    // Update camera distance for label visibility
    this.cameraDistance = this.camera.position.distanceTo(this.controls.target)
    this.$refs.renderer.draw()
  }
  , followBlobCamera(){
    // Vue 3: Ref unter v-if im v-for ist eine Einzel-Instanz (kein Array mehr)
    let goal = this.$refs.cameraGoal
    let focusGoal = this.$refs.cameraFocusGoal && this.$refs.cameraFocusGoal[0]
    if (!goal){ return }
    this.cameraGoal.setFromMatrixPosition(goal.v3object.matrixWorld)
    tmpV.setFromMatrixPosition(focusGoal.v3object.matrixWorld)
    this.cameraFocusGoal.lerp(tmpV, 0.05)
  }
  , checkFollowBlob(){
    clearTimeout(this.followTO)
    let active = this.followBlobId !== undefined
    // this.controls.enabled = !active
    if (!active){
      this.cameraGoal.fromArray(this.persCameraPos)
      this.cameraFocusGoal.copy(this.scene.position)
      this.followTO = setTimeout(() => {
        this.transitionCamera = false
      }, 1500)
    } else {
      this.transitionCamera = true
    }
  }
  , onResize(){
    let el = this.$el
    this.viewWidth = el.offsetWidth
    this.viewHeight = el.offsetHeight
  }
  , toViewCoords(x = 0, y = 0){
    let hw = 0.5 * this.gridSize
    return [x - hw, 0, y - hw]
  }
  , tapBlob({ intersects, ray }){
    // 1) Prüfe ob ein Blob direkt getroffen wurde
    let blobHit = intersects.find(i => i.object.name === 'blob')
    if (blobHit) {
      let blob = blobHit.object
      let index = _findIndex(this._blobRefs, g => g.v3object === blob.parent.parent)
      if (index >= 0 && this.generation && this.generation.blobs[index]) {
        this.$emit('tap-blob', { blob: this.generation.blobs[index], index })
        return
      }
    }

    // 2) Gebäude-Auswahl: Prüfe ob ein Building direkt getroffen wurde
    let buildingHit = intersects.find(i => i.object.userData && i.object.userData.buildingInfo)

    // 3) Proximity-Suche: Blobs sind zu klein für exaktes Raycasting,
    //    daher den nächsten Blob per Ray-Distanz finden
    if (ray && this._blobRefs && this.generation) {
      let closestIndex = -1
      let closestScreenDist = Infinity
      const tmpPos = new THREE.Vector3()
      const tmpDiff = new THREE.Vector3()
      const rayDir = ray.direction.clone().normalize()

      this._blobRefs.forEach((blobComp, index) => {
        if (!blobComp.v3object || !blobComp.v3object.visible) return
        blobComp.v3object.getWorldPosition(tmpPos)
        // Distanz vom Ray zum Blob-Zentrum
        tmpDiff.subVectors(tmpPos, ray.origin)
        let t = tmpDiff.dot(rayDir)
        if (t < 0) return // hinter der Kamera
        let projPoint = ray.origin.clone().add(rayDir.clone().multiplyScalar(t))
        let dist = tmpPos.distanceTo(projPoint)
        // Winkel-normalisiert: dist/t gibt die "angulare" Abweichung
        let angularDist = dist / t
        if (angularDist < closestScreenDist) {
          closestScreenDist = angularDist
          closestIndex = index
        }
      })

      // Blob nur auswählen wenn er eng genug am Klick ist (0.015 rad ≈ ~10px)
      // und näher an der Kamera als ein getroffenes Gebäude
      if (closestIndex >= 0 && closestScreenDist < 0.015 && this.generation.blobs[closestIndex]) {
        this.$emit('tap-blob', { blob: this.generation.blobs[closestIndex], index: closestIndex })
        return
      }
    }

    // 4) Building-Hit emittieren (falls Blob-Proximity nicht gegriffen hat)
    if (buildingHit) {
      this.$emit('tap-building', buildingHit.object.userData.buildingInfo)
    }
  }
  , onHover: _throttle(function({ intersects }){
    let renderer = this.renderer
    renderer.removeOutline()
    if (intersects.length){
      let blob = intersects[0].object
      let index = _findIndex(this._blobRefs, g => g.v3object === blob.parent.parent)
      if (index < 0 || !this.generation || !this.generation.blobs[index]) return
      let id = this.generation.blobs[index].id

      renderer.addOutline( blob )
      this.$emit('blob-hover', { index, id, blob: blob })
    }
  }, 100)
  , initTour(){
    let frames = Copilot({
      cameraPosition: {
        type: 'Vector3'
        , default: new THREE.Vector3(0, 4000, 300)
        , easing: Copilot.Easing.Quadratic.InOut
      }
      , cameraRotation: {
        type: 'Vector3'
        , default: new THREE.Vector3(0, 0, 0)
      }
      , hideStage: false
      , tourPosition: [0, 0, -100]
    })

    frames.add({}, {
      id: 'step-1'
      , time: 0
    })

    // frames.add({ hideStage: false }, { time: 1, duration: 1 })

    frames.add({
      tourPosition: [0, 25, -100]
    }, {
      time: '1s'
      , duration: '1s'
      , easing: Copilot.Easing.Quadratic.InOut
    })

    // step 1
    frames.add({
      cameraPosition: new THREE.Vector3().fromArray(this.persCameraPos)
    }, {
      id: 'step-2'
      , time: '5s'
      , duration: '5s'
    })

    frames.add({
      tourPosition: [0, 0, -100]
    }, {
      id: 'step-6'
      , time: '6s'
      , duration: '1s'
      , easing: Copilot.Easing.Quadratic.InOut
    })

    this.tourActive = false
    let player = Copilot.Player({ manager: frames })

    frames.on('update', () => {
      if (!this.tourActive){return}
      let state = frames.state

      if (!this.transitionCamera){
        this.camera.position.copy(state.cameraPosition)
      }
      this.hideStage = state.hideStage
      this.tourPosition = state.tourPosition
    })

    this.$watch('tourStepNumber', (n) => {
      if (!n){
        player.seek(player.totalTime)
        this.tourActive = false
        this.controls.enabled = true
        return
      }

      this.tourActive = true
      this.controls.enabled = false

      let f = frames.getFrame('step-' + n)
      while (!f && n > 0){
        n--
        f = frames.getFrame('step-' + n)
      }

      player.playTo(f.meta.time)
    }, { immediate: true })

    this._teardown.push(() => {
      player.destroy()
      frames.off(true)
    })
  }
}

export default {
  name: 'WorldViewer'
  , props: {
    generationIndex: {
      type: Number
      , default: 0
    }
    , stepTime: Number
    , sightIndicators: Boolean
    , energyIndicators: Boolean
    , followBlobId: String
  }
  , inject: [ 'getTime' ]
  , data: () => ({
    viewWidth: 500
    , viewHeight: 500
    , gridSize: GRID_SIZE
    , origin: [0, 0, 0]
    , persCameraPos: [0, 500, 400]
    , orthCameraPos: [100, 50, 100]
    , shadowCamera: {
      near: 100
      , far: 380
      , left: -280
      , right: 280
      , top: 280
      , bottom: -280
    }
    // markRaw: THREE-Objekte dürfen nicht in Vue-3-Proxies gewickelt werden
    , cameraGoal: markRaw(new THREE.Vector3())
    , cameraFocusGoal: markRaw(new THREE.Vector3())
    , interactiveObjects: ['blob', 'building']
    , highlightColor: chroma(sougy.red).num()
    , hideStage: false
    , tourPosition: [0, 0, -100]
    , cameraDistance: 500
  })
  , components
  , computed
  , watch
  , methods
  , created(){
    this._teardown = []
    this._blobRefs = []
  }
  , beforeUpdate(){
    // Function-Ref-Register pro Render leeren (Vue 3 sammelt v-for-Refs
    // nicht mehr automatisch zu Arrays)
    this._blobRefs.length = 0
  }
  , beforeUnmount(){
    this._teardown.forEach( fn => fn() )
    this._teardown = []
  }
  , async mounted(){
    this.renderer = this.$refs.renderer
    this.scene = this.renderer.scene

    // Use layout from JSON — procedural fallback disabled for compact city
    const cityGroup = await createCityFromLayout()
    if (!cityGroup) { console.error('[city] No city layout found!'); return }
    cityGroup.position.set(-this.gridSize * 0.5, 0, -this.gridSize * 0.5)
    this.scene.add(cityGroup)
    // Notify Gestures that the scene changed so building meshes are raycasted
    this.renderer.events.emit('scene:changed', { type: 'add', object: cityGroup })
    this._teardown.push(() => {
      this.scene.remove(cityGroup)
      this.renderer.events.emit('scene:changed', { type: 'remove', object: cityGroup })
    })

    this.$onResize(() => this.onResize())
    this.onResize()
    this.initCamera()
    // this.debug()
    this.checkFollowBlob()
    this.initTour()

    // Initialize drawing
    let stop = false
    const clock = new THREE.Clock()
    const draw = () => {
      if ( stop ) { return }
      requestAnimationFrame( draw )
      this.draw( clock.getDelta() * 1000 )
    }
    this._teardown.push(() => {
      stop = true
      // WASD-Listener aufräumen
      if (this._onKeyDown) {
        window.removeEventListener('keydown', this._onKeyDown)
        window.removeEventListener('keyup', this._onKeyUp)
      }
    })
    draw()
  }
}
</script>

<style lang="sass" scoped>
.world-viewer
  max-width: 100vw
  background: $grey-darker
</style>

