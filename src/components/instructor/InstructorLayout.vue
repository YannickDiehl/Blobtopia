<template lang="pug">
.instructor-layout(:class="[modeClass, { 'cursor-hidden': cursorHidden }]")
  //- TopBar
  TopBar(
    :show-feed="showFeed"
    , @toggle-feed="showFeed = !showFeed"
    , @toggle-pause="toggleServerPause"
    , @toggle-command-palette="showCommandPalette = true"
    , @fire-event="fireEvent"
  )

  //- 3D World (always rendered)
  .world-container(:class="worldSizeClass")
    b-loading.loading-cover(:is-full-page="false", :active="isLoading")
    WorldViewer(
      ref="worldViewer"
      , :generation-index="genIndex"
      , :step-time="100"
      , :sight-indicators="false"
      , :energy-indicators="false"
      , :followBlobId="followBlob ? followBlobId : undefined"
      , @tap-blob="onTapBlob"
      , @tap-building="onTapBuilding"
      , @click.native="onWorldClick"
    )

    //- Follow indicator (visible when following a blob)
    transition(name="fade")
      .follow-indicator(v-if="followBlob && selectedBlob", @click="onCloseInteraction")
        b-icon(icon="crosshairs-gps", size="is-small")
        span {{ selectedBlob.name || selectedBlob.id.substring(0, 8) }}
        b-icon(icon="close", size="is-small")

    //- LiveMetrics overlay disabled
    //- LiveMetrics

    //- Spotlight overlay
    SpotlightOverlay(
      :active="spotlightActive"
      , :target="spotlightTarget"
      , @close="deactivateSpotlight"
    )

  //- Floating inspectors (left side)
  transition(name="fade")
    BlobInteraction(
      v-if="selectedBlob"
      , :blob="selectedBlob"
      , :timeline-mode="timelineMode"
      , @close="onCloseInteraction"
    )
  transition(name="fade")
    BuildingInspector(
      v-if="selectedBuilding"
      , :building="selectedBuilding"
      , :timeline-mode="timelineMode"
      , @close="selectedBuilding = null"
      , @select-blob="blob => onTapBlob({ blob })"
    )

  //- BlobFeed (slide-in from right)
  transition(name="slide-right")
    BlobFeed(v-if="showFeed", :tweets="tweets")

  //- Timeline Bar (bottom)
  TimelineBar(v-if="timelineMode")

  //- Command Palette
  CommandPalette(
    :visible="showCommandPalette"
    , @close="showCommandPalette = false"
    , @select-blob="onCommandSelectBlob"
    , @fly-to-district="flyToDistrict"
  )
</template>

<script>
import { mapGetters } from 'vuex'
import WorldViewer from '@/components/world-viewer'
import BlobInteraction from '@/components/blob-interaction'
import BuildingInspector from '@/components/building-inspector'
import BlobFeed from '@/components/blob-feed'
import TopBar from './TopBar'
// RightPanel removed — BlobFeed now standalone slide-in
import LiveMetrics from './LiveMetrics'
import SpotlightOverlay from './SpotlightOverlay'
import CommandPalette from './CommandPalette'
import TimelineBar from '@/components/timeline/TimelineBar'

