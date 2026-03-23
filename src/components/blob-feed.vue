<template lang="pug">
.blob-feed
  .feed-header
    b-icon(icon="rss", size="is-small")
    span BlobFeed
    span.tweet-count(v-if="tweets && tweets.length") {{ tweets.length }}

  //- Filter bar (collapsible)
  .filter-bar
    .filter-toggle(@click="showFilters = !showFilters")
      b-icon(:icon="showFilters ? 'chevron-up' : 'filter-variant'", size="is-small")
      span Filter
      span.active-count(v-if="activeFilterCount > 0") {{ activeFilterCount }}
    transition(name="slide-filters")
      .filter-body(v-if="showFilters")
        .filter-row
          label.filter-label Thema
          .filter-chips
            span.chip(:class="{ active: !filterTopic }", @click="setFilter('topic', null)") Alle
            span.chip(
              v-for="(label, key) in topicOptions"
              , :key="key"
              , :class="{ active: filterTopic === key }"
              , @click="setFilter('topic', key)"
            ) {{ label }}
        .filter-row
          label.filter-label Distrikt
          .filter-chips
            span.chip(:class="{ active: filterDistrict === null }", @click="setFilter('district', null)") Alle
            span.chip(
              v-for="d in 5"
              , :key="d - 1"
              , :class="{ active: filterDistrict === d - 1 }"
              , @click="setFilter('district', d - 1)"
            )
              .mini-badge(:style="{ backgroundColor: districtColor(d - 1) }")
              | {{ districtName(d - 1) }}
        .filter-row
          label.filter-label Stimmung
          .filter-chips
            span.chip(:class="{ active: !filterSentiment }", @click="setFilter('sentiment', null)") Alle
            span.chip.chip-pos(:class="{ active: filterSentiment === 'positive' }", @click="setFilter('sentiment', 'positive')") Positiv
            span.chip.chip-neg(:class="{ active: filterSentiment === 'negative' }", @click="setFilter('sentiment', 'negative')") Negativ

  .tweet-list.scrollbars(ref="tweetList")
    .tweet(v-for="tweet in filteredTweets", :key="tweet._key")
      .tweet-header
        .district-badge(:style="{ backgroundColor: districtColor(tweet._district) }", :title="districtName(tweet._district)")
        .author-info
          span.author-name(v-if="tweet.name") @{{ tweet.name }}
          span.district-label {{ districtName(tweet._district) }}
        .tweet-meta
          span.trigger-icon(v-if="tweet.trigger_type === 'event_reaction'", title="Event-Reaktion") !
          span.topic-tag(v-if="tweet.topic") {{ topicLabel(tweet.topic) }}
          span.tweet-time {{ tweet._timeLabel }}
      .tweet-content(:class="sentimentClass(tweet.sentiment)") {{ tweet._text }}
    .empty-state(v-if="filteredTweets.length === 0 && tweets && tweets.length > 0")
      p Keine Tweets für diesen Filter.
    .empty-state(v-else-if="!tweets || tweets.length === 0")
      p Noch keine Tweets...
</template>

<script>
import { DISTRICT_NAMES, DISTRICT_COLORS } from '@/lib/blob-adapter'

const TOPIC_LABELS = {
  wirtschaft: 'Wirtschaft'
  , umwelt: 'Umwelt'
  , sicherheit: 'Sicherheit'
  , vertrauen: 'Vertrauen'
  , teilhabe: 'Teilhabe'
  , persoenlich: 'Persönlich'
}

