<template lang="pug">
.blob-interaction(:class="{ 'has-timeline': timelineMode }", :style="panelStyle", @click.self="$emit('close')")
  .interaction-card(:class="{ 'chat-mode': mode === 'chat' }", :style="cardStyle")
    //- Karteikarten-Kopf (shared across both modes, doubles as drag handle)
    .interaction-header
      .kk-kopfzeile
        span {{ mode === 'chat' ? 'INTERVIEW-PROTOKOLL' : 'KARTEIKARTE' }}
        span.rec-indikator(v-if="mode === 'chat'")
          i.rec-punkt
          | AUFNAHME
        span(v-else) FELDNOTIZ
      .kopf-reihe
        .polaroid
          .foto
            .blob-avatar(:style="avatarStyle")
            span.auge.a1
            span.auge.a2
            span(:class="emotionMouth")
          .unterschrift {{ vorname }}
        .header-text
          .blob-name(v-if="blob.name") {{ blob.name }}
          .kk-beobachtet
            span.distrikt-flagge(:style="{ backgroundColor: districtHex }")
            span.emotion-notiz(v-if="emotionLabel") wirkt {{ emotionLabel }}!
        .header-actions
          span.action-btn.lock-btn(v-if="mode === 'inspect'", @click="onLockClick")
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
          span.action-btn(v-if="mode === 'inspect'", @click="startChat")
            b-icon(icon="forum", size="is-small")
          span.action-btn(v-if="mode === 'chat'", @click="mode = 'inspect'")
            b-icon(icon="information-outline", size="is-small")
          span.action-btn(@click="$emit('close')")
            b-icon(icon="close", size="is-small")

    //- Body: Inspect or Chat
    transition(name="mode-fade", mode="out-in")
      //- ═══ INSPECT MODE ═══
      .inspect-body(v-if="mode === 'inspect'", key="inspect")
        .inspector-data(v-if="inspectorUnlocked")
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
              .bar-track.lr-track
                .lr-marker(:style="{ left: ((blob.attitudes.ideology - 1) / 9 * 100) + '%' }")
              .bar-value {{ blob.attitudes.ideology.toFixed(1) }}
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
            , @click="startChat"
          )
            b-icon(icon="forum", size="is-small")
            span Interview führen

      //- ═══ CHAT MODE ═══
      .chat-body(v-else, key="chat")
        .chat-messages(ref="messagesContainer")
          .message(v-for="(msg, i) in messages", :key="i", :class="msg.role")
            .bubble
              span {{ msg.content }}
              b-icon.copy-btn(
                v-if="msg.role === 'assistant'"
                , icon="content-copy"
                , size="is-small"
                , @click.stop="copyMessage(msg)"
              )

          .message.assistant(v-if="chatLoading")
            .bubble.typing
              span.dot
              span.dot
              span.dot

          .error-banner(v-if="chatError")
            b-icon(icon="alert-circle", size="is-small")
            span {{ chatError }}

        .chat-footer
          .input-row(v-if="!sessionEnded")
            textarea.chat-input(
              ref="chatInput"
              , v-model="inputText"
              , placeholder="Frage stellen..."
              , rows="1"
              , @keydown="onInputKeyDown"
              , :disabled="chatLoading"
            )
            b-button.send-btn(
              type="is-primary"
              , size="is-small"
              , :loading="chatLoading"
              , :disabled="!inputText.trim() || chatLoading"
              , @click="send"
            )
              b-icon(icon="send", size="is-small")
          .end-row
            b-button(
              v-if="!sessionEnded"
              , size="is-small"
              , type="is-danger"
              , outlined
              , expanded
              , @click="endInterview"
            ) Interview beenden
            b-button(
              v-else
              , size="is-small"
              , type="is-primary"
              , outlined
              , expanded
              , @click="showExport = true"
            ) Transkript exportieren

  BlobChatExport(
    v-if="showExport"
    , :messages="messages"
    , :blob-name="blob.name || 'Blob'"
    , :blob-id="blob.id"
    , @close="showExport = false"
  )
</template>

