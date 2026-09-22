(function(){
'use strict';
const $=id=>document.getElementById(id);
if(!window.THREE){$('playMulti').disabled=$('playSolo').disabled=true;$('menu').insertAdjacentHTML('beforeend','<p class="note" style="color:#ff8a8a">The 3D engine failed to load.</p>');return;}

/* ============ KEYBINDINGS ============ */
const DEFAULT_BINDS={forward:'KeyW',back:'KeyS',left:'KeyA',right:'KeyD',jump:'Space',sprint:'ShiftLeft',reload:'KeyR',ads:'Mouse2',fire:'Mouse0',chat:'Enter',leaderboard:'Tab',w1:'Digit1',w2:'Digit2',w3:'Digit3',w4:'Digit4',w5:'Digit5',w6:'Digit6',w7:'Digit7',w8:'Digit8'};
let BINDS=Object.assign({},DEFAULT_BINDS);
try{const s=localStorage.getItem('shotline.binds');if(s)BINDS=Object.assign({},DEFAULT_BINDS,JSON.parse(s));}catch(e){}
function saveBinds(){try{localStorage.setItem('shotline.binds',JSON.stringify(BINDS));}catch(e){}}
function prettyKey(code){if(!code)return '—';if(code==='Space')return 'Space';if(code==='Enter')return 'Enter';if(code==='Tab')return 'Tab';if(code==='ShiftLeft'||code==='ShiftRight')return 'Shift';if(code==='Mouse0')return 'LMB';if(code==='Mouse1')return 'MMB';if(code==='Mouse2')return 'RMB';if(code.startsWith('Key'))return code.slice(3);if(code.startsWith('Digit'))return code.slice(5);if(code.startsWith('Arrow'))return code.slice(5);return code;}
const keys={};
function isDown(action){return !!keys[BINDS[action]];}
document.querySelectorAll('.tab-btn').forEach(btn=>{btn.addEventListener('click',()=>{const tab=btn.dataset.tab;document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b===btn));document.querySelectorAll('.tab-panel').forEach(p=>p.classList.toggle('hidden',p.dataset.tab!==tab));});});
(function(){const btns=document.querySelectorAll('.bind-key');let listening=null;
  function refresh(){btns.forEach(b=>{b.textContent=prettyKey(BINDS[b.dataset.bind]);});}
  btns.forEach(btn=>{btn.addEventListener('click',e=>{e.preventDefault();if(listening)listening.classList.remove('listening');listening=btn;btn.classList.add('listening');btn.textContent='Press…';
    const cleanup=()=>{document.removeEventListener('keydown',cap,true);document.removeEventListener('mousedown',cap,true);if(listening){listening.classList.remove('listening');listening=null;}refresh();};
    const cap=(ev)=>{ev.preventDefault();ev.stopPropagation();if(ev.type==='keydown'&&ev.key==='Escape'){cleanup();return;}let code=null;if(ev.type==='mousedown')code='Mouse'+ev.button;else if(ev.code)code=ev.code;if(!code)return;BINDS[listening.dataset.bind]=code;saveBinds();cleanup();};
    document.addEventListener('keydown',cap,true);document.addEventListener('mousedown',cap,true);});});
  const rb=$('resetBinds');if(rb)rb.addEventListener('click',()=>{BINDS=Object.assign({},DEFAULT_BINDS);saveBinds();refresh();});refresh();})();
