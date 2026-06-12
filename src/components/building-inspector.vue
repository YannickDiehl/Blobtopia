<template lang="pug">
.building-inspector(:class="{ 'has-timeline': timelineMode }", :style="panelStyle", @click.self="$emit('close')")
  .inspector-card(:style="cardStyle")
    .inspector-header
      .building-icon
        b-icon(:icon="buildingIcon", size="is-small")
      .header-text
        .building-name {{ displayName }}
        .building-subtitle(v-if="inspectorUnlocked") {{ building.districtName || 'Zentrum' }} · {{ functionalLabel }}
      .header-actions
        span.action-btn.lock-btn(@click="onLockClick")
          b-icon(:icon="inspectorUnlocked ? 'lock-open-variant' : 'lock'", size="is-small")
        .password-popover(v-if="showPasswordInput")
          input.password-input(
            type="password"
            , v-model="passwordAttempt"
            , :placeholder="passwordError ? 'Falsch' : 'Passwort'"
            , :class="{ 'has-error': passwordError }"
            , @keydown.enter="tryUnlock"
            , @keydown.esc="showPasswordInput = false"
            , ref="passwordInput"
          )
        b-icon.close-btn(icon="close", size="is-small", @click="$emit('close')")

    .inspector-section(v-if="inspectorUnlocked")
      .info-grid
        .info-item
          .info-label Typ
          .info-value {{ functionalLabel }}
        .info-item(v-if="building.capacity")
          .info-label Kapazität
          .info-value {{ building.capacity }}
        .info-item
          .info-label Distrikt
          .info-value {{ building.districtName || 'Zentrum' }}
        .info-item(v-if="building.id")
          .info-label Gebäude-ID
          .info-value \#{{ building.id }}

    .inspector-section(v-if="currentOccupants.length > 0")
      h4 Gerade anwesend ({{ currentOccupants.length }})
      .household-list
        .household-member(v-for="occ in currentOccupants", :key="occ.blob.id", @click="$emit('select-blob', occ.blob)")
          .blob-dot(:style="{ backgroundColor: districtColor(occ.blob.district) }")
          .blob-info
            span.blob-name {{ occ.blob.name || 'Blob #' + occ.blob.id.substring(0, 6) }}
            span.blob-detail(v-if="inspectorUnlocked") {{ occ.reason }}

    .inspector-section(v-if="residents.length > 0")
      h4 Bewohner ({{ residents.length }})
      .household-list
        .household-group(v-for="group in householdGroups", :key="group.key")
          .household-header(v-if="group.size > 1")
            span.household-label {{ group.label }} ({{ group.size }})
          .household-member(
            v-for="blob in group.members"
            :key="blob.id"
            :class="{ 'household-indented': group.size > 1 }"
            @click="$emit('select-blob', blob)"
          )
            .blob-dot(:style="{ backgroundColor: districtColor(blob.district) }")
            .blob-info
              span.blob-name {{ blob.name || 'Blob #' + blob.id.substring(0, 6) }}
              span.blob-detail(v-if="inspectorUnlocked") {{ blob.age_label }} · {{ blob.education_label }}

    .inspector-section(v-if="workers.length > 0")
      h4 Arbeitsplatz für ({{ workers.length }})
      .household-list
        .household-member(v-for="blob in workers", :key="blob.id", @click="$emit('select-blob', blob)")
          .blob-dot(:style="{ backgroundColor: districtColor(blob.district) }")
          .blob-info
            span.blob-name {{ blob.name || 'Blob #' + blob.id.substring(0, 6) }}
            span.blob-detail(v-if="inspectorUnlocked") {{ blob.education_label }} · {{ blob.party_name }}

    .inspector-section(v-if="lunchGuests.length > 0")
      h4 Mittagsgäste ({{ lunchGuests.length }})
      .household-list
        .household-member(v-for="blob in lunchGuests", :key="blob.id", @click="$emit('select-blob', blob)")
          .blob-dot(:style="{ backgroundColor: districtColor(blob.district) }")
          .blob-info
            span.blob-name {{ blob.name || 'Blob #' + blob.id.substring(0, 6) }}

    .inspector-section(v-if="leisureVisitors.length > 0")
      h4 Freizeitbesucher ({{ leisureVisitors.length }})
      .household-list
        .household-member(v-for="blob in leisureVisitors", :key="blob.id", @click="$emit('select-blob', blob)")
          .blob-dot(:style="{ backgroundColor: districtColor(blob.district) }")
          .blob-info
            span.blob-name {{ blob.name || 'Blob #' + blob.id.substring(0, 6) }}
