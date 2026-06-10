/**
 * Mixin: draggable-panel  (Pointer Events — mouse, touch & pen in one path)
 *
 * The consuming component must define a `panelConfig` computed property and
 * bind :style="panelStyle" on its root element:
 *
 *   panelConfig() {
 *     return {
 *       storageKey: 'blobtopia_panel_xxx',
 *       minWidth: 320, maxWidth: 760,
 *       minHeight: 280, maxHeight: window.innerHeight - 60,
 *       headerSelector: '.xxx-header',
 *       resizable: true
 *     }
 *   }
 *
 * Provides, touch-friendly throughout:
 *   - drag the panel by its header
 *   - resize via a VISIBLE bottom-right grip (injected by the mixin)
 *   - double-tap the grip   → maximize / restore
 *   - double-tap the header → reset to default position/size
 *   - viewport clamping + localStorage persistence
 *
 * The grip is injected into the root element and inline-styled (scoped CSS
 * cannot reach an injected node), so no per-component template change is needed.
 */

const TOP_BAR_HEIGHT = 44 // px reserved at top for the TopBar

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)) }

function isInteractive(el) {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'OPTION') return true
  if (el.classList && (el.classList.contains('action-btn') || el.classList.contains('close-btn'))) return true
  if (el.closest && (el.closest('.action-btn') || el.closest('.close-btn') || el.closest('button'))) return true
  return false
}

