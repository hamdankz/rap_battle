# Robo Rhyme Royale

Original, free, self-hostable multiplayer robot rap party game. **Not affiliated with Jackbox.**

## Run

Install Node.js 20+, then:

```bash
npm install
npm start
```

Visit `http://localhost:3000` on your computer and click **Host a Game**. Players visit the same website on their phones, click **Join a Game**, enter the four-letter room code and their nickname. For local Wi-Fi, replace `localhost` with your computer's LAN IP and allow port 3000 through your firewall.

## Host online

Deploy this project as a **Node.js web service** (not static hosting) with `npm install` as build command and `npm start` as start command. Use a platform supporting persistent WebSockets. Configure HTTPS on your public domain. Players visit the same public URL; no player accounts needed. Dockerfile is included. Free hosting availability and usage limits vary by provider; no paid APIs are required by this code.

**Important:** Rooms are held in memory. Use one running server instance (no load balancing across instances), and keep it awake during a party. Restarting the server ends active rooms. The host must keep the host tab connected. This is a playable MVP, not a production-scale managed service.

## Game rules

2–8 rappers, up to 30 audience members. Three rounds. Each rapper writes two lines (90 seconds), then the host performs each rap with audio, and all connected players/audience can vote for a different rapper (65 seconds). Each vote awards 100 points. Host advances rounds and reveals champion.

## VoiceStudio

The game works immediately with browser SpeechSynthesis as a fallback (Chrome/Edge recommended). The optional `/api/voice` endpoint forwards synthesis to a **separate trusted adapter** at `VOICE_API_URL`. The adapter must accept `POST {"text":"...","voice":"..."}` and return `audio/wav` or another browser-supported audio format. `VOICE_API_KEY` is forwarded as a bearer token. Do not expose VoiceStudio's API publicly.

VoiceStudio's documented service is at `http://127.0.0.1:3900` and offers local APIs, but its current synthesis request/response contract can vary by installed engine/version. **This project does not claim a tested direct VoiceStudio synthesis integration.** An adapter must be configured and validated against your installed VoiceStudio version. Without it, browser speech synthesis works without extra setup. Running VoiceStudio on your own computer while the game is hosted remotely requires a secure private network tunnel or hosting the adapter alongside the VoiceStudio backend; a cloud server cannot access your computer's `127.0.0.1`.

VoiceStudio: https://github.com/debpalash/VoiceStudio — review its AGPL-3.0 and model-specific licenses.

## Limitations and safety

- No account persistence, moderation dashboard, or reconnection restoration. Refreshing a phone during a game drops its active identity.
- The game server currently accepts arbitrary player lyrics and forwards them to a configured voice service. For public deployment, add authentication, strict voice endpoint rate limits, content moderation, and/or an allowlist of trusted players before exposing costly synthesis capacity.
- Public `/api/voice` has only a basic global API rate limiter; do not set a costly or publicly reachable adapter without stronger protections.
- No music tracks are bundled. Spoken verses are sequential, not beat-synchronized.
- Designed for one room-host browser controlling the show and players using phones.

## Updated lyric modes

During writing, choose **Complete a bar** to fill the blank (the server assembles and speaks the entire line), or **Write your own bars** to submit two fully original lines. Both modes use the same voting and voice playback. To update Render, replace the files in your GitHub repository and commit; Render normally redeploys on new commits.
