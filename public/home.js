/* home.js — Free Fire-style lobby: hero in the centre, fox doing stunts, 4 corner buttons.
   Takes over whenever the old #menu would appear as the root screen; #menu is reused as the sub-screens. */
window.HOME=(function(){
'use strict';
const $=id=>document.getElementById(id);
const H={sub:false,visible:false};
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ease=p=>p*p*(3-2*p);
let T3,renderer,scene,cam,root,hero=null,mixer=null,fox=null,ring1,ring2,sparks,clock,raf=0,built=false,skinKey='',beam;
let t=0,dragX=0,spinV=0,heroYaw=0.25,emote=null,emoteT=0,emoteNext=2.2,foxSeq=0,foxState=null,foxT=0,foxAng=0,tap=null;
const bones={},boneBase=new Map();let hipsBaseY=0;
// Lobby companion is preview-only; deployment controls exist in-match, not on the home screen.
let foxWander={x:1.0,z:0.55,tx:1.0,tz:0.55,wait:0};
const EV=new (window.THREE?THREE.Euler:Object)(),QV=window.THREE?new THREE.Quaternion():null;

/* ---------------- DOM ---------------- */
const svg=(d)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+d+'</svg>';
function buildDom(){
  const d=document.createElement('div');d.id='home';d.className='hidden';
  d.innerHTML=
  '<div class="hm-bg"><i class="hm-ray r1"></i><i class="hm-ray r2"></i><i class="hm-ray r3"></i><div class="hm-grid"></div></div>'+
  '<canvas id="homeCv"></canvas>'+
  '<div class="hm-title"><b>SHOT</b><span>LINE</span></div>'+
  '<button class="hm-profile" id="hmProfile" aria-label="Profile"><span class="hm-av" id="hmAv">?</span><span class="hm-pi"><b id="hmName">Guest</b><small id="hmCoins"></small></span></button>'+
  '<div class="hm-tr"><button class="hm-ic" id="hmRanks" aria-label="Leaderboard">'+svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a2 2 0 0 0 2 4M16 6h3a2 2 0 0 1-2 4M12 13v4M8.5 20h7"/>')+'</button>'+
  '<button class="hm-ic" id="hmSettings" aria-label="Settings">'+svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>')+'</button></div>'+
  '<button class="hm-shop" id="hmShop"><span class="hm-shop-i">'+svg('<path d="M6 8h12l-1 12H7z"/><path d="M9 8a3 3 0 0 1 6 0"/>')+'</span><span>SHOP</span></button>'+
  '<div class="hm-gun" id="hmGun"></div>'+
  '<button class="hm-play" id="hmPlay"><span class="hm-play-t">PLAY NOW</span><span class="hm-play-s">Choose a mode</span><i class="hm-shine"></i></button>'+
  '<button class="hm-char" id="hmChar" aria-label="Switch character"><span class="hm-char-i" id="hmCharI">♂</span><span class="hm-char-t"><small>CHARACTER</small><b id="hmCharN">Shadow Operative</b></span><span class="hm-char-s">⇄</span></button>'+
  '<div class="hm-hint">Drag to rotate · tap a model to animate</div>';
  document.body.appendChild(d);
  $('hmPlay').onclick=()=>openSub('play','play');
  $('hmProfile').onclick=()=>openSub('play','profile');
  $('hmSettings').onclick=()=>openSub('settings');
  $('hmShop').onclick=()=>openSub('shop');
  $('hmRanks').onclick=()=>openSub('ranks');
  $('hmChar').onclick=()=>H.setChar(H.char()==='male'?'female':'male',true);
}

/* ---------------- 3D stage ---------------- */
function spriteTex(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(0.35,'rgba(255,190,110,.6)');r.addColorStop(1,'rgba(255,120,40,0)');g.fillStyle=r;g.fillRect(0,0,64,64);return new T3.CanvasTexture(c);}
function floorTex(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),r=g.createRadialGradient(128,128,10,128,128,128);r.addColorStop(0,'rgba(255,140,60,.55)');r.addColorStop(0.45,'rgba(255,100,30,.16)');r.addColorStop(1,'rgba(255,100,30,0)');g.fillStyle=r;g.fillRect(0,0,256,256);return new T3.CanvasTexture(c);}
function buildStage(){
  T3=window.THREE;const cv=$('homeCv');
  renderer=new T3.WebGLRenderer({canvas:cv,antialias:true,alpha:true,powerPreference:'high-performance'});
  renderer.setClearColor(0,0);
  scene=new T3.Scene();cam=new T3.PerspectiveCamera(30,1,0.1,60);
  scene.add(new T3.HemisphereLight(0xaac0ff,0x2a1e18,0.55));
  const key=new T3.DirectionalLight(0xffe2c0,1.05);key.position.set(-2.5,4,3.5);scene.add(key);
  const rim=new T3.DirectionalLight(0x6fb0ff,0.9);rim.position.set(3,2.5,-3.5);scene.add(rim);
  const warm=new T3.PointLight(0xff7a30,0.8,7);warm.position.set(0,0.2,1.3);scene.add(warm);
  root=new T3.Group();scene.add(root);
  // pedestal
  const disc=new T3.Mesh(new T3.CircleGeometry(2.6,48),new T3.MeshBasicMaterial({map:floorTex(),transparent:true,depthWrite:false,blending:T3.AdditiveBlending}));disc.rotation.x=-Math.PI/2;disc.position.y=0.005;root.add(disc);
  const base=new T3.Mesh(new T3.CylinderGeometry(1.55,1.7,0.1,48),new T3.MeshStandardMaterial({color:0x14171d,metalness:0.7,roughness:0.35}));base.position.y=-0.05;root.add(base);
  ring1=new T3.Mesh(new T3.TorusGeometry(1.52,0.025,8,80),new T3.MeshBasicMaterial({color:0xff7a2a}));ring1.rotation.x=Math.PI/2;ring1.position.y=0.01;root.add(ring1);
  ring2=new T3.Mesh(new T3.TorusGeometry(1.15,0.012,6,64),new T3.MeshBasicMaterial({color:0xffd09a,transparent:true,opacity:0.7}));ring2.rotation.x=Math.PI/2;ring2.position.y=0.012;root.add(ring2);
  beam=new T3.Mesh(new T3.CylinderGeometry(1.4,1.55,6,40,1,true),new T3.MeshBasicMaterial({color:0xff8a40,transparent:true,opacity:0.07,side:T3.DoubleSide,depthWrite:false,blending:T3.AdditiveBlending}));beam.position.y=3;root.add(beam);
  // embers
  const N=90,pos=new Float32Array(N*3),spd=new Float32Array(N);
  for(let i=0;i<N;i++){const a=Math.random()*TAU,r=0.5+Math.random()*2.2;pos[i*3]=Math.cos(a)*r;pos[i*3+1]=Math.random()*3.2;pos[i*3+2]=Math.sin(a)*r;spd[i]=0.2+Math.random()*0.5;}
  const pg=new T3.BufferGeometry();pg.setAttribute('position',new T3.BufferAttribute(pos,3));
  sparks=new T3.Points(pg,new T3.PointsMaterial({map:spriteTex(),size:0.09,transparent:true,depthWrite:false,blending:T3.AdditiveBlending,color:0xffaa66}));sparks.userData.spd=spd;root.add(sparks);
  // fox
  fox=FoxLib.create(T3);fox.g.scale.setScalar(1.0);root.add(fox.g);fox.g.position.set(1.0,0,0.55);
  fox.g.visible=true;
  built=true;resize();
}
function heroSkin(){
  if(window.TACTICAL_GEN&&TACTICAL_GEN.ready())return {tex:null,key:'char:'+(window.__charPref||'male')};
  try{const s=window.__getPlayerSkin&&window.__getPlayerSkin();if(s&&s.tex)return {tex:s.tex,key:s.tex.uuid};}catch(e){}
  const nm=($('name')&&$('name').value)||'guest';const cv=SOLDIER_GEN.defaultSkin(nm);return {tex:SOLDIER_GEN.makeTexture(cv),key:'d'+nm};
}
function buildHero(){
  if(!window.SOLDIER_GEN||!built)return;
  const sk=heroSkin();if(sk.key===skinKey&&hero)return;skinKey=sk.key;
  if(hero){root.remove(hero.scene);if(mixer)mixer.stopAllAction();}boneBase.clear();for(const key of Object.keys(bones))delete bones[key];
  hero=(window.TACTICAL_GEN&&TACTICAL_GEN.ready())?TACTICAL_GEN.build(window.__charPref||'male'):SOLDIER_GEN.build({});if(!(window.TACTICAL_GEN&&TACTICAL_GEN.ready()))SOLDIER_GEN.applySkin(hero.scene,sk.tex);
  hero.scene.scale.setScalar(1);root.add(hero.scene);
  mixer=new T3.AnimationMixer(hero.scene);if(hero.animations&&hero.animations[0])mixer.clipAction(hero.animations[0]).play();
  hero.scene.traverse(o=>{if(o.name){bones[o.name.replace(/^mixamorig:?/i,'').replace(/^mixamorig/,'')]=o;if(o.isBone)boneBase.set(o,o.quaternion.clone());}});const hb=bones.Hips||bones.hips;if(hb)hipsBaseY=hb.position.y;
  hero.scene.userData.hero=true;
}

/* ---------------- emotes ---------------- */
const EMOTES={wave:1.9,cheer:1.7,pump:1.6,spin:1.25,flex:1.8,salute:1.5};
function applyEmote(dt){
  if(!hero)return;
  const b=bones;
  // Emote poses are offsets from the bind pose, never accumulated frame-over-frame.
  for(const [bn,q] of boneBase){if(/(RightArm|LeftArm|RightForeArm|LeftForeArm|Head|Spine|Hips)/i.test(bn.name||''))bn.quaternion.copy(q);}
  const hips=b.Hips||b.hips;if(hips)hips.position.y=hipsBaseY;let w=0,e=emote,et=emoteT;
  const ang=(n,x,y,z,k)=>{const bn=b[n];if(!bn)return;EV.set(x*k,y*k,z*k);QV.setFromEuler(EV);bn.quaternion.multiply(QV);};
  if(e){const d=EMOTES[e];w=ease(clamp(et/0.28,0,1))*(1-ease(clamp((et-(d-0.3))/0.3,0,1)));
    if(e==='wave'){ang('RightArm',-0.4,0,-2.5,w);ang('RightForeArm',0,0,Math.sin(et*11)*0.55,w);ang('RightForeArm',-0.3,0,0,w);ang('Head',0,-0.25,0.1,w);}
    else if(e==='cheer'){const s=Math.sin(et*10);ang('RightArm',-0.2,0,-2.75+s*0.12,w);ang('LeftArm',-0.2,0,2.75-s*0.12,w);ang('RightForeArm',-0.25,0,0,w);ang('LeftForeArm',-0.25,0,0,w);ang('Head',-0.25,0,0,w);ang('Spine',-0.1,0,0,w);if(b.Hips)b.Hips.position.y+=Math.abs(s)*0.09*w;}
    else if(e==='pump'){const s=Math.sin(et*9);ang('RightArm',-2.4+s*0.25,0,-0.3,w);ang('RightForeArm',-0.9,0,0,w);ang('Spine',0.06,-0.15,0,w);ang('Head',0,0.15,0,w);if(b.Hips)b.Hips.position.y+=Math.abs(s)*0.04*w;}
    else if(e==='spin'){heroYaw+=dt*(TAU/ (EMOTES.spin-0.25))*w;ang('RightArm',0,0,-1.25,w);ang('LeftArm',0,0,1.25,w);if(b.Hips)b.Hips.position.y+=Math.sin(clamp(et/EMOTES.spin,0,1)*Math.PI)*0.14;}
    else if(e==='flex'){ang('RightArm',0,0,-1.45,w);ang('LeftArm',0,0,1.45,w);ang('RightForeArm',-1.9,0,0,w);ang('LeftForeArm',-1.9,0,0,w);ang('Spine',-0.05,0,0,w);ang('Head',-0.1,0,0,w);}
    else if(e==='salute'){ang('RightArm',-1.2,0,-1.0,w);ang('RightForeArm',-1.7,0,0,w);ang('Head',-0.08,0,0,w);}
  }
}

/* ---------------- fox director ---------------- */
const SEQ=[['wander',3.6],['idle',1.7],['stunt','bow'],['wander',3.2],['idle',1.2],['stunt','howl'],['wander',4.1],['idle',1.5],['stunt','pounce']];
const REST={x:1.0,z:0.55};
function foxStep(dt){
  if(!fox)return;dt=Math.min(dt,0.05);const g=fox.g;
  if(!foxState){foxState='idle';foxT=2;foxWander.speed=0;}foxT-=dt;
  if(foxT<=0&&!fox.busy()){
    if(foxState==='wander'){foxState='idle';foxT=2.5+Math.random()*4;}
    else if(Math.random()<0.12){const stunt=Math.random()<0.5?'bow':'howl';foxState='stunt';fox.play(stunt);foxT=(fox.STUNTS[stunt]||2)+.3;}
    else{foxState='wander';foxT=6;const a=Math.random()*TAU,d=.6+Math.random()*.8;
      foxWander.tx=clamp(g.position.x+Math.sin(a)*d,-1.4,1.4);foxWander.tz=clamp(g.position.z+Math.cos(a)*d,-.8,.9);}
  }
  const dx=foxWander.tx-g.position.x,dz=foxWander.tz-g.position.z,dist=Math.hypot(dx,dz);let desired=0;
  if(foxState==='wander'&&!fox.busy()){
    if(dist<.1){foxState='idle';foxT=2.5+Math.random()*3;}
    else{const delta=Math.atan2(Math.sin(Math.atan2(dx,dz)-g.rotation.y),Math.cos(Math.atan2(dx,dz)-g.rotation.y));
      g.rotation.y+=clamp(delta,-dt*2.2,dt*2.2);desired=Math.min(.72,dist*1.6)*Math.max(0,Math.cos(delta));}
  }
  foxWander.speed=(foxWander.speed||0)+(desired-(foxWander.speed||0))*(1-Math.exp(-dt*5));
  const speed=fox.busy()?0:foxWander.speed,step=Math.min(dist,speed*dt);
  if(foxState==='wander'){g.position.x+=Math.sin(g.rotation.y)*step;g.position.z+=Math.cos(g.rotation.y)*step;}
  fox.update(dt,{speed,sit:foxState==='idle'&&speed<.04});
}

function startEmote(n){emote=n;emoteT=0;}
H.emote=startEmote;

/* ---------------- loop ---------------- */
function resize(){
  if(!built)return;const w=window.innerWidth,h=window.innerHeight,dpr=Math.min(window.devicePixelRatio||1,(/Mobi|Android/i.test(navigator.userAgent)?1.75:2));
  renderer.setPixelRatio(dpr);renderer.setSize(w,h,false);cam.aspect=w/h;
  const portrait=h>w;cam.fov=portrait?44:30;cam.updateProjectionMatrix();
  H.portrait=portrait;
}
function frame(){
  raf=requestAnimationFrame(frame);
  const dt=Math.min(clock.getDelta(),0.05);t+=dt;
  if(mixer)mixer.update(dt);
  // emote scheduler
  if(emote){emoteT+=dt;if(emoteT>EMOTES[emote]){emote=null;emoteNext=3.2+Math.random()*2.5;}}else{emoteNext-=dt;if(emoteNext<=0){const k=Object.keys(EMOTES);startEmote(k[(Math.random()*k.length)|0]);}}
  heroYaw+=spinV*dt;spinV*=Math.pow(0.04,dt);
  if(hero){const target=heroYaw*0.35+Math.sin(t*0.5)*0.07;hero.scene.rotation.y+=(target-hero.scene.rotation.y)*(1-Math.exp(-dt*7));
    applyEmote(dt);
    if(emote!=='spin')heroYaw+= -heroYaw*0.0; }
  foxStep(dt);
  ring2.rotation.z+=dt*0.5;ring1.material.color.setHSL(0.06+Math.sin(t*0.8)*0.01,1,0.55+Math.sin(t*3)*0.05);
  beam.material.opacity=0.06+Math.sin(t*1.7)*0.015;
  const p=sparks.geometry.attributes.position,sp=sparks.userData.spd;
  for(let i=0;i<p.count;i++){let y=p.getY(i)+sp[i]*dt;if(y>3.4)y=0;p.setY(i,y);p.setX(i,p.getX(i)+Math.sin(t+i)*0.001);}
  p.needsUpdate=true;
  // camera: slow cinematic sway; pull back for portrait
  const R=H.portrait?6.6:5.0,cy=H.portrait?1.3:1.15,ang=Math.sin(t*0.35)*0.18;
  cam.position.set(Math.sin(ang)*R,cy+Math.sin(t*0.5)*0.05,Math.cos(ang)*R);cam.lookAt(0.0,H.portrait?0.85:0.82,0);
  renderer.render(scene,cam);
}
function pick(ev){
  if(!hero||!fox)return;const r=$('homeCv').getBoundingClientRect(),x=((ev.clientX-r.left)/r.width)*2-1,y=-((ev.clientY-r.top)/r.height)*2+1;
  const rc=new T3.Raycaster();rc.setFromCamera({x,y},cam);
  if(rc.intersectObject(fox.g,true).length){fox.play(['flip','spin','jump','dance','pounce','howl','bow'][(Math.random()*7)|0]);foxState='stunt';foxT=fox.STUNTS.dance||1.5;return true;}
  if(rc.intersectObject(hero.scene,true).length){startEmote(Object.keys(EMOTES)[(Math.random()*6)|0]);return true;}
  return false;
}
function bindInput(){
  const cv=$('homeCv');let down=null;
  cv.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now(),lx:e.clientX};cv.setPointerCapture&&cv.setPointerCapture(e.pointerId);});
  cv.addEventListener('pointermove',e=>{if(!down)return;const dx=e.clientX-down.lx;down.lx=e.clientX;heroYaw+=dx*0.012;spinV=dx*0.9;});
  cv.addEventListener('pointerup',e=>{if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)<8&&performance.now()-down.t<400)pick(e);down=null;});
  window.addEventListener('resize',resize);window.addEventListener('orientationchange',()=>setTimeout(resize,200));
}


