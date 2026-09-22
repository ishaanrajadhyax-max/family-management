import { Icon } from 'jarvis-design-system'

// The full icon set: one consistent 24px-grid, 1.6-stroke, round-cap
// language. Every name here is used by a real control in the Jarvis UI.
const NAMES = [
  'mic', 'speaker', 'speaker-off', 'send', 'stop', 'replay', 'memory', 'trash',
  'check', 'x', 'sliders', 'bell', 'general', 'news', 'style', 'family',
  'history', 'chat', 'intelligence', 'voice', 'plus', 'chevron-down',
  'chevron-right', 'logout', 'undo', 'alert', 'info', 'loading', 'core',
] as const

export function AllIcons() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
        gap: 16,
        padding: 24,
        background: '#02060b',
        color: '#9db4c8',
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: 10.5,
      }}
    >
      {NAMES.map((name) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <Icon name={name} size={22} className="" />
          <span style={{ letterSpacing: '0.06em', textAlign: 'center' }}>{name}</span>
        </div>
      ))}
    </div>
  )
}

export function Sizes() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: 24, background: '#02060b', color: '#22d3ee' }}>
      <Icon name="core" size={14} />
      <Icon name="core" size={18} />
      <Icon name="core" size={24} />
      <Icon name="core" size={32} />
      <Icon name="core" size={48} />
    </div>
  )
}
