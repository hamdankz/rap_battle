const $ = id => document.getElementById(id), socket = io();
let beatChoice = null; let voiceWarnings = []; let castStatus = 'Kokoro not loaded'; let role = '', self = '', state = null, questions = [], voted = false, lastPhase = '', preparedKey = '', performedKey = '', plan = null, playing = [], timeouts = [], renderMsg = '', msPerSyl = 230, draft = { fill1: '', cus1: '', fill2: '', cus2: '' };
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
socket.on('prompt', p => { questions = p.prompts; draft = { fill1: '', cus1: '', fill2: '', cus2: '' }; beatChoice = null; render(); });
socket.on('state', s => {
  const phaseChanged = s.phase !== lastPhase; state = s;
  if (phaseChanged) { voted = false; lastPhase = s.phase; if (s.phase !== 'voting') stopShow(); }
  render();
  if (role === 'host') { if (s.phase === 'rendering') prepareBattle(s); if (s.phase === 'voting') perform(s); }
});

const castVoice = (p, players) => window.KokoroCast.voiceFor(Math.max(0, ['circuit','glitch','chrome','cosmo','volt','bolt','brain','rocket'].indexOf(players.find(x => x.id === p.id)?.mcId)));
const castLabel = (p, players) => castVoice(p, players).label;
const bot = p => `<div class="bot"><div class="face">${esc(p.robot)}</div><strong>${esc(p.name)}</strong><small>${p.score || 0} pts</small></div>`;
function render() {
  if (!state) return;
  $('roomLabel').textContent = 'ROOM ' + state.code;
  $('phaseLabel').textContent = state.phase.toUpperCase() + ' • ROUND ' + state.round + '/' + state.maxRounds;
  const c = $('content'); const players = state.players; const me = players.find(p => p.id === self); let html = '';
  if (state.phase === 'lobby') {
    html = `<div class="arena"><p>JOIN ON YOUR PHONE</p><div class="code">${state.code}</div><p>${esc(location.origin)} • Enter this room code</p><div class="roster">${players.map(bot).join('')}</div><p class="status">🎙️ 14 free Kokoro AI voices available for preset MCs. Host downloads the voice model once; custom MCs still require the separate voice adapter.</p><p>${players.length}/8 rappers • ${state.audience} audience members</p>${role === 'host' ? `<label class="ai-option"><input type="checkbox" id="aiToggle"> Add AI challenger when player count is odd</label><button id="start" ${players.length < 1 ? 'disabled' : ''}>START BATTLE</button> <button id="test" class="secondary">🔊 TEST SOUND</button>` : '<p class="status">Waiting for host to start...</p>'}</div>`;
  }
  if (state.phase === 'cards') {
    html = `<div class="arena"><h1>🃏 MYSTERY MC CARDS</h1><p>Every MC has been dealt a random card. Identities stay hidden until the rap begins!</p><div class="timer" id="timer"></div><div class="roster">${(state.mcCards || []).map((card, i) => `<div class="bot secret-card"><div class="face">${esc(card)}</div><strong>MC ???</strong><small>Card ${i + 1}</small></div>`).join('')}</div></div>`;
  }
  if (state.phase === 'writing') {
    html = `<div class="arena"><h1>✍️ WRITE 4 BARS</h1><p class="status">🎴 Choose a secret beat for YOUR rap. The style is revealed when you perform.</p><div class="timer" id="timer"></div>${role === 'player' && !me?.submitted ? barsForm() : `<p class="status">${role === 'host' ? 'Players are writing their verses...' : me?.submitted ? 'Your lyrics are locked in!' : 'Waiting for rappers...'}</p>`}<div class="roster">${players.map(p => `<div class="bot">${esc(p.robot)} MC ??? ${p.submitted ? '✅' : '✍️'}</div>`).join('')}</div></div>`;
  }
  if (state.phase === 'rendering') {
    html = `<div class="arena"><h1>🎛️ IN THE STUDIO</h1><p class="status">${role === 'host' ? 'Recording the mystery voices over the beat…' : 'The host is mixing the battle. Hang tight!'}</p><p class="muted" id="renderProgress">${esc(renderMsg)}</p><div class="roster">${players.map(p => `<div class="bot">${esc(p.robot)} MC ???</div>`).join('')}</div></div>`;
  }
  if (state.phase === 'voting') {
    html = `<div class="arena"><h1>🎤 THE RAP SHOWDOWN</h1><p class="status">🎴 Every MC chose a secret beat — watch each style reveal!</p><div class="timer" id="timer"></div><div class="battle">${(state.battle || []).map(p => `<div class="bot"><div class="face">${esc(p.robot)}</div><strong>${esc(p.name)}</strong><small>🥁 ${esc(p.beat?.name || 'Boom Bap')} • 🎙️ ${esc(castLabel(p, players))}</small><div class="lyrics">${p.lines.map((l, i) => `<p data-k="${esc(p.id)}:${i}">${esc(l)}</p>`).join('')}</div></div>`).join('')}</div>${role === 'host' ? `<p class="muted">Turn up the sound! Players vote on their phones.</p>${Beat.ctx && Beat.ctx.state !== 'running' ? '<button id="unmute">🔊 TAP TO ENABLE SOUND</button>' : ''}` : voted ? '<p class="status">Vote received!</p>' : `<p>VOTE FOR YOUR FAVORITE (NOT YOURSELF)</p><div class="votegrid">${players.filter(p => p.id !== self).map(p => `<button data-vote="${esc(p.id)}">${esc(p.robot)} ${esc(p.name)}</button>`).join('')}</div>`}</div>`;
  }
  if (state.phase === 'results') {
    const sorted = [...players].sort((a, b) => (state.results?.[b.id] || 0) - (state.results?.[a.id] || 0));
    html = `<div class="arena"><h1>🏆 ROUND RESULTS</h1><div class="roster">${sorted.map(p => `<div class="bot"><div class="face">${esc(p.robot)}</div><strong>${esc(p.name)}</strong><div class="score">${state.results?.[p.id] || 0} votes</div><small>${p.score} total points</small></div>`).join('')}</div>${role === 'host' ? '<button id="next">' + (state.round >= state.maxRounds ? 'CROWN THE CHAMPION' : 'NEXT ROUND') + '</button>' : '<p>Waiting for host...</p>'}</div>`;
  }
  if (state.phase === 'finished') {
    const winner = players.find(p => p.name === state.champion);
    const reveal = state.reveal?.length ? `<h2>🎭 THE VOICE REVEAL</h2><div class="roster">${state.reveal.map(x => `<div class="bot"><div class="face">${esc(x.robot)}</div><strong>${esc(x.name)}</strong><small>was ${esc(x.voice)}'s voice</small></div>`).join('')}</div>` : '';
    html = `<div class="arena"><h1>👑 CHAMPION</h1><div class="hero">${esc(winner?.robot || '🤖')}</div><h1>${esc(state.champion)}</h1><div class="roster">${[...players].sort((a, b) => b.score - a.score).map(bot).join('')}</div>${reveal}${state.finishReason ? `<p class="status">${esc(state.finishReason)}</p>` : ''}<p>Refresh to start a new party!</p></div>`;
  }
  c.innerHTML = html;
  if ($('start')) $('start').onclick = () => { Beat.init().resume(); send('host:start', { ai: !!$('aiToggle')?.checked }); };
  if ($('next')) $('next').onclick = () => send('host:next', {});
  if ($('submit')) $('submit').onclick = () => send('submit', { fills: [draft.fill1, draft.fill2], customs: [draft.cus1, draft.cus2], beatChoice }, () => { });
  c.querySelectorAll('[data-beat-choice]').forEach(b => b.onclick = () => { beatChoice = Number(b.dataset.beatChoice); render(); });
  ['fill1', 'cus1', 'fill2', 'cus2'].forEach(k => { const el = $(k); if (el) el.oninput = () => { draft[k] = el.value; updateSyl(); }; });
  updateSyl();
  if ($('test')) $('test').onclick = async () => { Beat.init(); await Beat.ctx.resume(); const btn = $('test'); btn.disabled = true; btn.textContent = '⏳ LOADING VOICE…'; try { const blob = await KokoroCast.speakWav('Sound check. One, two. Welcome to Robo Rhyme Royale.', KokoroCast.CAST[0].id); const buffer = await Beat.ctx.decodeAudioData(await blob.arrayBuffer()); const t = Beat.start('Boom Bap', Beat.ctx.currentTime + 0.2); const src = Beat.ctx.createBufferSource(); src.buffer = buffer; src.connect(Beat.vocal); src.start(t); setTimeout(() => Beat.stop(), (buffer.duration + 0.5) * 1000); btn.textContent = '🔊 TEST SOUND AGAIN'; } catch (e) { btn.textContent = '⚠ KOKORO FAILED — RETRY AFTER RELOAD'; alert('Kokoro could not load: ' + e.message); } finally { btn.disabled = false; } };
  if ($('unmute')) $('unmute').onclick = () => { Beat.ctx.resume(); $('unmute').remove(); };
  c.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => send('vote', { id: b.dataset.vote }, () => { voted = true; render(); }));
  tick();
}
function tick() { const el = $('timer'); if (el && state?.deadline) el.textContent = Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)) + 's remaining'; }
setInterval(tick, 500);

