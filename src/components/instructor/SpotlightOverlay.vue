<template lang="pug">
transition(name="fade")
  .spotlight-overlay(v-if="active && target")
    .spotlight-card(:class="{ 'card-large': uiMode === 'presentation' }")
      .card-header
        .district-dot(:style="{ backgroundColor: districtColor }")
        .blob-name {{ target.name || target.id }}
        button.close-btn(@click="close")
          b-icon(icon="close", size="is-small")

      .card-subtitle {{ target.district_name }} · {{ target.age_label }} · {{ target.education_label }}

      .stat-bars
        .stat-row
          .stat-label Zufriedenheit
          .stat-bar-track
            .stat-bar-fill(:style="{ width: satPct + '%', backgroundColor: satColor }")
          .stat-value {{ satVal }}

        .stat-row
          .stat-label Vertrauen
          .stat-bar-track
            .stat-bar-fill(:style="{ width: trustPct + '%', backgroundColor: '#5c9ded' }")
          .stat-value {{ trustVal }}

        .stat-row
          .stat-label L-R
          .ideology-track
            .ideology-marker(:style="{ left: ideoPct + '%' }")
          .stat-value(:class="ideoClass") {{ ideoLabel }}

        .stat-row
          .stat-label Partei
          .stat-text {{ target.party_name || 'Keine' }}

        .stat-row
          .stat-label Protest
          .stat-text {{ protestLabel }}
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'

export default {
  name: 'SpotlightOverlay'
  , props: {
    active: Boolean
    , target: { type: Object, default: null }
  }
  , computed: {
    districtColor(){
      return this.target ? (DISTRICT_COLORS_HEX[this.target.district] || '#999') : '#999'
    }
    , satVal(){
      return this.target && this.target.attitudes ? this.target.attitudes.political_satisfaction.toFixed(1) : '—'
    }
    , satPct(){
      return this.target && this.target.attitudes ? (this.target.attitudes.political_satisfaction / 10 * 100) : 0
    }
    , satColor(){
      const v = this.target && this.target.attitudes ? this.target.attitudes.political_satisfaction : 5
      if (v >= 7) return '#4ecca3'
      if (v >= 4) return '#f0c929'
      return '#e74c3c'
    }
    , trustVal(){
      return this.target && this.target.attitudes ? this.target.attitudes.institutional_trust.toFixed(1) : '—'
    }
    , trustPct(){
      return this.target && this.target.attitudes ? (this.target.attitudes.institutional_trust / 10 * 100) : 0
    }
    , ideoVal(){
      return this.target && this.target.attitudes ? this.target.attitudes.ideology : 0
    }
    , ideoPct(){
      return ((this.ideoVal - 1) / 9) * 100
    }
    , ideoLabel(){
      const v = this.ideoVal
      return v.toFixed(1)
    }
    , ideoClass(){
      return this.ideoVal > 5.5 ? 'pos' : this.ideoVal < 5.5 ? 'neg' : ''
    }
    , protestLabel(){
      if (!this.target || !this.target.political_state) return '—'
      return Math.round(this.target.political_state.protest_readiness * 100) + '%'
    }
    , ...mapState(useSimulationStore, {
      uiMode: 'uiMode'
    })
  }
  , methods: {
    close(){
      this.$emit('close')
    }
  }
}
</script>

<style lang="sass" scoped>
.spotlight-overlay
  position: absolute
  bottom: 100px
  right: 20px
  z-index: 8
  pointer-events: all

.spotlight-card
  background: rgba(0, 0, 0, 0.92)
  backdrop-filter: blur(12px)
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 10px
  padding: 1rem 1.25rem
  min-width: 280px

  &.card-large
    min-width: 360px
    padding: 1.25rem 1.5rem
    font-size: 1.1rem
    .stat-label
      font-size: 0.85rem
    .stat-value
      font-size: 1rem
    .blob-name
      font-size: 1.3rem

.card-header
  display: flex
  align-items: center
  gap: 0.5rem
  margin-bottom: 0.2rem

.district-dot
  width: 12px
  height: 12px
  border-radius: 50%

.blob-name
  font-size: 1.05rem
  font-weight: 700
  color: $grey-lighter
  flex: 1

.close-btn
  background: transparent
  border: none
  color: $grey
  cursor: pointer
  &:hover
    color: $grey-lighter

.card-subtitle
  font-size: 0.75rem
  color: $grey
  margin-bottom: 0.75rem

.stat-bars
  display: flex
  flex-direction: column
  gap: 6px

.stat-row
  display: flex
  align-items: center
  gap: 0.5rem

.stat-label
  font-size: 0.7rem
  color: $grey
  width: 80px
  text-transform: uppercase
  letter-spacing: 0.3px
  flex-shrink: 0

.stat-bar-track
  flex: 1
  height: 6px
  background: rgba(255, 255, 255, 0.08)
  border-radius: 3px
  overflow: hidden

.stat-bar-fill
  height: 100%
  border-radius: 3px
  transition: width 0.5s ease

.stat-value
  font-size: 0.8rem
  color: $grey-lighter
  font-family: monospace
  width: 36px
  text-align: right
  &.pos
    color: #4ecca3
  &.neg
    color: #e74c3c

.ideology-track
  flex: 1
  height: 6px
  background: linear-gradient(to right, rgba(231, 76, 60, 0.3), rgba(255, 255, 255, 0.1), rgba(78, 204, 163, 0.3))
  border-radius: 3px
  position: relative

.ideology-marker
  position: absolute
  top: -3px
  width: 12px
  height: 12px
  border-radius: 50%
  background: $grey-lighter
  transform: translateX(-50%)
  border: 2px solid rgba(0, 0, 0, 0.4)

.stat-text
  font-size: 0.8rem
  color: $grey-lighter

.fade-enter-active, .fade-leave-active
  transition: opacity 0.3s ease
.fade-enter, .fade-enter-from, .fade-leave-to
  opacity: 0
</style>
