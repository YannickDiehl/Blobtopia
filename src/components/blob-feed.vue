<template lang="pug">
//- Das BlobPhone: der Feed ist das Twitter der Blobs — ein Artefakt IHRER
//- Welt (digital, rund, Baloo), nicht des Instituts (Papier). Der Forscher
//- hält nur das Gerät in der Hand. (docs/ui-institut.md)
.blob-feed
  .kerbe
  .screen
    .statusleiste
      span.links
        span.signal
          i(style="height: 4px")
          i(style="height: 6px")
          i(style="height: 8px")
          i(style="height: 10px; opacity: .35")
        | BlobNet
      span Jahr {{ year }} · {{ hourDisplay }}
      span.akku-wrap 61 %
        span.akku

    .feed-header
      .applogo
      span.apptitel BlobFeed
      span.tweet-count(v-if="tweets && tweets.length") {{ filteredTweets.length }} {{ filteredTweets.length === 1 ? 'Blub' : 'Blubs' }}
      button.download-btn(@click="downloadTweets", title="Blubs als CSV herunterladen")
        b-icon(icon="download", size="is-small")

    .search-bar
      input.search-input(
        v-model="searchQuery"
        , placeholder="#Hashtag oder @Name suchen …"
        , @keyup.escape="searchQuery = ''"
      )
      button.clear-btn(v-if="searchQuery", @click="searchQuery = ''")
        b-icon(icon="close-circle", size="is-small")

    .tweet-list.scrollbars(ref="tweetList")
      .tweet(v-for="tweet in filteredTweets", :key="tweet._key")
        .pavatar(:style="avatarStyle(tweet)")
          span.a.a1
          span.a.a2
          span(:class="mouthClass(tweet)")
        .tweet-body
          .tweet-header
            span.author-name.clickable(@click.stop="filterByAuthor(tweet)", :title="'Nur Blubs von @' + tweet.name") @{{ tweet.name }}
            span.tweet-time {{ tweet._timeLabel }}
          .tweet-content(v-html="renderTweetContent(tweet._text)")
      .empty-state(v-if="filteredTweets.length === 0 && tweets && tweets.length > 0")
        p Keine Blubs gefunden.
      .empty-state(v-else-if="!tweets || tweets.length === 0")
        p Noch keine Blubs …
  .homebtn(@click="$emit('close')", title="Feed schließen")
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'

// Distrikt-UI-Töne für die Blob-Avatare (s. _institut.scss)
const DISTRICT_AVATARS = [
  ['#84d995', '#46a85c']   // Grüntal
  , ['#f6d564', '#e3af2c'] // Sonnenberg
  , ['#7cc0ee', '#4596d8'] // Hafenviertel
  , ['#f3b070', '#e8893a'] // Mittelfeld
  , ['#aab3c4', '#7d8ca3'] // Industriezone
]

