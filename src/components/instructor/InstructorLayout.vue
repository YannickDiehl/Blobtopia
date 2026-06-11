<template lang="pug">
.instructor-layout(:class="[modeClass, { 'cursor-hidden': cursorHidden }]")
  //- TopBar
  TopBar(
    :show-feed="showFeed"
    , :show-newspaper="showNewspaper"
    , :show-survey="surveyOpen"
    , @toggle-feed="showFeed = !showFeed"
    , @toggle-newspaper="showNewspaper = !showNewspaper"
    , @toggle-survey="toggleSurvey"
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
      , @click="onWorldClick"
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

  //- Befragungsinstitut (survey institute) window
  transition(name="fade")
    SurveyWindow(
      v-if="surveyOpen"
      , :timeline-mode="timelineMode"
      , @close="surveyStore.CLOSE_SURVEY()"
    )

  //- BlobFeed (slide-in from right)
  transition(name="slide-right")
    BlobFeed(v-if="showFeed", :tweets="tweets")

  //- Newspaper Overlay
  transition(name="fade")
    NewspaperOverlay(
      v-if="showNewspaper"
      , :issues="newspapers"
      , @close="showNewspaper = false"
      , @select-blob="onNewspaperSelectBlob"
    )

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
import { mapState, mapStores } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { useChatStore } from '@/stores/chat'
import { useSurveyStore } from '@/stores/survey'
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
import NewspaperOverlay from './NewspaperOverlay'
import SurveyWindow from '@/components/survey-window'

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
    , NewspaperOverlay
    , SurveyWindow
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
    , showNewspaper: false
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
      return this.simulationStore.spotlightActive
    }
    , spotlightTarget(){
      const st = this.simulationStore.spotlightTarget
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
    , ...mapState(useSimulationStore, {
      uiMode: 'uiMode'
      , getCurrentGeneration: 'getCurrentGeneration'
      , generationIndex: 'currentGenerationIndex'
      , isLoading: 'isLoading'
      , isPaused: 'isPaused'
      , timelineMode: 'timelineMode'
      , tweets: 'tweets'
      , newspapers: 'newspapers'
      , connectionStatus: 'connectionStatus'
    })
    , ...mapStores(useSimulationStore, useChatStore, useSurveyStore)
    , surveyOpen(){
      return this.surveyStore.isOpen
    }
  }
  , watch: {
    generation(newGen) {
      if (this.selectedBlob && newGen && newGen.blobs) {
        const updated = newGen.blobs.find(b => b.id === this.selectedBlob.id)
        if (updated) this.selectedBlob = updated
      }
    }
    , uiMode(){
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
    this.simulationStore.fetchTimelineSummary()
  }
  , beforeUnmount(){
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
        this.simulationStore.resumeServer()
      } else {
        this.simulationStore.pauseServer()
      }
    }
    , fireEvent(type, params){
      const event = { type, ...params }
      this.simulationStore.triggerEvent(event)
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
        this.simulationStore.setSpotlightTarget({ type: 'blob', id: blob.id })
      }
    }
    , onNewspaperSelectBlob(blobId) {
      this.showNewspaper = false
      const gen = this.getCurrentGeneration()
      if (gen) {
        const blob = gen.blobs.find(b => b.id === blobId)
        if (blob) this.onTapBlob({ blob })
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
      this.chatStore.closeChat()
    }
    , onCommandSelectBlob(blob){
      this.onTapBlob({ blob })
    }
    , toggleSurvey(){
      if (this.surveyStore.isOpen) {
        this.surveyStore.CLOSE_SURVEY()
      } else {
        this.surveyStore.OPEN_SURVEY()
      }
    }

    // --- Spotlight ---
    , deactivateSpotlight(){
      this.simulationStore.setSpotlightActive(false)
      this.simulationStore.setSpotlightTarget(null)
    }

    // --- Navigation ---
    , flyToDistrict(idx){
      // TODO: Camera fly-to district center
      console.log('[InstructorLayout] Fly to district', idx)
    }
    , jumpToEvent(tick){
      this.simulationStore.stopPlayback()
      this.simulationStore.seekTick(tick)
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
        if (this.surveyOpen) { this.surveyStore.CLOSE_SURVEY(); return }
        if (this.showNewspaper) { this.showNewspaper = false; return }
        if (this.showCommandPalette) { this.showCommandPalette = false; return }
        if (this.spotlightActive) { this.deactivateSpotlight(); return }
        if (this.selectedBlob) { this.onCloseInteraction(); return }
        if (this.selectedBuilding) { this.selectedBuilding = null; return }
        return
      }

      // Newspaper toggle
      if (e.key === 'n' || e.key === 'N') {
        this.showNewspaper = !this.showNewspaper
        return
      }

      // Befragungsinstitut toggle
      if (e.key === 'b' || e.key === 'B') {
        this.toggleSurvey()
        return
      }

      // Panel toggle
      if (e.key === 't' || e.key === 'T') {
        this.togglePanel()
        return
      }

      // Timeline expand/collapse
      if (e.key === 'f' || e.key === 'F') {
        const current = this.simulationStore.timelineExpanded
        this.simulationStore.setTimelineExpanded(!current)
        return
      }

      // Spotlight toggle
      if (e.key === 's' && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
        const active = this.simulationStore.spotlightActive
        if (active) {
          this.deactivateSpotlight()
        } else {
          this.simulationStore.setSpotlightActive(true)
        }
        return
      }

      // Data overlay cycle
      if (e.key === 'd' || e.key === 'D') {
        const overlays = ['off', 'satisfaction', 'ideology', 'trust', 'party']
        const current = this.simulationStore.dataOverlay
        const idx = overlays.indexOf(current)
        const next = overlays[(idx + 1) % overlays.length]
        this.simulationStore.setDataOverlay(next)
        return
      }

      // Timeline navigation (existing shortcuts)
      if (this.timelineMode) {
        const delta = e.shiftKey ? 365 : e.altKey ? 30 : e.ctrlKey || e.metaKey ? 7 : 1
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          this.simulationStore.stopPlayback()
          this.simulationStore.stepTick(-delta)
          return
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault()
          this.simulationStore.stopPlayback()
          this.simulationStore.stepTick(delta)
          return
        }
        if (e.key === ' ') {
          e.preventDefault()
          if (this.isPaused) {
            this.simulationStore.startPlayback()
          } else {
            this.simulationStore.stopPlayback()
          }
          return
        }
        // Event navigation
        if (e.key === 'e') {
          e.preventDefault()
          this.simulationStore.stopPlayback()
          this.simulationStore.jumpToEvent(1)
          return
        }
        if (e.key === 'E') {
          e.preventDefault()
          this.simulationStore.stopPlayback()
          this.simulationStore.jumpToEvent(-1)
          return
        }
      }

      // District spotlight in spotlight mode (4-8)
      if (this.spotlightActive) {
        const num = parseInt(e.key)
        if (num >= 4 && num <= 8) {
          const districtIdx = num - 4
          this.simulationStore.setSpotlightTarget({ type: 'district', id: districtIdx })
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
.fade-enter, .fade-enter-from, .fade-leave-to
  opacity: 0

.slide-right-enter-active, .slide-right-leave-active
  transition: transform 0.3s ease
.slide-right-enter, .slide-right-enter-from, .slide-right-leave-to
  transform: translateX(100%)
</style>
