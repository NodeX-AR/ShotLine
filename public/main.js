(function(){
'use strict';
const $=id=>document.getElementById(id);
if(!window.THREE){$('playMulti').disabled=$('playSolo').disabled=true;$('menu').insertAdjacentHTML('beforeend','<p class="note" style="color:#ff8a8a">The 3D engine failed to load.</p>');return;}

/* ============ KEYBINDINGS ============ */
const DEFAULT_BINDS={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',jump:'Space',sprint:'ShiftLeft',reload:'KeyR',ads:'Mouse2',fire:'Mouse0',chat:'Enter',leaderboard:'Tab',w1:'Digit1',w2:'Digit2'[...]
let BINDS=Object.assign({},DEFAULT_BINDS);
try{const s=localStorage.getItem('shotline.binds');if(s)BINDS=Object.assign({},DEFAULT_BINDS,JSON.parse(s));}catch(e){}
function saveBinds(){try{localStorage.setItem('shotline.binds',JSON.stringify(BINDS));}catch(e){}}
function prettyKey(code){if(!code)return '—';if(code==='Space')return 'Space';if(code==='Enter')return 'Enter';if(code==='Tab')return 'Tab';if(code==='ShiftLeft'||code==='ShiftRight')return 'Shift';[...]
const keys={};
function isDown(action){return !!keys[BINDS[action]];}
document.querySelectorAll('.tab-btn').forEach(btn=>{btn.addEventListener('click',()=>{const tab=btn.dataset.tab;document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b===btn));d[...]
(function(){const btns=document.querySelectorAll('.bind-key');let listening=null;
  function refresh(){btns.forEach(b=>{b.textContent=prettyKey(BINDS[b.dataset.bind]);});}
  btns.forEach(btn=>{btn.addEventListener('click',e=>{e.preventDefault();if(listening)listening.classList.remove('listening');listening=btn;btn.classList.add('listening');btn.textContent='Press…';
    const cleanup=()=>{document.removeEventListener('keydown',cap,true);document.removeEventListener('mousedown',cap,true);if(listening){listening.classList.remove('listening');listening=null;}refresh[...]
    const cap=(ev)=>{ev.preventDefault();ev.stopPropagation();if(ev.type==='keydown'&&ev.key==='Escape'){cleanup();return;}let code=null;if(ev.type==='mousedown')code='Mouse'+ev.button;else if(ev.code[...]
    document.addEventListener('keydown',cap,true);document.addEventListener('mousedown',cap,true);});});
  const rb=$('resetBinds');if(rb)rb.addEventListener('click',()=>{BINDS=Object.assign({},DEFAULT_BINDS);saveBinds();refresh();});refresh();})();
try{const s=localStorage.getItem('shotline.sens');if(s)$('sens').value=s;const g=localStorage.getItem('shotline.gfx');if(g)$('gfx').value=g;const sx=localStorage.getItem('shotline.sfx');if(sx!==null)$[...]
$('resetSettings').addEventListener('click',()=>{$('sens').value=5;$('gfx').value='high';$('optSfx').checked=true;$('optChat').checked=true;try{localStorage.setItem('shotline.sens','5');localStorage.s[...]
$('sens').addEventListener('input',()=>{try{localStorage.setItem('shotline.sens',$('sens').value);}catch(e){}});
$('gfx').addEventListener('change',()=>{try{localStorage.setItem('shotline.gfx',$('gfx').value);}catch(e){}});
$('optSfx').addEventListener('change',()=>{try{localStorage.setItem('shotline.sfx',$('optSfx').checked?'1':'0');}catch(e){}});
$('optChat').addEventListener('change',()=>{try{localStorage.setItem('shotline.botchat',$('optChat').checked?'1':'0');}catch(e){}});

/* ============ CONSTANTS ============ */
const MAP=480,NUM_BOTS=17,MP_MAX=20,ADMIN_NAME='NoDeX';
const EYE=1.65,R=0.4,H=1.8,STEP=0.55,GRAV=24,BASE_FOV=80,TAU=Math.PI*2;
const SPRINT_LOCKOUT=0.4;
const isMobile=('ontouchstart' in window)||navigator.maxTouchPoints>0||(window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rnd=(a,b)=>a+Math.random()*(b-a);
function angDiff(a,b){let d=(b-a)%TAU;if(d>Math.PI)d-=TAU;if(d<-Math.PI)d+=TAU;return d;}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const L=hex=>new THREE.Color(hex).convertSRGBToLinear();
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const r2=v=>Math.round(v*100)/100,r4=v=>Math.round(v*10000)/10000;
let _lastChatAt=0;

/* ============ BOT CHAT ============ */
const BotChat=(function(){
  const PERS=['chill','toxic','friendly','tryhard','quiet'];
  const TALK={chill:0.5,toxic:0.6,friendly:0.65,tryhard:0.4,quiet:0.12};
  const pick=a=>a[(Math.random()*a.length)|0];
  let active=false,mid=0,lastAny=0,pending=0,idleT=40;
  const D={
    dieP:{chill:['nice one','ok that was clean','wp','lol ok','damn','fair enough','how did u see me'],toxic:['lucky','bro what','thats lag','tf','ok that was cheap','how','sit down next time'],friendly:['lol ok','you got me','nice play'],tryhard:['clean','good read','well played'],quiet:['gg','']},
    dieHS:{chill:['headshot lol','ok thats a headshot','ouch my head'],toxic:['headshot? sure','lucky headshot','tf'],friendly:['wow nice headshot','ow haha','clean headshot!'],tryhard:['tight aim','on point','clean'],quiet:['']},
    dieFar:{chill:['from all the way over there?','how did you hit that','long shot'],toxic:['no way you hit that','sniper camper','tf that range'],friendly:['wow what a shot','from that far?!'],tryhard:['range check','that was a read'],quiet:['']},
    dieBot:{chill:['{k} got me','ok {k} nice','who was that','ah {k}'],toxic:['{k} you rat','{k} lucky','tf {k}'],friendly:['nice one {k}','gg {k}'],tryhard:['{k} is holding that street','{k} is good there'],quiet:['']},
    dieFall:{chill:['lol i fell','forgot fall damage exists','my legs','who put a building there'],toxic:['bruh the map killed me','fall damage is so dumb','stairs are a trap lol'],friendly:['oops fell','ouch that was a long drop'],tryhard:['bad line','breaks the route'],quiet:['']},
    killP:{chill:['gg','sry','close one','lol'],toxic:['ez','sit','lmao','get good'],friendly:['gg!','sorry {p}','nt','good fight'],tryhard:['sloppy','positioning matters','clean'],quiet:['gg','']},
    pFall:{chill:['lmao fall damage','he jumped off','gravity wins','rip {p}'],toxic:['{p} jumped lol','free kill from the sky','skill issue'],friendly:['oh no {p}','ouch that was a long drop'],tryhard:['bad angle','falling off is free'],quiet:['']},
    streak:{chill:['{p} is on a run','ok {p} is cracked'],toxic:['someone stop {p}','{p} is smurfing'],friendly:['{p} is on fire!','go {p}'],tryhard:['focus {p}','{p} is the threat here'],quiet:['wow']},
    respawn:{chill:['back','ok again','round 2'],toxic:['back and angry','ok now im serious'],friendly:['hi again','lets go'],tryhard:['rotating','new plan'],quiet:['']},
    idle:['anyone know where the medkits are','the towers are a pain','stairs in the grey buildings are so long','dont jump off the tall roofs','someone is sniping from a tower','there is a medkit on the roof'],
    greet:['hey','hi all','o/','yo','sup','back for a few rounds','ready'],
    hi:['yo','hey {p}','sup','o/','hello','hey'],
    gg:['gg','wp','gg wp','ty','gg {p}'],
    insult:['lol ok','says who','rude','ok {p}','cry more','haha','ur not that good either','ok tough guy'],
    ask:['no idea','idk','maybe near the plaza?','?','try the roofs','good question','not sure honestly'],
    lag:['mine is fine','ping is ok for me','lag?','yeah a bit choppy'],
    thanks:['np','anytime','yw','np {p}'],
    generic:['lol','true','fr','same','haha','?','yeah','fair','ok'],
    called:['yeah?','what','sup','?','yo','hm?'],
    spotted:{chill:['contact','saw someone over here','enemy west','movement'],toxic:['target spotted','got eyes','found him','there he is'],friendly:['contact!','i see one','eyes on enemy'],tryhard:['enemy seen','contact','moving'],quiet:['']},
    whiff:{chill:['missed lol','so close','my aim is off'],toxic:['come on','my shots arent registering','luck'],friendly:['almost!','so close','damn'],tryhard:['adjusting','off by a hair','recalibrating'],quiet:['']},
    pressured:{chill:['getting pushed','i need help','rushed'],toxic:['bro stop camping','push me then','1v1 me'],friendly:['need backup','someone help','im pinned'],tryhard:['contact pushing','falling back'],quiet:['']},
    reload:{chill:['reloading','give me a sec','mag out'],toxic:['one sec reloading','chill chill'],friendly:['reloading!','wait wait'],tryhard:['tac reload','repositioning'],quiet:['']}
  };
  const fmt=(t,v)=>t.replace(/\{p\}/g,v&&v.p||'').replace(/\{k\}/g,v&&v.k||'').trim();
  function typo(t){if(t.length<5)return t;const i=1+((Math.random()*(t.length-3))|0);const r=Math.random();if(r<0.5)return t.slice(0,i)+t[i+1]+t[i]+t.slice(i+2);if(r<0.8)return t.slice(0,i)+t.slice(i+1)+t.slice(i+2);return t;}
  function style(t,p){if(!t)return '';if(p!=='friendly'&&p!=='tryhard'&&Math.random()<0.8)t=t.toLowerCase();if(Math.random()<0.7)t=t.replace(/[.!]+$/,'');if(p!=='friendly'&&Math.random()<0.25)t=typo(t);return t.trim();}
  function say(bot,text){if(!active||!text)return;text=style(text,bot.persona);if(!text)return;if(pending>=3)return;pending++;const my=mid;const delay=700+text.length*80+Math.random()*1500;setTimeout(()=>{if(my!==mid)return;pending=Math.max(0,pending-1);chatLine(bot.name,text);},delay);}
  const chance=(bot,mul)=>Math.random()<(TALK[bot.persona]||0.4)*(mul||1);
  const line=(cat,bot,v)=>{const pool=D[cat];const arr=Array.isArray(pool)?pool:(pool[bot.persona]||pool.chill);return fmt(pick(arr),v);};
  const anyBot=()=>{const l=botPool.filter(b=>b.isBot&&b.alive);return l.length?pick(l):null;};
  const anyBotNear=(x,z,r)=>{const l=botPool.filter(b=>b.isBot&&b.alive&&Math.hypot(b.x-x,b.z-z)<r);return l.length?pick(l):null;};
  const pn=()=>player.name;
  function reply(text){const t=text.toLowerCase();const named=botPool.find(b=>t.includes(b.name.toLowerCase()));if(named&&Math.random()<0.9){say(named,fmt(pick(D.called),{p:pn()}));return;}let pool=D.generic,p=0.45;if(/^(hi|hello|hey|yo|sup|o\/|hola)\b/.test(t)){pool=D.hi;p=0.75;}else if(/\b(gg|wp|good game|nice game)\b/.test(t)){pool=D.gg;p=0.7;}else if(/\b(noob|trash|bad|ez|easy|garbage|suck|bots?)\b/.test(t)){pool=D.insult;p=0.7;}else if(/\b(what|where|who|how)\b/.test(t)){pool=D.ask;p=0.55;}if(Math.random()>p)return;const b=anyBot();if(b)say(b,fmt(pick(pool),{p:pn()}));}
  return {persona(){return pick(PERS);},start(){active=true;mid++;pending=0;idleT=30+Math.random()*40;},stop(){active=false;mid++;},
    greetAll(){const bs=botPool.filter(b=>b.isBot);for(const b of bs)if(Math.random()<0.12)say(b,pick(D.greet));},
    event(type,c){if(!active)return;
      if(type==='death'){const b=c.bot;if(!b||!chance(b))return;if(c.cause==='fall')say(b,line('dieFall',b,{p:pn()}));else if(c.killer&&c.killer.isPlayer)say(b,line(c.head?'dieHS':(c.dist>70?'dieFar':(c.killer.isBot?'dieBot':'dieP')),b,{p:pn()}));else if(c.killer&&c.killer.isBot)say(b,line('dieBot',b,{k:c.killer.name,p:pn()}));else say(b,line('dieP',b,{p:pn()}));}
      else if(type==='kill'){const b=c.bot;if(b&&chance(b,0.8))say(b,line('killP',b,{p:pn()}));}
      else if(type==='pFall'){const b=anyBot();if(b&&Math.random()<0.8)say(b,line('pFall',b,{p:pn()}));}
      else if(type==='streak'){const b=anyBot();if(b)say(b,line('streak',b,{p:pn()}));}
      else if(type==='respawn'){const b=c.bot;if(b&&Math.random()<0.06)say(b,line('respawn',b));}
      else if(type==='chat')reply(c.text);
      else if(type==='spotted'){const b=c.bot;if(b&&Math.random()<0.55)say(b,line('spotted',b));}
      else if(type==='whiff'){const b=c.bot;if(b&&chance(b,0.6))say(b,line('whiff',b));}
      else if(type==='pressured'){const b=c.bot;if(b&&chance(b,0.7))say(b,line('pressured',b));}
      else if(type==='reload'){const b=c.bot;if(b&&chance(b,0.35))say(b,line('reload',b));}},
    tick(dt){if(!active)return;const sinceAny=(performance.now()-_lastChatAt)/1000;if(sinceAny<6){idleT=Math.max(idleT,6);return;}idleT-=dt;if(idleT<=0){idleT=25+Math.random()*35;const b=anyBot();if(b&&Math.random()<0.9)say(b,pick(D.idle));}},
    notifyChat(){_lastChatAt=performance.now();}
  };
})();

/* ============ AUDIO ============ */
let actx=null,noiseBuf=null;
function initAudio(){try{if(!actx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)actx=new AC();}if(actx&&actx.state==='suspended')actx.resume();}catch(e){actx=null;}}
function getNoise(){if(!noiseBuf){const len=Math.floor(actx.sampleRate*0.6);noiseBuf=actx.createBuffer(1,len,actx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;}return noiseBuf;}
function sfxNoise(vol,f0,f1,dur,type){if(!actx||vol<0.01)return;if($('optSfx')&&!$('optSfx').checked)return;try{const t=actx.currentTime,s=actx.createBufferSource();s.buffer=getNoise();const f=actx.createBiquadFilter();f.type='lowpass';f.frequency.setValueAtTime(f1||500,t);const g=actx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);s.connect(f);f.connect(g);g.connect(actx.destination);s.start(t);s.stop(t+dur);}catch(e){}}
function sfxTone(freq,dur,vol,type,f2){if(!actx||vol<0.01)return;if($('optSfx')&&!$('optSfx').checked)return;try{const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type=type||'sine';o.frequency.setValueAtTime(freq,t);if(f2) o.frequency.exponentialRampToValueAtTime(f2,t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+dur);}catch(e){}}
function sfxShot(kind,vol){if(kind==='shotgun'){sfxNoise(vol*0.9,3200,180,0.32);sfxTone(90,0.2,vol*0.5,'sine',40);}else if(kind==='sniper'){sfxNoise(vol,2600,120,0.55);sfxTone(70,0.35,vol*0.7,'sine',30);}else{sfxNoise(vol*0.8,2200,150,0.18);sfxTone(140,0.08,vol*0.35,'square',80);}}
const sfxHit=head=>sfxTone(head?1900:1250,0.06,0.16,'square');
const sfxKill=()=>{sfxTone(880,0.09,0.18,'triangle');setTimeout(()=>sfxTone(1320,0.14,0.18,'triangle'),80);};
const sfxHurt=()=>sfxNoise(0.3,600,120,0.18);
const sfxReload=()=>{sfxTone(300,0.05,0.12,'square');setTimeout(()=>sfxTone(210,0.07,0.12,'square'),700);};
const sfxThud=(v)=>{sfxNoise(0.25+0.3*v,500,60,0.25);sfxTone(70,0.25,0.3*v+0.1,'sine',40);};
const sfxStep=(sp)=>sfxNoise(sp?0.1:0.07,900,300,0.06);
const sfxClank=()=>sfxTone(720,0.05,0.08,'square',500);
const sfxPickup=()=>{sfxTone(520,0.1,0.15,'sine',780);};
const sfxBorder=()=>{sfxTone(220,0.15,0.12,'square',160);};

/* ============ RENDERER ============ */
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:!isMobile,powerPreference:'high-performance'});}
catch(e){$('playMulti').disabled=$('playSolo').disabled=true;$('menu').insertAdjacentHTML('beforeend','<p class="note" style="color:#ff8a8a">WebGL unavailable.</p>');return;}
renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const maxAniso=renderer.capabilities.getMaxAnisotropy?renderer.capabilities.getMaxAnisotropy():1;
renderer.setSize(window.innerWidth,window.innerHeight);renderer.autoClear=false;
$('game').appendChild(renderer.domElement);
const canvasEl=renderer.domElement;
if(isMobile)$('grain').style.display='none';
const scene=new THREE.Scene();
const FOG=0xb4a794;scene.fog=new THREE.Fog(L(FOG),70,560);
const camera=new THREE.PerspectiveCamera(BASE_FOV,window.innerWidth/window.innerHeight,0.05,900);camera.rotation.order='YXZ';scene.add(camera);
scene.add(new THREE.HemisphereLight(L(0xc9d9e8),L(0x5a5548),0.62));
const sun=new THREE.DirectionalLight(L(0xffe2b0),1.15);
const SUN_DIR=new THREE.Vector3(60,110,40).normalize();const SUN_OFF=SUN_DIR.clone().multiplyScalar(220);
sun.castShadow=true;sun.shadow.mapSize.set(1536,1536);sun.shadow.camera.near=20;sun.shadow.camera.far=520;sun.shadow.bias=-0.0008;sun.shadow.normalBias=0.08;
scene.add(sun);scene.add(sun.target);
function setShadowExtent(e){const c=sun.shadow.camera;c.left=-e;c.right=e;c.top=e;c.bottom=-e;c.updateProjectionMatrix();}
function updateSun(cx,cz){const sx=Math.round(cx),sz=Math.round(cz);sun.target.position.set(sx,0,sz);sun.position.set(sx+SUN_OFF.x,SUN_OFF.y,sz+SUN_OFF.z);}
setShadowExtent(140);
const muzzleLight=new THREE.PointLight(L(0xffb060),0,12,2);muzzleLight.position.set(0.2,-0.1,-1);camera.add(muzzleLight);
const viewScene=new THREE.Scene();
const viewCamera=new THREE.PerspectiveCamera(BASE_FOV,window.innerWidth/window.innerHeight,0.005,8);viewCamera.rotation.order='YXZ';viewScene.add(viewCamera);
viewScene.add(new THREE.HemisphereLight(L(0xdfe8f0),L(0x6a6560),0.75));
const viewKey=new THREE.DirectionalLight(L(0xfff0d8),1.0);viewKey.position.set(-0.5,0.9,0.7);viewScene.add(viewKey);
const viewRim=new THREE.DirectionalLight(L(0xffa060),0.35);viewRim.position.set(0.7,0.1,-0.4);viewScene.add(viewRim);
const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,
  uniforms:{top:{value:L(0x3d6a9c)},mid:{value:L(0xc9a882)},bot:{value:L(0xb4a794)},sunDir:{value:SUN_DIR.clone()},time:{value:0}},
  vertexShader:'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:['uniform vec3 top;uniform vec3 mid;uniform vec3 bot;uniform vec3 sunDir;uniform float time;varying vec3 vP;','float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}','float noise(vec3 p){vec3 i=floor(p);vec3 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(mix(hash(i.xy+floor(i.z*0.5)),hash(i.xy+floor(i.z*0.5)+vec2(1,0)),f.x),mix(hash(i.xy+floor(i.z*0.5)+vec2(0,1)),hash(i.xy+floor(i.z*0.5)+vec2(1,1)),f.x),f.y),mix(mix(hash(i.xy+floor(i.z*0.5)+vec2(0,0)),hash(i.xy+floor(i.z*0.5)+vec2(1,0)),f.x),mix(hash(i.xy+floor(i.z*0.5)+vec2(0,1)),hash(i.xy+floor(i.z*0.5)+vec2(1,1)),f.x),f.y),f.z);}','void main(){vec3 p=normalize(vP);float h=noise(p*12.0+time*0.07);float a=max(0.0,1.0-length(p.xy)*1.2);vec3 col=mix(mid,top,clamp(p.y*0.7+0.5,0.0,1.0));col=mix(col,bot,clamp(1.0-p.y*0.5,0.0,1.0));col=mix(col,vec3(1.0,0.78,0.56),max(0.0,1.0-length(p-sunDir))*0.6);gl_FragColor=vec4(col*(0.8+0.25*h),1.0);}'
});
const sky=new THREE.Mesh(new THREE.SphereGeometry(800,24,12),skyMat);sky.renderOrder=-10;scene.add(sky);

/* ============ HELPERS ============ */
const lamCache={};
const _cc=document.createElement('canvas').getContext('2d');
function cssToHex(s){_cc.fillStyle='#000';_cc.fillStyle=s;return parseInt(_cc.fillStyle.slice(1),16);}
function lam(c){if(typeof c==='string')c=cssToHex(c);return lamCache[c]||(lamCache[c]=new THREE.MeshLambertMaterial({color:L(c)}));}
const boxGeo=new THREE.BoxGeometry(1,1,1),cylGeo=new THREE.CylinderGeometry(1,1,1,9,1),icoGeo=new THREE.IcosahedronGeometry(1,0);
function shade(hex,f){const c=new THREE.Color(hex);c.multiplyScalar(f);return c.getHex();}
const rand=mulberry32(90210);const wr=(a,b)=>a+rand()*(b-a);const wpick=a=>a[(rand()*a.length)|0];
let DECO=false;const drand=mulberry32(31337);const dr=(a,b)=>a+drand()*(b-a);const vr=()=>DECO?drand():rand();

/* ============ TEXTURES ============ */
const trng=mulberry32(777);
function cnv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];}
function blot(g,W,Hh,n,r0,r1,rgb,a0,a1){for(let i=0;i<n;i++){const x=trng()*W,y=trng()*Hh,r=r0+trng()*(r1-r0),a=a0+trng()*(a1-a0);for(const ox of[-W,0,W])for(const oy of[-Hh,0,Hh]){const gr=g.createRadialGradient(x,y,0,x,y,r);gr.addColorStop(0,'rgba('+rgb+','+a+')');gr.addColorStop(1,'rgba('+rgb+','+0+')');g.fillStyle=gr;g.fillRect(x-r,y-r,r*2,r*2);}}}
function spk(g,W,Hh,n,rgb,a0,a1){for(let i=0;i<n;i++){g.fillStyle='rgba('+rgb+','+(a0+trng()*(a1-a0))+')';g.fillRect(trng()*W,trng()*Hh,1+trng()*1.5,1+trng()*1.5);}}
function streaks(g,W,Hh,n){for(let i=0;i<n;i++){const x=trng()*W,w=2+trng()*8,len=40+trng()*120,y=trng()*Hh;const gr=g.createLinearGradient(0,y,0,y+len);gr.addColorStop(0,'rgba(60,50,40,0)');gr.addColorStop(0.3,'rgba(60,50,40,0.18)');gr.addColorStop(1,'rgba(60,50,40,0)');g.fillStyle=gr;g.fillRect(x,y,w,len);}}
function cracks(g,W,Hh,n){g.strokeStyle='rgba(30,25,20,0.35)';g.lineWidth=1;for(let i=0;i<n;i++){let x=trng()*W,y=trng()*Hh;g.beginPath();g.moveTo(x,y);for(let j=0;j<6;j++){x+=(trng()-0.5)*26;y+=trng()*18-9;g.lineTo(x,y);}g.stroke();}}
function tPlaster(){const [c,g]=cnv(256,256);g.fillStyle='#d8d4cb';g.fillRect(0,0,256,256);blot(g,256,256,30,20,60,'120,110,95',0.03,0.09);blot(g,256,256,20,10,30,'255,255,255',0.04,0.09);streaks(g,256,256,18);return c;}
function paintBrick(g,W,Hh){g.fillStyle='#d9d4ca';g.fillRect(0,0,W,Hh);for(let r=0;r*8<Hh;r++){const off=(r%2)*12;for(let x=-24;x<W;x+=24){const l=54+trng()*30;g.fillStyle='hsl(18,'+((6+trng()*10)|0)+'%, '+(52+trng()*12|0)+'%)';g.fillRect(x+off, r*8, 12, 8);g.fillStyle='rgba(255,255,255,0.12)';g.fillRect(x+off+2, r*8+2, 5, 2);}}}
function tBrick(){const [c,g]=cnv(256,256);paintBrick(g,256,256);blot(g,256,256,24,20,50,'40,30,25',0.05,0.13);streaks(g,256,256,10);return c;}
function tConcrete(){const [c,g]=cnv(256,256);g.fillStyle='#bdbbb4';g.fillRect(0,0,256,256);blot(g,256,256,36,15,60,'90,90,85',0.05,0.12);blot(g,256,256,20,10,40,'255,255,255',0.05,0.1);streaks(g,256,256,18);cracks(g,256,256,18);return c;}
function tRoof(){const [c,g]=cnv(256,256);g.fillStyle='#8b8883';g.fillRect(0,0,256,256);blot(g,256,256,40,10,40,'20,20,20',0.08,0.2);spk(g,256,256,4000,'255,255,255',0.1,0.3);spk(g,256,256,3000,'0,0,0',0.12,0.25);return c;}
function tMetal(){const [c,g]=cnv(256,128);for(let x=0;x<256;x+=16){g.fillStyle='#b9b9b9';g.fillRect(x,0,8,128);g.fillStyle='#8f8f8f';g.fillRect(x+8,0,8,128);}streaks(g,256,128,14);blot(g,256,128,14,1,3,'0,0,0',0.08,0.2);return c;}
function tWood(){const [c,g]=cnv(128,128);for(let y=0;y<128;y+=16){g.fillStyle='hsl(30,'+(20+trng()*12|0)+'%,'+(50+trng()*16|0)+'%)';g.fillRect(0,y,128,15);g.fillStyle='rgba(0,0,0,0.3)';g.fillRect(0,y+8,128,2);}return c;}
function tPave(){const [c,g]=cnv(256,256);g.fillStyle='#aaa7a0';g.fillRect(0,0,256,256);blot(g,256,256,26,15,50,'70,70,60',0.05,0.12);g.strokeStyle='rgba(40,40,35,0.55)';g.lineWidth=2;for(let i=0;i<=20;i++){const y=i*12;g.beginPath();g.moveTo(0,y+trng()*3);g.lineTo(256,y+3+trng()*3);g.stroke();}return c;}
function tAsphalt(){const [c,g]=cnv(256,256);g.fillStyle='#3d3d3f';g.fillRect(0,0,256,256);blot(g,256,256,40,20,60,'0,0,0',0.05,0.16);blot(g,256,256,20,15,40,'90,90,90',0.03,0.08);spk(g,256,256,4000,'255,255,255',0.04,0.16);return c;}
function tRoad(){const [c,g]=cnv(64,256);g.fillStyle='#3b3b3d';g.fillRect(0,0,64,256);blot(g,64,256,30,10,30,'0,0,0',0.05,0.16);spk(g,64,256,1800,'255,255,255',0.04,0.16);g.fillStyle='rgba(30,30,30,0.5)';g.fillRect(20,0,8,256);return c;}
function tGrass(){const [c,g]=cnv(256,256);g.fillStyle='#65803f';g.fillRect(0,0,256,256);blot(g,256,256,50,15,50,'40,80,30',0.1,0.3);blot(g,256,256,40,10,40,'150,140,60',0.06,0.2);spk(g,256,256,4000,'255,255,255',0.05,0.2);return c;}
function tDirt(){const [c,g]=cnv(256,256);g.fillStyle='#6e6650';g.fillRect(0,0,256,256);blot(g,256,256,40,10,50,'92,86,64',0.1,0.25);blot(g,256,256,30,8,40,'50,46,36',0.06,0.16);blot(g,256,256,20,10,40,'120,110,80',0.08,0.18);return c;}
function tWin(brick){const W=512,Hh=256,[c,g]=cnv(W,Hh);if(brick){paintBrick(g,W,Hh);}else{g.fillStyle='#d8d4cb';g.fillRect(0,0,W,Hh);}blot(g,W,Hh,30,20,60,brick?'40,30,25':'110,100,85',0.04,0.1);streaks(g,W,Hh,18);return c;}
function tOffice(){const [c,g]=cnv(256,256);const gr=g.createLinearGradient(0,0,256,256);gr.addColorStop(0,'#5d7d91');gr.addColorStop(0.5,'#33495a');gr.addColorStop(1,'#1f2d38');g.fillStyle=gr;g.fillRect(0,0,256,256);spk(g,256,256,1600,'255,255,255',0.08,0.18);return c;}
function tLadder(){const [c,g]=cnv(64,64);g.clearRect(0,0,64,64);g.fillStyle='#5a5f66';g.fillRect(4,0,5,64);g.fillRect(55,0,5,64);g.fillStyle='#6d737a';g.fillRect(4,10,56,5);g.fillRect(4,42,56,5);return c;}
const KINDS={plaster:{t:tPlaster,su:4,sv:4},brick:{t:tBrick,su:2.4,sv:2.4},concrete:{t:tConcrete,su:4,sv:4},roof:{t:tRoof,su:4,sv:4},metal:{t:tMetal,su:2,sv:2},wood:{t:tWood,su:1.5,sv:1.5},pave:{t:tPave,su:1.8,sv:1.8},asphalt:{t:tAsphalt,su:2.4,sv:2.4},road:{t:tRoad,su:1,sv:2.8},grass:{t:tGrass,su:8,sv:8},dirt:{t:tDirt,su:8,sv:8},flat:{t:()=>null},ladder:{t:tLadder,su:1,sv:1,alpha:false}};
const matCache={};
function mkTex(c){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,maxAniso);return t;}
function matFor(kind){if(matCache[kind])return matCache[kind];const K=KINDS[kind];const mp=K.t?mkTex(K.t()):null;const isMetal=(kind==='metal');const useBump=!isMobile&&!K.alpha;const usePbr=!isMobile&&!K.alpha;let m;if(usePbr){m=new THREE.MeshStandardMaterial({map:mp,bumpMap:(useBump&&mp)?mp:null,bumpScale:(kind==='brick'||kind==='pave')?1.4:0.6,roughness:isMetal?0.5:0.92,metalness:isMetal?0.3:0,vertexColors:true,side:THREE.FrontSide});}else{m=new THREE.MeshLambertMaterial({map:mp,vertexColors:true,side:K.alpha?THREE.DoubleSide:THREE.FrontSide,transparent:!!K.alpha,alphaTest:K.alpha?0.4:0});}if(K.po){m.polygonOffset=true;m.polygonOffsetFactor=-3;m.polygonOffsetUnits=-3;}return matCache[kind]=m;}

/* ============ WORLD BUFFER ============ */
const CHUNK=96;const bufs=new Map();
class Buf{constructor(kind,cx,cz){this.kind=kind;this.cx=cx;this.cz=cz;this.cap=1024;this.pos=new Float32Array(this.cap*3);this.nor=new Float32Array(this.cap*3);this.col=new Float32Array(this.cap*3);this.uv=new Float32Array(this.cap*2);this.idx=new Uint32Array(this.cap*6);this.nv=0;this.ni=0;}
  need(nv,ni){if(this.nv+nv>this.cap){let nc=this.cap;while(nc<this.nv+nv)nc*=2;const g=(a,k)=>{const b=new Float32Array(nc*k);b.set(a);return b;};this.pos=g(this.pos,3);this.nor=g(this.nor,3);this.col=g(this.col,3);this.uv=g(this.uv,2);this.idx=new Uint32Array(nc*6);this.idx.set(this.idx);}} 
}
function getBuf(kind,x,z){const cx=Math.floor((x+MAP+60)/CHUNK),cz=Math.floor((z+MAP+60)/CHUNK),key=kind+'|'+cx+'|'+cz;let b=bufs.get(key);if(!b){b=new Buf(kind,cx,cz);bufs.set(key,b);}return b;}
const boxes=[];const GRID_CELL=16,GOFF=MAP+60,GN=Math.ceil((MAP*2+120)/GRID_CELL)+1;const grid=new Array(GN*GN);
function registerCollider(b){const gx0=Math.max(0,Math.floor((b.x0+GOFF)/GRID_CELL)),gx1=Math.min(GN-1,Math.floor((b.x1+GOFF)/GRID_CELL));const gz0=Math.max(0,Math.floor((b.z0+GOFF)/GRID_CELL)),gz1=Math.min(GN-1,Math.floor((b.z1+GOFF)/GRID_CELL));for(let gx=gx0;gx<=gx1;gx++)for(let gz=gz0;gz<=gz1;gz++){const i=gx*GN+gz;const cell=grid[i]||[];cell.push(b);grid[i]=cell;}}
let qstamp=1;
function queryGrid(x,z,r){const out=[];qstamp++;const gx0=Math.max(0,Math.floor((x-r+GOFF)/GRID_CELL)),gx1=Math.min(GN-1,Math.floor((x+r+GOFF)/GRID_CELL));const gz0=Math.max(0,Math.floor((z-r+GOFF)/GRID_CELL)),gz1=Math.min(GN-1,Math.floor((z+r+GOFF)/GRID_CELL));for(let gx=gx0;gx<=gx1;gx++)for(let gz=gz0;gz<=gz1;gz++){const cell=grid[gx*GN+gz];if(!cell)continue;for(const b of cell){if(b.q!==qstamp&&Math.abs((b.x0+b.x1)/2-x)<r+Math.max(0,(b.x1-b.x0)/2)&&Math.abs((b.z0+b.z1)/2-z)<r+Math.max(0,(b.z1-b.z0)/2)){b.q=qstamp;out.push(b);}}}return out;}
const OCC_CELL=8,occHash=new Map();
function occupy(x0,x1,z0,z1,pad){const rec={x0:x0-pad,x1:x1+pad,z0:z0-pad,z1:z1+pad};const gx0=Math.floor((rec.x0+MAP+20)/OCC_CELL),gx1=Math.floor((rec.x1+MAP+20)/OCC_CELL),gz0=Math.floor((rec.z0+MAP+20)/OCC_CELL),gz1=Math.floor((rec.z1+MAP+20)/OCC_CELL);for(let gx=gx0;gx<=gx1;gx++)for(let gz=gz0;gz<=gz1;gz++){const k=gx+','+gz;occHash.set(k,(occHash.get(k)||0)+1);}}
function isFree(x,z,r){if(Math.abs(x)>MAP-8||Math.abs(z)>MAP-8)return false;const gx=Math.floor((x+MAP+20)/OCC_CELL),gz=Math.floor((z+MAP+20)/OCC_CELL);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const k=(gx+dx)+','+(gz+dz);if(occHash.get(k))return false;}} return true;
const FACES=[{n:[1,0,0],v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},{n:[-1,0,0],v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},{n:[0,1,0],v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},{n:[0,-1,0],v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]},{n:[0,0,1],v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]},{n:[0,0,-1],v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]}];
const NC=1,NR=2,NV=4,KB=8;const _c=new THREE.Color();
function B(cx,y,cz,w,h,d,color,kind,fl){kind=kind||'concrete';fl=fl|0;if(!(fl&NV)){const K=KINDS[kind],buf=getBuf(kind,cx,cz);_c.setHex(color).convertSRGBToLinear();const vary=1+(vr()-0.5)*0.12,cr=_c.r*vary,cg=_c.g*vary,cb=_c.b*vary;const skipB=!(fl&KB)&&y<0.05;const nx=K.align?Math.max(1,Math.round(w/K.su)):1,nz=K.align?Math.max(1,Math.round(d/K.su)):1;for(let fi=0;fi<6;fi++){if(fi===3&&skipB)continue;const f=FACES[fi];buf.need(4,6);const base=buf.nv;for(let k=0;k<4;k++){const v=f.v[k],wx=cx+v[0]*w/2,wy=y+h/2+v[1]*h/2,wz=cz+v[2]*d/2;let u,vv;if(fi===2||fi===3){u=wx/K.su;vv=wz/K.sv;}else if(K.align){u=fi<2?(wz-(cz-d/2))/(d/nz):(wx-(cx-w/2))/(w/nx);vv=(wy-y)/K.sv;}else{u=(fi<2?wz:wx)/K.su;vv=wy/K.sv;}const ao=fi===2?1:(fi===3?0.8:0.62+0.38*Math.min(1,wy/3));const o=buf.nv;buf.pos[o*3]=wx;buf.pos[o*3+1]=wy;buf.pos[o*3+2]=wz;buf.nor[o*3]=f.n[0];buf.nor[o*3+1]=fi===3?1:f.n[1];buf.nor[o*3+2]=f.n[2];buf.col[o*3]=cr*ao;buf.col[o*3+1]=cg*ao;buf.col[o*3+2]=cb*ao;buf.uv[o*2]=u;buf.uv[o*2+1]=vv;buf.nv++;}const i=buf.ni;buf.idx[i]=base;buf.idx[i+1]=base+1;buf.idx[i+2]=base+2;buf.idx[i+3]=base;buf.idx[i+4]=base+2;buf.idx[i+5]=base+3;buf.ni+=6;}}if(!(fl&NC)){const b={x0:cx-w/2,x1:cx+w/2,y0:y,y1:y+h,z0:cz-d/2,z1:cz+d/2,ray:!(fl&NR),q:0};boxes.push(b);registerCollider(b);}}
function Q(x0,x1,z0,z1,y,kind,color){const K=KINDS[kind],buf=getBuf(kind,(x0+x1)/2,(z0+z1)/2);_c.setHex(color).convertSRGBToLinear();buf.need(4,6);const base=buf.nv;const P=[[x0,z1],[x1,z1],[x1,z0],[x0,z0]];for(let i=0;i<4;i++){const [x,z]=P[i];const o=buf.nv;buf.pos[o*3]=x;buf.pos[o*3+1]=y;buf.pos[o*3+2]=z;buf.nor[o*3]=0;buf.nor[o*3+1]=1;buf.nor[o*3+2]=0;buf.col[o*3]=_c.r;buf.col[o*3+1]=_c.g;buf.col[o*3+2]=_c.b;buf.uv[o*2]=0;buf.uv[o*2+1]=0;buf.nv++;}buf.idx[buf.ni++]=base;buf.idx[buf.ni++]=base+1;buf.idx[buf.ni++]=base+2;buf.idx[buf.ni++]=base;buf.idx[buf.ni++]=base+2;buf.idx[buf.ni++]=base+3;}
function LQ(ax,az,nx,nz,y0,y1){const buf=getBuf('ladder',ax,az),tx=-nz*0.35,tz=nx*0.35;buf.need(4,6);const base=buf.nv,hh=(y1-y0)/0.6;const V=[[ax-tx,y0,az-tz,0,0],[ax+tx,y0,az+tz,1,0],[ax+tx,y1,az+tz,1,1],[ax-tx,y1,az-tz,0,1]];for(let i=0;i<4;i++){const [x,y,z,u,v]=V[i];const o=buf.nv;buf.pos[o*3]=x;buf.pos[o*3+1]=y;buf.pos[o*3+2]=z;buf.nor[o*3]=0;buf.nor[o*3+1]=1;buf.nor[o*3+2]=0;buf.col[o*3]=0.5;buf.col[o*3+1]=0.5;buf.col[o*3+2]=0.5;buf.uv[o*2]=u;buf.uv[o*2+1]=v;buf.nv++;}buf.idx[buf.ni++]=base;buf.idx[buf.ni++]=base+1;buf.idx[buf.ni++]=base+2;buf.idx[buf.ni++]=base;buf.idx[buf.ni++]=base+2;buf.idx[buf.ni++]=base+3;}
function G(geo,px,py,pz,sx,sy,sz,ry,color){const buf=getBuf('flat',px,pz),p=geo.attributes.position,n=geo.attributes.normal,ix=geo.index;_c.setHex(color).convertSRGBToLinear();const vary=1+(vr()-0.5)*0.12;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i);const nx=n? n.getX(i):0,ny=n?n.getY(i):0,nz=n?n.getZ(i):0 ; const wx=px + x*sx,wy=py + y*sy,wz=pz + z*sz;const o=buf.nv;buf.pos[o*3]=wx;buf.pos[o*3+1]=wy;buf.pos[o*3+2]=wz;buf.nor[o*3]=nx;buf.nor[o*3+1]=ny;buf.nor[o*3+2]=nz;buf.col[o*3]=_c.r*vary;buf.col[o*3+1]=_c.g*vary;buf.col[o*3+2]=_c.b*vary;buf.uv[o*2]=(x*0.5+0.5);buf.uv[o*2+1]=(z*0.5+0.5);buf.nv++;}for(let i=0;i<ix.count;i++){buf.idx[buf.ni++]=buf.nv-(p.count)+ix.getX(i);}}
const chunkMeshes=[];
function finalizeWorld(){for(const b of bufs.values()){if(!b.ni)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(b.pos.slice(0,b.nv*3),3));g.setAttribute('normal',new THREE.BufferAttribute(b.nor.slice(0,b.nv*3),3));g.setAttribute('color',new THREE.BufferAttribute(b.col.slice(0,b.nv*3),3));g.setAttribute('uv',new THREE.BufferAttribute(b.uv.slice(0,b.nv*2),2));g.setIndex(Array.from(b.idx.slice(0,b.ni)));const mesh=new THREE.Mesh(g,matFor(b.kind));mesh.castShadow=true;mesh.receiveShadow=true;chunkMeshes.push(mesh);scene.add(mesh);}}
function makeGroundTex(){const t=mkTex(tDirt());t.repeat.set(120,120);return t;}
const groundGeo=new THREE.PlaneGeometry(MAP*2+120,MAP*2+120,60,60);
(function(){const pos=groundGeo.attributes.position,col=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const v=(Math.sin(x*0.031+1.3)*Math.sin(y*0.027+0.4)+Math.cos((x+y)*0.024))*0.5;col[i*3]=0.35+v*0.2;col[i*3+1]=0.29+v*0.15;col[i*3+2]=0.18+v*0.12;}groundGeo.setAttribute('color',new THREE.BufferAttribute(col,3));})();
const groundTex=makeGroundTex();
let groundMat;if(isMobile)groundMat=new THREE.MeshLambertMaterial({map:groundTex,vertexColors:true});else groundMat=new THREE.MeshStandardMaterial({map:groundTex,bumpMap:groundTex,bumpScale:1.2,roughness:1,metalness:0});
const ground=new THREE.Mesh(groundGeo,groundMat);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);