// ---------- Syllables: live counter on the writing screen, and bar fitting for speech ----------
const syl = w => { w = w.toLowerCase().replace(/[^a-z]/g, ''); if (!w) return 0; if (w.length <= 3) return 1; w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, ''); const m = w.match(/[aeiouy]{1,2}/g); return Math.max(1, m ? m.length : 1); };
const countSyl = t => String(t || '').split(/\s+/).reduce((n, w) => n + syl(w), 0);
const barSecOf = st => st.lineBars * 240 / st.bpm; // seconds in ONE rapped bar
function sylTarget() { const st = state?.beat; return st ? Math.round(barSecOf(st) * 4.5) : 12; }
function barsForm() {
  const q = i => String(questions[i] || 'Say a word ___');
  const row = i => `<div class="prompt">BAR ${i * 2 + 1} • FILL IN THE LAST WORD</div><div class="fillrow"><span>${esc(q(i).replace(/\s*___\s*$/, '').replace('___', '…'))}</span><input id="fill${i + 1}" maxlength="24" autocomplete="off" placeholder="word" value="${esc(draft['fill' + (i + 1)])}"></div><div class="syl" id="syl-fill${i + 1}"></div><div class="prompt">BAR ${i * 2 + 2} • WRITE YOUR OWN BAR</div><textarea id="cus${i + 1}" maxlength="100" placeholder="Rhyme with your word…">${esc(draft['cus' + (i + 1)])}</textarea><div class="syl" id="syl-cus${i + 1}"></div>`;
  return `<p>Choose one mystery beat card. You won't know the style until your robot performs!</p><div class="beat-cards">${['A','B','C'].map((x,i)=>`<button type="button" class="beat-card ${beatChoice===i?'chosen':''}" data-beat-choice="${i}" aria-pressed="${beatChoice===i}">🎴<span>BEAT ${x}</span><small>${beatChoice===i?'✓ Selected':'Mystery style'}</small></button>`).join('')}</div><p>Two rounds of: fill in the last word, then write a bar that rhymes with it.</p>${row(0)}${row(1)}<button id="submit" ${beatChoice===null?'disabled':''}>LOCK IN LYRICS</button>`;
}
function updateSyl() {
  const t = sylTarget();
  [['fill1', 0], ['cus1', null], ['fill2', 1], ['cus2', null]].forEach(([k, qi]) => {
    const el = $('syl-' + k); if (!el) return;
    const text = qi === null ? draft[k] : String(questions[qi] || '').replace('___', '') + ' ' + draft[k];
    const n = countSyl(text), ok = Math.abs(n - t) <= 3, near = Math.abs(n - t) <= 5;
    el.className = 'syl ' + (ok ? 'ok' : near ? 'near' : 'off');
    el.textContent = `${n} syllables • aim for ${t - 3}–${t + 3}` + (ok ? ' ✓' : n < t ? ' (a bit short)' : ' (a bit long)');
  });
  [['fill1', 'cus1'], ['fill2', 'cus2']].forEach(([f, c]) => { const el = $(c); if (el) el.placeholder = draft[f].trim() ? `Rhymes with “${draft[f].trim().split(/\s+/).pop()}”…` : 'Rhyme with your word…'; });
}

