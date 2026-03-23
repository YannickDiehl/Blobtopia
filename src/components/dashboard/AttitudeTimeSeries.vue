<template lang="pug">
.attitude-time-series
  h3.heading Einstellungen im Zeitverlauf

  .loading-state(v-if="loading")
    p.has-text-grey Lade Zeitreihendaten...

  template(v-else-if="districts")
    .chart-block
      h4.chart-title Zufriedenheit (0–10)
      .chart-container
        line-chart(:chart-data="satisfactionData" :options="satisfactionOptions")

    .chart-block
      h4.chart-title L-R-Selbsteinschätzung (1–10)
      .chart-container
        line-chart(:chart-data="ideologyData" :options="ideologyOptions")

    .chart-block
      h4.chart-title Vertrauen (0–10)
      .chart-container
        line-chart(:chart-data="trustData" :options="trustOptions")

  .empty-state(v-else)
    p.has-text-grey Keine Daten verfügbar.
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_NAMES, DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'
import LineChart from '@/components/charts/LineChart'

export default {
  name: 'AttitudeTimeSeries'
  , components: { LineChart }
  , data: () => ({
    loading: false
    , districts: null
  })
  , computed: {
    ...mapGetters('simulation', ['timelineEvents'])
    , labels() {
      if (!this.districts) return []
      const firstKey = Object.keys(this.districts)[0]
      if (!firstKey) return []
      return this.districts[firstKey].map(p => (p.tick / 365).toFixed(1))
    }
    , eventAnnotations() {
      const events = this.timelineEvents || []
      if (!this.districts) return []
      const firstKey = Object.keys(this.districts)[0]
      if (!firstKey || !this.districts[firstKey].length) return []
      const maxTick = this.districts[firstKey][this.districts[firstKey].length - 1].tick
      return events.filter(e => e.tick <= maxTick)
    }
    , satisfactionData() {
      return this.buildChartData('satisfaction')
    }
    , ideologyData() {
      return this.buildChartData('ideology')
    }
    , trustData() {
      return this.buildChartData('trust')
    }
    , baseOptions() {
      return {
        responsive: true
        , maintainAspectRatio: false
        , tooltips: { mode: 'index', intersect: false }
        , hover: { mode: 'nearest', intersect: true }
        , legend: { labels: { fontColor: '#fffbfc', fontSize: 11 } }
        , elements: { point: { radius: 0 }, line: { tension: 0.3, borderWidth: 2 } }
      }
    }
    , satisfactionOptions() {
      return {
        ...this.baseOptions
        , scales: {
          yAxes: [{ ticks: { min: 0, max: 10, fontColor: '#999' }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
          , xAxes: [{ ticks: { fontColor: '#999', maxTicksLimit: 20 }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
        }
      }
    }
    , ideologyOptions() {
      return {
        ...this.baseOptions
        , scales: {
          yAxes: [{ ticks: { min: 1, max: 10, fontColor: '#999' }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
          , xAxes: [{ ticks: { fontColor: '#999', maxTicksLimit: 20 }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
        }
      }
    }
    , trustOptions() {
      return {
        ...this.baseOptions
        , scales: {
          yAxes: [{ ticks: { min: 0, max: 10, fontColor: '#999' }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
          , xAxes: [{ ticks: { fontColor: '#999', maxTicksLimit: 20 }, gridLines: { color: 'rgba(255,255,255,0.06)' } }]
        }
      }
    }
  }
  , async mounted() {
    this.loading = true
    const data = await this.$store.dispatch('simulation/fetchDashboardAttitudes')
    if (data && data.districts) {
      this.districts = data.districts
    }
    this.loading = false
  }
  , methods: {
    districtHex(d) {
      return DISTRICT_COLORS_HEX[d] || '#999999'
    }
    , buildChartData(metric) {
      if (!this.districts) return { labels: [], datasets: [] }

      const datasets = Object.entries(this.districts).map(([d, points]) => ({
        label: DISTRICT_NAMES[d] || 'Distrikt ' + d
        , data: points.map(p => p[metric])
        , borderColor: this.districtHex(d)
        , backgroundColor: 'transparent'
        , fill: false
        , pointRadius: 0
        , borderWidth: 2
      }))

      // Add event marker lines as a scatter-style overlay
      const events = this.eventAnnotations
      if (events.length > 0 && this.labels.length > 0) {
        const firstKey = Object.keys(this.districts)[0]
        const ticks = this.districts[firstKey].map(p => p.tick)
        events.forEach(ev => {
          const idx = ticks.findIndex(t => t >= ev.tick)
          if (idx >= 0) {
            const markerData = new Array(this.labels.length).fill(null)
            // Create a visible vertical span
            markerData[idx] = 10
            datasets.push({
              label: ''
              , data: markerData
              , borderColor: 'rgba(240, 154, 64, 0.4)'
              , backgroundColor: 'rgba(240, 154, 64, 0.15)'
              , pointRadius: 6
              , pointStyle: 'line'
              , borderWidth: 1
              , borderDash: [4, 4]
              , fill: false
              , showLine: false
            })
          }
        })
      }

      return { labels: this.labels, datasets }
    }
  }
}
</script>

<style lang="sass" scoped>
.attitude-time-series
  padding: 1rem 0

.loading-state, .empty-state
  padding: 2rem
  text-align: center

.chart-block
  margin-bottom: 3.5rem
  padding-top: 1.5rem
  border-top: 1px solid rgba(255, 255, 255, 0.08)

  &:first-child
    border-top: none
    padding-top: 0

.chart-title
  font-size: 1.1rem
  font-weight: 600
  color: #fff
  margin-bottom: 0.75rem
  padding-left: 0.25rem

.chart-container
  height: 320px
  position: relative
  background: rgba(255, 255, 255, 0.02)
  border-radius: 6px
  padding: 0.75rem
  overflow: hidden
</style>
