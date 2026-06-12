<template lang="pug">
.transport-controls
  //- Step controls with Play/Pause in the center
  .step-controls
    button.step-btn(@click="stepBy(-365)", title="1 Jahr zurück (Shift+←)")
      b-icon(icon="chevron-double-left", size="is-small")
    button.step-btn(@click="stepBy(-30)", title="1 Monat zurück (Alt+←)")
      b-icon(icon="chevron-left", size="is-small")
      b-icon(icon="chevron-left", size="is-small")
    button.step-btn(@click="stepBy(-7)", title="1 Woche zurück (Ctrl+←)") -7
    button.step-btn(@click="stepBy(-1)", title="1 Tag zurück (←)")
      b-icon(icon="chevron-left", size="is-small")

    //- Play/Pause centered between back/forward
    button.step-btn.play-btn(:class="{ playing: !isPaused }", @click="togglePlayback", :title="isPaused ? 'Abspielen (Leertaste)' : 'Pausieren (Leertaste)'")
      b-icon(:icon="isPaused ? 'play' : 'pause'", size="is-small")

    button.step-btn(@click="stepBy(1)", title="1 Tag vor (→)")
      b-icon(icon="chevron-right", size="is-small")
    button.step-btn(@click="stepBy(7)", title="1 Woche vor (Ctrl+→)") +7
    button.step-btn(@click="stepBy(30)", title="1 Monat vor (Alt+→)")
      b-icon(icon="chevron-right", size="is-small")
      b-icon(icon="chevron-right", size="is-small")
    button.step-btn(@click="stepBy(365)", title="1 Jahr vor (Shift+→)")
      b-icon(icon="chevron-double-right", size="is-small")

  //- Right group: Event nav + Speed selector
  .right-controls
    .event-nav
      button.step-btn.event-btn(@click="jumpEvent(-1)", title="Vorheriges Event (Shift+E)")
        b-icon(icon="skip-previous", size="is-small")
        span Event
      button.step-btn.event-btn(@click="jumpEvent(1)", title="Nächstes Event (E)")
        span Event
        b-icon(icon="skip-next", size="is-small")

    FloatingPanel(size="is-small", direction="up")
      template(#activator)
        button.step-btn.speed-selector {{ speedLabel }}
      .speed-menu
        .speed-item(:class="{ active: playbackSpeed === 1 }", @click="setSpeed(1)") 1× Gemütlich
        .speed-item(:class="{ active: playbackSpeed === 3 }", @click="setSpeed(3)") 3× Schnell
        .speed-item(:class="{ active: playbackSpeed === 7 }", @click="setSpeed(7)") 7× Woche/Sek
        .speed-item(:class="{ active: playbackSpeed === 10 }", @click="setSpeed(10)") 10× Turbo
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import FloatingPanel from '@/components/floating-panel'

export default {
  name: 'TransportControls'
  , components: { FloatingPanel }
  , computed: {
    speedLabel(){
      const labels = { 1: '1×', 3: '3×', 7: '7×', 10: '10×' }
      return labels[this.playbackSpeed] || this.playbackSpeed + '×'
    }
    , ...mapState(useSimulationStore, {
      isPaused: 'isPaused'
      , playbackSpeed: 'playbackSpeed'
    })
    , ...mapStores(useSimulationStore)
  }
  , methods: {
    togglePlayback(){
      if (this.isPaused) {
        this.simulationStore.startPlayback()
      } else {
        this.simulationStore.stopPlayback()
      }
    }
    , setSpeed(speed){
      this.simulationStore.setPlaybackSpeed(speed)
    }
    , stepBy(delta){
      this.simulationStore.stopPlayback()
      this.simulationStore.stepTick(delta)
    }
    , jumpEvent(direction){
      this.simulationStore.stopPlayback()
      this.simulationStore.jumpToEvent(direction)
    }
  }
}
</script>

<style lang="sass" scoped>
.transport-controls
  display: flex
  align-items: center
  gap: 0.5rem
  flex-wrap: wrap

.step-controls
  display: flex
  align-items: center
  gap: 2px

.step-btn
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0
  min-width: 28px
  height: 26px
  padding: 0 4px
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 4px
  background: rgba(255, 255, 255, 0.05)
  color: $grey-lighter
  font-size: 0.65rem
  font-weight: 600
  cursor: pointer
  outline: none
  transition: all 0.12s
  &:hover
    background: rgba(255, 255, 255, 0.15)
    border-color: rgba(255, 255, 255, 0.3)
  &:active
    background: rgba(78, 204, 163, 0.2)
    border-color: $primary
  .icon
    margin: 0 -3px
  &.play-btn
    // Projektor-Knopf der Filmrolle: Messing
    min-width: 32px
    height: 28px
    border-color: rgba(216, 181, 105, 0.55)
    color: var(--inst-messing-1)
    &:hover
      background: rgba(216, 181, 105, 0.15)
    &.playing
      border-color: rgba(240, 201, 41, 0.5)
      color: #f0c929
      &:hover
        background: rgba(240, 201, 41, 0.15)
  &.speed-selector
    min-width: 36px
    font-size: 0.7rem
    padding: 0 6px

.right-controls
  display: flex
  align-items: center
  gap: 0.5rem
  margin-left: auto

.event-nav
  display: flex
  gap: 4px

.event-btn
  min-width: auto
  padding: 0 8px
  gap: 2px
  font-size: 0.7rem
  border-color: rgba(240, 169, 64, 0.3)
  color: #f0a940
  &:hover
    background: rgba(240, 169, 64, 0.15)
    border-color: rgba(240, 169, 64, 0.5)
  .icon
    margin: 0 -2px

.speed-menu
  padding: 0.25rem 0
  .speed-item
    padding: 0.4rem 0.75rem
    cursor: pointer
    white-space: nowrap
    font-size: 0.85rem
    &:hover
      background: rgba(255, 255, 255, 0.1)
    &.active
      color: $primary
      font-weight: 600
</style>
