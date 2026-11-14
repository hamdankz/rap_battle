# Battle voice path update

The MC Library and battle now explicitly call the same `window.KokoroCast.speakWav(text, voiceId)` method. The battle then decodes its WAV into Web Audio for beat-synchronised playback.

This patch adds explicit per-line error logging and checks empty audio. It does not claim to fix Safari's separate engine loading failure.

To diagnose remaining errors: open Chrome DevTools Console, start a battle, and copy the `Kokoro battle clip failed` error (including its underlying message).

The battle still falls back to built-in speech on individual clip failure so the game can finish.
