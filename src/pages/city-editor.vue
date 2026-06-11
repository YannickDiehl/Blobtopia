<template lang="pug">
.city-editor
  .editor-header
    .brand-group
      router-link.back-btn(to="/s/0", title="Zurück zur Simulation")
        b-icon(icon="arrow-left", size="is-small")
      .brand Blobtopia
      span.header-label Stadt-Editor
      transition(name="fade")
        span.draft-status(v-if="editorStore.draftSavedAt") Entwurf gespeichert · {{ draftTime }}
    .header-actions
      b-button.is-small.is-outlined(@click="onUndo", :disabled="!editorStore.canUndo", title="Rückgängig (Ctrl+Z)")
        b-icon(icon="undo", size="is-small")
      b-button.is-small.is-outlined(@click="onRedo", :disabled="!editorStore.canRedo", title="Wiederholen (Ctrl+Shift+Z)")
        b-icon(icon="redo", size="is-small")
      b-button.is-small.is-outlined(@click="onImport", title="Layout-JSON importieren")
        b-icon(icon="folder-open", size="is-small")
        span Import
      b-button.is-small.is-outlined(@click="onExport", title="Layout-JSON herunterladen")
        b-icon(icon="download", size="is-small")
        span Export
      b-button.is-small.is-outlined(v-if="isDev", @click="onSaveRepo", title="Schreibt data/ + public/blobtopia-city.json (nur Dev-Server)")
        b-icon(icon="content-save", size="is-small")
        span In Repo speichern
      b-button.is-small(:class="editorStore.previewActive ? 'is-warning' : 'is-info'", @click="onPreviewToggle")
        b-icon(:icon="editorStore.previewActive ? 'eye-off' : 'eye'", size="is-small")
        span {{ editorStore.previewActive ? 'Vorschau beenden' : 'In Welt ansehen' }}
      b-button.is-small.is-danger.is-outlined(@click="onReset", title="Auf ausgelieferte Stadt zurücksetzen")
        b-icon(icon="restore", size="is-small")
      b-button.is-small.is-danger.is-outlined(@click="onClearAll", :disabled="editorStore.placements.length === 0", title="Alles löschen")
        b-icon(icon="delete-sweep", size="is-small")

  .editor-body
    //- Palette (links): Werkzeuge + Asset-Katalog
    .palette
      .palette-header
        h3 Werkzeuge
      .palette-section
        .section-items
          .palette-item(:class="{ active: editorStore.tool === 'select' }", @click="setTool('select')")
            .item-preview
              b-icon(icon="cursor-default", size="is-small")
            .item-name Auswählen
          .palette-item(:class="{ active: editorStore.tool === 'road' }", @click="setTool('road')")
            .item-preview.road-tool
              b-icon(icon="road-variant", size="is-small")
            .item-name Straßenzug ziehen
          .palette-item(:class="{ active: editorStore.tool === 'district' }", @click="setTool('district')")
            .item-preview.district-tool
              b-icon(icon="format-paint", size="is-small")
            .item-name Distrikt malen
          .palette-item(:class="{ active: editorStore.tool === 'delete' }", @click="setTool('delete')")
            .item-preview.delete-tool
              b-icon(icon="eraser", size="is-small")
            .item-name Löschen

      //- Distrikt-Auswahl (nur beim Distrikt-Werkzeug)
      transition(name="fade")
        .district-picker(v-if="editorStore.tool === 'district'")
          .district-option(
            v-for="(d, idx) in districts"
            , :key="idx"
            , :class="{ active: editorStore.selectedDistrict === idx }"
            , @click="editorStore.selectedDistrict = idx"
          )
            .district-dot(:style="{ backgroundColor: d.color }")
            span {{ d.name }}
          .district-option(
            :class="{ active: editorStore.selectedDistrict === -1 }"
            , @click="editorStore.selectedDistrict = -1"
          )
            .district-dot(:style="{ backgroundColor: '#666', border: '2px dashed #aaa' }")
            span Radieren

      .palette-header
        h3 Gebäude
        .palette-filter
          b-input(v-model="searchFilter", placeholder="Suchen...", size="is-small", icon="magnify")

      .palette-section(v-for="cat in filteredCategories", :key="cat.name")
        .section-header(@click="toggleCategory(cat.name)")
          span {{ cat.label }}
          span.count ({{ cat.items.length }})
          b-icon(:icon="isOpen(cat) ? 'chevron-up' : 'chevron-down'", size="is-small")
        transition(name="collapse")
          .section-items(v-if="isOpen(cat)")
            .palette-item(
              v-for="item in cat.items"
              , :key="item.model"
              , :class="{ active: editorStore.selectedAsset === item.model }"
              , @click="selectAsset(item.model)"
            )
              .item-preview(:style="{ backgroundColor: item.previewColor }")
                b-icon(:icon="item.icon", size="is-small")
              .item-name {{ item.label }}

    //- 3D-Viewport
    .viewport(ref="viewport")
      canvas(ref="canvas")
      .controls-hint
        span(v-for="(hint, i) in toolHints", :key="i") {{ hint }}
      .placement-info(v-if="hoveredCell")
        span {{ hoveredCell.cx }}, {{ hoveredCell.cz }}
        span(v-if="editorStore.selectedAsset")  | {{ selectedAssetLabel }}

    //- Seitenleiste (rechts): Inspektor + Statistik + Prüfung
    .side-panel
      //- Inspektor
      .panel-section(v-if="selected")
        .panel-title
          span Inspektor
          b-icon.close-btn(icon="close", size="is-small", @click="deselect")
        .field-row
          label Bezeichnung
          input.text-input(:value="selected.label", @change="updateSelected({ label: $event.target.value })")
        .field-row
          label Funktion
          select.select-input(:value="selected.functional_type", @change="updateSelected({ functional_type: $event.target.value })")
            option(v-for="ft in functionalTypes", :key="ft.value", :value="ft.value") {{ ft.label }}
        .field-row
          label Kapazität
            span.hint(v-if="capacityHint")  ({{ capacityHint }})
          input.text-input(type="number", min="0", max="500", :value="selected.capacity", @change="updateSelected({ capacity: Math.max(0, $event.target.value | 0) })")
        .field-row
          label Distrikt
          select.select-input(:value="selected.district", @change="updateSelected({ district: parseInt($event.target.value) }, true)")
            option(:value="-1") Zentrum (kein Distrikt)
            option(v-for="(d, idx) in districts", :key="idx", :value="idx") {{ d.name }}
        .field-actions
          b-button.is-small.is-outlined(@click="onRotateSelected")
            b-icon(icon="rotate-right", size="is-small")
            span Drehen
          b-button.is-small.is-danger.is-outlined(@click="onDeleteSelected")
            b-icon(icon="delete", size="is-small")
            span Löschen

      //- Statistik
      .panel-section
        .panel-title
          span Statistik
        .stat-item
          .stat-label Gebäude
          .stat-value {{ editorStore.placements.length }}
        .stat-item
          .stat-label Funktional
          .stat-value {{ validation.stats.functional }}
        .stat-item(:class="{ bad: validation.stats.housing < validation.stats.population }")
          .stat-label Wohnplätze
          .stat-value {{ validation.stats.housing }} / {{ validation.stats.population }}
        .stat-item
          .stat-label Arbeitsplätze
          .stat-value {{ validation.stats.workplaces }}
        .stat-item
          .stat-label Straßen
          .stat-value {{ validation.stats.roads }}
        .stat-item(v-for="(d, idx) in districts", :key="'s' + idx")
          .stat-label
            .district-dot-sm(:style="{ backgroundColor: d.color }")
            span {{ d.name }}
          .stat-value {{ editorStore.districtCounts[idx] || 0 }}

      //- Prüfung
      .panel-section
        .panel-title
          span Prüfung
        .check-ok(v-if="validation.ok && validation.warnings.length === 0")
          b-icon(icon="check-circle", size="is-small")
          span Simulationstauglich
        .check-item.is-error(v-for="(msg, i) in validation.errors", :key="'e' + i")
          b-icon(icon="alert-circle", size="is-small")
          span {{ msg }}
        .check-item.is-warning(v-for="(msg, i) in validation.warnings", :key="'w' + i")
          b-icon(icon="alert", size="is-small")
          span {{ msg }}
