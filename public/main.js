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
const FACES=[{n:[1,0,0],v:[[1,-1,1],[1,-1,-1],[1,1,-1],[1,1,1]]},{n:[-1,0,0],v:[[-1,-1,-1],[-1,-1,1],[-1,1,1],[-1,1,-1]]},{n:[0,1,0],v:[[-1,1,1],[1,1,1],[1,1,-1],[-1,1,-1]]},{n:[0,-1,0],v:[[-1,-1,-1],[1,-1,-1],[1,-1,1],[-1,-1,1]]},{n:[0,0,1],v:[[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]},{n:[0,0,-1],v:[[1,-1,-1],[-1,-1,-1],[-1,1,-1],[1,1,-1]]}];
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
    B(x+lx/2-0.02,1.55,z,0.05,0.72,lz-0.35,0x1c2b38,'flat',NC);
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
function watchtower(x,z){const h=(wr(11,17))|0,w=4,d=4,cs=0.4,wc=0x6a4a2a,py=h-0.3;for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])B(x+a*(w/2-cs/2),0,z+b*(d/2-cs/2),cs,h,cs,wc,'wood');for(let y=2;y<h-0.5;y+=3){B(x,y,z-d/2+cs/2,w-cs,0.14,0.14,wc,'wood',NC);B(x,y,z+d/2-cs/2,w-cs,0.14,0.14,wc,'wood',NC);B(x-w/2+cs/2,y,z,0.14,0.14,d-cs,wc,'wood',NC);B(x+w/2-cs/2,y,z,0.14,0.14,d-cs,wc,'wood',NC);}B(x,py,z,w,0.18,d,0x8a8a80,'concrete');B(x,py+0.18,z-d/2+0.05,w,0.9,0.07,wc,'wood',NC);B(x,py+0.18,z+d/2-0.05,w,0.9,0.07,wc,'wood',NC);B(x+w/2-0.05,py+0.18,z,0.07,0.9,d,wc,'wood',NC);B(x-w/2+0.05,py+0.18,z,0.07,0.9,d,wc,'wood',NC);B(x,h+1.6,z,w+0.5,0.14,d+0.5,0x3a2a1a,'wood');addLadder(x-w/2,z,'w',0,py+0.18);roofSpots.push([x+0.5,z,py+0.18]);occupy(x-w/2-1,x+w/2+1,z-d/2-1,z+d/2+1,0.5);}
function lots(cx,cz,dtn,res){for(const [sx,sz] of [[-1,-1],[1,-1],[-1,1],[1,1]]){const lcx=cx+sx*CELL/2,lcz=cz+sz*CELL/2,bw=CELL-wr(0.4,1.4),bd=CELL-wr(0.4,1.4),rr=rand();const floors=dtn?wpick([2,3,3,4,5,6,7]):res?wpick([1,2,2,3]):wpick([1,1,2]);if(rr<(dtn?0.11:0.09)&&floors>=2)enterBuilding(lcx,lcz,bw,bd,Math.min(floors,3),sx,sz);else if(rr<0.92)facade(lcx,lcz,bw,bd,floors,sx,sz);else ruin(lcx,lcz,bw,bd);}for(let k=0;k<2;k++){const ax=cx+wr(-BLOCK/2,BLOCK/2),az=cz+wr(-BLOCK/2,BLOCK/2);if(!isFree(ax,az,1.5))continue;if(rand()<0.4)crateStack(ax,az);else if(rand()<0.6)barrel(ax,az);else dumpster(ax,az);}}
function park(cx,cz){Q(cx-BLOCK/2,cx+BLOCK/2,cz-BLOCK/2,cz+BLOCK/2,0.01,'grass',0xffffff);const n=7+((rand()*5)|0);for(let i=0;i<n;i++){const x=cx+wr(-12,12),z=cz+wr(-12,12);if(isFree(x,z,1.5)){tree(x,z,wr(0.9,1.5));occupy(x,x,z,z,1);}}for(let i=0;i<3;i++)B(cx+wr(-9,9),0,cz+wr(-9,9),1.6,0.5,0.5,0x6b4a2b,'wood');if(rand()<0.5&&isFree(cx,cz,5))watchtower(cx,cz);}
function parking(cx,cz){Q(cx-BLOCK/2,cx+BLOCK/2,cz-BLOCK/2,cz+BLOCK/2,0.012,'asphalt',0xbbbbbb);for(let i=0;i<9;i++){const x=cx+wr(-11,11),z=cz+wr(-11,11);if(isFree(x,z,3))car(x,z,rand()<0.5,wpick(CARC),rand()<0.35);}}
function forest(cx,cz){Q(cx-BLOCK/2,cx+BLOCK/2,cz-BLOCK/2,cz+BLOCK/2,0.01,'grass',0xdddddd);const n=13+((rand()*8)|0);for(let i=0;i<n;i++){const x=cx+wr(-13,13),z=cz+wr(-13,13);if(isFree(x,z,1.5)){tree(x,z,wr(1,1.8));occupy(x,x,z,z,1.2);}}}
function plaza(cx,cz){Q(cx-BLOCK/2,cx+BLOCK/2,cz-BLOCK/2,cz+BLOCK/2,0.012,'pave',0xd0cdc4);G(cylGeo,cx,0.3,cz,5,0.6,5,0,0x8f8f88);G(cylGeo,cx,0.1,cz,4.2,0.2,4.2,0,0x2f4a5a);B(cx,0,cz,7,5.5,7,0,'flat',NV);B(cx,0.6,cz,1.2,4.5,1.2,0xa8a69e,'concrete',NC);B(cx,5.1,cz,2,0.3,2,0xa8a69e,'concrete',NC);for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]]){sandbags(cx+a*10,cz+b*10,6);tree(cx+a*12,cz+b*6,1.2);}occupy(cx-BLOCK/2,cx+BLOCK/2,cz-BLOCK/2,cz+BLOCK/2,0);}
function yard(cx,cz){for(let i=0;i<6;i++){const x=cx+wr(-9,9),z=cz+wr(-9,9);if(isFree(x,z,4))container(x,z,rand()<0.5,wpick([0xb3452f,0x2f6f9f,0x3f8a58,0xc79a2f,0x5a5a5a]));}for(let i=0;i<3;i++){const x=cx+wr(-10,10),z=cz+wr(-10,10);if(isFree(x,z,4)){G(cylGeo,x,3,z,3,6,3,0,0xc8c8c0);B(x,0,z,4.8,6,4.8,0,'flat',NV);occupy(x-3,x+3,z-3,z+3,0.5);}}}
(function generateCity(){
  for(let i=-EXT-1;i<=EXT;i++){const s=(i+0.5)*STEP_B;occupy(s-3.2,s+3.2,-MAP,MAP,0);occupy(-MAP,MAP,s-3.2,s+3.2,0);}
  for(let ix=-EXT;ix<=EXT;ix++)for(let iz=-EXT;iz<=EXT;iz++){
    const cx=ix*STEP_B,cz=iz*STEP_B,d=Math.hypot(cx,cz),h=BLOCK/2;
    B(cx,0,cz-h-0.9,BLOCK+3.6,0.12,1.8,0xa8a59d,'pave');B(cx,0,cz+h+0.9,BLOCK+3.6,0.12,1.8,0xa8a59d,'pave');
    B(cx-h-0.9,0,cz,1.8,0.12,BLOCK,0xa8a59d,'pave');B(cx+h+0.9,0,cz,1.8,0.12,BLOCK,0xa8a59d,'pave');
    const ex=ix*STEP_B+STEP_B/2,ez=iz*STEP_B+STEP_B/2;
    Q(ex-3.2,ex+3.2,ez-3.2,ez+3.2,0.035,'asphalt',0xffffff);
    if(rand()<0.55)lamp(cx+h+1.5,cz+h+1.5);
    if(ix===0&&iz===0){plaza(cx,cz);continue;}
    if(d>MAP-40)continue;
    const dtn=d<170,res=d<330,r=rand();
    if(cx>120&&cz<-100&&d>150&&r<0.6){yard(cx,cz);continue;}
    if(r<0.07)park(cx,cz);
    else if(r<0.12)parking(cx,cz);
    else if(r<0.2||(d>400&&r<0.4))ruin(cx,cz,BLOCK-2,BLOCK-2);
    else if(d>360&&r<0.65)forest(cx,cz);
    else{Q(cx-h,cx+h,cz-h,cz+h,0.008,'concrete',0xb0aea6);lots(cx,cz,dtn,res);}
    // Roadside props — more cars, buses, planks, oil drums
    if(rand()<0.24){const x=cx+wr(-h-1,h+1);if(rand()<0.55)car(x,cz+(rand()<0.5?1:-1)*(h+3.8),true,wpick(CARC),rand()<0.35);}
    if(rand()<0.24){const z=cz+wr(-h-1,h+1);if(rand()<0.55)car(cx+(rand()<0.5?1:-1)*(h+3.8),z,false,wpick(CARC),rand()<0.35);}
    if(rand()<0.10){const x=cx+wr(-h*0.7,h*0.7),z=cz+(rand()<0.5?1:-1)*(h+4.5);bus(x,z,true,wpick(BUSC));}
    if(rand()<0.10){const z=cz+wr(-h*0.7,h*0.7),x=cx+(rand()<0.5?1:-1)*(h+4.5);bus(x,z,false,wpick(BUSC));}
    if(rand()<0.16){const x=cx+wr(-h,h),z=cz+wr(-h,h);if(isFree(x,z,1.5))planks(x,z,rand()<0.5);}
    if(rand()<0.15){const x=cx+wr(-h,h),z=cz+wr(-h,h);if(isFree(x,z,2))oilCluster(x,z,2+(rand()*4|0));}
  }
  for(let i=0;i<10;i++){const a=rand()*TAU,r=rand()*MAP*0.7,x=Math.cos(a)*r,z=Math.sin(a)*r;if(isFree(x,z,4))tankWreck(x,z);}
  for(let i=0;i<30;i++){const a=rand()*TAU,r=rand()*MAP*0.85,x=Math.cos(a)*r,z=Math.sin(a)*r;if(isFree(x,z,3))sandbags(x,z,5+((rand()*5)|0));}
  for(let i=0;i<120;i++){const a=rand()*TAU,r=rand()*MAP*0.85,x=Math.cos(a)*r,z=Math.sin(a)*r;if(!isFree(x,z,1.5))continue;if(rand()<0.5)barrel(x,z);else dumpster(x,z);}
  for(let i=0;i<30;i++){const a=rand()*TAU,r=rand()*MAP*0.85,x=Math.cos(a)*r,z=Math.sin(a)*r;if(isFree(x,z,2.5))planks(x,z,rand()<0.5);}
  for(let i=0;i<20;i++){const a=rand()*TAU,r=rand()*MAP*0.85,x=Math.cos(a)*r,z=Math.sin(a)*r;if(isFree(x,z,3))oilCluster(x,z,3+(rand()*4|0));}
  for(let i=0;i<300;i++){const x=wr(-MAP+12,MAP-12),z=wr(-MAP+12,MAP-12);if(Math.hypot(x,z)>330&&isFree(x,z,2)){tree(x,z,wr(1,1.8));occupy(x,x,z,z,1.5);}}
  const E=MAP+1.5,LL=MAP*2+6,c=0x5a5a52;
  B(0,0,-E,LL,9,3,c,'concrete');B(0,0,E,LL,9,3,c,'concrete');B(-E,0,0,3,9,LL,c,'concrete');B(E,0,0,3,9,LL,c,'concrete');
})();
(function roads(){const rt=mkTex(tRoad());rt.repeat.set(1,(MAP*2+120)/8);
  let rm;
  if(isMobile) rm=new THREE.MeshLambertMaterial({map:rt,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  else rm=new THREE.MeshStandardMaterial({map:rt,bumpMap:rt,bumpScale:0.7,roughness:0.85,metalness:0.05,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const geo=new THREE.PlaneGeometry(6.4,MAP*2+120);
  for(let i=-EXT-1;i<=EXT;i++){const s=(i+0.5)*STEP_B;const a=new THREE.Mesh(geo,rm);a.rotation.x=-Math.PI/2;a.position.set(s,0.02,0);a.receiveShadow=true;scene.add(a);const b=new THREE.Mesh(geo,rm);b.rotation.set(-Math.PI/2,0,Math.PI/2);b.position.set(0,0.02,s);b.receiveShadow=true;scene.add(b);}})();
finalizeWorld();

/* Grass + mountains + medkits */
let grassMesh=null;const grassU={t:{value:0}};
(function(){const gr=mulberry32(99),N=isMobile?2500:9000;
  const geo=new THREE.ConeGeometry(0.07,0.45,3,1);geo.translate(0,0.225,0);
  const gm=new THREE.MeshLambertMaterial({color:0xffffff});
  gm.onBeforeCompile=function(s){s.uniforms.uTime=grassU.t;s.vertexShader='uniform float uTime;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat ph=instanceMatrix[3].x*0.35+instanceMatrix[3].z*0.27;\ntransformed.x+=sin(uTime*1.7+ph)*position.y*0.35;\ntransformed.z+=cos(uTime*1.3+ph)*position.y*0.25;');};
  const im=new THREE.InstancedMesh(geo,gm,N);const dummy=new THREE.Object3D(),col=new THREE.Color();let n=0;
  for(let i=0;i<N*4&&n<N;i++){const x=(gr()*2-1)*(MAP-4),z=(gr()*2-1)*(MAP-4);if(!isFree(x,z,0.5))continue;
    const s=0.5+gr()*0.9;dummy.position.set(x,0,z);dummy.rotation.y=gr()*TAU;dummy.scale.set(s*(0.8+gr()*0.6),s*(0.7+gr()*0.9),s*(0.8+gr()*0.6));
    dummy.updateMatrix();im.setMatrixAt(n,dummy.matrix);col.setHSL(0.14+gr()*0.10,0.30+gr()*0.2,0.18+gr()*0.10).convertSRGBToLinear();im.setColorAt(n,col);n++;}
  im.count=n;im.frustumCulled=false;scene.add(im);grassMesh=im;})();
for(let i=0;i<40;i++){const a=i/40*TAU+wr(-.1,.1),r=wr(660,880),h=wr(60,140);const m=new THREE.Mesh(new THREE.ConeGeometry(wr(60,100),h,5),lam(0x5a6a58));m.position.set(Math.cos(a)*r,h/2-2,Math.sin(a)*r);scene.add(m);}
for(let i=0;i<3000&&medSpots.length<28;i++){const x=wr(-MAP+10,MAP-10),z=wr(-MAP+10,MAP-10);if(isFree(x,z,2))medSpots.push([x,z,0]);}
for(let i=0;i<14&&i<roofSpots.length;i++)medSpots.push(roofSpots[(i*7919)%roofSpots.length]);

function applyGfx(level){const dpr=window.devicePixelRatio||1;renderer.setPixelRatio(level==='high'?Math.min(dpr,1.75):level==='medium'?1:0.85);renderer.setSize(window.innerWidth,window.innerHeight);
  const size=level==='high'?2048:level==='medium'?1024:512;
  if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}}
  sun.castShadow=level!=='low';if(grassMesh)grassMesh.visible=level!=='low';
  if(!isMobile){for(const k in matCache){const mm=matCache[k];const nb=(level==='low')?null:((mm.map&&!mm.transparent)?mm.map:null);if(mm.bumpMap!==nb){mm.bumpMap=nb;mm.needsUpdate=true;}}
    if(typeof groundMat!=='undefined'&&groundMat.bumpMap!==undefined){const gb=(level==='low')?null:groundMat.map;if(groundMat.bumpMap!==gb){groundMat.bumpMap=gb;groundMat.needsUpdate=true;}}}}

/* ============ RAYCAST / PHYSICS ============ */
function rayBox(ox,oy,oz,dx,dy,dz,x0,x1,y0,y1,z0,z1,maxT){let tmin=0,tmax=maxT,t1,t2,t;if(Math.abs(dx)<1e-9){if(ox<x0||ox>x1)return -1;}else{t1=(x0-ox)/dx;t2=(x1-ox)/dx;if(t1>t2){t=t1;t1=t2;t2=t;}if(t1>tmin)tmin=t1;if(t2<tmax)tmax=t2;if(tmin>tmax)return -1;}if(Math.abs(dy)<1e-9){if(oy<y0||oy>y1)return -1;}else{t1=(y0-oy)/dy;t2=(y1-oy)/dy;if(t1>t2){t=t1;t1=t2;t2=t;}if(t1>tmin)tmin=t1;if(t2<tmax)tmax=t2;if(tmin>tmax)return -1;}if(Math.abs(dz)<1e-9){if(oz<z0||oz>z1)return -1;}else{t1=(z0-oz)/dz;t2=(z1-oz)/dz;if(t1>t2){t=t1;t1=t2;t2=t;}if(t1>tmin)tmin=t1;if(t2<tmax)tmax=t2;if(tmin>tmax)return -1;}return tmin;}
function worldRay(ox,oy,oz,dx,dy,dz,max,anyHit){let best=max;qstamp++;const px=ox+GOFF,pz=oz+GOFF;let gx=Math.floor(px/GRID_CELL),gz=Math.floor(pz/GRID_CELL);const sx=dx>0?1:-1,sz=dz>0?1:-1,adx=Math.abs(dx),adz=Math.abs(dz);const tdx=adx>1e-9?GRID_CELL/adx:1e9,tdz=adz>1e-9?GRID_CELL/adz:1e9;let tmx=adx>1e-9?(dx>0?(gx+1)*GRID_CELL-px:px-gx*GRID_CELL)/adx:1e9,tmz=adz>1e-9?(dz>0?(gz+1)*GRID_CELL-pz:pz-gz*GRID_CELL)/adz:1e9;let t=0;while(t<best&&gx>=0&&gz>=0&&gx<GN&&gz<GN){const a=grid[gx*GN+gz];if(a)for(let i=0;i<a.length;i++){const b=a[i];if(b.ray===false||b.q===qstamp)continue;b.q=qstamp;const tt=rayBox(ox,oy,oz,dx,dy,dz,b.x0,b.x1,b.y0,b.y1,b.z0,b.z1,best);if(tt>=0&&tt<best){best=tt;if(anyHit)return best;}}if(tmx<tmz){t=tmx;tmx+=tdx;gx+=sx;}else{t=tmz;tmz+=tdz;gz+=sz;}if(t>max)break;}return best;}
function castRay(ox,oy,oz,dx,dy,dz,maxT,ignore){let best=worldRay(ox,oy,oz,dx,dy,dz,maxT,false),hitF=null,head=false,world=best<maxT;if(dy<-1e-6){const tg=-oy/dy;if(tg>0&&tg<best){best=tg;world=true;hitF=null;}}for(const f of fighters){if(f===ignore||!f.alive)continue;const mx=f.x-ox,mz=f.z-oz,pr=mx*dx+mz*dz;if(pr<-1||pr>best+1)continue;const cx=ox+dx*Math.max(0,pr)-f.x,cz=oz+dz*Math.max(0,pr)-f.z;if(cx*cx+cz*cz>1.1)continue;const tb=rayBox(ox,oy,oz,dx,dy,dz,f.x-0.33,f.x+0.33,f.y,f.y+1.4,f.z-0.33,f.z+0.33,best);const th=rayBox(ox,oy,oz,dx,dy,dz,f.x-0.2,f.x+0.2,f.y+1.4,f.y+1.78,f.z-0.2,f.z+0.2,best);let t=-1,hd=false;if(th>=0&&(tb<0||th<tb)){t=th;hd=true;}else if(tb>=0)t=tb;if(t>=0&&t<best){best=t;hitF=f;head=hd;world=false;}}return {t:best,f:hitF,head,world};}
function losBlocked(ox,oy,oz,tx,ty,tz){const dx=tx-ox,dy=ty-oy,dz=tz-oz,len=Math.hypot(dx,dy,dz);if(len<0.01)return false;return worldRay(ox,oy,oz,dx/len,dy/len,dz/len,len,true)<len;}
function resolveXZ(f){const cand=queryGrid(f.x,f.z,R+0.3);for(const b of cand){if(f.y+H<=b.y0||f.y+STEP>=b.y1)continue;const cx=clamp(f.x,b.x0,b.x1),cz=clamp(f.z,b.z0,b.z1);let dx=f.x-cx,dz=f.z-cz;const d2=dx*dx+dz*dz;if(d2>=R*R)continue;if(d2>1e-8){const d=Math.sqrt(d2),p=(R-d)/d;f.x+=dx*p;f.z+=dz*p;}else{const l=f.x-b.x0,r=b.x1-f.x,u=f.z-b.z0,dn=b.z1-f.z,m=Math.min(l,r,u,dn);if(m===l)f.x=b.x0-R;else if(m===r)f.x=b.x1+R;else if(m===u)f.z=b.z0-R;else f.z=b.z1+R;}}}
function physics(f,dt){const wasG=f.onGround;f.x+=f.vx*dt;f.z+=f.vz*dt;resolveXZ(f);resolveXZ(f);const LIM=MAP-0.8;f.x=clamp(f.x,-LIM,LIM);f.z=clamp(f.z,-LIM,LIM);let g=0;const cand=queryGrid(f.x,f.z,1.2);for(const b of cand){if(f.x>b.x0-0.25&&f.x<b.x1+0.25&&f.z>b.z0-0.25&&f.z<b.z1+0.25&&b.y1<=f.y+STEP+1e-4&&b.y1>g)g=b.y1;}f.vy-=GRAV*dt;const oy=f.y,ovy=f.vy;f.y+=f.vy*dt;if(f.vy>0){for(const b of cand){if(f.x>b.x0-R*0.6&&f.x<b.x1+R*0.6&&f.z>b.z0-R*0.6&&f.z<b.z1+R*0.6&&b.y0>=oy+H-0.05&&b.y0<f.y+H){f.y=b.y0-H;f.vy=0;}}}let landed=false;if(f.y<=g){if(!wasG&&ovy<0)landed=true;f.y=g;if(f.vy<0)f.vy=0;f.onGround=true;}else if(wasG&&f.vy<0&&f.vy>-8&&f.y-g<=0.5){f.y=g;f.vy=0;f.onGround=true;}else f.onGround=false;if(f.onGround&&wasG){const dy=f.y-oy;if(Math.abs(dy)>0.02&&Math.abs(dy)<=0.6)f.stepOff=(f.stepOff||0)-dy;}if(f.onGround){if(landed)onLanded(f,(f.peakY===undefined?f.y:f.peakY)-f.y,-ovy);f.peakY=f.y;}else f.peakY=Math.max(f.peakY===undefined?f.y:f.peakY,f.y);}
function spawnOK(x,z){const cand=queryGrid(x,z,1.5);for(const b of cand){if(b.y0<1.5&&b.y1>0.6&&x>b.x0-1&&x<b.x1+1&&z>b.z0-1&&z<b.z1+1)return false;}return true;}

/* ============ FIGHTERS ============ */
const fighters=[];
const BOT_NAMES=['ShadowFox','NovaStrike','IronWolf','PixelReaper','Vortex','GhostRider','Blaze','Cipher','Havoc','Rogue7','Kraken','Zero','Falcon','Wraith','Scorpion','Onyx','Viper','Specter','Talon','Razor'];
const BOT_COLORS=[0xc0392b,0x2e86c1,0x27ae60,0x8e44ad,0xd68910,0x16a085,0xc2185b,0x5d6d7e,0xa04000,0x1f618d,0x7d3c98,0x2471a3,0x1abc9c,0xb03a2e,0x7d6608,0x6c3483,0x117864,0xa93226,0x1f8a70,0xb7950b];
const BOT_WEAPON_POOL=['sniper','sniper','sniper','dmr','dmr','rifle','rifle','rifle','bullpup','smg','lmg','shotgun','pistol','sniper','dmr','sniper','rifle'];
function makeFighter(name,isPlayer,color){return {name,isPlayer,color,x:0,y:0,z:0,vx:0,vy:0,vz:0,yaw:0,hp:100,alive:false,kills:0,deaths:0,onGround:true,invuln:0,respawnAt:0,lastFire:-99,lastHit:-99,deathT:0,speed:0,skill:0.75+Math.random()*0.35,target:null,thinkT:Math.random()*0.3,reactT:0,nextShot:0,burst:3,strafe:1,strafeT:0,side:Math.random()<0.5?1:-1,tx:0,tz:0,stuckT:0,px:0,pz:0,walk:0,sprint:false,mesh:null,body:null,legL:null,legR:null,armL:null,armR:null,gunGrip:null,label:null,animT:Math.random()*10,remote:false,isBot:!isPlayer&&name!=='You',idleChatT:0,persona:BotChat.persona(),pitch:0,vyE:0,landT:0,peakY:0,stepOff:0,climb:null,mantle:null,deathSign:-1,weaponKind:'rifle',_mem:null};}
function makeLabel(name){const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.font='600 30px "Chakra Petch",sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=6;g.strokeStyle='rgba(0,0,0,.75)';g.strokeText(name,128,32);g.fillStyle='#fff';g.fillText(name,128,32);const tex=new THREE.CanvasTexture(c);tex.encoding=THREE.sRGBEncoding;const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,fog:false}));s.scale.set(2.6,0.65,1);s.position.y=2.35;return s;}
function hashStr(s){let h=2166136261>>>0;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}

/* ============ GX ============ */
const GX=(function(){
  const TILE={blk:0.06,stl:0.08,alu:0.06,pol:0.03,polT:0.03,wd:0.2,rub:0.02,fab:0.04,glv:0.03,slv:0.08,brs:0.03,gls:1,web:0.06,leat:0.1,skin:0.2,tape:0.05};
  const PARAM={blk:{metal:0.78,rough:0.46,env:1.1,bump:0.5},stl:{metal:0.92,rough:0.30,env:1.3,bump:0.4},alu:{metal:0.7,rough:0.5,env:1.0,bump:0.4},pol:{metal:0.0,rough:0.6,env:0.35,bump:1.1},polT:{metal:0.0,rough:0.6,env:0.35,bump:1.1},wd:{metal:0.0,rough:0.45,env:0.5,bump:0.5},rub:{metal:0.0,rough:0.88,env:0.2,bump:1.6},fab:{metal:0.0,rough:0.95,env:0.15,bump:1.0},glv:{metal:0.0,rough:0.9,env:0.15,bump:1.0},slv:{metal:0.0,rough:0.95,env:0.08,bump:0.8},brs:{metal:0.9,rough:0.34,env:1.2,bump:0.2},gls:{metal:0.2,rough:0.05,env:2.0,bump:0},web:{metal:0.0,rough:0.95,env:0.2,bump:1.0},leat:{metal:0.0,rough:0.7,env:0.5,bump:0.8},skin:{metal:0.0,rough:0.7,env:0.4,bump:0.2},tape:{metal:0.0,rough:0.9,env:0.2,bump:0.3}};
  function cv(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return [c,c.getContext('2d')];}
  function mkT(c,srgb){const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb!==false)t.encoding=THREE.sRGBEncoding;t.anisotropy=Math.min(8,maxAniso);return t;}
  function speck(g,W,H,rng,n,rgb,a0,a1,sz){for(let i=0;i<n;i++){g.fillStyle='rgba('+rgb+','+(a0+rng()*(a1-a0)).toFixed(3)+')';const s=1+rng()*(sz||1.4);g.fillRect(rng()*W,rng()*H,s,s);}}
  function scratches(g,W,H,rng,n,rgb,a0,a1,len){g.lineWidth=0.7;for(let i=0;i<n;i++){g.strokeStyle='rgba('+rgb+','+(a0+rng()*(a1-a0)).toFixed(3)+')';const x=rng()*W,y=rng()*H,a=rng()*6.283,l=(len||18)*(0.3+rng());g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}}
  function blots(g,W,H,rng,n,r0,r1,rgb,a0,a1){for(let i=0;i<n;i++){const x=rng()*W,y=rng()*H,r=r0+rng()*(r1-r0);for(const ox of[-W,0,W])for(const oy of[-H,0,H]){const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,r);const a=a0+rng()*(a1-a0);gr.addColorStop(0,'rgba('+rgb+','+a.toFixed(3)+')');gr.addColorStop(1,'rgba('+rgb+',0)');g.fillStyle=gr;g.fillRect(x+ox-r,y+oy-r,r*2,r*2);}}}
  const RECIPE={
    blk(g,W,H,r){g.fillStyle='#33373b';g.fillRect(0,0,W,H);blots(g,W,H,r,14,10,30,'60,62,66',0.05,0.16);speck(g,W,H,r,1400,'0,0,0',0.15,0.4);speck(g,W,H,r,700,'150,155,160',0.04,0.14);scratches(g,W,H,r,22,'170,175,182',0.06,0.22,20);},
    stl(g,W,H,r){const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#9aa0a6');gr.addColorStop(0.5,'#7d838a');gr.addColorStop(1,'#a5abb1');g.fillStyle=gr;g.fillRect(0,0,W,H);for(let y=0;y<H;y+=1){g.fillStyle='rgba('+(r()<0.5?'255,255,255':'0,0,0')+','+(0.02+r()*0.07).toFixed(3)+')';g.fillRect(0,y,W,1);}speck(g,W,H,r,600,'0,0,0',0.05,0.2);scratches(g,W,H,r,14,'255,255,255',0.06,0.2,30);blots(g,W,H,r,6,10,26,'40,30,20',0.04,0.10);},
    alu(g,W,H,r){g.fillStyle='#4a5158';g.fillRect(0,0,W,H);speck(g,W,H,r,3200,'255,255,255',0.03,0.10,1.2);speck(g,W,H,r,2400,'0,0,0',0.05,0.16,1.2);blots(g,W,H,r,10,14,36,'90,96,104',0.04,0.12);scratches(g,W,H,r,16,'200,205,210',0.07,0.24,22);},
    pol(g,W,H,r){g.fillStyle='#2a2d31';g.fillRect(0,0,W,H);const s=W/12;for(let y=0;y<12;y++)for(let x=0;x<12;x++){const ox=(y%2)*s/2;g.fillStyle='rgba(0,0,0,0.55)';g.beginPath();g.arc(x*s+ox+s/2,y*s+s/2,s*0.28,0,6.283);g.fill();g.fillStyle='rgba(90,94,100,0.30)';g.beginPath();g.arc(x*s+ox+s/2-0.7,y*s+s/2-0.7,s*0.18,0,6.283);g.fill();}speck(g,W,H,r,300,'120,124,130',0.05,0.2);},
    polT(g,W,H,r){RECIPE.pol(g,W,H,r);g.globalCompositeOperation='source-atop';g.fillStyle='rgba(128,104,64,0.85)';g.fillRect(0,0,W,H);g.globalCompositeOperation='source-over';},
    wd(g,W,H,r){g.fillStyle='#6d4527';g.fillRect(0,0,W,H);for(let x=0;x<W;x+=1){g.fillStyle='rgba('+(r()<0.5?'40,20,8':'170,110,60')+','+(0.05+r()*0.14).toFixed(3)+')';g.fillRect(x,0,1+r()*2,H);}for(let i=0;i<40;i++){g.strokeStyle='rgba(35,18,8,'+(0.15+r()*0.3).toFixed(3)+')';g.lineWidth=0.6+r();g.beginPath();let x=r()*W;g.moveTo(x,0);for(let y=0;y<H;y+=16){x+=(r()-0.5)*6;g.lineTo(x,y);}g.stroke();}blots(g,W,H,r,5,6,16,'30,14,6',0.2,0.4);speck(g,W,H,r,400,'255,220,180',0.03,0.10);},
    rub(g,W,H,r){g.fillStyle='#15161a';g.fillRect(0,0,W,H);const s=W/8;g.strokeStyle='rgba(80,84,90,0.55)';g.lineWidth=1.4;for(let i=-8;i<16;i++){g.beginPath();g.moveTo(i*s,0);g.lineTo(i*s+W,H);g.stroke();g.beginPath();g.moveTo(i*s+W,0);g.lineTo(i*s,H);g.stroke();}speck(g,W,H,r,200,'255,255,255',0.03,0.1);},
    fab(g,W,H,r){g.fillStyle='#282b2e';g.fillRect(0,0,W,H);for(let i=0;i<W;i+=2){g.fillStyle='rgba(255,255,255,0.06)';g.fillRect(i,0,1,H);g.fillRect(0,i,W,1);}speck(g,W,H,r,500,'0,0,0',0.05,0.2);speck(g,W,H,r,300,'120,120,110',0.04,0.12);blots(g,W,H,r,8,8,20,'10,10,8',0.08,0.2);},
    glv(g,W,H,r){RECIPE.fab(g,W,H,r);g.fillStyle='rgba(60,56,48,0.35)';g.fillRect(0,0,W,H);for(let i=0;i<W;i+=4){g.fillStyle='rgba(0,0,0,0.12)';g.fillRect(i,0,1,H);}scratches(g,W,H,r,14,'170,160,140',0.05,0.16,10);},
    slv(g,W,H,r){g.fillStyle='#454c37';g.fillRect(0,0,W,H);const cols=['#5c6042','#30362a','#6b5f42','#20261a'];for(let i=0;i<46;i++){g.fillStyle=cols[(r()*4)|0];g.globalAlpha=0.75;g.beginPath();const x=r()*W,y=r()*H,rr=6+r()*22;for(let a=0;a<6.283;a+=0.5){const q=rr*(0.6+r()*0.7);g.lineTo(x+Math.cos(a)*q,y+Math.sin(a)*q*0.7);}g.closePath();g.fill();}g.globalAlpha=1;for(let i=0;i<W;i+=2){g.fillStyle='rgba(0,0,0,0.07)';g.fillRect(i,0,1,H);g.fillRect(0,i,W,1);}speck(g,W,H,r,600,'0,0,0',0.05,0.18);blots(g,W,H,r,10,10,24,'20,16,10',0.08,0.2);},
    brs(g,W,H,r){g.fillStyle='#b48d3b';g.fillRect(0,0,W,H);blots(g,W,H,r,8,6,20,'255,230,140',0.1,0.25);speck(g,W,H,r,300,'80,50,10',0.05,0.2);},
    gls(g,W,H,r){const gr=g.createLinearGradient(0,0,W,H);gr.addColorStop(0,'#26384a');gr.addColorStop(1,'#0e1822');g.fillStyle=gr;g.fillRect(0,0,W,H);},
    web(g,W,H,r){g.fillStyle='#3a3d33';g.fillRect(0,0,W,H);const s=W/6;g.fillStyle='rgba(0,0,0,0.45)';for(let y=0;y<6;y++)for(let x=0;x<6;x++){g.fillRect(x*s+2,y*s+2,s-4,s*0.35);}g.strokeStyle='rgba(190,180,140,0.45)';g.lineWidth=1;g.setLineDash([2,2]);for(let y=0;y<6;y++)for(let x=0;x<6;x++){g.strokeRect(x*s+2,y*s+2,s-4,s*0.35);}g.setLineDash([]);speck(g,W,H,r,400,'0,0,0',0.05,0.2);},
    leat(g,W,H,r){g.fillStyle='#2e241c';g.fillRect(0,0,W,H);blots(g,W,H,r,20,8,24,'80,60,40',0.06,0.16);speck(g,W,H,r,900,'0,0,0',0.05,0.2);scratches(g,W,H,r,14,'150,120,90',0.06,0.18,12);},
    tape(g,W,H,r){g.fillStyle='#2e2f26';g.fillRect(0,0,W,H);speck(g,W,H,r,300,'0,0,0',0.05,0.2);},
    skin(g,W,H,r){g.fillStyle='#b98764';g.fillRect(0,0,W,H);blots(g,W,H,r,12,10,30,'150,90,70',0.08,0.2);speck(g,W,H,r,400,'80,40,30',0.04,0.12);}
  };
  const texCache={},matCache={};
  function texFor(name){if(texCache[name])return texCache[name];const sz=(name==='wd'||name==='slv')?256:128;const [c,g]=cv(sz,sz);const seed=hashStr('gx'+name);RECIPE[name]?RECIPE[name](g,sz,sz,mulberry32(seed)):(g.fillStyle='#888',g.fillRect(0,0,sz,sz));const t=mkT(c);return texCache[name]=t;}
  let envTex=null;
  function env(){if(envTex)return envTex;
    try{const es=new THREE.Scene();const geo=new THREE.SphereGeometry(50,32,16);const n=geo.attributes.position.count,col=new Float32Array(n*3);
      const top=new THREE.Color(0x6a8fbd).convertSRGBToLinear(),hor=new THREE.Color(0xc9c7c2).convertSRGBToLinear(),gnd=new THREE.Color(0x3a352d).convertSRGBToLinear();
      for(let i=0;i<n;i++){const y=geo.attributes.position.getY(i)/50,x=geo.attributes.position.getX(i)/50,z=geo.attributes.position.getZ(i)/50;let c=new THREE.Color();
        if(y>0)c.copy(hor).lerp(top,Math.pow(y,0.55));else c.copy(hor).lerp(gnd,Math.min(1,-y*2.2));
        const sd=Math.max(0,x*0.5+y*0.75+z*0.42);c.r+=Math.pow(sd,14)*6;c.g+=Math.pow(sd,14)*5;c.b+=Math.pow(sd,14)*3.5;
        const wn=(Math.abs(Math.sin(x*6+z*4))>0.985&&y>-0.1&&y<0.5)?1.2:0;c.r+=wn;c.g+=wn;c.b+=wn;col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
      geo.setAttribute('color',new THREE.BufferAttribute(col,3));
      es.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide})));
      const pm=new THREE.PMREMGenerator(renderer);envTex=pm.fromScene(es,0.02).texture;pm.dispose();}catch(e){envTex=null;}return envTex;}
  function mat(name,opt){const key=name+(opt&&opt.k||'');if(matCache[key])return matCache[key];const p=PARAM[name]||PARAM.blk;const map=texFor(name);
    const m=new THREE.MeshStandardMaterial({map:map,bumpMap:null,bumpScale:p.bump*0.18,roughness:p.rough,metalness:p.metal,envMap:env(),envMapIntensity:p.env});
    if(name==='gls'){m.transparent=true;m.opacity=0.38;m.depthWrite=false;m.color=new THREE.Color(0x9fb8d0);m.side=THREE.DoubleSide;}
    if(opt&&opt.color)m.color=new THREE.Color(opt.color);return matCache[key]=m;}
  const emis={};
  function emissive(hex,k){const key=hex+'_'+(k||1);if(emis[key])return emis[key];return emis[key]=new THREE.MeshBasicMaterial({color:new THREE.Color(hex).multiplyScalar(k||1)});}
  const gcache={};
  function rbox(w,h,d,r){r=Math.max(0,Math.min(r===undefined?0.003:r,w/2-1e-4,h/2-1e-4));
    const key='b'+w.toFixed(4)+h.toFixed(4)+d.toFixed(4)+r.toFixed(4);if(gcache[key])return gcache[key];
    const bt=Math.min(r*0.7,d/4),bs=Math.min(r*0.7,w/4,h/4);const sw=w-2*bs,sh=h-2*bs,rr=Math.max(0.0001,r-bs);const s=new THREE.Shape(),x=-sw/2,y=-sh/2;
    const q=Math.min(rr,sw/2-1e-5,sh/2-1e-5);
    s.moveTo(x+q,y);s.lineTo(x+sw-q,y);s.quadraticCurveTo(x+sw,y,x+sw,y+q);s.lineTo(x+sw,y+sh-q);s.quadraticCurveTo(x+sw,y+sh,x+sw-q,y+sh);s.lineTo(x+q,y+sh);s.quadraticCurveTo(x,y+sh,x,y+sh-q);s.lineTo(x,y+q);s.quadraticCurveTo(x,y,x+q,y);
    const dep=Math.max(0.0005,d-2*bt);const g=new THREE.ExtrudeGeometry(s,{depth:dep,bevelEnabled:bt>0.0002,bevelThickness:bt,bevelSize:bs,bevelSegments:1,curveSegments:2});g.translate(0,0,-dep/2);return gcache[key]=g;}
  function prof(pts,w,b){b=b===undefined?0.002:b;const key='p'+pts.join(',')+'|'+w+'|'+b;if(gcache[key])return gcache[key];
    const s=new THREE.Shape();pts.forEach((p,i)=>{if(i===0)s.moveTo(-p[0],p[1]);else s.lineTo(-p[0],p[1]);});s.closePath();
    const bt=Math.min(b,w/4),dep=Math.max(0.0005,w-2*bt);const g=new THREE.ExtrudeGeometry(s,{depth:dep,bevelEnabled:bt>0.0002,bevelThickness:bt,bevelSize:bt*0.7,bevelSegments:1,curveSegments:2});
    g.translate(0,0,-dep/2);g.rotateY(Math.PI/2);return gcache[key]=g;}
  function cy(rf,rb,len,seg){seg=seg||10;const key='c'+rf+'|'+rb+'|'+len+'|'+seg;if(gcache[key])return gcache[key];
    const g=new THREE.CylinderGeometry(rb,rf,len,seg,1,false);const uv=g.attributes.uv,circ=6.283*(rf+rb)/2;for(let i=0;i<uv.count;i++){uv.setXY(i,uv.getX(i)*circ,uv.getY(i)*len);}g.rotateX(Math.PI/2);return gcache[key]=g.toNonIndexed();}
  function cyV(rt,rb,h,seg){seg=seg||10;const key='v'+rt+'|'+rb+'|'+h+'|'+seg;if(gcache[key])return gcache[key];
    const g=new THREE.CylinderGeometry(rt,rb,h,seg,1,false);const uv=g.attributes.uv,circ=6.283*(rt+rb)/2;for(let i=0;i<uv.count;i++){uv.setXY(i,uv.getX(i)*circ,uv.getY(i)*h);}return gcache[key]=g.toNonIndexed();}
  function cyX(r0,r1,len,seg){seg=seg||10;const key='x'+r0+'|'+r1+'|'+len+'|'+seg;if(gcache[key])return gcache[key];
    const g=new THREE.CylinderGeometry(r1,r0,len,seg,1,false);const uv=g.attributes.uv,circ=6.283*(r0+r1)/2;for(let i=0;i<uv.count;i++){uv.setXY(i,uv.getX(i)*circ,uv.getY(i)*len);}g.rotateZ(-Math.PI/2);return gcache[key]=g.toNonIndexed();}
  function sph(r,sw,sh){const key='s'+r+'|'+sw+'|'+sh;if(gcache[key])return gcache[key];const g=new THREE.SphereGeometry(r,sw||10,sh||8);const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*r*6.283,uv.getY(i)*r*3.14);return gcache[key]=g.toNonIndexed();}
  const _m4=new THREE.Matrix4(),_e=new THREE.Euler(),_q=new THREE.Quaternion(),_p=new THREE.Vector3(),_s=new THREE.Vector3(1,1,1);
  function Builder(){this.sets={};}
  Builder.prototype.add=function(m,geo,x,y,z,rx,ry,rz,sx,sy,sz){
    let g=geo.index?geo.toNonIndexed():geo.clone();const k=1/(TILE[m]||0.05);const uv=g.attributes.uv;if(uv)for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*k,uv.getY(i)*k);
    _e.set(rx||0,ry||0,rz||0,'YXZ');_q.setFromEuler(_e);_p.set(x||0,y||0,z||0);_s.set(sx||1,sy||1,sz||1);_m4.compose(_p,_q,_s);g.applyMatrix4(_m4);
    (this.sets[m]||(this.sets[m]=[])).push(g);return this;};
  function mergeGeos(list){let n=0;for(const g of list)n+=g.attributes.position.count;
    const pos=new Float32Array(n*3),nor=new Float32Array(n*3),uv=new Float32Array(n*2);let o=0;
    for(const g of list){const c=g.attributes.position.count;pos.set(g.attributes.position.array,o*3);nor.set(g.attributes.normal.array,o*3);if(g.attributes.uv)uv.set(g.attributes.uv.array,o*2);o+=c;g.dispose();}
    const m=new THREE.BufferGeometry();m.setAttribute('position',new THREE.BufferAttribute(pos,3));m.setAttribute('normal',new THREE.BufferAttribute(nor,3));m.setAttribute('uv',new THREE.BufferAttribute(uv,2));return m;}
  Builder.prototype.finish=function(group,pivot,shadow){
    const px=pivot?pivot[0]:0,py=pivot?pivot[1]:0,pz=pivot?pivot[2]:0;
    for(const k in this.sets){const g=mergeGeos(this.sets[k]);if(pivot)g.translate(-px,-py,-pz);g.computeBoundingSphere();
      let m;if(k.charAt(0)==='!'){m=new THREE.Mesh(g,emissive(this.emis&&this.emis[k]||0xff2a1a,1.6));}else m=new THREE.Mesh(g,mat(k));
      m.castShadow=!!shadow;m.frustumCulled=false;group.add(m);}
    if(pivot)group.position.set(px,py,pz);return group;};
  function decalMat(text,w,h,color,font){const key='d'+text+color;if(matCache[key])return matCache[key];
    const [c,g]=cv(256,Math.max(16,Math.round(256*h/w)));g.clearRect(0,0,c.width,c.height);g.font=(font||'bold 44px sans-serif');g.textAlign='center';g.textBaseline='middle';g.fillStyle=color||'rgba(210,214,220,0.75)';g.fillText(text,c.width/2,c.height/2);
    const t=mkT(c);return matCache[key]=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});}
  return {mat,emissive,env,rbox,prof,cy,cyV,cyX,sph,Builder,decalMat,mkT,cv,texFor,RECIPE};
})();