try{const s=localStorage.getItem('shotline.sens');if(s)$('sens').value=s;const g=localStorage.getItem('shotline.gfx');if(g)$('gfx').value=g;const sx=localStorage.getItem('shotline.sfx');if(sx!==null)$('optSfx').checked=sx==='1';const ch=localStorage.getItem('shotline.botchat');if(ch!==null)$('optChat').checked=ch==='1';}catch(e){}
$('resetSettings').addEventListener('click',()=>{$('sens').value=5;$('gfx').value='high';$('optSfx').checked=true;$('optChat').checked=true;try{localStorage.setItem('shotline.sens','5');localStorage.setItem('shotline.gfx','high');localStorage.setItem('shotline.sfx','1');localStorage.setItem('shotline.botchat','1');}catch(e){}if(typeof applyGfx==='function')applyGfx('high');});
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
    dieP:{chill:['nice one','ok that was clean','wp','lol ok','damn','fair enough','how did u see me'],toxic:['lucky','bro what','thats lag','tf','ok that was cheap','how','sit down next time'],friendly:['nice shot!','gg','wp {p}','good one haha','ouch','well played'],tryhard:['ok {p} can aim','need to reposition','wp','that angle was mine','noted'],quiet:['gg','wp','nice','']},
    dieHS:{chill:['headshot lol','ok thats a headshot','ouch my head'],toxic:['headshot? sure','lucky headshot','tf'],friendly:['wow nice headshot','ow haha','clean headshot!'],tryhard:['tight aim','ok that was a good headshot'],quiet:['nice','']},
    dieFar:{chill:['from all the way over there?','how did you hit that','long shot'],toxic:['no way you hit that','sniper camper','tf that range'],friendly:['wow what a shot','from that far?!'],tryhard:['long range angle noted','someone is on the roof'],quiet:['wow','']},
    dieBot:{chill:['{k} got me','ok {k} nice','who was that','ah {k}'],toxic:['{k} you rat','{k} lucky','tf {k}'],friendly:['nice one {k}','gg {k}'],tryhard:['{k} is holding that street','{k} pushed me'],quiet:['','ok']},
    dieFall:{chill:['lol i fell','forgot fall damage exists','my legs','who put a building there'],toxic:['bruh the map killed me','fall damage is so dumb','stairs are a trap lol'],friendly:['oops fell haha','ow my ankles'],tryhard:['misjudged the drop','dont jump off the tall ones'],quiet:['oof','']},
    killP:{chill:['gg','sry','close one','lol'],toxic:['ez','sit','lmao','get good'],friendly:['gg!','sorry {p}','nt','good fight'],tryhard:['sloppy','positioning matters','clean'],quiet:['gg','']},
    pFall:{chill:['lmao fall damage','he jumped off','gravity wins','rip {p}'],toxic:['{p} jumped lol','free kill from the sky','skill issue'],friendly:['oh no {p}','ouch that was a long drop'],tryhard:['{p} took the fall','never drop from the tall ones'],quiet:['oof','']},
    streak:{chill:['{p} is on a run','ok {p} is cracked'],toxic:['someone stop {p}','{p} is smurfing'],friendly:['{p} is on fire!','go {p}'],tryhard:['focus {p}','{p} is the threat here'],quiet:['wow','']},
    respawn:{chill:['back','ok again','round 2'],toxic:['back and angry','ok now im serious'],friendly:['hi again','lets go'],tryhard:['rotating','new plan'],quiet:['']},
    idle:['anyone know where the medkits are','the towers are a pain','stairs in the grey buildings are so long','dont jump off the tall roofs','someone is sniping from a tower','there is a medkit on a roof near me','heard shots north','ladders are slow but worth it','watch the edges','this border is tight','where is everyone','anything happening','im on a roof','anyone up top','i keep hearing footsteps','thought i saw someone','any snipers up','who is winning','roofs are the way','ground level is a death trap','ladders are op','anyone else lagging?','the border is closing in','watch mid','south side quiet','holding an angle','anyone need backup'],
    greet:['hey','hi all','o/','yo','sup','back for a few rounds','ready'],
    hi:['yo','hey {p}','sup','o/','hello','hey'],
    gg:['gg','wp','gg wp','ty','gg {p}'],
    insult:['lol ok','says who','rude','ok {p}','cry more','haha','ur not that good either','ok tough guy'],
    ask:['no idea','idk','maybe near the plaza?','?','try the roofs','good question','not sure honestly'],
    lag:['mine is fine','ping is ok for me','lag?','yeah a bit choppy'],
    thanks:['np','anytime','yw','np {p}'],
    generic:['lol','true','fr','same','haha','?','yeah','fair','ok'],
    called:['yeah?','what','sup','?','yo','hm?'],
    spotted:{chill:['contact','saw someone over here','enemy west','movement'],toxic:['target spotted','got eyes','found him','there he is'],friendly:['contact!','i see one','eyes on enemy'],tryhard:['contact, north','holding angle','enemy pushed up'],quiet:['contact','']},
    whiff:{chill:['missed lol','so close','my aim is off'],toxic:['come on','my shots arent registering','luck'],friendly:['almost!','so close','damn'],tryhard:['adjusting','off by a hair','recalibrating'],quiet:['']},
    pressured:{chill:['getting pushed','i need help','rushed'],toxic:['bro stop camping','push me then','1v1 me'],friendly:['need backup','someone help','im pinned'],tryhard:['contact pushing','falling back','need support'],quiet:['']},
    reload:{chill:['reloading','give me a sec','mag out'],toxic:['one sec reloading','chill chill'],friendly:['reloading!','wait wait'],tryhard:['tac reload','repositioning'],quiet:['']}
  };
  const fmt=(t,v)=>t.replace(/\{p\}/g,v&&v.p||'').replace(/\{k\}/g,v&&v.k||'').trim();
  function typo(t){if(t.length<5)return t;const i=1+((Math.random()*(t.length-3))|0);const r=Math.random();if(r<0.5)return t.slice(0,i)+t[i+1]+t[i]+t.slice(i+2);if(r<0.8)return t.slice(0,i)+t.slice(i+1);return t.slice(0,i)+t[i]+t.slice(i);}
  function style(t,p){if(!t)return '';if(p!=='friendly'&&p!=='tryhard'&&Math.random()<0.8)t=t.toLowerCase();if(Math.random()<0.7)t=t.replace(/[.!]+$/,'');if(p!=='friendly'&&Math.random()<0.25)t=t.replace(/\byou\b/gi,'u').replace(/\byour\b/gi,'ur');if(Math.random()<0.05)t=typo(t);if(Math.random()<0.03)t+=' lol';return t;}
  function say(bot,text){if(!active||!text)return;text=style(text,bot.persona);if(!text)return;if(pending>=3)return;pending++;const my=mid;const delay=700+text.length*80+Math.random()*1500;setTimeout(()=>{pending--;if(!active||my!==mid)return;const wait=Math.max(0,1300-(performance.now()-lastAny));setTimeout(()=>{if(!active||my!==mid)return;lastAny=performance.now();_lastChatAt=performance.now();chatLine(bot.name,text);},wait);},delay);}
  const chance=(bot,mul)=>Math.random()<(TALK[bot.persona]||0.4)*(mul||1);
  const line=(cat,bot,v)=>{const pool=D[cat];const arr=Array.isArray(pool)?pool:(pool[bot.persona]||pool.chill);return fmt(pick(arr),v);};
  const anyBot=()=>{const l=botPool.filter(b=>b.isBot&&b.alive);return l.length?pick(l):null;};
  const anyBotNear=(x,z,r)=>{const l=botPool.filter(b=>b.isBot&&b.alive&&Math.hypot(b.x-x,b.z-z)<r);return l.length?pick(l):null;};
  const pn=()=>player.name;
  function reply(text){const t=text.toLowerCase();const named=botPool.find(b=>t.includes(b.name.toLowerCase()));if(named&&Math.random()<0.9){say(named,fmt(pick(D.called),{p:pn()}));return;}let pool=D.generic,p=0.22;
    if(/^(hi|hello|hey|yo|sup|o\/|hola)\b/.test(t)){pool=D.hi;p=0.75;}else if(/\b(gg|wp|good game|nice game)\b/.test(t)){pool=D.gg;p=0.7;}else if(/\b(noob|trash|bad|ez|easy|garbage|suck|bots?)\b/.test(t)){pool=D.insult;p=0.6;}else if(/\b(lag|ping)\b/.test(t)){pool=D.lag;p=0.6;}else if(/\b(thanks|thx|ty)\b/.test(t)){pool=D.thanks;p=0.6;}else if(/\?\s*$/.test(t)||/\b(where|how|who|what|why|anyone)\b/.test(t)){pool=D.ask;p=0.55;}
    if(Math.random()>p)return;const b=anyBot();if(b)say(b,fmt(pick(pool),{p:pn()}));}
  return {persona(){return pick(PERS);},start(){active=true;mid++;pending=0;idleT=30+Math.random()*40;},stop(){active=false;mid++;},
    greetAll(){const bs=botPool.filter(b=>b.isBot);for(const b of bs)if(Math.random()<0.12)say(b,pick(D.greet));},
    event(type,c){if(!active)return;
      if(type==='death'){const b=c.bot;if(!b||!chance(b))return;if(c.cause==='fall')say(b,line('dieFall',b,{p:pn()}));else if(c.killer&&c.killer.isPlayer)say(b,line(c.head?'dieHS':(c.dist>70?'dieFar':'dieP'),b,{p:pn()}));else if(c.killer&&Math.random()<0.4)say(b,line('dieBot',b,{k:c.killer.name}));if(Math.random()<0.35){const near=anyBotNear(c.bot.x,c.bot.z,40);if(near&&near!==b&&chance(near,0.9))say(near,line('dieP',near,{p:pn()}));}}
      else if(type==='kill'){const b=c.bot;if(b&&chance(b,0.8))say(b,line('killP',b,{p:pn()}));}
      else if(type==='pFall'){const b=anyBot();if(b&&Math.random()<0.8)say(b,line('pFall',b,{p:pn()}));}
      else if(type==='streak'){const b=anyBot();if(b)say(b,line('streak',b,{p:pn()}));}
      else if(type==='respawn'){const b=c.bot;if(b&&Math.random()<0.06)say(b,line('respawn',b));}
      else if(type==='chat')reply(c.text);
      else if(type==='spotted'){const b=c.bot;if(b&&Math.random()<0.55)say(b,line('spotted',b));}
      else if(type==='whiff'){const b=c.bot;if(b&&chance(b,0.6))say(b,line('whiff',b));}
      else if(type==='pressured'){const b=c.bot;if(b&&chance(b,0.7))say(b,line('pressured',b));}
      else if(type==='reload'){const b=c.bot;if(b&&chance(b,0.35))say(b,line('reload',b));}},
    tick(dt){if(!active)return;const sinceAny=(performance.now()-_lastChatAt)/1000;if(sinceAny<6){idleT=Math.max(idleT,6);return;}idleT-=dt;if(idleT<=0){idleT=25+Math.random()*35;const b=anyBot();if(b&&chance(b,1.5))say(b,fmt(pick(D.idle)));}},
    notifyChat(){_lastChatAt=performance.now();}
  };
})();

