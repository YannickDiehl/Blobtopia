<template lang="pug">
.election-results
  h3.heading Wahlergebnisse

  .loading-state(v-if="loading")
    p.has-text-grey Wahldaten werden geladen...

  template(v-else-if="elections.length")
    //- Grouped Bar Chart
    .chart-container
      bar-chart(:chart-data="barChartData" :options="barChartOptions" :style="{ height: '350px', position: 'relative' }")

    //- Turnout Line Chart
    .chart-container
      h4.subheading Wahlbeteiligung
      line-chart(:chart-data="turnoutChartData" :options="turnoutChartOptions" :style="{ height: '200px', position: 'relative' }")

    //- Summary Table
    .table-section
      h4.subheading Zusammenfassung
      table.election-table
        thead
          tr
            th Wahl
            th Jahr
            th Fortschritt
            th Mitte
            th Tradition
            th Unabh.
            th Beteiligung
        tbody
          tr(v-for="(e, i) in elections" :key="i")
            td {{ i + 1 }}
            td {{ e.year }}
            td(:style="{ color: partyColors[0] }") {{ partyPct(e, 'fortschritt') }}%
            td(:style="{ color: partyColors[1] }") {{ partyPct(e, 'mitte') }}%
            td(:style="{ color: partyColors[2] }") {{ partyPct(e, 'tradition') }}%
            td(:style="{ color: partyColors[3] }") {{ partyPct(e, 'unabhaengige') }}%
            td {{ e.turnout }}/{{ e.total }} ({{ turnoutPct(e) }}%)

  p.has-text-grey(v-else) Keine Wahldaten vorhanden.
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import BarChart from '@/components/charts/BarChart.vue'
import LineChart from '@/components/charts/LineChart.vue'

const PARTY_NAMES = ['Fortschritt', 'Mitte', 'Tradition', 'Unabhängige']
const PARTY_COLORS = ['#e74c3c', '#f0c929', '#3498db', '#95a5a6']

export default {
  name: 'ElectionResults'
  , components: { BarChart, LineChart }
  , data: () => ({
    loading: true
  })
  , computed: {
    ...mapState(useSimulationStore, ['dashboardElections'])
    , elections() {
      const cached = this.dashboardElections
      return cached && cached.elections ? cached.elections : []
    }
    , partyColors() {
      return PARTY_COLORS
    }
    , barChartData() {
      const pct = (e, field) => {
        const t = e.fortschritt + e.mitte + e.tradition + e.unabhaengige
        return t ? +(e[field] / t * 100).toFixed(1) : 0
      }
      return {
        labels: this.elections.map((e, i) => `Wahl ${i + 1} (J${e.year})`)
        , datasets: [
          { label: PARTY_NAMES[0], data: this.elections.map(e => pct(e, 'fortschritt')), backgroundColor: PARTY_COLORS[0] }
          , { label: PARTY_NAMES[1], data: this.elections.map(e => pct(e, 'mitte')), backgroundColor: PARTY_COLORS[1] }
          , { label: PARTY_NAMES[2], data: this.elections.map(e => pct(e, 'tradition')), backgroundColor: PARTY_COLORS[2] }
          , { label: PARTY_NAMES[3], data: this.elections.map(e => pct(e, 'unabhaengige')), backgroundColor: PARTY_COLORS[3] }
        ]
      }
    }
    , barChartOptions() {
      return {
        responsive: true
        , maintainAspectRatio: false
        , plugins: { legend: { labels: { color: '#fffbfc' } } }
        , scales: {
          x: { ticks: { color: '#fffbfc' }, grid: { color: 'rgba(255,255,255,0.06)' } }
          , y: { beginAtZero: true, max: 60, ticks: { color: '#fffbfc', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    }
    , turnoutChartData() {
      return {
        labels: this.elections.map((e, i) => `Wahl ${i + 1} (J${e.year})`)
        , datasets: [{
          label: 'Beteiligung (%)'
          , data: this.elections.map(e => e.total > 0 ? Math.round(e.turnout / e.total * 1000) / 10 : 0)
          , borderColor: '#1cc1aa'
          , backgroundColor: 'rgba(28, 193, 170, 0.15)'
          , fill: true
          , pointBackgroundColor: '#1cc1aa'
        }]
      }
    }
    , turnoutChartOptions() {
      return {
        responsive: true
        , maintainAspectRatio: false
        , plugins: { legend: { labels: { color: '#fffbfc' } } }
        , scales: {
          x: { ticks: { color: '#fffbfc' }, grid: { color: 'rgba(255,255,255,0.06)' } }
          , y: { beginAtZero: true, max: 100, ticks: { color: '#fffbfc', callback: v => v + '%' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    }
  }
  , methods: {
    turnoutPct(e) {
      if (!e.total) return 0
      return Math.round(e.turnout / e.total * 1000) / 10
    }
    , partyPct(e, field) {
      const total = e.fortschritt + e.mitte + e.tradition + e.unabhaengige
      if (!total) return '0.0'
      return (e[field] / total * 100).toFixed(1)
    }
  }
  , async mounted() {
    await useSimulationStore().fetchDashboardElections()
    this.loading = false
  }
}
</script>

<style lang="sass" scoped>
.election-results
  padding: 1rem 0

.loading-state
  padding: 2rem 0
  text-align: center

.chart-container
  margin-bottom: 1.5rem

.subheading
  font-size: 0.95rem
  color: $grey-lighter
  margin-bottom: 0.5rem

.table-section
  margin-top: 1rem

.election-table
  width: 100%
  font-size: 0.8rem
  border-collapse: collapse

  th, td
    padding: 0.4rem 0.6rem
    text-align: left
    border-bottom: 1px solid rgba(255, 255, 255, 0.06)

  th
    color: $grey
    font-weight: 600
    font-size: 0.7rem
    text-transform: uppercase

  td
    color: $text
</style>
