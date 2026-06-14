<template lang="pug">
.akten-leiste(:class="{ 'ist-schreibtisch': room === 'schreibtisch' }")
  //- Logo-Sticker (klebt auf der Akte)
  .logo-sticker(@click="goToAbout", title="Über Blobtopia", role="button")
    img(src="/blobtopia-logo.png", alt="Blobtopia")

  //- Ordner-Reiter: der Bildschirm ist eine Akte mit zwei Räumen
  .reiter-leiste(role="tablist")
    button.reiter(
      role="tab"
      , :class="{ aktiv: room === 'stadt' }"
      , :aria-selected="room === 'stadt'"
      , @click="setRoom('stadt')"
      , title="In der Stadt (Feld)"
    ) Stadt
    button.reiter(
      role="tab"
      , :class="{ aktiv: room === 'schreibtisch' }"
      , :aria-selected="room === 'schreibtisch'"
      , @click="setRoom('schreibtisch')"
      , title="Am Schreibtisch (Auswertung)"
    ) Schreibtisch

  .leiste-mitte
    span.bevoelkerung {{ populationCount }} Blobs
    span.aera(v-if="eraLabel") · {{ eraLabel }}

  .leiste-rechts
    //- Event triggers (nur im Live-Modus — statisch nie sichtbar)
    FloatingPanel(v-if="isLiveMode", size="is-medium", :close-on-click="false", direction="down")
      template(#activator)
        button.werkzeug-btn(:title="'Events auslösen'")
          b-icon(icon="lightning-bolt", size="is-small")
      .event-menu
        .event-item(@click="$emit('fire-event', 'Election')")
          b-icon(icon="vote", size="is-small")
          span Wahl auslösen

    //- BlobFeed (Stadt-Artefakt der Blobs)
    button.werkzeug-btn(:class="{ active: showFeed }", @click="$emit('toggle-feed')", title="BlobFeed ein-/ausblenden")
      b-icon(icon="cellphone", size="is-small")

    //- Presse (Schreibtisch → Registratur)
    button.werkzeug-btn(:class="{ active: room === 'schreibtisch' && deskSection === 'presse' }", @click="$emit('open-desk', 'presse')", title="Presse lesen (N)")
      b-icon(icon="newspaper", size="is-small")

    //- Befragungsinstitut (Schreibtisch → Registratur)
    button.werkzeug-btn(:class="{ active: room === 'schreibtisch' && deskSection === 'studien' }", @click="$emit('open-desk', 'studien')", title="Befragungsinstitut (B)")
      b-icon(icon="poll", size="is-small")

    button.werkzeug-btn(@click="$emit('toggle-command-palette')", title="Einwohnermelderegister (Cmd+K)")
      b-icon(icon="magnify", size="is-small")

  //- Datums-Stempel des Stadtarchivs
  .datum-stempel
    .z1 BLOBTOPIA-ARCHIV
    .z2 Jahr {{ year }} · Tag {{ dayOfYear }} · {{ hourDisplay }}
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import FloatingPanel from '@/components/floating-panel'
import { ERAS, getEraForTick } from '@/config/timeline-eras'

export default {
  name: 'TopBar'
  , components: { FloatingPanel }
  , props: {
    showFeed: Boolean
  }
  , emits: ['toggle-feed', 'set-room', 'open-desk', 'toggle-command-palette', 'fire-event']
  , computed: {
    populationCount(){
      const gen = this.getCurrentGeneration()
      return gen ? gen.blobs.length : '—'
    }
    , hourDisplay(){
      return String(this.hour).padStart(2, '0') + ':00'
    }
    , dayOfYear(){
      // Tick % 365 als Archiv-Tagesnummer (Monat/Tag bleiben im Detail
      // den Dokumenten vorbehalten)
      return ((this.tick || 0) % 365) + 1
    }
    , eraLabel(){
      if (!this.timelineMode) return null
      const idx = getEraForTick(this.tick)
      return ERAS[idx] ? ERAS[idx].name : null
    }
    , ...mapState(useSimulationStore, {
      isLiveMode: 'isLiveMode'
      , timelineMode: 'timelineMode'
      , getCurrentGeneration: 'getCurrentGeneration'
      , room: 'room'
      , deskSection: 'deskSection'
      , year: 'year'
      , hour: 'hour'
      , tick: 'tick'
    })
  }
  , methods: {
    setRoom(room){
      this.$emit('set-room', room)
    }
    , goToAbout() {
      const gen = this.$route.params.generationIndex || '0'
      this.$router.push({ name: 'about', params: { generationIndex: gen } })
    }
  }
}
</script>

<style lang="sass" scoped>
// Die Leiste ist die Oberkante der Akte. Stadt (Hauptmenü): die Reiter hängen
// direkt über der lebenden Stadt — KEINE eigene Leiste (wie im Designprototyp),
// sonst kollidiert das Braun mit den Grüntönen. Nur am Schreibtisch legt sich
// eine Manila-Kopfleiste über das Holz.
.akten-leiste
  position: absolute
  top: 0
  left: 0
  right: 0
  z-index: 10
  height: 48px
  display: flex
  align-items: flex-start
  padding: 0
  pointer-events: none
  > *
    pointer-events: auto

  // Schreibtisch: gedämpfter Manila-Karton mit Falzkante über dem Holz
  &.ist-schreibtisch
    pointer-events: auto
    background: linear-gradient(180deg, #cbbd98 0%, #bdac80 60%, #af9d70 100%)
    border-bottom: 2px solid rgba(86, 64, 33, 0.42)
    box-shadow: 0 3px 7px rgba(40, 28, 8, 0.24), inset 0 -4px 7px rgba(86, 64, 33, 0.13), inset 0 1px 0 rgba(255, 250, 235, 0.45)

.logo-sticker
  margin: 5px 10px 0 12px
  width: 38px
  height: 38px
  background: #fff
  border-radius: 50%
  display: flex
  align-items: center
  justify-content: center
  transform: rotate(-7deg)
  box-shadow: 0 3px 7px rgba(0, 0, 0, 0.35)
  border: 2px dashed rgba(43, 58, 85, 0.15)
  cursor: pointer
  transition: transform 0.15s ease
  &:hover
    transform: rotate(-2deg) scale(1.05)
  img
    width: 30px
    pointer-events: none

.reiter-leiste
  display: flex
  gap: 5px

.reiter
  font-family: var(--inst-schreibmaschine)
  font-size: 14.5px
  letter-spacing: 1px
  padding: 8px 22px 10px
  border: none
  border-radius: 0 0 12px 12px
  color: #7a6c4e
  background: #d9cba8
  box-shadow: inset 0 -6px 8px rgba(90, 70, 30, 0.18)
  cursor: pointer
  transition: background 0.15s ease, color 0.15s ease
  &:hover
    background: #e4d8b8
  &.aktiv
    background: var(--inst-papier)
    color: var(--inst-tinte)
    box-shadow: 0 5px 10px rgba(60, 40, 10, 0.35)
    position: relative
    // Lochverstärkung im aktiven Reiter
    &::after
      content: ''
      position: absolute
      right: 9px
      top: 8px
      width: 7px
      height: 7px
      border-radius: 50%
      background: rgba(0, 0, 0, 0.12)
      box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.3)

.leiste-mitte
  display: flex
  align-items: center
  gap: 0.4rem
  margin: 11px 0 0 16px
  font-family: var(--inst-schreibmaschine)
  font-size: 0.62rem
  letter-spacing: 1px
  // Stadt: helle Notiz, lesbar über der lebenden Stadt
  color: rgba(255, 253, 252, 0.92)
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.7)

  .aera
    font-style: italic
    opacity: 0.85

