<template lang="pug">
.survey-window(:class="{ 'has-timeline': timelineMode }", :style="panelStyle")
  .survey-card(:style="cardStyle")
    //- Header doubles as the drag handle (matches panelConfig.headerSelector)
    .survey-header
      .header-text
        .survey-title Befragungsinstitut
        .survey-subtitle Eigene Befragung erstellen
      .header-actions
        span.action-btn(@click="$emit('close')", title="Schließen")
          b-icon(icon="close", size="is-small")

    .survey-steps
      span.step-tab(:class="{ active: step === 'editor' }", @click="step = 'editor'") Fragebogen
      span.step-tab(:class="{ active: step === 'sample' }", @click="step = 'sample'") Stichprobe
      span.step-tab(:class="{ active: step === 'results' }", @click="step = 'results'") Ergebnis

    .survey-body
      //- ═══════════ FRAGEBOGEN ═══════════
      .survey-section(v-if="step === 'editor'")
        p.hint Formuliere eigene Fragen und Antwortskalen selbst (wie im Codebook) — die Wortwahl wirkt sich aus.
        .item-card(v-for="(it, i) in localItems", :key="i")
          .item-head
            span.item-num {{ i + 1 }}
            span.action-btn.del(@click="removeItem(i)", title="Entfernen")
              b-icon(icon="close", size="is-small")
          textarea.survey-input.item-text(v-model="it.text", rows="3", placeholder="Frage UND Antwortskala selbst formulieren — z. B. „Wie zufrieden sind Sie mit der Politik? Skala von 1 bis 10, wobei 1 = gar nicht und 10 = völlig.“", @input="onItemText(it)")
        button.survey-btn.add-btn(@click="addItem")
          b-icon(icon="plus", size="is-small")
          span Item hinzufügen

      //- ═══════════ STICHPROBE ═══════════
      .survey-section(v-else-if="step === 'sample'")
        //- ① Grundgesamtheit eingrenzen
        .panel-block
          .block-head(@click="filtersOpen = !filtersOpen")
            span.block-title ① Grundgesamtheit eingrenzen
            span.block-meta {{ frameBlobs.length }} Blobs
            b-icon(:icon="filtersOpen ? 'chevron-up' : 'chevron-down'", size="is-small")
          .block-body(v-if="filtersOpen")
            .filter-group
              label Distrikte
              .chips
                span.chip(v-for="d in districts", :key="d.id", :class="{ active: isFilterOn('districts', d.id) }", @click="toggleFilter('districts', d.id)") {{ d.name }}
            .filter-group
              label Bildung
              .chips
                span.chip(v-for="e in education", :key="e.level", :class="{ active: isFilterOn('education', e.level) }", @click="toggleFilter('education', e.level)") {{ e.label }}
            .filter-group
              label Partei
              .chips
                span.chip(v-for="p in parties", :key="p", :class="{ active: isFilterOn('parties', p) }", @click="toggleFilter('parties', p)") {{ p }}
            .filter-group.range
              label Alter
              input.survey-input.mini(type="number", v-model.number="design.filter.ageMin", placeholder="min", @change="onFilterChange")
              span.dash –
              input.survey-input.mini(type="number", v-model.number="design.filter.ageMax", placeholder="max", @change="onFilterChange")
            .filter-group.range
              label Einkommen
              input.survey-input.mini(type="number", v-model.number="design.filter.incomeMin", placeholder="min", @change="onFilterChange")
              span.dash –
              input.survey-input.mini(type="number", v-model.number="design.filter.incomeMax", placeholder="max", @change="onFilterChange")
            span.reset-link(@click="resetFilter") Filter zurücksetzen

        //- ② Ziehungsverfahren
        .panel-block
          .block-head
            span.block-title ② Ziehungsverfahren
          .block-body
            label.radio-row(v-for="t in techniques", :key="t.key", :class="{ active: design.technique === t.key }")
              input(type="radio", :value="t.key", v-model="design.technique")
              span {{ t.label }}
            .params(v-if="design.technique === 'srs'")
              label Stichprobengröße (n)
              input.survey-input(type="number", min="1", v-model.number="design.n")
            .params(v-else-if="design.technique === 'stratified'")
              label Schichtungsvariable
              select.survey-input(v-model="design.strataVar")
                option(value="district") Distrikt
                option(value="education_level") Bildung
                option(value="age_group") Altersgruppe
              label Allokation
              select.survey-input(v-model="design.allocation")
                option(value="proportional") proportional
                option(value="equal") gleich
              label Stichprobengröße (n)
              input.survey-input(type="number", min="1", v-model.number="design.n")
            .params(v-else-if="design.technique === 'cluster'")
              label Klumpen-Variable
              select.survey-input(v-model="design.clusterVar")
                option(value="district") Distrikt
                option(value="education_level") Bildung
              label Anzahl Klumpen
              input.survey-input(type="number", min="1", v-model.number="design.numClusters")
            .params(v-else-if="design.technique === 'quota'")
              p.mini-hint Quoten werden gleichmäßig über die Schichtungsvariable verteilt.
              label Schichtungsvariable
              select.survey-input(v-model="design.strataVar")
                option(value="district") Distrikt
                option(value="education_level") Bildung
              label Gesamtgröße (n)
              input.survey-input(type="number", min="1", v-model.number="design.n")
            .params(v-else-if="design.technique === 'manual'")
              p.mini-hint Wähle die Blobs unten von Hand aus — beobachte, wie deine Auswahl von der Grundgesamtheit abweicht.
            .params(v-if="design.technique !== 'manual'")
              label Seed (Reproduzierbarkeit)
              input.survey-input(type="number", v-model.number="design.seed")
            button.survey-btn(v-if="design.technique !== 'manual'", @click="onPreview")
              b-icon(icon="account-search", size="is-small")
              span Stichprobe ziehen

        //- ③ Auswahl / Realisierung
        .panel-block
          .block-head
            span.block-title ③ {{ design.technique === 'manual' ? 'Blobs selbst auswählen' : 'Realisierte Stichprobe' }}
            span.block-meta n = {{ sampleN }} / {{ frameBlobs.length }}
          .block-body
            .dist(v-if="dist && Object.keys(dist).length")
              .dist-row(v-for="(c, k) in dist", :key="k")
                span.dist-key {{ distLabel(k) }}
                span.dist-bar
                  span.dist-fill(:style="{ width: distPct(c) + '%' }")
                span.dist-val {{ c }}
            input.survey-input.search(v-model="search", :placeholder="design.technique === 'manual' ? 'Kandidaten durchsuchen …' : 'In der Stichprobe suchen …'")
            .blob-list
              .blob-row(v-for="b in shownBlobs", :key="b.id", :class="{ picked: design.technique === 'manual' && isPicked(b) }")
                template(v-if="design.technique === 'manual'")
                  input(type="checkbox", :checked="isPicked(b)", @change="togglePick(b)")
                span.b-name {{ b.name || b.id.substring(0, 6) }}
                span.b-meta {{ districtName(b.district) }} · {{ b.age }}J · {{ eduLabel(b.education_level) }}{{ b.party_name ? ' · ' + b.party_name : '' }}
                span.action-btn.del(v-if="design.technique !== 'manual'", @click="excludeUnit(b.id)", title="Aus Stichprobe entfernen")
                  b-icon(icon="close", size="is-small")
              .list-empty(v-if="!shownBlobs.length") {{ design.technique === 'manual' ? 'Keine Kandidaten — Filter prüfen.' : 'Noch nicht gezogen — „Stichprobe ziehen" oben.' }}
            .list-overflow(v-if="listOverflow > 0") … und {{ listOverflow }} weitere (Suche eingrenzen)

      //- ═══════════ ERGEBNIS (inkl. Erhebung) ═══════════
      .survey-section(v-else-if="step === 'results'")
        p.hint Die Stichprobe wird synthetisch befragt — kostenlos, reproduzierbar, inkl. modellierter Fragebogeneffekte.
        .info-item
          span.info-label Items im Fragebogen
          span.info-value {{ localItems.length }}
        .info-item
          span.info-label Stichprobe
          span.info-value n = {{ sampleN }}
        button.survey-btn.primary(:disabled="!localItems.length || isRunning", @click="onRun")
          b-icon(icon="flash", size="is-small")
          span Befragung durchführen
        .progress-line(v-if="progress && progress.total")
          span Befragt: {{ progress.done }} / {{ progress.total }}
        .error-banner(v-if="error") {{ error }}
        template(v-if="result")
          .results-divider
          .info-item
            span.info-label Datensätze
            span.info-value {{ result.rows.length }}
          .info-item
            span.info-label Items
            span.info-value {{ result.meta.items }}
          button.survey-btn.primary(@click="onExport")
            b-icon(icon="download", size="is-small")
            span Als CSV exportieren
