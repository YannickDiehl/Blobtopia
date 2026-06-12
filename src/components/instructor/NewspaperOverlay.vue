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
  , beforeUnmount() {
    if (this._clickHandler) {
      document.removeEventListener('click', this._clickHandler)
    }
  }
}
</script>

<style lang="sass" scoped>
// Die Presse-Mappe liegt auf dem Schreibtisch: kein dunkles Modal mehr,
// die Zeitung liegt direkt auf der Unterlage, die Werkzeuge sind ein
// schmaler Papierstreifen (Ausgaben-Schieber).
.newspaper-overlay
  position: fixed
  top: 56px
  left: 240px
  right: 24px
  bottom: 90px
  z-index: 7
  display: flex
  align-items: flex-start
  justify-content: center
  @media (max-width: 900px)
    left: 84px

.newspaper-chrome
  width: 880px
  max-width: 100%
  max-height: 100%
  display: flex
  flex-direction: column
  overflow: hidden

// ── Werkzeugstreifen (Papier) ──
.newspaper-toolbar
  display: flex
  align-items: center
  gap: 0.75rem
  padding: 0.45rem 0.75rem
  background: var(--inst-papier)
  box-shadow: 0 4px 10px rgba(40, 28, 8, 0.3)
  flex-shrink: 0
  transform: rotate(-0.3deg)
  margin-bottom: 6px
  font-family: var(--inst-druck)

.paper-tabs
  display: flex
  gap: 4px

.paper-tab
  padding: 0.25rem 0.7rem
  background: var(--inst-karton)
  border: none
  color: #8a7c5e
  font-family: var(--inst-schreibmaschine)
  font-size: 0.74rem
  cursor: pointer
  border-radius: 4px
  transition: all 0.15s
  white-space: nowrap
  &:hover
    background: #efe4c8
  &.active
    background: var(--inst-stempelblau)
    color: #fff

.issue-nav
  display: flex
  align-items: center
  gap: 0.4rem
  flex: 1
  justify-content: center

.nav-btn
  background: rgba(255, 255, 255, 0.5)
  border: 1.5px solid rgba(43, 58, 85, 0.3)
  color: var(--inst-tinte)
  cursor: pointer
  border-radius: 3px
  padding: 0.15rem 0.25rem
  display: flex
  align-items: center
  transition: all 0.15s
  &:hover:not(:disabled)
    border-color: var(--inst-stempelblau)
  &:disabled
    opacity: 0.3
    cursor: default

.issue-label
  display: flex
  flex-direction: column
  align-items: center
  min-width: 140px

.event-name
  font-size: 0.76rem
  font-weight: 700
  color: var(--inst-tinte)

.issue-date
  font-family: var(--inst-schreibmaschine)
  font-size: 0.62rem
  color: var(--inst-beschriftung)

.toolbar-actions
  display: flex
  align-items: center
  gap: 0.35rem

.tool-btn
  background: rgba(255, 255, 255, 0.5)
  border: 1.5px solid rgba(43, 58, 85, 0.3)
  color: var(--inst-tinte-soft)
  cursor: pointer
  border-radius: 3px
  padding: 0.25rem 0.35rem
  display: flex
  align-items: center
  transition: all 0.15s
  &:hover
    color: var(--inst-tinte)
    border-color: var(--inst-stempelblau)

// ── Download Menu ──
.download-wrapper
  position: relative

.download-menu
  position: absolute
  top: 100%
  right: 0
  margin-top: 4px
  background: var(--inst-papier-hell)
  border: 1.5px solid rgba(43, 58, 85, 0.25)
  border-radius: 4px
  padding: 0.35rem 0
  min-width: 200px
  z-index: 20
  box-shadow: 0 8px 24px rgba(40, 28, 8, 0.35)

.download-item
  display: flex
  align-items: center
  gap: 0.5rem
  padding: 0.4rem 0.75rem
  color: var(--inst-tinte)
  font-size: 0.78rem
  cursor: pointer
  transition: background 0.1s
  &:hover
    background: rgba(51, 81, 142, 0.08)

.download-sep
  height: 1px
  background: rgba(43, 58, 85, 0.15)
  margin: 0.25rem 0

// ── Issue Counter ──
.issue-counter
  text-align: center
  font-family: var(--inst-hand)
  font-size: 0.85rem
  color: rgba(255, 253, 252, 0.85)
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5)
  padding: 0.1rem 0 0.3rem
  flex-shrink: 0

// ── Scroll Area ──
.newspaper-scroll
  flex: 1
  overflow-y: auto
  overflow-x: hidden
  padding: 0.25rem 1rem 1.5rem
  // Die Zeitung wirft selbst Schatten — die Mappe ist unsichtbar

.empty-state
  text-align: center
  padding: 4rem 1rem
  color: rgba(255, 253, 252, 0.8)
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5)
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
