import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import crypto from 'node:crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const http = createServer(app);
const io = new Server(http, { maxHttpBufferSize: 12000, cors: { origin: false } });
const PORT = Number(process.env.PORT || 3000);
const rooms = new Map();
const MAX_PLAYERS = 8;
const MAX_AUDIENCE = 30;

// ---- Household voice library (files stay on this machine) ----
const VOICES_DIR = process.env.VOICES_DIR || path.join(__dir, 'voices');
fs.mkdirSync(VOICES_DIR, { recursive: true });
const INDEX = path.join(VOICES_DIR, 'index.json');
const loadVoices = () => { try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return []; } };
const saveVoices = v => fs.writeFileSync(INDEX, JSON.stringify(v, null, 1));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// Beat styles rotate each round. Must match public/beat.js.
// lineBars = musical bars that make up ONE rapped bar (trap/drill are half-time, so 2).
const BEATS = [
  { name: 'Boom Bap', bpm: 88, lineBars: 1 },
  { name: 'Trap', bpm: 140, lineBars: 2 },
  { name: 'UK Drill', bpm: 142, lineBars: 2 },
];

const prompts = ['I rolled into the club with a pocket of ___', 'Your robot is so rusty it smells like ___', 'My rhymes hit harder than a flying ___', 'I stole your batteries and bought a ___', 'My circuits are hotter than a ___', 'You call that a rap? Sounds like a ___', 'I upgraded my brain with a giant ___', 'Your dance moves look like a broken ___'];
const safe = (s, n = 80) => String(s ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
const code = () => { let c; do { c = Array.from(crypto.randomBytes(4), x => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[x % 24]).join(''); } while (rooms.has(c)); return c; };
const fillBar = (pr, w) => (pr.includes('___') ? pr.replace('___', w) : `${pr} ${w}`);
const player = (r, id) => r.players.find(p => p.id === id);
const all = r => [...r.players, ...r.audience];
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const publish = r => {
  io.to(r.code).emit('state', {
    code: r.code, phase: r.phase, round: r.round, maxRounds: r.maxRounds, hostConnected: r.hostConnected,
    players: r.players.map(({ id, name, robot, score, connected, submitted }) => ({ id, name, robot, score, connected, submitted })),
    audience: r.audience.length, deadline: r.deadline, battle: r.battle, results: r.results, champion: r.champion,
    beat: r.beat, hasVoices: r.hasVoices,
    // Voice owners stay secret until the game is over
    reveal: r.phase === 'finished' ? r.players.filter(p => p.voiceOwner).map(p => ({ name: p.name, robot: p.robot, voice: p.voiceOwner })) : null,
  });
};
const error = (cb, message) => cb?.({ ok: false, error: message });
const timers = r => { clearTimeout(r.timer); r.timer = null; };
const cleanup = r => { timers(r); rooms.delete(r.code); io.to(r.code).emit('closed'); };

// Secretly deal a random household voice to every player (never their own, when names match)
function assignVoices(r) {
  const voices = loadVoices();
  r.hasVoices = voices.length > 0;
  const pool = shuffle(voices);
  const used = new Set();
  for (const p of r.players) {
    const notMine = v => v.owner.toLowerCase() !== p.name.toLowerCase();
    const pick = pool.find(v => !used.has(v.id) && notMine(v)) || pool.find(notMine) || pool[0];
    p.voiceId = pick?.id || null;
    p.voiceOwner = pick?.owner || null;
    if (pick) used.add(pick.id);
  }
}

function startRound(r) {
  timers(r); r.round++; r.phase = 'writing'; r.deadline = Date.now() + 120000; r.results = null; r.battle = null;
  r.beat = BEATS[(r.round - 1) % BEATS.length];
  for (const p of r.players) {
    p.submitted = false; p.lines = [];
    p.prompts = [prompts[(r.round * 3 + r.players.indexOf(p)) % prompts.length], prompts[(r.round * 3 + r.players.indexOf(p) + 4) % prompts.length]];
    io.to(p.id).emit('prompt', { prompts: p.prompts });
  }
  publish(r); r.timer = setTimeout(() => startBattle(r), 120000);
}
// Writing is over: host renders the voices over the beat, then calls beginVoting
function startBattle(r) {
  if (r.phase !== 'writing') return; timers(r);
  r.phase = 'rendering'; r.deadline = 0;
  r.battle = r.players.map(p => ({ id: p.id, name: p.name, robot: p.robot, lines: p.lines?.length === 4 ? p.lines : ['My circuits crackle with a thunderous beat', 'Your rhymes are weak, accept defeat', 'I never skip a bar, I never miss a rhyme', 'Bow down to the bot, it is rapping time'] }));
  publish(r); r.timer = setTimeout(() => beginVoting(r, 90000), 300000); // safety net if host stalls
}
function beginVoting(r, ms) {
  if (r.phase !== 'rendering') return; timers(r);
  r.phase = 'voting'; r.deadline = Date.now() + ms; r.votes = new Map();
  publish(r); r.timer = setTimeout(() => finishVoting(r), ms);
}
function finishVoting(r) {
  if (r.phase !== 'voting') return; timers(r);
  const tally = Object.fromEntries(r.players.map(p => [p.id, 0]));
  for (const id of r.votes.values()) if (id in tally) tally[id]++;
  for (const p of r.players) p.score += (tally[p.id] || 0) * 100;
  r.results = tally; r.phase = 'results'; r.deadline = 0; publish(r);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '8kb' }));
