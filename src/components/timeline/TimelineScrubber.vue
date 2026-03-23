<template lang="pug">
.timeline-scrubber(ref="container")
  canvas(ref="canvas", @mousedown="onMouseDown", @mousemove="onMouseMove", @mouseup="onMouseUp", @mouseleave="onMouseLeave", @click="onClick")
  .scrubber-tooltip(v-if="tooltipVisible", :style="{ left: tooltipX + 'px' }")
    span {{ tooltipText }}
</template>

<script>
import { mapGetters } from 'vuex'
import { ERAS, getEraForTick } from '@/config/timeline-eras'

export default {
  name: 'TimelineScrubber'
  , props: {
    height: { type: Number, default: 40 }
    , sparklineData: { type: Object, default: null }
  }
  , data: () => ({
    isDragging: false
    , tooltipVisible: false
    , tooltipX: 0
    , tooltipText: ''
    , canvasWidth: 0
    , dpr: 1
  })
  , computed: {
    ...mapGetters('simulation', {
      tick: 'tick'
      , maxTick: 'maxTick'
      , timelineEvents: 'timelineEvents'
    })
  }
  , watch: {
    tick() { this.draw() }
    , maxTick() { this.draw() }
    , sparklineData() { this.draw() }
  }
  , mounted(){
    this.dpr = window.devicePixelRatio || 1
    this.resizeObserver = new ResizeObserver(() => this.onResize())
    this.resizeObserver.observe(this.$refs.container)
    this.$nextTick(() => this.onResize())
  }
  , beforeDestroy(){
    if (this.resizeObserver) this.resizeObserver.disconnect()
  }
  , methods: {
    onResize(){
      const container = this.$refs.container
      const canvas = this.$refs.canvas
      if (!container || !canvas) return
      this.canvasWidth = container.clientWidth
      canvas.width = this.canvasWidth * this.dpr
      canvas.height = this.height * this.dpr
      canvas.style.width = this.canvasWidth + 'px'
      canvas.style.height = this.height + 'px'
      this.draw()
    }

    , draw(){
      const canvas = this.$refs.canvas
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const w = this.canvasWidth
      const h = this.height
      const dpr = this.dpr
      const max = this.maxTick || 1

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)

      // Layer 1: Era backgrounds
      for (const era of ERAS) {
        if (era.end < 0 || era.start > max) continue
        const x1 = Math.max(0, era.start / max * w)
        const x2 = Math.min(w, era.end / max * w)
        ctx.fillStyle = era.color
        ctx.fillRect(x1, 0, x2 - x1, h)
      }

      // Layer 2: Sparkline tracks
      if (this.sparklineData && this.sparklineData.ticks) {
        const ticks = this.sparklineData.ticks
        const global = this.sparklineData.global
        this.drawSparkline(ctx, w, h, ticks, global.satisfaction, '#4ecca3', max)
        this.drawSparkline(ctx, w, h, ticks, global.trust, '#5c9ded', max)
        this.drawSparkline(ctx, w, h, ticks, global.protest, '#e74c3c', max)
      }

      // Layer 3: Event markers
      if (this.timelineEvents) {
        for (const ev of this.timelineEvents) {
          const x = ev.tick / max * w
          const isElection = ev.description && ev.description.includes('Wahl')
          ctx.strokeStyle = isElection ? 'rgba(231, 76, 60, 0.7)' : 'rgba(240, 169, 64, 0.6)'
          ctx.lineWidth = isElection ? 2 : 1
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, h)
          ctx.stroke()
        }
      }

      // Layer 4: Playhead
      const px = (this.tick || 0) / max * w
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, h)
      ctx.stroke()

      // Playhead triangle
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(px - 5, 0)
      ctx.lineTo(px + 5, 0)
      ctx.lineTo(px, 6)
      ctx.closePath()
      ctx.fill()
    }

    , drawSparkline(ctx, w, h, ticks, values, color, max) {
      if (!values || values.length < 2) return
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.globalAlpha = 0.6
      ctx.beginPath()
      for (let i = 0; i < values.length; i++) {
        const x = ticks[i] / max * w
        // Normalize 0-10 to canvas height (inverted)
        const y = h - (values[i] / 10) * (h - 4) - 2
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    , tickFromX(clientX) {
      const rect = this.$refs.canvas.getBoundingClientRect()
      const x = clientX - rect.left
      const pct = Math.max(0, Math.min(1, x / rect.width))
      return Math.round(pct * (this.maxTick || 0))
    }

    , onClick(e) {
      if (this.isDragging) return
      const tick = this.tickFromX(e.clientX)
      this.$store.dispatch('simulation/stopPlayback')
      this.$store.dispatch('simulation/seekTick', tick)
    }

    , onMouseDown(e) {
      this.isDragging = true
      const tick = this.tickFromX(e.clientX)
      this.$store.dispatch('simulation/stopPlayback')
      this.$store.dispatch('simulation/seekTickDebounced', tick)
    }

    , onMouseMove(e) {
      const tick = this.tickFromX(e.clientX)
      // Tooltip
      const rect = this.$refs.canvas.getBoundingClientRect()
      this.tooltipX = e.clientX - rect.left
      const tpy = 365
      const year = Math.floor(tick / tpy)
      const month = Math.floor((tick % tpy) / 30) + 1
      const day = (tick % 30) + 1
      const eraIdx = getEraForTick(tick)
      const eraName = ERAS[eraIdx] ? ERAS[eraIdx].name : ''
      this.tooltipText = `J${year} M${month} T${day} — ${eraName}`
      this.tooltipVisible = true

      if (this.isDragging) {
        this.$store.dispatch('simulation/seekTickDebounced', tick)
      }
    }

    , onMouseUp(e) {
      if (this.isDragging) {
        this.isDragging = false
        const tick = this.tickFromX(e.clientX)
        this.$store.dispatch('simulation/seekTick', tick)
      }
    }

    , onMouseLeave() {
      this.tooltipVisible = false
      if (this.isDragging) {
        this.isDragging = false
      }
    }
  }
}
</script>

<style lang="sass" scoped>
.timeline-scrubber
  position: relative
  width: 100%
  cursor: pointer

  canvas
    display: block
    width: 100%
    border-radius: 3px

.scrubber-tooltip
  position: absolute
  top: -22px
  transform: translateX(-50%)
  background: rgba(0, 0, 0, 0.9)
  padding: 2px 6px
  border-radius: 3px
  font-size: 0.6rem
  color: $grey-lighter
  white-space: nowrap
  pointer-events: none
</style>
