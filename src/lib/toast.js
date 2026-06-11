/**
 * Minimaler Snackbar/Toast — Ersatz für $buefy.snackbar/$buefy.toast.
 * DOM-basiert mit Bulma-Klassen, ohne Framework-Abhängigkeit.
 */

function ensureContainer(positionClass) {
  const id = 'toast-container-' + positionClass
  let el = document.getElementById(id)
  if (!el) {
    el = document.createElement('div')
    el.id = id
    Object.assign(el.style, {
      position: 'fixed'
      , zIndex: '200'
      , display: 'flex'
      , flexDirection: 'column'
      , gap: '0.5rem'
      , pointerEvents: 'none'
      , ...(positionClass.includes('bottom') ? { bottom: '1rem' } : { top: '3.5rem' })
      , ...(positionClass.includes('right') ? { right: '1rem' }
        : positionClass.includes('left') ? { left: '1rem' }
          : { left: '50%', transform: 'translateX(-50%)' })
    })
    document.body.appendChild(el)
  }
  return el
}

const VARIANT_BG = {
  'is-danger': '#d20f18'
  , 'is-success': '#246B26'
  , 'is-warning': '#b89a00'
  , 'is-info': '#1f698e'
}

/**
 * open({ message (HTML), duration, indefinite, position, type, actionText, onAction, queue })
 */
export function openSnackbar(opts = {}) {
  const container = ensureContainer(opts.position || 'is-bottom-right')
  const note = document.createElement('div')
  Object.assign(note.style, {
    background: 'rgba(20,20,20,0.95)'
    , color: '#fffdfc'
    , borderLeft: '4px solid ' + (VARIANT_BG[opts.type] || '#5f5e55')
    , borderRadius: '4px'
    , padding: '0.7rem 0.9rem'
    , boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
    , display: 'flex'
    , alignItems: 'center'
    , gap: '0.8rem'
    , maxWidth: '420px'
    , fontSize: '0.85rem'
    , pointerEvents: 'auto'
  })
  const msg = document.createElement('div')
  msg.innerHTML = opts.message || ''
  note.appendChild(msg)

  const close = () => {
    if (note.parentNode) note.parentNode.removeChild(note)
    if (opts.onAction) opts.onAction()
  }

  if (opts.actionText) {
    const btn = document.createElement('button')
    btn.textContent = opts.actionText
    Object.assign(btn.style, {
      background: 'transparent'
      , border: 'none'
      , color: '#1cc1aa'
      , cursor: 'pointer'
      , fontWeight: '600'
      , textTransform: 'uppercase'
      , fontSize: '0.75rem'
    })
    btn.addEventListener('click', close)
    note.appendChild(btn)
  }

  container.appendChild(note)
  if (!opts.indefinite) {
    setTimeout(close, opts.duration || 3500)
  }
  return { close }
}

export function openToast(opts = {}) {
  return openSnackbar({
    position: 'is-top'
    , duration: 2500
    , ...opts
    , actionText: null
    , onAction: null
  })
}
