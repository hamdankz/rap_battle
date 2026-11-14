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

// Every player privately picks one of three shuffled mystery beat cards per round.
// Keep these names and BPM values in sync with public/beat.js.
const BEATS = [
  ['Boom Bap',88,1], ['Trap',140,2], ['UK Drill',142,2],
  ['G-Funk',95,1], ['Dark Underground',82,1], ['Phonk',130,2],
  ['Jazz Rap',90,1], ['Grime',140,2], ['Memphis Rap',92,1],
  ['Lo-Fi Hip-Hop',80,1], ['Jersey Club Rap',135,2],
  ['Industrial Rap',105,1], ['Funk Rap',108,1],
  ['Epic Cinematic Rap',100,1], ['Cyberpunk Battle',125,2],
].map(([name,bpm,lineBars]) => ({name,bpm,lineBars}));
const mysteryOptions = () => shuffle(BEATS).slice(0,3);

const DEFAULT_MCS = [
  ['circuit','Circuit King','🤖'],['glitch','Glitch Witch','👾'],
  ['chrome','Chrome Dome','🦾'],['cosmo','Cosmo Flow','🛸'],
  ['volt','DJ Voltage','⚡'],['bolt','Big Bolt','🔩'],
  ['brain','Brainwave','🧠'],['rocket','Rocket Rhymes','🚀']
].map(([id,name,emoji]) => ({id,name,emoji,enabled:true}));
const MC_INDEX = path.join(VOICES_DIR, 'mc-library.json');
const loadMcSettings = () => { try { return JSON.parse(fs.readFileSync(MC_INDEX,'utf8')); } catch { return {}; } };
const saveMcSettings = v => fs.writeFileSync(MC_INDEX, JSON.stringify(v,null,2));
const presetMcs = () => DEFAULT_MCS.map(mc => ({...mc,...(loadMcSettings()[mc.id] || {}),type:'preset'}));
const customMcs = () => loadVoices().map(v => ({id:v.id,name:v.mcName || v.owner,owner:v.owner,emoji:v.emoji || '🎤',enabled:v.enabled !== false,type:'custom',createdAt:v.createdAt}));
const mcLibrary = () => [...presetMcs(),...customMcs()];
const adminKey = process.env.MC_ADMIN_KEY;
const isAdmin = req => !!adminKey && req.get('X-MC-Admin-Key') === adminKey;
const requireAdmin = (req,res,next) => isAdmin(req) ? next() : res.status(401).json({error:'Admin key required. Set MC_ADMIN_KEY on Render.'});

const AI_LINES = [['My CPU is blazing, I am taking the crown','Your tiny little speakers cannot handle my sound','I am made of metal, I was built for the show','You are running on batteries, I am stealing the flow'],['I entered the arena with a laser-bright grin','Your rusty old firmware never stood a chance to win','My motherboard is golden, every rhyme is elite','Now reboot your whole system and get off of my beat']];
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
    players: r.players.map(({ id, name, robot, score, connected, submitted, mcId }) => ({ id, name, robot, score, connected, submitted, mcId })),
    audience: r.audience.length, deadline: r.deadline, battle: r.battle, results: r.results, champion: r.champion,
    beat: r.beat, hasVoices: r.hasVoices, voiceAdapterConfigured: !!process.env.VOICE_API_URL, mcCards: r.mcCards || [], aiEnabled: !!r.aiEnabled, finishReason: r.finishReason || null,
    // Voice owners stay secret until the game is over
    reveal: r.phase === 'finished' ? r.players.filter(p => p.voiceOwner).map(p => ({ name: p.name, robot: p.robot, voice: p.voiceOwner })) : null,
  });
};
const error = (cb, message) => cb?.({ ok: false, error: message });
const timers = r => { clearTimeout(r.timer); r.timer = null; };
const cleanup = r => { timers(r); rooms.delete(r.code); io.to(r.code).emit('closed'); };

