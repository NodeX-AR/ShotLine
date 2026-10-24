/* nav.js — walkable-surface graph + A* built from the GLB triangle collider.
   Gives bots real pathfinding across the multi-floor base (stairs, corridors, rooms)
   and gives respawn logic a set of verified, connected, open floor points.        */
window.NAV=(function(){
'use strict';
const S=1.0;                        // grid spacing (m)
const N={ready:false,nodes:[],main:[],spawnPts:[],S};
let col=null,cells=new Map(),STEP=0.55,H=1.8;
const key=(ix,iz)=>(ix+4096)*8192+(iz+4096);

N.build=function(collider,opt){
  const t0=performance.now();col=collider;opt=opt||{};STEP=opt.STEP||0.55;H=opt.H||1.8;
  cells=new Map();N.nodes=[];
  const minX=col.minX+0.8,maxX=col.maxX-0.8,minZ=col.minZ+0.8,maxZ=col.maxZ-0.8;
  const ix0=Math.ceil(minX/S),ix1=Math.floor(maxX/S),iz0=Math.ceil(minZ/S),iz1=Math.floor(maxZ/S);
  const probe={x:0,y:0,z:0};
  for(let ix=ix0;ix<=ix1;ix++)for(let iz=iz0;iz<=iz1;iz++){
    const x=ix*S,z=iz*S;let sy=col.maxY+0.5,guard=0;
    while(sy>col.minY-0.5&&guard++<8){
      const gh=col.groundHeight(x,z,sy,sy-col.minY+2);
      if(!gh.found)break;
      const y=gh.y+0.03;sy=gh.y-STEP-0.35;
      const ceil=col.ceilingHeight(x,z,y+0.02);
      if(isFinite(ceil)&&ceil-y<H+0.1)continue;
      probe.x=x;probe.y=y;probe.z=z;col.collideWall(probe,0.32);
      if(Math.hypot(probe.x-x,probe.z-z)>0.06)continue;
      const n={x,y,z,ix,iz,id:N.nodes.length,nb:[],comp:-1};
      N.nodes.push(n);const k=key(ix,iz);let a=cells.get(k);if(!a){a=[];cells.set(k,a);}a.push(n);
    }
  }
  // edges between 8-neighbours with small height difference and no wall between
  const maxUp=1.05;
  for(const n of N.nodes){
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
      if(!dx&&!dz)continue;
      if(dx<0||(dx===0&&dz<0))continue;        // each pair once
      const a=cells.get(key(n.ix+dx,n.iz+dz));if(!a)continue;
      for(const m of a){
        if(Math.abs(m.y-n.y)>maxUp)continue;
        if(!lineClear(n,m))continue;
        n.nb.push(m);m.nb.push(n);
      }
    }
  }
  // connected components → keep the largest as the playable region
  let comp=0,best=-1,bestN=0;
  for(const n of N.nodes){
    if(n.comp>=0)continue;let cnt=0;const st=[n];n.comp=comp;
    while(st.length){const c=st.pop();cnt++;for(const m of c.nb)if(m.comp<0){m.comp=comp;st.push(m);}}
    if(cnt>bestN){bestN=cnt;best=comp;}comp++;
  }
  N.mainComp=best;N.main=N.nodes.filter(n=>n.comp===best&&n.nb.length>=3);
  // well spaced spawn candidates (open space only — at least 5 neighbours)
  const pts=N.main.filter(n=>n.nb.length>=5).slice().sort((a,b)=>((a.x*73+a.z*131+a.y*17)%7)-((b.x*73+b.z*131+b.y*17)%7));
  N.spawnPts=[];
  for(const p of pts){let ok=true;for(const q of N.spawnPts){if(Math.abs(p.y-q.y)<2.5&&Math.hypot(p.x-q.x,p.z-q.z)<5){ok=false;break;}}if(ok)N.spawnPts.push(p);}
  N.ready=N.main.length>20;
  console.log('[nav] '+N.nodes.length+' nodes · main region '+N.main.length+' · '+N.spawnPts.length+' spawn points · '+Math.round(performance.now()-t0)+' ms');
};

function lineClear(a,b){
  const dx=b.x-a.x,dz=b.z-a.z,dy=b.y-a.y,len=Math.hypot(dx,dz);if(len<1e-4)return true;
  // ground profile must be continuous (stairs/ramps ok, gaps and cliffs not)
  let prev=a.y;
  for(let i=1;i<=4;i++){
    const t=i/5,py=a.y+dy*t,g=col.groundHeight(a.x+dx*t,a.z+dz*t,py,1.4);
    if(!g.found||Math.abs(g.y-py)>0.42||Math.abs(g.y-prev)>0.5)return false;prev=g.y;
  }
  // sloped body-height rays (knee + chest) must not hit a wall
  for(const h of [0.62,1.4]){
    const r=col.raycast(a.x,a.y+h,a.z,dx,dy,dz,Math.hypot(len,dy)+0.05);
    if(r.hit)return false;
  }
  return true;
}

N.clear=lineClear;
N.nearest=function(x,y,z,maxDy){
  maxDy=maxDy===undefined?2.8:maxDy;
  const ix=Math.round(x/S),iz=Math.round(z/S);let best=null,bd=1e9;
  for(let r=0;r<=5&&!best;r++){
    for(let dx=-r;dx<=r;dx++)for(let dz=-r;dz<=r;dz++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
      const a=cells.get(key(ix+dx,iz+dz));if(!a)continue;
      for(const n of a){const dy=Math.abs(n.y-y);if(dy>maxDy||n.comp!==N.mainComp)continue;
        const d=Math.hypot(n.x-x,n.z-z)+dy*1.5;if(d<bd){bd=d;best=n;}}
    }
  }
  return best;
};

// binary-heap A*
N.path=function(sx,sy,sz,tx,ty,tz){
  if(!N.ready)return null;
  const s=N.nearest(sx,sy,sz),g=N.nearest(tx,ty,tz);if(!s||!g)return null;
  if(s===g)return [g];
  const open=[s],gS=new Map([[s.id,0]]),from=new Map(),closed=new Set(),fS=new Map([[s.id,h(s,g)]]);
  const push=(n)=>{open.push(n);let i=open.length-1;while(i>0){const p=(i-1)>>1;if(fS.get(open[p].id)<=fS.get(open[i].id))break;[open[p],open[i]]=[open[i],open[p]];i=p;}};
  const pop=()=>{const top=open[0],last=open.pop();if(open.length){open[0]=last;let i=0;for(;;){let l=2*i+1,r=l+1,m=i;if(l<open.length&&fS.get(open[l].id)<fS.get(open[m].id))m=l;if(r<open.length&&fS.get(open[r].id)<fS.get(open[m].id))m=r;if(m===i)break;[open[m],open[i]]=[open[i],open[m]];i=m;}}return top;};
  let it=0;
  while(open.length&&it++<60000){
    const c=pop();if(c===g){const out=[c];let k=c;while(from.has(k.id)){k=from.get(k.id);out.push(k);}return out.reverse();}
    if(closed.has(c.id))continue;closed.add(c.id);
    for(const m of c.nb){
      if(closed.has(m.id))continue;
      const ng=gS.get(c.id)+Math.hypot(m.x-c.x,m.z-c.z)+Math.abs(m.y-c.y)*1.4;
      if(!gS.has(m.id)||ng<gS.get(m.id)){gS.set(m.id,ng);from.set(m.id,c);fS.set(m.id,ng+h(m,g));push(m);}
    }
  }
  return null;
};
function h(a,b){return Math.hypot(a.x-b.x,a.z-b.z)+Math.abs(a.y-b.y);}

N.random=function(fn){const a=N.main;if(!a.length)return null;for(let i=0;i<12;i++){const n=a[(Math.random()*a.length)|0];if(!fn||fn(n))return n;}return a[(Math.random()*a.length)|0];};
return N;
})();
