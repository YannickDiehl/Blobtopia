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
  SAMPLING, drawSample, eligibleFrame, realizedDistribution, ACCESSORS, allocateLargestRemainder
} from '@/lib/survey-sampling'
import { toCSV, codebookToCSV } from '@/lib/survey-dataset'
import { surveyToXlsx } from '@/lib/survey-xlsx'
import { DISTRICT_NAMES, EDUCATION_LABELS, PARTY_NAMES } from '@/lib/blob-adapter'
import { serializeStudy, parseStudy, saveDraft, loadDraft } from '@/lib/survey-persist'
import { CONSTRUCTS } from '@/lib/survey-constructs'
import { runSurvey, makeChatSender } from '@/lib/survey-engine'
import { runSyntheticSurvey } from '@/lib/survey-synthetic'
import { snapshotTruth, decompose, simulateSamplingDistribution } from '@/lib/survey-truth'
import { buildDemographics } from '@/lib/survey-demographics'
import { simulateParticipation, fieldReport, questionnaireBurden, FIELD_MODES, DISPOSITION } from '@/lib/survey-fieldwork'
import { postStratify, calibratedEstimate } from '@/lib/survey-weighting'
import { runLongitudinalStudy, waveSummary } from '@/lib/survey-longitudinal'
import { reliabilityReport } from '@/lib/survey-reliability'
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
  // Unit-Nonresponse (die Einheit hat gar nicht teilgenommen): EIN Code + Label
  // auf STUDIEN-Ebene — anders als die Item-Missings (-9/-8) gehört das nicht in
  // eine einzelne Frage, sondern zum ganzen Fall. Default -13 „Nicht teilgenommen"
  // (ALLBUS-Konvention); von der Studierenden anpassbar wie die Item-Missings. Der
  // genaue Grund (verweigert/nicht erreicht/…) bleibt in der disposition-Spalte.
  , nonresponse: { code: -13, label: 'Nicht teilgenommen' }
  // Item-Missings (Verweigert/Weiß nicht) studienweit anpassbar — Fallback
  // für ALLE Fragen; eine per-Frage-Deklaration im Fragetext überschreibt das.
  // Ungültig (-7) bleibt fest. Spiegelt design.nonresponse (Fall-Ebene).
  , itemMissing: { refused: { code: -9, label: 'Verweigert' }, dontknow: { code: -8, label: 'Weiß nicht' } }
  // Längsschnitt: 'cross' | 'trend' | 'panel'; weitere Wellen als Sim-Jahre
  , longitudinal: { type: 'cross', waveYears: [] }
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
    // Largest-Remainder: die Zellen summieren garantiert auf n (Rundung je
    // Zelle driftete um ±1–2 — dieselbe Arithmetik wie bei der Schichtung).
    d.quotas = allocateLargestRemainder(d.n || 0, Object.keys(counts).map(k => ({ key: k, size: counts[k] })), 'proportional')
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