<script>
import { mapState, mapStores } from 'pinia'
import { useChatStore } from '@/stores/chat'
import { useSimulationStore } from '@/stores/simulation'
import { DISTRICT_COLORS } from '@/lib/blob-adapter'
import BlobChatExport from './blob-chat-export'
import draggablePanel from '@/mixins/draggable-panel'

export default {
  name: 'BlobInteraction'
  , mixins: [draggablePanel]
  , components: { BlobChatExport }
  , props: {
    blob: {
      type: Object
      , required: true
    }
    , timelineMode: {
      type: Boolean
      , default: false
    }
    , initialMode: {
      type: String
      , default: 'inspect'
    }
  }
  , data() {
    return {
      mode: this.initialMode
      , inputText: ''
      , showExport: false
      , showLatent: false
      , inspectorUnlocked: localStorage.getItem('blobtopia_inspector_unlocked') === 'true'
      , showPasswordInput: false
      , passwordAttempt: ''
      , passwordError: false
    }
  }
  , computed: {
    panelConfig() {
      return {
        storageKey: 'blobtopia_panel_blobInteraction'
        , minWidth: 300
        , maxWidth: 700
        , minHeight: 250
        , maxHeight: Math.round(window.innerHeight * 0.9)
        , headerSelector: '.interaction-header'
        , resizable: true
      }
    }
    , ...mapStores(useChatStore, useSimulationStore)
    , ...mapState(useChatStore, { chatLoading: 'isLoading', chatError: 'error' })
    , ...mapState(useChatStore, ['activeSession', 'activeMessages'])
    , cardStyle() {
      if (this.panelW !== null || this.panelH !== null) {
        return { width: '100%', height: '100%', maxHeight: 'none' }
      }
      return {}
    }
    , districtHex() {
      const hex = DISTRICT_COLORS[this.blob.district] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    // Polaroid-Porträt: Distrikt-UI-Ton + Emotionsgesicht (s. _institut.scss)
    , avatarStyle() {
      const tones = [
        ['#84d995', '#46a85c'], ['#f6d564', '#e3af2c'], ['#7cc0ee', '#4596d8']
        , ['#f3b070', '#e8893a'], ['#aab3c4', '#7d8ca3']
      ]
      const d = tones[this.blob.district] || tones[4]
      return { background: `linear-gradient(180deg, ${d[0]}, ${d[1]})` }
    }
    , vorname() {
      return (this.blob.name || '').split(' ')[0] || 'Blob'
    }
    , emotionLabel() {
      return this.blob.emotion && this.blob.emotion.label
    }
    , emotionMouth() {
      const l = (this.emotionLabel || '').toLowerCase()
      if (/wütend|frustriert|besorgt|angespannt/.test(l)) return 'mund-sauer'
      if (/begeistert|hoffnungsvoll|zufrieden/.test(l)) return 'mund-froh'
      return 'mund-neutral'
    }
    , satisfactionColor() {
      if (!this.blob.attitudes) return '#999'
      const sat = this.blob.attitudes.political_satisfaction
      if (sat >= 7) return '#4ecca3'
      if (sat >= 4) return '#f0c929'
      return '#e74c3c'
    }
    , lrValue() {
      if (!this.blob.attitudes) return 6
      return Math.round((this.blob.attitudes.ideology + 5) / 10 * 10 + 1)
    }
    , lrLabel() {
      return this.lrValue
    }
    , ideologyStyle() {
      if (!this.blob.attitudes) return {}
      const ideo = this.blob.attitudes.ideology
      const center = 50
      const offset = (ideo / 5) * 50
      if (offset >= 0) {
        return { left: center + '%', width: offset + '%', backgroundColor: '#e74c3c' }
      } else {
        return { left: (center + offset) + '%', width: (-offset) + '%', backgroundColor: '#3498db' }
      }
    }
    , messages() {
      return this.activeMessages
    }
    , sessionEnded() {
      const session = this.activeSession
      return session ? session.ended : false
    }
    // Latent trait items
    , efficacyItems() {
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Selbstwirksamkeit', value: t.self_efficacy }
        , { label: 'Pol. Wissen', value: t.political_knowledge }
        , { label: 'Stimme zählt', value: t.vote_importance }
        , { label: 'Ext. Wirksamkeit', value: t.external_efficacy }
      ]
    }
    , socialItems() {
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Netzwerk', value: t.network_size, max: 20 }
        , { label: 'Nachbar-Vertrauen', value: t.neighbor_trust, max: 10 }
        , { label: 'Gemeinschaft', value: t.community_participation, max: 10 }
        , { label: 'Allg. Vertrauen', value: t.generalized_trust, max: 10 }
        , { label: 'Medienvertrauen', value: t.media_trust, max: 10 }
      ]
    }
    , authItems() {
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Gehorsam', value: t.obedience_value }
        , { label: 'Regelkonformität', value: t.rule_conformity }
        , { label: 'Starke Führung', value: t.strong_leader_preference }
      ]
    }
    , alienationItems() {
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Machtlosigkeit', value: t.powerlessness }
        , { label: 'Komplexität', value: t.political_complexity }
        , { label: 'Partei-Indifferenz', value: t.party_indifference }
      ]
    }
    , materialismItems() {
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Wirtsch. Sicherheit', value: t.economic_security_priority }
        , { label: 'Umwelt > Wirtschaft', value: t.environment_over_economy }
        , { label: 'Freiheit > Ordnung', value: t.freedom_over_order }
      ]
    }
    , populismItems() {
      const t = this.blob.latent_traits || {}
      return [
        { label: 'Anti-Elitismus', value: t.anti_elitism }
        , { label: 'Volkszentrismus', value: t.people_centrism }
        , { label: 'Gut-Böse-Denken', value: t.manichean_outlook }
      ]
    }
    , policyItems() {
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
  , watch: {
    messages: {
      handler() {
        this.$nextTick(() => this.scrollToBottom())
      }
      , deep: true
    }
    , chatLoading() {
      this.$nextTick(() => this.scrollToBottom())
    }
    , mode(newMode) {
      if (newMode === 'chat') {
        this.$nextTick(() => {
          if (this.$refs.chatInput) this.$refs.chatInput.focus()
          this.scrollToBottom()
        })
      }
    }
    , blob(newBlob, oldBlob) {
      // When switching to a different blob, reset to inspect mode
      if (newBlob && oldBlob && newBlob.id !== oldBlob.id) {
        this.mode = 'inspect'
        this.showLatent = false
      }
    }
  }
  , mounted() {
    this._escHandler = (e) => this.onKeyDown(e)
    document.addEventListener('keydown', this._escHandler)
  }
  , beforeUnmount() {
    document.removeEventListener('keydown', this._escHandler)
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
      const correct = import.meta.env.VUE_APP_INSPECTOR_PASSWORD || 'blob123'
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
    , startChat() {
      const tick = this.timelineMode ? (this.simulationStore.tick || 0) : null
      this.chatStore.startInterview({
        blobId: this.blob.id
        , tick
        , blobName: this.blob.name || 'Blob'
        , blob: this.blob
      })
      this.mode = 'chat'
    }
    , send() {
      const text = this.inputText.trim()
      if (!text || this.chatLoading) return
      this.chatStore.sendMessage(text)
      this.inputText = ''
      if (this.$refs.chatInput) {
        this.$refs.chatInput.style.height = 'auto'
      }
    }
    , onInputKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.send()
      }
    }
    , onKeyDown(e) {
      if (e.key === 'Escape') {
        // Don't intercept if user is in an unrelated input
        const tag = e.target.tagName
        if (tag === 'INPUT' || tag === 'SELECT') return
        // Allow Escape from our own textarea
        if (this.mode === 'chat') {
          this.mode = 'inspect'
        } else {
          this.$emit('close')
        }
      }
    }
    , scrollToBottom() {
      const el = this.$refs.messagesContainer
      if (el) {
        el.scrollTop = el.scrollHeight
      }
    }
    , endInterview() {
      this.chatStore.endInterview()
      this.showExport = true
    }
    , async copyMessage(msg) {
      try {
        await navigator.clipboard.writeText(msg.content)
      } catch {
        // Fallback: select text
        const textarea = document.createElement('textarea')
        textarea.value = msg.content
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      }
    }
  }
}
</script>

