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
import { toCSV, codebookToCSV } from '@/lib/survey-dataset'
import { serializeStudy, parseStudy, saveDraft, loadDraft } from '@/lib/survey-persist'
import { CONSTRUCTS } from '@/lib/survey-constructs'
import { runSurvey, makeChatSender } from '@/lib/survey-engine'
import { runSyntheticSurvey } from '@/lib/survey-synthetic'
import { snapshotTruth, decompose, simulateSamplingDistribution } from '@/lib/survey-truth'
import { buildDemographics } from '@/lib/survey-demographics'
import { simulateParticipation, fieldReport, FIELD_MODES, DISPOSITION } from '@/lib/survey-fieldwork'
import { postStratify, calibratedEstimate } from '@/lib/survey-weighting'
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
  // Hintergrundmerkmale: nothing is recorded automatically — students pick
  // them in the Fragebogen step (keys from survey-demographics.js).
  , demographics: ['name']
  , quotas: null            // quota targets per cell; null = proportional default
  , withinClusterN: null    // two-stage cluster: subsample size per cluster
  // Feldarbeit: Modus + Kontaktversuche steuern Unit-Nonresponse + soziale
  // Erwünschtheit (Konstanten in survey-fieldwork.js)
  , fieldMode: 'personal'
  , contactAttempts: 2
})

// getCurrentGeneration is a function held in simulation state — call it.
function currentBlobs() {
  let gen = useSimulationStore().getCurrentGeneration
  if (typeof gen === 'function') gen = gen()
  return gen && gen.blobs ? gen.blobs : []
}

