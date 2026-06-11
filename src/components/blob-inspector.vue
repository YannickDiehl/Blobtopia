<template lang="pug">
.blob-inspector(@click.self="$emit('close')")
  .inspector-card
    .inspector-header
      .district-badge(:style="{ backgroundColor: districtHex }")
      .header-text
        .blob-name(v-if="blob.name") {{ blob.name }}
      b-icon.close-btn(icon="close", size="is-small", @click.native="$emit('close')")

    .inspector-section
      h4 Demografie
      .info-grid
        .info-item
          .info-label Wohnort
          .info-value {{ blob.district_name }}
        .info-item
          .info-label Alter
          .info-value {{ blob.age_label }}
        .info-item
          .info-label Beruf
          .info-value {{ blob.job || '–' }}
        .info-item
          .info-label Bildung
          .info-value {{ blob.education_label }}
        .info-item
          .info-label Einkommen
          .info-value {{ blob.income_label || (Math.round(blob.income) + ' €') }}
        .info-item
          .info-label Partei
          .info-value {{ blob.party_name }}

    .inspector-section(v-if="blob.home_building_id || blob.workplace_id")
      h4 Orte
      .info-grid
        .info-item(v-if="blob.home_building_id")
          .info-label Wohnung
          .info-value \#{{ blob.home_building_id }}
        .info-item(v-if="blob.workplace_id")
          .info-label Arbeit
          .info-value \#{{ blob.workplace_id }}
        .info-item(v-if="blob.lunch_spot_id")
          .info-label Mittagessen
          .info-value \#{{ blob.lunch_spot_id }}
        .info-item(v-if="blob.leisure_spot_id")
          .info-label Freizeit
          .info-value \#{{ blob.leisure_spot_id }}

    .inspector-section(v-if="blob.attitudes")
      h4 Einstellungen
      .bar-item
        .bar-label Zufriedenheit
        .bar-track
          .bar-fill(:style="{ width: (blob.attitudes.political_satisfaction / 10 * 100) + '%', backgroundColor: satisfactionColor }")
        .bar-value {{ Math.round(blob.attitudes.political_satisfaction * 10) / 10 }}
      .bar-item
        .bar-label L-R
        .bar-track.ideology-track
          .bar-center
          .bar-fill-ideo(:style="ideologyStyle")
        .bar-value {{ lrLabel }}
      .bar-item
        .bar-label Vertrauen
        .bar-track
          .bar-fill(:style="{ width: (blob.attitudes.institutional_trust / 10 * 100) + '%', backgroundColor: '#5c9ded' }")
        .bar-value {{ Math.round(blob.attitudes.institutional_trust * 10) / 10 }}

    .inspector-section(v-if="blob.attitudes && blob.attitudes.policy_economy != null")
      h4 Policy-Positionen
      .bar-item(v-for="p in policyItems", :key="p.label")
        .bar-label {{ p.label }}
        .bar-track
          .bar-fill(:style="{ width: (p.value / 10 * 100) + '%', backgroundColor: '#a29bfe' }")
        .bar-value {{ Math.round(p.value * 10) / 10 }}

    .inspector-section(v-if="blob.political_state")
      h4 Politisches Verhalten
      .info-grid
        .info-item
          .info-label Wähler*in
          .info-value {{ blob.political_state.will_vote ? 'Ja' : 'Nein' }}
        .info-item
          .info-label Protestbereitschaft
          .info-value {{ Math.round(blob.political_state.protest_readiness * 100) }}%

    .inspector-section.collapsible(v-if="blob.latent_traits")
      h4.clickable(@click="showLatent = !showLatent")
        span Latente Konstrukte
        b-icon(:icon="showLatent ? 'chevron-up' : 'chevron-down'", size="is-small")
      transition(name="collapse")
        .latent-content(v-if="showLatent")
          .latent-group
            h5 Pol. Efficacy
            .mini-bar(v-for="item in efficacyItems", :key="item.label")
              span.mini-label {{ item.label }}
              .mini-track
                .mini-fill(:style="{ width: (item.value / 10 * 100) + '%' }")
              span.mini-value {{ Math.round(item.value * 10) / 10 }}
          .latent-group
            h5 Sozialkapital
            .mini-bar(v-for="item in socialItems", :key="item.label")
              span.mini-label {{ item.label }}
              .mini-track
                .mini-fill(:style="{ width: (item.value / (item.max || 10) * 100) + '%' }")
              span.mini-value {{ typeof item.value === 'number' ? Math.round(item.value * 10) / 10 : item.value }}
          .latent-group
            h5 Autoritarismus
            .mini-bar(v-for="item in authItems", :key="item.label")
              span.mini-label {{ item.label }}
              .mini-track
                .mini-fill(:style="{ width: (item.value / 10 * 100) + '%' }")
              span.mini-value {{ Math.round(item.value * 10) / 10 }}
          .latent-group
            h5 Politikverdrossenheit
            .mini-bar(v-for="item in alienationItems", :key="item.label")
              span.mini-label {{ item.label }}
              .mini-track
                .mini-fill(:style="{ width: (item.value / 10 * 100) + '%' }")
              span.mini-value {{ Math.round(item.value * 10) / 10 }}
          .latent-group
            h5 Materialismus/Postmat.
            .mini-bar(v-for="item in materialismItems", :key="item.label")
              span.mini-label {{ item.label }}
              .mini-track
                .mini-fill(:style="{ width: (item.value / 10 * 100) + '%' }")
              span.mini-value {{ Math.round(item.value * 10) / 10 }}
          .latent-group
            h5 Populismus
            .mini-bar(v-for="item in populismItems", :key="item.label")
              span.mini-label {{ item.label }}
              .mini-track
                .mini-fill(:style="{ width: (item.value / 10 * 100) + '%' }")
              span.mini-value {{ Math.round(item.value * 10) / 10 }}

    .inspector-section.interview-section
      b-button(
        type="is-primary"
        , expanded
        , size="is-small"
        , @click="$emit('start-interview')"
      )
        b-icon(icon="forum", size="is-small")
        span Interview führen
