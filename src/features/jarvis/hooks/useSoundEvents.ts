import { useEffect } from 'react'
import { getCoreSnapshot, subscribeCore } from '../logic/coreStore.ts'
import { soundForTransition } from '../logic/soundSpec.ts'
import type { SoundName } from '../logic/soundSpec.ts'
import { playClick, playSound, unlockSound } from '../uiSound'

// The single place UI sound is wired to the interface:
//  1. the first tap or keypress unlocks audio (browsers require a gesture);
//  2. every button gets a click sound, or the sound named in its data-sound
//     attribute ("none" opts out) — so components never call audio themselves;
//  3. changes of Core state trigger their cues (thinking, response ready,
//     voice start/stop, error), so sound follows the same single source of
//     truth as the visuals.
// Panel open/close sounds live in Overlay, and notification sounds in the toast
// system, each at the one place where those events happen.
export function useSoundEvents(rootSelector: string) {
  useEffect(() => {
    const unlock = () => unlockSound()
    const onClick = (e: MouseEvent) => {
      const target = e.target
      if (!(target instanceof Element)) return
      const el = target.closest('button, [role="button"], [role="radio"], [role="switch"], a[href]')
      if (!el || !el.closest(rootSelector)) return
      if (el instanceof HTMLButtonElement && el.disabled) return
      const named = el.getAttribute('data-sound')
      if (named === 'none') return
      if (named) playSound(named as SoundName)
      else playClick()
    }
    document.addEventListener('pointerdown', unlock, { capture: true })
    document.addEventListener('keydown', unlock, { capture: true })
    document.addEventListener('click', onClick, { capture: true })

    let prev = getCoreSnapshot()
    const unsubscribe = subscribeCore(() => {
      const next = getCoreSnapshot()
      const sound = soundForTransition(prev, next)
      prev = next
      if (sound) playSound(sound)
    })

    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true })
      document.removeEventListener('keydown', unlock, { capture: true })
      document.removeEventListener('click', onClick, { capture: true })
      unsubscribe()
    }
  }, [rootSelector])
}