/* ============ AUDIO ============ */
let actx=null,noiseBuf=null;
function initAudio(){try{if(!actx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)actx=new AC();}if(actx&&actx.state==='suspended')actx.resume();}catch(e){actx=null;}}
function getNoise(){if(!noiseBuf){const len=Math.floor(actx.sampleRate*0.6);noiseBuf=actx.createBuffer(1,len,actx.sampleRate);const d=noiseBuf.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;}return noiseBuf;}
function sfxNoise(vol,f0,f1,dur,type){if(!actx||vol<0.01)return;if($('optSfx')&&!$('optSfx').checked)return;try{const t=actx.currentTime,s=actx.createBufferSource();s.buffer=getNoise();const f=actx.createBiquadFilter();f.type=type||'lowpass';f.frequency.setValueAtTime(f0,t);f.frequency.exponentialRampToValueAtTime(Math.max(40,f1),t+dur);const g=actx.createGain();g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);s.connect(f);f.connect(g);g.connect(actx.destination);s.start(t);s.stop(t+dur+0.02);}catch(e){}}
function sfxTone(freq,dur,vol,type,f2){if(!actx||vol<0.01)return;if($('optSfx')&&!$('optSfx').checked)return;try{const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type=type||'sine';o.frequency.setValueAtTime(freq,t);if(f2)o.frequency.exponentialRampToValueAtTime(f2,t+dur);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+dur+0.02);}catch(e){}}
function sfxShot(kind,vol){if(kind==='shotgun'){sfxNoise(vol*0.9,3200,180,0.32);sfxTone(90,0.2,vol*0.5,'sine',40);}else if(kind==='sniper'){sfxNoise(vol,2600,120,0.55);sfxTone(70,0.35,vol*0.7,'sine',30);}else if(kind==='lmg'){sfxNoise(vol*0.85,2400,220,0.18);sfxTone(110,0.1,vol*0.4,'sine',55);}else if(kind==='dmr'){sfxNoise(vol*0.8,2600,180,0.16);sfxTone(120,0.12,vol*0.35,'sine',60);}else if(kind==='pistol'){sfxNoise(vol*0.5,3200,400,0.09);sfxTone(180,0.06,vol*0.25,'square',90);}else sfxNoise(vol*0.7,2800,260,0.12);}
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
  fragmentShader:['uniform vec3 top;uniform vec3 mid;uniform vec3 bot;uniform vec3 sunDir;uniform float time;varying vec3 vP;','float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}','float noise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);}','float fbm(vec2 p){float a=0.5;float s=0.0;for(int i=0;i<4;i++){s+=a*noise(p);p*=2.03;a*=0.5;}return s;}','void main(){','  vec3 d=normalize(vP);float h=clamp(d.y,0.0,1.0);','  vec3 col=mix(bot,mid,smoothstep(0.0,0.20,h));col=mix(col,top,smoothstep(0.15,0.80,h));','  float sd=max(dot(d,normalize(sunDir)),0.0);','  col+=vec3(1.0,0.7,0.4)*pow(sd,5.0)*0.28+vec3(1.0,0.85,0.6)*pow(sd,200.0)*2.4;','  if(d.y>0.02){','    vec2 uv=d.xz/(d.y+0.22)*1.1+vec2(time*0.008,time*0.005);','    float c=smoothstep(0.55,0.80,fbm(uv))*smoothstep(0.02,0.28,d.y);','    vec3 cc=mix(vec3(0.45,0.42,0.40),vec3(0.85,0.72,0.58),smoothstep(0.5,0.9,fbm(uv*1.7+3.0)));','    col=mix(col,cc,c*0.80);','  }','  gl_FragColor=vec4(col,1.0);','  #include <tonemapping_fragment>','  #include <encodings_fragment>','}'].join('\n')});
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
function blot(g,W,Hh,n,r0,r1,rgb,a0,a1){for(let i=0;i<n;i++){const x=trng()*W,y=trng()*Hh,r=r0+trng()*(r1-r0),a=a0+trng()*(a1-a0);for(const ox of[-W,0,W])for(const oy of[-Hh,0,Hh]){const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r);gr.addColorStop(0,'rgba('+rgb+','+a+')');gr.addColorStop(1,'rgba('+rgb+',0)');g.fillStyle=gr;g.fillRect(x+ox-r,y+oy-r,r*2,r*2);}}}
function spk(g,W,Hh,n,rgb,a0,a1){for(let i=0;i<n;i++){g.fillStyle='rgba('+rgb+','+(a0+trng()*(a1-a0))+')';g.fillRect(trng()*W,trng()*Hh,1+trng()*1.5,1+trng()*1.5);}}
function streaks(g,W,Hh,n){for(let i=0;i<n;i++){const x=trng()*W,w=2+trng()*8,len=40+trng()*120,y=trng()*Hh;const gr=g.createLinearGradient(0,y,0,y+len);gr.addColorStop(0,'rgba(60,50,40,0)');gr.addColorStop(0.3,'rgba(60,50,40,'+(0.05+trng()*0.09)+')');gr.addColorStop(1,'rgba(60,50,40,0)');g.fillStyle=gr;g.fillRect(x,y,w,len);}}
function cracks(g,W,Hh,n){g.strokeStyle='rgba(30,25,20,0.35)';g.lineWidth=1;for(let i=0;i<n;i++){let x=trng()*W,y=trng()*Hh;g.beginPath();g.moveTo(x,y);for(let j=0;j<6;j++){x+=(trng()-0.5)*26;y+=trng()*22;g.lineTo(x,y);}g.stroke();}}
function tPlaster(){const [c,g]=cnv(256,256);g.fillStyle='#d8d4cb';g.fillRect(0,0,256,256);blot(g,256,256,30,20,60,'120,110,95',0.03,0.09);blot(g,256,256,20,10,30,'255,255,255',0.04,0.09);streaks(g,256,256,12);cracks(g,256,256,5);spk(g,256,256,1500,'0,0,0',0.04,0.12);spk(g,256,256,900,'255,255,255',0.05,0.12);return c;}
function paintBrick(g,W,Hh){g.fillStyle='#d9d4ca';g.fillRect(0,0,W,Hh);for(let r=0;r*8<Hh;r++){const off=(r%2)*12;for(let x=-24;x<W;x+=24){const l=54+trng()*30;g.fillStyle='hsl(18,'+((6+trng()*10)|0)+'%,'+(l|0)+'%)';g.fillRect(x+off+1,r*8+1,22,6);}}}
function tBrick(){const [c,g]=cnv(256,256);paintBrick(g,256,256);blot(g,256,256,24,20,50,'40,30,25',0.05,0.13);streaks(g,256,256,10);return c;}
function tConcrete(){const [c,g]=cnv(256,256);g.fillStyle='#bdbbb4';g.fillRect(0,0,256,256);blot(g,256,256,36,15,60,'90,90,85',0.05,0.12);blot(g,256,256,20,10,40,'255,255,255',0.05,0.1);streaks(g,256,256,10);cracks(g,256,256,4);spk(g,256,256,2000,'0,0,0',0.05,0.15);g.fillStyle='rgba(0,0,0,0.2)';g.fillRect(0,0,256,1);g.fillRect(0,0,1,256);return c;}
function tRoof(){const [c,g]=cnv(256,256);g.fillStyle='#8b8883';g.fillRect(0,0,256,256);blot(g,256,256,40,10,40,'20,20,20',0.08,0.2);spk(g,256,256,4000,'255,255,255',0.1,0.3);spk(g,256,256,3000,'0,0,0',0.1,0.3);g.fillStyle='rgba(0,0,0,0.25)';for(let x=0;x<256;x+=64)g.fillRect(x,0,2,256);return c;}
function tMetal(){const [c,g]=cnv(256,128);for(let x=0;x<256;x+=16){g.fillStyle='#b9b9b9';g.fillRect(x,0,8,128);g.fillStyle='#8f8f8f';g.fillRect(x+8,0,8,128);}streaks(g,256,128,14);blot(g,256,128,14,10,30,'120,60,30',0.05,0.16);spk(g,256,128,600,'0,0,0',0.05,0.2);return c;}
function tWood(){const [c,g]=cnv(128,128);for(let y=0;y<128;y+=16){g.fillStyle='hsl(30,'+(20+trng()*12|0)+'%,'+(50+trng()*16|0)+'%)';g.fillRect(0,y,128,15);g.fillStyle='rgba(0,0,0,0.3)';g.fillRect(0,y+15,128,1);for(let i=0;i<5;i++){g.fillStyle='rgba(60,35,15,0.2)';g.fillRect(trng()*128,y+trng()*14,20+trng()*40,1);}}return c;}
function tPave(){const [c,g]=cnv(256,256);g.fillStyle='#aaa7a0';g.fillRect(0,0,256,256);blot(g,256,256,26,15,50,'70,70,60',0.05,0.12);g.strokeStyle='rgba(40,40,35,0.55)';g.lineWidth=2;for(let i=0;i<=256;i+=64){g.beginPath();g.moveTo(i,0);g.lineTo(i,256);g.stroke();g.beginPath();g.moveTo(0,i);g.lineTo(256,i);g.stroke();}spk(g,256,256,1500,'0,0,0',0.05,0.15);return c;}
function tAsphalt(){const [c,g]=cnv(256,256);g.fillStyle='#3d3d3f';g.fillRect(0,0,256,256);blot(g,256,256,40,20,60,'0,0,0',0.05,0.16);blot(g,256,256,20,15,40,'90,90,90',0.03,0.08);spk(g,256,256,4000,'255,255,255',0.04,0.16);cracks(g,256,256,6);return c;}
function tRoad(){const [c,g]=cnv(64,256);g.fillStyle='#3b3b3d';g.fillRect(0,0,64,256);blot(g,64,256,30,10,30,'0,0,0',0.05,0.16);spk(g,64,256,1800,'255,255,255',0.04,0.16);g.fillStyle='rgba(30,30,30,0.35)';g.fillRect(14,0,9,256);g.fillRect(41,0,9,256);g.fillStyle='rgba(235,235,225,0.7)';g.fillRect(3,0,2,256);g.fillRect(59,0,2,256);g.fillStyle='rgba(240,230,170,0.85)';g.fillRect(31,10,2,90);g.fillRect(31,138,2,90);cracks(g,64,256,4);return c;}
function tGrass(){const [c,g]=cnv(256,256);g.fillStyle='#65803f';g.fillRect(0,0,256,256);blot(g,256,256,50,15,50,'40,80,30',0.1,0.3);blot(g,256,256,40,10,40,'150,140,60',0.06,0.2);spk(g,256,256,4000,'30,60,20',0.1,0.4);spk(g,256,256,2500,'170,170,80',0.1,0.3);return c;}
function tDirt(){const [c,g]=cnv(256,256);g.fillStyle='#6e6650';g.fillRect(0,0,256,256);blot(g,256,256,40,10,50,'92,86,64',0.1,0.25);blot(g,256,256,30,8,40,'50,46,36',0.06,0.16);blot(g,256,256,20,10,40,'100,112,60',0.06,0.14);spk(g,256,256,2500,'130,120,100',0.2,0.5);spk(g,256,256,1200,'30,26,20',0.2,0.5);return c;}
function tWin(brick){const W=512,Hh=256,[c,g]=cnv(W,Hh);if(brick){paintBrick(g,W,Hh);}else{g.fillStyle='#d8d4cb';g.fillRect(0,0,W,Hh);}blot(g,W,Hh,30,20,60,brick?'40,30,25':'110,100,85',0.04,0.1);streaks(g,W,Hh,16);for(let b=0;b<2;b++){const cx=(b+0.5)*256,x=cx-49;g.fillStyle='rgba(0,0,0,0.28)';g.fillRect(x-8,58,114,9);g.fillStyle='#e6e2d8';g.fillRect(x-4,64,106,116);const gr=g.createLinearGradient(0,68,0,176);if(b===0){gr.addColorStop(0,'#7d95a8');gr.addColorStop(0.55,'#3c4c5a');gr.addColorStop(1,'#232e38');}else{gr.addColorStop(0,'#2d363e');gr.addColorStop(1,'#12171c');}g.fillStyle=gr;g.fillRect(x,68,98,108);if(b===1){g.fillStyle='rgba(120,100,80,0.55)';g.fillRect(x,68,40,108);g.strokeStyle='rgba(210,220,230,0.5)';g.lineWidth=1;g.beginPath();g.moveTo(x+60,70);g.lineTo(x+80,120);g.lineTo(x+62,172);g.stroke();}g.fillStyle='#e6e2d8';g.fillRect(x+46,68,6,108);g.fillRect(x,120,98,5);g.fillStyle='rgba(255,255,255,0.13)';g.beginPath();g.moveTo(x+4,70);g.lineTo(x+40,70);g.lineTo(x+6,130);g.fill();g.fillStyle='#cfcabf';g.fillRect(x-9,178,116,8);g.fillStyle='rgba(0,0,0,0.3)';g.fillRect(x-6,186,110,6);}g.fillStyle='rgba(0,0,0,0.2)';g.fillRect(0,Hh-3,W,3);return c;}
function tOffice(){const [c,g]=cnv(256,256);const gr=g.createLinearGradient(0,0,256,256);gr.addColorStop(0,'#5d7d91');gr.addColorStop(0.5,'#33495a');gr.addColorStop(1,'#1f2d38');g.fillStyle=gr;g.fillRect(0,0,256,256);blot(g,256,256,12,20,50,'255,255,255',0.05,0.12);g.fillStyle='#a3a7a9';g.fillRect(0,196,256,60);g.fillStyle='rgba(0,0,0,0.25)';g.fillRect(0,196,256,4);g.fillStyle='#8c9296';for(let x=0;x<=256;x+=85)g.fillRect(x-2,0,4,196);g.fillStyle='#8c9296';g.fillRect(0,96,256,3);return c;}
function tLadder(){const [c,g]=cnv(64,64);g.clearRect(0,0,64,64);g.fillStyle='#5a5f66';g.fillRect(4,0,5,64);g.fillRect(55,0,5,64);g.fillStyle='#6d737a';g.fillRect(4,10,56,5);g.fillRect(4,42,56,5);return c;}
const KINDS={plaster:{t:tPlaster,su:4,sv:4},brick:{t:tBrick,su:2.4,sv:2.4},concrete:{t:tConcrete,su:4,sv:4},roof:{t:tRoof,su:4,sv:4},metal:{t:tMetal,su:2,sv:2},wood:{t:tWood,su:1.5,sv:1.5},pave:{t:tPave,su:2,sv:2},asphalt:{t:tAsphalt,su:8,sv:8,po:1},grass:{t:tGrass,su:6,sv:6,po:1},winA:{t:()=>tWin(false),su:7,sv:3,align:1},winB:{t:()=>tWin(true),su:7,sv:3,align:1},office:{t:tOffice,su:3,sv:3,align:1},flat:{t:null,su:1,sv:1},ladder:{t:tLadder,su:1,sv:0.6,alpha:1}};
const matCache={};
function mkTex(c){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,maxAniso);return t;}
function matFor(kind){if(matCache[kind])return matCache[kind];const K=KINDS[kind];const mp=K.t?mkTex(K.t()):null;const isMetal=(kind==='metal');const useBump=!isMobile&&!K.alpha;const usePbr=!isMobile;let m;
  if(usePbr){m=new THREE.MeshStandardMaterial({map:mp,bumpMap:(useBump&&mp)?mp:null,bumpScale:(kind==='brick'||kind==='pave')?1.4:0.6,roughness:isMetal?0.5:0.92,metalness:isMetal?0.3:0,vertexColors:true,side:K.alpha?THREE.DoubleSide:THREE.FrontSide,transparent:!!K.alpha,alphaTest:K.alpha?0.4:0});}
  else{m=new THREE.MeshLambertMaterial({map:mp,vertexColors:true,side:K.alpha?THREE.DoubleSide:THREE.FrontSide,transparent:!!K.alpha,alphaTest:K.alpha?0.4:0});}
  if(K.po){m.polygonOffset=true;m.polygonOffsetFactor=-3;m.polygonOffsetUnits=-3;}return matCache[kind]=m;}

