// Shared by every feature's api.ts — one place to point at the backend.
// VITE_API_BASE_URL is set at build time (see .env.production once
// Milestone 4 exists); the local Express dev server is the fallback so
// `npm run dev` keeps working with zero config.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api'
