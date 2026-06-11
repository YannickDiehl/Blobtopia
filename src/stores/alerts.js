/**
 * Pinia store: alerts (Toasts/Fehlermeldungen).
 * Ehemals nicht-namespaced Vuex-Modul — Call-Sites waren un-präfixiert.
 */
import { defineStore } from 'pinia'
import _uniqueId from 'lodash/uniqueId'
import _differenceBy from 'lodash/differenceBy'

const DEFAULT_INFO_TIMEOUT = 5000
const DEFAULT_ERROR_TIMEOUT = 0 // persistent

export const useAlertsStore = defineStore('alerts', {
  state: () => ({
    errors: []
    , infos: []
  })
  , getters: {
    hasError: state => state.errors.length > 0
    , hasInfo: state => state.infos.length > 0
  }
  , actions: {
    error({ error, context, timeout }) {
      this.errors.push({
        id: _uniqueId('error-')
        , error
        , context
        , timeout: timeout || DEFAULT_ERROR_TIMEOUT
      })
      console.error(error)
      return error
    }
    , clearError({ id }) {
      this.errors = _differenceBy(this.errors, [{ id }], 'id')
    }
    , clearErrors() {
      this.errors = []
    }
    , info({ message, timeout }) {
      this.infos.push({
        id: _uniqueId('info-')
        , message
        , timeout: timeout || DEFAULT_INFO_TIMEOUT
      })
    }
    , clearInfo({ id }) {
      this.infos = _differenceBy(this.infos, [{ id }], 'id')
    }
    , clearInfos() {
      this.infos = []
    }
    , clearAll() {
      this.errors = []
      this.infos = []
    }
  }
})