/* ============ WORLD BUFFER ============ */
const CHUNK=96;const bufs=new Map();
class Buf{constructor(kind,cx,cz){this.kind=kind;this.cx=cx;this.cz=cz;this.cap=1024;this.pos=new Float32Array(this.cap*3);this.nor=new Float32Array(this.cap*3);this.col=new Float32Array(this.cap*3);this.uv=new Float32Array(this.cap*2);this.idx=new Uint32Array(this.cap*2);this.nv=0;this.ni=0;}
  need(nv,ni){if(this.nv+nv>this.cap){let nc=this.cap;while(nc<this.nv+nv)nc*=2;const g=(a,k)=>{const b=new Float32Array(nc*k);b.set(a);return b;};this.pos=g(this.pos,3);this.nor=g(this.nor,3);this.col=g(this.col,3);this.uv=g(this.uv,2);this.cap=nc;}if(this.ni+ni>this.idx.length){let n=this.idx.length;while(n<this.ni+ni)n*=2;const b=new Uint32Array(n);b.set(this.idx);this.idx=b;}}}
function getBuf(kind,x,z){const cx=Math.floor((x+MAP+60)/CHUNK),cz=Math.floor((z+MAP+60)/CHUNK),key=kind+'|'+cx+'|'+cz;let b=bufs.get(key);if(!b){b=new Buf(kind,cx,cz);bufs.set(key,b);}return b;}
const boxes=[];const GRID_CELL=16,GOFF=MAP+60,GN=Math.ceil((MAP*2+120)/GRID_CELL)+1;const grid=new Array(GN*GN);
function registerCollider(b){const gx0=Math.max(0,Math.floor((b.x0+GOFF)/GRID_CELL)),gx1=Math.min(GN-1,Math.floor((b.x1+GOFF)/GRID_CELL));const gz0=Math.max(0,Math.floor((b.z0+GOFF)/GRID_CELL)),gz1=Math.min(GN-1,Math.floor((b.z1+GOFF)/GRID_CELL));for(let gx=gx0;gx<=gx1;gx++)for(let gz=gz0;gz<=gz1;gz++){const k=gx*GN+gz;(grid[k]||(grid[k]=[])).push(b);}}
let qstamp=1;
function queryGrid(x,z,r){const out=[];qstamp++;const gx0=Math.max(0,Math.floor((x-r+GOFF)/GRID_CELL)),gx1=Math.min(GN-1,Math.floor((x+r+GOFF)/GRID_CELL));const gz0=Math.max(0,Math.floor((z-r+GOFF)/GRID_CELL)),gz1=Math.min(GN-1,Math.floor((z+r+GOFF)/GRID_CELL));for(let gx=gx0;gx<=gx1;gx++)for(let gz=gz0;gz<=gz1;gz++){const a=grid[gx*GN+gz];if(!a)continue;for(let i=0;i<a.length;i++){const b=a[i];if(b.q!==qstamp){b.q=qstamp;out.push(b);}}}return out;}
const OCC_CELL=8,occHash=new Map();
function occupy(x0,x1,z0,z1,pad){const rec={x0:x0-pad,x1:x1+pad,z0:z0-pad,z1:z1+pad};const gx0=Math.floor((rec.x0+MAP+20)/OCC_CELL),gx1=Math.floor((rec.x1+MAP+20)/OCC_CELL),gz0=Math.floor((rec.z0+MAP+20)/OCC_CELL),gz1=Math.floor((rec.z1+MAP+20)/OCC_CELL);for(let gx=gx0;gx<=gx1;gx++)for(let gz=gz0;gz<=gz1;gz++){const k=gx*10000+gz;let a=occHash.get(k);if(!a){a=[];occHash.set(k,a);}a.push(rec);}}
function isFree(x,z,r){if(Math.abs(x)>MAP-8||Math.abs(z)>MAP-8)return false;const gx=Math.floor((x+MAP+20)/OCC_CELL),gz=Math.floor((z+MAP+20)/OCC_CELL);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const a=occHash.get((gx+dx)*10000+(gz+dz));if(!a)continue;for(const o of a)if(x>o.x0-r&&x<o.x1+r&&z>o.z0-r&&z<o.z1+r)return false;}return true;}
const FACES=[{n:[1,0,0],v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},{n:[-1,0,0],v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},{n:[0,1,0],v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},{n:[0,-1,0],v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]},{n:[0,0,1],v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},{n:[0,0,-1],v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,-1,-1]]}];
const NC=1,NR=2,NV=4,KB=8;const _c=new THREE.Color();
function B(cx,y,cz,w,h,d,color,kind,fl){kind=kind||'concrete';fl=fl|0;
  if(!(fl&NV)){const K=KINDS[kind],buf=getBuf(kind,cx,cz);_c.setHex(color).convertSRGBToLinear();
    const vary=1+(vr()-0.5)*0.12,cr=_c.r*vary,cg=_c.g*vary,cb=_c.b*vary;
    const skipB=!(fl&KB)&&y<0.05;const nx=K.align?Math.max(1,Math.round(w/K.su)):1,nz=K.align?Math.max(1,Math.round(d/K.su)):1;
    for(let fi=0;fi<6;fi++){if(fi===3&&skipB)continue;const f=FACES[fi];buf.need(4,6);const base=buf.nv;
      for(let k=0;k<4;k++){const v=f.v[k],wx=cx+v[0]*w/2,wy=y+h/2+v[1]*h/2,wz=cz+v[2]*d/2;let u,vv;
        if(fi===2||fi===3){u=wx/K.su;vv=wz/K.sv;}else if(K.align){u=fi<2?(wz-(cz-d/2))/(d/nz):(wx-(cx-w/2))/(w/nx);vv=(wy-y)/K.sv;}else{u=(fi<2?wz:wx)/K.su;vv=wy/K.sv;}
        const ao=fi===2?1:(fi===3?0.8:0.62+0.38*Math.min(1,wy/3));const o=buf.nv;
        buf.pos[o*3]=wx;buf.pos[o*3+1]=wy;buf.pos[o*3+2]=wz;buf.nor[o*3]=f.n[0];buf.nor[o*3+1]=fi===3?1:f.n[1];buf.nor[o*3+2]=f.n[2];
        buf.col[o*3]=cr*ao;buf.col[o*3+1]=cg*ao;buf.col[o*3+2]=cb*ao;buf.uv[o*2]=u;buf.uv[o*2+1]=vv;buf.nv++;}
      const i=buf.ni;buf.idx[i]=base;buf.idx[i+1]=base+1;buf.idx[i+2]=base+2;buf.idx[i+3]=base;buf.idx[i+4]=base+2;buf.idx[i+5]=base+3;buf.ni+=6;}}
  if(!(fl&NC)){const b={x0:cx-w/2,x1:cx+w/2,y0:y,y1:y+h,z0:cz-d/2,z1:cz+d/2,ray:!(fl&NR),q:0};boxes.push(b);registerCollider(b);}}
