<template lang="pug">
.blob-interaction(:class="{ 'has-timeline': timelineMode }", @click.self="$emit('close')")
  .interaction-card(:class="{ 'chat-mode': mode === 'chat' }")
    //- Header (shared across both modes)
    .interaction-header
      .district-badge(:style="{ backgroundColor: districtHex }")
      .header-text
        .blob-name(v-if="blob.name") {{ blob.name }}
      .header-actions
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
              .info-value {{ blob.job || blob.education_label }}
            .info-item
              .info-label Bildung
              .info-value {{ blob.education_label }}
            .info-item
              .info-label Einkommen
              .info-value {{ Math.round(blob.income) }} €
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
                , @click.native.stop="copyMessage(msg)"
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
import { mapState, mapGetters } from 'vuex'
import { DISTRICT_COLORS } from '@/lib/blob-adapter'
import BlobChatExport from './blob-chat-export'

export default {
  name: 'BlobInteraction'
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
    }
  }
  , computed: {
    ...mapState('chat', { chatLoading: 'isLoading', chatError: 'error' })
    , ...mapGetters('chat', ['activeSession', 'activeMessages'])
    , districtHex() {
      const hex = DISTRICT_COLORS[this.blob.district] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
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
  , beforeDestroy() {
    document.removeEventListener('keydown', this._escHandler)
  }
  , methods: {
    startChat() {
      const tick = this.timelineMode ? (this.$store.getters['simulation/tick'] || 0) : null
      this.$store.dispatch('chat/startInterview', {
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
      this.$store.dispatch('chat/sendMessage', text)
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
      this.$store.dispatch('chat/endInterview')
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
.blob-interaction
  position: absolute
  bottom: 1rem
  left: 1rem
  z-index: 5
  pointer-events: auto
  &.has-timeline
    bottom: 10rem

.interaction-card
  background: rgba(0, 0, 0, 0.85)
  backdrop-filter: blur(8px)
  border-radius: 8px
  border: 1px solid rgba(255, 255, 255, 0.15)
  width: 320px
  max-height: 70vh
  overflow-y: auto
  color: $grey-lighter
  font-size: 0.8rem
  transition: width 200ms ease-out
  &.chat-mode
    width: 400px
    max-height: calc(100vh - 28rem)
    overflow: hidden
    display: flex
    flex-direction: column

// ═══ Header ═══
.interaction-header
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.6rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  flex-shrink: 0

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

  .header-actions
    display: flex
    gap: 0.3rem
    flex-shrink: 0

  .action-btn
    cursor: pointer
    color: $grey
    display: inline-flex
    align-items: center
    padding: 2px
    &:hover
      color: $grey-lighter

// ═══ Quick Stats ═══
.quick-stats
  display: flex
  justify-content: space-around
  padding: 0.5rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  background: rgba(255, 255, 255, 0.03)

  .qs-item
    display: flex
    flex-direction: column
    align-items: center
    gap: 1px

  .qs-value
    font-size: 0.85rem
    font-weight: 700
    color: $grey-lighter

  .qs-label
    font-size: 0.55rem
    color: $grey
    text-transform: uppercase
    letter-spacing: 0.3px

// ═══ Inspect Body ═══
.inspect-body
  overflow-y: auto

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

  .lr-track
    overflow: visible

    .lr-marker
      position: absolute
      top: -3px
      width: 12px
      height: 12px
      border-radius: 50%
      background: $grey-lighter
      transform: translateX(-50%)
      border: 2px solid rgba(0, 0, 0, 0.4)
      transition: left 0.3s

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
.collapse-enter, .collapse-leave-to
  max-height: 0
  opacity: 0

.interview-section
  padding-bottom: 0.75rem

// ═══ Chat Body ═══
.chat-body
  display: flex
  flex-direction: column
  overflow: hidden
  flex: 1
  min-height: 0

.compact-profile
  display: flex
  gap: 0.75rem
  padding: 0.4rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.08)
  flex-shrink: 0

  .compact-item
    display: flex
    flex-direction: column
    align-items: center

  .compact-label
    font-size: 0.6rem
    color: $grey
    text-transform: uppercase
    letter-spacing: 0.3px

  .compact-value
    font-size: 0.7rem
    font-weight: 600

.chat-messages
  flex: 1
  overflow-y: auto
  padding: 0.75rem
  display: flex
  flex-direction: column
  gap: 0.5rem

.message
  display: flex

  &.user
    justify-content: flex-end
    .bubble
      background: $primary
      color: #fff
      border-radius: 12px 12px 2px 12px

  &.assistant
    justify-content: flex-start
    .bubble
      background: rgba(255, 255, 255, 0.12)
      color: $grey-lighter
      border-radius: 12px 12px 12px 2px

  .bubble
    max-width: 85%
    padding: 0.5rem 0.75rem
    font-size: 0.82rem
    line-height: 1.45
    white-space: pre-wrap
    word-wrap: break-word
    position: relative

  .bubble.typing
    display: flex
    gap: 0.25rem
    padding: 0.6rem 0.8rem
    .dot
      width: 6px
      height: 6px
      border-radius: 50%
      background: $grey
      animation: typing-bounce 1.2s infinite
      &:nth-child(2)
        animation-delay: 0.2s
      &:nth-child(3)
        animation-delay: 0.4s

@keyframes typing-bounce
  0%, 80%, 100%
    transform: translateY(0)
  40%
    transform: translateY(-6px)

.copy-btn
  position: absolute
  top: 0.3rem
  right: 0.3rem
  opacity: 0
  transition: opacity 0.15s
  cursor: pointer
  color: $grey
  &:hover
    color: $grey-lighter

.message.assistant .bubble:hover .copy-btn
  opacity: 0.6

.error-banner
  display: flex
  align-items: center
  gap: 0.3rem
  padding: 0.4rem 0.6rem
  background: rgba(231, 76, 60, 0.15)
  border: 1px solid rgba(231, 76, 60, 0.3)
  border-radius: 6px
  font-size: 0.75rem
  color: #e74c3c

.chat-footer
  border-top: 1px solid rgba(255, 255, 255, 0.12)
  padding: 0.5rem 0.75rem
  flex-shrink: 0

.input-row
  display: flex
  gap: 0.4rem
  margin-bottom: 0.4rem

.chat-input
  flex: 1
  background: rgba(255, 255, 255, 0.08)
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 8px
  color: $grey-lighter
  padding: 0.4rem 0.6rem
  font-size: 0.82rem
  resize: none
  outline: none
  font-family: inherit
  max-height: 80px
  &:focus
    border-color: $primary
  &::placeholder
    color: $grey
  &:disabled
    opacity: 0.5

.send-btn
  align-self: flex-end

.end-row
  margin-top: 0.25rem

// ═══ Mode transition ═══
.mode-fade-enter-active, .mode-fade-leave-active
  transition: opacity 150ms ease
.mode-fade-enter, .mode-fade-leave-to
  opacity: 0
</style>
