<template lang="pug">
Doughnut(:data="chartData", :options="options")
</template>

<script>
import { Doughnut } from 'vue-chartjs'
import '@/lib/chart-setup'

export default {
  components: { Doughnut }
  ,props: {
    chartData: { type: Object, required: true }
    ,options: { type: Object, default: () => ({}) }
  }
}
</script>
