<template lang="pug">
.demographic-breakdown
  h3.heading Demografie

  .loading-hint(v-if="!blobList")
    p.has-text-grey Blob-Liste wird geladen...

  template(v-else)
    //- Summary stats
    .info-cards
      .info-card
        .info-value {{ blobList.length }}
        .info-label Bevölkerung
      .info-card
        .info-value {{ meanAge }}
        .info-label Durchschnittsalter
      .info-card
        .info-value {{ meanIncome }}
        .info-label Mittleres Einkommen
      .info-card
        .info-value {{ educationBreakdown }}
        .info-label Bildungsverteilung

    //- Age Distribution
    .chart-section
      h4.subheading Altersverteilung
      .view-toggle
        b-radio-button(v-model="ageView" native-value="district" size="is-small" type="is-primary") Pro Distrikt
        b-radio-button(v-model="ageView" native-value="total" size="is-small" type="is-primary") Gesamt
      .chart-wrap(style="height:300px")
        bar-chart(:chart-data="ageChartData" :options="stackedBarOptions")

    //- Education Distribution
    .chart-section
      h4.subheading Bildungsverteilung (pro Distrikt)
      .chart-wrap(style="height:300px")
        bar-chart(:chart-data="educationChartData" :options="stackedBarOptions")

    //- Income Distribution
    .chart-section
      h4.subheading Einkommensverteilung (pro Distrikt)
      .chart-wrap(style="height:300px")
        bar-chart(:chart-data="incomeChartData" :options="stackedBarOptions")

    //- Household type distribution
    .chart-section
      h4.subheading Haushaltstypen (theoretische Verteilung)
      .household-info
        .household-row
          span.household-dot(style="background:#1cc1aa")
          span 42% Single
        .household-row
          span.household-dot(style="background:#5c9ded")
          span 33% Paare
        .household-row
          span.household-dot(style="background:#f09a40")
          span 12% Kleine Familien
        .household-row
          span.household-dot(style="background:#e06c75")
          span 13% Große Familien
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_NAMES, DISTRICT_COLORS, NUM_DISTRICTS } from '@/lib/blob-adapter'
import BarChart from '@/components/charts/BarChart.vue'

