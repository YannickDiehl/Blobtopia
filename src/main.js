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

import Chart from 'chart.js'
Chart.defaults.global.defaultFontColor = '#fffbfc'
Chart.defaults.global.defaultFontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
Chart.defaults.global.elements.line.borderWidth = 1.5
Chart.defaults.global.elements.point.radius = 0
Chart.defaults.global.elements.point.hitRadius = 6
Chart.defaults.global.legend.labels.fontColor = '#aaa'
Chart.defaults.global.legend.labels.boxWidth = 12
Chart.defaults.scale.gridLines.color = 'rgba(255,255,255,0.06)'
Chart.defaults.scale.gridLines.zeroLineColor = 'rgba(255,255,255,0.15)'
Chart.defaults.scale.ticks.fontColor = '#888'

new Vue({
  render: h => h(App)
  , router
  , store
}).$mount('#app')
