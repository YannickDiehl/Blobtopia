/**
 * Plain formatting functions — framework-free.
 * Registered as Vue 2 template filters via src/plugins/filters.js (a thin
 * adapter that disappears with Vue 3); usable directly as methods anywhere.
 */
import _capitalize from 'lodash/capitalize'
import _kebabCase from 'lodash/kebabCase'
import _find from 'lodash/find'
import _filter from 'lodash/filter'
import _startCase from 'lodash/startCase'

export const capitalize = _capitalize
export const kebabCase = _kebabCase
export const startCase = _startCase
export const filter = _filter

export function titleCase( str ){
  return str.split(' ').map( w => _capitalize(w) ).join(' ')
}

const numberRanges = [
  { range: [1, 1e3], suffix: '', decimals: 0 }
  , { range: [1e3, 1e6], suffix: 'k', decimals: 1 }
  , { range: [1e6, 1e9], suffix: 'M', decimals: 1 }
  , { range: [1e9, Infinity], suffix: 'B', decimals: 1 }
]

export function shortNumber( n ){
  if ( n === 0 ){
    return '0'
  }

  let cfg = _find( numberRanges, cfg => (cfg.range[0] && n < cfg.range[1]) )
  return (n / cfg.range[0]).toFixed( cfg.decimals ) + cfg.suffix
}

export function duration( n ){
  n = Math.round(n / 1000)
  let hours   = Math.floor(n / 3600)
  let minutes = Math.floor((n - (hours * 3600)) / 60)
  let seconds = n - (hours * 3600) - (minutes * 60)
  var fmt = ''

  if ( hours !== 0 ){
    if ( hours   < 10 ) { hours   = '0' + hours }
    fmt = hours + ':'
  }

  if ( minutes < 10 ) { minutes = '0' + minutes }
  if ( seconds < 10 ) { seconds = '0' + seconds }

  fmt += `${minutes}:${seconds}`

  return fmt
}

export function truncate( str = '', len = 30, sfx = '...' ){
  if ( str.length < len ){ return str }
  return str.substr( 0, len - sfx.length ) + sfx
}
