// Map server Activity enum to frontend state names
export const ACTIVITY_MAP = {
  'SLEEPING': 'SLEEPING'
  , 'COMMUTING': 'GO_TO_WORK'
  , 'WORKING': 'AT_WORK'
  , 'LUNCH_BREAK': 'GO_TO_LUNCH'
  , 'SHOPPING': 'GO_TO_SHOP'
  , 'SOCIALIZING': 'GO_TO_SOCIAL'
  , 'LEISURE': 'GO_TO_LEISURE'
  , 'STROLLING': 'GO_TO_STROLL'
  , 'PROTESTING': 'GO_TO_PROTEST'
  , 'GOING_HOME': 'GO_TO_HOME'
}

/**
 * Build a client-side daily schedule (legacy fallback when server_schedule is absent).
 * @param {number} phase - unique per-blob phase (0–2π), used for ±variation
 * @param {number} ageGroup - 0=young, 1=middle, 2=older
 * @param {number} edu - education level 0-3
 * @param {number} income - normalised income 1-10
 * @param {number} district - district 0-4
 * @param {object} c - the blob creature data
 * @returns {Array<{hour: number, state: string, building_id: null}>}
 */
export function buildSchedule(phase, ageGroup, edu, income, district, c){
  const s = []
  const rOff = phase // 0–2π, used for ±variation

  // ── Wake time: older wake earlier, young sleep in ──
  const wakeHour = ageGroup === 0 ? 7 + (rOff > 4 ? 1 : 0)     // young: 7-8
                 : ageGroup === 2 ? 5 + (rOff > 3 ? 1 : 0)     // older: 5-6
                 : 6 + (rOff > 4 ? 1 : 0)                  // middle: 6-7

  // ── Work start: edu 3 (academic) starts later, factory workers early ──
  const workStart = edu === 3 ? wakeHour + 2               // academics: 8-10
                  : edu === 0 ? wakeHour + 0.5             // labor: right after waking
                  : wakeHour + 1                           // default: +1h after wake

  // ── Lunch: standard 12, but shift workers might eat at 11 ──
  const lunchStart = district === 4 ? 11 : 12
  const lunchEnd = income > 7 ? lunchStart + 1.5           // wealthy: long lunch
                 : lunchStart + 1                          // standard: 1h

  // ── Work end: varies by job type ──
  const workEnd = edu === 3 ? 16 + (rOff > 3 ? 1 : 0)     // academics: 16-17
                : edu === 0 ? 15 + (rOff > 4 ? 1 : 0)     // labor: 15-16 (early physical work)
                : 17 + (rOff > 5 ? 1 : 0)                 // office: 17-18

  // ── Evening: young stay out late, older go home early ──
  // Political engagement: high protest_readiness → may visit civic center
  const protestReady = c.political_state ? c.political_state.protest_readiness || 0 : 0
  const homeHour = ageGroup === 0 ? 21 + (rOff > 3 ? 1 : 0)    // young: 21-22
                 : ageGroup === 2 ? 19                           // older: 19
                 : 20 + (protestReady > 0.5 ? 1 : 0)      // middle: 20, politically active: 21

  const sleepHour = ageGroup === 0 ? 23 + (rOff > 4 ? 1 : 0)   // young: 23-24
                  : ageGroup === 2 ? 21                          // older: 21
                  : 22 + (rOff > 5 ? 1 : 0)               // middle: 22-23

  // Build the schedule
  s.push({ hour: 0,          state: 'SLEEPING',     building_id: null })
  s.push({ hour: wakeHour,   state: 'GO_TO_WORK',   building_id: null })
  s.push({ hour: workStart,  state: 'AT_WORK',      building_id: null })
  s.push({ hour: lunchStart, state: 'GO_TO_LUNCH',  building_id: null })
  s.push({ hour: lunchEnd,   state: 'AT_WORK',      building_id: null })
  s.push({ hour: workEnd,    state: 'GO_TO_LEISURE', building_id: null })
  s.push({ hour: homeHour,   state: 'GO_TO_HOME',   building_id: null })
  s.push({ hour: sleepHour,  state: 'SLEEPING',     building_id: null })

  // Sort by hour (should already be, but be safe)
  s.sort((a, b) => a.hour - b.hour)
  return s
}

/**
 * Find the current scheduled state for a given hour.
 * @param {Array<{hour: number, state: string, building_id: *}>} schedule
 * @param {number} hour
 * @returns {{state: string, building_id: *}}
 */
export function getScheduledState(schedule, hour){
  if (!schedule || schedule.length === 0) return { state: 'SLEEPING', building_id: null }
  // Find the last schedule entry whose hour <= current hour
  let result = schedule[0]
  for (const entry of schedule) {
    if (hour >= entry.hour) result = entry
    else break
  }
  return { state: result.state, building_id: result.building_id != null ? result.building_id : null }
}