</template>

<script>
import { mapState } from 'vuex'
import draggablePanel from '@/mixins/draggable-panel'
import { parseItem } from '@/lib/survey-parse'
import { DISTRICT_NAMES, PARTY_NAMES, EDUCATION_LABELS } from '@/lib/blob-adapter'

function clone(x) { return JSON.parse(JSON.stringify(x)) }

const TECHNIQUES = [
  { key: 'srs', label: 'Einfache Zufallsstichprobe' }
  , { key: 'stratified', label: 'Geschichtete Stichprobe' }
  , { key: 'cluster', label: 'Klumpenstichprobe' }
  , { key: 'quota', label: 'Quotenstichprobe' }
  , { key: 'manual', label: 'Manuell selbst auswählen' }
]

export default {
  name: 'SurveyWindow'
  , mixins: [draggablePanel]
  , props: {
    timelineMode: { type: Boolean, default: false }
  }
  , data() {
    return {
      step: 'editor'
      , filtersOpen: true
      , search: ''
      , techniques: TECHNIQUES
      , localItems: []
      , design: {
        technique: 'srs'
        , n: 40
        , seed: 12345
        , strataVar: 'district'
        , allocation: 'proportional'
        , clusterVar: 'district'
        , numClusters: 2
        , excludeMinors: true
        , filter: { districts: [], education: [], parties: [], ageMin: null, ageMax: null, incomeMin: null, incomeMax: null }
        , manualInclude: []
        , manualExclude: []
      }
    }
  }
  , computed: {
    panelConfig() {
      return {
        storageKey: 'blobtopia_panel_survey'
        , minWidth: 380
        , maxWidth: 820
        , minHeight: 340
        , maxHeight: Math.round(window.innerHeight * 0.92)
        , headerSelector: '.survey-header'
        , resizable: true
      }
    }
    , cardStyle() {
      if (this.panelW !== null || this.panelH !== null) {
        return { width: '100%', height: '100%', maxHeight: 'none' }
      }
      return {}
    }
    , districts() {
      return DISTRICT_NAMES.map((name, id) => ({ id, name }))
    }
    , education() {
      return EDUCATION_LABELS.map((label, level) => ({ level, label }))
    }
    , parties() {
      return PARTY_NAMES
    }
    , frameBlobs() {
      return this.$store.getters['survey/frameBlobs']
    }
    , sampleN() {
      if (this.design.technique === 'manual') return this.design.manualInclude.length
      return this.lastSample ? this.lastSample.realizedN : 0
    }
    , listBlobs() {
      if (this.design.technique === 'manual') return this.frameBlobs
      return this.lastSample ? this.lastSample.units.map(u => u.blob) : []
    }
    , shownBlobs() {
      const q = this.search.trim().toLowerCase()
      let list = this.listBlobs
      if (q) list = list.filter(b => (b.name || b.id).toLowerCase().indexOf(q) >= 0)
      return list.slice(0, 120)
    }
    , listOverflow() {
      const q = this.search.trim().toLowerCase()
      const total = q ? this.listBlobs.filter(b => (b.name || b.id).toLowerCase().indexOf(q) >= 0).length : this.listBlobs.length
      return Math.max(0, total - 120)
    }
    , distMax() {
      if (!this.dist) return 1
      return Math.max(1, ...Object.keys(this.dist).map(k => this.dist[k]))
    }
    , ...mapState('survey', ['lastSample', 'dist', 'result', 'progress', 'isRunning', 'error'])
  }
  , created() {
    const storedItems = this.$store.state.survey.items
    this.localItems = (storedItems && storedItems.length) ? clone(storedItems) : [this.blankItem(1)]
    const d = this.$store.state.survey.design
    if (d) {
      this.design.technique = d.technique || 'srs'
      this.design.n = d.n != null ? d.n : 40
      this.design.seed = d.seed != null ? d.seed : 12345
      this.design.strataVar = (d.strataVars && d.strataVars[0]) || 'district'
      this.design.allocation = d.allocation || 'proportional'
      this.design.clusterVar = d.clusterVar || 'district'
      this.design.numClusters = d.numClusters || 2
      this.design.excludeMinors = !(d.eligibility && d.eligibility.excludeMinors === false)
      if (d.filter) this.design.filter = Object.assign(this.design.filter, d.filter)
      this.design.manualInclude = (d.manualInclude || []).slice()
      this.design.manualExclude = (d.manualExclude || []).slice()
    }
  }
  , watch: {
    localItems: {
      deep: true
      , handler(v) { this.$store.commit('survey/SET_ITEMS', clone(v)) }
    }
    , design: {
      deep: true
      , handler() { this.$store.commit('survey/SET_DESIGN', this.canonicalDesign()) }
    }
  }
  , methods: {
    blankItem(i) {
      return {
        id: 'q' + i
        , text: ''
        , scale: { min: 1, max: 10, minLabel: '', maxLabel: '', format: 'numeric' }
        , construct: null
        , wording: {}
      }
    }
    , addItem() {
      this.localItems.push(this.blankItem(this.localItems.length + 1))
    }
    , removeItem(i) {
      this.localItems.splice(i, 1)
    }
    , onItemText(it) {
      const p = parseItem(it.text)
      it.scale = p.scale
      it.wording = p.wording
      if (!it.construct) it.construct = p.construct
    }
    , canonicalDesign() {
      return {
        technique: this.design.technique
        , mode: 'synthetic'
        , n: Number(this.design.n) || 0
        , seed: Number(this.design.seed) || 0
        , strataVars: [this.design.strataVar]
        , allocation: this.design.allocation
        , clusterVar: this.design.clusterVar
        , numClusters: Number(this.design.numClusters) || 1
        , eligibility: { excludeMinors: this.design.excludeMinors }
        , filter: this.cleanFilter()
        , manualInclude: this.design.manualInclude.slice()
        , manualExclude: this.design.manualExclude.slice()
      }
    }
    , cleanFilter() {
      const f = this.design.filter
      const num = v => (v === '' || v == null || isNaN(v)) ? null : Number(v)
      return {
        districts: f.districts.slice()
        , education: f.education.slice()
        , parties: f.parties.slice()
        , ageMin: num(f.ageMin)
        , ageMax: num(f.ageMax)
        , incomeMin: num(f.incomeMin)
        , incomeMax: num(f.incomeMax)
      }
    }
    // ── Filters ──
    , isFilterOn(key, value) {
      return this.design.filter[key].indexOf(value) >= 0
    }
    , toggleFilter(key, value) {
      const arr = this.design.filter[key]
      const i = arr.indexOf(value)
      if (i >= 0) arr.splice(i, 1)
      else arr.push(value)
      this.onFilterChange()
    }
    , onFilterChange() {
      this.$store.commit('survey/SET_DESIGN', this.canonicalDesign())
      if (this.design.technique !== 'manual') this.$store.dispatch('survey/previewSample')
    }
    , resetFilter() {
      this.design.filter = { districts: [], education: [], parties: [], ageMin: null, ageMax: null, incomeMin: null, incomeMax: null }
      this.onFilterChange()
    }
    // ── Draw / pick ──
    , onPreview() {
      this.$store.commit('survey/SET_DESIGN', this.canonicalDesign())
      this.$store.dispatch('survey/previewSample')
    }
    , isPicked(b) {
      return this.design.manualInclude.indexOf(b.id) >= 0
    }
    , togglePick(b) {
      const i = this.design.manualInclude.indexOf(b.id)
      if (i >= 0) this.design.manualInclude.splice(i, 1)
      else this.design.manualInclude.push(b.id)
      this.$store.commit('survey/SET_DESIGN', this.canonicalDesign())
      this.$store.dispatch('survey/previewSample')
    }
    , excludeUnit(id) {
      if (this.design.manualExclude.indexOf(id) < 0) this.design.manualExclude.push(id)
      this.$store.commit('survey/SET_DESIGN', this.canonicalDesign())
      this.$store.dispatch('survey/previewSample')
    }
    // ── Labels ──
    , districtName(d) {
      return DISTRICT_NAMES[d] || ('Distrikt ' + d)
    }
    , eduLabel(e) {
      return EDUCATION_LABELS[e] || '?'
    }
    , distLabel(k) {
      // dist is keyed by the first strata var (district by default)
      const v = (this.design.strataVar) || 'district'
      if (v === 'district') return this.districtName(Number(k))
      if (v === 'education_level') return this.eduLabel(Number(k))
      return k
    }
    , distPct(c) {
      return Math.round(100 * c / this.distMax)
    }
    // ── Run / export ──
    , onRun() {
      this.$store.dispatch('survey/runFieldwork')
    }
    , onExport() {
      this.$store.dispatch('survey/exportCsv')
    }
  }
}
</script>