export default {
  name: 'InstructorLayout'
  , components: {
    WorldViewer
    , BlobInteraction
    , BuildingInspector
    , BlobFeed
    , TopBar
    , LiveMetrics
    , SpotlightOverlay
    , CommandPalette
    , TimelineBar
  }
  , provide(){
    return {
      getTime(){ return 0 }
      , getStep(){ return 0 }
    }
  }
  , data: () => ({
    followBlob: false
    , followBlobId: 0
    , selectedBlob: null
    , selectedBuilding: null
    , showCommandPalette: false
    , showFeed: false
    , cursorHidden: false
    , cursorTimer: null
  })
  , computed: {
    modeClass(){
      return this.uiMode + '-mode'
    }
    , worldSizeClass(){
      return 'world-full'
    }
    , spotlightActive(){
      return this.$store.state.simulation.spotlightActive
    }
    , spotlightTarget(){
      const st = this.$store.state.simulation.spotlightTarget
      if (!st) return null
      if (st.type === 'blob') {
        const gen = this.getCurrentGeneration()
        if (gen) return gen.blobs.find(b => b.id === st.id) || null
      }
      return null
    }
    , genIndex(){
      return this.generationIndex
    }
    , generation(){
      return this.getCurrentGeneration()
    }
    , ...mapGetters('simulation', {
      uiMode: 'uiMode'
      , getCurrentGeneration: 'getCurrentGeneration'
      , generationIndex: 'currentGenerationIndex'
      , isLoading: 'isLoading'
      , isPaused: 'isPaused'
      , timelineMode: 'timelineMode'
      , tweets: 'tweets'
      , connectionStatus: 'connectionStatus'
    })
  }
  , watch: {
    uiMode(){
      // Resize 3D after CSS transition completes
      setTimeout(() => this.fixLayout(), 350)
    }
    , showFeed(){
      setTimeout(() => this.fixLayout(), 350)
    }
  }
  , mounted(){
    this._keyHandler = (e) => this.onGlobalKey(e)
    document.addEventListener('keydown', this._keyHandler)

    // Cursor hide in presentation mode
    this._mouseHandler = () => this.onMouseActivity()
    document.addEventListener('mousemove', this._mouseHandler)

    // Fetch timeline summary for sparklines
    this.$store.dispatch('simulation/fetchTimelineSummary')
  }
  , beforeDestroy(){
    document.removeEventListener('keydown', this._keyHandler)
    document.removeEventListener('mousemove', this._mouseHandler)
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
  }
  , methods: {
    // --- Mode & Panel ---
    togglePanel(){
      this.showFeed = !this.showFeed
    }

    // --- Server Controls ---
    , toggleServerPause(){
      if (this.isPaused) {
        this.$store.dispatch('simulation/resumeServer')
      } else {
        this.$store.dispatch('simulation/pauseServer')
      }
    }
    , fireEvent(type, params){
      const event = { type, ...params }
      this.$store.dispatch('simulation/triggerEvent', event)
    }

    // --- Blob/Building Selection ---
    , onWorldClick(){
      // If a tap-blob/tap-building event fired just before this click, ignore
      if (Date.now() - (this._lastTapTime || 0) < 100) return
      // Otherwise: empty click → deselect
      this.selectedBlob = null
      this.selectedBuilding = null
      this.followBlob = false
    }
    , onTapBlob({ blob }){
      this._lastTapTime = Date.now()
      this.followBlobId = blob.id
      this.followBlob = true
      this.selectedBlob = blob
      this.selectedBuilding = null
      // Spotlight
      if (this.spotlightActive) {
        this.$store.commit('simulation/setSpotlightTarget', { type: 'blob', id: blob.id })
      }
    }
    , onTapBuilding(buildingInfo){
      this._lastTapTime = Date.now()
      this.selectedBuilding = buildingInfo
      this.selectedBlob = null
    }
    , onCloseInteraction(){
      this.selectedBlob = null
      this.followBlob = false
      this.$store.dispatch('chat/closeChat')
    }
    , onCommandSelectBlob(blob){
      this.onTapBlob({ blob })
    }

    // --- Spotlight ---
    , deactivateSpotlight(){
      this.$store.commit('simulation/setSpotlightActive', false)
      this.$store.commit('simulation/setSpotlightTarget', null)
    }

    // --- Navigation ---
    , flyToDistrict(idx){
      // TODO: Camera fly-to district center
      console.log('[InstructorLayout] Fly to district', idx)
    }
    , jumpToEvent(tick){
      this.$store.dispatch('simulation/stopPlayback')
      this.$store.dispatch('simulation/seekTick', tick)
    }

    // --- Keyboard ---
    , onGlobalKey(e){
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return

      // Command Palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        this.showCommandPalette = !this.showCommandPalette
        return
      }

      // Escape
      if (e.key === 'Escape') {
        e.preventDefault()
        if (this.showCommandPalette) { this.showCommandPalette = false; return }
        if (this.spotlightActive) { this.deactivateSpotlight(); return }
        if (this.selectedBlob) { this.onCloseInteraction(); return }
        if (this.selectedBuilding) { this.selectedBuilding = null; return }
        return
      }

      // Panel toggle
      if (e.key === 't' || e.key === 'T') {
        this.togglePanel()
        return
      }

      // Timeline expand/collapse
      if (e.key === 'f' || e.key === 'F') {
        const current = this.$store.state.simulation.timelineExpanded
        this.$store.commit('simulation/setTimelineExpanded', !current)
        return
      }

      // Spotlight toggle
      if (e.key === 's' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const active = this.$store.state.simulation.spotlightActive
        if (active) {
          this.deactivateSpotlight()
        } else {
          this.$store.commit('simulation/setSpotlightActive', true)
        }
        return
      }

      // Data overlay cycle
      if (e.key === 'd' || e.key === 'D') {
        const overlays = ['off', 'satisfaction', 'ideology', 'trust', 'party']
        const current = this.$store.state.simulation.dataOverlay
        const idx = overlays.indexOf(current)
        const next = overlays[(idx + 1) % overlays.length]
        this.$store.commit('simulation/setDataOverlay', next)
        return
      }

      // Timeline navigation (existing shortcuts)
      if (this.timelineMode) {
        const delta = e.shiftKey ? 365 : e.altKey ? 30 : e.ctrlKey || e.metaKey ? 7 : 1
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          this.$store.dispatch('simulation/stopPlayback')
          this.$store.dispatch('simulation/stepTick', -delta)
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          this.$store.dispatch('simulation/stopPlayback')
          this.$store.dispatch('simulation/stepTick', delta)
          return
        }
        if (e.key === ' ') {
          e.preventDefault()
          if (this.isPaused) {
            this.$store.dispatch('simulation/startPlayback')
          } else {
            this.$store.dispatch('simulation/stopPlayback')
          }
          return
        }
        // Event navigation
        if (e.key === 'e') {
          e.preventDefault()
          this.$store.dispatch('simulation/stopPlayback')
          this.$store.dispatch('simulation/jumpToEvent', 1)
          return
        }
        if (e.key === 'E') {
          e.preventDefault()
          this.$store.dispatch('simulation/stopPlayback')
          this.$store.dispatch('simulation/jumpToEvent', -1)
          return
        }
      }

      // District spotlight in spotlight mode (4-8)
      if (this.spotlightActive) {
        const num = parseInt(e.key)
        if (num >= 4 && num <= 8) {
          const districtIdx = num - 4
          this.$store.commit('simulation/setSpotlightTarget', { type: 'district', id: districtIdx })
          return
        }
      }
    }

    // --- Cursor hide in presentation mode ---
    , onMouseActivity(){
      this.cursorHidden = false
      if (this.cursorTimer) clearTimeout(this.cursorTimer)
      if (this.uiMode === 'presentation') {
        this.cursorTimer = setTimeout(() => {
          this.cursorHidden = true
        }, 3000)
      }
    }

    , fixLayout(){
      let viewer = this.$refs.worldViewer
      if (viewer) viewer.onResize()
    }
  }
}
</script>

