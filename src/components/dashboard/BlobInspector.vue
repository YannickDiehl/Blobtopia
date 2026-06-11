<template lang="pug">
.blob-inspector
  h3.heading Blob-Inspektor

  //- Search Section
  .search-section
    b-autocomplete(
      v-model="searchQuery"
      :data="filteredBlobs"
      :custom-formatter="formatBlob"
      placeholder="Name oder ID eingeben..."
      icon="magnify"
      clearable
      @select="onSelectBlob"
    )
      template(v-slot:empty) Kein Blob gefunden

  //- Profile Section
  .profile-section(v-if="selectedBlob")
    .steckbrief-card
      h4.subheading Steckbrief
      .profile-grid
        .profile-item(v-if="selectedBlob.name")
          .profile-label Name
          .profile-value {{ selectedBlob.name }}
        .profile-item
          .profile-label ID
          .profile-value {{ selectedBlob.id.substring(0, 8) }}...
        .profile-item
          .profile-label Distrikt
          .profile-value
            span.district-dot(:style="{ backgroundColor: districtHex(selectedBlob.district) }")
            |  {{ districtName(selectedBlob.district) }}
        .profile-item
          .profile-label Alter
          .profile-value {{ selectedBlob.age }} J.
        .profile-item
          .profile-label Bildung
          .profile-value {{ educationLabel(selectedBlob.education_level) }}
        .profile-item
          .profile-label Einkommen
          .profile-value {{ selectedBlob.income.toLocaleString('de-DE') }} EUR
        .profile-item
          .profile-label Zuhause
          .profile-value {{ selectedBlob.home_building_id || 'Keine' }}
        .profile-item
          .profile-label Arbeitsplatz
          .profile-value {{ selectedBlob.workplace_id || 'Keine' }}

      //- Static base persona
      .persona-section(v-if="selectedBlob.persona_text")
        h4.subheading Hintergrund
        p.persona-text {{ selectedBlob.persona_text }}

      //- Dynamic persona snapshots (timeline)
      .persona-timeline(v-if="personaSnapshots && personaSnapshots.length")
        h4.subheading Entwicklung über die Zeit
        .snapshot-card(v-for="snap in personaSnapshots" :key="snap.tick"
                       :class="{ 'is-child': snap.current_age < 18 }")
          .snapshot-header
            span.snapshot-year Jahr {{ snap.year }}
            span.snapshot-age {{ snap.current_age }} Jahre
            span.snapshot-job(v-if="snap.job && snap.current_age >= 18") {{ snap.job }}
          .snapshot-change(v-if="snap.change_summary")
            | {{ snap.change_summary }}
          .snapshot-state {{ snap.persona_state }}

  //- Loading state for history
  .loading-state(v-if="historyLoading")
    p.has-text-grey Verlauf wird geladen...

  //- Time Series
  template(v-if="historyData && historyData.history && historyData.history.length")
    .charts-section
      h4.subheading Zufriedenheit (0-10)
      .chart-container
        line-chart(:chart-data="satisfactionChartData" :options="satisfactionOptions" :style="{ height: '250px', position: 'relative' }")

      h4.subheading L-R-Selbsteinschätzung (-5 bis +5)
      .chart-container
        line-chart(:chart-data="ideologyChartData" :options="ideologyOptions" :style="{ height: '250px', position: 'relative' }")

      h4.subheading Vertrauen (0-10)
      .chart-container
        line-chart(:chart-data="trustChartData" :options="trustOptions" :style="{ height: '250px', position: 'relative' }")

    //- Latent Traits Section — grouped by construct
    .latent-section(v-if="lastTraits")
      h4.subheading Latente Merkmale
      .construct-block(v-for="c in constructs" :key="c.key")
        h5.construct-title {{ c.label }}
        .construct-content
          table.latent-table
            thead
              tr
                th Indikator
                th Wert
            tbody
              tr(v-for="(ind, j) in c.indicators" :key="ind")
                td {{ c.labels[j] }}
                td {{ formatTraitValue(c.key, ind) }}
          .chart-container(v-if="constructChartData(c)")
            line-chart(:chart-data="constructChartData(c)" :options="constructChartOptions(c)" :style="{ height: '200px', position: 'relative' }")

  p.has-text-grey(v-else-if="selectedBlobId && !historyLoading") Kein Verlauf vorhanden.
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { DISTRICT_NAMES, DISTRICT_COLORS } from '@/lib/blob-adapter'
import LineChart from '@/components/charts/LineChart.vue'

const EDUCATION_LABELS = ['Keine', 'Grundbildung', 'Höhere Bildung', 'Akademisch']