/* ============ GUNLIB ============ */
const GunLib=(function(){
  const R=GX.rbox,C=GX.cy,PF=GX.prof,CV=GX.cyV,CX=GX.cyX,SP=GX.sph;
  const H=Math.PI/2;
  function build(kind,D){
    const G=new THREE.Group();G.name='gun_'+kind;const U=G.userData={};
    const body=new GX.Builder();const parts={};
    const P=(n,pivot)=>{parts[n]={b:new GX.Builder(),pivot:pivot||null};return parts[n].b;};
    const A=U.anch={};
    const slots=(b,mat,n,x,y,z0,z1,w,h,d)=>{for(let i=0;i<n;i++)b.add(mat,R(w,h,d,0.0008),x,y,z0+(z1-z0)*i/Math.max(1,n-1));};
    const dot=(b,x,y,z)=>b.add('!w',SP(0.0022,6,5),x,y,z);
    const eng=(txt,w,h,x,y,z,ry,rot)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),GX.decalMat(txt,w,h));m.position.set(x,y,z);m.rotation.set(0,ry||0,rot||0);m.frustumCulled=false;G.add(m);};
    const rail=(b,y,z0,z1,w)=>{const len=z1-z0;b.add('alu',R(w,0.010,len,0.002),0,y,(z0+z1)/2);if(D){const n=Math.floor(len/0.011);for(let i=0;i<n;i++)b.add('blk',R(w+0.001,0.003,0.005,0.0005),0,y+0.004,z0+0.006+i*0.011);}};
    const mag_std=(mb,zf,zr,y0,y1,curve,mat)=>{const N=6,fr=[],rr=[];for(let i=0;i<=N;i++){const t=i/N,cz=curve*Math.pow(t,1.7),y=y0+(y1-y0)*t;fr.push([zf+cz,y]);rr.push([zr+cz,y]);}
      mb.add(mat||'pol',PF(fr.concat(rr.reverse()),0.026,0.0015),0,0,0);
      mb.add('blk',R(0.029,0.007,Math.abs(zr-zf)+0.006,0.0018),0,y1-0.0035,(zf+zr)/2+curve);
      if(D)for(let i=1;i<5;i++){const t=i/6,cz=curve*Math.pow(t,1.7);mb.add('blk',R(0.0272,0.0022,Math.abs(zr-zf)*0.94,0.0007),0,y0+(y1-y0)*t,(zf+zr)/2+cz);}};
    switch(kind){
    case 'pistol':{
      const s=P('slide');
      s.add('blk',R(0.026,0.036,0.236,0.004),0,0.053,-0.044);s.add('blk',R(0.0205,0.006,0.236,0.002),0,0.0735,-0.044);s.add('stl',C(0.0075,0.0075,0.014,10),0,0.052,-0.168);
      for(let i=0;i<6;i++)s.add('alu',R(0.0275,0.031,0.0022,0.0006),0,0.053,0.026+i*0.0068);
      for(let i=0;i<3;i++)s.add('alu',R(0.0275,0.031,0.0022,0.0006),0,0.053,-0.118+i*0.0068);
      s.add('blk',R(0.006,0.009,0.009,0.001),-0.0075,0.0795,0.062);s.add('blk',R(0.006,0.009,0.009,0.001),0.0075,0.0795,0.062);s.add('blk',R(0.0045,0.010,0.007,0.001),0,0.0795,-0.152);
      dot(s,-0.0075,0.0815,0.0585);dot(s,0.0075,0.0815,0.0585);dot(s,0,0.0825,-0.1485);
      const b=body;b.add('pol',R(0.025,0.022,0.13,0.004),0,0.014,-0.095);b.add('pol',R(0.027,0.034,0.115,0.004),0,0.019,0.017);
      b.add('pol',PF([[0.0,0.034],[0.078,0.034],[0.086,0.006],[0.112,-0.138],[0.054,-0.150],[0.032,-0.05],[0.0,-0.024]],0.030,0.003),0,0,0);
      b.add('rub',R(0.032,0.10,0.010,0.003),0,-0.078,0.098,-0.36,0,0);b.add('pol',R(0.0125,0.005,0.062,0.002),0,-0.038,-0.024);b.add('pol',R(0.0125,0.030,0.006,0.002),0,-0.025,-0.055);b.add('pol',R(0.0125,0.030,0.006,0.002),0,-0.024,0.004);
      b.add('blk',R(0.004,0.006,0.028,0.001),-0.0158,0.026,0.012);b.add('blk',R(0.004,0.010,0.010,0.001),-0.0158,-0.020,0.030);
      if(D){slots(b,'blk',3,0,0.0245,-0.12,-0.075,0.026,0.0022,0.005);b.add('blk',R(0.006,0.006,0.006,0.001),-0.016,0.010,-0.05);}
      eng('R-9  9mm',0.09,0.014,-0.0136,0.058,-0.02,-H);
      const t=P('trigger',[0,-0.014,-0.012]);t.add('blk',R(0.006,0.024,0.008,0.001),0,-0.014,-0.012);t.add('blk',R(0.0035,0.010,0.010,0.001),0,-0.005,-0.016);
      const m=P('mag',[0,-0.0,0.05]);
      m.add('blk',R(0.0225,0.135,0.052,0.003),0,-0.078,0.058,-0.375,0,0);m.add('pol',R(0.031,0.012,0.064,0.003),0,-0.152,0.093,-0.375,0,0);m.add('stl',R(0.0235,0.004,0.05,0.001),0,-0.150,0.088,-0.375,0,0);
      A.hip=[0.085,-0.105,-0.31];A.muzzle=[0,0.052,-0.176];A.sightY=0.0795;A.adsZ=-0.24;A.magPos=[0,-0.08,0.058];A.magTop=[0,-0.02,0.04];
      A.rGrip=[0.026,-0.052,0.060];A.rRot=[0,0,-H];A.lHold=[-0.030,-0.058,0.056];A.lRot=[0,0,H];A.lMag=[0,-0.165,0.095];A.lMagRot=[0.4,0,0];A.charge=[-0.03,0.05,0.03];A.chargeRot=[0,0,H];
      A.pouch=[-0.16,-0.36,0.18];A.magDrop=[0.0,-0.5,0.05];break;}
    case 'smg':{
      const b=body;b.add('pol',R(0.040,0.058,0.20,0.008),0,0.030,-0.02);b.add('pol',R(0.040,0.040,0.10,0.006),0,0.02,-0.20);b.add('alu',R(0.038,0.020,0.34,0.003),0,0.070,-0.09);
      if(D)slots(b,'blk',16,0,0.0765,0.05,-0.24,0.028,0.0025,0.006);
      b.add('blk',R(0.040,0.026,0.12,0.004),0,0.014,-0.30);b.add('blk',C(0.0075,0.0075,0.22,10),0,0.032,-0.42);b.add('blk',C(0.014,0.014,0.085,12),0,0.032,-0.56);b.add('blk',C(0.010,0.012,0.02,10),0,0.032,-0.615);
      if(D)for(let i=0;i<3;i++)b.add('alu',C(0.0155,0.0155,0.004,12),0,0.032,-0.525-i*0.018);
      b.add('pol',PF([[0.02,-0.005],[0.09,-0.005],[0.108,-0.10],[0.085,-0.115],[0.055,-0.108],[0.045,-0.03]],0.032,0.003),0,0,0);
      b.add('pol',R(0.010,0.005,0.075,0.002),0,-0.04,-0.022);b.add('pol',R(0.010,0.030,0.006,0.002),0,-0.026,-0.058);b.add('pol',R(0.030,0.025,0.10,0.005),0,-0.006,-0.20);b.add('pol',R(0.032,0.060,0.028,0.005),0,-0.048,-0.34);b.add('rub',R(0.034,0.060,0.005,0.001),0,-0.048,-0.324);
      b.add('blk',R(0.030,0.008,0.008,0.001),0,0.084,0.07);b.add('blk',R(0.004,0.012,0.008,0.001),0,0.092,-0.50);
      b.add('blk',C(0.006,0.006,0.20,8),-0.014,0.045,0.16);b.add('blk',C(0.006,0.006,0.20,8),0.014,0.045,0.16);
      b.add('blk',R(0.036,0.005,0.006,0.001),0,0.045,0.26);b.add('pol',R(0.046,0.075,0.022,0.006),0,0.030,0.272);b.add('rub',R(0.040,0.066,0.010,0.002),0,0.030,0.287);
      b.add('blk',R(0.030,0.008,0.070,0.002),0,0.084,-0.05);b.add('blk',R(0.034,0.006,0.075,0.002),0,0.138,-0.05);b.add('blk',R(0.004,0.032,0.075,0.001),-0.015,0.116,-0.05);b.add('blk',R(0.004,0.032,0.075,0.001),0.015,0.116,-0.05);
      b.add('gls',R(0.028,0.030,0.002,0.0005),0,0.116,-0.086);b.add('blk',R(0.036,0.036,0.008,0.003),0,0.118,-0.092);
      eng('MP-7  4.6mm',0.10,0.014,-0.0202,0.045,-0.02,-H);
      const bo=P('bolt');bo.add('stl',R(0.010,0.012,0.04,0.001),-0.021,0.055,0.0);bo.add('blk',R(0.004,0.008,0.010,0.001),-0.026,0.055,0.014);
      const t=P('trigger',[0,-0.02,-0.02]);t.add('blk',R(0.006,0.022,0.008,0.001),0,-0.02,-0.02);
      const m=P('mag',[0,-0.02,-0.07]);mag_std(m,-0.085,-0.055,-0.02,-0.20,-0.03,'pol');
      A.hip=[0.16,-0.15,-0.35];A.muzzle=[0,0.032,-0.63];A.sightY=0.116;A.adsZ=-0.30;A.magPos=[0,-0.1,-0.07];
      A.rGrip=[0.028,-0.06,0.065];A.rRot=[0,0,-H];A.lHold=[-0.004,-0.075,-0.34];A.lRot=[0,0,H*0.35];A.lMag=[0,-0.19,-0.09];A.lMagRot=[0.3,0,0];A.charge=[-0.045,0.055,0.0];A.chargeRot=[0,H*0.5,0];
      A.pouch=[-0.2,-0.42,0.02];A.magDrop=[0.0,-0.5,0.05];break;}
    case 'rifle':{
      const b=body;b.add('alu',R(0.036,0.068,0.24,0.004),0,-0.006,-0.005);b.add('alu',R(0.036,0.052,0.076,0.004),0,-0.052,-0.045);b.add('alu',R(0.038,0.054,0.28,0.005),0,0.056,-0.070);b.add('alu',R(0.012,0.014,0.04,0.003),-0.0245,0.056,-0.05);
      rail(b,0.087,-0.20,0.09,0.022);b.add('alu',R(0.050,0.054,0.34,0.008),0,0.046,-0.37);rail(b,0.076,-0.53,-0.20,0.022);
      if(D){for(let i=0;i<6;i++){b.add('blk',R(0.0032,0.008,0.030,0.001),-0.0252,0.046,-0.245-i*0.052);b.add('blk',R(0.0032,0.008,0.030,0.001),0.0252,0.046,-0.245-i*0.052);b.add('blk',R(0.010,0.0032,0.030,0.001),0,0.019,-0.245-i*0.052);}}
      b.add('blk',C(0.0075,0.0075,0.10,10),0,0.046,-0.57);b.add('blk',R(0.024,0.030,0.03,0.004),0,0.046,-0.545);b.add('blk',R(0.006,0.028,0.006,0.001),0,0.076,-0.545);b.add('blk',C(0.011,0.012,0.062,12),0,0.046,-0.632);
      if(D)for(let i=0;i<3;i++)b.add('stl',C(0.0125,0.0125,0.003,12),0,0.046,-0.608-i*0.014);
      b.add('pol',PF([[0.026,-0.020],[0.086,-0.020],[0.106,-0.104],[0.080,-0.118],[0.058,-0.108],[0.048,-0.036]],0.030,0.003),0,0,0);
      b.add('alu',R(0.010,0.005,0.075,0.002),0,-0.048,-0.006);b.add('alu',R(0.010,0.034,0.006,0.002),0,-0.032,-0.044);
      b.add('blk',C(0.019,0.020,0.20,10),0,0.008,0.20);b.add('pol',PF([[0.11,0.030],[0.30,0.030],[0.325,0.012],[0.325,-0.055],[0.30,-0.078],[0.24,-0.062],[0.16,-0.034],[0.11,-0.02]],0.036,0.004),0,0,0);
      b.add('rub',R(0.040,0.104,0.014,0.004),0,-0.012,0.332);b.add('blk',R(0.014,0.024,0.012,0.002),0,-0.006,0.20);
      b.add('stl',R(0.016,0.014,0.03,0.003),0,0.091,0.075);b.add('stl',R(0.030,0.008,0.014,0.002),0,0.091,0.088);
      b.add('blk',R(0.030,0.010,0.064,0.002),0,0.098,-0.06);b.add('blk',R(0.036,0.006,0.080,0.002),0,0.148,-0.06);b.add('blk',R(0.004,0.034,0.080,0.001),-0.0165,0.126,-0.06);b.add('blk',R(0.004,0.034,0.080,0.001),0.0165,0.126,-0.06);b.add('blk',R(0.037,0.006,0.080,0.002),0,0.1075,-0.06);
      b.add('gls',R(0.030,0.032,0.002,0.0005),0,0.127,-0.098);b.add('blk',R(0.038,0.038,0.008,0.003),0,0.127,-0.102);
      eng('VX-9  5.56',0.10,0.014,-0.0186,0.02,-0.01,-H);
      const ch=P('bolt');ch.add('blk',R(0.020,0.014,0.030,0.002),0,0.093,0.10);ch.add('blk',R(0.006,0.010,0.020,0.001),-0.013,0.093,0.10);
      const t=P('trigger',[0,-0.02,-0.012]);t.add('blk',R(0.006,0.022,0.008,0.001),0,-0.028,-0.012);
      const m=P('mag',[0,-0.03,-0.04]);mag_std(m,-0.078,-0.010,-0.03,-0.215,-0.04,'alu');m.add('brs',R(0.020,0.006,0.012,0.001),0,-0.032,-0.040);
      A.hip=[0.16,-0.16,-0.36];A.muzzle=[0,0.046,-0.66];A.sightY=0.127;A.adsZ=-0.32;A.magPos=[0,-0.1,-0.044];
      A.rGrip=[0.028,-0.062,0.066];A.rRot=[0,0,-H];A.lHold=[0.004,-0.010,-0.34];A.lRot=[0,H*0.9,H*0.9];A.lMag=[0,-0.20,-0.06];A.lMagRot=[0.25,0,0];A.charge=[-0.03,0.09,0.08];A.chargeRot=[0,H*0.4,0];
      A.pouch=[-0.2,-0.44,0.02];A.magDrop=[0.0,-0.5,0.05];break;}
    case 'bullpup':{
      const b=body;b.add('pol',PF([[0.32,0.06],[0.32,-0.055],[0.20,-0.075],[0.00,-0.06],[-0.20,-0.045],[-0.34,-0.035],[-0.34,0.03],[-0.10,0.075],[0.10,0.085],[0.22,0.085]],0.044,0.005),0,0,0);
      b.add('polT',R(0.046,0.052,0.14,0.006),0,0.010,-0.40);b.add('alu',R(0.030,0.012,0.44,0.002),0,0.098,-0.02);
      if(D)slots(b,'blk',24,0,0.1045,0.19,-0.24,0.024,0.0025,0.006);
      b.add('blk',PF([[0.15,0.098],[0.12,0.135],[-0.06,0.135],[-0.09,0.098]],0.014,0.003),0,0,0);
      b.add('blk',R(0.006,0.010,0.008,0.001),-0.004,0.145,0.1);b.add('blk',R(0.006,0.010,0.008,0.001),0.004,0.145,0.1);
      b.add('blk',C(0.0085,0.0085,0.14,10),0,0.028,-0.50);b.add('blk',C(0.014,0.014,0.06,12),0,0.028,-0.62);b.add('blk',C(0.010,0.012,0.02,10),0,0.028,-0.68);b.add('blk',R(0.005,0.02,0.006,0.001),0,0.043,-0.66);
      b.add('pol',PF([[-0.12,-0.04],[-0.10,-0.04],[-0.085,-0.11],[-0.14,-0.13],[-0.16,-0.11]],0.030,0.003),0,0,0);
      b.add('alu',R(0.010,0.005,0.070,0.002),0,-0.058,-0.16);b.add('rub',R(0.046,0.100,0.014,0.004),0,0.005,0.335);b.add('polT',R(0.040,0.012,0.10,0.004),0,-0.028,-0.36);
      eng('QB-95',0.09,0.014,-0.0222,0.015,-0.05,-H);
      const bo=P('bolt');bo.add('stl',R(0.010,0.012,0.045,0.001),-0.023,0.035,-0.15);
      const t=P('trigger',[0,-0.05,-0.20]);t.add('blk',R(0.006,0.022,0.008,0.001),0,-0.058,-0.20);
      const m=P('mag',[0,-0.04,0.03]);mag_std(m,0.0,0.062,-0.04,-0.20,0.035,'pol');
      A.hip=[0.16,-0.16,-0.34];A.muzzle=[0,0.028,-0.69];A.sightY=0.145;A.adsZ=-0.26;A.magPos=[0,-0.12,0.05];
      A.rGrip=[0.028,-0.075,-0.13];A.rRot=[0,0,-H];A.lHold=[0.004,-0.05,-0.44];A.lRot=[0,H*0.9,H*0.9];A.lMag=[0,-0.19,0.06];A.lMagRot=[-0.3,0,0];A.charge=[-0.035,0.05,-0.12];A.chargeRot=[0,H*0.5,0];
      A.pouch=[-0.2,-0.44,0.08];A.magDrop=[0.0,-0.5,0.02];break;}
    case 'dmr':{
      const b=body;b.add('alu',R(0.038,0.072,0.27,0.004),0,-0.004,-0.01);b.add('alu',R(0.040,0.056,0.31,0.005),0,0.058,-0.06);b.add('alu',R(0.034,0.052,0.09,0.004),0,-0.055,-0.045);
      rail(b,0.091,-0.22,0.095,0.022);b.add('alu',R(0.048,0.052,0.44,0.007),0,0.048,-0.44);rail(b,0.078,-0.66,-0.22,0.022);
      if(D){for(let i=0;i<8;i++){b.add('blk',R(0.0032,0.008,0.030,0.001),-0.0242,0.048,-0.27-i*0.049);b.add('blk',R(0.0032,0.008,0.030,0.001),0.0242,0.048,-0.27-i*0.049);}}
      b.add('blk',C(0.0088,0.0088,0.14,10),0,0.048,-0.72);b.add('blk',C(0.014,0.015,0.07,12),0,0.048,-0.79);
      for(let i=0;i<3;i++)b.add('stl',C(0.0155,0.0155,0.004,12),0,0.048,-0.77-i*0.014);
      b.add('pol',PF([[0.026,-0.020],[0.088,-0.020],[0.108,-0.108],[0.082,-0.122],[0.058,-0.110],[0.048,-0.036]],0.032,0.003),0,0,0);
      b.add('alu',R(0.010,0.005,0.075,0.002),0,-0.048,-0.006);b.add('alu',R(0.010,0.034,0.006,0.002),0,-0.032,-0.044);
      b.add('pol',PF([[0.11,0.034],[0.30,0.038],[0.34,0.020],[0.34,-0.070],[0.31,-0.085],[0.16,-0.050],[0.11,-0.02]],0.038,0.004),0,0,0);
      b.add('rub',R(0.042,0.120,0.014,0.004),0,-0.015,0.346);b.add('polT',R(0.036,0.024,0.11,0.004),0,0.044,0.21);
      b.add('blk',R(0.024,0.012,0.14,0.003),0,0.100,-0.06);b.add('blk',R(0.030,0.026,0.012,0.003),0,0.118,-0.02);b.add('blk',R(0.030,0.026,0.012,0.003),0,0.118,-0.12);
      b.add('blk',C(0.021,0.020,0.20,14),0,0.146,-0.06);b.add('blk',C(0.030,0.021,0.06,14),0,0.146,-0.20);b.add('blk',C(0.024,0.024,0.05,14),0,0.146,0.07);
      b.add('gls',C(0.028,0.028,0.002,14),0,0.146,-0.232);b.add('gls',C(0.017,0.017,0.002,14),0,0.146,0.096);
      b.add('blk',CX(0.009,0.009,0.03,10),0,0.170,-0.06,0,0,0);b.add('blk',CV(0.008,0.008,0.014,10),0.0,0.185,-0.06);
      b.add('stl',R(0.012,0.010,0.02,0.002),0,0.091,0.09);
      eng('AR-45  7.62',0.10,0.014,-0.0202,0.02,-0.02,-H);
      const bo=P('bolt');bo.add('stl',R(0.010,0.014,0.044,0.001),-0.0235,0.055,-0.02);bo.add('blk',R(0.010,0.010,0.012,0.001),-0.030,0.055,0.0);
      const t=P('trigger',[0,-0.02,-0.012]);t.add('blk',R(0.006,0.022,0.008,0.001),0,-0.028,-0.012);
      const m=P('mag',[0,-0.03,-0.04]);mag_std(m,-0.084,-0.010,-0.03,-0.16,-0.02,'alu');
      A.hip=[0.16,-0.16,-0.36];A.muzzle=[0,0.048,-0.80];A.sightY=0.146;A.adsZ=-0.30;A.magPos=[0,-0.1,-0.048];
      A.rGrip=[0.030,-0.064,0.070];A.rRot=[0,0,-H];A.lHold=[0.004,-0.010,-0.44];A.lRot=[0,H*0.9,H*0.9];A.lMag=[0,-0.16,-0.06];A.lMagRot=[0.2,0,0];A.charge=[-0.04,0.06,0.0];A.chargeRot=[0,H*0.4,0];
      A.pouch=[-0.2,-0.44,0.02];A.magDrop=[0.0,-0.5,0.05];break;}
    case 'lmg':{
      const b=body;b.add('alu',R(0.052,0.078,0.30,0.005),0,0.010,-0.06);b.add('alu',R(0.060,0.028,0.34,0.004),0,0.062,-0.12);rail(b,0.080,-0.28,0.02,0.030);b.add('alu',R(0.070,0.064,0.30,0.010),0,0.030,-0.44);
      if(D)for(let i=0;i<7;i++){b.add('blk',CX(0.011,0.011,0.074,10),0,0.030,-0.32-i*0.038);}
      b.add('blk',C(0.010,0.010,0.24,10),0,0.030,-0.72);b.add('blk',C(0.015,0.015,0.07,12),0,0.030,-0.85);b.add('blk',C(0.011,0.013,0.03,10),0,0.030,-0.905);
      b.add('blk',R(0.014,0.03,0.014,0.002),0,0.075,-0.62);b.add('blk',PF([[-0.55,0.06],[-0.52,0.098],[-0.50,0.098],[-0.47,0.06]],0.010,0.002),0,0,0);
      b.add('blk',PF([[0.02,0.084],[0.02,0.12],[-0.10,0.125],[-0.12,0.084]],0.014,0.004),0,0,0);
      b.add('pol',PF([[0.03,-0.030],[0.09,-0.030],[0.112,-0.108],[0.088,-0.122],[0.062,-0.112],[0.052,-0.05]],0.034,0.003),0,0,0);
      b.add('alu',R(0.012,0.005,0.075,0.002),0,-0.05,-0.010);b.add('alu',R(0.012,0.034,0.006,0.002),0,-0.036,-0.046);
      b.add('pol',PF([[0.11,0.040],[0.31,0.036],[0.34,0.012],[0.34,-0.06],[0.30,-0.074],[0.17,-0.054],[0.11,-0.03]],0.046,0.005),0,0,0);
      b.add('rub',R(0.050,0.120,0.014,0.004),0,-0.012,0.346);b.add('pol',R(0.030,0.030,0.14,0.006),0,-0.040,-0.34);
      b.add('blk',R(0.004,0.005,0.15,0.001),-0.022,-0.014,-0.70);b.add('blk',R(0.004,0.005,0.15,0.001),0.022,-0.014,-0.70);b.add('alu',R(0.060,0.012,0.10,0.003),0,0.040,-0.06);
      const cv=P('cover',[0,0.075,-0.02]);cv.add('alu',R(0.062,0.014,0.24,0.004),0,0.078,-0.14);cv.add('blk',R(0.030,0.006,0.16,0.002),0,0.088,-0.14);cv.add('blk',R(0.006,0.020,0.012,0.001),-0.03,0.075,-0.24);
      const bo=P('bolt');bo.add('stl',R(0.010,0.014,0.05,0.001),-0.031,0.045,-0.02);
      const t=P('trigger',[0,-0.02,-0.018]);t.add('blk',R(0.006,0.022,0.008,0.001),0,-0.028,-0.018);
      const m=P('mag',[0,-0.05,-0.06]);
      m.add('alu',R(0.130,0.13,0.20,0.008),0,-0.12,-0.06);m.add('alu',R(0.134,0.015,0.204,0.004),0,-0.06,-0.06);m.add('blk',R(0.120,0.012,0.190,0.004),0,-0.188,-0.06);
      if(D)for(let i=0;i<4;i++)m.add('blk',R(0.002,0.10,0.19,0.0008),-0.0655,-0.12,-0.06);
      for(let i=0;i<8;i++){m.add('brs',C(0.0055,0.0055,0.022,8),0.02+(i%2)*0.0,-0.045,-0.11+i*0.0245);m.add('stl',R(0.012,0.006,0.006,0.001),0.02,-0.045,-0.11+i*0.0245);}
      m.add('brs',R(0.06,0.008,0.20,0.002),0.0,-0.056,-0.06);
      A.hip=[0.17,-0.17,-0.38];A.muzzle=[0,0.03,-0.925];A.sightY=0.125;A.adsZ=-0.32;A.magPos=[0,-0.12,-0.06];
      A.rGrip=[0.032,-0.070,0.072];A.rRot=[0,0,-H];A.lHold=[0.0,-0.045,-0.34];A.lRot=[0,H*0.4,H*0.4];A.lMag=[0,-0.20,-0.06];A.lMagRot=[0,0,0];A.charge=[-0.05,0.07,-0.12];A.chargeRot=[0,H*0.5,0];
      A.pouch=[-0.2,-0.5,0.02];A.magDrop=[0.0,-0.5,0.05];break;}
    case 'shotgun':{
      const b=body;b.add('alu',R(0.042,0.070,0.20,0.005),0,0.02,-0.03);b.add('alu',R(0.030,0.014,0.20,0.003),0,0.064,-0.03);b.add('blk',R(0.006,0.010,0.012,0.001),0,0.075,0.05);
      b.add('blk',C(0.0125,0.0125,0.56,12),0,0.048,-0.40);b.add('blk',C(0.010,0.010,0.46,12),0,0.006,-0.34);
      b.add('blk',C(0.014,0.015,0.05,12),0,0.048,-0.69);b.add('stl',R(0.004,0.012,0.004,0.001),0,0.062,-0.69);
      if(D)for(let i=0;i<8;i++)b.add('blk',R(0.004,0.005,0.008,0.001),0,0.062,-0.14-i*0.06);
      b.add('blk',R(0.024,0.026,0.03,0.004),0,0.026,-0.58);b.add('blk',CX(0.011,0.011,0.044,10),0,0.006,-0.575);
      b.add('pol',PF([[0.03,-0.030],[0.09,-0.030],[0.100,-0.10],[0.078,-0.114],[0.056,-0.10],[0.050,-0.04]],0.030,0.003),0,0,0);
      b.add('alu',R(0.010,0.005,0.075,0.002),0,-0.050,-0.008);b.add('alu',R(0.010,0.034,0.006,0.002),0,-0.034,-0.044);
      b.add('wd',PF([[0.05,0.06],[0.30,0.058],[0.345,0.035],[0.345,-0.085],[0.30,-0.10],[0.20,-0.075],[0.09,-0.045],[0.05,-0.02]],0.036,0.004),0,0,0);
      b.add('rub',R(0.040,0.140,0.016,0.004),0,-0.014,0.352);
      for(let i=0;i<4;i++){b.add('!r',CX(0.0095,0.0095,0.024,8),-0.0225,0.030+i*0.0,-0.01+i*0.0)}
      eng('BREAKER 12',0.11,0.014,-0.0216,0.03,0.10,-H);
      const pm=P('pump');pm.add('wd',R(0.048,0.048,0.20,0.010),0,0.006,-0.34);if(D)for(let i=0;i<7;i++)pm.add('blk',R(0.050,0.003,0.006,0.001),0,0.006,-0.26-i*0.026);
      const bo=P('bolt');bo.add('stl',R(0.010,0.012,0.03,0.001),-0.0215,0.045,0.0);
      const t=P('trigger',[0,-0.02,-0.02]);t.add('blk',R(0.006,0.022,0.008,0.001),0,-0.028,-0.02);
      const m=P('mag',[0,0.0,-0.05]);m.add('!r',CX(0.0085,0.0085,0.02,8),0,-0.02,-0.03);
      A.hip=[0.16,-0.15,-0.36];A.muzzle=[0,0.048,-0.72];A.sightY=0.075;A.adsZ=-0.30;A.magPos=[0,-0.02,-0.03];
      A.rGrip=[0.030,-0.058,0.066];A.rRot=[0,0,-H];A.lHold=[0.0,-0.030,-0.34];A.lRot=[0,H*0.3,H*0.3];A.lMag=[0,-0.02,-0.03];A.lMagRot=[0,0,0];A.charge=[0.0,0.0,-0.34];A.chargeRot=[0,H*0.3,H*0.3];
      A.pouch=[-0.2,-0.44,0.08];A.magDrop=[0.0,-0.5,0.02];break;}
    case 'sniper':default:{
      const b=body;b.add('alu',R(0.044,0.078,0.32,0.005),0,0.010,-0.01);b.add('alu',R(0.044,0.052,0.30,0.005),0,0.062,-0.02);rail(b,0.093,-0.22,0.10,0.026);b.add('alu',R(0.046,0.054,0.42,0.008),0,0.046,-0.42);
      if(D)for(let i=0;i<8;i++){b.add('blk',R(0.0032,0.010,0.028,0.001),-0.0242,0.046,-0.26-i*0.046);b.add('blk',R(0.0032,0.010,0.028,0.001),0.0242,0.046,-0.26-i*0.046);}
      b.add('blk',C(0.0125,0.0125,0.50,12),0,0.046,-0.86);b.add('blk',C(0.020,0.022,0.11,12),0,0.046,-1.12);
      for(let i=0;i<4;i++){b.add('stl',C(0.0225,0.0225,0.006,12),0,0.046,-1.085-i*0.022);b.add('!b',R(0.0004,0.02,0.006,0.0002),-0.0226,0.046,-1.085-i*0.022);}
      b.add('pol',PF([[0.026,-0.020],[0.088,-0.020],[0.106,-0.106],[0.082,-0.120],[0.058,-0.108],[0.048,-0.036]],0.032,0.003),0,0,0);
      b.add('alu',R(0.010,0.005,0.075,0.002),0,-0.048,-0.006);b.add('alu',R(0.010,0.034,0.006,0.002),0,-0.032,-0.044);
      b.add('pol',PF([[0.11,0.052],[0.30,0.058],[0.42,0.045],[0.42,-0.03],[0.36,-0.09],[0.26,-0.09],[0.20,-0.055],[0.11,-0.03]],0.040,0.005),0,0,0);
      b.add('rub',R(0.044,0.130,0.016,0.004),0,-0.02,0.428);b.add('polT',R(0.036,0.022,0.14,0.004),0,0.076,0.26);
      b.add('blk',R(0.004,0.006,0.16,0.001),-0.028,-0.02,-0.72);b.add('blk',R(0.004,0.006,0.16,0.001),0.028,-0.02,-0.72);b.add('blk',R(0.062,0.012,0.02,0.002),0,-0.006,-0.65);
      b.add('blk',R(0.026,0.012,0.16,0.003),0,0.104,-0.05);b.add('blk',R(0.034,0.030,0.014,0.003),0,0.124,-0.00);b.add('blk',R(0.034,0.030,0.014,0.003),0,0.124,-0.13);
      b.add('blk',C(0.023,0.022,0.24,16),0,0.156,-0.05);b.add('blk',C(0.036,0.023,0.08,16),0,0.156,-0.22);b.add('blk',C(0.027,0.027,0.06,16),0,0.156,0.095);
      b.add('gls',C(0.033,0.033,0.002,16),0,0.156,-0.259);b.add('gls',C(0.020,0.020,0.002,16),0,0.156,0.126);
      b.add('blk',CX(0.011,0.011,0.036,10),0,0.184,-0.05);b.add('stl',CV(0.010,0.010,0.012,10),0,0.204,-0.05);b.add('blk',CX(0.009,0.009,0.032,10),0.03,0.156,-0.05);
      eng('LONGSHOT  .50',0.14,0.014,-0.0226,0.02,-0.05,-H);
      const bo=P('bolt',[0,0.06,0.05]);bo.add('stl',C(0.011,0.011,0.09,10),0,0.060,0.08);bo.add('blk',C(0.014,0.014,0.03,10),0,0.060,0.135);
      const bh=P('boltHandle',[-0.021,0.060,0.075]);bh.add('stl',R(0.008,0.008,0.05,0.002),-0.05,0.060,0.075,0,0,0);bh.add('blk',SP(0.011,10,8),-0.078,0.060,0.075);
      const t=P('trigger',[0,-0.02,-0.012]);t.add('blk',R(0.006,0.022,0.008,0.001),0,-0.028,-0.012);
      const m=P('mag',[0,-0.03,-0.04]);m.add('blk',R(0.036,0.10,0.09,0.005),0,-0.09,-0.045);m.add('pol',R(0.040,0.012,0.10,0.004),0,-0.145,-0.045);
      A.hip=[0.17,-0.17,-0.36];A.muzzle=[0,0.046,-1.16];A.sightY=0.156;A.adsZ=-0.30;A.magPos=[0,-0.09,-0.045];
      A.rGrip=[0.030,-0.064,0.070];A.rRot=[0,0,-H];A.lHold=[0.004,-0.030,-0.42];A.lRot=[0,H*0.9,H*0.9];A.lMag=[0,-0.16,-0.045];A.lMagRot=[0.2,0,0];A.charge=[-0.075,0.06,0.075];A.chargeRot=[0,H*0.3,0];
      A.pouch=[-0.2,-0.44,0.02];A.magDrop=[0.0,-0.5,0.05];break;}
    }
    body.emis={'!w':0xf0f0e0,'!r':0xc0472a,'!b':0xcc3a2a};
    body.finish(G,null,true);
    for(const n in parts){const grp=new THREE.Group();grp.name=n;parts[n].b.emis=body.emis;parts[n].b.finish(grp,parts[n].pivot,true);G.add(grp);U[n]=grp;grp.userData.base=grp.position.clone();}
    U.kind=kind;return G;
  }
  return {build};
})();

