<template lang="pug">
.children-validation
  h3.heading Kinder-Prüfung

  .loading-hint(v-if="!blobList")
    p.has-text-grey Blob-Liste wird geladen...

  template(v-else)
    //- Summary Box
    .summary-box
      .summary-stat
        .summary-value {{ children.length }}
        .summary-label Kinder gefunden (von {{ blobs.length }} Blobs)
      .summary-stat
        .summary-value(:class="allCorrect ? 'is-ok' : 'is-bad'") {{ correctCount }} / {{ children.length }}
        .summary-label Korrekt konfiguriert

    //- Violations Alert
    .violation-alert(v-if="violations.length > 0")
      span.alert-icon \u26A0
      span {{ violations.length }} Kinder haben fehlerhafte Konfiguration

    //- Children Table
    .table-section(v-if="children.length")
      h4.subheading Kinder-Liste (Alter &lt; 18)
      .table-wrap
        table.children-table
          thead
            tr
              th.col-nr(@click="sortBy('index')" :class="sortClass('index')") #
              th(@click="sortBy('id')" :class="sortClass('id')") ID
              th(@click="sortBy('age')" :class="sortClass('age')") Alter
              th(@click="sortBy('district')" :class="sortClass('district')") Distrikt
              th(@click="sortBy('education_level')" :class="sortClass('education_level')") Bildung
              th(@click="sortBy('income')" :class="sortClass('income')") Einkommen
              th(@click="sortBy('workplace_id')" :class="sortClass('workplace_id')") Arbeitsplatz
              th Zuhause
              th Status
          tbody
            template(v-for="(row, i) in sortedChildren")
              tr(
                :key="row.id"
                :class="{ 'violation-row': row.hasViolation }"
              )
                td {{ i + 1 }}
                td.id-cell {{ shortId(row.id) }}
                td {{ row.age }}
                td
                  span.district-dot(:style="{ background: districtHex(row.district) }")
                  |  {{ districtName(row.district) }}
                td(:class="{ 'field-bad': row.education_level > 0 }") {{ educationLabel(row.education_level) }}
                td(:class="{ 'field-bad': row.income > 0 }") {{ row.income }}
                td(:class="{ 'field-bad': !!row.workplace_id }") {{ row.workplace_id || '-' }}
                td {{ row.home_building_id || '-' }}
                td.status-cell
                  span.status-ok(v-if="!row.hasViolation") \u2713
                  span.status-bad(v-else) \u2717
              tr.violation-detail(v-if="row.hasViolation" :key="row.id + '-v'")
                td(colspan="9")
                  span.violation-text {{ violationDetails(row) }}

    //- Adult Quick Stats
    .adult-stats
      h4.subheading Erwachsene (\u226518)
      .info-cards
        .info-card
          .info-value {{ adults.length }}
          .info-label Erwachsene gesamt
        .info-card
          .info-value {{ adultsWithWork }}
          .info-label Mit Arbeitsplatz
        .info-card
          .info-value {{ adults.length - adultsWithWork }}
          .info-label Ohne Arbeitsplatz
</template>

<script>
import { mapState } from 'pinia'
import { useSimulationStore } from '@/stores/simulation'
import { DISTRICT_NAMES, DISTRICT_COLORS, EDUCATION_LABELS } from '@/lib/blob-adapter'

