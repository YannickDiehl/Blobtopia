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
      span.step-tab(:class="{ active: step === 'field' }", @click="step = 'field'") Feld
      span.step-tab(:class="{ active: step === 'results' }", @click="step = 'results'") Ergebnis

    .survey-body
      //- ═══ EDITOR ═══
      .survey-section(v-if="step === 'editor'")
        p.hint Formuliere eigene Fragen und Antwortskalen — sie werden den Blobs gestellt.
        .item-card(v-for="(it, i) in localItems", :key="i")
          .item-head
            span.item-num {{ i + 1 }}
            span.action-btn.del(@click="removeItem(i)", title="Entfernen")
              b-icon(icon="close", size="is-small")
          textarea.survey-input.item-text(v-model="it.text", rows="3", placeholder="Frage UND Antwortskala selbst formulieren — z. B. „Wie zufrieden sind Sie mit der Politik? Skala von 1 bis 10, wobei 1 = gar nicht und 10 = völlig.“", @input="onItemText(it)")
        button.survey-btn.add-btn(@click="addItem")
          b-icon(icon="plus", size="is-small")
          span Item hinzufügen

      //- ═══ SAMPLE DESIGNER ═══
      .survey-section(v-else-if="step === 'sample'")
        p.hint Wähle die Stichprobenmethode und kalibriere sie selbst.
        .field-row
          label Methode
          select.survey-input(v-model="design.technique")
            option(value="srs") Einfache Zufallsstichprobe (SRS)
            option(value="stratified") Geschichtet
            option(value="cluster") Klumpen
            option(value="quota") Quote
        .field-row
          label Stichprobengröße (n)
          input.survey-input(type="number", min="1", v-model.number="design.n")
        .field-row
          label Seed (für Reproduzierbarkeit)
          input.survey-input(type="number", v-model.number="design.seed")
        .field-row(v-if="design.technique === 'stratified' || design.technique === 'quota'")
          label Schichtungsvariable
          select.survey-input(v-model="design.strataVar")
            option(value="district") Distrikt
            option(value="education_level") Bildung
            option(value="age_group") Altersgruppe
        template(v-if="design.technique === 'cluster'")
          .field-row
            label Klumpen-Variable
            select.survey-input(v-model="design.clusterVar")
              option(value="district") Distrikt
              option(value="education_level") Bildung
          .field-row
            label Anzahl Klumpen
            input.survey-input(type="number", min="1", v-model.number="design.numClusters")
        label.checkbox-row
          input(type="checkbox", v-model="design.excludeMinors")
          span Minderjährige ausschließen
        button.survey-btn(@click="onPreview")
          b-icon(icon="account-search", size="is-small")
          span Vorschau ziehen
        .preview-box(v-if="lastSample")
          .info-item
            span.info-label Rahmen (Population)
            span.info-value {{ lastSample.frameSize }}
          .info-item
            span.info-label Realisierte Stichprobe (n)
            span.info-value {{ lastSample.realizedN }}
          .dist(v-if="dist")
            .dist-title Verteilung nach {{ design.strataVar }}
            .dist-row(v-for="(c, k) in dist", :key="k")
              span.dist-key {{ k }}
              span.dist-bar
                span.dist-fill(:style="{ width: distPct(c) + '%' }")
              span.dist-val {{ c }}

      //- ═══ FIELDWORK ═══
      .survey-section(v-else-if="step === 'field'")
        p.hint Die gezogenen Blobs antworten synthetisch — kostenlos und reproduzierbar, inkl. modellierter Fragebogeneffekte.
        .info-item
          span.info-label Items im Fragebogen
          span.info-value {{ localItems.length }}
        .info-item
          span.info-label Geplante Stichprobe (n)
          span.info-value {{ design.n }}
        button.survey-btn.primary(:disabled="!localItems.length || isRunning", @click="onRun")
          b-icon(icon="flash", size="is-small")
          span Synthetische Befragung starten
        .progress-line(v-if="progress && progress.total")
          span Befragt: {{ progress.done }} / {{ progress.total }}
        .error-banner(v-if="error") {{ error }}

      //- ═══ RESULTS ═══
      .survey-section(v-else-if="step === 'results'")
        .empty(v-if="!result") Noch keine Ergebnisse. Starte zuerst eine Befragung im Reiter „Feld".
        template(v-else)
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

function clone(x) { return JSON.parse(JSON.stringify(x)) }

