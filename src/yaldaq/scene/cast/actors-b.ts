// The look and the acts of the trading side: the mechanic, the pricer, the bouncer, the
// desk clock, the treasurer, and the foreman.
import {
  CylinderGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Vector3,
} from 'three';
import type { Group } from 'three';
import type { Actor } from '../../data/contract';
import { clamp01, smooth, texture } from '../kit';
import {
  ORIGIN,
  S,
  SKIN,
  WAX,
  bump,
  env,
  glow,
  hopCurve,
  own,
  spawnBang,
  spawnGlyph,
  to,
  walkSteps,
} from './core';
import type { Builder, Step } from './core';
import { buildCoin, cap, clipboard, hair, rigPerson, stampTool } from './rig';

export const ACTORS_B: Partial<Record<Actor, Builder>> = {
  ladder(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: SKIN.d,
      shirt: '#8fb8de',
      pants: '#e08a1e',
      shoes: '#4a3526',
    }));
    hair(F, r, '#3a2416');
    cap(F, r, '#e08a1e', true);
    const ty = r.legH + r.torsoH;
    // Overalls: a bib, straps, and the lower part.
    F.box([0.32, 0.24, 0.02], [0, ty - 0.2, r.d / 2 + 0.008], '#e08a1e', null, r.body);
    F.box([r.w + 0.01, 0.14, r.d + 0.01], [0, r.legH + 0.07, 0], '#e08a1e', null, r.body);
    for (const s of [-1, 1]) {
      F.box([0.05, 0.12, 0.02], [s * 0.12, ty - 0.05, r.d / 2 + 0.01], '#e08a1e', null, r.body);
      F.box([0.04, 0.04, 0.025], [s * 0.12, ty - 0.1, r.d / 2 + 0.02], '#3a3a3c', null, r.body);
    }
    // A wrench in the right hand. It points along the forearm.
    const wr = F.sub([0, 0, 0], r.body);
    F.box([0.035, 0.2, 0.025], [0, -0.08, 0], '#9aa3ab', null, wr);
    F.box([0.08, 0.05, 0.025], [0, -0.19, 0], '#9aa3ab', null, wr);
    c.carry.push({ obj: wr, hand: 'R', off: [0, 0.03, 0.02], rot: () => [c.sm.rx, 0, 0] });
    // A small A-frame ladder. It turns about its foot.
    const st = P.sub([0.62, 0, -0.06]);
    const piv = P.sub([0.15, 0, 0], st);
    const al = '#c0c6cc';
    for (const s of [-1, 1]) {
      P.beam([s * 0.17 - 0.15, 0, 0.08], [s * 0.11 - 0.15, 1.0, 0], 0.045, al, piv);
      P.beam([s * 0.15 - 0.15, 0, -0.32], [s * 0.11 - 0.15, 0.98, -0.02], 0.035, '#a9b0b7', piv);
    }
    for (const y of [0.25, 0.5, 0.75]) {
      P.box(
        [2 * (0.17 - 0.06 * y), 0.035, 0.07],
        [-0.15, y, 0.08 - 0.08 * y],
        '#7d858c',
        null,
        piv,
      );
    }
    P.box([0.3, 0.05, 0.16], [-0.15, 1.01, -0.02], '#e08a1e', null, piv);
    c.mark('prop', [0.62, 1.05, -0.06]);
    c.mark('slot', [0.62, 0.55, 0.15]);
    c.def('fix', () => [
      S(
        2.4,
        (u, p) => {
          c.facing = 0.95 * env(u, 0, 0.12, 0.85, 1);
          let tilt;
          if (u < 0.15) tilt = -0.3 * smooth(u / 0.15);
          else if (u < 0.5) tilt = -0.3 + 0.04 * Math.sin((u - 0.15) * 40);
          else tilt = -0.3 * (1 - smooth((u - 0.5) / 0.22)) + 0.05 * bump(u, 0.68, 0.85);
          piv.rotation.z = tilt;
          to(p, { lx: -1.45, lz: 0.35, hy: 0.35, hp: -0.1 }, env(u, 0.1, 0.25, 0.8, 0.95));
          to(p, { rx: -1.2 + 0.45 * Math.sin(u * Math.PI * 10) }, env(u, 0.18, 0.28, 0.6, 0.7));
          p.hp += 0.15 * bump(u, 0.78, 0.95);
        },
        { end: () => (piv.rotation.z = 0) },
      ),
    ]);
    c.resets.push(() => (piv.rotation.z = 0));
    c.main = 'fix';
  },

  policy(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, { skin: SKIN.b, shirt: '#f4f1ea', pants: '#3d3a45' }));
    hair(F, r, '#2e1f16');
    cap(F, r, '#c2548a');
    F.box(
      [0.4, 0.36, 0.02],
      [0, r.legH + r.torsoH * 0.45, r.d / 2 + 0.008],
      '#c2548a',
      null,
      r.body,
    );
    F.box(
      [0.03, 0.03, 0.16],
      [-(r.headW / 2 + 0.015), r.headH * 0.55, 0.02],
      '#f2c94c',
      null,
      r.head,
    );
    // The counter, with fold-up signs on the left end and a place for the order slip.
    const st = P.sub([0, 0, 0.44]);
    P.box([0.98, 0.48, 0.28], [0, 0.24, 0], '#e7d3b8', null, st);
    P.box([1.04, 0.05, 0.34], [0, 0.505, 0], '#8a5a35', null, st);
    P.box([0.98, 0.07, 0.01], [0, 0.36, 0.145], '#c2548a', null, st);
    for (let i = 0; i < 3; i++) {
      P.box(
        [0.3, 0.018, 0.2],
        [0.3, 0.54 + i * 0.02, -0.01],
        i % 2 ? '#fff4f8' : '#c2548a',
        [0, 0.1 * (i - 1), 0],
        st,
      );
    }
    const slip = P.box([0.16, 0.008, 0.12], [-0.3, 0.534, -0.02], '#fbfaf6', null, st);
    const seal = P.cyl(0.03, 0.012, [-0.3, 0.54, -0.02], WAX, null, st);
    slip.visible = seal.visible = false;
    c.mark('prop', [0, 0.53, 0.44]);
    c.mark('slot', [0, 0.56, 0.44]);
    const stamp = stampTool(F, r.body, WAX);
    stamp.visible = false;
    c.carry.push({ obj: stamp, hand: 'R', off: [0, -0.02, 0.02], rot: [0, 0, 0] });
    // One sign for each text, made on first use.
    const signs = new Map<string, { g: Group; board: Group }>();
    const signFor = (text: string): { g: Group; board: Group } => {
      let sign = signs.get(text);
      if (!sign) {
        const g = F.sub([0, 0, 0], r.body);
        F.beam([0, -0.04, 0], [0, 0.42, 0], 0.03, '#8a5a35', g);
        const board = F.sub([0.22, 0.52, 0], g);
        F.box([0.86, 0.26, 0.025], [0, 0, 0], '#c2548a', null, board);
        F.label(text, 0.8, 0.2, [0, 0, 0.014], '#3a2433', '#fff4f8', board);
        g.visible = false;
        c.carry.push({ obj: g, hand: 'R', off: [0, 0, 0], rot: [0, 0, 0] });
        sign = { g, board };
        signs.set(text, sign);
      }
      return sign;
    };
    c.def('sign', (o) => {
      const { g, board } = signFor(String(o.text ?? 'PASS').toUpperCase());
      return [
        S(
          1.1,
          (u, p) => {
            to(p, { rx: -2.75, rz: 0.05, hy: -0.1, hp: -0.1 }, env(u, 0, 0.18, 0.82, 1));
            board.scale.y = Math.max(
              0.05,
              smooth((u - 0.12) / 0.15) * (1 - smooth((u - 0.8) / 0.12)),
            );
            p.y = 0.04 * bump(u, 0.25, 0.45);
          },
          { start: () => (g.visible = true), end: () => (g.visible = false) },
        ),
      ];
    });
    c.def('stamp', () => [
      S(
        1.1,
        (u, p) => {
          const slam = Math.max(bump(u, 0.3, 0.42), bump(u, 0.5, 0.62));
          to(p, { rx: -1.95 + 0.53 * slam, rz: -0.02, hp: 0.2 }, env(u, 0, 0.15, 0.8, 0.95));
          p.sy = 1 - 0.03 * slam;
          if (u > 0.36) seal.visible = true;
          const x = -0.3 - 0.32 * smooth((u - 0.8) / 0.2);
          slip.position.x = seal.position.x = x;
        },
        {
          start: () => ((slip.visible = stamp.visible = true), (seal.visible = false)),
          end: () => (
            (slip.visible = seal.visible = stamp.visible = false),
            (slip.position.x = seal.position.x = -0.3)
          ),
        },
      ),
    ]);
    c.resets.push(() => {
      slip.visible = seal.visible = stamp.visible = false;
      slip.position.x = seal.position.x = -0.3;
      for (const { g } of signs.values()) g.visible = false;
    });
    c.main = 'stamp';
  },

  risk(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: SKIN.e,
      shirt: '#2b2d42',
      pants: '#23243a',
      shoes: '#111216',
      w: 0.56,
      torsoH: 0.46,
      cheeks: false,
    }));
    const ty = r.legH + r.torsoH;
    F.box([0.14, 0.2, 0.02], [0, ty - 0.1, r.d / 2 + 0.005], '#f4f1ea', null, r.body);
    F.box([0.05, 0.17, 0.02], [0, ty - 0.11, r.d / 2 + 0.015], '#3d405b', null, r.body);
    F.box([0.38, 0.09, 0.025], [0, r.headH * 0.53, 0.224], '#111216', null, r.head);
    F.box(
      [0.03, 0.05, 0.04],
      [-(r.headW / 2 + 0.055), r.headH * 0.45, 0.02],
      '#1c1c1e',
      null,
      r.head,
    );
    for (const s of [-1, 1]) {
      F.box(
        [0.05, 0.1, 0.08],
        [s * (r.headW / 2 + 0.02), r.headH * 0.48, 0],
        '#96603f',
        null,
        r.head,
      );
    }
    F.box([0.12, 0.025, 0.02], [0, r.headH * 0.24, 0.212], '#5a3423', null, r.head);
    c.base = { lx: -0.6, rx: -0.6, lz: -0.5, rz: -0.5 };
    // A door and a rope on two gold posts.
    const dr = P.sub([-0.74, 0, -0.26]);
    for (const s of [-1, 1]) P.box([0.07, 1.0, 0.1], [s * 0.25, 0.5, 0], '#2b2d42', null, dr);
    P.box([0.6, 0.08, 0.1], [0, 1.0, 0], '#2b2d42', null, dr);
    P.box([0.44, 0.93, 0.04], [0, 0.465, -0.02], '#5b4b8a', null, dr);
    for (const y of [0.28, 0.68]) P.box([0.32, 0.28, 0.012], [0, y, 0.004], '#6c5c9c', null, dr);
    P.box([0.05, 0.05, 0.05], [0.15, 0.47, 0.02], '#d4a72c', null, dr);
    P.box([0.16, 0.06, 0.06], [0, 1.08, 0.03], '#d4a72c', null, dr);
    const gold = '#d4a72c';
    const rp = P.sub([0, 0, 0.24]);
    for (const x of [-1.0, -0.46]) {
      P.cyl(0.08, 0.03, [x, 0.015, 0], gold, null, rp);
      P.cyl(0.025, 0.5, [x, 0.27, 0], gold, null, rp);
      P.cyl(0.045, 0.05, [x, 0.53, 0], gold, null, rp);
    }
    const rope = P.sub([0, 0, 0], rp);
    P.beam([-1.0, 0.48, 0], [-0.73, 0.36, 0], 0.04, '#b23a48', rope);
    P.beam([-0.73, 0.36, 0], [-0.46, 0.48, 0], 0.04, '#b23a48', rope);
    c.mark('prop', [-0.74, 1.12, -0.26]);
    c.mark('slot', [-0.73, 0.6, 0.24]);
    c.def('block', () => [
      S(
        1.1,
        (u, p) => {
          const e = env(u, 0, 0.15, 0.8, 1);
          c.facing = -0.55 * e;
          to(p, { rx: -1.55, rz: 0.2, lean: -0.05 }, e);
          to(p, { hy: -0.2 + 0.32 * Math.sin(u * Math.PI * 6) * env(u, 0.2, 0.3, 0.7, 0.8) }, e);
          rope.position.y = 0.03 * Math.sin(u * 30) * env(u, 0.1, 0.2, 0.5, 0.7);
        },
        {
          start: () => spawnGlyph(c, '✕', '#d63c3c', [-0.73, 0.82, 0.24]),
          end: () => (rope.position.y = 0),
        },
      ),
    ]);
    c.resets.push(() => (rope.position.y = 0));
    c.main = 'block';
  },

  loop(c) {
    const { F, P } = c;
    const AMB = '#e8b923';
    const r = (c.rig = rigPerson(F, {
      skin: '#f7f3ea',
      shirt: AMB,
      pants: '#5a4a3a',
      hand: '#f7f3ea',
      noHead: true,
      torsoH: 0.32,
      w: 0.4,
    }));
    // The head is a clock with two bells.
    const hd = r.head;
    F.box([0.6, 0.06, 0.34], [0, 0.03, 0], '#c99a12', null, hd);
    F.box([0.56, 0.54, 0.32], [0, 0.32, 0], AMB, null, hd);
    const dial = own(
      F.cyl(0.22, 0.02, [0, 0.32, 0.165], '#fbf6ea', [Math.PI / 2, 0, 0], hd),
      '#fbf6ea',
    );
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const big = i % 3 === 0;
      F.box(
        [big ? 0.03 : 0.02, big ? 0.06 : 0.035, 0.01],
        [Math.sin(a) * 0.175, 0.32 + Math.cos(a) * 0.175, 0.178],
        '#3a3330',
        [0, 0, -a],
        hd,
      );
    }
    const mh = F.sub([0, 0.32, 0.182], hd);
    F.box([0.024, 0.17, 0.01], [0, 0.075, 0], '#2b2b30', null, mh);
    mh.rotation.z = -Math.PI / 3;
    const hh = F.sub([0, 0.32, 0.188], hd);
    F.box([0.034, 0.11, 0.01], [0, 0.045, 0], '#2b2b30', null, hh);
    hh.rotation.z = Math.PI / 3;
    F.cyl(0.025, 0.02, [0, 0.32, 0.198], '#d64545', [Math.PI / 2, 0, 0], hd);
    const bells = F.sub([0, 0.59, 0], hd);
    for (const s of [-1, 1]) {
      F.cyl(0.1, 0.09, [s * 0.18, 0.07, 0], '#d9a521', [0, 0, -s * 0.45], bells);
      F.box([0.025, 0.06, 0.025], [s * 0.12, 0.01, 0], '#7a6a3a', null, bells);
    }
    F.box([0.03, 0.1, 0.03], [0, 0.06, 0], '#7a6a3a', null, bells);
    F.box([0.07, 0.045, 0.045], [0, 0.12, 0], '#7a6a3a', null, bells);
    r.headH = 0.6;
    r.eyes = [];
    // The trading desk: a small chart screen and an alarm lamp.
    const st = P.sub([0, 0, 0.46]);
    P.box([0.94, 0.05, 0.36], [0, 0.5, 0], '#8a5a35', null, st);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1])
        P.box([0.05, 0.48, 0.05], [sx * 0.42, 0.24, sz * 0.14], '#6e4628', null, st);
    }
    P.box([0.9, 0.26, 0.02], [0, 0.34, 0.16], '#a87b4f', null, st);
    const mon = P.sub([-0.28, 0.525, -0.02], st);
    mon.rotation.y = 0.25;
    P.box([0.05, 0.08, 0.05], [0, 0.04, 0], '#3a3a3c', null, mon);
    P.box([0.3, 0.2, 0.04], [0, 0.18, 0], '#3a3a3c', null, mon);
    const chart = new Mesh(
      new PlaneGeometry(0.26, 0.16),
      new MeshBasicMaterial({ map: texture(chartCanvas()) }),
    );
    chart.position.set(0, 0.18, 0.021);
    mon.add(chart);
    P.box([0.1, 0.04, 0.1], [0.32, 0.545, 0], '#3a3a3c', null, st);
    const lamp = own(P.cyl(0.05, 0.09, [0.32, 0.61, 0], '#7a2a2a', null, st), '#7a2a2a');
    P.box([0.15, 0.025, 0.19], [0.08, 0.538, 0.02], '#fbfaf6', [0, 0.2, 0], st);
    c.mark('prop', [0, 0.53, 0.46]);
    c.mark('slot', [0.08, 0.56, 0.48]);
    c.tickers.push(() => {
      const on = c.alarm;
      dial.material.color.set(on ? '#ff8a80' : '#fbf6ea');
      lamp.material.color.set(on ? '#e53935' : '#7a2a2a');
      glow(lamp, '#ff2a1a', on && Math.sin(c.time * 9) > 0 ? 1 : 0);
    });
    // Ring lines beside the bells. They show only while the clock rings.
    const rings = F.sub([0, 0.66, 0.04], hd);
    for (const s of [-1, 1]) {
      for (const a of [-0.55, 0, 0.55]) {
        const m = F.box(
          [0.17, 0.04, 0.03],
          [s * Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0],
          '#d9480f',
          [0, 0, s * a],
          rings,
        );
        m.castShadow = false;
      }
    }
    rings.visible = false;
    /** The ring of one trading cycle: the bells and the clock shake, ring lines flash two times, and the minute hand jumps one step. */
    c.def('tick', () => {
      let m0 = 0;
      let h0 = 0;
      return [
        S(
          1.2,
          (u, p) => {
            const k = smooth((u - 0.06) / 0.1);
            mh.rotation.z = m0 - (Math.PI / 6) * k;
            hh.rotation.z = h0 - (Math.PI / 72) * k;
            const shake = env(u, 0.03, 0.08, 0.78, 0.92);
            bells.rotation.z = 0.28 * Math.sin(u * 95) * shake;
            p.hr = 0.09 * Math.sin(u * 70) * shake;
            p.y = 0.09 * bump(u, 0.02, 0.2) + 0.05 * bump(u, 0.45, 0.6);
            to(p, { lz: 0.55, rz: 0.55, lx: -0.3, rx: -0.3 }, shake);
            const w = Math.max(bump(u, 0.05, 0.42), bump(u, 0.42, 0.8));
            rings.visible = w > 0.05;
            rings.scale.setScalar(0.8 + 0.35 * w);
          },
          {
            start: () => ((m0 = mh.rotation.z), (h0 = hh.rotation.z)),
            end: () => ((bells.rotation.z = 0), (rings.visible = false)),
          },
        ),
      ];
    });
    c.resets.push(() => {
      bells.rotation.z = 0;
      rings.visible = false;
      const step = Math.PI / 6;
      mh.rotation.z = Math.round(mh.rotation.z / step) * step;
    });
    c.main = 'tick';
  },

  cost(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, { skin: SKIN.a, shirt: '#f4f1ea', pants: '#2f3a33' }));
    hair(F, r, '#7a4a26');
    const ty = r.legH + r.torsoH;
    F.box(
      [r.w + 0.01, r.torsoH - 0.08, r.d + 0.01],
      [0, r.legH + (r.torsoH - 0.08) / 2, 0],
      '#2e9e5b',
      null,
      r.body,
    );
    F.box([0.1, 0.02, 0.02], [0.08, ty - 0.2, r.d / 2 + 0.012], '#e0b84a', null, r.body);
    // A bowler hat.
    F.cyl(0.29, 0.03, [0, r.headH + 0.01, 0], '#1f4d33', null, r.head);
    F.cyl(0.19, 0.16, [0, r.headH + 0.1, 0], '#1f4d33', null, r.head);
    F.cyl(0.195, 0.03, [0, r.headH + 0.04, 0], '#10281b', null, r.head);
    // The glass jar on a stand. The red rim at the top is the daily cap.
    const st = P.sub([0.6, 0, 0.02]);
    P.box([0.32, 0.4, 0.32], [0, 0.2, 0], '#e3dccd', null, st);
    P.box([0.36, 0.04, 0.36], [0, 0.42, 0], '#cfc6b3', null, st);
    P.cyl(0.175, 0.015, [0, 0.447, 0], '#bcd9e2', null, st);
    const fill = P.cyl(0.15, 1, [0, 0.455, 0], '#f2c94c', null, st);
    const glass = new Mesh(
      new CylinderGeometry(0.175, 0.175, 0.44, 24, 1, true),
      new MeshLambertMaterial({
        color: '#d8eef5',
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: DoubleSide,
      }),
    );
    glass.position.y = 0.66;
    glass.renderOrder = 2;
    st.add(glass);
    const rim = new Mesh(
      new CylinderGeometry(0.185, 0.185, 0.035, 24, 1, true),
      new MeshLambertMaterial({ color: '#d64545', side: DoubleSide }),
    );
    rim.position.y = 0.87;
    st.add(rim);
    c.mark('prop', [0.6, 0.9, 0.02]);
    c.mark('slot', [0.6, 0.95, 0.02]);
    const TOP = 0.455;
    const FULL = 0.4;
    let shown = 0;
    const setFill = (x: number): void => {
      const h = Math.max(0.001, x * FULL);
      fill.scale.y = h;
      fill.position.y = TOP + h / 2;
    };
    setFill(0);
    c.tickers.push((dt) => {
      shown += (c.level - shown) * (1 - Math.exp(-dt * 4));
      setFill(shown);
    });
    const coin = buildCoin();
    coin.visible = false;
    c.root.add(coin);
    c.def('coin', () => {
      const from = new Vector3();
      const mouth = new Vector3();
      let flying = false;
      return [
        S(
          1.1,
          (u, p) => {
            to(p, { lx: -1.9, lz: 0.3, hy: 0.6, hp: -0.15 }, env(u, 0, 0.15, 0.75, 0.95));
            if (u < 0.25) {
              coin.visible = u > 0.08;
              coin.position.copy(c.local(c.rig.handL));
              coin.position.y += 0.06;
              return;
            }
            if (!flying) {
              flying = true;
              from.copy(coin.position);
              mouth.copy(c.spaceToRoot(new Vector3(0.6, 1.0, 0.02)));
            }
            const s = clamp01((u - 0.25) / 0.45);
            coin.position.lerpVectors(from, mouth, s);
            coin.position.y += 0.35 * 4 * s * (1 - s);
            coin.rotation.x = u * 30;
            if (u > 0.7) {
              const bottom = c.spaceToRoot(new Vector3(0.6, TOP + shown * FULL + 0.04, 0.02));
              coin.position.lerpVectors(mouth, bottom, smooth((u - 0.7) / 0.15));
              coin.rotation.x = Math.PI / 2;
            }
            coin.visible = u < 0.86;
          },
          { start: () => (coin.visible = false), end: () => (coin.visible = false) },
        ),
      ];
    });
    c.resets.push(() => (coin.visible = false));
    c.main = 'coin';
  },

  supervisor(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: SKIN.d,
      shirt: '#4a6fa5',
      pants: '#34495e',
      shoes: '#5a3a1e',
    }));
    hair(F, r, '#2e1f16');
    // A hard hat and a hi-vis vest with stripes.
    const { headW: W, headH: H } = r;
    F.box([W + 0.06, 0.16, 0.46], [0, H + 0.07, 0], '#f5c518', null, r.head);
    F.box([W + 0.14, 0.03, 0.54], [0, H + 0.0, 0.02], '#f5c518', null, r.head);
    F.box([0.08, 0.04, 0.46], [0, H + 0.16, 0], '#e0b000', null, r.head);
    F.box(
      [r.w + 0.01, r.torsoH - 0.04, r.d + 0.01],
      [0, r.legH + (r.torsoH - 0.04) / 2, 0],
      '#cddc39',
      null,
      r.body,
    );
    for (const y of [0.12, 0.27])
      F.box([r.w + 0.02, 0.035, r.d + 0.02], [0, r.legH + y, 0], '#eeeeee', null, r.body);
    const cb = clipboard(F, r.body);
    cb.visible = false;
    c.carry.push({ obj: cb, hand: 'L', off: [-0.04, 0.13, 0.04], rot: [-0.45, 0, 0] });
    const pencil = F.sub([0, 0, 0], r.body);
    F.box([0.02, 0.13, 0.02], [0, 0.02, 0], '#f2c94c', null, pencil);
    pencil.visible = false;
    c.carry.push({ obj: pencil, hand: 'R', off: [0, 0, 0.02], rot: [0.4, 0, 0] });
    // A signal post: green while all is well, red in an alarm.
    const st = P.sub([-0.6, 0, -0.1]);
    P.box([0.24, 0.06, 0.24], [0, 0.03, 0], '#3a3a3c', null, st);
    for (let i = 0; i < 6; i++) {
      P.box([0.06, 0.15, 0.06], [0, 0.135 + i * 0.15, 0], i % 2 ? '#2b2b30' : '#f5c518', null, st);
    }
    P.cyl(0.085, 0.03, [0, 0.96, 0], '#2b2b30', null, st);
    const lamp = own(P.cyl(0.075, 0.13, [0, 1.04, 0], '#58b368', null, st), '#58b368');
    P.cyl(0.06, 0.03, [0, 1.12, 0], '#2b2b30', null, st);
    c.mark('prop', [-0.6, 1.14, -0.1]);
    c.mark('slot', [0, 0.75, 0.4]);
    let flash = false;
    c.tickers.push(() => {
      const red = c.alarm || flash;
      const blink = Math.sin(c.time * 12) > 0;
      lamp.material.color.set(red ? (blink ? '#ff3b30' : '#8a1f1a') : '#58b368');
      glow(lamp, red ? '#ff2a1a' : '#58b368', red ? (blink ? 1 : 0) : 0.25);
    });
    c.def('check', () => [
      S(
        1.3,
        (u, p) => {
          to(p, { lx: -1.25, lz: -0.3, hp: 0.38, hy: 0.25 }, env(u, 0, 0.12, 0.65, 0.78));
          const tickMark = 0.25 * bump(u, 0.35, 0.45) + 0.25 * bump(u, 0.48, 0.58);
          to(p, { rx: -1.1 + tickMark, rz: -0.35 }, env(u, 0.15, 0.25, 0.62, 0.72));
          p.hy += 0.55 * Math.sin(((u - 0.7) / 0.3) * Math.PI * 2) * env(u, 0.7, 0.76, 0.92, 1);
        },
        {
          start: () => (cb.visible = pencil.visible = true),
          end: () => (cb.visible = pencil.visible = false),
        },
      ),
    ]);
    c.def('alarm', (o) => {
      const steps: Step[] = [];
      if (o.runTo)
        steps.push(...walkSteps(c, c.toSpace(o.runTo), { hop: 0.26, h: 0.2, stop: 0.6 }));
      steps.push(
        S(
          1.4,
          (u, p) => {
            const wave = 0.3 * Math.sin(u * Math.PI * 10);
            to(
              p,
              { lx: -2.85, rx: -2.85, lz: 0.35 + wave, rz: 0.35 - wave, hp: -0.1 },
              env(u, 0, 0.1, 0.85, 1),
            );
            const k = hopCurve((u * 2) % 1, 0.25);
            p.y = k.y;
            p.sy = k.sy;
          },
          { start: () => ((flash = true), spawnBang(c)), end: () => (flash = false) },
        ),
      );
      if (o.runTo) steps.push(...walkSteps(c, ORIGIN, { hop: 0.26, h: 0.2, face: 0 }));
      return steps;
    });
    c.resets.push(() => {
      cb.visible = pencil.visible = false;
      flash = false;
    });
    c.main = 'check';
  },
};

/** The small chart on the trading desk screen. It is decoration only and never changes. */
function chartCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 160;
  cv.height = 100;
  const x = cv.getContext('2d');
  if (!x) return cv;
  x.fillStyle = '#1f2a24';
  x.fillRect(0, 0, 160, 100);
  x.strokeStyle = '#6fd18f';
  x.lineWidth = 6;
  x.beginPath();
  [18, 60, 48, 40, 54, 30, 36, 22].forEach((y, i) =>
    i ? x.lineTo(10 + i * 20, y + 10) : x.moveTo(10, y + 10),
  );
  x.stroke();
  return cv;
}
