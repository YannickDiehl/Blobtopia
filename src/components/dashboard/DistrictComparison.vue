<template lang="pug">
.district-comparison
  h3.heading Distrikte

  .loading-state(v-if="loading")
    p.has-text-grey Lade Daten...

  .district-cards(v-else-if="stats")
    .district-card(v-for="d in 5" :key="d - 1")
      .district-header
        .district-dot(:style="{ backgroundColor: districtHex(d - 1) }")
        span.district-name {{ districtNames[d - 1] }}
        span.district-count {{ districtStat(d - 1).count }} Blobs

      .district-bars(v-if="districtStat(d - 1).count > 0")
        //- Satisfaction
        .bar-row
          span.bar-label Zufriedenheit
          .bar-track
            .bar-fill(:style="{ width: (districtStat(d - 1).avgSatisfaction / 10 * 100) + '%', backgroundColor: satisfactionColor(districtStat(d - 1).avgSatisfaction) }")
          span.bar-val {{ districtStat(d - 1).avgSatisfaction }}

        //- Ideology
        .bar-row
          span.bar-label L-R
          .bar-track.ideo-track
            .bar-center
            .bar-fill-ideo(:style="ideologyBarStyle(districtStat(d - 1).avgIdeology)")
          span.bar-val {{ districtStat(d - 1).avgIdeology }}

        //- Trust
        .bar-row
          span.bar-label Vertrauen
          .bar-track
            .bar-fill(:style="{ width: (districtStat(d - 1).avgTrust / 10 * 100) + '%', backgroundColor: '#5c9ded' }")
          span.bar-val {{ districtStat(d - 1).avgTrust }}

        //- Income
        .bar-row
          span.bar-label Einkommen
          .bar-track
            .bar-fill(:style="{ width: incomeBarWidth(districtStat(d - 1).avgIncome) + '%', backgroundColor: '#f0c929' }")
          span.bar-val {{ districtStat(d - 1).avgIncome }}

        //- Protest (if available)
        .bar-row(v-if="districtStat(d - 1).avgProtest != null")
          span.bar-label Protestbereitschaft
          .bar-track
            .bar-fill(:style="{ width: (districtStat(d - 1).avgProtest / 10 * 100) + '%', backgroundColor: '#e74c3c' }")
          span.bar-val {{ districtStat(d - 1).avgProtest }}

        //- Education distribution
        .distribution-section(v-if="educationDist[d - 1]")
          span.dist-label Bildung
          .stacked-bar
            .stacked-segment(
              v-for="(seg, si) in educationDist[d - 1]"
              :key="'edu' + si"
              :style="{ width: seg.pct + '%', backgroundColor: eduColors[si] }"
              :title="seg.label + ': ' + seg.count"
            )
          .stacked-legend
            span.legend-item(v-for="(seg, si) in educationDist[d - 1]" :key="'edl' + si")
              .legend-dot(:style="{ backgroundColor: eduColors[si] }")
              | {{ seg.label }} ({{ seg.count }})

        //- Age distribution
        .distribution-section(v-if="ageDist[d - 1]")
          span.dist-label Alter
          .stacked-bar
            .stacked-segment(
              v-for="(seg, si) in ageDist[d - 1]"
              :key="'age' + si"
              :style="{ width: seg.pct + '%', backgroundColor: ageColors[si] }"
              :title="seg.label + ': ' + seg.count"
            )
          .stacked-legend
            span.legend-item(v-for="(seg, si) in ageDist[d - 1]" :key="'agl' + si")
              .legend-dot(:style="{ backgroundColor: ageColors[si] }")
              | {{ seg.label }} ({{ seg.count }})

        //- Party affiliation doughnut
        .distribution-section(v-if="partyData[d - 1]")
          span.dist-label Parteien
          .doughnut-wrap
            doughnut-chart(:chart-data="partyData[d - 1]" :options="doughnutOptions")
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { DISTRICT_NAMES, DISTRICT_COLORS_HEX, PARTY_NAMES, EDUCATION_LABELS, AGE_GROUP_LABELS } from '@/lib/blob-adapter'
import DoughnutChart from '@/components/charts/DoughnutChart'

