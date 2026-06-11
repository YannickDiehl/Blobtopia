/**
 * Buefy→Oruga-Kompatibilitätsschicht.
 *
 * Registriert dünne Wrapper unter den alten b-*-Namen, die Buefy-Props in
 * Oruga-Props übersetzen — so kompilieren alle Templates ohne Anfassen.
 * Der b-icon-Shim bleibt DAUERHAFT (120 Call-Sites umbenennen ist Churn);
 * die übrigen Shims werden in WP6 inlined. Zusätzlich: $buefy.snackbar/toast
 * über das eigene DOM-Toast-Util (kein Buefy-Code mehr).
 */
import { h } from 'vue'
import { openSnackbar, openToast } from '@/lib/toast'

// 'is-small' → 'small', 'is-danger' → 'danger'
const stripIs = v => (typeof v === 'string' ? v.replace(/^is-/, '') : v)

function wrap(orugaName, mapProps) {
  return {
    inheritAttrs: false
    , render() {
      const { props, extra } = mapProps(this.$attrs)
      return h(
        // Auflösung über den globalen Registrierungsnamen (Oruga-Plugin)
        this.$.appContext.app.component(orugaName)
        , { ...extra, ...props }
        , this.$slots
      )
    }
  }
}

// Übersetzt die üblichen Buefy-Attrs; `rest` fließt unverändert durch
function commonMap(attrs, renames = {}) {
  const props = {}
  const extra = {}
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'type') props.variant = stripIs(val)
    else if (key === 'size') props.size = stripIs(val)
    else if (key === 'position') props.position = stripIs(val)
    else if (key in renames) props[renames[key]] = val
    else extra[key] = val
  }
  return { props, extra }
}

export default {
  install(app) {
    app.component('b-icon', wrap('OIcon', attrs => commonMap(attrs, { 'custom-class': 'customClass', customClass: 'customClass' })))
    app.component('b-button', wrap('OButton', attrs => commonMap(attrs, {
      'icon-left': 'iconLeft', iconLeft: 'iconLeft'
      , 'icon-right': 'iconRight', iconRight: 'iconRight'
      , 'native-type': 'nativeType', nativeType: 'nativeType'
    })))
    app.component('b-tooltip', wrap('OTooltip', attrs => commonMap(attrs, {
      multilined: 'multiline'
    })))
    app.component('b-field', wrap('OField', attrs => commonMap(attrs, {})))
    app.component('b-input', wrap('OInput', attrs => commonMap(attrs, {})))
    app.component('b-select', wrap('OSelect', attrs => commonMap(attrs, {})))
    app.component('b-loading', wrap('OLoading', attrs => {
      const { props, extra } = commonMap(attrs, {})
      if ('is-full-page' in extra) { props.fullPage = extra['is-full-page']; delete extra['is-full-page'] }
      if ('isFullPage' in extra) { props.fullPage = extra.isFullPage; delete extra.isFullPage }
      return { props, extra }
    }))
    app.component('b-tabs', wrap('OTabs', attrs => {
      const { props, extra } = commonMap(attrs, {})
      // Buefy: type="is-boxed" → Oruga type="boxed" (commonMap macht variant
      // daraus — korrigieren)
      if (props.variant) { props.type = props.variant; delete props.variant }
      return { props, extra }
    }))
    app.component('b-tab-item', wrap('OTabItem', attrs => commonMap(attrs, {})))

    // $buefy.snackbar / $buefy.toast — eigenes DOM-Util statt Buefy
    app.config.globalProperties.$buefy = {
      snackbar: { open: openSnackbar }
      , toast: { open: opts => openToast(typeof opts === 'string' ? { message: opts } : opts) }
    }
  }
}
