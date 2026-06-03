/**
 * Vuex module: survey (Befragungsinstitut)
 *
 * Holds the survey-window state: visibility, the student's free-form
 * questionnaire (items), the calibratable sampling design, the drawn sample
 * preview, fieldwork progress and the resulting dataset. Pattern mirrors
 * src/store/chat.js (namespaced, factory state).
 *
 * The heavy lifting lives in the pure libs:
 *   src/lib/survey.js · survey-sampling.js · survey-engine.js · survey-dataset.js
 */
import {
  SAMPLING, drawSample, eligibleFrame, realizedDistribution, ACCESSORS
} from '@/lib/survey-sampling'
import { toCSV } from '@/lib/survey-dataset'

const DEFAULT_DESIGN = () => ({
  technique: SAMPLING.SRS
  , n: 40
  , seed: 12345
  , strataVars: ['district']
  , clusterVar: 'district'
  , numClusters: 2
  , eligibility: { excludeMinors: true }
})

// getCurrentGeneration is a function-returning getter — call it if needed.
function currentBlobs(rootGetters) {
  let gen = rootGetters['simulation/getCurrentGeneration']
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
  } catch (e) { /* ignore */ }
}

export const survey = {
  namespaced: true
  , state: () => ({
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
  , mutations: {
    OPEN_SURVEY(s) { s.isOpen = true }
    , CLOSE_SURVEY(s) { s.isOpen = false }
    , SET_ITEMS(s, items) { s.items = items }
    , SET_DESIGN(s, design) { s.design = design }
    , SET_SAMPLE(s, { sample, dist }) { s.lastSample = sample; s.dist = dist }
    , SET_RESULT(s, result) { s.result = result }
    , SET_PROGRESS(s, p) { s.progress = p }
    , SET_RUNNING(s, v) { s.isRunning = v }
    , SET_ERROR(s, e) { s.error = e }
  }
  , actions: {
    // Draw a sample over the current population and tally its distribution.
    previewSample({ commit, state, rootGetters }) {
      commit('SET_ERROR', null)
      const blobs = currentBlobs(rootGetters)
      if (!blobs.length) { commit('SET_ERROR', 'Keine Population geladen.'); return }
      const design = buildDrawDesign(state.design, blobs)
      const sample = drawSample(blobs, design)
      const v = (state.design.strataVars && state.design.strataVars[0]) || 'district'
      const dist = realizedDistribution(sample.units, v, design)
      commit('SET_SAMPLE', { sample, dist })
    }

    // STAGE 3 — live LLM fieldwork (wires survey-engine.runSurvey + makeChatSender).
    // Intentionally a graceful placeholder until the prompt/transport wiring lands.
    , runFieldwork({ commit }) {
      commit('SET_ERROR', 'Die Live-Feldphase (LLM) wird im nächsten Schritt angebunden.')
    }

    , exportCsv({ state }) {
      if (!state.result) return
      const csv = toCSV(state.result.rows, state.items)
      downloadText(csv, 'blobtopia-befragung.csv', 'text/csv')
    }
  }
}
