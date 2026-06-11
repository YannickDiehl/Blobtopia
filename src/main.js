import { createApp, markRaw } from 'vue'
import { createPinia } from 'pinia'
import { createOruga, OrugaComponentPlugins } from '@oruga-ui/oruga-next'
import { bulmaConfig } from '@oruga-ui/theme-bulma'
import App from '@/app'
import router from '@/router'
import Gestures from '@/plugins/gestures'
import onResize from '@/plugins/on-resize'
import BuefyCompat from '@/plugins/buefy-compat'
import Copilot from '@/lib/copilot-stub'
import * as THREE from 'three'

import '@mdi/font/css/materialdesignicons.css'
// Bulma 1 + Oruga-Komponentenstyles (precompiled), dann App-Styles
import '@oruga-ui/theme-bulma/style.css'
import './styles/main.scss'

Copilot.registerType({
  type: 'Vector3'
  , default: markRaw(new THREE.Vector3())
  , interpolator: (from, to, t) => {
    let v = new THREE.Vector3()
    v.copy( from )
    return v.lerp( to, t )
  }
})

const app = createApp(App)

app.use(createPinia())
app.use(router)
// Oruga 0.13: createOruga(config, plugins) — Bulma-Theme-Config plus
// alle Komponenten-Plugins (der Default-Export allein registriert nichts)
app.use(createOruga(bulmaConfig, OrugaComponentPlugins))
app.use(BuefyCompat)
app.use(Gestures)
app.use(onResize)

if (import.meta.env.DEV) window.__app = app // Debug-Handle für e2e-Diagnosen

app.mount('#app')
