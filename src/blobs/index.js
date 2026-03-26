import * as THREE from 'three'
import THREEObjectMixin from '@/components/three-vue/v3-object.mixin'
import { buildingRegistry, walkableGrid } from '@/city'
import { findPath, randomWalkableNear } from '@/lib/pathfinder'
import { WORLD_SCALE, TRANSIT_SPEED } from '@/config/world'

import { createBlob, cachedVisionCircle, cachedEnergyCircle, blobMaterialProps } from './blob-mesh'
import { visualPositions } from './visual-positions'
import { assignLocations, findNearestBuilding, resolveBuildingPos, findCivicBuilding, chooseOutdoorZone } from './blob-locations'
import { getScheduledState } from './blob-schedule'
import { snapToWalkable } from './blob-movement'
import { computeHourPositions, interpolateAlongPath, getCachedPath } from './position-cache'
import { computeWanderPosition } from './film-wander'

// Deterministic PRNG (mulberry32) — same seed = same sequence on all clients
function mulberry32 (seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

// Micro-walk configuration per idle state (live mode only)
const MICRO_WALK_CONFIG = {
  'AT_WORK':    { radius: 60,  intervalMs: 90000 },  // "meeting" — to nearby building
  'AT_HOME':    { radius: 120, intervalMs: 60000 },  // "errand" — to nearby shop
  'AT_LUNCH':   { radius: 30,  intervalMs: 120000 }, // rarely — sitting and eating
  'AT_SHOP':    { radius: 80,  intervalMs: 60000 },  // browsing around
  'AT_SOCIAL':  { radius: 100, intervalMs: 50000 },  // socializing, moving around
  'AT_LEISURE': { radius: 150, intervalMs: 45000 },  // strolling
  'AT_STROLL':  { radius: 200, intervalMs: 30000 },  // walking outdoor zone route
  'AT_PROTEST': { radius: 80,  intervalMs: 50000 },  // moving in crowd
}

// Transit speed multipliers per activity
const SPEED_MAP = {
  'GO_TO_WORK': 1.4, 'GO_TO_HOME': 1.5, 'GO_TO_LUNCH': 0.9
  , 'GO_TO_SHOP': 0.8, 'GO_TO_SOCIAL': 0.7, 'GO_TO_LEISURE': 0.6
  , 'GO_TO_STROLL': 0.5, 'GO_TO_PROTEST': 1.2
}


export default {
  name: 'BlobCreature'
  , mixins: [ THREEObjectMixin ]
  , inject: [ 'getStep' ]
  , props: {
    creature: Object
    , showSightIndicator: Boolean
    , showEnergyIndicator: Boolean
    , ...blobMaterialProps
  }
  , components: {
  }
  , data: () => ({
  })
  , computed: {
    steps(){
      return this.creature.movement_history.length
    }
    , spline(){
      return new THREE.SplineCurve(this.creature.movement_history.map(p => {
        return new THREE.Vector2(p[0], p[1])
      }))
    }
  }
  , created(){
    // Per-blob animation state (persistent across frames, survives tick updates)
    this._cx = null  // current smoothed x
    this._cy = null  // current smoothed y
    // Deterministic phase and seed from blob ID
    const idHash = (this.creature.id || '').toString().split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0)
    this._blobSeed = Math.abs(idHash)
    this._rng = mulberry32(this._blobSeed)
    this._phase = this._rng() * Math.PI * 2
    this._frameCount = 0

    // Film-mode state
    this._hourPositions = null   // Array<24> of keyframe positions
    this._filmScheduleId = null  // Track when to recompute keyframes
    this._filmPath = null        // Current transit A* path
    this._filmPathKey = ''       // Cache key for current transit path

    // Locations & schedule (populated in assignLocations)
    this._homeBuilding = null   // {x, z}
    this._workplace = null      // {x, z}
    this._lunchSpot = null      // {x, z} — where they go during lunch
    this._leisureSpot = null    // {x, z} — outdoor zone for GO_TO_LEISURE
    this._shopSpot = null       // {x, z} — nearest shop/supermarket for GO_TO_SHOP
    this._socialSpot = null     // {x, z} — nearest café/bar for GO_TO_SOCIAL
    this._leisureZone = null    // outdoor zone object (null = building-based leisure)
    this._strollZone = null     // outdoor zone for strolling (chosen per stroll phase)
    this._lunchOutdoor = false  // true if lunch is at an outdoor zone
    this._locationsAssigned = false
    this._lastScheduleId = null  // Track schedule changes for tick-based reassignment
    this._schedule = null       // individual daily schedule (array of {hour, state})

    // Individual traits (set in assignLocations based on creature data)
    this._wanderSpeed = 0.4
    this._wanderRadius = 100
    this._commuteMaxDist = 600

    // Pathfinding state
    this._path = []           // array of {x, z} waypoints
    this._pathIndex = 0       // current waypoint index

    // Day state
    this._fadeOpacity = 1
    this._dayState = 'SLEEPING'
    this._arrived = false
    this._idleCenter = null    // {x, z} center point for idle micro-movement

    // Micro-walk state (idle enrichment, live mode only)
    this._microWalkTimer = 0   // ms since last micro-walk
    this._microWalkPath = null // {x, z}[] waypoints for current micro-walk
    this._microWalkIndex = 0   // current waypoint in micro-walk
    this._microWalkReturn = null // {x, z} position to return to after micro-walk
    this._inMicroWalk = false  // currently doing a micro-walk?
    this._lastFrameTime = 0    // for delta-time calculation

    this.beforeDraw(() => {
      let pos = this.v3object.position
      let p = this.creature.movement_history[0]
      let serverX = p[0] * WORLD_SCALE
      let serverY = p[1] * WORLD_SCALE

      // Assign locations + schedule (deferred until registry + grid are populated)
      // Re-assign when server_schedule changes (timeline tick change)
      const currentScheduleId = this.creature.server_schedule
        ? JSON.stringify(this.creature.server_schedule.entries.length) + '_' + this.creature.attitudes.political_satisfaction
        : null
      const needsReassign = !this._locationsAssigned
        || (currentScheduleId && this._lastScheduleId !== currentScheduleId)

      // Wait for city to finish loading (buildingRegistry is rebuilt async after Kenney models load)
      if (needsReassign && walkableGrid.grid && buildingRegistry.length > 0) {
        this._locationsAssigned = true
        this._lastScheduleId = currentScheduleId
        // Reset RNG for deterministic results from same blob ID
        const idHash2 = (this.creature.id || '').toString().split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0)
        this._rng = mulberry32(Math.abs(idHash2))
        this._phase = this._rng() * Math.PI * 2
        const locs = assignLocations(this.creature, this._phase, buildingRegistry, serverX, serverY, this._rng)
        this._homeBuilding = locs.homeBuilding
        this._workplace = locs.workplace
        this._lunchSpot = locs.lunchSpot
        this._leisureSpot = locs.leisureSpot
        this._shopSpot = locs.shopSpot
        this._socialSpot = locs.socialSpot
        this._leisureZone = locs.leisureZone
        this._lunchOutdoor = locs.lunchOutdoor
        this._schedule = locs.schedule
        this._wanderSpeed = locs.wanderSpeed
        this._wanderRadius = locs.wanderRadius
        this._commuteMaxDist = locs.commuteMaxDist
        this._blobName = locs.blobName
        // Reset pathfinding on tick change
        this._path = []
        this._pathIndex = 0
        this._arrived = false
        this._needsInitialTransit = true
        // Invalidate film-mode keyframes
        this._hourPositions = null
        this._filmPath = null
        this._filmPathKey = ''
      }

      // Initialize position: spawn at home building, not server sim-coords
      if (this._cx === null) {
        if (this._homeBuilding) {
          this._cx = this._homeBuilding.x
          this._cy = this._homeBuilding.z
        } else {
          this._cx = serverX
          this._cy = serverY
        }
        pos.set(this._cx, 0, this._cy)
      }

      // ══════════════════════════════════════════════════════════
      // FILM MODE: Deterministic timeline playback
      // ══════════════════════════════════════════════════════════
      if (this.$store.state.simulation.timelineMode && this._locationsAssigned) {
        this._filmModeDraw(pos)
        // Write visual position for building-inspector (film mode)
        if (this.creature && this.creature.id) {
          visualPositions.set(this.creature.id, { x: this._cx, z: this._cy })
        }
        return  // Skip entire live-animation code path
      }

      // Skip animation when paused
      if (this.$store && this.$store.state.simulation.paused) {
        return
      }

      // --- Resolve current state from individual schedule ---
      const hour = this.$store.state.simulation.hour
      let prevState = this._dayState
      const scheduled = getScheduledState(this._schedule, hour)

      // Resolve target state from schedule
      let targetState = scheduled.state

      // If schedule says AT_* but blob is still in the corresponding GO_TO_* transit,
      // don't interrupt — let it finish walking. The transit→idle transition happens
      // automatically in the movement code when the blob arrives.
      const TRANSIT_FOR_IDLE = {
        'AT_WORK': 'GO_TO_WORK', 'AT_LUNCH': 'GO_TO_LUNCH'
        , 'AT_SHOP': 'GO_TO_SHOP', 'AT_SOCIAL': 'GO_TO_SOCIAL'
        , 'AT_LEISURE': 'GO_TO_LEISURE', 'AT_STROLL': 'GO_TO_STROLL'
        , 'AT_PROTEST': 'GO_TO_PROTEST'
      }
      if (targetState.startsWith('AT_') && this._dayState === TRANSIT_FOR_IDLE[targetState]) {
        // Already in transit to this destination — don't re-trigger
        targetState = this._dayState
      }

      // Force initial transit: if we just spawned/reassigned and schedule says AT_*,
      // convert it to the corresponding GO_TO_* so the blob actually navigates there
      if (this._needsInitialTransit && targetState.startsWith('AT_')) {
        targetState = TRANSIT_FOR_IDLE[targetState] || targetState
        this._needsInitialTransit = false
        this._dayState = 'SLEEPING'
      }
      this._transitionTo(targetState, scheduled.building_id)

      const st = this._dayState

      // --- Visibility & opacity ---
      // States where the blob is not visible outdoors
      const isIndoors = st === 'SLEEPING' || st === 'AT_WORK'
      // Fade out when going home and close to home
      let fadingHome = false
      if (st === 'GO_TO_HOME' && this._homeBuilding) {
        const hdx = this._homeBuilding.x - this._cx
        const hdz = this._homeBuilding.z - this._cy
        if (Math.sqrt(hdx * hdx + hdz * hdz) < 15) fadingHome = true
      }

      if (isIndoors || fadingHome) {
        this._fadeOpacity = Math.max(0, this._fadeOpacity - 0.05)
        if (this._fadeOpacity <= 0) this.v3object.visible = false
        if (this.blobMaterial) this.blobMaterial.opacity = this._fadeOpacity
        if (isIndoors && this._fadeOpacity <= 0) return
      } else {
        // Wake up / appear
        if (prevState === 'SLEEPING' && st !== 'SLEEPING') {
          this.v3object.visible = true
          if (this._homeBuilding) {
            this._cx = this._homeBuilding.x
            this._cy = this._homeBuilding.z
            pos.set(this._cx, 0, this._cy)
          }
        }
        this.v3object.visible = true
        this._fadeOpacity = Math.min(1, this._fadeOpacity + 0.05)
        if (this.blobMaterial) this.blobMaterial.opacity = this._fadeOpacity
      }

      // --- Movement ---
      // Delta-time (seconds since last frame, capped to avoid jumps after sleep/pause)
      const now = performance.now()
      const dtSec = this._lastFrameTime > 0
        ? Math.min((now - this._lastFrameTime) / 1000, 0.1)
        : 1 / 60
      this._lastFrameTime = now

      this._frameCount += 1
      let time = this._frameCount * 0.002 * this._wanderSpeed

      // Determine if we're in a TRANSIT state (following a path) or IDLE state (at destination)
      const isTransit = st.startsWith('GO_TO_')
      const isIdle = st.startsWith('AT_')

      if (isTransit && this._path.length > 0 && this._pathIndex < this._path.length) {
        // --- TRANSIT: follow path waypoints ---
        const wp = this._path[this._pathIndex]
        const dx = wp.x - this._cx
        const dz = wp.z - this._cy
        const dist = Math.sqrt(dx * dx + dz * dz)

        // Frame-based speed: TRANSIT_SPEED (world.js) is the single tuning knob
        let speed = (SPEED_MAP[st] || 1.0) * this._wanderSpeed * TRANSIT_SPEED

        if (dist < speed + 1) {
          this._cx = wp.x
          this._cy = wp.z
          this._pathIndex++
          if (this._pathIndex >= this._path.length) {
            this._arrived = true
          }
        } else {
          this._cx += (dx / dist) * speed
          this._cy += (dz / dist) * speed
        }
      } else if (isTransit && this._arrived) {
        // Transit complete → transition to corresponding AT_* idle state
        const TRANSIT_TO_IDLE = {
          'GO_TO_WORK': 'AT_WORK', 'GO_TO_LUNCH': 'AT_LUNCH'
          , 'GO_TO_SHOP': 'AT_SHOP', 'GO_TO_SOCIAL': 'AT_SOCIAL'
          , 'GO_TO_LEISURE': 'AT_LEISURE', 'GO_TO_STROLL': 'AT_STROLL'
          , 'GO_TO_PROTEST': 'AT_PROTEST'
        }
        const idleState = TRANSIT_TO_IDLE[st]
        if (idleState) {
          this._dayState = idleState
          this._setIdleCenter()
          this._path = []
          this._pathIndex = 0
        }
      } else if (isIdle) {
        // --- IDLE: micro-walks + sinusoidal drift ---
        this._microWalkTimer += dtSec * 1000 // accumulate in ms

        // Use outdoor zone micro-walk config if at an outdoor leisure/lunch/stroll spot
        const isOutdoorLeisure = st === 'AT_LEISURE' && this._leisureZone
        const isOutdoorLunch = st === 'AT_LUNCH' && this._lunchOutdoor
        const isOutdoorStroll = st === 'AT_STROLL' && this._strollZone
        const outdoorConfig = (isOutdoorLeisure && this._leisureZone.microWalk)
          || (isOutdoorStroll && this._strollZone.microWalk)
          || (isOutdoorLunch ? { radius: 120, intervalMs: 50000 } : null)
        const config = outdoorConfig || MICRO_WALK_CONFIG[st]
        const intervalMs = config ? config.intervalMs : 90000
        const microRadius = config ? config.radius : 60

        // Start a micro-walk when timer expires
        if (!this._inMicroWalk && this._microWalkTimer > intervalMs && this._idleCenter && walkableGrid.grid) {
          this._microWalkTimer = 0
          const tick = this.$store.state.simulation.tick
          const seed = (this.creature.id || this._phase * 1000) * 10000 + tick * 100 + hour
          const rng = mulberry32(seed)
          const target = randomWalkableNear(this._cx, this._cy, microRadius, walkableGrid, rng)
          if (target) {
            const path = findPath(this._cx, this._cy, target.x, target.z, walkableGrid, 2000)
            if (path.length > 1) {
              this._microWalkReturn = { x: this._idleCenter.x, z: this._idleCenter.z }
              this._microWalkPath = path
              this._microWalkIndex = 0
              this._inMicroWalk = true
            }
          }
        }

        if (this._inMicroWalk && this._microWalkPath) {
          // Follow micro-walk path (leisurely, half transit speed)
          const wp = this._microWalkPath[this._microWalkIndex]
          const dx = wp.x - this._cx
          const dz = wp.z - this._cy
          const dist = Math.sqrt(dx * dx + dz * dz)
          const speed = 0.5 * this._wanderSpeed * TRANSIT_SPEED

          if (dist < speed + 1) {
            this._cx = wp.x
            this._cy = wp.z
            this._microWalkIndex++
            if (this._microWalkIndex >= this._microWalkPath.length) {
              if (this._microWalkReturn) {
                const returnPath = findPath(this._cx, this._cy, this._microWalkReturn.x, this._microWalkReturn.z, walkableGrid, 2000)
                if (returnPath.length > 0) {
                  this._microWalkPath = returnPath
                  this._microWalkIndex = 0
                  this._microWalkReturn = null
                } else {
                  this._inMicroWalk = false
                  this._microWalkPath = null
                }
              } else {
                this._inMicroWalk = false
                this._microWalkPath = null
                this._setIdleCenter()
              }
            }
          } else {
            this._cx += (dx / dist) * speed
            this._cy += (dz / dist) * speed
          }
        } else {
          this._doIdleDrift(st, time)
        }
      }

      // Subtle organic sway (always applied)
      let swayX = Math.sin(time * 1.7 + this._phase) * 0.25
      let swayY = Math.cos(time * 1.3 + this._phase * 0.7) * 0.25
      pos.set(this._cx + swayX, 0, this._cy + swayY)

      // Face movement direction (transit paths + micro-walk paths)
      let faceWp = null
      if (this._path.length > 0 && this._pathIndex < this._path.length) {
        faceWp = this._path[this._pathIndex]
      } else if (this._inMicroWalk && this._microWalkPath && this._microWalkIndex < this._microWalkPath.length) {
        faceWp = this._microWalkPath[this._microWalkIndex]
      }
      if (faceWp) {
        let fdx = faceWp.x - this._cx
        let fdz = faceWp.z - this._cy
        if (Math.abs(fdx) > 0.5 || Math.abs(fdz) > 0.5) {
          let targetAng = Math.atan2(fdx, fdz)
          let rot = this.v3object.rotation
          let diff = targetAng - rot.y
          while (diff > Math.PI) diff -= Math.PI * 2
          while (diff < -Math.PI) diff += Math.PI * 2
          rot.y += diff * 0.05
        }
      }

      // Write visual position to shared cache for building-inspector
      if (this.creature && this.creature.id) {
        visualPositions.set(this.creature.id, { x: this._cx, z: this._cy })
      }
    })
  }
  , methods: {
    createObject(){ 
      this.tmpV2 = new THREE.Vector2()
      this.v3object = new THREE.Group()
      this.blobObject = createBlob()
      this.v3object.add(this.blobObject)
      let blobMesh = this.v3object.getObjectByName('blob')
      this.blobMesh = blobMesh
      blobMesh.material = blobMesh.material.clone()
      this.blobMaterial = blobMesh.material
      this.blobMaterial.transparent = true
      this.registerDisposables(this.blobObject.material)

      this.leftEye = this.blobObject.getObjectByName('left-eye')
      this.rightEye = this.blobObject.getObjectByName('right-eye')

      // vision radius
      // material and geometry are reused between creatures
      let visionIndicator = this.visionIndicator = cachedVisionCircle.clone(false)
      this.v3object.add(visionIndicator)

      // energy indicator (geometry reused)
      let energyIndicator = this.energyIndicator = cachedEnergyCircle.clone(false)
      energyIndicator.material = cachedEnergyCircle.material.clone()
      this.registerDisposables([ energyIndicator.material ])
      this.v3object.add(energyIndicator)
    }

    // ══════════════════════════════════════════════════════════
    // Film-mode draw: deterministic position from keyframes
    // ══════════════════════════════════════════════════════════
    , _filmModeDraw(pos) {
        const simState = this.$store.state.simulation
        const hour = simState.hour
        const frac = simState.subHourFraction || 0
        const tick = simState.tick || 0

        // Compute keyframes if not yet done (or invalidated by tick change)
        if (!this._hourPositions) {
          this._hourPositions = computeHourPositions(
            this._schedule,
            { homeBuilding: this._homeBuilding, workplace: this._workplace,
              lunchSpot: this._lunchSpot, leisureSpot: this._leisureSpot,
              shopSpot: this._shopSpot || this._leisureSpot,
              socialSpot: this._socialSpot || this._leisureSpot },
            buildingRegistry
          )
        }

        const kf = this._hourPositions[hour]
        if (!kf) return

        // Indoor states: hide blob
        if (kf.indoor) {
          this._fadeOpacity = Math.max(0, this._fadeOpacity - 0.1)
          if (this._fadeOpacity <= 0) this.v3object.visible = false
          if (this.blobMaterial) this.blobMaterial.opacity = this._fadeOpacity
          return
        }

        // Ensure visible
        this.v3object.visible = true
        this._fadeOpacity = Math.min(1, this._fadeOpacity + 0.1)
        if (this.blobMaterial) this.blobMaterial.opacity = this._fadeOpacity

        const isTransit = kf.state.startsWith('GO_TO_')
        const isIdle = kf.state.startsWith('AT_')

        if (isTransit) {
          // Transit: interpolate along A* path to transit target (kf position)
          // startPos = last keyframe with a DIFFERENT state (handles consecutive different transits
          // without teleporting back to the last idle position)
          let startPos = { x: kf.x, z: kf.z }
          for (let h = hour - 1; h >= 0; h--) {
            const prev = this._hourPositions[h]
            if (prev.state !== kf.state) {
              startPos = { x: prev.x, z: prev.z }
              break
            }
          }
          const endPos = { x: kf.x, z: kf.z }

          // Get cached A* path
          const pk = `${Math.round(startPos.x)},${Math.round(startPos.z)}→${Math.round(endPos.x)},${Math.round(endPos.z)}`
          if (this._filmPathKey !== pk) {
            this._filmPathKey = pk
            if (walkableGrid.grid) {
              this._filmPath = getCachedPath(startPos.x, startPos.z, endPos.x, endPos.z, walkableGrid)
            } else {
              this._filmPath = [startPos, endPos]
            }
          }

          // How far through this transit hour are we?
          // Count consecutive transit hours to spread the path over multiple hours
          let transitStart = hour
          for (let h = hour - 1; h >= 0; h--) {
            if (this._hourPositions[h].state === kf.state) transitStart = h
            else break
          }
          let transitEnd = hour
          for (let h = hour + 1; h < 24; h++) {
            if (this._hourPositions[h].state === kf.state) transitEnd = h
            else break
          }
          const totalTransitHours = transitEnd - transitStart + 1
          const hoursElapsed = hour - transitStart + frac
          const transitFrac = Math.min(1, hoursElapsed / totalTransitHours)

          // If arrived at destination, wander around using waypoint patrol
          if (transitFrac >= 1.0) {
            const deterministicTime = tick * 24 + hour + frac
            const isStroll = kf.state === 'GO_TO_STROLL'
            const radius = isStroll ? 60 : 20
            const wp = computeWanderPosition(
              kf.x, kf.z, deterministicTime, this._phase,
              this._blobSeed, this._wanderSpeed, radius
            )
            this._cx = wp.x
            this._cy = wp.z
          } else {
            const interpPos = interpolateAlongPath(this._filmPath, transitFrac)
            this._cx = interpPos.x
            this._cy = interpPos.z

            // Perpendicular lane offset: each blob walks on a slightly different
            // "lane" of the road, preventing pile-ups at grid cell centers.
            // Compute movement direction from path to get perpendicular vector.
            if (this._filmPath && this._filmPath.length > 1) {
              const pathIdx = Math.min(Math.floor(transitFrac * (this._filmPath.length - 1)), this._filmPath.length - 2)
              const pA = this._filmPath[pathIdx]
              const pB = this._filmPath[pathIdx + 1]
              const pdx = pB.x - pA.x
              const pdz = pB.z - pA.z
              const pLen = Math.sqrt(pdx * pdx + pdz * pdz)
              if (pLen > 0.1) {
                // Perpendicular: rotate direction 90° → (-dz, dx), normalise, scale by phase-based offset
                const laneOffset = (this._phase / (Math.PI * 2) - 0.5) * 10  // ±5 world units
                this._cx += (-pdz / pLen) * laneOffset
                this._cy += (pdx / pLen) * laneOffset
              }
            }
          }

          // Face direction of movement (transit path or wander waypoint)
          let fdx = 0, fdz = 0
          if (transitFrac >= 1.0) {
            // Wandering: use waypoint direction
            const deterministicTime2 = tick * 24 + hour + frac
            const isStroll2 = kf.state === 'GO_TO_STROLL'
            const wp2 = computeWanderPosition(kf.x, kf.z, deterministicTime2, this._phase, this._blobSeed, this._wanderSpeed, isStroll2 ? 60 : 20)
            fdx = wp2.dirX; fdz = wp2.dirZ
          } else if (this._filmPath && this._filmPath.length > 1) {
            // In-transit: use path direction
            const nextIdx = Math.min(Math.floor(transitFrac * (this._filmPath.length - 1)) + 1, this._filmPath.length - 1)
            const faceTarget = this._filmPath[nextIdx]
            fdx = faceTarget.x - this._cx
            fdz = faceTarget.z - this._cy
          }
          if (Math.abs(fdx) > 0.5 || Math.abs(fdz) > 0.5) {
            const targetAng = Math.atan2(fdx, fdz)
            const rot = this.v3object.rotation
            let diff = targetAng - rot.y
            while (diff > Math.PI) diff -= Math.PI * 2
            while (diff < -Math.PI) diff += Math.PI * 2
            rot.y += diff * 0.1
          }
        } else if (isIdle) {
          // Idle: waypoint-based wandering around keyframe position
          const deterministicTime = tick * 24 + hour + frac
          const IDLE_RADIUS = {
            'AT_LUNCH': 12, 'AT_SHOP': 15, 'AT_SOCIAL': 20,
            'AT_LEISURE': 40, 'AT_STROLL': 60, 'AT_PROTEST': 20
          }
          let radius = IDLE_RADIUS[kf.state] || 10
          if ((kf.state === 'AT_LEISURE' && this._leisureZone) || (kf.state === 'AT_STROLL' && this._strollZone)) {
            radius = 80
          } else if (kf.state === 'AT_LUNCH' && this._lunchOutdoor) {
            radius = 40
          }
          const wp = computeWanderPosition(
            kf.x, kf.z, deterministicTime, this._phase,
            this._blobSeed, this._wanderSpeed, radius
          )
          this._cx = wp.x
          this._cy = wp.z
        } else {
          // SLEEPING or other — just set position to keyframe
          this._cx = kf.x
          this._cy = kf.z
        }

        // Deterministic sway (uses tick+hour instead of frame count)
        const deterministicTime = tick * 24 + hour + frac
        const swayTime = deterministicTime * 0.002 * this._wanderSpeed
        const swayX = Math.sin(swayTime * 1.7 + this._phase) * 0.25
        const swayY = Math.cos(swayTime * 1.3 + this._phase * 0.7) * 0.25
        pos.set(this._cx + swayX, 0, this._cy + swayY)
      }

    // Sinusoidal idle drift (shared between live and playback mode)
    , _doIdleDrift(st, time) {
        const IDLE_RADIUS = {
          'AT_WORK': 3, 'AT_LUNCH': 5, 'AT_SHOP': 3
          , 'AT_SOCIAL': 4, 'AT_LEISURE': 8, 'AT_STROLL': 25
          , 'AT_PROTEST': 4
        }
        const radius = IDLE_RADIUS[st] || 3
        const idleSpeed = 0.15 * this._wanderSpeed

        if (this._idleCenter) {
          const ox = Math.sin(time * 0.7 + this._phase) * radius
          const oz = Math.cos(time * 0.5 + this._phase * 1.3) * radius
          let targetX = this._idleCenter.x + ox
          let targetZ = this._idleCenter.z + oz

          // Constrain idle drift to roads (1) and Gehwege/deco (2) only
          if (walkableGrid.grid) {
            const { grid, size, gridRes } = walkableGrid
            const gx = Math.floor(targetX / gridRes)
            const gz = Math.floor(targetZ / gridRes)
            if (gx >= 0 && gx < size && gz >= 0 && gz < size) {
              const cellVal = grid[gz * size + gx]
              if (cellVal !== 1 && cellVal !== 2) {
                targetX = this._idleCenter.x
                targetZ = this._idleCenter.z
              }
            }
          }

          this._cx += (targetX - this._cx) * idleSpeed
          this._cy += (targetZ - this._cy) * idleSpeed
        }
      }

    , _navigateTo(targetX, targetZ){
        if (!walkableGrid.grid) return
        const path = findPath(this._cx, this._cy, targetX, targetZ, walkableGrid)
        if (path.length > 0) {
          this._path = path
        } else {
          // Pathfinding failed — snap both start and target to nearest walkable cell
          const snappedStart = snapToWalkable(this._cx, this._cy, walkableGrid)
          const snappedEnd = snapToWalkable(targetX, targetZ, walkableGrid)

          if (snappedStart && snappedEnd) {
            // Teleport to walkable start position if we were stuck
            this._cx = snappedStart.x
            this._cy = snappedStart.z
            const fallbackPath = findPath(snappedStart.x, snappedStart.z, snappedEnd.x, snappedEnd.z, walkableGrid)
            if (fallbackPath.length > 0) {
              this._path = fallbackPath
            } else {
              // Still no path (disconnected regions) — teleport to target
              this._path = [snappedEnd]
            }
          } else {
            // No walkable cells found — stay put
            this._path = []
            this._arrived = true
            return
          }
        }
        this._pathIndex = 0
        this._arrived = false
      }

    , _setIdleCenter() {
        // Snap idle center to nearest road (1) or Gehweg (2) cell via BFS
        if (walkableGrid.grid) {
          const { grid, size, gridRes } = walkableGrid
          const gx = Math.floor(this._cx / gridRes)
          const gz = Math.floor(this._cy / gridRes)
          const cellVal = (gx >= 0 && gx < size && gz >= 0 && gz < size) ? grid[gz * size + gx] : 0
          if (cellVal !== 1 && cellVal !== 2) {
            // BFS search for nearest road/Gehweg cell (NOT grass/entrance)
            let found = null
            for (let r = 1; r <= 20 && !found; r++) {
              for (let dx = -r; dx <= r && !found; dx++) {
                for (const dz of [-r, r]) {
                  const nx = gx + dx, nz = gz + dz
                  if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
                    const v = grid[nz * size + nx]
                    if (v === 1 || v === 2) { found = { nx, nz }; break }
                  }
                }
              }
              if (!found) {
                for (let dz = -r + 1; dz < r && !found; dz++) {
                  for (const dx of [-r, r]) {
                    const nx = gx + dx, nz = gz + dz
                    if (nx >= 0 && nx < size && nz >= 0 && nz < size) {
                      const v = grid[nz * size + nx]
                      if (v === 1 || v === 2) { found = { nx, nz }; break }
                    }
                  }
                }
              }
            }
            if (found) {
              this._cx = found.nx * gridRes + gridRes / 2
              this._cy = found.nz * gridRes + gridRes / 2
            }
          }
        }
        this._idleCenter = { x: this._cx, z: this._cy }
      }

    , _transitionTo(newState, buildingId){
        if (newState === this._dayState) return
        const prev = this._dayState
        this._dayState = newState
        this._arrived = false
        this._idleCenter = null

        // Reset micro-walk state on any transition
        this._inMicroWalk = false
        this._microWalkPath = null
        this._microWalkIndex = 0
        this._microWalkReturn = null
        this._microWalkTimer = 0

        // Resolve target position: prefer schedule's building_id, fallback to assigned buildings
        const schedulePos = resolveBuildingPos(buildingId, buildingRegistry)

        if (newState === 'GO_TO_WORK') {
          const target = schedulePos || this._workplace
          if (target) this._navigateTo(target.x, target.z)
        } else if (newState === 'GO_TO_HOME') {
          const target = schedulePos || this._homeBuilding
          if (target) this._navigateTo(target.x, target.z)
        } else if (newState === 'GO_TO_LUNCH') {
          const target = schedulePos || this._lunchSpot
          if (target) this._navigateTo(target.x, target.z)
        } else if (newState === 'GO_TO_SHOP') {
          // Navigate to nearest shop (Supermarkt, Bäckerei etc.)
          const target = schedulePos || this._shopSpot || this._leisureSpot
          if (target) this._navigateTo(target.x, target.z)
        } else if (newState === 'GO_TO_SOCIAL') {
          // Navigate to nearest social venue (Café, Kneipe etc.)
          const target = schedulePos || this._socialSpot || this._leisureSpot
          if (target) this._navigateTo(target.x, target.z)
        } else if (newState === 'GO_TO_LEISURE') {
          const target = schedulePos || this._leisureSpot
          if (target) this._navigateTo(target.x, target.z)
        } else if (newState === 'GO_TO_STROLL') {
          // Strolling: choose an outdoor zone based on latent constructs
          const zone = chooseOutdoorZone(this.creature, this._rng)
          this._strollZone = zone
          const ox = (this._rng() - 0.5) * zone.walkRadius * 0.4
          const oz = (this._rng() - 0.5) * zone.walkRadius * 0.4
          this._navigateTo(zone.x + ox, zone.z + oz)
        } else if (newState === 'GO_TO_PROTEST') {
          // Navigate to civic building (parliament/central square)
          const target = schedulePos || findCivicBuilding(buildingRegistry)
          if (target) this._navigateTo(target.x, target.z)
        } else if (newState === 'AT_WORK') {
          if (prev.startsWith('GO_TO_') && !this._arrived) {
            // Still en route — keep walking, don't reset path
            this._dayState = prev
          } else {
            // Check if we're actually near the workplace
            const wp = schedulePos || this._workplace
            if (wp) {
              const dx = this._cx - wp.x, dz = this._cy - wp.z
              if (Math.sqrt(dx * dx + dz * dz) > 30) {
                // Not at workplace yet — navigate there
                this._dayState = 'GO_TO_WORK'
                this._navigateTo(wp.x, wp.z)
                return
              }
            }
            // At destination → enter idle
            this._setIdleCenter()
            this._path = []
            this._pathIndex = 0
          }
        } else if (newState === 'AT_STROLL') {
          // Strolling arrived: use outdoor zone micro-walk behavior
          this._setIdleCenter()
          this._path = []
          this._pathIndex = 0
        } else if (newState === 'AT_LUNCH' || newState === 'AT_SHOP'
                   || newState === 'AT_SOCIAL' || newState === 'AT_LEISURE'
                   || newState === 'AT_PROTEST') {
          // Check if we're actually near the target building
          const IDLE_TARGET = {
            'AT_LUNCH': this._lunchSpot
            , 'AT_SHOP': this._shopSpot || this._leisureSpot
            , 'AT_SOCIAL': this._socialSpot || this._leisureSpot
            , 'AT_LEISURE': this._leisureSpot
            , 'AT_PROTEST': findCivicBuilding(buildingRegistry)
          }
          const IDLE_TO_GO = {
            'AT_LUNCH': 'GO_TO_LUNCH', 'AT_SHOP': 'GO_TO_SHOP'
            , 'AT_SOCIAL': 'GO_TO_SOCIAL', 'AT_LEISURE': 'GO_TO_LEISURE'
            , 'AT_PROTEST': 'GO_TO_PROTEST'
          }
          const idleTarget = schedulePos || IDLE_TARGET[newState]
          if (idleTarget) {
            const dx = this._cx - idleTarget.x, dz = this._cy - idleTarget.z
            if (Math.sqrt(dx * dx + dz * dz) > 30) {
              // Not there yet — navigate
              this._dayState = IDLE_TO_GO[newState] || newState
              this._navigateTo(idleTarget.x, idleTarget.z)
              return
            }
          }
          this._setIdleCenter()
          this._path = []
          this._pathIndex = 0
        } else if (newState === 'SLEEPING') {
          this._path = []
          this._pathIndex = 0
        }
      }

    , _pickWanderTarget(){
        if (!walkableGrid.grid) return
        const c = this.blob

        // Politically active blobs sometimes walk to civic center
        const protestReady = c.political_state ? c.political_state.protest_readiness || 0 : 0
        if (protestReady > 0.5 && Math.random() < 0.3) {
          // Walk to Parliament/CentralSquare area
          this._navigateTo(1000 + (Math.random() - 0.5) * 80, 1000 + (Math.random() - 0.5) * 80)
          return
        }

        // Social blobs wander further
        const radius = this._wanderRadius + Math.random() * 40
        const target = randomWalkableNear(this._cx, this._cy, radius, walkableGrid, Math.random)
        if (target) {
          this._navigateTo(target.x, target.z)
        }
      }
    , updateObjects(){
      let vision = this.creature.sense_range[0]
      this.visionIndicator.scale.set(vision, vision, vision)
      this.visionIndicator.visible = this.showSightIndicator

      let scale = this.creature.size[0] / 20
      this.blobObject.scale.set(scale, scale, scale)

      this.energyIndicator.visible = this.showEnergyIndicator

      this.assignProps( this.blobMaterial, blobMaterialProps )
    }
  }
}
