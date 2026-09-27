/* map-loader.js — loads map.glb purely as a visual backdrop for the world.
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

  const MAP_FILE  = 'models/map.glb';
  // IMPORTANT: this model's own "Modular_City_Ultra_Low_Poly_Assets" node
  // already carries a baked-in 0.01 scale (visible in its own matrix), which
  // GLTFLoader applies automatically when it builds the scene graph — before
  // this script ever touches it. An earlier version of this file *also*
  // multiplied the whole scene by 0.01 on top of that (0.01 x 0.01 = 0.0001),
  // which is what shrank the whole map down to doll-house size. This MAP_SCALE
  // is the ONLY extra multiplier applied, on top of whatever the file's own
  // node transforms already produce — don't stack another one on here.
  //
  // The model's two big center-city meshes are already correctly centered on
  // the origin (matching where players spawn) and come out to ~2000x2000
  // world units once the file's own baked scale is applied. 0.1 brings that
  // down to ~200x200, matching this game's ~212-unit-wide play area almost
  // exactly. Its separate row of 8 "Block_base" district meshes sits off to
  // one side (not centered) and lands right at/past the play-area edge at
  // this scale — which is fine, that's the "outside the border" leftover part.
  const MAP_SCALE  = 0.1;
  const MAP_ROT_Y  = 0;          // radians, in case the model faces the wrong way
  const MAP_OFFSET = [0, 0, 0];  // whole-map translation, world units

  window.MAP_GLB_PROMISE = fetch(MAP_FILE, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + MAP_FILE);
      return r.arrayBuffer();
    })
    .then(buf => new Promise((resolve, reject) => {
      new THREE.GLTFLoader().parse(buf, '', gltf => {
        try {
          const scene = gltf.scene;

          // Apply the one extra whole-map transform (on top of the model's
          // own already-baked node transforms — see note above).
          scene.scale.multiplyScalar(MAP_SCALE);
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

          console.log('[map-loader] ' + MAP_FILE + ' loaded (visual only) · world bbox', b0.min, b0.max);
          resolve({ scene, spawns });
        } catch (err) { reject(err); }
      }, reject);
    }))
    .catch(err => {
      console.error('[map-loader] failed, procedural-only will run:', err);
      return null;
    });
})();
