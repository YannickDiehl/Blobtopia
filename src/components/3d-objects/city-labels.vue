<template lang="pug">
v3-group
  v3-dom(
    v-for="(lbl, i) in visibleLabels"
    :key="i"
    :position="[lbl.x, labelHeight, lbl.z]"
  )
    .city-label(:class="lbl.category" :style="{ borderColor: getCategoryColor(lbl.category) }")
      span.city-label-text {{ lbl.label }}
</template>

<script>
import v3Group from '@/components/three-vue/v3-group'
import v3Dom from '@/components/three-vue/v3-dom'
import { CITY_LABELS, CATEGORY_COLORS } from '@/config/city-labels'

export default {
  name: 'CityLabels',
  components: { v3Group, v3Dom },
  props: {
    cameraDistance: { type: Number, default: 500 }
  },
  data: () => ({
    labelHeight: 30
  }),
  computed: {
    visibleLabels() {
      // Show zone labels from default view, building labels when zoomed in
      return CITY_LABELS.filter(lbl => {
        if (lbl.category === 'zone') return this.cameraDistance < 1200
        return this.cameraDistance < 600
      })
    }
  },
  methods: {
    getCategoryColor(cat) {
      return CATEGORY_COLORS[cat] || '#999'
    }
  }
}
</script>

<style lang="sass">
.city-label
  pointer-events: none
  white-space: nowrap
  padding: 2px 8px
  border-radius: 4px
  border-left: 3px solid
  background: rgba(0, 0, 0, 0.65)
  font-size: 11px
  font-weight: 500
  color: #fff
  text-shadow: 0 1px 2px rgba(0,0,0,0.5)
  transform: translateX(-50%)

  &.zone
    font-size: 13px
    font-weight: 700
    background: rgba(0, 0, 0, 0.75)
    padding: 3px 10px

  &.civic
    font-weight: 700
</style>
