<template lang="pug">
.about.scrollbars
  .container
    .section
      .content
        b-button.back-btn(type="is-text", icon-left="arrow-left", @click="$router.back()") Zurück zur Simulation
        h1.title.is-size-2.has-text-primary Blobtopia
        h2.subtitle.is-size-5 Eine simulierte Gesellschaft für die Methodenlehre

        h3.title.is-size-4 Was ist Blobtopia?

        p.
          Blobtopia ist eine virtuelle Gesellschaft mit 500 Einwohner*innen (Blobs),
          die in fünf Distrikten leben. Die Simulation umfasst 22 Jahre Geschichte
          mit Wahlen, Krisen und gesellschaftlichen Veränderungen.

        p.
          Wie in der echten Sozialforschung kannst du die inneren Werte der Blobs
          nicht direkt sehen. Stattdessen erforschst du die Gesellschaft durch
          Interviews (direkte Gespräche mit den Blobs), Tweets (BlobFeed) und
          Beobachtung über die Zeit.

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

        h3.title.is-size-4 So erforschst du Blobtopia

        ul
          li #[strong Interviews:] Klicke auf einen Blob und wähle „Interview führen" — stelle Fragen zu Leben, Meinungen und Sorgen
          li #[strong BlobFeed:] Im Feed rechts siehst du Tweets der Blobs — sie spiegeln Stimmungen und Reaktionen auf Events wider
          li #[strong Zeitleiste:] Reise durch 22 Jahre Geschichte und beobachte, wie Events die Gesellschaft verändern
          li #[strong BlobGazetta:] In der Gazette findest du Nachrichtenartikel über aktuelle Ereignisse in Blobtopia

        h3.title.is-size-4 Für die Methodenlehre

        p.
          Blobtopia dient als lebendige Datenquelle für empirische Übungen.
          Die latenten Konstrukte der Blobs (z.B. Politische Efficacy, Sozialkapital,
          Autoritarismus) können nicht direkt beobachtet werden — genau wie in der
          echten Sozialforschung. Studierende müssen durch Befragung und Beobachtung
          herausfinden, was die Blobs denken und fühlen.

        p.
          Die Blobs antworten in Interviews individuell basierend auf ihren Eigenschaften,
          ihrer aktuellen Stimmung und den Ereignissen in Blobtopia. Sie bleiben dabei
          konsequent in ihrer Rolle — wie echte Befragte.
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