// ---------- Host only: render voices, then perform them on the beat ----------
function trimClip(buf) {
  const d = buf.getChannelData(0), th = 0.015; let a = 0, b = d.length - 1;
  while (a < b && Math.abs(d[a]) < th) a++;
  while (b > a && Math.abs(d[b]) < th) b--;
  const pad = Math.floor(buf.sampleRate * 0.03); a = Math.max(0, a - pad); b = Math.min(d.length - 1, b + pad);
  return { buf, offset: a / buf.sampleRate, dur: Math.max(0.3, (b - a) / buf.sampleRate) };
}
// Time a silent test sentence so browser speech can be rate-fitted to each bar
function calibrateSpeech() {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res();
    const text = 'one two three four five six seven eight nine ten eleven twelve'; const u = new SpeechSynthesisUtterance(text); let t0 = 0;
    u.volume = 0; u.rate = 1; u.onstart = () => { t0 = performance.now(); };
    u.onend = () => { if (t0) msPerSyl = Math.min(400, Math.max(120, (performance.now() - t0) / countSyl(text))); res(); };
    u.onerror = () => res(); speechSynthesis.speak(u); setTimeout(res, 8000);
  });
}
function speakFit(text, pitch, barSec, onstart) {
  const rate = Math.min(2, Math.max(0.6, (Math.max(1, countSyl(text)) * msPerSyl / 1000) / (barSec * 0.88)));
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.pitch = pitch; u.rate = rate; if (onstart) u.onstart = onstart; speechSynthesis.speak(u);
}
// Pick a musical phrase length of 2, 3, or 5 measures based on syllable density.
// Audio duration is the final authority: long lines get extra complete loops, never cut off.
function phraseBars(syllables) {
  const needed = Math.max(1, Math.ceil(syllables / 8));
  return [2, 3, 5].find(x => x >= needed) || 5;
}
function clipMeasureCount(clip, measureSec) {
  const phrase = phraseBars(countSyl(clip.line));
  const audioMeasures = clip.buf ? Math.ceil((clip.buf.dur + 0.2) / measureSec) : Math.ceil(countSyl(clip.line) * 0.24 / measureSec);
  return Math.max(phrase, Math.ceil(audioMeasures / phrase) * phrase);
}
function showRenderProgress(message) {
  renderMsg = message;
  if ($('renderProgress')) $('renderProgress').textContent = message;
}
async function prepareBattle(s) {
  const key = s.code + ':' + s.round;
  if (preparedKey === key) return;
  preparedKey = key; plan = null; voiceWarnings = [];
  const ctx = Beat.init(); await ctx.resume();
  const players = s.players || [];
  const total = (s.battle || []).reduce((n, p) => n + p.lines.length, 0);
  const clips = []; let n = 0; let kokoroReady = false;
  // The host downloads and loads the model only once per page session.
  try {
    await KokoroCast.ensure(progress => {
      const pct = typeof progress.progress === 'number' ? ` ${Math.round(progress.progress)}%` : '';
      showRenderProgress('Loading free Kokoro AI voices' + pct + '…');
    });
    kokoroReady = true;
  } catch (e) {
    voiceWarnings.push('Kokoro unavailable: ' + e.message);
    showRenderProgress('⚠ Kokoro failed. Using built-in speech as a fallback.');
    await calibrateSpeech();
  }
  for (const p of s.battle || []) {
    const custom = !!s.hasVoices; // Server keeps per-player custom IDs private; endpoint decides eligibility.
    const voice = castVoice(p, players);
    for (let idx = 0; idx < p.lines.length; idx++) {
      if (state?.phase !== 'rendering' || state?.code !== s.code || state?.round !== s.round) return;
      const line = p.lines[idx]; let buf = null;
      showRenderProgress(`Generating AI voice ${++n}/${total}: ${p.name} (${voice.name})`);
      // Preserve existing custom voice endpoint exactly as it was.
      if (custom && s.hasVoices) {
        try {
          const r = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: s.code, pid: p.id, text: line }) });
          if (!r.ok) throw Error('HTTP ' + r.status);
          buf = trimClip(await ctx.decodeAudioData(await r.arrayBuffer()));
        } catch (e) { voiceWarnings.push(`${p.name}: custom voice unavailable (${e.message}); using Kokoro preset.`); }
      }
      if (!buf && kokoroReady) {
        try {
          const blob = await KokoroCast.speakWav(line, voice.id);
          buf = trimClip(await ctx.decodeAudioData(await blob.arrayBuffer()));
        } catch (e) { voiceWarnings.push(`${p.name}: Kokoro failed (${e.message}); using built-in speech.`); }
      }
      clips.push({ p, idx, line, buf, voice });
    }
  }
  // Each performer owns a separate beat timeline, with a fresh one-bar intro.
  // 2/3/5-measure phrase lengths repeat until every vocal clip fits.
  let seconds = 0.5;
  const items = [], segments = [];
  for (const p of s.battle || []) {
    const st = p.beat || {name:'Boom Bap',bpm:88,lineBars:1};
    const measureSec = 240 / st.bpm;
    const startSec = seconds;
    seconds += measureSec; // one-measure instrumental intro per performer
    for (const c of clips.filter(x => x.p.id === p.id)) {
      const used = clipMeasureCount(c, measureSec);
      items.push({...c, startSec: seconds, durationSec: used * measureSec, measures: used});
      seconds += used * measureSec;
    }
    segments.push({startSec, endSec:seconds, beat:st});
  }
  plan = { key, items, segments, durationSec:seconds };

  showRenderProgress(voiceWarnings.length ? '⚠ ' + voiceWarnings[0] : 'All AI voices ready!');
  // The server controls the voting timer; account for the entire audio performance.
  socket.emit('host:rendered', { durationMs: Math.round((seconds + 1) * 1000) });
}
function perform(s) {
  if (!plan || performedKey === plan.key) return;
  performedKey = plan.key;
  const ctx = Beat.init();
  const t0 = ctx.currentTime + 0.45;
  // One transition timer per MC. The old implementation scheduled a stop and
  // a start at the same boundary, so the previous MC's stop could silence
  // the next MC. Beat.start() itself stops the previous beat scheduler.
  for (const seg of plan.segments) {
    const switchAt = t0 + seg.startSec;
    timeouts.push(setTimeout(() => {
      Beat.start(seg.beat.name, Math.max(ctx.currentTime + 0.08, switchAt));
    }, Math.max(0, (switchAt - ctx.currentTime - 0.08) * 1000)));
  }
  // Stop only after the FINAL performance, never between opponents.
  const finalEnd = t0 + plan.durationSec;
  timeouts.push(setTimeout(() => Beat.stop(), Math.max(0, (finalEnd - ctx.currentTime) * 1000)));
  for (const it of plan.items) {
    const when = t0 + it.startSec;
    const delay = Math.max(0, (when - ctx.currentTime) * 1000);
    if (it.buf) {
      const src = ctx.createBufferSource(); src.buffer = it.buf.buf; src.connect(Beat.vocal);
      src.start(Math.max(when, ctx.currentTime + 0.02), it.buf.offset, it.buf.dur);
      playing.push(src);
    } else if ('speechSynthesis' in window) {
      timeouts.push(setTimeout(() => speakFit(it.line, it.p.robot === '👾' ? 0.65 : 1.3, it.durationSec), delay));
    }
    timeouts.push(setTimeout(() => {
      document.querySelectorAll('.lyrics p.now').forEach(e => e.classList.remove('now'));
      document.querySelectorAll('[data-k]').forEach(e => { if (e.getAttribute('data-k') === `${it.p.id}:${it.idx}`) e.classList.add('now'); });
    }, delay));
  }
  if (voiceWarnings.length) {
    const notice = document.createElement('p'); notice.className = 'status';
    notice.textContent = '⚠ ' + voiceWarnings[0]; $('content')?.prepend(notice);
  }
}
function stopShow() {
  playing.forEach(x => { try { x.stop(); } catch { } }); playing = [];
  timeouts.forEach(clearTimeout); timeouts = [];
  Beat.stop(); window.speechSynthesis?.cancel();
}
