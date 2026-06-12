/**
 * Pinia store: simulation — Timeline-Playback über die statischen JSON-Daten.
 *
 * Port des Vuex-Moduls: Mutations und Actions sind zu Actions verschmolzen
 * (Namen unverändert, damit Call-Sites mechanisch konvertierbar sind);
 * identische Passthrough-Getter sind entfallen (Pinia exponiert State direkt).
 * Einzige Namensauflösung: die Action setPlaybackSpeed hat die gleichnamige
 * Mutation geschluckt (Zuweisung inline).
 */
import { defineStore } from 'pinia'
import { snapshotToGeneration, snapshotToStatistics, initDistrictMetadata, initBuildingsMap } from '@/lib/blob-adapter'
import { expandTickSnapshot } from '@/lib/timeline-decode'
import { DATA_BASE } from '@/config/api'
import { HOURS_PER_DAY, SECONDS_PER_DAY } from '@/config/world'
import { getEraForTick } from '@/config/timeline-eras'

// ── Static Blob Data (loaded once, module-private — not reactive) ───────
let blobsStatic = []   // full static data per blob
let blobIndex = []     // ordered blob IDs (matches compact tick array order)
// Forward-fill cache: last known latent traits per blob (written every ~7 ticks)
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
// Der letzte Block ist am max_tick gekappt (8000-8030.json) — wird beim
// Meta-Load gesetzt, sonst 404t jeder Zugriff auf den letzten Block.
let knownMaxTick = null
export function setKnownMaxTick(t) { knownMaxTick = t }

function blockKeyForTick(tick) {
  const start = Math.floor(tick / TICKS_PER_BLOCK) * TICKS_PER_BLOCK
  let end = start + TICKS_PER_BLOCK - 1
  if (knownMaxTick != null && end > knownMaxTick) end = knownMaxTick
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
  if (knownMaxTick != null && nextBlockStart > knownMaxTick) return
  const key = blockKeyForTick(nextBlockStart)
  if (!tickBlockCache[key]) {
    loadTickBlock(nextBlockStart).catch(() => {})
  }
}

// ── Population zu einem fremden Tick (für Längsschnitt-Befragungen) ─────
// Läuft NEBEN dem Playback: eigener Traits-Forward-Fill (der globale Cache
// gehört dem aktuellen Tick), Block-Iteration ab dem Vorgängerblock, damit
// die ~alle 7 Ticks geschriebenen latent_traits sicher gefüllt sind.
const populationAtTickCache = {}
async function loadPopulationAt(tick) {
  if (populationAtTickCache[tick]) return populationAtTickCache[tick]
  const blockStart = Math.floor(tick / TICKS_PER_BLOCK) * TICKS_PER_BLOCK
  const fromTick = Math.max(0, blockStart - TICKS_PER_BLOCK)
  const blocks = [await loadTickBlock(fromTick)]
  if (blockStart !== fromTick) blocks.push(await loadTickBlock(blockStart))
  const staticMap = getStaticMap()
  const traits = {}
  let snapshot = null
  for (let t = fromTick; t <= tick; t++) {
    const compact = blocks[Math.floor((t - fromTick) / TICKS_PER_BLOCK)][t]
    if (!compact) continue
    snapshot = expandTickSnapshot(compact, { blobIndex, staticMap, lastKnownTraits: traits })
  }
  if (!snapshot) throw new Error('Tick ' + tick + ' nicht in den Blöcken gefunden')
  const generation = snapshotToGeneration(snapshot)
  populationAtTickCache[tick] = generation.blobs
  return generation.blobs
}

