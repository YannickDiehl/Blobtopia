<template lang="pug">
.simulation-statistics.scrollbars
  .stats-header
    h2.title.is-size-4 Gesellschaftsstatistik
    .stats-meta(v-if="statistics")
      span Jahr {{ statistics.year || 0 }}
      span |
      span Tick {{ statistics.tick || 0 }}
      span |
      span Bevölkerung: {{ statistics.population.mean }}

  //- Demographics from API
  .stats-section(v-if="demographics")
    h3.heading.section-title Distrikte

    .district-cards
      .district-card(v-for="d in demographics.districts", :key="d.district")
        .district-header
          .district-dot(:style="{ backgroundColor: districtHex(d.district) }")
          span.district-name {{ districtNames[d.district] }}
          span.district-count {{ d.count }} Blobs
        .district-bars(v-if="d.count > 0")
          .bar-row
            span.bar-label Zufriedenheit
            .bar-track
              .bar-fill(:style="{ width: (d.avg_satisfaction / 10 * 100) + '%', backgroundColor: satisfactionColor(d.avg_satisfaction) }")
            span.bar-val {{ d.avg_satisfaction }}
          .bar-row
            span.bar-label L-R
            .bar-track.ideo-track
              .bar-center
              .bar-fill-ideo(:style="ideologyBarStyle(d.avg_ideology)")
            span.bar-val {{ d.avg_ideology }}
          .bar-row
            span.bar-label Vertrauen
            .bar-track
              .bar-fill(:style="{ width: (d.avg_trust / 10 * 100) + '%', backgroundColor: '#5c9ded' }")
            span.bar-val {{ d.avg_trust }}
          .bar-row
            span.bar-label Einkommen
            .bar-track
              .bar-fill(:style="{ width: (d.avg_income / 10 * 100) + '%', backgroundColor: '#f0c929' }")
            span.bar-val {{ d.avg_income }}
          .parties-row
            span.party-label(v-for="(count, name) in d.parties", :key="name")
              span.party-name {{ name }}
              span.party-count {{ count }}

  //- Population bar chart
  .stats-section(v-if="statistics && statistics.districtStats")
    h3.heading.section-title Bevölkerung pro Distrikt
    .bar-chart
      .chart-bar(v-for="(ds, idx) in districtStatsArray", :key="idx")
        .chart-bar-fill(:style="{ height: barHeight(ds.count) + '%', backgroundColor: districtHex(idx) }")
        .chart-bar-label {{ ds.name }}
        .chart-bar-value {{ ds.count }}

  //- Ideology histogram
  .stats-section(v-if="statistics && statistics.ideologyBuckets")
    h3.heading.section-title L-R-Selbsteinschätzung (Links ← → Rechts)
    .ideology-histogram
      .histo-bar(v-for="(count, idx) in statistics.ideologyBuckets", :key="idx")
        .histo-fill(:style="{ height: histoHeight(count) + '%', backgroundColor: histoColor(idx) }")
        .histo-label {{ idx - 5 }}
        .histo-value {{ count }}

  //- Refresh controls
  .stats-controls
    b-button.is-outlined(@click="refresh", :loading="loading", size="is-small")
      b-icon(icon="refresh", size="is-small")
      span Aktualisieren
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_NAMES, DISTRICT_COLORS } from '@/lib/blob-adapter'