<style lang="sass" scoped>
// ═══════════════════════════════════════════════════════════════════════
// Die Karteikarte des Feldforschers (Inspect) bzw. das Interview-Protokoll
// (Chat) — liniertes Karteipapier mit Polaroid, rote Randlinie,
// Schreibmaschine. Zielbild: design-prototyp/komplett.html
// ═══════════════════════════════════════════════════════════════════════

$korn: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2'/%3E%3CfeColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .04 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E")

.blob-interaction
  position: absolute
  bottom: 1rem
  left: 1rem
  z-index: 8
  pointer-events: auto
  filter: drop-shadow(0 12px 24px rgba(40, 28, 8, 0.4))
  .interaction-card
    max-height: calc(100vh - 48px - 2rem)
  &.has-timeline
    bottom: 7.5rem
    .interaction-card
      max-height: calc(100vh - 48px - 8.5rem)

.interaction-card
  width: 360px
  max-height: 80vh
  display: flex
  flex-direction: column
  overflow: hidden
  color: var(--inst-tinte)
  font-family: var(--inst-druck)
  font-size: 0.78rem
  background-color: var(--inst-papier-hell)
  background-image: repeating-linear-gradient(180deg, transparent 0 26px, var(--inst-kartei-linie) 26px 27px), $korn
  border-radius: 2px
  // rote Karteikarten-Randlinie
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
  &.chat-mode
    width: 400px

