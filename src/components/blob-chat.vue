<template lang="pug">
.blob-chat
  .chat-header
    .chat-title
      b-icon(icon="forum", size="is-small")
      span Interview: {{ blobName }}
    .chat-actions
      b-tooltip(label="Transkript exportieren", position="is-left")
        b-icon.action-btn(icon="download", size="is-small", @click.native="showExport = true")
      b-icon.action-btn(icon="close", size="is-small", @click.native="onClose")

  .chat-messages(ref="messagesContainer")
    .message(v-for="(msg, i) in messages", :key="i", :class="msg.role")
      .bubble {{ msg.content }}

    .message.assistant(v-if="isLoading")
      .bubble.typing
        span.dot
        span.dot
        span.dot

    .error-banner(v-if="error")
      b-icon(icon="alert-circle", size="is-small")
      span {{ error }}

  .chat-footer
    .input-row(v-if="!sessionEnded")
      textarea.chat-input(
        ref="chatInput"
        , v-model="inputText"
        , placeholder="Frage stellen..."
        , rows="1"
        , @keydown="onKeyDown"
        , :disabled="isLoading"
      )
      b-button.send-btn(
        type="is-primary"
        , size="is-small"
        , :loading="isLoading"
        , :disabled="!inputText.trim() || isLoading"
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
    , :blob-name="blobName"
    , :blob-id="activeBlobId"
    , @close="showExport = false"
  )
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import BlobChatExport from './blob-chat-export'

export default {
  name: 'BlobChat'
  , components: { BlobChatExport }
  , data: () => ({
    inputText: ''
    , showExport: false
  })
  , computed: {
    ...mapState('chat', ['isLoading', 'error', 'activeBlobId'])
    , ...mapGetters('chat', ['activeMessages', 'activeSession'])
    , messages() {
      return this.activeMessages
    }
    , blobName() {
      const session = this.activeSession
      return session ? session.blobName || 'Blob' : 'Blob'
    }
    , sessionEnded() {
      const session = this.activeSession
      return session ? session.ended : false
    }
  }
  , watch: {
    messages: {
      handler() {
        this.$nextTick(() => this.scrollToBottom())
      }
      , deep: true
    }
    , isLoading() {
      this.$nextTick(() => this.scrollToBottom())
    }
  }
  , mounted() {
    this.$nextTick(() => {
      if (this.$refs.chatInput) this.$refs.chatInput.focus()
      this.scrollToBottom()
    })
  }
  , methods: {
    send() {
      const text = this.inputText.trim()
      if (!text || this.isLoading) return
      this.$store.dispatch('chat/sendMessage', text)
      this.inputText = ''
      // Reset textarea height
      if (this.$refs.chatInput) {
        this.$refs.chatInput.style.height = 'auto'
      }
    }
    , onKeyDown(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        this.send()
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
    , onClose() {
      this.$store.dispatch('chat/closeChat')
    }
  }
}
</script>

<style lang="sass" scoped>
.blob-chat
  position: absolute
  right: 0
  top: 4.5rem
  bottom: 0
  width: 380px
  background: rgba(0, 0, 0, 0.85)
  backdrop-filter: blur(8px)
  border-left: 1px solid rgba(255, 255, 255, 0.12)
  z-index: 3
  display: flex
  flex-direction: column
  color: $grey-lighter

  @media screen and (max-width: $tablet)
    width: 280px

.chat-header
  display: flex
  align-items: center
  justify-content: space-between
  padding: 0.5rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.12)
  flex-shrink: 0

  .chat-title
    display: flex
    align-items: center
    gap: 0.4rem
    font-weight: 600
    font-size: 0.85rem

  .chat-actions
    display: flex
    gap: 0.25rem

  .action-btn
    cursor: pointer
    color: $grey
    &:hover
      color: $grey-lighter

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
</style>
