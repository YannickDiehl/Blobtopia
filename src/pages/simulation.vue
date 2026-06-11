<template lang="pug">
.playground
  InstructorLayout(ref="layout")
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import InstructorLayout from '@/components/instructor/InstructorLayout'

export default {
  name: 'Simulation'
  , props: {
    showConfig: Boolean
    , showIntro: Number
    , hideControls: Boolean
    , hideSettings: Boolean
  }
  , components: {
    InstructorLayout
  }
  , mounted(){
    this.$nextTick(() => {
      if (!this.generation){
        this.run(false)
      }
    })
  }
  , computed: {
    tourStepNumber(){
      return this.$route.query.intro | 0
    }
    , generation(){
      return this.getCurrentGeneration()
    }
    , genIndex(){
      return this.generationIndex
    }
    , ...mapStores(useSimulationStore)
    , ...mapState(useSimulationStore, {
      canContinue: 'canContinue'
      , isLoading: 'isLoading'
      , isContinuing: 'isContinuing'
      , getCurrentGeneration: 'getCurrentGeneration'
      , generationIndex: 'currentGenerationIndex'
      , config: 'config'
      , stats: 'statistics'
    })
  }
  , methods: {
    run(fresh){
      return this.simulationStore.run(fresh)
    }
  }
}
</script>

<style lang="sass" scoped>
.playground
  height: 100%
  display: flex
  flex-direction: column
  min-height: 0

  > *
    flex: 1
</style>
