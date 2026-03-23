<template lang="pug">
.tour-steps
  TourStep(button-text="Los geht's", :step="1")
    .has-text-centered
      p.is-size-5 Willkommen in
      h5.title.is-size-3.has-text-primary Blobtopia
      h6.title.is-size-6 Eine simulierte Gesellschaft
      br
    p.
      Blobtopia ist eine Stadt mit 500 Einwohner*innen in fünf Distrikten.
      Deine Aufgabe: Erforsche diese Gesellschaft wie ein/e echte/r Sozialforscher*in.
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
      p.
        Du siehst die Stadt von oben. Die farbigen Bereiche sind die fünf Distrikte.
        Die kleinen Figuren sind Blobs — Bürger*innen mit eigenen Meinungen, Einstellungen und Emotionen.
  TourStep(:step="3")
    TypewriterTextTransition
      p.
        Klicke auf einen Blob und wähle „Interview führen". Du kannst direkt mit den
        Einwohner*innen sprechen — stelle Fragen zu ihrem Leben, ihrer Meinung und ihren Sorgen.
  TourStep(:step="4")
    TypewriterTextTransition
      p.
        Im Feed rechts siehst du, was die Blobs tweeten. Ihre Tweets spiegeln aktuelle
        Stimmungen und Reaktionen auf Ereignisse wider.
  TourStep(:step="5")
    TypewriterTextTransition
      p.
        Nutze die Zeitleiste unten, um durch 22 Jahre Blobtopia-Geschichte zu reisen.
        Beobachte, wie Events — Wahlen, Krisen, Skandale — die Gesellschaft verändern.
  TourStep(:step="6")
    TypewriterTextTransition
      p.
        Du kannst die inneren Werte der Blobs nicht direkt sehen.
        Nutze Interviews, Tweets und Beobachtung, um die Gesellschaft zu verstehen —
        genau wie in der echten empirischen Sozialforschung.
  TourStep(button-text="Blobtopia erforschen!", is-last, :step="7")
    TypewriterTextTransition
      p Viel Spaß beim Erforschen von Blobtopia!
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