const CHARS={male:{name:'Vanguard-07',tag:'Male',sym:'♂',blurb:'Stealth assault operator'},female:{name:'Nyx Sentinel',tag:'Female',sym:'♀',blurb:'Recon specialist'}};
H.char=()=>window.__charPref||'male';
H.setChar=function(k,wave){
  if(!CHARS[k])return;try{localStorage.setItem('shotline.char',k);}catch(e){}
  window.__charPref=k;refreshChar();if(H.visible){buildHero();if(wave)startEmote('wave');}
};
function refreshChar(){
  const c=CHARS[H.char()];if(!$('hmChar'))return;$('hmCharI').textContent=c.sym;$('hmCharN').textContent=c.name;
  document.querySelectorAll('#charCards .cc').forEach(b=>b.classList.toggle('on',b.dataset.k===H.char()));
}
function injectChars(){
  const main=document.querySelector('#menu .lb-main');if(!main||$('charCards'))return;
  const d=document.createElement('div');d.id='charCards';
  d.innerHTML='<h3>Choose your character</h3><div class="cc-row">'+Object.keys(CHARS).map(k=>'<button type="button" class="cc" data-k="'+k+'"><i>'+CHARS[k].sym+'</i><b>'+CHARS[k].name+'</b><small>'+CHARS[k].tag+' · '+CHARS[k].blurb+'</small><em>SELECTED</em></button>').join('')+'</div><p class="cc-note">Bots in single player are robots.</p>';
  main.insertBefore(d,main.firstChild);
  d.querySelectorAll('.cc').forEach(b=>b.onclick=()=>H.setChar(b.dataset.k));
}

