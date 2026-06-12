<template lang="pug">
transition(name="fade")
  .command-palette-backdrop(v-if="visible", @click.self="close")
    .command-palette
      .register-titel Einwohnermelderegister · Stadtarchiv
      .search-row
        b-icon(icon="magnify", size="is-small")
        input.search-input(
          ref="searchInput"
          , v-model="query"
          , placeholder="Suche: Blob, Distrikt, Event, Jahr..."
          , @keydown.escape="close"
          , @keydown.enter="selectCurrent"
          , @keydown.up.prevent="moveSelection(-1)"
          , @keydown.down.prevent="moveSelection(1)"
        )

      .results-list.scrollbars
        .result-item(
          v-for="(r, idx) in filteredResults"
          , :key="r.id"
          , :class="{ selected: idx === selectedIndex }"
          , @click="execute(r)"
          , @mouseenter="selectedIndex = idx"
        )
          b-icon(:icon="r.icon", size="is-small")
          .result-text
            .result-title {{ r.title }}
            .result-desc {{ r.description }}

      .shortcut-hint(v-if="!query")
        span Cmd+K zum Öffnen · Escape zum Schließen
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { DISTRICT_NAMES } from '@/lib/blob-adapter'
import { ERAS } from '@/config/timeline-eras'

export default {
  name: 'CommandPalette'
  , props: {
    visible: Boolean
  }
  , data: () => ({
    query: ''
    , selectedIndex: 0
  })
  , computed: {
    allResults(){
      const results = []

      // Blob results
      const gen = this.getCurrentGeneration()
      if (gen && gen.blobs) {
        for (const blob of gen.blobs) {
          results.push({
            id: 'blob_' + blob.id
            , type: 'blob'
            , icon: 'account'
            , title: blob.name || blob.id
            , description: blob.district_name + ' · ' + blob.age_label
            , data: blob
          })
        }
      }

      // District results
      DISTRICT_NAMES.forEach((name, idx) => {
        results.push({
          id: 'district_' + idx
          , type: 'district'
          , icon: 'map-marker'
          , title: 'Distrikt: ' + name
          , description: 'Kamera zum Distrikt bewegen'
          , data: { districtIndex: idx }
        })
      })

      // Year jumps
      if (this.maxTick) {
        const maxYear = Math.floor(this.maxTick / 365)
        for (let y = 0; y <= maxYear; y++) {
          results.push({
            id: 'year_' + y
            , type: 'year'
            , icon: 'calendar'
            , title: 'Jahr ' + y
            , description: 'Springe zu Jahr ' + y
            , data: { year: y }
          })
        }
      }

      // Event jumps
      if (this.timelineEvents) {
        for (const ev of this.timelineEvents) {
          results.push({
            id: 'event_' + ev.tick
            , type: 'event'
            , icon: 'lightning-bolt'
            , title: ev.description
            , description: 'Jahr ' + ev.year + ', Tick ' + ev.tick
            , data: ev
          })
        }
      }

      // Era jumps
      for (const era of ERAS) {
        results.push({
          id: 'era_' + era.start
          , type: 'era'
          , icon: 'bookmark'
          , title: 'Ära: ' + era.name
          , description: 'Tick ' + era.start + ' – ' + era.end
          , data: era
        })
      }

      // Mode switches
      results.push(
        { id: 'mode_exploration', type: 'mode', icon: 'eye', title: 'Modus: Exploration', description: 'Taste 1', data: { mode: 'exploration' } }
        , { id: 'mode_analysis', type: 'mode', icon: 'chart-box', title: 'Modus: Analyse', description: 'Taste 2', data: { mode: 'analysis' } }
        , { id: 'mode_presentation', type: 'mode', icon: 'presentation', title: 'Modus: Präsentation', description: 'Taste 3', data: { mode: 'presentation' } }
      )

      // Data overlays
      results.push(
        { id: 'overlay_satisfaction', type: 'overlay', icon: 'emoticon-happy', title: 'Overlay: Zufriedenheit', description: 'Data Overlay aktivieren', data: { overlay: 'satisfaction' } }
        , { id: 'overlay_trust', type: 'overlay', icon: 'shield-check', title: 'Overlay: Vertrauen', description: 'Data Overlay aktivieren', data: { overlay: 'trust' } }
        , { id: 'overlay_ideology', type: 'overlay', icon: 'scale-balance', title: 'Overlay: L-R', description: 'Data Overlay aktivieren', data: { overlay: 'ideology' } }
      )

      return results
    }
    , filteredResults(){
      if (!this.query) return this.allResults.slice(0, 12)
      const q = this.query.toLowerCase()
      return this.allResults.filter(r =>
        r.title.toLowerCase().includes(q)
        || r.description.toLowerCase().includes(q)
      ).slice(0, 15)
    }
    , ...mapState(useSimulationStore, {
      getCurrentGeneration: 'getCurrentGeneration'
      , maxTick: 'maxTick'
      , timelineEvents: 'timelineEvents'
    })
    , ...mapStores(useSimulationStore)
  }
  , watch: {
    visible(v) {
      if (v) {
        this.query = ''
        this.selectedIndex = 0
        this.$nextTick(() => {
          if (this.$refs.searchInput) this.$refs.searchInput.focus()
        })
      }
    }
    , query() {
      this.selectedIndex = 0
    }
  }
  , methods: {
    close(){
      this.$emit('close')
    }
    , moveSelection(dir){
      const max = this.filteredResults.length - 1
      this.selectedIndex = Math.max(0, Math.min(max, this.selectedIndex + dir))
    }
    , selectCurrent(){
      const r = this.filteredResults[this.selectedIndex]
      if (r) this.execute(r)
    }
    , execute(r){
      switch (r.type) {
        case 'blob':
          this.$emit('select-blob', r.data)
          break
        case 'district':
          this.$emit('fly-to-district', r.data.districtIndex)
          break
        case 'year':
          this.simulationStore.stopPlayback()
          this.simulationStore.seekTick(r.data.year * 365)
          break
        case 'event':
          this.simulationStore.stopPlayback()
          this.simulationStore.seekTick(r.data.tick)
          break
        case 'era':
          this.simulationStore.stopPlayback()
          this.simulationStore.seekTick(r.data.start)
          break
        case 'mode':
          this.simulationStore.setUiMode(r.data.mode)
          break
        case 'overlay':
          this.simulationStore.setDataOverlay(r.data.overlay)
          break
      }
      this.close()
    }
  }
}
</script>

