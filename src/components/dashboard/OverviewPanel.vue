<template lang="pug">
.overview-panel
  h3.heading Übersicht

  //- Info cards row
  .info-cards(v-if="timelineMeta")
    .info-card
      .info-value {{ timelineMeta.max_tick }}
      .info-label Ticks gesamt
    .info-card
      .info-value {{ timelineMeta.total_blobs }}
      .info-label Bevölkerung
    .info-card
      .info-value {{ events.length }}
      .info-label Ereignisse
    .info-card
      .info-value {{ elections.length }}
      .info-label Wahlen

  //- Event Timeline
  .timeline-section(v-if="timelineMeta")
    h4.subheading Zeitleiste
    .timeline-bar(ref="timelineBar")
      //- Current tick marker
      .timeline-current(:style="{ left: tickPct(tick) + '%' }")
      //- Event markers
      .timeline-marker.event-marker(
        v-for="(ev, i) in events"
        :key="'e' + i"
        :style="{ left: tickPct(ev.tick) + '%' }"
        @mouseenter="showTooltip($event, ev)"
        @mouseleave="hideTooltip"
      )
        svg(width="10" height="10" viewBox="0 0 10 10")
          polygon(points="5,0 10,10 0,10" fill="#f09a40")
      //- Election markers
      .timeline-marker.election-marker(
        v-for="(et, i) in elections"
        :key="'el' + i"
        :style="{ left: tickPct(et) + '%' }"
        @mouseenter="showTooltip($event, { tick: et, description: 'Wahl' })"
        @mouseleave="hideTooltip"
      )
        svg(width="10" height="10" viewBox="0 0 10 10")
          circle(cx="5" cy="5" r="4" fill="#5c9ded")
      //- Tooltip
      .timeline-tooltip(v-if="tooltip.visible" :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }")
        .tooltip-desc {{ tooltip.description }}
        .tooltip-meta Tick {{ tooltip.tick }} | Jahr {{ tickToYear(tooltip.tick) }}

    .timeline-legend
      span.legend-item
        svg(width="10" height="10" viewBox="0 0 10 10")
          polygon(points="5,0 10,10 0,10" fill="#f09a40")
        |  Ereignis
      span.legend-item
        svg(width="10" height="10" viewBox="0 0 10 10")
          circle(cx="5" cy="5" r="4" fill="#5c9ded")
        |  Wahl
      span.legend-item
        .legend-line
        |  Aktueller Tick

  //- Event List
  .event-list(v-if="events.length")
    h4.subheading Ereignisse
    table.event-table
      thead
        tr
          th Tick
          th Jahr
          th Beschreibung
      tbody
        tr(v-for="(ev, i) in events" :key="i")
          td {{ ev.tick }}
          td {{ tickToYear(ev.tick) }}
          td {{ ev.description || ev.event_type || '-' }}

  //- Simulation Mechanisms Table
  .mechanisms-section
    h4.subheading Simulationsmechanismen und Parameter
    table.event-table
      thead
        tr
          th Kategorie
          th Mechanismus
          th Parameter
          th Theoretische Grundlage
      tbody
        tr
          td.cat Einstellungen
          td Bounded Confidence (Sozialer Einfluss)
          td Schwelle 3.0, Stärke 0.003/Tick
          td Hegselmann-Krause (2002)
        tr
          td.cat
          td Repulsion bei ideologischer Distanz
          td Stärke 0.12
          td Antagonistic Opinion Dynamics
        tr
          td.cat
          td Gruppenpolarisation
          td Stärke 0.06, mit Extremitätsdämpfung
          td Moscovici &amp; Zavalloni (1969)
        tr
          td.cat
          td In-Group Bias
          td Gleiche Partei 1.3×, andere 0.7×
          td Tajfel &amp; Turner (1979)
        tr
          td.cat
          td Persönlichkeitsankerung
          td Rate 0.008/Woche (HWZ ~1.7 Jahre)
          td Costa &amp; McCrae (Big Five)
        tr
          td.cat
          td Hedonische Adaptation
          td Floors: Sat 2.0-3.5, Trust 1.5-3.0
          td Brickman &amp; Campbell (1971)
        tr
          td.cat
          td Ceiling-Erosion
          td Ab Sat 7.0, Trust 6.0, Efficacy 7.5
          td Demokratische Skepsis
        tr
          td.cat Parteiwahl
          td Softmax-Modell
          td Temperatur 1.0, 4 Parteien
          td Spatial Voting (Downs 1957)
        tr
          td.cat
          td Dynamische Parteiloyalität
          td 5-40% (sat- + trust-abhängig)
          td Michigan-Modell (Party ID)
        tr
          td.cat
          td Wahlbeteiligung
          td Basis 68%, Clamp 35-78%
          td Civic Voluntarism (Verba et al. 1995)
        tr
          td.cat Latente Konstrukte
          td 6 Faktoren, 21 Indikatoren
          td CFA-Modell (CFI .998 bei T0)
          td Dalton, Putnam, Adorno, Inglehart, Akkerman/Mudde/Zaslove
        tr
          td.cat
          td Konstrukt-spezifischer Drift
          td ±0.08/Woche (erhält Faktorstruktur)
          td Varianzerhaltung für CFA
        tr
          td.cat
          td Politische Efficacy
          td Treiber: Bildung (Dalton)
          td Kognitive Mobilisierung
        tr
          td.cat
          td Soziales Kapital (formativ)
          td Treiber: Life Events + Sozialeinfluss
          td Putnam (Bowling Alone)
        tr
          td.cat
          td Autoritarismus
          td Treiber: L-R + Need for Closure
          td Stenner (2005), Altemeyer (RWA)
        tr
          td.cat
          td Politikverdrossenheit
          td Treiber: Trust-Defizit
          td Political Alienation
        tr
          td.cat
          td Materialismus/Postmaterialismus
          td Treiber: Einkommen (Inglehart)
          td Wertewandel-Theorie
        tr
          td.cat
          td Populismus
          td Treiber: Anti-Elitismus + Volkszentrismus
          td Akkerman, Mudde & Zaslove (2014)
        tr
          td.cat Netzwerk
          td Kontaktgraph
          td Ø 13 Kontakte, 4 Typen, Dunbar-Cap 15
          td Granovetter (1973), Dunbar (1992)
        tr
          td.cat
          td Residentielle Mobilität
          td 3-25%/Jahr, Einkommen-Match
          td Tiebout (1956)
        tr
          td.cat
          td Ideologische Homophilie
          td 50% Homophilie bei Freizeitort-Wahl
          td Schelling (1971)
        tr
          td.cat Demografie
          td 500 Blobs, 5 Distrikte
          td 80/80/120/120/100 Verteilung
          td —
        tr
          td.cat
          td Haushalte
          td 42% Single, 33% Paar, 25% Familien
          td Mikrozensus-Orientierung
        tr
          td.cat
          td Alterung
          td +1 Jahr/365 Ticks, keine Geburt/Tod
          td Stabile Gesellschaft (Design)
        tr
          td.cat Events
          td 10 Eventtypen + 4 endogene
          td 29 geplante Events im Kalender
          td —
        tr
          td.cat
          td Säkulare Distrikt-Trends
          td Halbiert, 1 Konstrukt pro Distrikt
          td Myrdal (Kumulative Verursachung)
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'

