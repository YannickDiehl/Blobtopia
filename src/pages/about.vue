<template lang="pug">
.about.scrollbars
  .about-sheet
    //- Briefkopf — wie im Befragungsinstitut-Fenster
    .about-header
      img.briefkopf-logo(src="/blobtopia-logo.png", alt="")
      .header-text
        .about-title Befragungsinstitut Blobtopia
        .about-subtitle Rathausplatz 1 · 00001 Blobtopia · Abt. Empirische Blobforschung
      .formblatt-nr
        div Formblatt Ü-0
        div Informationsblatt
    .about-rule

    button.back-btn(@click="$router.back()")
      span.arrow ←
      span Zurück zur Simulation

    h1.blatt-titel Willkommen im Institut
    p.blatt-lead Blobtopia ist eine simulierte Gesellschaft für die Methodenlehre — eine lebendige Datenquelle, an der sich empirisches Arbeiten üben lässt, ohne echte Menschen zu befragen.

    section.blatt-abschnitt
      h2.abschnitt-titel ① Was ist Blobtopia?
      p 500 Einwohner:innen — die <b>Blobs</b> — leben in fünf Distrikten. Die Simulation umspannt 22 Jahre mit Wahlen, Krisen und gesellschaftlichem Wandel, die du an der Zeitleiste durchreisen kannst.
      p Wie in der echten Sozialforschung sind die inneren Werte der Blobs — Zufriedenheit, Vertrauen, politische Einstellungen — <b>nicht direkt sichtbar</b>. Du erschließt sie nur mittelbar: durch Befragung und Beobachtung. Genau darin liegt die Übung.

    section.blatt-abschnitt
      h2.abschnitt-titel ② Die fünf Distrikte
      .distrikt-liste
        .distrikt-zeile(v-for="d in distrikte", :key="d.id")
          span.inst-flagge(:class="'d-' + d.id")
          span.distrikt-name {{ d.name }}
          span.distrikt-text {{ d.text }}

    section.blatt-abschnitt
      h2.abschnitt-titel ③ So erforschst du Blobtopia
      .methode(v-for="m in methoden", :key="m.name")
        .methode-kopf
          span.methode-name {{ m.name }}
          span.methode-tag(v-if="m.tag") {{ m.tag }}
        p.methode-text {{ m.text }}

    section.blatt-abschnitt
      h2.abschnitt-titel ④ Für die Methodenlehre
      p Weil Blobtopia eine <b>Simulation</b> ist, kennt das Institut die wahren Populationswerte. Deine Stichproben-Schätzung lässt sich also mit der Wahrheit vergleichen — Zufalls­fehler, Messfehler und Nichtteilnahme werden sichtbar und getrennt lesbar.
      p Die Blobs antworten individuell nach ihren Eigenschaften, ihrer Stimmung und den Ereignissen — und bleiben dabei konsequent in ihrer Rolle, wie echte Befragte. So entsteht authentisches, verrauschtes Selbstauskunfts­material zum Auswerten.
      p.callout Erhobene Datensätze exportierst du als <b>.xlsx</b> und liest sie in R mit <span class="mono">mariposa::read_xlsx()</span> samt Variablen- und Wertelabels wieder ein — der ganze Weg von der Erhebung bis zur Analyse.

    .about-fuss Interne Lehr-Unterlage · Abt. Empirische Blobforschung
</template>

