'use strict';
/* Minimal THREE r128-shaped mock: REAL math for Vector3/Quaternion/Euler/Matrix4/Object3D hierarchy
   (so forward-kinematics tests are trustworthy); inert stubs for everything render-only. */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; this.isVector3 = true; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new Vector3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  setScalar(s) { this.x = s; this.y = s; this.z = s; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { return this.multiplyScalar(1 / (this.length() || 1)); }
  applyQuaternion(q) {
    const { x, y, z } = this, ix = q.w * x + q.y * z - q.z * y, iy = q.w * y + q.z * x - q.x * z, iz = q.w * z + q.x * y - q.y * x, iw = -q.x * x - q.y * y - q.z * z;
    this.x = ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y; this.y = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z; this.z = iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x; return this;
  }
  applyEuler(e) { return this.applyQuaternion(new Quaternion().setFromEuler(e)); }
  applyMatrix4(m) { const e = m.elements, { x, y, z } = this, w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    this.x = (e[0] * x + e[4] * y + e[8] * z + e[12]) * w; this.y = (e[1] * x + e[5] * y + e[9] * z + e[13]) * w; this.z = (e[2] * x + e[6] * y + e[10] * z + e[14]) * w; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
}
class Euler {
  constructor(x = 0, y = 0, z = 0, o = 'XYZ') { this._x = x; this._y = y; this._z = z; this.order = o; this._cb = null; }
  get x() { return this._x; } set x(v) { this._x = v; this._cb && this._cb(); }
  get y() { return this._y; } set y(v) { this._y = v; this._cb && this._cb(); }
  get z() { return this._z; } set z(v) { this._z = v; this._cb && this._cb(); }
  set(x, y, z, o) { this._x = x; this._y = y; this._z = z; if (o) this.order = o; this._cb && this._cb(); return this; }
  setFromQuaternion(q, order) {
    const m = new Matrix4().makeRotationFromQuaternion(q).elements; this.order = order || this.order;
    if (this.order !== 'YXZ') throw new Error('mock Euler.setFromQuaternion supports YXZ only');
    this._x = Math.asin(-clamp(m[9], -1, 1));
    if (Math.abs(m[9]) < 0.9999999) { this._y = Math.atan2(m[8], m[10]); this._z = Math.atan2(m[1], m[5]); } else { this._y = Math.atan2(-m[2], m[0]); this._z = 0; }
    return this;
  }
}
class Quaternion {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; this.isQuaternion = true; this._cb = null; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; this._cb && this._cb(); return this; }
  copy(q) { return this.set(q.x, q.y, q.z, q.w); }
  clone() { return new Quaternion(this.x, this.y, this.z, this.w); }
  setFromEuler(e) {
    const c1 = Math.cos(e._x / 2), c2 = Math.cos(e._y / 2), c3 = Math.cos(e._z / 2), s1 = Math.sin(e._x / 2), s2 = Math.sin(e._y / 2), s3 = Math.sin(e._z / 2);
    if (e.order !== 'XYZ') throw new Error('mock Quaternion.setFromEuler supports XYZ only');
    return this.set(s1 * c2 * c3 + c1 * s2 * s3, c1 * s2 * c3 - s1 * c2 * s3, c1 * c2 * s3 + s1 * s2 * c3, c1 * c2 * c3 - s1 * s2 * s3);
  }
  setFromUnitVectors(a, b) {
    let r = a.dot(b) + 1;
    if (r < 1e-6) { r = 0; if (Math.abs(a.x) > Math.abs(a.z)) this.set(-a.y, a.x, 0, r); else this.set(0, -a.z, a.y, r); }
    else this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x, r);
    const l = Math.hypot(this.x, this.y, this.z, this.w) || 1; return this.set(this.x / l, this.y / l, this.z / l, this.w / l);
  }
  setFromRotationMatrix(m) {
    const e = m.elements, tr = e[0] + e[5] + e[10];
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); return this.set((e[6] - e[9]) * s, (e[8] - e[2]) * s, (e[1] - e[4]) * s, 0.25 / s); }
    if (e[0] > e[5] && e[0] > e[10]) { const s = 2 * Math.sqrt(1 + e[0] - e[5] - e[10]); return this.set(0.25 * s, (e[4] + e[1]) / s, (e[8] + e[2]) / s, (e[6] - e[9]) / s); }
    if (e[5] > e[10]) { const s = 2 * Math.sqrt(1 + e[5] - e[0] - e[10]); return this.set((e[4] + e[1]) / s, 0.25 * s, (e[9] + e[6]) / s, (e[8] - e[2]) / s); }
    const s = 2 * Math.sqrt(1 + e[10] - e[0] - e[5]); return this.set((e[8] + e[2]) / s, (e[9] + e[6]) / s, 0.25 * s, (e[1] - e[4]) / s);
  }
}
class Matrix4 {
  constructor() { this.elements = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; }
  makeRotationFromQuaternion(q) { return this.compose(new Vector3(), q, new Vector3(1, 1, 1)); }
  compose(p, q, s) {
    const { x, y, z, w } = q, x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2, e = this.elements;
    e[0] = (1 - (yy + zz)) * s.x; e[1] = (xy + wz) * s.x; e[2] = (xz - wy) * s.x; e[3] = 0;
    e[4] = (xy - wz) * s.y; e[5] = (1 - (xx + zz)) * s.y; e[6] = (yz + wx) * s.y; e[7] = 0;
    e[8] = (xz + wy) * s.z; e[9] = (yz - wx) * s.z; e[10] = (1 - (xx + yy)) * s.z; e[11] = 0;
    e[12] = p.x; e[13] = p.y; e[14] = p.z; e[15] = 1; return this;
  }
  multiplyMatrices(a, b) { const A = a.elements, B = b.elements, r = new Array(16);
    for (let c = 0; c < 4; c++) for (let rw = 0; rw < 4; rw++) { let v = 0; for (let k = 0; k < 4; k++) v += A[k * 4 + rw] * B[c * 4 + k]; r[c * 4 + rw] = v; }
    this.elements = r; return this; }
  invert() { /* general 4x4 via Gauss-Jordan */
    const n = 4, a = []; for (let r = 0; r < n; r++) { a.push([]); for (let c = 0; c < n; c++) a[r].push(this.elements[c * 4 + r]); for (let c = 0; c < n; c++) a[r].push(r === c ? 1 : 0); }
    for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(a[r][i]) > Math.abs(a[p][i])) p = r; [a[i], a[p]] = [a[p], a[i]];
      const d = a[i][i] || 1e-12; for (let c = 0; c < 2 * n; c++) a[i][c] /= d;
      for (let r = 0; r < n; r++) if (r !== i) { const f = a[r][i]; for (let c = 0; c < 2 * n; c++) a[r][c] -= f * a[i][c]; } }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) this.elements[c * 4 + r] = a[r][n + c]; return this; }
}
class Object3D {
  constructor() {
    this.position = new Vector3(); this.quaternion = new Quaternion(); this.rotation = new Euler(); this.scale = new Vector3(1, 1, 1); this.up = new Vector3(0, 1, 0);
    this.children = []; this.parent = null; this.visible = true; this.name = ''; this.userData = {}; this.matrixWorld = new Matrix4(); this.isObject3D = true;
    this.rotation._cb = () => { const q = new Quaternion().setFromEuler(this.rotation); this.quaternion.x = q.x; this.quaternion.y = q.y; this.quaternion.z = q.z; this.quaternion.w = q.w; };
    this.quaternion._cb = null;
  }
  add(o) { if (o.parent) o.parent.remove(o); o.parent = this; this.children.push(o); return this; }
  remove(o) { const i = this.children.indexOf(o); if (i >= 0) { this.children.splice(i, 1); o.parent = null; } return this; }
  traverse(fn) { fn(this); for (const c of this.children) c.traverse(fn); }
  getObjectByName(n) { if (this.name === n) return this; for (const c of this.children) { const r = c.getObjectByName(n); if (r) return r; } return undefined; }
  updateMatrixWorld() { const m = new Matrix4().compose(this.position, this.quaternion, this.scale);
    this.matrixWorld = this.parent ? new Matrix4().multiplyMatrices(this.parent.matrixWorld, m) : m; for (const c of this.children) c.updateMatrixWorld(); }
  getWorldPosition(v) { this.updateRoot(); const e = this.matrixWorld.elements; return v.set(e[12], e[13], e[14]); }
  updateRoot() { let r = this; while (r.parent) r = r.parent; r.updateMatrixWorld(); }
  worldToLocal(v) { this.updateRoot(); const m = new Matrix4(); m.elements = this.matrixWorld.elements.slice(); return v.applyMatrix4(m.invert()); }
  getWorldDirection(v) { const e = this.matrixWorld.elements; return v.set(-e[8], -e[9], -e[10]).normalize(); }
  lookAt(x, y, z) {
    const eye = this.position, zA = new Vector3(eye.x - x, eye.y - y, eye.z - z).normalize();
    let xA = new Vector3(this.up.y * zA.z - this.up.z * zA.y, this.up.z * zA.x - this.up.x * zA.z, this.up.x * zA.y - this.up.y * zA.x); if (xA.length() < 1e-6) xA = new Vector3(1, 0, 0); xA.normalize();
    const yA = new Vector3(zA.y * xA.z - zA.z * xA.y, zA.z * xA.x - zA.x * xA.z, zA.x * xA.y - zA.y * xA.x), m = new Matrix4();
    m.elements = [xA.x, xA.y, xA.z, 0, yA.x, yA.y, yA.z, 0, zA.x, zA.y, zA.z, 0, 0, 0, 0, 1];
    this.quaternion.setFromRotationMatrix(m);
  }
}
class Group extends Object3D {} class Scene extends Object3D {} class Bone extends Object3D { constructor() { super(); this.isBone = true; } }
class Mesh extends Object3D { constructor(g, m) { super(); this.geometry = g; this.material = m; this.isMesh = true; } }
class Line extends Mesh {} class Points extends Mesh {}
class Attr { constructor(a, n) { this.array = a; this.itemSize = n; this.count = a ? a.length / n : 0; this.needsUpdate = false; } getX() { return 0; } getY() { return 0; } getZ() { return 0; } setXY() {} setXYZ() {} }
class BufferGeometry { constructor() { this.attributes = {}; this.disposed = false; } setAttribute(n, a) { this.attributes[n] = a; return this; } setIndex(i) { this.index = i; return this; } dispose() { this.disposed = true; } }
class PrimGeo extends BufferGeometry { constructor() { super(); for (const k of ['position', 'uv', 'normal']) this.attributes[k] = new Attr(new Float32Array(0), 3); } computeVertexNormals() {} }
class Mat { constructor(o = {}) { Object.assign(this, o); this.color = new Color(o.color); this.disposed = false; this.uniforms = o.uniforms; } dispose() { this.disposed = true; } }
class Color { constructor(c = 0xffffff) { this.hex = c; } setHex(h) { this.hex = h; return this; } }
class Light extends Object3D { constructor() { super(); this.target = new Object3D(); this.intensity = 1; } }
const THREE = {
  Vector3, Euler, Quaternion, Matrix4, Object3D, Group, Scene, Bone, Mesh, Line, Points, BufferGeometry, Color,
  BufferAttribute: Attr, Float32BufferAttribute: Attr,
  BoxGeometry: PrimGeo, ConeGeometry: PrimGeo, CircleGeometry: PrimGeo, RingGeometry: PrimGeo, OctahedronGeometry: PrimGeo, IcosahedronGeometry: PrimGeo,
  LineBasicMaterial: Mat, MeshBasicMaterial: Mat, MeshStandardMaterial: Mat, PointsMaterial: Mat, ShaderMaterial: Mat,
  SpotLight: class extends Light { constructor(c, i) { super(); this.intensity = i; } },
  AnimationClip: class { constructor(n, d, t) { this.name = n; this.tracks = t; } }, QuaternionKeyframeTrack: class {}, VectorKeyframeTrack: class {},
  CanvasTexture: class { constructor() { this.isTexture = true; } },
  AdditiveBlending: 2, DoubleSide: 2, FrontSide: 0, NearestFilter: 1, NearestMipmapLinearFilter: 2, SRGBColorSpace: 's', sRGBEncoding: 3,
};

