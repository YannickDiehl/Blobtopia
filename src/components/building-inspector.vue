<template lang="pug">
.building-inspector(:class="{ 'has-timeline': timelineMode }", @click.self="$emit('close')")
  .inspector-card
    .inspector-header
      .building-icon
        b-icon(:icon="buildingIcon", size="is-small")
      .header-text
        .building-name {{ displayName }}
        .building-subtitle {{ building.districtName || 'Zentrum' }} · {{ functionalLabel }}
      b-icon.close-btn(icon="close", size="is-small", @click.native="$emit('close')")

    .inspector-section
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
            span.blob-detail {{ occ.reason }}

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
              span.blob-detail {{ blob.age_label }} · {{ blob.education_label }}

    .inspector-section(v-if="workers.length > 0")
      h4 Arbeitsplatz für ({{ workers.length }})
      .household-list
        .household-member(v-for="blob in workers", :key="blob.id", @click="$emit('select-blob', blob)")
          .blob-dot(:style="{ backgroundColor: districtColor(blob.district) }")
          .blob-info
            span.blob-name {{ blob.name || 'Blob #' + blob.id.substring(0, 6) }}
            span.blob-detail {{ blob.education_label }} · {{ blob.party_name }}

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
  , props: {
    building: { type: Object, required: true }
    , timelineMode: { type: Boolean, default: false }
  }
  , computed: {
    displayName(){
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
      const fn = this.$store.getters['simulation/getCurrentGeneration']
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
      if (!this.building.id) return []
      return this.blobs.filter(c => c.leisure_spot_id === this.building.id).slice(0, 12)
    }
    , currentOccupants(){
      // Show blobs that are currently AT this building based on their position
      if (!this.building.id || !this.building.x) return []
      const bx = this.building.x, bz = this.building.z
      const results = []
      for (const c of this.blobs) {
        const cx = (c.pos ? c.pos[0] : 0) * 4
        const cz = (c.pos ? c.pos[1] : 0) * 4
        const dx = cx - bx, dz = cz - bz
        if (dx * dx + dz * dz > 40 * 40) continue
        // Determine why they're here
        let reason = ''
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
    districtColor(d) {
      return DISTRICT_COLORS_HEX[d] || '#666'
    }
  }
}
</script>

<style lang="sass" scoped>
.building-inspector
  position: absolute
  bottom: 1rem
  left: 1rem
  z-index: 5
  pointer-events: auto
  &.has-timeline
    bottom: 10rem

.inspector-card
  background: rgba(0, 0, 0, 0.85)
  backdrop-filter: blur(8px)
  border-radius: 8px
  border: 1px solid rgba(255, 255, 255, 0.15)
  width: 300px
  color: $grey-lighter
  font-size: 0.8rem
  max-height: 500px
  overflow-y: auto

.inspector-header
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.6rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)

  .building-icon
    width: 28px
    height: 28px
    border-radius: 4px
    background: rgba(255, 255, 255, 0.1)
    display: flex
    align-items: center
    justify-content: center
    flex-shrink: 0

  .header-text
    flex: 1
    min-width: 0
    .building-name
      font-weight: 700
      font-size: 1rem
      white-space: nowrap
      overflow: hidden
      text-overflow: ellipsis
    .building-subtitle
      font-size: 0.7rem
      color: $grey
      margin-top: 1px

  .close-btn
    cursor: pointer
    margin-left: auto
    color: $grey
    &:hover
      color: $grey-lighter

.inspector-section
  padding: 0.5rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.05)
  &:last-child
    border-bottom: none

  h4
    color: $grey
    font-size: 0.7rem
    text-transform: uppercase
    margin-bottom: 0.4rem
    letter-spacing: 0.5px

.info-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 0.3rem 0.75rem

.info-item
  display: flex
  justify-content: space-between
  .info-label
    color: $grey
    font-size: 0.75rem
  .info-value
    font-weight: 600
    font-size: 0.75rem

.household-list
  display: flex
  flex-direction: column
  gap: 0.2rem

.household-member
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.25rem 0.4rem
  border-radius: 4px
  cursor: pointer
  transition: background 0.15s
  &:hover
    background: rgba(255, 255, 255, 0.08)

  .blob-dot
    width: 8px
    height: 8px
    border-radius: 50%
    flex-shrink: 0

  .blob-info
    display: flex
    gap: 0.5rem
    align-items: baseline

  .blob-name
    font-weight: 600
    font-size: 0.75rem

  .blob-detail
    color: $grey
    font-size: 0.65rem

.household-header
  padding: 0.3rem 0.4rem 0.1rem
  .household-label
    font-size: 0.7rem
    font-weight: 600
    color: $grey-light

.household-indented
  padding-left: 1rem !important
</style>
