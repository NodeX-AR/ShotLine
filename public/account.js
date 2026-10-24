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
A.nameHTML=function(name,col,tag,lv){
  let h='';
  if(lv>0)h+='<span class="lvb t'+(lv>=50?50:lv>=40?40:lv>=30?30:lv>=20?20:lv>=10?10:0)+'">'+(lv|0)+'</span>';
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
A.setMe=function(m){A.me=m;renderBar();renderShop();changed();};
A.refresh=async function(){if(!A.token)return;const j=await api('me');if(j.ok)A.setMe(j.me);};
function changed(){A.listeners.forEach(f=>{try{f(A);}catch(e){console.warn(e);}});}
function say(m,bad){const el=$('authMsg');if(el){el.textContent=m||'';el.style.color=bad?'#ff8a8a':'';}if(A.notify&&m&&!bad)A.notify(m);}
async function api(path,body,method){
  const h={'content-type':'application/json','accept':'application/json'};if(A.token)h.authorization='Bearer '+A.token;
  try{
    const r=await fetch(new URL('/api/'+path,window.location.origin).href,{
      method:method||(body===undefined?'GET':'POST'),headers:h,
      body:body===undefined?undefined:JSON.stringify(body),credentials:'same-origin',cache:'no-store'
    });
    const type=(r.headers.get('content-type')||'').toLowerCase();
    let j=null;
    if(type.includes('application/json')){try{j=await r.json();}catch(e){}}
    if(j&&typeof j==='object')return j;
    if(!r.ok)return {ok:false,error:'Account service returned HTTP '+r.status+'. Check the deployed /api worker and database.'};
    return {ok:false,error:'Account service did not return JSON. The /api route may be missing or serving the website page instead.'};
  }catch(e){
    return {ok:false,error:'Could not connect to the account service. Check your connection and that the game API is deployed.'};
  }
}
A.api=api;
A.skinUrl=(un,v)=>'/api/skin/'+encodeURIComponent(un)+'?v='+(v||0);
A.identity=function(){
  const m=A.me;
  if(!m)return {guest:true};
  return {guest:false,name:m.un,col:m.col,tag:m.tag,level:m.level,slim:m.skm==='slim',skin:m.hasSkin?A.skinUrl(m.un,m.skv):null,power:m.power};
};
function setSession(token,me){A.token=token;A.me=me;A.guest=!me;try{if(token)localStorage.setItem(LS,token);else localStorage.removeItem(LS);}catch(e){}renderBar();renderShop();changed();}
A.logout=async function(){if(A.token)await api('logout',{});setSession(null,null);showAuth();};

/* ---------- screens ---------- */
function show(id){for(const x of ['authChoice','authLoginForm','authSignupForm','authResetForm','authRecovery'])$(x).classList.toggle('hidden',x!==id);say('');}
function showAuth(){$('auth').classList.remove('hidden');$('menu').classList.add('hidden');show('authChoice');}
function enterMenu(){$('auth').classList.add('hidden');$('menu').classList.remove('hidden');}
A.showAuth=showAuth;

const SVGC='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.6h-3a1.8 1.8 0 0 0 0 3.6h4.2"/></svg>';
let skinCache={key:'',cv:null};
function withSkin(cb){
  const m=A.me;if(!m){cb(null);return;}const key=m.un+'|'+m.skv+'|'+m.hasSkin;
  if(skinCache.key===key&&skinCache.cv){cb(skinCache.cv);return;}
  const done=cv=>{skinCache={key,cv};cb(cv);};
  if(m.hasSkin){const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{try{done(window.SOLDIER_GEN.normalizeSkin(im));}catch(e){done(window.SOLDIER_GEN.defaultSkin(m.un));}};im.onerror=()=>done(window.SOLDIER_GEN.defaultSkin(m.un));im.src=A.skinUrl(m.un,m.skv);}
  else done(window.SOLDIER_GEN.defaultSkin(m.un));
}
function drawHead(cv,skin){const g=cv.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,cv.width,cv.height);if(!skin)return;g.drawImage(skin,8,8,8,8,0,0,cv.width,cv.height);g.drawImage(skin,40,8,8,8,0,0,cv.width,cv.height);}
function renderOperator(){
  const el=$('opCard');if(!el)return;const m=A.me;
  if(!m){el.innerHTML='<div class="eyebrow">Operator</div><div class="op-guest"><b>Guest</b><span>Guests can play, but coins, levels and the shop need an account.</span><button class="chip" id="opLogin">Log in / Sign up</button></div>';
    const b=$('opLogin');if(b)b.onclick=showAuth;return;}
  const lv=m.level||1,span=Math.max(1,m.xpNext-m.xpThis),pc=Math.min(100,Math.max(0,(m.xp-m.xpThis)/span*100));
  const pw={heal:'Healing Ring',poison:'Poison Ring',dash:'Dash',shield:'Shield Pulse',spectral:'Spectral Arrow',frost:'Frost Nova',adrenaline:'Adrenaline'}[m.power]||'None equipped';
  el.innerHTML='<div class="eyebrow">Operator</div><div class="op-top"><div class="op-av" aria-hidden="true">'+(m.un||'?')[0].toUpperCase()+'</div><div class="op-info"><div class="op-name">'+A.nameHTML(m.un,m.col,m.tag,lv)+'</div><div class="op-title">'+m.title+' · Level '+lv+'</div><div class="bar"><i style="width:'+pc.toFixed(1)+'%;background:linear-gradient(90deg,var(--accent),var(--gold))"></i></div><small>'+Math.max(0,m.xpNext-m.xp).toLocaleString()+' XP to level '+(lv+1)+'</small></div></div>'+
   '<div class="op-stats"><div><b>'+(m.kills||0).toLocaleString()+'</b><span>Kills</span></div><div><b>'+fmtTime(m.playsec||0)+'</b><span>Played</span></div><div><b>'+m.money.toLocaleString()+'</b><span>Coins</span></div></div>'+
   '<div class="op-load"><div class="lo"><span>Power</span><b>'+pw+'</b></div><div class="lo"><span>Fox</span><b>'+((m.items||[]).includes('pet_buddy')?'Ready':'Not owned')+'</b></div></div>'+
   '<button class="chip" id="opShop">Open shop &amp; profile</button>';
  const sb=$('opShop');if(sb)sb.onclick=()=>{const t=document.querySelector('.tab-btn[data-tab="shop"]');if(t)t.click();};
}
function renderBar(){
  const bar=$('acctBar');if(!bar)return;const m=A.me,nm=$('name');
  if(!m){bar.innerHTML='<span class="who">Guest</span><button class="chip" id="barLogin">Log in / Sign up</button>';
    const b=$('barLogin');if(b)b.onclick=showAuth;if(nm){nm.readOnly=false;}renderOperator();return;}
  bar.innerHTML='<span class="av" aria-hidden="true">'+(m.un||'?')[0].toUpperCase()+'</span><span class="who">'+A.nameHTML(m.un,m.col,m.tag,m.level)+'</span>'+
    '<span class="coins">'+SVGC+'<b id="coinNum">'+m.money.toLocaleString()+'</b></span>'+
    '<button class="chip ghost" id="barOut">Log out</button>';
  $('barOut').onclick=A.logout;
  if(nm){nm.value=m.un;nm.readOnly=true;}
  const mp=$('mpPower');if(mp)mp.textContent=m.power?('Online power: '+({heal:'Healing Ring',poison:'Poison Ring',dash:'Dash',shield:'Shield Pulse',spectral:'Spectral Arrow',frost:'Frost Nova',adrenaline:'Adrenaline'}[m.power]||m.power)):'Online power: none equipped (see Shop)';
  renderOperator();
}
A.setCoins=function(total){if(A.me){A.me.money=total;const n=$('coinNum');if(n)n.textContent=total.toLocaleString();renderShop();renderOperator();}};

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
  $('authLoginForm').onsubmit=async e=>{e.preventDefault();const btn=$('authLoginForm').querySelector('[type="submit"]');if(btn&&btn.disabled)return;
    if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='Signing in…';}
    say('Signing in…');
    try{const j=await api('login',{un:$('liUn').value.trim(),pw:$('liPw').value});
      if(!j.ok){say(j.error||'Login failed',true);return;}
      if(!j.token||!j.me){say('The server response was incomplete. Please try again.',true);return;}
      setSession(j.token,j.me);enterMenu();claimDaily(true);
    }finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'Log in';}}
  };
  $('authSignupForm').onsubmit=async e=>{e.preventDefault();const btn=$('authSignupForm').querySelector('[type="submit"]');if(btn&&btn.disabled)return;
    if($('suPw').value!==$('suPw2').value){say('Passwords do not match',true);return;}
    if($('suPw').value.length<6||$('suPw').value.length>64){say('Password must be 6–64 characters.',true);return;}
    if(btn){btn.disabled=true;btn.dataset.oldText=btn.textContent;btn.textContent='Creating account…';}
    say('Creating account…');
    try{const j=await api('signup',{un:$('suUn').value.trim(),pw:$('suPw').value});
      if(!j.ok){say(j.error||'Sign-up failed',true);return;}
      if(!j.token||!j.me||!j.recovery){say('The server response was incomplete. Please try again.',true);return;}
      setSession(j.token,j.me);$('recCode').textContent=j.recovery;show('authRecovery');
    }finally{if(btn){btn.disabled=false;btn.textContent=btn.dataset.oldText||'Create account';}}
  };
  $('recDone').onclick=()=>{enterMenu();claimDaily(true);};
  $('authResetForm').onsubmit=async e=>{e.preventDefault();say('Resetting…');
    const j=await api('reset',{un:$('rsUn').value.trim(),code:$('rsCode').value.trim(),pw:$('rsPw').value});
    if(!j.ok){say(j.error||'Reset failed',true);return;}show('authLoginForm');say('Password changed — log in with the new one.');};
  $('dailyBtn').onclick=()=>claimDaily(false);
  $('colApplySolid').onclick=()=>setColor($('colSolid').value);
  $('colApplyGrad').onclick=()=>setColor('g:'+$('colG1').value+','+$('colG2').value);
  $('colSolid').oninput=()=>{pick=$('colSolid').value;previewName();};
  const gp=()=>{pick='g:'+$('colG1').value+','+$('colG2').value;previewName();};$('colG1').oninput=gp;$('colG2').oninput=gp;
  const ls=document.querySelectorAll('[data-tab="ranks"] .seg [data-by]');ls.forEach(b=>b.onclick=()=>{ls.forEach(x=>x.classList.toggle('on',x===b));loadBoard(b.dataset.by);});
  $('lbRefresh').onclick=()=>loadBoard(lbBy);
  const rt=document.querySelector('.tab-btn[data-tab="ranks"]');if(rt)rt.addEventListener('click',()=>loadBoard(lbBy));
  $('colClear').onclick=()=>setColor(null);
}
let lbBy='kills';
async function loadBoard(by){
  lbBy=by||lbBy;const L=$('lbList');L.innerHTML='<p class="modes">Loading…</p>';
  const j=await api('leaderboard?by='+lbBy);
  if(!j.ok){L.innerHTML='<p class="modes">Leaderboard unavailable right now.</p>';return;}
  if(!j.list.length){L.innerHTML='<p class="modes">No ranked players yet — be the first.</p>';}
  else L.innerHTML=j.list.map(r=>'<div class="r'+(r.rank<=3?' p'+r.rank:'')+(A.me&&A.me.un===r.un?' me':'')+'"><span class="rk">'+r.rank+'</span><span>'+A.nameHTML(r.un,r.col,r.tag,r.level)+'</span><span class="val">'+(lbBy==='time'?fmtTime(r.playsec):r.kills.toLocaleString())+'</span><span class="rk">'+(lbBy==='time'?'':'kills')+'</span></div>').join('');
  const me=$('lbMe');me.textContent=j.me?('You: #'+j.me.rank+' · level '+j.me.level+' · '+j.me.kills.toLocaleString()+' kills · '+fmtTime(j.me.playsec)):(A.me?'':'Log in to see your rank.');
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
  {id:'pw_shield',name:'Shield Pulse',desc:'Absorb up to 30 damage for 3 s. 60 s cooldown.',price:25000,power:'shield'},
  {id:'pw_spectral',name:'Spectral Arrow',desc:'Fire a glowing arrow: enemies within 7 m of where it lands glow through walls for 8 s. 40 s cooldown.',price:20000,power:'spectral'},
  {id:'pw_frost',name:'Frost Nova',desc:'Freeze the ground in 5 m: enemies take 8 damage and move at 55% speed for 3 s. 45 s cooldown.',price:20000,power:'frost'},
  {id:'pw_adrenaline',name:'Adrenaline',desc:'+35% move speed for 4.5 s and heal 10 HP. 50 s cooldown.',price:12000,power:'adrenaline'},
  {id:'pet_buddy',name:'Buddy Drone (pet)',desc:'Follows you, soaks bullets, heals 2 HP/s and restocks grenades (hold up to 3). If it is destroyed in a match it is lost until you buy it again.',price:30000,pet:true}
];
const SOLIDS=['#ffffff','#c0c8d0','#ff4d4d','#ff8a3d','#ffc94d','#ffe14d','#a6ff4d','#43e0a0','#2ec4b6','#4de3ff','#3a8dff','#8a5cff','#b06cff','#ff7ac8','#ff3d9a','#e0e0ff'];
const GRADS=[['#ff3d6e','#ffb347'],['#ff8a3d','#ffe14d'],['#43e0a0','#4de3ff'],['#4de3ff','#b06cff'],['#b06cff','#ff7ac8'],['#ff4d4d','#ffc94d'],['#a6ff4d','#2ec4b6'],['#3a8dff','#43e0a0'],['#ffe14d','#ff3d9a'],['#ffffff','#4d9bff']];
const IC={col_solid:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',col_grad:'<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M6.5 14h11"/>',pw_heal:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',pw_poison:'<path d="M12 3c4 0 7 3 7 7 0 2-1 3.5-2 4.5V18H7v-3.5C6 13.5 5 12 5 10c0-4 3-7 7-7z"/><circle cx="9.5" cy="11" r="1"/><circle cx="14.5" cy="11" r="1"/>',pw_dash:'<path d="M5 6l6 6-6 6M13 6l6 6-6 6"/>',pw_shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',pw_spectral:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',pw_frost:'<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',pw_adrenaline:'<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',pet_buddy:'<circle cx="12" cy="12" r="4"/><path d="M3 12h3M18 12h3M12 3v3M12 18v3"/>'};
let pick=null;   // currently previewed colour string
function fmtTime(s){const h=Math.floor(s/3600),m=Math.floor(s%3600/60);return h?h+'h '+m+'m':m+'m';}
function previewName(){
  const m=A.me;if(!m)return;const c=pick!==null?pick:m.col;
  $('shopPreview').innerHTML=A.nameHTML(m.un,c,m.tag,m.level);
  $('pvChat').innerHTML='<b>'+A.nameHTML(m.un,c,m.tag,m.level)+':</b> Rush B, I\'ll cover you!';
}
function renderSwatches(owned){
  const hasSolid=owned.has('col_solid')||owned.has('col_grad'),hasGrad=owned.has('col_grad');
  const S=$('swSolid'),G=$('swGrad');S.innerHTML='';G.innerHTML='';
  SOLIDS.forEach(c=>{const b=document.createElement('button');b.className='sw'+(pick===c||(!pick&&A.me.col===c)?' on':'')+(hasSolid?'':' lock');b.style.background=c;b.setAttribute('aria-label','Colour '+c);
    b.onclick=()=>{pick=c;$('colSolid').value=c;renderSwatches(owned);previewName();};S.appendChild(b);});
  GRADS.forEach(p=>{const v='g:'+p[0]+','+p[1];const b=document.createElement('button');b.className='sw'+(pick===v||(!pick&&A.me.col===v)?' on':'')+(hasGrad?'':' lock');b.style.background='linear-gradient(90deg,'+p[0]+','+p[1]+')';b.setAttribute('aria-label','Gradient');
    b.onclick=()=>{pick=v;$('colG1').value=p[0];$('colG2').value=p[1];renderSwatches(owned);previewName();};G.appendChild(b);});
  $('colApplySolid').disabled=!hasSolid;$('colApplyGrad').disabled=!hasGrad;
  $('colLock').textContent=hasGrad?'':(hasSolid?'Gradients unlock with the Gradient name colour (100,000 coins). You can still preview them.':'Preview any style, then unlock it under Unlocks below (solid 10,000 · gradient 100,000 coins).');
}
function renderShop(){
  const m=A.me;$('shopGuest').classList.toggle('hidden',!!m);$('shopBody').classList.toggle('hidden',!m);if(!m)return;
  $('dailyBtn').disabled=!m.dailyReady;$('dailyBtn').textContent=m.dailyReady?'Claim daily reward':'Come back tomorrow';
  $('dailyInfo').textContent='Streak: '+m.streak+' day'+(m.streak===1?'':'s')+' · +10 coins, growing to +50';
  { const lv=m.level||1,span=Math.max(1,m.xpNext-m.xpThis),pc=Math.min(100,Math.max(0,(m.xp-m.xpThis)/span*100));$('lvNum').textContent=lv;$('lvTitle').textContent=m.title+' · '+fmtTime(m.playsec||0)+' played';$('lvBar').style.width=pc+'%';$('lvText').textContent=(m.kills||0).toLocaleString()+' kills · '+m.xp.toLocaleString()+' XP · '+Math.max(0,m.xpNext-m.xp).toLocaleString()+' XP to level '+(lv+1);}
  pick=null;
  $('pfSlim').checked=m.skm==='slim';
  const owned=new Set(m.items);
  renderSwatches(owned);previewName();
  const L=$('powerList');L.innerHTML='';
  for(const it of SHOP){
    const row=document.createElement('div');row.className='shop-item';
    const has=owned.has(it.id);
    row.className='shop-item'+(has?' owned':'');
    row.innerHTML='<div class="si-ic"><svg viewBox="0 0 24 24" aria-hidden="true">'+(IC[it.id]||'')+'</svg></div><div class="si-body"><b>'+esc(it.name)+'</b><small>'+esc(it.desc)+'</small></div>';
    const btn=document.createElement('button');btn.className='chip';
    if(!has){btn.textContent=it.price.toLocaleString()+' coins';btn.disabled=m.money<it.price;
      btn.onclick=async()=>{btn.disabled=true;const j=await api('buy',{item:it.id});if(!j.ok){if(A.notify)A.notify(j.error||'Purchase failed');}else{A.me=j.me;if(A.notify)A.notify('Purchased '+it.name);}renderBar();renderShop();changed();};}
    else if(it.power){const eq=m.power===it.power;btn.textContent=eq?'Equipped':'Equip';btn.disabled=eq;
      btn.onclick=async()=>{const j=await api('equip',{power:it.power});if(j.ok){A.me=j.me;}renderBar();renderShop();changed();};}
    else{btn.textContent='Owned';btn.disabled=true;}
    row.appendChild(btn);L.appendChild(row);
  }
  withSkin(cv=>drawPreview($('pfPrev'),profileSkin?profileSkin.cv:cv));
  if(false&&!profileSkin&&m.hasSkin){const im=new Image();im.crossOrigin='anonymous';im.onload=()=>{const c=document.createElement('canvas');c.width=c.height=64;c.getContext('2d').drawImage(im,0,0);drawPreview($('pfPrev'),c);};im.src=A.skinUrl(m.un,m.skv);}
}
async function init(){
  wire();
  let token=null;try{token=localStorage.getItem(LS);}catch(e){}
  if(token){A.token=token;const j=await api('me');if(j.ok){setSession(token,j.me);enterMenu();claimDaily(true);return;}A.token=null;try{localStorage.removeItem(LS);}catch(e){}}
  showAuth();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
