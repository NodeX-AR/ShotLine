/* map-loader.js — loads the level5_zone1 map (a small underground cave-like
   structure, per the user) and builds REAL per-object colliders for it. This
   asset is authored as genuinely separate objects (unlike the earlier
   map.glb, whose meshes were single fused surfaces) — splitting each mesh
   into its connected pieces (shared-vertex/triangle clustering) gives one
   box collider per actual wall/rock/prop instead of one giant blob per mesh,
   so real walls, floors, and gaps between them work like real collision.
   Exposes window.MAP_GLB_PROMISE = Promise<{scene, colliders, spawns} | null>. */
(function () {
  'use strict';

  if (!window.THREE || typeof THREE.GLTFLoader !== 'function') {
    console.warn('[map-loader] THREE / GLTFLoader missing — GLB map disabled');
    window.MAP_GLB_PROMISE = null;
    return;
  }

  const MAP_FILE   = 'models/map.glb';
  const MAP_SCALE  = 1;   // already authored at human/game scale (~93 x 32 x 64 units) — no correction needed
  const MAP_ROT_Y  = 0;   // radians, in case the model faces the wrong way once you can see it

  // Merge coincident vertices within this distance when splitting a mesh
  // into separate physical pieces (world units — this model's own scale).
  const MERGE_EPS   = 0.02;
  const MIN_AREA    = 0.05;  // drop slivers/decals
  const MAX_EXTENT  = 120;   // sanity guard against a stray oversized mesh
  const MAX_COMPS_PER_MESH = 300; // safety cap if a mesh fragments into hundreds of tiny pieces

  function splitIntoComponents(o) {
    const geo = o.geometry;
    const posAttr = geo.attributes.position;
    const idxAttr = geo.index;
    const n = posAttr.count;
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    function find(a){ while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
    function union(a,b){ a=find(a); b=find(b); if (a!==b) parent[a]=b; }

    // Merge vertices that sit at (nearly) the same position, even if they
    // aren't the same index (duplicated at UV/normal seams) — otherwise two
    // triangles of the same physical piece wouldn't get connected.
    const cell = MERGE_EPS * 2;
    const arr = posAttr.array;
    const grid = new Map();
    for (let i = 0; i < n; i++) {
      const x = arr[i*3], y = arr[i*3+1], z = arr[i*3+2];
      const key = Math.round(x/cell) + '_' + Math.round(y/cell) + '_' + Math.round(z/cell);
      if (grid.has(key)) union(i, grid.get(key)); else grid.set(key, i);
    }
    if (idxAttr) {
      const ia = idxAttr.array;
      for (let t = 0; t < ia.length; t += 3) { union(ia[t], ia[t+1]); union(ia[t+1], ia[t+2]); }
    } else {
      for (let t = 0; t < n; t += 3) { union(t, t+1); union(t+1, t+2); }
    }

    o.updateWorldMatrix(true, false);
    const v = new THREE.Vector3();
    const bounds = new Map(); // root -> {x0,x1,y0,y1,z0,z1,n}
    for (let i = 0; i < n; i++) {
      v.set(arr[i*3], arr[i*3+1], arr[i*3+2]);
      v.applyMatrix4(o.matrixWorld);
      const r = find(i);
      let b = bounds.get(r);
      if (!b) { bounds.set(r, { x0:v.x,x1:v.x, y0:v.y,y1:v.y, z0:v.z,z1:v.z, n:1 }); }
      else {
        if (v.x<b.x0) b.x0=v.x; if (v.x>b.x1) b.x1=v.x;
        if (v.y<b.y0) b.y0=v.y; if (v.y>b.y1) b.y1=v.y;
        if (v.z<b.z0) b.z0=v.z; if (v.z>b.z1) b.z1=v.z;
        b.n++;
      }
    }
    let comps = Array.from(bounds.values());
    if (comps.length > MAX_COMPS_PER_MESH) {
      comps.sort((a,b) => (b.x1-b.x0)*(b.z1-b.z0)*(b.y1-b.y0) - (a.x1-a.x0)*(a.z1-a.z0)*(a.y1-a.y0));
      comps = comps.slice(0, MAX_COMPS_PER_MESH);
    }
    return comps;
  }

  window.MAP_GLB_PROMISE = fetch(MAP_FILE, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + MAP_FILE);
      return r.arrayBuffer();
    })
    .then(buf => new Promise((resolve, reject) => {
      new THREE.GLTFLoader().parse(buf, '', gltf => {
        try {
          const scene = gltf.scene;
          scene.scale.multiplyScalar(MAP_SCALE);
          scene.rotation.y += MAP_ROT_Y;
          scene.updateMatrixWorld(true);

          const colliders = [];
          scene.traverse(o => {
            if (o.isLight || o.isCamera) { o.visible = false; return; }
            if (!o.isMesh) return;
            o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true;

            let comps;
            try { comps = splitIntoComponents(o); } catch (e) { comps = null; }
            if (!comps || !comps.length) {
              const box = new THREE.Box3().setFromObject(o);
              comps = [{ x0:box.min.x,x1:box.max.x, y0:box.min.y,y1:box.max.y, z0:box.min.z,z1:box.max.z }];
            }
            for (const c of comps) {
              const sx=c.x1-c.x0, sy=c.y1-c.y0, sz=c.z1-c.z0;
              const area = Math.max(sx*sz, sx*sy, sy*sz);
              if (area < MIN_AREA) continue;
              if (sx>MAX_EXTENT || sy>MAX_EXTENT || sz>MAX_EXTENT) continue;
              const isGround = (sy < 0.4 && sy > 0.01);
              colliders.push({ x0:c.x0,x1:c.x1, y0:c.y0,y1:c.y1, z0:c.z0,z1:c.z1, ray: !isGround, q:0, _area:area });
            }
          });

          // Best-effort "main floor" detection: among thin, large-area
          // pieces, the one with the lowest top surface. For a cave/interior
          // level the walkable floor is usually the biggest flat surface
          // near the bottom of the structure — this is a heuristic, not a
          // guarantee, since there's no authored spawn-point data to go on.
          const floorCandidates = colliders.filter(c => (c.y1-c.y0) < 0.6 && c._area > 3)
                                            .sort((a,b) => a.y1 - b.y1);
          const floorY = floorCandidates.length ? floorCandidates[0].y1 : 0;
          for (const c of colliders) { c.y0 -= floorY; c.y1 -= floorY; }
          scene.position.y -= floorY;
          scene.updateMatrixWorld(true);

          // Spawn points: spread across a few of the biggest floor-like
          // pieces near the (now-zeroed) ground level, deduped so they
          // aren't all clustered on the same slab.
          const spawns = [];
          const floorPieces = colliders.filter(c => (c.y1-c.y0) < 0.6 && Math.abs(c.y1) < 3 && c._area > 2)
                                        .sort((a,b) => b._area - a._area);
          for (const c of floorPieces) {
            const cx = (c.x0+c.x1)/2, cz = (c.z0+c.z1)/2, cy = c.y1 + 0.1;
            if (spawns.some(s => Math.hypot(s[0]-cx, s[2]-cz) < 4)) continue;
            spawns.push([cx, cy, cz]);
            if (spawns.length >= 10) break;
          }
          if (!spawns.length) {
            const b0 = new THREE.Box3().setFromObject(scene);
            spawns.push([(b0.min.x+b0.max.x)/2, 0.1, (b0.min.z+b0.max.z)/2]);
          }

          for (const c of colliders) delete c._area;

          console.log('[map-loader] ' + MAP_FILE + ' loaded ·', colliders.length,
                      'colliders ·', spawns.length, 'spawn candidates · floor snapped to y=0 (was ' + floorY.toFixed(2) + ')');
          resolve({ scene, colliders, spawns });
        } catch (err) { reject(err); }
      }, reject);
    }))
    .catch(err => {
      console.error('[map-loader] failed, procedural-only will run:', err);
      return null;
    });
})();