/* ============ CITY ============ */
const FH=3.0,RISE=FH/16,RUN=0.3,BLOCK=28,STEP_B=38,EXT=Math.floor((MAP-30)/STEP_B),CELL=(BLOCK-1)/2;
const WALLC=[0xd9cdb5,0xcfc3ab,0xe0d6c0,0xc9d0cf,0xd5b99a,0xc3cdb7,0xe3dccb,0xbfc4c8];
const BRICKC=[0xc48a6e,0xb57a5f,0xbf8468,0xa96f56,0xc99578];
const OFFC=[0xa9c1cf,0x9fb5c4,0xb7c6cf,0x8fa3b0];
const ROOFC=[0x6b5a54,0x5c6772,0x7a5f53,0x4f5a56,0x5a4a40,0x4a5058];
const CONCRETEC=[0x9a9a94,0xa5a59c,0x8a8a82,0x8f8f88,0x7a7a72];
const CRATEC=[0xb08850,0xa47b45,0xc09a5c,0x9b7240];
const CARC=[0x8e2b26,0x2b4f7e,0xd8d6cf,0x3c3f44,0x5a6b4a,0xb59a3a,0x777c82,0xa6a9ad,0x2d2d2d];
const BUSC=[0xd8d8d0,0x3a6ea8,0xc94435,0x4a7c59,0xd8a03a,0x8a3a5a];
const GREENS=[0x4f6a34,0x5b7538,0x6b7a3a,0x7a6f3a,0x466030];
const MILITARY_GREEN=[0x4a5a3a,0x5a6a4a,0x3a4a2a,0x6a7a5a];
const ladders=[],ENTER=[],roofSpots=[],medSpots=[];
function wallSeg(axis,a0,a1,fixed,y0,y1,color,kind,ops,T){const cuts=[a0,a1];for(const o of ops){cuts.push(clamp(o.c-o.w/2,a0,a1),clamp(o.c+o.w/2,a0,a1));}cuts.sort((a,b)=>a-b);for(let i=0;i<cuts.length-1;i++){const a=cuts[i],b=cuts[i+1];if(b-a<0.1)continue;const mid=(a+b)/2;if(axis==='x')B(mid,y0,fixed,b-a,y1-y0,T,color,kind);else B(fixed,y0,mid,T,y1-y0,b-a,color,kind);}}
function slabWithHole(x0,x1,z0,z1,y,th,hole,color,kind){const bx=(a,b,c,d)=>{if(b-a>0.02&&d-c>0.02)B((a+b)/2,y,(c+d)/2,b-a,th,d-c,color,kind);};if(!hole){bx(x0,x1,z0,z1);return;}bx(x0,hole.x0,z0,z1);bx(hole.x1,x1,z0,z1);bx(x0,x1,z0,hole.z0);bx(x0,x1,hole.z1,z1);}
const SIDE={n:[0,-1],s:[0,1],e:[1,0],w:[-1,0]};
function addLadder(x,z,side,y0,yTop){const [nx,nz]=SIDE[side],ax=x+nx*0.06,az=z+nz*0.06;LQ(ax,az,nx,nz,y0,yTop+0.9);ladders.push({nx,nz,y0,yTop,bx:ax+nx*0.75,bz:az+nz*0.75,cx:ax+nx*0.36,cz:az+nz*0.36,side});}
function enterBuilding(cx,cz,w,d,floors,ox,oz){const T=0.4,x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2,top=floors*FH;const brick=rand()<0.4,kind=brick?'brick':'plaster',wc=brick?wpick(BRICKC):wpick(WALLC);B(cx,0,cz,w,0.25,d,wc,'flat');for(let f=1;f<=floors;f++){const y=f*FH;B(cx,y,cz-d/2+T/2,w,0.9,T,wc,kind);B(cx,y,cz+d/2-T/2,w,0.9,T,wc,kind);B(cx-w/2+T/2,y,cz,w,0.9,T,wc,kind);B(cx+w/2-T/2,y,cz,w,0.9,T,wc,kind);}B(cx,top,cz,w,0.45,d,wpick(ROOFC),'roof');}
function facade(cx,cz,w,d,floors,ox,oz){const t=rand(),h=floors*FH+0.5;let kind,col;if(floors>=4&&t<0.45){kind='office';col=wpick(OFFC);}else if(t<0.5){kind='winB';col=wpick(BRICKC);}else{kind='winA';col=wpick(WALLC);}B(cx,0,cz,w,0.2,d,col,'flat');for(let f=1;f<=floors;f++){const y=f*FH;B(cx,y,cz-d/2+0.18,w,0.9,0.36,col,kind);B(cx,y,cz+d/2-0.18,w,0.9,0.36,col,kind);B(cx-w/2+0.18,y,cz,0.36,0.9,col,kind);B(cx+w/2-0.18,y,cz,0.36,0.9,col,kind);}}
function ruin(cx,cz,w,d){const kind=rand()<0.5?'brick':'plaster',col=kind==='brick'?wpick(BRICKC):wpick(WALLC);const sides=[[cx,cz-d/2,true],[cx,cz+d/2,true],[cx-w/2,cz,false],[cx+w/2,cz,false]];for(const [x,z,ax] of sides){B(x,0,z,ax?w:0.5,0.8,ax?d:0.5,col,kind);}}
function tree(x,z,s){const th=2.4*s+rand()*1.2,cr=1.5*s,gc=wpick(GREENS);G(cylGeo,x,th/2,z,0.15*s,th,0.15*s,0,0x5a4632);G(icoGeo,x,th+cr*0.4,z,cr,cr*0.9,cr,rand()*6,gc);G(icoGeo,x+wr(-.5,.5)*s,th+cr*1.1,z+wr(-.5,.5)*s,cr*0.85,cr*0.7,cr*0.85,rand()*4,gc);occupy(x-s*1.8,x+s*1.8,z-s*1.8,z+s*1.8,0.2);}
function lamp(x,z){G(cylGeo,x,2.75,z,0.07,5.5,0.07,0,0x3b3f44);B(x+0.5,5.4,z,1.1,0.12,0.25,0x3b3f44,'flat',NC);B(x,0,z,0.25,5.5,0.25,0,'flat',NV);}
function car(x,z,alongX,col,burnt){const lx=alongX?4.2:1.85,lz=alongX?1.85:4.2,cl=alongX?2.2:1.7,cd=alongX?1.7:2.2;B(x,0.28,z,lx,0.7,lz,burnt?0x1c1a18:col,'flat');B(x-(alongX?0.1:0),0.98,z-(alongX?0:0.1),alongX?cl:0.6,0.55,alongX?0.6:cd,0x2d2d2d,'flat');occupy(x-lx/2,x+lx/2,z-lz/2,z+lz/2,0.25);}
function bus(x,z,alongX,col){const lx=alongX?10.8:2.55,lz=alongX?2.55:10.8;B(x,0.35,z,lx,0.45,lz,0x1b1d21,'flat');B(x,0.85,z,lx,0.75,lz,col,'flat');B(x,1.55,z,lx,0.72,lz,0x2a3a48,'flat');occupy(x-lx/2,x+lx/2,z-lz/2,z+lz/2,0.4);}
function planks(x,z,alongX){const c=0x9b7240;const n=3+(rand()*3|0);for(let i=0;i<n;i++){const off=(i-n/2)*0.18;if(alongX){B(x,0.05+i*0.06,z+off,3.4,0.09,0.16,c,'wood');}else{B(x+off,0.05+i*0.06,z,0.16,0.09,3.4,c,'wood');}}}
function oilCluster(x,z,n){for(let i=0;i<n;i++){const a=rand()*TAU,r=0.3+rand()*0.9;const px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;barrel(px,pz);}occupy(x-1.5,x+1.5,z-1.5,z+1.5,0.2);}
function tankWreck(cx,cz){const color=wpick(MILITARY_GREEN);B(cx,0.4,cz,3.2,1.4,6.5,color,'metal');B(cx,1.8,cz-0.5,2.6,1.0,3.0,shade(color,0.9),'metal');B(cx,1.8,cz+2,0.3,0.3,3.5,shade(color,0.8),'metal');occupy(cx-2.2,cx+2.2,cz-3.4,cz+3.4,0.4);}
function sandbags(x,z,n){for(let i=0;i<n;i++)B(x+wr(-1.6,1.6),wr(0,0.6),z+wr(-1.6,1.6),0.8,0.26,0.5,0xb8a878,'flat');}
function crateStack(x,z){const s=wr(1.1,1.7);B(x,0,z,s,s,s,wpick(CRATEC),'wood');if(rand()<0.4)B(x+wr(-.2,.2),s,z+wr(-.2,.2),s*0.8,s*0.8,s*0.8,wpick(CRATEC),'wood');}
function container(cx,cz,alongX,color){const w=alongX?6.2:2.4,d=alongX?2.4:6.2,h=2.5,t=0.15;B(cx,0,cz,w,0.15,d,0x202224,'flat');if(alongX){B(cx,0,cz-d/2+t/2,w,h,t,color,'metal');B(cx,0,cz+d/2-t/2,w,h,t,color,'metal');}else{B(cx-w/2+t/2,0,cz,h,t,d,color,'metal');B(cx+w/2-t/2,0,cz,h,t,d,color,'metal');}occupy(cx-w/2,cx+w/2,cz-d/2,cz+d/2,0.2);}
function barrel(x,z){const c=wpick([0x8a3a2a,0x2a4a8a,0x6a6a6a,0x8a6a2a]);G(cylGeo,x,0.45,z,0.32,0.9,0.32,0,c);B(x,0,z,0.6,0.9,0.6,0,'flat',NV);}
function dumpster(x,z){const c=wpick([0x2a6a3a,0x8a2a2a,0x2a3a6a]);B(x,0.2,z,2.2,1.3,1.2,c,'metal');B(x,1.5,z,2.3,0.14,1.3,shade(c,0.7),'metal',NC);occupy(x-1.2,x+1.2,z-0.7,z+0.7,0.3);}
function watchtower(x,z){const h=(wr(11,17))|0,w=4,d=4,cs=0.4,wc=0x6a4a2a,py=h-0.3;for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(x+a*(w/2-cs/2),0,z+b*(d/2-cs/2),cs,h,cs,wc,'wood');for(let y=2;y<h;y+=2)B(x,y,z,0.3,0.28,0.3,0x7a5d3a,'wood');}