</template>

<script>
import { DISTRICT_COLORS } from '@/lib/blob-adapter'

export default {
  name: 'BlobInspector'
  , props: {
    blob: {
      type: Object
      , required: true
    }
  }
  , data: () => ({
    showLatent: false
  })
  , computed: {
    shortId(){
      return this.blob.id ? this.blob.id.substring(0, 8) : '?'
    }
    , districtHex(){
      const hex = DISTRICT_COLORS[this.blob.district] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    , satisfactionColor(){
      const sat = this.blob.attitudes.political_satisfaction
      if (sat >= 7) return '#4ecca3'
      if (sat >= 4) return '#f0c929'
      return '#e74c3c'
    }
    , lrValue(){
      // Convert ideology (-5 to +5) to L-R scale (1 to 11)
      return Math.round((this.blob.attitudes.ideology + 5) / 10 * 10 + 1)
    }
    , lrLabel(){
      // L-R Selbsteinschätzung: 1 (links) – 11 (rechts)
      return this.lrValue
    }
    , ideologyStyle(){
      // ideology is -5 to +5, map to percentage bar from center
      const ideo = this.blob.attitudes.ideology
      const center = 50
      const offset = (ideo / 5) * 50
      if (offset >= 0) {
        return { left: center + '%', width: offset + '%', backgroundColor: '#e74c3c' }
      } else {
        return { left: (center + offset) + '%', width: (-offset) + '%', backgroundColor: '#3498db' }
      }
    }
    , efficacyItems(){
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Selbstwirksamkeit', value: t.self_efficacy }
        , { label: 'Pol. Wissen', value: t.political_knowledge }
        , { label: 'Stimme zählt', value: t.vote_importance }
        , { label: 'Ext. Wirksamkeit', value: t.external_efficacy }
      ]
    }
    , socialItems(){
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Netzwerk', value: t.network_size, max: 20 }
        , { label: 'Nachbar-Vertrauen', value: t.neighbor_trust, max: 10 }
        , { label: 'Gemeinschaft', value: t.community_participation, max: 10 }
        , { label: 'Allg. Vertrauen', value: t.generalized_trust, max: 10 }
        , { label: 'Medienvertrauen', value: t.media_trust, max: 10 }
      ]
    }
    , authItems(){
      const t = this.blob.latent_traits
      return [
        { label: 'Gehorsam', value: t.obedience_value }
        , { label: 'Regelkonformität', value: t.rule_conformity }
        , { label: 'Starke Führung', value: t.strong_leader_preference }
      ]
    }
    , alienationItems(){
      const t = this.blob.latent_traits
      return [
        { label: 'Machtlosigkeit', value: t.powerlessness }
        , { label: 'Komplexität', value: t.political_complexity }
        , { label: 'Partei-Indifferenz', value: t.party_indifference }
      ]
    }
    , materialismItems(){
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Wirtsch. Sicherheit', value: t.economic_security_priority }
        , { label: 'Umwelt > Wirtschaft', value: t.environment_over_economy }
        , { label: 'Freiheit > Ordnung', value: t.freedom_over_order }
      ]
    }
    , populismItems(){
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Anti-Elitismus', value: t.anti_elitism }
        , { label: 'Volkszentrismus', value: t.people_centrism }
        , { label: 'Gut-Böse-Denken', value: t.manichean_outlook }
      ]
    }
    , policyItems(){
      const a = this.blob.attitudes || {}
      return [
        { label: 'Wirtschaft', value: a.policy_economy }
        , { label: 'Umwelt', value: a.policy_environment }
        , { label: 'Sicherheit', value: a.policy_security }
        , { label: 'Soziales', value: a.policy_social }
        , { label: 'Migration', value: a.policy_migration }
        , { label: 'Demokratie', value: a.policy_democracy }
      ]
    }
  }
}
</script>

