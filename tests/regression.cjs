'use strict';
const assert=require('node:assert/strict');
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
let state='playing';
class V{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}clone(){return new V(this.x,this.y,this.z);}copy(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}sub(v){this.x-=v.x;this.y-=v.y;this.z-=v.z;return this;}dot(v){return this.x*v.x+this.y*v.y+this.z*v.z;}lengthSq(){return this.dot(this);}length(){return Math.sqrt(this.lengthSq());}multiplyScalar(k){this.x*=k;this.y*=k;this.z*=k;return this;}normalize(){return this.multiplyScalar(1/(this.length()||1));}addScaledVector(v,k){this.x+=v.x*k;this.y+=v.y*k;this.z+=v.z*k;return this;}distanceTo(v){return this.clone().sub(v).length();}}
function fpBodyApply(b,m,on){
  m.visible=!on&&b.alive&&state==='playing';
  if(b.rig&&b.rig.gp)b.rig.gp.visible=!on;
  b._fpOn=on;
}
function setActive(i){active=i;rig.forEach((r,k)=>{const on=k===i;r.g.visible=on;if(r.weaponGLB)r.weaponGLB.visible=on;if(r.pistolMesh)r.pistolMesh.visible=on&&r.kind==='pistol';r.R.root.visible=on&&!fp.ready;r.Lh.root.visible=on&&!fp.ready;r.R.sleeve.visible=r.R.cuff.visible=r.Lh.sleeve.visible=r.Lh.cuff.visible=on&&!fp.ready;});return rig[i];}
function getBoneForModel(root, candidates){
    if(!root)return null;
    for(const n of candidates){
      const o=root.getObjectByName(n);
      if(o)return o;
    }
    let found=null;
    root.traverse(o=>{
      if(found || !(o.isBone || o.type==='Bone'))return;
      const ln=(o.name||'').toLowerCase().replace(/mixamorig[:_]?/g,'');
      for(const n of candidates){
        const cn=String(n).toLowerCase().replace(/mixamorig[:_]?/g,'');
        if(ln===cn || ln.endsWith(cn)){ found=o; break; }
      }
    });
    return found;
  }

function ikFP(a,t,l1,l2,pole,elbow,end){
    const origin=a.clone(),direction=t.clone().sub(origin);
    const raw=direction.length();if(raw<1e-7)direction.set(0,0,-1);else direction.multiplyScalar(1/raw);
    const dist=clamp(raw,Math.abs(l1-l2)+0.0001,Math.max(0.001,l1+l2-0.003));
    const along=(l1*l1-l2*l2+dist*dist)/(2*dist);
    const height=Math.sqrt(Math.max(0,l1*l1-along*along));
    const bend=pole.clone().addScaledVector(direction,-pole.dot(direction));
    if(bend.lengthSq()<1e-8){bend.set(0,1,0).addScaledVector(direction,-direction.y);if(bend.lengthSq()<1e-8)bend.set(1,0,0);}
    bend.normalize();elbow.copy(origin).addScaledVector(direction,along).addScaledVector(bend,height);
    end.copy(origin).addScaledVector(direction,dist);
  }
function spring(x,v,dt,k,c){
    const count=Math.max(1,Math.ceil(Math.max(0,dt)*120)),h=Math.max(0,dt)/count;
    for(let i=0;i<count;i++){v+=(-k*x-c*v)*h;x+=v*h;}
    return [x,v];
  }

const b={alive:true,rig:{gp:{visible:true}}},m={visible:true};
fpBodyApply(b,m,true);assert.equal(m.visible,false);assert.equal(b.rig.gp.visible,false);
fpBodyApply(b,m,false);assert.equal(m.visible,true);b.alive=false;fpBodyApply(b,m,false);assert.equal(m.visible,false);
let active=0;const fp={ready:true};
function mock(){return {g:{visible:true},weaponGLB:{visible:true},pistolMesh:{visible:true},kind:'rifle',R:{root:{},sleeve:{},cuff:{}},Lh:{root:{},sleeve:{},cuff:{}}};}
const rig=Array.from({length:6},mock);rig[0].kind='pistol';
for(let i=0;i<6;i++){setActive(i);assert.equal(rig.filter(r=>r.g.visible).length,1);assert.equal(rig[i].R.root.visible,false);}
fp.ready=false;setActive(2);assert.equal(rig[2].R.root.visible,true);assert.equal(rig[0].R.sleeve.visible,false);
for(const name of ['mixamorig:LeftUpLeg','mixamorig_LeftUpLeg','mixamorigLeftUpLeg']){const bone={name,isBone:true};assert.equal(getBoneForModel({getObjectByName:()=>null,traverse:f=>f(bone)},['mixamorigLeftUpLeg']),bone);}
for(let i=0;i<100;i++){
 const a=new V(3,2,1),copy=a.clone(),t=new V(3+(i%7)*.1,2-(i%5)*.1,1-.3),e=new V(),end=new V();
 ikFP(a,t,.3,.28,new V(0,-1,.4),e,end);
 assert.deepEqual(a,copy);assert.ok(Math.abs(a.distanceTo(e)-.3)<1e-6);assert.ok(Math.abs(e.distanceTo(end)-.28)<1e-6);
}
for(const fps of [20,30,60,120]){let x=0,v=3;for(let i=0;i<fps*3;i++)[x,v]=spring(x,v,1/fps,230,19);assert.ok(Number.isFinite(x+v));assert.ok(Math.abs(x)<.00001);}
console.log('PASS: body/weapon isolation; six switches; arm fallback; three Mixamo naming variants; 100 IK length and input-preservation cases; recoil stability at 20/30/60/120 FPS.');

/* kinetic systems (grapple, chrono-ghost, overdrive, clip recorder, match/victory): core math, server helpers, integration smoke */
require('./systems.cjs');
