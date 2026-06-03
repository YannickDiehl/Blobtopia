<template lang="pug">
.top-bar-instructor
  .top-left
    .brand Blobtopia

  .top-center
    .status-dot(:class="connectionClass")
    span.date-text(v-if="year !== undefined") Jahr {{ year }}, M{{ month }}, T{{ day }}, {{ hourDisplay }}
    span.separator |
    span.pop-count {{ populationCount }} Blobs
    span.separator(v-if="eraLabel") |
    span.era-label(v-if="eraLabel") {{ eraLabel }}

  .top-right
    //- Event triggers (only in live mode)
    FloatingPanel(v-if="isLiveMode", size="is-medium", :close-on-click="false", direction="down")
      template(#activator)
        button.top-btn(:title="'Events auslösen'")
          b-icon(icon="lightning-bolt", size="is-small")
      .event-menu
        .event-item(@click="$emit('fire-event', 'Election')")
          b-icon(icon="vote", size="is-small")
          span Wahl auslösen
        .event-item(@click="$emit('fire-event', 'EconomicCrisis', { severity: 0.6, affected_districts: [] })")
          b-icon(icon="chart-line-variant", size="is-small")
          span Wirtschaftskrise
        .event-item(@click="$emit('fire-event', 'Scandal', { target_party: 0, magnitude: 0.5 })")
          b-icon(icon="alert-decagram", size="is-small")
          span Skandal (Fortschritt)
        .event-item(@click="$emit('fire-event', 'EducationReform', { target_district: 0 })")
          b-icon(icon="school", size="is-small")
          span Bildungsreform (Grüntal)
        .event-item(@click="$emit('fire-event', 'NaturalDisaster', { affected_district: 4, severity: 0.5 })")
          b-icon(icon="weather-lightning-rainy", size="is-small")
          span Naturkatastrophe (Industriezone)
        .event-item(@click="$emit('fire-event', 'MediaCampaign', { party: 2, reach: 0.4 })")
          b-icon(icon="newspaper", size="is-small")
          span Medienkampagne (Tradition)

    //- Instructor controls (live mode only)
    button.top-btn(v-if="isLiveMode", :class="isPaused ? 'btn-success' : 'btn-warning'", @click="$emit('toggle-pause')", :title="isPaused ? 'Simulation fortsetzen' : 'Simulation pausieren'")
      b-icon(:icon="isPaused ? 'play' : 'pause'", size="is-small")

    //- BlobFeed toggle
    button.top-btn(:class="{ active: showFeed }", @click="$emit('toggle-feed')", title="BlobFeed ein-/ausblenden")
      b-icon(icon="rss", size="is-small")

    //- Newspaper toggle
    button.top-btn(:class="{ active: showNewspaper }", @click="$emit('toggle-newspaper')", title="Zeitung ein-/ausblenden (N)")
      b-icon(icon="newspaper", size="is-small")

    //- Befragungsinstitut toggle
    button.top-btn(:class="{ active: showSurvey }", @click="$emit('toggle-survey')", title="Befragungsinstitut (B)")
      b-icon(icon="poll", size="is-small")

    button.top-btn(@click="$emit('toggle-command-palette')", title="Command Palette (Cmd+K)")
      b-icon(icon="magnify", size="is-small")

    button.top-btn(@click="goToAbout", title="Über Blobtopia")
      b-icon(icon="information-outline", size="is-small")
</template>

<script>
import { mapGetters } from 'vuex'
import FloatingPanel from '@/components/floating-panel'
import { ERAS, getEraForTick } from '@/config/timeline-eras'

export default {
  name: 'TopBar'
  , components: { FloatingPanel }
  , props: {
    showFeed: Boolean
    , showNewspaper: Boolean
    , showSurvey: Boolean
  }
  , computed: {
    connectionClass(){
      if (this.connectionStatus === 'connected') return 'is-connected'
      if (this.connectionStatus === 'reconnecting') return 'is-reconnecting'
      return 'is-disconnected'
    }
    , populationCount(){
      const gen = this.getCurrentGeneration()
      return gen ? gen.blobs.length : '—'
    }
    , hourDisplay(){
      return String(this.hour).padStart(2, '0') + ':00'
    }
    , eraLabel(){
      if (!this.timelineMode) return null
      const idx = getEraForTick(this.tick)
      return ERAS[idx] ? ERAS[idx].name : null
    }
    , ...mapGetters('simulation', {
      connectionStatus: 'connectionStatus'
      , isPaused: 'isPaused'
      , isLiveMode: 'isLiveMode'
      , timelineMode: 'timelineMode'
      , getCurrentGeneration: 'getCurrentGeneration'
      , year: 'year'
      , month: 'month'
      , day: 'day'
      , hour: 'hour'
      , tick: 'tick'
    })
  }
  , methods: {
    goToAbout() {
      const gen = this.$route.params.generationIndex || '0'
      this.$router.push({ name: 'about', params: { generationIndex: gen } })
    }
  }
}
</script>

<style lang="sass" scoped>
.top-bar-instructor
  position: absolute
  top: 0
  left: 0
  right: 0
  z-index: 10
  height: 44px
  display: flex
  align-items: center
  justify-content: space-between
  padding: 0 1rem
  background: rgba(0, 0, 0, 0.85)
  backdrop-filter: blur(10px)
  border-bottom: 1px solid rgba(255, 255, 255, 0.08)

  .presentation-mode &
    background: rgba(0, 0, 0, 0.5)

.top-left
  display: flex
  align-items: center
  gap: 0.75rem

.brand
  font-size: 20px
  font-weight: 700
  color: $primary
  letter-spacing: 1px

.top-center
  display: flex
  align-items: center
  gap: 0.5rem
  font-size: 0.8rem

.status-dot
  width: 8px
  height: 8px
  border-radius: 50%
  flex-shrink: 0
  &.is-connected
    background: #4ecca3
  &.is-reconnecting
    background: #f0c929
    animation: pulse 1s infinite
  &.is-disconnected
    background: #e74c3c

.date-text
  font-weight: 600
  color: $grey-lighter

.separator
  color: rgba(255, 255, 255, 0.2)

.pop-count
  color: $grey-light

.era-label
  color: $grey
  font-style: italic
  font-size: 0.75rem

.top-right
  display: flex
  align-items: center
  gap: 4px

.top-btn
  display: flex
  align-items: center
  justify-content: center
  width: 30px
  height: 26px
  border: none
  border-radius: 4px
  background: transparent
  color: $grey-light
  cursor: pointer
  transition: all 0.15s
  text-decoration: none
  &:hover
    color: $grey-lighter
    background: rgba(255, 255, 255, 0.08)
  &.active
    color: $primary
  &.btn-success
    color: #4ecca3
  &.btn-warning
    color: #f0c929

.event-menu
  padding: 0.25rem 0
  .event-item
    display: flex
    align-items: center
    gap: 0.5rem
    padding: 0.5rem 0.75rem
    cursor: pointer
    white-space: nowrap
    transition: background 0.15s
    &:hover
      background: rgba(255, 255, 255, 0.1)

@keyframes pulse
  0%, 100%
    opacity: 1
  50%
    opacity: 0.3
</style>
