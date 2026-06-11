<template lang="pug">
.city-editor
  .editor-header
    .brand-group
      router-link.back-btn(to="/s/0", title="Zurück zur Simulation")
        b-icon(icon="arrow-left", size="is-small")
      .brand Blobtopia
      span.header-label Stadt-Editor
    .header-actions
      b-button.is-small.is-outlined(@click="clearAll", :disabled="placements.length === 0")
        b-icon(icon="delete-sweep", size="is-small")
        span Alles löschen
      b-button.is-small.is-outlined(@click="loadLayout")
        b-icon(icon="folder-open", size="is-small")
        span Laden
      b-button.is-small.is-primary(@click="saveLayout")
        b-icon(icon="content-save", size="is-small")
        span Speichern
      b-button.is-small.is-success(@click="startSimulation", :disabled="placements.length === 0")
        b-icon(icon="play", size="is-small")
        span Simulation starten

  .editor-body
    //- Asset palette (left sidebar)
    .palette
      .palette-header
        h3 Gebäude
        .palette-filter
          b-input(v-model="searchFilter", placeholder="Suchen...", size="is-small", icon="magnify")

      .palette-section(v-for="cat in filteredCategories", :key="cat.name")
        .section-header(@click="cat.open = !cat.open")
          span {{ cat.label }}
          span.count ({{ cat.items.length }})
          b-icon(:icon="cat.open ? 'chevron-up' : 'chevron-down'", size="is-small")
        transition(name="collapse")
          .section-items(v-if="cat.open")
            .palette-item(
              v-for="item in cat.items"
              , :key="item.model"
              , :class="{ active: selectedAsset === item.model }"
              , @click="selectAsset(item.model)"
            )
              .item-preview(:style="{ backgroundColor: item.previewColor }")
                b-icon(:icon="item.icon", size="is-small")
              .item-name {{ item.label }}

      .palette-section
        .section-header
          span Werkzeuge
        .section-items
          .palette-item(:class="{ active: tool === 'select' }", @click="tool = 'select'")
            .item-preview
              b-icon(icon="cursor-default", size="is-small")
            .item-name Auswählen
          .palette-item(:class="{ active: tool === 'delete' }", @click="tool = 'delete'")
            .item-preview.delete-tool
              b-icon(icon="eraser", size="is-small")
            .item-name Löschen
          .palette-item(:class="{ active: tool === 'district' }", @click="tool = 'district'")
            .item-preview.district-tool
              b-icon(icon="format-paint", size="is-small")
            .item-name Distrikt malen

      //- District picker (when district tool is active)
      transition(name="fade")
        .district-picker(v-if="tool === 'district'")
          .district-option(
            v-for="(d, idx) in districts"
            , :key="idx"
            , :class="{ active: selectedDistrict === idx }"
            , @click="selectedDistrict = idx"
          )
            .district-dot(:style="{ backgroundColor: d.color }")
            span {{ d.name }}
          .district-option(
            :class="{ active: selectedDistrict === -1 }"
            , @click="selectedDistrict = -1"
          )
            .district-dot(:style="{ backgroundColor: '#666', border: '2px dashed #aaa' }")
            span Löschen

    //- 3D viewport
    .viewport(ref="viewport")
      canvas(ref="canvas")
      //- Controls hint
      .controls-hint
        span WASD/Pfeiltasten = Gleiten
        span |
        span Scrollrad = Zoom
        span |
        span Rechtsklick = Kamera drehen
        span |
        span Linksklick = Gleiten
        span |
        span Ctrl+Z = Rückgängig
        span(v-if="tool === 'place'") &nbsp;|&nbsp;
          b R
          span &nbsp;= Gebäude rotieren
        span(v-if="tool === 'select'") &nbsp;|&nbsp;
          span Ziehen = verschieben
          span &nbsp;|&nbsp;
          b R
          span &nbsp;/ Pfeil = rotieren

      //- Placement info overlay
      .placement-info(v-if="hoveredCell")
        span {{ hoveredCell.x }}, {{ hoveredCell.z }}
        span(v-if="selectedAsset") &nbsp;| {{ selectedAssetLabel }}

      //- Selected building info
      .selection-info(v-if="selectedPlacement")
        .sel-header
          span {{ selectedPlacement.label }}
          b-icon.close-btn(icon="close", size="is-small", @click="selectedPlacement = null")
        .sel-actions
          b-button.is-small.is-outlined(@click="rotatePlacement")
            b-icon(icon="rotate-right", size="is-small")
            span Drehen
          b-button.is-small.is-danger.is-outlined(@click="deletePlacement")
            b-icon(icon="delete", size="is-small")
            span Löschen

    //- Stats sidebar (right)
    .stats-bar
      .stat-item
        .stat-label Gebäude
        .stat-value {{ placements.length }}
      .stat-item(v-for="(d, idx) in districts", :key="'s' + idx")
        .stat-label
          .district-dot-sm(:style="{ backgroundColor: d.color }")
          span {{ d.name }}
        .stat-value {{ districtCounts[idx] || 0 }}
</template>

<script>
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { autoConnectRoads } from '../lib/road-auto-connect'
import { GRID_SIZE, CELL_SIZE as CFG_CELL_SIZE } from '@/config/world'

const GRID = GRID_SIZE
const CELL_SIZE = CFG_CELL_SIZE
const CELLS = Math.floor(GRID / CELL_SIZE)

const DISTRICTS = [
  { name: 'Grüntal', color: '#4ecca3', groundColor: [0.43, 0.81, 0.62] }
  , { name: 'Sonnenberg', color: '#f0c929', groundColor: [0.91, 0.77, 0.28] }
  , { name: 'Hafenviertel', color: '#5c9ded', groundColor: [0.49, 0.70, 0.88] }
  , { name: 'Mittelfeld', color: '#f09a40', groundColor: [0.94, 0.64, 0.31] }
  , { name: 'Industriezone', color: '#999999', groundColor: [0.65, 0.65, 0.65] }
]