export default {
  // Only panelX/Y/W/H are reactive (they drive panelStyle/cardStyle). The
  // transient _dp_* drag/resize state lives as plain instance properties
  // (set in the handlers) — Vue 2 does not proxy underscore-prefixed data keys.
  data() {
    return {
      panelX: null
      , panelY: null
      , panelW: null
      , panelH: null
    }
  }

  , created() {
    const cfg = this.panelConfig
    if (!cfg || !cfg.storageKey) return
    try {
      const raw = localStorage.getItem(cfg.storageKey)
      if (!raw) return
      const s = JSON.parse(raw)
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (s.x != null && s.y != null && s.x >= 0 && s.x < vw && s.y >= TOP_BAR_HEIGHT - 10 && s.y < vh) {
        this.panelX = clamp(s.x, 0, vw - 80)
        this.panelY = clamp(s.y, TOP_BAR_HEIGHT, vh - 60)
        if (s.w != null) this.panelW = clamp(s.w, cfg.minWidth, Math.min(cfg.maxWidth, vw))
        if (s.h != null) this.panelH = clamp(s.h, cfg.minHeight, Math.min(cfg.maxHeight, vh - TOP_BAR_HEIGHT))
      }
    } catch (_) { /* ignore corrupt data */ }
  }

  , computed: {
    panelStyle() {
      if (this.panelX === null && this.panelY === null && this.panelW === null && this.panelH === null) return {}
      const s = {}
      if (this.panelX !== null && this.panelY !== null) {
        s.position = 'fixed'
        s.left = this.panelX + 'px'
        s.top = this.panelY + 'px'
        s.bottom = 'auto'
        s.right = 'auto'
      }
      if (this.panelW !== null) s.width = this.panelW + 'px'
      if (this.panelH !== null) s.height = this.panelH + 'px'
      return s
    }
  }

  , mounted() {
    const cfg = this.panelConfig
    if (!cfg) return

    // Drag by the header
    this._dp_header = this.$el.querySelector(cfg.headerSelector)
    if (this._dp_header) {
      this._dp_header.style.touchAction = 'none' // don't scroll the page while dragging
      this._dp_onHeaderDown = (e) => this._dpDragStart(e)
      this._dp_onHeaderDbl = () => { if (!this._dpDblSquelched()) this.resetPanelPosition() }
      this._dp_header.addEventListener('pointerdown', this._dp_onHeaderDown)
      this._dp_header.addEventListener('dblclick', this._dp_onHeaderDbl)
    }

    // Visible, touch-friendly resize grip (bottom-right)
    if (cfg.resizable !== false) {
      // The grip anchors to the nearest positioned ancestor — make sure $el qualifies.
      if (window.getComputedStyle(this.$el).position === 'static') this.$el.style.position = 'relative'
      const grip = document.createElement('div')
      grip.setAttribute('aria-label', 'Größe ändern (Doppeltipp: maximieren)')
      grip.setAttribute('title', 'Ziehen zum Skalieren · Doppelklick: maximieren')
      Object.assign(grip.style, {
        position: 'absolute'
        , right: '1px'
        , bottom: '1px'
        , width: '22px'
        , height: '22px'
        , cursor: 'nwse-resize'
        , touchAction: 'none'
        , zIndex: '30'
        , background: 'linear-gradient(135deg, transparent 0 45%, rgba(255,255,255,0.5) 45% 55%, transparent 55% 68%, rgba(255,255,255,0.5) 68% 78%, transparent 78%)'
        , borderBottomRightRadius: '7px'
      })
      this._dp_grip = grip
      this._dp_onGripDown = (e) => this._dpResizeStart(e)
      this._dp_onGripDbl = () => { if (!this._dpDblSquelched()) this.toggleMaximize() }
      grip.addEventListener('pointerdown', this._dp_onGripDown)
      grip.addEventListener('dblclick', this._dp_onGripDbl)
      this.$el.appendChild(grip)
    }

    this._dp_onWinResize = () => this._dpClamp()
    window.addEventListener('resize', this._dp_onWinResize)
  }

  , beforeDestroy() {
    if (this._dp_header) {
      this._dp_header.removeEventListener('pointerdown', this._dp_onHeaderDown)
      this._dp_header.removeEventListener('dblclick', this._dp_onHeaderDbl)
    }
    if (this._dp_grip) {
      this._dp_grip.removeEventListener('pointerdown', this._dp_onGripDown)
      this._dp_grip.removeEventListener('dblclick', this._dp_onGripDbl)
      if (this._dp_grip.parentNode) this._dp_grip.parentNode.removeChild(this._dp_grip)
    }
    this._dpRemoveDocMove()
    window.removeEventListener('resize', this._dp_onWinResize)
  }

  , methods: {
    // Touch/pen double-tap detection in pointerdown: Chrome synthesizes
    // dblclick from touch unreliably (esp. right after a drag/resize), so we
    // detect it ourselves. Mouse keeps the native dblclick path.
    _dpIsDoubleTap(e, key) {
      if (e.pointerType === 'mouse') return false
      const now = e.timeStamp || Date.now()
      const last = this[key]
      this[key] = { t: now, x: e.clientX, y: e.clientY }
      const isDouble = !!(last && now - last.t < 400 &&
        Math.abs(e.clientX - last.x) < 30 && Math.abs(e.clientY - last.y) < 30)
      if (isDouble) {
        this[key] = null
        this._dp_squelchDblUntil = Date.now() + 700 // suppress a late native dblclick
      }
      return isDouble
    }

    , _dpDblSquelched() {
      return Date.now() < (this._dp_squelchDblUntil || 0)
    }

    , _dpAddDocMove(moveFn, upFn) {
      this._dp_move = moveFn
      this._dp_up = upFn
      document.addEventListener('pointermove', this._dp_move)
      document.addEventListener('pointerup', this._dp_up)
      document.addEventListener('pointercancel', this._dp_up)
    }

    , _dpRemoveDocMove() {
      if (this._dp_move) document.removeEventListener('pointermove', this._dp_move)
      if (this._dp_up) {
        document.removeEventListener('pointerup', this._dp_up)
        document.removeEventListener('pointercancel', this._dp_up)
      }
      this._dp_move = null
      this._dp_up = null
    }

    , _dpInitRect() {
      const r = this.$el.getBoundingClientRect()
      if (this.panelX === null) { this.panelX = r.left; this.panelY = r.top }
      if (this.panelW === null) this.panelW = r.width
      if (this.panelH === null) this.panelH = r.height
    }

    // ═══ DRAG ═══
    , _dpDragStart(e) {
      if (e.button != null && e.button !== 0) return
      if (isInteractive(e.target)) return
      if (this._dpIsDoubleTap(e, '_dp_lastHeaderTap')) {
        e.preventDefault()
        this.resetPanelPosition()
        return
      }
      this._dpInitRect()
      this._dp_maximized = false
      this._dp_sx = e.clientX
      this._dp_sy = e.clientY
      this._dp_ox = this.panelX
      this._dp_oy = this.panelY
      this._dpAddDocMove((ev) => this._dpDragMove(ev), () => this._dpEnd())
      e.preventDefault()
    }

    , _dpDragMove(e) {
      const w = this.panelW || this.$el.offsetWidth
      this.panelX = clamp(this._dp_ox + (e.clientX - this._dp_sx), 0, window.innerWidth - Math.min(w, window.innerWidth))
      this.panelY = clamp(this._dp_oy + (e.clientY - this._dp_sy), TOP_BAR_HEIGHT, window.innerHeight - 40)
    }

    // ═══ RESIZE (bottom-right grip) ═══
    , _dpResizeStart(e) {
      if (e.button != null && e.button !== 0) return
      const cfg = this.panelConfig
      if (!cfg || cfg.resizable === false) return
      if (this._dpIsDoubleTap(e, '_dp_lastGripTap')) {
        e.preventDefault()
        e.stopPropagation()
        this.toggleMaximize()
        return
      }
      this._dpInitRect()
      this._dp_maximized = false
      this._dp_sx = e.clientX
      this._dp_sy = e.clientY
      this._dp_ow = this.panelW
      this._dp_oh = this.panelH
      this._dpAddDocMove((ev) => this._dpResizeMove(ev), () => this._dpEnd())
      e.preventDefault()
      e.stopPropagation()
    }

    , _dpResizeMove(e) {
      const cfg = this.panelConfig
      // Breite/Höhe so klemmen, dass die rechte/untere Kante (und damit der
      // Grip) im Viewport bleibt — sonst ist er per Touch unerreichbar
      const maxW = Math.min(cfg.maxWidth, window.innerWidth, window.innerWidth - (this.panelX || 0) - 4)
      const maxH = Math.min(cfg.maxHeight, window.innerHeight - TOP_BAR_HEIGHT, window.innerHeight - (this.panelY || 0) - 4)
      this.panelW = clamp(this._dp_ow + (e.clientX - this._dp_sx), cfg.minWidth, maxW)
      this.panelH = clamp(this._dp_oh + (e.clientY - this._dp_sy), cfg.minHeight, maxH)
    }

    , _dpEnd() {
      this._dpRemoveDocMove()
      this._dpSave()
    }

    // ═══ MAXIMIZE / RESTORE (double-tap the grip) ═══
    , toggleMaximize() {
      const cfg = this.panelConfig
      if (!cfg) return
      if (!this._dp_maximized) {
        this._dp_prev = { x: this.panelX, y: this.panelY, w: this.panelW, h: this.panelH }
        const vw = window.innerWidth
        const vh = window.innerHeight
        this.panelX = 8
        this.panelY = TOP_BAR_HEIGHT + 4
        this.panelW = clamp(vw - 16, cfg.minWidth, cfg.maxWidth)
        this.panelH = clamp(vh - TOP_BAR_HEIGHT - 12, cfg.minHeight, cfg.maxHeight)
        this._dp_maximized = true
      } else {
        const p = this._dp_prev || {}
        this.panelX = p.x != null ? p.x : null
        this.panelY = p.y != null ? p.y : null
        this.panelW = p.w != null ? p.w : null
        this.panelH = p.h != null ? p.h : null
        this._dp_maximized = false
      }
      this._dpSave()
    }

    // ═══ PERSISTENCE / CLAMP / RESET ═══
    , _dpSave() {
      const cfg = this.panelConfig
      if (!cfg || !cfg.storageKey) return
      try {
        localStorage.setItem(cfg.storageKey, JSON.stringify({
          x: this.panelX, y: this.panelY, w: this.panelW, h: this.panelH
        }))
      } catch (_) { /* quota exceeded etc. */ }
    }

    , _dpClamp() {
      if (this.panelX === null) return
      const cfg = this.panelConfig
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (cfg && this.panelW !== null) this.panelW = clamp(this.panelW, cfg.minWidth, Math.min(cfg.maxWidth, vw))
      if (cfg && this.panelH !== null) this.panelH = clamp(this.panelH, cfg.minHeight, Math.min(cfg.maxHeight, vh - TOP_BAR_HEIGHT))
      const w = this.panelW || this.$el.offsetWidth
      this.panelX = clamp(this.panelX, 0, vw - Math.min(w, vw))
      this.panelY = clamp(this.panelY, TOP_BAR_HEIGHT, vh - 40)
      this._dpSave()
    }

    , resetPanelPosition() {
      this.panelX = null
      this.panelY = null
      this.panelW = null
      this.panelH = null
      this._dp_maximized = false
      const cfg = this.panelConfig
      if (cfg && cfg.storageKey) {
        try { localStorage.removeItem(cfg.storageKey) } catch (_) { /* ignore */ }
      }
    }
  }
}
