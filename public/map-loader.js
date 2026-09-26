/* map-loader.js — loads (3).glb purely as a visual backdrop for the world.
   Its meshes are single fused surfaces (buildings welded into the ground
   plane), not separate objects, so real per-object box colliders can't be
   built from it — main.js keeps the procedural city as the actual walkable/
   collidable layer and just lays this on top for looks.
   Exposes window.MAP_GLB_PROMISE = Promise<{scene, spawns} | null>. */
(function () {
  'use strict';

  if (!window.THREE || typeof THREE.GLTFLoader !== 'function') {
    console.warn('[map-loader] THREE / GLTFLoader missing — GLB map disabled');
    window.MAP_GLB_PROMISE = null;
    return;
  }

  const MAP_FILE   = 'map.glb';
  const MAP_SCALE  = 0.01;       // the model's raw coords run to ~±10,000 for
                                  // the central district; this brings that
                                  // down to roughly match the ~200-unit play area
  const MAP_ROT_Y  = 0;          // radians, in case the model faces the wrong way
  const MAP_OFFSET = [0, 0, 0];  // whole-map translation, world units

  // Anything whose local (pre-scale) extent is bigger than this is the huge
  // outlying sprawl surrounding the central district, not the district
  // itself — skip it so only the "center part" (per the user's request) shows,
  // and the oversized leftovers stay out of the (now much smaller) play area.
  const MAX_LOCAL_EXTENT = 30000;

  window.MAP_GLB_PROMISE = fetch(MAP_FILE, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + MAP_FILE);
      return r.arrayBuffer();
    })
    .then(buf => new Promise((resolve, reject) => {
      new THREE.GLTFLoader().parse(buf, '', gltf => {
        try {
          const scene = gltf.scene;
          const box   = new THREE.Box3();

          // Drop the oversized outlying meshes before applying the whole-map
          // transform, using their untouched local-space extent.
          const drop = [];
          scene.traverse(o => {
            if (!o.isMesh) return;
            box.setFromObject(o); // local space here since scene has no transform yet
            const sx = box.max.x - box.min.x, sy = box.max.y - box.min.y, sz = box.max.z - box.min.z;
            if (sx > MAX_LOCAL_EXTENT || sy > MAX_LOCAL_EXTENT || sz > MAX_LOCAL_EXTENT) drop.push(o);
          });
          for (const o of drop) o.parent && o.parent.remove(o);

          // Apply whole-map transform
          scene.scale.setScalar(MAP_SCALE);
          scene.rotation.y = MAP_ROT_Y;
          scene.position.set(MAP_OFFSET[0], MAP_OFFSET[1], MAP_OFFSET[2]);
          scene.updateMatrixWorld(true);

          scene.traverse(o => {
            if (o.isLight || o.isCamera) { o.visible = false; return; }
            if (!o.isMesh) return;
            o.castShadow = true; o.receiveShadow = true; o.frustumCulled = true;
          });

          const spawns = [];
          // Fallback spawn ring (model has no named spawn points)
          const b0 = new THREE.Box3().setFromObject(scene);
          const cx = (b0.min.x + b0.max.x) / 2, cz = (b0.min.z + b0.max.z) / 2, top = b0.max.y;
          spawns.push(
            [cx +  8, top + 0.1, cz +  8],
            [cx -  8, top + 0.1, cz +  8],
            [cx +  8, top + 0.1, cz -  8],
            [cx -  8, top + 0.1, cz -  8],
            [cx,      top + 0.1, cz     ]
          );

          console.log('[map-loader] ' + MAP_FILE + ' loaded (visual only) · dropped ' + drop.length + ' oversized mesh(es)');
          resolve({ scene, spawns });
        } catch (err) { reject(err); }
      }, reject);
    }))
    .catch(err => {
      console.error('[map-loader] failed, procedural-only will run:', err);
      return null;
    });
})();