function downloadBytes(bytes, filename, mime) {
  try {
    const blob = new Blob([bytes], { type: mime })
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

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// Code↔Label-Kataloge für den labelgetreuen xlsx-Export (Distrikt/Bildung
// wertgelabelt numerisch, Partei als Faktor). Hier importiert statt in
// survey-xlsx.js, damit jenes Modul ohne JSON-Import node-testbar bleibt.
function labelCatalogs() {
  return { districtNames: DISTRICT_NAMES, educationLabels: EDUCATION_LABELS, partyNames: PARTY_NAMES }
}

export const useSurveyStore = defineStore('survey', {
  state: () => ({
    isOpen: false
    // Aktueller Arbeitsschritt der Studienmappe (Blattreiter) — im Store,
    // damit die Dozentenzimmer-Mappe der Registratur direkt zum
    // Wahrheit-Blatt springen kann
    , step: 'editor'
    // Dozenten-Schloss: EIN Unlock für Dozentenzimmer + Inspektor-Details
    // (gleicher localStorage-Key wie bisher, bewusst geteilt)
    , instructorUnlocked: typeof localStorage !== 'undefined'
      && localStorage.getItem('blobtopia_inspector_unlocked') === 'true'
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
    // Wahrheit-Tab: ausgewählte Welle bei Längsschnitt-Studien
    , truthWave: 0
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
    // Bei Längsschnitt-Studien: Zerlegung der ausgewählten Welle (truthWave).
    , decomposition(state) {
      if (!state.result || !state.result.meta) return null
      const meta = state.result.meta
      if (meta.waves && meta.waves.length) {
        const w = Math.min(state.truthWave, meta.waves.length - 1)
        const wm = meta.waves[w]
        return decompose({
          rows: state.result.rows.filter(r => (r.welle || 1) === w + 1)
          , meta: { truth: wm.truth, technique: wm.technique, frameSize: wm.frameSize }
        }, state.items)
      }
      if (!meta.truth) return null
      return decompose(state.result, state.items)
    }
    // Reliabilität, wenn ≥2 Items dasselbe Konstrukt messen (wave-aware).
    , reliability(state) {
      if (!state.result || !state.result.meta) return null
      const meta = state.result.meta
      let rows = state.result.rows
      let truth = meta.truth
      if (meta.waves && meta.waves.length) {
        const w = Math.min(state.truthWave, meta.waves.length - 1)
        rows = rows.filter(r => (r.welle || 1) === w + 1)
        truth = meta.waves[w].truth
      }
      if (!truth) return null
      const rep = reliabilityReport(rows, state.items, truth)
      return rep.length ? rep : null
    }
    // Veränderungs-Sicht (Trend/Panel): geschätzte vs. wahre Veränderung.
    , waveChanges(state) {
      if (!state.result || !state.result.meta || !state.result.meta.waves) return null
      return waveSummary(state.result, state.items)
    }
    // Kalibrierungsgewichte (Post-Stratifizierung) — post-hoc aus dem Ergebnis.
    // Bei Längsschnitt deaktiviert (gepoolte Wellen wären methodisch falsch).
    , calibration(state) {
      if (!state.calib.enabled || !state.result || !state.result.meta.truth) return null
      if (state.result.meta.waves && state.result.meta.waves.length > 1) return null
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
    , SET_STEP(step) { this.step = step }
    // ── Dozenten-Schloss ──
    , unlockInstructor(password) {
      const correct = import.meta.env.VUE_APP_INSPECTOR_PASSWORD || 'blob123'
      if (password !== correct) return false
      this.instructorUnlocked = true
      localStorage.setItem('blobtopia_inspector_unlocked', 'true')
      return true
    }
    , relockInstructor() {
      this.instructorUnlocked = false
      localStorage.removeItem('blobtopia_inspector_unlocked')
    }
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
            + ' — diese Frage(n) ließen sich nicht eindeutig zuordnen. Formuliere sie im Fragebogen etwas konkreter, sonst können die Blobs nicht antworten.'
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
        } else if (design.longitudinal && design.longitudinal.type !== 'cross' && (design.longitudinal.waveYears || []).length) {
          // Längsschnitt: Welle 1 = aktueller Tick, weitere Wellen aus den
          // gewählten Sim-Jahren. Populationen werden pro Welle geladen.
          const sim = useSimulationStore()
          const tpy = (sim.timelineMeta && sim.timelineMeta.ticks_per_year) || 365
          const maxTick = (sim.timelineMeta && sim.timelineMeta.max_tick) || 8030
          const ticks = [sim.tick || 0].concat(
            design.longitudinal.waveYears.map(y => Math.min(maxTick, Math.round(y * tpy)))
          )
          const waves = []
          for (const t of ticks) {
            this.progress = { done: waves.length, total: ticks.length }
            waves.push({ tick: t, blobs: await sim.fetchPopulationAt(t) })
          }
          result = runLongitudinalStudy({
            type: design.longitudinal.type, waves, design, items: this.items, demographics
          })
          // Kompatibilität: Welle-1-Wahrheit als Default (Dozenten-CSV etc.)
          result.meta.truth = result.meta.waves[0].truth
          result.meta.technique = design.technique
          result.meta.frameSize = result.meta.waves[0].frameSize
          this.truthWave = 0
          this.progress = { done: result.rows.length, total: result.rows.length }
        } else {
          // Synthetic (free, instant): Brutto → Feldarbeit (Unit-Nonresponse,
          // modusabhängig) → Netto antwortet. Nichtteilnehmende bleiben als
          // Dispositionszeilen im Datensatz — wie in echten Felddaten.
          const mode = FIELD_MODES[design.fieldMode] ? design.fieldMode : 'personal'
          const participation = simulateParticipation(sample.units, {
            mode: mode, attempts: design.contactAttempts, seed: design.seed
            , burden: questionnaireBurden(this.items)
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
        // (Längsschnitt-Studien haben ihre Wahrheit bereits pro Welle.)
        if (!result.meta.waves) {
          result.meta.truth = snapshotTruth({ blobs, design, units: sample.units, items: this.items })
          result.meta.technique = design.technique
          result.meta.frameSize = sample.frameSize
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
      const csv = toCSV(this.result.rows, this.items, { nonparticipation: this.design.nonresponse, itemMissing: this.design.itemMissing })
      downloadText(csv, 'blobtopia-befragung.csv', 'text/csv')
    }
    // Labelgetreuer .xlsx-Export im mariposa-Format (Data + Labels), per
    // read_xlsx() in R mit voller Label-/Missing-Rekonstruktion zurücklesbar.
    , exportXlsx() {
      if (!this.result) return
      const bytes = surveyToXlsx(this.result.rows, this.items, this.design, labelCatalogs())
      downloadBytes(bytes, 'blobtopia-befragung.xlsx', XLSX_MIME)
    }

    // ── Wahrheit-Tab (god view) ──
    , revealTruth() { this.truthRevealed = true }
    , SET_CALIB(calib) { this.calib = Object.assign({}, this.calib, calib) }
    , SET_TRUTH_WAVE(w) { this.truthWave = w }

    // Instructor-only export: the student dataset plus a `<item>_wahr` column.
    // Längsschnitt: die Wahrheit gilt PRO WELLE — Zeilen werden dafür auf
    // eindeutige IDs (blobId·W<welle>) gemappt.
    , exportInstructorCsv() {
      if (!this.result || !this.result.meta.truth) return
      let rows = this.result.rows
      let truth = this.result.meta.truth
      if (this.result.meta.waves && this.result.meta.waves.length > 1) {
        const perUnit = {}
        rows = this.result.rows.map(r => {
          const w = r.welle || 1
          const key = r.blobId + '·W' + w
          const wave = this.result.meta.waves[w - 1]
          if (wave.truth.perUnit[r.blobId]) perUnit[key] = wave.truth.perUnit[r.blobId]
          return Object.assign({}, r, { blobId: key })
        })
        truth = { perUnit }
      }
      const csv = toCSV(rows, this.items, { truth, nonparticipation: this.design.nonresponse, itemMissing: this.design.itemMissing })
      downloadText(csv, 'blobtopia-befragung-dozentenversion.csv', 'text/csv')
    }
    // Dozentenversion als .xlsx (zusätzliche `<id>_wahr`-Spalten). Bei
    // Mehr-Wellen-Studien gilt die Wahrheit von Welle 1 (Panels weiter via CSV).
    , exportInstructorXlsx() {
      if (!this.result || !this.result.meta.truth) return
      const bytes = surveyToXlsx(this.result.rows, this.items, this.design, Object.assign({ truth: this.result.meta.truth }, labelCatalogs()))
      downloadBytes(bytes, 'blobtopia-befragung-dozentenversion.xlsx', XLSX_MIME)
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
