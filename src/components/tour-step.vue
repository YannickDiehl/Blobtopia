<template lang="pug">
.tour-step(v-if="step === stepNumber")
  .content
    slot

  .controls
    slot(name="controls", :skip="skip", :next="next", :back="back")
      .level.is-mobile
        .level-left
          b-field(v-if="!isLast")
            p.control
              b-button.is-text(@click="skip") Überspringen
        .level-right
          b-field(position="is-right")
            p.control(v-if="step !== 1")
              b-button.btn-dark(@click="back") Zurück
            p.control
              b-button.is-primary(@click="next") {{ buttonText }}
</template>

<script>

export default {
  name: 'TourStep'
  , props: {
    buttonText: {
      default: 'Weiter'
    }
    , step: Number
    , isLast: Boolean
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
    skip(){
      this.$router.push({ ...this.$route, query: { intro: '' } })
    }
    , back(){
      this.$router.push({ ...this.$route, query: { intro: this.stepNumber - 1 } })
    }
    , next(){
      if (this.isLast){
        return this.skip()
      }

      this.$router.push({ ...this.$route, query: { intro: this.stepNumber + 1 } })
    }
  }
}
</script>

<style lang="sass" scoped>
// Tour-Karten im Karteikarten-Stil des Instituts (die Schreibmaschinen-
// Animation der Texte passt jetzt erst recht)
.tour-step
  max-width: 480px
  pointer-events: all
  background-color: var(--inst-papier-hell)
  background-image: repeating-linear-gradient(180deg, transparent 0 26px, var(--inst-kartei-linie) 26px 27px)
  border-radius: 2px
  padding: 1.61rem 1.61rem 1.2rem
  box-shadow: 0 2px 0 rgba(120, 90, 40, 0.25), 0 16px 34px rgba(50, 35, 10, 0.45)
  color: var(--inst-tinte)
  position: relative
  transform: rotate(-0.5deg)
  // rote Karteikarten-Randlinie
  &::before
    content: ''
    position: absolute
    top: 0
    bottom: 0
    left: 16px
    width: 1.5px
    background: var(--inst-randlinie)
    pointer-events: none

.content
  line-height: 1.35
  font-family: var(--inst-schreibmaschine)
  padding-left: 14px

  :deep(.title)
    color: var(--inst-tinte) !important
    font-family: var(--inst-schreibmaschine)
    text-shadow: none

  :deep(.has-text-primary)
    color: var(--inst-stempelblau) !important

.controls
  padding-left: 14px
  .button
    font-size: 0.9rem
</style>
