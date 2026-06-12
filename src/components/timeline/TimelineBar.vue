<template lang="pug">
.timeline-bar-v2(:class="{ expanded: timelineExpanded, minimal: uiMode === 'presentation' }")
  //- Lochstreifen der Filmrolle (rein dekorativ)
  .film-loecher.oben(aria-hidden="true")

  //- Collapsed view: Plakette + Transport + Scrubber
  .timeline-collapsed
    .film-plakette(v-if="uiMode !== 'presentation'", title="Die Simulation ist eine fertige Aufzeichnung — 22 Jahre, 8.030 Tage")
      .z1 STADTARCHIV BLOBTOPIA
      .z2 Aufzeichnung · 22 Jahre
    TransportControls(v-if="uiMode !== 'presentation'")
    .minimal-controls(v-else)
      button.step-btn.play-btn(:class="{ playing: !isPaused }", @click="togglePlayback")
        b-icon(:icon="isPaused ? 'play' : 'pause'", size="is-small")

    button.expand-toggle(@click="toggleExpand", :title="timelineExpanded ? 'Einklappen (F)' : 'Aufklappen (F)'")
      b-icon(:icon="timelineExpanded ? 'chevron-down' : 'chevron-up'", size="is-small")

  TimelineScrubber(:height="scrubberHeight", :sparkline-data="timelineSummary")

  //- Expanded view: DayCycle + Year labels
  transition(name="expand")
    .timeline-expanded(v-if="timelineExpanded && uiMode !== 'presentation'")
      DayCycleStrip

  //- Event Card (appears above timeline)
  .event-card-container(v-if="showEventCard && currentEvent")
    EventCard(:event="currentEvent", :impact="currentEventImpact", @dismiss="dismissEvent")

  .film-loecher.unten(aria-hidden="true")
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import TransportControls from './TransportControls'
import TimelineScrubber from './TimelineScrubber'
import DayCycleStrip from './DayCycleStrip'
import EventCard from './EventCard'

export default {
  name: 'TimelineBar'
  , components: { TransportControls, TimelineScrubber, DayCycleStrip, EventCard }
  , data: () => ({
    dismissedEventTick: null
  })
  , computed: {
    scrubberHeight(){
      if (this.uiMode === 'presentation') return 20
      return this.timelineExpanded ? 50 : 30
    }
    , showEventCard(){
      return this.simulationStore.showEventCard
    }
    , currentEvent(){
      if (!this.timelineEvents || !this.timelineEvents.length) return null
      return this.timelineEvents.find(e => Math.abs(e.tick - (this.tick || 0)) <= 3 && e.tick !== this.dismissedEventTick)
    }
    , currentEventImpact(){
      const impact = this.simulationStore.eventsImpact
      if (!impact || !this.currentEvent) return null
      const events = impact.events || []
      return events.find(e => e.tick === this.currentEvent.tick) || null
    }
    , ...mapState(useSimulationStore, {
      uiMode: 'uiMode'
      , timelineExpanded: 'timelineExpanded'
      , isPaused: 'isPaused'
      , tick: 'tick'
      , maxTick: 'maxTick'
      , timelineEvents: 'timelineEvents'
      , timelineSummary: 'timelineSummary'
    })
    , ...mapStores(useSimulationStore)
  }
  , mounted(){
    // Wirkungsdaten für die Ereignis-Karte (vorher lud das nur das
    // entfernte Dashboard — jetzt holt die Timeline sie selbst)
    this.simulationStore.fetchEventsImpact()
  }
  , watch: {
    tick(){
      // Reset dismissed event when moving away
      if (this.dismissedEventTick != null) {
        const ev = this.timelineEvents.find(e => e.tick === this.dismissedEventTick)
        if (ev && Math.abs(ev.tick - this.tick) > 5) {
          this.dismissedEventTick = null
        }
      }
    }
  }
  , methods: {
    toggleExpand(){
      this.simulationStore.setTimelineExpanded(!this.timelineExpanded)
    }
    , togglePlayback(){
      if (this.isPaused) {
        this.simulationStore.startPlayback()
      } else {
        this.simulationStore.stopPlayback()
      }
    }
    , dismissEvent(){
      if (this.currentEvent) {
        this.dismissedEventTick = this.currentEvent.tick
      }
    }
  }
}
</script>

<style lang="sass" scoped>
// Die Timeline ist die Filmrolle des Stadtarchivs: dunkles Band mit
// Transportlöchern — die Precomputed-Architektur als Fiktion.
.timeline-bar-v2
  position: absolute
  bottom: 0
  left: 0
  right: 0
  z-index: 6
  background: linear-gradient(180deg, #26262f, var(--inst-film))
  border-top: 1px solid rgba(245, 240, 220, 0.12)
  box-shadow: 0 -6px 18px rgba(0, 0, 0, 0.4)
  padding: 14px 1rem 15px
  transition: all 0.3s ease

  &.minimal
    padding: 10px 1rem 11px
    background: rgba(20, 20, 26, 0.75)

.film-loecher
  position: absolute
  left: 0
  right: 0
  height: 10px
  background-image: radial-gradient(circle at 9px 5px, rgba(245, 240, 220, 0.65) 2.6px, transparent 3.4px)
  background-size: 22px 10px
  pointer-events: none
  &.oben
    top: 2px
  &.unten
    bottom: 2px

.film-plakette
  flex: none
  border-radius: 5px
  padding: 2px 12px 3px
  background: linear-gradient(160deg, var(--inst-messing-1), var(--inst-messing-2) 60%, #caa55a)
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5), inset 0 -2px 4px rgba(0, 0, 0, 0.35), 0 2px 5px rgba(0, 0, 0, 0.5)
  color: var(--inst-messing-text)
  text-shadow: 0 1px 0 rgba(255, 240, 200, 0.5)
  text-align: center
  user-select: none
  .z1
    font-family: var(--inst-druck)
    font-size: 7.5px
    font-weight: 800
    letter-spacing: 2px
  .z2
    font-family: var(--inst-schreibmaschine)
    font-size: 10.5px
    white-space: nowrap

.timeline-collapsed
  display: flex
  align-items: center
  gap: 0.6rem
  margin-bottom: 0.3rem

.minimal-controls
  display: flex
  align-items: center
  gap: 0.5rem
  flex: 1

.expand-toggle
  margin-left: auto
  background: transparent
  border: 1px solid rgba(255, 255, 255, 0.12)
  border-radius: 4px
  color: $grey
  cursor: pointer
  outline: none
  width: 24px
  height: 24px
  display: flex
  align-items: center
  justify-content: center
  &:hover
    color: $grey-lighter
    border-color: rgba(255, 255, 255, 0.25)

.timeline-expanded
  margin-top: 0.4rem

.event-card-container
  position: absolute
  bottom: 100%
  left: 1rem
  margin-bottom: 0.5rem
  z-index: 7

// Step btn styles for minimal mode
.step-btn
  display: inline-flex
  align-items: center
  justify-content: center
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
  outline: none
  transition: all 0.12s
  &.play-btn
    border-color: rgba(78, 204, 163, 0.4)
    color: $primary
    &.playing
      border-color: rgba(240, 201, 41, 0.4)
      color: #f0c929

.expand-enter-active, .expand-leave-active
  transition: all 0.3s ease
  overflow: hidden
.expand-enter, .expand-enter-from, .expand-leave-to
  opacity: 0
  max-height: 0
</style>
