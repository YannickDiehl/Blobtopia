<template lang="pug">
Bar(:data="chartData", :options="options")
</template>

<script>
import { Bar } from 'vue-chartjs'
import '@/lib/chart-setup'

export default {
  components: { Bar }
  ,props: {
    chartData: { type: Object, required: true }
    ,options: { type: Object, default: () => ({}) }
  }
}
</script>