export default {
  name: 'OverviewPanel'
  , data: () => ({
    tooltip: { visible: false, x: 0, y: 0, description: '', tick: 0 }
  })
  , computed: {
    ...mapState(useSimulationStore, [
      'timelineMeta'
      , 'timelineEvents'
      , 'electionTicks'
      , 'tick'
      , 'year'
      , 'statistics'
    ])
    , events() {
      return this.timelineEvents || []
    }
    , elections() {
      return this.electionTicks || []
    }
    , maxTick() {
      return this.timelineMeta ? this.timelineMeta.max_tick : 1
    }
  }
  , methods: {
    tickPct(t) {
      return Math.min(100, Math.max(0, (t / this.maxTick) * 100))
    }
    , tickToYear(t) {
      return (t / 365).toFixed(1)
    }
    , showTooltip(event, data) {
      const bar = this.$refs.timelineBar
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      this.tooltip = {
        visible: true
        , x: event.clientX - rect.left
        , y: -40
        , description: data.description || data.event_type || 'Wahl'
        , tick: data.tick
      }
    }
    , hideTooltip() {
      this.tooltip.visible = false
    }
  }
}
</script>

<style lang="sass" scoped>
.overview-panel
  padding: 1rem 0

.info-cards
  display: flex
  gap: 0.75rem
  margin-bottom: 1.5rem
  flex-wrap: wrap

.info-card
  flex: 1 1 140px
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px
  padding: 0.75rem 1rem
  text-align: center

  .info-value
    font-size: 1.6rem
    font-weight: 700
    color: $primary

  .info-label
    font-size: 0.75rem
    color: $grey
    margin-top: 0.25rem

.subheading
  font-size: 0.95rem
  color: $grey-lighter
  margin-bottom: 0.5rem

.timeline-section
  margin-bottom: 1.5rem

.timeline-bar
  position: relative
  width: 100%
  height: 60px
  background: rgba(255, 255, 255, 0.05)
  border-radius: 4px
  overflow: visible

.timeline-current
  position: absolute
  top: 0
  bottom: 0
  width: 2px
  background: $primary
  z-index: 3

.timeline-marker
  position: absolute
  top: 50%
  transform: translate(-50%, -50%)
  cursor: pointer
  z-index: 2

  &:hover
    transform: translate(-50%, -50%) scale(1.4)

.timeline-tooltip
  position: absolute
  background: rgba(30, 30, 30, 0.95)
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 4px
  padding: 0.4rem 0.6rem
  font-size: 0.7rem
  white-space: nowrap
  z-index: 10
  pointer-events: none

  .tooltip-desc
    color: $text
    font-weight: 600

  .tooltip-meta
    color: $grey
    margin-top: 0.15rem

.timeline-legend
  display: flex
  gap: 1rem
  margin-top: 0.4rem
  font-size: 0.7rem
  color: $grey

  .legend-item
    display: flex
    align-items: center
    gap: 0.3rem

  .legend-line
    width: 12px
    height: 2px
    background: $primary

.event-list
  margin-bottom: 1rem

.event-table
  width: 100%
  font-size: 0.8rem
  border-collapse: collapse

  th, td
    padding: 0.35rem 0.6rem
    text-align: left
    border-bottom: 1px solid rgba(255, 255, 255, 0.06)

  th
    color: $grey
    font-weight: 600
    font-size: 0.7rem
    text-transform: uppercase

  td
    color: $text

  td.cat
    color: $primary
    font-weight: 600
    font-size: 0.75rem
    white-space: nowrap

.mechanisms-section
  margin-top: 2rem
  margin-bottom: 1rem
</style>