// ── Kopf (Drag-Griff) ──
.interaction-header
  flex-shrink: 0
  padding: 8px 12px 6px 24px
  cursor: grab
  position: relative
  &:active
    cursor: grabbing

.kk-kopfzeile
  display: flex
  justify-content: space-between
  align-items: center
  font-family: var(--inst-schreibmaschine)
  font-size: 0.56rem
  letter-spacing: 2px
  color: var(--inst-beschriftung)
  border-bottom: 1.5px solid rgba(43, 58, 85, 0.5)
  padding-bottom: 3px

.rec-indikator
  display: inline-flex
  align-items: center
  gap: 5px
  font-weight: bold
  color: #c0392b
  letter-spacing: 1.5px
  .rec-punkt
    width: 8px
    height: 8px
    border-radius: 50%
    background: #e8463a
    box-shadow: 0 0 6px #e8463a
    animation: rec-blink 1.4s infinite

@keyframes rec-blink
  0%, 100%
    opacity: 1
  50%
    opacity: 0.25

.kopf-reihe
  display: flex
  align-items: center
  gap: 10px
  margin-top: 7px

// Polaroid mit Blob-Porträt (Emotion = Gesicht)
.polaroid
  flex: none
  width: 64px
  padding: 4px 4px 14px
  background: #fff
  box-shadow: 0 4px 9px rgba(0, 0, 0, 0.3)
  transform: rotate(-4deg)
  position: relative

  .foto
    width: 56px
    height: 50px
    background: linear-gradient(180deg, #bfe3f7 0 62%, #9fd3a0 62%)
    position: relative
    overflow: hidden

  .blob-avatar
    position: absolute
    left: 50%
    bottom: 3px
    transform: translateX(-50%)
    width: 36px
    height: 32px
    border-radius: 46% 54% 52% 48% / 60% 58% 42% 40%
    &::before
      content: ''
      position: absolute
      left: 16%
      top: 10%
      width: 36%
      height: 24%
      background: rgba(255, 255, 255, 0.55)
      border-radius: 50%
      transform: rotate(-14deg)

  .auge
    position: absolute
    width: 4.5px
    height: 5.5px
    background: #1d2b3a
    border-radius: 50%
    top: 28px
    z-index: 2
  .a1
    left: 21px
  .a2
    left: 31px

  .mund-sauer, .mund-froh, .mund-neutral
    position: absolute
    left: 50%
    transform: translateX(-50%)
    z-index: 2
  .mund-sauer
    width: 9px
    height: 4.5px
    border-top: 2px solid #1d2b3a
    border-radius: 50%
    top: 36px
  .mund-froh
    width: 9px
    height: 5px
    border-bottom: 2px solid #1d2b3a
    border-radius: 50%
    top: 33px
  .mund-neutral
    width: 8px
    height: 2px
    background: #1d2b3a
    border-radius: 2px
    top: 36px

  .unterschrift
    position: absolute
    bottom: 0
    left: 0
    right: 0
    text-align: center
    font-family: var(--inst-hand)
    font-size: 0.66rem
    color: var(--inst-graphit)

.header-text
  flex: 1
  min-width: 0

.blob-name
  font-family: var(--inst-schreibmaschine)
  font-weight: bold
  font-size: 1.02rem
  color: var(--inst-tinte)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.kk-beobachtet
  display: flex
  align-items: center
  gap: 6px
  margin-top: 3px

.distrikt-flagge
  display: inline-block
  width: 11px
  height: 11px
  border-radius: 2px
  box-shadow: 0 1px 1px rgba(0, 0, 0, 0.25)
  flex-shrink: 0

.emotion-notiz
  font-family: var(--inst-hand)
  font-size: 0.92rem
  color: var(--inst-handrot)
  transform: rotate(-1.5deg)
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.header-actions
  display: flex
  gap: 0.25rem
  flex-shrink: 0
  align-self: flex-start
  position: relative

.action-btn
  cursor: pointer
  color: var(--inst-beschriftung)
  display: inline-flex
  align-items: center
  padding: 2px
  &:hover
    color: var(--inst-stempelrot)
  &.lock-btn:hover
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
    &::placeholder
      color: var(--inst-stempelrot)

// ── Karteikarten-Körper (Inspektion) ──
.inspect-body
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto
  padding: 8px 12px 12px 24px
  &::-webkit-scrollbar
    width: 6px
  &::-webkit-scrollbar-thumb
    border-radius: 3px
    background: rgba(43, 58, 85, 0.25)

.inspector-section
  margin-bottom: 0.7rem
  &:last-child
    margin-bottom: 0

  h4
    font-size: 0.58rem
    font-weight: 800
    letter-spacing: 1.5px
    text-transform: uppercase
    color: var(--inst-beschriftung)
    border-bottom: 1px solid rgba(141, 127, 99, 0.4)
    padding-bottom: 2px
    margin: 0 0 0.35rem
    display: flex
    justify-content: space-between
    align-items: center

  h5
    font-size: 0.56rem
    font-weight: 800
    letter-spacing: 1px
    text-transform: uppercase
    color: #9c2f63
    margin: 0.45rem 0 0.2rem

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

// Einstellungs-Balken in Bleistift
.bar-item
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.25rem

  .bar-label
    width: 86px
    font-size: 0.62rem
    color: var(--inst-tinte-soft)
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .bar-track
    flex: 1
    height: 9px
    background: rgba(43, 58, 85, 0.07)
    border-radius: 2px
    overflow: hidden
    position: relative

  .bar-fill
    display: block
    height: 100%
    // Distrikt-/Statusfarbe kommt inline — Schraffur als Überzug
    background-image: repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.35) 0 2px, transparent 2px 4px)

  .bar-value
    width: 30px
    text-align: right
    font-family: var(--inst-schreibmaschine)
    font-size: 0.66rem
    color: var(--inst-tinte)

  .lr-track
    background: linear-gradient(90deg, rgba(69, 150, 216, 0.25), rgba(43, 58, 85, 0.06) 50%, rgba(192, 57, 43, 0.25))

