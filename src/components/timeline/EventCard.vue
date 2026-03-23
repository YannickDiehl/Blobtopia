<template lang="pug">
transition(name="slide-up")
  .event-card(v-if="event")
    .card-top
      .event-type
        b-icon(:icon="eventIcon", size="is-small")
        span {{ event.description }}
      button.close-btn(@click="dismiss")
        b-icon(icon="close", size="is-small")
    .card-meta Jahr {{ event.year }} — Tick {{ event.tick }}

    .impact-section(v-if="impact")
      .impact-row(v-for="d in impact.districts", :key="d.district")
        .district-dot(:style="{ backgroundColor: districtColor(d.district) }")
        .impact-col
          span.label Zufr.
          span.before {{ fmtVal(d.before, 'satisfaction') }}
          span.arrow →
          span.after(:class="deltaClass(d.before, d.after, 'satisfaction')") {{ fmtVal(d.after, 'satisfaction') }}
          span.delta {{ fmtDelta(d.before, d.after, 'satisfaction') }}
        .impact-col
          span.label Vertr.
          span.before {{ fmtVal(d.before, 'trust') }}
          span.arrow →
          span.after(:class="deltaClass(d.before, d.after, 'trust')") {{ fmtVal(d.after, 'trust') }}
          span.delta {{ fmtDelta(d.before, d.after, 'trust') }}

    .notes-section
      label.notes-label Lehrnotizen
      textarea.notes-input(v-model="notes", placeholder="Notizen zum Event...", rows="2", @input="saveNotes")
</template>

<script>
import { mapGetters } from 'vuex'
import { DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'

export default {
  name: 'EventCard'
  , props: {
    event: { type: Object, default: null }
    , impact: { type: Object, default: null }
  }
  , data: () => ({
    notes: ''
  })
  , computed: {
    eventIcon(){
      if (!this.event) return 'lightning-bolt'
      if (this.event.description && this.event.description.includes('Wahl')) return 'vote'
      return 'lightning-bolt'
    }
  }
  , watch: {
    event: {
      immediate: true
      , handler(ev) {
        if (ev) {
          const saved = localStorage.getItem('globtopia_event_notes_' + ev.tick)
          this.notes = saved || ''
        }
      }
    }
  }
  , methods: {
    dismiss(){
      this.$emit('dismiss')
    }
    , districtColor(d) {
      return DISTRICT_COLORS_HEX[d] || '#999'
    }
    , fmtVal(data, key) {
      if (!data || data[key] == null) return '—'
      return data[key].toFixed(1)
    }
    , fmtDelta(before, after, key) {
      if (!before || !after || before[key] == null || after[key] == null) return ''
      const d = after[key] - before[key]
      return (d >= 0 ? '+' : '') + d.toFixed(1)
    }
    , deltaClass(before, after, key) {
      if (!before || !after || before[key] == null || after[key] == null) return ''
      const d = after[key] - before[key]
      if (d > 0.3) return 'up'
      if (d < -0.3) return 'down'
      return ''
    }
    , saveNotes(){
      if (this.event) {
        localStorage.setItem('globtopia_event_notes_' + this.event.tick, this.notes)
      }
    }
  }
}
</script>

<style lang="sass" scoped>
.event-card
  background: rgba(0, 0, 0, 0.92)
  backdrop-filter: blur(12px)
  border: 1px solid rgba(240, 169, 64, 0.3)
  border-radius: 8px
  padding: 0.75rem 1rem
  max-width: 500px

.card-top
  display: flex
  align-items: center
  justify-content: space-between
  margin-bottom: 0.3rem

.event-type
  display: flex
  align-items: center
  gap: 0.4rem
  font-weight: 700
  font-size: 0.9rem
  color: #f0c929

.close-btn
  background: transparent
  border: none
  color: $grey
  cursor: pointer
  padding: 2px
  &:hover
    color: $grey-lighter

.card-meta
  font-size: 0.7rem
  color: $grey
  margin-bottom: 0.5rem

.impact-section
  border-top: 1px solid rgba(255, 255, 255, 0.06)
  padding-top: 0.4rem
  margin-bottom: 0.4rem

.impact-row
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 2px 0

.district-dot
  width: 8px
  height: 8px
  border-radius: 50%
  flex-shrink: 0

.impact-col
  display: flex
  align-items: center
  gap: 3px
  font-size: 0.7rem
  font-family: monospace

.label
  color: $grey
  font-size: 0.6rem
  width: 28px

.before
  color: $grey-light

.arrow
  color: rgba(255, 255, 255, 0.2)

.after
  color: $grey-lighter
  &.up
    color: #4ecca3
  &.down
    color: #e74c3c

.delta
  font-size: 0.6rem
  color: $grey

.notes-section
  border-top: 1px solid rgba(255, 255, 255, 0.06)
  padding-top: 0.4rem

.notes-label
  font-size: 0.65rem
  color: $grey
  text-transform: uppercase
  letter-spacing: 0.5px
  display: block
  margin-bottom: 0.2rem

.notes-input
  width: 100%
  background: rgba(255, 255, 255, 0.05)
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 4px
  color: $grey-lighter
  font-size: 0.8rem
  padding: 0.3rem 0.5rem
  resize: vertical
  &:focus
    outline: none
    border-color: rgba(78, 204, 163, 0.4)

.slide-up-enter-active, .slide-up-leave-active
  transition: all 0.3s ease
.slide-up-enter, .slide-up-leave-to
  opacity: 0
  transform: translateY(12px)
</style>
