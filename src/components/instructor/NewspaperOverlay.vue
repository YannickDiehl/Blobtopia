<template lang="pug">
.newspaper-overlay(@click.self="$emit('close')")
  .newspaper-chrome
    //- Toolbar
    .newspaper-toolbar
      .paper-tabs
        button.paper-tab(
          :class="{ active: paper === 'kurier' }"
          , @click="setPaper('kurier')"
        ) Kurier
        button.paper-tab(
          :class="{ active: paper === 'blobspiegel' }"
          , @click="setPaper('blobspiegel')"
        ) Blobspiegel

      .issue-nav(v-if="currentIssue")
        button.nav-btn(@click="prevIssue", :disabled="!hasPrev", title="Vorherige Ausgabe")
          b-icon(icon="chevron-left", size="is-small")
        .issue-label
          span.event-name {{ currentIssue.event_label }}
          span.issue-date J{{ currentIssue.year }}/M{{ currentIssue.month }}
        button.nav-btn(@click="nextIssue", :disabled="!hasNext", title="Nächste Ausgabe")
          b-icon(icon="chevron-right", size="is-small")

      .toolbar-actions
        .download-wrapper
          button.tool-btn(@click="showDownloads = !showDownloads", title="Herunterladen")
            b-icon(icon="download", size="is-small")
          transition(name="fade")
            .download-menu(v-if="showDownloads", @click.stop)
              .download-item(@click="downloadTXT")
                b-icon(icon="file-document-outline", size="is-small")
                span Textdatei (.txt)
              .download-item(@click="downloadJSON")
                b-icon(icon="code-json", size="is-small")
                span JSON (.json)
              .download-sep
              .download-item(@click="downloadAllTXT")
                b-icon(icon="file-multiple-outline", size="is-small")
                span Alle Ausgaben (.txt)
              .download-item(@click="downloadAllJSON")
                b-icon(icon="code-braces-box", size="is-small")
                span Alle Ausgaben (.json)
        button.tool-btn(@click="$emit('close')", title="Schließen (Esc)")
          b-icon(icon="close", size="is-small")

    //- Issue counter
    .issue-counter(v-if="eventTicks.length > 0")
      | Ausgabe {{ currentEventIndex + 1 }} von {{ eventTicks.length }}

    //- Content area
    .newspaper-scroll.scrollbars(ref="scrollArea")
      NewspaperPage(
        v-if="currentIssue"
        , :issue="currentIssue"
        , @select-blob="onSelectBlob"
      )
      .empty-state(v-else)
        b-icon(icon="newspaper", size="is-medium")
        p Noch keine Zeitungsausgaben erschienen.
</template>

<script>
import NewspaperPage from './NewspaperPage'