export default {
  name: 'DemographicBreakdown'
  , components: { BarChart }
  , data: () => ({
    ageView: 'district'
  })
  , computed: {
    ...mapGetters('simulation', ['dashboardBlobList'])
    , blobList() {
      return this.dashboardBlobList || null
    }
    , blobs() {
      if (!this.blobList) return []
      return this.blobList.globs || this.blobList.blobs || this.blobList
    }
    , meanAge() {
      if (!this.blobs.length) return '-'
      const sum = this.blobs.reduce((a, g) => a + (g.age || 0), 0)
      return (sum / this.blobs.length).toFixed(1)
    }
    , meanIncome() {
      if (!this.blobs.length) return '-'
      const sum = this.blobs.reduce((a, g) => a + (g.income || 0), 0)
      return Math.round(sum / this.blobs.length)
    }
    , educationBreakdown() {
      if (!this.blobs.length) return '-'
      const counts = [0, 0, 0, 0]
      this.blobs.forEach(g => {
        const lv = g.education_level || 0
        if (lv >= 0 && lv <= 3) counts[lv]++
      })
      const n = this.blobs.length
      return counts.map((c, i) => {
        const labels = ['K', 'G', 'H', 'A']
        return labels[i] + ' ' + Math.round((c / n) * 100) + '%'
      }).join(' | ')
    }
    , ageBins() {
      return [0, 10, 20, 30, 40, 50, 60, 70]
    }
    , ageBinLabels() {
      return this.ageBins.map((b, i) => {
        const upper = (i < this.ageBins.length - 1) ? this.ageBins[i + 1] - 1 : '79'
        return b + '-' + upper
      })
    }
    , ageChartData() {
      if (!this.blobs.length) return { labels: [], datasets: [] }
      if (this.ageView === 'total') {
        const counts = this.ageBins.map(() => 0)
        this.blobs.forEach(g => {
          const idx = this.binIndex(g.age, this.ageBins)
          if (idx >= 0) counts[idx]++
        })
        return {
          labels: this.ageBinLabels
          , datasets: [{
            label: 'Gesamt'
            , data: counts
            , backgroundColor: '#1cc1aa'
          }]
        }
      }
      return {
        labels: this.ageBinLabels
        , datasets: this.districtDatasets(g => this.binIndex(g.age, this.ageBins), this.ageBins.length)
      }
    }
    , educationLabels() {
      return ['Keine', 'Grundbildung', 'Höhere Bildung', 'Akademisch']
    }
    , educationChartData() {
      if (!this.blobs.length) return { labels: [], datasets: [] }
      return {
        labels: this.educationLabels
        , datasets: this.districtDatasets(g => g.education_level || 0, 4)
      }
    }
    , incomeBins() {
      return [0, 1000, 2000, 3000, 4000, 5000, 6000]
    }
    , incomeBinLabels() {
      return this.incomeBins.map((b, i) => {
        const upper = (i < this.incomeBins.length - 1) ? this.incomeBins[i + 1] : '7000'
        return b + '-' + upper
      })
    }
    , incomeChartData() {
      if (!this.blobs.length) return { labels: [], datasets: [] }
      return {
        labels: this.incomeBinLabels
        , datasets: this.districtDatasets(g => this.binIndex(g.income, this.incomeBins), this.incomeBins.length)
      }
    }
    , stackedBarOptions() {
      return {
        responsive: true
        , maintainAspectRatio: false
        , scales: {
          x: {
            stacked: true
            , grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999' }
          }
          , y: {
            stacked: true
            , beginAtZero: true
            , grid: { color: 'rgba(255,255,255,0.06)' }
            , ticks: { color: '#999' }
          }
        }
        , plugins: {
          legend: {
            labels: { color: '#ccc' }
          }
        }
      }
    }
  }
  , methods: {
    districtHex(d) {
      const hex = DISTRICT_COLORS[d] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    , binIndex(value, bins) {
      for (let i = bins.length - 1; i >= 0; i--) {
        if (value >= bins[i]) return i
      }
      return 0
    }
    , districtDatasets(indexFn, numBins) {
      const districts = []
      for (let d = 0; d < NUM_DISTRICTS; d++) districts.push(d)
      return districts.map(d => {
        const counts = new Array(numBins).fill(0)
        this.blobs.filter(g => g.district === d).forEach(g => {
          const idx = indexFn(g)
          if (idx >= 0 && idx < numBins) counts[idx]++
        })
        return {
          label: DISTRICT_NAMES[d] || ('Distrikt ' + d)
          , data: counts
          , backgroundColor: this.districtHex(d)
        }
      })
    }
  }
  , mounted() {
    this.$store.dispatch('simulation/fetchDashboardBlobList')
  }
}
</script>

<style lang="sass" scoped>
.demographic-breakdown
  padding: 1rem 0

.info-cards
  display: flex
  gap: 0.75rem
  margin-bottom: 1.5rem
  flex-wrap: wrap

.info-card
  flex: 1 1 140px
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px
  padding: 0.75rem 1rem
  text-align: center

  .info-value
    font-size: 1.6rem
    font-weight: 700
    color: $primary

  .info-label
    font-size: 0.75rem
    color: $grey
    margin-top: 0.25rem

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

.view-toggle
  margin-bottom: 0.5rem

.chart-wrap
  position: relative

.household-info
  display: flex
  flex-wrap: wrap
  gap: 1rem
  padding: 0.75rem
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px

.household-row
  display: flex
  align-items: center
  gap: 0.4rem
  font-size: 0.85rem
  color: $text

.household-dot
  width: 10px
  height: 10px
  border-radius: 50%
  display: inline-block
</style>