<style lang="sass" scoped>
.blob-inspector
  position: absolute
  bottom: 1rem
  left: 1rem
  z-index: 5
  pointer-events: auto

.inspector-card
  background: rgba(0, 0, 0, 0.85)
  backdrop-filter: blur(8px)
  border-radius: 8px
  border: 1px solid rgba(255, 255, 255, 0.15)
  width: 300px
  max-height: calc(100vh - 8rem)
  overflow-y: auto
  color: $grey-lighter
  font-size: 0.8rem

.inspector-header
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.6rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)

  .district-badge
    width: 12px
    height: 12px
    border-radius: 50%
    flex-shrink: 0

  .header-text
    flex: 1
    min-width: 0

    .blob-name
      font-weight: 700
      font-size: 1rem
      white-space: nowrap
      overflow: hidden
      text-overflow: ellipsis

    .blob-subtitle
      font-size: 0.7rem
      color: $grey
      margin-top: 1px

  .close-btn
    cursor: pointer
    margin-left: 0.5rem
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

.bar-item
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.3rem

  .bar-label
    width: 90px
    font-size: 0.7rem
    color: $grey
    flex-shrink: 0

  .bar-track
    flex: 1
    height: 6px
    background: rgba(255, 255, 255, 0.1)
    border-radius: 3px
    overflow: hidden
    position: relative

  .bar-fill
    height: 100%
    border-radius: 3px
    transition: width 0.3s

  .ideology-track
    overflow: visible

    .bar-center
      position: absolute
      left: 50%
      top: -1px
      bottom: -1px
      width: 1px
      background: rgba(255, 255, 255, 0.3)

    .bar-fill-ideo
      position: absolute
      height: 100%
      border-radius: 3px
      transition: left 0.3s, width 0.3s

  .bar-value
    width: 28px
    text-align: right
    font-size: 0.7rem
    flex-shrink: 0

// Latent traits
.collapsible
  h4.clickable
    cursor: pointer
    display: flex
    align-items: center
    justify-content: space-between
    &:hover
      color: $grey-light

.latent-content
  .latent-group
    margin-bottom: 0.5rem
    h5
      color: $grey-light
      font-size: 0.7rem
      margin-bottom: 0.2rem
      font-weight: 600

.mini-bar
  display: flex
  align-items: center
  gap: 0.3rem
  margin-bottom: 0.15rem

  .mini-label
    width: 100px
    font-size: 0.65rem
    color: $grey

  .mini-track
    flex: 1
    height: 4px
    background: rgba(255, 255, 255, 0.08)
    border-radius: 2px
    overflow: hidden

  .mini-fill
    height: 100%
    background: $primary
    border-radius: 2px

  .mini-value
    width: 24px
    text-align: right
    font-size: 0.65rem
    color: $grey

.collapse-enter-active, .collapse-leave-active
  transition: max-height 0.3s ease, opacity 0.3s ease
  max-height: 600px
  overflow: hidden
.collapse-enter, .collapse-enter-from, .collapse-leave-to
  max-height: 0
  opacity: 0
</style>