/* ============ WEAPONS & VIEWMODEL SETUP ============ */
const WEAPONS={
  pistol:{name:'Pistol',dmg:26,rate:0.2,mag:12,res:48,recoil:0.04,spread:0.015,kind:'pistol',range:70},
  rifle:{name:'Assault Rifle',dmg:28,rate:0.1,mag:30,res:120,recoil:0.03,spread:0.02,kind:'rifle',range:160},
  shotgun:{name:'Shotgun',dmg:14,rate:0.8,mag:8,res:32,recoil:0.12,spread:0.065,kind:'shotgun',range:35,pellets:8},
  sniper:{name:'Sniper Rifle',dmg:95,rate:1.2,mag:5,res:20,recoil:0.18,spread:0.002,kind:'sniper',range:400},
  smg:{name:'SMG',dmg:18,rate:0.07,mag:35,res:140,recoil:0.025,spread:0.035,kind:'smg',range:90},
  lmg:{name:'LMG',dmg:32,rate:0.12,mag:60,res:120,recoil:0.045,spread:0.03,kind:'lmg',range:140},
  dmr:{name:'DMR',dmg:48,rate:0.25,mag:15,res:60,recoil:0.06,spread:0.008,kind:'dmr',range:220}
};

const viewModelGroup=new THREE.Group();
viewScene.add(viewModelGroup);

