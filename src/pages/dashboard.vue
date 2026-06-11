<template lang="pug">
.dashboard-page.scrollbars
  .dashboard-header
    router-link.back-link(:to="{ name: 'simulation', params: { generationIndex: $route.params.generationIndex || '0' } }")
      b-icon(icon="arrow-left", size="is-small")
      span Zurück zur Simulation
    h2.title.is-size-4 Dozenten-Dashboard
    .dashboard-meta(v-if="timelineMeta")
      span {{ timelineMeta.max_tick }} Ticks
      span |
      span {{ timelineMeta.total_blobs }} Blobs
      span |
      span {{ timelineMeta.events.length }} Ereignisse

  //- Oruga-Tabs: v-model ist wert- statt indexbasiert — explizite :value
  o-tabs(type="boxed", :animated="false", v-model="activeTab")
    o-tab-item(:value="0", label="Übersicht", icon="view-dashboard")
      overview-panel(v-if="activeTab === 0")
    o-tab-item(:value="1", label="Distrikte", icon="map-marker-multiple")
      district-comparison(v-if="activeTab === 1")
    o-tab-item(:value="2", label="Einstellungen", icon="chart-line")
      attitude-time-series(v-if="activeTab === 2")
    o-tab-item(:value="3", label="Konstrukte", icon="brain")
      latent-trait-time-series(v-if="activeTab === 3")
    o-tab-item(:value="4", label="Politik", icon="account-group")
      political-behavior(v-if="activeTab === 4")
    o-tab-item(:value="5", label="Wahlen", icon="vote")
      election-results(v-if="activeTab === 5")
    o-tab-item(:value="6", label="Wirkung", icon="pulse")
      event-impact(v-if="activeTab === 6")
    o-tab-item(:value="7", label="Demografie", icon="chart-bar")
      demographic-breakdown(v-if="activeTab === 7")
    o-tab-item(:value="8", label="Kinder", icon="human-child")
      children-validation(v-if="activeTab === 8")
    o-tab-item(:value="9", label="Inspektor", icon="account-search")
      blob-inspector(v-if="activeTab === 9")
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import OverviewPanel from '@/components/dashboard/OverviewPanel'
import DistrictComparison from '@/components/dashboard/DistrictComparison'
import AttitudeTimeSeries from '@/components/dashboard/AttitudeTimeSeries'
import LatentTraitTimeSeries from '@/components/dashboard/LatentTraitTimeSeries'
import ElectionResults from '@/components/dashboard/ElectionResults'
import EventImpact from '@/components/dashboard/EventImpact'
import BlobInspector from '@/components/dashboard/BlobInspector'
import DemographicBreakdown from '@/components/dashboard/DemographicBreakdown'
import PoliticalBehavior from '@/components/dashboard/PoliticalBehavior'
import ChildrenValidation from '@/components/dashboard/ChildrenValidation'

export default {
  name: 'Dashboard'
  , components: {
    OverviewPanel
    , DistrictComparison
    , AttitudeTimeSeries
    , LatentTraitTimeSeries
    , ElectionResults
    , EventImpact
    , BlobInspector
    , DemographicBreakdown
    , PoliticalBehavior
    , ChildrenValidation
  }
  , data: () => ({
    activeTab: 0
  })
  , computed: {
    ...mapState(useSimulationStore, {
      timelineMeta: 'timelineMeta'
    })
  }
}
</script>

<style lang="sass" scoped>
.dashboard-page
  padding: 6em 2em 2em
  overflow-y: auto
  height: 100%

.dashboard-header
  display: flex
  align-items: baseline
  gap: 1.5rem
  margin-bottom: 1.5rem
  flex-wrap: wrap
  .back-link
    display: flex
    align-items: center
    gap: 0.3rem
    color: $grey
    font-size: 0.85rem
    text-decoration: none
    &:hover
      color: $primary
  .title
    margin-bottom: 0
  .dashboard-meta
    font-size: 0.85rem
    color: $grey
    display: flex
    gap: 0.5rem

// Dark theme for Buefy tabs
:deep() .tabs
  a
    color: $grey !important
    border-bottom-color: rgba(255,255,255,0.1) !important
  li.is-active a
    color: $primary !important
    border-bottom-color: $primary !important
  ul
    border-bottom-color: rgba(255,255,255,0.1) !important

:deep() .tab-content
  padding: 1.5rem 0
</style>
