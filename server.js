import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import crypto from 'node:crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app=express(); const http=createServer(app); const io=new Server(http,{maxHttpBufferSize:12000, cors:{origin:false}});
const PORT=Number(process.env.PORT||3000); const rooms=new Map(); const MAX_PLAYERS=8; const MAX_AUDIENCE=30;
const prompts=['I rolled into the club with a pocket of ___','Your robot is so rusty it smells like ___','My rhymes hit harder than a flying ___','I stole your batteries and bought a ___','My circuits are hotter than a ___','You call that a rap? Sounds like a ___','I upgraded my brain with a giant ___','Your dance moves look like a broken ___'];
const safe=(s,n=80)=>String(s??'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,n);
const code=()=>{let c;do{c=Array.from(crypto.randomBytes(4),x=>'ABCDEFGHJKLMNPQRSTUVWXYZ'[x%24]).join('')}while(rooms.has(c));return c};
const player=(r,id)=>r.players.find(p=>p.id===id);
const all=(r)=>[...r.players,...r.audience];
const publish=r=>{io.to(r.code).emit('state', {code:r.code,phase:r.phase,round:r.round,maxRounds:r.maxRounds,hostConnected:r.hostConnected,players:r.players.map(({id,name,robot,score,connected,submitted})=>({id,name,robot,score,connected,submitted})),audience:r.audience.length,deadline:r.deadline,battle:r.battle,results:r.results,champion:r.champion});};
const error=(cb,message)=>cb?.({ok:false,error:message});
const timers=r=>{clearTimeout(r.timer);r.timer=null};
const cleanup=r=>{timers(r);rooms.delete(r.code);io.to(r.code).emit('closed');};
function startRound(r){timers(r);r.round++;r.phase='writing';r.deadline=Date.now()+90000;r.results=null;r.battle=null;for(const p of r.players){p.submitted=false;p.lines=[];io.to(p.id).emit('prompt',{prompts:[prompts[(r.round*3+r.players.indexOf(p))%prompts.length],prompts[(r.round*3+r.players.indexOf(p)+4)%prompts.length]]});}publish(r);r.timer=setTimeout(()=>startBattle(r),90000)}
function startBattle(r){if(r.phase!=='writing')return;timers(r);r.phase='voting';r.deadline=Date.now()+65000;const entries=r.players.map(p=>({id:p.id,name:p.name,robot:p.robot,lines:p.lines?.length===2?p.lines:['My circuits crackle with a thunderous beat','Your rhymes are weak, accept defeat']}));r.battle=entries;r.votes=new Map();publish(r);r.timer=setTimeout(()=>finishVoting(r),65000)}
function finishVoting(r){if(r.phase!=='voting')return;timers(r);const tally=Object.fromEntries(r.players.map(p=>[p.id,0]));for(const id of r.votes.values())if(id in tally)tally[id]++;for(const p of r.players)p.score+=(tally[p.id]||0)*100;r.results=tally;r.phase='results';r.deadline=0;publish(r)}
app.use(helmet({contentSecurityPolicy:false}));app.use(express.json({limit:'8kb'}));app.use('/api',rateLimit({windowMs:60_000,limit:120,standardHeaders:'draft-7',legacyHeaders:false}));
app.get('/api/health',(_q,res)=>res.json({ok:true,rooms:rooms.size,voice:!!process.env.VOICE_API_URL}));
// Optional trusted server-to-server voice adapter. Configure endpoint that accepts {text,voice} and returns audio bytes.
app.post('/api/voice',async(req,res)=>{const url=process.env.VOICE_API_URL;if(!url)return res.status(503).json({error:'Voice adapter not configured'});const text=safe(req.body?.text,300);if(!text)return res.status(400).end();try{const target=new URL(url);if(!['http:','https:'].includes(target.protocol))throw Error('Invalid URL');const response=await fetch(target,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.VOICE_API_KEY?{'Authorization':`Bearer ${process.env.VOICE_API_KEY}`}:{})},body:JSON.stringify({text,voice:safe(req.body?.voice,32)||'default'}),signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error(`Voice service HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>5_000_000)throw Error('Audio too large');res.type(response.headers.get('content-type')?.startsWith('audio/')?response.headers.get('content-type'):'audio/wav').send(bytes)}catch(e){res.status(502).json({error:'Voice generation unavailable',detail:String(e.message).slice(0,120)})}});
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)),'public')));
io.on('connection',s=>{
 s.on('host:create',(data,cb)=>{if(s.data.code)return error(cb,'Already in a room');const c=code();const r={code:c,host:s.id,hostConnected:true,phase:'lobby',round:0,maxRounds:3,players:[],audience:[],timer:null,deadline:0,battle:null,results:null,champion:null,votes:new Map()};rooms.set(c,r);s.data={code:c,role:'host'};s.join(c);cb?.({ok:true,code:c,token:crypto.randomUUID()});publish(r)});
 s.on('join',(data,cb)=>{if(s.data.code)return error(cb,'Already joined');const r=rooms.get(safe(data?.code,4).toUpperCase());if(!r)return error(cb,'Room not found');const name=safe(data?.name,18);if(name.length<2)return error(cb,'Enter a name (2–18 characters)');if(r.phase!=='lobby')return error(cb,'This game has already started');if(all(r).some(p=>p.name.toLowerCase()===name.toLowerCase()))return error(cb,'Name already taken');const audience=r.players.length>=MAX_PLAYERS;if(audience&&r.audience.length>=MAX_AUDIENCE)return error(cb,'Room full');const p={id:s.id,name,robot:audience?'👀':['🤖','👾','🦾','🛸','⚡','🔩','🧠','🚀'][r.players.length],score:0,connected:true,submitted:false,lines:[]};(audience?r.audience:r.players).push(p);s.data={code:r.code,role:audience?'audience':'player'};s.join(r.code);cb?.({ok:true,id:s.id,role:s.data.role,code:r.code});publish(r)});
 s.on('host:start',(_,cb)=>{const r=rooms.get(s.data.code);if(!r||r.host!==s.id)return error(cb,'Only host can start');if(r.phase!=='lobby'||r.players.length<2)return error(cb,'Need at least 2 players in lobby');startRound(r);cb?.({ok:true})});
 s.on('submit',(data,cb)=>{const r=rooms.get(s.data.code),p=r&&player(r,s.id);if(!p||r.phase!=='writing')return error(cb,'Not writing now');if(p.submitted)return error(cb,'Already submitted');if(!Array.isArray(data?.lines)||data.lines.length!==2)return error(cb,'Submit two lines');const lines=data.lines.map(x=>safe(x,130));if(lines.some(x=>x.length<3))return error(cb,'Both lines need at least 3 characters');p.lines=lines;p.submitted=true;cb?.({ok:true});publish(r);if(r.players.every(x=>x.submitted))startBattle(r)});
 s.on('vote',(data,cb)=>{const r=rooms.get(s.data.code);if(!r||r.phase!=='voting'||s.data.role==='host')return error(cb,'Voting closed');if(r.votes.has(s.id))return error(cb,'Already voted');if(!r.players.some(p=>p.id===data?.id)||data.id===s.id)return error(cb,'Invalid vote');r.votes.set(s.id,data.id);cb?.({ok:true});const voters=[...r.players,...r.audience].filter(p=>p.connected);if(r.votes.size>=voters.length-Number(r.players.some(p=>!p.connected)))finishVoting(r)});
 s.on('host:next',(_,cb)=>{const r=rooms.get(s.data.code);if(!r||r.host!==s.id||r.phase!=='results')return error(cb,'Cannot advance');if(r.round>=r.maxRounds){r.phase='finished';r.champion=[...r.players].sort((a,b)=>b.score-a.score)[0]?.name;publish(r)}else startRound(r);cb?.({ok:true})});
 s.on('disconnect',()=>{const r=rooms.get(s.data.code);if(!r)return;if(s.data.role==='host'){cleanup(r);return}const p=all(r).find(x=>x.id===s.id);if(!p)return;if(r.phase==='lobby'){r.players=r.players.filter(x=>x.id!==s.id);r.audience=r.audience.filter(x=>x.id!==s.id)}else p.connected=false;publish(r)})
});
setInterval(()=>{for(const r of rooms.values())if(r.phase==='finished'&&r.finishedAt&&Date.now()-r.finishedAt>3600000)cleanup(r)},60000).unref();
http.listen(PORT,'0.0.0.0',()=>console.log(`Robo Rhyme Royale running on :${PORT}`));
