import Vue from 'vue'
import App from '@/app'
import router from '@/router'
import store from '@/store'
import Filters from '@/plugins/filters'
import Gestures from '@/plugins/gestures'
import onResize from '@/plugins/on-resize'
import Buefy from 'buefy'
import Copilot from '@/lib/copilot-stub'
import * as THREE from 'three'

import '@mdi/font/css/materialdesignicons.css'
// require styles
import './styles/main.scss'

Copilot.registerType({
  type: 'Vector3'
  , default: new THREE.Vector3()
  , interpolator: (from, to, t) => {
    let v = new THREE.Vector3()
    v.copy( from )
    return v.lerp( to, t )
  }
})

Vue.use(Buefy, {
  defaultContainerElement: '#app'
  // , defaultIconPack: 'fas'
})

// Vue.use(ElementComponents)
Vue.use(Filters)
Vue.use(Gestures)
Vue.use(onResize)

Vue.config.productionTip = false

new Vue({
  render: h => h(App)
  , router
  , store
}).$mount('#app')
