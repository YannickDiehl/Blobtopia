<template lang="pug">
.tour-steps
  TourStep(button-text="Los geht's", :step="1")
    .has-text-centered
      p.is-size-5 Willkommen in
      h5.title.is-size-3.has-text-primary Blobtopia
      h6.title.is-size-6 Eine simulierte Gesellschaft
      br
    p.
      Bevor wir loslegen, schauen wir uns kurz um...
    template(#controls="props")
      .level.is-mobile
        .level-left
          b-field
            b-button.is-text.skip(@click="props.skip") Überspringen
        .level-right
          b-field
            b-button.is-primary(@click="props.next") Los geht's

  TourStep(:step="2")
    TypewriterTextTransition
      p Das hier ist Blobtopia. Eine Stadt mit 500 Einwohner*innen in fünf Distrikten.
  TourStep(:step="3")
    TypewriterTextTransition
      p Klicke auf einen Blob, um seine Details zu sehen — Distrikt, Einkommen, Einstellungen.
  TourStep(:step="4")
    TypewriterTextTransition
      p.
        Jeder Blob hat politische Einstellungen: Zufriedenheit, L-R-Selbsteinschätzung und
        Vertrauen in Institutionen. Diese verändern sich über die Zeit.
  TourStep(:step="5")
    TypewriterTextTransition
      p.
        Die Dozent*in kann Events auslösen — Wahlen, Wirtschaftskrisen, Skandale —
        und beobachten, wie die Gesellschaft reagiert.
  TourStep(button-text="Blobtopia erkunden!", is-last, :step="6")
    TypewriterTextTransition
      p.
        Rechts oben findest du Steuerungen und BlobFeed.
        Im Statistik-Tab siehst du Distrikt-Vergleiche.
      p (Mehr Details auf der Info-Seite)
</template>

<script>
import TourStep from '@/components/tour-step'
import TypewriterTextTransition from '@/components/typewriter-text.transition'

export default {
  name: 'TourSteps'
  , props: {
  }
  , components: {
    TourStep
    , TypewriterTextTransition
  }
  , data: () => ({
  })
  , mounted(){
  }
  , watch: {
  }
  , computed: {
    stepNumber(){
      return this.$route.query.intro | 0
    }
  }
  , methods: {
  }
}
</script>

<style lang="sass" scoped>
.button.skip
  color: darken($grey-light, 10)
</style>
