<template lang="pug">
.live-metrics(:class="{ 'presentation-size': uiMode === 'presentation' }")
  .metric-row(v-for="(d, idx) in miniDistricts", :key="idx")
    .district-dot(:style="{ backgroundColor: d.color }")
    .mini-value(:class="satLevel(d.satisfaction)") {{ d.satisfaction.toFixed(1) }}

  .event-badge(v-if="currentEvent")
    .pulse-dot
    span {{ currentEvent.description }}

  .election-countdown(v-if="nextElection")
    b-icon(icon="vote", size="is-small")
    span {{ nextElection }}
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'

export default {
  name: 'LiveMetrics'
  , computed: {
    miniDistricts(){
      const stats = this.statistics
      if (!stats || !stats.districtStats) return []
      return Object.keys(stats.districtStats).map(d => ({
        color: DISTRICT_COLORS_HEX[d] || '#999'
        , satisfaction: stats.districtStats[d].avgSatisfaction || 0
      }))
    }
    , currentEvent(){
      if (!this.timelineEvents || !this.timelineEvents.length) return null
      return this.timelineEvents.find(e => Math.abs(e.tick - (this.tick || 0)) <= 3)
    }
    , nextElection(){
      if (!this.electionTicks || !this.electionTicks.length) return null
      const next = this.electionTicks.find(t => t > this.tick)
      if (!next) return null
      const days = next - this.tick
      if (days > 365) return null
      return days + 'd'
    }
    , ...mapGetters('simulation', {
      uiMode: 'uiMode'
      , statistics: 'statistics'
      , tick: 'tick'
      , timelineEvents: 'timelineEvents'
      , electionTicks: 'electionTicks'
    })
  }
  , methods: {
    satLevel(v) {
      if (v >= 7) return 'good'
      if (v >= 4) return 'mid'
      return 'bad'
    }
  }
}
</script>

<style lang="sass" scoped>
.live-metrics
  position: absolute
  top: 56px
  left: 12px
  z-index: 4
  display: flex
  flex-direction: column
  gap: 4px
  pointer-events: none

  &.presentation-size
    transform: scale(1.2)
    transform-origin: top left

.metric-row
  display: flex
  align-items: center
  gap: 4px
  background: rgba(0, 0, 0, 0.7)
  backdrop-filter: blur(6px)
  border-radius: 10px
  padding: 2px 8px 2px 4px

.district-dot
  width: 8px
  height: 8px
  border-radius: 50%
  flex-shrink: 0

.mini-value
  font-size: 0.7rem
  font-weight: 600
  font-family: monospace
  &.good
    color: #4ecca3
  &.mid
    color: #f0c929
  &.bad
    color: #e74c3c

.event-badge
  display: flex
  align-items: center
  gap: 4px
  background: rgba(240, 169, 64, 0.15)
  border: 1px solid rgba(240, 169, 64, 0.3)
  border-radius: 10px
  padding: 2px 8px
  font-size: 0.7rem
  color: #f0c929
  pointer-events: all
  animation: badge-appear 0.3s ease

.pulse-dot
  width: 6px
  height: 6px
  border-radius: 50%
  background: #f0a940
  animation: pulse 1.5s infinite

.election-countdown
  display: flex
  align-items: center
  gap: 3px
  background: rgba(231, 76, 60, 0.12)
  border-radius: 10px
  padding: 2px 8px
  font-size: 0.7rem
  color: rgba(231, 76, 60, 0.8)

@keyframes pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.3

@keyframes badge-appear
  from
    opacity: 0
    transform: translateY(-4px)
  to
    opacity: 1
    transform: translateY(0)
</style>