const CONSTRUCTS = [
  { key: 'efficacy', label: 'Politische Efficacy'
    ,indicators: ['self_efficacy', 'political_knowledge', 'vote_importance', 'external_efficacy']
    ,labels: ['Selbstwirksamkeit', 'Pol. Wissen', 'Stimme zählt', 'Ext. Wirksamkeit']
    ,colors: ['#3498db', '#9b59b6', '#e84393', '#0984e3'] }
  , { key: 'social_capital', label: 'Soziales Kapital'
    ,indicators: ['network_size', 'neighbor_trust', 'community_participation', 'generalized_trust', 'media_trust']
    ,labels: ['Netzwerkgröße', 'Nachbarvertrauen', 'Gemeinschaftsteilhabe', 'Allg. Vertrauen', 'Medienvertrauen']
    ,colors: ['#fdcb6e', '#55efc4', '#74b9ff', '#00b894', '#81ecec'] }
  , { key: 'authoritarianism', label: 'Autoritarismus'
    ,indicators: ['obedience_value', 'rule_conformity', 'strong_leader_preference']
    ,labels: ['Gehorsam', 'Regelkonformität', 'Starke Führung']
    ,colors: ['#2ecc71', '#1abc9c', '#16a085'] }
  , { key: 'alienation', label: 'Politikverdrossenheit'
    ,indicators: ['powerlessness', 'political_complexity', 'party_indifference']
    ,labels: ['Machtlosigkeit', 'Pol. Komplexität', 'Partei-Gleichgültigkeit']
    ,colors: ['#e74c3c', '#e67e22', '#f1c40f'] }
  , { key: 'materialism', label: 'Materialismus / Postmaterialismus'
    ,indicators: ['economic_security_priority', 'environment_over_economy', 'freedom_over_order']
    ,labels: ['Ökon. Sicherheit', 'Umwelt > Wirtschaft', 'Freiheit > Ordnung']
    ,colors: ['#fd79a8', '#00cec9', '#6c5ce7'] }
  , { key: 'populism', label: 'Populismus'
    ,indicators: ['anti_elitism', 'people_centrism', 'manichean_outlook']
    ,labels: ['Anti-Elitismus', 'Volkszentrismus', 'Gut-Böse-Denken']
    ,colors: ['#d63031', '#e17055', '#fab1a0'] }
]

