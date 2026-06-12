/**
 * Stub for the original "copilot" animation framework by minutelabs.
 * The original npm package was replaced by @github/copilot.
 * This provides the minimum API surface used by the evolution simulator.
 */

class FrameManager {
  constructor() {
    this.frames = []
    this.state = {}
    this.listeners = {}
  }

  add(state, meta) {
    this.frames.push({ state, meta })
    Object.assign(this.state, state)
    return this
  }

  getFrame(id) {
    return this.frames.find(f => f.meta && f.meta.id === id) || this.frames[0]
  }

  on(event, fn) {
    if (!this.listeners[event]) this.listeners[event] = []
    this.listeners[event].push(fn)
  }

  off() {
    this.listeners = {}
  }

  emit(event) {
    (this.listeners[event] || []).forEach(fn => fn())
  }
}

function Copilot(config) {
  const manager = new FrameManager()
  // Initialize state from config defaults
  Object.keys(config).forEach(key => {
    const c = config[key]
    if (c && typeof c === 'object' && 'default' in c) {
      manager.state[key] = c.default
    } else {
      manager.state[key] = c
    }
  })
  return manager
}

Copilot.Player = function({ manager, totalTime = 1 } = {}) {
  const player = {
    time: 0
    ,totalTime: totalTime
    ,paused: true
    ,playbackRate: 1
    ,_listeners: {}
    ,_raf: null

    ,on(event, fn) {
      if (!this._listeners[event]) this._listeners[event] = []
      this._listeners[event].push(fn)
    }

    ,emit(event) {
      (this._listeners[event] || []).forEach(fn => fn())
    }

    // Original-API: off(event, fn) entfernt einen Listener, off(true) alle.
    // Fehlte im Stub — typewriter-text.transition.vue ruft off(true) nach
    // jeder Animation und warf damit bei jedem Tour-Schritt eine Exception.
    ,off(event, fn) {
      if (event === true || event == null) {
        this._listeners = {}
        return
      }
      if (!this._listeners[event]) return
      this._listeners[event] = fn
        ? this._listeners[event].filter(l => l !== fn)
        : []
    }

    ,togglePause(p) {
      this.paused = p !== undefined ? p : !this.paused
      this.emit('togglePause')
      if (!this.paused) this._tick()
    }

    ,seek(time) {
      this.time = Math.max(0, Math.min(time, this.totalTime))
      this.emit('update')
    }

    ,playTo(time) {
      this.seek(typeof time === 'string' ? parseFloat(time) : time)
    }

    ,_tick() {
      if (this.paused) return
      this.time += 16 * this.playbackRate
      if (this.time >= this.totalTime) {
        this.time = this.totalTime
        this.paused = true
        this.emit('end')
      }
      this.emit('update')
      if (manager) manager.emit('update')
      if (!this.paused) {
        this._raf = requestAnimationFrame(() => this._tick())
      }
    }

    ,destroy() {
      this.paused = true
      if (this._raf) cancelAnimationFrame(this._raf)
      this._listeners = {}
    }
  }
  return player
}

Copilot.Util = {
  now: () => performance.now()
}

Copilot.Interpolators = {
  Linear: (from, to, t) => from + (to - from) * t
}

Copilot.Animation = {
  getTimeFraction: (start, end, now) => Math.min(1, Math.max(0, (now - start) / (end - start)))
  ,interpolateProperty: (fn, from, to, t) => fn(from, to, t)
}

Copilot.Easing = {
  Quadratic: {
    InOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }
}

// Register custom type for Vector3
Copilot.registerType = function() {}

export default Copilot