/* ============ HANDLIB ============ */
const HandLib=(function(){
  const R=GX.rbox,CY=GX.cy;
  const FX=[-0.033,-0.011,0.011,0.031],FL=[1.0,1.1,1.05,0.85];
  function seg(mat,w,h,d,z){const g=new THREE.Group();const b=new GX.Builder();b.add(mat,R(w,h,d,Math.min(w,h)*0.46),0,0,z);b.finish(g,null,true);return g;}
  function make(mirror,opt){
    opt=opt||{};const root=new THREE.Group(),inner=new THREE.Group();root.add(inner);if(mirror)inner.scale.x=-1;
    const pb=new GX.Builder();
    pb.add('glv',R(0.088,0.024,0.090,0.008),0,0,0);pb.add('blk',R(0.070,0.007,0.052,0.003),0,0.0155,-0.012);
    pb.add('glv',R(0.076,0.038,0.040,0.012),0,0.002,0.070);
    pb.add('tape',R(0.080,0.011,0.026,0.002),0,0.010,0.072);pb.add('blk',R(0.030,0.004,0.020,0.001),0,0.0175,0.072);
    pb.add('blk',R(0.020,0.006,0.030,0.002),-0.034,-0.010,0.020);
    if(mirror&&opt.watch){pb.add('blk',R(0.036,0.008,0.034,0.003),0,0.022,0.088);pb.add('!g',R(0.026,0.002,0.024,0.0008),0,0.0275,0.088);}
    pb.emis={'!g':0x60c0ff};pb.finish(inner,null,true);
    const h={root,inner,f:[],th:null};
    for(let i=0;i<4;i++){const L=FL[i];const p1=new THREE.Group();p1.position.set(FX[i],0.002,-0.046);inner.add(p1);
      p1.add(seg('glv',0.0195,0.021,0.034*L,-0.017*L));
      const p2=new THREE.Group();p2.position.z=-0.034*L;p1.add(p2);p2.add(seg('glv',0.0188,0.019,0.028*L,-0.014*L));
      const p3=new THREE.Group();p3.position.z=-0.028*L;p2.add(p3);p3.add(seg('glv',0.0176,0.017,0.024*L,-0.012*L));
      h.f.push({p1,p2,p3});}
    const t0=new THREE.Group();t0.position.set(-0.046,-0.004,0.008);inner.add(t0);t0.add(seg('glv',0.022,0.022,0.038,-0.019));
    const t1=new THREE.Group();t1.position.z=-0.038;t0.add(t1);t1.add(seg('glv',0.019,0.019,0.030,-0.015));
    h.th={t0,t1};
    const sl=new THREE.Group();const sb=new GX.Builder();sb.add('glv',CY(0.027,0.033,0.24,10),0,0,0.12);sb.finish(sl,null,true);
    const cuff=new THREE.Group();const cb=new GX.Builder();cb.add('glv',CY(0.034,0.034,0.03,10),0,0,0.015);cb.finish(cuff,null,true);
    h.sleeve=sl;h.cuff=cuff;h.sleeveLen=0.5;return h;
  }
  function pose(h,grip,idx,thumb){
    for(let i=0;i<4;i++){const c=i===0?idx:grip;const f=h.f[i];f.p1.rotation.x=-(0.12+0.95*c);f.p2.rotation.x=-(0.10+1.30*c);f.p3.rotation.x=-(0.06+0.90*c);}
    const tc=thumb===undefined?grip:thumb;
    h.th.t0.rotation.set(-0.15-0.35*tc,0.55-0.85*tc,0.0);h.th.t1.rotation.x=-(0.05+0.55*tc);
  }
  return {make,pose};
})();

