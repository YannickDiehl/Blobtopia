/**
 * Mixin: draggable-panel
 *
 * Makes any Vue 2 panel component draggable (by header) and resizable (by edges).
 * The consuming component must define a `panelConfig` computed property:
 *
 *   panelConfig() {
 *     return {
 *       storageKey: 'blobtopia_panel_xxx',
 *       minWidth: 300, maxWidth: 700,
 *       minHeight: 200, maxHeight: window.innerHeight - 60,
 *       headerSelector: '.interaction-header',
 *       resizable: true
 *     }
 *   }
 *
 * Then bind `:style="panelStyle"` on the root element.
 */

const EDGE_THRESHOLD = 7 // px from border to detect resize edge
const TOP_BAR_HEIGHT = 44 // px reserved at top for TopBar

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val))
}

function isInteractive(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return true
  if (el.classList && (el.classList.contains('action-btn') || el.classList.contains('close-btn'))) return true
  if (el.closest && (el.closest('.action-btn') || el.closest('.close-btn') || el.closest('button'))) return true
  return false
}

function detectEdge(el, e) {
  const rect = el.getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  const w = rect.width
  const h = rect.height

  const nearLeft = x < EDGE_THRESHOLD
  const nearRight = x > w - EDGE_THRESHOLD
  const nearTop = y < EDGE_THRESHOLD
  const nearBottom = y > h - EDGE_THRESHOLD

  if (nearTop && nearLeft) return 'nw'
  if (nearTop && nearRight) return 'ne'
  if (nearBottom && nearLeft) return 'sw'
  if (nearBottom && nearRight) return 'se'
  if (nearTop) return 'n'
  if (nearBottom) return 's'
  if (nearLeft) return 'w'
  if (nearRight) return 'e'
  return null
}

const EDGE_CURSORS = {
  n: 'ns-resize', s: 'ns-resize',
  e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', sw: 'nesw-resize',
  nw: 'nwse-resize', se: 'nwse-resize'
}

