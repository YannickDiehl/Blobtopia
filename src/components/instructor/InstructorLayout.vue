<template lang="pug">
.instructor-layout(:class="[modeClass, { 'cursor-hidden': cursorHidden }]")
  //- Akten-Leiste (Reiter Stadt/Schreibtisch + Werkzeuge + Datums-Stempel)
  TopBar(
    :show-feed="showFeed"
    , @toggle-feed="showFeed = !showFeed"
    , @set-room="onSetRoom"
    , @open-desk="openDeskSection"
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

  //- Schreibtisch (Auswertungsraum) — legt sich über die Welt,
  //- die Welt bleibt gemountet (Three.js-Kontext)
  transition(name="fade")
    DeskRoom(
      v-if="onDesk"
      , :desk-section="deskSection"
      , @select-section="openDeskSection"
    )

  //- Feld-Artefakte (nur in der Stadt)
  transition(name="fade")
    BlobInteraction(
      v-if="selectedBlob && !onDesk"
      , :blob="selectedBlob"
      , :timeline-mode="timelineMode"
      , @close="onCloseInteraction"
    )
  transition(name="fade")
    BuildingInspector(
      v-if="selectedBuilding && !onDesk"
      , :building="selectedBuilding"
      , :timeline-mode="timelineMode"
      , @close="selectedBuilding = null"
      , @select-blob="blob => onTapBlob({ blob })"
    )

  //- Studienmappe (Befragungsinstitut) — liegt auf dem Schreibtisch;
  //- die Dozentenzimmer-Mappe öffnet dieselbe Mappe auf dem Wahrheit-Blatt
  transition(name="fade")
    SurveyWindow(
      v-if="onDesk && (deskSection === 'studien' || deskSection === 'dozent') && surveyOpen"
      , :timeline-mode="timelineMode"
      , @close="closeDeskToStadt"
    )

  //- BlobPhone (BlobFeed — das Twitter der Blobs, Stadt-Artefakt).
  //- Entfaltet sich aus dem Dock unten rechts (dort, wo das Mini-Phone liegt),
  //- damit Wegstecken/Hervorholen wie ein zusammenhängender Griff wirkt.
  transition(name="phone-dock")
    BlobFeed(v-if="showFeed && !onDesk", :tweets="tweets", @close="showFeed = false")

  //- Mini-BlobPhone: liegt gesperrt im selben Eck, solange der Feed zu ist
  transition(name="phone-dock-mini")
    button.miniphone(
      v-if="!showFeed && !onDesk && tweets && tweets.length"
      , @click="showFeed = true"
      , title="BlobFeed öffnen (T)"
    )
      .mscreen
        .mzeit {{ phoneClock }}
        .mkarte
          .mk1
            i.mlogo
            | BlobFeed
          .mk2 {{ tweets.length }} {{ tweets.length === 1 ? 'neuer Blub' : 'neue Blubs' }}
      .mhome

  //- Presse-Mappe (Zeitungen) — liegt auf dem Schreibtisch
  transition(name="fade")
    NewspaperOverlay(
      v-if="onDesk && deskSection === 'presse'"
      , :issues="newspapers"
      , @close="closeDeskToStadt"
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
import DeskRoom from '@/components/desk/DeskRoom'
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
    , DeskRoom
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
      , room: 'room'
      , deskSection: 'deskSection'
    })
    , ...mapStores(useSimulationStore, useChatStore, useSurveyStore)
    , surveyOpen(){
      return this.surveyStore.isOpen
    }
    , onDesk(){
      return this.room === 'schreibtisch'
    }
    , phoneClock(){
      const h = this.simulationStore.hour || 0
      return String(h).padStart(2, '0') + ':00'
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
    // Kein fixLayout() beim Feed-Toggle: der Feed ist ein Overlay (fixed),
    // die Welt bleibt 'world-full' — der Canvas ändert seine Größe nicht.
    // Der alte 3D-Resize war ein Rest aus dem 'world-with-panel'-Design und
    // ließ das Auf-/Zuklappen ruckeln.
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
      // Aus der Zeitung heraus zum Blob: zurück ins Feld
      this.simulationStore.setRoom('stadt')
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
      // Blob-Auswahl gehört ins Feld
      this.simulationStore.setRoom('stadt')
      this.onTapBlob({ blob })
    }

    // --- Räume (Akte: Stadt / Schreibtisch) ---
    , onSetRoom(room){
      if (room === 'schreibtisch') {
        this.openDeskSection(this.deskSection || 'studien')
      } else {
        this.simulationStore.setRoom('stadt')
      }
    }
    , openDeskSection(section){
      const s = section || 'studien'
      this.simulationStore.openDesk(s)
      if (s === 'studien' || s === 'dozent') {
        if (!this.surveyStore.isOpen) this.surveyStore.OPEN_SURVEY()
        if (s === 'dozent') {
          // Die Dozentenzimmer-Mappe schlägt die Studienmappe direkt
          // beim Wahrheit-Blatt auf (Schloss sitzt dort)
          this.surveyStore.SET_STEP('truth')
        } else if (this.surveyStore.step === 'truth') {
          this.surveyStore.SET_STEP('editor')
        }
      }
    }
    , closeDeskToStadt(){
      if (this.deskSection === 'studien' || this.deskSection === 'dozent') {
        this.surveyStore.CLOSE_SURVEY()
      }
      this.simulationStore.setRoom('stadt')
    }
    , toggleSurvey(){
      if (this.onDesk && this.deskSection === 'studien') {
        this.closeDeskToStadt()
      } else {
        this.openDeskSection('studien')
      }
    }
    , toggleNewspaper(){
      if (this.onDesk && this.deskSection === 'presse') {
        this.closeDeskToStadt()
      } else {
        this.openDeskSection('presse')
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
        if (this.showCommandPalette) { this.showCommandPalette = false; return }
        if (this.onDesk) { this.closeDeskToStadt(); return }
        if (this.spotlightActive) { this.deactivateSpotlight(); return }
        if (this.selectedBlob) { this.onCloseInteraction(); return }
        if (this.selectedBuilding) { this.selectedBuilding = null; return }
        return
      }

      // Presse-Mappe (Schreibtisch)
      if (e.key === 'n' || e.key === 'N') {
        this.toggleNewspaper()
        return
      }

      // Studienmappe / Befragungsinstitut (Schreibtisch)
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

// World container sizes — die Welt füllt bis zur Oberkante, sodass in der Stadt
// die Reiter direkt über der lebenden Stadt schweben (kein dunkler Streifen mehr,
// wie im Designprototyp). Am Schreibtisch deckt die Desk-Room-Fläche ohnehin ab.
.world-container
  position: absolute
  top: 0
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
    top: 0
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

// Mini-BlobPhone (gesperrt in der Stadt-Ecke unten rechts — gleiche Ecke
// wie der ausgeklappte Feed, damit Wegstecken/Hervorholen zusammenhängt)
.miniphone
  position: absolute
  right: 16px
  bottom: 96px
  width: 96px
  height: 160px
  z-index: 4
  transform: rotate(-6deg)
  border-radius: 20px
  padding: 6px 6px 20px
  background: linear-gradient(165deg, var(--inst-phone-gehaeuse-1), var(--inst-phone-gehaeuse-2))
  border: 3px solid var(--inst-phone-rand)
  box-shadow: 0 12px 22px rgba(15, 20, 45, 0.45)
  cursor: pointer
  transition: transform 0.15s ease
  &:hover
    transform: rotate(-3deg) scale(1.04)

  .mscreen
    width: 100%
    height: 100%
    border-radius: 13px
    background: linear-gradient(170deg, #222c44, #161d30)
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center
    gap: 6px
    padding: 6px
    overflow: hidden

  .mzeit
    color: rgba(255, 255, 255, 0.75)
    font-family: var(--inst-rund)
    font-weight: 700
    font-size: 13px

  .mkarte
    background: rgba(255, 255, 255, 0.96)
    border-radius: 9px
    padding: 6px 7px
    width: 100%
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4)
    text-align: left

  .mk1
    display: flex
    align-items: center
    gap: 4px
    font-family: var(--inst-rund)
    font-weight: 800
    font-size: 10px
    color: #28324e

  .mlogo
    display: inline-block
    width: 13px
    height: 12px
    border-radius: 46% 54% 52% 48% / 58% 56% 44% 42%
    background: linear-gradient(180deg, #6fc2f5, #3d9be8)

  .mk2
    font-family: var(--inst-rund)
    font-size: 8.5px
    color: #5b6884
    font-weight: 700
    margin-top: 1px

  .mhome
    position: absolute
    bottom: 4px
    left: 50%
    transform: translateX(-50%)
    width: 16px
    height: 14px
    border-radius: 46% 54% 52% 48% / 58% 56% 44% 42%
    background: linear-gradient(180deg, #fff, #dbe2ef)
    box-shadow: inset 0 -1.5px 3px rgba(80, 90, 120, 0.4)

// Feed entfaltet sich aus dem Dock unten rechts (transform-origin = Dock-Ecke)
.phone-dock-enter-active, .phone-dock-leave-active
  transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.3, 1.04), opacity 0.2s ease
  transform-origin: bottom right
.phone-dock-enter-from, .phone-dock-enter, .phone-dock-leave-to
  transform: translateY(20px) scale(0.82)
  opacity: 0

// Mini-Phone klappt am selben Eck auf/zu (leichtes Pop, gegenläufig zum Feed)
.phone-dock-mini-enter-active
  transition: transform 0.22s cubic-bezier(0.2, 0.8, 0.3, 1.2), opacity 0.18s ease
  transition-delay: 0.06s
  transform-origin: bottom right
.phone-dock-mini-leave-active
  transition: transform 0.16s ease, opacity 0.14s ease
  transform-origin: bottom right
.phone-dock-mini-enter-from, .phone-dock-mini-enter, .phone-dock-mini-leave-to
  transform: rotate(-6deg) scale(0.5)
  opacity: 0
</style>
