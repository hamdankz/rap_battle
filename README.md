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
- Beats are generated in code (no music files). Voice lines are fitted to whole bars by speeding up/slowing down, which can slightly change pitch.
- Designed for one room-host browser controlling the show and players using phones.

## Household voices (secret MCs)

1. Open `http://localhost:3000/record.html` on the host computer (the mic needs `localhost` or HTTPS; on phones over plain Wi-Fi, upload a voice memo instead). Each person ticks the consent box and records 1–2 minutes. Recordings are saved in `voices/` on this machine only. Anyone can delete their voice on the same page.
2. Run the local adapter (see `adapter/xtts_adapter.py` for install steps): `COQUI_TOS_AGREED=1 uvicorn xtts_adapter:app --host 127.0.0.1 --port 8020`.
3. Start the game with `VOICE_API_URL=http://127.0.0.1:8020/synthesize npm start`.

Each game deals every player a random recorded voice (never one saved under their own player name) and reveals whose voice it was on the final screen. After writing ends, the host screen renders every line (a "studio" step that is slow on a CPU-only laptop, quick with a GPU), then plays them over a generated beat that rotates each round: Boom Bap, Trap, UK Drill. With no recorded voices or no adapter, it falls back to browser speech.

The voice list on `/record.html` shows who recorded, so keep that page to the household, and run the game on your home network, not a public host. Docker note: mount a volume at `/app/voices` to keep recordings.