const armMat=new THREE.MeshLambertMaterial({color:L(0xc8a27c)});
const sleeveMat=new THREE.MeshLambertMaterial({color:L(0x2b382b)});

function createArm(isLeft){
  const arm = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.35, 0.1), sleeveMat);
  upper.position.set(0, -0.15, 0);
  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), armMat);
  lower.position.set(0, -0.4, 0.05);
  lower.rotation.x = 0.4;
  arm.add(upper);
  arm.add(lower);
  return arm;
}

const leftArm = createArm(true);
const rightArm = createArm(false);
viewModelGroup.add(leftArm);
viewModelGroup.add(rightArm);

const weaponMeshes={};
function buildWeaponModels(){
  const gunMat = new THREE.MeshStandardMaterial({color:L(0x1a1a1a), roughness:0.5, metalness:0.8});
  const stockMat = new THREE.MeshStandardMaterial({color:L(0x4a3222), roughness:0.8});
  const pGroup = new THREE.Group();
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.22), gunMat);
  const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), stockMat);
  pGrip.position.set(0, -0.08, 0.06);
  pGrip.rotation.x = 0.2;
  pGroup.add(pBody, pGrip);
  weaponMeshes.pistol = pGroup;

  const rGroup = new THREE.Group();
  const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.55), gunMat);
  const rBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3), gunMat);
  rBarrel.rotation.x = Math.PI/2;
  rBarrel.position.set(0, 0.01, -0.35);
  const rGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.07), stockMat);
  rGrip.position.set(0, -0.09, 0.1);
  rGrip.rotation.x = 0.3;
  rGroup.add(rBody, rBarrel, rGrip);
  weaponMeshes.rifle = rGroup;

  for(const k in weaponMeshes){
    weaponMeshes[k].visible = false;
    viewModelGroup.add(weaponMeshes[k]);
  }
}
buildWeaponModels();

