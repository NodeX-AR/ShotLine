/* map-loader.js — loads (3).glb as the world map.
   Exposes window.MAP_GLB_PROMISE = Promise<{scene, colliders, spawns} | null>.
   main.js awaits it, then either uses the GLB world or falls back to procedural. */
(function () {
  'use strict';

  if (!window.THREE || typeof THREE.GLTFLoader !== 'function') {
    console.warn('[map-loader] THREE / GLTFLoader missing — GLB map disabled');
    window.MAP_GLB_PROMISE = null;
    return;
  }

  const MAP_FILE   = '(3).glb';
  const MAP_SCALE  = 1;          // tweak if the model is too big / small
  const MAP_ROT_Y  = 0;          // radians, in case the model faces the wrong way
  const MAP_OFFSET = [0, 0, 0];  // whole-map translation, world units

  // Ignore meshes smaller than this (decals, wire, trim)
  const MIN_AREA   = 0.3;

  // Meshes with any dimension larger than this are treated as skybox / shells
  const MAX_EXTENT = 300;

  window.MAP_GLB_PROMISE = fetch(MAP_FILE, { cache: 'no-store' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + MAP_FILE);
      return r.arrayBuffer();
    })
    .then(buf => new Promise((resolve, reject) => {
      new THREE.GLTFLoader().parse(buf, '', gltf => {
        try {
          const scene = gltf.scene;

          // Apply whole-map transform
          scene.scale.setScalar(MAP_SCALE);
          scene.rotation.y = MAP_ROT_Y;
          scene.position.set(MAP_OFFSET[0], MAP_OFFSET[1], MAP_OFFSET[2]);
          scene.updateMatrixWorld(true);

          const colliders = [];
          const spawns    = [];
          const box       = new THREE.Box3();

          scene.traverse(o => {
            if (o.isLight || o.isCamera) { o.visible = false; return; }
            if (!o.isMesh) return;

            o.castShadow    = true;
            o.receiveShadow = true;
            o.frustumCulled = true;

            const n = (o.name || '').toLowerCase();
            if (n.includes('sky')   || n.includes('water') || n.includes('decal') ||
                n.includes('light') || n.includes('spawn') || n.includes('trigger'))
              return;

            o.updateWorldMatrix(true, false);
            box.setFromObject(o);

            const sx = box.max.x - box.min.x;
            const sy = box.max.y - box.min.y;
            const sz = box.max.z - box.min.z;
            const area = Math.max(sx * sz, sx * sy, sy * sz);

            if (area < MIN_AREA)              return;
            if (sx > MAX_EXTENT || sy > MAX_EXTENT || sz > MAX_EXTENT) return;

            // Floors / ground: physics only, bullets pass through
            const isGround = (sy < 0.4 && sy > 0.005 && box.min.y < 0.05);

            colliders.push({
              x0: box.min.x, x1: box.max.x,
              y0: box.min.y, y1: box.max.y,
              z0: box.min.z, z1: box.max.z,
              ray: !isGround,
              q: 0
            });
          });

          // Pull any object named spawn* as a spawn point
          scene.traverse(o => {
            if (!o.isObject3D) return;
            const n = (o.name || '').toLowerCase();
            if (n.startsWith('spawn') || n.includes('_spawn') || n === 'playerstart') {
              const p = new THREE.Vector3();
              o.getWorldPosition(p);
              spawns.push([p.x, p.y, p.z]);
            }
          });

          // Fallback spawn ring if model has none
          if (spawns.length === 0) {
            const b0 = new THREE.Box3().setFromObject(scene);
            const cx = (b0.min.x + b0.max.x) / 2;
            const cz = (b0.min.z + b0.max.z) / 2;
            const top = b0.max.y;
            spawns.push(
              [cx +  8, top + 0.1, cz +  8],
              [cx -  8, top + 0.1, cz +  8],
              [cx +  8, top + 0.1, cz -  8],
              [cx -  8, top + 0.1, cz -  8],
              [cx,      top + 0.1, cz     ]
            );
          }

          console.log('[map-loader] ' + MAP_FILE + ' loaded · ' +
                      colliders.length + ' colliders · ' +
                      spawns.length    + ' spawns');

          resolve({ scene, colliders, spawns });
        } catch (err) { reject(err); }
      }, reject);
    }))
    .catch(err => {
      console.error('[map-loader] failed, procedural fallback will run:', err);
      return null;
    });
})();