<script>
export default {
  name: 'About'
  , data() {
    return {
      distrikte: [
        { id: 0, name: 'Grüntal', text: 'Ländlich, geringere Einkommen, eher konservativ' }
        , { id: 1, name: 'Sonnenberg', text: 'Wohlhabend, akademisch, progressiv — die zufriedensten Blobs' }
        , { id: 2, name: 'Hafenviertel', text: 'Divers und gemischt, liberal geprägt' }
        , { id: 3, name: 'Mittelfeld', text: 'Mittelschicht, gemäßigt in der Mitte' }
        , { id: 4, name: 'Industriezone', text: 'Arbeiterprägung, geringere Bildung, oft unzufrieden' }
      ]
      , methoden: [
        {
          name: 'Befragungsinstitut'
          , tag: 'Schreibtisch'
          , text: 'Beauftrage eine standardisierte Umfrage: eigene Fragen und Antwortskalen formulieren, ein Auswahlverfahren wählen (Zufalls-, geschichtete, Klumpen-, Quoten- oder manuelle Stichprobe), Feld durchführen — heraus kommt ein echter Datensatz zum Auswerten.'
        }
        , {
          name: 'Interviews'
          , tag: 'Stadt'
          , text: 'Klicke einen Blob an und führe ein offenes Gespräch — frei formulierte Fragen zu Leben, Meinungen und Sorgen, für qualitatives Material.'
        }
        , {
          name: 'BlobFeed'
          , tag: 'BlobPhone'
          , text: 'Im Feed posten die Blobs kurze Nachrichten — sie spiegeln Stimmungen und Reaktionen auf Ereignisse wider.'
        }
        , {
          name: 'Zeitleiste'
          , tag: '22 Jahre'
          , text: 'Reise durch die Geschichte und beobachte, wie Wahlen und Krisen die Gesellschaft über die Zeit verändern.'
        }
        , {
          name: 'BlobGazetta'
          , tag: 'Presse'
          , text: 'Die Gazette berichtet über aktuelle Ereignisse — der mediale Blick auf Blobtopia.'
        }
      ]
    }
  }
}
</script>

<style lang="sass" scoped>
$korn: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")

// Die Seite: das Informationsblatt liegt auf der grünen Schreibunterlage
.about
  position: absolute
  inset: 0
  overflow: auto
  padding: 3rem 1.5rem 4rem
  background: linear-gradient(160deg, var(--inst-unterlage-1), var(--inst-unterlage-2))
  color: var(--inst-tinte)
  font-family: var(--inst-druck)

// Das Blatt selbst
.about-sheet
  max-width: 780px
  margin: 0 auto
  padding: 1.6rem 2rem 1.2rem
  background-color: var(--inst-papier-hell)
  background-image: $korn
  border-radius: 2px
  box-shadow: var(--inst-schatten-schwer)

// ── Briefkopf ──
.about-header
  display: flex
  align-items: center
  gap: 0.8rem

  .briefkopf-logo
    height: 42px
    flex-shrink: 0

  .header-text
    flex: 1
    min-width: 0

  .about-title
    font-weight: 800
    font-size: 1.05rem
    letter-spacing: 2px
    text-transform: uppercase
    color: var(--inst-tinte)

  .about-subtitle
    font-size: 0.72rem
    letter-spacing: 0.5px
    color: var(--inst-graphit)

  .formblatt-nr
    text-align: right
    font-family: var(--inst-schreibmaschine)
    font-size: 0.68rem
    color: var(--inst-beschriftung)
    flex-shrink: 0

.about-rule
  height: 0
  border-bottom: 2.5px solid var(--inst-tinte)
  margin: 0.55rem 0 1rem

// ── Zurück-Knopf ──
.back-btn
  display: inline-flex
  align-items: center
  gap: 0.4rem
  font-family: var(--inst-druck)
  font-weight: 700
  font-size: 0.72rem
  letter-spacing: 1px
  text-transform: uppercase
  color: var(--inst-stempelblau)
  background: rgba(255, 255, 255, 0.5)
  border: 2px solid var(--inst-stempelblau)
  border-radius: 4px
  padding: 5px 12px
  cursor: pointer
  box-shadow: 0 2px 0 rgba(51, 81, 142, 0.35)
  transition: transform 0.06s ease, box-shadow 0.06s ease
  &:hover
    background: rgba(255, 255, 255, 0.85)
  &:active
    transform: translateY(2px)
    box-shadow: 0 0 0 rgba(51, 81, 142, 0.35)
  .arrow
    font-size: 1rem
    line-height: 1

// ── Titel & Lead ──
.blatt-titel
  font-family: var(--inst-hand)
  font-size: 2.2rem
  font-weight: 700
  color: var(--inst-tinte)
  margin: 1.1rem 0 0.2rem
  line-height: 1

