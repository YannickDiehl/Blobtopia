<template lang="pug">
.latent-trait-time-series
  h3.heading Latente Konstrukte im Zeitverlauf

  .loading-state(v-if="loading")
    p.has-text-grey Lade Zeitreihendaten...

  template(v-else-if="districts")
    //- Construct selector
    .construct-selector
      b-field(label="Konstrukt" custom-class="selector-label")
        b-select(v-model="selectedIndex" size="is-small")
          option(v-for="(c, i) in constructs" :key="c.key" :value="i") {{ c.label }}

    //- 3 indicator charts
    .chart-block(v-for="(indicator, idx) in currentIndicators" :key="currentConstruct.key + '-' + idx")
      h4.chart-title {{ indicator.label }}
      .chart-container
        line-chart(:chart-data="indicatorChartData(indicator.key)" :options="indicatorOptions(indicator.key)")

  .empty-state(v-else)
    p.has-text-grey Keine Daten verfügbar.
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_NAMES, DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'
import LineChart from '@/components/charts/LineChart'

export default {
  name: 'LatentTraitTimeSeries'
  , components: { LineChart }
  , data: () => ({
    loading: false
    , districts: null
    , selectedIndex: 0
    , constructs: [
      { key: 'efficacy', label: 'Politische Efficacy', indicators: ['self_efficacy', 'political_knowledge', 'vote_importance', 'external_efficacy'], labels: ['Selbstwirksamkeit', 'Pol. Wissen', 'Stimme zählt', 'Ext. Wirksamkeit'] }
      , { key: 'social_capital', label: 'Soziales Kapital', indicators: ['network_size', 'neighbor_trust', 'community_participation', 'generalized_trust', 'media_trust'], labels: ['Netzwerkgröße', 'Nachbarvertrauen', 'Gemeinschaftsteilhabe', 'Allg. Vertrauen', 'Medienvertrauen'] }
      , { key: 'authoritarianism', label: 'Autoritarismus', indicators: ['obedience_value', 'rule_conformity', 'strong_leader_preference'], labels: ['Gehorsam', 'Regelkonformität', 'Starke Führung'] }
      , { key: 'alienation', label: 'Politikverdrossenheit', indicators: ['powerlessness', 'political_complexity', 'party_indifference'], labels: ['Machtlosigkeit', 'Pol. Komplexität', 'Partei-Gleichgültigkeit'] }
      , { key: 'materialism', label: 'Materialismus/Postmat.', indicators: ['economic_security_priority', 'environment_over_economy', 'freedom_over_order'], labels: ['Ökon. Sicherheit', 'Umwelt > Wirtschaft', 'Freiheit > Ordnung'] }
      , { key: 'populism', label: 'Populismus', indicators: ['anti_elitism', 'people_centrism', 'manichean_outlook'], labels: ['Anti-Elitismus', 'Volkszentrismus', 'Gut-Böse-Denken'] }
    ]
  })
  , computed: {
    ...mapGetters('simulation', ['timelineEvents'])
    , currentConstruct() {
      return this.constructs[this.selectedIndex]
    }
    , currentIndicators() {
      const c = this.currentConstruct
      return c.indicators.map((key, i) => ({ key, label: c.labels[i] }))
    }
    , labels() {
      if (!this.districts) return []
      const firstKey = Object.keys(this.districts)[0]
      if (!firstKey) return []
      return this.districts[firstKey].map(p => (p.tick / 365).toFixed(1))
    }
  }
  , async mounted() {
    this.loading = true
    const data = await this.$store.dispatch('simulation/fetchDashboardLatentTraits')
    if (data && data.districts) {
      this.districts = data.districts
    }
    this.loading = false
  }
  , methods: {
    districtHex(d) {
      return DISTRICT_COLORS_HEX[d] || '#999999'
    }
    , indicatorChartData(indicatorKey) {
      if (!this.districts) return { labels: [], datasets: [] }

      const constructKey = this.currentConstruct.key
      const datasets = Object.entries(this.districts).map(([d, points]) => ({
        label: DISTRICT_NAMES[d] || 'Distrikt ' + d
        , data: points.map(p => {
          const construct = p[constructKey]
          return construct ? construct[indicatorKey] : null
        })
        , borderColor: this.districtHex(d)
        , backgroundColor: 'transparent'
        , fill: false
        , pointRadius: 0
        , borderWidth: 2
      }))

      return { labels: this.labels, datasets }
    }
    , indicatorOptions(indicatorKey) {
      const isNetworkSize = indicatorKey === 'network_size'
      return {
        responsive: true
        , maintainAspectRatio: false
        , plugins: {
          tooltip: { mode: 'index', intersect: false }
          , legend: { labels: { color: '#fffbfc', font: { size: 11 } } }
        }
        , hover: { mode: 'nearest', intersect: true }
        , elements: { point: { radius: 0 }, line: { tension: 0.3, borderWidth: 2 } }
        , scales: {
          y: {
            min: 0
            , max: isNetworkSize ? 20 : 10
            , ticks: { color: '#999' }
            , grid: { color: 'rgba(255,255,255,0.06)' }
          }
          , x: {
            ticks: { color: '#999', maxTicksLimit: 20 }
            , grid: { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    }
  }
}
</script>

<style lang="sass" scoped>
.latent-trait-time-series
  padding: 1rem 0

.loading-state, .empty-state
  padding: 2rem
  text-align: center

.construct-selector
  margin-bottom: 1.5rem

  .selector-label
    color: $grey-lighter
    font-size: 0.8rem

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