</template>

<script>
import { markRaw } from 'vue'
import { mapStores } from 'pinia'
import { useEditorStore } from '@/stores/editor'
import { EditorScene } from '@/editor/scene'
import { CELL_SIZE } from '@/config/world'
import { CATEGORIES, ASSET_MAP, FUNCTIONAL_TYPES, FUNCTIONAL_MAP } from '@/city/catalog'
import { DISTRICTS } from '@/city/districts'
import { downloadJSON, pickJSONFile, saveToRepo } from '@/editor/io'
import { openToast } from '@/lib/toast'

const TOOL_HINTS = {
  select: ['Klick = Auswählen', 'Ziehen = Verschieben', 'R = Drehen', 'Entf = Löschen', 'Ctrl+Z = Rückgängig']
  , place: ['Klick = Platzieren (Stempel bleibt aktiv)', 'R = Drehen', 'Esc = Beenden']
  , road: ['Ziehen = Straßenzug legen', 'Esc = Beenden']
  , district: ['Klicken/Ziehen = Distrikt malen', 'Esc = Beenden']
  , delete: ['Klick = Löschen', 'Esc = Beenden']
}

export default {
  name: 'CityEditor'
  , data () {
    return {
      hoveredCell: null
      , searchFilter: ''
      , openCategories: { suburban: true }
      , isDev: import.meta.env.DEV
    }
  }
  , computed: {
    ...mapStores(useEditorStore)
    , districts: () => DISTRICTS
    , functionalTypes: () => FUNCTIONAL_TYPES
    , selected () { return this.editorStore.selectedPlacement }
    , validation () { return this.editorStore.validation }
    , toolHints () {
      return ['WASD = Gleiten', 'Scrollrad = Zoom', 'Rechtsklick = Drehen'].concat(TOOL_HINTS[this.editorStore.tool] || [])
    }
    , selectedAssetLabel () {
      const info = ASSET_MAP[this.editorStore.selectedAsset]
      return (info && info.label) || ''
    }
    , capacityHint () {
      if (!this.selected) return ''
      const ft = FUNCTIONAL_MAP[this.selected.functional_type]
      if (!ft) return ''
      if (ft.residential) return 'Wohnplätze'
      if (ft.workplace) return 'Arbeitsplätze'
      return ''
    }
    , draftTime () {
      const d = this.editorStore.draftSavedAt
      return d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''
    }
    , filteredCategories () {
      if (!this.searchFilter) return CATEGORIES
      const q = this.searchFilter.toLowerCase()
      return CATEGORIES
        .map(cat => ({
          ...cat
          , items: cat.items.filter(i => i.label.toLowerCase().includes(q) || i.model.includes(q))
        }))
        .filter(cat => cat.items.length > 0)
    }
  }
  , async mounted () {
    const scene = new EditorScene(this.$refs.canvas, this.$refs.viewport)
    this._scene = markRaw(scene)
    this._placementRotation = 0
    this._dragState = null
    this._districtPainting = false
    this._roadDrag = null

    await this.editorStore.init()
    await scene.rebuildAll(this.editorStore.placements, this.editorStore.districtMap)
    scene.start()

    const canvas = this.$refs.canvas
    canvas.addEventListener('pointermove', this.onPointerMove)
    canvas.addEventListener('pointerdown', this.onPointerDown)
    window.addEventListener('pointerup', this.onPointerUp)
    canvas.addEventListener('click', this.onCanvasClick)
    canvas.addEventListener('contextmenu', this.onContextMenu)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('resize', this.onResize)
  }
  , beforeUnmount () {
    const canvas = this.$refs.canvas
    if (canvas) {
      canvas.removeEventListener('pointermove', this.onPointerMove)
      canvas.removeEventListener('pointerdown', this.onPointerDown)
      canvas.removeEventListener('click', this.onCanvasClick)
      canvas.removeEventListener('contextmenu', this.onContextMenu)
    }
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('resize', this.onResize)
    this._scene.dispose()
  }
  , methods: {
    // ── Werkzeuge / Palette ──────────────────────────────────
    setTool (tool) {
      this.editorStore.tool = tool
      this.editorStore.selectedAsset = null
      this._scene.clearGhost()
      this._scene.clearRoadPreview()
      if (tool !== 'select') this.deselect()
    }
    , selectAsset (model) {
      const info = ASSET_MAP[model]
      this.editorStore.selectedAsset = model
      this.editorStore.tool = 'place'
      this.deselect()
      this._placementRotation = 0
      this._scene.setGhost(model, info && info.type)
    }
    , toggleCategory (name) {
      this.openCategories[name] = !this.openCategories[name]
    }
    , isOpen (cat) {
      return this.searchFilter ? true : !!this.openCategories[cat.name]
    }
    , deselect () {
      this.editorStore.selectedId = null
      this._scene.showSelection(null)
    }

    // ── Szene-Sync-Helfer ────────────────────────────────────
    /** Platzierung + von Auto-Connect geänderte Straßen neu aufbauen. */
    , _syncPlacements (list) {
      const seen = new Set()
      for (const p of list) {
        if (!p || seen.has(p.id)) continue
        seen.add(p.id)
        this._scene.addPlacement(p)
      }
    }
    , async _fullRebuild () {
      this.deselect()
      await this._scene.rebuildAll(this.editorStore.placements, this.editorStore.districtMap)
    }

    // ── Pointer-Events ───────────────────────────────────────
    , onPointerMove (event) {
      const cell = this._scene.pickCell(event)
      if (!cell) return
      this.hoveredCell = cell
      const store = this.editorStore

      if (this._dragState) {
        const { placement, changedRoads } = store.move(this._dragState.placementId, cell.x, cell.z)
        if (placement) {
          this._dragState.didMove = true
          this._scene.updateTransform(placement)
          this._scene.showSelection(placement)
          this._syncPlacements(changedRoads)
        }
        return
      }
      if (this._roadDrag) {
        this._roadDrag.cells = this._cellsForLine(this._roadDrag.start, cell)
        this._scene.showRoadPreview(this._roadDrag.cells)
        return
      }
      if (this._districtPainting && store.tool === 'district') {
        this._paintCell(cell)
        return
      }
      if (store.tool === 'place' && store.selectedAsset) {
        this._scene.moveGhost(cell.x, cell.z, this._placementRotation)
      }
    }

    , onPointerDown (event) {
      if (event.button !== 0) return
      const store = this.editorStore
      const scene = this._scene

      if (store.tool !== 'select') scene.controls.enabled = false

      if (store.tool === 'district') {
        store.snapshot()
        this._districtPainting = true
        const cell = scene.pickCell(event)
        if (cell) this._paintCell(cell)
        return
      }
      if (store.tool === 'road') {
        const cell = scene.pickCell(event)
        if (cell) {
          this._roadDrag = { start: cell, cells: [cell] }
          scene.showRoadPreview(this._roadDrag.cells)
        }
        return
      }
      if (store.tool !== 'select') return

      // Rotations-Ring? (Klick rotiert — im click-Handler)
      if (scene.pickRotateRing(event)) {
        scene.controls.enabled = false
        return
      }
      const id = scene.pickPlacementId(event)
      if (id == null) return // Kamera-Pan erlauben
      const placement = this.editorStore.placements.find(p => p.id === id)
      if (!placement) return
      store.snapshot()
      this._dragState = { placementId: id, didMove: false }
      store.selectedId = id
      scene.showSelection(placement)
      scene.controls.enabled = false
    }

    , onPointerUp () {
      const scene = this._scene
      scene.controls.enabled = true
      this._districtPainting = false

      if (this._roadDrag) {
        const cells = this._roadDrag.cells
        this._roadDrag = null
        scene.clearRoadPreview()
        const { added, changedRoads } = this.editorStore.placeRoadLine(cells)
        this._syncPlacements([...added, ...changedRoads])
        return
      }
      if (this._dragState) {
        const ds = this._dragState
        this._dragState = null
        // Reiner Klick (keine Bewegung): Undo-Snapshot wieder entfernen
        if (!ds.didMove && this.editorStore.undoStack.length) {
          this.editorStore.undoStack.pop()
        }
      }
    }

    , onCanvasClick (event) {
      const store = this.editorStore
      const scene = this._scene
      const cell = scene.pickCell(event)
      if (!cell) return

      if (store.tool === 'place' && store.selectedAsset) {
        const { placement, changedRoads } = store.place({
          model: store.selectedAsset, x: cell.x, z: cell.z, rotation: this._placementRotation
        })
        this._syncPlacements([placement, ...changedRoads])
        // Stempel-Modus: Werkzeug bleibt aktiv
      } else if (store.tool === 'delete') {
        const id = scene.pickPlacementId(event)
        if (id != null) {
          const { removed, changedRoads } = store.removeById(id)
          if (removed) {
            scene.removePlacement(id)
            this._syncPlacements(changedRoads)
          }
        }
      } else if (store.tool === 'select') {
        if (store.selectedId != null && scene.pickRotateRing(event)) {
          this.onRotateSelected()
          return
        }
        const id = scene.pickPlacementId(event)
        store.selectedId = id
        scene.showSelection(id != null ? store.selectedPlacement : null)
      }
    }

    , onContextMenu (event) {
      event.preventDefault()
    }

    , _paintCell (cell) {
      const affected = this.editorStore.paintDistrict(cell.cx, cell.cz, this.editorStore.selectedDistrict)
      if (affected) {
        this._scene.buildGround(this.editorStore.districtMap)
        this._syncPlacements(affected) // Re-Tint im neuen Distrikt
      }
    }

    /** L-förmiger Straßenzug: erst entlang x, dann entlang z. */
    , _cellsForLine (a, b) {
      const cells = []
      const stepX = a.cx <= b.cx ? 1 : -1
      for (let cx = a.cx; cx !== b.cx + stepX; cx += stepX) cells.push(this._mkCell(cx, a.cz))
      const stepZ = a.cz <= b.cz ? 1 : -1
      for (let cz = a.cz + stepZ; stepZ > 0 ? cz <= b.cz : cz >= b.cz; cz += stepZ) cells.push(this._mkCell(b.cx, cz))
      return cells
    }
    , _mkCell (cx, cz) {
      return { cx, cz, x: cx * CELL_SIZE + CELL_SIZE / 2, z: cz * CELL_SIZE + CELL_SIZE / 2 }
    }

    // ── Tastatur ─────────────────────────────────────────────
    , onKeyDown (e) {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      this._scene._keys[e.key.toLowerCase()] = true

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) this.onRedo()
        else this.onUndo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        this.onRedo()
        return
      }
      if (e.key === 'Escape') {
        this.setTool('select')
        return
      }
      if (e.key.toLowerCase() === 'r') {
        if (this.editorStore.tool === 'place') {
          this._placementRotation = (this._placementRotation + Math.PI / 2) % (Math.PI * 2)
          this._scene.ghostGroup.rotation.y = this._placementRotation
        } else if (this.selected) {
          this.onRotateSelected()
        }
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.selected) {
        e.preventDefault()
        this.onDeleteSelected()
      }
    }
    , onKeyUp (e) {
      this._scene._keys[e.key.toLowerCase()] = false
    }

    // ── Aktionen ─────────────────────────────────────────────
    , onRotateSelected () {
      if (!this.selected) return
      const p = this.editorStore.rotate(this.selected.id)
      if (p) this._scene.updateTransform(p)
    }
    , onDeleteSelected () {
      if (!this.selected) return
      const { removed, changedRoads } = this.editorStore.removeById(this.selected.id)
      if (removed) {
        this._scene.removePlacement(removed.id)
        this._scene.showSelection(null)
        this._syncPlacements(changedRoads)
      }
    }
    , updateSelected (fields, retint = false) {
      if (!this.selected) return
      const p = this.editorStore.updatePlacement(this.selected.id, fields)
      if (p && retint) this._scene.addPlacement(p)
    }
    , async onUndo () {
      if (this.editorStore.undo()) await this._fullRebuild()
    }
    , async onRedo () {
      if (this.editorStore.redo()) await this._fullRebuild()
    }

    // ── IO ───────────────────────────────────────────────────
    , onExport () {
      downloadJSON(this.editorStore.exportData())
      openToast({ message: 'Layout exportiert — für die Pipeline nach data/blobtopia-city.json legen.', type: 'is-success' })
    }
    , async onImport () {
      try {
        const data = await pickJSONFile()
        if (!data) return
        if (!Array.isArray(data.placements)) throw new Error('keine placements')
        this.editorStore.applyLayout(data, 'file')
        await this._fullRebuild()
        openToast({ message: `Layout geladen (${data.placements.length} Platzierungen)`, type: 'is-success' })
      } catch (_err) {
        openToast({ message: 'Fehler beim Laden der Datei', type: 'is-danger' })
      }
    }
    , async onSaveRepo () {
      try {
        const res = await saveToRepo(this.editorStore.exportData())
        openToast({ message: `Gespeichert: ${(res.written || []).join(' + ')}`, type: 'is-success', duration: 5000 })
      } catch (err) {
        openToast({ message: 'Speichern fehlgeschlagen: ' + err.message, type: 'is-danger' })
      }
    }
    , onPreviewToggle () {
      const store = this.editorStore
      if (store.previewActive) {
        store.closePreview()
        openToast({ message: 'Vorschau beendet — die Welt zeigt wieder die Standard-Stadt.', type: 'is-info' })
      } else if (store.openPreview()) {
        this.$router.push({ name: 'simulation', params: { generationIndex: 0 } })
      } else {
        openToast({ message: 'Vorschau konnte nicht gespeichert werden (localStorage voll?)', type: 'is-danger' })
      }
    }
    , async onReset () {
      if (!window.confirm('Entwurf verwerfen und ausgelieferte Stadt laden?')) return
      await this.editorStore.resetToShipped()
      await this._fullRebuild()
    }
    , async onClearAll () {
      if (!window.confirm('Alle Gebäude und Distrikte löschen?')) return
      this.editorStore.clearAll()
      await this._fullRebuild()
    }
    , onResize () {
      this._scene.resize()
    }
  }
}
</script>

