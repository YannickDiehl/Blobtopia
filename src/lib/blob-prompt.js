/**
 * src/lib/blob-prompt.js
 *
 * Shared helpers for assembling a blob's LLM persona-prompt context:
 *   - getBlobStatic(id):        the static blob record (sg) from blobs-static.json
 *   - getChangeSummary(id,tick): nearest "recent changes" narrative at/before tick
 *   - resolveActivity(state,blob): current activity + hour from the daily schedule
 *
 * Extracted from src/store/chat.js so the chat interview and the survey
 * institute share one implementation (and one cache). The actual persona text
 * is assembled by src/lib/build-system-prompt.js (the canonical builder).
 */
import { DATA_BASE } from '@/config/api'

// Loaded once, then cached for the session.
let blobStaticMap = null
let changeSummaries = null

export async function getBlobStatic(blobId) {
  if (!blobStaticMap) {
    try {
      const res = await fetch(DATA_BASE + '/blobs-static.json')
      const data = await res.json()
      blobStaticMap = {}
      for (const g of data) { blobStaticMap[g.id] = g }
    } catch (e) {
      console.warn('Failed to load blob static data:', e)
      return null
    }
  }
  return blobStaticMap[blobId] || null
}

export async function getChangeSummary(blobId, tick) {
  if (!changeSummaries) {
    try {
      const res = await fetch(DATA_BASE + '/change-summaries.json')
      changeSummaries = await res.json()
    } catch (e) {
      console.warn('Failed to load change summaries:', e)
      changeSummaries = {}
    }
  }
  const entries = changeSummaries[blobId]
  if (!entries || entries.length === 0) return null
  // Nearest summary at or before the current tick.
  let best = null
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].tick <= tick) best = entries[i]
    else break
  }
  return best ? best.summary : null
}

export function resolveActivity(rootState, blob) {
  const hour = rootState.simulation.hour != null ? rootState.simulation.hour : 14
  const schedule = (blob && blob.server_schedule) || null
  let activity = 'Leisure'
  if (schedule && schedule.entries) {
    for (let i = schedule.entries.length - 1; i >= 0; i--) {
      if (hour >= schedule.entries[i].hour) {
        activity = schedule.entries[i].activity
        break
      }
    }
  }
  return { activity: activity, hour: hour }
}
