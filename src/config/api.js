// Static mode: data loaded from JSON files, no backend server needed
export const STATIC_MODE = true

// Base path for static data files (relative to public/)
export const DATA_BASE = import.meta.env.VUE_APP_DATA_BASE || '/data/timeline'

// Chat API endpoint (serverless function)
export const CHAT_API = import.meta.env.VUE_APP_CHAT_API || '/api/chat'

// Frage-Analyse-Endpoint (serverless function) — wertet einen frei
// formulierten Fragetext strukturiert aus (Skala/Konstrukt/Polung/Effekte).
export const ANALYZE_API = import.meta.env.VUE_APP_ANALYZE_API || '/api/analyze'

// Legacy — not used in static mode but kept for compatibility
export const API_BASE = import.meta.env.VUE_APP_API_BASE || ''
