/**
 * WebSocket client for Blobtopia server connection.
 * Handles connection, auto-reconnect, and message parsing.
 */

const RECONNECT_INTERVAL = 3000 // ms
const PING_INTERVAL = 30000 // ms

export class BlobtopiaWSClient {
  constructor(url, handlers = {}) {
    this.url = url
    this.handlers = handlers
    this.ws = null
    this.reconnectTimer = null
    this.pingTimer = null
    this.connected = false
    this.intentionalClose = false
  }

  connect() {
    this.intentionalClose = false
    this._doConnect()
  }

  _doConnect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      return
    }

    try {
      this.ws = new WebSocket(this.url)
    } catch (e) {
      this._scheduleReconnect()
      return
    }

    this.ws.onopen = () => {
      this.connected = true
      if (this.handlers.onConnect) {
        this.handlers.onConnect()
      }
      this._startPing()
    }

    this.ws.onclose = () => {
      this.connected = false
      this._stopPing()
      if (this.handlers.onDisconnect) {
        this.handlers.onDisconnect()
      }
      if (!this.intentionalClose) {
        this._scheduleReconnect()
      }
    }

    this.ws.onerror = () => {
      // onclose will fire after onerror
    }

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        this._handleMessage(msg)
      } catch (e) {
        console.warn('Failed to parse WebSocket message:', e)
      }
    }
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'Welcome':
        if (this.handlers.onWelcome) {
          this.handlers.onWelcome(msg)
        }
        break
      case 'GenerationUpdate':
        if (this.handlers.onGenerationUpdate) {
          this.handlers.onGenerationUpdate(msg)
        }
        break
      case 'SimulationStatus':
        if (this.handlers.onSimulationStatus) {
          this.handlers.onSimulationStatus(msg)
        }
        break
      default:
        console.warn('Unknown message type:', msg.type)
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  disconnect() {
    this.intentionalClose = true
    this._stopPing()
    clearTimeout(this.reconnectTimer)
    if (this.ws) {
      this.ws.close()
    }
  }

  _scheduleReconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      this._doConnect()
    }, RECONNECT_INTERVAL)
  }

  _startPing() {
    this._stopPing()
    this.pingTimer = setInterval(() => {
      this.send({ type: 'Ping' })
    }, PING_INTERVAL)
  }

  _stopPing() {
    clearInterval(this.pingTimer)
  }
}
