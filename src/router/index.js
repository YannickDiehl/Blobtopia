import { createRouter, createWebHashHistory } from 'vue-router'
import About from '@/pages/about'
import Simulation from '@/pages/simulation'
import CityEditor from '@/pages/city-editor'

let shownIntro = false

const parseProps = (route) => {
  return {
    ...route.params
    , showConfig: !!route.query.cfg
    , showIntro: route.query.intro | 0
    , generationIndex: route.params.generationIndex
    , hideControls: route.name === 'about'
    , hideSettings: route.name === 'about'
  }
}

const router = createRouter({
  // Hash-Mode wie zuvor — bestehende URLs (/#/s/0) bleiben gültig
  history: createWebHashHistory()
  , routes: [
    {
      path: '/'
      , redirect: { name: 'simulation', params: { generationIndex: '0' } }
    }
    , {
      path: '/s/:generationIndex'
      , name: 'simulation'
      , component: Simulation
      , props: parseProps
      , beforeEnter(to, from, next) {
        if (shownIntro){
          return next()
        }
        shownIntro = true
        next({ name: 'simulation', params: to.params, query: { ...to.query, intro: 1 }, replace: true })
      }
    }
    // Backward compatibility: redirect old routes to unified view
    , {
      path: '/s/:generationIndex/viewer'
      , redirect: to => ({
        name: 'simulation'
        , params: { generationIndex: to.params.generationIndex }
      })
    }
    , {
      path: '/s/:generationIndex/about'
      , name: 'about'
      , component: About
    }
    , {
      path: '/editor'
      , name: 'editor'
      , component: CityEditor
    }
    , {
      path: '/dashboard'
      , name: 'dashboard'
      // Lazy: das Analyse-Dashboard (inkl. Chart.js) bleibt aus dem
      // Haupt-Bundle der 3D-Ansicht draußen
      , component: () => import('@/pages/dashboard')
    }
    , {
      path: '/:pathMatch(.*)*'
      , redirect: { name: 'simulation', params: { generationIndex: '0' } }
    }
  ]
})

export default router