<style lang="sass" scoped>
.instructor-layout
  position: relative
  width: 100%
  height: 100%
  overflow: hidden
  background: $grey-darker

  &.cursor-hidden
    cursor: none

// World container sizes
.world-container
  position: absolute
  top: 44px
  left: 0
  bottom: 0
  transition: right 0.3s ease
  display: flex
  align-items: stretch
  overflow: hidden

  &.world-full
    right: 0
  &.world-with-panel
    right: 360px
  &.world-with-panel-wide
    right: 440px

  > *
    flex: 1

// Presentation mode overrides
.presentation-mode
  .world-container
    top: 44px
    right: 0 !important

.loading-cover
  z-index: 1

// Follow indicator
.follow-indicator
  position: absolute
  top: 56px
  right: 12px
  z-index: 4
  display: flex
  align-items: center
  gap: 0.3rem
  background: rgba(78, 204, 163, 0.15)
  border: 1px solid rgba(78, 204, 163, 0.4)
  border-radius: 16px
  padding: 4px 10px 4px 6px
  font-size: 0.75rem
  color: $primary
  cursor: pointer
  transition: all 0.15s
  &:hover
    background: rgba(78, 204, 163, 0.25)
    border-color: $primary
  .icon:last-child
    opacity: 0.5
    margin-left: 2px
    &:hover
      opacity: 1

.fade-enter-active, .fade-leave-active
  transition: opacity 0.2s ease
.fade-enter, .fade-leave-to
  opacity: 0

.slide-right-enter-active, .slide-right-leave-active
  transition: transform 0.3s ease
.slide-right-enter, .slide-right-leave-to
  transform: translateX(100%)
</style>