</template>

<script>
import { DISTRICT_COLORS_HEX } from '@/lib/blob-adapter'
import { visualPositions } from '@/blobs/visual-positions'
import draggablePanel from '@/mixins/draggable-panel'
import { useSimulationStore } from '@/stores/simulation'

const FUNCTIONAL_LABELS = {
  apartment: 'Mehrfamilienhaus', rowhouse: 'Reihenhaus', villa: 'Villa'
  , office: 'Bürogebäude', factory: 'Fabrik', warehouse: 'Lagerhalle'
  , shop: 'Geschäft', cafe: 'Café', restaurant: 'Restaurant', bar: 'Bar'
  , park: 'Park', sports_facility: 'Sportanlage', library: 'Bibliothek'
  , university: 'Universität', parliament: 'Parlament'
  , media_center: 'Medienzentrum', marketplace: 'Marktplatz'
  , central_square: 'Zentralplatz', residential: 'Wohngebäude', school: 'Schule'
}

export default {
  name: 'BuildingInspector'
  , mixins: [draggablePanel]
  , props: {
    building: { type: Object, required: true }
    , timelineMode: { type: Boolean, default: false }
  }
  , data() {
    return {
      inspectorUnlocked: localStorage.getItem('blobtopia_inspector_unlocked') === 'true'
      , showPasswordInput: false
      , passwordAttempt: ''
      , passwordError: false
    }
  }
  , computed: {
    panelConfig() {
      return {
        storageKey: 'blobtopia_panel_buildingInspector'
        , minWidth: 260
        , maxWidth: 500
        , minHeight: 200
        , maxHeight: Math.round(window.innerHeight * 0.8)
        , headerSelector: '.inspector-header'
        , resizable: true
      }
    }
    , cardStyle() {
      if (this.panelW !== null || this.panelH !== null) {
        return { width: '100%', height: '100%', maxHeight: 'none' }
      }
      return {}
    }
    , displayName(){
      if (this.building.label && this.building.label !== this.building.type) {
        return this.building.label
      }
      return FUNCTIONAL_LABELS[this.building.functional_type] || this.building.label || 'Gebäude'
    }
    , functionalLabel(){
      return FUNCTIONAL_LABELS[this.building.functional_type]
        || FUNCTIONAL_LABELS[this.building.type]
        || this.building.type || 'Gebäude'
    }
    , buildingIcon(){
      const icons = {
        parliament: 'bank', marketplace: 'store', media_center: 'newspaper'
        , central_square: 'map-marker', university: 'school', library: 'book-open-variant'
        , apartment: 'home-city', rowhouse: 'home', villa: 'home-variant'
        , office: 'office-building', factory: 'factory', warehouse: 'package-variant'
        , shop: 'cart', cafe: 'coffee', restaurant: 'silverware-fork-knife'
        , bar: 'glass-cocktail', park: 'tree', sports_facility: 'soccer'
        , school: 'school'
      }
      return icons[this.building.functional_type] || icons[this.building.type] || 'office-building'
    }
    , generation(){
      const fn = useSimulationStore().getCurrentGeneration
      return fn ? fn() : null
    }
    , blobs(){
      return this.generation ? (this.generation.blobs || []) : []
    }
    , residents(){
      if (!this.building.id) return []
      return this.blobs.filter(c => c.home_building_id === this.building.id)
    }
    , householdGroups(){
      // Group residents by household_id
      const groups = {}
      for (const blob of this.residents) {
        const key = blob.household_id || ('solo_' + blob.id)
        if (!groups[key]) {
          groups[key] = { key, members: [], household_id: blob.household_id }
        }
        groups[key].members.push(blob)
      }
      // Sort: largest groups first, then singles
      const sorted = Object.values(groups).sort((a, b) => b.members.length - a.members.length)
      // Add labels
      return sorted.map(g => {
        const size = g.members.length
        let label = ''
        if (size > 1) {
          // Extract last name from first member
          const name = g.members[0].name || ''
          const lastName = name.split(' ').slice(1).join(' ') || 'Haushalt'
          label = size >= 3 ? 'Familie ' + lastName : 'Paar ' + lastName
        }
        return { ...g, size, label }
      })
    }
    , workers(){
      if (!this.building.id) return []
      return this.blobs.filter(c => c.workplace_id === this.building.id).slice(0, 12)
    }
    , lunchGuests(){
      if (!this.building.id) return []
      return this.blobs.filter(c => c.lunch_spot_id === this.building.id).slice(0, 12)
    }
    , leisureVisitors(){
      if (!this.building.id || !this.building.x) return []
      const bx = this.building.x, bz = this.building.z
      return this.blobs.filter(c => {
        if (c.leisure_spot_id !== this.building.id) return false
        const vp = visualPositions.get(c.id)
        if (!vp) return false
        const dx = vp.x - bx, dz = vp.z - bz
        return dx * dx + dz * dz <= 36 * 36
      }).slice(0, 12)
    }
    , currentOccupants(){
      if (!this.building.id || !this.building.x) return []
      const bx = this.building.x, bz = this.building.z
      const results = []
      for (const c of this.blobs) {
        const vp = visualPositions.get(c.id)
        if (!vp) continue
        const dx = vp.x - bx, dz = vp.z - bz
        if (dx * dx + dz * dz > 36 * 36) continue
        let reason
        if (c.home_building_id === this.building.id) reason = 'Bewohner'
        else if (c.workplace_id === this.building.id) reason = 'Arbeitet hier'
        else if (c.lunch_spot_id === this.building.id) reason = 'Mittagessen'
        else if (c.leisure_spot_id === this.building.id) reason = 'Freizeit'
        else reason = 'Besucher'
        results.push({ blob: c, reason })
        if (results.length >= 15) break
      }
      return results
    }
  }
  , methods: {
    onLockClick() {
      if (this.inspectorUnlocked) {
        this.inspectorUnlocked = false
        localStorage.removeItem('blobtopia_inspector_unlocked')
      } else {
        this.showPasswordInput = !this.showPasswordInput
        this.passwordError = false
        this.passwordAttempt = ''
        this.$nextTick(() => {
          if (this.$refs.passwordInput) this.$refs.passwordInput.focus()
        })
      }
    }
    , tryUnlock() {
      var correct = import.meta.env.VUE_APP_INSPECTOR_PASSWORD || 'blob123'
      if (this.passwordAttempt === correct) {
        this.inspectorUnlocked = true
        this.passwordError = false
        this.showPasswordInput = false
        this.passwordAttempt = ''
        localStorage.setItem('blobtopia_inspector_unlocked', 'true')
      } else {
        this.passwordError = true
        this.passwordAttempt = ''
      }
    }
    , districtColor(d) {
      return DISTRICT_COLORS_HEX[d] || '#666'
    }
  }
}
</script>

