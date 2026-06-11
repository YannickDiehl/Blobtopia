/**
 * Pinia-Store des Stadt-Editors — reine Daten + Undo/Redo + IO.
 *
 * Kennt kein Three.js: city-editor.vue ist der Controller und synchronisiert
 * die EditorScene nach jeder Aktion (die Aktionen geben dafür die betroffenen
 * Platzierungen zurück, z. B. Straßen, deren Tile-Typ Auto-Connect geändert hat).
 */
import { defineStore } from 'pinia'
import { CELL_SIZE } from '@/config/world'
import { ASSET_MAP, TYPE_TO_FUNCTIONAL, FUNCTIONAL_MAP } from '@/city/catalog'
import { autoConnectRoads } from '@/lib/road-auto-connect'
import { computeValidation, fetchPopulation } from '@/editor/validation'
import { DATA_BASE } from '@/config/api'
import {
  buildLayoutData, saveDraft, loadDraft, clearDraft
  , setPreview, clearPreview, isPreviewActive, loadShippedLayout,
} from '@/editor/io'

const UNDO_LIMIT = 50
const AUTOSAVE_MS = 800

export const useEditorStore = defineStore('editor', {
  state: () => ({
    placements: []
    , districtMap: {}
    , nextId: 1
    , tool: 'select' // 'select' | 'place' | 'delete' | 'district' | 'road'
    , selectedAsset: null
    , selectedDistrict: 0
    , selectedId: null
    , undoStack: []
    , redoStack: []
    , population: 500
    , previewActive: false
    , draftSavedAt: null
    , loadedFrom: null // 'draft' | 'shipped' | 'file'
  })

  , getters: {
    selectedPlacement: state => state.placements.find(p => p.id === state.selectedId) || null
    , districtCounts: state => {
      const counts = {}
      for (const p of state.placements) {
        if (p.district != null && p.district >= 0) counts[p.district] = (counts[p.district] || 0) + 1
      }
      return counts
    }
    , validation: state => computeValidation({ placements: state.placements, population: state.population })
    , canUndo: state => state.undoStack.length > 0
    , canRedo: state => state.redoStack.length > 0
  }

  , actions: {
    // ── Initialisierung ───────────────────────────────────────
    async init () {
      this.previewActive = isPreviewActive()
      this.population = await fetchPopulation(DATA_BASE)
      const draft = loadDraft()
      if (draft) {
        this.applyLayout(draft, 'draft')
        return
      }
      try {
        this.applyLayout(await loadShippedLayout(), 'shipped')
      } catch (_e) {
        this.applyLayout({ placements: [], districtMap: {} }, 'shipped')
      }
    }

    , applyLayout (data, source) {
      this.placements = data.placements || []
      this.districtMap = data.districtMap || {}
      let maxId = 0
      for (const p of this.placements) { if (p.id > maxId) maxId = p.id }
      this.nextId = maxId + 1
      this.selectedId = null
      this.undoStack = []
      this.redoStack = []
      this.loadedFrom = source
      if (source !== 'draft') this._scheduleAutosave()
    }

    // ── Undo / Redo (Snapshots) ───────────────────────────────
    , snapshot () {
      this.undoStack.push(JSON.stringify({
        placements: this.placements, districtMap: this.districtMap, nextId: this.nextId
      }))
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift()
      this.redoStack = []
    }

    , _restore (raw) {
      const state = JSON.parse(raw)
      this.placements = state.placements || []
      this.districtMap = state.districtMap || {}
      this.nextId = state.nextId || 1
      this.selectedId = null
      this._scheduleAutosave()
    }

    , undo () {
      if (!this.undoStack.length) return false
      this.redoStack.push(JSON.stringify({
        placements: this.placements, districtMap: this.districtMap, nextId: this.nextId
      }))
      this._restore(this.undoStack.pop())
      return true
    }

    , redo () {
      if (!this.redoStack.length) return false
      this.undoStack.push(JSON.stringify({
        placements: this.placements, districtMap: this.districtMap, nextId: this.nextId
      }))
      this._restore(this.redoStack.pop())
      return true
    }

    // ── Platzieren / Löschen / Bewegen ────────────────────────
    /** Legt eine Platzierung an. Gibt { placement, changedRoads } zurück. */
    , place ({ model, x, z, rotation = 0 }) {
      this.snapshot()
      const info = ASSET_MAP[model] || { type: 'building', label: model }
      const placement = {
        id: this.nextId++
        , model
        , x
        , z
        , rotation
        , scale: 1
        , type: info.type
        , district: this._districtAtWorld(x, z)
        , label: info.label
        , functional_type: TYPE_TO_FUNCTIONAL[info.type] || 'decoration'
        , capacity: (FUNCTIONAL_MAP[TYPE_TO_FUNCTIONAL[info.type]] || {}).defaultCapacity || 0
      }
      this.placements.push(placement)
      const changedRoads = placement.type === 'road' ? this._autoConnect() : []
      this._scheduleAutosave()
      return { placement, changedRoads }
    }

    /** Straßenzug (Linien-Werkzeug): mehrere Zellen in EINEM Undo-Schritt. */
    , placeRoadLine (cells) {
      const occupied = new Set(this.placements
        .filter(p => p.type === 'road')
        .map(p => `${Math.floor(p.x / CELL_SIZE)},${Math.floor(p.z / CELL_SIZE)}`))
      const fresh = cells.filter(c => !occupied.has(`${c.cx},${c.cz}`))
      if (!fresh.length) return { added: [], changedRoads: [] }
      this.snapshot()
      const added = []
      for (const c of fresh) {
        const placement = {
          id: this.nextId++
          , model: 'road-straight'
          , x: c.x
          , z: c.z
          , rotation: 0
          , scale: 1
          , type: 'road'
          , district: this._districtAtWorld(c.x, c.z)
          , label: 'Gerade'
          , functional_type: 'road'
          , capacity: 0
        }
        this.placements.push(placement)
        added.push(placement)
      }
      const changedRoads = this._autoConnect()
      this._scheduleAutosave()
      // added-Einträge können auch in changedRoads stecken — Controller dedupliziert
      return { added, changedRoads }
    }

    /** Gibt { removed, changedRoads } zurück (removed = null wenn nichts da). */
    , removeById (id, { withUndo = true } = {}) {
      const removed = this.placements.find(p => p.id === id)
      if (!removed) return { removed: null, changedRoads: [] }
      if (withUndo) this.snapshot()
      this.placements = this.placements.filter(p => p.id !== id)
      if (this.selectedId === id) this.selectedId = null
      const changedRoads = removed.type === 'road' ? this._autoConnect() : []
      this._scheduleAutosave()
      return { removed, changedRoads }
    }

    /** Bewegt eine Platzierung (Undo-Snapshot macht der Controller beim Drag-Start). */
    , move (id, x, z) {
      const p = this.placements.find(pl => pl.id === id)
      if (!p || (p.x === x && p.z === z)) return { placement: null, changedRoads: [] }
      p.x = x
      p.z = z
      p.district = this._districtAtWorld(x, z)
      const changedRoads = p.type === 'road' ? this._autoConnect() : []
      this._scheduleAutosave()
      return { placement: p, changedRoads }
    }

    , rotate (id) {
      const p = this.placements.find(pl => pl.id === id)
      if (!p) return null
      this.snapshot()
      p.rotation = (p.rotation || 0) + Math.PI / 2
      this._scheduleAutosave()
      return p
    }

    /** Inspektor-Änderungen (label, functional_type, capacity, district …). */
    , updatePlacement (id, fields) {
      const p = this.placements.find(pl => pl.id === id)
      if (!p) return null
      this.snapshot()
      Object.assign(p, fields)
      this._scheduleAutosave()
      return p
    }

    , clearAll () {
      this.snapshot()
      this.placements = []
      this.districtMap = {}
      this.selectedId = null
      this._scheduleAutosave()
    }

    // ── Distrikt malen ────────────────────────────────────────
    /** Gibt die Platzierungen der Zelle zurück (für Re-Tint), oder null wenn unverändert. */
    , paintDistrict (cx, cz, districtIdx) {
      const key = `${cx},${cz}`
      if (districtIdx === -1) {
        if (this.districtMap[key] == null) return null
        delete this.districtMap[key]
      } else {
        if (this.districtMap[key] === districtIdx) return null
        this.districtMap[key] = districtIdx
      }
      const affected = this.placements.filter(p =>
        Math.floor(p.x / CELL_SIZE) === cx && Math.floor(p.z / CELL_SIZE) === cz)
      for (const p of affected) p.district = districtIdx === -1 ? -1 : districtIdx
      this._scheduleAutosave()
      return affected
    }

    , _districtAtWorld (x, z) {
      const key = `${Math.floor(x / CELL_SIZE)},${Math.floor(z / CELL_SIZE)}`
      const d = this.districtMap[key]
      return d != null ? d : -1
    }

    // ── Auto-Connect (Straßen) ────────────────────────────────
    /** Läuft über alle Straßen, gibt die GEÄNDERTEN Platzierungen zurück. */
    , _autoConnect () {
      const before = new Map()
      for (const p of this.placements) {
        if (p.type === 'road') before.set(p.id, p.model + '|' + p.rotation)
      }
      autoConnectRoads(this.placements, CELL_SIZE)
      const changed = []
      for (const p of this.placements) {
        if (p.type === 'road' && before.get(p.id) !== p.model + '|' + p.rotation) changed.push(p)
      }
      return changed
    }

    // ── Persistenz ────────────────────────────────────────────
    , exportData () {
      return buildLayoutData(this.placements, this.districtMap)
    }

    , _scheduleAutosave () {
      if (this._autosaveTimer) clearTimeout(this._autosaveTimer)
      this._autosaveTimer = setTimeout(() => {
        if (saveDraft(this.exportData())) this.draftSavedAt = new Date()
      }, AUTOSAVE_MS)
    }

    , async resetToShipped () {
      clearDraft()
      this.applyLayout(await loadShippedLayout(), 'shipped')
    }

    , openPreview () {
      if (setPreview(this.exportData())) this.previewActive = true
      return this.previewActive
    }

    , closePreview () {
      clearPreview()
      this.previewActive = false
    }
  }
})
