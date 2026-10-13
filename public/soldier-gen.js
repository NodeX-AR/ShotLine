/* Minecraft-style player model + skin tools.
   - 64x64 skin layout (classic 4px arms or slim 3px arms), second layer supported
   - Same Mixamo-named bones the game's rig/IK/animation code already expects
   - 1 skin pixel = 0.05625 m  ->  32px tall = 1.8 m                              */
window.SOLDIER_GEN=(function(){
'use strict';
const U=0.05625, HIPY=12*U;
const SKIN_W=64;

/* ---------- skin helpers ---------- */
function normalizeSkin(img){
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.imageSmoothingEnabled=false;
  g.drawImage(img,0,0);
  if(img.height===32){            // legacy 64x32: build the left limbs by mirroring the right ones, face by face
    const flip=(sx,sy,w,h,dx,dy)=>{g.save();g.translate(dx+w,dy);g.scale(-1,1);g.drawImage(c,sx,sy,w,h,0,0,w,h);g.restore();};
    // right arm 40,16 -> left arm 32,48 ; right leg 0,16 -> left leg 16,48   (right<->left faces swap)
    for(const [ox,oy,nx,ny] of [[40,16,32,48],[0,16,16,48]]){
      flip(ox+4,oy+4,4,12,nx+4,ny+4);   // front
      flip(ox+12,oy+4,4,12,nx+12,ny+4); // back
      flip(ox+8,oy+4,4,12,nx,ny+4);     // left face -> right face slot
      flip(ox,oy+4,4,12,nx+8,ny+4);     // right face -> left face slot
      flip(ox+4,oy,4,4,nx+4,ny);flip(ox+8,oy,4,4,nx+8,ny);
    }
  }
  return c;
}
function loadSkin(url,cb){
  const im=new Image();im.crossOrigin='anonymous';
  im.onload=()=>{try{cb(normalizeSkin(im));}catch(e){cb(null);}};
  im.onerror=()=>cb(null);
  im.src=url;
}
function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
function hsl(h,s,l){return 'hsl('+(h%360)+','+s+'%,'+l+'%)';}
/* A readable default tactical skin; `seed` varies the camo colour per player/bot */
function defaultSkin(seed){
  const hs=hash(String(seed||'x')),hue=[95,30,200,0,50,160][hs%6];
  const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');
  const R=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x,y,w,h);};
  const skin='#c99a7a',skinD='#b5876a',cloth=hsl(hue,22,34),clothD=hsl(hue,24,24),clothL=hsl(hue,20,42),dark='#262a2f',metal='#59616b',acc=hsl(hue+160,60,50);
  // box faces helper: fill the 6 faces of a box with origin (ox,oy), size w,h,d
  const box=(ox,oy,w,h,d,col)=>{R(ox+d,oy,w*2,d,col);R(ox,oy+d,d*2+w*2,h,col);};
  box(0,0,8,8,8,skin);                    // head
  R(0,0+8,32,3,'#3a2c20');R(8,0,8,8,'#3a2c20');R(0,8,8,4,'#3a2c20');R(24,8,8,5,'#3a2c20'); // hair on top/back/sides
  R(8,12,8,4,skin);                       // face skin below hairline
  R(9,13,2,1,'#fff');R(13,13,2,1,'#fff');R(10,13,1,1,'#2b3a67');R(13,13,1,1,'#2b3a67'); // eyes
  R(11,15,2,1,skinD);R(10,16,4,1,'#8a5a4a');
  box(32,0,8,8,8,'rgba(0,0,0,0)');g.clearRect(32,0,32,16);
  // helmet (hat layer)
  R(40,0,8,8,dark);R(32,8,8,4,dark);R(40,8,8,2,dark);R(48,8,8,4,dark);R(56,8,8,4,dark);R(40,10,8,1,metal);
  box(16,16,8,12,4,cloth);                 // torso
  R(20,20,8,12,cloth);R(22,22,4,2,clothD);R(20,30,8,2,clothD);
  box(16,32,8,12,4,'rgba(0,0,0,0)');g.clearRect(16,32,24,16);
  // plate carrier + pouches (jacket layer)
  R(20,36,8,12,clothD);R(21,38,2,3,dark);R(23,38,2,3,dark);R(25,38,2,3,dark);R(21,42,6,2,dark);R(22,36,4,1,metal);
  R(16,36,4,12,clothD);R(28,36,4,12,clothD);R(32,36,8,12,clothD);R(20,32,8,4,clothD);
  for(const [ox,oy] of [[40,16],[32,48]]){  // arms: sleeves, forearm wraps, hands
    box(ox,oy,4,12,4,cloth);R(ox+4,oy+4,4,8,cloth);R(ox+4,oy+12,4,4,skin);R(ox,oy+12,16,4,skin);
    R(ox,oy+4,16,4,clothD);R(ox+4,oy+4,4,1,clothL);R(ox+4,oy+11,4,1,dark);R(ox,oy+11,16,1,dark);
    R(ox+4,oy,8,4,cloth);
  }
  for(const [ox,oy] of [[0,16],[16,48]]){   // legs: pants, knee pad, boots
    box(ox,oy,4,12,4,cloth);R(ox,oy+4,16,12,cloth);R(ox+4,oy+4,4,12,cloth);R(ox+4,oy+8,4,2,clothD);
    R(ox,oy+13,16,3,dark);R(ox+4,oy+14,4,2,'#16181b');R(ox+4,oy+4,4,1,clothL);
  }
  return c;
}
const texCache=new Map();
function makeTexture(canvas){
  const t=new THREE.CanvasTexture(canvas);
  t.magFilter=THREE.NearestFilter;t.minFilter=THREE.NearestFilter;t.generateMipmaps=false;
  if(THREE.sRGBEncoding)t.encoding=THREE.sRGBEncoding;else if(THREE.SRGBColorSpace)t.colorSpace=THREE.SRGBColorSpace;
  t.needsUpdate=true;return t;
}