<style lang="sass" scoped>
.survey-window
  position: absolute
  bottom: 1rem
  left: 1rem
  z-index: 6
  pointer-events: auto
  &.has-timeline
    bottom: 10rem

.survey-card
  background: rgba(0, 0, 0, 0.9)
  backdrop-filter: blur(8px)
  border-radius: 8px
  border: 1px solid rgba(255, 255, 255, 0.15)
  width: 460px
  max-height: 86vh
  display: flex
  flex-direction: column
  overflow: hidden
  color: $grey-lighter
  font-size: 0.8rem

.survey-header
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.6rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  flex-shrink: 0
  cursor: grab
  &:active
    cursor: grabbing

  .header-text
    flex: 1
    min-width: 0

  .survey-title
    font-weight: 700
    font-size: 0.95rem
    color: $grey-lighter

  .survey-subtitle
    font-size: 0.7rem
    color: $grey
    margin-top: 1px

  .header-actions
    display: flex
    gap: 0.3rem
    flex-shrink: 0

  .action-btn
    cursor: pointer
    color: $grey
    display: inline-flex
    align-items: center
    padding: 2px
    &:hover
      color: $grey-lighter

.survey-steps
  display: flex
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  flex-shrink: 0

  .step-tab
    flex: 1
    text-align: center
    padding: 0.45rem 0.25rem
    font-size: 0.74rem
    color: $grey
    cursor: pointer
    border-bottom: 2px solid transparent
    transition: all 0.15s
    &:hover
      color: $grey-lighter
    &.active
      color: $primary
      border-bottom-color: $primary

