/**
 * Contract test for the compact s[] tick format — the positional data
 * contract between scripts/export-timeline.js (writer) and the frontend
 * decoder src/lib/timeline-decode.js (reader).
 *
 * If an index moves on either side, this suite is the tripwire.
 * Additionally, when local tick blocks exist (public/data/timeline/ticks/),
 * the first real tick is decoded as a smoke test against production data.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { expandTickSnapshot } from '../src/lib/timeline-decode.js'

let passed = 0
function ok(name, fn) {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

// ── Synthetic fixture covering every s[] index ──────────────────────────
const blobIndex = ['id-a', 'id-b']
const staticMap = {
  'id-a': { name: 'Alma Test', district: 2, education_level: 1, job: 'Bäckerin', age: 40, home_building_id: 7, workplace_id: 8, home_pos: [10, 20] }
  ,'id-b': { name: 'Bruno Test', district: 0, education_level: 3, age: 60, pos: [1, 2] },
}
const traits = { self_efficacy: 4.5, media_trust: 2.5 }
const tick0 = {
  t: 7, y: 1, m: 2, d: 3
  ,s: [
    [3.5, 5.1, 6.6, 2, 1, 0.16, 2724.2, 'gelassen', traits, 4.9, 6.2, 4.5, 4.9, 4.7, 6.3, 42, 3, 568, 618, 567]
    ,[8.0, 2.0, 9.0, 0, 0, 0.9, 1500, 'wütend', {}, 5, 5, 5, 5, 5, 5, null, null, null, null, null],
  ]
  ,ev: ['Wirtschaftskrise']
  ,el: { results: [10, 20, 30, 5] },
}

const cache = {}
const gen = expandTickSnapshot(tick0, { blobIndex, staticMap, lastKnownTraits: cache })

ok('header fields map to tick/year/month/day', () => {
  assert.deepEqual([gen.tick, gen.year, gen.month, gen.day], [7, 1, 2, 3])
})

ok('every positional s[] field lands on the right blob property', () => {
  const a = gen.blobs[0]
  assert.equal(a.id, 'id-a')
  assert.equal(a.name, 'Alma Test')
  assert.equal(a.attitudes.political_satisfaction, 3.5)
  assert.equal(a.attitudes.ideology, 5.1)
  assert.equal(a.attitudes.institutional_trust, 6.6)
  assert.equal(a.political_state.party_affiliation, 2)
  assert.equal(a.political_state.will_vote, true)
  assert.equal(a.political_state.protest_readiness, 0.16)
  assert.equal(a.income, 2724.2)
  assert.equal(a.emotion.label, 'gelassen')
  assert.deepEqual(a.latent_traits, traits)
  assert.equal(a.attitudes.policy_economy, 4.9)
  assert.equal(a.attitudes.policy_environment, 6.2)
  assert.equal(a.attitudes.policy_security, 4.5)
  assert.equal(a.attitudes.policy_social, 4.9)
  assert.equal(a.attitudes.policy_migration, 4.7)
  assert.equal(a.attitudes.policy_democracy, 6.3)
  assert.equal(a.age, 42)
  assert.equal(a.education_level, 3) // s[16] overrides static
  assert.equal(a.workplace_id, 568)
  assert.equal(a.lunch_spot_id, 618)
  assert.equal(a.leisure_spot_id, 567)
})

ok('null tail fields fall back to static data (age adds elapsed years)', () => {
  const b = gen.blobs[1]
  assert.equal(b.age, 61) // static 60 + y=1
  assert.equal(b.education_level, 3) // from static
  assert.equal(b.political_state.will_vote, false)
  assert.deepEqual(b.pos, [1, 2]) // pos fallback when no home_pos
})

ok('latent traits forward-fill across ticks (s[8] written ~every 7 ticks)', () => {
  const tick1 = { ...tick0, t: 8, s: tick0.s.map(row => { const r = [...row]; r[8] = {}; return r }) }
  const gen1 = expandTickSnapshot(tick1, { blobIndex, staticMap, lastKnownTraits: cache })
  assert.deepEqual(gen1.blobs[0].latent_traits, traits, 'empty s[8] must reuse last known traits')
})

ok('events + election results pass through, missing blobs are skipped', () => {
  assert.deepEqual(gen.events_processed, ['Wirtschaftskrise'])
  assert.deepEqual(gen.election_results, { results: [10, 20, 30, 5] })
  const sparse = expandTickSnapshot({ t: 1, y: 0, m: 1, d: 1, s: [tick0.s[0]] }, { blobIndex, staticMap, lastKnownTraits: {} })
  assert.equal(sparse.blobs.length, 1)
})

// ── Optional: smoke-decode a real tick block when present locally ───────
const url = new URL('../public/data/timeline/ticks/0000-0099.json', import.meta.url)
if (existsSync(url)) {
  const block = JSON.parse(readFileSync(url, 'utf8'))
  const index = JSON.parse(readFileSync(new URL('../public/data/timeline/blob-index.json', import.meta.url), 'utf8'))
  const statics = JSON.parse(readFileSync(new URL('../public/data/timeline/blobs-static.json', import.meta.url), 'utf8'))
  const map = Object.fromEntries(statics.map(g => [g.id, g]))
  const first = block['0'] // block files are objects keyed by tick number

  ok('real tick 0 decodes: 500 blobs, all attitudes within 0–10', () => {
    const g = expandTickSnapshot(first, { blobIndex: index, staticMap: map, lastKnownTraits: {} })
    assert.equal(g.blobs.length, 500)
    for (const b of g.blobs) {
      for (const [k, v] of Object.entries(b.attitudes)) {
        assert.ok(v >= 0 && v <= 10, `${k} out of range: ${v}`)
      }
    }
  })
} else {
  console.log('  – real-data smoke test skipped (no local tick blocks)')
}

console.log(`\n${passed} passed, 0 failed`)
