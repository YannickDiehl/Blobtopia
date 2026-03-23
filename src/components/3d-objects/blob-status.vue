<template lang="pug">
.blob-status(@click="$emit('inspect', blob)")
  .blob-badge(v-if="blob")
    .district-dot(:style="{ backgroundColor: districtColor }")
    span.blob-label {{ districtName }}
</template>

<script>
import { DISTRICT_NAMES, DISTRICT_COLORS } from '@/lib/blob-adapter'

export default {
  name: 'BlobStatus'
  , inject: [ 'getStep', 'threeVue' ]
  , props: {
    blob: Object
  }
  , data: () => ({
  })
  , computed: {
    districtName(){
      if (!this.blob) return ''
      return DISTRICT_NAMES[this.blob.district] || 'Unbekannt'
    }
    , districtColor(){
      if (!this.blob) return '#999'
      const hex = DISTRICT_COLORS[this.blob.district] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
  }
}
</script>

<style lang="sass" scoped>
.blob-status
  position: relative
  pointer-events: all
  cursor: pointer

.blob-badge
  display: flex
  align-items: center
  gap: 4px
  background: rgba(0, 0, 0, 0.7)
  backdrop-filter: blur(4px)
  border-radius: 12px
  padding: 3px 8px
  white-space: nowrap

  .district-dot
    width: 8px
    height: 8px
    border-radius: 50%
    flex-shrink: 0

  .blob-label
    font-size: 11px
    color: #ddd
    font-weight: 500
</style>