app.use('/api', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', (_q, res) => res.json({ ok: true, rooms: rooms.size, voice: !!process.env.VOICE_API_URL, voices: loadVoices().length }));

// ---- Voice library API (used by /record.html) ----
app.get('/api/voices', (_q, res) => res.json(loadVoices().map(({ id, owner, createdAt }) => ({ id, owner, createdAt }))));
app.post('/api/voices', express.raw({ type: 'audio/wav', limit: '12mb' }), (req, res) => {
  const owner = safe(req.query.owner, 24);
  if (owner.length < 2) return res.status(400).json({ error: 'Enter your name (2+ characters)' });
  if (req.query.consent !== '1') return res.status(400).json({ error: 'Consent is required to save a voice' });
  const b = req.body;
  if (!Buffer.isBuffer(b) || b.length < 44 || b.toString('ascii', 0, 4) !== 'RIFF') return res.status(400).json({ error: 'Expected a WAV recording' });
  if (b.length < 24000 * 2 * 10) return res.status(400).json({ error: 'Recording too short (10 seconds minimum, 60 is best)' });
  const id = crypto.randomUUID();
  fs.writeFileSync(path.join(VOICES_DIR, id + '.wav'), b);
  const v = loadVoices(); v.push({ id, owner, createdAt: Date.now() }); saveVoices(v);
  res.json({ ok: true, id });
});
app.delete('/api/voices/:id', (req, res) => {
  const v = loadVoices(); const hit = v.find(x => x.id === req.params.id);
  if (!UUID.test(req.params.id) || !hit) return res.status(404).json({ error: 'Not found' });
  if (hit.owner.toLowerCase() !== safe(req.query.owner, 24).toLowerCase()) return res.status(403).json({ error: 'Type the name the voice was saved under' });
  try { fs.unlinkSync(path.join(VOICES_DIR, hit.id + '.wav')); } catch { /* already gone */ }
  saveVoices(v.filter(x => x.id !== hit.id));
  res.json({ ok: true });
});

// ---- Synthesis: forwards to the local voice adapter (see adapter/xtts_adapter.py) ----
// The browser only sends {code, pid, text}; the secret voice id never leaves the server.
app.post('/api/voice', async (req, res) => {
  const url = process.env.VOICE_API_URL;
  if (!url) return res.status(503).json({ error: 'Voice adapter not configured' });
  const r = rooms.get(safe(req.body?.code, 4).toUpperCase());
  const p = r && player(r, String(req.body?.pid || ''));
  const text = safe(req.body?.text, 300);
  if (!p?.voiceId || !text) return res.status(404).json({ error: 'No voice for this player' });
  try {
    const target = new URL(url);
    if (!['http:', 'https:'].includes(target.protocol)) throw Error('Invalid URL');
    const response = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.VOICE_API_KEY ? { Authorization: `Bearer ${process.env.VOICE_API_KEY}` } : {}) },
      body: JSON.stringify({ text, voice_id: p.voiceId }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw Error(`Voice service HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5_000_000) throw Error('Audio too large');
    res.type('audio/wav').send(bytes);
  } catch (e) { res.status(502).json({ error: 'Voice generation unavailable', detail: String(e.message).slice(0, 120) }); }
});

app.use(express.static(path.join(__dir, 'public')));

io.on('connection', s => {
  s.on('host:create', (data, cb) => { if (s.data.code) return error(cb, 'Already in a room'); const c = code(); const r = { code: c, host: s.id, hostConnected: true, phase: 'lobby', round: 0, maxRounds: 3, players: [], audience: [], timer: null, deadline: 0, battle: null, results: null, champion: null, votes: new Map(), beat: null, hasVoices: false }; rooms.set(c, r); s.data = { code: c, role: 'host' }; s.join(c); cb?.({ ok: true, code: c, token: crypto.randomUUID() }); publish(r); });
  s.on('join', (data, cb) => { if (s.data.code) return error(cb, 'Already joined'); const r = rooms.get(safe(data?.code, 4).toUpperCase()); if (!r) return error(cb, 'Room not found'); const name = safe(data?.name, 18); if (name.length < 2) return error(cb, 'Enter a name (2–18 characters)'); if (r.phase !== 'lobby') return error(cb, 'This game has already started'); if (all(r).some(p => p.name.toLowerCase() === name.toLowerCase())) return error(cb, 'Name already taken'); const audience = r.players.length >= MAX_PLAYERS; if (audience && r.audience.length >= MAX_AUDIENCE) return error(cb, 'Room full'); const p = { id: s.id, name, robot: audience ? '👀' : ['🤖', '👾', '🦾', '🛸', '⚡', '🔩', '🧠', '🚀'][r.players.length], score: 0, connected: true, submitted: false, lines: [], voiceId: null, voiceOwner: null }; (audience ? r.audience : r.players).push(p); s.data = { code: r.code, role: audience ? 'audience' : 'player' }; s.join(r.code); cb?.({ ok: true, id: s.id, role: s.data.role, code: r.code }); publish(r); });
  s.on('host:start', (_, cb) => { const r = rooms.get(s.data.code); if (!r || r.host !== s.id) return error(cb, 'Only host can start'); if (r.phase !== 'lobby' || r.players.length < 2) return error(cb, 'Need at least 2 players in lobby'); assignVoices(r); startRound(r); cb?.({ ok: true }); });
  s.on('host:rendered', (data, cb) => { const r = rooms.get(s.data.code); if (!r || r.host !== s.id || r.phase !== 'rendering') return error(cb, 'Not rendering'); const ms = Math.min(300000, Math.max(45000, (Number(data?.durationMs) || 0) + 20000)); beginVoting(r, ms); cb?.({ ok: true }); });
  s.on('submit', (data, cb) => { const r = rooms.get(s.data.code), p = r && player(r, s.id); if (!p || r.phase !== 'writing') return error(cb, 'Not writing now'); if (p.submitted) return error(cb, 'Already submitted'); if (!Array.isArray(data?.fills) || data.fills.length !== 2 || !Array.isArray(data?.customs) || data.customs.length !== 2) return error(cb, 'Fill in both words and write both bars'); const fills = data.fills.map(x => safe(x, 24)), customs = data.customs.map(x => safe(x, 100)); if (fills.some(x => x.length < 1)) return error(cb, 'Fill in both blanks'); if (customs.some(x => x.length < 3)) return error(cb, 'Both of your own bars need at least 3 characters'); p.lines = [fillBar(p.prompts[0], fills[0]), customs[0], fillBar(p.prompts[1], fills[1]), customs[1]]; p.submitted = true; cb?.({ ok: true }); publish(r); if (r.players.every(x => x.submitted)) startBattle(r); });
  s.on('vote', (data, cb) => { const r = rooms.get(s.data.code); if (!r || r.phase !== 'voting' || s.data.role === 'host') return error(cb, 'Voting closed'); if (r.votes.has(s.id)) return error(cb, 'Already voted'); if (!r.players.some(p => p.id === data?.id) || data.id === s.id) return error(cb, 'Invalid vote'); r.votes.set(s.id, data.id); cb?.({ ok: true }); const voters = [...r.players, ...r.audience].filter(p => p.connected); if (r.votes.size >= voters.length - Number(r.players.some(p => !p.connected))) finishVoting(r); });
  s.on('host:next', (_, cb) => { const r = rooms.get(s.data.code); if (!r || r.host !== s.id || r.phase !== 'results') return error(cb, 'Cannot advance'); if (r.round >= r.maxRounds) { r.phase = 'finished'; r.finishedAt = Date.now(); r.champion = [...r.players].sort((a, b) => b.score - a.score)[0]?.name; publish(r); } else startRound(r); cb?.({ ok: true }); });
  s.on('disconnect', () => { const r = rooms.get(s.data.code); if (!r) return; if (s.data.role === 'host') { cleanup(r); return; } const p = all(r).find(x => x.id === s.id); if (!p) return; if (r.phase === 'lobby') { r.players = r.players.filter(x => x.id !== s.id); r.audience = r.audience.filter(x => x.id !== s.id); } else p.connected = false; publish(r); });
});
setInterval(() => { for (const r of rooms.values()) if (r.phase === 'finished' && r.finishedAt && Date.now() - r.finishedAt > 3600000) cleanup(r); }, 60000).unref();
http.listen(PORT, '0.0.0.0', () => console.log(`Robo Rhyme Royale running on :${PORT}`));