export default {
  name: 'SurveyWindow'
  , mixins: [draggablePanel]
  , props: {
    timelineMode: { type: Boolean, default: false }
  }
  , data() {
    return {
      step: 'editor'
      , localItems: []
      , design: {
        technique: 'srs'
        , mode: 'synthetic'
        , n: 40
        , seed: 12345
        , strataVar: 'district'
        , clusterVar: 'district'
        , numClusters: 2
        , excludeMinors: true
      }
    }
  }
  , computed: {
    panelConfig() {
      return {
        storageKey: 'blobtopia_panel_survey'
        , minWidth: 320
        , maxWidth: 560
        , minHeight: 300
        , maxHeight: Math.round(window.innerHeight * 0.9)
        , headerSelector: '.survey-header'
        , resizable: true
      }
    }
    // Mirror blob-interaction: when dragged/resized the card fills the panel.
    , cardStyle() {
      if (this.panelW !== null || this.panelH !== null) {
        return { width: '100%', height: '100%', maxHeight: 'none' }
      }
      return {}
    }
    , distMax() {
      if (!this.dist) return 1
      return Math.max(1, ...Object.keys(this.dist).map(k => this.dist[k]))
    }
    , ...mapState('survey', ['lastSample', 'dist', 'result', 'progress', 'isRunning', 'error'])
  }
  , created() {
    const storedItems = this.$store.state.survey.items
    this.localItems = (storedItems && storedItems.length)
      ? clone(storedItems)
      : [this.blankItem(1)]
    const d = this.$store.state.survey.design
    if (d) {
      this.design.technique = d.technique || 'srs'
      this.design.n = d.n != null ? d.n : 40
      this.design.seed = d.seed != null ? d.seed : 12345
      this.design.strataVar = (d.strataVars && d.strataVars[0]) || 'district'
      this.design.clusterVar = d.clusterVar || 'district'
      this.design.numClusters = d.numClusters || 2
      this.design.mode = d.mode || 'synthetic'
      this.design.excludeMinors = !(d.eligibility && d.eligibility.excludeMinors === false)
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
      if (!it.construct) it.construct = p.construct // don't override a manual choice
    }
    , canonicalDesign() {
      return {
        technique: this.design.technique
        , mode: this.design.mode
        , n: Number(this.design.n) || 0
        , seed: Number(this.design.seed) || 0
        , strataVars: [this.design.strataVar]
        , clusterVar: this.design.clusterVar
        , numClusters: Number(this.design.numClusters) || 1
        , eligibility: { excludeMinors: this.design.excludeMinors }
      }
    }
    , distPct(c) {
      return Math.round(100 * c / this.distMax)
    }
    , onPreview() {
      this.$store.commit('survey/SET_DESIGN', this.canonicalDesign())
      this.$store.dispatch('survey/previewSample')
    }
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
  background: rgba(0, 0, 0, 0.88)
  backdrop-filter: blur(8px)
  border-radius: 8px
  border: 1px solid rgba(255, 255, 255, 0.15)
  width: 360px
  max-height: 80vh
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
    font-size: 0.72rem
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
  overflow-y: auto
  padding: 0.6rem 0.75rem

.hint
  font-size: 0.72rem
  color: $grey
  margin-bottom: 0.6rem

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

.type-select
  width: auto
  flex: 1

.item-text
  resize: vertical
  margin-bottom: 0.4rem

.scale-params
  display: flex
  align-items: center
  gap: 0.3rem
  flex-wrap: wrap
  margin-bottom: 0.4rem

  .mini
    width: 52px

  .label-in
    flex: 1
    min-width: 90px

  .mini-label
    color: $grey
    font-size: 0.7rem

.choice-params
  margin-bottom: 0.4rem

.detect-chip
  display: flex
  align-items: center
  flex-wrap: wrap
  gap: 0.3rem
  margin-top: 0.1rem
  font-size: 0.68rem
  color: $grey

  .detect-construct
    background: rgba(255, 255, 255, 0.06)
    border: 1px solid rgba(255, 255, 255, 0.18)
    border-radius: 4px
    color: $primary
    font-size: 0.68rem
    font-family: inherit
    padding: 1px 3px
    outline: none

  .detect-scale
    color: $grey-light

  .detect-warn
    color: #f0c929
    width: 100%

.item-preview
  background: rgba(255, 255, 255, 0.04)
  border-radius: 4px
  padding: 0.35rem 0.45rem

  .preview-label
    font-size: 0.58rem
    text-transform: uppercase
    letter-spacing: 0.4px
    color: $grey
    margin-bottom: 2px

  .preview-text
    font-size: 0.72rem
    color: $grey-light
    white-space: pre-wrap

.field-row
  margin-bottom: 0.5rem

  label
    display: block
    font-size: 0.66rem
    text-transform: uppercase
    letter-spacing: 0.3px
    color: $grey
    margin-bottom: 0.2rem

.checkbox-row
  display: flex
  align-items: center
  gap: 0.4rem
  margin: 0.5rem 0
  font-size: 0.75rem
  color: $grey-light
  cursor: pointer

.construct-row
  display: flex
  align-items: center
  gap: 0.3rem
  margin-bottom: 0.4rem

  .construct-select
    flex: 1

.mode-toggle
  display: flex
  gap: 0.4rem

  .mode-opt
    flex: 1
    display: flex
    align-items: center
    justify-content: center
    gap: 0.3rem
    padding: 0.35rem
    border: 1px solid rgba(255, 255, 255, 0.18)
    border-radius: 5px
    cursor: pointer
    font-size: 0.72rem
    color: $grey-light
    input
      display: none
    &.active
      border-color: $primary
      color: $primary
      background: rgba(255, 255, 255, 0.05)

.cost-warn
  margin-top: 0.4rem
  font-size: 0.7rem
  color: #f0c929

.survey-btn
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 0.35rem
  width: 100%
  padding: 0.45rem
  margin-top: 0.3rem
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

.preview-box
  margin-top: 0.6rem
  border-top: 1px solid rgba(255, 255, 255, 0.1)
  padding-top: 0.5rem

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
  margin-top: 0.5rem

  .dist-title
    font-size: 0.6rem
    text-transform: uppercase
    color: $grey
    margin-bottom: 0.3rem

  .dist-row
    display: flex
    align-items: center
    gap: 0.4rem
    margin-bottom: 0.25rem
    font-size: 0.72rem

  .dist-key
    width: 28px
    color: $grey-light

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

.empty
  color: $grey
  font-size: 0.75rem
  padding: 1rem 0
  text-align: center
</style>