export default {
  name: 'NewspaperOverlay'
  , components: { NewspaperPage }
  , props: {
    issues: { type: Array, default: () => [] }
  }
  , data: () => ({
    paper: 'kurier'
    , currentTick: null
    , showDownloads: false
  })
  , computed: {
    // All unique event ticks (sorted), shared between both newspapers
    eventTicks() {
      const ticks = new Set(this.issues.map(i => i.tick))
      return [...ticks].sort((a, b) => a - b)
    }
    , currentEventIndex() {
      if (!this.currentTick) return -1
      return this.eventTicks.indexOf(this.currentTick)
    }
    , currentIssue() {
      if (!this.currentTick) return null
      return this.issues.find(i => i.newspaper === this.paper && i.tick === this.currentTick) || null
    }
    , hasPrev() { return this.currentEventIndex > 0 }
    , hasNext() { return this.currentEventIndex < this.eventTicks.length - 1 }
  }
  , watch: {
    issues: {
      immediate: true
      , handler(val) {
        if (val && val.length > 0 && !this.currentTick) {
          // Start at the most recent issue
          const ticks = [...new Set(val.map(i => i.tick))].sort((a, b) => a - b)
          this.currentTick = ticks[ticks.length - 1]
        }
      }
    }
  }
  , methods: {
    setPaper(p) {
      this.paper = p
      // currentTick stays the same = event-coupled navigation
    }
    , prevIssue() {
      if (this.hasPrev) {
        this.currentTick = this.eventTicks[this.currentEventIndex - 1]
        this.scrollToTop()
      }
    }
    , nextIssue() {
      if (this.hasNext) {
        this.currentTick = this.eventTicks[this.currentEventIndex + 1]
        this.scrollToTop()
      }
    }
    , scrollToTop() {
      this.$nextTick(() => {
        if (this.$refs.scrollArea) this.$refs.scrollArea.scrollTop = 0
      })
    }
    , onSelectBlob(blobId) {
      this.$emit('select-blob', blobId)
    }

    // ── Downloads ──
    , issueToPlainText(issue) {
      const s = issue.sections
      let text = `${'═'.repeat(56)}\n`
      text += `${issue.newspaper_name}\n`
      text += `Jahr ${issue.year}, Monat ${issue.month}, Tag ${issue.day}\n`
      text += `Ereignis: ${issue.event_label}\n`
      text += `${'═'.repeat(56)}\n\n`
      text += `LEITARTIKEL\n${s.leitartikel.headline}\n${'─'.repeat(40)}\n${s.leitartikel.body}\n\n`
      text += `LOKALNACHRICHT\n${s.lokalnachricht.headline}\n${'─'.repeat(40)}\n${s.lokalnachricht.body}\n\n`
      text += `KOMMENTAR\n${s.kommentar.headline}\n${'─'.repeat(40)}\n${s.kommentar.body}\n\n`
      text += `ZAHLEN: ${s.zahlen_box.headline}\n`
      for (const m of s.zahlen_box.metrics) { text += `  ${m.label}: ${m.value}\n` }
      text += `\nLESERBRIEFE\n`
      for (const lb of s.leserbriefe) {
        text += `  ${lb.blob_name} (${lb.district}):\n  "${lb.text}"\n\n`
      }
      if (s.kurzmeldungen && s.kurzmeldungen.length) {
        text += `KURZMELDUNGEN\n`
        for (const km of s.kurzmeldungen) { text += `  - ${km.text}\n` }
      }
      return text
    }
    , triggerDownload(blob, filename) {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    }
    , downloadTXT() {
      if (!this.currentIssue) return
      const text = this.issueToPlainText(this.currentIssue)
      this.triggerDownload(
        new Blob([text], { type: 'text/plain;charset=utf-8' })
        , `${this.currentIssue.newspaper}_J${this.currentIssue.year}_M${this.currentIssue.month}.txt`
      )
      this.showDownloads = false
    }
    , downloadJSON() {
      if (!this.currentIssue) return
      this.triggerDownload(
        new Blob([JSON.stringify(this.currentIssue, null, 2)], { type: 'application/json' })
        , `${this.currentIssue.newspaper}_J${this.currentIssue.year}_M${this.currentIssue.month}.json`
      )
      this.showDownloads = false
    }
    , downloadAllJSON() {
      const paperIssues = this.issues
        .filter(i => i.newspaper === this.paper)
        .sort((a, b) => a.tick - b.tick)
      if (!paperIssues.length) return
      const paperName = this.paper === 'kurier' ? 'Blobtopia_Kurier' : 'Der_Blobspiegel'
      this.triggerDownload(
        new Blob([JSON.stringify(paperIssues, null, 2)], { type: 'application/json' })
        , `${paperName}_alle_ausgaben.json`
      )
      this.showDownloads = false
    }
    , downloadAllTXT() {
      const paperIssues = this.issues
        .filter(i => i.newspaper === this.paper)
        .sort((a, b) => a.tick - b.tick)
      if (!paperIssues.length) return
      let text = ''
      for (const issue of paperIssues) {
        text += this.issueToPlainText(issue) + '\n\n'
      }
      const paperName = this.paper === 'kurier' ? 'Blobtopia_Kurier' : 'Der_Blobspiegel'
      this.triggerDownload(
        new Blob([text], { type: 'text/plain;charset=utf-8' })
        , `${paperName}_alle_ausgaben.txt`
      )
      this.showDownloads = false
    }
  }
  , mounted() {
    // Close download menu on outside click
    const handler = (e) => {
      if (this.showDownloads && !e.target.closest('.download-wrapper')) {
        this.showDownloads = false
      }
    }
    document.addEventListener('click', handler)
    this._clickHandler = handler
  }
  , beforeDestroy() {
    if (this._clickHandler) {
      document.removeEventListener('click', this._clickHandler)
    }
  }
}
</script>