<style lang="sass" scoped>
.city-editor
  position: fixed
  top: 0
  left: 0
  right: 0
  bottom: 0
  display: flex
  flex-direction: column
  background: $grey-darker
  color: $grey-lighter

.editor-header
  display: flex
  align-items: center
  gap: 1rem
  padding: 0.5rem 1rem
  background: rgba(0, 0, 0, 0.5)
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  z-index: 10
  flex-shrink: 0

  .brand-group
    display: flex
    align-items: center
    gap: 0.5rem

  .back-btn
    color: $grey
    display: flex
    align-items: center
    &:hover
      color: $primary

  .brand
    font-size: 22px
    font-weight: 700
    color: $primary

  .header-label
    font-size: 14px
    color: $grey
    font-weight: 600
    text-transform: uppercase
    letter-spacing: 1px

  .draft-status
    font-size: 0.7rem
    color: $grey

  .header-actions
    margin-left: auto
    display: flex
    gap: 0.4rem

.editor-body
  display: flex
  flex: 1
  min-height: 0

.palette
  width: 240px
  background: rgba(0, 0, 0, 0.4)
  border-right: 1px solid rgba(255, 255, 255, 0.08)
  overflow-y: auto
  flex-shrink: 0

  .palette-header
    padding: 0.75rem
    border-bottom: 1px solid rgba(255, 255, 255, 0.08)
    h3
      font-size: 0.9rem
      font-weight: 600
      margin-bottom: 0.5rem
    .palette-filter
      margin-top: 0.3rem

  .palette-section
    border-bottom: 1px solid rgba(255, 255, 255, 0.05)

  .section-header
    display: flex
    align-items: center
    gap: 0.5rem
    padding: 0.5rem 0.75rem
    cursor: pointer
    font-size: 0.8rem
    font-weight: 600
    color: $grey-light
    transition: background 0.15s
    &:hover
      background: rgba(255, 255, 255, 0.05)
    .count
      color: $grey
      font-weight: normal
      font-size: 0.7rem
    .icon
      margin-left: auto

  .section-items
    padding: 0.25rem 0

  .palette-item
    display: flex
    align-items: center
    gap: 0.5rem
    padding: 0.35rem 0.75rem
    cursor: pointer
    transition: background 0.15s
    &:hover
      background: rgba(255, 255, 255, 0.08)
    &.active
      background: rgba($primary, 0.2)
      border-left: 3px solid $primary

    .item-preview
      width: 28px
      height: 28px
      border-radius: 4px
      display: flex
      align-items: center
      justify-content: center
      flex-shrink: 0
      &.delete-tool
        background: rgba(231, 76, 60, 0.3)
      &.district-tool
        background: rgba(78, 204, 163, 0.3)
      &.road-tool
        background: rgba(120, 120, 120, 0.4)

    .item-name
      font-size: 0.75rem
      white-space: nowrap
      overflow: hidden
      text-overflow: ellipsis