// MC card and voice identity are dealt together. A custom card is never silently
// mapped to an unrelated recording. The icon alone is not proof of synthesis.
function dealCards(r) {
  timers(r); r.phase = 'cards'; r.deadline = Date.now() + 12000;
  const enabled = mcLibrary().filter(mc => mc.enabled);
  const pool = shuffle(enabled.length ? enabled : DEFAULT_MCS);
  r.mcCards = pool.map(mc => mc.emoji);
  for (let i = 0; i < r.players.length; i++) {
    const p = r.players[i], mc = pool[i % pool.length];
    p.robot = mc.emoji;
    p.mcId = mc.id;
    p.voiceId = mc.type === 'custom' ? mc.id : null;
    p.voiceOwner = mc.type === 'custom' ? mc.owner : null;
  }
  r.hasVoices = r.players.some(p => !!p.voiceId);
  publish(r);
  r.timer = setTimeout(() => startRound(r), 12000);
}
function startRound(r) {
  timers(r); r.round++; r.phase = 'writing'; r.deadline = Date.now() + 120000; r.results = null; r.battle = null;
  r.beat = null; // No global beat: each performer has a private choice
  for (const p of r.players) {
    p.beatOptions = mysteryOptions(); p.beatChoice = p.ai ? crypto.randomInt(3) : null;
    p.submitted = !!p.ai; p.lines = p.ai ? [...AI_LINES[(r.round - 1) % AI_LINES.length]] : [];
    p.prompts = [prompts[(r.round * 3 + r.players.indexOf(p)) % prompts.length], prompts[(r.round * 3 + r.players.indexOf(p) + 4) % prompts.length]];
    if (!p.ai) io.to(p.id).emit('prompt', { prompts: p.prompts, beatCards: ['A','B','C'] });
  }
  publish(r); r.timer = setTimeout(() => startBattle(r), 120000);
}
// Writing is over: host renders the voices over the beat, then calls beginVoting
function startBattle(r) {
  if (r.phase !== 'writing') return; timers(r);
  r.phase = 'rendering'; r.deadline = 0; r.hypeCount = 0;
  r.battle = r.players.map(p => ({ id: p.id, name: p.name, robot: p.robot, beat: p.beatOptions?.[p.beatChoice ?? 0] || BEATS[0], lines: p.lines?.length === 4 ? p.lines : ['My circuits crackle with a thunderous beat', 'Your rhymes are weak, accept defeat', 'I never skip a bar, I never miss a rhyme', 'Bow down to the bot, it is rapping time'] }));
  publish(r); r.timer = setTimeout(() => beginVoting(r, 90000), 300000); // safety net if host stalls
}
function beginVoting(r, ms) {
  if (r.phase !== 'rendering') return; timers(r);
  r.phase = 'voting'; r.deadline = Date.now() + ms; r.performanceEndsAt = Date.now() + Math.max(0, ms - 20000); r.votes = new Map();
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
app.get('/api/health', (_q, res) => res.json({ ok: true, rooms: rooms.size,
  voiceAdapterConfigured: !!process.env.VOICE_API_URL,
  customVoiceSynthesisAvailable: !!process.env.VOICE_API_URL,
  recordings: loadVoices().length,
  note: process.env.VOICE_API_URL ? 'Adapter configured; actual synthesis must be tested' : 'No voice cloning engine configured; browser speech only'
}));

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

// ---- MC Library: admin-managed; custom recordings remain server-side ----
app.get('/api/mcs', requireAdmin, (_req,res) => res.json(mcLibrary()));
app.patch('/api/mcs/:id', requireAdmin, (req,res) => {
  const id = String(req.params.id);
  const name = safe(req.body?.name, 30);
  const emoji = safe(req.body?.emoji, 12);
  const enabled = req.body?.enabled;
  if (!name || !emoji || typeof enabled !== 'boolean') return res.status(400).json({error:'Name, emoji and enabled required'});
  if (DEFAULT_MCS.some(x => x.id === id)) {
    const settings = loadMcSettings(); settings[id] = {name,emoji,enabled}; saveMcSettings(settings);
  } else {
    const voices = loadVoices(); const v = voices.find(x => x.id === id);
    if (!v) return res.status(404).json({error:'MC not found'});
    v.mcName = name; v.emoji = emoji; v.enabled = enabled; saveVoices(voices);
  }
  res.json({ok:true});
});
app.get('/api/mcs/:id/preview', requireAdmin, (req,res) => {
  const v = loadVoices().find(x => x.id === req.params.id);
  if (!v) return res.status(404).json({error:'Recording not found (presets use browser voices)'});
  res.set('Cache-Control','no-store');
  res.type('audio/wav').sendFile(path.join(VOICES_DIR, v.id + '.wav'));
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
  s.on('host:create', (data, cb) => { if (s.data.code) return error(cb, 'Already in a room'); const c = code(); const r = { code: c, host: s.id, hostConnected: true, phase: 'lobby', round: 0, maxRounds: 3, players: [], audience: [], timer: null, deadline: 0, battle: null, results: null, champion: null, votes: new Map(), beat: null, hasVoices: false, aiEnabled: false, mcCards: [], finishReason: null }; rooms.set(c, r); s.data = { code: c, role: 'host' }; s.join(c); cb?.({ ok: true, code: c, token: crypto.randomUUID() }); publish(r); });
  s.on('join', (data, cb) => { if (s.data.code) return error(cb, 'Already joined'); const r = rooms.get(safe(data?.code, 4).toUpperCase()); if (!r) return error(cb, 'Room not found'); const name = safe(data?.name, 18); if (name.length < 2) return error(cb, 'Enter a name (2–18 characters)'); if (r.phase !== 'lobby') return error(cb, 'This game has already started'); if (all(r).some(p => p.name.toLowerCase() === name.toLowerCase())) return error(cb, 'Name already taken'); const audience = r.players.length >= MAX_PLAYERS; if (audience && r.audience.length >= MAX_AUDIENCE) return error(cb, 'Room full'); const p = { id: s.id, name, robot: audience ? '👀' : '❔', score: 0, connected: true, submitted: false, lines: [], voiceId: null, voiceOwner: null }; (audience ? r.audience : r.players).push(p); s.data = { code: r.code, role: audience ? 'audience' : 'player' }; s.join(r.code); cb?.({ ok: true, id: s.id, role: s.data.role, code: r.code }); publish(r); });
  s.on('host:start', (_, cb) => { const r = rooms.get(s.data.code); if (!r || r.host !== s.id) return error(cb, 'Only host can start'); if (r.phase !== 'lobby' || r.players.length < 1) return error(cb, 'Need at least 1 player in lobby'); r.aiEnabled = !!_?.ai; if (r.players.length % 2 && r.aiEnabled) { r.players.push({ id: 'ai-' + crypto.randomUUID(), name: 'MC BYTE', robot: '❔', ai: true, score: 0, connected: true, submitted: true, lines: [], voiceId: null, voiceOwner: null }); } if (r.players.length < 2) return error(cb, 'Need 2 players, or enable AI challenger'); dealCards(r); cb?.({ ok: true }); });
  s.on('host:studio-progress', data => {
    const r = rooms.get(s.data.code);
    if (!r || r.host !== s.id || r.phase !== 'rendering') return;
    const total = Math.min(100, Math.max(0, Math.floor(Number(data?.total) || 0)));
    const done = Math.min(total, Math.max(0, Math.floor(Number(data?.done) || 0)));
    const stage = safe(data?.stage, 150);
    const model = data?.model === null || data?.model === undefined ? null : Math.min(100, Math.max(0, Math.round(Number(data.model) || 0)));
    io.to(r.code).emit('studio:progress', {done,total,stage,model});
  });
  s.on('studio:hype', () => {
    const r = rooms.get(s.data.code);
    if (!r || r.phase !== 'rendering') return;
    const now = Date.now();
    if (now - (s.data.lastHype || 0) < 750) return;
    s.data.lastHype = now;
    r.hypeCount = Math.min(9999, (r.hypeCount || 0) + 1);
    io.to(r.code).emit('studio:hype', {count:r.hypeCount});
  });
  s.on('host:rendered', (data, cb) => { const r = rooms.get(s.data.code); if (!r || r.host !== s.id || r.phase !== 'rendering') return error(cb, 'Not rendering'); const ms = Math.min(300000, Math.max(45000, (Number(data?.durationMs) || 0) + 20000)); beginVoting(r, ms); cb?.({ ok: true }); });
  s.on('submit', (data, cb) => { const r = rooms.get(s.data.code), p = r && player(r, s.id); if (!p || r.phase !== 'writing') return error(cb, 'Not writing now'); if (p.submitted) return error(cb, 'Already submitted'); if (!Array.isArray(data?.fills) || data.fills.length !== 2 || !Array.isArray(data?.customs) || data.customs.length !== 2) return error(cb, 'Fill in both words and write both bars'); const fills = data.fills.map(x => safe(x, 24)), customs = data.customs.map(x => safe(x, 100)); if (fills.some(x => x.length < 1)) return error(cb, 'Fill in both blanks'); if (customs.some(x => x.length < 3)) return error(cb, 'Both of your own bars need at least 3 characters'); const choice = Number(data?.beatChoice); if (!Number.isInteger(choice) || choice < 0 || choice > 2) return error(cb, 'Choose one of your three mystery beats'); p.beatChoice = choice; p.lines = [fillBar(p.prompts[0], fills[0]), customs[0], fillBar(p.prompts[1], fills[1]), customs[1]]; p.submitted = true; cb?.({ ok: true }); publish(r); if (r.players.every(x => x.submitted)) startBattle(r); });
  s.on('vote', (data, cb) => { const r = rooms.get(s.data.code); if (!r || r.phase !== 'voting' || s.data.role === 'host') return error(cb, 'Voting closed'); if (r.votes.has(s.id)) return error(cb, 'Already voted'); if (!r.players.some(p => p.id === data?.id) || data.id === s.id) return error(cb, 'Invalid vote'); r.votes.set(s.id, data.id); cb?.({ ok: true }); const voters = [...r.players, ...r.audience].filter(p => p.connected && !p.ai); if (r.votes.size >= voters.length && Date.now() >= r.performanceEndsAt) finishVoting(r); });
  s.on('host:next', (_, cb) => { const r = rooms.get(s.data.code); if (!r || r.host !== s.id || r.phase !== 'results') return error(cb, 'Cannot advance'); if (r.round >= r.maxRounds) { r.phase = 'finished'; r.finishedAt = Date.now(); r.champion = [...r.players].sort((a, b) => b.score - a.score)[0]?.name; publish(r); } else startRound(r); cb?.({ ok: true }); });
  s.on('disconnect', () => { const r = rooms.get(s.data.code); if (!r) return; if (s.data.role === 'host') { cleanup(r); return; } const p = all(r).find(x => x.id === s.id); if (!p) return; if (r.phase === 'lobby') { r.players = r.players.filter(x => x.id !== s.id); r.audience = r.audience.filter(x => x.id !== s.id); } else { p.connected = false; if (s.data.role === 'player' && r.phase !== 'finished') { timers(r); r.phase = 'finished'; r.deadline = 0; r.finishedAt = Date.now(); const remaining = r.players.filter(x => x.connected && !x.ai); r.champion = (remaining.sort((a,b) => b.score-a.score)[0] || r.players.find(x => x.ai))?.name || 'No winner'; r.finishReason = `${p.name} disconnected. The remaining player wins by forfeit.`; } } publish(r); });
});
setInterval(() => { for (const r of rooms.values()) if (r.phase === 'finished' && r.finishedAt && Date.now() - r.finishedAt > 3600000) cleanup(r); }, 60000).unref();
http.listen(PORT, '0.0.0.0', () => console.log(`Robo Rhyme Royale running on :${PORT}`));
