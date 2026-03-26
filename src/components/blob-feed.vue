<template lang="pug">
.blob-feed
  .feed-header
    b-icon(icon="rss", size="is-small")
    span BlobFeed
    span.tweet-count(v-if="tweets && tweets.length") {{ filteredTweets.length }}
    button.download-btn(@click="downloadTweets", title="Tweets als CSV herunterladen")
      b-icon(icon="download", size="is-small")

  .search-bar
    input.search-input(
      v-model="searchQuery"
      , placeholder="Suche nach #Hashtag, @Name..."
      , @keyup.escape="searchQuery = ''"
    )
    button.clear-btn(v-if="searchQuery", @click="searchQuery = ''")
      b-icon(icon="close-circle", size="is-small")

  .tweet-list.scrollbars(ref="tweetList")
    .tweet(v-for="tweet in filteredTweets", :key="tweet._key")
      .tweet-header
        span.author-name @{{ tweet.name }}
        span.tweet-time {{ tweet._timeLabel }}
      .tweet-content(v-html="renderTweetContent(tweet._text)")
    .empty-state(v-if="filteredTweets.length === 0 && tweets && tweets.length > 0")
      p Keine Tweets gefunden.
    .empty-state(v-else-if="!tweets || tweets.length === 0")
      p Noch keine Tweets...
</template>

<script>
export default {
  name: 'BlobFeed'
  , props: {
    tweets: {
      type: Array
      , default: () => []
    }
  }
  , data: () => ({
    searchQuery: ''
  })
  , computed: {
    normalizedTweets() {
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
      const q = this.searchQuery.toLowerCase()
      return this.normalizedTweets.filter(t =>
        (t._text && t._text.toLowerCase().includes(q))
        || (t.name && t.name.toLowerCase().includes(q))
      )
    }
  }
  , methods: {
    tickToDate(tick) {
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
    , downloadTweets() {
      const header = 'name,date,content'
      const csvRows = this.filteredTweets.map(t =>
        [t.name,
         '"' + this.tickToDate(t.tick) + '"',
         '"' + (t._text || '').replace(/"/g, '""') + '"'].join(',')
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
  , beforeDestroy() {
    this.$el.removeEventListener('click', this.handleContentClick)
  }
}
</script>

<style lang="sass" scoped>
.blob-feed
  position: fixed
  top: 44px
  right: 0
  width: 320px
  height: calc(100vh - 44px)
  padding-bottom: 85px
  box-sizing: border-box
  display: flex
  flex-direction: column
  background: rgba(20, 20, 25, 0.95)
  backdrop-filter: blur(8px)
  border-left: 1px solid rgba(255, 255, 255, 0.12)
  z-index: 5

.feed-header
  padding: 0.75rem 1rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.1)
  font-weight: 600
  display: flex
  align-items: center
  gap: 0.5rem
  color: #64b5f6
  flex-shrink: 0

  .tweet-count
    font-size: 0.7rem
    font-weight: 400
    color: $grey-light
    background: rgba(29, 161, 242, 0.15)
    padding: 1px 7px
    border-radius: 10px
    margin-left: auto

  .download-btn
    display: inline-flex
    align-items: center
    justify-content: center
    background: none
    border: 1px solid rgba(255, 255, 255, 0.15)
    border-radius: 4px
    color: $grey-light
    cursor: pointer
    padding: 2px 6px
    margin-left: 0.3rem
    transition: all 0.15s
    &:hover
      background: rgba(29, 161, 242, 0.15)
      border-color: rgba(29, 161, 242, 0.4)
      color: #64b5f6

// --- Search bar ---
.search-bar
  display: flex
  align-items: center
  padding: 0.4rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.06)
  flex-shrink: 0
  position: relative

.search-input
  flex: 1
  background: rgba(255, 255, 255, 0.06)
  border: 1px solid rgba(255, 255, 255, 0.12)
  border-radius: 14px
  color: $grey-lighter
  font-size: 0.75rem
  padding: 5px 28px 5px 12px
  outline: none
  transition: all 0.15s
  &::placeholder
    color: $grey
  &:focus
    border-color: rgba(29, 161, 242, 0.4)
    background: rgba(255, 255, 255, 0.08)

.clear-btn
  position: absolute
  right: 0.85rem
  background: none
  border: none
  color: $grey
  cursor: pointer
  padding: 0
  display: flex
  &:hover
    color: $grey-lighter

// --- Tweet list ---
.tweet-list
  flex: 1
  overflow-y: auto
  padding: 0.5rem
  display: flex
  flex-direction: column

.tweet
  padding: 0.6rem 0.75rem
  border-bottom: 1px solid rgba(255, 255, 255, 0.05)
  &:last-child
    border-bottom: none

.tweet-header
  display: flex
  align-items: center
  gap: 0.4rem
  margin-bottom: 0.3rem

  .author-name
    font-size: 0.8rem
    font-weight: 600
    color: #64b5f6
    white-space: nowrap

  .tweet-time
    font-size: 0.65rem
    color: $grey
    white-space: nowrap
    margin-left: auto

.tweet-content
  font-size: 0.85rem
  line-height: 1.35
  color: $grey-lighter

  /deep/ .hashtag
    color: #64b5f6
    cursor: pointer
    &:hover
      text-decoration: underline

  /deep/ .mention
    color: #4ecca3
    cursor: pointer
    font-weight: 600
    &:hover
      text-decoration: underline

.empty-state
  display: flex
  align-items: center
  justify-content: center
  flex: 1
  text-align: center
  color: $grey
  font-size: 0.85rem
</style>