/* ---------------- state ---------------- */
function refreshChip(){
  const A=window.ACCT,me=A&&A.me;const nm=(me&&me.name)||($('name')&&$('name').value)||'Guest';
  $('hmName').textContent=nm;$('hmAv').textContent=(nm[0]||'?').toUpperCase();
  $('hmCoins').textContent=me&&me.money!==undefined?('◎ '+me.money.toLocaleString()):'Guest';
  let g='';try{g=localStorage.getItem('shotline.lastGun')||'';}catch(e){}
  const names={pistol:'R-9 Pistol',rifle:'AK Rifle',sniper:'Sniper',shotgun:'Shotgun',bazooka:'RPG',fist:'Fists'};
  $('hmGun').innerHTML=g?'<small>LOADOUT</small><b>'+(names[g]||g)+'</b>':'';
}
let chipT=0;
H.show=function(){
  if(!$('home'))buildDom();
  if(!built&&window.THREE){buildStage();bindInput();}
  if(!built)return;
  document.body.classList.add('home-on');$('home').classList.remove('hidden');H.visible=true;
  buildHero();refreshChip();resize();
  if(!raf){clock=new T3.Clock();raf=requestAnimationFrame(frame);}
};
H.hide=function(){const h=$('home');if(h)h.classList.add('hidden');document.body.classList.remove('home-on');H.visible=false;if(raf){cancelAnimationFrame(raf);raf=0;}};
function openSub(tab,mode){
  const m=$('menu');H.sub=true;H.hide();
  m.classList.remove('sub-play','sub-profile');m.classList.add('sub',mode==='profile'?'sub-profile':(mode==='play'?'sub-play':'sub-x'));
  m.classList.remove('hidden');
  const b=m.querySelector('.tab-btn[data-tab="'+tab+'"]');if(b)b.click();
  const ti=$('subTitle');if(ti)ti.textContent=({play:mode==='profile'?'Profile':'Play',ranks:'Leaderboard',shop:'Shop',settings:'Settings'})[tab]||'';
}
H.back=function(){
  const m=$('menu');H.sub=false;H.goingBack=true;m.classList.add('hidden');m.classList.remove('sub','sub-play','sub-profile','sub-x');
  H.show();H.goingBack=false;
};
function injectBack(){
  const hdr=document.querySelector('#menu .lb-top');if(!hdr||$('subBack'))return;
  const b=document.createElement('button');b.id='subBack';b.className='sub-back';b.type='button';b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg><span>Back</span>';
  b.onclick=H.back;hdr.insertBefore(b,hdr.firstChild);
  const t2=document.createElement('div');t2.id='subTitle';t2.className='sub-title';hdr.insertBefore(t2,b.nextSibling);
}
function init(){
  buildDom();injectBack();injectChars();refreshChar();
  const m=$('menu');
  new MutationObserver(()=>{
    const hidden=m.classList.contains('hidden');
    if(!hidden&&!H.sub&&!H.goingBack){m.classList.add('hidden');H.show();}        // app wants the root menu → show lobby
    else if(hidden&&H.sub&&!H.goingBack){H.sub=false;m.classList.remove('sub','sub-play','sub-profile','sub-x');H.hide();} // game started from a sub-screen
  }).observe(m,{attributes:true,attributeFilter:['class']});
  // hardware / browser back + Esc
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&H.sub&&!m.classList.contains('hidden')){e.preventDefault();H.back();}});
  setInterval(()=>{if(H.visible){refreshChip();buildHero();}},1000);
  if(!m.classList.contains('hidden')){m.classList.add('hidden');H.show();}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
return H;
})();