export default {
  name: 'BlobFeed'
  , props: {
    tweets: {
      type: Array
      , default: () => []
    }
  }
  , emits: ['inspect-blob', 'close']
  , data: () => ({
    searchQuery: ''
  })
  , computed: {
    hourDisplay() {
      return String(this.hour || 0).padStart(2, '0') + ':00'
    }
    , ...mapState(useSimulationStore, ['year', 'hour'])
    , normalizedTweets() {
      if (!this.tweets) return []
      return this.tweets.map((t, i) => {
        const isTimeline = 'tweet_text' in t
        const text = isTimeline ? t.tweet_text : t.content
        const timeLabel = isTimeline
          ? this.tickToTimeLabel(t.tick)
          : `J${t.year || Math.floor(t.tick / 365) + 1}/M${t.month || Math.floor((t.tick % 365) / 30) + 1}`
        return {
          ...t
          , _key: t.id || `${t.blob_id || t.author_id}-${t.tick}-${i}`
          , _text: text
          , _timeLabel: timeLabel
        }
      })
    }
    , filteredTweets() {
      if (!this.searchQuery) return this.normalizedTweets
      const q = this.searchQuery.toLowerCase().trim()
      // Autor-Handles werden als „@Name" angezeigt, aber ohne @ gespeichert
      // (t.name = „Bina"). Ein führendes @ in der Suche soll den Autorennamen
      // trotzdem treffen — sonst findet „@Bina" nur Erwähnungen im Text, nie
      // Binas eigene Blubs. Das @ bleibt für die Volltextsuche erhalten, damit
      // @Erwähnungen im Tweet-Text weiterhin matchen.
      const qName = q.replace(/^@+/, '')
      return this.normalizedTweets.filter(t =>
        (t._text && t._text.toLowerCase().includes(q))
        || (t.name && t.name.toLowerCase().includes(qName))
      )
    }
  }
  , methods: {
    avatarStyle(tweet) {
      const d = DISTRICT_AVATARS[tweet.district] || DISTRICT_AVATARS[4]
      return { background: `linear-gradient(180deg, ${d[0]}, ${d[1]})` }
    }
    , mouthClass(tweet) {
      // Stimmung des Blubs → Gesicht des Avatars (sentiment ist je nach
      // Quelle ein Score ODER ein Label)
      const s = tweet.sentiment
      if (typeof s === 'number') {
        if (s < -0.15) return 'm-sauer'
        if (s > 0.15) return 'm-froh'
        return 'm-neutral'
      }
      const l = String(s || '').toLowerCase()
      if (/negativ|wütend|frustriert|besorgt|angry|negative/.test(l)) return 'm-sauer'
      if (/positiv|begeistert|hoffnungsvoll|zufrieden|positive/.test(l)) return 'm-froh'
      return 'm-neutral'
    }
    , tickToDate(tick) {
      const year = Math.floor(tick / 365) + 1
      const month = Math.floor((tick % 365) / 30) + 1
      const day = (tick % 365) % 30 + 1
      return `Jahr ${year}, Monat ${month}, Tag ${day}`
    }
    , tickToTimeLabel(tick) {
      const year = Math.floor(tick / 365)
      const month = Math.floor((tick % 365) / 30) + 1
      return `J${year}/M${month}`
    }
    , renderTweetContent(text) {
      if (!text) return ''
      // Highlight #hashtags (clickable → sets search)
      let html = text.replace(/(#\w+)/g, '<span class="hashtag" data-tag="$1">$1</span>')
      // Highlight @mentions (clickable → emits inspect event)
      html = html.replace(/(@\w+(?:\w)*)/g, '<span class="mention" data-mention="$1">$1</span>')
      return html
    }
    , handleContentClick(e) {
      const hashtag = e.target.closest('.hashtag')
      if (hashtag) {
        this.searchQuery = hashtag.dataset.tag
        return
      }
      const mention = e.target.closest('.mention')
      if (mention) {
        // Extract name from @VornameNachname
        const name = mention.dataset.mention.replace('@', '').replace(/([a-z])([A-Z])/g, '$1 $2')
        this.$emit('inspect-blob', name)
        return
      }
    }
    // Klick auf den Autornamen → Feed auf diese Person filtern (analog zum
    // Hashtag-Klick, der die Suche setzt). Führendes @ passt zur Suchlogik
    // in filteredTweets und erscheint sichtbar in der Suchleiste.
    , filterByAuthor(tweet) {
      this.searchQuery = '@' + tweet.name
    }
    , downloadTweets() {
      const header = 'name,date,content'
      const csvRows = this.filteredTweets.map(t =>
        [t.name
         ,'"' + this.tickToDate(t.tick) + '"'
         ,'"' + (t._text || '').replace(/"/g, '""') + '"'].join(',')
      )
      const csv = '\uFEFF' + [header, ...csvRows].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'blobfeed-tweets.csv'
      a.click()
      URL.revokeObjectURL(url)
    }
  }
  , watch: {
    tweets() {
      this.$nextTick(() => {
        if (this.$refs.tweetList) {
          this.$refs.tweetList.scrollTop = 0
        }
      })
    }
  }
  , mounted() {
    // Delegate click events for hashtags and mentions
    this.$el.addEventListener('click', this.handleContentClick)
  }
  , beforeUnmount() {
    this.$el.removeEventListener('click', this.handleContentClick)
  }
}
</script>

<style lang="sass" scoped>
// ── Gehäuse ──
.blob-feed
  position: fixed
  top: 58px
  right: 14px
  bottom: 96px
  width: 336px
  box-sizing: border-box
  display: flex
  flex-direction: column
  background: linear-gradient(165deg, var(--inst-phone-gehaeuse-1), var(--inst-phone-gehaeuse-2))
  border: 4px solid var(--inst-phone-rand)
  border-radius: 42px
  box-shadow: inset 0 2px 3px rgba(255, 255, 255, 0.9), inset 0 -4px 8px rgba(80, 90, 120, 0.28), 0 22px 42px rgba(15, 20, 45, 0.5)
  padding: 34px 11px 50px
  z-index: 5

.kerbe
  position: absolute
  top: 14px
  left: 50%
  transform: translateX(-50%)
  width: 76px
  height: 8px
  border-radius: 99px
  background: #c9d1e2
  box-shadow: inset 0 1.5px 3px rgba(60, 70, 100, 0.4)

.homebtn
  position: absolute
  bottom: 7px
  left: 50%
  transform: translateX(-50%)
  width: 40px
  height: 36px
  border-radius: 46% 54% 52% 48% / 58% 56% 44% 42%
  background: linear-gradient(180deg, #fff, #dbe2ef)
  box-shadow: inset 0 -2.5px 5px rgba(80, 90, 120, 0.4), 0 1px 2px rgba(255, 255, 255, 0.8)
  cursor: pointer
  &:hover
    background: linear-gradient(180deg, #fff, #cdd6e8)

.screen
  flex: 1
  min-height: 0
  display: flex
  flex-direction: column
  background: #fbfcff
  border-radius: 22px
  overflow: hidden
  box-shadow: inset 0 0 0 3px #222c44
  font-family: var(--inst-rund)

// ── Statusleiste (Geräte-Uhr = Simulationszeit) ──
.statusleiste
  display: flex
  justify-content: space-between
  align-items: center
  padding: 8px 14px 6px
  font-size: 0.55rem
  font-weight: 700
  color: var(--inst-phone-tinte)
  background: #edf2fb
  flex-shrink: 0

  .links
    display: inline-flex
    align-items: center

  .signal
    display: inline-flex
    align-items: flex-end
    gap: 1.5px
    margin-right: 4px
    i
      width: 2.5px
      background: var(--inst-phone-tinte)
      border-radius: 1px

  .akku-wrap
    display: inline-flex
    align-items: center
    gap: 4px

  .akku
    display: inline-block
    width: 17px
    height: 9px
    border: 1.5px solid var(--inst-phone-tinte)
    border-radius: 3px
    position: relative
    &::before
      content: ''
      position: absolute
      left: 1.5px
      top: 1.5px
      bottom: 1.5px
      width: 60%
      background: #46a85c
      border-radius: 1px
    &::after
      content: ''
      position: absolute
      right: -3.5px
      top: 2px
      width: 2px
      height: 4px
      background: var(--inst-phone-tinte)
      border-radius: 0 1px 1px 0

// ── App-Leiste ──
.feed-header
  padding: 0.5rem 0.8rem
  border-bottom: 1.5px solid #e3e8f4
  font-weight: 800
  display: flex
  align-items: center
  gap: 0.45rem
  color: var(--inst-phone-tinte)
  flex-shrink: 0

  .applogo
    width: 23px
    height: 21px
    border-radius: 46% 54% 52% 48% / 58% 56% 44% 42%
    background: linear-gradient(180deg, #6fc2f5, #3d9be8)
    position: relative
    flex-shrink: 0
    &::before
      content: ''
      position: absolute
      left: 4px
      top: 6px
      width: 4px
      height: 5px
      background: #1d2b3a
      border-radius: 50%
      box-shadow: 8px 0 0 #1d2b3a
    &::after
      content: ''
      position: absolute
      left: 8px
      top: 13px
      width: 7px
      height: 3.5px
      border-bottom: 2px solid #1d2b3a
      border-radius: 50%

  .apptitel
    font-size: 1rem
    letter-spacing: 0.2px

  .tweet-count
    font-size: 0.6rem
    font-weight: 800
    color: #fff
    background: var(--inst-phone-link)
    padding: 1px 8px
    border-radius: 99px
    margin-left: auto

  .download-btn
    display: inline-flex
    align-items: center
    justify-content: center
    background: none
    border: 1.5px solid #dfe5f2
    border-radius: 8px
    color: var(--inst-phone-grau)
    cursor: pointer
    padding: 2px 6px
    transition: all 0.15s
    &:hover
      border-color: var(--inst-phone-link)
      color: var(--inst-phone-link)

// ── Suche ──
.search-bar
  display: flex
  align-items: center
  padding: 0.4rem 0.7rem
  border-bottom: 1.5px solid #eef1f8
  flex-shrink: 0
  position: relative

.search-input
  flex: 1
  background: #f0f3fa
  border: 1.5px solid transparent
  border-radius: 14px
  color: var(--inst-phone-tinte)
  font-family: var(--inst-rund)
  font-size: 0.7rem
  font-weight: 600
  padding: 5px 28px 5px 12px
  outline: none
  transition: all 0.15s
  &::placeholder
    color: var(--inst-phone-grau)
  &:focus
    border-color: var(--inst-phone-link)
    background: #fff

.clear-btn
  position: absolute
  right: 0.85rem
  background: none
  border: none
  color: var(--inst-phone-grau)
  cursor: pointer
  padding: 0
  display: flex
  &:hover
    color: var(--inst-phone-tinte)

// ── Blub-Liste ──
.tweet-list
  flex: 1
  overflow-y: auto
  display: flex
  flex-direction: column

  &::-webkit-scrollbar
    width: 5px
  &::-webkit-scrollbar-thumb
    border-radius: 3px
    background: rgba(40, 50, 78, 0.2)

.tweet
  display: flex
  gap: 0.5rem
  padding: 0.55rem 0.7rem
  border-bottom: 1.5px solid var(--inst-phone-trenner)
  &:last-child
    border-bottom: none

// Blob-Avatar mit Emotionsgesicht (Distriktfarbe + Stimmung des Blubs)
.pavatar
  flex: none
  width: 36px
  height: 32px
  border-radius: 46% 54% 52% 48% / 58% 56% 44% 42%
  position: relative
  &::before
    content: ''
    position: absolute
    left: 15%
    top: 9%
    width: 38%
    height: 24%
    background: rgba(255, 255, 255, 0.5)
    border-radius: 50%
    transform: rotate(-14deg)
  .a
    position: absolute
    width: 4.5px
    height: 5.5px
    background: #1d2b3a
    border-radius: 50%
    top: 12px
  .a1
    left: 10px
  .a2
    left: 21px
  .m-sauer
    position: absolute
    width: 10px
    height: 4.5px
    border-top: 2px solid #1d2b3a
    border-radius: 50%
    top: 21px
    left: 50%
    transform: translateX(-50%)
  .m-froh
    position: absolute
    width: 10px
    height: 5px
    border-bottom: 2px solid #1d2b3a
    border-radius: 50%
    top: 18px
    left: 50%
    transform: translateX(-50%)
  .m-neutral
    position: absolute
    width: 8px
    height: 2px
    background: #1d2b3a
    border-radius: 2px
    top: 21px
    left: 50%
    transform: translateX(-50%)

.tweet-body
  flex: 1
  min-width: 0

.tweet-header
  display: flex
  align-items: baseline
  gap: 0.4rem
  margin-bottom: 0.15rem

  .author-name
    font-size: 0.72rem
    font-weight: 800
    color: var(--inst-phone-tinte)
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

    &.clickable
      cursor: pointer
      &:hover
        color: var(--inst-phone-link)
        text-decoration: underline

  .tweet-time
    font-size: 0.58rem
    font-weight: 600
    color: var(--inst-phone-grau)
    white-space: nowrap
    margin-left: auto
    flex-shrink: 0

.tweet-content
  font-size: 0.74rem
  line-height: 1.35
  font-weight: 500
  color: #333d52

  :deep() .hashtag
    color: var(--inst-phone-link)
    font-weight: 700
    cursor: pointer
    &:hover
      text-decoration: underline

  :deep() .mention
    color: #d8559a
    cursor: pointer
    font-weight: 700
    &:hover
      text-decoration: underline

.empty-state
  display: flex
  align-items: center
  justify-content: center
  flex: 1
  text-align: center
  color: var(--inst-phone-grau)
  font-size: 0.8rem
  font-weight: 600
</style>
