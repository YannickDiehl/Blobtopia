<template lang="pug">
.about.scrollbars
  .container
    .section
      .content
        h1.title.is-size-2.has-text-primary Blobtopia
        h2.subtitle.is-size-5 Eine simulierte Gesellschaft für die Methodenlehre

        h3.title.is-size-4 Was ist Blobtopia?

        p.
          Blobtopia ist eine virtuelle Gesellschaft mit 500 Einwohner*innen (Blobs),
          die in fünf Distrikten leben. Jeder Blob hat demografische Merkmale
          (Einkommen, Bildung, Alter), politische Einstellungen (Zufriedenheit,
          L-R-Selbsteinschätzung, Vertrauen) und latente Konstrukte (Efficacy, Sozialkapital,
          Autoritarismus, Politikverdrossenheit, Materialismus).

        h3.title.is-size-4 Die fünf Distrikte

        .columns
          .column
            .tag.is-medium.district-tag(style="background-color: #4ecca3; color: #000") Grüntal
            p Ländlich, geringeres Einkommen, eher konservativ
          .column
            .tag.is-medium.district-tag(style="background-color: #f0c929; color: #000") Sonnenberg
            p Wohlhabend, akademisch, progressiv
          .column
            .tag.is-medium.district-tag(style="background-color: #5c9ded; color: #fff") Hafenviertel
            p Divers, gemischt, liberal
          .column
            .tag.is-medium.district-tag(style="background-color: #f09a40; color: #000") Mittelfeld
            p Mittelschicht, gemäßigt
          .column
            .tag.is-medium.district-tag(style="background-color: #999999; color: #fff") Industriezone
            p Arbeiterklasse, geringes Bildungsniveau

        h3.title.is-size-4 Interaktion

        ul
          li Klicke auf einen Blob, um seine Details zu sehen
          li Nutze die Steuerung rechts oben für Pause/Resume und Events
          li Im Statistik-Tab findest du Distrikt-Vergleiche und L-R-Selbsteinschätzung-Verteilungen
          li BlobFeed zeigt, was die Blobs gerade denken
          li Die Dozent*in kann Events auslösen (Wahlen, Wirtschaftskrisen, Skandale)

        h3.title.is-size-4 Für die Methodenlehre

        p.
          Blobtopia dient als Datenquelle für empirische Übungen.
          Die latenten Konstrukte (z.B. Politische Efficacy) können
          nicht direkt beobachtet werden, sondern nur über ihre Indikatoren
          gemessen werden — genau wie in der echten Sozialforschung.
</template>

<script>
export default {
  name: 'About'
}
</script>

<style lang="sass" scoped>
.about
  padding-top: 5rem
  max-height: 100%
  overflow: auto
  .container
    max-width: 1020px
.district-tag
  margin-bottom: 0.5rem
</style>