.survey-body
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  -webkit-overflow-scrolling: touch
  padding: 0.6rem 0.75rem

.hint
  font-size: 0.72rem
  color: $grey
  margin-bottom: 0.6rem

.mini-hint
  font-size: 0.7rem
  color: $grey
  margin-bottom: 0.4rem

// ── Fragebogen ──
.item-card
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 6px
  padding: 0.5rem
  margin-bottom: 0.5rem

  .item-head
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.4rem

  .item-num
    font-weight: 700
    color: $grey

  .action-btn.del
    cursor: pointer
    color: $grey
    margin-left: auto
    display: inline-flex
    &:hover
      color: #e74c3c

.survey-input
  background: rgba(255, 255, 255, 0.06)
  border: 1px solid rgba(255, 255, 255, 0.18)
  border-radius: 4px
  color: $grey-lighter
  padding: 0.3rem 0.4rem
  font-size: 0.75rem
  font-family: inherit
  outline: none
  width: 100%
  box-sizing: border-box
  &:focus
    border-color: $primary
  &.mini
    width: 70px

.item-text
  resize: vertical

// ── Stichprobe blocks ──
.panel-block
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 6px
  margin-bottom: 0.5rem
  overflow: hidden

  .block-head
    display: flex
    align-items: center
    gap: 0.4rem
    padding: 0.45rem 0.6rem
    background: rgba(255, 255, 255, 0.04)
    cursor: default

  .block-title
    font-weight: 700
    font-size: 0.74rem
    color: $grey-lighter

  .block-meta
    margin-left: auto
    font-size: 0.7rem
    color: $primary

  .block-body
    padding: 0.5rem 0.6rem