<style lang="sass" scoped>
// Die Hausakte: Karteikarte eines Gebäudes (Bewohner, Beschäftigte,
// Gäste) — gleiche Formsprache wie die Blob-Karteikarte.
$korn: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .04 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")

.building-inspector
  position: absolute
  bottom: 1rem
  left: 1rem
  z-index: 8
  pointer-events: auto
  filter: drop-shadow(0 12px 24px rgba(40, 28, 8, 0.4))
  .inspector-card
    max-height: calc(100vh - 48px - 2rem)
  &.has-timeline
    bottom: 7.5rem
    .inspector-card
      max-height: calc(100vh - 48px - 8.5rem)

.inspector-card
  width: 340px
  max-height: 75vh
  display: flex
  flex-direction: column
  overflow: hidden
  color: var(--inst-tinte)
  font-family: var(--inst-druck)
  font-size: 0.78rem
  background-color: var(--inst-papier-hell)
  background-image: repeating-linear-gradient(180deg, transparent 0 26px, var(--inst-kartei-linie) 26px 27px), $korn
  border-radius: 2px
  position: relative
  &::before
    content: ''
    position: absolute
    top: 0
    bottom: 0
    left: 14px
    width: 1.5px
    background: var(--inst-randlinie)
    pointer-events: none
    z-index: 1

