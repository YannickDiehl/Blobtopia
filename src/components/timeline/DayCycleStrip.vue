<template lang="pug">
.day-cycle-strip
  .hour-segments
    .hour-seg(
      v-for="h in 24"
      , :key="h - 1"
      , :class="{ active: (h - 1) === hour, past: (h - 1) < hour }"
      , :style="{ backgroundColor: hourColor(h - 1) }"
      , :title="(h - 1) + ':00 — ' + activityLabel(h - 1)"
      , @click="setHour(h - 1)"
    )
  .time-labels
    span.time-label 0h
    span.time-label 6h
    span.time-label 12h
    span.time-label 18h
    span.time-label 24h
  .sun-indicator(:style="{ left: (hour / 23 * 100) + '%' }")
    span {{ hour < 6 || hour > 20 ? '☾' : '☀' }}
</template>

<script>
import { mapGetters } from 'vuex'

const HOUR_COLORS = [
  '#1a1a3e','#1a1a3e','#1a1a3e','#1a1a3e','#1e2a4a','#2d3a5c'  // 0-5
  ,'#4a5568','#d4a544','#e8b84a','#d4a544','#c4a050','#b89840'    // 6-11
  ,'#d4a544','#c4a050','#b89840','#a08030','#8b6020','#7a4820'    // 12-17
  ,'#5c3060','#4a2050','#3a1840','#2a1838','#1a1a3e','#1a1a3e'     // 18-23
]

const ACTIVITY_LABELS = {
  0: 'Schlafen', 1: 'Schlafen', 2: 'Schlafen', 3: 'Schlafen'
  ,4: 'Schlafen', 5: 'Schlafen', 6: 'Aufstehen'
  ,7: 'Pendeln', 8: 'Arbeit', 9: 'Arbeit', 10: 'Arbeit', 11: 'Arbeit'
  ,12: 'Mittagessen', 13: 'Arbeit', 14: 'Arbeit', 15: 'Arbeit', 16: 'Arbeit'
  ,17: 'Feierabend', 18: 'Freizeit', 19: 'Freizeit', 20: 'Freizeit'
  ,21: 'Abend', 22: 'Schlafen', 23: 'Schlafen'
}

export default {
  name: 'DayCycleStrip'
  , computed: {
    ...mapGetters('simulation', {
      hour: 'hour'
    })
  }
  , methods: {
    hourColor(h) {
      return HOUR_COLORS[h] || '#1a1a3e'
    }
    , activityLabel(h) {
      return ACTIVITY_LABELS[h] || ''
    }
    , setHour(h) {
      this.$store.commit('simulation/setHour', h)
      this.$store.commit('simulation/setSubHourFraction', 0)
    }
  }
}
</script>

<style lang="sass" scoped>
.day-cycle-strip
  position: relative
  padding: 0 0 14px

.hour-segments
  display: flex
  height: 8px
  border-radius: 4px
  overflow: hidden

.hour-seg
  flex: 1
  cursor: pointer
  transition: opacity 0.15s
  opacity: 0.5
  &.past
    opacity: 0.8
  &.active
    opacity: 1
    box-shadow: 0 0 4px rgba(255, 255, 255, 0.3)

.time-labels
  display: flex
  justify-content: space-between
  margin-top: 2px

.time-label
  font-size: 0.55rem
  color: rgba(255, 255, 255, 0.25)

.sun-indicator
  position: absolute
  bottom: 0
  transform: translateX(-50%)
  font-size: 0.7rem
  transition: left 0.3s ease
</style>
