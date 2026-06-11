<template lang="pug">
transition(name="slide-panel")
  .right-panel(v-show="open", :class="panelWidthClass")
    .panel-tabs
      button.tab-btn(
        v-for="tab in tabs"
        , :key="tab.key"
        , :class="{ active: activeTab === tab.key }"
        , :title="tab.label"
        , @click="setTab(tab.key)"
      )
        b-icon(:icon="tab.icon", size="is-small")

    .panel-content.scrollbars
      DistrictPulse(v-if="activeTab === 'pulse'", @fly-to-district="$emit('fly-to-district', $event)")
      .social-embed(v-if="activeTab === 'social'")
        slot(name="social")
      QuickStats(v-if="activeTab === 'stats'")
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import DistrictPulse from './DistrictPulse'
import EventLog from './EventLog'
import QuickStats from './QuickStats'

export default {
  name: 'RightPanel'
  , components: { DistrictPulse, EventLog, QuickStats }
  , props: {
    open: { type: Boolean, default: true }
  }
  , data: () => ({
    tabs: [
      { key: 'pulse', label: 'Distrikt-Puls', icon: 'map-marker-multiple' }
      , { key: 'social', label: 'Social Feed', icon: 'rss' }
      , { key: 'stats', label: 'Quick Stats', icon: 'chart-line' }
    ]
  })
  , computed: {
    activeTab(){
      return this.simulationStore.rightPanelTab
    }
    , panelWidthClass(){
      return this.uiMode === 'analysis' ? 'panel-wide' : 'panel-normal'
    }
    , ...mapState(useSimulationStore, {
      uiMode: 'uiMode'
    })
    , ...mapStores(useSimulationStore)
  }
  , methods: {
    setTab(tab) {
      this.simulationStore.setRightPanelTab(tab)
    }
  }
}
</script>

<style lang="sass" scoped>
.right-panel
  position: absolute
  top: 44px
  right: 0
  bottom: 0
  display: flex
  flex-direction: column
  background: rgba(0, 0, 0, 0.88)
  backdrop-filter: blur(12px)
  border-left: 1px solid rgba(255, 255, 255, 0.08)
  z-index: 5
  transition: width 0.3s ease

  &.panel-normal
    width: 360px
  &.panel-wide
    width: 440px

.panel-tabs
  display: flex
  border-bottom: 1px solid rgba(255, 255, 255, 0.08)
  flex-shrink: 0

.tab-btn
  flex: 1
  display: flex
  align-items: center
  justify-content: center
  height: 38px
  background: transparent
  border: none
  border-bottom: 2px solid transparent
  outline: none
  color: $grey
  cursor: pointer
  transition: all 0.15s
  &:hover
    color: $grey-lighter
    background: rgba(255, 255, 255, 0.03)
  &.active
    color: $primary
    border-bottom-color: $primary

.panel-content
  flex: 1
  overflow-y: auto
  overflow-x: hidden

.empty-state
  text-align: center
  padding: 3rem 1rem
  color: $grey
  font-size: 0.85rem

// Slide animation
.slide-panel-enter-active, .slide-panel-leave-active
  transition: transform 0.3s ease
.slide-panel-enter, .slide-panel-enter-from, .slide-panel-leave-to
  transform: translateX(100%)
</style>