export default {
  name: 'BlobInspector'
  , components: { LineChart }
  , data: () => ({
    searchQuery: ''
    , selectedBlobId: null
    , historyLoading: false
    , loadedHistory: null
    , localBlobList: []
  })
  , computed: {
    ...mapState(useSimulationStore, ['dashboardBlobList', 'dashboardBlobHistory'])
    , loading() {
      return !this.dashboardBlobList
    }
    , blobList() {
      return this.localBlobList
    }
    , filteredBlobs() {
      if (!this.searchQuery) return this.blobList.slice(0, 20)
      const q = this.searchQuery.toLowerCase()
      return this.blobList.filter(g =>
        (g.name && g.name.toLowerCase().includes(q)) ||
        g.id.toLowerCase().includes(q)
      ).slice(0, 20)
    }
    , selectedBlob() {
      if (!this.selectedBlobId) return null
      return this.blobList.find(g => g.id === this.selectedBlobId) || null
    }
    , historyData() {
      return this.loadedHistory
    }
    , personaSnapshots() {
      if (!this.historyData) return []
      return this.historyData.persona_snapshots || []
    }
    , history() {
      return this.historyData && this.historyData.history ? this.historyData.history : []
    }
    , historyLabels() {
      return this.history.map(h => (h.tick / 365).toFixed(1))
    }
    , satisfactionChartData() {
      return {
        labels: this.historyLabels
        , datasets: [{
          label: 'Zufriedenheit'
          , data: this.history.map(h => h.satisfaction)
          , borderColor: '#27ae60'
          , backgroundColor: 'rgba(39, 174, 96, 0.1)'
          , fill: false
          , pointRadius: 1
        }]
      }
    }
    , satisfactionOptions() {
      return this.makeChartOptions(0, 10)
    }
    , ideologyChartData() {
      return {
        labels: this.historyLabels
        , datasets: [{
          label: 'L-R-Selbsteinschätzung'
          , data: this.history.map(h => h.ideology)
          , borderColor: '#3498db'
          , backgroundColor: 'rgba(52, 152, 219, 0.1)'
          , fill: false
          , pointRadius: 1
        }]
      }
    }
    , ideologyOptions() {
      return this.makeChartOptions(-5, 5)
    }
    , trustChartData() {
      return {
        labels: this.historyLabels
        , datasets: [{
          label: 'Vertrauen'
          , data: this.history.map(h => h.trust)
          , borderColor: '#3498db'
          , backgroundColor: 'rgba(52, 152, 219, 0.1)'
          , fill: false
          , pointRadius: 1
        }]
      }
    }
    , trustOptions() {
      return this.makeChartOptions(0, 10)
    }
    , constructs() {
      return CONSTRUCTS
    }
    , lastTraits() {
      // Find last history entry with latent_traits
      for (let i = this.history.length - 1; i >= 0; i--) {
        if (this.history[i].latent_traits) return this.history[i].latent_traits
      }
      return null
    }
    , traitsTimeSeries() {
      // Collect all entries with latent_traits for chart data
      return this.history.filter(h => h.latent_traits)
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
    , educationLabel(level) {
      return EDUCATION_LABELS[level] || '?'
    }
    , formatBlob(g) {
      const name = g.name || g.id.substring(0, 8)
      return `${name} | ${this.districtName(g.district)} | ${g.age} J.`
    }
    , async onSelectBlob(blob) {
      if (!blob) {
        this.selectedBlobId = null
        this.loadedHistory = null
        return
      }
      this.selectedBlobId = blob.id
      this.loadedHistory = null
      this.historyLoading = true
      const data = await useSimulationStore().fetchDashboardBlobHistory(blob.id)
      this.loadedHistory = data
      this.historyLoading = false
    }
    , makeChartOptions(min, max) {
      return {
        responsive: true
        , maintainAspectRatio: false
        , plugins: {
          legend: { labels: { color: '#fffbfc' } }
        }
        , scales: {
          x: { ticks: { color: '#fffbfc', maxTicksLimit: 15 }, grid: { color: 'rgba(255,255,255,0.06)' }, title: { display: true, text: 'Jahr', color: '#fffbfc' } }
          , y: { min, max, ticks: { color: '#fffbfc' }, grid: { color: 'rgba(255,255,255,0.06)' } }
        }
      }
    }
    , formatTraitValue(constructKey, indicator) {
      if (!this.lastTraits || !this.lastTraits[constructKey]) return '-'
      const v = this.lastTraits[constructKey][indicator]
      if (v == null) return '-'
      return typeof v === 'number' ? v.toFixed(2) : v
    }
    , constructChartData(c) {
      const series = this.traitsTimeSeries
      if (series.length < 2) return null
      const labels = series.map(h => (h.tick / 365).toFixed(1))
      const datasets = c.indicators.map((ind, j) => ({
        label: c.labels[j]
        , data: series.map(h => h.latent_traits[c.key] ? h.latent_traits[c.key][ind] : null)
        , borderColor: c.colors[j]
        , fill: false
        , pointRadius: 0
        , borderWidth: 2
      }))
      return { labels, datasets }
    }
    , constructChartOptions(c) {
      const isNetworkSize = c.indicators.includes('network_size')
      return this.makeChartOptions(0, isNetworkSize ? 20 : 10)
    }
  }
  , async mounted() {
    const data = await useSimulationStore().fetchDashboardBlobList()
    if (data && (data.globs || data.blobs)) {
      this.localBlobList = data.globs || data.blobs
    }
  }
}
</script>

<style lang="sass" scoped>
.blob-inspector
  padding: 1rem 0

.search-section
  margin-bottom: 1rem

.loading-state
  padding: 2rem 0
  text-align: center

.subheading
  font-size: 0.95rem
  color: $grey-lighter
  margin-bottom: 0.5rem

.persona-section
  margin-top: 1rem
  padding: 0.85rem 1rem
  background: rgba(255, 255, 255, 0.03)
  border-left: 3px solid $primary
  border-radius: 0 6px 6px 0

.persona-text
  font-size: 0.85rem
  color: $text
  line-height: 1.6
  font-style: italic
  margin: 0

.persona-timeline
  margin-top: 1.5rem

.snapshot-card
  margin-bottom: 1rem
  padding: 0.75rem 1rem
  background: rgba(255, 255, 255, 0.02)
  border-radius: 6px
  border-left: 3px solid rgba(255, 255, 255, 0.15)

  &.is-child
    opacity: 0.6
    border-left-color: rgba(255, 255, 255, 0.08)

.snapshot-header
  display: flex
  gap: 1rem
  margin-bottom: 0.4rem
  font-size: 0.8rem

  .snapshot-year
    font-weight: 700
    color: $primary

  .snapshot-age
    color: $grey-lighter

  .snapshot-job
    color: $grey
    font-style: italic

.snapshot-change
  font-size: 0.8rem
  color: #f09a40
  margin-bottom: 0.4rem
  font-weight: 500

.snapshot-state
  font-size: 0.82rem
  color: $text
  line-height: 1.5
  margin-top: 1rem

.steckbrief-card
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px
  padding: 1rem
  margin-bottom: 1rem

.profile-grid
  display: grid
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr))
  gap: 0.6rem

.profile-item
  .profile-label
    font-size: 0.7rem
    color: $grey
    text-transform: uppercase
    font-weight: 600

  .profile-value
    font-size: 0.85rem
    color: $text
    display: flex
    align-items: center

.district-dot
  width: 10px
  height: 10px
  border-radius: 50%
  display: inline-block
  flex-shrink: 0

.charts-section
  margin-top: 0.5rem

.chart-container
  margin-bottom: 1rem

.latent-section
  margin-top: 1.5rem

.construct-block
  margin-bottom: 1.5rem
  background: rgba(255, 255, 255, 0.02)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 8px
  padding: 0.75rem 1rem

.construct-title
  font-size: 0.95rem
  font-weight: 700
  color: $primary
  margin-bottom: 0.5rem
  letter-spacing: 0.3px

.construct-content
  display: grid
  grid-template-columns: minmax(200px, 300px) 1fr
  gap: 1rem
  align-items: start
  @media (max-width: 900px)
    grid-template-columns: 1fr

.latent-table
  width: 100%
  font-size: 0.8rem
  border-collapse: collapse

  th, td
    padding: 0.3rem 0.5rem
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
