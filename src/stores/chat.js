/**
 * Pinia store: chat (Blob-Interviews über api/chat.js).
 * 1:1-Port des Vuex-Moduls; Mutations sind in die Actions gewandert,
 * rootState.simulation läuft jetzt über useSimulationStore().
 */
import { defineStore } from 'pinia'
import { CHAT_API } from '@/config/api'
import { buildSystemPrompt } from '@/lib/build-system-prompt'
import { getBlobStatic, getChangeSummary, resolveActivity } from '@/lib/blob-prompt'
import { useSimulationStore } from '@/stores/simulation'

function authHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('blobtopia_chat_token')
  if (token) headers['Authorization'] = 'Bearer ' + token
  return headers
}

export const useChatStore = defineStore('chat', {
  state: () => ({
    sessions: {}
    , activeBlobId: null
    , isLoading: false
    , error: null
  })
  , getters: {
    activeSession(state) {
      if (!state.activeBlobId) return null
      return state.sessions[state.activeBlobId] || null
    }
    , activeMessages() {
      const session = this.activeSession
      return session ? session.messages : []
    }
    , chatActive: state => !!state.activeBlobId
    , activeBlob(state) {
      const session = state.sessions[state.activeBlobId]
      return session ? session.blob : null
    }
  }
  , actions: {
    // Persona-Prompt für einen Blob bauen (gemeinsamer Pfad beider Actions)
    async _buildPrompt(blob, blobId, tick) {
      const sim = useSimulationStore()
      const staticBlob = await getBlobStatic(blobId)
      const tpy = (sim.timelineMeta && sim.timelineMeta.ticks_per_year) || 365
      const cs = await getChangeSummary(blobId, tick || 0)
      const ctx = resolveActivity({ simulation: sim }, blob)
      return buildSystemPrompt(blob || {}, staticBlob || {}, tick || 0, tpy, cs, ctx.activity, ctx.hour)
    }

    // Resilienter Transport: 40s-Timeout (nie endlose Tipp-Punkte), ein
    // automatischer Retry bei Netzwerkfehler/Timeout, leere Antworten werden
    // als Fehler sichtbar statt als leere Sprechblase zu landen.
    , async _post(blobId, tick, systemPrompt, messages, isRetry) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 40000)
      let res
      try {
        res = await fetch(CHAT_API, {
          method: 'POST'
          , headers: authHeaders()
          , signal: controller.signal
          , body: JSON.stringify({
            blob_id: blobId
            , tick: tick || null
            , system_prompt: systemPrompt
            , messages
          })
        })
      } catch (cause) {
        clearTimeout(timer)
        if (!isRetry) return this._post(blobId, tick, systemPrompt, messages, true)
        throw new Error(controller.signal.aborted
          ? 'Zeitüberschreitung — der Blob hat nicht geantwortet. Bitte erneut versuchen.'
          : 'Netzwerkfehler — ist der Server erreichbar?', { cause })
      }
      clearTimeout(timer)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Server error ' + res.status)
      }
      const data = await res.json().catch(() => null)
      if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('Leere Antwort vom Server — bitte erneut versuchen.')
      }
      return data
    }

    , async startInterview({ blobId, tick, blobName, blob }) {
      if (!this.sessions[blobId]) {
        this.sessions = {
          ...this.sessions
          , [blobId]: { messages: [], tick, blobName, blob: blob || null, ended: false }
        }
      }
      this.activeBlobId = blobId
      this.error = null

      const session = this.sessions[blobId]
      if (session && session.messages.length > 0) return

      this.isLoading = true
      try {
        const systemPrompt = await this._buildPrompt(blob, blobId, tick)
        const data = await this._post(blobId, tick, systemPrompt, [])
        session.messages.push({ role: 'assistant', content: data.reply })
      } catch (e) {
        this.error = e.message
        console.warn('Chat greeting failed:', e)
      } finally {
        this.isLoading = false
      }
    }

    , async sendMessage(text) {
      const blobId = this.activeBlobId
      if (!blobId) return
      const session = this.sessions[blobId]
      if (!session || session.ended) return

      session.messages.push({ role: 'user', content: text })
      const apiMessages = session.messages.map(m => ({ role: m.role, content: m.content }))

      this.isLoading = true
      this.error = null
      try {
        const systemPrompt = await this._buildPrompt(session.blob, blobId, session.tick)
        const data = await this._post(blobId, session.tick, systemPrompt, apiMessages)
        session.messages.push({ role: 'assistant', content: data.reply })
      } catch (e) {
        this.error = e.message
        console.warn('Chat send failed:', e)
      } finally {
        this.isLoading = false
      }
    }

    , endInterview() {
      const session = this.sessions[this.activeBlobId]
      if (session) session.ended = true
    }

    , closeChat() {
      this.activeBlobId = null
    }
  }
})
