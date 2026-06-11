<template lang="pug">
.event-log
  .event-log-header Event-Verlauf
  .event-list.scrollbars
    .event-entry(
      v-for="ev in events"
      , :key="ev.tick"
      , :class="{ active: isActive(ev), past: ev.tick < tick }"
      , @click="$emit('jump-to-event', ev.tick)"
    )
      .event-icon
        b-icon(:icon="ev.description.includes('Wahl') ? 'vote' : 'lightning-bolt'", size="is-small")
      .event-info
        .event-desc {{ ev.description }}
        .event-time Jahr {{ ev.year }}, Tick {{ ev.tick }}
    .empty-state(v-if="!events.length") Keine Events
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'

export default {
  name: 'EventLog'
  , computed: {
    events(){
      return this.timelineEvents || []
    }
    , ...mapState(useSimulationStore, {
      timelineEvents: 'timelineEvents'
      , tick: 'tick'
    })
  }
  , methods: {
    isActive(ev) {
      return Math.abs(ev.tick - (this.tick || 0)) <= 3
    }
  }
}
</script>

<style lang="sass" scoped>
.event-log
  display: flex
  flex-direction: column
  height: 100%

.event-log-header
  padding: 0.75rem 1rem
  font-weight: 600
  font-size: 0.85rem
  color: $grey-lighter
  border-bottom: 1px solid rgba(255, 255, 255, 0.06)
  flex-shrink: 0

.event-list
  flex: 1
  overflow-y: auto
  padding: 0.25rem

.event-entry
  display: flex
  gap: 0.5rem
  padding: 0.5rem 0.75rem
  border-radius: 4px
  cursor: pointer
  transition: background 0.15s
  &:hover
    background: rgba(255, 255, 255, 0.05)
  &.active
    background: rgba(240, 169, 64, 0.1)
    border-left: 2px solid #f0a940
  &.past
    opacity: 0.6

.event-icon
  color: #f0a940
  flex-shrink: 0

.event-info
  flex: 1
  min-width: 0

.event-desc
  font-size: 0.8rem
  color: $grey-lighter
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.event-time
  font-size: 0.65rem
  color: $grey
  margin-top: 1px

.empty-state
  text-align: center
  padding: 2rem
  color: $grey
  font-size: 0.85rem
</style>