<style lang="sass" scoped>
.newspaper-overlay
  position: fixed
  top: 0
  left: 0
  right: 0
  bottom: 0
  background: rgba(0, 0, 0, 0.65)
  z-index: 15
  display: flex
  align-items: flex-start
  justify-content: center
  padding-top: 52px

.newspaper-chrome
  width: 880px
  max-width: 95vw
  max-height: calc(100vh - 60px)
  display: flex
  flex-direction: column
  background: rgba(20, 20, 30, 0.95)
  border: 1px solid rgba(255, 255, 255, 0.1)
  border-radius: 8px
  overflow: hidden

// ── Toolbar ──
.newspaper-toolbar
  display: flex
  align-items: center
  gap: 0.75rem
  padding: 0.5rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.08)
  flex-shrink: 0

.paper-tabs
  display: flex
  gap: 2px
  background: rgba(255, 255, 255, 0.05)
  border-radius: 4px
  padding: 2px

.paper-tab
  padding: 0.3rem 0.75rem
  background: transparent
  border: none
  color: $grey
  font-size: 0.8rem
  font-weight: 600
  cursor: pointer
  border-radius: 3px
  transition: all 0.15s
  white-space: nowrap
  &:hover
    color: $grey-lighter
  &.active
    background: rgba(255, 255, 255, 0.12)
    color: $primary

.issue-nav
  display: flex
  align-items: center
  gap: 0.4rem
  flex: 1
  justify-content: center

.nav-btn
  background: transparent
  border: 1px solid rgba(255, 255, 255, 0.1)
  color: $grey-lighter
  cursor: pointer
  border-radius: 3px
  padding: 0.15rem 0.25rem
  display: flex
  align-items: center
  transition: all 0.15s
  &:hover:not(:disabled)
    background: rgba(255, 255, 255, 0.08)
  &:disabled
    opacity: 0.3
    cursor: default

.issue-label
  display: flex
  flex-direction: column
  align-items: center
  min-width: 140px

.event-name
  font-size: 0.8rem
  font-weight: 600
  color: $grey-lighter

.issue-date
  font-size: 0.65rem
  color: $grey

.toolbar-actions
  display: flex
  align-items: center
  gap: 0.35rem

.tool-btn
  background: transparent
  border: 1px solid rgba(255, 255, 255, 0.1)
  color: $grey
  cursor: pointer
  border-radius: 3px
  padding: 0.25rem 0.35rem
  display: flex
  align-items: center
  transition: all 0.15s
  &:hover
    color: $grey-lighter
    background: rgba(255, 255, 255, 0.08)

// ── Download Menu ──
.download-wrapper
  position: relative

.download-menu
  position: absolute
  top: 100%
  right: 0
  margin-top: 4px
  background: #1a1a2e
  border: 1px solid rgba(255, 255, 255, 0.15)
  border-radius: 6px
  padding: 0.35rem 0
  min-width: 200px
  z-index: 20
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5)

.download-item
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.4rem 0.75rem
  color: $grey-lighter
  font-size: 0.8rem
  cursor: pointer
  transition: background 0.1s
  &:hover
    background: rgba(255, 255, 255, 0.08)

.download-sep
  height: 1px
  background: rgba(255, 255, 255, 0.08)
  margin: 0.25rem 0

// ── Issue Counter ──
.issue-counter
  text-align: center
  font-size: 0.65rem
  color: $grey
  padding: 0.25rem 0
  border-bottom: 1px solid rgba(255, 255, 255, 0.05)
  flex-shrink: 0

// ── Scroll Area ──
.newspaper-scroll
  flex: 1
  overflow-y: auto
  overflow-x: hidden
  padding: 1.5rem

.empty-state
  text-align: center
  padding: 4rem 1rem
  color: $grey
  p
    margin-top: 0.75rem
    font-size: 0.85rem

// ── Animations ──
.fade-enter-active, .fade-leave-active
  transition: opacity 0.15s
.fade-enter, .fade-enter-from, .fade-leave-to
  opacity: 0

// ── Print ──
@media print
  .newspaper-overlay
    position: static
    background: none
    padding: 0
  .newspaper-chrome
    max-width: 100%
    max-height: none
    border: none
    background: white
  .newspaper-toolbar,
  .issue-counter
    display: none
  .newspaper-scroll
    overflow: visible
    padding: 0
</style>
