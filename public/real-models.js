/* real-models.js — rebuilds the embedded tactical soldier + fox (tactical-data.js / fox-data.js) with three.js.
   No model files are loaded: geometry, skin weights and textures live inside the data scripts. */
(function(){
'use strict';
const TAU=Math.PI*2,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),ease=p=>p*p*(3-2*p);

function dec(b64,T){const bin=atob(b64),n=bin.length,u=new Uint8Array(n);for(let i=0;i<n;i++)u[i]=bin.charCodeAt(i);return new T(u.buffer);}
const texCache={};
function loadTex(THREE,url,srgb,key){
  if(texCache[key])return texCache[key];
  const t=new THREE.Texture();t.flipY=false;t.encoding=srgb?THREE.sRGBEncoding:THREE.LinearEncoding;t.anisotropy=4;
  const im=new Image();im.onload=()=>{t.image=im;t.needsUpdate=true;};im.src=url;texCache[key]=t;return t;
}
const geoCache={};
function buildGeo(THREE,D){
  if(geoCache[D.name])return geoCache[D.name];
  const V=D.verts,lo=D.lo,hi=D.hi,q=dec(D.pos,Uint16Array),uv=dec(D.uv,Uint16Array),nr=dec(D.nor,Int8Array),idx=dec(D.idx,Uint16Array),si=dec(D.si,Uint8Array),sw=dec(D.sw,Uint8Array);
  const pos=new Float32Array(V*3),uvs=new Float32Array(V*2),nor=new Float32Array(V*3),sIdx=new Uint16Array(V*4),sWt=new Float32Array(V*4);
  for(let i=0;i<V;i++){for(let k=0;k<3;k++){pos[i*3+k]=lo[k]+q[i*3+k]/65535*(hi[k]-lo[k]);nor[i*3+k]=nr[i*3+k]/127;}
    uvs[i*2]=uv[i*2]/65535;uvs[i*2+1]=uv[i*2+1]/65535;
    let s=0;for(let k=0;k<4;k++){sIdx[i*4+k]=si[i*4+k];sWt[i*4+k]=sw[i*4+k]/255;s+=sWt[i*4+k];}
    if(s>0)for(let k=0;k<4;k++)sWt[i*4+k]/=s;else sWt[i*4]=1;}
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('normal',new THREE.BufferAttribute(nor,3));g.setAttribute('uv',new THREE.BufferAttribute(uvs,2));
  g.setAttribute('skinIndex',new THREE.BufferAttribute(sIdx,4));g.setAttribute('skinWeight',new THREE.BufferAttribute(sWt,4));
  g.setIndex(new THREE.BufferAttribute(idx,1));g.computeBoundingSphere();g.computeBoundingBox();
  geoCache[D.name]=g;return g;
}
/* skeleton with identity rest rotations: bone offset = joint - parent joint */
function buildRig(THREE,D,prefix,extra){
  const bones=[],map={};
  const list=D.bones.concat(extra||[]);
  for(const b of list){const bone=new THREE.Bone();bone.name=prefix+b.n;map[b.n]=bone;bones.push(bone);}
  list.forEach(b=>{const bone=map[b.n];if(b.p){const pj=list.find(x=>x.n===b.p).j;bone.position.set(b.j[0]-pj[0],b.j[1]-pj[1],b.j[2]-pj[2]);map[b.p].add(bone);}else bone.position.set(b.j[0],b.j[1],b.j[2]);});
  return {bones,map,root:bones[0]};
}
function buildMesh(THREE,D,rig,opt){
  opt=opt||{};
  const mat=new THREE.MeshStandardMaterial({map:loadTex(THREE,D.tex,true,D.name+'.c'),normalMap:D.nrm?loadTex(THREE,D.nrm,false,D.name+'.n'):null,roughness:opt.roughness===undefined?0.82:opt.roughness,metalness:opt.metalness||0,side:THREE.FrontSide,skinning:true});
  if(mat.normalMap)mat.normalScale.set(opt.normalScale||0.6,opt.normalScale||0.6);
  const mesh=new THREE.SkinnedMesh(buildGeo(THREE,D),mat);mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;
  mesh.add(rig.root);rig.root.updateMatrixWorld(true);
  const skel=new THREE.Skeleton(rig.bones.slice(0,D.bones.length));mesh.bind(skel,new THREE.Matrix4());
  return mesh;
}

/* ===================== SOLDIER ===================== */
function dataFor(kind){return ({male:window.MALE_DATA,female:window.FEMALE_DATA,robot:window.ROBOT_DATA})[kind||'male']||window.MALE_DATA||window.TACTICAL_DATA;}
function buildSoldier(THREE,kind){
  const D=dataFor(kind);if(!D)return null;
  const rig=buildRig(THREE,D,'mixamorig',[{n:'HeadTop_End',p:'Head',j:[D.bones.find(b=>b.n==='Head').j[0],D.bones.find(b=>b.n==='Head').j[1]+0.26,D.bones.find(b=>b.n==='Head').j[2]+0.02]}]);
  const mesh=buildMesh(THREE,D,rig,{roughness:0.78,metalness:0.0,normalScale:0.7});
  const root=new THREE.Group();root.name='Character';root.add(rig.root);root.add(mesh);
  const hips=rig.map.Hips.position.clone();
  const _e=new THREE.Euler(),_q=new THREE.Quaternion();const q=(x,y,z)=>{_e.set(x||0,y||0,z||0,'XYZ');return _q.setFromEuler(_e).clone();};
  const hv=(x,y)=>new THREE.Vector3(hips.x+(x||0),hips.y+(y||0),hips.z);
  function clip(name,dur,frames,fn){const times=[],qT={},pT={};for(let i=0;i<=frames;i++)times.push(i/frames*dur);
    for(let i=0;i<=frames;i++){const pose=fn(i/frames);for(const bn in pose){const v=pose[bn];if(v.isQuaternion)(qT[bn]||(qT[bn]=[])).push(v.x,v.y,v.z,v.w);else(pT[bn]||(pT[bn]=[])).push(v.x,v.y,v.z);}}
    const tracks=[];for(const bn in qT)tracks.push(new THREE.QuaternionKeyframeTrack('mixamorig'+bn+'.quaternion',times.slice(),qT[bn]));
    for(const bn in pT)tracks.push(new THREE.VectorKeyframeTrack('mixamorig'+bn+'.position',times.slice(),pT[bn]));return new THREE.AnimationClip(name,dur,tracks);}
  const idle=clip('Idle',4.8,60,(t)=>{
    const br=Math.sin(t*TAU/2.4),sw=Math.sin(t*TAU/4.8),mi=Math.sin(t*TAU/3.1);
    return {Spine2:q(br*0.014,sw*0.02,sw*0.018),Spine1:q(br*0.006,sw*0.012,sw*0.01),Neck:q(-br*0.008,mi*0.03,0),Head:q(-br*0.012,mi*0.05+sw*0.02,sw*0.01),
      RightArm:q(0,0,-0.03+sw*0.012),LeftArm:q(0,0,0.03-sw*0.012),RightForeArm:q(0.1,0,0),LeftForeArm:q(0.1,0,0),Hips:hv(sw*0.004,br*0.002)};});
  const walk=clip('Walk',1.0,48,(t)=>{
    const ph=t*TAU,sn=Math.sin(ph),cs=Math.cos(ph);
    const sL=sn*0.58,sR=-sn*0.58,bL=Math.max(0,-cs)*0.62,bR=Math.max(0,cs)*0.62,aR=sn*0.45,aL=-sn*0.45,tw=sn*0.09;
    return {LeftUpLeg:q(-sL,0,0.02),LeftLeg:q(bL,0,0),LeftFoot:q(sL*0.25-bL*0.2,0,0),RightUpLeg:q(-sR,0,-0.02),RightLeg:q(bR,0,0),RightFoot:q(sR*0.25-bR*0.2,0,0),
      RightArm:q(aR,0,-0.03),LeftArm:q(aL,0,0.03),RightForeArm:q(0.18+Math.max(0,aR)*0.5,0,0),LeftForeArm:q(0.18+Math.max(0,aL)*0.5,0,0),
      Hips:hv(Math.sin(ph)*0.012,-0.012+Math.abs(cs)*0.026),Spine:q(0.03,tw*0.8,sn*0.025),Spine1:q(0,-tw*0.6,0),Spine2:q(0.02,-tw*0.5,-sn*0.02),Head:q(-0.03,tw*0.8,0)};});
  const run=clip('Run',0.62,48,(t)=>{
    const ph=t*TAU,sn=Math.sin(ph),cs=Math.cos(ph),sL=sn*1.05,sR=-sn*1.05;
    const bL=Math.max(0,-cs)*1.55+Math.max(0,sn)*0.2,bR=Math.max(0,cs)*1.55+Math.max(0,-sn)*0.2,aR=sn*0.62,aL=-sn*0.62,tw=sn*0.2;
    return {LeftUpLeg:q(-sL,0,0.03),LeftLeg:q(bL,0,0),LeftFoot:q(sL*0.3-bL*0.25+0.1,0,0),RightUpLeg:q(-sR,0,-0.03),RightLeg:q(bR,0,0),RightFoot:q(sR*0.3-bR*0.25+0.1,0,0),
      RightArm:q(aR,0,-0.05),LeftArm:q(aL,0,0.05),RightForeArm:q(0.75+Math.max(0,aR)*0.35,0,0),LeftForeArm:q(0.75+Math.max(0,aL)*0.35,0,0),
      Hips:hv(sn*0.018,-0.05+Math.abs(Math.sin(ph))*0.06),Spine:q(0.2,tw*0.7,sn*0.05),Spine1:q(0.05,-tw*0.9,-sn*0.03),Spine2:q(0.05,-tw*0.6,0),Neck:q(-0.1,0,0),Head:q(-0.12,tw*0.5,-sn*0.03)};});
  return {scene:root,animations:[idle,walk,run],bones:rig.map,hipsY:hips.y};
}
try{window.__charPref=localStorage.getItem('shotline.char')==='female'?'female':'male';}catch(e){window.__charPref='male';}
window.TACTICAL_GEN={build:(kind)=>buildSoldier(window.THREE,kind),ready:(kind)=>!!dataFor(kind),kinds:()=>['male','female','robot'].filter(k=>!!dataFor(k)&&({male:window.MALE_DATA,female:window.FEMALE_DATA,robot:window.ROBOT_DATA})[k])};

/* ===================== FOX ===================== */
const STUNTS={flip:0.95,spin:0.8,jump:0.75,sit:2.4,bow:1.7,howl:2.3,pounce:1.3,dance:1.8};
function createFox(THREE,opt){
  opt=opt||{};const D=window.FOX_DATA;
  const g=new THREE.Group(),pivot=new THREE.Group(),inner=new THREE.Group();g.add(pivot);pivot.add(inner);
  const PY=0.27;pivot.position.y=PY;inner.position.y=-PY;inner.rotation.y=Math.PI;      // model faces +z → game convention faces -z
  const orange=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.9,metalness:0});
  const carry=new THREE.Mesh(new THREE.SphereGeometry(0.045,10,8),new THREE.MeshStandardMaterial({color:0x35422f,roughness:0.55,metalness:0.35}));carry.visible=false;
  let B={},mesh=null;
  if(D){
    const rig=buildRig(THREE,D,'fx_');B=rig.map;mesh=buildMesh(THREE,D,rig,{roughness:0.92,metalness:0,normalScale:0.3});
    mesh.material.dispose();mesh.material=Object.assign(orange,{map:loadTex(THREE,D.tex,true,D.name+'.c'),normalMap:loadTex(THREE,D.nrm,false,D.name+'.n')});orange.normalScale.set(0.3,0.3);orange.skinning=true;orange.needsUpdate=true;
    inner.add(rig.root);inner.add(mesh);
    carry.position.set(0,-0.045,0.2);B.Head.add(carry);
  }
  const sh=new THREE.Mesh(new THREE.CircleGeometry(0.34,20),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.3,depthWrite:false}));sh.rotation.x=-Math.PI/2;sh.position.y=0.012;sh.scale.set(0.7,1.2,1);g.add(sh);
  const legs=D?[{u:B.FL_Up,l:B.FL_Low,p:B.FL_Paw,front:1},{u:B.FR_Up,l:B.FR_Low,p:B.FR_Paw,front:1},{u:B.BL_Up,l:B.BL_Low,p:B.BL_Paw,front:0},{u:B.BR_Up,l:B.BR_Low,p:B.BR_Paw,front:0}]:[];
  const tail=D?[B.Tail1,B.Tail2,B.Tail3]:[];
  const st={ph:0,t:0,idleT:Math.random()*10,stunt:null,sp:0,sd:1,speed:0,sitBlend:0};
  function play(n,dur){if(STUNTS[n]){st.stunt=n;st.sp=0;st.sd=dur||STUNTS[n];}}
  // old-frame angles (+ = forward) → model frame (+z forward ⇒ forward swing is negative x)
  function leg(l,hip,knee){if(!l.u)return;l.u.rotation.x=-hip;l.l.rotation.x=-knee;l.p.rotation.x=(hip+knee)*0.55;}
  function update(dt,o){
    o=o||{};if(!D)return;const speed=o.speed||0;st.t+=dt;st.speed+=(speed-st.speed)*Math.min(1,dt*8);const sp=st.speed;
    let by=0,pitch=0,roll=0,yaw=0,zOff=0,headX=0,headY=0,tailLift=0,wag=1;
    let sn=null,p=0;if(st.stunt){st.sp+=dt;p=clamp(st.sp/st.sd,0,1);sn=st.stunt;if(p>=1){st.stunt=null;sn=null;}}
    const gal=sp>4.6,fr=sp>0.15?clamp(sp*0.62,1.2,6):0;if(sp>0.15)st.ph+=dt*fr*TAU*(gal?0.78:0.9);
    const ph=st.ph,moving=sp>0.15&&!sn;
    let spine=0;
    if(moving){
      const amp=clamp(0.3+sp*0.07,0.3,0.78),offs=gal?[0,0.45,Math.PI,Math.PI+0.45]:[0,Math.PI,Math.PI,0];
      legs.forEach((l,i)=>{const a=ph+offs[i],swg=Math.sin(a)*amp,lift=Math.max(0,Math.cos(a));leg(l,swg*(l.front?1:0.9)*(gal?1.15:1),(lift*(l.front?0.95:1.2)+0.05)*(gal?1.3:1));});
      if(gal){pitch=Math.sin(ph)*0.12;by=0.02+Math.abs(Math.sin(ph))*0.07;spine=Math.sin(ph)*0.22;}else{by=Math.abs(Math.sin(ph*2))*0.014;roll=Math.sin(ph)*0.03;yaw=Math.sin(ph)*0.04;spine=Math.sin(ph)*0.08;}
      st.sitBlend*=0.8;
    }else if(!sn){
      st.idleT+=dt;const calm=sp<0.15,sit=calm&&(o.sit||st.idleT%24>16)?1:0;st.sitBlend+=(sit-st.sitBlend)*Math.min(1,dt*3);
      const sb=ease(clamp(st.sitBlend,0,1)),br=Math.sin(st.t*2.2)*0.004;
      legs.forEach(l=>{const f=l.front;leg(l,f?-0.04-sb*0.1:sb*1.25,f?0.05:-sb*1.5-0.05);});
      pitch=sb*0.62;by=-sb*0.1+br;headX=-sb*0.5;wag=1+sb*0.2;
    }
    if(sn){
      const e=ease(p),arc=Math.sin(p*Math.PI);
      const front=(h,k)=>legs.forEach(l=>{if(l.front)leg(l,h,k);}),back=(h,k)=>legs.forEach(l=>{if(!l.front)leg(l,h,k);});
      if(sn==='flip'){const crouch=p<0.14?ease(p/0.14):0,air=clamp((p-0.14)/0.78,0,1);by=-0.1*crouch+Math.sin(air*Math.PI)*0.85;pitch=air*TAU;
        const tuck=Math.sin(air*Math.PI);front(-0.9*tuck,-1.1*tuck);back(0.9*tuck,-1.3*tuck);tailLift=tuck*0.5;headX=-0.3*tuck;wag=2;
        if(crouch>0&&air===0){front(-0.4*crouch,-0.5*crouch);back(0.5*crouch,-0.9*crouch);}}
      else if(sn==='spin'){const air=Math.sin(p*Math.PI);by=air*0.34;yaw=e*TAU*1.5;roll=Math.sin(p*TAU*1.5)*0.16;front(0.7*air,-0.6*air);back(-0.7*air,-0.9*air);tailLift=0.3;wag=2.5;}
      else if(sn==='jump'){by=arc*0.55;pitch=Math.sin(p*Math.PI*2)*-0.3+(p<0.5?0.3:-0.2);front(0.9*arc,-0.3*arc);back(-0.9*arc,-0.4*arc);wag=2;}
      else if(sn==='sit'||sn==='howl'){const b=ease(clamp(p/0.2,0,1))*(1-ease(clamp((p-0.85)/0.15,0,1)));front(-0.08,0.1);back(1.25*b,-1.5*b);pitch=0.62*b;by=-0.1*b;
        headX=sn==='howl'?(-0.5-0.85*Math.sin(clamp((p-0.2)/0.2,0,1)*Math.PI*0.5)*(p<0.85?1:0))*b:-0.5*b;headY=sn==='sit'?Math.sin(st.t*1.4)*0.5*b:0;wag=0.6;}
      else if(sn==='bow'){const b=ease(clamp(p/0.2,0,1))*(1-ease(clamp((p-0.85)/0.15,0,1)));front(0.9*b,-1.3*b);back(-0.15*b,0.2*b);pitch=-0.5*b;by=-0.07*b;headX=0.6*b;wag=5;tailLift=0.7*b;}
      else if(sn==='pounce'){const crouch=ease(clamp(p/0.35,0,1))*(1-ease(clamp((p-0.35)/0.1,0,1))),leap=clamp((p-0.35)/0.4,0,1),land=clamp((p-0.75)/0.25,0,1);
        zOff=-0.8*Math.sin(clamp((p-0.35)/0.65,0,1)*Math.PI*0.5)*(1-ease(land));by=-0.12*crouch+Math.sin(leap*Math.PI)*0.4;pitch=-0.25*crouch+Math.sin(leap*Math.PI)*0.35;
        front(0.8*Math.sin(leap*Math.PI)-0.3*crouch,-0.5*crouch);back(-0.8*Math.sin(leap*Math.PI)+0.4*crouch,-1*crouch);wag=crouch*6+1;}
      else if(sn==='dance'){const b=Math.sin(p*Math.PI),bt=st.t*9;by=Math.abs(Math.sin(bt))*0.1*b;yaw=Math.sin(bt*0.5)*0.5*b;roll=Math.sin(bt)*0.12*b;pitch=Math.sin(bt*0.5)*0.1*b+0.35*b;
        front(-0.5*b+Math.sin(bt)*0.5*b,-0.6*b);back(0.5*b,-0.5*b);wag=4;headY=Math.sin(bt)*0.35*b;}
    }
    pivot.position.y=PY+by;pivot.position.z=zOff;pivot.rotation.set(pitch,yaw,roll,'YXZ');
    B.Spine1.rotation.set(-spine*0.5,spine*0.4,0);B.Spine2.rotation.set(spine*0.4,-spine*0.3,0);
    B.Neck.rotation.set(-headX*0.5,headY*0.4,0);B.Head.rotation.set(-headX*0.7+Math.sin(st.t*0.9)*0.03,headY*0.6+(moving||sn?0:Math.sin(st.t*0.55)*0.3),0);
    const run=clamp(sp/6,0,1);
    tail.forEach((b,i)=>{b.rotation.y=Math.sin(st.t*3.2*wag-i*0.8)*(0.25+i*0.08)*(1-run*0.8)+(moving?Math.sin(ph-i*0.5)*0.12:0);b.rotation.x=(i===0?0.18*run-tailLift*0.5:-0.04)+(sn==='flip'?tailLift*0.2:0);});
    const lift=clamp(by*0.7,0,0.7);sh.scale.set(0.7*(1-lift*0.5),1.2*(1-lift*0.5),1);sh.material.opacity=0.3*(1-lift);
  }
  return {g,body:pivot,update,play,carry,orange,white:orange,busy:()=>!!st.stunt,STUNTS,shadow:sh};
}
window.FoxLib={create:createFox,STUNTS,real:()=>!!window.FOX_DATA};
})();