/* ---------- geometry: a box UV-mapped onto the skin sheet ----------
   w,h,d: pixel size; ox,oy: skin origin; fa..fb: vertical slice of the box (0 top .. 1 bottom); infl: extra px */
function mcGeo(w,h,d,ox,oy,fa,fb,infl){
  fa=fa||0;fb=fb===undefined?1:fb;infl=infl||0;
  const sh=(fb-fa)*h;
  const g=new THREE.BoxGeometry((w+infl)*U,(sh+infl)*U,(d+infl)*U);
  const faces=[
    [ox+d+w,oy+d,d,h,true],   // +X  (character's left)
    [ox,oy+d,d,h,true],       // -X  (character's right)
    [ox+d,oy,w,d,false],      // +Y
    [ox+d+w,oy,w,d,false],    // -Y
    [ox+d,oy+d,w,h,true],     // +Z  front
    [ox+2*d+w,oy+d,w,h,true]  // -Z  back
  ];
  const uv=g.attributes.uv;
  for(let f=0;f<6;f++){
    let [x,y,rw,rh,side]=faces[f];
    if(side){y=y+fa*h;rh=sh;}
    else if((f===2&&fa>0)||(f===3&&fb<1)){rw=0.01;rh=0.01;}   // hidden cap of a partial slice
    for(let k=0;k<4;k++){
      const i=f*4+k,a=uv.getX(i),b=uv.getY(i);
      uv.setXY(i,(x+a*rw)/SKIN_W,1-(y+(1-b)*rh)/SKIN_W);
    }
  }
  uv.needsUpdate=true;return g;
}
const BD={
  Hips:[null,0,HIPY,0],Spine:['Hips',0,0,0],Spine1:['Spine',0,4*U,0],Spine2:['Spine1',0,4*U,0],Neck:['Spine2',0,4*U,0],Head:['Neck',0,0,0],HeadTop_End:['Head',0,8*U,0],
  RightShoulder:['Spine2',0,4*U,0],RightArm:['RightShoulder',-6*U,0,0],RightForeArm:['RightArm',0,-6*U,0],RightHand:['RightForeArm',0,-6*U,0],
  LeftShoulder:['Spine2',0,4*U,0],LeftArm:['LeftShoulder',6*U,0,0],LeftForeArm:['LeftArm',0,-6*U,0],LeftHand:['LeftForeArm',0,-6*U,0],
  LeftUpLeg:['Hips',2*U,0,0],LeftLeg:['LeftUpLeg',0,-6*U,0],LeftFoot:['LeftLeg',0,-6*U,0],LeftToeBase:['LeftFoot',0,0,3*U],
  RightUpLeg:['Hips',-2*U,0,0],RightLeg:['RightUpLeg',0,-6*U,0],RightFoot:['RightLeg',0,-6*U,0],RightToeBase:['RightFoot',0,0,3*U]
};
function build(opt){
  opt=opt||{};const slim=!!opt.slim,aw=slim?3:4;
  const bones={};for(const n in BD){const b=new THREE.Bone();b.name='mixamorig'+n;bones[n]=b;}
  for(const n in BD){const [p,x,y,z]=BD[n];bones[n].position.set(x,y,z);if(p)bones[p].add(bones[n]);}
  const root=new THREE.Group();root.name='Character';root.add(bones.Hips);
  const mk=(geo,bone,x,y,z,over)=>{
    const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.95,metalness:0,alphaTest:over?0.5:0,side:over?THREE.DoubleSide:THREE.FrontSide}));
    m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;m.userData.mc=over?2:1;bones[bone].add(m);return m;};
  const part=(bone,w,h,d,ox,oy,fa,fb,cy,over,infl,cx)=>{
    const sh=(fb-fa)*h;mk(mcGeo(w,h,d,ox,oy,fa,fb,over?infl:0),bone,cx||0,cy,0,over);};
  for(const over of [false,true]){
    const ov=over?1:0, i1=over?0.5:0;
    // head
    part('Head',8,8,8,over?32:0,0,0,1,4*U,over,1);
    // torso in three slices so spine rotation bends it
    const t0=over?16:16,t1=over?32:16;
    part('Spine2',8,12,4,16,over?32:16,0,1/3,2*U,over,i1);
    part('Spine1',8,12,4,16,over?32:16,1/3,2/3,2*U-0*U,over,i1);
    part('Spine',8,12,4,16,over?32:16,2/3,1,2*U,over,i1);
    // arms (upper + forearm halves) ; right arm origin 40,16 (overlay 40,32) ; left arm 32,48 (overlay 48,48)
    const rO=over?[40,32]:[40,16],lO=over?[48,48]:[32,48];
    const sx=slim?0.5*U:0;
    part('RightArm',aw,12,4,rO[0],rO[1],0,0.5,-3*U,over,i1,sx);
    part('RightForeArm',aw,12,4,rO[0],rO[1],0.5,1,-3*U,over,i1,sx);
    part('LeftArm',aw,12,4,lO[0],lO[1],0,0.5,-3*U,over,i1,-sx);
    part('LeftForeArm',aw,12,4,lO[0],lO[1],0.5,1,-3*U,over,i1,-sx);
    // legs; right leg origin 0,16 (overlay 0,32) ; left leg 16,48 (overlay 0,48)
    const rl=over?[0,32]:[0,16],ll=over?[0,48]:[16,48];
    part('RightUpLeg',4,12,4,rl[0],rl[1],0,0.5,-3*U,over,i1,0);
    part('RightLeg',4,12,4,rl[0],rl[1],0.5,1,-3*U,over,i1,0);
    part('LeftUpLeg',4,12,4,ll[0],ll[1],0,0.5,-3*U,over,i1,0);
    part('LeftLeg',4,12,4,ll[0],ll[1],0.5,1,-3*U,over,i1,0);
  }
  /* ---- animation clips (same bone keys the game already drives) ---- */
  function sampleClip(name,dur,frames,fn){const times=[];const qT={},pT={};for(let i=0;i<=frames;i++)times.push(i/frames*dur);
    for(let i=0;i<=frames;i++){const pose=fn(i/frames);for(const bn in pose){const v=pose[bn];if(v.isQuaternion){(qT[bn]||(qT[bn]=[])).push(v.x,v.y,v.z,v.w);}else if(v.isVector3){(pT[bn]||(pT[bn]=[])).push(v.x,v.y,v.z);}}}
    const tracks=[];for(const bn in qT)tracks.push(new THREE.QuaternionKeyframeTrack('mixamorig'+bn+'.quaternion',times.slice(),qT[bn]));for(const bn in pT)tracks.push(new THREE.VectorKeyframeTrack('mixamorig'+bn+'.position',times.slice(),pT[bn]));return new THREE.AnimationClip(name,dur,tracks);}
  const _e=new THREE.Euler(),_q=new THREE.Quaternion();const q=(x,y,z)=>{_e.set(x||0,y||0,z||0,'XYZ');return _q.setFromEuler(_e).clone();};
  const idle=sampleClip('Idle',4.8,60,(t)=>{
    const br=Math.sin(t*Math.PI*2/2.4),sw=Math.sin(t*Math.PI*2/4.8),mi=Math.sin(t*Math.PI*2/3.1);
    return {Spine2:q(br*0.014,sw*0.02,sw*0.018),Spine1:q(br*0.006,sw*0.012,sw*0.01),Neck:q(-br*0.008,mi*0.03,0),Head:q(-br*0.012,mi*0.05+sw*0.02,sw*0.01),
      RightArm:q(0,0,-0.07+sw*0.015),LeftArm:q(0,0,0.07-sw*0.015),RightForeArm:q(0.10,0,0),LeftForeArm:q(0.10,0,0),
      Hips:new THREE.Vector3(sw*0.004,HIPY+br*0.002,0)};
  });
  const walk=sampleClip('Walk',1.0,40,(t)=>{
    const ph=t*Math.PI*2,sL=Math.sin(ph)*0.62,sR=Math.sin(ph+Math.PI)*0.62;
    const bL=Math.max(0,Math.sin(ph+Math.PI))*0.7,bR=Math.max(0,Math.sin(ph))*0.7;
    const aR=-Math.sin(ph)*0.5,aL=-Math.sin(ph+Math.PI)*0.5,tw=sL*0.06;
    return {LeftUpLeg:q(-sL,0,0),LeftLeg:q(bL,0,0),RightUpLeg:q(-sR,0,0),RightLeg:q(bR,0,0),
      RightArm:q(aR,0,-0.06),LeftArm:q(aL,0,0.06),RightForeArm:q(0.2+Math.max(0,aR)*0.5,0,0),LeftForeArm:q(0.2+Math.max(0,aL)*0.5,0,0),
      Hips:new THREE.Vector3(0,HIPY+Math.abs(Math.sin(ph))*0.02,0),Spine1:q(0,tw,0),Spine2:q(0.02,-tw*0.6,0),Head:q(0,-tw*0.2,0)};
  });
  const run=sampleClip('Run',0.7,36,(t)=>{
    const ph=t*Math.PI*2,sL=Math.sin(ph)*0.95,sR=Math.sin(ph+Math.PI)*0.95;
    const bL=Math.max(0,Math.sin(ph+Math.PI))*1.25,bR=Math.max(0,Math.sin(ph))*1.25;
    const aR=-Math.sin(ph)*1.0,aL=-Math.sin(ph+Math.PI)*1.0,tw=sL*0.12;
    return {LeftUpLeg:q(-sL,0,0),LeftLeg:q(bL,0,0),RightUpLeg:q(-sR,0,0),RightLeg:q(bR,0,0),
      RightArm:q(aR,0,-0.1),LeftArm:q(aL,0,0.1),RightForeArm:q(1.0+Math.max(0,aR)*0.4,0,0),LeftForeArm:q(1.0+Math.max(0,aL)*0.4,0,0),
      Hips:new THREE.Vector3(0,HIPY+Math.abs(Math.sin(ph))*0.035,0),Spine:q(0.14,0,0),Spine1:q(0,tw,0),Spine2:q(0.04,-tw*0.7,0),Head:q(-0.05,-tw*0.12,0)};
  });
  return {scene:root,animations:[idle,walk,run]};
}
/* A single Minecraft arm (hangs down from its shoulder pivot) for the first-person view: fists, grenade throw, power casts. */
function makeFPArm(side,slim,tex){
  const aw=slim?3:4,o=side==='right'?[40,16]:[32,48],ov=side==='right'?[40,32]:[48,48],g=new THREE.Group();
  for(const over of [false,true]){
    const m=new THREE.Mesh(mcGeo(aw,12,4,over?ov[0]:o[0],over?ov[1]:o[1],0,1,over?0.5:0),new THREE.MeshStandardMaterial({map:tex||null,color:0xffffff,roughness:0.95,metalness:0,alphaTest:over?0.5:0,side:over?THREE.DoubleSide:THREE.FrontSide}));
    m.position.y=-6*U;m.userData.mc=over?2:1;m.frustumCulled=false;g.add(m);}
  return g;
}
function applySkin(root,tex){
  root.traverse(o=>{if(o.isMesh&&o.userData&&o.userData.mc){o.material.map=tex;o.material.needsUpdate=true;}});
}
return {build,defaultSkin,makeTexture,loadSkin,normalizeSkin,applySkin,makeFPArm,hash,U,HIPY};
})();
