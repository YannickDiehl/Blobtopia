#!/usr/bin/env node
/**
 * Export Blobtopia timeline data from SQLite to static JSON files.
 *
 * OPTIMIZED FORMAT: Static blob data is exported ONCE. Per-tick data only
 * contains dynamic fields (attitudes, party, emotion). The frontend merges
 * them at runtime.
 *
 * Usage:
 *   node scripts/export-timeline.js [path-to-db] [output-dir]
 *
 * Output structure:
 *   timeline/meta.json            — metadata, events, election ticks
 *   timeline/buildings.json       — building positions
 *   timeline/districts.json       — district metadata
 *   timeline/blobs-static.json    — static blob data (name, district, age, buildings)
 *   timeline/blob-index.json      — ordered list of blob IDs (for compact tick arrays)
 *   timeline/tweets.json          — all tweets
 *   timeline/ticks/XXXX-YYYY.json — compact tick blocks (dynamic data only)
 *   timeline/stats/*.json         — pre-aggregated dashboard data
 *   timeline/blobs/{id}.json      — per-blob history
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

// ── Config ──────────────────────────────────────────────────────────────
const DB_PATH = process.argv[2] || path.resolve(__dirname, '../../Blobtopia/data/blobtopia_timeline.db')
const OUT_DIR = process.argv[3] || path.resolve(__dirname, '../public/data/timeline')
const TICKS_PER_BLOCK = 100
const SAMPLE_EVERY_N = 7

// ── Helpers ─────────────────────────────────────────────────────────────
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }) }

function writeJSON(filePath, data) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data))
  const kb = (fs.statSync(filePath).size / 1024).toFixed(1)
  console.log(`  ${path.relative(OUT_DIR, filePath)} (${kb} KB)`)
}

function r2(v) { return Math.round(v * 100) / 100 }

// ── Main ────────────────────────────────────────────────────────────────
console.log(`Opening database: ${DB_PATH}`)
if (!fs.existsSync(DB_PATH)) {
  console.error(`ERROR: Database not found at ${DB_PATH}`)
  process.exit(1)
}

const db = new Database(DB_PATH, { readonly: true })

const tpy = (() => {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'ticks_per_year'").get()
  return row ? parseInt(row.value, 10) : 365
})()

const maxTick = db.prepare('SELECT MAX(tick) as max_tick FROM blob_daily_state').get().max_tick
const totalBlobs = db.prepare('SELECT COUNT(*) as cnt FROM blobs').get().cnt

console.log(`Timeline: ${maxTick} ticks, ${totalBlobs} blobs, ${tpy} ticks/year`)
console.log(`Output: ${OUT_DIR}\n`)

// ── 1. Meta ─────────────────────────────────────────────────────────────
console.log('=== Metadata ===')
const events = db.prepare('SELECT tick, description FROM events ORDER BY tick').all()
  .map(e => ({ tick: e.tick, description: e.description, year: Math.floor(e.tick / tpy) }))
const electionTicks = db.prepare('SELECT tick FROM elections ORDER BY tick').all().map(e => e.tick)

writeJSON(path.join(OUT_DIR, 'meta.json'), {
  max_tick: maxTick, total_blobs: totalBlobs, ticks_per_year: tpy,
  events, election_ticks: electionTicks,
})

// ── 2. Buildings ────────────────────────────────────────────────────────
console.log('\n=== Buildings ===')
const buildings = db.prepare(
  'SELECT id, x, z, district, visual_type, model, label, functional_type, capacity FROM buildings'
).all()

const buildingPos = {}
for (const b of buildings) {
  buildingPos[b.id] = [r2(b.x / 4), r2(b.z / 4)]
}
writeJSON(path.join(OUT_DIR, 'buildings.json'), buildings)

// ── 3. Districts ────────────────────────────────────────────────────────
console.log('\n=== Districts ===')
const districtsSrc = path.resolve(__dirname, '../../Blobtopia/data/districts.json')
if (fs.existsSync(districtsSrc)) {
  writeJSON(path.join(OUT_DIR, 'districts.json'), JSON.parse(fs.readFileSync(districtsSrc, 'utf-8')))
}

// ── 4. Static blob data (exported ONCE) ─────────────────────────────────
console.log('\n=== Static blob data ===')

const hasPersona = (() => { try { db.prepare('SELECT persona_text FROM blobs LIMIT 0').get(); return true } catch { return false } })()
const hasJobCol = (() => { try { db.prepare('SELECT job FROM blobs LIMIT 0').get(); return true } catch { return false } })()
const hasNfcCol = (() => { try { db.prepare('SELECT need_for_closure FROM blobs LIMIT 0').get(); return true } catch { return false } })()
const hasSnapshots = (() => { try { db.prepare('SELECT 1 FROM blob_persona_snapshots LIMIT 0').get(); return true } catch { return false } })()

const blobsCols = `id, name, district, age, education_level, income, home_building_id, workplace_id, lunch_spot_id, leisure_spot_id${hasPersona ? ', persona_text' : ''}${hasJobCol ? ', job' : ''}${hasNfcCol ? ', need_for_closure' : ''}`
const blobsStatic = db.prepare(`SELECT ${blobsCols} FROM blobs ORDER BY id`).all()

// If job is not in blobs table, get it from persona snapshots (tick 0)
if (!hasJobCol && hasSnapshots) {
  console.log('  Enriching blobs with jobs from persona snapshots...')
  const jobMap = {}
  const jobRows = db.prepare('SELECT blob_id, job FROM blob_persona_snapshots WHERE tick = 0').all()
  for (const r of jobRows) { jobMap[r.blob_id] = r.job }
  for (const g of blobsStatic) {
    g.job = jobMap[g.id] || null
  }
  console.log(`  ${jobRows.length} jobs loaded`)
}

// Default NfC if column not present
if (!hasNfcCol) {
  for (const g of blobsStatic) { g.need_for_closure = 5.0 }
}

// Enrich with building positions
for (const g of blobsStatic) {
  g.home_pos = g.home_building_id ? (buildingPos[g.home_building_id] || [156, 180]) : [156, 180]
  g.pos = g.home_pos
}

writeJSON(path.join(OUT_DIR, 'blobs-static.json'), blobsStatic)

// Ordered blob IDs — tick arrays use this order (index-based, saves ~50% space)
const blobIds = blobsStatic.map(g => g.id)
const blobIdToIndex = {}
for (let i = 0; i < blobIds.length; i++) {
  blobIdToIndex[blobIds[i]] = i
}
writeJSON(path.join(OUT_DIR, 'blob-index.json'), blobIds)

// ── 4b. Change Summaries from persona snapshots ────────────────────────
console.log('\n=== Change summaries ===')
if (hasSnapshots) {
  const csRows = db.prepare(
    "SELECT blob_id, tick, change_summary FROM blob_persona_snapshots WHERE change_summary IS NOT NULL AND change_summary != '' ORDER BY blob_id, tick"
  ).all()
  const changeSummaries = {}
  for (const r of csRows) {
    if (!changeSummaries[r.blob_id]) changeSummaries[r.blob_id] = []
    changeSummaries[r.blob_id].push({ tick: r.tick, summary: r.change_summary })
  }
  writeJSON(path.join(OUT_DIR, 'change-summaries.json'), changeSummaries)
  console.log(`  ${csRows.length} change summaries for ${Object.keys(changeSummaries).length} blobs`)
} else {
  writeJSON(path.join(OUT_DIR, 'change-summaries.json'), {})
}

// ── 5. COMPACT Tick blocks ──────────────────────────────────────────────
// Per tick, only store DYNAMIC data as arrays (not objects) for compactness.
// Format per tick: { s: [[sat, ideo, trust, party, vote, protest, income, emo_label, {traits}]], schedules?, events?, election? }
// Array index = blob index from blob-index.json
console.log('\n=== Compact tick blocks ===')
ensureDir(path.join(OUT_DIR, 'ticks'))

const stmtState = db.prepare(`
  SELECT blob_id, satisfaction, ideology, trust, party, will_vote,
         protest_readiness, income, emotion_label, latent_traits_json,
         policy_economy, policy_environment, policy_security,
         policy_social, policy_migration, policy_democracy,
         age, education_level, workplace_id, lunch_spot_id, leisure_spot_id
  FROM blob_daily_state WHERE tick = ? ORDER BY blob_id
`)

const stmtSchedules = db.prepare(
  'SELECT blob_id, schedule_json FROM daily_schedules WHERE tick = ?'
)
const stmtEvents = db.prepare('SELECT description FROM events WHERE tick = ?')
const stmtElection = db.prepare(
  'SELECT fortschritt, mitte, tradition, unabhaengige FROM elections WHERE tick = ?'
)

let totalSize = 0
const numBlocks = Math.ceil((maxTick + 1) / TICKS_PER_BLOCK)

for (let blockIdx = 0; blockIdx < numBlocks; blockIdx++) {
  const startTick = blockIdx * TICKS_PER_BLOCK
  const endTick = Math.min(startTick + TICKS_PER_BLOCK - 1, maxTick)

  const block = {}

  for (let tick = startTick; tick <= endTick; tick++) {
    const states = stmtState.all(tick)
    if (states.length === 0) continue

    // Compact state arrays:
    // [0:sat, 1:ideo, 2:trust, 3:party, 4:vote, 5:protest, 6:income, 7:emo_label,
    //  8:{traits}, 9:pol_eco, 10:pol_env, 11:pol_sec, 12:pol_soc, 13:pol_mig, 14:pol_dem]
    const stateArr = new Array(totalBlobs).fill(null)
    for (const s of states) {
      const idx = blobIdToIndex[s.blob_id]
      if (idx !== undefined) {
        let traits = null
        if (s.latent_traits_json) {
          try { traits = JSON.parse(s.latent_traits_json) } catch {}
        }
        stateArr[idx] = [
          r2(s.satisfaction), r2(s.ideology), r2(s.trust),
          s.party, s.will_vote, r2(s.protest_readiness),
          r2(s.income), s.emotion_label || 'gelassen',
          traits,
          r2(s.policy_economy), r2(s.policy_environment), r2(s.policy_security),
          r2(s.policy_social), r2(s.policy_migration), r2(s.policy_democracy),
          s.age, s.education_level, s.workplace_id, s.lunch_spot_id, s.leisure_spot_id
        ]
      }
    }

    const year = Math.floor(tick / tpy)
    const month = Math.floor((tick % tpy) / 30) + 1
    const day = (tick % tpy) % 30 + 1

    const tickData = { t: tick, y: year, m: month, d: day, s: stateArr }

    // Schedules (sparse — only when they exist)
    const scheduleRows = stmtSchedules.all(tick)
    if (scheduleRows.length > 0) {
      const schedules = {}
      for (const sr of scheduleRows) {
        try { schedules[sr.blob_id] = JSON.parse(sr.schedule_json) } catch {}
      }
      tickData.sc = schedules
    }

    // Events
    const eventRows = stmtEvents.all(tick)
    if (eventRows.length > 0) {
      tickData.ev = eventRows.map(e => e.description)
    }

    // Election
    const electionRow = stmtElection.get(tick)
    if (electionRow) {
      tickData.el = electionRow
    }

    block[tick] = tickData
  }

  const blockLabel = String(startTick).padStart(4, '0') + '-' + String(endTick).padStart(4, '0')
  const filePath = path.join(OUT_DIR, 'ticks', `${blockLabel}.json`)
  writeJSON(filePath, block)
  totalSize += fs.statSync(filePath).size
}

console.log(`\n  Total tick data: ${(totalSize / 1024 / 1024).toFixed(1)} MB`)

// ── 6. Tweets ───────────────────────────────────────────────────────────
console.log('\n=== Tweets ===')
const hasTweets = (() => { try { db.prepare('SELECT 1 FROM tweets LIMIT 0').get(); return true } catch { return false } })()

if (hasTweets) {
  const tweets = db.prepare(`
    SELECT t.id, t.blob_id, g.name, g.district, t.tick, t.topic,
           t.trigger_type, t.event_description, t.tweet_text, t.sentiment
    FROM tweets t JOIN blobs g ON t.blob_id = g.id ORDER BY t.tick ASC
  `).all()
  writeJSON(path.join(OUT_DIR, 'tweets.json'), { tweets })
} else {
  writeJSON(path.join(OUT_DIR, 'tweets.json'), { tweets: [] })
}

// ── 7. Dashboard stats ─────────────────────────────────────────────────
console.log('\n=== Dashboard stats ===')
ensureDir(path.join(OUT_DIR, 'stats'))

// 7a. Attitudes
{
  const rows = db.prepare(`
    SELECT s.tick, g.district,
           AVG(s.satisfaction) as sat, AVG(s.ideology) as ideo,
           AVG(s.trust) as tru, AVG(s.protest_readiness) as pro
    FROM blob_daily_state s JOIN blobs g ON s.blob_id = g.id
    WHERE s.tick % ? = 0 GROUP BY s.tick, g.district ORDER BY s.tick, g.district
  `).all(SAMPLE_EVERY_N)

  const districts = { 0: [], 1: [], 2: [], 3: [], 4: [] }
  for (const r of rows) {
    const arr = districts[r.district] || []
    arr.push({ tick: r.tick, satisfaction: r2(r.sat), ideology: r2(r.ideo), trust: r2(r.tru), protest: r2(r.pro) })
    districts[r.district] = arr
  }
  writeJSON(path.join(OUT_DIR, 'stats', 'attitudes.json'), { districts })
}

// 7a2. Latent Traits (all 21 indicators, grouped by construct, per district)
{
  const rows = db.prepare(`
    SELECT s.tick, g.district,
           AVG(json_extract(s.latent_traits_json, '$.self_efficacy')) as self_efficacy,
           AVG(json_extract(s.latent_traits_json, '$.political_knowledge')) as political_knowledge,
           AVG(json_extract(s.latent_traits_json, '$.vote_importance')) as vote_importance,
           AVG(json_extract(s.latent_traits_json, '$.external_efficacy')) as external_efficacy,
           AVG(json_extract(s.latent_traits_json, '$.network_size')) as network_size,
           AVG(json_extract(s.latent_traits_json, '$.neighbor_trust')) as neighbor_trust,
           AVG(json_extract(s.latent_traits_json, '$.community_participation')) as community_participation,
           AVG(json_extract(s.latent_traits_json, '$.generalized_trust')) as generalized_trust,
           AVG(json_extract(s.latent_traits_json, '$.media_trust')) as media_trust,
           AVG(json_extract(s.latent_traits_json, '$.obedience_value')) as obedience_value,
           AVG(json_extract(s.latent_traits_json, '$.rule_conformity')) as rule_conformity,
           AVG(json_extract(s.latent_traits_json, '$.strong_leader_preference')) as strong_leader_preference,
           AVG(json_extract(s.latent_traits_json, '$.powerlessness')) as powerlessness,
           AVG(json_extract(s.latent_traits_json, '$.political_complexity')) as political_complexity,
           AVG(json_extract(s.latent_traits_json, '$.party_indifference')) as party_indifference,
           AVG(json_extract(s.latent_traits_json, '$.economic_security_priority')) as economic_security_priority,
           AVG(json_extract(s.latent_traits_json, '$.environment_over_economy')) as environment_over_economy,
           AVG(json_extract(s.latent_traits_json, '$.freedom_over_order')) as freedom_over_order,
           AVG(json_extract(s.latent_traits_json, '$.anti_elitism')) as anti_elitism,
           AVG(json_extract(s.latent_traits_json, '$.people_centrism')) as people_centrism,
           AVG(json_extract(s.latent_traits_json, '$.manichean_outlook')) as manichean_outlook
    FROM blob_daily_state s JOIN blobs g ON s.blob_id = g.id
    WHERE s.latent_traits_json IS NOT NULL AND s.tick % ? = 0
    GROUP BY s.tick, g.district ORDER BY s.tick, g.district
  `).all(SAMPLE_EVERY_N)

  const districts = { 0: [], 1: [], 2: [], 3: [], 4: [] }
  for (const r of rows) {
    const arr = districts[r.district] || []
    arr.push({
      tick: r.tick,
      efficacy: {
        self_efficacy: r2(r.self_efficacy),
        political_knowledge: r2(r.political_knowledge),
        vote_importance: r2(r.vote_importance),
        external_efficacy: r2(r.external_efficacy),
      },
      social_capital: {
        network_size: r2(r.network_size),
        neighbor_trust: r2(r.neighbor_trust),
        community_participation: r2(r.community_participation),
        generalized_trust: r2(r.generalized_trust),
        media_trust: r2(r.media_trust),
      },
      authoritarianism: {
        obedience_value: r2(r.obedience_value),
        rule_conformity: r2(r.rule_conformity),
        strong_leader_preference: r2(r.strong_leader_preference),
      },
      alienation: {
        powerlessness: r2(r.powerlessness),
        political_complexity: r2(r.political_complexity),
        party_indifference: r2(r.party_indifference),
      },
      materialism: {
        economic_security_priority: r2(r.economic_security_priority),
        environment_over_economy: r2(r.environment_over_economy),
        freedom_over_order: r2(r.freedom_over_order),
      },
      populism: {
        anti_elitism: r2(r.anti_elitism),
        people_centrism: r2(r.people_centrism),
        manichean_outlook: r2(r.manichean_outlook),
      },
    })
    districts[r.district] = arr
  }
  writeJSON(path.join(OUT_DIR, 'stats', 'latent-traits.json'), { districts })
}

// 7b. Elections
{
  const elections = db.prepare(
    'SELECT tick, fortschritt, mitte, tradition, unabhaengige FROM elections ORDER BY tick'
  ).all().map(e => ({ tick: e.tick, year: Math.floor(e.tick / tpy), ...e }))
  writeJSON(path.join(OUT_DIR, 'stats', 'elections.json'), { elections })
}

// 7c. Events
{
  writeJSON(path.join(OUT_DIR, 'stats', 'events-impact.json'), {
    events: events // reuse from meta
  })
}

// 7d. Blob list
{
  const cols = `id, name, district, age, education_level, income${hasJobCol ? ', job' : ''}`
  const blobs = db.prepare(`SELECT ${cols} FROM blobs ORDER BY district, name`).all()
  writeJSON(path.join(OUT_DIR, 'stats', 'blob-list.json'), { blobs })
}

// 7e. Summary sparklines
{
  const rows = db.prepare(`
    SELECT tick, AVG(satisfaction) as sat, AVG(ideology) as ideo, AVG(trust) as tru
    FROM blob_daily_state WHERE tick % ? = 0 GROUP BY tick ORDER BY tick
  `).all(SAMPLE_EVERY_N)

  const sparklines = { satisfaction: [], ideology: [], trust: [] }
  for (const r of rows) {
    sparklines.satisfaction.push({ tick: r.tick, value: r2(r.sat) })
    sparklines.ideology.push({ tick: r.tick, value: r2(r.ideo) })
    sparklines.trust.push({ tick: r.tick, value: r2(r.tru) })
  }
  writeJSON(path.join(OUT_DIR, 'stats', 'summary.json'), sparklines)
}

// ── 8. Per-blob history ─────────────────────────────────────────────────
console.log('\n=== Per-blob history ===')
ensureDir(path.join(OUT_DIR, 'blobs'))

const stmtHistory = db.prepare(`
  SELECT tick, satisfaction, ideology, trust, party, will_vote,
         protest_readiness, income, latent_traits_json
  FROM blob_daily_state WHERE blob_id = ? AND tick % ? = 0 ORDER BY tick
`)

let blobCount = 0
for (const g of blobsStatic) {
  const rows = stmtHistory.all(g.id, SAMPLE_EVERY_N)
  const history = rows.map(r => {
    let traits = {}
    try { traits = r.latent_traits_json ? JSON.parse(r.latent_traits_json) : {} } catch {}
    return {
      tick: r.tick, satisfaction: r2(r.satisfaction), ideology: r2(r.ideology),
      trust: r2(r.trust), party: r.party, will_vote: r.will_vote === 1,
      protest: r2(r.protest_readiness), income: r2(r.income), traits,
    }
  })
  writeJSON(path.join(OUT_DIR, 'blobs', `${g.id}.json`), { blob_id: g.id, history })
  blobCount++
  if (blobCount % 100 === 0) process.stdout.write(`  ${blobCount}/${totalBlobs} blobs...\r`)
}
console.log(`  ${blobCount}/${totalBlobs} blobs exported`)

// ── Done ────────────────────────────────────────────────────────────────
db.close()

let total = 0
function sumDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) sumDir(full)
    else total += fs.statSync(full).size
  }
}
sumDir(OUT_DIR)

console.log(`\n=== Export complete ===`)
console.log(`Total output: ${(total / 1024 / 1024).toFixed(1)} MB`)
console.log(`  Tick data:  ${(totalSize / 1024 / 1024).toFixed(1)} MB (${numBlocks} blocks)`)
console.log(`Output directory: ${OUT_DIR}`)
