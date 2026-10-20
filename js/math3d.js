/* Damas poliédricas · Copyright © 2026 Juan Luis Salas García */

'use strict';

/* Utilidades de álgebra 3D: vectores, cuaterniones y matrices de rotación.
   Los vectores son arrays [x, y, z]; los cuaterniones, [w, x, y, z]. */

const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a, k) => [a[0] * k, a[1] * k, a[2] * k],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
  norm(a) {
    const l = V.len(a);
    return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

const Q = {
  identity: () => [1, 0, 0, 0],

  /* Rotación de `angle` radianes alrededor del eje unitario `axis`. */
  fromAxisAngle(axis, angle) {
    const u = V.norm(axis);
    const h = angle / 2;
    const s = Math.sin(h);
    return [Math.cos(h), u[0] * s, u[1] * s, u[2] * s];
  },

  /* Rotación mínima que lleva la dirección `from` sobre la dirección `to`. */
  fromTo(from, to) {
    const a = V.norm(from);
    const b = V.norm(to);
    const d = V.dot(a, b);
    if (d > 0.999999) return Q.identity();
    if (d < -0.999999) {
      // Antiparalelos: cualquier eje perpendicular sirve.
      let axis = V.cross(a, [1, 0, 0]);
      if (V.len(axis) < 1e-6) axis = V.cross(a, [0, 1, 0]);
      return Q.fromAxisAngle(axis, Math.PI);
    }
    const c = V.cross(a, b);
    return Q.normalize([1 + d, c[0], c[1], c[2]]);
  },

  mul(a, b) {
    const [aw, ax, ay, az] = a;
    const [bw, bx, by, bz] = b;
    return [
      aw * bw - ax * bx - ay * by - az * bz,
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
    ];
  },

  normalize(q) {
    const l = Math.hypot(q[0], q[1], q[2], q[3]);
    return l < 1e-12 ? Q.identity() : [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  },

  /* Interpolación esférica, tomando siempre el camino corto. */
  slerp(a, b, t) {
    let cos = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let end = b;
    if (cos < 0) {
      cos = -cos;
      end = [-b[0], -b[1], -b[2], -b[3]];
    }
    if (cos > 0.9995) {
      return Q.normalize([
        a[0] + (end[0] - a[0]) * t,
        a[1] + (end[1] - a[1]) * t,
        a[2] + (end[2] - a[2]) * t,
        a[3] + (end[3] - a[3]) * t,
      ]);
    }
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sin;
    const wb = Math.sin(t * theta) / sin;
    return [
      a[0] * wa + end[0] * wb,
      a[1] * wa + end[1] * wb,
      a[2] * wa + end[2] * wb,
      a[3] * wa + end[3] * wb,
    ];
  },

  /* Aplica la rotación del cuaternión a un vector. */
  rotate(q, v) {
    const [w, x, y, z] = q;
    // t = 2 * (q_vec x v);  v' = v + w*t + q_vec x t
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx),
    ];
  },
};