.filter-group
  margin-bottom: 0.5rem

  label
    display: block
    font-size: 0.66rem
    text-transform: uppercase
    letter-spacing: 0.3px
    color: $grey
    margin-bottom: 0.25rem

  &.range
    display: flex
    align-items: center
    gap: 0.3rem
    label
      width: 100%

.chips
  display: flex
  flex-wrap: wrap
  gap: 0.25rem

.chip
  padding: 0.15rem 0.5rem
  border: 1px solid rgba(255, 255, 255, 0.2)
  border-radius: 999px
  font-size: 0.7rem
  color: $grey-light
  cursor: pointer
  transition: all 0.12s
  &:hover
    color: $grey-lighter
  &.active
    background: $primary
    border-color: $primary
    color: #fff

.dash
  color: $grey

.reset-link
  font-size: 0.68rem
  color: $grey
  cursor: pointer
  text-decoration: underline
  &:hover
    color: $grey-lighter

.radio-row
  display: flex
  align-items: center
  gap: 0.4rem
  padding: 0.2rem 0
  font-size: 0.76rem
  color: $grey-light
  cursor: pointer
  &.active
    color: $grey-lighter

.params
  margin-top: 0.4rem
  label
    display: block
    font-size: 0.66rem
    text-transform: uppercase
    letter-spacing: 0.3px
    color: $grey
    margin: 0.4rem 0 0.2rem

