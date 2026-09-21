// One consistent technical icon language: 24px grid, 1.6 stroke, round caps.
// Every name here is used by a real control in the interface.
const PATHS = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z M6 11v1a6 6 0 0 0 12 0v-1 M12 18v3 M9 21h6',
  speaker: 'M4 9v6h4l5 4V5L8 9H4z M16.5 8.5a5 5 0 0 1 0 7 M19 6a8.5 8.5 0 0 1 0 12',
  'speaker-off': 'M4 9v6h4l5 4V5L8 9H4z M17 9l5 6 M22 9l-5 6',
  send: 'M21 3L3 10.5l7 2.5 2.5 7L21 3z M10 13L21 3',
  stop: 'M7 7h10v10H7z',
  replay: 'M4 12a8 8 0 1 0 2.5-5.8 M4 4v4h4',
  memory: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3z M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13 M10 11v5 M14 11v5',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12 M18 6L6 18',
  sliders: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 4v6 M6 14v6',
  bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15L6 16z M10 20a2 2 0 0 0 4 0',
  general: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8.5v7 M8.5 12h7',
  news: 'M5 5h11v14H5z M16 9h3v9a1 1 0 0 1-1 1h-2 M8 9h5 M8 12h5 M8 15h3',
  style: 'M12 6.5a2 2 0 1 1 2 2c-1 0-2 .6-2 1.5V11 M12 11l9 6.5H3L12 11z',
  family: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20v-1a5 5 0 0 1 5-5h2a5 5 0 0 1 5 5v1 M17 8.5a2.5 2.5 0 1 1 0 5 M18 14a4 4 0 0 1 3 4v2',
  history: 'M12 7v5l3 2 M4 12a8 8 0 1 0 2.3-5.7 M4 4v4h4',
  chat: 'M4 5h16v11H9l-5 4V5z',
  intelligence: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  voice: 'M4 12h0.01 M7 8v8 M10 5v14 M13 9v6 M16 6v12 M19 10v4',
  plus: 'M12 5v14 M5 12h14',
  'chevron-down': 'M6 9l6 6 6-6',
  'chevron-right': 'M9 6l6 6-6 6',
  logout: 'M9 4H5v16h4 M14 8l4 4-4 4 M18 12H9',
  undo: 'M9 7L4 12l5 5 M4 12h10a5 5 0 0 1 0 10h-3',
  alert: 'M12 4l9 16H3L12 4z M12 10v4 M12 17.2v.3',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v5 M12 7.8v.4',
  loading: 'M12 3a9 9 0 0 1 9 9',
  core: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  className?: string
}

// Decorative by default (aria-hidden): the control that contains it carries the label.
export default function Icon({ name, size = 18, className }: IconProps) {
  return (
    <svg
      className={className ? `j-icon ${className}` : 'j-icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  )
}