.inspector-header
  flex-shrink: 0
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 10px 12px 7px 24px
  border-bottom: 1.5px solid rgba(43, 58, 85, 0.5)
  margin: 0 12px 0 0
  cursor: grab
  position: relative
  &:active
    cursor: grabbing

  .building-icon
    flex: none
    width: 30px
    height: 30px
    border-radius: 4px
    background: rgba(51, 81, 142, 0.12)
    color: var(--inst-stempelblau)
    display: flex
    align-items: center
    justify-content: center

  .header-text
    flex: 1
    min-width: 0

  .building-name
    font-family: var(--inst-schreibmaschine)
    font-weight: bold
    font-size: 0.92rem
    color: var(--inst-tinte)
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .building-subtitle
    font-family: var(--inst-schreibmaschine)
    font-size: 0.62rem
    color: var(--inst-beschriftung)
    margin-top: 1px

  .header-actions
    display: flex
    align-items: center
    gap: 0.25rem
    flex-shrink: 0
    position: relative

  .password-input
    font-family: var(--inst-schreibmaschine)
    font-size: 0.72rem
    color: var(--inst-tinte)
    background: rgba(255, 255, 255, 0.6)
    border: none
    border-bottom: 1.5px dotted var(--inst-linie)
    outline: none
    width: 130px
    padding: 2px 4px
    &:focus
      border-bottom: 2px solid var(--inst-pink)
    &.has-error
      border-bottom-color: var(--inst-stempelrot)

  .action-btn, .close-btn
    cursor: pointer
    color: var(--inst-beschriftung)
    display: inline-flex
    align-items: center
    padding: 2px
    &:hover
      color: var(--inst-stempelrot)
  .action-btn.lock-btn:hover
    color: var(--inst-pink)

.password-popover
  position: absolute
  top: 26px
  right: 0
  z-index: 5
  background: var(--inst-papier)
  padding: 6px
  box-shadow: 0 6px 14px rgba(40, 28, 8, 0.35)
  border: 1.5px solid rgba(224, 105, 159, 0.5)

.inspector-section
  padding: 8px 12px 4px 24px
  overflow-y: auto
  &::-webkit-scrollbar
    width: 6px
  &::-webkit-scrollbar-thumb
    border-radius: 3px
    background: rgba(43, 58, 85, 0.25)

  h4
    font-size: 0.58rem
    font-weight: 800
    letter-spacing: 1.5px
    text-transform: uppercase
    color: var(--inst-beschriftung)
    border-bottom: 1px solid rgba(141, 127, 99, 0.4)
    padding-bottom: 2px
    margin: 0 0 0.35rem

.info-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 0.25rem 0.7rem

.info-item
  .info-label
    font-size: 0.56rem
    font-weight: 800
    letter-spacing: 1px
    text-transform: uppercase
    color: var(--inst-beschriftung)
  .info-value
    font-family: var(--inst-schreibmaschine)
    font-size: 0.74rem
    color: var(--inst-tinte)

// Namensliste der Anwesenden (Haushalts-Gruppen)
.household-list
  max-height: 300px
  overflow-y: auto

.household-header
  font-family: var(--inst-hand)
  font-size: 0.92rem
  color: var(--inst-graphit)
  margin: 0.35rem 0 0.1rem

.household-indented
  margin-left: 10px

.household-member
  display: flex
  align-items: center
  gap: 0.45rem
  padding: 0.18rem 0
  cursor: pointer
  border-radius: 3px
  &:hover
    background: rgba(51, 81, 142, 0.08)

  .blob-dot
    flex: none
    width: 10px
    height: 9px
    border-radius: 46% 54% 52% 48% / 58% 56% 44% 42%
    box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25)

  .blob-info
    flex: 1
    min-width: 0
    display: flex
    align-items: baseline
    gap: 0.4rem

  .blob-name
    font-family: var(--inst-schreibmaschine)
    font-size: 0.72rem
    color: var(--inst-tinte)
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .blob-detail
    font-size: 0.6rem
    color: var(--inst-beschriftung)
    white-space: nowrap

.household-label
  font-size: 0.56rem
  font-weight: 800
  letter-spacing: 1px
  text-transform: uppercase
  color: var(--inst-beschriftung)
</style>
