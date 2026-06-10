import Vue from 'vue'
import { snapshotToGeneration, snapshotToStatistics, initDistrictMetadata, initBuildingsMap } from '@/lib/blob-adapter'
import { expandTickSnapshot } from '@/lib/timeline-decode'
import { DATA_BASE } from '@/config/api'
import { HOURS_PER_DAY, SECONDS_PER_DAY } from '@/config/world'
import { getEraForTick } from '@/config/timeline-eras'

// ── Static Blob Data (loaded once) ──────────────────────────────────────
let blobsStatic = []   // full static data per blob
let blobIndex = []     // ordered blob IDs (matches compact tick array order)
// Forward-fill cache: last known latent traits per glob (DB writes traits every ~7 ticks)
const lastKnownTraits = {}

async function loadStaticData() {
  const [staticRes, indexRes, buildingsRes] = await Promise.all([
    fetch(`${DATA_BASE}/blobs-static.json`)
    ,fetch(`${DATA_BASE}/blob-index.json`)
    ,fetch(`${DATA_BASE}/buildings.json`)
  ,])
  blobsStatic = await staticRes.json()
  blobIndex = await indexRes.json()
  const buildings = await buildingsRes.json()
  initBuildingsMap(buildings)
  console.log(`[Static] Loaded ${blobsStatic.length} blobs, ${blobIndex.length} index entries`)
}

// Build a lookup from blob_id to static data
function getStaticMap() {
  const map = {}
  for (const g of blobsStatic) { map[g.id] = g }
  return map
}

// Tick decoding lives in src/lib/timeline-decode.js (framework-free, tested
// via scripts/test-timeline-decode.mjs) — this is just the store-state glue.

// ── Tick Block Cache ────────────────────────────────────────────────────
const tickBlockCache = {}
const TICKS_PER_BLOCK = 100

function blockKeyForTick(tick) {
  const start = Math.floor(tick / TICKS_PER_BLOCK) * TICKS_PER_BLOCK
  const end = start + TICKS_PER_BLOCK - 1
  return String(start).padStart(4, '0') + '-' + String(end).padStart(4, '0')
}