.lr-marker
  position: absolute
  top: -2px
  bottom: -2px
  width: 3px
  background: var(--inst-handrot)
  transform: translateX(-50%)
  border-radius: 2px

// Latente Konstrukte (Dozenten-Bereich → pink angehaucht)
.collapsible
  .clickable
    cursor: pointer

.latent-content
  border-left: 3px solid rgba(224, 105, 159, 0.45)
  padding-left: 8px
  margin-left: 1px

.latent-group
  margin-bottom: 0.4rem

.mini-bar
  display: flex
  align-items: center
  gap: 0.35rem
  margin-bottom: 2px

  .mini-label
    width: 110px
    font-size: 0.58rem
    color: var(--inst-tinte-soft)
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .mini-track
    flex: 1
    height: 6px
    background: rgba(43, 58, 85, 0.07)
    border-radius: 2px
    overflow: hidden

  .mini-fill
    display: block
    height: 100%
    background: repeating-linear-gradient(45deg, rgba(156, 47, 99, 0.55) 0 2px, rgba(156, 47, 99, 0.25) 2px 4px)

  .mini-value
    width: 26px
    text-align: right
    font-family: var(--inst-schreibmaschine)
    font-size: 0.6rem
    color: var(--inst-tinte)

.collapse-enter-active, .collapse-leave-active
  transition: all 0.25s ease
  overflow: hidden
