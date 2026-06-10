<template lang="pug">
.political-behavior
  h3.heading Politisches Verhalten

  .loading-hint(v-if="!hasData")
    p.has-text-grey Politische Daten werden geladen...

  template(v-else)
    //- Protest readiness over time
    .chart-section
      h4.subheading Protestbereitschaft über Zeit
      .chart-wrap(style="height:300px")
        line-chart(:chart-data="protestTimeData" :options="protestTimeOptions" :styles="chartStyles")

    //- Election turnout trend
    .chart-section(v-if="electionList.length")
      h4.subheading Wahlbeteiligung
      .chart-wrap(style="height:250px")
        line-chart(:chart-data="turnoutData" :options="turnoutOptions" :styles="chartStyles")

    //- Party strength over elections
    .chart-section(v-if="electionList.length")
      h4.subheading Parteistärke über Wahlen
      .chart-wrap(style="height:300px")
        line-chart(:chart-data="partyStrengthData" :options="partyStrengthOptions" :styles="chartStyles")

    //- Protest readiness snapshot
    .chart-section
      h4.subheading Protestbereitschaft aktuell (letzter Tick)
      .protest-bars
        .protest-row(v-for="d in districtIndices" :key="d")
          .protest-label {{ districtName(d) }}
          .protest-bar-bg
            .protest-bar-fill(:style="{ width: (currentProtest(d) * 100) + '%', background: districtHex(d) }")
          .protest-value {{ (currentProtest(d) * 100).toFixed(1) }}%
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_NAMES, DISTRICT_COLORS, NUM_DISTRICTS } from '@/lib/blob-adapter'
import LineChart from '@/components/charts/LineChart.vue'

const PARTY_COLORS = ['#1cc1aa', '#5c9ded', '#f09a40', '#e06c75']
const PARTY_KEYS = ['fortschritt', 'mitte', 'tradition', 'unabhaengige']
const PARTY_LABELS = ['Fortschritt', 'Mitte', 'Tradition', 'Unabhängige']

export default {
  name: 'PoliticalBehavior'
  , components: { LineChart }
  , computed: {
    ...mapGetters('simulation', ['dashboardAttitudes', 'dashboardElections', 'statistics', 'timelineMeta'])
    , attitudes() {
      const raw = this.dashboardAttitudes || null
      return raw ? (raw.districts || raw) : null
    }
    , electionList() {
      const raw = this.dashboardElections || null
      if (!raw) return []
      return raw.elections || raw || []
    }
    , hasData() {
      return this.attitudes || this.electionList.length > 0
    }
    , chartStyles() {
      return { height: '100%', position: 'relative' }
    }
    , districtIndices() {
      const arr = []
      for (let d = 0; d < NUM_DISTRICTS; d++) arr.push(d)
      return arr
    }
    , protestTimeData() {
      if (!this.attitudes) return { labels: [], datasets: [] }
      const datasets = []
      for (let d = 0; d < NUM_DISTRICTS; d++) {
        const series = this.attitudes[String(d)] || []
        datasets.push({
          label: DISTRICT_NAMES[d] || ('Distrikt ' + d)
          , data: series.map(s => s.protest)
          , borderColor: this.districtHex(d)
          , backgroundColor: 'transparent'
          , pointRadius: 0
          , borderWidth: 2
          , fill: false
        })
      }
      // Use ticks from first district as labels
      const firstSeries = this.attitudes['0'] || []
      const labels = firstSeries.map(s => s.tick)
      return { labels, datasets }
    }
    , protestTimeOptions() {
      return {
        responsive: true
        , maintainAspectRatio: false
        , scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999', maxTicksLimit: 12 }
            , title: { display: true, text: 'Tick', color: '#999' }
          }
          , y: {
            grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999' }
            , min: 0, max: 1
            , title: { display: true, text: 'Protestbereitschaft', color: '#999' }
          }
        }
        , plugins: { legend: { labels: { color: '#ccc' } } }
      }
    }
    , turnoutData() {
      if (!this.electionList.length) return { labels: [], datasets: [] }
      const labels = this.electionList.map(e => 'Jahr ' + (e.year || e.tick))
      const data = this.electionList.map(e => {
        if (!e.total || e.total === 0) return 0
        return ((e.turnout / e.total) * 100).toFixed(1)
      })
      return {
        labels
        , datasets: [{
          label: 'Wahlbeteiligung (%)'
          , data
          , borderColor: '#1cc1aa'
          , backgroundColor: 'rgba(28,193,170,0.1)'
          , pointRadius: 3
          , borderWidth: 2
          , fill: true
        }]
      }
    }
    , turnoutOptions() {
      return {
        responsive: true
        , maintainAspectRatio: false
        , scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999' }
          }
          , y: {
            grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999' }
            , min: 0, max: 100
            , title: { display: true, text: '%', color: '#999' }
          }
        }
        , plugins: { legend: { labels: { color: '#ccc' } } }
      }
    }
    , partyStrengthData() {
      if (!this.electionList.length) return { labels: [], datasets: [] }
      const labels = this.electionList.map(e => 'Jahr ' + (e.year || e.tick))
      const datasets = PARTY_KEYS.map((key, i) => ({
        label: PARTY_LABELS[i]
        , data: this.electionList.map(e => e[key] || 0)
        , borderColor: PARTY_COLORS[i]
        , backgroundColor: 'transparent'
        , pointRadius: 3
        , borderWidth: 2
        , fill: false
      }))
      return { labels, datasets }
    }
    , partyStrengthOptions() {
      return {
        responsive: true
        , maintainAspectRatio: false
        , scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999' }
          }
          , y: {
            grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999' }
            , beginAtZero: true
            , title: { display: true, text: 'Stimmen', color: '#999' }
          }
        }
        , plugins: { legend: { labels: { color: '#ccc' } } }
      }
    }
  }
  , methods: {
    districtHex(d) {
      const hex = DISTRICT_COLORS[d] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    , districtName(d) {
      return DISTRICT_NAMES[d] || ('Distrikt ' + d)
    }
    , currentProtest(d) {
      if (!this.attitudes) return 0
      const series = this.attitudes[String(d)] || []
      if (!series.length) return 0
      return series[series.length - 1].protest || 0
    }
  }
  , mounted() {
    this.$store.dispatch('simulation/fetchDashboardAttitudes')
    this.$store.dispatch('simulation/fetchDashboardElections')
  }
}
</script>

<style lang="sass" scoped>
.political-behavior
  padding: 1rem 0

.chart-section
  margin-bottom: 3.5rem
  padding-top: 1.5rem
  border-top: 1px solid rgba(255, 255, 255, 0.08)

  &:first-child
    border-top: none
    padding-top: 0

.subheading
  font-size: 1.1rem
  font-weight: 600
  color: #fff
  margin-bottom: 0.75rem
  padding-left: 0.25rem

.chart-wrap
  position: relative
  overflow: hidden

.protest-bars
  display: flex
  flex-direction: column
  gap: 0.5rem

.protest-row
  display: flex
  align-items: center
  gap: 0.75rem

.protest-label
  width: 100px
  font-size: 0.8rem
  color: $text
  text-align: right
  flex-shrink: 0

.protest-bar-bg
  flex: 1
  height: 22px
  background: rgba(255, 255, 255, 0.05)
  border-radius: 4px
  overflow: hidden

.protest-bar-fill
  height: 100%
  border-radius: 4px
  transition: width 0.3s ease

.protest-value
  width: 50px
  font-size: 0.8rem
  color: $grey
  flex-shrink: 0
</style>
