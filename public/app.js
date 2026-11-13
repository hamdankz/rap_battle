const $ = id => document.getElementById(id), socket = io();
let role = '', self = '', state = null, questions = [], voted = false, lastPhase = '', preparedKey = '', performedKey = '', plan = null, playing = [], timeouts = [], renderMsg = '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const show = id => { for (const x of ['home', 'join', 'game']) $(x).classList.toggle('hidden', x !== id); };
const send = (event, data, ok) => socket.emit(event, data, r => { if (!r?.ok) return alert(r?.error || 'Server error'); ok?.(r); });

// Host click creates the AudioContext (browsers only allow audio after a tap)
$('hostBtn').onclick = () => { Beat.init(); send('host:create', {}, () => { role = 'host'; show('game'); }); };
$('joinBtn').onclick = () => show('join');
$('backBtn').onclick = () => show('home');
$('enterBtn').onclick = () => send('join', { code: $('roomInput').value, name: $('nameInput').value }, r => { role = r.role; self = r.id; show('game'); });
socket.on('disconnect', () => { if (role) alert('Connection lost. Reload to create or join a new game.'); });
socket.on('closed', () => { alert('The host closed this room.'); location.reload(); });
socket.on('prompt', p => { questions = p.prompts; render(); });
socket.on('state', s => {
  const phaseChanged = s.phase !== lastPhase; state = s;
  if (phaseChanged) { voted = false; lastPhase = s.phase; if (s.phase !== 'voting') stopShow(); }
  render();
  if (role === 'host') { if (s.phase === 'rendering') prepareBattle(s); if (s.phase === 'voting') perform(s); }
});

const bot = p => `<div class="bot"><div class="face">${esc(p.robot)}</div><strong>${esc(p.name)}</strong><small>${p.score || 0} pts</small></div>`;
function render() {
  if (!state) return;
  $('roomLabel').textContent = 'ROOM ' + state.code;
  $('phaseLabel').textContent = state.phase.toUpperCase() + ' • ROUND ' + state.round + '/' + state.maxRounds;
  const c = $('content'); const players = state.players; const me = players.find(p => p.id === self); let html = '';
  if (state.phase === 'lobby') {
    html = `<div class="arena"><p>JOIN ON YOUR PHONE</p><div class="code">${state.code}</div><p>${esc(location.origin)} • Enter this room code</p><div class="roster">${players.map(bot).join('')}</div><p>${players.length}/8 rappers • ${state.audience} audience members</p>${role === 'host' ? `<button id="start" ${players.length < 2 ? 'disabled' : ''}>START BATTLE</button>` : '<p class="status">Waiting for host to start...</p>'}</div>`;
  }
  if (state.phase === 'writing') {
    html = `<div class="arena"><h1>✍️ WRITE YOUR BARS</h1><p class="status">🥁 Beat this round: ${esc(state.beat?.name || '')}</p><div class="timer" id="timer"></div>${role === 'player' && !me?.submitted ? `<p>Complete two lines. Keep each one short enough to rap in 2 bars!</p><div class="prompt">${esc(questions[0] || 'Drop your first rap line')}</div><textarea id="line1" maxlength="130" placeholder="Your first rap line..."></textarea><div class="prompt">${esc(questions[1] || 'Drop your second rap line')}</div><textarea id="line2" maxlength="130" placeholder="Your second rap line..."></textarea><button id="submit">LOCK IN LYRICS</button>` : `<p class="status">${role === 'host' ? 'Players are writing their verses...' : me?.submitted ? 'Your lyrics are locked in!' : 'Waiting for rappers...'}</p>`}<div class="roster">${players.map(p => `<div class="bot">${esc(p.robot)} ${esc(p.name)} ${p.submitted ? '✅' : '✍️'}</div>`).join('')}</div></div>`;
  }
  if (state.phase === 'rendering') {
    html = `<div class="arena"><h1>🎛️ IN THE STUDIO</h1><p class="status">${role === 'host' ? 'Recording the mystery voices over the beat…' : 'The host is mixing the battle. Hang tight!'}</p><p class="muted" id="renderProgress">${esc(renderMsg)}</p><div class="roster">${players.map(p => `<div class="bot">${esc(p.robot)} ${esc(p.name)}</div>`).join('')}</div></div>`;
  }
  if (state.phase === 'voting') {
    html = `<div class="arena"><h1>🎤 THE RAP SHOWDOWN</h1><p class="status">🥁 ${esc(state.beat?.name || '')}</p><div class="timer" id="timer"></div><div class="battle">${(state.battle || []).map(p => `<div class="bot"><div class="face">${esc(p.robot)}</div><strong>${esc(p.name)}</strong>${state.hasVoices ? '<small>🎭 mystery voice</small>' : ''}<div class="lyrics">${p.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div></div>`).join('')}</div>${role === 'host' ? '<p class="muted">Turn up the sound! Players vote on their phones.</p>' : voted ? '<p class="status">Vote received!</p>' : `<p>VOTE FOR YOUR FAVORITE (NOT YOURSELF)</p><div class="votegrid">${players.filter(p => p.id !== self).map(p => `<button data-vote="${esc(p.id)}">${esc(p.robot)} ${esc(p.name)}</button>`).join('')}</div>`}</div>`;
  }
  if (state.phase === 'results') {
    const sorted = [...players].sort((a, b) => (state.results?.[b.id] || 0) - (state.results?.[a.id] || 0));
    html = `<div class="arena"><h1>🏆 ROUND RESULTS</h1><div class="roster">${sorted.map(p => `<div class="bot"><div class="face">${esc(p.robot)}</div><strong>${esc(p.name)}</strong><div class="score">${state.results?.[p.id] || 0} votes</div><small>${p.score} total points</small></div>`).join('')}</div>${role === 'host' ? '<button id="next">' + (state.round >= state.maxRounds ? 'CROWN THE CHAMPION' : 'NEXT ROUND') + '</button>' : '<p>Waiting for host...</p>'}</div>`;
  }
  if (state.phase === 'finished') {
    const winner = players.find(p => p.name === state.champion);
    const reveal = state.reveal?.length ? `<h2>🎭 THE VOICE REVEAL</h2><div class="roster">${state.reveal.map(x => `<div class="bot"><div class="face">${esc(x.robot)}</div><strong>${esc(x.name)}</strong><small>was ${esc(x.voice)}'s voice</small></div>`).join('')}</div>` : '';
    html = `<div class="arena"><h1>👑 CHAMPION</h1><div class="hero">${esc(winner?.robot || '🤖')}</div><h1>${esc(state.champion)}</h1><div class="roster">${[...players].sort((a, b) => b.score - a.score).map(bot).join('')}</div>${reveal}<p>Refresh to start a new party!</p></div>`;
  }
  c.innerHTML = html;
  if ($('start')) $('start').onclick = () => { Beat.init().resume(); send('host:start', {}); };
  if ($('next')) $('next').onclick = () => send('host:next', {});
  if ($('submit')) $('submit').onclick = () => send('submit', { lines: [$('line1').value, $('line2').value] }, () => { });
  c.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => send('vote', { id: b.dataset.vote }, () => { voted = true; render(); }));
  tick();
}
function tick() { const el = $('timer'); if (el && state?.deadline) el.textContent = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) + 's remaining'; }
setInterval(tick, 500);

