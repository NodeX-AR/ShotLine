window.SOLDIER_GEN=(function(){
'use strict';
const BD={Hips:[null,0,0.93,0],Spine:['Hips',0,0.10,0],Spine1:['Spine',0,0.12,0],Spine2:['Spine1',0,0.14,0],Neck:['Spine2',0,0.20,0],Head:['Neck',0,0.10,0],HeadTop_End:['Head',0,0.20,0],RightShoulder:['Spine2',-0.06,0.14,0],RightArm:['RightShoulder',-0.13,0,0],RightForeArm:['RightArm',0,-0.30,0],RightHand:['RightForeArm',0,-0.28,0],LeftShoulder:['Spine2',0.06,0.14,0],LeftArm:['LeftShoulder',0.13,0,0],LeftForeArm:['LeftArm',0,-0.30,0],LeftHand:['LeftForeArm',0,-0.28,0],LeftUpLeg:['Hips',0.10,-0.02,0],LeftLeg:['LeftUpLeg',0,-0.44,0],LeftFoot:['LeftLeg',0,-0.44,0],LeftToeBase:['LeftFoot',0,-0.07,0.15],RightUpLeg:['Hips',-0.10,-0.02,0],RightLeg:['RightUpLeg',0,-0.44,0],RightFoot:['RightLeg',0,-0.44,0],RightToeBase:['RightFoot',0,-0.07,0.15]};
function mk(geo,mat,x,y,z,rx,ry,rz){const m=new THREE.Mesh(geo,mat);m.position.set(x||0,y||0,z||0);m.rotation.set(rx||0,ry||0,rz||0);m.castShadow=true;m.receiveShadow=true;m.frustumCulled=false;return m;}
const bx=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
const cy=(rt,rb,h)=>new THREE.CylinderGeometry(rt,rb,h,10,1);
const sp=(r)=>new THREE.SphereGeometry(r,14,10);
function build(pal){
  pal=pal||{};
  const clothC=pal.cloth!==undefined?pal.cloth:0xb8a67d,darkC=pal.dark!==undefined?pal.dark:0x554c3e,skinC=pal.skin!==undefined?pal.skin:0xc99a7a,accentC=pal.accent!==undefined?pal.accent:0xc9512a;
  const mCloth=new THREE.MeshStandardMaterial({color:clothC,roughness:0.95,metalness:0});
  const mDark=new THREE.MeshStandardMaterial({color:darkC,roughness:0.88,metalness:0.05});
  const mSkin=new THREE.MeshStandardMaterial({color:skinC,roughness:0.72,metalness:0});
  const mBlack=new THREE.MeshStandardMaterial({color:0x191c21,roughness:0.82,metalness:0.15});
  const mLeather=new THREE.MeshStandardMaterial({color:0x2b221a,roughness:0.68,metalness:0.05});
  const mWeb=new THREE.MeshStandardMaterial({color:0x3a3d33,roughness:0.95,metalness:0});
  const mMetal=new THREE.MeshStandardMaterial({color:0x4a5158,roughness:0.5,metalness:0.6});
  const mVisor=new THREE.MeshStandardMaterial({color:0x7fb8e0,roughness:0.15,metalness:0.4,transparent:true,opacity:0.85});
  const mAccent=new THREE.MeshStandardMaterial({color:accentC,roughness:0.6,metalness:0.15});
  const bones={};for(const n in BD){const b=new THREE.Bone();b.name='mixamorig'+n;bones[n]=b;}
  for(const n in BD){const [p,x,y,z]=BD[n];bones[n].position.set(x,y,z);if(p)bones[p].add(bones[n]);}
  const root=new THREE.Group();root.name='Character';root.add(bones.Hips);
  const add=(bone,mesh)=>bones[bone].add(mesh);
  add('Hips',mk(bx(0.34,0.20,0.24),mCloth,0,0,0));add('Hips',mk(bx(0.36,0.06,0.26),mLeather,0,0.09,0));add('Hips',mk(bx(0.06,0.06,0.03),mMetal,0,0.09,-0.14));add('Hips',mk(bx(0.11,0.11,0.07),mDark,-0.16,-0.05,0.13));add('Hips',mk(bx(0.09,0.09,0.06),mDark,0.16,-0.05,0.13));
  add('Spine',mk(bx(0.34,0.16,0.24),mCloth,0,0.06,0));add('Spine1',mk(bx(0.36,0.16,0.24),mCloth,0,0.06,0));
  add('Spine2',mk(bx(0.40,0.22,0.26),mCloth,0,0.08,0));add('Spine2',mk(bx(0.34,0.24,0.06),mWeb,0,0.08,-0.15));add('Spine2',mk(bx(0.34,0.24,0.06),mWeb,0,0.08,0.15));add('Spine2',mk(bx(0.06,0.22,0.24),mWeb,-0.20,0.08,0));add('Spine2',mk(bx(0.06,0.22,0.24),mWeb,0.20,0.08,0));
  add('Spine2',mk(bx(0.08,0.06,0.26),mWeb,-0.10,0.22,0));add('Spine2',mk(bx(0.08,0.06,0.26),mWeb,0.10,0.22,0));
  for(let i=0;i<3;i++){const px=-0.11+i*0.11;add('Spine2',mk(bx(0.09,0.12,0.05),mDark,px,-0.06,-0.185));add('Spine2',mk(bx(0.09,0.03,0.055),mDark,px,-0.005,-0.185));}
  add('Spine2',mk(bx(0.28,0.32,0.14),mDark,0,0.06,0.20));add('Spine2',mk(bx(0.22,0.14,0.06),mDark,0,-0.04,0.28));add('Spine2',mk(bx(0.04,0.05,0.04),mMetal,0.16,0.14,0.18));add('Spine2',mk(bx(0.008,0.30,0.008),mMetal,0.16,0.36,0.18));add('Spine2',mk(bx(0.05,0.05,0.01),mAccent,-0.12,0.10,-0.185));
  add('Neck',mk(cy(0.055,0.062,0.10),mSkin,0,0.05,0));
  add('Head',mk(bx(0.17,0.20,0.19),mSkin,0,0.10,0));
  const faceMesh=new THREE.Mesh(new THREE.PlaneGeometry(0.14,0.12),new THREE.MeshBasicMaterial({color:0x120d0a,transparent:true,opacity:0.85}));faceMesh.position.set(0,0.10,0.096);add('Head',faceMesh);
  add('Head',mk(sp(0.135),new THREE.MeshStandardMaterial({color:0x3c3a30,roughness:0.85,metalness:0.08}),0,0.17,0));add('Head',mk(bx(0.24,0.05,0.24),mBlack,0,0.12,0));add('Head',mk(bx(0.06,0.05,0.05),mBlack,0,0.19,-0.11));add('Head',mk(bx(0.035,0.025,0.02),mBlack,0,0.20,-0.14));add('Head',mk(bx(0.16,0.02,0.01),mBlack,0,-0.02,0.06));add('Head',mk(bx(0.19,0.06,0.05),mBlack,0,0.11,-0.11));add('Head',mk(bx(0.16,0.04,0.012),mVisor,0,0.11,-0.135));
  add('RightShoulder',mk(sp(0.08),mCloth,-0.05,0.06,0));add('LeftShoulder',mk(sp(0.08),mCloth,0.05,0.06,0));
  add('RightArm',mk(cy(0.062,0.055,0.30),mCloth,0,-0.15,0));add('LeftArm',mk(cy(0.062,0.055,0.30),mCloth,0,-0.15,0));add('RightArm',mk(bx(0.08,0.06,0.08),mBlack,0,-0.28,0));add('LeftArm',mk(bx(0.08,0.06,0.08),mBlack,0,-0.28,0));
  add('RightForeArm',mk(cy(0.055,0.045,0.28),mCloth,0,-0.14,0));add('LeftForeArm',mk(cy(0.055,0.045,0.28),mCloth,0,-0.14,0));add('RightForeArm',mk(bx(0.08,0.06,0.08),mBlack,0,-0.25,0));add('LeftForeArm',mk(bx(0.08,0.06,0.08),mBlack,0,-0.25,0));
  add('RightHand',mk(bx(0.085,0.10,0.09),mBlack,0,-0.04,0.005));add('LeftHand',mk(bx(0.085,0.10,0.09),mBlack,0,-0.04,0.005));add('RightHand',mk(bx(0.04,0.04,0.06),mBlack,-0.045,-0.02,-0.015,0,0,0.4));add('LeftHand',mk(bx(0.04,0.04,0.06),mBlack,0.045,-0.02,-0.015,0,0,-0.4));
  add('LeftUpLeg',mk(cy(0.10,0.085,0.44),mCloth,0,-0.22,0));add('RightUpLeg',mk(cy(0.10,0.085,0.44),mCloth,0,-0.22,0));add('LeftUpLeg',mk(bx(0.11,0.09,0.10),mBlack,0,-0.40,0));add('RightUpLeg',mk(bx(0.11,0.09,0.10),mBlack,0,-0.40,0));
  add('LeftLeg',mk(cy(0.085,0.065,0.44),mCloth,0,-0.22,0));add('RightLeg',mk(cy(0.085,0.065,0.44),mCloth,0,-0.22,0));add('LeftLeg',mk(bx(0.06,0.18,0.04),mCloth,0,-0.20,0.055));add('RightLeg',mk(bx(0.06,0.18,0.04),mCloth,0,-0.20,0.055));
  for(const side of ['Left','Right']){add(side+'Foot',mk(bx(0.11,0.11,0.22),mLeather,0,-0.03,0.02));add(side+'Foot',mk(bx(0.11,0.03,0.28),mBlack,0,-0.085,0.02));add(side+'Foot',mk(bx(0.11,0.08,0.09),mLeather,0,-0.055,0.15));}
  function sampleClip(name,dur,frames,fn){const times=[];const qT={},pT={};for(let i=0;i<=frames;i++)times.push(i/frames*dur);
    for(let i=0;i<=frames;i++){const pose=fn(i/frames);for(const bn in pose){const v=pose[bn];if(v.isQuaternion){(qT[bn]||(qT[bn]=[])).push(v.x,v.y,v.z,v.w);}else if(v.isVector3){(pT[bn]||(pT[bn]=[])).push(v.x,v.y,v.z);}}}
    const tracks=[];for(const bn in qT)tracks.push(new THREE.QuaternionKeyframeTrack('mixamorig'+bn+'.quaternion',times.slice(),qT[bn]));for(const bn in pT)tracks.push(new THREE.VectorKeyframeTrack('mixamorig'+bn+'.position',times.slice(),pT[bn]));return new THREE.AnimationClip(name,dur,tracks);}
  const _e=new THREE.Euler(),_q=new THREE.Quaternion();const q=(x,y,z)=>{_e.set(x||0,y||0,z||0,'XYZ');return _q.setFromEuler(_e).clone();};
  // Idle: slow breathing, gentle weight-shift sway, subtle head drift, relaxed knee micro-bend
  const idle=sampleClip('Idle',4.8,60,(t)=>{
    const br=Math.sin(t*Math.PI*2/2.4);            // breathing cycle (~2.4s)
    const sw=Math.sin(t*Math.PI*2/4.8);             // slow weight-shift cycle (~4.8s, full clip length)
    const micro=Math.sin(t*Math.PI*2/3.1);          // desynced secondary sway for organic feel
    return {
      Spine2:q(br*0.014,sw*0.02,sw*0.018),
      Spine1:q(br*0.006,sw*0.012,sw*0.010),
      Neck:q(-br*0.008,micro*0.03,0),
      Head:q(-br*0.012,micro*0.05+sw*0.02,sw*0.01),
      RightArm:q(0,0,-0.09+sw*0.015),
      LeftArm:q(0,0,0.09-sw*0.015),
      RightForeArm:q(0.10,0,0),
      LeftForeArm:q(0.10,0,0),
      LeftUpLeg:q(0,0,sw*0.03),
      RightUpLeg:q(0,0,-sw*0.03),
      LeftLeg:q(Math.max(0,sw)*0.05,0,0),
      RightLeg:q(Math.max(0,-sw)*0.05,0,0),
      Hips:new THREE.Vector3(sw*0.006,0.93+br*0.003,0)
    };
  });
  // Walk: natural contralateral gait - leg swing/bend, opposing arm swing with elbow bend,
  // hip twist countered by upper-spine stabilization, head held steady, vertical bob on foot-strike
  const walk=sampleClip('Walk',1.1,44,(t)=>{
    const ph=t*Math.PI*2;
    const swingL=Math.sin(ph)*0.55,swingR=Math.sin(ph+Math.PI)*0.55;
    const bendL=Math.max(0,Math.sin(ph+Math.PI))*0.85,bendR=Math.max(0,Math.sin(ph))*0.85;
    const armR=-Math.sin(ph)*0.42,armL=-Math.sin(ph+Math.PI)*0.42;
    const elbowR=0.28+Math.max(0,armR)*0.55,elbowL=0.28+Math.max(0,armL)*0.55;
    const bob=0.93+Math.abs(Math.sin(ph))*0.02;
    const hipTwist=swingL*0.08;
    return {
      LeftUpLeg:q(-swingL,0,0),LeftLeg:q(bendL,0,0),
      RightUpLeg:q(-swingR,0,0),RightLeg:q(bendR,0,0),
      RightArm:q(armR,0,-0.10),LeftArm:q(armL,0,0.10),
      RightForeArm:q(elbowR,0,0),LeftForeArm:q(elbowL,0,0),
      Hips:new THREE.Vector3(0,bob,0),
      Spine1:q(0,hipTwist,0),
      Spine2:q(0.02,-hipTwist*0.6,0),
      Neck:q(0,-hipTwist*0.3,0),
      Head:q(0,-hipTwist*0.15,0)
    };
  });
  // Run: bigger stride, forward lean, bent elbows pumping, stronger hip/shoulder counter-rotation, head stabilized
  const run=sampleClip('Run',0.72,38,(t)=>{
    const ph=t*Math.PI*2;
    const swingL=Math.sin(ph)*0.85,swingR=Math.sin(ph+Math.PI)*0.85;
    const bendL=Math.max(0,Math.sin(ph+Math.PI))*1.35,bendR=Math.max(0,Math.sin(ph))*1.35;
    const armR=-Math.sin(ph)*0.9,armL=-Math.sin(ph+Math.PI)*0.9;
    const elbowR=1.1+Math.max(0,armR)*0.4,elbowL=1.1+Math.max(0,armL)*0.4;
    const bob=0.93+Math.abs(Math.sin(ph))*0.035;
    const hipTwist=swingL*0.14;
    return {
      LeftUpLeg:q(-swingL,0,0),LeftLeg:q(bendL,0,0),
      RightUpLeg:q(-swingR,0,0),RightLeg:q(bendR,0,0),
      RightArm:q(armR,0,-0.15),LeftArm:q(armL,0,0.15),
      RightForeArm:q(elbowR,0,0),LeftForeArm:q(elbowL,0,0),
      Hips:new THREE.Vector3(0,bob,0),
      Spine:q(0.12,0,0),
      Spine1:q(0,hipTwist,0),
      Spine2:q(0.04,-hipTwist*0.7,0),
      Neck:q(-0.05,-hipTwist*0.25,0),
      Head:q(-0.03,-hipTwist*0.12,0)
    };
  });
  return {scene:root,animations:[idle,walk,run]};
}
return {build};
})();
