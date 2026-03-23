<template lang="pug">
.district-pulse
  .district-card(
    v-for="(d, idx) in districtData"
    , :key="idx"
    , :class="{ hot: d.protestHot }"
    , @click="$emit('fly-to-district', idx)"
  )
    .card-header
      .district-dot(:style="{ backgroundColor: d.color }")
      .district-name {{ d.name }}
      .district-pop {{ d.count }}
      .hot-badge(v-if="d.protestHot") HOT

    .card-bars
      .bar-row
        .bar-label Zufr.
        .bar-track
          .bar-fill(:style="{ width: (d.satisfaction / 10 * 100) + '%', backgroundColor: satColor(d.satisfaction) }")
        .bar-value {{ d.satisfaction.toFixed(1) }}

      .bar-row
        .bar-label Vertr.
        .bar-track
          .bar-fill(:style="{ width: (d.trust / 10 * 100) + '%', backgroundColor: '#5c9ded' }")
        .bar-value {{ d.trust.toFixed(1) }}

      .bar-row.ideology-row
        .bar-label L-R
        .ideology-track
          .ideology-marker(:style="{ left: ((d.ideology - 1) / 9 * 100) + '%' }")
        .bar-value {{ d.ideology.toFixed(1) }}
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_NAMES, DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'

export default {
  name: 'DistrictPulse'
  , computed: {
    districtData(){
      const stats = this.statistics
      if (!stats || !stats.districtStats) return []

      return Object.keys(stats.districtStats).map(d => {
        const ds = stats.districtStats[d]
        return {
          name: ds.name || DISTRICT_NAMES[d] || 'Distrikt ' + d
          , color: DISTRICT_COLORS_HEX[d] || '#999'
          , count: ds.count || 0
          , satisfaction: ds.avgSatisfaction || 0
          , trust: ds.avgTrust || 0
          , ideology: ds.avgIdeology || 0
          , protestHot: (ds.avgSatisfaction || 10) < 4
        }
      })
    }
    , ...mapGetters('simulation', {
      statistics: 'statistics'
    })
  }
  , methods: {
    satColor(v) {
      if (v >= 7) return '#4ecca3'
      if (v >= 4) return '#f0c929'
      return '#e74c3c'
    }
  }
}
</script>

<style lang="sass" scoped>
.district-pulse
  padding: 0.5rem

.district-card
  padding: 0.6rem 0.75rem
  margin-bottom: 0.4rem
  border: 1px solid rgba(255, 255, 255, 0.06)
  border-radius: 6px
  cursor: pointer
  transition: all 0.15s
  &:hover
    background: rgba(255, 255, 255, 0.04)
    border-color: rgba(255, 255, 255, 0.12)
  &.hot
    border-color: rgba(231, 76, 60, 0.3)
    background: rgba(231, 76, 60, 0.05)

.card-header
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.4rem

.district-dot
  width: 10px
  height: 10px
  border-radius: 50%
  flex-shrink: 0

.district-name
  font-weight: 600
  font-size: 0.85rem
  color: $grey-lighter
  flex: 1

.district-pop
  font-size: 0.7rem
  color: $grey
  font-family: monospace

.hot-badge
  font-size: 0.55rem
  font-weight: 700
  color: #e74c3c
  background: rgba(231, 76, 60, 0.15)
  padding: 1px 5px
  border-radius: 3px
  letter-spacing: 0.5px

.card-bars
  display: flex
  flex-direction: column
  gap: 3px

.bar-row
  display: flex
  align-items: center
  gap: 0.3rem

.bar-label
  font-size: 0.6rem
  color: $grey
  width: 30px
  text-transform: uppercase
  letter-spacing: 0.3px

.bar-track
  flex: 1
  height: 4px
  background: rgba(255, 255, 255, 0.08)
  border-radius: 2px
  overflow: hidden

.bar-fill
  height: 100%
  border-radius: 2px
  transition: width 0.5s ease

.bar-value
  font-size: 0.7rem
  color: $grey-light
  width: 28px
  text-align: right
  font-family: monospace

.ideology-row
  .ideology-track
    flex: 1
    height: 4px
    background: rgba(255, 255, 255, 0.08)
    border-radius: 2px
    position: relative
  .ideology-marker
    position: absolute
    top: -2px
    width: 8px
    height: 8px
    border-radius: 50%
    background: $grey-lighter
    transform: translateX(-50%)
    border: 1px solid rgba(0, 0, 0, 0.4)
  .bar-value
    &.pos
      color: #4ecca3
    &.neg
      color: #e74c3c
</style>
