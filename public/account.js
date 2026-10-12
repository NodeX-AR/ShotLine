/* Client side of accounts: login / sign-up / guest, skin upload, daily reward, shop.
   The server is the only authority on coins and ownership; this file just calls the API. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const LS='shotline.token';
const A=window.ACCT={token:null,me:null,guest:true,listeners:[],notify:null};
/* Hand-made special name gradients: assign in the database as COL = 'sp:<id>' (e.g. sp:creator).
   Stops are evenly spaced; animate:true makes it flow.  Edit/add your own here. */
A.SPECIAL_GRADIENTS={
  creator:{stops:['#ff3d6e','#ffb347','#fff35c','#4dffb8','#4d9bff','#c04dff'],animate:true},
  nodex:{stops:['#ff2d55','#ff9500','#ffd60a'],animate:true}
};
const HEX=/^#[0-9a-f]{6}$/i;
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function colorStops(col){
  if(typeof col!=='string')return null;
  if(HEX.test(col))return {stops:[col],animate:false};
  const m=/^g:(#[0-9a-f]{6}),(#[0-9a-f]{6})$/i.exec(col);if(m)return {stops:[m[1],m[2]],animate:false};
  const s=/^sp:([a-z0-9_]{1,20})$/.exec(col);if(s&&A.SPECIAL_GRADIENTS[s[1]])return A.SPECIAL_GRADIENTS[s[1]];
  return null;
}
/* HTML for "[Tag]Name" with colours; every dynamic piece is escaped or validated. */
A.nameHTML=function(name,col,tag){
  let h='';
  if(tag&&tag.label&&HEX.test(tag.color||''))h+='<span class="ntag" style="color:'+tag.color+'">['+esc(tag.label)+']</span>';
  const c=colorStops(col);
  if(!c)h+='<span class="nm">'+esc(name)+'</span>';
  else if(c.stops.length===1)h+='<span class="nm" style="color:'+c.stops[0]+'">'+esc(name)+'</span>';
  else h+='<span class="nm ngrad'+(c.animate?' nflow':'')+'" style="background-image:linear-gradient(90deg,'+c.stops.join(',')+(c.animate?','+c.stops[0]:'')+')">'+esc(name)+'</span>';
  return h;
};
/* canvas fill for the in-world name label */
A.canvasFill=function(g,col,x0,x1){
  const c=colorStops(col);if(!c)return '#fff';
  if(c.stops.length===1)return c.stops[0];
  const gr=g.createLinearGradient(x0,0,x1,0);c.stops.forEach((s,i)=>gr.addColorStop(i/(c.stops.length-1),s));return gr;
};
A.onChange=fn=>A.listeners.push(fn);
function changed(){A.listeners.forEach(f=>{try{f(A);}catch(e){console.warn(e);}});}
function say(m,bad){const el=$('authMsg');if(el){el.textContent=m||'';el.style.color=bad?'#ff8a8a':'';}if(A.notify&&m&&!bad)A.notify(m);}
async function api(path,body,method){
  const h={'content-type':'application/json'};if(A.token)h.authorization='Bearer '+A.token;
  try{const r=await fetch('/api/'+path,{method:method||(body===undefined?'GET':'POST'),headers:h,body:body===undefined?undefined:JSON.stringify(body)});
    let j=null;try{j=await r.json();}catch(e){}return j||{ok:false,error:'Server error ('+r.status+')'};}
  catch(e){return {ok:false,error:'Cannot reach the server'};}
}
A.api=api;
A.skinUrl=(un,v)=>'/api/skin/'+encodeURIComponent(un)+'?v='+(v||0);
A.identity=function(){
  const m=A.me;
  if(!m)return {guest:true};
  return {guest:false,name:m.un,col:m.col,tag:m.tag,slim:m.skm==='slim',skin:m.hasSkin?A.skinUrl(m.un,m.skv):null,power:m.power};
};
function setSession(token,me){A.token=token;A.me=me;A.guest=!me;try{if(token)localStorage.setItem(LS,token);else localStorage.removeItem(LS);}catch(e){}renderBar();renderShop();changed();}
A.logout=async function(){if(A.token)await api('logout',{});setSession(null,null);showAuth();};

/* ---------- screens ---------- */
function show(id){for(const x of ['authChoice','authLoginForm','authSignupForm','authResetForm','authRecovery'])$(x).classList.toggle('hidden',x!==id);say('');}
function showAuth(){$('auth').classList.remove('hidden');$('menu').classList.add('hidden');show('authChoice');}
function enterMenu(){$('auth').classList.add('hidden');$('menu').classList.remove('hidden');}
A.showAuth=showAuth;

function renderBar(){
  const bar=$('acctBar');if(!bar)return;const m=A.me,nm=$('name');
  if(!m){bar.innerHTML='<span class="who">Guest</span><button class="chip" id="barLogin">Log in / Sign up</button>';
    const b=$('barLogin');if(b)b.onclick=showAuth;if(nm){nm.readOnly=false;}return;}
  bar.innerHTML='<span class="who">'+A.nameHTML(m.un,m.col,m.tag)+'</span>'+
    '<span class="coins"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4.2"/></svg><b id="coinNum">'+m.money.toLocaleString()+'</b></span>'+
    '<button class="chip" id="barShop">Shop</button><button class="chip ghost" id="barOut">Log out</button>';
  $('barShop').onclick=()=>{const t=document.querySelector('.tab-btn[data-tab="shop"]');if(t)t.click();};
  $('barOut').onclick=A.logout;
  if(nm){nm.value=m.un;nm.readOnly=true;}
  const mp=$('mpPower');if(mp)mp.textContent=m.power?('Online power: '+({heal:'Healing Ring',poison:'Poison Ring',dash:'Dash',shield:'Shield Pulse'}[m.power]||m.power)):'Online power: none equipped (see Shop)';
}
A.setCoins=function(total){if(A.me){A.me.money=total;const n=$('coinNum');if(n)n.textContent=total.toLocaleString();renderShop();}};

/* ---------- skin picker (shared by sign-up and profile) ---------- */
function drawPreview(cv,skin){
  const g=cv.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,cv.width,cv.height);if(!skin)return;
  const s=cv.width/16;const d=(sx,sy,w,h,dx,dy)=>g.drawImage(skin,sx,sy,w,h,dx*s,dy*s,w*s,h*s);
  d(8,8,8,8,4,0);d(40,8,8,8,4,0);d(20,20,8,12,4,8);d(20,36,8,12,4,8);
  d(44,20,4,12,0,8);d(44,36,4,12,0,8);d(36,52,4,12,12,8);d(52,52,4,12,12,8);
  d(4,20,4,12,4,20);d(4,36,4,12,4,20);d(20,52,4,12,8,20);d(4,52,4,12,8,20);
}
function pickSkin(file,cb){
  if(!file)return;const im=new Image();const u=URL.createObjectURL(file);
  im.onload=()=>{URL.revokeObjectURL(u);
    if(im.width!==64||(im.height!==64&&im.height!==32)){cb(null,'Skin must be a 64×64 PNG (Minecraft format)');return;}
    const cv=window.SOLDIER_GEN.normalizeSkin(im);const b64=cv.toDataURL('image/png').split(',')[1];
    if(b64.length*0.75>31000){cb(null,'Skin file is too large');return;}cb({cv,b64});};
  im.onerror=()=>cb(null,'Could not read that image');im.src=u;
}
let signupSkin=null,profileSkin=null;

