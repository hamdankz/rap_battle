# Robo Rhyme Royale — Kokoro preset cast

## Install
1. Back up your GitHub repo.
2. Upload the **contents** of this ZIP to the **root** of your existing GitHub repository (not into an extra folder). Keep `public/` as a directory.
3. Render deploys the existing Node app normally. No new environment variables required.
4. On the host computer, use Chrome or Edge initially. Click **TEST SOUND** in the lobby to load the free model and test audio. Allow the initial model download to finish.
5. Join on phones, write lines, and play. The **host** computer performs the Kokoro speech; phones submit and vote.

## How it works
- 14 preset Kokoro voices, assigned consistently by player order; they are not voice clones.
- First visit downloads a quantized Kokoro model in the host browser. Browser caching may avoid repeat downloads but is not guaranteed. No Voicebox app needed.
- Beat loops continuously while each generated line plays. Syllables select a 2-, 3-, or 5-measure phrase, then extend it by complete phrases if the actual audio lasts longer.
- `/api/voice`, socket events, votes, and server beat definitions are unchanged. If a custom voice is configured it is attempted first; otherwise preset Kokoro.
- On model load or generation failure, the game visibly warns and falls back to browser speech. This fallback cannot be precisely synchronized.
- Kokoro speech is natural TTS, not rap performance; measure boundaries are synchronized but syllables are not individually quantized.
- Model loading/generation on low-memory hosts may be slow. Render Free's normal timeout and session limitations still apply.
- The existing server limits the voting timer to 5 minutes; extremely long battles may exceed it.

## Important testing
The code passes static syntax checks, but model download, speech quality, and end-to-end gameplay must be tested in a real browser after deployment.