.district-picker
  padding: 0.5rem 0.75rem

  .district-option
    display: flex
    align-items: center
    gap: 0.5rem
    padding: 0.35rem 0.5rem
    cursor: pointer
    border-radius: 4px
    font-size: 0.8rem
    transition: background 0.15s
    &:hover
      background: rgba(255, 255, 255, 0.08)
    &.active
      background: rgba(255, 255, 255, 0.12)
      font-weight: 600

  .district-dot
    width: 12px
    height: 12px
    border-radius: 50%
    flex-shrink: 0

.viewport
  flex: 1
  position: relative
  min-width: 0
  canvas
    width: 100%
    height: 100%
    display: block

  .controls-hint
    position: absolute
    top: 0.5rem
    left: 50%
    transform: translateX(-50%)
    background: rgba(0, 0, 0, 0.6)
    backdrop-filter: blur(4px)
    padding: 0.25rem 0.75rem
    border-radius: 4px
    font-size: 0.7rem
    color: $grey
    display: flex
    gap: 0.6rem
    white-space: nowrap
    pointer-events: none

  .placement-info
    position: absolute
    bottom: 0.75rem
    left: 0.75rem
    background: rgba(0, 0, 0, 0.7)
    backdrop-filter: blur(4px)
    padding: 0.3rem 0.6rem
    border-radius: 4px
    font-size: 0.75rem
    color: $grey-light

