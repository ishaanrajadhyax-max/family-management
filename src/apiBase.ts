// Shared by every feature's api.ts — one place to point at the backend.
// VITE_API_BASE_URL, if set at build time, always wins. Otherwise: in a
// production build the frontend is served by the same Express app as the
// API (see server.js), so a relative '/api' is correct and same-origin —
// no separate deployed frontend URL to configure. In local dev, the Vite
// dev server (port 5173) and the API (port 4000) are genuinely different
// origins, so it falls back to the API's own address.
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api')