.collapse-enter, .collapse-enter-from, .collapse-leave-to
  opacity: 0
  max-height: 0

.interview-section
  padding-top: 0.3rem

// ── Interview-Protokoll (Chat) ──
.chat-body
  flex: 1 1 auto
  min-height: 0
  display: flex
  flex-direction: column

.chat-messages
  flex: 1
  min-height: 120px
  overflow-y: auto
  padding: 8px 14px 8px 24px
  &::-webkit-scrollbar
    width: 6px
  &::-webkit-scrollbar-thumb
    border-radius: 3px
    background: rgba(43, 58, 85, 0.25)

// Nachrichten als Protokollzeilen mit Sprecher-Vermerk
.message
  margin-bottom: 0.55rem

  &::before
    display: block
    font-size: 0.52rem
    font-weight: 800
    letter-spacing: 1.5px
    color: var(--inst-beschriftung)
    margin-bottom: 1px

  &.user::before
    content: 'INTERVIEWER:IN'
    color: var(--inst-stempelblau)

  &.assistant::before
    content: 'BEFRAGTE:R'

  .bubble
    position: relative
    font-family: var(--inst-schreibmaschine)
    font-size: 0.74rem
    line-height: 1.5
    color: var(--inst-tinte)
    padding-right: 20px

  &.user .bubble
    color: #2c4470

  .copy-btn
    position: absolute
    right: 0
    top: 0
    cursor: pointer
    color: var(--inst-beschriftung)
    opacity: 0
    transition: opacity 0.15s
    &:hover
      color: var(--inst-tinte)

.message.assistant .bubble:hover .copy-btn
  opacity: 1

// Tipp-Indikator: drei Bleistift-Punkte
.bubble.typing
  display: inline-flex
  gap: 4px
  align-items: center
  .dot
    width: 6px
    height: 6px
    border-radius: 50%
    background: var(--inst-graphit)
    animation: typing-dot 1.2s infinite
    &:nth-child(2)
      animation-delay: 0.2s
    &:nth-child(3)
      animation-delay: 0.4s

@keyframes typing-dot
  0%, 60%, 100%
    opacity: 0.25
  30%
    opacity: 1

.error-banner
  display: flex
  align-items: center
  gap: 0.4rem
  margin: 0.4rem 0
  padding: 0.35rem 0.5rem
  border: 2px double var(--inst-stempelrot)
  border-radius: 3px
  color: var(--inst-stempelrot)
  font-size: 0.68rem
  font-weight: 600
  transform: rotate(-0.4deg)
  background: rgba(255, 255, 255, 0.4)

.chat-footer
  flex-shrink: 0
  padding: 6px 12px 10px 24px
  border-top: 1.5px dashed rgba(43, 58, 85, 0.25)

.input-row
  display: flex
  gap: 0.4rem
  align-items: flex-end

.chat-input
  flex: 1
  font-family: var(--inst-schreibmaschine)
  font-size: 0.76rem
  color: var(--inst-tinte)
  background: transparent
  border: none
  border-bottom: 1.5px dotted var(--inst-linie)
  outline: none
  resize: none
  padding: 2px 2px 3px
  line-height: 1.4
  &:focus
    border-bottom: 2px solid var(--inst-stempelblau)
  &::placeholder
    color: var(--inst-beschriftung)
  &:disabled
    opacity: 0.5

.send-btn
  flex-shrink: 0

.end-row
  margin-top: 0.45rem

.mode-fade-enter-active, .mode-fade-leave-active
  transition: opacity 0.18s ease
.mode-fade-enter, .mode-fade-enter-from, .mode-fade-leave-to
  opacity: 0
</style>