/* ============ VM ============ */
const VM=(function(){
  const KINDS=['pistol','smg','rifle','bullpup','dmr','lmg','shotgun','sniper'];
  const rig=[];let cam=null,rootG=null,active=0;
  const muzzle=new THREE.Vector3();
  const _a=new THREE.Vector3(),_b=new THREE.Vector3(),_c=new THREE.Vector3();
  const clamp01=x=>x<0?0:x>1?1:x,sm=x=>{x=clamp01(x);return x*x*(3-2*x);};
  const backOut=x=>{x=clamp01(x);const c1=1.25,c3=c1+1;return 1+c3*Math.pow(x-1,3)+c1*Math.pow(x-1,2);};
  function samp(tr,t,out){const n=tr.length,d=tr[0].length-1;
    if(t<=tr[0][0]){for(let k=0;k<d;k++)out[k]=tr[0][k+1];return out;}
    if(t>=tr[n-1][0]){for(let k=0;k<d;k++)out[k]=tr[n-1][k+1];return out;}
    let i=0;while(i<n-2&&t>=tr[i+1][0])i++;
    const t0=tr[i][0],t1=tr[i+1][0],h=t1-t0,u=(t-t0)/h,u2=u*u,u3=u2*u;
    const h00=2*u3-3*u2+1,h10=u3-2*u2+u,h01=-2*u3+3*u2,h11=u3-u2;
    for(let k=0;k<d;k++){const p0=tr[i][k+1],p1=tr[i+1][k+1];const pm=i>0?tr[i-1]:null,pn=i+2<n?tr[i+2]:null;
      const m0=pm?(p1-pm[k+1])/(t1-pm[0])*h:0,m1=pn?(pn[k+1]-p0)/(pn[0]-t0)*h:0;
      out[k]=h00*p0+h10*m0+h01*p1+h11*m1;}return out;}
  function stepv(tr,t){let v=tr[0][1];for(let i=0;i<tr.length;i++){if(tr[i][0]<=t)v=tr[i][1];else break;}return v;}
  const pt=(t,p)=>[t,p[0],p[1],p[2]],off=(p,x,y,z)=>[p[0]+x,p[1]+y,p[2]+z];
  function magSeq(A,t0,t1,withCharge,T){
    const H=A.lHold,LM=A.lMag,PO=A.pouch,CH=A.charge,D=A.magDrop.map(v=>v*0.30);
    const tt=t=>t0+t*(t1-t0);
    const L=[[0,H[0],H[1],H[2]]];
    const ks=[[.10,off(LM,-0.05,0.06,0)],[.20,off(LM,-0.008,0.008,0)],[.24,LM],[.34,off(LM,D[0]*0.6,D[1]*0.6,D[2]*0.6)],[.42,off(LM,D[0],D[1],D[2])],[.50,off(PO,0.05,0.10,0)],[.56,PO],[.62,off(PO,0.03,0.12,0)],[.72,off(LM,D[0]*0.7,D[1]*0.7,D[2]*0.7)],[.79,LM],[.84,off(LM,0,0.012,0)]];
    if(withCharge){ks.push([.88,off(CH,0,0,0.03)],[.91,off(CH,0,0,0.075)],[.94,off(CH,0,0,0)],[.99,H]);}else ks.push([.94,H]);
    for(const k of ks)L.push(pt(tt(k[0]),k[1]));L.push(pt(1,H));
    T.L=(T.L&&T.L.length>1?T.L.filter(k=>k[0]<t0):[]).concat(L);
    const lg=[[.10,.4],[.20,.5],[.24,1],[.42,1],[.44,.3],[.52,.4],[.56,1],[.79,1],[.82,.3]];if(withCharge)lg.push([.88,.5],[.91,.9],[.94,.3],[.99,.85]);else lg.push([.94,.85]);
    T.LG=(T.LG||[]).concat([[t0,.85]],lg.map(k=>[tt(k[0]),k[1]]),[[1,.85]]);
    T.MS=[[0,0],[tt(.26),1],[tt(.42),2],[tt(.56),3],[tt(.79),0]];
    T.MR=[[0,0],[tt(.30),0],[tt(.36),.25],[tt(.42),.5],[tt(.56),.5],[tt(.72),.2],[tt(.79),0],[1,0]];
    T.ev=(T.ev||[]).concat([[tt(.25),'magOut'],[tt(.42),'drop'],[tt(.56),'magGrab'],[tt(.79),'magIn']]);
    if(withCharge){T.ev.push([tt(.91),'bolt']);T.BOLT=[[0,0],[tt(.84),0],[tt(.91),1],[tt(.95),0],[1,0]];T.SLD=T.BOLT;}
    return T;}
  function gunTilt(kind,gn,t0,t1){const tt=t=>t0+t*(t1-t0);
    const k={pistol:[-0.03,0.03,0.02,0.05,-0.05,-0.16],smg:[-0.05,0.03,0.02,0.05,-0.08,-0.22],rifle:[-0.06,0.03,0.02,0.05,-0.08,-0.24],bullpup:[-0.06,0.03,0.02,0.05,-0.08,-0.24],dmr:[-0.07,0.03,0.02,0.06,-0.09,-0.24],lmg:[-0.07,0.04,0.02,0.08,-0.10,-0.22],shotgun:[-0.06,0.04,0.02,0.1,-0.08,-0.3],sniper:[-0.07,0.035,0.02,0.06,-0.09,-0.24]}[kind];
    const z=[0,0,0,0,0,0];return [[0].concat(z),[tt(.10)].concat(k),[tt(.40)].concat(k),[tt(.78)].concat(k),[tt(.80),k[0],k[1]+0.015,k[2]+0.035,k[3],k[4],k[5]],[tt(.86)].concat(k.map(v=>v*0.4)),[tt(.98)].concat(z),[1].concat(z)];}
  function reloadFor(kind,A){
    const T={};
    if(kind==='shotgun'){const H=A.lHold,PO=A.pouch,G=A.lMag;const L=[pt(0,H)],LG=[[0,.85]],MS=[[0,2]],ev=[];
      for(let i=0;i<3;i++){const s=0.07+0.20*i;L.push(pt(s,i?off(G,0,0.04,0.02):H),pt(s+.06,PO),pt(s+.10,off(PO,.05,.12,0)),pt(s+.155,off(G,0,0.02,0)),pt(s+.185,G));LG.push([s,.6],[s+.06,1],[s+.10,1],[s+.17,1],[s+.19,.3]);MS.push([s+.065,3],[s+.185,2]);ev.push([s+.185,'shell']);}
      L.push(pt(.70,off(H,0,0,0.0)),pt(.74,H),pt(.80,off(H,0,0,0.09)),pt(.87,H),pt(1,H));LG.push([.72,.85],[.80,.9],[1,.85]);
      T.L=L;T.LG=LG;T.MS=MS;T.ev=ev.concat([[.80,'pump']]);T.PMP=[[0,0],[.76,0],[.80,1],[.87,0],[1,0]];
      T.GN=gunTilt(kind,null,0,0.72);T.MR=[[0,0],[1,0]];return T;}
    if(kind==='sniper'){const K0=[-0.078,0.060,0.075],K1=[-0.031,0.118,0.075],K2=[-0.031,0.118,0.165];const hd=(k,x,y,z)=>off(k,x,y,z);
      T.R=[pt(0,A.rGrip),pt(.07,hd(K0,0.05,0.035,0.02)),pt(.11,hd(K0,0.038,0.0,0.0)),pt(.16,hd(K1,0.04,-0.012,0)),pt(.24,hd(K2,0.04,-0.012,0)),pt(.62,hd(K2,0.04,-0.012,0)),pt(.70,hd(K1,0.04,-0.012,0)),pt(.76,hd(K0,0.038,0,0)),pt(.82,hd(K0,0.05,0.03,0.02)),pt(.90,A.rGrip),pt(1,A.rGrip)];
      T.RG=[[0,.88],[.07,.4],[.11,1],[.78,1],[.84,.4],[.90,.88],[1,.88]];
      T.BR=[[0,0],[.11,0],[.16,1],[.70,1],[.76,0],[1,0]];T.BOLT=[[0,0],[.16,0],[.24,1],[.62,1],[.70,0],[1,0]];
      T.ev=[[.24,'bolt'],[.72,'bolt']];magSeq(A,.27,.90,false,T);T.GN=gunTilt(kind,null,0.08,0.95);return T;}
    magSeq(A,0,1,true,T);T.GN=gunTilt(kind,null,0,1);
    if(kind==='lmg')T.CVR=[[0,0],[.06,0],[.16,1],[.72,1],[.80,0],[1,0]];
    return T;}
  function init(gunRoot,viewCam){rootG=gunRoot;cam=viewCam;
    KINDS.forEach((kind,i)=>{const g=GunLib.build(kind,true);const A=g.userData.anch;
      const R=HandLib.make(false),Lh=HandLib.make(true,{watch:true});
      g.add(R.root);g.add(Lh.root);cam.add(R.sleeve);cam.add(R.cuff);cam.add(Lh.sleeve);cam.add(Lh.cuff);
      const r={kind,g,A,R,Lh,tracks:tracks(kind,A),slideT:0,boltT:0,trigT:0,pumpT:0,ev:0,magOff:[A.magPos[0]-A.lMag[0],A.magPos[1]-A.lMag[1],A.magPos[2]-A.lMag[2]],
        rk:{z:0,vz:0,p:0,vp:0,y:0,vy:0,r:0,vr:0,x:0,vx:0,ry:0,vry:0},prevRl:0,hasSlide:!!g.userData.slide,hipPose:null};
      g.visible=(i===0);gunRoot.add(g);rig.push(r);
      for(const h of [R,Lh]){h.sleeve.visible=h.cuff.visible=(i===0);}});}
  function setActive(i){active=i;rig.forEach((r,k)=>{r.g.visible=(k===i);r.R.sleeve.visible=r.R.cuff.visible=r.Lh.sleeve.visible=r.Lh.cuff.visible=(k===i);});return rig[i];}
  const SHOT={pistol:{z:0.045,p:0.55,y:0.010,r:0.10,x:0.008,rz:0.14},smg:{z:0.022,p:0.30,y:0.004,r:0.08,x:0.006,rz:0.08},rifle:{z:0.035,p:0.45,y:0.007,r:0.10,x:0.008,rz:0.11},bullpup:{z:0.030,p:0.38,y:0.006,r:0.09,x:0.006,rz:0.10},dmr:{z:0.070,p:0.85,y:0.012,r:0.14,x:0.012,rz:0.18},lmg:{z:0.038,p:0.40,y:0.008,r:0.09,x:0.010,rz:0.10},shotgun:{z:0.115,p:1.25,y:0.020,r:0.18,x:0.015,rz:0.26},sniper:{z:0.150,p:1.50,y:0.026,r:0.20,x:0.016,rz:0.30}};
  function fire(i,adsK){const r=rig[i],s=SHOT[r.kind],k=(1-0.45*(adsK||0)),rk=r.rk,rn=()=>Math.random()-0.5;
    rk.vz+=s.z*70*k;rk.vp+=s.p*9*k;rk.vy+=s.y*60*k;rk.vr+=rn()*s.rz*30*k;rk.vx+=rn()*s.x*60*k;rk.vry+=rn()*s.r*8*k;
    r.slideT=1;r.trigT=1;r.pumpT=(r.kind==='shotgun')?1:0;r.boltT=(r.kind==='sniper')?1:0;}
  function spring(x,v,dt,k,c){const a=-k*x-c*v;v+=a*dt;x+=v*dt;return [x,v];}
  const tmp=[0,0,0,0,0,0,0],tmp3=[0,0,0],tmp6=[0,0,0,0,0,0];
  function update(dt,S){
    const r=rig[S.cur],A=r.A,g=r.g,U=g.userData,rk=r.rk,kind=r.kind;
    if(S.cur!==active)setActive(S.cur);
    dt=Math.min(dt,0.05);
    const kz=kind==='sniper'||kind==='shotgun'?150:230,cz=kind==='sniper'||kind==='shotgun'?15:19;let s;
    s=spring(rk.z,rk.vz,dt,kz,cz);rk.z=s[0];rk.vz=s[1];s=spring(rk.p,rk.vp,dt,kz*0.7,cz*0.8);rk.p=s[0];rk.vp=s[1];
    s=spring(rk.y,rk.vy,dt,kz,cz);rk.y=s[0];rk.vy=s[1];s=spring(rk.r,rk.vr,dt,150,13);rk.r=s[0];rk.vr=s[1];
    s=spring(rk.x,rk.vx,dt,150,14);rk.x=s[0];rk.vx=s[1];s=spring(rk.ry,rk.vry,dt,150,13);rk.ry=s[0];rk.vry=s[1];
    const dur=kind==='sniper'?1.0:(kind==='shotgun'?0.7:0.16);
    r.slideT=Math.max(0,r.slideT-dt/(kind==='pistol'?0.13:0.10));
    r.trigT=Math.max(0,r.trigT-dt/0.09);r.boltT=Math.max(0,r.boltT-dt/dur);r.pumpT=Math.max(0,r.pumpT-dt/dur);
    const a=S.adsT,e=sm(a),eo=backOut(a);
    const hip=A.hip||[0.17,-0.16,-0.36],ads=[0,-A.sightY,A.adsZ];
    let px=hip[0]+(ads[0]-hip[0])*e,py=hip[1]+(ads[1]-hip[1])*e,pz=hip[2]+(ads[2]-hip[2])*eo;
    py+=Math.sin(Math.PI*a)*0.018;
    let rx=0,ry=0.05*(1-e),rz=-0.05*(1-e)+Math.sin(Math.PI*a)*0.05;
    const sp=S.sprintK;px+=(-0.05)*sp;py+=(-0.11)*sp;pz+=(0.02)*sp;rx+=-0.26*sp;ry+=0.72*sp;rz+=-0.20*sp;
    const bt=S.time;py+=Math.sin(bt*1.25)*0.0025*(1-e*0.7);px+=Math.sin(bt*0.83)*0.0015*(1-e*0.7);
    const mv=S.moveK*(S.onGround?1:0.15),bp=S.bob,bk=(1-e*0.75);
    px+=Math.cos(bp)*0.007*mv*bk*(1+sp);py+=-Math.abs(Math.sin(bp))*0.012*mv*bk*(1+sp*1.4);rz+=Math.cos(bp)*0.025*mv*bk*(1+sp*1.5);rx+=Math.abs(Math.sin(bp))*0.02*mv*bk;
    px+=S.swayX*1.0;py+=S.swayY*1.0;ry+=-S.swayX*3.2;rx+=S.swayY*3.0;
    px+=S.strafe*0.012*(1-e);rz+=-S.strafe*0.03*(1-e);pz+=S.landDip*0.35;py+=-S.landDip*0.7;rx+=S.landDip*0.4;
    if(!S.onGround){py+=0.012;rx+=0.03;}
    const dr=S.swap;if(dr>0){const d=dr*dr;py+=-0.30*d;px+=0.10*d;rx+=0.55*d;ry+=-0.35*d;rz+=-0.2*d;}
    let LposO=null,Lg=0.85,Rpos=A.rGrip,Rg=0.88,magState=0,magTilt=0,bolt=0,slide=0,pump=0,cover=0,bh=0;
    if(S.reload01>0){const t=S.reload01,T=r.tracks;
      if(T.GN){samp(T.GN,t,tmp6);px+=tmp6[0];py+=tmp6[1];pz+=tmp6[2];rx+=tmp6[3];ry+=tmp6[4];rz+=tmp6[5];}
      if(T.L){samp(T.L,t,tmp3);LposO=tmp3.slice();}
      if(T.LG){samp(T.LG,t,tmp);Lg=tmp[0];}
      if(T.R){samp(T.R,t,tmp3);Rpos=tmp3.slice();}
      if(T.RG){samp(T.RG,t,tmp);Rg=tmp[0];}
      if(T.MS)magState=stepv(T.MS,t);
      if(T.MR){samp(T.MR,t,tmp);magTilt=tmp[0];}
      if(T.BOLT){samp(T.BOLT,t,tmp);bolt=tmp[0];}
      if(T.SLD){samp(T.SLD,t,tmp);slide=tmp[0];}
      if(T.PMP){samp(T.PMP,t,tmp);pump=tmp[0];}
      if(T.CVR){samp(T.CVR,t,tmp);cover=tmp[0];}
      if(T.BR){samp(T.BR,t,tmp);bh=tmp[0];}
      if(T.ev){const pr=r.prevRl;for(const ev of T.ev){if(ev[0]>pr&&ev[0]<=t&&S.onEvent)S.onEvent(ev[1],r);}}}
    r.prevRl=S.reload01;
    px+=rk.x;py+=rk.y;pz+=rk.z;rx+=rk.p;ry+=rk.ry;rz+=rk.r;
    rootG.position.set(px,py,pz);rootG.rotation.set(rx,ry,rz);
    const sl=U.slide;if(sl)sl.position.z=sl.userData.base.z+(Math.sin(Math.min(1,r.slideT)*Math.PI*0.5)*(r.slideT>0?1:0)*0.042+slide*0.05);
    const tg=U.trigger;if(tg)tg.rotation.x=-0.5*Math.min(1,r.trigT*1.6);
    const bo=U.bolt;if(bo){if(kind==='sniper'){const bz=Math.max(bolt,Math.sin(Math.min(1,r.boltT*1.0)*Math.PI)*(r.boltT>0?1:0));bo.position.z=bo.userData.base.z+bz*0.09;}else if(kind==='smg'||kind==='rifle'||kind==='bullpup'||kind==='dmr'||kind==='lmg'){bo.position.z=bo.userData.base.z+bolt*0.06;}else if(kind==='shotgun'){bo.position.z=bo.userData.base.z+Math.max(pump,Math.sin(Math.min(1,r.pumpT)*Math.PI)*(r.pumpT>0?1:0))*0.04;}}
    const bhg=U.boltHandle;if(bhg){const cyc=Math.sin(Math.min(1,r.boltT)*Math.PI)*(r.boltT>0?1:0);bhg.rotation.z=-1.45*Math.max(bh,Math.min(1,cyc*1.6));bhg.position.z=bhg.userData.base.z+Math.max(bolt,cyc)*0.09;}
    const pm=U.pump;if(pm)pm.position.z=pm.userData.base.z+Math.max(pump,Math.sin(Math.min(1,r.pumpT)*Math.PI)*(r.pumpT>0?1:0))*0.09;
    const cv=U.cover;if(cv)cv.rotation.x=-cover*1.15;
    const mg=U.mag;
    if(mg){const inHand=(magState===1||magState===3);const baseP=mg.userData.base;
      if(kind==='shotgun'){mg.visible=(magState===3);}else mg.visible=(magState!==2);
      if(inHand&&LposO){mg.position.set(LposO[0]+r.magOff[0],LposO[1]+r.magOff[1],LposO[2]+r.magOff[2]);}else mg.position.copy(baseP);
      mg.rotation.set(magTilt*(kind==='pistol'?0.6:1),0,magTilt*0.4);}
    const Rh=r.R,Lh=r.Lh;
    Rh.root.position.set(Rpos[0],Rpos[1],Rpos[2]);Rh.root.rotation.set(A.rRot[0],A.rRot[1],A.rRot[2]);
    const idx=0.30+Math.min(1,r.trigT*1.6)*0.55;
    HandLib.pose(Rh,Rg,idx,Math.min(1,Rg));
    const lp=LposO||A.lHold;Lh.root.position.set(lp[0],lp[1],lp[2]);
    Lh.root.rotation.set(A.lRot[0],A.lRot[1],A.lRot[2]);
    if(kind==='shotgun'&&!LposO){Lh.root.position.z=A.lHold[2]+Math.max(pump,Math.sin(Math.min(1,r.pumpT)*Math.PI)*(r.pumpT>0?1:0))*0.09;}
    HandLib.pose(Lh,Lg,Lg,Lg);
    rootG.updateMatrixWorld(true);
    const arm=(h,sx)=>{_a.set(0,0.004,0.104);h.root.localToWorld(_a);_b.set(sx,-0.85,0.60);_c.copy(_a).sub(_b).normalize();h.sleeve.position.copy(_a);h.sleeve.lookAt(_a.x+ -_c.x,_a.y+ -_c.y,_a.z+ -_c.z);h.sleeve.scale.set(1,1,0.5);h.cuff.position.copy(_a);h.cuff.quaternion.copy(h.sleeve.quaternion);};
        arm(Rh,0.55);arm(Lh,-0.45);
    muzzle.set(A.muzzle[0],A.muzzle[1],A.muzzle[2]);g.localToWorld(muzzle);

    if(fp.ready){
      /* Hide HandLib hands + sleeves — the GLB provides the visible arms */
      r.R.root.visible=false;r.Lh.root.visible=false;
      r.R.sleeve.visible=false;r.R.cuff.visible=false;
      r.Lh.sleeve.visible=false;r.Lh.cuff.visible=false;
      if(fp.mixer)fp.mixer.update(dt);
      const bn=fp.bones;
      /* Right arm: target = wrist behind grip, so palm wraps the grip */
      if(bn.rA&&bn.rF&&bn.rH){
        Rh.root.getWorldPosition(_iT);
        _iT.z+=0.06;
        bn.rA.getWorldPosition(_iA);bn.rF.getWorldPosition(_iE);bn.rH.getWorldPosition(_iW);
        const l1=_iA.distanceTo(_iE),l2=_iE.distanceTo(_iW);
        ikFP(_iA,_iT,l1,l2,new THREE.Vector3(0.6,-1,0),_iEL,_iEND);
        aimFP(bn.rA,bn.rF,_iEL);aimFP(bn.rF,bn.rH,_iEND);
      }
      /* Left arm */
      if(bn.lA&&bn.lF&&bn.lH){
        Lh.root.getWorldPosition(_iT);
        _iT.z+=0.06;
        bn.lA.getWorldPosition(_iA);bn.lF.getWorldPosition(_iE);bn.lH.getWorldPosition(_iW);
        const l1=_iA.distanceTo(_iE),l2=_iE.distanceTo(_iW);
        ikFP(_iA,_iT,l1,l2,new THREE.Vector3(-0.6,-1,0),_iEL,_iEND);
        aimFP(bn.lA,bn.lF,_iEL);aimFP(bn.lF,bn.lH,_iEND);
      }
    }
    return r;
  }
    const tcache={};function tracks(kind,A){return tcache[kind]||(tcache[kind]=reloadFor(kind,A));}

  /* === First-person GLB arms === */
  const fp={ready:false,clone:null,bones:null,mixer:null};
  const _iA=new THREE.Vector3(),_iE=new THREE.Vector3(),_iW=new THREE.Vector3(),
        _iT=new THREE.Vector3(),_iP=new THREE.Vector3(),_iEL=new THREE.Vector3(),
        _iEND=new THREE.Vector3(),_iD=new THREE.Vector3(),_iPv=new THREE.Vector3(),
        _iV1=new THREE.Vector3(),_iV2=new THREE.Vector3(),_iV3=new THREE.Vector3(),
        _iQ1=new THREE.Quaternion(),_iQ2=new THREE.Quaternion(),_iQ3=new THREE.Quaternion();
  function ikFP(a,t,l1,l2,pole,elbow,end){
    _iD.subVectors(t,a);let dist=_iD.length();
    const mx=l1+l2-0.003;if(dist>mx)dist=mx;if(dist<0.04)dist=0.04;
    _iD.normalize();
    const a1=(l1*l1-l2*l2+dist*dist)/(2*dist);
    const h=Math.sqrt(Math.max(0,l1*l1-a1*a1));
    _iPv.copy(pole).addScaledVector(_iD,-pole.dot(_iD));
    if(_iPv.lengthSq()<1e-6)_iPv.set(0,-1,0);
    _iPv.normalize();
    elbow.copy(a).addScaledVector(_iD,a1).addScaledVector(_iPv,h);
    end.copy(a).addScaledVector(_iD,dist);
  }
  function aimFP(bone,child,target){
    if(!bone||!child)return;
    bone.updateWorldMatrix(true,true);
    bone.getWorldPosition(_iV1);child.getWorldPosition(_iV2);
    _iV2.sub(_iV1).normalize();_iV3.copy(target).sub(_iV1).normalize();
    _iQ3.setFromUnitVectors(_iV2,_iV3);
    bone.parent.getWorldQuaternion(_iQ1);
    bone.getWorldQuaternion(_iQ2);
    _iQ2.premultiply(_iQ3);
    bone.quaternion.copy(_iQ1.invert().multiply(_iQ2));
    bone.updateWorldMatrix(false,true);
  }
  function setGLB(glb){
    if(!glb||!glb.scene)return;
    if(!THREE.SkeletonUtils||!THREE.SkeletonUtils.clone){console.warn('[VM] SkeletonUtils missing, FP GLB disabled');return;}
    try{
      const clone=THREE.SkeletonUtils.clone(glb.scene);
      // Face -Z (view direction). Position shoulders just in front of camera.
      clone.rotation.y=0;
      clone.position.set(0,-1.30,-0.05);
      clone.traverse(o=>{
        if(o.isMesh||o.isSkinnedMesh){
          o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;
          if(o.material){o.material=o.material.clone();o.material.envMap=GX.env();o.material.envMapIntensity=0.6;o.material.needsUpdate=true;}
        }
      });
      viewScene.add(clone);
      let mixer=null;
      if(glb.animations&&glb.animations.length){
        mixer=new THREE.AnimationMixer(clone);
        const ic=glb.animations.find(c=>c.name==='Idle');
        if(ic){const a=mixer.clipAction(ic);a.play();}
      }
      const B=n=>clone.getObjectByName('mixamorig'+n);
      const bones={rA:B('RightArm'),rF:B('RightForeArm'),rH:B('RightHand'),
                   lA:B('LeftArm'),lF:B('LeftForeArm'),lH:B('LeftHand')};
      fp.clone=clone;fp.bones=bones;fp.mixer=mixer;fp.ready=true;
      console.log('[VM] FP GLB arms active');
    }catch(e){console.warn('[VM] FP GLB setup failed:',e);}
  }

  return {init,update,fire,setActive,rig,muzzle,KINDS,samp,stepv,tracks,setGLB,get active(){return rig[active];}};
})();

