<template lang="pug">
.newspaper-page(v-if="issue", :class="'paper-' + issue.newspaper")
  //- Masthead (jedes Blatt trägt seine Blattlinie: Blobspiegel = Fraktur,
  //- Kurier = rotes Sans-Logo)
  .masthead
    .paper-rule
    h1.paper-name {{ issue.newspaper_name }}
    .masthead-sub {{ issue.newspaper === 'kurier' ? 'Fakten. Fortschritt. Fairness.' : 'Nah dran. Klar gesagt.' }}
    .masthead-meta
      span Jahr {{ issue.year }}, Monat {{ issue.month }}, Tag {{ issue.day }}
      span.sep &middot;
      span Blobtopia
      span.sep &middot;
      span {{ issue.event_label }}
    .paper-rule

  //- Leitartikel
  .section.leitartikel
    h2.section-headline {{ issue.sections.leitartikel.headline }}
    .article-body.columns-2(v-if="issue.sections.leitartikel.body !== '[DRY RUN]'") {{ issue.sections.leitartikel.body }}
    .article-body.placeholder(v-else)
      em Leitartikel-Text wird nach LLM-Generierung hier erscheinen.

  //- Grid: Lokalnachricht + Kommentar
  .section-grid
    .section.lokalnachricht
      h3.section-headline {{ issue.sections.lokalnachricht.headline }}
      .article-body(v-if="issue.sections.lokalnachricht.body !== '[DRY RUN]'") {{ issue.sections.lokalnachricht.body }}
      .article-body.placeholder(v-else)
        em Lokalnachricht-Text folgt.

    .section.kommentar
      .kommentar-label Kommentar
      h3.section-headline {{ issue.sections.kommentar.headline }}
      .article-body(v-if="issue.sections.kommentar.body !== '[DRY RUN]'") {{ issue.sections.kommentar.body }}
      .article-body.placeholder(v-else)
        em Kommentar-Text folgt.

  //- Zahlen-Box
  .section.zahlen-box
    h3.zahlen-headline {{ issue.sections.zahlen_box.headline }}
    .metrics-grid
      .metric(v-for="m in issue.sections.zahlen_box.metrics", :key="m.label")
        .metric-value {{ m.value }}
        .metric-label {{ m.label }}

  //- Leserbriefe
  .section.leserbriefe
    h3.section-headline Leserbriefe
    .leserbrief(v-for="lb in issue.sections.leserbriefe", :key="lb.blob_id")
      .leserbrief-text
        template(v-if="!lb.text.startsWith('[DRY RUN')") &ldquo;{{ lb.text }}&rdquo;
        em(v-else) Leserbrief-Text folgt.
      .leserbrief-meta
        span.blob-link(@click="$emit('select-blob', lb.blob_id)") {{ lb.blob_name }}
        span.district-tag {{ lb.district }}

  //- Kurzmeldungen
  .section.kurzmeldungen(v-if="issue.sections.kurzmeldungen && issue.sections.kurzmeldungen.length")
    h3.section-headline Kurzmeldungen
    .meldung(v-for="(km, i) in issue.sections.kurzmeldungen", :key="i")
      template(v-if="!km.text.startsWith('[DRY RUN')") {{ km.text }}
      em(v-else) {{ km.text.replace('[DRY RUN: ', '').replace(']', '') }}
</template>

<script>
export default {
  name: 'NewspaperPage'
  , props: {
    issue: { type: Object, default: null }
  }
}
</script>

<style lang="sass" scoped>
.newspaper-page
  background: #f5f0e8
  color: #1a1a1a
  font-family: Georgia, 'Times New Roman', 'Palatino Linotype', serif
  padding: 2.5rem 2rem
  max-width: 850px
  margin: 0 auto
  border-radius: 2px
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.5)

// ── Masthead ──
.masthead
  text-align: center
  margin-bottom: 1.5rem

.paper-name
  font-size: 2.2rem
  font-weight: 700
  letter-spacing: 3px
  text-transform: uppercase
  margin: 0.4rem 0 0.15rem
  line-height: 1.1

// Der Blobspiegel: ehrwürdige Fraktur (FAZ-Erbe)
.paper-blobspiegel .paper-name
  font-family: 'UnifrakturMaguntia', serif
  font-weight: 400
  text-transform: none
  letter-spacing: 0
  font-size: 2.9rem