.side-panel
  width: 260px
  background: rgba(0, 0, 0, 0.3)
  border-left: 1px solid rgba(255, 255, 255, 0.08)
  overflow-y: auto
  flex-shrink: 0

  .panel-section
    padding: 0.75rem
    border-bottom: 1px solid rgba(255, 255, 255, 0.08)

  .panel-title
    display: flex
    align-items: center
    justify-content: space-between
    font-size: 0.8rem
    font-weight: 700
    text-transform: uppercase
    letter-spacing: 0.5px
    color: $grey-light
    margin-bottom: 0.5rem
    .close-btn
      cursor: pointer
      color: $grey
      &:hover
        color: $grey-lighter

  .field-row
    margin-bottom: 0.5rem
    label
      display: block
      font-size: 0.7rem
      color: $grey
      margin-bottom: 0.15rem
      .hint
        font-style: italic

  .text-input, .select-input
    width: 100%
    background: rgba(255, 255, 255, 0.08)
    border: 1px solid rgba(255, 255, 255, 0.15)
    border-radius: 4px
    color: $grey-lighter
    font-size: 0.8rem
    padding: 0.3rem 0.5rem
    &:focus
      outline: none
      border-color: $primary
    option
      background: $grey-darker

  .field-actions
    display: flex
    gap: 0.3rem
    margin-top: 0.5rem

  .stat-item
    display: flex
    justify-content: space-between
    align-items: center
    padding: 0.3rem 0
    font-size: 0.75rem
    border-bottom: 1px solid rgba(255, 255, 255, 0.05)
    &:last-child
      border-bottom: none
    &.bad .stat-value
      color: #e74c3c

  .stat-label
    display: flex
    align-items: center
    gap: 0.3rem
    color: $grey

  .stat-value
    font-weight: 600

  .district-dot-sm
    width: 8px
    height: 8px
    border-radius: 50%
    flex-shrink: 0

  .check-ok
    display: flex
    align-items: center
    gap: 0.4rem
    font-size: 0.8rem
    color: #4ecca3

  .check-item
    display: flex
    align-items: flex-start
    gap: 0.4rem
    font-size: 0.72rem
    padding: 0.25rem 0
    line-height: 1.3
    &.is-error
      color: #e74c3c
    &.is-warning
      color: #f0c929
    .icon
      flex-shrink: 0
      margin-top: 1px

// Transitions
.collapse-enter-active, .collapse-leave-active
  transition: max-height 0.2s ease, opacity 0.2s ease
  max-height: 500px
  overflow: hidden
.collapse-enter-from, .collapse-leave-to
  max-height: 0
  opacity: 0

.fade-enter-active, .fade-leave-active
  transition: opacity 0.2s
.fade-enter-from, .fade-leave-to
  opacity: 0
</style>