// For quota designs without explicit targets, default to PROPORTIONAL quotas
// (realistic quota practice: cells mirror the population margins).
function buildDrawDesign(design, blobs) {
  const d = Object.assign({}, design)
  if (d.technique === SAMPLING.QUOTA && !(d.quotas && Object.keys(d.quotas).length)) {
    const v = (d.strataVars && d.strataVars[0]) || 'district'
    const acc = ACCESSORS[v] || (b => b[v])
    const frame = eligibleFrame(blobs, Object.assign({}, d.eligibility, { filter: d.filter, manualExclude: d.manualExclude }))
    const counts = {}
    for (const b of frame) { const k = String(acc(b)); counts[k] = (counts[k] || 0) + 1 }
    const quotas = {}
    for (const k of Object.keys(counts)) {
      quotas[k] = Math.round((d.n || 0) * counts[k] / Math.max(1, frame.length))
    }
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
    // Wahrheit-Tab: god-view reveal + replication simulator
    , truthRevealed: false
    , simResult: null
    , isSimulating: false
    , simProgress: { done: 0, total: 0 }
    // Post-Stratifizierung (post-hoc, ohne neue Feldarbeit berechnet)
    , calib: { enabled: false, vars: ['district'] }
  })
  , getters: {
    // The eligible, filtered candidate frame for the manual picker + counts.
    frameBlobs(state) {
      return eligibleFrame(currentBlobs(), Object.assign({}, state.design.eligibility, {
        filter: state.design.filter
        , manualExclude: state.design.manualExclude
      }))
    }
    // Exact TSE decomposition per item (needs the truth snapshot in result.meta).
    , decomposition(state) {
      if (!state.result || !state.result.meta || !state.result.meta.truth) return null
      return decompose(state.result, state.items)
    }
    // Kalibrierungsgewichte (Post-Stratifizierung) — post-hoc aus dem Ergebnis.
    , calibration(state) {
      if (!state.calib.enabled || !state.result || !state.result.meta.truth) return null
      return postStratify({ rows: state.result.rows, truth: state.result.meta.truth, vars: state.calib.vars })
    }
    // Deskriptive Schätzer pro Item (ungewichtet / design-gewichtet / kalibriert).
    , itemSummary(state) {
      if (!state.result) return []
      const cal = this.calibration
      return state.items.map(it => {
        const id = it.id
        let n = 0, sum = 0, sw = 0, swv = 0
        for (const r of state.result.rows) {
          const a = r.answers && r.answers[id]
          if (!a || a.status !== 'answered' || a.value == null) continue
          n++; sum += a.value
          const w = r.weight != null ? r.weight : 1
          sw += w; swv += w * a.value
        }
        return {
          id: id
          , n: n
          , mean: n > 0 ? sum / n : null
          , meanWeighted: sw > 0 ? swv / sw : null
          , meanCalibrated: cal ? calibratedEstimate(state.result.rows, id, cal.weights) : null
        }
      })
    }
  }
  , actions: {
    // Ehemalige Mutations (Call-Sites in survey-window.vue nutzen sie direkt)
    OPEN_SURVEY() { this.isOpen = true }
    , CLOSE_SURVEY() { this.isOpen = false }
    , SET_ITEMS(items) { this.items = items; this._persistDraft() }
    , SET_DESIGN(design) { this.design = design; this._persistDraft() }
    , SET_SAMPLE({ sample, dist }) { this.lastSample = sample; this.dist = dist }

    // ── Studien-Persistenz (Autosave + Datei-Export/-Import) ──
    , _persistDraft() {
      const sim = useSimulationStore()
      saveDraft({ items: this.items, design: this.design, tick: sim.tick || 0 })
    }
    // Reload-Schutz: den Autosave-Entwurf übernehmen, bevor die UI initialisiert.
    , loadStudyDraft() {
      if (this.items.length) return // Session-Stand gewinnt über den Draft
      const draft = loadDraft()
      if (!draft) return
      if (draft.items.length) this.items = draft.items
      if (draft.design) this.design = Object.assign(DEFAULT_DESIGN(), draft.design)
    }
    , exportStudy() {
      const sim = useSimulationStore()
      downloadText(
        serializeStudy({ items: this.items, design: this.design, tick: sim.tick || 0 })
        , 'blobtopia-studie.json', 'application/json'
      )
    }
    // Import + Replay: gleiche Studie + gleicher Seed + gleicher Tick ⇒
    // byte-identischer Datensatz. Springt dafür zum gespeicherten Feld-Tick.
    , importStudy(text) {
      this.error = null
      try {
        const study = parseStudy(text)
        this.items = study.items
        this.design = Object.assign(DEFAULT_DESIGN(), study.design)
        this.result = null
        this.simResult = null
        this.truthRevealed = false
        this._persistDraft()
        const sim = useSimulationStore()
        if (study.tick != null && study.tick !== sim.tick) sim.seekTick(study.tick)
        return true
      } catch (e) {
        this.error = e && e.message ? e.message : String(e)
        return false
      }
    }
    , exportCodebook() {
      if (!this.items.length) return
      const labels = CONSTRUCTS.reduce((m, c) => { m[c.key] = c.label; return m }, {})
      downloadText(codebookToCSV(this.items, labels), 'blobtopia-codebook.csv', 'text/csv')
    }

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
      // Wächter: ohne Konstrukt-Bindung kann die synthetische Engine nichts
      // antworten — lieber hier klar blockieren als leere Spalten liefern.
      if (this.design.mode !== 'llm') {
        const unbound = this.items
          .map((it, i) => ({ it, label: it.id || ('Frage ' + (i + 1)) }))
          .filter(x => !x.it.construct)
        if (unbound.length) {
          this.error = 'Nicht beantwortbar: ' + unbound.map(x => x.label).join(', ')
            + ' — im Fragebogen ein Merkmal („misst …") zuordnen, sonst können die Blobs nichts antworten.'
          return
        }
      }
      const blobs = currentBlobs()
      if (!blobs.length) { this.error = 'Keine Population geladen.'; return }

      const design = buildDrawDesign(this.design, blobs)
      const sample = drawSample(blobs, design)
      if (!sample.units.length) { this.error = 'Die Stichprobe ist leer — bitte das Design prüfen.'; return }

      const demographics = buildDemographics(this.design.demographics)
      const strataVar = (this.design.strataVars && this.design.strataVars[0]) || 'district'

      this.isRunning = true
      this.result = null
      this.truthRevealed = false
      this.simResult = null
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
          // Synthetic (free, instant): Brutto → Feldarbeit (Unit-Nonresponse,
          // modusabhängig) → Netto antwortet. Nichtteilnehmende bleiben als
          // Dispositionszeilen im Datensatz — wie in echten Felddaten.
          const mode = FIELD_MODES[design.fieldMode] ? design.fieldMode : 'personal'
          const participation = simulateParticipation(sample.units, {
            mode: mode, attempts: design.contactAttempts, seed: design.seed
          })
          const respondents = participation.filter(p => p.disposition === DISPOSITION.RESPONDENT)
          const net = runSyntheticSurvey(respondents, this.items, {
            seed: this.design.seed
            , demographics: demographics
            , sdFactor: FIELD_MODES[mode].sdFactor
          })
          const netById = {}
          for (const r of net.rows) netById[r.blobId] = r
          const rows = participation.map(p => {
            const r = netById[p.blob.id]
            if (r) return Object.assign({}, r, { disposition: p.disposition })
            return Object.assign(
              { blobId: p.blob.id, stratum: p.stratum, weight: p.weight }
              , demographics(p.blob)
              , { disposition: p.disposition, answers: {} }
            )
          })
          result = { rows: rows, meta: Object.assign(net.meta, fieldReport(participation), { fieldMode: mode, contactAttempts: design.contactAttempts }) }
          this.progress = { done: rows.length, total: rows.length }
        }
        // Freeze the ground truth at fieldwork time — the timeline keeps
        // playing, so a later recompute would compare against another tick.
        result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items: this.items })
        result.meta.technique = design.technique
        result.meta.frameSize = sample.frameSize
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

    // ── Wahrheit-Tab (god view) ──
    , revealTruth() { this.truthRevealed = true }
    , SET_CALIB(calib) { this.calib = Object.assign({}, this.calib, calib) }

    // Instructor-only export: the student dataset plus a `<item>_wahr` column.
    , exportInstructorCsv() {
      if (!this.result || !this.result.meta.truth) return
      const csv = toCSV(this.result.rows, this.items, { truth: this.result.meta.truth })
      downloadText(csv, 'blobtopia-befragung-dozentenversion.csv', 'text/csv')
    }

    // Empirical sampling distribution: rerun draw+fieldwork B times (synthetic,
    // free) with varied seeds — bias survives replication, noise averages out.
    , async runSimulation(replications) {
      if (this.isSimulating || !this.result) return
      const blobs = currentBlobs()
      if (!blobs.length) { this.error = 'Keine Population geladen.'; return }
      const design = buildDrawDesign(this.design, blobs)
      const B = Math.max(50, Math.min(2000, Number(replications) || 500))
      this.isSimulating = true
      this.simProgress = { done: 0, total: B }
      try {
        this.simResult = await simulateSamplingDistribution(blobs, design, this.items, {
          replications: B
          , field: { mode: design.fieldMode || 'personal', attempts: design.contactAttempts || 2 }
          , onProgress: (done, total) => { this.simProgress = { done, total } }
        })
      } catch (e) {
        this.error = e && e.message ? e.message : String(e)
      } finally {
        this.isSimulating = false
      }
    }
  }
})