function wire(){
  $('authLoginBtn').onclick=()=>show('authLoginForm');
  $('authSignupBtn').onclick=()=>show('authSignupForm');
  $('authGuestBtn').onclick=()=>{setSession(null,null);enterMenu();};
  for(const b of document.querySelectorAll('[data-auth-back]'))b.onclick=()=>show('authChoice');
  $('authForgot').onclick=()=>show('authResetForm');
  $('authLoginForm').onsubmit=async e=>{e.preventDefault();say('Signing in…');
    const j=await api('login',{un:$('liUn').value.trim(),pw:$('liPw').value});
    if(!j.ok){say(j.error||'Login failed',true);return;}
    setSession(j.token,j.me);enterMenu();claimDaily(true);};
  $('authSignupForm').onsubmit=async e=>{e.preventDefault();
    if($('suPw').value!==$('suPw2').value){say('Passwords do not match',true);return;}
    say('Creating account…');
    const j=await api('signup',{un:$('suUn').value.trim(),pw:$('suPw').value,skin:signupSkin?signupSkin.b64:undefined,slim:$('suSlim').checked});
    if(!j.ok){say(j.error||'Sign-up failed',true);return;}
    setSession(j.token,j.me);$('recCode').textContent=j.recovery;show('authRecovery');};
  $('recDone').onclick=()=>{enterMenu();claimDaily(true);};
  $('authResetForm').onsubmit=async e=>{e.preventDefault();say('Resetting…');
    const j=await api('reset',{un:$('rsUn').value.trim(),code:$('rsCode').value.trim(),pw:$('rsPw').value});
    if(!j.ok){say(j.error||'Reset failed',true);return;}show('authLoginForm');say('Password changed — log in with the new one.');};
  $('suSkin').onchange=e=>pickSkin(e.target.files[0],(r,err)=>{if(!r){signupSkin=null;drawPreview($('suPrev'),null);say(err,true);return;}signupSkin=r;drawPreview($('suPrev'),r.cv);say('');});
  $('pfSkin').onchange=e=>pickSkin(e.target.files[0],(r,err)=>{if(!r){profileSkin=null;say(err,true);return;}profileSkin=r;drawPreview($('pfPrev'),r.cv);$('pfUp').disabled=false;});
  $('pfUp').onclick=async()=>{if(!profileSkin)return;$('pfUp').disabled=true;
    const j=await api('skin',{skin:profileSkin.b64,slim:$('pfSlim').checked});
    if(!j.ok){if(A.notify)A.notify(j.error||'Upload failed');$('pfUp').disabled=false;return;}
    A.me=j.me;profileSkin=null;changed();if(A.notify)A.notify('Skin updated');renderShop();};
  $('dailyBtn').onclick=()=>claimDaily(false);
  $('colApplySolid').onclick=()=>setColor($('colSolid').value);
  $('colApplyGrad').onclick=()=>setColor('g:'+$('colG1').value+','+$('colG2').value);
  $('colClear').onclick=()=>setColor(null);
}
async function setColor(c){const j=await api('color',{color:c});if(!j.ok){if(A.notify)A.notify(j.error||'Could not set colour');return;}A.me=j.me;renderBar();renderShop();changed();}
async function claimDaily(quiet){
  if(!A.me)return;const j=await api('daily',{});
  if(j.ok){A.me=j.me;renderBar();renderShop();changed();if(A.notify)A.notify('Daily reward +'+j.amount+' coins (streak '+j.streak+')');}
  else if(!quiet&&A.notify)A.notify(j.error||'Not available');
}
const SHOP=[
  {id:'col_solid',name:'Solid name colour',desc:'Pick any single colour for your name in chat and above your head.',price:10000},
  {id:'col_grad',name:'Gradient name colour',desc:'Two-colour gradient name. Includes solid colours.',price:100000},
  {id:'pw_heal',name:'Healing Ring',desc:'Drop a 4 m ring: +6 HP/s for 5 s to anyone inside. 60 s cooldown.',price:15000,power:'heal'},
  {id:'pw_poison',name:'Poison Ring',desc:'Drop a 4 m toxic ring: 5 dmg/s for 5 s to enemies inside. 50 s cooldown.',price:15000,power:'poison'},
  {id:'pw_dash',name:'Dash',desc:'Burst forward about 6 m. 20 s cooldown.',price:10000,power:'dash'},
  {id:'pw_shield',name:'Shield Pulse',desc:'Absorb up to 30 damage for 3 s. 60 s cooldown.',price:25000,power:'shield'}
];
function renderShop(){
  const m=A.me;$('shopGuest').classList.toggle('hidden',!!m);$('shopBody').classList.toggle('hidden',!m);if(!m)return;
  $('dailyBtn').disabled=!m.dailyReady;$('dailyBtn').textContent=m.dailyReady?'Claim daily reward':'Come back tomorrow';
  $('dailyInfo').textContent='Streak: '+m.streak+' day'+(m.streak===1?'':'s')+' · +10 coins, growing to +50';
  $('shopPreview').innerHTML=A.nameHTML(m.un,m.col,m.tag);
  $('pfSlim').checked=m.skm==='slim';
  const owned=new Set(m.items);
  $('colSolidRow').classList.toggle('hidden',!(owned.has('col_solid')||owned.has('col_grad')));
  $('colGradRow').classList.toggle('hidden',!owned.has('col_grad'));
  const L=$('powerList');L.innerHTML='';
  for(const it of SHOP){
    const row=document.createElement('div');row.className='shop-item';
    const has=owned.has(it.id);
    row.innerHTML='<div><b>'+esc(it.name)+'</b><small>'+esc(it.desc)+'</small></div>';
    const btn=document.createElement('button');btn.className='chip';
    if(!has){btn.textContent=it.price.toLocaleString()+' coins';btn.disabled=m.money<it.price;
      btn.onclick=async()=>{btn.disabled=true;const j=await api('buy',{item:it.id});if(!j.ok){if(A.notify)A.notify(j.error||'Purchase failed');}else{A.me=j.me;if(A.notify)A.notify('Purchased '+it.name);}renderBar();renderShop();changed();};}
    else if(it.power){const eq=m.power===it.power;btn.textContent=eq?'Equipped':'Equip';btn.disabled=eq;
      btn.onclick=async()=>{const j=await api('equip',{power:it.power});if(j.ok){A.me=j.me;}renderBar();renderShop();changed();};}
    else{btn.textContent='Owned';btn.disabled=true;}
    row.appendChild(btn);L.appendChild(row);
  }
  drawPreview($('pfPrev'),profileSkin?profileSkin.cv:null);
  if(!profileSkin&&m.hasSkin){const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(im,0,0);drawPreview($('pfPrev'),c);};im.src=A.skinUrl(m.un,m.skv);}
}
async function init(){
  wire();
  let token=null;try{token=localStorage.getItem(LS);}catch(e){}
  if(token){A.token=token;const j=await api('me');if(j.ok){setSession(token,j.me);enterMenu();claimDaily(true);return;}A.token=null;try{localStorage.removeItem(LS);}catch(e){}}
  showAuth();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
