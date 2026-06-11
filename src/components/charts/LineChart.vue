<template lang="pug">
//- "Line" ist in Vue 2 ein reserviertes SVG-Element — lokal umbenannt
chart-line(:data="chartData", :options="options")
</template>

<script>
import { Line } from 'vue-chartjs'
import '@/lib/chart-setup'

export default {
  components: { 'chart-line': Line }
  ,props: {
    chartData: { type: Object, required: true }
    ,options: { type: Object, default: () => ({}) }
  }
}
</script>
