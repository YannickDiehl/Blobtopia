<template lang="pug">
//- Der Schreibtisch: Auswertungsraum der Akte (docs/ui-institut.md).
//- Holzfläche + Schreibunterlage + Hängeregistratur links. Der Inhalt
//- der Mappen (Studien/Presse) wird vom InstructorLayout darübergelegt.
div
  .desk-room
    .schreibunterlage(:class="{ dozent: deskSection === 'dozent' }")

  //- Die Registratur liegt ÜBER den Dokument-Fenstern (z-index 9),
  //- damit die Mappen immer greifbar bleiben
  nav.registratur(aria-label="Registratur")
    .beschriftung Registratur
    button.mappe(
      :class="{ aktiv: deskSection === 'studien' }"
      , @click="$emit('select-section', 'studien')"
    )
      span Studien
      i.farbreiter(style="background: var(--inst-blau)")
    button.mappe(
      :class="{ aktiv: deskSection === 'presse' }"
      , @click="$emit('select-section', 'presse')"
    )
      span Presse
      i.farbreiter(style="background: var(--inst-orange)")
    button.mappe.dozent(
      :class="{ aktiv: deskSection === 'dozent', offen: instructorUnlocked }"
      , :title="instructorUnlocked ? 'Dozentenzimmer (entriegelt)' : 'Dozentenzimmer — hier wohnt die Wahrheit (verschlossen)'"
      , @click="$emit('select-section', 'dozent')"
    )
      span Dozentenzimmer
      span.schloss {{ instructorUnlocked ? '🔓' : '🔒' }}
      i.farbreiter(style="background: var(--inst-pink)")
</template>

<script>
import { mapState } from 'pinia'
import { useSurveyStore } from '@/stores/survey'

export default {
  name: 'DeskRoom'
  , props: {
    deskSection: { type: String, default: 'studien' }
  }
  , emits: ['select-section']
  , computed: {
    ...mapState(useSurveyStore, ['instructorUnlocked'])
  }
}
</script>

<style lang="sass" scoped>
.desk-room
  position: absolute
  inset: 0
  z-index: 5
  overflow: hidden
  // Holz-Schreibtisch
  background: radial-gradient(1200px 700px at 50% 30%, rgba(255, 250, 230, 0.16), transparent 70%), repeating-linear-gradient(94deg, rgba(70, 45, 20, 0.09) 0 3px, transparent 3px 90px), linear-gradient(170deg, var(--inst-holz-1), var(--inst-holz-2) 55%, #6d5037)

.schreibunterlage
  position: absolute
  left: 230px
  right: 40px
  top: 70px
  bottom: 96px
  background: linear-gradient(180deg, var(--inst-unterlage-1), var(--inst-unterlage-2))
  border-radius: 10px
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.35), 0 1px 0 rgba(255, 255, 255, 0.12)
  transition: background 0.4s ease

  // Im Dozentenzimmer wechselt die Unterlage die Farbe (Pink-Verwandtschaft)
  &.dozent
    background: linear-gradient(180deg, var(--inst-unterlage-dozent-1), var(--inst-unterlage-dozent-2))

.registratur
  position: absolute
  left: 0
  top: 110px
  width: 196px
  display: flex
  flex-direction: column
  z-index: 9

.beschriftung
  font-family: var(--inst-druck)
  font-size: 10px
  letter-spacing: 2px
  color: #bdaf8d
  font-weight: 800
  margin: 0 0 8px 22px
  text-transform: uppercase

.mappe
  position: relative
  height: 62px
  margin-bottom: 10px
  border: none
  border-radius: 0 12px 12px 0
  background: linear-gradient(180deg, #e9dec2, #dccfae)
  box-shadow: 0 5px 12px rgba(0, 0, 0, 0.35)
  display: flex
  align-items: center
  padding-left: 22px
  font-family: var(--inst-schreibmaschine)
  font-size: 15.5px
  color: #5a4c30
  cursor: pointer
  text-align: left
  width: 100%
  transition: width 0.18s ease, background 0.18s ease

  &:hover
    background: linear-gradient(180deg, #f1e7cd, #e4d8b8)

  &.aktiv
    background: linear-gradient(180deg, #fbf6e8, #f1e8d0)
    width: 112%
    color: var(--inst-tinte)

  // Dozentenzimmer: dunkle Mappe, entriegelt wird sie pink
  &.dozent
    background: linear-gradient(180deg, #5c5468, #4c4556)
    color: #cfc7da
    .schloss
      margin-left: auto
      margin-right: 16px
      font-size: 15px
    &:hover
      background: linear-gradient(180deg, #6a6178, #595166)
    &.offen
      background: linear-gradient(180deg, #8d5b77, #7b4a66)
      color: #ffe3f1
    &.aktiv
      background: linear-gradient(180deg, #9c6886, #8a5573)
      color: #fff0f8

  .farbreiter
    position: absolute
    right: -7px
    top: 12px
    bottom: 12px
    width: 14px
    border-radius: 0 5px 5px 0

// Schmale Viewports (Tablet hochkant): Registratur wird zur schmalen
// Griffleiste, damit die Dokumente Platz haben
@media (max-width: 900px)
  .registratur
    width: 64px
  .mappe
    padding-left: 10px
    font-size: 12px
    height: 54px
    span
      overflow: hidden
      text-overflow: ellipsis
      white-space: nowrap
      max-width: 38px
    &.aktiv
      width: 118%
  .schreibunterlage
    left: 80px
    right: 16px
</style>
