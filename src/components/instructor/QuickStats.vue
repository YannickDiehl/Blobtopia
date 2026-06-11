<template lang="pug">
.quick-stats
  .stats-header
    span Quick Stats

  .mini-chart(v-if="hasSummary")
    .chart-title Durchschn. Zufriedenheit
    LineChart(:chart-data="satisfactionData", :options="chartOptions", :height="100")

  .mini-chart(v-if="hasSummary")
    .chart-title Durchschn. Vertrauen
    LineChart(:chart-data="trustData", :options="chartOptions", :height="100")

  .mini-chart(v-if="hasSummary")
    .chart-title Protest-Bereitschaft
    LineChart(:chart-data="protestData", :options="chartOptionsProtest", :height="100")

  .mini-chart(v-if="districtStats")
    .chart-title Zufriedenheit nach Distrikt
    .district-bars
      .district-bar-row(v-for="(d, idx) in districtBarData", :key="idx")
        .bar-label(:style="{ color: d.color }") {{ d.name }}
        .bar-track
          .bar-fill(:style="{ width: (d.value / 10 * 100) + '%', backgroundColor: d.color }")
        .bar-val {{ d.value.toFixed(1) }}

  .mini-chart(v-if="districtStats")
    .chart-title Vertrauen nach Distrikt
    .district-bars
      .district-bar-row(v-for="(d, idx) in trustBarData", :key="'t'+idx")
        .bar-label(:style="{ color: d.color }") {{ d.name }}
        .bar-track
          .bar-fill(:style="{ width: (d.value / 10 * 100) + '%', backgroundColor: '#5c9ded' }")
        .bar-val {{ d.value.toFixed(1) }}

  .mini-chart(v-if="districtStats")
    .chart-title Wahlbereitschaft nach Distrikt
    .district-bars
      .district-bar-row(v-for="(d, idx) in voterBarData", :key="'v'+idx")
        .bar-label(:style="{ color: d.color }") {{ d.name }}
        .bar-track
          .bar-fill(:style="{ width: d.pct + '%', backgroundColor: d.color }")
        .bar-val {{ d.pct }}%

  .mini-chart(v-if="districtStats")
    .chart-title Protestbereitschaft nach Distrikt
    .district-bars
      .district-bar-row(v-for="(d, idx) in protestBarData", :key="'p'+idx")
        .bar-label(:style="{ color: d.color }") {{ d.name }}
        .bar-track
          .bar-fill(:style="{ width: (d.value * 100) + '%', backgroundColor: '#e74c3c' }")
        .bar-val {{ (d.value * 100).toFixed(0) }}%

  .empty-state(v-if="!hasSummary && !districtStats")
    p Lade Daten...
    button.load-btn(@click="loadData") Daten laden
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import LineChart from '@/components/charts/LineChart'
import { DISTRICT_NAMES, DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'

export default {
  name: 'QuickStats'
  , components: { LineChart }
  , computed: {
    hasSummary(){
      return !!this.timelineSummary && this.timelineSummary.ticks && this.timelineSummary.ticks.length > 0
    }
    , districtStats(){
      const stats = this.statistics
      return stats && stats.districtStats ? stats.districtStats : null
    }
    , districtBarData(){
      if (!this.districtStats) return []
      return Object.keys(this.districtStats).map(d => ({
        name: this.districtStats[d].name || DISTRICT_NAMES[d] || 'D' + d
        , color: DISTRICT_COLORS_HEX[d] || '#999'
        , value: this.districtStats[d].avgSatisfaction || 0
      }))
    }
    , trustBarData(){
      if (!this.districtStats) return []
      return Object.keys(this.districtStats).map(d => ({
        name: this.districtStats[d].name || DISTRICT_NAMES[d] || 'D' + d
        , color: DISTRICT_COLORS_HEX[d] || '#999'
        , value: this.districtStats[d].avgTrust || 0
      }))
    }
    , voterBarData(){
      if (!this.districtStats) return []
      return Object.keys(this.districtStats).map(d => {
        const s = this.districtStats[d]
        const pct = s.count > 0 ? Math.round(s.voters / s.count * 100) : 0
        return {
          name: s.name || DISTRICT_NAMES[d] || 'D' + d
          , color: DISTRICT_COLORS_HEX[d] || '#999'
          , pct
        }
      })
    }
    , protestBarData(){
      if (!this.districtStats) return []
      return Object.keys(this.districtStats).map(d => ({
        name: this.districtStats[d].name || DISTRICT_NAMES[d] || 'D' + d
        , color: DISTRICT_COLORS_HEX[d] || '#999'
        , value: this.districtStats[d].avgProtestReadiness || 0
      }))
    }
    , chartOptions(){
      return {
        responsive: true
        , maintainAspectRatio: false
        , plugins: { legend: { display: false }, tooltip: { enabled: false } }
        , elements: { point: { radius: 0 }, line: { borderWidth: 1.5 } }
        , scales: {
          x: { display: false }
          , y: { display: true, min: 0, max: 10, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    }
    , chartOptionsProtest(){
      return { ...this.chartOptions, scales: { ...this.chartOptions.scales, y: { display: true, min: 0, max: 10, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } } } }
    }
    , satisfactionData(){
      if (!this.hasSummary) return { labels: [], datasets: [] }
      const s = this.timelineSummary
      return {
        labels: s.ticks
        , datasets: [{ data: s.global.satisfaction, borderColor: '#4ecca3', backgroundColor: 'rgba(78,204,163,0.08)', fill: true }]
      }
    }
    , trustData(){
      if (!this.hasSummary) return { labels: [], datasets: [] }
      const s = this.timelineSummary
      return {
        labels: s.ticks
        , datasets: [{ data: s.global.trust, borderColor: '#5c9ded', backgroundColor: 'rgba(92,157,237,0.08)', fill: true }]
      }
    }
    , protestData(){
      if (!this.hasSummary) return { labels: [], datasets: [] }
      const s = this.timelineSummary
      return {
        labels: s.ticks
        , datasets: [{ data: s.global.protest, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.08)', fill: true }]
      }
    }
    , ...mapState(useSimulationStore, {
      timelineSummary: 'timelineSummary'
      , statistics: 'statistics'
    })
    , ...mapStores(useSimulationStore)
  }
  , mounted(){
    this.loadData()
  }
  , methods: {
    loadData(){
      this.simulationStore.fetchTimelineSummary()
    }
  }
}
</script>

<style lang="sass" scoped>
.quick-stats
  padding: 0.5rem

.stats-header
  display: flex
  align-items: center
  justify-content: space-between
  padding: 0.5rem 0.5rem 0.75rem
  font-weight: 600
  font-size: 0.85rem
  color: $grey-lighter

.mini-chart
  margin-bottom: 1rem
  padding: 0 0.5rem

.chart-title
  font-size: 0.65rem
  color: $grey
  text-transform: uppercase
  letter-spacing: 0.5px
  margin-bottom: 0.3rem

.district-bars
  display: flex
  flex-direction: column
  gap: 4px

.district-bar-row
  display: flex
  align-items: center
  gap: 0.4rem

.bar-label
  font-size: 0.7rem
  font-weight: 600
  width: 80px
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.bar-track
  flex: 1
  height: 6px
  background: rgba(255, 255, 255, 0.06)
  border-radius: 3px
  overflow: hidden

.bar-fill
  height: 100%
  border-radius: 3px
  transition: width 0.5s ease

.bar-val
  font-size: 0.7rem
  color: $grey-light
  font-family: monospace
  width: 28px
  text-align: right

.empty-state
  text-align: center
  padding: 2rem 1rem
  color: $grey

.load-btn
  margin-top: 0.5rem
  background: rgba(78, 204, 163, 0.15)
  border: 1px solid rgba(78, 204, 163, 0.3)
  border-radius: 4px
  color: $primary
  padding: 4px 12px
  cursor: pointer
  font-size: 0.8rem
  &:hover
    background: rgba(78, 204, 163, 0.25)
</style>