// ── Realized sample / picker ──
.search
  margin: 0.4rem 0

.blob-list
  max-height: 200px
  overflow-y: auto
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 4px

.blob-row
  display: flex
  align-items: center
  gap: 0.4rem
  padding: 0.25rem 0.4rem
  font-size: 0.72rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.05)
  &:last-child
    border-bottom: none
  &.picked
    background: rgba(78, 204, 163, 0.12)

  .b-name
    font-weight: 600
    color: $grey-lighter
    white-space: nowrap

  .b-meta
    color: $grey
    flex: 1
    min-width: 0
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap

  .action-btn.del
    cursor: pointer
    color: $grey
    display: inline-flex
    &:hover
      color: #e74c3c

.list-empty
  padding: 0.6rem
  font-size: 0.72rem
  color: $grey
  text-align: center

.list-overflow
  font-size: 0.66rem
  color: $grey
  margin-top: 0.3rem
  text-align: center

// ── shared ──
.survey-btn
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.35rem
  width: 100%
  padding: 0.45rem
  margin-top: 0.4rem
  border: 1px solid rgba(255, 255, 255, 0.2)
  border-radius: 5px
  background: rgba(255, 255, 255, 0.06)
  color: $grey-lighter
  font-size: 0.78rem
  font-family: inherit
  cursor: pointer
  transition: all 0.15s
  &:hover
    background: rgba(255, 255, 255, 0.12)
  &:disabled
    opacity: 0.4
    cursor: not-allowed
  &.primary
    background: $primary
    border-color: $primary
    color: #fff
    &:hover
      filter: brightness(1.1)
  &.add-btn
    border-style: dashed

.info-item
  display: flex
  justify-content: space-between
  padding: 0.2rem 0
  .info-label
    color: $grey
  .info-value
    color: $grey-lighter
    font-weight: 600

.dist
  margin-bottom: 0.5rem

  .dist-row
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.25rem
    font-size: 0.7rem

  .dist-key
    width: 90px
    color: $grey-light
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .dist-bar
    flex: 1
    height: 8px
    background: rgba(255, 255, 255, 0.08)
    border-radius: 4px
    overflow: hidden

  .dist-fill
    display: block
    height: 100%
    background: $primary

  .dist-val
    width: 28px
    text-align: right
    color: $grey-lighter

.results-divider
  border-top: 1px solid rgba(255, 255, 255, 0.1)
  margin: 0.6rem 0 0.4rem

.progress-line
  margin-top: 0.5rem
  font-size: 0.8rem
  color: $grey-light

.error-banner
  margin-top: 0.5rem
  padding: 0.4rem 0.5rem
  background: rgba(231, 76, 60, 0.15)
  border: 1px solid rgba(231, 76, 60, 0.4)
  border-radius: 4px
  color: #e74c3c
  font-size: 0.72rem
</style>
