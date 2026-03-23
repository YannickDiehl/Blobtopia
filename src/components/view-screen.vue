<template lang="pug">
.viewer
  transition(name="slide-down", appear, @after-enter="fixLayout", @after-leave="fixLayout")
    .top-controls(v-show="!showConfig && !showIntro")
      //- Status bar
      .status-bar
        .status-item
          .status-dot(:class="connectionClass")
          span {{ connectionLabel }}
        .status-item(v-if="year !== undefined")
          span.value Jahr {{ year }}, Monat {{ month }}, Tag {{ day }}, {{ hourDisplay }} Uhr
        .status-item
          span.label-text Bevölkerung
          span.value {{ populationCount }}

      //- Instructor controls (different for timeline vs live mode)
      .instructor-controls(v-if="!timelineMode")
        b-tooltip(:label="isPaused ? 'Simulation fortsetzen' : 'Simulation pausieren'", position="is-left")
          b-button.is-rounded(:class="isPaused ? 'is-success' : 'is-warning'", size="is-small", @click="toggleServerPause")
            b-icon(:icon="isPaused ? 'play' : 'pause'", size="is-small")
            span {{ isPaused ? 'Resume' : 'Pause' }}

      //- Event triggers (only in live mode)
      FloatingPanel(v-if="!timelineMode", size="is-medium", :close-on-click="false", direction="down")
        template(#activator)
          b-button.is-rounded.is-info.is-outlined(size="is-small")
            b-icon(icon="lightning-bolt", size="is-small")
            span Events
        .event-menu
          .event-item(@click="fireEvent('Election')")
            b-icon(icon="vote", size="is-small")
            span Wahl auslösen
          .event-item(@click="fireEvent('EconomicCrisis', { severity: 0.6, affected_districts: [] })")
            b-icon(icon="chart-line-variant", size="is-small")
            span Wirtschaftskrise
          .event-item(@click="fireEvent('Scandal', { target_party: 0, magnitude: 0.5 })")
            b-icon(icon="alert-decagram", size="is-small")
            span Skandal (Fortschritt)
          .event-item(@click="fireEvent('EducationReform', { target_district: 0 })")
            b-icon(icon="school", size="is-small")
            span Bildungsreform (Grüntal)
          .event-item(@click="fireEvent('NaturalDisaster', { affected_district: 4, severity: 0.5 })")
            b-icon(icon="weather-lightning-rainy", size="is-small")
            span Naturkatastrophe (Industriezone)
          .event-item(@click="fireEvent('MediaCampaign', { party: 2, reach: 0.4 })")
            b-icon(icon="newspaper", size="is-small")
            span Medienkampagne (Tradition)

      //- BlobFeed toggle
      b-tooltip(label="BlobFeed ein-/ausblenden", position="is-left")
        b-button.is-rounded.is-outlined(size="is-small", :class="{ 'is-primary': showFeed }", @click="showFeed = !showFeed")
          b-icon(icon="rss", size="is-small")

      //- Follow creature toggle
      b-icon.icon-btn(icon="cctv", :class="{ active: followBlob }", size="is-medium", @click.native.stop="followBlob = !followBlob")

  .screen
    b-loading.loading-cover(:is-full-page="false", :active="!showIntro && isLoading")
    WorldViewer(
      ref="worldViewer"
      , :generation-index="genIndex"
      , :step-time="stepTime"
      , :sight-indicators="false"
      , :energy-indicators="false"
      , :followBlobId="followBlob ? followBlobId : undefined"
      , @tap-blob="onTapBlob"
      , @tap-building="onTapBuilding"
    )

  //- Right panel: BlobFeed
  transition(name="slide-right")
    BlobFeed(v-if="showFeed", :tweets="tweets")

  //- Blob interaction overlay (Inspector + Chat combined)
  transition(name="fade")
    BlobInteraction(
      v-if="selectedBlob"
      , :blob="selectedBlob"
      , :timeline-mode="timelineMode"
      , @close="onCloseInteraction"
    )

  //- Building inspector overlay
  transition(name="fade")
    BuildingInspector(
      v-if="selectedBuilding"
      , :building="selectedBuilding"
      , :timeline-mode="timelineMode"
      , @close="selectedBuilding = null"
      , @select-blob="blob => onTapBlob({ blob })"
    )

  //- Timeline control bar (only in timeline mode)
  .timeline-bar(v-if="timelineMode", @keydown="onTimelineKey")
    .timeline-inner
      //- Row 1: Play/Pause + Speed + Date display + step controls + event nav
      .control-row
        b-tooltip(:label="isPaused ? 'Abspielen (Leertaste)' : 'Pausieren (Leertaste)'", position="is-top")
          button.step-btn.play-btn(:class="{ playing: !isPaused }", @click="togglePlayback")
            b-icon(:icon="isPaused ? 'play' : 'pause'", size="is-small")

        FloatingPanel(size="is-small", direction="up")
          template(#activator)
            button.step-btn.speed-selector {{ speedLabel }}
          .speed-menu
            .speed-item(:class="{ active: playbackSpeed === 1 }", @click="setSpeed(1)") 1× Gemütlich
            .speed-item(:class="{ active: playbackSpeed === 3 }", @click="setSpeed(3)") 3× Schnell
            .speed-item(:class="{ active: playbackSpeed === 7 }", @click="setSpeed(7)") 1 Woche/Sek
            .speed-item(:class="{ active: playbackSpeed === 30 }", @click="setSpeed(30)") 1 Monat/Sek
            .speed-item(:class="{ active: playbackSpeed === 365 }", @click="setSpeed(365)") 1 Jahr/Sek

        .date-display
          span.date-text Jahr {{ year }}, Monat {{ month }}, Tag {{ day }}
          span.tick-info Tick {{ tick }} / {{ maxTick }}

        .step-controls
          b-tooltip(label="1 Jahr zurück (Shift+←)", position="is-top")
            button.step-btn(@click="stepBy(-365)")
              b-icon(icon="chevron-double-left", size="is-small")
          b-tooltip(label="1 Monat zurück (Alt+←)", position="is-top")
            button.step-btn(@click="stepBy(-30)")
              b-icon(icon="chevron-left", size="is-small")
              b-icon(icon="chevron-left", size="is-small")
          b-tooltip(label="1 Woche zurück (Ctrl+←)", position="is-top")
            button.step-btn(@click="stepBy(-7)") -7
          b-tooltip(label="1 Tag zurück (←)", position="is-top")
            button.step-btn(@click="stepBy(-1)")
              b-icon(icon="chevron-left", size="is-small")
          b-tooltip(label="1 Tag vor (→)", position="is-top")
            button.step-btn(@click="stepBy(1)")
              b-icon(icon="chevron-right", size="is-small")
          b-tooltip(label="1 Woche vor (Ctrl+→)", position="is-top")
            button.step-btn(@click="stepBy(7)") +7
          b-tooltip(label="1 Monat vor (Alt+→)", position="is-top")
            button.step-btn(@click="stepBy(30)")
              b-icon(icon="chevron-right", size="is-small")
              b-icon(icon="chevron-right", size="is-small")
          b-tooltip(label="1 Jahr vor (Shift+→)", position="is-top")
            button.step-btn(@click="stepBy(365)")
              b-icon(icon="chevron-double-right", size="is-small")

        .event-nav
          b-tooltip(label="Vorheriges Event", position="is-top")
            button.step-btn.event-btn(@click="jumpEvent(-1)")
              b-icon(icon="skip-previous", size="is-small")
              span Event
          b-tooltip(label="Nächstes Event", position="is-top")
            button.step-btn.event-btn(@click="jumpEvent(1)")
              span Event
              b-icon(icon="skip-next", size="is-small")

      //- Row 2: Quick jump selectors
      .control-row.jump-row
        .jump-group
          label.jump-label Jahr
          select.jump-select(@change="jumpToYear($event.target.value)", :value="year")
            option(v-for="y in yearOptions", :key="y", :value="y") {{ y }}
        .jump-group
          label.jump-label Monat
          select.jump-select(@change="jumpToMonth($event.target.value)", :value="month")
            option(v-for="m in 12", :key="m", :value="m") {{ m }}
        .jump-group
          label.jump-label Stunde
          input.hour-scrubber(
            type="range"
            , :min="0"
            , :max="23"
            , :value="storeHour"
            , @input="onHourScrub($event.target.value)"
          )
          span.hour-val {{ hourDisplay }}

      //- Row 3: Full timeline scrubber with event markers
      .timeline-track-row
        .timeline-track-container
          input.timeline-scrubber(
            type="range"
            , :min="0"
            , :max="maxTick"
            , :value="tick"
            , @input="onScrubDrag($event.target.value)"
            , @change="onScrubRelease($event.target.value)"
          )
          //- Year labels
          .year-labels
            span.year-label(
              v-for="y in yearMarkers"
              , :key="y.year"
              , :style="{ left: y.pct + '%' }"
              , @click="jumpToYear(y.year)"
            ) {{ y.year }}
          //- Event markers on the track
          .track-markers
            .track-marker(
              v-for="ev in timelineEvents"
              , :key="'m' + ev.tick"
              , :style="{ left: (ev.tick / maxTick * 100) + '%' }"
              , :class="{ election: ev.description.includes('Wahl') }"
              , :title="ev.description + ' (Jahr ' + ev.year + ')'"
              , @click="jumpToTick(ev.tick)"
            )
          //- Current event indicator
          .current-event(v-if="currentEvent")
            b-icon(:icon="currentEvent.description.includes('Wahl') ? 'vote' : 'lightning-bolt'", size="is-small")
            span {{ currentEvent.description }}
</template>

<script>
import { mapGetters } from 'vuex'
import WorldViewer from '@/components/world-viewer'
import FloatingPanel from '@/components/floating-panel'
import BlobFeed from '@/components/blob-feed'
import BlobInteraction from '@/components/blob-interaction'

import BuildingInspector from '@/components/building-inspector'
import { API_BASE } from '@/config/api'

export default {
  name: 'ViewScreen'
  , props: {
    showConfig: Boolean
    , showIntro: Number
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
    , showFeed: false
    , selectedBlob: null
    , selectedBuilding: null
    , hourTimer: null
    , tickIntervalMs: 1325000
  })
  , components: {
    WorldViewer
    , FloatingPanel
    , BlobFeed
    , BlobInteraction
    , BuildingInspector
  }
  , created(){
  }
  , deactivated(){
  }
  , beforeDestroy(){
    this.stopHourTimer()
    document.removeEventListener('keydown', this._keyHandler)
  }
  , mounted(){
    // Blobal keyboard shortcuts for timeline navigation
    this._keyHandler = (e) => this.onTimelineKey(e)
    document.addEventListener('keydown', this._keyHandler)

    // Tick-Intervall vom Server holen für korrekte Stundenberechnung
    fetch(API_BASE + '/api/status')
      .then(r => r.json())
      .then(data => {
        if (data.tick_interval_ms) {
          this.tickIntervalMs = data.tick_interval_ms
        }
      })
      .catch(() => {})

    if (!this.isPaused) {
      this.startHourTimer()
    }
  }
  , computed: {
    stepTime(){
      return 100
    }
    , generation(){
      return this.getCurrentGeneration()
    }
    , genIndex(){
      return this.generationIndex
    }
    , tourStepNumber(){
      return this.$route.query.intro | 0
    }
    , connectionClass(){
      if (this.connectionStatus === 'connected') return 'is-connected'
      if (this.connectionStatus === 'reconnecting') return 'is-reconnecting'
      return 'is-disconnected'
    }
    , connectionLabel(){
      if (this.connectionStatus === 'connected') return 'Verbunden'
      if (this.connectionStatus === 'reconnecting') return 'Verbinde...'
      return 'Getrennt'
    }
    , populationCount(){
      if (!this.generation) return '—'
      return this.generation.blobs.length
    }
    , hourDisplay(){
      return String(this.storeHour).padStart(2, '0') + ':00'
    }
    , speedLabel(){
      const labels = { 1: '1×', 3: '3×', 7: '7×', 30: '30×', 365: '365×' }
      return labels[this.playbackSpeed] || this.playbackSpeed + '×'
    }
    , yearOptions(){
      if (!this.maxTick) return [0]
      const maxYear = Math.floor(this.maxTick / 365)
      return Array.from({ length: maxYear + 1 }, (_, i) => i)
    }
    , yearMarkers(){
      if (!this.maxTick) return []
      const maxYear = Math.floor(this.maxTick / 365)
      // Show every 2nd year to avoid crowding
      const step = maxYear > 15 ? 2 : 1
      const markers = []
      for (let y = 0; y <= maxYear; y += step) {
        markers.push({ year: y, pct: (y * 365 / this.maxTick * 100) })
      }
      return markers
    }
    , currentEvent(){
      if (!this.timelineEvents || !this.timelineEvents.length) return null
      // Show event if we're within ±3 ticks of it
      return this.timelineEvents.find(e => Math.abs(e.tick - (this.tick || 0)) <= 3)
    }
    , ...mapGetters('simulation', {
      getCurrentGeneration: 'getCurrentGeneration'
      , generationIndex: 'currentGenerationIndex'
      , stats: 'statistics'
      , isLoading: 'isLoading'
      , connectionStatus: 'connectionStatus'
      , isPaused: 'isPaused'
      , tick: 'tick'
      , year: 'year'
      , month: 'month'
      , day: 'day'
      , tweets: 'tweets'
      , storeHour: 'hour'
      , timelineMode: 'timelineMode'
      , maxTick: 'maxTick'
      , playbackSpeed: 'playbackSpeed'
      , timelineEvents: 'timelineEvents'
    })
  }
  , watch: {
    tourStepNumber(step){
      if (step === 3 && this.generation){
        this.followBlobId = this.generation.blobs[2].id
      }
      this.followBlob = step === 3
    }
    , tick(){
      // In timeline mode, the playback timer manages the hour — don't reset it here
      if (!this.timelineMode) {
        this.$store.commit('simulation/setHour', 0)
      }
    }
    , isPaused(paused){
      // In timeline mode, hour is controlled by the scrubber, not a timer
      if (this.timelineMode) return
      if (paused) {
        this.stopHourTimer()
      } else {
        this.startHourTimer()
      }
    }
    , followBlob(f){
      if ( f && !this.followBlobId && this.generation ){
        this.followBlobId = this.generation.blobs[0].id
      }
    }
  }
  , methods: {
    toggleServerPause(){
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
    , onCloseInteraction(){
      this.selectedBlob = null
      this.followBlob = false
      this.$store.dispatch('chat/closeChat')
    }
    , onTapBlob({ blob }){
      this.followBlobId = blob.id
      this.followBlob = true
      this.selectedBlob = blob
      this.selectedBuilding = null
    }
    , onTapBuilding(buildingInfo){
      this.selectedBuilding = buildingInfo
      this.selectedBlob = null
    }
    // --- Timeline Playback Controls ---
    , togglePlayback(){
      if (this.isPaused) {
        this.$store.dispatch('simulation/startPlayback')
      } else {
        this.$store.dispatch('simulation/stopPlayback')
      }
    }
    , setSpeed(speed){
      this.$store.dispatch('simulation/setPlaybackSpeed', speed)
    }
    , onHourScrub(value){
      this.$store.commit('simulation/setHour', parseInt(value))
      this.$store.commit('simulation/setSubHourFraction', 0)
    }
    , jumpToTick(tick){
      this.$store.dispatch('simulation/stopPlayback')
      this.$store.dispatch('simulation/seekTick', tick)
    }
    // --- New timeline controls ---
    , stepBy(delta){
      this.$store.dispatch('simulation/stopPlayback')
      this.$store.dispatch('simulation/stepTick', delta)
    }
    , jumpEvent(direction){
      this.$store.dispatch('simulation/stopPlayback')
      this.$store.dispatch('simulation/jumpToEvent', direction)
    }
    , jumpToYear(y){
      const tick = parseInt(y) * 365
      this.jumpToTick(tick)
    }
    , jumpToMonth(m){
      const tick = (this.year || 0) * 365 + (parseInt(m) - 1) * 30
      this.jumpToTick(tick)
    }
    , onScrubDrag(value){
      // Debounced: updates display immediately, fetches after pause
      this.$store.dispatch('simulation/seekTickDebounced', parseInt(value))
    }
    , onScrubRelease(value){
      // On mouse-up: fetch immediately
      this.$store.dispatch('simulation/seekTick', parseInt(value))
    }
    , onTimelineKey(e){
      // Don't intercept keys when user is typing in an input/textarea/select
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return
      // Escape: close interaction / exit follow mode
      if (e.key === 'Escape') {
        e.preventDefault()
        if (this.selectedBlob) { this.onCloseInteraction(); return }
        if (this.selectedBuilding) { this.selectedBuilding = null; return }
        if (this.followBlob) { this.followBlob = false; return }
        return
      }
      if (!this.timelineMode) return
      const delta = e.shiftKey ? 365 : e.altKey ? 30 : e.ctrlKey || e.metaKey ? 7 : 1
      if (e.key === 'ArrowLeft') { e.preventDefault(); this.stepBy(-delta) }
      else if (e.key === 'ArrowRight') { e.preventDefault(); this.stepBy(delta) }
      else if (e.key === ' ') { e.preventDefault(); this.togglePlayback() }
    }
    // --- Legacy Hour Timer ---
    , startHourTimer(){
      this.stopHourTimer()
      // 1 Tick = 1 Tag → 1 Stunde = tickInterval / 24
      const hourInterval = Math.round(this.tickIntervalMs / 24)
      this.hourTimer = setInterval(() => {
        const currentHour = this.$store.state.simulation.hour
        if (currentHour < 23) {
          this.$store.commit('simulation/setHour', currentHour + 1)
        }
      }, hourInterval)
    }
    , stopHourTimer(){
      if (this.hourTimer) {
        clearInterval(this.hourTimer)
        this.hourTimer = null
      }
    }
    , fixLayout(){
      let viewer = this.$refs.worldViewer
      if ( viewer ){
        viewer.onResize()
      }
    }
  }
}
</script>

<style lang="sass" scoped>
.viewer
  position: relative
  display: flex
  flex-direction: column
  .screen
    flex-grow: 1
    overflow: hidden
    display: flex
    align-items: stretch
    > *
      flex: 1

.top-controls
  position: absolute
  top: 1.5rem
  right: 1.5rem
  z-index: 1
  text-align: right
  display: flex
  align-items: center
  gap: 0.5rem

  @media screen and (max-width: $tablet)
    top: 5rem
    flex-wrap: wrap

.status-bar
  display: flex
  align-items: center
  gap: 0.75rem
  background: rgba(0, 0, 0, 0.9)
  backdrop-filter: blur(10px)
  border-radius: 20px
  border: 1px solid rgba(255, 255, 255, 0.12)
  padding: 0.3rem 0.75rem
  font-size: 0.8rem

  .status-item
    display: flex
    align-items: center
    gap: 0.25rem
    white-space: nowrap

  .label-text
    color: $grey
    font-size: 0.7rem
    text-transform: uppercase

  .value
    color: $grey-lighter
    font-weight: 600

.status-dot
  width: 8px
  height: 8px
  border-radius: 50%
  &.is-connected
    background: #4ecca3
  &.is-reconnecting
    background: #f0c929
    animation: pulse 1s infinite
  &.is-disconnected
    background: #e74c3c

@keyframes pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.3

.instructor-controls
  display: flex
  gap: 0.25rem

.event-menu
  padding: 0.25rem 0

  .event-item
    display: flex
    align-items: center
    gap: 0.5rem
    padding: 0.5rem 0.75rem
    cursor: pointer
    white-space: nowrap
    transition: background 0.15s
    &:hover
      background: rgba(255, 255, 255, 0.1)

.loading-cover
  z-index: 1

.slide-right-enter-active, .slide-right-leave-active
  transition: transform 0.3s ease
.slide-right-enter, .slide-right-leave-to
  transform: translateX(100%)

// ═══════════════════════════════════════════════
// Timeline control bar (redesigned)
// ═══════════════════════════════════════════════
.timeline-bar
  position: absolute
  bottom: 0
  left: 0
  right: 0
  z-index: 5
  background: rgba(0, 0, 0, 0.9)
  backdrop-filter: blur(10px)
  border-top: 1px solid rgba(255, 255, 255, 0.12)
  padding: 0.5rem 1.25rem 0.6rem
  outline: none

.timeline-inner
  max-width: 1400px
  margin: 0 auto

.control-row
  display: flex
  align-items: center
  gap: 0.75rem
  margin-bottom: 0.4rem
  flex-wrap: wrap
  &.jump-row
    margin-bottom: 0.5rem

// Date display
.date-display
  display: flex
  align-items: baseline
  gap: 0.6rem
  min-width: 200px
  .date-text
    font-size: 1rem
    font-weight: 700
    color: $grey-lighter
  .tick-info
    font-size: 0.7rem
    color: $grey
    font-family: monospace

// Step buttons
.step-controls
  display: flex
  align-items: center
  gap: 2px

.step-btn
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0
  min-width: 28px
  height: 26px
  padding: 0 4px
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 4px
  background: rgba(255, 255, 255, 0.05)
  color: $grey-lighter
  font-size: 0.65rem
  font-weight: 600
  cursor: pointer
  transition: all 0.12s
  &:hover
    background: rgba(255, 255, 255, 0.15)
    border-color: rgba(255, 255, 255, 0.3)
  &:active
    background: rgba(78, 204, 163, 0.2)
    border-color: $primary
  .icon
    margin: 0 -3px
  &.play-btn
    min-width: 32px
    height: 28px
    border-color: rgba(78, 204, 163, 0.4)
    color: $primary
    &:hover
      background: rgba(78, 204, 163, 0.15)
      border-color: $primary
    &.playing
      border-color: rgba(240, 201, 41, 0.4)
      color: #f0c929
      &:hover
        background: rgba(240, 201, 41, 0.15)
        border-color: #f0c929
  &.speed-selector
    min-width: 36px
    font-size: 0.7rem
    padding: 0 6px

// Event navigation
.event-nav
  display: flex
  gap: 4px
  margin-left: auto

.event-btn
  min-width: auto
  padding: 0 8px
  gap: 2px
  font-size: 0.7rem
  border-color: rgba(240, 169, 64, 0.3)
  color: #f0a940
  &:hover
    background: rgba(240, 169, 64, 0.15)
    border-color: rgba(240, 169, 64, 0.5)
  .icon
    margin: 0 -2px

// Quick jump selectors
.jump-group
  display: flex
  align-items: center
  gap: 0.3rem

.jump-label
  font-size: 0.65rem
  color: $grey
  text-transform: uppercase
  letter-spacing: 0.5px

.jump-select
  -webkit-appearance: none
  appearance: none
  background: rgba(255, 255, 255, 0.08)
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 4px
  color: $grey-lighter
  font-size: 0.8rem
  padding: 2px 20px 2px 8px
  cursor: pointer
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E")
  background-repeat: no-repeat
  background-position: right 6px center
  &:hover
    border-color: rgba(255, 255, 255, 0.3)
  &:focus
    outline: none
    border-color: $primary
  option
    background: #222
    color: #eee

.hour-scrubber
  width: 120px
  -webkit-appearance: none
  appearance: none
  height: 3px
  background: rgba(255, 255, 255, 0.15)
  border-radius: 2px
  outline: none
  cursor: pointer
  &::-webkit-slider-thumb
    -webkit-appearance: none
    width: 12px
    height: 12px
    border-radius: 50%
    background: #5c9ded
    cursor: pointer
    border: 2px solid rgba(0, 0, 0, 0.3)
  &::-moz-range-thumb
    width: 12px
    height: 12px
    border-radius: 50%
    background: #5c9ded
    cursor: pointer
    border: 2px solid rgba(0, 0, 0, 0.3)

.hour-val
  font-size: 0.75rem
  color: $grey-lighter
  font-weight: 600
  min-width: 3rem

// Full timeline track
.timeline-track-row
  position: relative

.timeline-track-container
  position: relative

.timeline-scrubber
  width: 100%
  -webkit-appearance: none
  appearance: none
  height: 6px
  background: rgba(255, 255, 255, 0.1)
  border-radius: 3px
  outline: none
  cursor: pointer
  &::-webkit-slider-thumb
    -webkit-appearance: none
    width: 16px
    height: 16px
    border-radius: 50%
    background: $primary
    cursor: pointer
    border: 2px solid rgba(0, 0, 0, 0.4)
    box-shadow: 0 0 6px rgba(78, 204, 163, 0.4)
    position: relative
    z-index: 3
  &::-moz-range-thumb
    width: 16px
    height: 16px
    border-radius: 50%
    background: $primary
    cursor: pointer
    border: 2px solid rgba(0, 0, 0, 0.4)

// Year labels below track
.year-labels
  display: flex
  position: relative
  height: 14px
  margin-top: 2px
  pointer-events: none

.year-label
  position: absolute
  transform: translateX(-50%)
  font-size: 0.6rem
  color: rgba(255, 255, 255, 0.3)
  cursor: pointer
  pointer-events: all
  &:hover
    color: $primary

// Event markers on the track
.track-markers
  position: absolute
  top: -2px
  left: 0
  right: 0
  height: 10px
  pointer-events: none

.track-marker
  position: absolute
  width: 3px
  height: 10px
  background: rgba(240, 169, 64, 0.6)
  transform: translateX(-50%)
  cursor: pointer
  pointer-events: all
  transition: all 0.15s
  border-radius: 1px
  &:hover
    background: #f0c929
    width: 5px
    height: 14px
    top: -2px
    z-index: 2
  &.election
    background: rgba(231, 76, 60, 0.7)
    width: 4px
    &:hover
      background: #e74c3c

// Current event indicator
.current-event
  display: flex
  align-items: center
  gap: 0.3rem
  margin-top: 0.3rem
  padding: 0.2rem 0.5rem
  background: rgba(240, 169, 64, 0.1)
  border: 1px solid rgba(240, 169, 64, 0.3)
  border-radius: 4px
  font-size: 0.75rem
  color: #f0c929
  width: fit-content

// Speed menu
.speed-menu
  padding: 0.25rem 0
  .speed-item
    padding: 0.4rem 0.75rem
    cursor: pointer
    white-space: nowrap
    font-size: 0.85rem
    &:hover
      background: rgba(255, 255, 255, 0.1)
    &.active
      color: $primary
      font-weight: 600
</style>
