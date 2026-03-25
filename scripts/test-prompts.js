#!/usr/bin/env node
/**
 * Comprehensive test suite for the enhanced Blobtopia system prompt builder.
 * Tests with real blob data from the timeline export.
 *
 * Usage: node scripts/test-prompts.js
 */

const fs = require('fs')
const path = require('path')

// ── ESM import workaround ──────────────────────────────────────────────
// build-system-prompt.js uses ESM export, load it via dynamic import
let buildSystemPrompt

const DATA_DIR = path.resolve(__dirname, '../public/data/timeline')

// ── Test framework ─────────────────────────────────────────────────────
let passed = 0
let failed = 0
let currentCategory = ''

function category(name) {
  currentCategory = name
  console.log('\n' + '='.repeat(70))
  console.log('  ' + name)
  console.log('='.repeat(70))
}

function assert(testName, condition, detail) {
  if (condition) {
    passed++
    console.log('  PASS  ' + testName)
  } else {
    failed++
    console.log('  FAIL  ' + testName + (detail ? ' — ' + detail : ''))
  }
}

function assertContains(testName, haystack, needle) {
  assert(testName, haystack.includes(needle), 'missing: "' + needle + '"')
}

function assertNotContains(testName, haystack, needle) {
  assert(testName, !haystack.includes(needle), 'found unexpected: "' + needle + '"')
}

// ── Load real data ─────────────────────────────────────────────────────
function loadData() {
  const staticData = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'blobs-static.json'), 'utf8'))
  const blobIndex = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'blob-index.json'), 'utf8'))
  const block4000 = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'ticks/4000-4099.json'), 'utf8'))
  const tick4000 = block4000['4000']

  const staticMap = {}
  for (const g of staticData) staticMap[g.id] = g

  // Build blob objects matching the frontend format
  function blobAt(blobId) {
    const idx = blobIndex.indexOf(blobId)
    if (idx < 0 || !tick4000.s[idx]) return null
    const s = tick4000.s[idx]
    return {
      income: s[6],
      attitudes: {
        political_satisfaction: s[0],
        ideology: s[1],
        institutional_trust: s[2],
        policy_economy: s[9],
        policy_environment: s[10],
        policy_security: s[11],
        policy_social: s[12],
        policy_migration: s[13],
        policy_democracy: s[14],
      },
      political_state: {
        party_affiliation: s[3],
        will_vote: s[4] === 1,
        protest_readiness: s[5],
      },
      latent_traits: s[8] || {},
      emotion: { valence: 0, arousal: 0, label: s[7] || 'gelassen', icon: '' },
    }
  }

  return { staticMap, blobIndex, tick4000, blobAt }
}