// ---------- Host only: render voices, then perform them on the beat ----------
function trimClip(buf) {
  const d = buf.getChannelData(0), th = 0.015; let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < th) a++;
  while (b > a && Math.abs(d[b]) < th) b--;
  const pad = Math.floor(buf.sampleRate * 0.03); a = Math.max(0, a - pad); b = Math.min(d.length - 1, b + pad);
  return { buf, offset: a / buf.sampleRate, dur: Math.max(0.3, (b - a) / buf.sampleRate) };
}
async function prepareBattle(s) {
  const key = s.code + ':' + s.round; if (preparedKey === key) return; preparedKey = key; plan = null;
  const ctx = Beat.init(); await ctx.resume();
  const clips = [], total = (s.battle || []).length * 2; let n = 0;
  for (const p of s.battle || []) for (const line of p.lines) {
    renderMsg = `Recording line ${++n} of ${total}…`; if ($('renderProgress')) $('renderProgress').textContent = renderMsg;
    let buf = null;
    if (s.hasVoices) {
      try {
        const r = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: s.code, pid: p.id, text: line }) });
        if (r.ok) buf = trimClip(await ctx.decodeAudioData(await r.arrayBuffer()));
      } catch { /* falls back to browser speech */ }
    }
    clips.push({ p, line, buf });
  }
  // Lay every line on the bar grid: bar 0 is an instrumental intro; each line gets whole bars.
  const st = s.beat, bar = 240 / st.bpm; let bars = 1; const items = [];
  for (const c of clips) {
    if (c.buf) {
      const target = st.lineBars * bar * 0.92;
      const rate = Math.min(1.3, Math.max(0.85, c.buf.dur / target)); // speed up/slow down to fit the bars
      const used = Math.max(st.lineBars, Math.ceil(c.buf.dur / rate / bar));
      items.push({ ...c, startBar: bars, rate }); bars += used;
    } else { items.push({ ...c, startBar: bars, fallback: true }); bars += st.lineBars; }
  }
  plan = { key, items, beat: st, bar };
  socket.emit('host:rendered', { durationMs: Math.round((bars + 1) * bar * 1000) });
}
function perform(s) {
  if (!plan || performedKey === plan.key) return; performedKey = plan.key;
  const ctx = Beat.init(); const t0 = Beat.start(plan.beat.name);
  for (const it of plan.items) {
    const when = t0 + it.startBar * plan.bar;
    if (it.buf) {
      const src = ctx.createBufferSource(); src.buffer = it.buf.buf; src.playbackRate.value = it.rate; src.connect(Beat.vocal);
      src.start(when, it.buf.offset, it.buf.dur); playing.push(src);
    } else if ('speechSynthesis' in window) {
      timeouts.push(setTimeout(() => { const u = new SpeechSynthesisUtterance(it.line); u.pitch = it.p.robot === '👾' ? 0.65 : 1.3; u.rate = 1.05; speechSynthesis.speak(u); }, Math.max(0, (when - ctx.currentTime) * 1000)));
    }
  }
}
function stopShow() {
  playing.forEach(x => { try { x.stop(); } catch { } }); playing = [];
  timeouts.forEach(clearTimeout); timeouts = [];
  Beat.stop(); window.speechSynthesis?.cancel();
}
