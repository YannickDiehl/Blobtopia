import { CHAT_API } from '@/config/api'
import { buildSystemPrompt } from '@/lib/build-system-prompt'
import { getBlobStatic, getChangeSummary, resolveActivity } from '@/lib/blob-prompt'

export const chat = {
  namespaced: true
  , state: () => ({
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
    , activeMessages(state, getters) {
      const session = getters.activeSession
      return session ? session.messages : []
    }
    , chatActive(state) {
      return !!state.activeBlobId
    }
    , activeBlob(state) {
      const session = state.sessions[state.activeBlobId]
      return session ? session.blob : null
    }
  }
  , mutations: {
    START_SESSION(state, { blobId, tick, blobName, blob }) {
      if (!state.sessions[blobId]) {
        state.sessions = {
          ...state.sessions
          , [blobId]: { messages: [], tick, blobName, blob: blob || null, ended: false }
        }
      }
      state.activeBlobId = blobId
      state.error = null
    }
    , ADD_MESSAGE(state, { blobId, message }) {
      const session = state.sessions[blobId]
      if (session) { session.messages.push(message) }
    }
    , SET_LOADING(state, loading) { state.isLoading = loading }
    , SET_ERROR(state, error) { state.error = error }
    , END_SESSION(state, blobId) {
      const session = state.sessions[blobId]
      if (session) { session.ended = true }
    }
    , CLOSE_CHAT(state) { state.activeBlobId = null }
  }
  , actions: {
    async startInterview({ commit, state, rootState }, { blobId, tick, blobName, blob }) {
      commit('START_SESSION', { blobId, tick, blobName, blob })

      const session = state.sessions[blobId]
      if (session && session.messages.length > 0) return

      commit('SET_LOADING', true)
      commit('SET_ERROR', null)
      try {
        // Build system prompt client-side from blob data
        const staticBlob = await getBlobStatic(blobId)
        const tpy = (rootState.simulation.timelineMeta && rootState.simulation.timelineMeta.ticks_per_year) || 365
        const cs = await getChangeSummary(blobId, tick || 0)
        const ctx = resolveActivity(rootState, blob)
        const systemPrompt = buildSystemPrompt(blob || {}, staticBlob || {}, tick || 0, tpy, cs, ctx.activity, ctx.hour)

        const headers = { 'Content-Type': 'application/json' }
        const token = localStorage.getItem('blobtopia_chat_token')
        if (token) headers['Authorization'] = 'Bearer ' + token

        const res = await fetch(CHAT_API, {
          method: 'POST'
          , headers
          , body: JSON.stringify({
            blob_id: blobId
            , tick: tick || null
            , system_prompt: systemPrompt
            , messages: []
          })
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Server error ' + res.status)
        }

        const data = await res.json()
        commit('ADD_MESSAGE', {
          blobId
          , message: { role: 'assistant', content: data.reply }
        })
      } catch (e) {
        commit('SET_ERROR', e.message)
        console.warn('Chat greeting failed:', e)
      } finally {
        commit('SET_LOADING', false)
      }
    }

    , async sendMessage({ commit, state, rootState }, text) {
      const blobId = state.activeBlobId
      if (!blobId) return
      const session = state.sessions[blobId]
      if (!session || session.ended) return

      commit('ADD_MESSAGE', { blobId, message: { role: 'user', content: text } })

      const apiMessages = session.messages.map(m => ({
        role: m.role, content: m.content
      }))

      commit('SET_LOADING', true)
      commit('SET_ERROR', null)
      try {
        // Build system prompt client-side
        const staticBlob = await getBlobStatic(blobId)
        const tpy = (rootState.simulation.timelineMeta && rootState.simulation.timelineMeta.ticks_per_year) || 365
        const cs = await getChangeSummary(blobId, session.tick || 0)
        const ctx = resolveActivity(rootState, session.blob)
        const systemPrompt = buildSystemPrompt(
          session.blob || {}, staticBlob || {}, session.tick || 0, tpy, cs, ctx.activity, ctx.hour
        )

        const headers = { 'Content-Type': 'application/json' }
        const token = localStorage.getItem('blobtopia_chat_token')
        if (token) headers['Authorization'] = 'Bearer ' + token

        const res = await fetch(CHAT_API, {
          method: 'POST'
          , headers
          , body: JSON.stringify({
            blob_id: blobId
            , tick: session.tick || null
            , system_prompt: systemPrompt
            , messages: apiMessages
          })
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.error || 'Server error ' + res.status)
        }

        const data = await res.json()
        commit('ADD_MESSAGE', {
          blobId
          , message: { role: 'assistant', content: data.reply }
        })
      } catch (e) {
        commit('SET_ERROR', e.message)
        console.warn('Chat send failed:', e)
      } finally {
        commit('SET_LOADING', false)
      }
    }

    , endInterview({ commit, state }) {
      if (state.activeBlobId) {
        commit('END_SESSION', state.activeBlobId)
      }
    }

    , closeChat({ commit }) {
      commit('CLOSE_CHAT')
    }
  }
}