/* ---- DOM stub ---- */
function makeDoc() {
  const mk = (tag) => { const e = {
    tag, children: [], style: { setProperty() {} }, className: '', textContent: '', _l: {}, offsetWidth: 1, attrs: {}, parent: null, muted: false, loop: false, src: '',
    classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); }, toggle(c, f) { (f === undefined ? !this._s.has(c) : f) ? this._s.add(c) : this._s.delete(c); } },
    appendChild(c) { c.parent = e; e.children.push(c); return c; }, remove() { if (e.parent) e.parent.children = e.parent.children.filter((x) => x !== e); },
    setAttribute(k, v) { e.attrs[k] = v; }, addEventListener(t, f) { (e._l[t] = e._l[t] || []).push(f); }, click() { (e._l.click || []).forEach((f) => f({ target: e })); },
    play() { return Promise.resolve(); }, pause() {},
  }; Object.defineProperty(e, 'className', { get() { return [...e.classList._s].join(' '); }, set(v) { e.classList._s = new Set(String(v).split(/\s+/).filter(Boolean)); } }); return e; };
  const doc = { body: mk('body'), createElement: mk, _l: {}, addEventListener(t, f) { (doc._l[t] = doc._l[t] || []).push(f); } };
  return doc;
}
module.exports = { THREE, makeDoc };