// ── Main ───────────────────────────────────────────────────────────────
async function main() {
  // Dynamic import for ESM module
  const mod = await import('../src/lib/build-system-prompt.js')
  buildSystemPrompt = mod.buildSystemPrompt

  const { staticMap, blobAt } = loadData()

  // ── Test blob IDs (from exploration) ──────────────────────────────
  const LEYLA_ID = '67f4a838-9d95-4c75-a09e-0ee8b7483b6b'    // frustriert, sat 0.68
  const ALEX_ID = '1ec1d513-146e-4cbf-9bf2-336d999f76a1'      // begeistert, sat 9.36
  const AMINATA_ID = 'd9f5b7ad-a60f-4f30-898b-af6a55fbc26b'   // actually Ida Lindemann (far left)
  // Find others dynamically
  const IDA_ID = 'd9f5b7ad-a60f-4f30-898b-af6a55fbc26b'       // far left, ideo 1.36

  // ════════════════════════════════════════════════════════════════════
  category('TEST 1: Activity-Mapping (SCREAMING_SNAKE_CASE)')
  // ════════════════════════════════════════════════════════════════════

  const dummyBlob = {
    income: 3000,
    attitudes: { political_satisfaction: 5, ideology: 5, institutional_trust: 5 },
    political_state: {},
    latent_traits: {},
    emotion: { label: 'gelassen' },
  }
  const dummySg = { name: 'Test Blob', age: 30, district: 0, education_level: 1, need_for_closure: 5 }

  const activityTests = [
    ['SLEEPING', 3, 'schlaefst gerade'],
    ['COMMUTING', 7, 'bist unterwegs'],
    ['WORKING', 10, 'bist bei der Arbeit'],
    ['LUNCH_BREAK', 12, 'machst Mittagspause'],
    ['SHOPPING', 14, 'bist beim Einkaufen'],
    ['SOCIALIZING', 16, 'triffst Freunde oder Nachbarn'],
    ['LEISURE', 18, 'hast Freizeit'],
    ['PROTESTING', 15, 'bist auf einer Demonstration'],
    ['GOING_HOME', 20, 'bist auf dem Heimweg'],
  ]

  for (const [activity, hour, expectedLabel] of activityTests) {
    const prompt = buildSystemPrompt(dummyBlob, dummySg, 100, 365, null, activity, hour)
    assertContains(
      'Activity ' + activity + ' → "' + expectedLabel + '"',
      prompt, expectedLabel
    )
  }

  // Unknown activity → fallback to Freizeit
  const unknownPrompt = buildSystemPrompt(dummyBlob, dummySg, 100, 365, null, 'UNKNOWN_ACTIVITY', 14)
  assertContains('Unknown activity → Freizeit fallback', unknownPrompt, 'hast Freizeit')

  // Real schedule hour resolution
  const scheduleEntries = [
    { hour: 0, activity: 'SLEEPING' },
    { hour: 7, activity: 'COMMUTING' },
    { hour: 8, activity: 'WORKING' },
    { hour: 12, activity: 'LUNCH_BREAK' },
    { hour: 13, activity: 'WORKING' },
    { hour: 17, activity: 'LEISURE' },
    { hour: 20, activity: 'GOING_HOME' },
    { hour: 22, activity: 'SLEEPING' },
  ]
  // Simulate resolveActivity logic
  function activityAtHour(entries, hour) {
    let act = 'LEISURE'
    for (let i = entries.length - 1; i >= 0; i--) {
      if (hour >= entries[i].hour) { act = entries[i].activity; break }
    }
    return act
  }
  assert('Hour 3 → SLEEPING', activityAtHour(scheduleEntries, 3) === 'SLEEPING')
  assert('Hour 10 → WORKING', activityAtHour(scheduleEntries, 10) === 'WORKING')
  assert('Hour 12.5 → LUNCH_BREAK', activityAtHour(scheduleEntries, 12.5) === 'LUNCH_BREAK')
  assert('Hour 18 → LEISURE', activityAtHour(scheduleEntries, 18) === 'LEISURE')
  assert('Hour 21 → GOING_HOME', activityAtHour(scheduleEntries, 21) === 'GOING_HOME')
  assert('Hour 23 → SLEEPING', activityAtHour(scheduleEntries, 23) === 'SLEEPING')

  // ════════════════════════════════════════════════════════════════════
  category('TEST 2: Echte Blob-Profile')
  // ════════════════════════════════════════════════════════════════════

  // Blob A: Leyla König — frustriert, sat 0.68
  const leylaBlob = blobAt(LEYLA_ID)
  const leylaSg = staticMap[LEYLA_ID]
  const leylaPrompt = buildSystemPrompt(leylaBlob, leylaSg, 4000, 365, null, 'LEISURE', 14)

  assertContains('Leyla: sat 0.68 → "am absoluten Tiefpunkt"', leylaPrompt, 'am absoluten Tiefpunkt')
  assertContains('Leyla: emotion frustriert', leylaPrompt, 'Stimmung: frustriert')
  assertContains('Leyla: frustriert instruction', leylaPrompt, 'klagst und beschwerst dich')
  assertContains('Leyla: district 3 → Mittelfeld', leylaPrompt, 'Stadtteil: Mittelfeld')
  assertContains('Leyla: party null → keine', leylaPrompt, 'Partei:                 keine')

  // Blob B: Alexander Wolf — begeistert, sat 9.36
  const alexBlob = blobAt(ALEX_ID)
  const alexSg = staticMap[ALEX_ID]
  const alexPrompt = buildSystemPrompt(alexBlob, alexSg, 4000, 365, null, 'WORKING', 10)

  assertContains('Alex: sat 9.36 → "sehr zufrieden"', alexPrompt, 'sehr zufrieden')
  assertContains('Alex: emotion begeistert', alexPrompt, 'Stimmung: begeistert')
  assertContains('Alex: begeistert instruction', alexPrompt, 'enthusiastisch und positiv')
  assertContains('Alex: district 1 → Sonnenberg', alexPrompt, 'Stadtteil: Sonnenberg')
  assertContains('Alex: party 0 → Fortschritt', alexPrompt, 'Partei:                 Fortschritt')
  assertContains('Alex: working activity', alexPrompt, 'bist bei der Arbeit')

  // Blob D: Ida Lindemann — far left, ideo 1.36
  const idaBlob = blobAt(IDA_ID)
  const idaSg = staticMap[IDA_ID]
  const idaPrompt = buildSystemPrompt(idaBlob, idaSg, 4000, 365, null, 'SOCIALIZING', 16)

  assertContains('Ida: ideo 1.36 → left of center', idaPrompt, '1.4/10 (1=links, 10=rechts)')
  assertContains('Ida: party 0 → Fortschritt', idaPrompt, 'Partei:                 Fortschritt')
  assertContains('Ida: socializing activity', idaPrompt, 'triffst Freunde oder Nachbarn')

  // ════════════════════════════════════════════════════════════════════
  category('TEST 3: Policy-Label-Korrektheit')
  // ════════════════════════════════════════════════════════════════════

  // Alex: pol_eco=3.91 → "eher fuer Regulation" (<4.5)
  assertContains('Alex pol_eco 3.91 → eher fuer Regulation', alexPrompt, 'eher fuer Regulation')
  // Alex: pol_dem=7.43 → "eher repraesentativ" (<7.5)
  assertContains('Alex pol_dem 7.43 → eher repraesentativ', alexPrompt, 'eher repraesentativ')
  // Alex: pol_env=3.87 → "eher Umweltschutz" (<4.5)
  assertContains('Alex pol_env 3.87 → eher Umweltschutz', alexPrompt, 'eher Umweltschutz')

  // Ida: pol_eco=3.02 → "eher fuer Regulation"
  assertContains('Ida pol_eco 3.02 → eher fuer Regulation', idaPrompt, 'eher fuer Regulation')
  // Ida: pol_dem=7.96 → "klar fuer repraesentative Demokratie" (>=7.5)
  assertContains('Ida pol_dem 7.96 → klar repraesentativ', idaPrompt, 'klar fuer repraesentative Demokratie')

  // All 6 policy dimensions present
  for (const dim of ['Wirtschaft:', 'Umwelt:', 'Sicherheit:', 'Soziales:', 'Migration:', 'Demokratie:']) {
    assertContains('Alex prompt has policy ' + dim, alexPrompt, dim)
  }

  // ════════════════════════════════════════════════════════════════════
  category('TEST 4: Distriktnamen-Mapping')
  // ════════════════════════════════════════════════════════════════════

  const districtNames = ['Gruental', 'Sonnenberg', 'Hafenviertel', 'Mittelfeld', 'Industriezone']
  for (let d = 0; d < 5; d++) {
    const sg = { name: 'Test D' + d, age: 30, district: d, education_level: 1, need_for_closure: 5 }
    const prompt = buildSystemPrompt(dummyBlob, sg, 100, 365, null, 'LEISURE', 14)
    assertContains('District ' + d + ' → ' + districtNames[d], prompt, 'Stadtteil: ' + districtNames[d])
  }

  // ════════════════════════════════════════════════════════════════════
  category('TEST 5: Emotion-Verhaltensanweisungen')
  // ════════════════════════════════════════════════════════════════════

  const emotionTests = [
    ['frustriert', 'klagst und beschwerst dich'],
    ['begeistert', 'enthusiastisch und positiv'],
    ['besorgt', 'nachdenklich und etwas aengstlich'],
    ['wuetend', 'scharf und emotional'],
    ['gelassen', 'ruhig und bedaechtig'],
    ['zufrieden', 'ruhig und gelassen'],
    ['hoffnungsvoll', 'optimistisch'],
    ['angespannt', 'hastig und unruhig'],
  ]

  for (const [emotion, expectedPhrase] of emotionTests) {
    const blob = { ...dummyBlob, emotion: { label: emotion } }
    const prompt = buildSystemPrompt(blob, dummySg, 100, 365, null, 'LEISURE', 14)
    assertContains('Emotion ' + emotion + ' → "' + expectedPhrase + '"', prompt, expectedPhrase)
    assertContains('Emotion ' + emotion + ' label in prompt', prompt, 'Stimmung: ' + emotion)
  }

  // ════════════════════════════════════════════════════════════════════
  category('TEST 6: NfC-Kommunikationsstil')
  // ════════════════════════════════════════════════════════════════════

  // Low NfC → Graustufen
  const sgLowNfc = { ...dummySg, need_for_closure: 2.0 }
  const lowNfcPrompt = buildSystemPrompt(dummyBlob, sgLowNfc, 100, 365, null, 'LEISURE', 14)
  assertContains('NfC 2.0 → Graustufen', lowNfcPrompt, 'denkst gerne in Graustufen')
  assertNotContains('NfC 2.0 → NICHT klare Antworten', lowNfcPrompt, 'klare Antworten')

  // Mid NfC → keine Instruktion
  const sgMidNfc = { ...dummySg, need_for_closure: 5.0 }
  const midNfcPrompt = buildSystemPrompt(dummyBlob, sgMidNfc, 100, 365, null, 'LEISURE', 14)
  assertNotContains('NfC 5.0 → keine Graustufen', midNfcPrompt, 'denkst gerne in Graustufen')
  assertNotContains('NfC 5.0 → keine klare Antworten', midNfcPrompt, 'klare Antworten')

  // High NfC → klare Antworten
  const sgHighNfc = { ...dummySg, need_for_closure: 8.5 }
  const highNfcPrompt = buildSystemPrompt(dummyBlob, sgHighNfc, 100, 365, null, 'LEISURE', 14)
  assertContains('NfC 8.5 → klare Antworten', highNfcPrompt, 'klare Antworten')
  assertNotContains('NfC 8.5 → NICHT Graustufen', highNfcPrompt, 'denkst gerne in Graustufen')

  // ════════════════════════════════════════════════════════════════════
  category('TEST 7: Prompt-Struktur-Invarianten')
  // ════════════════════════════════════════════════════════════════════

  // Test all real prompts for structural correctness
  const testPrompts = [
    { name: 'Leyla', prompt: leylaPrompt },
    { name: 'Alex', prompt: alexPrompt },
    { name: 'Ida', prompt: idaPrompt },
  ]

  const sections = [
    '=== IDENTITAET ===',
    '=== AKTUELLE SITUATION ===',
    '=== AKTUELLER ZUSTAND',
    '=== PARTEIEN IN BLOBTOPIA ===',
    '=== JUENGSTE VERAENDERUNGEN ===',
    '=== REGELN ===',
    '=== GESPRAECHSGRENZEN ===',
  ]

  for (const { name, prompt } of testPrompts) {
    // All sections present
    for (const section of sections) {
      assertContains(name + ': has section ' + section.substring(4, 25), prompt, section)
    }

    // Sections in correct order
    let lastIdx = -1
    let orderOk = true
    for (const section of sections) {
      const idx = prompt.indexOf(section)
      if (idx <= lastIdx) { orderOk = false; break }
      lastIdx = idx
    }
    assert(name + ': sections in correct order', orderOk)

    // Key content present
    assertContains(name + ': has Stadtteil', prompt, 'Stadtteil:')
    assertContains(name + ': has Tageszeit', prompt, 'Tageszeit: ca.')
    assertContains(name + ': has Stimmung', prompt, 'Stimmung:')
    assertContains(name + ': has Politische Positionen', prompt, 'Politische Positionen:')
    assertContains(name + ': has THEMEN-REGEL with policy topics', prompt, 'Wirtschaft, Umwelt, Sicherheit, Soziales, Migration, Demokratie')

    // No undefined/NaN
    assertNotContains(name + ': no undefined', prompt, 'undefined')
    assertNotContains(name + ': no NaN', prompt, 'NaN')
    assertNotContains(name + ': no null text', prompt, 'null/')
  }

  // ════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════
  console.log('\n' + '='.repeat(70))
  console.log('  ZUSAMMENFASSUNG')
  console.log('='.repeat(70))
  console.log('  Bestanden: ' + passed + '/' + (passed + failed))
  console.log('  Fehlgeschlagen: ' + failed)
  console.log('='.repeat(70))

  if (failed > 0) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