export default {
  name: 'DistrictComparison'
  , components: { DoughnutChart }
  , data: () => ({
    loading: false
    , districtNames: DISTRICT_NAMES
    , blobList: null
    , eduColors: ['#999999', '#f09a40', '#5c9ded', '#4ecca3']
    , ageColors: ['#4ecca3', '#f0c929', '#e74c3c']
    , partyColors: ['#4ecca3', '#f0c929', '#e74c3c', '#999999']
    , doughnutOptions: {
      responsive: true
      , maintainAspectRatio: true
      , plugins: { legend: { display: true, position: 'bottom', labels: { color: '#fffbfc', font: { size: 10 }, boxWidth: 10 } } }
      , cutout: '55%'
    }
  })
  , computed: {
    ...mapState(useSimulationStore, ['statistics'])
    , stats() {
      return this.statistics && this.statistics.districtStats
    }
    , educationDist() {
      return this.computeDistributions('education')
    }
    , ageDist() {
      return this.computeDistributions('age')
    }
    , partyData() {
      const result = {}
      if (!this.blobList || !(this.blobList.globs || this.blobList.blobs)) return result
      for (let d = 0; d < 5; d++) {
        const blobs = (this.blobList.globs || this.blobList.blobs).filter(g => g.district === d)
        if (blobs.length === 0) continue
        const counts = [0, 0, 0, 0]
        blobs.forEach(g => {
          const p = g.political_state && g.political_state.party_affiliation != null
            ? g.political_state.party_affiliation : 3
          if (p >= 0 && p < 4) counts[p]++
        })
        result[d] = {
          labels: PARTY_NAMES.slice()
          , datasets: [{
            data: counts
            , backgroundColor: this.partyColors
            , borderWidth: 0
          }]
        }
      }
      return result
    }
  }
  , async mounted() {
    this.loading = true
    const data = await useSimulationStore().fetchDashboardBlobList()
    this.blobList = data
    this.loading = false
  }
  , methods: {
    districtStat(d) {
      if (!this.stats || !this.stats[d]) {
        return { count: 0, avgSatisfaction: 0, avgIdeology: 0, avgTrust: 0, avgIncome: 0 }
      }
      return this.stats[d]
    }
    , districtHex(d) {
      return DISTRICT_COLORS_HEX[d] || '#999999'
    }
    , satisfactionColor(val) {
      if (val >= 7) return '#4ecca3'
      if (val >= 4) return '#f0c929'
      return '#e74c3c'
    }
    , ideologyBarStyle(ideo) {
      const center = 50
      const offset = (ideo / 5) * 50
      if (offset >= 0) {
        return { left: center + '%', width: offset + '%', backgroundColor: '#e74c3c' }
      } else {
        return { left: (center + offset) + '%', width: (-offset) + '%', backgroundColor: '#3498db' }
      }
    }
    , incomeBarWidth(income) {
      // Normalize income (800-7000 EUR range) to 0-100%
      if (income > 100) {
        return Math.min(100, Math.max(0, ((income - 800) / 6200) * 100))
      }
      // Already 0-10 scale
      return (income / 10) * 100
    }
    , computeDistributions(type) {
      const result = {}
      if (!this.blobList || !(this.blobList.globs || this.blobList.blobs)) return result
      for (let d = 0; d < 5; d++) {
        const blobs = (this.blobList.globs || this.blobList.blobs).filter(g => g.district === d)
        if (blobs.length === 0) continue
        if (type === 'education') {
          const counts = [0, 0, 0, 0]
          blobs.forEach(g => {
            const e = g.education_level != null ? g.education_level : 0
            if (e >= 0 && e < 4) counts[e]++
          })
          result[d] = counts.map((c, i) => ({
            label: EDUCATION_LABELS[i]
            , count: c
            , pct: blobs.length > 0 ? (c / blobs.length * 100) : 0
          }))
        } else {
          const counts = [0, 0, 0]
          blobs.forEach(g => {
            const age = g.age != null ? g.age : 30
            const group = age < 30 ? 0 : age < 60 ? 1 : 2
            counts[group]++
          })
          result[d] = counts.map((c, i) => ({
            label: AGE_GROUP_LABELS[i]
            , count: c
            , pct: blobs.length > 0 ? (c / blobs.length * 100) : 0
          }))
        }
      }
      return result
    }
  }
}
</script>

<style lang="sass" scoped>
.district-comparison
  padding: 1rem 0

.loading-state
  padding: 2rem
  text-align: center

.district-cards
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr))
  gap: 0.75rem

.district-card
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px
  padding: 0.75rem

.district-header
  display: flex
  align-items: center
  gap: 0.5rem
  margin-bottom: 0.5rem

  .district-dot
    width: 10px
    height: 10px
    border-radius: 50%

  .district-name
    font-weight: 600
    font-size: 0.9rem

  .district-count
    margin-left: auto
    font-size: 0.75rem
    color: $grey

.district-bars
  .bar-row
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.25rem

  .bar-label
    width: 100px
    font-size: 0.7rem
    color: $grey
    flex-shrink: 0

  .bar-track
    flex: 1
    height: 6px
    background: rgba(255, 255, 255, 0.08)
    border-radius: 3px
    overflow: hidden
    position: relative

  .bar-fill
    height: 100%
    border-radius: 3px

  .ideo-track
    overflow: visible
    .bar-center
      position: absolute
      left: 50%
      top: -1px
      bottom: -1px
      width: 1px
      background: rgba(255, 255, 255, 0.2)
    .bar-fill-ideo
      position: absolute
      height: 100%
      border-radius: 3px

  .bar-val
    width: 40px
    text-align: right
    font-size: 0.7rem

.distribution-section
  margin-top: 0.5rem

  .dist-label
    font-size: 0.7rem
    color: $grey
    display: block
    margin-bottom: 0.2rem

.stacked-bar
  display: flex
  height: 8px
  border-radius: 4px
  overflow: hidden
  margin-bottom: 0.2rem

  .stacked-segment
    min-width: 2px
    transition: width 0.3s

.stacked-legend
  display: flex
  flex-wrap: wrap
  gap: 0.4rem
  font-size: 0.6rem
  color: $grey

  .legend-item
    display: flex
    align-items: center
    gap: 0.2rem

  .legend-dot
    width: 6px
    height: 6px
    border-radius: 50%

.doughnut-wrap
  max-width: 200px
  margin: 0.25rem auto 0
</style>
