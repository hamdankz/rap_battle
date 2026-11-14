# Audio fix — Robo Rhyme Royale

## Changes
- Voting no longer ends the showdown immediately when everyone votes. Results wait until the estimated full audio performance has finished; the existing deadline still ends voting.
- Removed overlapping beat stop/start timers between MCs. Every MC gets a beat transition and the beat is stopped only after the last MC.
- Kokoro now attempts two different CDN builds (jsDelivr, then esm.sh). If both fail, browser speech fallback remains. This is a compatibility workaround, not a confirmed fix for every Safari version.

## Install
Back up your GitHub repo. Upload the contents of this ZIP to the repository root, preserving public/ folder structure. Render redeploys automatically. Refresh the host browser completely after deployment.

## Test
1. Open host in Chrome on your Mac, click TEST SOUND.
2. Join two players and choose different mystery beats.
3. Submit verses and vote immediately from both phones. The second MC should still finish and the beat should switch.
4. If Kokoro still fails, send the host browser name/version and first error in developer console.

No model weights are included; the model downloads at runtime.
