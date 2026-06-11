/**
 * Chart.js 4 global setup: controller/scale/element registration + the
 * app-wide dark-theme defaults (ported from the old Chart.defaults.global
 * block in main.js — that API died with chart.js 2).
 * Imported once by every chart wrapper component.
 */
import { Chart, registerables } from 'chart.js'

Chart.register(...registerables)

Chart.defaults.color = '#fffbfc'
Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
Chart.defaults.elements.line.borderWidth = 1.5
Chart.defaults.elements.point.radius = 0
Chart.defaults.elements.point.hitRadius = 6
Chart.defaults.plugins.legend.labels.color = '#aaa'
Chart.defaults.plugins.legend.labels.boxWidth = 12
Chart.defaults.scale.grid.color = 'rgba(255,255,255,0.06)'
Chart.defaults.scale.ticks.color = '#888'
// chart.js 2's gridLines.zeroLineColor has no direct v4 equivalent; the
// subtle grid is close enough that the zero-line emphasis is dropped.

export { Chart }