export default {
  name: 'BlobFeed'
  , props: {
    tweets: {
      type: Array
      , default: () => []
    }
  }
  , data: () => ({
    showFilters: false
    , filterTopic: null
    , filterDistrict: null
    , filterSentiment: null
  })
  , computed: {
    topicOptions() {
      return TOPIC_LABELS
    }
    , activeFilterCount() {
      let n = 0
      if (this.filterTopic) n++
      if (this.filterDistrict !== null) n++
      if (this.filterSentiment) n++
      return n
    }
    , normalizedTweets() {
      if (!this.tweets) return []
      return this.tweets.map((t, i) => {
        const isTimeline = 'tweet_text' in t
        const district = isTimeline ? t.district : t.author_district
        const text = isTimeline ? t.tweet_text : t.content
        const timeLabel = isTimeline
          ? this.tickToTimeLabel(t.tick)
          : `J${t.year}/M${t.month || ''}/T${t.day || ''}`
        return {
          ...t
          , _key: t.id || `${t.blob_id || t.glob_id || t.author_id}-${t.tick}-${i}`
          , _district: district
          , _text: text
          , _timeLabel: timeLabel
        }
      })
    }
    , filteredTweets() {
      let list = this.normalizedTweets
      if (this.filterTopic) {
        list = list.filter(t => t.topic === this.filterTopic)
      }
      if (this.filterDistrict !== null) {
        list = list.filter(t => t._district === this.filterDistrict)
      }
      if (this.filterSentiment === 'positive') {
        list = list.filter(t => t.sentiment > 0.2)
      } else if (this.filterSentiment === 'negative') {
        list = list.filter(t => t.sentiment < -0.2)
      }
      return list
    }
  }
  , methods: {
    districtName(d) {
      return DISTRICT_NAMES[d] || 'Unbekannt'
    }
    , districtColor(d) {
      const hex = DISTRICT_COLORS[d] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    , sentimentClass(sentiment) {
      if (sentiment > 0.2) return 'positive'
      if (sentiment < -0.2) return 'negative'
      return 'neutral'
    }
    , topicLabel(topic) {
      return TOPIC_LABELS[topic] || topic
    }
    , tickToTimeLabel(tick) {
      const year = Math.floor(tick / 365)
      const month = Math.floor((tick % 365) / 30) + 1
      return `J${year}/M${month}`
    }
    , setFilter(key, value) {
      if (key === 'topic') this.filterTopic = this.filterTopic === value ? null : value
      else if (key === 'district') this.filterDistrict = this.filterDistrict === value ? null : value
      else if (key === 'sentiment') this.filterSentiment = this.filterSentiment === value ? null : value
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

// --- Filter bar ---
.filter-bar
  flex-shrink: 0
  border-bottom: 1px solid rgba(255, 255, 255, 0.06)

.filter-toggle
  display: flex
  align-items: center
  gap: 0.3rem
  padding: 0.35rem 0.75rem
  cursor: pointer
  font-size: 0.7rem
  color: $grey
  transition: color 0.15s
  &:hover
    color: $grey-lighter
  .active-count
    font-size: 0.6rem
    font-weight: 600
    color: #64b5f6
    background: rgba(29, 161, 242, 0.2)
    padding: 0 5px
    border-radius: 8px
    margin-left: 2px

.slide-filters-enter-active, .slide-filters-leave-active
  transition: all 0.2s ease
  overflow: hidden

.slide-filters-enter, .slide-filters-leave-to
  max-height: 0
  opacity: 0
  padding-top: 0
  padding-bottom: 0

.slide-filters-enter-to, .slide-filters-leave
  max-height: 200px
  opacity: 1

.filter-body
  padding: 0.25rem 0.75rem 0.5rem

.filter-row
  display: flex
  align-items: flex-start
  gap: 0.4rem
  margin-bottom: 0.35rem
  &:last-child
    margin-bottom: 0

.filter-label
  font-size: 0.6rem
  color: $grey
  min-width: 42px
  padding-top: 3px
  flex-shrink: 0

.filter-chips
  display: flex
  flex-wrap: wrap
  gap: 3px

.chip
  display: inline-flex
  align-items: center
  gap: 3px
  font-size: 0.6rem
  padding: 2px 7px
  border-radius: 10px
  border: 1px solid rgba(255, 255, 255, 0.1)
  color: $grey
  cursor: pointer
  transition: all 0.12s
  white-space: nowrap
  &:hover
    border-color: rgba(255, 255, 255, 0.25)
    color: $grey-lighter
  &.active
    border-color: rgba(29, 161, 242, 0.5)
    background: rgba(29, 161, 242, 0.12)
    color: #64b5f6
    font-weight: 600
  &.chip-pos.active
    border-color: rgba(78, 204, 163, 0.5)
    background: rgba(78, 204, 163, 0.12)
    color: #4ecca3
  &.chip-neg.active
    border-color: rgba(231, 76, 60, 0.5)
    background: rgba(231, 76, 60, 0.12)
    color: #e74c3c

.mini-badge
  width: 7px
  height: 7px
  border-radius: 50%
  flex-shrink: 0

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

  .district-badge
    width: 10px
    height: 10px
    border-radius: 50%
    flex-shrink: 0
    box-shadow: 0 0 3px rgba(255, 255, 255, 0.2)

  .author-info
    display: flex
    align-items: baseline
    gap: 0.3rem
    min-width: 0

  .author-name
    font-size: 0.8rem
    font-weight: 600
    color: #64b5f6
    white-space: nowrap

  .district-label
    font-size: 0.65rem
    color: $grey
    white-space: nowrap
    overflow: hidden
    text-overflow: ellipsis

  .district-name
    font-size: 0.75rem
    font-weight: 600
    color: $grey-light

  .tweet-meta
    display: flex
    align-items: center
    gap: 0.35rem
    margin-left: auto
    flex-shrink: 0

  .trigger-icon
    font-size: 0.6rem
    font-weight: 700
    color: #f39c12
    background: rgba(243, 156, 18, 0.15)
    width: 16px
    height: 16px
    border-radius: 50%
    display: flex
    align-items: center
    justify-content: center

  .topic-tag
    font-size: 0.6rem
    color: $grey-lighter
    background: rgba(255, 255, 255, 0.08)
    padding: 1px 6px
    border-radius: 8px
    white-space: nowrap

  .tweet-time
    font-size: 0.65rem
    color: $grey
    white-space: nowrap

.tweet-content
  font-size: 0.85rem
  line-height: 1.35
  color: $grey-lighter

  &.positive
    border-left: 2px solid #4ecca3
    padding-left: 0.5rem

  &.negative
    border-left: 2px solid #e74c3c
    padding-left: 0.5rem

  &.neutral
    border-left: 2px solid rgba(255, 255, 255, 0.15)
    padding-left: 0.5rem

.empty-state
  display: flex
  align-items: center
  justify-content: center
  flex: 1
  text-align: center
  color: $grey
  font-size: 0.85rem
</style>
