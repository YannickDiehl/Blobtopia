<template lang="pug">
.is-hidden
</template>

<script>
import { mapActions } from 'pinia'
import { useAlertsStore } from '@/stores/alerts'

export default {
  name: 'ErrorMessage'
  , props: {
    alert: {
      type: Object
    }
  }
  , watch: {
    alert: {
      handler(){
        if ( !this.alert ){ return }
        this.showAlert()
      }
      , immediate: true
    }
  }
  , methods: {
    ...mapActions(useAlertsStore, [
      'clearError'
    ])
    , showAlert(){
      let alert = this.alert
      this.$buefy.snackbar.open({
        message: alert.message +  (alert.context ? `<br/>(${alert.context})` : '')
        , duration: alert.timeout
        , indefinite: !alert.timeout
        , position: 'is-bottom-right'
        , type: 'is-info'
        , actionText: 'ok'
        , queue: true
        , onAction: () => {
          let id = alert.id
          this.clearError({ id })
        }
      })
    }
  }
}
</script>