export default {
  name: 'SimulationStatistics'
  , data: () => ({
    loading: false
    , districtNames: DISTRICT_NAMES
  })
  , mounted(){
    this.refresh()
    this._refreshTimer = setInterval(() => this.refresh(), 5000)
  }
  , beforeDestroy(){
    clearInterval(this._refreshTimer)
  }
  , computed: {
    ...mapGetters('simulation', {
      statistics: 'statistics'
      , demographics: 'demographics'
    })
    , districtStatsArray(){
      if (!this.statistics || !this.statistics.districtStats) return []
      return Object.values(this.statistics.districtStats)
    }
    , maxDistrictPop(){
      return Math.max(1, ...this.districtStatsArray.map(d => d.count))
    }
    , maxIdeologyCount(){
      if (!this.statistics || !this.statistics.ideologyBuckets) return 1
      return Math.max(1, ...this.statistics.ideologyBuckets)
    }
  }
  , methods: {
    async refresh(){
      this.loading = true
      await this.$store.dispatch('simulation/fetchDemographics')
      this.loading = false
    }
    , districtHex(d){
      const hex = DISTRICT_COLORS[d] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    , satisfactionColor(val){
      if (val >= 7) return '#4ecca3'
      if (val >= 4) return '#f0c929'
      return '#e74c3c'
    }
    , ideologyBarStyle(ideo){
      const center = 50
      const offset = (ideo / 5) * 50
      if (offset >= 0) {
        return { left: center + '%', width: offset + '%', backgroundColor: '#e74c3c' }
      } else {
        return { left: (center + offset) + '%', width: (-offset) + '%', backgroundColor: '#3498db' }
      }
    }
    , barHeight(count){
      return (count / this.maxDistrictPop * 100)
    }
    , histoHeight(count){
      return (count / this.maxIdeologyCount * 100)
    }
    , histoColor(idx){
      // idx 0 = -5 (left/blue), idx 10 = +5 (right/red)
      const t = idx / 10
      const r = Math.round(52 + t * 179)
      const b = Math.round(219 - t * 160)
      return `rgb(${r}, 100, ${b})`
    }
  }
}
</script>

<style lang="sass" scoped>
.simulation-statistics
  padding: 6em 2em 2em
  overflow-y: auto

.stats-header
  display: flex
  align-items: baseline
  gap: 1.5rem
  margin-bottom: 1.5rem
  flex-wrap: wrap

  .title
    margin-bottom: 0

  .stats-meta
    font-size: 0.85rem
    color: $grey
    display: flex
    gap: 0.5rem

.stats-section
  margin-bottom: 2rem

.section-title
  font-size: 1.1rem
  margin-bottom: 0.75rem
  color: $grey-lighter

// District cards
.district-cards
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))
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
    width: 85px
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
    width: 32px
    text-align: right
    font-size: 0.7rem

.parties-row
  display: flex
  gap: 0.75rem
  margin-top: 0.3rem
  flex-wrap: wrap

  .party-label
    font-size: 0.65rem
    color: $grey

  .party-name
    text-transform: capitalize
    margin-right: 0.2rem

  .party-count
    font-weight: 600
    color: $grey-lighter

// Bar chart
.bar-chart
  display: flex
  align-items: flex-end
  gap: 0.75rem
  height: 160px
  padding: 0.5rem 0

.chart-bar
  flex: 1
  display: flex
  flex-direction: column
  align-items: center
  height: 100%
  justify-content: flex-end

  .chart-bar-fill
    width: 100%
    max-width: 60px
    border-radius: 3px 3px 0 0
    transition: height 0.3s
    min-height: 2px

  .chart-bar-label
    font-size: 0.7rem
    color: $grey
    margin-top: 0.3rem
    text-align: center

  .chart-bar-value
    font-size: 0.75rem
    font-weight: 600
    margin-bottom: 0.2rem

// Ideology histogram
.ideology-histogram
  display: flex
  align-items: flex-end
  gap: 0.25rem
  height: 120px
  padding: 0.5rem 0

.histo-bar
  flex: 1
  display: flex
  flex-direction: column
  align-items: center
  height: 100%
  justify-content: flex-end

  .histo-fill
    width: 100%
    border-radius: 2px 2px 0 0
    transition: height 0.3s
    min-height: 1px

  .histo-label
    font-size: 0.6rem
    color: $grey
    margin-top: 0.2rem

  .histo-value
    font-size: 0.6rem
    font-weight: 600
    margin-bottom: 0.15rem

.stats-controls
  display: flex
  justify-content: center
  padding: 1rem
</style>
