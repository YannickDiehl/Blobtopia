/**
 * Decoder for the compact timeline tick format — the data contract between
 * the Rust export pipeline and the frontend.
 *
 * WRITER:  scripts/export-timeline.js (reads data/blobtopia_timeline.db,
 *          written by crates/precompute)
 * READER:  src/store/simulation.js (this module does the actual decoding)
 * TESTED:  scripts/test-timeline-decode.mjs — run via `npm test`
 *
 * Compact tick: { t, y, m, d, s: [ <one 20-element array per blob> ], sc?, ev?, el? }
 * The per-blob `s[]` array is POSITIONAL. Do not reorder — changing an index
 * here requires the same change in export-timeline.js and is a breaking
 * data-format change (regenerate all tick blocks).
 *
 *   s[0]  political_satisfaction (0–10)
 *   s[1]  ideology (1–10, links→rechts)
 *   s[2]  institutional_trust (0–10)
 *   s[3]  party_affiliation (0=Fortschritt 1=Mitte 2=Tradition 3=Unabhängig)
 *   s[4]  will_vote (0|1)
 *   s[5]  protest_readiness (0–1)
 *   s[6]  income (EUR/Monat)
 *   s[7]  emotion label (string)
 *   s[8]  latent_traits (object, only written ~every 7 ticks → forward-fill)
 *   s[9]  policy_economy        s[10] policy_environment
 *   s[11] policy_security       s[12] policy_social
 *   s[13] policy_migration      s[14] policy_democracy   (alle 0–10)
 *   s[15] age                   s[16] education_level (0–3)
 *   s[17] workplace_id          s[18] lunch_spot_id
 *   s[19] leisure_spot_id
 */

/**
 * Expand one compact tick into the full snapshot format the frontend expects.
 *
 * @param {object} tickData  compact tick ({ t, y, m, d, s, sc?, ev?, el? })
 * @param {object} ctx
 * @param {string[]} ctx.blobIndex        ordered blob IDs (index i ↔ s[i])
 * @param {object}   ctx.staticMap        blob id → static blob data
 * @param {object}  [ctx.lastKnownTraits] mutable forward-fill cache for s[8]
 */
export function expandTickSnapshot(tickData, { blobIndex, staticMap, lastKnownTraits = {} }) {
  const blobs = []

  for (let i = 0; i < blobIndex.length; i++) {
    const id = blobIndex[i]
    const g = staticMap[id] || {}
    const s = tickData.s[i]
    if (!s) continue

    blobs.push({
      id
      ,name: g.name || ''
      ,district: g.district
      ,education_level: s[16] != null ? s[16] : g.education_level
      ,job: g.job || null
      ,income: s[6]
      ,age: s[15] != null ? s[15] : ((g.age || 0) + (tickData.y || 0))
      ,home_building_id: g.home_building_id
      ,workplace_id: s[17] != null ? s[17] : g.workplace_id
      ,lunch_spot_id: s[18] != null ? s[18] : g.lunch_spot_id
      ,leisure_spot_id: s[19] != null ? s[19] : g.leisure_spot_id
      ,attitudes: {
        political_satisfaction: s[0]
        ,ideology: s[1]
        ,institutional_trust: s[2]
        ,policy_economy: s[9]
        ,policy_environment: s[10]
        ,policy_security: s[11]
        ,policy_social: s[12]
        ,policy_migration: s[13]
        ,policy_democracy: s[14],
      }
      ,political_state: {
        party_affiliation: s[3]
        ,will_vote: s[4] === 1
        ,protest_readiness: s[5]
        ,last_vote: null,
      }
      ,latent_traits: (() => { if (s[8] && Object.keys(s[8]).length > 0) { lastKnownTraits[id] = s[8]; return s[8] } return lastKnownTraits[id] || {} })()
      ,emotion: {
        valence: 0, arousal: 0
        ,label: s[7] || 'gelassen'
        ,icon: s[7] || 'calm',
      }
      ,pos: g.home_pos || g.pos || [156, 180]
      ,home_pos: g.home_pos || g.pos || [156, 180],
    })
  }

  return {
    tick: tickData.t
    ,year: tickData.y
    ,month: tickData.m
    ,day: tickData.d
    ,blobs
    ,daily_schedules: tickData.sc || {}
    ,election_results: tickData.el || undefined
    ,events_processed: tickData.ev || undefined,
  }
}