// Asset catalog organized by category
const ASSET_CATEGORIES = [
  {
    name: 'suburban', label: 'Wohnhäuser (Villen)', open: true, items: [
      ...['a','b','c','d','e','f','g','h','i','j'].map(l => ({
        model: `suburban-building-type-${l}`, label: `Villa ${l.toUpperCase()}`
        ,icon: 'home', previewColor: '#c8dcc8', type: 'villa', scale: 37
      }))
      , ...['m','n','o'].map(l => ({
        model: `suburban-building-type-${l}`, label: `Villa ${l.toUpperCase()}`
        ,icon: 'home', previewColor: '#c8dcc8', type: 'villa', scale: 37
      }))
      , ...['r','s','t','u'].map(l => ({
        model: `suburban-building-type-${l}`, label: `Villa ${l.toUpperCase()}`
        ,icon: 'home', previewColor: '#c8dcc8', type: 'villa', scale: 37
      }))
      , { model: 'building-garage', label: 'Garage', icon: 'garage', previewColor: '#b0b0a0', type: 'villa', scale: 37 }
    ]
  }
  , {
    name: 'rowhouse', label: 'Reihenhäuser', open: false, items: [
      ...['k','l','p','q'].map(l => ({
        model: `suburban-building-type-${l}`, label: `Reihenhaus ${l.toUpperCase()}`
        ,icon: 'home-group', previewColor: '#e8d4a0', type: 'rowhouse', scale: 28
      }))
      ,...['a','b','c','d'].map(l => ({
        model: `building-small-${l}`, label: `Kleingebäude ${l.toUpperCase()}`
        ,icon: 'home-group', previewColor: '#d4c088', type: 'rowhouse', scale: 28
      }))
    ]
  }
  , {
    name: 'apartment', label: 'Mehrfamilienhäuser', open: false, items: [
      ...['j','l','m'].map(l => ({
        model: `commercial-building-${l}`, label: `Mehrfamilienhaus ${l.toUpperCase()}`
        ,icon: 'home-city', previewColor: '#b8c0d0', type: 'apartment', scale: 30
      }))
    ]
  }
  , {
    name: 'commercial', label: 'Gewerbe / Büros', open: false, items: [
      ...['a','b','c','d','e','f','g','h','i','k','n'].map(l => ({
        model: `commercial-building-${l}`, label: `Gewerbe ${l.toUpperCase()}`
        ,icon: 'office-building', previewColor: '#a0b0c0', type: 'office', scale: 30
      }))
    ]
  }
  , {
    name: 'skyscraper', label: 'Hochhäuser / Fabriken', open: false, items: [
      ...['a','b','c','d','e'].map(l => ({
        model: `commercial-building-skyscraper-${l}`, label: `Hochhaus ${l.toUpperCase()}`
        ,icon: 'city', previewColor: '#888', type: 'factory', scale: 28
      }))
      ,...['a','b'].map(l => ({
        model: `commercial-low-detail-building-wide-${l}`, label: `Fabrik ${l.toUpperCase()}`
        ,icon: 'factory', previewColor: '#777', type: 'factory', scale: 28
      }))
    ]
  }
  , {
    name: 'roads', label: 'Straßen', open: false, items: [
      { model: 'road-straight', label: 'Gerade', icon: 'road', previewColor: '#555', type: 'road', scale: 32 }
      , { model: 'road-straight-lightposts', label: 'Gerade (Laternen)', icon: 'road', previewColor: '#555', type: 'road', scale: 32 }
      , { model: 'road-intersection', label: 'Kreuzung', icon: 'road', previewColor: '#555', type: 'road', scale: 32 }
      , { model: 'road-corner', label: 'Kurve', icon: 'road', previewColor: '#555', type: 'road', scale: 32 }
      , { model: 'road-split', label: 'T-Kreuzung', icon: 'road', previewColor: '#555', type: 'road', scale: 32 }
    ]
  }
  , {
    name: 'fantasy', label: 'Fantasy Altstadt', open: false, items: [
      { model: 'fantasy-windmill', label: 'Windmühle', icon: 'weather-windy', previewColor: '#8B6914', type: 'building', scale: 24 }
      , { model: 'fantasy-watermill', label: 'Wassermühle', icon: 'water', previewColor: '#5B4513', type: 'building', scale: 24 }
      , { model: 'fantasy-stall', label: 'Marktstand', icon: 'store', previewColor: '#C8A070', type: 'building', scale: 22 }
      , { model: 'fantasy-stall-green', label: 'Marktstand (grün)', icon: 'store', previewColor: '#4a7c59', type: 'building', scale: 22 }
      , { model: 'fantasy-stall-red', label: 'Marktstand (rot)', icon: 'store', previewColor: '#8B2500', type: 'building', scale: 22 }
      , { model: 'fantasy-fountain-round-detail', label: 'Rundbrunnen', icon: 'fountain', previewColor: '#7ec8e3', type: 'deco', scale: 16 }
      , { model: 'fantasy-cart', label: 'Wagen', icon: 'truck', previewColor: '#8B6914', type: 'deco', scale: 14 }
      , { model: 'fantasy-lantern', label: 'Laterne', icon: 'lamp', previewColor: '#D4A520', type: 'deco', scale: 14 }
      , { model: 'fantasy-hedge', label: 'Hecke', icon: 'tree', previewColor: '#2d6b3e', type: 'deco', scale: 14 }
      , { model: 'fantasy-tree', label: 'Fantasy-Baum', icon: 'tree', previewColor: '#3a7a3a', type: 'deco', scale: 16 }
      , { model: 'fantasy-tree-high', label: 'Hoher Fantasy-Baum', icon: 'tree', previewColor: '#2d5a2e', type: 'deco', scale: 16 }
      , { model: 'fantasy-banner-green', label: 'Banner (grün)', icon: 'flag', previewColor: '#4a7c59', type: 'deco', scale: 14 }
      , { model: 'fantasy-banner-red', label: 'Banner (rot)', icon: 'flag', previewColor: '#8B2500', type: 'deco', scale: 14 }
      , { model: 'fantasy-wall-arch', label: 'Torbogen', icon: 'arch', previewColor: '#8B7355', type: 'deco', scale: 22 }
      , { model: 'fantasy-fence', label: 'Zaun', icon: 'fence', previewColor: '#8B6914', type: 'deco', scale: 14 }
    ]
  }
  , {
    name: 'industrial', label: 'Industriegebäude', open: false, items: [
      ...['a','b','c','d','e','f','g','h','i','j','k','l','m','n','o','p','q','r','s','t'].map(l => ({
        model: `industrial-building-${l}`, label: `Industrie ${l.toUpperCase()}`
        ,icon: 'factory', previewColor: '#6a6a6a', type: 'factory', scale: 28
      }))
      , ...['a','b','c','d','e','f','g','h','i','j','k','l','m','n'].map(l => ({
        model: `commercial-low-detail-building-${l}`, label: `Lagerhalle ${l.toUpperCase()}`
        ,icon: 'warehouse', previewColor: '#8a8a8a', type: 'factory', scale: 28
      }))
      , ...['a','b'].map(l => ({
        model: `commercial-low-detail-building-wide-${l}`, label: `Fabrikhalle ${l.toUpperCase()}`
        ,icon: 'warehouse', previewColor: '#7a7a7a', type: 'factory', scale: 28
      }))
      , { model: 'industrial-chimney-basic', label: 'Schornstein (einfach)', icon: 'factory', previewColor: '#555', type: 'deco', scale: 16 }
      , { model: 'industrial-chimney-large', label: 'Schornstein (groß)', icon: 'factory', previewColor: '#555', type: 'deco', scale: 16 }
      , { model: 'industrial-chimney-medium', label: 'Schornstein (mittel)', icon: 'factory', previewColor: '#555', type: 'deco', scale: 15 }
      , { model: 'industrial-chimney-small', label: 'Schornstein (klein)', icon: 'factory', previewColor: '#555', type: 'deco', scale: 14 }
      , { model: 'industrial-detail-tank', label: 'Tank', icon: 'barrel', previewColor: '#777', type: 'deco', scale: 16 }
    ]
  }
  , {
    name: 'civic', label: 'Öffentliche Gebäude', open: false, items: [
      { model: 'civic-church', label: 'Kirche', icon: 'church', previewColor: '#c8b080', type: 'civic', scale: 36 }
      , { model: 'civic-hospital', label: 'Krankenhaus', icon: 'hospital-box', previewColor: '#e74c3c', type: 'civic', scale: 0.00045 }
      , { model: 'civic-school', label: 'Rathaus', icon: 'bank', previewColor: '#3498db', type: 'civic', scale: 2.52 }
      , { model: 'civic-townhall', label: 'Rathausvorplatz', icon: 'town-hall', previewColor: '#7eb8da', type: 'civic', scale: 24 }
    ]
  }
  , {
    name: 'nature', label: 'Natur (Nature Kit)', open: false, items: [
      { model: 'nature-tree_oak', label: 'Eiche', icon: 'tree', previewColor: '#3a7a3a', type: 'deco', scale: 16 }
      , { model: 'nature-tree_default', label: 'Laubbaum', icon: 'tree', previewColor: '#4a8a4a', type: 'deco', scale: 16 }
      , { model: 'nature-tree_detailed', label: 'Detailbaum', icon: 'tree', previewColor: '#3a6a3a', type: 'deco', scale: 16 }
      , { model: 'nature-tree_cone', label: 'Nadelbaum', icon: 'tree', previewColor: '#2d5a2e', type: 'deco', scale: 16 }
      , { model: 'nature-tree_pineDefaultA', label: 'Kiefer A', icon: 'tree', previewColor: '#1a4a1e', type: 'deco', scale: 16 }
      , { model: 'nature-tree_pineRoundA', label: 'Rundkiefer', icon: 'tree', previewColor: '#2a5a2e', type: 'deco', scale: 16 }
      , { model: 'nature-tree_thin', label: 'Birke', icon: 'tree', previewColor: '#5da36e', type: 'deco', scale: 16 }
      , { model: 'nature-tree_small', label: 'Kleiner Baum', icon: 'tree', previewColor: '#6ab04c', type: 'deco', scale: 14 }
      , { model: 'nature-tree_tall', label: 'Hoher Baum', icon: 'tree', previewColor: '#2d8a4e', type: 'deco', scale: 18 }
      , { model: 'nature-plant_bush', label: 'Busch', icon: 'tree', previewColor: '#3a6a3a', type: 'deco', scale: 12 }
      , { model: 'nature-plant_bushLarge', label: 'Großer Busch', icon: 'tree', previewColor: '#2d5a2e', type: 'deco', scale: 14 }
      , { model: 'nature-flower_redA', label: 'Blume (rot)', icon: 'flower', previewColor: '#c0392b', type: 'deco', scale: 10 }
      , { model: 'nature-flower_yellowA', label: 'Blume (gelb)', icon: 'flower', previewColor: '#f1c40f', type: 'deco', scale: 10 }
      , { model: 'nature-flower_purpleA', label: 'Blume (lila)', icon: 'flower', previewColor: '#8e44ad', type: 'deco', scale: 10 }
      , { model: 'nature-grass_large', label: 'Hohes Gras', icon: 'grass', previewColor: '#6ab04c', type: 'deco', scale: 12 }
      , { model: 'nature-ground_grass', label: 'Grasfläche', icon: 'grass', previewColor: '#5a9a4a', type: 'deco', scale: 16 }
      , { model: 'nature-rock_smallA', label: 'Kleiner Fels', icon: 'terrain', previewColor: '#888', type: 'deco', scale: 12 }
      , { model: 'nature-rock_largeA', label: 'Großer Fels', icon: 'terrain', previewColor: '#777', type: 'deco', scale: 14 }
      , { model: 'nature-bridge_stone', label: 'Steinbrücke', icon: 'bridge', previewColor: '#8B7355', type: 'road', scale: 32 }
      , { model: 'nature-bridge_wood', label: 'Holzbrücke', icon: 'bridge', previewColor: '#8B6914', type: 'road', scale: 32 }
      , { model: 'nature-log_stack', label: 'Holzstapel', icon: 'pine-tree', previewColor: '#8B6914', type: 'deco', scale: 12 }
      , { model: 'nature-sign', label: 'Schild', icon: 'sign-direction', previewColor: '#8B6914', type: 'deco', scale: 12 }
      , { model: 'water-tile', label: 'Wasser', icon: 'water', previewColor: '#2563a8', type: 'water', scale: 32 }
      , { model: 'water-tile-small', label: 'Wasser (klein)', icon: 'water', previewColor: '#3a7cbd', type: 'water', scale: 16 }
      , { model: 'pavement', label: 'Gehweg', icon: 'road-variant', previewColor: '#999', type: 'deco', scale: 34 }
      , { model: 'pavement-fountain', label: 'Platz mit Brunnen', icon: 'fountain', previewColor: '#aaa', type: 'deco', scale: 34 }
      , { model: 'nature-path_stone', label: 'Steinweg', icon: 'road-variant', previewColor: '#8a8070', type: 'deco', scale: 34 }
      , { model: 'nature-path_stoneCorner', label: 'Steinweg (Ecke)', icon: 'road-variant', previewColor: '#8a8070', type: 'deco', scale: 43 }
      , { model: 'nature-path_stoneEnd', label: 'Steinweg (Ende)', icon: 'road-variant', previewColor: '#8a8070', type: 'deco', scale: 53 }
      , { model: 'suburban-path-long', label: 'Weg (lang)', icon: 'road-variant', previewColor: '#b0a890', type: 'deco', scale: 82 }
      , { model: 'suburban-path-short', label: 'Weg (kurz)', icon: 'road-variant', previewColor: '#b0a890', type: 'deco', scale: 162 }
      , { model: 'suburban-path-stones-long', label: 'Steinplatten (lang)', icon: 'road-variant', previewColor: '#9a9080', type: 'deco', scale: 82 }
      , { model: 'suburban-path-stones-short', label: 'Steinplatten (kurz)', icon: 'road-variant', previewColor: '#9a9080', type: 'deco', scale: 162 }
      , { model: 'suburban-path-stones-messy', label: 'Steinplatten (wild)', icon: 'road-variant', previewColor: '#9a9080', type: 'deco', scale: 90 }
    ]
  }
  , {
    name: 'decoration', label: 'Dekoration (Original)', open: false, items: [
      { model: 'grass-trees', label: 'Bäume', icon: 'tree', previewColor: '#4a7c59', type: 'deco', scale: 16 }
      , { model: 'grass-trees-tall', label: 'Hohe Bäume', icon: 'tree', previewColor: '#3d6b4b', type: 'deco', scale: 16 }
      , { model: 'grass', label: 'Rasen', icon: 'grass', previewColor: '#6ab04c', type: 'deco', scale: 16 }
      , { model: 'suburban-tree-large', label: 'Großer Baum', icon: 'tree', previewColor: '#2d8a4e', type: 'deco', scale: 16 }
      , { model: 'suburban-tree-small', label: 'Kleiner Baum', icon: 'tree', previewColor: '#5da36e', type: 'deco', scale: 12 }
      , { model: 'suburban-planter', label: 'Pflanzkübel', icon: 'flower', previewColor: '#c0a080', type: 'deco', scale: 16 }
    ]
  }
]

