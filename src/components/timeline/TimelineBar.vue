<template lang="pug">
.timeline-bar-v2(:class="{ expanded: timelineExpanded, minimal: uiMode === 'presentation' }")
  //- Collapsed view: Transport + Scrubber
  .timeline-collapsed
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
      const impact = this.simulationStore.dashboardCache.eventsImpact
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
.timeline-bar-v2
  position: absolute
  bottom: 0
  left: 0
  right: 0
  z-index: 6
  background: rgba(0, 0, 0, 0.9)
  backdrop-filter: blur(10px)
  border-top: 1px solid rgba(255, 255, 255, 0.08)
  padding: 0.4rem 1rem 0.5rem
  transition: all 0.3s ease

  &.minimal
    padding: 0.2rem 1rem
    background: rgba(0, 0, 0, 0.6)

.timeline-collapsed
  display: flex
  align-items: center
  gap: 0.5rem
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
.expand-enter, .expand-leave-to
  opacity: 0
  max-height: 0
</style>