export const useSimulationStore = defineStore('simulation', {
  state: () => ({
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
    // Wirkungsdaten für die Ereignis-Karte an der Timeline
    // (stats/events-impact.json, lazy geladen)
    , eventsImpact: null
  })

  , getters: {
    // Umbenennende/abgeleitete Getter — identische Passthroughs sind weg,
    // der State ist in Pinia direkt erreichbar.
    isLoading: state => state.isRestarting
    , isPaused: state => state.paused
    , maxTick: state => state.timelineMeta ? state.timelineMeta.max_tick : 0
    , timelineEvents: state => state.timelineMeta ? state.timelineMeta.events : []
    , electionTicks: state => state.timelineMeta ? state.timelineMeta.election_ticks : []
    , activeEra: state => getEraForTick(state.tick || 0)
  }

  , actions: {
    // ── Initialization (replaces connectToServer) ──────────────────────
    async connectToServer() {
      console.log('[Blobtopia Static] Loading timeline from static JSON files...')
      await this.initTimeline()
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
    , async loadAllTweets() {
      try {
        const res = await fetch(`${DATA_BASE}/tweets.json`)
        const data = await res.json()
        this.allTweets = data.tweets || []
        console.log(`[Static] ${(data.tweets || []).length} tweets loaded`)
      } catch (e) {
        console.warn('[Static] Failed to load tweets:', e)
      }
    }
    , fetchTweets() {} // no live tweet polling

    // ── Newspaper Loading ─────────────────────────────────────────────
    , async loadAllNewspapers() {
      try {
        const res = await fetch(`${DATA_BASE}/newspapers.json`)
        const data = await res.json()
        this.allNewspapers = data || []
        console.log(`[Static] ${(data || []).length} newspaper issues loaded`)
      } catch (e) {
        console.warn('[Static] Failed to load newspapers:', e)
      }
    }

    // ── Ereignis-Wirkung (stats/events-impact.json, für die Event-Karte) ─
    , async fetchEventsImpact() {
      if (this.eventsImpact) return this.eventsImpact
      try {
        const res = await fetch(`${DATA_BASE}/stats/events-impact.json`)
        const data = await res.json()
        this.eventsImpact = data
        return data
      } catch (e) { console.warn('[Static] events-impact.json fetch failed:', e); return null }
    }

    // ── Demographics (no separate endpoint in static mode) ─────────────
    , fetchDemographics() {} // demographics are part of each tick snapshot

    // ── Timeline Playback (from static JSON files) ─────────────────────
    , async initTimeline() {
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

        // Load static blob data (names, districts, buildings) — needed for tick expansion
        await loadStaticData()

        // Load timeline metadata
        const res = await fetch(`${DATA_BASE}/meta.json`)
        const meta = await res.json()

        if (meta.max_tick && meta.max_tick > 0) {
          this.timelineMeta = meta
          setKnownMaxTick(meta.max_tick)
          this.timelineMode = true
          this.connectionStatus = 'connected'
          console.log(`[Static] Timeline loaded: ${meta.max_tick} ticks, ${meta.total_blobs} blobs, ${meta.events.length} events`)

          // Load tweets and newspapers
          await Promise.all([
            this.loadAllTweets()
            ,this.loadAllNewspapers()
          ,])

          // Load first tick
          await this.fetchTick(0)
          return true
        }
      } catch (e) {
        console.error('[Static] Failed to load timeline data:', e)
        console.error('Make sure you ran: npm run export')
      }
      return false
    }

    , async fetchTick(tick) {
      if (!tick && tick !== 0) return
      this.timelineLoading = true
      try {
        const block = await loadTickBlock(tick)
        const compactTick = block[tick]
        if (compactTick) {
          // Expand compact format to full snapshot (merge with static blob data)
          const snapshot = expandTickSnapshot(compactTick, { blobIndex, staticMap: getStaticMap(), lastKnownTraits })
          this.handleSnapshot(snapshot)
          // Prefetch next block in background
          prefetchNextBlock(tick)
        } else {
          console.warn(`[Static] Tick ${tick} not found in block`)
        }
      } catch (e) {
        console.warn('[Static] Failed to fetch tick', tick, e)
      }
      this.timelineLoading = false
    }

    // Population zu einem fremden Tick (Längsschnitt) — ohne Playback-Sprung.
    , async fetchPopulationAt(tick) {
      const current = typeof this.getCurrentGeneration === 'function' ? this.getCurrentGeneration() : this.getCurrentGeneration
      if (tick === this.tick && current && current.blobs && current.blobs.length) return current.blobs
      return loadPopulationAt(tick)
    }

    , async seekTick(tick) {
      const clamped = Math.max(0, Math.min(tick, this.timelineMeta ? this.timelineMeta.max_tick : tick))
      this.hour = 8
      this.subHourFraction = 0
      await this.fetchTick(clamped)
    }

    , seekTickDebounced(tick) {
      const clamped = Math.max(0, Math.min(tick, this.timelineMeta ? this.timelineMeta.max_tick : tick))
      const tpy = this.timelineMeta ? this.timelineMeta.ticks_per_year : 365
      this.setTickPreview({ tick: clamped, tpy })
      this.hour = 8
      this.subHourFraction = 0
      clearTimeout(this._seekDebounce)
      this._seekDebounce = setTimeout(() => {
        this.fetchTick(clamped)
      }, 150)
    }

    , stepTick(delta) {
      const current = this.tick || 0
      const maxTick = this.timelineMeta ? this.timelineMeta.max_tick : 0
      const next = Math.max(0, Math.min(current + delta, maxTick))
      if (next !== current) {
        this.seekTick(next)
      }
    }

    , jumpToEvent(direction) {
      const events = this.timelineMeta ? this.timelineMeta.events : []
      if (!events.length) return
      const current = this.tick || 0
      if (direction > 0) {
        const next = events.find(e => e.tick > current)
        if (next) this.seekTick(next.tick)
      } else {
        const prev = [...events].reverse().find(e => e.tick < current)
        if (prev) this.seekTick(prev.tick)
      }
    }

    , startPlayback() {
      this.stopPlayback()
      this.paused = false

      const skipHours = this.playbackSpeed >= 10
      const msPerHour = skipHours ? 0 : Math.max(10, Math.round(SECONDS_PER_DAY * 1000 / this.playbackSpeed / HOURS_PER_DAY))
      const FRAME_MS = 33

      if (skipHours) {
        this.playbackTimer = setInterval(async () => {
          const maxTick = this.timelineMeta ? this.timelineMeta.max_tick : 0
          if (this.tick >= maxTick) { this.stopPlayback(); return }
          if (this.timelineLoading) return
          this.hour = 12
          this.subHourFraction = 0
          await this.fetchTick(this.tick + 1)
        }, Math.round(1000 / this.playbackSpeed))
      } else {
        this.playbackTimer = setInterval(async () => {
          const maxTick = this.timelineMeta ? this.timelineMeta.max_tick : 0
          if (this.tick >= maxTick && this.hour >= 23) { this.stopPlayback(); return }
          if (this.timelineLoading) return

          const newFrac = this.subHourFraction + (FRAME_MS / msPerHour)
          if (newFrac >= 1.0) {
            this.subHourFraction = 0
            if (this.hour < 23) {
              this.hour = this.hour + 1
            } else {
              this.hour = 0
              await this.fetchTick(this.tick + 1)
            }
          } else {
            this.subHourFraction = newFrac
          }
        }, FRAME_MS)
      }
    }

    , stopPlayback() {
      if (this.playbackTimer) {
        clearInterval(this.playbackTimer)
        this.playbackTimer = null
      }
      this.paused = true
    }

    , setPlaybackSpeed(speed) {
      this.playbackSpeed = speed
      if (!this.paused) {
        this.startPlayback()
      }
    }

    , async fetchTimelineSummary() {
      if (this.timelineSummary || !this.timelineMode) return
      try {
        const res = await fetch(`${DATA_BASE}/stats/summary.json`)
        const data = await res.json()
        this.timelineSummary = data
      } catch (e) {
        console.warn('[Static] Summary fetch failed:', e)
      }
    }

    // Legacy
    , async run() {
      this.connectToServer()
    }

    // ── Ehemalige Mutations (Namen unverändert für die Call-Sites) ──────
    , start(isRestart) {
      this.isBusy = true
      this.isRestarting = !!isRestart
      this.isContinuing = !isRestart
    }
    , stop() {
      this.isBusy = false
      this.isRestarting = false
      this.isContinuing = false
    }
    , handleSnapshot(snapshot) {
      if (!snapshot) { return }

      const generation = snapshotToGeneration(snapshot)
      if (generation) {
        this.getCurrentGeneration = () => generation
      }

      const stats = snapshotToStatistics(snapshot)
      if (stats) {
        this.statistics = Object.freeze(stats)
      }

      this.tick = snapshot.tick || 0
      this.year = snapshot.year || 0
      this.month = snapshot.month || 1
      this.day = snapshot.day || 1
      this.currentGenerationIndex = snapshot.tick || 0
      this.canContinue = true

      const tick = snapshot.tick || 0
      if (this.allTweets.length > 0) {
        this.tweets = this.allTweets.filter(t => t.tick <= tick).slice().reverse()
      }
      if (this.allNewspapers.length > 0) {
        this.newspapers = this.allNewspapers.filter(n => n.tick <= tick)
      }
    }
    , setGenerationIndex(idx) {
      this.currentGenerationIndex = idx | 0
    }
    , setStatistics(stats) {
      this.statistics = Object.freeze(stats)
    }
    , setGeneration(gen) {
      const generation = Object.freeze(gen)
      this.getCurrentGeneration = () => generation
    }
    , setConnectionStatus(status) {
      this.connectionStatus = status
    }
    , setPaused(paused) {
      this.paused = paused
    }
    , setHour(hour) {
      this.hour = hour
    }
    , setTickPreview({ tick, tpy }) {
      this.tick = tick
      this.year = Math.floor(tick / tpy)
      this.month = Math.floor((tick % tpy) / 30) + 1
      this.day = (tick % 30) + 1
      this.currentGenerationIndex = tick
    }
    , setSubHourFraction(frac) {
      this.subHourFraction = frac
    }
    , setUiMode(mode) {
      this.uiMode = mode
      if (mode === 'presentation') {
        this.rightPanelOpen = false
      } else if (mode === 'analysis') {
        this.rightPanelOpen = true
      }
    }
    , setRightPanelOpen(open) {
      this.rightPanelOpen = open
    }
    , setRightPanelTab(tab) {
      this.rightPanelTab = tab
    }
    , setSpotlightActive(active) {
      this.spotlightActive = active
    }
    , setSpotlightTarget(target) {
      this.spotlightTarget = target
    }
    , setDataOverlay(overlay) {
      this.dataOverlay = overlay
    }
    , setShowEventCard(show) {
      this.showEventCard = show
    }
    , setTimelineExpanded(expanded) {
      this.timelineExpanded = expanded
    }
  }
})