.blatt-lead
  font-size: 0.95rem
  color: var(--inst-tinte-soft)
  margin-bottom: 0.4rem
  line-height: 1.45

// ── Abschnitte ──
.blatt-abschnitt
  margin-top: 1.5rem

  p
    font-size: 0.9rem
    color: var(--inst-tinte)
    line-height: 1.5
    margin-bottom: 0.55rem
    b
      color: var(--inst-tinte)
      font-weight: 700

.abschnitt-titel
  font-family: var(--inst-druck)
  font-size: 0.72rem
  font-weight: 800
  letter-spacing: 2px
  text-transform: uppercase
  color: var(--inst-beschriftung)
  border-bottom: 1px solid rgba(141, 127, 99, 0.4)
  padding-bottom: 4px
  margin-bottom: 0.7rem

// ── Distrikte ──
.distrikt-liste
  display: flex
  flex-direction: column
  gap: 0.45rem

.distrikt-zeile
  display: grid
  grid-template-columns: 16px 130px 1fr
  align-items: baseline
  gap: 0.5rem

  .inst-flagge
    align-self: center
    width: 13px
    height: 13px

  .distrikt-name
    font-family: var(--inst-schreibmaschine)
    font-weight: 700
    color: var(--inst-tinte)
    font-size: 0.9rem

  .distrikt-text
    font-family: var(--inst-hand)
    font-size: 1.02rem
    color: var(--inst-tinte-soft)
    line-height: 1.15

// ── Methoden ──
.methode
  padding: 0.55rem 0.7rem
  margin-bottom: 0.5rem
  background: rgba(255, 252, 244, 0.7)
  border: 1.5px solid #ece1c8
  border-radius: 4px

  .methode-kopf
    display: flex
    align-items: baseline
    gap: 0.5rem
    margin-bottom: 0.2rem

  .methode-name
    font-weight: 800
    letter-spacing: 0.5px
    color: var(--inst-tinte)
    font-size: 0.95rem

  .methode-tag
    font-family: var(--inst-schreibmaschine)
    font-size: 0.6rem
    font-weight: 700
    letter-spacing: 0.5px
    text-transform: uppercase
    color: #fff
    background: var(--inst-stempelblau)
    padding: 1px 7px
    border-radius: 3px
    transform: rotate(-1.5deg)

  .methode-text
    font-size: 0.86rem
    color: var(--inst-tinte-soft)
    line-height: 1.4
    margin-bottom: 0

// erste Methode (Befragungsinstitut) hervorheben — das Kernwerkzeug
.methode:first-of-type
  border-color: rgba(51, 81, 142, 0.5)
  background: rgba(51, 81, 142, 0.06)

// ── Callout im Methoden-Abschnitt ──
.callout
  padding: 0.5rem 0.7rem
  background: rgba(51, 81, 142, 0.06)
  border-left: 3px solid var(--inst-stempelblau)
  border-radius: 3px
  font-size: 0.86rem !important
  .mono
    font-family: var(--inst-schreibmaschine)
    color: var(--inst-stempelblau)

// ── Fuß ──
.about-fuss
  margin-top: 1.6rem
  padding-top: 0.6rem
  border-top: 1px dashed rgba(141, 127, 99, 0.45)
  font-family: var(--inst-schreibmaschine)
  font-size: 0.62rem
  letter-spacing: 1px
  text-transform: uppercase
  color: var(--inst-beschriftung)
  text-align: center

@media (max-width: 560px)
  .about
    padding: 1rem 0.6rem 2rem
  .about-sheet
    padding: 1.1rem 1.1rem 1rem
  .about-header
    gap: 0.6rem
    .about-title
      font-size: 0.82rem
      letter-spacing: 1px
    .about-subtitle
      font-size: 0.66rem
  .formblatt-nr
    display: none
  .blatt-titel
    font-size: 1.8rem
  .distrikt-zeile
    grid-template-columns: 14px 1fr
    row-gap: 0
    .distrikt-text
      grid-column: 2
</style>