// Schreibtisch: getippte Aktennotiz auf dem Manila-Karton (braune Tinte)
.ist-schreibtisch .leiste-mitte
  color: rgba(74, 56, 28, 0.85)
  text-shadow: 0 1px 0 rgba(255, 248, 230, 0.4)

.leiste-rechts
  display: flex
  align-items: center
  gap: 4px
  margin: 7px 8px 0 auto

.werkzeug-btn
  // kleine Papier-Chips, die auf dem Karton liegen
  display: flex
  align-items: center
  justify-content: center
  width: 32px
  height: 28px
  border: 1px solid rgba(120, 96, 56, 0.35)
  border-radius: 6px
  background: linear-gradient(180deg, #fdfaf1, #f1e9d6)
  color: var(--inst-tinte-soft)
  cursor: pointer
  transition: all 0.15s
  box-shadow: 0 2px 4px rgba(50, 35, 12, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.7)
  &:hover
    background: #fff
    color: var(--inst-tinte)
    border-color: rgba(120, 96, 56, 0.5)
  &.active
    background: var(--inst-stempelblau)
    color: #fff
    border-color: var(--inst-stempelblau)

.datum-stempel
  margin: 6px 12px 0 6px
  transform: rotate(2deg)
  font-family: var(--inst-schreibmaschine)
  color: var(--inst-stempelrot)
  text-align: center
  border: 2px solid var(--inst-stempelrot)
  border-radius: 6px
  padding: 2px 10px 3px
  background: rgba(252, 248, 238, 0.82)
  line-height: 1.25
  user-select: none

  .z1
    font-size: 7.5px
    letter-spacing: 1.5px
  .z2
    font-size: 11.5px
    font-weight: bold
    letter-spacing: 0.5px
    white-space: nowrap

.event-menu
  padding: 0.25rem 0
  .event-item
    display: flex
    align-items: center
    gap: 0.5rem
    padding: 0.5rem 0.75rem
    cursor: pointer
    white-space: nowrap
</style>