export default {
  name: 'ChildrenValidation'
  , data: () => ({
    sortKey: 'index'
    , sortAsc: true
  })
  , computed: {
    ...mapState(useSimulationStore, ['dashboardBlobList'])
    , blobList() {
      return this.dashboardBlobList || null
    }
    , blobs() {
      if (!this.blobList) return []
      return this.blobList.globs || this.blobList.blobs || this.blobList
    }
    , children() {
      return this.blobs.filter(g => g.age < 18)
    }
    , adults() {
      return this.blobs.filter(g => g.age >= 18)
    }
    , violations() {
      return this.children.filter(c => c.workplace_id || c.income > 0 || c.education_level > 0)
    }
    , correctCount() {
      return this.children.length - this.violations.length
    }
    , allCorrect() {
      return this.violations.length === 0
    }
    , adultsWithWork() {
      return this.adults.filter(a => !!a.workplace_id).length
    }
    , childrenWithFlags() {
      return this.children.map((c, i) => ({
        ...c
        , index: i
        , hasViolation: !!(c.workplace_id || c.income > 0 || c.education_level > 0)
      }))
    }
    , sortedChildren() {
      const arr = [...this.childrenWithFlags]
      const key = this.sortKey
      const dir = this.sortAsc ? 1 : -1
      arr.sort((a, b) => {
        let va = a[key]
        let vb = b[key]
        if (va == null) va = ''
        if (vb == null) vb = ''
        if (typeof va === 'string') return va.localeCompare(vb) * dir
        return (va - vb) * dir
      })
      return arr
    }
  }
  , methods: {
    districtHex(d) {
      const hex = DISTRICT_COLORS[d] || 0x999999
      return '#' + hex.toString(16).padStart(6, '0')
    }
    , districtName(d) {
      return DISTRICT_NAMES[d] || ('Distrikt ' + d)
    }
    , educationLabel(level) {
      return EDUCATION_LABELS[level] || '?'
    }
    , shortId(id) {
      if (!id) return '-'
      return String(id).substring(0, 8)
    }
    , sortBy(key) {
      if (this.sortKey === key) {
        this.sortAsc = !this.sortAsc
      } else {
        this.sortKey = key
        this.sortAsc = true
      }
    }
    , sortClass(key) {
      if (this.sortKey !== key) return 'sortable'
      return this.sortAsc ? 'sortable sort-asc' : 'sortable sort-desc'
    }
    , violationDetails(row) {
      const issues = []
      if (row.workplace_id) issues.push('workplace_id = ' + row.workplace_id)
      if (row.income > 0) issues.push('income = ' + row.income)
      if (row.education_level > 0) issues.push('education_level = ' + row.education_level)
      return issues.join(', ')
    }
  }
  , mounted() {
    useSimulationStore().fetchDashboardBlobList()
  }
}
</script>

<style lang="sass" scoped>
$red: #d20f18

.children-validation
  padding: 1rem 0

.summary-box
  display: flex
  gap: 1rem
  margin-bottom: 1rem
  flex-wrap: wrap

.summary-stat
  flex: 1 1 200px
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px
  padding: 0.75rem 1rem
  text-align: center

  .summary-value
    font-size: 1.6rem
    font-weight: 700
    color: $primary

    &.is-ok
      color: #4caf50

    &.is-bad
      color: $red

  .summary-label
    font-size: 0.75rem
    color: $grey
    margin-top: 0.25rem

.violation-alert
  background: rgba($red, 0.15)
  border: 1px solid rgba($red, 0.4)
  border-radius: 6px
  padding: 0.6rem 1rem
  margin-bottom: 1rem
  color: #ff6b6b
  font-size: 0.85rem
  font-weight: 600

  .alert-icon
    margin-right: 0.4rem

.subheading
  font-size: 0.95rem
  color: $grey-lighter
  margin-bottom: 0.5rem

.table-section
  margin-bottom: 1.5rem

.table-wrap
  overflow-x: auto

.children-table
  width: 100%
  font-size: 0.8rem
  border-collapse: collapse

  th, td
    padding: 0.35rem 0.6rem
    text-align: left
    border-bottom: 1px solid rgba(255, 255, 255, 0.06)

  th
    color: $grey
    font-weight: 600
    font-size: 0.7rem
    text-transform: uppercase

    &.sortable
      cursor: pointer
      user-select: none

      &:hover
        color: $primary

    &.sort-asc::after
      content: ' \25B2'
      font-size: 0.6rem

    &.sort-desc::after
      content: ' \25BC'
      font-size: 0.6rem

  td
    color: $text

.col-nr
  width: 40px

.id-cell
  font-family: monospace
  font-size: 0.75rem

.district-dot
  display: inline-block
  width: 8px
  height: 8px
  border-radius: 50%
  vertical-align: middle

.field-bad
  color: #ff6b6b
  font-weight: 600

.violation-row
  background: rgba($red, 0.15)

.violation-detail td
  background: rgba($red, 0.08)
  padding: 0.2rem 0.6rem 0.4rem
  border-bottom: 1px solid rgba($red, 0.2)

.violation-text
  font-size: 0.7rem
  color: #ff6b6b
  font-style: italic

.status-cell
  text-align: center

.status-ok
  color: #4caf50
  font-weight: 700
  font-size: 1rem

.status-bad
  color: $red
  font-weight: 700
  font-size: 1rem

.adult-stats
  margin-top: 1rem

.info-cards
  display: flex
  gap: 0.75rem
  flex-wrap: wrap

.info-card
  flex: 1 1 140px
  background: rgba(255, 255, 255, 0.03)
  border: 1px solid rgba(255, 255, 255, 0.08)
  border-radius: 6px
  padding: 0.75rem 1rem
  text-align: center

  .info-value
    font-size: 1.6rem
    font-weight: 700
    color: $primary

  .info-label
    font-size: 0.75rem
    color: $grey
    margin-top: 0.25rem
</style>