// Flatten for lookup
const ASSET_MAP = {}
ASSET_CATEGORIES.forEach(cat => cat.items.forEach(item => { ASSET_MAP[item.model] = item }))

const STORAGE_KEY = 'blobtopia-city-layout'

export default {
  name: 'CityEditor'
  , data() {
    return {
      categories: ASSET_CATEGORIES.map(c => ({ ...c, open: c.open }))
      , districts: DISTRICTS
      , selectedAsset: null
      , selectedDistrict: 0
      , tool: 'select' // 'select' | 'place' | 'delete' | 'district'
      , searchFilter: ''
      , placements: [] // { id, model, x, z, rotation, scale, type, district }
      , districtMap: {} // 'cx,cz' → districtIndex
      , hoveredCell: null
      , selectedPlacement: null
      , ghostMesh: null
      , nextId: 1
    }
  }
  , computed: {
    filteredCategories() {
      if (!this.searchFilter) return this.categories
      const q = this.searchFilter.toLowerCase()
      return this.categories.map(cat => ({
        ...cat
        , open: true
        , items: cat.items.filter(i => i.label.toLowerCase().includes(q) || i.model.includes(q))
      })).filter(cat => cat.items.length > 0)
    }
    , selectedAssetLabel() {
      const info = ASSET_MAP[this.selectedAsset]
      return (info && info.label) || ''
    }
    , districtCounts() {
      const counts = {}
      this.placements.forEach(p => {
        if (p.district != null) {
          counts[p.district] = (counts[p.district] || 0) + 1
        }
      })
      return counts
    }
  }
  , async mounted() {
    this.initThree()
    await this.loadFromStorage()
    // rebuildScene wird bereits von applyLayout() aufgerufen falls Daten da sind,
    // ansonsten hier einmal starten
    if (this.placements.length === 0) {
      this.rebuildScene()
    }
    this.animate()
    window.addEventListener('resize', this.onResize)
  }
  , beforeUnmount() {
    this._stopped = true
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    if (this.renderer) {
      this.renderer.dispose()
    }
  }
  , methods: {
    initThree() {
      const canvas = this.$refs.canvas
      const container = this.$refs.viewport

      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
      this.renderer.setPixelRatio(window.devicePixelRatio)
      this.renderer.setClearColor(0x2c3e50)
      this.renderer.outputColorSpace = THREE.SRGBColorSpace
      this.renderer.toneMapping = THREE.LinearToneMapping
      this.renderer.toneMappingExposure = 0.85
      this.onResize()

      this.scene = new THREE.Scene()

      // Camera — schräge Draufsicht für Kartenübersicht
      this.camera = new THREE.PerspectiveCamera(50, container.offsetWidth / container.offsetHeight, 10, 12000)
      this.camera.position.set(500, 400, 800)

      // Orbit controls — primär Pan + Zoom, leichtes Rotieren erlaubt
      this.controls = new OrbitControls(this.camera, canvas)
      this.controls.enableDamping = true
      this.controls.dampingFactor = 0.12
      this.controls.rotateSpeed = 0.2
      this.controls.zoomSpeed = 1.0
      this.controls.panSpeed = 1.5
      this.controls.minDistance = 50
      this.controls.maxDistance = 4000
      this.controls.maxPolarAngle = Math.PI * 0.45 // nicht unter den Boden
      this.controls.minPolarAngle = 0.15 // nicht ganz flach
      this.controls.screenSpacePanning = false // Pan entlang der Bodenfläche
      this.controls.mouseButtons = {
        LEFT: THREE.MOUSE.PAN       // Linksklick + Ziehen = Gleiten
        , MIDDLE: THREE.MOUSE.DOLLY // Mausrad-Klick = Zoom
        , RIGHT: THREE.MOUSE.ROTATE // Rechtsklick + Ziehen = Kamera drehen
      }
      this.controls.target.set(GRID / 2, 0, GRID / 2)

      // Tastatur-Steuerung: WASD / Pfeiltasten zum Gleiten
      this._keys = {}
      this._placementRotation = 0
      this._undoStack = []
      this._dragState = null // { placementId, startX, startZ, mesh }
      this._onKeyDown = (e) => {
        this._keys[e.key.toLowerCase()] = true
        // R-Taste: Ghost drehen ODER ausgewähltes Gebäude drehen
        if (e.key.toLowerCase() === 'r') {
          if (this.tool === 'place') {
            this._placementRotation = (this._placementRotation + Math.PI / 2) % (Math.PI * 2)
            this.ghostGroup.rotation.y = this._placementRotation
          } else if (this.selectedPlacement) {
            this.rotatePlacement()
          }
        }
        // Entf / Backspace: Ausgewähltes Gebäude löschen
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.selectedPlacement) {
          e.preventDefault()
          this.deletePlacement()
        }
        // Ctrl+Z: Undo
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault()
          this.undo()
        }
      }
      this._onKeyUp = (e) => { this._keys[e.key.toLowerCase()] = false }
      window.addEventListener('keydown', this._onKeyDown)
      window.addEventListener('keyup', this._onKeyUp)

      // Lights — gedämpft für natürlichere Farben
      const ambient = new THREE.AmbientLight(0xffffff, 0.5)
      this.scene.add(ambient)
      const dir = new THREE.DirectionalLight(0xfff8e8, 0.35)
      dir.position.set(300, 500, 200)
      this.scene.add(dir)
      // Zweites Fülllicht von der anderen Seite für weichere Schatten
      const fill = new THREE.DirectionalLight(0xe8f0ff, 0.15)
      fill.position.set(-200, 300, -100)
      this.scene.add(fill)

      // Ground grid
      this.groundGroup = new THREE.Group()
      this.scene.add(this.groundGroup)
      this.buildGround()

      // Grid helper
      const gridHelper = new THREE.GridHelper(GRID, CELLS, 0x444444, 0x333333)
      gridHelper.position.set(GRID / 2, 0.1, GRID / 2)
      this.scene.add(gridHelper)

      // Building group
      this.buildingGroup = new THREE.Group()
      this.scene.add(this.buildingGroup)

      // Ghost preview
      this.ghostGroup = new THREE.Group()
      this.ghostGroup.visible = false
      this.scene.add(this.ghostGroup)

      // Selection indicator (rotation arrows)
      this.selectionIndicator = this.createSelectionIndicator()
      this.selectionIndicator.visible = false
      this.scene.add(this.selectionIndicator)

      // Raycaster
      this.raycaster = new THREE.Raycaster()
      this.mouse = new THREE.Vector2()
      this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)

      // Model cache
      this.modelCache = {}
      this.loader = new GLTFLoader()

      // Linksklick = Werkzeug-Aktion, Pan nur per WASD/Mittelklick
      canvas.addEventListener('mousemove', (e) => this.onMouseMove(e))
      canvas.addEventListener('mousedown', (e) => this.onMouseDown(e))
      canvas.addEventListener('mouseup', (e) => this.onMouseUp(e))
      canvas.addEventListener('click', (e) => this.onCanvasClick(e))
      canvas.addEventListener('contextmenu', this.onRightClick)
    }

    , buildGround() {
      // Remove old ground
      while (this.groundGroup.children.length) {
        this.groundGroup.remove(this.groundGroup.children[0])
      }

      // Base ground plane
      const groundGeo = new THREE.PlaneGeometry(GRID, GRID)
      const groundMat = new THREE.MeshLambertMaterial({ color: 0x3a5a3a })
      const ground = new THREE.Mesh(groundGeo, groundMat)
      ground.rotation.x = -Math.PI / 2
      ground.position.set(GRID / 2, -0.1, GRID / 2)
      ground.name = 'ground'
      this.groundGroup.add(ground)

      // District overlays
      for (const key of Object.keys(this.districtMap)) {
        const [cx, cz] = key.split(',').map(Number)
        const dIdx = this.districtMap[key]
        const d = DISTRICTS[dIdx]
        if (!d) continue
        const geo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE)
        const mat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(d.groundColor[0], d.groundColor[1], d.groundColor[2])
          , transparent: true
          , opacity: 0.6
        })
        const mesh = new THREE.Mesh(geo, mat)
        mesh.rotation.x = -Math.PI / 2
        mesh.position.set(cx * CELL_SIZE + CELL_SIZE / 2, 0.05, cz * CELL_SIZE + CELL_SIZE / 2)
        this.groundGroup.add(mesh)
      }
    }

    , loadModel(modelName) {
      return new Promise((resolve) => {
        if (this.modelCache[modelName]) {
          resolve(this.modelCache[modelName].clone())
          return
        }
        this.loader.load(`/models/kenney/${modelName}.glb`, (gltf) => {
          const model = gltf.scene
          const isRoad = modelName.startsWith('road-')
          const isPavement = modelName.startsWith('pavement')
          model.traverse(child => {
            if (child.isMesh) {
              child.castShadow = false
              child.receiveShadow = false
              // Kenney-Originalmaterialien für Straßen beibehalten (Markierungen, Gehwege etc.)
              if (isRoad) {
                // Originalmaterial behalten — nur leicht abdunkeln für besseren Kontrast
              } else if (isPavement && !modelName.includes('fountain')) {
                child.material = new THREE.MeshLambertMaterial({ color: 0x999999 })
              } else if (modelName === 'pavement-fountain') {
                child.material = new THREE.MeshLambertMaterial({ color: 0xaabbcc })
              } else if (modelName.startsWith('grass-trees') || modelName === 'suburban-tree-large' || modelName === 'suburban-tree-small') {
                child.material = new THREE.MeshLambertMaterial({ color: 0x3a7a3a })
              } else if (modelName === 'grass') {
                child.material = new THREE.MeshLambertMaterial({ color: 0x5a9a4a })
              } else if (modelName === 'suburban-planter') {
                child.material = new THREE.MeshLambertMaterial({ color: 0x6a8a5a })
              }
            }
          })
          this.modelCache[modelName] = model
          resolve(model.clone())
        }, undefined, () => {
          // Fallback: colored box
          const info = ASSET_MAP[modelName] || { scale: 16, previewColor: '#888' }
          const geo = new THREE.BoxGeometry(info.scale * 0.8, info.scale * 1.2, info.scale * 0.8)
          const mat = new THREE.MeshLambertMaterial({ color: info.previewColor })
          const box = new THREE.Mesh(geo, mat)
          box.position.y = info.scale * 0.6
          const group = new THREE.Group()
          group.add(box)
          this.modelCache[modelName] = group
          resolve(group.clone())
        })
      })
    }

    , async rebuildScene() {
      // Clear existing
      while (this.buildingGroup.children.length) {
        this.buildingGroup.remove(this.buildingGroup.children[0])
      }

      // Auto-Connect: Korrekte Tile-Typen + Rotationen für Straßen
      autoConnectRoads(this.placements, CELL_SIZE)

      // Place all buildings
      for (const p of this.placements) {
        const isRoad = p.model.startsWith('road-')
        const isBridge = p.model.startsWith('nature-bridge')
        const isPavement = p.model.startsWith('pavement')
        const isWater = p.type === 'water'

        // Water tiles: nur flache blaue Fläche, kein 3D-Modell
        if (isWater) {
          const tileSize = p.model === 'water-tile-small' ? CELL_SIZE / 2 : CELL_SIZE
          const waterGeo = new THREE.PlaneGeometry(tileSize, tileSize)
          const waterMat = new THREE.MeshLambertMaterial({ color: 0x2563a8, transparent: true, opacity: 0.8 })
          const waterPlane = new THREE.Mesh(waterGeo, waterMat)
          waterPlane.rotation.x = -Math.PI / 2
          waterPlane.position.set(p.x, 0.1, p.z)
          waterPlane.userData = { placementId: p.id }
          waterPlane.name = 'building'
          this.buildingGroup.add(waterPlane)
          continue
        }

        const model = await this.loadModel(p.model)
        const info = ASSET_MAP[p.model] || { scale: 16 }
        // Civic models need per-model scaling (different source units)
        const CIVIC_SCALE = { 'civic-church': 75, 'civic-townhall': 24, 'civic-school': 2.52, 'civic-hospital': 0.288 }
        const modelScale = CIVIC_SCALE[p.model] || info.scale
        model.scale.setScalar(modelScale * (p.scale || 1))
        // Straßen/Gehwege leicht über dem Boden, Gebäude normal
        const isPath = p.model.startsWith('nature-path') || p.model.startsWith('suburban-path') || isPavement
        const yPos = (isRoad) ? 0.3 : isBridge ? 0.5 : isPath ? 0.15 : -0.3
        model.position.set(p.x, yPos, p.z)
        // Bridge tiles: add blue water surface underneath
        if (isBridge) {
          const waterGeo = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE)
          const waterMat = new THREE.MeshLambertMaterial({ color: 0x3a7cbd, transparent: true, opacity: 0.75 })
          const waterPlane = new THREE.Mesh(waterGeo, waterMat)
          waterPlane.rotation.x = -Math.PI / 2
          waterPlane.position.set(p.x, 0.2, p.z)
          this.buildingGroup.add(waterPlane)
        }
        // Straßen-Rotation auf 90°-Schritte snappen (Kenney-Tiles müssen gridbasiert sein)
        let rot = p.rotation || 0
        if (isRoad || isBridge) {
          rot = Math.round(rot / (Math.PI / 2)) * (Math.PI / 2)
          p.rotation = rot // auch im Datenmodell korrigieren
        }
        model.rotation.y = rot
        model.userData = { placementId: p.id }
        // Distrikt-spezifische Farbpaletten für Gebäude
        const DISTRICT_PALETTES = {
          0: { r: [0.85, 0.95], g: [0.98, 1.10], b: [0.88, 0.98] }  // Grüntal — grünlicher Ton
          ,1: { r: [1.00, 1.12], g: [0.92, 1.02], b: [0.75, 0.85] }  // Sonnenberg — warmes Gold
          ,2: { r: [0.82, 0.92], g: [0.90, 1.00], b: [1.00, 1.12] }  // Hafenviertel — bläulich
          ,3: { r: [1.02, 1.14], g: [0.88, 0.98], b: [0.78, 0.88] }  // Mittelfeld — orange-warm
          ,4: { r: [0.88, 0.96], g: [0.88, 0.96], b: [0.88, 0.96] },  // Industriezone — neutral-grau
        }
        const DEFAULT_PALETTE = { r: [0.92, 1.04], g: [0.90, 1.00], b: [0.85, 0.95] } // Zentrum — sandfarben

        const needsVariation = !isRoad && !isPavement
          && !p.model.startsWith('grass') && !p.model.startsWith('suburban-tree')
          && !p.model.startsWith('suburban-planter')
        const palette = (p.district != null && DISTRICT_PALETTES[p.district]) || DEFAULT_PALETTE
        const tintR = palette.r[0] + Math.random() * (palette.r[1] - palette.r[0])
        const tintG = palette.g[0] + Math.random() * (palette.g[1] - palette.g[0])
        const tintB = palette.b[0] + Math.random() * (palette.b[1] - palette.b[0])
        model.traverse(child => {
          if (child.isMesh) {
            child.name = 'building'
            child.userData.placementId = p.id
            if (needsVariation && child.material) {
              child.material = child.material.clone()
              // Bestehende Farbe mit Distrikt-Tint multiplizieren
              const c = child.material.color
              c.setRGB(c.r * tintR, c.g * tintG, c.b * tintB)
            }
          }
        })
        this.buildingGroup.add(model)
      }
    }

    , snapToGrid(worldX, worldZ) {
      const cx = Math.floor(worldX / CELL_SIZE)
      const cz = Math.floor(worldZ / CELL_SIZE)
      return {
        cx: Math.max(0, Math.min(CELLS - 1, cx))
        , cz: Math.max(0, Math.min(CELLS - 1, cz))
        , x: cx * CELL_SIZE + CELL_SIZE / 2
        , z: cz * CELL_SIZE + CELL_SIZE / 2
      }
    }

    , createSelectionIndicator() {
      const group = new THREE.Group()
      // Kreisförmiger Pfeil aus Liniensegmenten
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.8 })
      // Bogen (3/4 Kreis)
      const radius = 18
      const segments = 24
      const arcAngle = Math.PI * 1.5
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * arcAngle
        const a2 = ((i + 1) / segments) * arcAngle
        const geo = new THREE.CylinderGeometry(0.8, 0.8, 0.5, 4)
        const seg = new THREE.Mesh(geo, arrowMat)
        const mx = (Math.cos(a1) + Math.cos(a2)) / 2 * radius
        const mz = (Math.sin(a1) + Math.sin(a2)) / 2 * radius
        seg.position.set(mx, 0, mz)
        seg.rotation.y = -Math.atan2(Math.sin(a2) - Math.sin(a1), Math.cos(a2) - Math.cos(a1))
        group.add(seg)
      }
      // Pfeilspitze
      const arrowGeo = new THREE.ConeGeometry(2.5, 5, 6)
      const arrow = new THREE.Mesh(arrowGeo, arrowMat)
      const tipAngle = arcAngle
      arrow.position.set(Math.cos(tipAngle) * radius, 0, Math.sin(tipAngle) * radius)
      arrow.rotation.z = Math.PI / 2
      arrow.rotation.y = -tipAngle + Math.PI / 2
      group.add(arrow)
      // Klick-Ring (unsichtbar, für Raycasting)
      const ringGeo = new THREE.TorusGeometry(radius, 4, 4, 24)
      const ringMat = new THREE.MeshBasicMaterial({ visible: false })
      const ring = new THREE.Mesh(ringGeo, ringMat)
      ring.rotation.x = -Math.PI / 2
      ring.name = 'rotateRing'
      group.add(ring)
      group.position.y = 15
      return group
    }

    , updateSelectionIndicator() {
      if (this.selectedPlacement && this.selectionIndicator) {
        this.selectionIndicator.visible = true
        this.selectionIndicator.position.x = this.selectedPlacement.x
        this.selectionIndicator.position.z = this.selectedPlacement.z
      } else if (this.selectionIndicator) {
        this.selectionIndicator.visible = false
      }
    }

    , getWorldPosition(event) {
      const rect = this.$refs.canvas.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      this.raycaster.setFromCamera(this.mouse, this.camera)
      const target = new THREE.Vector3()
      this.raycaster.ray.intersectPlane(this.groundPlane, target)
      return target
    }

    , onMouseMove(event) {
      const pos = this.getWorldPosition(event)
      if (!pos) return
      const snapped = this.snapToGrid(pos.x, pos.z)
      this.hoveredCell = snapped

      // Drag & Drop: Gebäude mitbewegen
      if (this._dragState) {
        this.dragMove(snapped)
        return
      }

      // Distrikt malen bei gedrückter Maustaste
      if (this._districtPainting && this.tool === 'district') {
        const key = `${snapped.cx},${snapped.cz}`
        if (this.selectedDistrict === -1) {
          if (this.districtMap[key] != null) {
            delete this.districtMap[key]
            this.buildGround()
          }
        } else if (this.districtMap[key] !== this.selectedDistrict) {
          this.districtMap = { ...this.districtMap, [key]: this.selectedDistrict }
          this.buildGround()
        }
        return
      }

      // Update ghost
      if (this.selectedAsset && this.tool === 'place') {
        this.ghostGroup.visible = true
        this.ghostGroup.position.set(snapped.x, 0, snapped.z)
      } else {
        this.ghostGroup.visible = false
      }
    }

    , async onCanvasClick(event) {
      // Nach Drag kein Click auslösen
      if (this._dragState) return
      const pos = this.getWorldPosition(event)
      if (!pos) return
      const snapped = this.snapToGrid(pos.x, pos.z)

      if (this.tool === 'place' && this.selectedAsset) {
        // Place building
        this.pushUndo()
        const info = ASSET_MAP[this.selectedAsset]
        const placement = {
          id: this.nextId++
          , model: this.selectedAsset
          , x: snapped.x
          , z: snapped.z
          , rotation: this._placementRotation || 0
          , scale: 1
          , type: (info && info.type) || 'building'
          , district: this.selectedDistrict
          , label: (info && info.label) || this.selectedAsset
        }
        this.placements.push(placement)

        // Straßen: Auto-Connect + Scene rebuild für korrekte Nachbar-Tiles
        if (placement.type === 'road') {
          this.rebuildScene()
          this.tool = 'select'
          this.selectedAsset = null
          this.ghostGroup.visible = false
          return
        }

        // Wasser: flache blaue Fläche direkt hinzufügen
        if (placement.type === 'water') {
          const tileSize = placement.model === 'water-tile-small' ? CELL_SIZE / 2 : CELL_SIZE
          const waterGeo = new THREE.PlaneGeometry(tileSize, tileSize)
          const waterMat = new THREE.MeshLambertMaterial({ color: 0x2563a8, transparent: true, opacity: 0.8 })
          const waterPlane = new THREE.Mesh(waterGeo, waterMat)
          waterPlane.rotation.x = -Math.PI / 2
          waterPlane.position.set(snapped.x, 0.1, snapped.z)
          waterPlane.userData = { placementId: placement.id }
          waterPlane.name = 'building'
          this.buildingGroup.add(waterPlane)
          this.tool = 'select'
          this.selectedAsset = null
          this.ghostGroup.visible = false
          return
        }

        // Nicht-Straßen: direkt zur Scene hinzufügen
        const model = await this.loadModel(this.selectedAsset)
        const scale = ((info && info.scale) || 16) * placement.scale
        model.scale.setScalar(scale)
        const isRoadP = this.selectedAsset.startsWith('road-')
        const isPathP = this.selectedAsset.startsWith('pavement') || this.selectedAsset.startsWith('nature-path') || this.selectedAsset.startsWith('suburban-path')
        model.position.set(snapped.x, isRoadP ? 0.3 : isPathP ? 0.15 : -0.3, snapped.z)
        model.rotation.y = placement.rotation
        model.userData = { placementId: placement.id }
        model.traverse(child => {
          if (child.isMesh) {
            child.name = 'building'
            child.userData.placementId = placement.id
          }
        })
        this.buildingGroup.add(model)

        // Nach Platzierung → Auswählen-Modus
        this.tool = 'select'
        this.selectedAsset = null
        this.ghostGroup.visible = false
      } else if (this.tool === 'delete') {
        this.deleteAtPosition(event)
      } else if (this.tool === 'district') {
        this.pushUndo()
        const key = `${snapped.cx},${snapped.cz}`
        if (this.selectedDistrict === -1) {
          delete this.districtMap[key]
        } else {
          this.districtMap = { ...this.districtMap, [key]: this.selectedDistrict }
        }
        this.buildGround()
      } else if (this.tool === 'select') {
        this.selectAtPosition(event)
      }
    }

    , onRightClick(event) {
      event.preventDefault()
    }

    , selectAtPosition(event) {
      const rect = this.$refs.canvas.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      this.raycaster.setFromCamera(this.mouse, this.camera)
      // Prüfe zuerst, ob der Rotations-Ring geklickt wurde
      if (this.selectedPlacement && this.selectionIndicator.visible) {
        const ringHits = this.raycaster.intersectObjects(this.selectionIndicator.children, true)
        if (ringHits.length) {
          this.rotatePlacement()
          return
        }
      }
      const intersects = this.raycaster.intersectObjects(this.buildingGroup.children, true)
      if (intersects.length) {
        const id = intersects[0].object.userData.placementId
        this.selectedPlacement = this.placements.find(p => p.id === id) || null
      } else {
        this.selectedPlacement = null
      }
      this.updateSelectionIndicator()
    }

    , deleteAtPosition(event) {
      const rect = this.$refs.canvas.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      this.raycaster.setFromCamera(this.mouse, this.camera)
      const intersects = this.raycaster.intersectObjects(this.buildingGroup.children, true)
      if (intersects.length) {
        const id = intersects[0].object.userData.placementId
        this.removePlacementById(id)
      }
    }

    , removePlacementById(id) {
      this.pushUndo()
      const removed = this.placements.find(p => p.id === id)
      this.placements = this.placements.filter(p => p.id !== id)
      if (this.selectedPlacement && this.selectedPlacement.id === id) {
        this.selectedPlacement = null
      }
      // Straßen: Auto-Connect Nachbarn aktualisieren
      if (removed && removed.type === 'road') {
        this.rebuildScene()
        return
      }
      // Remove from scene
      const toRemove = []
      this.buildingGroup.traverse(child => {
        if (child.userData.placementId === id && child.parent === this.buildingGroup) {
          toRemove.push(child)
        }
      })
      toRemove.forEach(obj => this.buildingGroup.remove(obj))
    }

    , rotatePlacement() {
      if (!this.selectedPlacement) return
      this.pushUndo()
      this.selectedPlacement.rotation = (this.selectedPlacement.rotation || 0) + Math.PI / 2
      // Update scene
      this.buildingGroup.children.forEach(child => {
        if (child.userData.placementId === this.selectedPlacement.id) {
          child.rotation.y = this.selectedPlacement.rotation
        }
      })
      this.updateSelectionIndicator()
    }

    // ── Sync: Gebäude-Distrikte aus gemalter Karte aktualisieren ──
    , syncDistrictsToBuildings() {
      for (const p of this.placements) {
        const cx = Math.floor(p.x / CELL_SIZE)
        const cz = Math.floor(p.z / CELL_SIZE)
        const key = `${cx},${cz}`
        if (this.districtMap[key] != null) {
          p.district = this.districtMap[key]
        }
      }
    }

    // ── Functional Type + Capacity für Precompute ──────────
    , enrichPlacementsForExport() {
      const TYPE_TO_FUNCTIONAL = {
        villa: 'villa', rowhouse: 'rowhouse', apartment: 'apartment'
        ,office: 'office', factory: 'factory'
        ,road: 'road', deco: 'decoration', water: 'water', building: 'residential'
      }
      const LABEL_TO_FUNCTIONAL = {
        'Rathaus': 'parliament', 'Rathausvorplatz': 'central_square'
        ,'Kirche': 'central_square', 'Krankenhaus': 'office'
        ,'Marktplatz': 'marketplace', 'Marktstand': 'marketplace'
        ,'Universität': 'university', 'Bibliothek': 'library'
        ,'Medienzentrum': 'media_center', 'Sportplatz': 'sports_facility'
        ,'Park': 'park', 'Café': 'cafe', 'Restaurant': 'restaurant', 'Bar': 'bar'
        ,'Geschäft': 'shop', 'Lager': 'warehouse'
      }
      const DEFAULT_CAPACITY = {
        villa: 4, rowhouse: 3, apartment: 5, office: 5, factory: 10
        ,road: 0, deco: 0, water: 0, building: 0, civic: 0
      }
      for (const p of this.placements) {
        // functional_type: label-basiert oder type-basiert
        if (!p.functional_type) {
          p.functional_type = LABEL_TO_FUNCTIONAL[p.label] || TYPE_TO_FUNCTIONAL[p.type] || 'decoration'
        }
        // capacity: custom beibehalten, sonst default
        if (p.capacity == null) {
          p.capacity = DEFAULT_CAPACITY[p.type] || 0
        }
      }
    }

    // ── WalkableGrid generieren ──────────────────────────
    , generateWalkableGrid() {
      const grid = new Array(CELLS * CELLS).fill('.')
      // Zellen aus Placements markieren
      for (const p of this.placements) {
        const cx = Math.floor(p.x / CELL_SIZE)
        const cz = Math.floor(p.z / CELL_SIZE)
        if (cx < 0 || cx >= CELLS || cz < 0 || cz >= CELLS) continue
        const idx = cz * CELLS + cx
        if (p.type === 'road') grid[idx] = 'R'
        else if (p.type === 'water') grid[idx] = 'W'
        else if (p.type === 'deco' || p.model.startsWith('nature-path') || p.model.startsWith('suburban-path') || p.model.startsWith('pavement')) grid[idx] = 'D'
        else if (grid[idx] !== 'R') grid[idx] = 'B'
      }
      // Sidewalks: leere Zellen neben R oder B → D
      for (let cz = 0; cz < CELLS; cz++) {
        for (let cx = 0; cx < CELLS; cx++) {
          if (grid[cz * CELLS + cx] !== '.') continue
          let hasNeighbor = false
          for (const [dx, dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
            const nx = cx + dx, nz = cz + dz
            if (nx >= 0 && nx < CELLS && nz >= 0 && nz < CELLS) {
              const ch = grid[nz * CELLS + nx]
              if (ch === 'R' || ch === 'B') { hasNeighbor = true; break }
            }
          }
          if (hasNeighbor) grid[cz * CELLS + cx] = 'D'
        }
      }
      return { cells: CELLS, cellSize: CELL_SIZE, map: grid.join('') }
    }

    // ── Undo ──────────────────────────────────────────────
    , pushUndo() {
      // Snapshot current state (max 50 steps)
      this._undoStack.push(JSON.stringify({
        placements: this.placements
        , districtMap: this.districtMap
      }))
      if (this._undoStack.length > 50) this._undoStack.shift()
    }

    , undo() {
      if (!this._undoStack || !this._undoStack.length) return
      const state = JSON.parse(this._undoStack.pop())
      this.placements = state.placements || []
      this.districtMap = state.districtMap || {}
      let maxId = 0
      this.placements.forEach(p => { if (p.id > maxId) maxId = p.id })
      this.nextId = maxId + 1
      this.selectedPlacement = null
      this.buildGround()
      this.rebuildScene()
    }

    // ── Drag & Drop ───────────────────────────────────────
    , onMouseDown(event) {
      if (event.button !== 0) return // nur Linksklick
      // Bei aktivem Werkzeug: OrbitControls-Pan unterdrücken
      if (this.tool === 'place' || this.tool === 'delete' || this.tool === 'district') {
        this.controls.enabled = false
      }
      // Distrikt-Malen starten
      if (this.tool === 'district') {
        this.pushUndo()
        this._districtPainting = true
        const pos = this.getWorldPosition(event)
        if (pos) {
          const snapped = this.snapToGrid(pos.x, pos.z)
          const key = `${snapped.cx},${snapped.cz}`
          if (this.selectedDistrict === -1) {
            delete this.districtMap[key]
          } else {
            this.districtMap = { ...this.districtMap, [key]: this.selectedDistrict }
          }
          this.buildGround()
        }
      }
      if (this.tool !== 'select') return
      // Raycast: Gebäude oder Rotationspfeil unter dem Cursor?
      const rect = this.$refs.canvas.getBoundingClientRect()
      this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
      this.raycaster.setFromCamera(this.mouse, this.camera)
      // Rotations-Ring prüfen
      if (this.selectedPlacement && this.selectionIndicator.visible) {
        const ringHits = this.raycaster.intersectObjects(this.selectionIndicator.children, true)
        if (ringHits.length) {
          this.controls.enabled = false
          return // Rotation wird im click-Handler gemacht
        }
      }
      const intersects = this.raycaster.intersectObjects(this.buildingGroup.children, true)
      if (!intersects.length) return // kein Gebäude → Kamera-Pan erlauben
      const id = intersects[0].object.userData.placementId
      const placement = this.placements.find(p => p.id === id)
      if (!placement) return
      this.pushUndo()
      this._dragState = { placementId: id, startX: placement.x, startZ: placement.z, didMove: false }
      this.selectedPlacement = placement
      this.updateSelectionIndicator()
      // Orbit Controls während Drag deaktivieren
      this.controls.enabled = false
    }

    , onMouseUp() {
      // OrbitControls immer wieder aktivieren
      this.controls.enabled = true
      // Distrikt-Malen beenden
      this._districtPainting = false
      if (!this._dragState) return
      const ds = this._dragState
      this._dragState = null
      // Wenn nicht bewegt wurde, Undo-Snapshot entfernen (war nur Select)
      if (!ds.didMove && this._undoStack.length) {
        this._undoStack.pop()
      }
      // Bei Straßen: Auto-Connect aktualisieren
      const p = this.placements.find(pl => pl.id === ds.placementId)
      if (p && p.type === 'road' && ds.didMove) {
        this.rebuildScene()
      }
    }

    , dragMove(snapped) {
      if (!this._dragState) return
      const ds = this._dragState
      const p = this.placements.find(pl => pl.id === ds.placementId)
      if (!p) return
      if (p.x === snapped.x && p.z === snapped.z) return // gleiche Zelle
      ds.didMove = true
      p.x = snapped.x
      p.z = snapped.z
      // 3D-Mesh aktualisieren
      this.buildingGroup.children.forEach(child => {
        if (child.userData.placementId === ds.placementId) {
          child.position.x = snapped.x
          child.position.z = snapped.z
        }
      })
      this.updateSelectionIndicator()
    }

    , deletePlacement() {
      if (!this.selectedPlacement) return
      this.removePlacementById(this.selectedPlacement.id)
      this.updateSelectionIndicator()
    }

    , selectAsset(model) {
      this.selectedAsset = model
      this.tool = 'place'
      this.selectedPlacement = null
      // Update ghost
      this.updateGhost(model)
    }

    , async updateGhost(model) {
      while (this.ghostGroup.children.length) {
        this.ghostGroup.remove(this.ghostGroup.children[0])
      }
      const info = ASSET_MAP[model] || { scale: 16 }
      // Wasser-Tiles: flache Fläche als Ghost
      if (info.type === 'water') {
        const tileSize = model === 'water-tile-small' ? CELL_SIZE / 2 : CELL_SIZE
        const geo = new THREE.PlaneGeometry(tileSize, tileSize)
        const mat = new THREE.MeshLambertMaterial({ color: 0x2563a8, transparent: true, opacity: 0.4 })
        const plane = new THREE.Mesh(geo, mat)
        plane.rotation.x = -Math.PI / 2
        plane.position.y = 0.15
        this.ghostGroup.add(plane)
        return
      }
      const obj = await this.loadModel(model)
      obj.scale.setScalar(info.scale)
      obj.traverse(child => {
        if (child.isMesh) {
          child.material = child.material.clone()
          child.material.transparent = true
          child.material.opacity = 0.5
        }
      })
      this.ghostGroup.add(obj)
    }

    , clearAll() {
      if (!window.confirm('Alle Gebäude löschen?')) return
      this.pushUndo()
      this.placements = []
      this.districtMap = {}
      while (this.buildingGroup.children.length) {
        this.buildingGroup.remove(this.buildingGroup.children[0])
      }
      this.buildGround()
      this.selectedPlacement = null
    }

    , saveLayout() {
      this.syncDistrictsToBuildings()
      this.enrichPlacementsForExport()
      const data = {
        version: 2
        , placements: this.placements
        , districtMap: this.districtMap
        , walkableGrid: this.generateWalkableGrid()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))

      // Also download as file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'blobtopia-city.json'
      a.click()
      URL.revokeObjectURL(url)

      this.$buefy.toast.open({ message: 'Stadt gespeichert!', type: 'is-success' })
    }

    , loadLayout() {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      input.onchange = (e) => {
        const file = e.target.files[0]
        if (!file) return
        const reader = new FileReader()
        reader.onload = (ev) => {
          try {
            const data = JSON.parse(ev.target.result)
            this.applyLayout(data)
            this.$buefy.toast.open({ message: 'Stadt geladen!', type: 'is-success' })
          } catch (_err) {
            this.$buefy.toast.open({ message: 'Fehler beim Laden', type: 'is-danger' })
          }
        }
        reader.readAsText(file)
      }
      input.click()
    }

    , async loadFromStorage() {
      try {
        // Try new key first, fall back to legacy key
        const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('globtopia-city-layout')
        if (raw) {
          const data = JSON.parse(raw)
          this.applyLayout(data)
          return
        }
      } catch (_e) {
        // ignore
      }
      // Auto-load from public/ if localStorage is empty
      try {
        let resp = await fetch('/blobtopia-city.json').catch(() => null)
        if (!resp || !resp.ok) resp = await fetch('/globtopia-city.json').catch(() => null)
        if (resp && resp.ok) {
          const data = await resp.json()
          this.applyLayout(data)
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch (_e) { /* quota */ }
          console.log('[editor] Auto-loaded blobtopia-city.json (' + (data.placements || []).length + ' placements)')
        }
      } catch (e) {
        console.warn('[editor] Could not auto-load blobtopia-city.json:', e)
      }
    }

    , applyLayout(data) {
      if (!data) return
      this.placements = data.placements || []
      this.districtMap = data.districtMap || {}
      // Ensure IDs are unique
      let maxId = 0
      this.placements.forEach(p => { if (p.id > maxId) maxId = p.id })
      this.nextId = maxId + 1
      this.buildGround()
      this.rebuildScene()
    }

    , startSimulation() {
      // Save layout first
      this.syncDistrictsToBuildings()
      this.enrichPlacementsForExport()
      const data = {
        version: 2
        , placements: this.placements
        , districtMap: this.districtMap
        , walkableGrid: this.generateWalkableGrid()
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      this.$router.push({ name: 'simulation', params: { generationIndex: 0 } })
    }

    , onResize() {
      const container = this.$refs.viewport
      if (!container || !this.renderer) return
      const w = container.offsetWidth
      const h = container.offsetHeight
      this.renderer.setSize(w, h)
      if (this.camera) {
        this.camera.aspect = w / h
        this.camera.updateProjectionMatrix()
      }
    }

    , animate() {
      if (this._stopped) return
      requestAnimationFrame(() => this.animate())

      // WASD / Pfeiltasten: Kamera über die Karte gleiten
      let panSpeed
      // Schneller gleiten wenn weiter rausgezoomt
      var dist = this.camera.position.distanceTo(this.controls.target)
      panSpeed = Math.max(4, dist * 0.008)

      var forward = new THREE.Vector3()
      this.camera.getWorldDirection(forward)
      forward.y = 0
      forward.normalize()
      var right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()

      var dir = new THREE.Vector3()
      if (this._keys['w'] || this._keys['arrowup']) dir.add(forward)
      if (this._keys['s'] || this._keys['arrowdown']) dir.sub(forward)
      if (this._keys['a'] || this._keys['arrowleft']) dir.sub(right)
      if (this._keys['d'] || this._keys['arrowright']) dir.add(right)

      if (dir.lengthSq() > 0) {
        // Normalisieren → diagonal genauso schnell wie gerade
        dir.normalize().multiplyScalar(panSpeed)
        this.camera.position.add(dir)
        this.controls.target.add(dir)
      }

      this.controls.update()
      this.renderer.render(this.scene, this.camera)
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

  .header-actions
    margin-left: auto
    display: flex
    gap: 0.5rem

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
    gap: 0.4rem
    white-space: nowrap
    pointer-events: none
    b
      color: $grey-lighter

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

  .selection-info
    position: absolute
    bottom: 0.75rem
    right: 0.75rem
    background: rgba(0, 0, 0, 0.85)
    backdrop-filter: blur(8px)
    border-radius: 6px
    border: 1px solid rgba(255, 255, 255, 0.15)
    padding: 0.5rem 0.75rem
    min-width: 180px

    .sel-header
      display: flex
      align-items: center
      justify-content: space-between
      margin-bottom: 0.4rem
      font-weight: 600
      font-size: 0.85rem
      .close-btn
        cursor: pointer
        color: $grey
        &:hover
          color: $grey-lighter

    .sel-actions
      display: flex
      gap: 0.3rem

.stats-bar
  width: 160px
  background: rgba(0, 0, 0, 0.3)
  border-left: 1px solid rgba(255, 255, 255, 0.08)
  padding: 0.75rem
  flex-shrink: 0

  .stat-item
    display: flex
    justify-content: space-between
    align-items: center
    padding: 0.3rem 0
    font-size: 0.75rem
    border-bottom: 1px solid rgba(255, 255, 255, 0.05)
    &:last-child
      border-bottom: none

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

// Transitions
.collapse-enter-active, .collapse-leave-active
  transition: max-height 0.2s ease, opacity 0.2s ease
  max-height: 500px
  overflow: hidden
.collapse-enter, .collapse-enter-from, .collapse-leave-to
  max-height: 0
  opacity: 0

.fade-enter-active, .fade-leave-active
  transition: opacity 0.2s
.fade-enter, .fade-enter-from, .fade-leave-to
  opacity: 0
</style>
