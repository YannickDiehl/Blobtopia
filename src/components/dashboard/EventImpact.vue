<template lang="pug">
.event-impact
  h3.heading Ereigniswirkung

  .loading-state(v-if="loading")
    p.has-text-grey Ereignisdaten werden geladen...

  template(v-else-if="events.length")
    .event-card(v-for="(ev, ei) in events" :key="ei")
      .event-header
        .event-desc {{ ev.description }}
        .event-meta Tick {{ ev.tick }} (Jahr {{ ev.year }})

      .district-deltas
        .district-row(v-for="dd in ev.districts" :key="dd.district")
          .district-label
            span.district-dot(:style="{ backgroundColor: districtHex(dd.district) }")
            span {{ districtName(dd.district) }}

          .delta-group
            .delta-item
              .delta-label Zufriedenheit
              .delta-bar
                .delta-track
                  .delta-fill(:style="deltaStyle(dd.after.satisfaction - dd.before.satisfaction)")
                span.delta-val(:class="deltaClass(dd.after.satisfaction - dd.before.satisfaction)") {{ formatDelta(dd.after.satisfaction - dd.before.satisfaction) }}

            .delta-item
              .delta-label L-R
              .delta-bar
                .delta-track
                  .delta-fill(:style="deltaStyle(dd.after.ideology - dd.before.ideology)")
                span.delta-val(:class="deltaClass(dd.after.ideology - dd.before.ideology)") {{ formatDelta(dd.after.ideology - dd.before.ideology) }}

            .delta-item
              .delta-label Vertrauen
              .delta-bar
                .delta-track
                  .delta-fill(:style="deltaStyle(dd.after.trust - dd.before.trust)")
                span.delta-val(:class="deltaClass(dd.after.trust - dd.before.trust)") {{ formatDelta(dd.after.trust - dd.before.trust) }}

  p.has-text-grey(v-else) Keine Ereignisdaten vorhanden.
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { DISTRICT_NAMES, DISTRICT_COLORS } from '@/lib/blob-adapter'

export default {
  name: 'EventImpact'
  , data: () => ({
    loading: true
  })
  , computed: {
    ...mapState(useSimulationStore, ['dashboardEventsImpact'])
    , events() {
      const cached = this.dashboardEventsImpact
      return cached && cached.events ? cached.events : []
    }
  }
  , methods: {
    districtHex(d) {
      const hex = DISTRICT_COLORS[d] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    , districtName(d) {
      return DISTRICT_NAMES[d] || `Distrikt ${d}`
    }
    , deltaStyle(delta) {
      const maxDelta = 3.0
      const pct = Math.min(Math.abs(delta) / maxDelta, 1) * 50
      if (delta >= 0) {
        return {
          left: '50%'
          , width: pct + '%'
          , backgroundColor: '#27ae60'
        }
      }
      return {
        left: (50 - pct) + '%'
        , width: pct + '%'
        , backgroundColor: '#e74c3c'
      }
    }
    , deltaClass(delta) {
      if (delta > 0) return 'positive'
      if (delta < 0) return 'negative'
      return ''
    }
    , formatDelta(delta) {
      const sign = delta > 0 ? '+' : ''
      return sign + delta.toFixed(2)
    }
  }
  , async mounted() {
    await useSimulationStore().fetchDashboardEventsImpact()
    this.loading = false
  }
}
</script>

<style lang="sass" scoped>
.event-impact
  padding: 1rem 0

.loading-state
  padding: 2rem 0
  text-align: center

.event-card
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px
  padding: 1rem
  margin-bottom: 1rem

.event-header
  margin-bottom: 0.75rem

  .event-desc
    font-size: 0.95rem
    font-weight: 600
    color: $text

  .event-meta
    font-size: 0.75rem
    color: $grey
    margin-top: 0.15rem

.district-deltas
  display: flex
  flex-direction: column
  gap: 0.6rem

.district-row
  display: flex
  align-items: flex-start
  gap: 0.75rem

.district-label
  display: flex
  align-items: center
  gap: 0.4rem
  min-width: 120px
  font-size: 0.8rem
  color: $text
  flex-shrink: 0

.district-dot
  width: 10px
  height: 10px
  border-radius: 50%
  flex-shrink: 0

.delta-group
  flex: 1
  display: flex
  flex-direction: column
  gap: 0.3rem

.delta-item
  display: flex
  align-items: center
  gap: 0.5rem

.delta-label
  font-size: 0.7rem
  color: $grey
  min-width: 90px
  flex-shrink: 0

.delta-bar
  display: flex
  align-items: center
  gap: 0.4rem
  flex: 1

.delta-track
  position: relative
  width: 100%
  height: 14px
  background: rgba(255, 255, 255, 0.05)
  border-radius: 3px
  overflow: hidden

  // Center line
  &::after
    content: ''
    position: absolute
    left: 50%
    top: 0
    bottom: 0
    width: 1px
    background: rgba(255, 255, 255, 0.2)

.delta-fill
  position: absolute
  top: 0
  height: 100%
  border-radius: 3px

.delta-val
  font-size: 0.7rem
  min-width: 42px
  text-align: right
  flex-shrink: 0

  &.positive
    color: #27ae60

  &.negative
    color: #e74c3c
</style>
