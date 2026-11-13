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

2–8 rappers, up to 30 audience members. Three rounds, each on a different beat (Boom Bap, Trap, UK Drill). Each rapper writes 4 bars in 120 seconds: two times (fill in the last word of a prompt bar, then write your own bar that rhymes with it), with a live syllable counter. The host performs each rap with audio, one bar per line, and all connected players/audience vote for a different rapper (65+ seconds). Each vote awards 100 points. Host advances rounds and reveals champion.

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

## November update: mystery MCs, forfeit, AI, beat sync

- Starting a game now deals a shuffled eight-card MC roster. A 12-second mystery-card reveal screen appears **before** writing. Player names are concealed on the writing and studio rosters, and the stage reveals them at performance time.
- The lobby offers an optional **AI challenger for odd player counts**, including solo testing. MC BYTE uses a rotating library of prewritten four-bar verses (offline scripted bot, not a generative AI service). It cannot cast votes.
- A player disconnect during an active match ends the game and awards a forfeit to the highest-scoring remaining connected human (or the bot if no human remains). This is immediate, including short network interruptions; reconnection grace is not implemented.
- Beat and prerecorded vocal clips now share the same Web Audio clock, starting with the first performed bar (no instrumental intro). When browser speech synthesis is used instead, the beat starts on the first utterance's `onstart` event; browser TTS cannot guarantee sample-accurate timing.

To update Render, replace the repository files and commit; Render normally redeploys automatically.

## MC Library (new)

Open `/library.html` from the game homepage. In Render > your Web Service > Environment, add an environment variable `MC_ADMIN_KEY` with a long random password, save, and redeploy. Enter that password in the library page to list preset and recorded MCs, rename them, change their emoji, enable/disable them, and preview custom voice recordings. Never share the key with players.

Preset MCs are game character cards, **not** recorded voice samples. Custom MCs are created via `/record.html` and stored in the server's `voices/` folder. Enabled custom voices are eligible for random voice assignment; enabled MC cards are eligible for the mystery-card display. Editing an MC doesn't change the underlying recorded voice. Library settings are saved in `voices/mc-library.json` and `voices/index.json`. On Render's ephemeral filesystem, voice recordings and settings can disappear on redeploy/restart; configure persistent disk storage or move data to durable storage for long-term use. The recording upload and deletion endpoints are inherited from the original game and **are not admin-protected**: do not expose voice recording to untrusted users until you add authentication. A recording preview plays the original voice memo, not a generated rap.

### GitHub update

Use GitHub Desktop (recommended): clone your existing repository, copy the **contents** of this ZIP into the cloned repository folder (not a nested folder), accept replacement of existing files, commit and push. Or on GitHub web, upload the root files at repository root, and upload `public/library.html` and `public/index.html` inside the existing `public` folder, plus `server.js` at root. You only need these three changed files for the MC Library. The other files in the ZIP are included for completeness. Render normally redeploys automatically after a push.
