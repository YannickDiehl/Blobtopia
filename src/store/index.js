import Vue from 'vue'
import Vuex from 'vuex'

import { alerts } from './alerts'
import { chat } from './chat'
import { simulation } from './simulation'
import { survey } from './survey'

Vue.use(Vuex)

export default new Vuex.Store({
  strict: process.env.NODE_ENV !== 'production'
  , modules: {
    alerts
    , chat
    , simulation
    , survey
  }
})