/* ============ CH ============ */
const CH=(function(){
  const R=GX.rbox,CVg=GX.cyV,CYl=GX.cy,SPH=GX.sph,PF=GX.prof;
  const tplCache={},faceCache={},boneGeo={};
  const skinCache=new Map();
  const NODEX_PALETTE={base:'#12100e',dark:'#050506',light:'#2a2418',accent:'#d4af37',accent2:'#b0141e',skinTone:'#8a6a4a',helmet:true,cap:false,beret:false,boonie:false,vest:true,back:true,pads:true,holster:true,radio:true,pattern:0,special:true};
  function makeSkinTexture(seed,palette){const S=128;const c=document.createElement('canvas');c.width=c.height=S;const g=c.getContext('2d');const rng=mulberry32(seed^0xa5a5a5);
    g.fillStyle=palette.base;g.fillRect(0,0,S,S);
    for(let i=0;i<90;i++){const x=rng()*S,y=rng()*S,r=2+rng()*10;g.fillStyle='rgba('+(rng()<0.5?'20,15,12':'200,190,170')+','+(0.03+rng()*0.10).toFixed(3)+')';g.beginPath();g.arc(x,y,r,0,6.283);g.fill();}
    for(let i=0;i<300;i++){g.fillStyle='rgba(0,0,0,'+(0.03+rng()*0.10).toFixed(3)+')';g.fillRect(rng()*S,rng()*S,1+rng()*2,1+rng()*2);}
    const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;}
  function getSkin(name){if(skinCache.has(name))return skinCache.get(name);
    const seed=hashStr(name);const rng=mulberry32(seed);
    const hue=rng()*360,sat=18+rng()*40,light=20+rng()*25;
    const palette={base:'hsl('+hue+','+sat+'%,'+light+'%)',dark:'hsl('+hue+','+(sat+5)+'%,'+Math.max(12,light-12)+'%)',light:'hsl('+hue+','+(sat-5)+'%,'+Math.min(60,light+18)+'%)',accent:'hsl('+((hue+180)%360)+',65%,55%)',accent2:'hsl('+((hue+120)%360)+',55%,45%)',skinTone:'hsl(28,55%,'+(55+rng()*20)+'%)',helmet:rng()<0.6,cap:rng()<0.2,beret:rng()<0.08,boonie:rng()<0.12,vest:rng()<0.80,back:rng()<0.75,pads:rng()<0.55,holster:rng()<0.4,radio:rng()<0.45,pattern:Math.floor(rng()*7)};
    palette.texture=makeSkinTexture(seed,palette);skinCache.set(name,palette);return palette;}

  const MODEL={ready:false,scene:null,animations:null};
  const TINTS=[0xffffff,0xc2cca8,0xa9b6c8,0x8c9878,0xd0bfa4,0x9a9a9a];
  const _q1=new THREE.Quaternion(),_q2=new THREE.Quaternion(),_q3=new THREE.Quaternion();
  const _v1=new THREE.Vector3(),_v2=new THREE.Vector3(),_v3=new THREE.Vector3();
  const _S=new THREE.Vector3(),_E=new THREE.Vector3(),_W=new THREE.Vector3(),_T=new THREE.Vector3(),_P=new THREE.Vector3(),_EL=new THREE.Vector3(),_END=new THREE.Vector3(),_ax=new THREE.Vector3(),_rq=new THREE.Quaternion();
  const _up=new THREE.Vector3(0,1,0),_d=new THREE.Vector3(),_p=new THREE.Vector3(),_e=new THREE.Vector3(),_k=new THREE.Vector3(),_t=new THREE.Vector3(),_s=new THREE.Vector3(),_w=new THREE.Vector3();
  const POLE_LEG=new THREE.Vector3(0,0,-1),POLE_ARM_R=new THREE.Vector3(0.5,-0.8,0.2),POLE_ARM_L=new THREE.Vector3(-0.5,-0.8,0.2);
  const S=(a,b,t)=>a+(b-a)*t;
  function rotWorldB(bone,axis,ang){if(!bone)return;bone.parent.getWorldQuaternion(_q1);bone.getWorldQuaternion(_q2);_q3.setFromAxisAngle(axis,ang);_q2.premultiply(_q3);bone.quaternion.copy(_q1.invert().multiply(_q2));}
  function aimBoneB(bone,child,target){if(!bone||!child)return;bone.updateWorldMatrix(true,true);bone.getWorldPosition(_v1);child.getWorldPosition(_v2);_v2.sub(_v1).normalize();_v3.copy(target).sub(_v1).normalize();_q3.setFromUnitVectors(_v2,_v3);bone.parent.getWorldQuaternion(_q1);bone.getWorldQuaternion(_q2);_q2.premultiply(_q3);bone.quaternion.copy(_q1.invert().multiply(_q2));bone.updateWorldMatrix(false,true);}
  function ikSolveB(a,t,l1,l2,pole,elbow,end){_d.subVectors(t,a);let dist=_d.length();const mx=l1+l2-0.003;if(dist>mx)dist=mx;if(dist<0.06)dist=0.06;_d.normalize();const a1=(l1*l1-l2*l2+dist*dist)/(2*dist);const h=Math.sqrt(Math.max(0,l1*l1-a1*a1));_p.copy(pole).addScaledVector(_d,-pole.dot(_d)).normalize();elbow.copy(a).addScaledVector(_d,a1).addScaledVector(_p,h);end.copy(a).addScaledVector(_d,dist);}
  function upgradeModel(f){
    if(!MODEL.ready||!f.rig||f.rig.model)return;
    const rg=f.rig,g=f.mesh;
    const cloneFn=THREE.SkeletonUtils?THREE.SkeletonUtils.clone:(o)=>o.clone(true);
    const clone=cloneFn(MODEL.scene);
    const mw=new THREE.Group();mw.rotation.y=0;mw.position.y=-0.02;mw.add(clone);g.add(mw);
    const tint=new THREE.Color(TINTS[hashStr(f.name)%TINTS.length]);
    clone.traverse(o=>{if(o.isMesh||o.isSkinnedMesh){o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;o.material=o.material.clone();if(o.material.color)o.material.color.multiply(tint);o.material.envMap=GX.env();o.material.envMapIntensity=0.5;o.material.needsUpdate=true;}});
    const mixer=new THREE.AnimationMixer(clone),acts={};
    for(const c of MODEL.animations){if(c.name==='Idle'||c.name==='Walk'||c.name==='Run')acts[c.name.toLowerCase()]=mixer.clipAction(c);}
    if(acts.idle)acts.idle.play();
    if(acts.walk){acts.walk.play();acts.walk.setEffectiveWeight(0);}
    if(acts.run){acts.run.play();acts.run.setEffectiveWeight(0);}
    const B=n=>clone.getObjectByName('mixamorig'+n);
    const bones={hips:B('Hips'),spine:B('Spine'),spine1:B('Spine1'),spine2:B('Spine2'),neck:B('Neck'),head:B('Head'),rA:B('RightArm'),rF:B('RightForeArm'),rH:B('RightHand'),lA:B('LeftArm'),lF:B('LeftForeArm'),lH:B('LeftHand')};
    for(const child of rg.body.children.slice()){if(child!==rg.gp)child.visible=false;}
    for(const k in rg.bones)if(rg.bones[k])rg.bones[k].visible=false;
    rg.boots.R.visible=false;rg.boots.L.visible=false;
    rg.hr.root.visible=false;rg.hl.root.visible=false;
    rg.model={mw,clone,mixer,acts,cur:'idle',w:{idle:1,walk:0,run:0},bones};
  }
  function animateModelB(f,dt,T,norm,air,sprinting,pitch){
    const rg=f.rig,M=rg.model,bn=M.bones,m=f.mesh;if(!bn.spine1)return;
    const sp=f.speed;
    const wt=air?M.cur:(sp<0.7?'idle':(sp<5.6?'walk':'run'));
    const tw={idle:wt==='idle'?1:0,walk:wt==='walk'?1:0,run:wt==='run'?1:0};
    for(const k in tw){if(!M.acts[k])continue;M.w[k]+=(tw[k]-M.w[k])*Math.min(1,dt*9);M.acts[k].setEffectiveWeight(Math.max(0.0001,M.w[k]));}
    if(M.acts.walk)M.acts.walk.setEffectiveTimeScale(Math.max(0.6,Math.min(1.7,sp/1.7)));
    if(M.acts.run)M.acts.run.setEffectiveTimeScale(Math.max(0.7,Math.min(2.0,sp/4.6)));
    M.cur=wt;M.mixer.update(dt);m.updateMatrixWorld(true);
    _ax.set(1,0,0).applyQuaternion(m.getWorldQuaternion(_rq));
    const pp=Math.max(-0.9,Math.min(0.9,pitch));
    rotWorldB(bn.spine1,_ax,pp*0.28+(f.rlT>0?0.05:0));
    rotWorldB(bn.spine2,_ax,pp*0.30);
    if(bn.spine1)bn.spine1.updateWorldMatrix(false,true);
    rotWorldB(bn.head,_ax,-pp*0.15);
    _ax.set(0,1,0);rotWorldB(bn.spine2,_ax,-0.18);
    m.updateMatrixWorld(true);
    const doArm=(A,F,H,handRoot,poleLocal)=>{if(!A||!F||!H)return;A.getWorldPosition(_S);F.getWorldPosition(_E);H.getWorldPosition(_W);const l1=_S.distanceTo(_E),l2=_E.distanceTo(_W);_T.set(0,0.004,0.05);handRoot.localToWorld(_T);m.getWorldQuaternion(_rq);_P.copy(poleLocal).applyQuaternion(_rq);ikSolveB(_S,_T,l1,l2,_P,_EL,_END);aimBoneB(A,F,_EL);aimBoneB(F,H,_END);};
    doArm(bn.rA,bn.rF,bn.rH,rg.hr.root,new THREE.Vector3(-0.9,-0.4,-0.9));
    doArm(bn.lA,bn.lF,bn.lH,rg.hl.root,new THREE.Vector3( 0.9,-0.4,-0.9));
  }
  function loadModelFromGen(gen){try{MODEL.scene=gen.scene;MODEL.animations=gen.animations||[];MODEL.ready=true;for(const f of fighters){if(f.mesh&&f.rig)upgradeModel(f);}}catch(e){console.warn('[CH] loadModelFromGen failed',e);}}

  const ftex=(function(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,255,240,1)');gr.addColorStop(0.18,'rgba(255,210,120,0.95)');gr.addColorStop(0.5,'rgba(255,130,40,0.35)');gr.addColorStop(1,'rgba(255,90,0,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);g.translate(64,64);g.fillStyle='rgba(255,220,150,0.9)';for(let i=0;i<8;i++){g.rotate(Math.PI/4);const len=i%2?34:60;g.beginPath();g.moveTo(0,-4);g.lineTo(len,0);g.lineTo(0,4);g.closePath();g.fill();}return new THREE.CanvasTexture(c);})();
  function gunInst(kind){if(!tplCache[kind]){const t=GunLib.build(kind,false);const anch=t.userData.anch;t.traverse(o=>{o.userData={};});t.userData={anch:anch};tplCache[kind]=t;}
    const t=tplCache[kind];const g=t.clone(true);const U=g.userData={anch:t.userData.anch,kind:kind};
    for(const n of ['mag','slide','bolt','trigger','pump','cover','boltHandle']){const o=g.getObjectByName(n);if(o){U[n]=o;o.userData={base:o.position.clone()};}}return g;}
  function faceTex(pal,name){const key=name;if(faceCache[key])return faceCache[key];
    const c=document.createElement('canvas');c.width=64;c.height=64;const g=c.getContext('2d');const rng=mulberry32(hashStr(name)^0x77);
    g.fillStyle=pal.skinTone;g.fillRect(0,0,64,64);
    for(let i=0;i<70;i++){g.fillStyle='rgba(60,30,20,'+(0.05+rng()*0.10)+')';g.fillRect(rng()*64,rng()*64,2,2);}
    g.fillStyle='rgba(40,25,20,0.18)';g.fillRect(6,42,52,22);
    g.fillStyle='#f2ece2';g.fillRect(13,24,12,6);g.fillRect(39,24,12,6);
    g.fillStyle=rng()<0.5?'#3a5f7a':'#4a3220';g.fillRect(17,25,6,5);g.fillRect(43,25,6,5);
    g.fillStyle='#111';g.fillRect(19,26,3,4);g.fillRect(45,26,3,4);
    g.fillStyle='rgba(25,15,10,0.85)';g.fillRect(11,18,16,3);g.fillRect(37,18,16,3);
    g.fillStyle='rgba(60,35,25,0.35)';g.fillRect(30,30,5,10);
    g.fillStyle='rgba(30,15,10,0.55)';g.fillRect(29,40,2,2);g.fillRect(34,40,2,2);
    g.fillStyle='rgba(115,45,40,0.72)';g.fillRect(25,49,14,3);
    const mode=Math.floor(rng()*4);
    if(mode===0){g.fillStyle='rgba(30,25,22,0.20)';g.fillRect(8,44,48,20);}
    else if(mode===1){g.fillStyle='rgba(25,20,18,0.35)';for(let i=0;i<160;i++)g.fillRect(rng()*64,44+rng()*20,1,1);}
    else if(mode===2){g.fillStyle='#1c1e22';g.fillRect(0,44,64,20);g.fillStyle='rgba(0,0,0,0.2)';g.fillRect(0,46,64,2);}
    if(rng()<0.35){g.strokeStyle='rgba(120,50,40,0.7)';g.lineWidth=1.5;g.beginPath();g.moveTo(46,30);g.lineTo(54,42);g.stroke();}
    const t=new THREE.CanvasTexture(c);t.encoding=THREE.sRGBEncoding;t.magFilter=THREE.NearestFilter;
    return faceCache[key]=new THREE.MeshStandardMaterial({map:t,roughness:0.75,metalness:0,envMap:GX.env(),envMapIntensity:0.25});}
  function bone(parent,len,r0,r1,mat){const key=len+'|'+r0+'|'+r1;if(!boneGeo[key]){const g=new THREE.CylinderGeometry(r1,r0,len,8,1);g.translate(0,len/2,0);boneGeo[key]=g;}
    const m=new THREE.Mesh(boneGeo[key],mat);m.castShadow=true;m.frustumCulled=false;const grp=new THREE.Group();grp.add(m);grp.userData.len=len;parent.add(grp);return grp;}
  function place(b,a,t){b.position.copy(a);_d.subVectors(t,a);const L=_d.length()||1e-4;_d.multiplyScalar(1/L);b.quaternion.setFromUnitVectors(_up,_d);b.scale.y=L/b.userData.len;}
  function ik2(a,t,l1,l2,pole,elbow,end){_d.subVectors(t,a);let d=_d.length();const mx=l1+l2-0.003;if(d>mx)d=mx;if(d<0.06)d=0.06;_d.normalize();const a1=(l1*l1-l2*l2+d*d)/(2*d),h=Math.sqrt(Math.max(0,l1*l1-a1*a1));_p.copy(pole).addScaledVector(_d,-pole.dot(_d)).normalize();elbow.copy(a).addScaledVector(_d,a1).addScaledVector(_p,h);end.copy(a).addScaledVector(_d,d);}
  function build(f){
    const g=new THREE.Group();
    const isN=f.name&&/^NoDeX$/i.test(f.name);
    const pal=isN?NODEX_PALETTE:getSkin(f.name);
    const E=GX.env();
    const cloth=pal._cl||(pal._cl=new THREE.MeshStandardMaterial({color:new THREE.Color(pal.base).convertSRGBToLinear(),roughness:0.96,metalness:0,envMap:E,envMapIntensity:0.12}));
    const clothDark=pal._dk||(pal._dk=new THREE.MeshStandardMaterial({color:new THREE.Color(pal.dark).convertSRGBToLinear(),roughness:0.9,metalness:0,envMap:E,envMapIntensity:0.12}));
    const skinM=pal._sk||(pal._sk=new THREE.MeshStandardMaterial({color:new THREE.Color(pal.skinTone).convertSRGBToLinear(),roughness:0.7,metalness:0,envMap:E,envMapIntensity:0.25}));
    const acc=pal._ac||(pal._ac=new THREE.MeshStandardMaterial({color:new THREE.Color(pal.accent).convertSRGBToLinear(),roughness:0.55,metalness:0.2,envMap:E,envMapIntensity:0.5}));
    const black=GX.mat('blk'),leather=GX.mat('leat'),fabric=GX.mat('fab'),web=GX.mat('web'),polT=GX.mat('polT'),rubber=GX.mat('rub'),gls=GX.mat('gls'),stl=GX.mat('stl');
    const HIP=0.93;
    const body=new THREE.Group();body.position.set(0,HIP,0);g.add(body);
    const mkMesh=(parent,geo,mat,x,y,z,rx,ry,rz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);m.rotation.set(rx||0,ry||0,rz||0);m.castShadow=true;m.frustumCulled=false;parent.add(m);return m;};
    const cg=(w,h,d,r)=>{const gg=R(w,h,d,r);const uv=gg.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*4.5,uv.getY(i)*4.5);return gg;};
    mkMesh(body,cg(0.34,0.18,0.24,0.06),cloth,0,0.02,0);
    mkMesh(body,cg(0.28,0.14,0.20,0.05),clothDark,0,-0.03,0);
    mkMesh(body,cg(0.40,0.44,0.24,0.07),cloth,0,0.34,0);
    mkMesh(body,cg(0.34,0.10,0.20,0.04),cloth,0,0.60,0);
    mkMesh(body,R(0.42,0.055,0.27,0.015),leather,0,0.10,0);
    mkMesh(body,R(0.05,0.05,0.02,0.008),stl,0,0.10,-0.145);
    mkMesh(body,R(0.11,0.11,0.07,0.015),fabric,-0.16,-0.05,0.15);
    mkMesh(body,R(0.09,0.09,0.06,0.012),fabric,0.16,-0.05,0.15);
    if(pal.holster){mkMesh(body,R(0.06,0.18,0.11,0.012),leather,0.235,-0.07,0.03);mkMesh(body,R(0.05,0.06,0.06,0.008),black,0.235,-0.14,0.03);}
    if(pal.vest){mkMesh(body,R(0.34,0.36,0.05,0.045),web,0,0.36,-0.15);mkMesh(body,R(0.34,0.36,0.05,0.045),web,0,0.36,0.15);mkMesh(body,R(0.05,0.34,0.24,0.04),web,-0.20,0.36,0);mkMesh(body,R(0.05,0.34,0.24,0.04),web,0.20,0.36,0);
      mkMesh(body,R(0.10,0.10,0.30,0.03),web,-0.13,0.56,0);mkMesh(body,R(0.10,0.10,0.30,0.03),web,0.13,0.56,0);mkMesh(body,R(0.42,0.10,0.26,0.02),web,0,0.24,0);
      for(let i=0;i<3;i++){const px=-0.12+i*0.12;mkMesh(body,R(0.105,0.15,0.055,0.014),fabric,px,0.20,-0.185);mkMesh(body,R(0.108,0.04,0.06,0.008),fabric,px,0.275,-0.185);mkMesh(body,R(0.03,0.02,0.02,0.004),black,px,0.255,-0.215);}
      mkMesh(body,R(0.14,0.10,0.05,0.012),fabric,0,0.44,-0.18);mkMesh(body,R(0.07,0.12,0.06,0.012),fabric,0.19,0.38,-0.15);mkMesh(body,R(0.05,0.05,0.008,0.003),acc,-0.14,0.44,-0.19);}
    if(pal.back){mkMesh(body,R(0.30,0.38,0.15,0.04),fabric,0,0.36,0.22);mkMesh(body,R(0.24,0.16,0.055,0.02),fabric,0,0.30,0.325);
      if(pal.radio){mkMesh(body,R(0.05,0.13,0.05,0.01),black,0.19,0.42,0.20);mkMesh(body,R(0.008,0.36,0.008,0.002),black,0.19,0.68,0.20);mkMesh(body,R(0.02,0.02,0.02,0.005),acc,0.19,0.86,0.20);}}
    mkMesh(body,CVg(0.055,0.062,0.10,10),skinM,0,0.63,0);
    const head=new THREE.Group();head.position.set(0,0.66,0);body.add(head);
    mkMesh(head,R(0.165,0.185,0.185,0.055),skinM,0,0.08,0);mkMesh(head,R(0.155,0.06,0.185,0.03),skinM,0,0.0,-0.005);mkMesh(head,R(0.17,0.035,0.10,0.02),skinM,0,0.13,-0.055);
    const face=faceTex(pal,f.name);const fm=new THREE.Mesh(new THREE.PlaneGeometry(0.155,0.135),face);fm.position.set(0,0.075,-0.0935);head.add(fm);
    mkMesh(head,R(0.032,0.045,0.04,0.01),skinM,0,0.065,-0.105);
    mkMesh(head,R(0.028,0.055,0.03,0.008),skinM,-0.084,0.075,0.005);mkMesh(head,R(0.028,0.055,0.03,0.008),skinM,0.084,0.075,0.005);
    if(pal.helmet){mkMesh(head,cg(0.215,0.135,0.235,0.05),clothDark,0,0.175,0.005);mkMesh(head,R(0.225,0.03,0.245,0.012),black,0,0.135,0.005);mkMesh(head,R(0.06,0.05,0.05,0.01),black,0,0.235,-0.11);mkMesh(head,R(0.02,0.09,0.13,0.008),black,-0.11,0.16,0.005);mkMesh(head,R(0.02,0.09,0.13,0.008),black,0.11,0.16,0.005);mkMesh(head,R(0.22,0.03,0.02,0.005),acc,-0.03,0.175,-0.115);}
    mkMesh(head,R(0.185,0.055,0.05,0.012),black,0,0.105,-0.105);mkMesh(head,R(0.155,0.04,0.012,0.006),gls,0,0.105,-0.128);
    mkMesh(body,SPH(0.075,12,10),cloth,-0.20,0.53,0);mkMesh(body,SPH(0.075,12,10),cloth,0.20,0.53,0);
    const gp=new THREE.Group();gp.position.set(0.12,0.40,-0.12);body.add(gp);
    const hr=HandLib.make(false),hl=HandLib.make(true,{watch:true});
    const bones={};
    bones.uaR=bone(g,0.30,0.062,0.050,cloth);bones.faR=bone(g,0.28,0.050,0.040,cloth);bones.uaL=bone(g,0.30,0.062,0.050,cloth);bones.faL=bone(g,0.28,0.050,0.040,cloth);
    bones.thR=bone(g,0.44,0.10,0.078,cloth);bones.shR=bone(g,0.44,0.078,0.056,cloth);bones.thL=bone(g,0.44,0.10,0.078,cloth);bones.shL=bone(g,0.44,0.078,0.056,cloth);
    const boots={R:new THREE.Group(),L:new THREE.Group()};
    for(const k of ['R','L']){const bn=bones['sh'+k];bn.add(boots[k]);boots[k].position.set(0,0.42,0);
      mkMesh(boots[k],R(0.09,0.08,0.09,0.02),leather,0,0.02,0.01);mkMesh(boots[k],R(0.105,0.115,0.22,0.03),leather,0,-0.055,-0.035);mkMesh(boots[k],R(0.105,0.085,0.08,0.02),leather,0,-0.075,-0.155);
      mkMesh(boots[k],R(0.115,0.028,0.28,0.01),rubber,0,-0.115,-0.035);mkMesh(boots[k],R(0.10,0.045,0.06,0.012),rubber,0,-0.105,0.075);mkMesh(boots[k],R(0.075,0.075,0.03,0.008),leather,0,0.0,-0.09);
      for(let i=0;i<3;i++)mkMesh(boots[k],R(0.095,0.008,0.02,0.002),black,0,-0.015-i*0.026,-0.075);}
    const fl=new THREE.Mesh(new THREE.PlaneGeometry(0.42,0.42),new THREE.MeshBasicMaterial({map:ftex,color:L(0xffd090),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false}));
    fl.visible=false;
    f.rig={body,head,gp,hr,hl,bones,boots,fl,gun:null,walk:0,kick:0,gdown:0};
    f.body=body;f.gunGrip=gp;f.legL=bones.thL;f.legR=bones.thR;
    return g;
  }
  function setGun(f,kind){
    const rg=f.rig;if(!rg)return;
    if(rg.gun)rg.gp.remove(rg.gun);
    const gun=gunInst(kind);const A=gun.userData.anch;
    gun.add(rg.hr.root);gun.add(rg.hl.root);gun.add(rg.fl);
    rg.hr.root.position.set(A.rGrip[0],A.rGrip[1],A.rGrip[2]);rg.hr.root.rotation.set(A.rRot[0],A.rRot[1],A.rRot[2]);
    rg.hl.root.position.set(A.lHold[0],A.lHold[1],A.lHold[2]);rg.hl.root.rotation.set(A.lRot[0],A.lRot[1],A.lRot[2]);
    rg.fl.position.set(A.muzzle[0],A.muzzle[1],A.muzzle[2]-0.05);
    HandLib.pose(rg.hr,0.9,0.4,0.9);HandLib.pose(rg.hl,0.8,0.8,0.8);
    rg.gp.add(gun);rg.gun=gun;rg.kind=kind;rg.A=A;
    rg.tracks=VM.tracks(kind,A);rg.magOff=[A.magPos[0]-A.lMag[0],A.magPos[1]-A.lMag[1],A.magPos[2]-A.lMag[2]];
    if(MODEL.ready&&!rg.model)upgradeModel(f);
  }
  function animate(f,dt,T,norm,air,sprinting,pitch){
    const rg=f.rig,m=f.mesh,A=rg.A;if(!A)return;
    const HIP=0.93;
    const moving=norm>0.08&&!air;
    if(moving)rg.walk+=f.speed*dt*(sprinting?1.05:1.15);
    const ph=rg.walk;
    const bob=moving?Math.abs(Math.sin(ph))*0.035*norm:0;
    const crouchAir=air?0.05:0;
    rg.body.position.y=HIP-bob-crouchAir-(f.landT>0?0.10*f.landT:0)+Math.sin(f.animT*1.5)*0.004;
    const lean=moving?-norm*(sprinting?0.20:0.08):0;
    const kickT=Math.max(0,1-(T-f.lastFire)*8);
    rg.kick=kickT;
    let rl=0,Lp=null,magSt=0;
    if(f.rlT>0&&rg.tracks){rl=1-f.rlT/f.rlTotal;const tmp=[0,0,0];VM.samp(rg.tracks.L,rl,tmp);Lp=tmp;magSt=VM.stepv(rg.tracks.MS,rl);}
    const gunDown=sprinting&&!(T-f.lastFire<1.2)&&rl===0?1:0;
    rg.gdown=S(rg.gdown||0,gunDown,Math.min(1,dt*8));
    rg.body.rotation.set(lean+pitch*0.30+(rl>0?0.05:0),(moving?Math.sin(ph)*0.10*norm:0)+(rl>0?0.12:0),Math.sin(ph*2)*0.02*norm);
    rg.head.rotation.set(-pitch*0.15+(rl>0?-0.15:0),(rl>0?-0.1:0),0);
    rg.gp.rotation.set(pitch*0.50+kickT*0.10-0.55*rg.gdown-(rl>0?0.35:0),0.20*rg.gdown+(rl>0?0.35:0),(rl>0?-0.25:0));
    const mOffZ=rg.model?-0.32:-0.14,mOffY=rg.model?0.48:0.26;
    rg.gp.position.set(0.12,mOffY-0.05*rg.gdown-(rl>0?0.06:0),mOffZ+kickT*0.05-(rl>0?0.06:0));
    const U=rg.gun.userData;
    if(U.slide)U.slide.position.z=U.slide.userData.base.z+kickT*0.035;
    if(U.mag&&rg.magOff){
      if(rl>0&&Lp&&(magSt===1||magSt===3)){U.mag.visible=true;U.mag.position.set(Lp[0]+rg.magOff[0],Lp[1]+rg.magOff[1],Lp[2]+rg.magOff[2]);}
      else{U.mag.position.copy(U.mag.userData.base);U.mag.visible=(rl>0&&magSt===2)?false:(rg.kind==='shotgun'?false:true);}}
    if(Lp)rg.hl.root.position.set(Lp[0],Lp[1],Lp[2]);else rg.hl.root.position.set(A.lHold[0],A.lHold[1],A.lHold[2]);
    HandLib.pose(rg.hr,0.9,0.35+kickT*0.5,0.9);
    HandLib.pose(rg.hl,Lp?0.9:0.85,Lp?0.9:0.85,0.85);
    rg.fl.visible=(T-f.lastFire)<0.05;if(rg.fl.visible)rg.fl.rotation.z=Math.random()*6.28;
    m.updateMatrixWorld(true);
    if(rg.model){animateModelB(f,dt,T,norm,air,sprinting,pitch);return;}
    const armIK=(sx,hand,ua,fa,pole)=>{
      _s.set(sx*0.24,0.52,0.0).applyMatrix4(rg.body.matrix);
      _w.set(0,0.004,0.06);hand.root.localToWorld(_w);m.worldToLocal(_w);
      ik2(_s,_w,0.30,0.28,pole,_k,_e);
      place(ua,_s,_k);place(fa,_k,_e);};
    armIK(1,rg.hr,rg.bones.uaR,rg.bones.faR,POLE_ARM_R);
    armIK(-1,rg.hl,rg.bones.uaL,rg.bones.faL,POLE_ARM_L);
    const amp=(sprinting?0.62:0.44)*Math.min(1,norm*1.1);
    for(let s=-1;s<=1;s+=2){const key=s>0?'R':'L';const pp=ph+(s>0?Math.PI:0);
      let fz=moving?-Math.sin(pp)*amp:(s>0?-0.02:0.02),fy=moving?Math.max(0,-Math.cos(pp))*0.16*Math.min(1,norm*1.3):0;
      if(air){fz=s*0.10;fy=0.20+(s>0?0.06:0);}
      const foot=_t.set(s*0.14,0.075+fy,fz);
      _s.set(s*0.135,rg.body.position.y-0.02,0.0);
      ik2(_s,foot,0.44,0.44,POLE_LEG,_k,_e);
      place(rg.bones['th'+key],_s,_k);place(rg.bones['sh'+key],_k,_e);
      rg.boots[key].rotation.x=moving?Math.max(-0.5,Math.min(0.5,Math.cos(pp)*0.35*amp*2)):0;}}
  return {build,setGun,animate,gunInst,loadModelFromGen};
})();

/* Kick off soldier model — real GLB first, procedural fallback */
(function(){
  const tryGen=()=>{try{if(window.SOLDIER_GEN){CH.loadModelFromGen(window.SOLDIER_GEN.build());console.log('[CH] procedural soldier ready');}else console.warn('[CH] no model available');}catch(e){console.warn('[CH] soldier gen failed',e);}};
    fetch('models/Soldier.glb',{cache:'no-store'})
    .then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.arrayBuffer();})
    .then(buf=>{
      console.log('[CH] GLB bytes',buf.byteLength);
      if(typeof THREE.GLTFLoader!=='function')throw new Error('THREE.GLTFLoader undefined');
      new THREE.GLTFLoader().parse(buf,'',
        g=>{CH.loadModelFromGen({scene:g.scene,animations:g.animations});VM.setGLB({scene:g.scene,animations:g.animations});console.log('[CH] Soldier.glb loaded');},
        e=>{console.error('[CH] GLB parse failed:',e);tryGen();});
    })
    .catch(err=>{console.error('[CH] GLB load failed:',err);tryGen();});
})();
/* Player + bots */
function makePlayerMesh(f){const g=CH.build(f);f.label=makeLabel(f.name);g.add(f.label);g.visible=false;scene.add(g);f.mesh=g;CH.setGun(f,f.weaponKind||'rifle');}
function setFighterWeapon(f,kind){if(!kind)kind='rifle';if(f.weaponKind===kind&&f.mesh)return;f.weaponKind=kind;if(!f.mesh){makePlayerMesh(f);return;}CH.setGun(f,kind);f.ammo=undefined;f.rlT=0;}
const player=makeFighter('You',true,0x6fe3ff);fighters.push(player);
const botPool=[];
for(let i=0;i<NUM_BOTS;i++){const b=makeFighter(BOT_NAMES[i],false,BOT_COLORS[i]);b.weaponKind='rifle';makePlayerMesh(b);botPool.push(b);fighters.push(b);}

/* Weapons */
const WEAPONS=[
  {key:'pistol',name:'R-9 Pistol',short:'Pistol',dmg:18,head:1.8,rate:0.14,mag:15,reload:1.5,hip:0.012,ads:0.003,recoil:0.006,auto:false,pellets:1,adsFov:60,falloff:[30,120,0.5],flashZ:-0.50,recoilKick:0.6,recoilReturn:14},
  {key:'smg',name:'MP-7 SMG',short:'SMG',dmg:13,head:1.6,rate:0.065,mag:30,reload:1.7,hip:0.020,ads:0.006,recoil:0.006,auto:true,pellets:1,adsFov:58,falloff:[25,120,0.5],flashZ:-0.70,recoilKick:0.35,recoilReturn:16},
  {key:'rifle',name:'VX-9 Rifle',short:'Rifle',dmg:22,head:2.0,rate:0.095,mag:30,reload:1.9,hip:0.014,ads:0.0035,recoil:0.0085,auto:true,pellets:1,adsFov:52,falloff:[45,220,0.6],flashZ:-0.86,recoilKick:1.0,recoilReturn:10},
  {key:'bullpup',name:'QB-95 Bullpup',short:'Bullpup',dmg:19,head:2.0,rate:0.075,mag:30,reload:1.85,hip:0.012,ads:0.003,recoil:0.010,auto:true,pellets:1,adsFov:50,falloff:[50,240,0.6],flashZ:-0.80,recoilKick:0.75,recoilReturn:12},
  {key:'dmr',name:'AR-45 DMR',short:'DMR',dmg:38,head:2.2,rate:0.28,mag:15,reload:2.0,hip:0.015,ads:0.002,recoil:0.020,auto:false,pellets:1,adsFov:42,falloff:[80,320,0.7],flashZ:-1.00,recoilKick:2.2,recoilReturn:5},
  {key:'lmg',name:'M-249 LMG',short:'LMG',dmg:20,head:1.8,rate:0.09,mag:100,reload:4.2,hip:0.028,ads:0.010,recoil:0.018,auto:true,pellets:1,adsFov:55,falloff:[40,200,0.55],flashZ:-1.00,recoilKick:1.5,recoilReturn:7},
  {key:'shotgun',name:'Breaker 12',short:'Shotgun',dmg:13,head:1.5,rate:0.85,mag:6,reload:2.6,hip:0.055,ads:0.040,recoil:0.055,auto:false,pellets:9,adsFov:66,falloff:[6,34,0.12],flashZ:-0.98,recoilKick:3.5,recoilReturn:2.5},
  {key:'sniper',name:'Longshot .50',short:'Sniper',dmg:105,head:2.6,rate:1.15,mag:5,reload:2.9,hip:0.048,ads:0.0002,recoil:0.058,auto:false,pellets:1,adsFov:14,falloff:[400,400,1.0],flashZ:-1.22,recoilKick:6.0,recoilReturn:1.7}
];
function dmgMul(w,t){const a=w.falloff[0],b=w.falloff[1],m=w.falloff[2];if(t<=a)return 1;if(t>=b)return m;return lerp(1,m,(t-a)/(b-a));}
const gunRoot=new THREE.Group();viewCamera.add(gunRoot);
const guns=[];
const viewMuzzle=new THREE.PointLight(L(0xffb060),0,3,2);
const flashTex=(function(){const c=document.createElement('canvas');c.width=c.height=128;const g=c.getContext('2d');const gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,255,240,1)');gr.addColorStop(0.18,'rgba(255,210,120,0.95)');gr.addColorStop(0.5,'rgba(255,130,40,0.35)');gr.addColorStop(1,'rgba(255,90,0,0)');g.fillStyle=gr;g.fillRect(0,0,128,128);g.translate(64,64);g.fillStyle='rgba(255,220,150,0.9)';for(let i=0;i<8;i++){g.rotate(Math.PI/4);const len=i%2?34:60;g.beginPath();g.moveTo(0,-4);g.lineTo(len,0);g.lineTo(0,4);g.closePath();g.fill();}return new THREE.CanvasTexture(c);})();
const flashMat=new THREE.MeshBasicMaterial({map:flashTex,color:L(0xffd090),transparent:true,blending:THREE.AdditiveBlending,depthTest:false,depthWrite:false,fog:false,side:THREE.DoubleSide});
const flash=new THREE.Mesh(new THREE.PlaneGeometry(0.28,0.28),flashMat);flash.renderOrder=1100;flash.visible=false;
const RANGES=[120,120,220,240,320,200,34,400],ADSF=[66,62,56,52,24,60,68,12];
WEAPONS.forEach((w,i)=>{w.range=RANGES[i];w.adsFov=ADSF[i];});
VM.init(gunRoot,viewCamera);guns.push(...VM.rig.map(r=>r.g));
VM.rig.forEach(r=>{r.g.add(viewMuzzle);});
WEAPONS.forEach((w,i)=>{w.flashZ=VM.rig[i].A.muzzle[2];});
gunRoot.add(flash);gunRoot.visible=false;

/* Border */
const BORDER_CX=0,BORDER_CZ=0,BORDER_MAX=260,BORDER_MIN=70;
function borderRadiusForCount(count){if(count<=1)return BORDER_MIN;if(count===2)return 100;if(count===3)return 130;if(count===4)return 165;if(count===5)return 200;if(count===6)return 230;return BORDER_MAX;}
const borderMat=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,fog:false,uniforms:{uTime:{value:0},uColor:{value:L(0x3fbaff)},uAlpha:{value:0.9}},
  vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:['uniform float uTime;uniform vec3 uColor;uniform float uAlpha;varying vec2 vUv;','void main(){','  float y=vUv.y;','  float stripes=sin(vUv.x*140.0+uTime*3.2)*0.5+0.5;','  float scan=sin(vUv.x*8.0-uTime*0.9)*0.5+0.5;','  float strength=0.07+stripes*0.10+(1.0-y)*0.14+scan*0.06;','  vec3 col=uColor*(0.55+stripes*0.7+(1.0-y)*0.5);','  gl_FragColor=vec4(col,strength*uAlpha);','}'].join('\n')});
const borderMesh=new THREE.Mesh(new THREE.CylinderGeometry(1,1,1,72,1,true),borderMat);
borderMesh.position.set(BORDER_CX,22,BORDER_CZ);borderMesh.scale.set(BORDER_MIN,44,BORDER_MIN);
borderMesh.renderOrder=50;borderMesh.frustumCulled=false;borderMesh.visible=false;scene.add(borderMesh);
const borderState={targetRadius:BORDER_MAX,currentRadius:BORDER_MAX,active:false,lastOutT:-99,nextDamageT:0,lastCount:0};
function updateBorder(dt){
  let count;if(mode==='multi')count=1+remotes.size;else count=1+NUM_BOTS;
  const target=borderRadiusForCount(count);const wasActive=borderState.active;
  borderState.active=target<BORDER_MAX-1;borderState.targetRadius=target;
  const speed=borderState.currentRadius>target?30:60;
  if(Math.abs(borderState.currentRadius-target)>0.05){borderState.currentRadius+=clamp(target-borderState.currentRadius,-speed*dt,speed*dt);}else borderState.currentRadius=target;
  borderMesh.visible=borderState.active && state!=='menu';
  if(borderMesh.visible){borderMesh.scale.set(borderState.currentRadius,44,borderState.currentRadius);borderMat.uniforms.uTime.value=T;}
  if(count!==borderState.lastCount && borderState.active && wasActive){sfxBorder();
    for(const f of fighters){if(!f.alive)continue;const dx=f.x-BORDER_CX,dz=f.z-BORDER_CZ;const d=Math.hypot(dx,dz);
      if(d>borderState.currentRadius-1){const nx=f.x*0.001+dx/Math.max(d,0.001),nz=dz/Math.max(d,0.001);const r=Math.max(1,borderState.currentRadius-6);f.x=BORDER_CX+nx*r;f.z=BORDER_CZ+nz*r;f.vx=f.vz=0;if(f.isPlayer)toast('Teleported to border','warn');}}}
  borderState.lastCount=count;
  if(borderState.active && state==='playing' && player.alive){const d=Math.hypot(player.x-BORDER_CX,player.z-BORDER_CZ);const out=d>borderState.currentRadius-0.6;
    $('borderWarn').classList.toggle('show',out);
    if(out){if(T>borderState.nextDamageT){borderState.nextDamageT=T+0.5;player.hp=Math.max(1,player.hp-3);P.lastHitAt=T;P.dmgT=0.4;}}}
  else $('borderWarn').classList.remove('show');
  if(borderState.active){for(const b of botPool){if(!b.alive)continue;const d=Math.hypot(b.x-BORDER_CX,b.z-BORDER_CZ);const R=borderState.currentRadius;
    if(d>R-10){const ux=(b.x-BORDER_CX)/Math.max(d,0.001);const uz=(b.z-BORDER_CZ)/Math.max(d,0.001);const tx=BORDER_CX-ux*(R-25);const tz=BORDER_CZ-uz*(R-25);if(b._mem)b._mem.wanderPath=[{x:tx,z:tz}];b.tx=tx;b.tz=tz;}}}
}

/* Game state */
let state='menu';let T=0,matchActive=false;let mode='menu';
let yaw=0,pitch=0,deadT=0;let locked=false,fallback=false,starting=false;let sensSetting=5;
let mouseL=false,mouseR=false,mousePressed=false;
let manualPause=false;
const P={cur:0,ammo:WEAPONS.map(w=>w.mag),reload:0,reloadTotal:1,nextFire:0,heat:0,adsT:0,swap:0,kick:0,flash:0,bob:0,swayX:0,swayY:0,hitT:0,dmgT:0,dmgDirT:0,toastT:0,fovB:0,recoilX:0,recoilY:0,idleSway:0,lastShotTime:0,sprintSway:0,lastHitAt:-999,regenning:false,landDip:0,stepD:0,breath:4,gasp:0,swayYaw:0,swayPitch:0,cycle:0,streak:0,roll:0,zoom:0,climbT:0,nearLadder:false,slideBack:0,boltCycle:0,camShake:0,camShakeYaw:0,camShakePitch:0};
const fx=[],feedItems=[],medkits=[];window.__dbg=null;let chatOpen=false;let adminPromptMode='admin';
const paused=()=>state==='playing' && !chatOpen && (manualPause || (!isMobile && !locked && !fallback && !starting));
const isAds=()=>mouseR&&P.reload<=0&&state==='playing';
const tracerMat=new THREE.MeshBasicMaterial({color:L(0xffdc90),fog:false,transparent:true,opacity:0.85,blending:THREE.AdditiveBlending,depthWrite:false});
function tracer(ax,ay,az,bx,by,bz,w){let dx=bx-ax,dy=by-ay,dz=bz-az;const len=Math.hypot(dx,dy,dz);if(len<0.5)return;const use=Math.min(len,140);dx*=use/len;dy*=use/len;dz*=use/len;const m=new THREE.Mesh(boxGeo,tracerMat);m.position.set(ax+dx/2,ay+dy/2,az+dz/2);m.lookAt(ax+dx,ay+dy,az+dz);m.scale.set(w||0.03,w||0.03,use);scene.add(m);fx.push({mesh:m,life:0.05,max:0.05});}
const puffMats={dust:new THREE.MeshBasicMaterial({color:L(0xdcd6c2)}),blood:new THREE.MeshBasicMaterial({color:L(0xc0392b)}),spark:new THREE.MeshBasicMaterial({color:L(0xffd070)}),smoke:new THREE.MeshBasicMaterial({color:L(0x8a8a86),transparent:true,opacity:0.55,depthWrite:false})};
function puff(x,y,z,kind,n){const isSmoke=kind==='smoke';for(let i=0;i<(n||3);i++){const m=new THREE.Mesh(boxGeo,puffMats[kind]);const s=rnd(0.06,isSmoke?0.16:0.2);m.position.set(x+rnd(-0.12,0.12),y+rnd(-0.12,0.12),z+rnd(-0.12,0.12));m.scale.setScalar(s);scene.add(m);const life=isSmoke?rnd(0.55,0.9):0.28;fx.push({mesh:m,life,max:life,puff:true,s:s,vy:isSmoke?rnd(0.6,1.3):rnd(0.4,1.6),drift:isSmoke?rnd(-0.3,0.3):0,driftZ:isSmoke?rnd(-0.3,0.3):0});}}
function updateFx(dt){for(let i=fx.length-1;i>=0;i--){const e=fx[i];e.life-=dt;if(e.life<=0){scene.remove(e.mesh);fx.splice(i,1);}else if(e.puff){e.mesh.scale.setScalar(Math.max(0.001,e.s*(e.life/e.max)));e.mesh.position.y+=dt*e.vy;e.mesh.position.x+=dt*(e.drift||0);e.mesh.position.z+=dt*(e.driftZ||0);}}}