// Der Kurier: rotes Sans-Logo, klein geschrieben (taz-Erbe)
.paper-kurier
  .paper-name
    font-family: 'Archivo', sans-serif
    font-weight: 800
    text-transform: lowercase
    letter-spacing: -1px
    color: #c0392b
  .paper-rule
    background: #c0392b
  .section-headline
    font-family: 'Archivo', sans-serif

.masthead-sub
  font-size: 0.8rem
  font-style: italic
  color: #555
  margin-bottom: 0.3rem

.masthead-meta
  font-size: 0.75rem
  color: #666
  font-family: 'Source Sans Pro', sans-serif
  .sep
    margin: 0 0.4rem
    color: #aaa

.paper-rule
  height: 2px
  background: #1a1a1a
  margin: 0.2rem 0

// ── Sections ──
.section
  margin-bottom: 1.5rem

.section-headline
  font-size: 1.3rem
  font-weight: 700
  line-height: 1.25
  margin-bottom: 0.5rem
  border-bottom: 1px solid rgba(0, 0, 0, 0.2)
  padding-bottom: 0.3rem

.article-body
  font-size: 0.88rem
  line-height: 1.65
  text-align: justify
  hyphens: auto
  &.placeholder
    color: #888
    font-style: italic
    text-align: left

.columns-2
  column-count: 2
  column-gap: 1.5rem
  column-rule: 1px solid rgba(0, 0, 0, 0.12)

// ── Grid: Lokalnachricht + Kommentar ──
.section-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 1.5rem
  margin: 1.5rem 0

.kommentar-label
  font-size: 0.65rem
  text-transform: uppercase
  letter-spacing: 2px
  color: #888
  font-family: 'Source Sans Pro', sans-serif
  margin-bottom: 0.2rem
  font-weight: 600

// ── Zahlen-Box ──
.zahlen-box
  background: rgba(0, 0, 0, 0.04)
  border: 1px solid rgba(0, 0, 0, 0.12)
  border-radius: 3px
  padding: 1rem 1.25rem

.zahlen-headline
  font-size: 1rem
  font-weight: 700
  margin-bottom: 0.75rem
  padding-bottom: 0.3rem
  border-bottom: 1px solid rgba(0, 0, 0, 0.15)

.metrics-grid
  display: grid
  grid-template-columns: repeat(2, 1fr)
  gap: 0.75rem

.metric-value
  font-size: 1.15rem
  font-weight: 700
  color: #1a1a1a

.metric-label
  font-size: 0.72rem
  color: #555
  font-family: 'Source Sans Pro', sans-serif

// ── Leserbriefe ──
.leserbriefe
  border-top: 1px solid rgba(0, 0, 0, 0.15)
  padding-top: 1rem

.leserbrief
  margin-bottom: 1rem
  padding-left: 0.75rem
  border-left: 2px solid rgba(0, 0, 0, 0.15)

.leserbrief-text
  font-size: 0.85rem
  line-height: 1.55
  font-style: italic
  margin-bottom: 0.25rem

.leserbrief-meta
  font-size: 0.75rem
  font-family: 'Source Sans Pro', sans-serif
  color: #555
  display: flex
  align-items: center
  gap: 0.5rem

.blob-link
  color: #1a7a6a
  cursor: pointer
  font-weight: 600
  text-decoration: underline
  text-decoration-style: dotted
  &:hover
    color: #0f5a4f

.district-tag
  background: rgba(0, 0, 0, 0.06)
  padding: 0.1rem 0.4rem
  border-radius: 2px
  font-size: 0.7rem

// ── Kurzmeldungen ──
.kurzmeldungen
  border-top: 1px solid rgba(0, 0, 0, 0.15)
  padding-top: 0.75rem

.meldung
  font-size: 0.8rem
  line-height: 1.5
  margin-bottom: 0.4rem
  padding-left: 0.75rem
  position: relative
  &::before
    content: '•'
    position: absolute
    left: 0
    color: #888

// ── Print Styles ──
@media print
  .newspaper-page
    box-shadow: none
    max-width: 100%
    padding: 1cm
    background: white
  .blob-link
    color: #1a1a1a
    text-decoration: underline
</style>
