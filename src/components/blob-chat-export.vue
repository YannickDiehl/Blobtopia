<template lang="pug">
.export-overlay(@click.self="$emit('close')")
  .export-card
    .export-header
      h3 Transkript exportieren
      b-icon.close-btn(icon="close", size="is-small", @click="$emit('close')")

    .export-body
      p.export-info {{ messages.length }} Nachrichten mit {{ blobName }}

      .export-actions
        b-button(type="is-primary", expanded, @click="copyToClipboard")
          b-icon(icon="content-copy", size="is-small")
          span In Zwischenablage kopieren

        b-button(type="is-info", outlined, expanded, @click="downloadJSON")
          b-icon(icon="code-json", size="is-small")
          span JSON herunterladen

        b-button(outlined, expanded, @click="downloadTXT")
          b-icon(icon="file-document-outline", size="is-small")
          span Textdatei (.txt)

      .copy-success(v-if="copied")
        b-icon(icon="check", size="is-small")
        span Kopiert!
</template>

<script>
export default {
  name: 'BlobChatExport'
  , props: {
    messages: { type: Array, required: true }
    , blobName: { type: String, default: 'Blob' }
    , blobId: { type: String, default: '' }
  }
  , data: () => ({
    copied: false
  })
  , computed: {
    plainText() {
      let text = `Interview mit ${this.blobName}\n`
      text += `Blob-ID: ${this.blobId}\n`
      text += `Datum: ${new Date().toLocaleString('de-DE')}\n`
      text += '─'.repeat(40) + '\n\n'
      for (const msg of this.messages) {
        const label = msg.role === 'user' ? 'Interviewer' : this.blobName
        text += `${label}:\n${msg.content}\n\n`
      }
      return text
    }
    , jsonData() {
      return {
        blob_id: this.blobId
        , blob_name: this.blobName
        , exported_at: new Date().toISOString()
        , message_count: this.messages.length
        , messages: this.messages.map(m => ({
          role: m.role
          , content: m.content
        }))
      }
    }
  }
  , methods: {
    async copyToClipboard() {
      try {
        await navigator.clipboard.writeText(this.plainText)
        this.copied = true
        setTimeout(() => { this.copied = false }, 2000)
      } catch {
        // Fallback
        const ta = document.createElement('textarea')
        ta.value = this.plainText
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        this.copied = true
        setTimeout(() => { this.copied = false }, 2000)
      }
    }
    , downloadJSON() {
      const blob = new Blob([JSON.stringify(this.jsonData, null, 2)], { type: 'application/json' })
      this.triggerDownload(blob, `interview_${this.blobId.substring(0, 8)}.json`)
    }
    , downloadTXT() {
      const blob = new Blob([this.plainText], { type: 'text/plain' })
      this.triggerDownload(blob, `interview_${this.blobId.substring(0, 8)}.txt`)
    }
    , triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
  }
}
</script>

<style lang="sass" scoped>
.export-overlay
  position: fixed
  top: 0
  left: 0
  right: 0
  bottom: 0
  background: rgba(0, 0, 0, 0.6)
  z-index: 20
  display: flex
  align-items: center
  justify-content: center

.export-card
  background: #1a1a2e
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 12px
  padding: 1.25rem
  width: 360px
  max-width: 90vw
  color: $grey-lighter

.export-header
  display: flex
  align-items: center
  justify-content: space-between
  margin-bottom: 1rem
  h3
    font-size: 1rem
    font-weight: 700
  .close-btn
    cursor: pointer
    color: $grey
    &:hover
      color: $grey-lighter

.export-info
  font-size: 0.85rem
  color: $grey
  margin-bottom: 0.75rem

.export-actions
  display: flex
  flex-direction: column
  gap: 0.5rem

.copy-success
  display: flex
  align-items: center
  gap: 0.25rem
  margin-top: 0.5rem
  color: #4ecca3
  font-size: 0.8rem
</style>
