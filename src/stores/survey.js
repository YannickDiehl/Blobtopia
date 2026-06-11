/**
 * Pinia store: survey (Befragungsinstitut).
 *
 * Holds the survey-window state: visibility, the student's free-form
 * questionnaire (items), the calibratable sampling design, the drawn sample
 * preview, fieldwork progress and the resulting dataset.
 *
 * The heavy lifting lives in the pure libs:
 *   src/lib/survey.js · survey-sampling.js · survey-engine.js · survey-dataset.js
 */
import { defineStore } from 'pinia'
import {
  SAMPLING, drawSample, eligibleFrame, realizedDistribution, ACCESSORS
} from '@/lib/survey-sampling'
import { toCSV } from '@/lib/survey-dataset'
import { runSurvey, makeChatSender } from '@/lib/survey-engine'
import { runSyntheticSurvey } from '@/lib/survey-synthetic'
import { buildSystemPrompt } from '@/lib/build-system-prompt'
import { getBlobStatic, getChangeSummary, resolveActivity } from '@/lib/blob-prompt'
import { CHAT_API } from '@/config/api'
import { useSimulationStore } from '@/stores/simulation'

const DEFAULT_DESIGN = () => ({
  technique: SAMPLING.SRS
  , mode: 'synthetic' // 'synthetic' (free, default) | 'llm'
  , n: 40
  , seed: 12345
  , strataVars: ['district']
  , clusterVar: 'district'
  , numClusters: 2
  , eligibility: { excludeMinors: true }
  , filter: null            // { districts:[], education:[], ageMin, ageMax, parties:[], incomeMin, incomeMax }
  , manualInclude: []       // hand-picked blob ids (the whole sample in 'manual' mode)
  , manualExclude: []       // blob ids removed from the frame
})

// getCurrentGeneration is a function held in simulation state — call it.
function currentBlobs() {
  let gen = useSimulationStore().getCurrentGeneration
  if (typeof gen === 'function') gen = gen()
  return gen && gen.blobs ? gen.blobs : []
}

// For quota designs, auto-build equal cell targets across the first strata var.
function buildDrawDesign(design, blobs) {
  const d = Object.assign({}, design)
  if (d.technique === SAMPLING.QUOTA) {
    const v = (d.strataVars && d.strataVars[0]) || 'district'
    const acc = ACCESSORS[v] || (b => b[v])
    const frame = eligibleFrame(blobs, d.eligibility)
    const cats = {}
    for (const b of frame) cats[acc(b)] = true
    const keys = Object.keys(cats)
    const per = keys.length ? Math.floor((d.n || 0) / keys.length) : 0
    const quotas = {}
    for (const k of keys) quotas[k] = per
    d.quotas = quotas
  }
  return d
}

function downloadText(text, filename, mime) {
  try {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (_e) { /* ignore */ }
}

export const useSurveyStore = defineStore('survey', {
  state: () => ({
    isOpen: false
    , items: []
    , design: DEFAULT_DESIGN()
    , lastSample: null
    , dist: null
    , result: null
    , progress: { done: 0, total: 0 }
    , isRunning: false
    , error: null
  })
  , getters: {
    // The eligible, filtered candidate frame for the manual picker + counts.
    frameBlobs(state) {
      return eligibleFrame(currentBlobs(), Object.assign({}, state.design.eligibility, {
        filter: state.design.filter
        , manualExclude: state.design.manualExclude
      }))
    }
  }
  , actions: {
    // Ehemalige Mutations (Call-Sites in survey-window.vue nutzen sie direkt)
    OPEN_SURVEY() { this.isOpen = true }
    , CLOSE_SURVEY() { this.isOpen = false }
    , SET_ITEMS(items) { this.items = items }
    , SET_DESIGN(design) { this.design = design }
    , SET_SAMPLE({ sample, dist }) { this.lastSample = sample; this.dist = dist }

    // Draw a sample over the current population and tally its distribution.
    , previewSample() {
      this.error = null
      const blobs = currentBlobs()
      if (!blobs.length) { this.error = 'Keine Population geladen.'; return }
      const design = buildDrawDesign(this.design, blobs)
      const sample = drawSample(blobs, design)
      const v = (this.design.strataVars && this.design.strataVars[0]) || 'district'
      const dist = realizedDistribution(sample.units, v, design)
      this.SET_SAMPLE({ sample, dist })
    }

    // Run the fieldwork: synthetic (free, default) or live LLM.
    , async runFieldwork() {
      this.error = null
      if (!this.items.length) { this.error = 'Bitte zuerst mindestens eine Frage anlegen.'; return }
      const blobs = currentBlobs()
      if (!blobs.length) { this.error = 'Keine Population geladen.'; return }

      const design = buildDrawDesign(this.design, blobs)
      const sample = drawSample(blobs, design)
      if (!sample.units.length) { this.error = 'Die Stichprobe ist leer — bitte das Design prüfen.'; return }

      const demographics = b => ({
        district: b.district
        , age: b.age
        , education_level: b.education_level
        , party: b.party_name
      })
      const strataVar = (this.design.strataVars && this.design.strataVars[0]) || 'district'

      this.isRunning = true
      this.result = null
      this.progress = { done: 0, total: sample.units.length }
      try {
        let result
        if (this.design.mode === 'llm') {
          // Live LLM fieldwork — one chat call per (blob × item).
          const sim = useSimulationStore()
          const tick = sim.tick || 0
          const tpy = (sim.timelineMeta && sim.timelineMeta.ticks_per_year) || 365
          const sendFn = makeChatSender(CHAT_API, localStorage.getItem('blobtopia_chat_token'))
          // Pre-build each persona prompt (async static data) so runSurvey can
          // call buildPrompt synchronously.
          const promptByBlob = {}
          for (const u of sample.units) {
            const b = u.blob
            const sg = await getBlobStatic(b.id)
            const cs = await getChangeSummary(b.id, tick)
            const ctx = resolveActivity({ simulation: sim }, b)
            promptByBlob[b.id] = buildSystemPrompt(b, sg || {}, tick, tpy, cs, ctx.activity, ctx.hour)
          }
          result = await runSurvey(sample.units, {
            sendFn: sendFn
            , buildPrompt: u => promptByBlob[u.blob.id]
            , items: this.items
            , tick: tick
            , concurrency: 4
            , maxRetries: 1
            , demographics: demographics
            , onProgress: (done, total) => { this.progress = { done, total } }
          })
        } else {
          // Synthetic (free, instant): answers from stored values + noise.
          result = runSyntheticSurvey(sample.units, this.items, {
            seed: this.design.seed
            , demographics: demographics
          })
          this.progress = { done: result.rows.length, total: result.rows.length }
        }
        this.result = result
        this.SET_SAMPLE({ sample: sample, dist: realizedDistribution(sample.units, strataVar, design) })
      } catch (e) {
        this.error = e && e.message ? e.message : String(e)
      } finally {
        this.isRunning = false
      }
    }

    , exportCsv() {
      if (!this.result) return
      const csv = toCSV(this.result.rows, this.items)
      downloadText(csv, 'blobtopia-befragung.csv', 'text/csv')
    }
  }
})