function Q(x0,x1,z0,z1,y,kind,color){const K=KINDS[kind],buf=getBuf(kind,(x0+x1)/2,(z0+z1)/2);_c.setHex(color).convertSRGBToLinear();buf.need(4,6);const base=buf.nv;const P=[[x0,z1],[x1,z1],[x1,z0],[x0,z0]];for(const p of P){const o=buf.nv;buf.pos[o*3]=p[0];buf.pos[o*3+1]=y;buf.pos[o*3+2]=p[1];buf.nor[o*3]=0;buf.nor[o*3+1]=1;buf.nor[o*3+2]=0;buf.col[o*3]=_c.r;buf.col[o*3+1]=_c.g;buf.col[o*3+2]=_c.b;buf.uv[o*2]=p[0]/K.su;buf.uv[o*2+1]=p[1]/K.sv;buf.nv++;}const i=buf.ni;buf.idx[i]=base;buf.idx[i+1]=base+1;buf.idx[i+2]=base+2;buf.idx[i+3]=base;buf.idx[i+4]=base+2;buf.idx[i+5]=base+3;buf.ni+=6;}
function LQ(ax,az,nx,nz,y0,y1){const buf=getBuf('ladder',ax,az),tx=-nz*0.35,tz=nx*0.35;buf.need(4,6);const base=buf.nv,hh=(y1-y0)/0.6;const V=[[ax-tx,y0,az-tz,0,0],[ax+tx,y0,az+tz,1,0],[ax+tx,y1,az+tz,1,hh],[ax-tx,y1,az-tz,0,hh]];for(const v of V){const o=buf.nv;buf.pos[o*3]=v[0];buf.pos[o*3+1]=v[1];buf.pos[o*3+2]=v[2];buf.nor[o*3]=nx;buf.nor[o*3+1]=0;buf.nor[o*3+2]=nz;buf.col[o*3]=buf.col[o*3+1]=buf.col[o*3+2]=0.75;buf.uv[o*2]=v[3];buf.uv[o*2+1]=v[4];buf.nv++;}const i=buf.ni;buf.idx[i]=base;buf.idx[i+1]=base+1;buf.idx[i+2]=base+2;buf.idx[i+3]=base;buf.idx[i+4]=base+2;buf.idx[i+5]=base+3;buf.ni+=6;}
function G(geo,px,py,pz,sx,sy,sz,ry,color){const buf=getBuf('flat',px,pz),p=geo.attributes.position,n=geo.attributes.normal,ix=geo.index;_c.setHex(color).convertSRGBToLinear();const vary=1+(vr()-0.5)*0.15,cs=Math.cos(ry),sn=Math.sin(ry);const cnt=p.count;buf.need(cnt,ix?ix.count:cnt);const base=buf.nv;for(let i=0;i<cnt;i++){const x=p.getX(i)*sx,y=p.getY(i)*sy,z=p.getZ(i)*sz,o=buf.nv;const wy=py+y;buf.pos[o*3]=px+x*cs+z*sn;buf.pos[o*3+1]=wy;buf.pos[o*3+2]=pz-x*sn+z*cs;const nx=n.getX(i),nz=n.getZ(i);buf.nor[o*3]=nx*cs+nz*sn;buf.nor[o*3+1]=n.getY(i);buf.nor[o*3+2]=-nx*sn+nz*cs;const ao=(0.7+0.3*Math.min(1,wy/4))*vary;buf.col[o*3]=_c.r*ao;buf.col[o*3+1]=_c.g*ao;buf.col[o*3+2]=_c.b*ao;buf.nv++;}const m=ix?ix.count:cnt;for(let i=0;i<m;i++)buf.idx[buf.ni+i]=base+(ix?ix.getX(i):i);buf.ni+=m;}
const chunkMeshes=[];
function finalizeWorld(){for(const b of bufs.values()){if(!b.ni)continue;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(b.pos.slice(0,b.nv*3),3));g.setAttribute('normal',new THREE.BufferAttribute(b.nor.slice(0,b.nv*3),3));g.setAttribute('color',new THREE.BufferAttribute(b.col.slice(0,b.nv*3),3));g.setAttribute('uv',new THREE.BufferAttribute(b.uv.slice(0,b.nv*2),2));g.setIndex(new THREE.BufferAttribute(b.idx.slice(0,b.ni),1));g.computeBoundingSphere();const m=new THREE.Mesh(g,matFor(b.kind));m.castShadow=b.kind!=='ladder'&&b.kind!=='asphalt'&&b.kind!=='grass';m.receiveShadow=true;scene.add(m);chunkMeshes.push({m,x:g.boundingSphere.center.x,z:g.boundingSphere.center.z});}bufs.clear();}
function makeGroundTex(){const t=mkTex(tDirt());t.repeat.set(120,120);return t;}
const groundGeo=new THREE.PlaneGeometry(MAP*2+120,MAP*2+120,60,60);
(function(){const pos=groundGeo.attributes.position,col=new Float32Array(pos.count*3);for(let i=0;i<pos.count;i++){const x=pos.getX(i),y=pos.getY(i);const v=(Math.sin(x*0.031+1.3)*Math.sin(y*0.027+0.4)+0.6*Math.sin(x*0.083+y*0.061))/1.6;const br=1+0.1*v;col[i*3]=br;col[i*3+1]=br*(1+0.05*v);col[i*3+2]=br*(1-0.06*v);}groundGeo.setAttribute('color',new THREE.BufferAttribute(col,3));})();
const groundTex=makeGroundTex();
let groundMat;
if(isMobile)groundMat=new THREE.MeshLambertMaterial({map:groundTex,vertexColors:true});else groundMat=new THREE.MeshStandardMaterial({map:groundTex,bumpMap:groundTex,bumpScale:1.2,roughness:1,metalness:0,vertexColors:true});
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
function wallSeg(axis,a0,a1,fixed,y0,y1,color,kind,ops,T){const cuts=[a0,a1];for(const o of ops){cuts.push(clamp(o.c-o.w/2,a0,a1),clamp(o.c+o.w/2,a0,a1));}cuts.sort((a,b)=>a-b);for(let i=0;i<cuts.length-1;i++){const p=cuts[i],q=cuts[i+1];if(q-p<0.02)continue;const mid=(p+q)/2;const open=ops.filter(o=>mid>o.c-o.w/2&&mid<o.c+o.w/2).sort((a,b)=>a.y0-b.y0);let cur=y0;const put=(ya,yb)=>{if(yb-ya<0.02)return;if(axis==='x')B(mid,ya,fixed,q-p,yb-ya,T,color,kind);else B(fixed,ya,mid,T,yb-ya,q-p,color,kind);};for(const o of open){put(cur,o.y0);cur=Math.max(cur,o.y1);}put(cur,y1);}}
function slabWithHole(x0,x1,z0,z1,y,th,hole,color,kind){const bx=(a,b,c,d)=>{if(b-a>0.02&&d-c>0.02)B((a+b)/2,y,(c+d)/2,b-a,th,d-c,color,kind);};if(!hole){bx(x0,x1,z0,z1);return;}bx(x0,hole.x0,z0,z1);bx(hole.x1,x1,z0,z1);bx(hole.x0,hole.x1,z0,hole.z0);bx(hole.x0,hole.x1,hole.z1,z1);}
const SIDE={n:[0,-1],s:[0,1],e:[1,0],w:[-1,0]};
function addLadder(x,z,side,y0,yTop){const [nx,nz]=SIDE[side],ax=x+nx*0.06,az=z+nz*0.06;LQ(ax,az,nx,nz,y0,yTop+0.9);ladders.push({nx,nz,y0,yTop,bx:ax+nx*0.75,bz:az+nz*0.75,cx:ax+nx*0.36,cz:az+nz*0.36,ex:ax-nx*0.85,ez:az-nz*0.85});}
function enterBuilding(cx,cz,w,d,floors,ox,oz){const T=0.4,x0=cx-w/2,x1=cx+w/2,z0=cz-d/2,z1=cz+d/2,top=floors*FH;const brick=rand()<0.4,kind=brick?'brick':'plaster',wc=brick?wpick(BRICKC):wpick(WALLC),rc=wpick(ROOFC);const ds=rand()<0.5?(ox<0?'w':'e'):(oz<0?'n':'s');const coreW=3.3,coreL=6.5,ix0=x0+T/2,ix1=x1-T/2,iz0=z0+T/2,iz1=z1-T/2;const coreE=ds==='w'?true:ds==='e'?false:rand()<0.5,coreS=ds==='n'?true:ds==='s'?false:rand()<0.5;const xa=coreE?ix1-coreW:ix0,za=coreS?iz1-coreL:iz0,roomEnd=coreS?za:za+coreL,dw=coreS?1:-1;const doorC=(ds==='n'||ds==='s')?cx+wr(-w*0.15,w*0.15):cz+wr(-d*0.15,d*0.15);const flights=[];for(let fl=0;fl<floors;fl++){const isA=fl%2===0,fx0=isA?xa:xa+1.75,fx1=isA?xa+1.55:xa+coreW,zS=isA?roomEnd:roomEnd+dw*coreL,dz=isA?dw:-dw;for(let i=0;i<16;i++)B((fx0+fx1)/2,fl*FH,zS+dz*(i+0.5)*RUN,fx1-fx0,(i+1)*RISE,RUN,0x8f8f89,'concrete');const zE=zS+dz*16*RUN;flights.push({x0:fx0,x1:fx1,z0:Math.min(zS,zE),z1:Math.max(zS,zE),zS});}const mkOps=(len,c0,hasDoor)=>{const o=[];if(hasDoor)o.push({c:doorC,w:2.0,y0:0,y1:2.3});const n=Math.max(1,Math.floor((len-2.4)/3.6));for(let fl=0;fl<floors;fl++)for(let i=0;i<n;i++){const c=c0+1.2+(len-2.4)*(i+0.5)/n;if(fl===0&&hasDoor&&Math.abs(c-doorC)<1.8)continue;o.push({c,w:1.4,y0:fl*FH+0.95,y1:fl*FH+2.2});}return o;};const sills=(ops,axis,fixed)=>{for(const o of ops)if(o.y0>0){if(axis==='x')B(o.c,o.y0-0.08,fixed,o.w+0.3,0.08,T+0.2,0xcfc9bd,'concrete',NC);else B(fixed,o.y0-0.08,o.c,T+0.2,0.08,o.w+0.3,0xcfc9bd,'concrete',NC);}};const on=mkOps(w,x0,ds==='n'),os=mkOps(w,x0,ds==='s'),ow=mkOps(d,z0,ds==='w'),oe=mkOps(d,z0,ds==='e');wallSeg('x',x0-T/2,x1+T/2,z0,0,top,wc,kind,on,T);wallSeg('x',x0-T/2,x1+T/2,z1,0,top,wc,kind,os,T);wallSeg('z',z0+T/2,z1-T/2,x0,0,top,wc,kind,ow,T);wallSeg('z',z0+T/2,z1-T/2,x1,0,top,wc,kind,oe,T);sills(on,'x',z0);sills(os,'x',z1);sills(ow,'z',x0);sills(oe,'z',x1);Q(ix0,ix1,iz0,iz1,0.012,'concrete',0x8c8c86);for(let fl=1;fl<=floors;fl++){const hole=flights[fl-1];slabWithHole(ix0,ix1,iz0,iz1,fl*FH-0.25,0.25,hole,fl===floors?rc:0x8a8a86,fl===floors?'roof':'concrete');B((hole.x0+hole.x1)/2,fl*FH,hole.zS,hole.x1-hole.x0,1.0,0.06,0x55595e,'metal',NR);}B(cx,top,z0,w+T,1.0,0.3,wc,kind);B(cx,top,z1,w+T,1.0,0.3,wc,kind);B(x0,top,cz,0.3,1.0,d-T,wc,kind);B(x1,top,cz,0.3,1.0,d-T,wc,kind);const px=cx+(coreE?-w/4:w/4),pz=cz+(coreS?-d/4:d/4);B(px,top,pz,1.6,0.9,1.2,0x8a8f94,'metal');roofSpots.push([px+1.6,pz,top]);const dpx=ds==='w'?x0:ds==='e'?x1:doorC,dpz=ds==='n'?z0:ds==='s'?z1:doorC;for(let fl=0;fl<floors;fl++)for(let k=0;k<2;k++)for(let a=0;a<6;a++){const fx=wr(ix0+1.2,ix1-1.2),fz=wr(iz0+1.2,iz1-1.2);if(fx>xa-1&&fx<xa+coreW+1&&fz>za-1&&fz<za+coreL+1)continue;if(Math.hypot(fx-dpx,fz-dpz)<3)continue;const t=wpick([[1.4,0.8,0.8],[0.9,1.9,0.5],[1.7,0.5,0.9],[1.0,1.0,1.0]]);B(fx,fl*FH,fz,t[0],t[1],t[2],0x6b5a45,'wood');break;}occupy(x0-0.3,x1+0.3,z0-0.3,z1+0.3,0.5);ENTER.push({cx,cz,w,d,floors,xa,za,roomEnd,dw,coreE,coreS,ds});}
function facade(cx,cz,w,d,floors,ox,oz){const t=rand(),h=floors*FH+0.5;let kind,col;if(floors>=4&&t<0.45){kind='office';col=wpick(OFFC);}else if(t<0.5){kind='winB';col=wpick(BRICKC);}else{kind='winA';col=wpick(WALLC);}B(cx,0,cz,w,h,d,col,kind);B(cx,h,cz,w+0.3,0.3,d+0.3,wpick(ROOFC),'roof');DECO=true;B(cx,0,cz,w+0.3,0.7,d+0.3,shade(col,0.7),'concrete',NC);B(cx,h-0.45,cz,w+0.45,0.45,d+0.45,shade(col,0.9),'concrete',NC);if(floors>=2)B(cx,FH-0.12,cz,w+0.2,0.16,d+0.2,shade(col,0.85),'concrete',NC);B(cx+w/2+0.07,0,cz+d/2-0.6,0.14,h,0.14,0x5a5e63,'metal',NC);for(let k=0;k<3;k++){if(drand()<0.55){const sd=drand()<0.5?1:-1;B(cx+dr(-w/3,w/3),dr(1.2,Math.max(1.5,h-2)),cz+sd*(d/2+0.28),0.8,0.55,0.55,0xa4a9ad,'metal',NC);}}DECO=false;if(rand()<0.6)B(cx+wr(-w/4,w/4),h+0.3,cz+wr(-d/4,d/4),1.6,0.9,1.2,0x8a8f94,'metal');if(floors>=3&&rand()<0.5)G(cylGeo,cx+wr(-w/4,w/4),h+0.3+1.1,cz+wr(-d/4,d/4),1.0,2.2,1.0,0,0x7a5f4a);if(floors>=2&&floors<=6&&rand()<0.3){const side=rand()<0.5?(ox<0?'w':'e'):(oz<0?'n':'s'),[nx,nz]=SIDE[side];const lx=side==='n'||side==='s'?cx+wr(-w/4,w/4):cx+nx*w/2,lz=side==='w'||side==='e'?cz+wr(-d/4,d/4):cz+nz*d/2;addLadder(lx,lz,side,0,h+0.3);B(cx,h+0.3,cz-d/2,w,0.9,0.25,0x7d7a72,'concrete');B(cx,h+0.3,cz+d/2,w,0.9,0.25,0x7d7a72,'concrete');B(cx-w/2,h+0.3,cz,0.25,0.9,d,0x7d7a72,'concrete');B(cx+w/2,h+0.3,cz,0.25,0.9,d,0x7d7a72,'concrete');}occupy(cx-w/2,cx+w/2,cz-d/2,cz+d/2,0.4);}
function ruin(cx,cz,w,d){const kind=rand()<0.5?'brick':'plaster',col=kind==='brick'?wpick(BRICKC):wpick(WALLC);const sides=[[cx,cz-d/2,true],[cx,cz+d/2,true],[cx-w/2,cz,false],[cx+w/2,cz,false]];for(const [x,z,ax] of sides){if(rand()<0.25)continue;const len=ax?w:d;let cur=-len/2;while(cur<len/2-0.5){const seg=Math.min(wr(1.5,4),len/2-cur),h=wpick([0.8,1.6,2.4,3.4,4.6]),m=cur+seg/2;if(ax)B(x+m,0,z,seg,h,0.4,col,kind);else B(x,0,z+m,0.4,h,seg,col,kind);cur+=seg+wr(0.2,1.5);}}const pc=wpick(CONCRETEC),n=8+((rand()*6)|0);for(let i=0;i<n;i++){const s=wr(0.4,1.4);B(cx+wr(-w/2,w/2),0,cz+wr(-d/2,d/2),s,wr(0.3,0.9),s,shade(pc,0.6+rand()*0.4),'concrete');}const sx=cx+wr(-w/4,w/4),sz=cz+wr(-d/4,d/4);B(sx-2,0,sz,0.5,2.4,0.5,pc,'concrete');B(sx+2,0,sz,0.5,2.4,0.5,pc,'concrete');B(sx,2.4,sz,5,0.25,wr(3,4.5),pc,'concrete');for(let i=0;i<6;i++)B(cx+wr(-w/3,w/3),wr(0,0.5),cz+wr(-d/3,d/3),0.06,wr(1.5,2.5),0.06,0x6a3a2a,'flat',NC);occupy(cx-w/2,cx+w/2,cz-d/2,cz+d/2,0.3);}
function tree(x,z,s){const th=2.4*s+rand()*1.2,cr=1.5*s,gc=wpick(GREENS);G(cylGeo,x,th/2,z,0.15*s,th,0.15*s,0,0x5a4632);G(icoGeo,x,th+cr*0.4,z,cr,cr*0.9,cr,rand()*6,gc);G(icoGeo,x+wr(-.5,.5)*s,th+cr*1.15,z+wr(-.5,.5)*s,cr*0.7,cr*0.7,cr*0.7,rand()*6,shade(gc,1.12));B(x,0,z,0.4,th,0.4,0,'flat',NV);DECO=true;for(let i=0;i<5;i++){const a=drand()*TAU,rr=cr*0.6*drand(),hy=th+cr*(0.25+drand()*0.95);G(icoGeo,x+Math.cos(a)*rr,hy,z+Math.sin(a)*rr,cr*(0.5+drand()*0.35),cr*(0.45+drand()*0.35),cr*(0.5+drand()*0.35),drand()*6,shade(gc,0.8+drand()*0.4));}G(cylGeo,x,0.25,z,0.26*s,0.5,0.26*s,0,0x5a4632);DECO=false;}
function lamp(x,z){G(cylGeo,x,2.75,z,0.07,5.5,0.07,0,0x3b3f44);B(x+0.5,5.4,z,1.1,0.12,0.25,0x3b3f44,'flat',NC);B(x,0,z,0.25,5.5,0.25,0,'flat',NV);}
function car(x,z,alongX,col,burnt){const lx=alongX?4.2:1.85,lz=alongX?1.85:4.2,cl=alongX?2.2:1.7,cd=alongX?1.7:2.2;B(x,0.28,z,lx,0.7,lz,burnt?0x1c1a18:col,'flat');B(x-(alongX?0.1:0),0.98,z-(alongX?0:0.1),cl,0.55,cd,burnt?0x141210:shade(col,0.75),'flat');B(x-(alongX?0.1:0),1.08,z-(alongX?0:0.1),cl+0.03,0.32,cd+0.03,0x1b2733,'flat',NC);for(const a of[-1,1])for(const b of[-1,1]){if(burnt&&rand()<0.3)continue;const wx=x+(alongX?a*1.3:b*0.95),wz=z+(alongX?b*0.95:a*1.3);B(wx,0,wz,alongX?0.75:0.3,0.6,alongX?0.3:0.75,0x111111,'flat',NC);}occupy(x-lx/2,x+lx/2,z-lz/2,z+lz/2,0.3);}
function bus(x,z,alongX,col){
  const lx=alongX?10.8:2.55,lz=alongX?2.55:10.8;
  const skirt=shade(col,0.5),band=shade(col,0.85),roofC=shade(col,0.7);
  B(x,0.35,z,lx,0.45,lz,0x1b1d21,'flat');
  B(x,0.85,z,lx,0.75,lz,col,'flat');
  B(x,1.55,z,lx,0.72,lz,0x2a3a48,'flat');
  B(x,1.92,z,lx,0.10,lz,band,'flat');
  B(x,2.02,z,lx-0.15,0.14,lz-0.15,roofC,'metal');
  B(x-1.6,2.22,z,0.85,0.28,1.05,0x8a8a86,'metal');
  B(x+1.9,2.16,z,0.55,0.16,0.7,0x6a6a66,'metal');
  if(alongX){
    B(x,1.05,z-lz/2+0.01,lx-0.2,0.14,0.02,skirt,'flat',NC);
    B(x,1.05,z+lz/2-0.01,lx-0.2,0.14,0.02,skirt,'flat',NC);
  }else{
    B(x-lx/2+0.01,1.05,z,0.02,0.14,lz-0.2,skirt,'flat',NC);
    B(x+lx/2-0.01,1.05,z,0.02,0.14,lz-0.2,skirt,'flat',NC);
  }
  for(let i=0;i<7;i++){
    const u=-lx/2+0.7+i*((lx-1.4)/6);
    if(alongX){
      B(x+u,1.55,z-lz/2+0.02,0.12,0.72,0.05,col,'flat',NC);
      B(x+u,1.55,z+lz/2-0.02,0.12,0.72,0.05,col,'flat',NC);
    }else{
      B(x-lx/2+0.02,1.55,z+u,0.05,0.72,0.12,col,'flat',NC);
      B(x+lx/2-0.02,1.55,z+u,0.05,0.72,0.12,col,'flat',NC);
    }
  }
  if(alongX){
    B(x-lx/2+0.02,1.55,z,0.05,0.72,lz-0.35,0x1c2b38,'flat',NC);
    B(x+lx/2+0.02,1.55,z,0.05,0.72,lz-0.35,0x1c2b38,'flat',NC);
    B(x-lx/2-0.01,0.7,z-0.65,0.06,0.22,0.42,0xfff2c0,'flat',NC);
    B(x-lx/2-0.01,0.7,z+0.65,0.06,0.22,0.42,0xfff2c0,'flat',NC);
    B(x+lx/2+0.01,0.75,z-0.65,0.06,0.18,0.38,0xc0392b,'flat',NC);
    B(x+lx/2+0.01,0.75,z+0.65,0.06,0.18,0.38,0xc0392b,'flat',NC);
    B(x-lx/2+0.05,2.05,z,0.06,0.22,0.9,0x1a1a18,'flat',NC);
    B(x-lx/2+1.35,0.95,z+lz/2+0.005,0.9,1.85,0.03,skirt,'flat',NC);
    B(x-lx/2+0.1,1.7,z+lz/2+0.25,0.06,0.22,0.32,0x101418,'flat',NC);
    B(x-lx/2+0.1,1.7,z-lz/2-0.25,0.06,0.22,0.32,0x101418,'flat',NC);
    for(const [wx,wz] of [[-lx/2+1.8,-lz/2+0.1],[-lx/2+1.8,lz/2-0.1],[lx/2-1.6,-lz/2+0.1],[lx/2-1.6,lz/2-0.1]]){
      B(x+wx,0,wz,0.75,0.84,0.24,0x0e1014,'flat',NC);
      B(x+wx,0,wz,0.32,0.84,0.26,0x2a2c30,'flat',NC);
    }
  }else{
    B(x,1.55,z-lz/2+0.02,lx-0.35,0.72,0.05,0x1c2b38,'flat',NC);
    B(x,1.55,z+lz/2-0.02,lx-0.35,0.72,0.05,0x1c2b38,'flat',NC);
    B(x-0.65,0.7,z-lz/2-0.01,0.42,0.22,0.06,0xfff2c0,'flat',NC);
    B(x+0.65,0.7,z-lz/2-0.01,0.42,0.22,0.06,0xfff2c0,'flat',NC);
    B(x-0.65,0.75,z+lz/2+0.01,0.38,0.18,0.06,0xc0392b,'flat',NC);
    B(x+0.65,0.75,z+lz/2+0.01,0.38,0.18,0.06,0xc0392b,'flat',NC);
    B(x,2.05,z-lz/2+0.05,0.9,0.22,0.06,0x1a1a18,'flat',NC);
    B(x,0.95,z+lz/2-1.35,0.9,1.85,0.03,skirt,'flat',NC);
    B(x+0.25,1.7,z-lz/2+0.1,0.32,0.22,0.06,0x101418,'flat',NC);
    B(x-0.25,1.7,z-lz/2+0.1,0.32,0.22,0.06,0x101418,'flat',NC);
    for(const [wx,wz] of [[-lx/2+0.1,-lz/2+1.8],[-lx/2+0.1,lz/2-1.6],[lx/2-0.1,-lz/2+1.8],[lx/2-0.1,lz/2-1.6]]){
      B(x+wx,0,z+wz,0.24,0.84,0.75,0x0e1014,'flat',NC);
      B(x+wx,0,z+wz,0.26,0.84,0.32,0x2a2c30,'flat',NC);
    }
  }
  occupy(x-lx/2,x+lx/2,z-lz/2,z+lz/2,0.4);
}
function planks(x,z,alongX){const c=0x9b7240;const n=3+(rand()*3|0);for(let i=0;i<n;i++){const off=(i-n/2)*0.18;if(alongX){B(x,0.05+i*0.06,z+off,3.4,0.09,0.16,c,'wood');}else{B(x+off,0.05+i*0.06,z,0.16,0.09,3.4,c,'wood');}}if(rand()<0.4){if(alongX)B(x,0.24,z,3.4,0.1,0.7,shade(c,0.85),'wood');else B(x,0.24,z,0.7,0.1,3.4,shade(c,0.85),'wood');}occupy(x-(alongX?1.7:0.35),x+(alongX?1.7:0.35),z-(alongX?0.35:1.7),z+(alongX?0.35:1.7),0.2);}
function oilCluster(x,z,n){for(let i=0;i<n;i++){const a=rand()*TAU,r=0.3+rand()*0.9;const px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;barrel(px,pz);}occupy(x-1.5,x+1.5,z-1.5,z+1.5,0.2);}
function tankWreck(cx,cz){const color=wpick(MILITARY_GREEN);B(cx,0.4,cz,3.2,1.4,6.5,color,'metal');B(cx,1.8,cz-0.5,2.6,1.0,3.0,shade(color,0.9),'metal');B(cx,1.8,cz+2,0.3,0.3,3.5,shade(color,0.8),'metal',NC);B(cx-1.6,0.2,cz,0.6,0.6,6.5,0x1a1a1a,'flat');B(cx+1.6,0.2,cz,0.6,0.6,6.5,0x1a1a1a,'flat');occupy(cx-2,cx+2,cz-3.5,cz+3.5,0.5);}
function sandbags(x,z,n){for(let i=0;i<n;i++)B(x+wr(-1.6,1.6),wr(0,0.6),z+wr(-1.6,1.6),0.8,0.26,0.5,0xb8a878,'flat');}
function crateStack(x,z){const s=wr(1.1,1.7);B(x,0,z,s,s,s,wpick(CRATEC),'wood');if(rand()<0.4)B(x+wr(-.2,.2),s,z+wr(-.2,.2),s*0.8,s*0.8,s*0.8,wpick(CRATEC),'wood');}
function container(cx,cz,alongX,color){const w=alongX?6.2:2.4,d=alongX?2.4:6.2,h=2.5,t=0.15;B(cx,0,cz,w,0.15,d,0x202224,'flat');if(alongX){B(cx,0,cz-d/2+t/2,w,h,t,color,'metal');B(cx,0,cz+d/2-t/2,w,h,t,color,'metal');B(cx-w/2+t/2,0,cz,t,h,d,color,'metal');B(cx+w/2-t/2,1.7,cz,t,h-1.7,d,color,'metal');}else{B(cx-w/2+t/2,0,cz,t,h,d,color,'metal');B(cx+w/2-t/2,0,cz,t,h,d,color,'metal');B(cx,0,cz-d/2+t/2,w,h,t,color,'metal');B(cx,1.7,cz+d/2-t/2,w,h-1.7,t,color,'metal');}B(cx,h-t,cz,w,t,d,0x30363c,'metal');occupy(cx-w/2,cx+w/2,cz-d/2,cz+d/2,0.3);}
function barrel(x,z){const c=wpick([0x8a3a2a,0x2a4a8a,0x6a6a6a,0x8a6a2a]);G(cylGeo,x,0.45,z,0.32,0.9,0.32,0,c);B(x,0,z,0.6,0.9,0.6,0,'flat',NV);}
function dumpster(x,z){const c=wpick([0x2a6a3a,0x8a2a2a,0x2a3a6a]);B(x,0.2,z,2.2,1.3,1.2,c,'metal');B(x,1.5,z,2.3,0.14,1.3,shade(c,0.7),'metal',NC);occupy(x-1.2,x+1.2,z-0.7,z+0.7,0.3);}
function watchtower(x,z){const h=(wr(11,17))|0,w=4,d=4,cs=0.4,wc=0x6a4a2a,py=h-0.3;for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(x+a*(w/2-cs/2),0,z+b*(d/2-cs/2),cs,h,cs,wc,'wood');for(let y=2;y<h-0.5;y+=3){B(x,y,z-d/2+cs/2,w-cs,0.14,0.14,wc,'wood',NC);B(x,y,z+d/2-cs/2,w-cs,0.14,0.14,wc,'wood',NC);B(x-w/2+cs/2,y,z,0.14,0.14,d-cs,wc,'wood',NC);B(x+w/2-cs/2,y,z,0.14,0.14,d-cs,wc,'wood',NC);}B(x,py,z,w+0.8,0.25,d+0.8,0x8a8a84,'roof');B(x,py+2.2,z,w+1.2,0.2,d+1.2,0x5c6772,'roof');for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(x+a*(w/2),py,z+b*(d/2),0.12,2.2,0.12,0x3a3f44,'metal',NC);B(x,py+0.5,z-d/2-0.3,w+0.6,0.9,0.1,0x5a5f64,'metal',NC);B(x,py+0.5,z+d/2+0.3,w+0.6,0.9,0.1,0x5a5f64,'metal',NC);B(x-w/2-0.3,py+0.5,z,0.1,0.9,d+0.6,0x5a5f64,'metal',NC);B(x+w/2+0.3,py+0.5,z,0.1,0.9,d+0.6,0x5a5f64,'metal',NC);addLadder(x+w/2-0.2,z,'e',0,py);roofSpots.push([x,z,py+0.3]);occupy(x-w/2,x+w/2,z-d/2,z+d/2,0.5);}

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