/* Motes + holes + casings */
const MN=240,moteGeo=new THREE.BufferGeometry(),motePos=new Float32Array(MN*3),moteVel=new Float32Array(MN*3);
for(let i=0;i<MN;i++){motePos[i*3]=rnd(-16,16);motePos[i*3+1]=rnd(0,9);motePos[i*3+2]=rnd(-16,16);moteVel[i*3]=rnd(-0.15,0.15);moteVel[i*3+1]=rnd(-0.05,0.12);moteVel[i*3+2]=rnd(-0.15,0.15);}
moteGeo.setAttribute('position',new THREE.BufferAttribute(motePos,3));
const motes=new THREE.Points(moteGeo,new THREE.PointsMaterial({color:L(0xffeecc),size:0.055,transparent:true,opacity:0.5,depthWrite:false,fog:false,blending:THREE.AdditiveBlending}));
motes.frustumCulled=false;scene.add(motes);
function updateMotes(dt){motes.visible=(state==='playing'||state==='dead');if(!motes.visible)return;const c=camera.position;for(let i=0;i<MN;i++){const o=i*3;
  motePos[o]+=(moteVel[o]+Math.sin(T*0.7+i)*0.08)*dt;motePos[o+1]+=moteVel[o+1]*dt;motePos[o+2]+=(moteVel[o+2]+Math.cos(T*0.6+i*1.3)*0.08)*dt;
  motePos[o]=c.x+((motePos[o]-c.x+16)%32+32)%32-16;motePos[o+1]=c.y+((motePos[o+1]-c.y+4)%14+14)%14-4;motePos[o+2]=c.z+((motePos[o+2]-c.z+16)%32+32)%32-16;}
  moteGeo.attributes.position.needsUpdate=true;}
