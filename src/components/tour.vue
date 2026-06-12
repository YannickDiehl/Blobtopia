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
        Du blickst auf die Stadt — das ist dein Feld. Die farbigen Bereiche sind die
        fünf Distrikte, die kleinen Figuren sind Blobs: Bürger*innen mit eigenen
        Meinungen, Einstellungen und Emotionen.
  TourStep(:step="3")
    TypewriterTextTransition
      p.
        Tippe einen Blob an: Du bekommst seine Karteikarte mit deiner Feldnotiz.
        „Interview führen" startet ein Gespräch — das Protokoll läuft mit,
        wie bei echter Feldforschung.
  TourStep(:step="4")
    TypewriterTextTransition
      p.
        Oben hängen zwei Reiter: In der Stadt beobachtest und befragst du —
        am Schreibtisch wertest du aus. Dort liegt die Registratur mit deinen
        Studien, der Presse und dem verschlossenen Dozentenzimmer.
  TourStep(:step="5")
    TypewriterTextTransition
      p.
        Im Befragungsinstitut (Taste B) führst du ganze Studien durch: Fragebogen
        auf Formblatt S-3 entwerfen, Ziehungsplan ausfüllen, Feldarbeit planen —
        und die Datenlieferung als CSV mitnehmen.
  TourStep(:step="6")
    TypewriterTextTransition
      p.
        Auf dem BlobPhone siehst du, was die Blobs blubbern. Ihre Blubs spiegeln
        aktuelle Stimmungen und Reaktionen auf Ereignisse — Material für deine
        Inhaltsanalyse.
  TourStep(:step="7")
    TypewriterTextTransition
      p.
        Die Filmrolle unten ist das Stadtarchiv: 22 Jahre Aufzeichnung. Spule durch
        die Geschichte und beobachte, wie Wahlen, Krisen und Skandale die
        Gesellschaft verändern.
  TourStep(:step="8")
    TypewriterTextTransition
      p.
        Die wahren Werte der Blobs liegen versiegelt im Dozentenzimmer. Nutze
        Beobachtung, Interviews, Blubs und Befragungen, um sie zu schätzen —
        genau wie in der echten empirischen Sozialforschung.
  TourStep(button-text="Blobtopia erforschen!", is-last, :step="9")
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
