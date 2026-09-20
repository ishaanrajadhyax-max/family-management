// The "speak Jarvis's replies aloud" piece of the voice pipeline — the
// mirror image of useVoiceCapture.ts. SpeechSynthesisUtterance is a
// standard DOM type, so no custom typing needed here. Kept behind this
// one hook so a later swap to a higher-quality TTS API only means
// rewriting this file, not anything that calls it.
export function useSpeechOutput() {
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  function speak(text: string) {
    if (!isSupported || !text.trim()) return
    // Cancel whatever's currently playing so replies don't overlap/queue
    // up if the user sends messages faster than Jarvis can finish talking.
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    window.speechSynthesis.speak(utterance)
  }

  function stop() {
    if (isSupported) window.speechSynthesis.cancel()
  }

  return { isSupported, speak, stop }
}
