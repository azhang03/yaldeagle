// The look and the acts of the forecast side: the scout, the librarian, Claude, the actuary,
// and grandpa. Each builder makes the figure (rig and gear), the station prop, the marks
// 'prop' and 'slot', and the acts. c.main is the act of 'work'.
import { Color, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry, Vector3 } from 'three';
import type { Material, Sprite } from 'three';
import type { Actor } from '../../data/contract';
import { clamp, lerpAngle, smooth, texture } from '../kit';
import type { Vec3 } from '../kit';
import { ORIGIN, S, SKIN, bump, env, glow, glyph, lerp, own, ramp, to, walkSteps } from './core';
import type { Builder, Carry, OwnMesh, Step } from './core';
import { buildFolder, cap, glasses, hair, rigPerson } from './rig';

export const ACTORS_A: Partial<Record<Actor, Builder>> = {
  scanner(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: SKIN.b,
      shirt: '#c9b27c',
      pants: '#6b5a3e',
      shoes: '#4a3526',
    }));
    hair(F, r, '#4a2e1a');
    cap(F, r, '#2a9d8f');
    const ty = r.legH + r.torsoH;
    // The scout neckerchief and a backpack.
    F.box([0.24, 0.08, 0.03], [0, ty - 0.06, r.d / 2 + 0.012], '#2a9d8f', null, r.body);
    F.box([0.08, 0.1, 0.03], [0, ty - 0.14, r.d / 2 + 0.012], '#2a9d8f', null, r.body);
    F.box(
      [0.34, 0.32, 0.14],
      [0, r.legH + r.torsoH * 0.55, -r.d / 2 - 0.07],
      '#1f7a6f',
      null,
      r.body,
    );
    // The radar: a dish on a pole.
    const st = P.sub([0.62, 0, -0.1]);
    P.box([0.3, 0.07, 0.3], [0, 0.035, 0], '#7c8794', null, st);
    P.cyl(0.035, 0.66, [0, 0.4, 0], '#9aa5b1', null, st);
    const yaw = P.sub([0, 0.76, 0], st);
    P.box([0.1, 0.08, 0.1], [0, 0, 0], '#7c8794', null, yaw);
    const dish = P.sub([0, 0.04, 0], yaw);
    dish.rotation.x = -0.55;
    P.cyl(0.27, 0.05, [0, 0, 0.05], '#eef2f5', [Math.PI / 2, 0, 0], dish);
    P.cyl(0.21, 0.02, [0, 0, 0.085], '#cfd8e0', [Math.PI / 2, 0, 0], dish);
    P.beam([0, 0, 0.08], [0, 0, 0.3], 0.025, '#7c8794', dish);
    const tip = own(P.box([0.07, 0.07, 0.07], [0, 0, 0.32], '#e9edf1', null, dish), '#e9edf1');
    // A board with one lamp for each of the nine pilot series. A scan lights them one by one.
    const board = P.sub([0, 0.3, 0.24], st);
    for (const s of [-1, 1])
      P.box([0.03, 0.3, 0.03], [s * 0.24, -0.15, -0.02], '#7c8794', null, board);
    const face = P.sub([0, 0, 0], board);
    face.rotation.x = -0.6;
    P.box([0.56, 0.12, 0.04], [0, 0, 0], '#4a525a', null, face);
    const lamps: OwnMesh[] = [];
    for (let i = 0; i < 9; i++) {
      lamps.push(
        own(
          P.box([0.045, 0.06, 0.03], [-0.22 + i * 0.055, 0, 0.025], '#2f3b38', null, face),
          '#2f3b38',
        ),
      );
    }
    const lampOn: number[] = new Array<number>(9).fill(0);
    const LIT = new Color('#7cf0c8');
    const DARK = new Color('#2f3b38');
    c.tickers.push((dt) => {
      lamps.forEach((m, i) => {
        const on = Math.max(0, (lampOn[i] ?? 0) - dt * 0.9);
        lampOn[i] = on;
        m.material.color.copy(DARK).lerp(LIT, on);
        m.material.emissive.set('#3fe0a8');
        m.material.emissiveIntensity = 0.8 * on;
      });
    });
    c.mark('prop', [0.62, 1.08, -0.1]);
    c.mark('slot', [0.3, 0.75, 0.3]);
    // The dish turns slowly while the scout is awake. Scans are fast full turns.
    c.tickers.push((dt) => {
      if (!c.cur && c.idle !== 'nap') yaw.rotation.y += dt * 0.12;
    });
    // A scan: a full sweep of the dish. It lights one lamp for each series (opts.series, default 9).
    c.def('scan', (o) => {
      const small = !!o.small;
      const n = small ? 0 : clamp(Math.round(o.series ?? 9), 0, 9);
      let y0 = 0;
      let lit = 0;
      return [
        S(
          small ? 0.9 : 1.6,
          (u, p) => {
            const e = env(u, 0, 0.15, 0.8, 1);
            yaw.rotation.y = small ? y0 + 0.9 * bump(u, 0, 1) : y0 + Math.PI * 2 * smooth(u);
            glow(tip, '#ff4d3d', small ? 0 : 0.9 * e);
            while (lit < n && u >= 0.08 + (0.72 * lit) / Math.max(1, n - 1)) lampOn[lit++] = 1;
            if (small) {
              // A skip: a short sweep and a head shake.
              to(p, { hy: 0.5, hp: -0.1 }, e);
              p.hy += 0.3 * Math.sin(u * Math.PI * 4) * e;
            } else {
              to(p, { hy: 0.85, hp: -0.3, lx: -2.3, lz: 0.25 }, e);
            }
          },
          { start: () => ((y0 = yaw.rotation.y), (lit = 0)), end: () => glow(tip, '#ff4d3d', 0) },
        ),
      ];
    });
    c.def('ping', () => [
      S(
        0.5,
        (u, p) => {
          dish.rotation.x = -0.55 - 0.22 * bump(u, 0, 0.6);
          glow(tip, '#ff4d3d', bump(u, 0, 0.7));
          p.hp = 0.12 * bump(u, 0.1, 0.6);
        },
        { end: () => ((dish.rotation.x = -0.55), glow(tip, '#ff4d3d', 0)) },
      ),
    ]);
    c.resets.push(() => {
      dish.rotation.x = -0.55;
      glow(tip, '#ff4d3d', 0);
      lampOn.fill(0);
    });
    c.main = 'scan';
  },

  brief(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: SKIN.a,
      shirt: '#8e5bb5',
      pants: '#4a3b5c',
      shoes: '#3a2c40',
    }));
    hair(F, r, '#6b3f22', 'bun');
    const ty = r.legH + r.torsoH;
    F.box([0.2, 0.06, 0.03], [0, ty - 0.04, r.d / 2 + 0.01], '#f4f1ea', null, r.body);
    for (let i = 0; i < 3; i++) {
      F.box(
        [0.035, 0.035, 0.02],
        [0, r.legH + 0.08 + i * 0.1, r.d / 2 + 0.005],
        '#f4f1ea',
        null,
        r.body,
      );
    }
    // A shelf of folders.
    const st = P.sub([-0.66, 0, -0.12]);
    const wood = '#a87b4f';
    for (const s of [-1, 1]) P.box([0.04, 0.94, 0.3], [s * 0.25, 0.47, 0], wood, null, st);
    P.box([0.54, 0.04, 0.3], [0, 0.94, 0], wood, null, st);
    for (const y of [0.04, 0.33, 0.62]) P.box([0.48, 0.03, 0.28], [0, y, 0], wood, null, st);
    P.box([0.48, 0.92, 0.02], [0, 0.47, -0.14], '#8f6540', null, st);
    const tabs = ['#d9534f', '#3f74c9', '#4f9d5d', '#e0a91b'];
    [0.055, 0.345, 0.635].forEach((y, row) => {
      for (let i = 0; i < 5; i++) {
        if (row === 1 && i === 3) continue;
        const x = -0.18 + i * 0.085 + (row % 2) * 0.015;
        const tilt: Vec3 = [0, 0, ((i % 3) - 1) * 0.05];
        P.box([0.055, 0.22, 0.22], [x, y + 0.125, 0.01], '#e8c77a', tilt, st);
        P.box(
          [0.057, 0.035, 0.06],
          [x, y + 0.245, 0.06],
          tabs[(i + row) % 4] ?? '#d9534f',
          tilt,
          st,
        );
      }
    });
    c.mark('prop', [-0.66, 0.97, -0.12]);
    c.mark('slot', [0, 0.62, 0.42]);
    const folder = buildFolder();
    folder.visible = false;
    r.body.add(folder);
    const held: Carry = { obj: folder, hand: 'R', off: [0, 0.02, 0.06], rot: [-0.5, 0, 0] };
    c.carry.push(held);
    c.def('hand', (o) => {
      const hold = clamp(o.dur ?? 0.8, 0.3, 3);
      const shelf = -1.25;
      return [
        S(0.45, (u, p) => {
          c.facing = lerpAngle(0, shelf, smooth(u / 0.5));
          to(p, { rx: -1.6, rz: 0.1, hy: -0.2 }, ramp(u, 0.2, 0.6));
          folder.visible = u > 0.7;
          held.hand = 'R';
        }),
        S(0.3, (u, p) => {
          c.facing = lerpAngle(shelf, 0, smooth(u));
          to(p, { rx: -1.3, lx: -1.3, rz: -0.28, lz: -0.28 }, smooth(u));
          held.hand = u > 0.6 ? 'B' : 'R';
        }),
        S(hold, (u, p) => {
          to(p, { rx: -1.35, lx: -1.35, rz: -0.3, lz: -0.3, hp: 0.1 }, 1);
          p.y = 0.03 * bump(u, 0, 0.5);
          held.hand = 'B';
        }),
        S(0.3, (u, p) => to(p, { rx: -1.35, lx: -1.35, rz: -0.3, lz: -0.3 }, 1 - smooth(u)), {
          start: () => (folder.visible = false),
        }),
      ];
    });
    c.resets.push(() => (folder.visible = false));
    c.main = 'hand';
  },

  claude(c) {
    const { F, P } = c;
    const T = '#d97757';
    const D = '#b25a3e';
    const CR = '#f6ede3';
    const r = (c.rig = rigPerson(F, {
      skin: CR,
      shirt: T,
      pants: D,
      shoes: '#7a3b28',
      hand: CR,
      noHead: true,
      w: 0.48,
      torsoH: 0.42,
    }));
    // A friendly robot head: a visor, two light eyes, ears, and an antenna with a light.
    const H = 0.42;
    F.box([0.26, 0.04, 0.22], [0, 0.01, 0], D, null, r.head);
    F.box([0.52, H, 0.42], [0, H / 2 + 0.03, 0], T, null, r.head);
    F.box([0.42, 0.22, 0.02], [0, 0.25, 0.215], '#3b2a25', null, r.head);
    r.eyes = [-1, 1].map((s) =>
      F.box([0.075, 0.1, 0.02], [s * 0.1, 0.25, 0.228], '#fff1dc', null, r.head),
    );
    for (const s of [-1, 1]) F.box([0.05, 0.14, 0.16], [s * 0.285, 0.23, 0], D, null, r.head);
    F.cyl(0.02, 0.16, [0, H + 0.1, 0], D, null, r.head);
    const bulb = own(F.box([0.08, 0.08, 0.08], [0, H + 0.21, 0], CR, null, r.head), CR);
    r.headH = H;
    // The chest panel with a plain spark of eight rays.
    const cy = r.legH + r.torsoH * 0.55;
    F.box([0.26, 0.22, 0.02], [0, cy, r.d / 2 + 0.01], CR, null, r.body);
    for (let i = 0; i < 4; i++) {
      F.box([0.17, 0.032, 0.012], [0, cy, r.d / 2 + 0.025], T, [0, 0, (i * Math.PI) / 4], r.body);
    }
    // The search terminal: a screen on a stand, about 1 unit to the side.
    const st = P.sub([1.04, 0, -0.1]);
    st.rotation.y = -0.25;
    P.box([0.28, 0.04, 0.24], [0, 0.02, 0], '#4a4f57', null, st);
    P.box([0.06, 0.72, 0.06], [0, 0.4, -0.02], '#5d636c', null, st);
    P.box([0.32, 0.03, 0.14], [0, 0.62, 0.1], '#6b7079', [0.35, 0, 0], st);
    const housing = P.sub([0, 0.88, 0], st);
    housing.rotation.x = -0.12;
    P.box([0.44, 0.32, 0.06], [0, 0, 0], '#4a4f57', null, housing);
    const off = new MeshLambertMaterial({ color: '#2b2f36' });
    const on = new MeshBasicMaterial({ map: texture(searchCanvas()) });
    const screen = new Mesh<PlaneGeometry, Material>(new PlaneGeometry(0.38, 0.26), off);
    screen.position.z = 0.031;
    housing.add(screen);
    c.mark('prop', [1.04, 1.06, -0.1]);
    c.mark('slot', [0, 0.75, 0.38]);
    // Thought dots for 'think'.
    const dots: Sprite[] = [0.05, 0.07, 0.09].map((s) => {
      const d = glyph('dot', T, s);
      d.visible = false;
      c.root.add(d);
      return d;
    });
    const spot = new Vector3(0.6, 0, 0.1);
    const think = (d: number): Step =>
      S(
        d,
        (u, p) => {
          const m = Math.min(0.3, 0.4 / d);
          const e = env(u, 0, m, 1 - m, 1);
          to(p, { rx: -1.8, rz: -0.55, hp: -0.12 }, e);
          p.hr = 0.15 * Math.sin(c.time * 2.4) * e;
          glow(bulb, '#ff9a6a', (0.55 + 0.45 * Math.sin(c.time * 7)) * e);
          const h = c.headLocal();
          dots.forEach((s, i) => {
            s.visible = true;
            s.position.set(
              h.x + 0.26 + i * 0.1,
              h.y - 0.02 + i * 0.08 + 0.02 * Math.sin(c.time * 5 - i),
              h.z,
            );
            s.material.opacity = e * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(c.time * 5 - i * 1.2)));
          });
        },
        { end: () => (dots.forEach((s) => (s.visible = false)), glow(bulb, '#ff9a6a', 0)) },
      );
    // One search: hop to the terminal, type while the screen is lit, and hop back.
    const search = (D: number): Step[] => [
      ...walkSteps(c, spot, { hop: D * 0.12, turn: D * 0.06, face: 1.75, h: 0.16 }),
      S(
        D * 0.28,
        (u, p) => {
          to(p, { lx: -1.3, rx: -1.3, lz: -0.15, rz: -0.15, hp: -0.05 }, env(u, 0, 0.15, 0.85, 1));
          p.lx += 0.12 * Math.sin(c.time * 28);
          p.rx += 0.12 * Math.sin(c.time * 28 + Math.PI);
        },
        { start: () => (screen.material = on), end: () => (screen.material = off) },
      ),
      ...walkSteps(c, ORIGIN, { hop: D * 0.12, turn: D * 0.06, face: 0, h: 0.16 }),
    ];
    c.def('think', (o) => [think(Math.max(0.6, o.dur ?? 2))]);
    c.def('search', (o) => search(clamp(o.dur ?? 2.4, 1.2, 4)));
    // A full call: thinking, with one walk for each search spread over it. When the call is
    // short (fast replay), several searches share one walk.
    c.def('call', (o) => {
      const wall = Math.max(o.dur ?? 6, 2.5);
      const n = Math.max(0, Math.round(o.searches ?? 0));
      const walks = n ? clamp(Math.floor((wall - 0.8) / 1.7), 1, n) : 0;
      const D = walks ? clamp((wall * 0.7) / walks, 1.6, 3.6) : 0;
      const part = Math.max(0.6, wall - walks * D) / (walks + 1);
      const steps = [think(part)];
      for (let i = 0; i < walks; i++) steps.push(...search(D), think(part));
      return steps;
    });
    c.resets.push(() => {
      dots.forEach((s) => (s.visible = false));
      glow(bulb, '#ff9a6a', 0);
      screen.material = off;
    });
    c.main = 'think';
  },

  strike_rate(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: SKIN.a,
      shirt: '#3f74c9',
      pants: '#2c3e66',
      shoes: '#22252b',
    }));
    hair(F, r, '#2b2118', 'part');
    glasses(F, r, '#1c1c1e', true);
    const ty = r.legH + r.torsoH;
    F.box([0.16, 0.2, 0.02], [0, ty - 0.1, r.d / 2 + 0.005], '#f4f1ea', null, r.body);
    F.box([0.05, 0.17, 0.02], [0, ty - 0.11, r.d / 2 + 0.015], '#1d2a44', null, r.body);
    F.box([0.07, 0.03, 0.02], [0.13, ty - 0.12, r.d / 2 + 0.008], '#f4f1ea', null, r.body);
    // The abacus on a stand.
    const st = P.sub([0.6, 0, 0.02]);
    const wood = '#8a5a35';
    for (const s of [-1, 1]) {
      P.box([0.05, 0.56, 0.05], [s * 0.22, 0.28, 0], wood, null, st);
      P.box([0.05, 0.04, 0.22], [s * 0.22, 0.02, 0], wood, null, st);
      P.box([0.05, 0.48, 0.07], [s * 0.245, 0.765, 0], wood, null, st);
    }
    P.box([0.54, 0.05, 0.07], [0, 1.0, 0], wood, null, st);
    P.box([0.54, 0.05, 0.07], [0, 0.55, 0], wood, null, st);
    const rodY = [0.64, 0.72, 0.8, 0.88];
    const xr = (i: number): number => 0.195 - (4 - i) * 0.05;
    const xl = (i: number): number => -0.195 + i * 0.05;
    const beads: Mesh[] = [];
    rodY.forEach((y, ri) => {
      P.cyl(0.008, 0.44, [0, y, 0], '#c9ced3', [0, 0, Math.PI / 2], st);
      for (let i = 0; i < 5; i++) {
        beads.push(
          P.box([0.046, 0.06, 0.06], [xr(i), y, 0], ri % 2 ? '#f2efe7' : '#3f74c9', null, st),
        );
      }
    });
    c.mark('prop', [0.6, 1.03, 0.02]);
    c.mark('slot', [0.6, 0.45, 0.2]);
    let moved = 0;
    c.def('count', () => {
      let bead: Mesh | undefined;
      let reset = false;
      const from: number[] = [];
      return [
        S(
          1.0,
          (u, p) => {
            const e = env(u, 0, 0.15, 0.8, 1);
            c.facing = 0.75 * e;
            to(p, { hy: 0.55, hp: 0.12, lx: -1.25, lz: 0.15 }, e);
            if (reset) {
              beads.forEach(
                (b, j) => (b.position.x = lerp(from[j] ?? 0, xr(j % 5), smooth(u / 0.3))),
              );
            }
            if (bead) {
              const i = beads.indexOf(bead) % 5;
              bead.position.x = lerp(xr(i), xl(i), smooth((u - 0.35) / 0.25));
            }
            p.hp += 0.15 * bump(u, 0.55, 0.8);
          },
          {
            start() {
              reset = moved >= beads.length;
              if (reset) {
                moved = 0;
                beads.forEach((b, j) => (from[j] = b.position.x));
              }
              bead = beads[moved];
            },
            end: () => moved++,
          },
        ),
      ];
    });
    c.resets.push(() =>
      beads.forEach((b, j) => (b.position.x = j < moved ? xl(j % 5) : xr(j % 5))),
    );
    c.main = 'count';
  },

  base_rate(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: '#f0c8a4',
      shirt: '#8a8f98',
      pants: '#5b6068',
      shoes: '#5a3a22',
    }));
    hair(F, r, '#f4f4f2', 'sides');
    glasses(F, r, '#6b6f76', false);
    F.box([0.2, 0.05, 0.03], [0, r.headH * 0.3, 0.215], '#f4f4f2', null, r.head);
    for (let i = 0; i < 3; i++) {
      F.box(
        [0.035, 0.035, 0.02],
        [0, r.legH + 0.08 + i * 0.11, r.d / 2 + 0.005],
        '#5b6068',
        null,
        r.body,
      );
    }
    c.base = { lean: 0.06, hp: -0.04, lx: -0.15 };
    // A cane in the left hand.
    const cane = F.sub([0, 0, 0], r.body);
    F.beam([0, 0.02, 0], [0, -0.27, 0], 0.035, '#6b4a2b', cane);
    F.box([0.1, 0.035, 0.035], [0.035, 0.03, 0], '#6b4a2b', null, cane);
    c.carry.push({ obj: cane, hand: 'L', off: [0, 0, 0], rot: [0, 0, 0] });
    // A rocking chair with a small slate for tally marks.
    const st = P.sub([-0.66, 0, -0.14]);
    const wd = '#9c6b3f';
    for (const s of [-1, 1]) {
      P.box([0.05, 0.04, 0.56], [s * 0.2, 0.03, 0], '#7d5330', null, st);
      P.box([0.04, 0.36, 0.04], [s * 0.2, 0.22, 0.15], wd, null, st);
      P.box([0.04, 0.36, 0.04], [s * 0.2, 0.22, -0.15], wd, null, st);
      P.box([0.045, 0.64, 0.045], [s * 0.2, 0.72, -0.17], wd, null, st);
      P.box([0.05, 0.04, 0.34], [s * 0.22, 0.6, -0.02], wd, null, st);
      P.box([0.04, 0.16, 0.04], [s * 0.22, 0.52, 0.13], wd, null, st);
    }
    P.box([0.46, 0.05, 0.4], [0, 0.42, 0], wd, null, st);
    P.box([0.4, 0.04, 0.34], [0, 0.46, 0.01], '#b44b4b', null, st);
    P.box([0.46, 0.07, 0.05], [0, 1.02, -0.17], wd, null, st);
    P.box([0.36, 0.3, 0.02], [0, 0.76, -0.162], '#c9a777', null, st);
    P.box([0.32, 0.26, 0.02], [0, 0.76, -0.15], '#2f3a35', null, st);
    const marks = [0, 1, 2, 3].map((i) =>
      P.box([0.018, 0.16, 0.006], [-0.09 + i * 0.05, 0.76, -0.138], '#f2f2ee', null, st),
    );
    marks.push(P.box([0.24, 0.018, 0.006], [-0.015, 0.76, -0.136], '#f2f2ee', [0, 0, 0.55], st));
    marks.forEach((m) => (m.visible = false));
    c.mark('prop', [-0.66, 1.06, -0.14]);
    c.mark('slot', [-0.66, 0.5, 0]);
    let tally = 0;
    c.def('count', () => {
      let shown = false;
      return [
        S(
          1.1,
          (u, p) => {
            const e = env(u, 0, 0.15, 0.8, 1);
            c.facing = -0.9 * e;
            to(p, { hy: -0.55, hp: 0.05, rx: -1.45, rz: 0.3 }, e);
            p.rx += 0.12 * Math.sin(u * Math.PI * 8) * env(u, 0.35, 0.45, 0.6, 0.7);
            st.rotation.x = 0.05 * bump(u, 0.5, 1);
            if (!shown && u > 0.55) {
              shown = true;
              const m = marks[tally];
              if (m) m.visible = true;
            }
            p.hp += 0.15 * bump(u, 0.6, 0.85);
          },
          {
            start() {
              if (tally >= marks.length) {
                tally = 0;
                marks.forEach((m) => (m.visible = false));
              }
            },
            end: () => (tally++, (st.rotation.x = 0)),
          },
        ),
      ];
    });
    c.resets.push(() => {
      st.rotation.x = 0;
      marks.forEach((m, i) => (m.visible = i < tally));
    });
    c.main = 'count';
  },
};

/** The lit screen of the search terminal: a search bar and result lines. */
function searchCanvas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 176;
  const x = cv.getContext('2d');
  if (!x) return cv;
  x.fillStyle = '#fdf6ee';
  x.fillRect(0, 0, 256, 176);
  x.fillStyle = '#ffffff';
  x.strokeStyle = '#d97757';
  x.lineWidth = 8;
  x.beginPath();
  x.roundRect(18, 22, 220, 44, 22);
  x.fill();
  x.stroke();
  x.lineWidth = 7;
  x.beginPath();
  x.arc(48, 42, 11, 0, Math.PI * 2);
  x.moveTo(56, 50);
  x.lineTo(66, 60);
  x.stroke();
  x.fillStyle = '#c9c1b6';
  x.fillRect(80, 38, 120, 10);
  for (const [y, w] of [
    [92, 190],
    [118, 150],
    [144, 170],
  ] as const) {
    x.fillStyle = '#e3a083';
    x.fillRect(22, y, 14, 14);
    x.fillStyle = '#cfc8be';
    x.fillRect(46, y + 2, w, 10);
  }
  return cv;
}