const holeTex=(function(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');let gr=g.createRadialGradient(32,32,0,32,32,30);gr.addColorStop(0,'rgba(8,6,5,0.95)');gr.addColorStop(0.28,'rgba(12,10,8,0.9)');gr.addColorStop(0.5,'rgba(30,26,22,0.45)');gr.addColorStop(1,'rgba(30,26,22,0)');g.fillStyle=gr;g.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);})();
const holeMat=new THREE.MeshBasicMaterial({map:holeTex,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
const holeGeo=new THREE.PlaneGeometry(1,1),holes=[];
function bulletHole(px,py,pz,dx,dy,dz){let n=null,bd=0.12;const cand=queryGrid(px,pz,0.5);
  for(const b of cand){if(b.ray===false)continue;if(py<b.y0-0.1||py>b.y1+0.1||px<b.x0-0.1||px>b.x1+0.1||pz<b.z0-0.1||pz>b.z1+0.1)continue;
    const t=[[Math.abs(px-b.x0),-1,0,0],[Math.abs(px-b.x1),1,0,0],[Math.abs(py-b.y0),0,-1,0],[Math.abs(py-b.y1),0,1,0],[Math.abs(pz-b.z0),0,0,-1],[Math.abs(pz-b.z1),0,0,1]];for(const e of t)if(e[0]<bd){bd=e[0];n=e;}}
  if(!n&&py<0.08)n=[0,0,1,0];if(!n)return;
  const nx=n[1],ny=n[2],nz=n[3];if(nx*dx+ny*dy+nz*dz>0)return;
  let m;if(holes.length>=90){m=holes.shift();}else{m=new THREE.Mesh(holeGeo,holeMat);scene.add(m);}
  holes.push(m);const s=rnd(0.09,0.17);
  m.position.set(px+nx*0.012,py+ny*0.012,pz+nz*0.012);m.lookAt(px+nx,py+ny,pz+nz);m.rotateZ(rnd(0,TAU));m.scale.set(s,s,1);
  if(ny<0.5)puff(px+nx*0.05,py+ny*0.05,pz+nz*0.05,'spark',2);}
const casings=[];
const casingGeo=new THREE.CylinderGeometry(0.0075,0.0085,0.021,6);
const casingMatBrass=lam(0xc9a54a),casingMatTarnish=lam(0x8a7020);
function ejectCasing(px,py,pz,rightX,rightZ,backX,backZ){if(casings.length>48){const o=casings.shift();scene.remove(o.mesh);}const m=new THREE.Mesh(casingGeo,Math.random()<0.6?casingMatBrass:casingMatTarnish);m.position.set(px,py,pz);m.rotation.set(rnd(0,TAU),rnd(0,TAU),rnd(0,TAU));scene.add(m);casings.push({mesh:m,vx:rightX*rnd(1.6,3.2)-backX*rnd(0.3,1.1)+rnd(-0.3,0.3),vy:rnd(2.4,4.2),vz:rightZ*rnd(1.6,3.2)-backZ*rnd(0.3,1.1)+rnd(-0.3,0.3),rx:rnd(-16,16),ry:rnd(-16,16),rz:rnd(-16,16),life:4.5,bounces:0});}
const debris=[];
function vmEvent(name,r){
  if(name==='magOut'){sfxTone(240,0.05,0.13,'square',170);sfxNoise(0.12,1600,300,0.06,'bandpass');}
  else if(name==='drop'){if(r.kind!=='shotgun')dropMag(r);sfxNoise(0.08,900,200,0.08);}
  else if(name==='magGrab'){sfxNoise(0.06,2500,900,0.05,'bandpass');}
  else if(name==='magIn'){sfxTone(430,0.045,0.16,'square',300);setTimeout(()=>sfxNoise(0.16,1800,300,0.06,'bandpass'),40);}
  else if(name==='bolt'){sfxTone(520,0.04,0.12,'square',380);setTimeout(()=>sfxTone(300,0.05,0.14,'square',200),90);}
  else if(name==='shell'){sfxTone(360,0.04,0.12,'square',260);sfxNoise(0.1,1400,400,0.05,'bandpass');}
  else if(name==='pump'){sfxNoise(0.22,1400,300,0.12,'bandpass');setTimeout(()=>sfxTone(200,0.06,0.14,'square',140),120);}}
function dropMag(r){const mg=r.g.userData.mag;if(!mg)return;const m=mg.clone();scene.add(m);
  mg.getWorldPosition(_v);const q=new THREE.Quaternion();mg.getWorldQuaternion(q);_v.applyMatrix4(camera.matrixWorld);q.premultiply(camera.quaternion);
  m.position.copy(_v);m.quaternion.copy(q);m.visible=true;m.scale.setScalar(1);m.traverse(o=>{o.frustumCulled=false;});
  const cx=Math.cos(yaw),cz=-Math.sin(yaw);
  debris.push({mesh:m,vx:cx*rnd(-0.6,0.2),vy:rnd(0.2,1.0),vz:cz*rnd(-0.6,0.2),rx:rnd(-4,4),ry:rnd(-4,4),rz:rnd(-4,4),life:7,b:0});
  if(debris.length>6){const o=debris.shift();scene.remove(o.mesh);}}
function updateDebris(dt){for(let i=debris.length-1;i>=0;i--){const d=debris[i];d.life-=dt;if(d.life<=0){scene.remove(d.mesh);debris.splice(i,1);continue;}
  d.vy-=24*dt;const m=d.mesh;m.position.x+=d.vx*dt;m.position.y+=d.vy*dt;m.position.z+=d.vz*dt;
  if(d.b<4){m.rotation.x+=d.rx*dt;m.rotation.y+=d.ry*dt;m.rotation.z+=d.rz*dt;}
  if(m.position.y<0.05){m.position.y=0.05;d.b++;d.vy=-d.vy*0.3;d.vx*=0.5;d.vz*=0.5;d.rx*=0.3;d.ry*=0.3;d.rz*=0.3;if(d.b===1)sfxNoise(0.10,700,150,0.08);if(d.b>3){d.vy=0;d.vx=d.vz=0;d.rx=d.ry=d.rz=0;}}}}
function updateCasings(dt){for(let i=casings.length-1;i>=0;i--){const c=casings[i];c.life-=dt;if(c.life<=0){scene.remove(c.mesh);casings.splice(i,1);continue;}
  c.vy-=24*dt;c.mesh.position.x+=c.vx*dt;c.mesh.position.y+=c.vy*dt;c.mesh.position.z+=c.vz*dt;
  c.mesh.rotation.x+=c.rx*dt;c.mesh.rotation.y+=c.ry*dt;c.mesh.rotation.z+=c.rz*dt;
  if(c.mesh.position.y<0.016){c.mesh.position.y=0.016;c.bounces++;c.vy=-c.vy*0.28;c.vx*=0.55;c.vz*=0.55;c.rx*=0.35;c.ry*=0.35;c.rz*=0.35;if(c.bounces>3){c.vy=0;c.vx=0;c.vz=0;c.rx=0;c.ry=0;c.rz=0;}}}}

/* HUD helpers */
const cache={};
function setText(id,v){if(cache[id]!==v){cache[id]=v;$(id).textContent=v;}}
function toast(msg,cls){const t=$('toast');t.textContent=msg;t.className='show '+(cls||'');P.toastT=1.4;}
function renderFeed(){$('feed').innerHTML=feedItems.slice(-5).map(i=>{if(i.say)return '<div class="fi say"><b>'+esc(i.k)+':</b><span>'+esc(i.v)+'</span></div>';return '<div class="fi'+(i.me?' me':'')+'"><b>'+esc(i.k)+'</b><span class="ic">'+(i.ic||(i.head?'⌖':'✕'))+'</span><b>'+esc(i.v)+'</b></div>';}).join('');}
function showHit(head,kill){const h=$('hitm');h.className='show'+(head?' head':'')+(kill?' kill':'');P.hitT=kill?0.3:0.14;}
function showDmgDir(ax,az){const fx_=-Math.sin(yaw),fz_=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);const dx=ax-player.x,dz=az-player.z;const a=Math.atan2(dx*rx+dz*rz,dx*fx_+dz*fz_);$('dmgdir').style.transform='rotate('+a+'rad)';P.dmgDirT=1.1;}
function sortedFighters(){return fighters.slice().sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name));}
function renderBoard(){const s=sortedFighters();$('brows').innerHTML=s.map((f,i)=>{const kd=f.deaths?(f.kills/f.deaths).toFixed(2):f.kills.toFixed(2);const aliveFlag=f.isPlayer?(state==='playing'):f.alive;return '<tr class="'+(f.isPlayer?'me ':'')+(aliveFlag?'':'dead ')+(i===0?'top':'')+'"><td class="c rk">'+(i+1)+'</td><td>'+esc(f.name)+(f.isPlayer?' (you)':'')+'</td><td class="n">'+f.kills+'</td><td class="n">'+f.deaths+'</td><td class="n">'+kd+'</td><td class="c"><span class="st"></span></td></tr>';}).join('');$('btimer').textContent=statusText();}
function chatLine(name,text,cls,old){if(!old)_lastChatAt=performance.now();const log=$('chatlog'),line=document.createElement('div');line.className='chat'+(cls?' '+cls:'')+(old?' faded':'');line.innerHTML=name?('<b>'+esc(name)+'</b> '+esc(text)):esc(text);log.appendChild(line);chatHist.push({el:line,ts:old?performance.now()-30000:performance.now()});while(chatHist.length>150)chatHist.shift().el.remove();if(chatOpen)log.scrollTop=log.scrollHeight;}
function sysLine(t,cls){chatLine(null,t,'sys '+(cls||''));}
function clearChat(){$('chatlog').innerHTML='';chatHist.length=0;}
let chatTickT=0;
function chatTick(dt){chatTickT-=dt;if(chatTickT>0||chatOpen)return;chatTickT=0.5;const now=performance.now();let vis=0;const cap=isMobile?3:8;
    for(let i=chatHist.length-1;i>=0;i--){const h=chatHist[i],old=(now-h.ts>9000)||vis>=cap;if(!old)vis++;h.el.classList.toggle('faded',old);}};
const chatHist=[];
const rctx=$('radar').getContext('2d');const RS=150,RR=80,RK=RS/2/RR;
function drawRadar(){const g=rctx;g.clearRect(0,0,RS,RS);g.save();g.beginPath();g.arc(RS/2,RS/2,RS/2-1,0,TAU);g.clip();g.fillStyle='rgba(14,24,32,.88)';g.fillRect(0,0,RS,RS);g.translate(RS/2,RS/2);g.rotate(yaw);g.scale(RK,RK);g.translate(-player.x,-player.z);
  g.fillStyle='rgba(255,255,255,.06)';g.fillRect(-6,-MAP,12,MAP*2);g.fillRect(-MAP,-6,MAP*2,12);
  const cand=queryGrid(player.x,player.z,RR);g.fillStyle='rgba(170,190,205,.5)';for(const b of cand){if(b.y0>1||b.y1<1.2)continue;g.fillRect(b.x0,b.z0,b.x1-b.x0,b.z1-b.z0);}
  g.fillStyle='#43e0a0';for(const m of medkits){if(m.active&&Math.hypot(m.x-player.x,m.z-player.z)<RR){g.beginPath();g.arc(m.x,m.z,2.2/RK*1.6,0,TAU);g.fill();}}
  g.fillStyle='#ff4d4d';for(const f of fighters){if(f===player||!f.alive)continue;if(f.id!==undefined&&f.id===net.selfId)continue;if(f.remote&&f.name&&player.name&&f.name.toLowerCase()===player.name.toLowerCase())continue;const d=Math.hypot(f.x-player.x,f.z-player.z);if(d<40||(T-f.lastFire<2&&d<RR)){g.beginPath();g.arc(f.x,f.z,3.2/RK,0,TAU);g.fill();}}
  g.restore();g.fillStyle='#6fe3ff';g.beginPath();g.moveTo(RS/2,RS/2-8);g.lineTo(RS/2+6,RS/2+6);g.lineTo(RS/2-6,RS/2+6);g.closePath();g.fill();}

/* Net */
const remotes=new Map();
const myColor=BOT_COLORS[(Math.random()*BOT_COLORS.length)|0];
const net={ws:null,arena:1,status:'idle',selfId:null,mapSent:false};
function statusText(){if(mode==='single')return 'Single player';if(mode==='multi'){if(net.status==='connecting')return 'Connecting…';if(net.status==='online')return 'Arena '+net.arena+' · '+(1+remotes.size)+' players';return 'Offline';}return '';}
function connectArena(n){if(net.ws){try{net.ws.close();}catch(e){}}net.arena=n;net.status='connecting';net.mapSent=false;net.mapReady=false;const proto=location.protocol==='https:'?'wss:':'ws:';const ws=new WebSocket(proto+'//'+location.host+'/ws?arena='+n);net.ws=ws;
  ws.onopen=()=>{net.status='online';ws.send(JSON.stringify({t:'join',name:player.name,color:myColor}));};
  ws.onmessage=(e)=>{let msg;try{msg=JSON.parse(e.data);}catch(err){return;}handleNetMessage(msg);};
  ws.onclose=()=>{net.status='idle';if(state==='playing'||state==='dead')toast('Disconnected','warn');};
  ws.onerror=()=>{net.status='idle';};}
function handleNetMessage(msg){switch(msg.t){
  case 'welcome':net.selfId=msg.id;break;
  case 'mapReady':net.mapReady=true;break;
  case 'players':for(const p of msg.list)addRemote(p.id,p);sysLine('You joined the arena · '+(msg.list.length+1)+' players online','join');break;
  case 'joined':if(msg.id!==net.selfId){const f=addRemote(msg.id,msg);if(f){toast(f.name+' joined','warn');sysLine(f.name+' joined the game','join');}}break;
  case 'left':{const f=remotes.get(msg.id);if(f){toast(f.name+' left','warn');sysLine(f.name+' left the game','leave');removeRemote(msg.id);}break;}
  case 'spawned':if(msg.id!==net.selfId){const f=remotes.get(msg.id)||addRemote(msg.id,msg);if(f){f.alive=true;f.hasState=true;f.x=f.nx=msg.x;f.y=f.ny=msg.y;f.z=f.nz=msg.z;f.yaw=f.nyaw=msg.yaw;f.hp=100;f.mesh.visible=true;f.mesh.rotation.set(0,0,0);}}break;
  case 'state':onRemoteState(msg);break;
  case 'fire':onRemoteFire(msg);break;
  case 'hit':if(player.alive&&player.invuln<=0){player.hp-=msg.dmg;P.dmgT=0.6;P.lastHitAt=T;sfxHurt();if(msg.fromX!==undefined)showDmgDir(msg.fromX,msg.fromZ);if(player.hp<=0){player.hp=0;player.alive=false;player.deaths++;onPlayerDeath();}}break;
  case 'kill':{if(msg.victim===net.selfId&&msg.by===net.selfId)break;
    const killer=remotes.get(msg.by),victimR=remotes.get(msg.victim);
    if(msg.by===net.selfId){player.kills++;sfxKill();showHit(!!msg.hs,true);toast('Eliminated '+(msg.victimName||'a player'),'good');}
    if(msg.victim===net.selfId&&player.alive){player.hp=0;player.alive=false;player.deaths++;onPlayerDeath(killer||(msg.byName?{name:msg.byName}:null),!!msg.hs,msg.cause);}
    if(victimR){victimR.alive=false;victimR.deathT=0;victimR.deathSign=killer?deathSignFor(victimR,killer):-1;}
    const fall=msg.cause==='fall';
    if(msg.victimName){feedItems.push({k:fall?msg.victimName:(msg.byName||'?'),v:fall?'fell':msg.victimName,ic:fall?'⬇':null,head:!!msg.hs,t:T,me:msg.by===net.selfId});if(feedItems.length>12)feedItems.shift();renderFeed();logKill(msg.byName,msg.victimName,!!msg.hs,fall);}
    break;}
  case 'chat':chatLine(msg.name,msg.m);break;
  case 'chatHistory':for(const c of msg.m){if(c.sys)chatLine(null,c.name+(c.sys==='join'?' joined the game':' left the game'),'sys '+c.sys,true);else chatLine(c.name,c.m,'',true);}break;
  case 'snap':player.x=msg.x;player.y=msg.y;player.z=msg.z;if(typeof msg.yaw==='number')yaw=msg.yaw;break;
  case 'private':sysLine(msg.m);if(!$('adminPrompt').classList.contains('hidden'))hideAdminPrompt();break;
  case 'error':leaveMatch(msg.m);break;
}}
function toB64(u8){let s='';for(let i=0;i<u8.length;i+=8192)s+=String.fromCharCode.apply(null,u8.subarray(i,i+8192));return btoa(s);}
function uploadMap(){if(!net.ws||net.ws.readyState!==1||net.mapSent||net.mapReady)return;net.mapSent=true;const sol=boxes.filter(b=>b.ray!==false),arr=new Int16Array(sol.length*6);let i=0;for(const b of sol){arr[i++]=Math.round(b.x0*50);arr[i++]=Math.round(b.x1*50);arr[i++]=Math.round(b.y0*50);arr[i++]=Math.round(b.y1*50);arr[i++]=Math.round(b.z0*50);arr[i++]=Math.round(b.z1*50);}const bytes=new Uint8Array(arr.buffer),PER=96000,n=Math.ceil(bytes.length/PER);for(let k=0;k<n;k++)net.ws.send(JSON.stringify({t:'map',i:k,n,s:toB64(bytes.subarray(k*PER,(k+1)*PER))}));}
function addRemote(id,info){if(id===net.selfId)return null;if(info&&info.name&&player.name&&info.name.toLowerCase()===player.name.toLowerCase())return null;let f=remotes.get(id);if(f)return f;f=makeFighter(info.name||'Player',false,info.color||BOT_COLORS[0]);f.remote=true;f.id=id;f.isBot=false;f.weaponKind=info.wk||'rifle';f.nx=info.x||0;f.ny=info.y||0;f.nz=info.z||0;f.nyaw=info.yaw||0;f.x=f.nx;f.y=f.ny;f.z=f.nz;f.yaw=f.nyaw;f.hasState=true;f.alive=info.alive!==0;f.kills=info.kills||0;f.deaths=info.deaths||0;f.lastMsg=performance.now();remotes.set(id,f);fighters.push(f);makePlayerMesh(f);f.mesh.visible=f.alive;return f;}
function removeRemote(id){const f=remotes.get(id);if(!f)return;if(f.mesh)scene.remove(f.mesh);const i=fighters.indexOf(f);if(i>=0)fighters.splice(i,1);remotes.delete(id);}
function onRemoteState(msg){if(msg.id===net.selfId)return;if(msg.n&&player.name&&msg.n.toLowerCase()===player.name.toLowerCase())return;let f=remotes.get(msg.id);if(!f){f=addRemote(msg.id,{name:msg.n||'Player',color:msg.c,wk:msg.wk});if(!f)return;}f.lastMsg=performance.now();if(Math.hypot(msg.x-f.x,msg.z-f.z)>30){f.x=msg.x;f.y=msg.y;f.z=msg.z;}f.nx=msg.x;f.ny=msg.y;f.nz=msg.z;f.nyaw=msg.yaw;f.pitch=msg.p||0;f.hp=msg.hp;f.kills=msg.kills|0;f.deaths=msg.deaths|0;if(msg.wk)setFighterWeapon(f,msg.wk);const alive=!!msg.alive;if(alive&&!f.alive){f.alive=true;f.mesh.visible=true;f.mesh.rotation.set(0,0,0);f.deathT=0;}else if(!alive&&f.alive){f.alive=false;f.deathT=0;}}
function onRemoteFire(msg){const f=remotes.get(msg.id);if(f)f.lastFire=T;const o=msg.o,d=msg.d,w=WEAPONS[msg.w|0]||WEAPONS[0],len=Math.min(w.range,140);tracer(o[0],o[1],o[2],o[0]+d[0]*len,o[1]+d[1]*len,o[2]+d[2]*len,0.03);const cd=Math.hypot(o[0]-camera.position.x,o[2]-camera.position.z);sfxShot(w.key,0.3*clamp(1-cd/120,0,1));}
function sendMyState(){if(!net.ws||net.ws.readyState!==1)return;const p=player;net.ws.send(JSON.stringify({t:'state',x:r2(p.x),y:r2(p.y),z:r2(p.z),yaw:r2(yaw),p:r2(pitch),hp:Math.round(p.hp),alive:p.alive?1:0,wk:WEAPONS[P.cur]?WEAPONS[P.cur].key:'rifle'}));}
function updateRemotes(dt){const k=1-Math.exp(-dt*14);const now=performance.now();for(const f of Array.from(remotes.values())){if(!f.hasState)continue;if(now-f.lastMsg>25000){removeRemote(f.id);continue;}if(Math.hypot(f.nx-f.x,f.nz-f.z)>30){f.x=f.nx;f.y=f.ny;f.z=f.nz;}else{f.x+=(f.nx-f.x)*k;f.y+=(f.ny-f.y)*k;f.z+=(f.nz-f.z)*k;}f.yaw+=angDiff(f.yaw,f.nyaw)*k;f.onGround=true;}}
function stopNet(){if(net.ws){try{net.ws.close();}catch(e){}net.ws=null;}net.status='idle';net.mapSent=false;net.mapReady=false;for(const id of Array.from(remotes.keys()))removeRemote(id);}
setInterval(()=>{if(mode==='multi' && net.ws && net.ws.readyState===1 && (state==='playing'||state==='dead'))sendMyState();},50);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible' && net.ws && net.ws.readyState===1 && mode==='multi')net.ws.send(JSON.stringify({t:'roster'}));});

/* Bot AI */
function botMemory(b){if(!b._mem){b._mem={jumpCd:0,climbCd:0,orbitDir:Math.random()<0.5?1:-1,orbitT:0,perch:null,perchT:0,wanderPath:[],lastSeenT:99,lastSeenX:0,lastSeenY:0,lastSeenZ:0,rushT:0,retreatT:0,peekT:0};}return b._mem;}
function botPref(b){const k=b.weaponKind||'rifle';
  const P={pistol:{range:90,prefer:16,acc:0.026,lead:0.85,headChance:0.60,aggression:0.90},smg:{range:100,prefer:12,acc:0.030,lead:0.90,headChance:0.55,aggression:1.00},rifle:{range:200,prefer:24,acc:0.020,lead:0.95,headChance:0.65,aggression:0.90},bullpup:{range:200,prefer:22,acc:0.020,lead:0.95,headChance:0.65,aggression:0.95},dmr:{range:320,prefer:70,acc:0.014,lead:1.05,headChance:0.70,aggression:0.65},lmg:{range:180,prefer:28,acc:0.030,lead:0.80,headChance:0.55,aggression:0.95},shotgun:{range:34,prefer:7,acc:0.060,lead:0.50,headChance:0.45,aggression:1.10},sniper:{range:400,prefer:140,acc:0.010,lead:1.15,headChance:0.75,aggression:0.50}};
  const base=P[k]||P.rifle;
  const STYLE={chill:{accMul:1.10,reactMul:1.00,aggrMul:0.85,headMul:1.10},toxic:{accMul:0.95,reactMul:0.80,aggrMul:1.20,headMul:1.00},friendly:{accMul:1.00,reactMul:0.95,aggrMul:1.00,headMul:1.05},tryhard:{accMul:0.85,reactMul:0.70,aggrMul:1.10,headMul:1.20},quiet:{accMul:1.05,reactMul:0.90,aggrMul:0.90,headMul:1.10}};
  const s=STYLE[b.persona]||STYLE.chill;
  return {range:base.range,prefer:base.prefer,acc:base.acc*s.accMul,lead:base.lead,headChance:Math.min(0.9,base.headChance*s.headMul),aggression:base.aggression*s.aggrMul,_reactMul:s.reactMul};}
function findNearestLadderUp(x,z){let best=null,bd=1e9;for(const L of ladders){if(L.y0>2)continue;const d=Math.hypot(L.bx-x,L.bz-z);if(d<bd&&d<45){best=L;bd=d;}}return best;}
function findNearestLadder(x,z,maxDist){let best=null,bd=maxDist||60;for(const L of ladders){const d=Math.hypot(L.bx-x,L.bz-z);if(d<bd){best=L;bd=d;}}return best;}
function pickSniperPerch(b,t){let best=null,bs=1e9;for(let i=0;i<roofSpots.length;i++){const s=roofSpots[i];const dy=s[2]-b.y;if(dy<2.5)continue;const dToLad=Math.hypot(s[0]-b.x,s[1]-b.z);if(dToLad>90)continue;const dToT=Math.hypot(s[0]-t.x,s[1]-t.z);if(dToT<25||dToT>380)continue;if(losBlocked(s[0],s[2]+1.4,s[1],t.x,t.y+1.1,t.z))continue;const score=dToLad*0.4+dToT*0.6;if(score<bs){bs=score;best=s;}}return best;}
function acquire(b){const pref=botPref(b);let best=null,bd=1e9;
  for(const f of fighters){if(f===b||!f.alive||f.invuln>0)continue;const d=Math.hypot(f.x-b.x,f.z-b.z);if(d>pref.range*1.1)continue;
    const visible=!losBlocked(b.x,b.y+1.55,b.z,f.x,f.y+1.1,f.z);const hpBonus=(100-f.hp)*0.55;const visibleBonus=visible?90:0;const score=d-visibleBonus-hpBonus;
    if(score<bd){best=f;bd=score;}}
  if(best!==b.target){if(!best&&b.target){b.tx=b.target.x;b.tz=b.target.z;}b.target=best;
    if(best){const vis=!losBlocked(b.x,b.y+1.55,b.z,best.x,best.y+1.1,best.z);b.reactT=(vis?rnd(0.06,0.20):rnd(0.35,0.75))/b.skill*(pref._reactMul||1);if(vis&&Math.random()<0.45)BotChat.event('spotted',{bot:b});}}}
function botFire(b,t){const pref=botPref(b);const w=WEAPONS.find(x=>x.key===b.weaponKind)||WEAPONS[2];
  if(b.rlT>0)return;if(b.ammo===undefined)b.ammo=w.mag;
  if(--b.ammo<=0){b.ammo=w.mag;b.rlT=b.rlTotal=Math.min(2.4,w.reload*0.75);BotChat.event('reload',{bot:b});}
  b.lastFire=T;
  const ox=b.x,oy=b.y+1.45,oz=b.z;const dist=Math.hypot(t.x-ox,t.z-oz)||0.01;
  if(t._pvx===undefined){t._pvx=0;t._pvz=0;t._px=t.x;t._pz=t.z;}
  const lead=pref.lead*0.4;const predX=t.x+t._pvx*lead*dist*0.02;const predZ=t.z+t._pvz*lead*dist*0.02;
  const tSpd=Math.hypot(t._pvx||0,t._pvz||0);const movingTargetPenalty=tSpd>3?0.65:1.0;
  const aimHead=Math.random()<pref.headChance*b.skill*movingTargetPenalty;const aimY=t.y+(aimHead?1.65:1.05);
  const bSpd=Math.hypot(b.vx,b.vz);const moveP=1+bSpd*0.08;const sd=(pref.acc/b.skill)*moveP;
  const ex=predX+rnd(-1,1)*sd*dist,ey=aimY+rnd(-1,1)*sd*dist*0.35,ez=predZ+rnd(-1,1)*sd*dist;
  let dx=ex-ox,dy=ey-oy,dz=ez-oz;const LL=Math.hypot(dx,dy,dz);dx/=LL;dy/=LL;dz/=LL;
  const h=castRay(ox,oy,oz,dx,dy,dz,LL+60,b);b.lastFire=T;
  const cd=Math.hypot(b.x-camera.position.x,b.z-camera.position.z);
  if(cd<140){const mx=b.x-Math.sin(b.yaw)*0.7,mz=b.z-Math.cos(b.yaw)*0.7;tracer(mx,b.y+1.25,mz,ox+dx*h.t,oy+dy*h.t,oz+dz*h.t,0.03);sfxShot(w.key,0.30*clamp(1-cd/140,0,1));
    if(h.world){puff(ox+dx*h.t,oy+dy*h.t,oz+dz*h.t,'dust',1);bulletHole(ox+dx*h.t,oy+dy*h.t,oz+dz*h.t,dx,dy,dz);}}
  if(h.f&&!h.f.remote){const mul=dmgMul(w,h.t);const dmg=w.dmg*mul*(h.head?w.head:1);damage(h.f,dmg,b,h.head);if(h.f.isPlayer&&Math.random()<0.08)BotChat.event('pressured',{bot:b});}
  else if(h.world&&Math.random()<0.02)BotChat.event('whiff',{bot:b});}
function updateBot(b,dt){
  if(!b.alive){if(T>=b.respawnAt&&state!=='ended')spawn(b);return;}
  if(b.invuln>0)b.invuln-=dt;
  const mem=botMemory(b);const pref=botPref(b);const wpn=WEAPONS.find(w=>w.key===b.weaponKind)||WEAPONS[2];
  if((!b.target || !b.target.alive) && Math.random()<0.04){for(const ally of botPool){if(ally===b||!ally.alive||!ally.target||!ally.target.alive)continue;if(Math.hypot(ally.x-b.x,ally.z-b.z)>60)continue;const enemy=ally.target;if(losBlocked(b.x,b.y+1.55,b.z,enemy.x,enemy.y+1.1,enemy.z))continue;b.target=enemy;b.reactT=rnd(0.1,0.3)/b.skill*(pref._reactMul||1);break;}}
  if(b.climb){const L=b.climb;b.y+=3.0*dt;b.x=lerp(b.x,L.cx,Math.min(1,dt*14));b.z=lerp(b.z,L.cz,Math.min(1,dt*14));b.vx=b.vz=b.vy=0;b.onGround=false;b.speed=0;b.yaw=Math.atan2(-(L.cx-b.x),-(L.cz-b.z));if(b.y>=L.yTop){b.climb=null;b.x=L.ex;b.z=L.ez;b.y=L.yTop;b.onGround=true;b.peakY=b.y;b.vy=2.5;}if(b.thinkT<=0){b.thinkT=0.2;acquire(b);}return;}
  b.thinkT-=dt;if(b.thinkT<=0){b.thinkT=0.15+Math.random()*0.12;acquire(b);}
  b.reactT-=dt;mem.jumpCd=Math.max(mem.jumpCd-dt,0);mem.climbCd=Math.max(mem.climbCd-dt,0);mem.orbitT-=dt;mem.lastSeenT+=dt;mem.perchT=Math.max(mem.perchT-dt,0);
  let mx=0,mz=0,sprint=false,jump=false;const t=b.target;const isLongRange=(b.weaponKind==='sniper'||b.weaponKind==='dmr');
  if(t&&t.alive){const dx=t.x-b.x,dz=t.z-b.z;const dist=Math.hypot(dx,dz)||1;const ux=dx/dist,uz=dz/dist;const dy=t.y-b.y;
    const visible=!losBlocked(b.x,b.y+1.45,b.z,t.x,t.y+1.1,t.z);
    if(visible){mem.lastSeenT=0;mem.lastSeenX=t.x;mem.lastSeenY=t.y;mem.lastSeenZ=t.z;}
    if(isLongRange && b.y<2 && mem.climbCd<=0){if(!mem.perch || mem.perchT<=0){mem.perch=pickSniperPerch(b,t);mem.perchT=12;}
      if(mem.perch){const dxP=mem.perch[0]-b.x,dzP=mem.perch[1]-b.z;const dP=Math.hypot(dxP,dzP);const lad=findNearestLadder(b.x,b.z,50);
        if(lad && dP>4 && Math.hypot(lad.bx-b.x,lad.bz-b.z)<2.5){b.climb=lad;mem.climbCd=8;return;}
        if(lad && dP>4){mx=lad.bx-b.x;mz=lad.bz-b.z;const ll=Math.hypot(mx,mz)||1;mx/=ll;mz/=ll;sprint=true;b.yaw+=angDiff(b.yaw,Math.atan2(-mx,-mz))*Math.min(1,dt*6);
          if(visible && b.reactT<=0 && T>=b.nextShot && dist<wpn.range*0.95){botFire(b,t);b.nextShot=T+wpn.rate+rnd(0.4,1.1);}
          const s=steer(b,mx,mz);const ms=sprint?7.5:4.8;const kk=Math.min(1,dt*(b.onGround?12:2.5));b.vx+=(s[0]*ms-b.vx)*kk;b.vz+=(s[1]*ms-b.vz)*kk;physics(b,dt);b.speed=Math.hypot(b.vx,b.vz);return;}}}
    if(dy>3.5 && mem.climbCd<=0){const lad=findNearestLadderUp(b.x,b.z);
      if(lad&&Math.hypot(lad.bx-b.x,lad.bz-b.z)<2.5){b.climb=lad;mem.climbCd=5;return;}
      else if(lad){mx=lad.bx-b.x;mz=lad.bz-b.z;const ll=Math.hypot(mx,mz)||1;mx/=ll;mz/=ll;sprint=true;b.yaw+=angDiff(b.yaw,Math.atan2(-mx,-mz))*Math.min(1,dt*6);}
      else{mx=ux;mz=uz;b.yaw+=angDiff(b.yaw,Math.atan2(-ux,-uz))*Math.min(1,dt*6);}}
    else{const wantYaw=Math.atan2(-dx,-dz);b.yaw+=angDiff(b.yaw,wantYaw)*Math.min(1,dt*7*b.skill);
      const desired=pref.prefer;const tooFar=dist>desired*1.35;const tooClose=dist<desired*0.7;
      const recentlyHit=(T-b.lastHit)<1.2;const strafeMul=recentlyHit?2.2:1.0;const perched=isLongRange && b.y>3;
      if(mem.orbitT<=0){mem.orbitT=rnd(1.6,3.4)/strafeMul;mem.orbitDir=Math.random()<0.5?-1:1;}
      if(b.hp<40 && Math.random()<0.005)mem.orbitDir*=-1;
      if(perched){mx=-uz*mem.orbitDir*0.25;mz=ux*mem.orbitDir*0.25;if(tooFar && dist>desired*2.2){mx=ux;mz=uz;sprint=true;}}
      else if(tooFar){mx=ux-uz*mem.orbitDir*0.35;mz=uz+ux*mem.orbitDir*0.35;sprint=dist>desired*2;}
      else if(tooClose){mx=-ux-uz*mem.orbitDir*0.55;mz=-uz+ux*mem.orbitDir*0.55;}
      else{mx=-uz*mem.orbitDir;mz=ux*mem.orbitDir;const keep=(desired-dist)*0.35;mx+=ux*keep;mz+=uz*keep;}
      if(!visible&&mem.lastSeenT>2.5&&Math.random()<0.03)acquire(b);
      if(visible && b.reactT<=0 && T>=b.nextShot && dist<wpn.range*0.95){botFire(b,t);
        let burstSize,pause;
        if(wpn.key==='sniper'){burstSize=1;pause=rnd(0.9,1.6);}
        else if(wpn.key==='dmr'){burstSize=1;pause=rnd(0.35,0.65);}
        else if(wpn.key==='shotgun'){burstSize=1;pause=rnd(0.45,0.85);}
        else if(wpn.key==='pistol'){burstSize=2;pause=rnd(0.20,0.40);}
        else if(wpn.key==='lmg'){burstSize=6+((Math.random()*5)|0);pause=rnd(0.45,0.85);}
        else{burstSize=4+((Math.random()*3)|0);pause=rnd(0.22,0.45);}
        if(--b.burst<=0){b.burst=burstSize;if(b.hp<35 && Math.random()<0.15)pause+=rnd(0.4,0.9);b.nextShot=T+pause;}
        else b.nextShot=T+wpn.rate+0.015+Math.random()*0.03;}
      if(mem.jumpCd<=0 && Math.random()<0.02){jump=true;mem.jumpCd=rnd(2,4);}}}
  else{if(!mem.wanderPath||!mem.wanderPath.length){const ang=Math.random()*TAU;const r=rnd(40,160);mem.wanderPath=[{x:clamp(b.x+Math.cos(ang)*r,-MAP+35,MAP-35),z:clamp(b.z+Math.sin(ang)*r,-MAP+35,MAP-35)}];}
    const wp=mem.wanderPath[0];const dx=wp.x-b.x,dz=wp.z-b.z;const dist=Math.hypot(dx,dz);
    if(dist<3)mem.wanderPath.length=0;
    else{mx=dx/dist;mz=dz/dist;sprint=dist>25;b.yaw+=angDiff(b.yaw,Math.atan2(-mx,-mz))*Math.min(1,dt*5);if(mem.jumpCd<=0 && Math.random()<0.008){jump=true;mem.jumpCd=rnd(3,6);}}}
  let dvx=0,dvz=0;const moveSpeed=sprint?7.5:4.8;
  if(mx||mz){const s=steer(b,mx,mz);dvx=s[0]*moveSpeed;dvz=s[1]*moveSpeed;}
  const k=Math.min(1,dt*(b.onGround?12:2.5));b.vx+=(dvx-b.vx)*k;b.vz+=(dvz-b.vz)*k;
  if(jump&&b.onGround){b.vy=7.5;b.onGround=false;}
  physics(b,dt);b.speed=Math.hypot(b.vx,b.vz);
  b._pvx=lerp(b._pvx||0,(b.x-(b.px||b.x))/Math.max(dt,0.001),0.3);
  b._pvz=lerp(b._pvz||0,(b.z-(b.pz||b.z))/Math.max(dt,0.001),0.3);
  b.stuckT+=dt;
  if(b.stuckT>1.2){const moved=Math.hypot(b.x-b.px,b.z-b.pz);if(b.speed<0.5||moved<0.6){b.side*=-1;if(b.onGround)b.vy=6.5;mem.wanderPath.length=0;}b.px=b.x;b.pz=b.z;b.stuckT=0;}}

function syncMeshes(dt){
  for(const b of fighters){
    if(b.isPlayer||!b.mesh)continue;const m=b.mesh;b.animT+=dt;
    if(b.rlT>0)b.rlT-=dt;
    if(b.remote){const sp=Math.hypot(b.x-(b.lx===undefined?b.x:b.lx),b.z-(b.lz===undefined?b.z:b.lz))/Math.max(dt,0.001);b.speed=lerp(b.speed,sp,0.3);b.vyE=(b.y-(b.ly===undefined?b.y:b.ly))/Math.max(dt,0.001);b.lx=b.x;b.ly=b.y;b.lz=b.z;}
    else b.vyE=b.vy;
    m.position.set(b.x,b.y,b.z);m.rotation.y=b.yaw;
    if(b.alive){m.rotation.x=0;m.rotation.z=0;
      const air=b.remote?(b.vyE<-6||b.vyE>5.5):!b.onGround;const normSpeed=Math.min(1,b.speed/8);
      let pt=0;if(b.remote)pt=b.pitch||0;else if(b.target&&b.target.alive){const tx=b.target.x-b.x,tz=b.target.z-b.z,dd=Math.hypot(tx,tz)||1;pt=Math.atan2((b.target.y+1.1)-(b.y+1.45),dd);}
      b.pitchS=lerp(b.pitchS||0,clamp(pt,-1.1,1.1),Math.min(1,dt*8));
      const sprinting=b.speed>6.3;
      if(dt>0)CH.animate(b,dt,T,normSpeed,air,sprinting,b.pitchS);
      if(b.landT>0)b.landT=Math.max(0,b.landT-dt*4);
      const d=Math.hypot(b.x-camera.position.x,b.z-camera.position.z);b.label.visible=d<60&&!b.remote;}
    else{b.deathT+=dt;const t=Math.min(1,b.deathT*2.4),e=1-(1-t)*(1-t),s=b.deathSign||-1;
      m.rotation.x=s*e*1.55;m.rotation.z=(b.name.length%2?1:-1)*e*0.28;
      b.label.visible=false;if(b.rig&&b.rig.fl)b.rig.fl.visible=false;if(b.deathT>5)m.visible=false;}}}

/* Medkits */
(function(){const white=lam(0xf2f4f5),red=lam(0xd8342c);medSpots.forEach(function(s){const g=new THREE.Group(),y0=s[2]||0;
  const mk=(w,h,d,m,x,y,z)=>{const me=new THREE.Mesh(boxGeo,m);me.scale.set(w,h,d);me.position.set(x,y,z);g.add(me);};
  mk(0.6,0.38,0.6,white,0,0,0);mk(0.5,0.4,0.14,red,0,0,0);mk(0.14,0.4,0.5,red,0,0,0);
  g.position.set(s[0],y0+0.7,s[1]);scene.add(g);
  const ring=new THREE.Mesh(new THREE.RingGeometry(0.55,0.85,20),new THREE.MeshBasicMaterial({color:L(0x43e0a0),transparent:true,opacity:0.55,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.set(s[0],y0+0.06,s[1]);scene.add(ring);
  medkits.push({x:s[0],z:s[1],y:y0,mesh:g,ring:ring,active:true,t:0});});})();

/* Match flow */
function useBots(on){fighters.length=0;fighters.push(player);for(const b of botPool){if(on)fighters.push(b);else{b.alive=false;b.target=null;b.mesh.visible=false;}}}
function resetMatch(){
  for(const f of fighters){f.kills=0;f.deaths=0;f.alive=false;f._mem=null;}
  for(const f of fighters)spawn(f);
  P.ammo=WEAPONS.map(w=>w.mag);P.reload=0;P.heat=0;P.adsT=0;P.kick=0;P.swap=0;P.recoilX=0;P.recoilY=0;P.slideBack=0;P.boltCycle=0;P.camShake=0;P.lastHitAt=T;
  camera.fov=BASE_FOV;camera.updateProjectionMatrix();camera.rotation.z=0;
  setGun(0);P.swap=0;
  for(const m of medkits){m.active=true;m.mesh.visible=true;}
  matchActive=true;feedItems.length=0;renderFeed();cache.mk=cache.mr=null;
  borderState.lastCount=0;borderState.currentRadius=BORDER_MAX;
}
let lockRetry=0;
function requestLock(first){if(isMobile){fallback=true;starting=false;syncPause();return;}starting=!!first;
  const tryIt=()=>{try{const r=canvasEl.requestPointerLock&&canvasEl.requestPointerLock();if(r&&r.catch)r.catch(()=>{});}catch(e){}};
  tryIt();
  clearTimeout(lockRetry);
  let n=0;
  const retry=()=>{
    if(document.pointerLockElement===canvasEl){starting=false;fallback=false;syncPause();return;}
    if(++n>6){starting=false;fallback=true;document.body.classList.add('fb');syncPause();return;}
    tryIt();
    lockRetry=setTimeout(retry,220);
  };
  lockRetry=setTimeout(retry,220);}
function syncPause(){const pz=paused();$('pause').classList.toggle('hidden',!pz);if(pz){$('pauseT').textContent=mode==='multi'?'Paused':'Paused';$('pauseS').textContent='Click resume or press Esc again';}}
function startGame(m){
  initAudio();
  const nm=($('name').value||'').trim().slice(0,14);
  player.name=nm||(m==='multi'?'Player'+(100+((Math.random()*900)|0)):'You');
  try{localStorage.setItem('shotline.name',nm);localStorage.setItem('shotline.sens',String($('sens').value));localStorage.setItem('shotline.gfx',$('gfx').value);}catch(e){}
  sensSetting=+$('sens').value;applyGfx($('gfx').value);setShadowExtent(120);
  stopNet();mode=m;useBots(m==='single');resetMatch();manualPause=false;
  $('menumsg').textContent='';$('menu').classList.add('hidden');$('hud').classList.remove('hidden');
  $('board').classList.add('hidden');$('bfoot').classList.remove('hidden');$('death').classList.add('hidden');clearChat();
  $('btitle').textContent='Live leaderboard';
  $('bsub').textContent=m==='multi'?'Endless online match · border shrinks with player count':'Endless practice · 17 bots';
  $('goal').textContent=m==='multi'?'Fallen City · Tab · Enter to chat':'Fallen City · Tab';
  gunRoot.visible=true;state='playing';mouseL=mouseR=false;
  requestLock(true);syncPause();
  toast(m==='multi'?'Connecting…':'Fight!','warn');
  if(m==='single')announceBots();else sysLine('Connecting to the arena…');
  if(m==='multi'){connectArena(1);const checkMap=setInterval(()=>{if(net.ws&&net.ws.readyState===1){clearInterval(checkMap);setTimeout(uploadMap,600);}if(!net.ws)clearInterval(checkMap);},200);}
}
function leaveMatch(msg){
  stopNet();BotChat.stop();mode='menu';state='menu';matchActive=false;manualPause=false;
  useBots(true);for(const b of botPool)spawn(b);
  player.alive=false;player.hp=100;
  $('hud').classList.add('hidden');$('pause').classList.add('hidden');$('death').classList.add('hidden');
  $('board').classList.add('hidden');$('scope').classList.add('hidden');$('borderWarn').classList.remove('show');
  clearChat();closeChat();hideAdminPrompt();
  $('menu').classList.remove('hidden');$('menumsg').textContent=msg||'';
  gunRoot.visible=false;muzzleLight.intensity=0;mouseL=mouseR=false;
  camera.rotation.set(0,0,0);camera.fov=62;camera.updateProjectionMatrix();
  setShadowExtent(140);borderState.currentRadius=BORDER_MAX;borderState.active=false;borderMesh.visible=false;
  try{if(document.exitPointerLock)document.exitPointerLock();}catch(e){}
}
try{const n=localStorage.getItem('shotline.name');if(n)$('name').value=n;const s=localStorage.getItem('shotline.sens');if(s)$('sens').value=s;const gq=localStorage.getItem('shotline.gfx');if(gq)$('gfx').value=gq;}catch(e){}
applyGfx($('gfx').value);

function openChat(){chatOpen=true;for(const k in keys)keys[k]=false;mouseL=mouseR=false;$('chatbar').classList.remove('hidden');$('chatinput').value='';const log=$('chatlog');log.classList.add('open');chatHist.forEach(h=>h.el.classList.remove('faded'));log.scrollTop=log.scrollHeight;if(document.pointerLockElement)document.exitPointerLock();setTimeout(()=>$('chatinput').focus(),10);}
function closeChat(){chatOpen=false;$('chatbar').classList.add('hidden');$('chatinput').blur();$('chatlog').classList.remove('open');$('chatlog').scrollTop=0;chatTickT=0;if(state==='playing'&&$('adminPrompt').classList.contains('hidden')&&canvasEl.requestPointerLock&&!isMobile)canvasEl.requestPointerLock();}
function sendChat(){const raw=$('chatinput').value.trim();closeChat();if(!raw)return;const cmd=raw.toLowerCase();if(cmd==='/admin'||cmd==='/admin '){if(player.name===ADMIN_NAME)showAdminPrompt('admin');else sysLine('Unknown command.');return;}if(cmd==='/tel'||cmd==='/tel '||cmd==='/teleport'){if(player.name===ADMIN_NAME)showAdminPrompt('teleport');else sysLine('Unknown command.');return;}if(mode==='multi'&&net.ws&&net.ws.readyState===1)net.ws.send(JSON.stringify({t:'chat',m:raw}));else{chatLine(player.name,raw);if(mode==='single')BotChat.event('chat',{text:raw});}}
function announceBots(){for(const b of botPool)sysLine(b.name+' joined the game','join');BotChat.start();BotChat.greetAll();}
$('chatinput').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape')closeChat();else if(e.key==='Enter'){e.preventDefault();sendChat();}});
function showAdminPrompt(mode){adminPromptMode=mode||'admin';const t=$('adminTitle'),s=$('adminSubtitle');if(t)t.textContent=adminPromptMode==='teleport'?'OPERATOR · TELEPORT':'OPERATOR ACCESS';if(s)s.textContent=adminPromptMode==='teleport'?'Password → jump to nearest player':'Enter admin password';$('adminPrompt').classList.remove('hidden');$('adminPass').value='';$('adminMsg').textContent='';if(document.pointerLockElement)document.exitPointerLock();setTimeout(()=>$('adminPass').focus(),30);}
function hideAdminPrompt(){$('adminPrompt').classList.add('hidden');if(state==='playing'&&!chatOpen&&!fallback&&!isMobile)canvasEl.requestPointerLock&&canvasEl.requestPointerLock();}
$('adminOk').addEventListener('click',()=>{const pass=$('adminPass').value;if(!pass){$('adminMsg').textContent='Enter a password.';return;}if(!net.ws||net.ws.readyState!==1){$('adminMsg').textContent='Not connected.';return;}net.ws.send(JSON.stringify({t:adminPromptMode==='teleport'?'teleport':'admin',pass}));$('adminMsg').textContent='Transmitting…';});
$('adminCancel').addEventListener('click',hideAdminPrompt);
$('adminPass').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();$('adminOk').click();}else if(e.key==='Escape')hideAdminPrompt();});
$('playSolo').addEventListener('click',()=>startGame('single'));
$('playMulti').addEventListener('click',()=>startGame('multi'));
$('leave').addEventListener('click',e=>{e.stopPropagation();leaveMatch();});
$('resume').addEventListener('click',e=>{e.stopPropagation();manualPause=false;syncPause();if(!isMobile)requestLock(false);});
$('respawnBtn').addEventListener('click',()=>{doRespawn();});
$('pause').addEventListener('click',e=>{if(e.target.closest('button'))return;if(isMobile){manualPause=false;syncPause();}else requestLock(false);});
document.addEventListener('pointerlockchange',()=>{locked=(document.pointerLockElement===canvasEl);if(locked){starting=false;clearTimeout(lockRetry);}syncPause();});
document.addEventListener('pointerlockerror',()=>{if(starting){fallback=true;starting=false;document.body.classList.add('fb');toast('Pointer lock blocked — using cursor mode','warn');}syncPause();});
document.addEventListener('mousemove',e=>{if(state!=='playing')return;if(!(locked||fallback)||chatOpen)return;if(!$('adminPrompt').classList.contains('hidden'))return;const s=(0.0008+sensSetting*0.00028)*(camera.fov/BASE_FOV);const dx=e.movementX||0,dy=e.movementY||0;yaw-=dx*s;pitch=clamp(pitch-dy*s,-1.5,1.5);P.swayX=clamp(P.swayX-dx*0.0002,-0.03,0.03);P.swayY=clamp(P.swayY+dy*0.0002,-0.03,0.03);});
document.addEventListener('mousedown',e=>{if(chatOpen||!$('adminPrompt').classList.contains('hidden'))return;if(state!=='playing'||paused())return;if(BINDS.fire==='Mouse'+e.button){mouseL=true;mousePressed=true;}if(BINDS.ads==='Mouse'+e.button)mouseR=true;e.preventDefault();});
document.addEventListener('mouseup',e=>{if(BINDS.fire==='Mouse'+e.button)mouseL=false;if(BINDS.ads==='Mouse'+e.button)mouseR=false;});
document.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('wheel',e=>{if(state!=='playing'||paused()||chatOpen)return;if(P.cur===7&&P.adsT>0.5){P.zoom=e.deltaY<0?1:0;return;}const n=WEAPONS.length;const i=(P.cur+(e.deltaY>0?1:-1)+n)%n;if(i!==P.cur)setGun(i);},{passive:true});
document.addEventListener('keydown',e=>{if(chatOpen)return;if(!$('adminPrompt').classList.contains('hidden'))return;
  if(e.code==='Escape'){e.preventDefault();if(state==='playing'){manualPause=!manualPause;if(!manualPause&&!isMobile)requestLock(false);syncPause();}return;}
  if(e.code===BINDS.leaderboard){e.preventDefault();if(state==='playing'||state==='dead'){renderBoard();$('board').classList.remove('hidden');}return;}
  if(e.code===BINDS.chat&&(state==='playing'||state==='dead')){e.preventDefault();openChat();return;}
  if(state==='playing'||state==='dead'){if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();}
  keys[e.code]=true;
  if(state==='playing'&&!paused()&&!e.repeat){for(let i=1;i<=8;i++){if(e.code===BINDS['w'+i])setGun(i-1);}}});
document.addEventListener('keyup',e=>{if(e.code===BINDS.leaderboard){e.preventDefault();$('board').classList.add('hidden');return;}keys[e.code]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;mouseL=mouseR=false;if(state!=='ended')$('board').classList.add('hidden');});
window.addEventListener('resize',()=>{renderer.setSize(window.innerWidth,window.innerHeight);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();viewCamera.aspect=window.innerWidth/window.innerHeight;viewCamera.updateProjectionMatrix();});

function doRespawn(){spawn(player);P.ammo=WEAPONS.map(w=>w.mag);P.reload=0;P.heat=0;P.adsT=0;P.recoilX=0;P.recoilY=0;P.slideBack=0;P.boltCycle=0;P.camShake=0;
  if(camera.fov!==BASE_FOV){camera.fov=BASE_FOV;camera.updateProjectionMatrix();}
  setGun(0);state='playing';$('death').classList.add('hidden');gunRoot.visible=true;requestLock(false);
  if(mode==='multi'&&net.ws&&net.ws.readyState===1)net.ws.send(JSON.stringify({t:'spawn'}));}
function setGun(i){i=clamp(i,0,WEAPONS.length-1);P.cur=i;const vr=VM.setActive(i);vr.g.add(flash);flash.position.set(vr.A.muzzle[0],vr.A.muzzle[1],vr.A.muzzle[2]-0.03);viewMuzzle.position.set(vr.A.muzzle[0],vr.A.muzzle[1]+0.02,vr.A.muzzle[2]+0.12);setText('wname',WEAPONS[i].name);document.querySelectorAll('#wslots span').forEach((s,k)=>s.classList.toggle('on',k===i));P.swap=1;P.reload=0;}
function startReload(){const w=WEAPONS[P.cur];if(P.reload>0||P.ammo[P.cur]>=w.mag)return;P.reload=w.reload;P.reloadTotal=w.reload;sfxReload();}
function currentSpread(){const w=WEAPONS[P.cur];let s=lerp(w.hip,w.ads,P.adsT);const mv=Math.hypot(player.vx,player.vz);if(!player.onGround)s*=2.4;else if(mv>1)s*=1+Math.min(mv/8,1)*0.6;s+=P.heat*w.hip*0.9*(1-P.adsT*0.6);return s;}
const _v=new THREE.Vector3();
function playerShoot(){
  const w=WEAPONS[P.cur];
  P.ammo[P.cur]--;P.nextFire=T+w.rate;P.kick=1;P.cycle=1;P.flash=0.05;player.lastFire=T;P.lastShotTime=T;P.slideBack=1;P.boltCycle=1;VM.fire(P.cur,P.adsT);
  flash.rotation.z=rnd(0,TAU);flash.scale.setScalar(rnd(0.85,1.2));
  const ex=player.x,ey=player.y+EYE,ez=player.z;
  const aimYaw=yaw+P.recoilX+P.swayYaw;const aimPitch=clamp(pitch+P.recoilY+P.swayPitch,-1.5,1.5);
  const cy=Math.cos(aimYaw),sy=Math.sin(aimYaw),cp=Math.cos(aimPitch),sp=Math.sin(aimPitch);
  const fx_=-sy*cp,fy_=sp,fz_=-cy*cp,rx=cy,rz=-sy;const ux=-rz*fy_,uy=rz*fx_-rx*fz_,uz=rx*fy_;
  const spread=currentSpread();
  _v.copy(VM.muzzle).applyMatrix4(camera.matrixWorld);
  const sx=_v.x,sy_=_v.y,sz=_v.z;
  const portX=camera.position.x+rx*0.13+fx_*0.35,portY=camera.position.y-0.10+fy_*0.35,portZ=camera.position.z+rz*0.13+fz_*0.35;
  ejectCasing(portX,portY,portZ,rx,rz,fx_,fz_);puff(sx,sy_,sz,'smoke',2);
  const hits=new Map();
  for(let i=0;i<w.pellets;i++){const a=rnd(0,TAU),r=Math.sqrt(Math.random())*spread,ox=Math.cos(a)*r,oy=Math.sin(a)*r;
    let dx=fx_+rx*ox+ux*oy,dy=fy_+uy*oy,dz=fz_+rz*ox+uz*oy;const LL=Math.hypot(dx,dy,dz);dx/=LL;dy/=LL;dz/=LL;
    const h=castRay(ex,ey,ez,dx,dy,dz,300,player);const px=ex+dx*h.t,py=ey+dy*h.t,pz=ez+dz*h.t;
    tracer(sx,sy_,sz,px,py,pz,w.pellets>1?0.015:0.03);
    if(h.f&&!h.f.remote){const d=w.dmg*(h.head?w.head:1)*dmgMul(w,h.t);const e=hits.get(h.f)||{d:0,head:false};e.d+=d;if(h.head)e.head=true;hits.set(h.f,e);puff(px,py,pz,'blood',2);}
    else if(h.world){puff(px-dx*0.05,py-dy*0.05,pz-dz*0.05,'dust',2);bulletHole(px,py,pz,dx,dy,dz);}}
  hits.forEach((e,f)=>{const killed=damage(f,e.d,player,e.head);if(!killed){showHit(e.head,false);sfxHit(e.head);}});
  if(mode==='multi'&&net.ws&&net.ws.readyState===1)net.ws.send(JSON.stringify({t:'fire',w:P.cur,o:[r2(ex),r2(ey),r2(ez)],d:[r4(fx_),r4(fy_),r4(fz_)],spread:r4(spread)}));
  const adsK=1-P.adsT*0.35;P.recoilY+=w.recoilKick*0.0082*adsK;P.recoilX+=(Math.random()-0.5)*w.recoilKick*0.0038*adsK;
  P.camShake=Math.min(1,0.35+w.recoilKick*0.18);P.camShakeYaw=(Math.random()-0.5)*w.recoilKick*0.0018;P.camShakePitch=-w.recoilKick*0.0015;
  P.heat=Math.min(1,P.heat+(w.auto?0.12:0.5));sfxShot(w.key,0.32);
  if(P.ammo[P.cur]<=0)startReload();}
function onLanded(f,drop,vy){const dmg=drop>2.8?Math.min(200,(drop-2.8)*10.5):0;if(f.isPlayer){P.landDip=Math.min(0.35,drop*0.05+0.03);if(drop>0.5)sfxThud(Math.min(1,drop/6));}else f.landT=Math.min(1,drop/4);if(dmg>0){if(f.isPlayer&&f.hp-dmg>0)toast('Hard landing −'+Math.round(dmg),'warn');damage(f,dmg,null,false,'fall');}}
function tryLadder(p,mx,mz){P.nearLadder=false;for(const L of ladders){if(Math.abs(p.x-L.bx)>3||Math.abs(p.z-L.bz)>3)continue;
  if(Math.abs(p.y-L.y0)<0.7&&Math.hypot(p.x-L.bx,p.z-L.bz)<0.8){P.nearLadder=true;if((mx*-L.nx+mz*-L.nz)>0.3){p.climb=L;p.vx=p.vz=p.vy=0;p.onGround=false;return;}}
  if(p.y>L.yTop-0.4&&p.y<L.yTop+0.7&&Math.hypot(p.x-L.ex,p.z-L.ez)<0.8){P.nearLadder=true;if((mx*L.nx+mz*L.nz)>0.3){p.climb=L;p.y=L.yTop-0.5;p.vx=p.vz=p.vy=0;p.onGround=false;p.x=L.cx;p.z=L.cz;return;}}}}

function updatePlayer(dt){
  const p=player,w=WEAPONS[P.cur];
  if(keys.ArrowLeft)yaw+=1.9*dt;if(keys.ArrowRight)yaw-=1.9*dt;
  if(keys.ArrowUp)pitch+=1.4*dt;if(keys.ArrowDown)pitch-=1.4*dt;
  pitch=clamp(pitch,-1.5,1.5);
  const recov=Math.min(1,dt*w.recoilReturn);P.recoilY*=Math.max(0,1-recov);P.recoilX*=Math.max(0,1-recov);
  P.slideBack=Math.max(0,(P.slideBack||0)-dt*18);P.boltCycle=Math.max(0,(P.boltCycle||0)-dt/(w.key==='sniper'?1.0:0.45));
  if(P.camShake){P.camShake=Math.max(0,P.camShake-dt*6);P.camShakeYaw*=Math.max(0,1-dt*8);P.camShakePitch*=Math.max(0,1-dt*8);}
  if(p.invuln>0)p.invuln-=dt;$('shield').classList.toggle('hidden',!(p.invuln>0));
  const fw=(isDown('forward')?1:0)-(isDown('back')?1:0),rt=(isDown('right')?1:0)-(isDown('left')?1:0);
  const ads=isAds();P.adsT=clamp(P.adsT+((ads?1:-1)*dt*(w.key==='sniper'?7:11)),0,1);
  let spd=6.2;const sprinting=isDown('sprint')&&fw>0&&!ads&&!p.climb;
  if(sprinting)spd=9.2;else if(ads)spd=w.key==='sniper'?2.6:3.6;
  let mx=-Math.sin(yaw)*fw+Math.cos(yaw)*rt,mz=-Math.cos(yaw)*fw-Math.sin(yaw)*rt;
  const ml=Math.hypot(mx,mz);if(ml>0){mx/=ml;mz/=ml;}
  P.landDip=Math.max(0,P.landDip-dt*1.6);
  if(p.mantle){const m=p.mantle;m.t+=dt;const k=Math.min(1,m.t/m.dur),e=k*k*(3-2*k);p.x=lerp(m.x0,m.x1,e);p.z=lerp(m.z0,m.z1,e);p.y=lerp(m.y0,m.y1,e)+Math.sin(k*Math.PI)*0.3;p.vx=p.vz=p.vy=0;if(k>=1){p.mantle=null;p.onGround=true;p.peakY=p.y;p.y=m.y1;}}
  else if(p.climb){const L=p.climb,dir=fw;p.vx=p.vz=p.vy=0;p.onGround=false;p.y+=dir*2.7*dt;p.x=lerp(p.x,L.cx,Math.min(1,dt*12));p.z=lerp(p.z,L.cz,Math.min(1,dt*12));P.climbT=(P.climbT||0)+Math.abs(dir)*dt;if(dir&&Math.floor(P.climbT*3.5)!==Math.floor((P.climbT-dt)*3.5))sfxClank();p.peakY=p.y;p.speed=0;
    if(isDown('jump')){p.climb=null;p.vx=L.nx*3.5;p.vz=L.nz*3.5;p.vy=3;}
    else if(p.y>=L.yTop){p.climb=null;p.mantle={t:0,dur:0.5,x0:p.x,z0:p.z,y0:p.y,x1:L.ex,z1:L.ez,y1:L.yTop};}
    else if(p.y<=L.y0&&dir<=0){p.climb=null;p.x=L.bx;p.z=L.bz;p.y=L.y0;p.onGround=true;p.peakY=p.y;}}
  else{const k=Math.min(1,dt*(p.onGround?14:2.5));p.vx+=(mx*spd-p.vx)*k;p.vz+=(mz*spd-p.vz)*k;if(p.onGround)tryLadder(p,mx,mz);if(!p.climb){if(isDown('jump')&&p.onGround){p.vy=7.6;p.onGround=false;}physics(p,dt);}p.speed=Math.hypot(p.vx,p.vz);}
  $('interact').classList.toggle('hidden',!(P.nearLadder&&!p.climb&&!p.mantle));
  p.stepOff=(p.stepOff||0)*Math.exp(-dt*14);
  if(p.onGround&&p.speed>1){P.bob+=p.speed*dt*1.5;P.stepD+=p.speed*dt;if(P.stepD>(sprinting?2.6:2.1)){P.stepD=0;sfxStep(sprinting);}}
  P.idleSway+=dt*1.2;
  const sniper=w.key==='sniper';
  if(sniper&&P.adsT>0.5){const hold=isDown('sprint')&&P.breath>0;
    if(hold){P.breath-=dt;if(P.breath<=0){P.breath=0;P.gasp=1.5;}}else P.breath=Math.min(4,P.breath+dt*0.7);
    P.gasp=Math.max(0,P.gasp-dt);const amp=(hold?0.10:0.85)*(P.gasp>0?1.8:1)*(1+Math.min(1,p.speed/3)*2);
    P.swayYaw=(Math.sin(T*0.9)*0.0010+Math.sin(T*2.3)*0.00035)*amp;P.swayPitch=(Math.cos(T*1.1)*0.0010+Math.sin(T*2.9)*0.00035)*amp;}
  else{P.swayYaw*=0.8;P.swayPitch*=0.8;P.breath=Math.min(4,P.breath+dt);}
  P.fovB=lerp(P.fovB||0,(sprinting&&p.speed>6)?5:0,Math.min(1,dt*6));
  const advF=sniper?(P.zoom?6:12):w.adsFov;const targetFov=lerp(BASE_FOV+P.fovB,advF,P.adsT);
  if(Math.abs(camera.fov-targetFov)>0.01){camera.fov=targetFov;camera.updateProjectionMatrix();}
  const bobY=p.onGround&&p.speed>1?Math.sin(P.bob*2)*0.035*(1-P.adsT):0;
  P.roll=lerp(P.roll||0,-rt*0.022*(1-P.adsT),Math.min(1,dt*8));
  camera.position.set(p.x,p.y+EYE+bobY+(p.stepOff||0)-P.landDip,p.z);
  camera.rotation.set(clamp(pitch+P.recoilY+P.swayPitch+(P.camShakePitch||0),-1.5,1.5),yaw+P.recoilX+P.swayYaw+(P.camShakeYaw||0),P.roll);
  camera.updateMatrixWorld(true);
  if(p.hp<100&&(T-P.lastHitAt)>10){p.hp=Math.min(100,p.hp+2*dt);P.regenning=true;}else P.regenning=false;
  $('hpfill').style.filter=P.regenning?'brightness(1.3) drop-shadow(0 0 6px #43e0a0)':'';
  for(const m of medkits){if(!m.active){if(T>=m.t){m.active=true;m.mesh.visible=true;}continue;}
    if(p.hp<100&&Math.abs(p.x-m.x)<1.4&&Math.abs(p.z-m.z)<1.4&&Math.abs(p.y-m.y)<1.8){p.hp=Math.min(100,p.hp+45);m.active=false;m.mesh.visible=false;m.t=T+25;sfxPickup();toast('+45 health','good');}}
  if(P.reload>0){P.reload-=dt;if(P.reload<=0){P.reload=0;P.ammo[P.cur]=w.mag;}}
  P.heat=Math.max(0,P.heat-dt*2.4);
  const wantFire=w.auto?mouseL:mousePressed;
  if(wantFire&&P.reload<=0&&P.swap<0.35&&!p.climb&&!p.mantle&&T>=P.nextFire){if(P.ammo[P.cur]>0)playerShoot();else startReload();}
  mousePressed=false;
  if(isDown('reload'))startReload();
  P.kick=Math.max(0,P.kick-dt*9);P.flash=Math.max(0,P.flash-dt);P.swap=Math.max(0,P.swap-dt*2.8);P.cycle=Math.max(0,P.cycle-dt/Math.max(0.3,w.rate*0.9));
  P.swayX*=Math.max(0,1-dt*10);P.swayY*=Math.max(0,1-dt*10);
  const rl01=P.reload>0?clamp(1-P.reload/P.reloadTotal,0,1):0;
  const sprintAim=Math.max(0,(sprinting?1:0)-P.adsT);P.sprintSway=lerp(P.sprintSway,sprintAim,Math.min(1,dt*8));
  VM.update(dt,{cur:P.cur,adsT:P.adsT,sprintK:P.sprintSway,moveK:Math.min(1,p.speed/6.2),bob:P.bob,swayX:P.swayX,swayY:P.swayY,strafe:rt,landDip:P.landDip,onGround:p.onGround,swap:P.swap,reload01:rl01,time:T,onEvent:vmEvent});
  flash.visible=P.flash>0;muzzleLight.intensity=P.flash>0?2.2:0;viewMuzzle.intensity=P.flash>0?2.5:0;
  const scopeW=(w.key==='sniper'||w.key==='dmr');const scoped=scopeW&&P.adsT>0.55;const dotW=(w.key==='rifle'||w.key==='smg');
  gunRoot.visible=!p.climb && !(scopeW && P.adsT>0.35);
  const sc=$('scope');sc.classList.toggle('hidden',!scoped);
  if(scoped){sc.dataset.k=w.key;sc.style.opacity=clamp((P.adsT-0.55)/0.25,0,1).toFixed(2);
    const hh=castRay(camera.position.x,camera.position.y,camera.position.z,-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch),600,player);
    setText('scopeRange',hh.t<600?Math.round(hh.t)+' m':'— m');setText('scopeZoom',sniper?(P.zoom?'16×':'8×'):'4×');
    setText('scopeHold',sniper?(P.gasp>0?'OUT OF BREATH':'SHIFT · hold breath '+P.breath.toFixed(1)+'s'):'');}
  $('reddot').classList.toggle('hidden',!(dotW&&P.adsT>0.6));
  $('crosshair').style.display=(scoped||(dotW&&P.adsT>0.6))?'none':'block';
  const gap=4+Math.tan(currentSpread())/Math.tan(camera.fov*Math.PI/360)*(window.innerHeight/2);
  $('crosshair').style.setProperty('--gap',Math.min(gap,90).toFixed(1)+'px');
}
function updateDeadCamera(dt){deadT+=dt;muzzleLight.intensity=0;viewMuzzle.intensity=0;const p=player;const t=Math.min(1,deadT*2.0);camera.position.set(p.x,p.y+lerp(EYE,0.4,t),p.z);camera.rotation.set(clamp(pitch,-1.5,1.5),yaw,t*0.55);camera.updateMatrixWorld(true);}
function blockedAt(b,x,z){const cand=queryGrid(x,z,1);for(const bx of cand){if(bx.y1>b.y+0.6&&bx.y0<b.y+1.7&&x>bx.x0-0.5&&x<bx.x1+0.5&&z>bx.z0-0.5&&z<bx.z1+0.5)return true;}return false;}
const OFFS=[0,0.6,-0.6,1.2,-1.2,2.0,-2.0,3.1];
function steer(b,mx,mz){const l=Math.hypot(mx,mz);if(l<1e-4)return [0,0];mx/=l;mz/=l;
  for(const o0 of OFFS){const o=o0*b.side,c=Math.cos(o),s=Math.sin(o),dx=mx*c-mz*s,dz=mx*s+mz*c;
    if(!blockedAt(b,b.x+dx*1.3,b.z+dz*1.3)&&!blockedAt(b,b.x+dx*2.8,b.z+dz*2.8))return [dx,dz];}
  return [mx,mz];}