async function loadTickBlock(tick) {
  const key = blockKeyForTick(tick)
  if (tickBlockCache[key]) return tickBlockCache[key]

  const url = `${DATA_BASE}/ticks/${key}.json`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to load tick block ${key}: ${res.status}`)
  const block = await res.json()
  tickBlockCache[key] = block
  return block
}

function prefetchNextBlock(tick) {
  const nextBlockStart = (Math.floor(tick / TICKS_PER_BLOCK) + 1) * TICKS_PER_BLOCK
  const key = blockKeyForTick(nextBlockStart)
  if (!tickBlockCache[key]) {
    loadTickBlock(nextBlockStart).catch(() => {})
  }
}

// ── State ───────────────────────────────────────────────────────────────
const initialState = {
  isBusy: false
  , isRestarting: false
  , isContinuing: false
  , startedAt: 0
  , computeTime: 0

  // Connection (always "connected" in static mode)
  , connectionStatus: 'disconnected'
  , paused: true
  , hour: 8
  , tick: 0
  , year: 0
  , month: 1
  , day: 1

  // No live mode in static version
  , isLiveMode: false
  , liveHourTimer: null
  , tickIntervalMs: 0
  , lastTickReceivedAt: 0

  // Timeline playback mode (always on in static version)
  , timelineMode: true
  , timelineMeta: null
  , timelineLoading: false
  , playbackSpeed: 1
  , playbackTimer: null
  , subHourFraction: 0

  // UI Mode state
  , uiMode: 'exploration'
  , rightPanelOpen: true
  , rightPanelTab: 'pulse'
  , spotlightActive: false
  , spotlightTarget: null
  , dataOverlay: 'off'
  , timelineSummary: null
  , showEventCard: true
  , timelineExpanded: false

  , config: {
    seed: 118
    , size: 500
  }

  , canContinue: true
  , statistics: null
  , currentGenerationIndex: 0
  , getCurrentGeneration: () => null

  // Blobtopia-specific state
  , allTweets: []
  , tweets: []
  , allNewspapers: []
  , newspapers: []
  , tweetPollingTimer: null
  , demographics: null
  , dashboardCache: {
    eventsImpact: null
  }
}

export const simulation = {
  namespaced: true
  , state: initialState
  , getters: {
    isLoading: state => state.isRestarting
    , isContinuing: state => state.isContinuing
    , isBusy: state => state.isBusy
    , canContinue: state => state.canContinue
    , config: state => state.config
    , getCurrentGeneration: state => state.getCurrentGeneration
    , currentGenerationIndex: state => state.currentGenerationIndex
    , statistics: state => state.statistics
    , connectionStatus: state => state.connectionStatus
    , isPaused: state => state.paused
    , hour: state => state.hour
    , tick: state => state.tick
    , year: state => state.year
    , month: state => state.month
    , day: state => state.day
    , tweets: state => state.tweets
    , newspapers: state => state.newspapers
    , demographics: state => state.demographics
    , isLiveMode: state => state.isLiveMode
    , tickIntervalMs: state => state.tickIntervalMs
    // Timeline getters
    , timelineMode: state => state.timelineMode
    , timelineMeta: state => state.timelineMeta
    , timelineLoading: state => state.timelineLoading
    , playbackSpeed: state => state.playbackSpeed
    , subHourFraction: state => state.subHourFraction
    , maxTick: state => state.timelineMeta ? state.timelineMeta.max_tick : 0
    , timelineEvents: state => state.timelineMeta ? state.timelineMeta.events : []
    , electionTicks: state => state.timelineMeta ? state.timelineMeta.election_ticks : []
    , dashboardCache: state => state.dashboardCache
    // UI Mode getters
    , uiMode: state => state.uiMode
    , rightPanelOpen: state => state.rightPanelOpen
    , rightPanelTab: state => state.rightPanelTab
    , spotlightActive: state => state.spotlightActive
    , spotlightTarget: state => state.spotlightTarget
    , dataOverlay: state => state.dataOverlay
    , timelineSummary: state => state.timelineSummary
    , showEventCard: state => state.showEventCard
    , timelineExpanded: state => state.timelineExpanded
    , activeEra: state => getEraForTick(state.tick || 0)
  }
  , actions: {
    // ── Initialization (replaces connectToServer) ──────────────────────
    async connectToServer({ dispatch }) {
      console.log('[Blobtopia Static] Loading timeline from static JSON files...')
      await dispatch('initTimeline')
    }

    // ── Instructor Controls (no-ops in static mode) ────────────────────
    , pauseServer() { console.log('[Static] No server — use local playback controls') }
    , resumeServer() { console.log('[Static] No server — use local playback controls') }
    , triggerEvent() { console.log('[Static] Events are pre-computed, cannot trigger new ones') }

    // ── Live-Mode (no-ops in static mode) ──────────────────────────────
    , measureTickInterval() {}
    , startLiveHourTimer() {}
    , stopLiveHourTimer() {}

    // ── Tweet Loading ──────────────────────────────────────────────────
    , startTweetPolling() {} // no polling in static mode
    , stopTweetPolling() {}
    , async loadAllTweets({ commit }) {
      try {
        const res = await fetch(`${DATA_BASE}/tweets.json`)
        const data = await res.json()
        commit('setAllTweets', data.tweets || [])
        console.log(`[Static] ${(data.tweets || []).length} tweets loaded`)
      } catch (e) {
        console.warn('[Static] Failed to load tweets:', e)
      }
    }
    , fetchTweets() {} // no live tweet polling

    // ── Newspaper Loading ─────────────────────────────────────────────
    , async loadAllNewspapers({ commit }) {
      try {
        const res = await fetch(`${DATA_BASE}/newspapers.json`)
        const data = await res.json()
        commit('setAllNewspapers', data || [])
        console.log(`[Static] ${(data || []).length} newspaper issues loaded`)
      } catch (e) {
        console.warn('[Static] Failed to load newspapers:', e)
      }
    }

    // ── Dashboard Data (from static JSON files) ────────────────────────
    , async fetchDashboardEventsImpact({ commit, state }) {
      if (state.dashboardCache.eventsImpact) return state.dashboardCache.eventsImpact
      try {
        const res = await fetch(`${DATA_BASE}/stats/events-impact.json`)
        const data = await res.json()
        commit('setDashboardCache', { key: 'eventsImpact', data })
        return data
      } catch (e) { console.warn('[Dashboard] events/impact fetch failed:', e); return null }
    }

    // ── Demographics (no separate endpoint in static mode) ─────────────
    , fetchDemographics() {} // demographics are part of each tick snapshot

    // ── Timeline Playback (from static JSON files) ─────────────────────
    , async initTimeline({ commit, dispatch }) {
      try {
        // Load district metadata
        try {
          const distRes = await fetch(`${DATA_BASE}/districts.json`)
          const districts = await distRes.json()
          if (Array.isArray(districts) && districts.length > 0) {
            initDistrictMetadata(districts.map(d => ({
              id: d.id, name: d.name, color_hex: d.color_hex, color_3d: d.color_3d
            })))
          }
        } catch (_e) { /* districts optional */ }

        // Load static glob data (names, districts, buildings) — needed for tick expansion
        await loadStaticData()

        // Load timeline metadata
        const res = await fetch(`${DATA_BASE}/meta.json`)
        const meta = await res.json()

        if (meta.max_tick && meta.max_tick > 0) {
          commit('setTimelineMeta', meta)
          commit('setTimelineMode', true)
          commit('setConnectionStatus', 'connected')
          console.log(`[Static] Timeline loaded: ${meta.max_tick} ticks, ${meta.total_blobs} blobs, ${meta.events.length} events`)

          // Load tweets and newspapers
          await Promise.all([
            dispatch('loadAllTweets')
            ,dispatch('loadAllNewspapers')
          ,])

          // Load first tick
          await dispatch('fetchTick', 0)
          return true
        }
      } catch (e) {
        console.error('[Static] Failed to load timeline data:', e)
        console.error('Make sure you ran: npm run export')
      }
      return false
    }

    , async fetchTick({ commit }, tick) {
      if (!tick && tick !== 0) return
      commit('setTimelineLoading', true)
      try {
        const block = await loadTickBlock(tick)
        const compactTick = block[tick]
        if (compactTick) {
          // Expand compact format to full snapshot (merge with static glob data)
          const snapshot = expandTickSnapshot(compactTick, { blobIndex, staticMap: getStaticMap(), lastKnownTraits })
          commit('handleSnapshot', snapshot)
          // Prefetch next block in background
          prefetchNextBlock(tick)
        } else {
          console.warn(`[Static] Tick ${tick} not found in block`)
        }
      } catch (e) {
        console.warn('[Static] Failed to fetch tick', tick, e)
      }
      commit('setTimelineLoading', false)
    }

    , async seekTick({ dispatch, commit, state }, tick) {
      const clamped = Math.max(0, Math.min(tick, state.timelineMeta ? state.timelineMeta.max_tick : tick))
      commit('setHour', 8)
      commit('setSubHourFraction', 0)
      await dispatch('fetchTick', clamped)
    }

    , seekTickDebounced({ dispatch, commit, state }, tick) {
      const clamped = Math.max(0, Math.min(tick, state.timelineMeta ? state.timelineMeta.max_tick : tick))
      const tpy = state.timelineMeta ? state.timelineMeta.ticks_per_year : 365
      commit('setTickPreview', { tick: clamped, tpy })
      commit('setHour', 8)
      commit('setSubHourFraction', 0)
      clearTimeout(state._seekDebounce)
      state._seekDebounce = setTimeout(() => {
        dispatch('fetchTick', clamped)
      }, 150)
    }

    , stepTick({ dispatch, state }, delta) {
      const current = state.tick || 0
      const maxTick = state.timelineMeta ? state.timelineMeta.max_tick : 0
      const next = Math.max(0, Math.min(current + delta, maxTick))
      if (next !== current) {
        dispatch('seekTick', next)
      }
    }

    , jumpToEvent({ dispatch, state }, direction) {
      const events = state.timelineMeta ? state.timelineMeta.events : []
      if (!events.length) return
      const current = state.tick || 0
      if (direction > 0) {
        const next = events.find(e => e.tick > current)
        if (next) dispatch('seekTick', next.tick)
      } else {
        const prev = [...events].reverse().find(e => e.tick < current)
        if (prev) dispatch('seekTick', prev.tick)
      }
    }

    , startPlayback({ commit, state, dispatch }) {
      dispatch('stopPlayback')
      commit('setPaused', false)

      const skipHours = state.playbackSpeed >= 10
      const msPerHour = skipHours ? 0 : Math.max(10, Math.round(SECONDS_PER_DAY * 1000 / state.playbackSpeed / HOURS_PER_DAY))
      const FRAME_MS = 33

      if (skipHours) {
        const timer = setInterval(async () => {
          const maxTick = state.timelineMeta ? state.timelineMeta.max_tick : 0
          if (state.tick >= maxTick) { dispatch('stopPlayback'); return }
          if (state.timelineLoading) return
          commit('setHour', 12)
          commit('setSubHourFraction', 0)
          await dispatch('fetchTick', state.tick + 1)
        }, Math.round(1000 / state.playbackSpeed))
        commit('setPlaybackTimer', timer)
      } else {
        const timer = setInterval(async () => {
          const maxTick = state.timelineMeta ? state.timelineMeta.max_tick : 0
          if (state.tick >= maxTick && state.hour >= 23) { dispatch('stopPlayback'); return }
          if (state.timelineLoading) return

          const newFrac = state.subHourFraction + (FRAME_MS / msPerHour)
          if (newFrac >= 1.0) {
            commit('setSubHourFraction', 0)
            if (state.hour < 23) {
              commit('setHour', state.hour + 1)
            } else {
              commit('setHour', 0)
              await dispatch('fetchTick', state.tick + 1)
            }
          } else {
            commit('setSubHourFraction', newFrac)
          }
        }, FRAME_MS)
        commit('setPlaybackTimer', timer)
      }
    }

    , stopPlayback({ commit, state }) {
      if (state.playbackTimer) {
        clearInterval(state.playbackTimer)
        commit('setPlaybackTimer', null)
      }
      commit('setPaused', true)
    }

    , setPlaybackSpeed({ commit, state, dispatch }, speed) {
      commit('setPlaybackSpeed', speed)
      if (!state.paused) {
        dispatch('startPlayback')
      }
    }

    , async fetchTimelineSummary({ commit, state }) {
      if (state.timelineSummary || !state.timelineMode) return
      try {
        const res = await fetch(`${DATA_BASE}/stats/summary.json`)
        const data = await res.json()
        commit('setTimelineSummary', data)
      } catch (e) {
        console.warn('[Static] Summary fetch failed:', e)
      }
    }

    // Legacy
    , async run({ dispatch }) {
      dispatch('connectToServer')
    }
  }
  , mutations: {
    start(state, isRestart){
      state.isBusy = true
      state.isRestarting = !!isRestart
      state.isContinuing = !isRestart
    }
    , stop(state){
      state.isBusy = false
      state.isRestarting = false
      state.isContinuing = false
    }
    , handleSnapshot(state, snapshot) {
      if (!snapshot) { return }

      const generation = snapshotToGeneration(snapshot)
      if (generation) {
        state.getCurrentGeneration = () => generation
      }

      const stats = snapshotToStatistics(snapshot)
      if (stats) {
        state.statistics = Object.freeze(stats)
      }

      state.tick = snapshot.tick || 0
      state.year = snapshot.year || 0
      state.month = snapshot.month || 1
      state.day = snapshot.day || 1
      state.currentGenerationIndex = snapshot.tick || 0
      state.canContinue = true

      const tick = snapshot.tick || 0
      if (state.allTweets.length > 0) {
        state.tweets = state.allTweets.filter(t => t.tick <= tick).slice().reverse()
      }
      if (state.allNewspapers.length > 0) {
        state.newspapers = state.allNewspapers.filter(n => n.tick <= tick)
      }
    }
    , setGenerationIndex(state, idx){
      state.currentGenerationIndex = idx | 0
    }
    , setStatistics(state, stats){
      state.statistics = Object.freeze(stats)
    }
    , setGeneration(state, gen){
      let generation = Object.freeze(gen)
      state.getCurrentGeneration = () => generation
    }
    , setConnectionStatus(state, status){
      state.connectionStatus = status
    }
    , setPaused(state, paused){
      state.paused = paused
    }
    , setHour(state, hour){
      state.hour = hour
    }
    , setAllTweets(state, tweets){
      state.allTweets = tweets
    }
    , setTweets(state, tweets){
      state.tweets = tweets
    }
    , setAllNewspapers(state, newspapers){
      state.allNewspapers = newspapers
    }
    , setTweetPollingTimer(state, timer){
      state.tweetPollingTimer = timer
    }
    , setDemographics(state, data){
      state.demographics = data
    }
    , setLiveMode(state, mode){
      state.isLiveMode = mode
    }
    , setLiveHourTimer(state, timer){
      state.liveHourTimer = timer
    }
    , setTickIntervalMs(state, ms){
      state.tickIntervalMs = ms
    }
    , setLastTickReceivedAt(state, t){
      state.lastTickReceivedAt = t
    }
    , setTimelineMode(state, mode){
      state.timelineMode = mode
    }
    , setTimelineMeta(state, meta){
      state.timelineMeta = meta
    }
    , setTimelineLoading(state, loading){
      state.timelineLoading = loading
    }
    , setTickPreview(state, { tick, tpy }) {
      state.tick = tick
      state.year = Math.floor(tick / tpy)
      state.month = Math.floor((tick % tpy) / 30) + 1
      state.day = (tick % 30) + 1
      state.currentGenerationIndex = tick
    }
    , setSubHourFraction(state, frac){
      state.subHourFraction = frac
    }
    , setPlaybackSpeed(state, speed){
      state.playbackSpeed = speed
    }
    , setPlaybackTimer(state, timer){
      state.playbackTimer = timer
    }
    , setDashboardCache(state, { key, data }) {
      Vue.set(state.dashboardCache, key, data)
    }
    , setUiMode(state, mode){
      state.uiMode = mode
      if (mode === 'presentation') {
        state.rightPanelOpen = false
      } else if (mode === 'analysis') {
        state.rightPanelOpen = true
      }
    }
    , setRightPanelOpen(state, open){
      state.rightPanelOpen = open
    }
    , setRightPanelTab(state, tab){
      state.rightPanelTab = tab
    }
    , setSpotlightActive(state, active){
      state.spotlightActive = active
    }
    , setSpotlightTarget(state, target){
      state.spotlightTarget = target
    }
    , setDataOverlay(state, overlay){
      state.dataOverlay = overlay
    }
    , setTimelineSummary(state, data){
      state.timelineSummary = data
    }
    , setShowEventCard(state, show){
      state.showEventCard = show
    }
    , setTimelineExpanded(state, expanded){
      state.timelineExpanded = expanded
    }
  }
}
