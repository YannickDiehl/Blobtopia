export const ERAS = [
  { name: 'Prolog',                 start: 0,    end: 1459,  color: 'rgba(78,204,163,0.15)' }
  , { name: 'Skandal & Sicherheit', start: 1460, end: 2919,  color: 'rgba(240,201,41,0.15)' }
  , { name: 'Klima & Ungleichheit', start: 2920, end: 4379,  color: 'rgba(92,157,237,0.15)' }
  , { name: 'Krise & Polarisierung',start: 4380, end: 5474,  color: 'rgba(210,15,24,0.15)' }
  , { name: 'Erholung',             start: 5475, end: 8030,  color: 'rgba(240,154,64,0.15)' }
]

export function getEraForTick(tick) {
  for (let i = 0; i < ERAS.length; i++) {
    if (tick >= ERAS[i].start && tick <= ERAS[i].end) return i
  }
  return ERAS.length - 1
}