/* Viewmodel Group Setup */
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

  // Pistol
  const pGroup = new THREE.Group();
  const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.22), gunMat);
  const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), stockMat);
  pGrip.position.set(0, -0.08, 0.06);
  pGrip.rotation.x = 0.2;
  pGroup.add(pBody, pGrip);
  weaponMeshes.pistol = pGroup;

  // Rifle
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

/* Fixed viewmodel hand placement according to active weapon type */
function updateArmTransforms(weaponKey, isADS){
  const p = viewModelGroup.position;
  const r = viewModelGroup.rotation;
  
  if(isADS){
    p.set(0, -0.14, -0.28);
  } else {
    p.set(0.18, -0.18, -0.38);
  }

  for(const k in weaponMeshes){
    weaponMeshes[k].visible = (k === weaponKey || (k==='rifle' && weaponKey!=='pistol')); 
  }

  if(weaponKey === 'pistol'){
    // FIX: Both hands firmly grip pistol handle together
    rightArm.position.set(0.04, -0.1, 0.08);
    rightArm.rotation.set(0.4, -0.1, -0.1);

    leftArm.position.set(-0.02, -0.11, 0.07);
    leftArm.rotation.set(0.45, 0.25, 0.15);
  } else {
    // FIX: Right hand on rear grip, Left hand forward on handguard
    rightArm.position.set(0.08, -0.1, 0.12);
    rightArm.rotation.set(0.5, -0.1, -0.1);

    leftArm.position.set(-0.12, -0.12, -0.18);
    leftArm.rotation.set(0.3, 0.4, 0.2);
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