function updateArmTransforms(weaponKey, isADS){
  const p = viewModelGroup.position;
  p.set(isADS ? 0 : 0.18, isADS ? -0.14 : -0.18, isADS ? -0.28 : -0.38);
  viewModelGroup.rotation.set(isADS ? 0.04 : 0.08, 0, 0);

  for(const k in weaponMeshes){
    weaponMeshes[k].visible = (k === weaponKey || (k==='rifle' && weaponKey!=='pistol'));
  }

  if(weaponKey === 'pistol'){
    rightArm.position.set(0.09, -0.11, 0.15);
    rightArm.rotation.set(0.68, -0.18, -0.25);
    leftArm.position.set(-0.09, -0.12, 0.12);
    leftArm.rotation.set(0.72, 0.18, 0.26);
  } else {
    rightArm.position.set(0.10, -0.12, 0.22);
    rightArm.rotation.set(0.52, -0.15, -0.22);
    leftArm.position.set(-0.18, -0.10, -0.18);
    leftArm.rotation.set(0.34, 0.38, 0.25);
  }
}

/* ============ GAME STATE & BOT STUBS ============ */
const player={name:ADMIN_NAME,x:0,y:EYE,z:0,alive:true};
const botPool=[];
function chatLine(sender, text){
  const box=$('chatBox')||$('chat');
  if(box){
    const d=document.createElement('div');
    d.innerHTML=`<b>${esc(sender)}:</b> ${esc(text)}`;
    box.appendChild(d);
    box.scrollTop=box.scrollHeight;
  }
}

/* ============ INITIALIZE WORLD & LOOP ============ */
finalizeWorld();
updateArmTransforms('rifle', false);

let lastTime=performance.now();
function animate(now){
  requestAnimationFrame(animate);
  const dt=Math.min(0.1, (now-lastTime)/1000);
  lastTime=now;

  BotChat.tick(dt);
  skyMat.uniforms.time.value = now * 0.001;

  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(viewScene, viewCamera);
}
requestAnimationFrame(animate);

window.addEventListener('resize', ()=>{
  const w=window.innerWidth, h=window.innerHeight;
  camera.aspect = w/h; camera.updateProjectionMatrix();
  viewCamera.aspect = w/h; viewCamera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

})();