<style lang="sass" scoped>
// Der Suchzettel des Einwohnermelderegisters: ein Karteikasten-Auszug
// auf Papier (Zielbild design-prototyp/komplett.html)
$korn: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .04 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")

.command-palette-backdrop
  position: fixed
  top: 0
  left: 0
  right: 0
  bottom: 0
  background: rgba(35, 25, 10, 0.45)
  z-index: 100
  display: flex
  align-items: flex-start
  justify-content: center
  padding-top: 13vh

.command-palette
  width: 600px
  max-width: 90vw
  background-color: var(--inst-papier-hell)
  background-image: $korn
  border-radius: 2px
  box-shadow: 0 2px 0 rgba(120, 90, 40, 0.25), 0 22px 50px rgba(40, 28, 8, 0.5)
  overflow: hidden
  transform: rotate(-0.4deg)
  color: var(--inst-tinte)

.register-titel
  font-family: var(--inst-druck)
  font-size: 0.58rem
  font-weight: 800
  letter-spacing: 2.5px
  text-transform: uppercase
  color: var(--inst-beschriftung)
  text-align: center
  padding: 0.55rem 1rem 0


.search-row
  display: flex
  align-items: center
  gap: 0.5rem
  margin: 0.3rem 1rem 0
  padding: 0.45rem 0.2rem
  border-bottom: 2px solid rgba(43, 58, 85, 0.5)
  color: var(--inst-beschriftung)

.search-input
  flex: 1
  background: transparent
  border: none
  color: var(--inst-tinte)
  font-family: var(--inst-schreibmaschine)
  font-size: 0.95rem
  outline: none
  &::placeholder
    color: var(--inst-beschriftung)
    opacity: 0.7

.results-list
  max-height: 400px
  overflow-y: auto
  padding: 0.3rem 0
  &::-webkit-scrollbar
    width: 6px
  &::-webkit-scrollbar-thumb
    border-radius: 3px
    background: rgba(43, 58, 85, 0.25)

.result-item
  display: flex
  align-items: center
  gap: 0.75rem
  padding: 0.4rem 1rem
  cursor: pointer
  transition: background 0.1s
  color: var(--inst-beschriftung)
  border-left: 3px solid transparent
  &:hover, &.selected
    background: rgba(51, 81, 142, 0.07)
  &.selected
    border-left-color: var(--inst-handrot)

.result-text
  flex: 1
  min-width: 0

.result-title
  font-family: var(--inst-schreibmaschine)
  font-size: 0.85rem
  color: var(--inst-tinte)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.result-desc
  font-size: 0.66rem
  color: var(--inst-beschriftung)
  margin-top: 1px

.shortcut-hint
  padding: 0.45rem 1rem
  text-align: center
  font-family: var(--inst-hand)
  font-size: 0.85rem
  color: var(--inst-graphit)
  border-top: 1.5px dashed rgba(43, 58, 85, 0.2)

.fade-enter-active, .fade-leave-active
  transition: opacity 0.15s ease
.fade-enter, .fade-enter-from, .fade-leave-to
  opacity: 0
</style>