export default {
  data() {
    // Load saved state early so it's available before first render
    let saved = null
    try {
      const cfg = this.$options._panelConfigCache
      if (!cfg) {
        // panelConfig isn't available yet in data(); we'll load in created()
      }
    } catch (_) { /* ignore */ }
    return {
      panelX: null,
      panelY: null,
      panelW: null,
      panelH: null,
      _dp_isDragging: false,
      _dp_isResizing: false,
      _dp_resizeEdge: null,
      _dp_startMouseX: 0,
      _dp_startMouseY: 0,
      _dp_startX: 0,
      _dp_startY: 0,
      _dp_startW: 0,
      _dp_startH: 0
    }
  }

  , created() {
    // Load saved panel state from localStorage before mount
    const cfg = this.panelConfig
    if (cfg && cfg.storageKey) {
      try {
        const raw = localStorage.getItem(cfg.storageKey)
        if (raw) {
          const saved = JSON.parse(raw)
          const vw = window.innerWidth
          const vh = window.innerHeight
          // Validate saved position is within current viewport
          if (saved.x != null && saved.y != null) {
            const w = saved.w || 320
            const h = saved.h || 300
            if (saved.x >= 0 && saved.x + w <= vw + 50 && saved.y >= TOP_BAR_HEIGHT - 10 && saved.y < vh) {
              this.panelX = clamp(saved.x, 0, vw - 100)
              this.panelY = clamp(saved.y, TOP_BAR_HEIGHT, vh - 60)
              this.panelW = saved.w || null
              this.panelH = saved.h || null
            }
          }
        }
      } catch (_) { /* ignore corrupt data */ }
    }
  }

  , computed: {
    panelStyle() {
      if (this.panelX === null && this.panelY === null && this.panelW === null && this.panelH === null) {
        return {}
      }
      const style = {}
      if (this.panelX !== null && this.panelY !== null) {
        style.position = 'fixed'
        style.left = this.panelX + 'px'
        style.top = this.panelY + 'px'
        style.bottom = 'auto'
        style.right = 'auto'
      }
      if (this.panelW !== null) {
        style.width = this.panelW + 'px'
      }
      if (this.panelH !== null) {
        style.height = this.panelH + 'px'
      }
      return style
    }
  }

  , mounted() {
    const cfg = this.panelConfig
    if (!cfg) return

    // Header drag
    this._dp_headerEl = this.$el.querySelector(cfg.headerSelector)
    if (this._dp_headerEl) {
      this._dp_onHeaderMouseDown = (e) => this._dpStartDrag(e)
      this._dp_headerEl.addEventListener('mousedown', this._dp_onHeaderMouseDown)

      // Double-click to reset
      this._dp_onHeaderDblClick = () => this.resetPanelPosition()
      this._dp_headerEl.addEventListener('dblclick', this._dp_onHeaderDblClick)
    }

    // Edge resize detection
    if (cfg.resizable !== false) {
      this._dp_onElMouseMove = (e) => this._dpDetectEdge(e)
      this._dp_onElMouseDown = (e) => this._dpStartResize(e)
      this.$el.addEventListener('mousemove', this._dp_onElMouseMove)
      this.$el.addEventListener('mousedown', this._dp_onElMouseDown)
    }

    // Window resize handler
    this._dp_onWindowResize = () => this._dpClampToViewport()
    window.addEventListener('resize', this._dp_onWindowResize)
  }

  , beforeDestroy() {
    // Clean up header listeners
    if (this._dp_headerEl) {
      this._dp_headerEl.removeEventListener('mousedown', this._dp_onHeaderMouseDown)
      this._dp_headerEl.removeEventListener('dblclick', this._dp_onHeaderDblClick)
    }
    // Clean up element listeners
    if (this._dp_onElMouseMove) {
      this.$el.removeEventListener('mousemove', this._dp_onElMouseMove)
      this.$el.removeEventListener('mousedown', this._dp_onElMouseDown)
    }
    // Clean up document listeners (safety)
    document.removeEventListener('mousemove', this._dp_boundDragMove)
    document.removeEventListener('mouseup', this._dp_boundDragEnd)
    document.removeEventListener('mousemove', this._dp_boundResizeMove)
    document.removeEventListener('mouseup', this._dp_boundResizeEnd)
    // Window resize
    window.removeEventListener('resize', this._dp_onWindowResize)
  }

  , methods: {
    // ═══ DRAG ═══
    _dpStartDrag(e) {
      if (e.button !== 0) return
      if (isInteractive(e.target)) return

      // Initialize position from current element rect if not yet tracked
      if (this.panelX === null) {
        const rect = this.$el.getBoundingClientRect()
        this.panelX = rect.left
        this.panelY = rect.top
      }

      this._dp_isDragging = true
      this._dp_startMouseX = e.clientX
      this._dp_startMouseY = e.clientY
      this._dp_startX = this.panelX
      this._dp_startY = this.panelY

      this._dp_boundDragMove = (ev) => this._dpDragMove(ev)
      this._dp_boundDragEnd = (ev) => this._dpDragEnd(ev)
      document.addEventListener('mousemove', this._dp_boundDragMove)
      document.addEventListener('mouseup', this._dp_boundDragEnd)

      e.preventDefault()
    }

    , _dpDragMove(e) {
      const dx = e.clientX - this._dp_startMouseX
      const dy = e.clientY - this._dp_startMouseY
      const w = this.panelW || this.$el.offsetWidth
      const h = this.panelH || this.$el.offsetHeight

      this.panelX = clamp(this._dp_startX + dx, 0, window.innerWidth - w)
      this.panelY = clamp(this._dp_startY + dy, TOP_BAR_HEIGHT, window.innerHeight - 40)
    }

    , _dpDragEnd() {
      this._dp_isDragging = false
      document.removeEventListener('mousemove', this._dp_boundDragMove)
      document.removeEventListener('mouseup', this._dp_boundDragEnd)
      this._dpSave()
    }

    // ═══ RESIZE ═══
    , _dpDetectEdge(e) {
      // Don't change cursor while dragging or resizing
      if (this._dp_isDragging || this._dp_isResizing) return

      const edge = detectEdge(this.$el, e)
      if (edge) {
        this.$el.style.cursor = EDGE_CURSORS[edge]
      } else {
        this.$el.style.cursor = ''
      }
      this._dp_resizeEdge = edge
    }

    , _dpStartResize(e) {
      if (e.button !== 0) return
      if (!this._dp_resizeEdge) return
      // Only resize from edges, not from header or interactive elements
      if (isInteractive(e.target)) return
      // Don't start resize if the click is on the header (that's for dragging)
      if (this._dp_headerEl && this._dp_headerEl.contains(e.target)) return

      const cfg = this.panelConfig
      if (!cfg || cfg.resizable === false) return

      // Initialize position/size from current element if not yet tracked
      const rect = this.$el.getBoundingClientRect()
      if (this.panelX === null) {
        this.panelX = rect.left
        this.panelY = rect.top
      }
      if (this.panelW === null) {
        this.panelW = rect.width
      }
      if (this.panelH === null) {
        this.panelH = rect.height
      }

      this._dp_isResizing = true
      this._dp_startMouseX = e.clientX
      this._dp_startMouseY = e.clientY
      this._dp_startX = this.panelX
      this._dp_startY = this.panelY
      this._dp_startW = this.panelW
      this._dp_startH = this.panelH

      this._dp_boundResizeMove = (ev) => this._dpResizeMove(ev)
      this._dp_boundResizeEnd = (ev) => this._dpResizeEnd(ev)
      document.addEventListener('mousemove', this._dp_boundResizeMove)
      document.addEventListener('mouseup', this._dp_boundResizeEnd)

      e.preventDefault()
      e.stopPropagation()
    }

    , _dpResizeMove(e) {
      const cfg = this.panelConfig
      const dx = e.clientX - this._dp_startMouseX
      const dy = e.clientY - this._dp_startMouseY
      const edge = this._dp_resizeEdge

      let newX = this._dp_startX
      let newY = this._dp_startY
      let newW = this._dp_startW
      let newH = this._dp_startH

      // East edge: increase width
      if (edge.includes('e')) {
        newW = clamp(this._dp_startW + dx, cfg.minWidth, cfg.maxWidth)
      }
      // West edge: increase width, decrease x
      if (edge.includes('w')) {
        const dw = clamp(this._dp_startW - dx, cfg.minWidth, cfg.maxWidth) - this._dp_startW
        newW = this._dp_startW + dw
        newX = this._dp_startX - dw
      }
      // South edge: increase height
      if (edge.includes('s')) {
        newH = clamp(this._dp_startH + dy, cfg.minHeight, cfg.maxHeight)
      }
      // North edge: increase height, decrease y
      if (edge.includes('n')) {
        const dh = clamp(this._dp_startH - dy, cfg.minHeight, cfg.maxHeight) - this._dp_startH
        newH = this._dp_startH + dh
        newY = this._dp_startY - dh
      }

      // Clamp position
      newX = clamp(newX, 0, window.innerWidth - newW)
      newY = clamp(newY, TOP_BAR_HEIGHT, window.innerHeight - 40)

      this.panelX = newX
      this.panelY = newY
      this.panelW = newW
      this.panelH = newH
    }

    , _dpResizeEnd() {
      this._dp_isResizing = false
      document.removeEventListener('mousemove', this._dp_boundResizeMove)
      document.removeEventListener('mouseup', this._dp_boundResizeEnd)
      this.$el.style.cursor = ''
      this._dpSave()
    }

    // ═══ PERSISTENCE ═══
    , _dpSave() {
      const cfg = this.panelConfig
      if (!cfg || !cfg.storageKey) return
      try {
        localStorage.setItem(cfg.storageKey, JSON.stringify({
          x: this.panelX, y: this.panelY,
          w: this.panelW, h: this.panelH
        }))
      } catch (_) { /* quota exceeded etc */ }
    }

    , _dpClampToViewport() {
      if (this.panelX === null) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const w = this.panelW || this.$el.offsetWidth
      this.panelX = clamp(this.panelX, 0, vw - Math.min(w, vw))
      this.panelY = clamp(this.panelY, TOP_BAR_HEIGHT, vh - 40)
      // Also clamp size
      if (this.panelW !== null) {
        const cfg = this.panelConfig
        if (cfg) {
          this.panelW = clamp(this.panelW, cfg.minWidth, Math.min(cfg.maxWidth, vw))
          this.panelH = clamp(this.panelH, cfg.minHeight, Math.min(cfg.maxHeight, vh - TOP_BAR_HEIGHT))
        }
      }
      this._dpSave()
    }

    , resetPanelPosition() {
      this.panelX = null
      this.panelY = null
      this.panelW = null
      this.panelH = null
      this.$el.style.cursor = ''
      const cfg = this.panelConfig
      if (cfg && cfg.storageKey) {
        try { localStorage.removeItem(cfg.storageKey) } catch (_) { /* ignore */ }
      }
    }
  }
}
