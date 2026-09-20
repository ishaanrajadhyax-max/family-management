// Small formatting helpers kept local to the Jarvis feature — it's a
// self-contained module, not sharing internals with the Family Management
// side (src/features/dad/) even though both apps live in one repo.
export function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })
}