function damage(v,amt,a,head,cause){
  if(!v.alive||state==='ended')return false;
  if(v.invuln>0&&cause!=='fall')return false;
  v.hp-=amt;
  if(v.isPlayer){P.dmgT=0.6;P.lastHitAt=T;sfxHurt();if(a&&a!==v)showDmgDir(a.x,a.z);if(a&&a.isBot&&Math.random()<0.15)BotChat.event('pressured',{bot:a});}
  else if(v.isBot)v.lastHit=T;
  if(v.hp<=0){if(v.deathT<=0||v.deathT>3.4)kill(v,a,head,cause);v.hp=0;return true;}
  return false;}
function deathSignFor(v,a){const fx=-Math.sin(v.yaw),fz=-Math.cos(v.yaw),dx=a.x-v.x,dz=a.z-v.z,d=Math.hypot(dx,dz)||1;return (fx*dx+fz*dz)/d>0?1:-1;}
function logKill(kn,vn,head,fall){if(fall)sysLine(vn+' fell to their death','kill');else sysLine(vn+' was killed by '+(kn||'?')+(head?' (headshot)':''),'kill');}
function kill(v,a,head,cause){
  if(!v.alive)return;
  v.alive=false;v.hp=0;v.deaths++;v.deathT=0.001;
  const fall=cause==='fall'||!a;
  if(a&&a!==v)a.kills++;
  v.deathSign=(a&&a!==v)?deathSignFor(v,a):-1;
  const online=mode==='multi'&&v.isPlayer;
  if(!online&&(matchActive||state!=='menu')){feedItems.push({k:fall?v.name:a.name,v:fall?'fell':v.name,ic:fall?'⬇':null,head:!!head,t:T,me:(a&&a.isPlayer)||v.isPlayer});if(feedItems.length>12)feedItems.shift();renderFeed();if(mode==='single')logKill(a&&a.name,v.name,head,fall);}
  if(mode==='single'){if(v.isBot)BotChat.event('death',{bot:v,killer:a,head,dist:a?Math.hypot(a.x-v.x,a.z-v.z):0,cause:fall?'fall':''});
    if(a&&a.isBot&&v.isPlayer)BotChat.event('kill',{bot:a,head});
    if(v.isPlayer&&fall)BotChat.event('pFall',{});
    if(a&&a.isPlayer&&a!==v){P.streak=(P.streak||0)+1;if(P.streak===5||P.streak===10)BotChat.event('streak',{n:P.streak});}
    if(v.isPlayer)P.streak=0;}
  if(mode==='single'&&a&&a.isBot&&!v.isPlayer&&Math.random()<0.55)BotChat.event('kill',{bot:a,head});
  if(v.isPlayer){onPlayerDeath(fall?null:a,head,fall?'fall':'');if(mode==='multi'&&net.ws&&net.ws.readyState===1&&fall)net.ws.send(JSON.stringify({t:'died',cause:'fall'}));}
  else v.respawnAt=T+4;
  if(a&&a.isPlayer&&a!==v){sfxKill();showHit(head,true);toast('Eliminated '+v.name,'good');}}
function onPlayerDeath(a,head,cause){state='dead';deadT=0;P.reload=0;mouseL=false;mouseR=false;player.climb=null;player.mantle=null;
  if(cause==='fall')$('killer').textContent='You fell from a great height';
  else if(a)$('killer').textContent='Taken out by '+a.name+(head?' — headshot':'');
  else $('killer').textContent='You were eliminated';
  $('death').classList.remove('hidden');$('shield').classList.add('hidden');$('interact').classList.add('hidden');gunRoot.visible=false;$('scope').classList.add('hidden');$('reddot').classList.add('hidden');$('borderWarn').classList.remove('show');
  if(document.pointerLockElement)document.exitPointerLock();fallback=false;starting=false;$('pause').classList.add('hidden');}
function spawn(f){
  let best=null,bs=-1;
  for(let i=0;i<60;i++){const biasR=MAP*0.55;const ang=Math.random()*TAU;const r=Math.pow(Math.random(),0.65)*biasR;
    const x=Math.cos(ang)*r;const z=Math.sin(ang)*r;
    if(!spawnOK(x,z))continue;
    let md=1e9;for(const o of fighters){if(o===f||!o.alive)continue;md=Math.min(md,Math.hypot(o.x-x,o.z-z));}
    if(md>35){best=[x,z];break;}if(md>bs){bs=md;best=[x,z];}}
  if(!best){const ang=Math.random()*TAU;const r=Math.random()*MAP*0.4;best=[Math.cos(ang)*r,Math.sin(ang)*r];}
  f.x=best[0];f.z=best[1];f.y=0;f.vx=f.vy=f.vz=0;f.hp=100;f.alive=true;f.invuln=2.5;f.yaw=rnd(0,TAU);
  f.target=null;f.deathT=0;f.onGround=true;f.px=f.x;f.pz=f.z;f.stuckT=0;f.reactT=0;f.nextShot=T+0.5;
  f.peakY=0;f.stepOff=0;f.climb=null;f.mantle=null;f.deathSign=-1;f._mem=null;
  if(f.isBot){const pick=BOT_WEAPON_POOL[(Math.random()*BOT_WEAPON_POOL.length)|0];setFighterWeapon(f,pick);}
  if(f.mesh){f.mesh.visible=true;f.mesh.rotation.set(0,0,0);}
  if(f.isPlayer){yaw=f.yaw;pitch=0;deadT=0;camera.rotation.z=0;P.lastHitAt=T;P.landDip=0;P.streak=0;}
  else{BotChat.event('respawn',{bot:f});}}

let lastMs=performance.now(),hudT=0,menuAng=0;
function step(dt){
  T+=dt;
  if(state==='menu'){menuAng+=dt*0.06;camera.position.set(Math.cos(menuAng)*220,70,Math.sin(menuAng)*220);camera.lookAt(0,3,0);camera.updateMatrixWorld(true);if(camera.fov!==62){camera.fov=62;camera.updateProjectionMatrix();}borderMesh.visible=false;}
  else if(state==='playing')updatePlayer(dt);
  else if(state==='dead')updateDeadCamera(dt);
  for(let i=1;i<fighters.length;i++){const f=fighters[i];if(!f.remote)updateBot(f,dt);}
  if(remotes.size)updateRemotes(dt);
  for(let i=0;i<fighters.length;i++){const a=fighters[i];if(!a.alive)continue;
    for(let j=i+1;j<fighters.length;j++){const b=fighters[j];if(!b.alive||Math.abs(a.y-b.y)>1.6||(a.remote&&b.remote))continue;
      const dx=b.x-a.x,dz=b.z-a.z,d2=dx*dx+dz*dz;
      if(d2<0.64&&d2>1e-6){const d=Math.sqrt(d2),p=(0.8-d)/2/d;if(!a.remote){a.x-=dx*p;a.z-=dz*p;}if(!b.remote){b.x+=dx*p;b.z+=dz*p;}}}}
  syncMeshes(dt);BotChat.tick(dt);chatTick(dt);
  if(((T*4)|0)!==(((T-dt)*4)|0)){const cx=camera.position.x,cz=camera.position.z;for(const c of chunkMeshes)c.m.visible=Math.hypot(c.x-cx,c.z-cz)<620;}
  for(const m of medkits){m.ring.visible=m.active;if(m.active){m.mesh.rotation.y+=dt*1.6;m.mesh.position.y=0.75+Math.sin(T*2.4+m.x)*0.1;}}
  updateFx(dt);updateCasings(dt);updateDebris(dt);
  sky.position.copy(camera.position);skyMat.uniforms.time.value=T;grassU.t.value=T;updateMotes(dt);
  if(state==='menu')updateSun(0,0);else updateSun(camera.position.x,camera.position.z);
  updateBorder(dt);
  if(state==='playing'||state==='dead'||state==='ended'){
    const hp=Math.max(0,Math.ceil(player.hp));setText('hpnum',String(hp));
    const hf=$('hpfill');hf.style.width=hp+'%';hf.classList.toggle('low',hp<=30);
    setText('mag',String(P.ammo[P.cur]));$('mag').classList.toggle('empty',P.ammo[P.cur]===0);
    setText('reloadmsg',P.reload>0?'Reloading…':(P.ammo[P.cur]===0?'Press R to reload':''));
    setText('timer',statusText());
    if(P.hitT>0){P.hitT-=dt;if(P.hitT<=0)$('hitm').className='';}
    if(P.toastT>0){P.toastT-=dt;if(P.toastT<=0)$('toast').className='';}
    if(P.dmgT>0)P.dmgT-=dt;if(P.dmgDirT>0)P.dmgDirT-=dt;
    $('dmgdir').style.opacity=Math.max(0,Math.min(1,P.dmgDirT*1.3)).toFixed(2);
    const low=hp>0&&hp<=30?0.25+0.15*Math.sin(T*6):0;
    $('vig').style.opacity=Math.min(1,Math.max(0,P.dmgT)*1.4+low).toFixed(2);
    if(feedItems.length&&T-feedItems[0].t>6){feedItems.shift();renderFeed();}
    hudT-=dt;if(hudT<=0){hudT=0.25;const s=sortedFighters();
      setText('mk',String(player.kills));setText('mr',String(s.indexOf(player)+1));
      setText('mn',String(fighters.filter(f=>f.alive||f.isPlayer).length));
      if(!$('board').classList.contains('hidden'))renderBoard();}
    if(state!=='dead')drawRadar();}}
function frame(ms){requestAnimationFrame(frame);let dt=clamp((ms-lastMs)/1000,0,0.05);lastMs=ms;
  if(paused()&&mode!=='multi')dt=0;
  step(dt);renderer.clear();renderer.render(scene,camera);
  if(gunRoot.visible&&(state==='playing'||state==='dead')){renderer.clearDepth();renderer.render(viewScene,viewCamera);}}
fighters.forEach(f=>{if(!f.isPlayer)spawn(f);});
player.alive=false;renderBoard();requestAnimationFrame(frame);

/* ============ MOBILE ============ */
const TOUCH_SENS=0.0042;
if(isMobile)document.body.classList.add('touch');

/* Adaptive Keys/Touch tab — same tab, contents switch by device */
(function(){
  const keysTabBtn=document.querySelector('.tab-btn[data-tab="keys"]');
  const pc=document.getElementById('keysPcContent'),tc=document.getElementById('keysTouchContent');
  if(isMobile){
    if(pc)pc.style.display='none';
    if(tc)tc.style.display='flex';
    if(keysTabBtn)keysTabBtn.textContent='Touch';
  }else{
    if(pc)pc.style.display='flex';
    if(tc)tc.style.display='none';
    if(keysTabBtn)keysTabBtn.textContent='Keys';
  }
})();

/* Mobile HUD scale + layout */
const mScaleEl=$('mScale'),mScaleVal=$('mScaleVal');
if(mScaleEl){
  try{const s=localStorage.getItem('shotline.mscale');if(s)mScaleEl.value=s;}catch(e){}
  const apply=()=>{const v=+mScaleEl.value/100;document.documentElement.style.setProperty('--mScale',v);if(mScaleVal)mScaleVal.textContent=mScaleEl.value+'%';try{localStorage.setItem('shotline.mscale',mScaleEl.value);}catch(e){}};
  mScaleEl.addEventListener('input',apply);apply();
}
const optLayout=$('optLayout');
let layoutMode=false;
const layoutPositions=(()=>{try{return JSON.parse(localStorage.getItem('shotline.layout')||'{}');}catch(e){return {};}})();
const layoutSave=()=>{try{localStorage.setItem('shotline.layout',JSON.stringify(layoutPositions));}catch(e){}};
function applySavedLayout(){for(const [id,pos] of Object.entries(layoutPositions)){const el=document.getElementById(id);if(!el)continue;if(pos.left!==undefined){el.style.left=pos.left+'px';el.style.right='auto';}if(pos.top!==undefined){el.style.top=pos.top+'px';el.style.bottom='auto';}}}
function setLayoutMode(on){layoutMode=!!on;document.querySelectorAll('#mobileHud .mbtn, #mobileHud .mw').forEach(el=>{el.style.outline=on?'2px dashed var(--accent)':'';});}
if(optLayout)optLayout.addEventListener('change',()=>setLayoutMode(optLayout.checked));
(function(){const hud=$('mobileHud');if(!hud)return;let drag=null;
  hud.addEventListener('touchstart',e=>{if(!layoutMode)return;const t=e.target.closest('.mbtn, .mw');if(!t)return;e.preventDefault();e.stopPropagation();
    const id=t.id||('mw'+t.dataset.w);if(!id)return;const r=t.getBoundingClientRect();
    drag={el:t,id,sx:e.touches[0].clientX,sy:e.touches[0].clientY,l0:r.left,t0:r.top};},{capture:true,passive:false});
  document.addEventListener('touchmove',e=>{if(!drag)return;e.preventDefault();
    const dx=e.touches[0].clientX-drag.sx,dy=e.touches[0].clientY-drag.sy;
    drag.el.style.left=(drag.l0+dx)+'px';drag.el.style.right='auto';
    drag.el.style.top=(drag.t0+dy)+'px';drag.el.style.bottom='auto';},{passive:false});
  document.addEventListener('touchend',()=>{if(!drag)return;const r=drag.el.getBoundingClientRect();layoutPositions[drag.id]={left:r.left,top:r.top};layoutSave();drag=null;});
})();
const resetLayoutBtn=$('resetLayout');
if(resetLayoutBtn)resetLayoutBtn.addEventListener('click',()=>{
  for(const k in layoutPositions)delete layoutPositions[k];
  layoutSave();
  document.querySelectorAll('#mobileHud .mbtn, #mobileHud .mw').forEach(el=>{el.style.left='';el.style.right='';el.style.top='';el.style.bottom='';});
});
applySavedLayout();

const joyZone=$('joyZone'),joyBase=$('joyBase'),joyKnob=$('joyKnob');
let joyId=null;const JOY_R=54;
let mSprintLatched=false;
function updateJoy(x,y){const rect=joyBase.getBoundingClientRect();const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  let dx=x-cx,dy=y-cy;const d=Math.hypot(dx,dy);if(d>JOY_R){dx=dx/d*JOY_R;dy=dy/d*JOY_R;}
  joyKnob.style.transform='translate('+dx+'px,'+dy+'px)';const nx=dx/JOY_R,ny=dy/JOY_R;const dead=0.18;
  keys[BINDS.forward]=ny<-dead;keys[BINDS.back]=ny>dead;keys[BINDS.left]=nx<-dead;keys[BINDS.right]=nx>dead;
  if(Math.hypot(nx,ny)>0.88)keys[BINDS.sprint]=true;else if(!mSprintLatched)keys[BINDS.sprint]=false;}
function endJoy(){joyId=null;joyBase.classList.remove('active');joyKnob.style.transform='translate(0,0)';keys[BINDS.forward]=keys[BINDS.left]=keys[BINDS.back]=keys[BINDS.right]=false;if(!mSprintLatched)keys[BINDS.sprint]=false;}
joyZone.addEventListener('touchstart',e=>{if(layoutMode)return;if(state!=='playing')return;if(joyId!==null)return;const t=e.changedTouches[0];joyId=t.identifier;joyBase.classList.add('active');updateJoy(t.clientX,t.clientY);e.preventDefault();},{passive:false});
joyZone.addEventListener('touchmove',e=>{for(const t of e.changedTouches){if(t.identifier===joyId){updateJoy(t.clientX,t.clientY);break;}}e.preventDefault();},{passive:false});
joyZone.addEventListener('touchend',endJoy);joyZone.addEventListener('touchcancel',endJoy);
let lookId=null,lookLX=0,lookLY=0;
function isUiTarget(el){return el && (el.closest('#joyZone')||el.closest('.mbtn')||el.closest('.mw')||el.closest('#chatbar')||el.closest('#board')||el.closest('#menu')||el.closest('#pause')||el.closest('#death')||el.closest('#adminPrompt'));}
document.addEventListener('touchstart',e=>{if(layoutMode)return;if(state!=='playing')return;if(chatOpen)return;if(!$('adminPrompt').classList.contains('hidden'))return;if(lookId!==null)return;
  for(const t of e.changedTouches){if(isUiTarget(t.target))continue;lookId=t.identifier;lookLX=t.clientX;lookLY=t.clientY;break;}},{passive:true});
document.addEventListener('touchmove',e=>{if(lookId===null)return;
  for(const t of e.changedTouches){if(t.identifier!==lookId)continue;const dx=t.clientX-lookLX,dy=t.clientY-lookLY;lookLX=t.clientX;lookLY=t.clientY;
    const s=TOUCH_SENS*(camera.fov/BASE_FOV)*(0.6+sensSetting*0.08);yaw-=dx*s;pitch=clamp(pitch-dy*s,-1.5,1.5);break;}
  e.preventDefault();},{passive:false});
document.addEventListener('touchend',e=>{for(const t of e.changedTouches)if(t.identifier===lookId)lookId=null;});
document.addEventListener('touchcancel',()=>{lookId=null;});
function haptic(ms){try{if(navigator.vibrate)navigator.vibrate(ms||8);}catch(e){}}
document.querySelectorAll('.mbtn[data-act]').forEach(btn=>{
  const act=btn.dataset.act;
  const down=e=>{if(layoutMode)return;e.preventDefault();e.stopPropagation();btn.classList.add('on');haptic(8);
    if(act==='fire'){mouseL=true;mousePressed=true;}
    else if(act==='ads'){mouseR=true;}
    else if(act==='jump'){keys[BINDS.jump]=true;}
    else if(act==='reload'){keys[BINDS.reload]=true;}
    else if(act==='sprint'){mSprintLatched=!mSprintLatched;keys[BINDS.sprint]=mSprintLatched;btn.classList.toggle('on',mSprintLatched);}
    else if(act==='board'){if(state==='playing'||state==='dead'){renderBoard();$('board').classList.toggle('hidden');}}
    else if(act==='chat'){openChat();}
    else if(act==='exit'){manualPause=true;syncPause();}};
  const up=e=>{if(layoutMode)return;e.preventDefault();e.stopPropagation();
    if(act!=='sprint'&&act!=='board'&&act!=='chat'&&act!=='exit')btn.classList.remove('on');
    if(act==='fire'){mouseL=false;mousePressed=false;}
    else if(act==='ads'){mouseR=false;}
    else if(act==='jump'){keys[BINDS.jump]=false;}
    else if(act==='reload'){keys[BINDS.reload]=false;}};
  btn.addEventListener('touchstart',down,{passive:false});
  btn.addEventListener('touchend',up,{passive:false});
  btn.addEventListener('touchcancel',up,{passive:false});});
function refreshWeaponButtons(){document.querySelectorAll('#mWeapons .mw').forEach(b=>{b.classList.toggle('on',+b.dataset.w===P.cur);});}
document.querySelectorAll('#mWeapons .mw').forEach(btn=>{btn.addEventListener('touchstart',e=>{if(layoutMode)return;e.preventDefault();e.stopPropagation();haptic(6);setGun(+btn.dataset.w);refreshWeaponButtons();},{passive:false});});
refreshWeaponButtons();
const _origSetGun=setGun;setGun=function(i){_origSetGun(i);refreshWeaponButtons();};
setInterval(()=>{if(!isMobile)return;const show=(state==='playing')&&!chatOpen&&$('adminPrompt').classList.contains('hidden');
  $('mobileHud').classList.toggle('hidden',!show);
  if(!show){lookId=null;endJoy();mSprintLatched=false;}},120);
})();
