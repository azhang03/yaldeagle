// The look and the acts of the books side: the clerk, the demo twin, the auditor, and the
// vault keeper.
import { CylinderGeometry, Mesh, MeshBasicMaterial, MeshLambertMaterial, Vector3 } from 'three';
import type { Actor } from '../../data/contract';
import { clamp, clamp01, smooth } from '../kit';
import type { Vec3 } from '../kit';
import { S, SKIN, bump, env, lerp, pulse, spawnGlyph, to } from './core';
import type { Builder, Core, Step } from './core';
import { buildEnvelope, clipboard, hair, rigPerson, stampTool } from './rig';
import type { EnvelopeObject } from './rig';

export const ACTORS_C: Partial<Record<Actor, Builder>> = {
  shadow(c) {
    clerk(
      c,
      {
        vest: '#7a5c3e',
        pants: '#3a3330',
        hair: '#3a2416',
        visor: '#3e8e5a',
        tie: '#a33a3a',
        garter: '#c0392b',
        booth: '#4b6b5b',
        board: '#7a5c3e',
        ink: '#a33a3a',
      },
      'FILLS',
    );
  },

  demo(c) {
    clerk(
      c,
      {
        vest: '#b39373',
        pants: '#6e6660',
        hair: '#7a5a3e',
        visor: '#8fc9a3',
        tie: '#d98080',
        garter: '#e08a80',
        booth: '#97b3a3',
        board: '#b39373',
        ink: '#d06a6a',
      },
      'DEMO',
      true,
    );
  },

  reconcile(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, { skin: SKIN.c, shirt: '#f4f1ea', pants: '#3a3a44' }));
    hair(F, r, '#a3a3a3');
    const ty = r.legH + r.torsoH;
    F.box(
      [r.w + 0.01, r.torsoH - 0.08, r.d + 0.01],
      [0, r.legH + (r.torsoH - 0.08) / 2, 0],
      '#2f9fd0',
      null,
      r.body,
    );
    F.box([0.05, 0.12, 0.02], [0, ty - 0.08, r.d / 2 + 0.015], '#1d4e6b', null, r.body);
    // A clipboard in the right hand and a stamp in the left hand.
    const cb = clipboard(F, r.body);
    c.carry.push({ obj: cb, hand: 'R', off: [0.04, 0.13, 0.04], rot: [-0.45, 0, 0] });
    const stamp = stampTool(F, r.body, '#2e9e5b');
    c.carry.push({ obj: stamp, hand: 'L', off: [0, -0.02, 0.02], rot: [0, 0, 0] });
    c.base = { rx: -0.75, rz: -0.2 };
    // A desk with two stacks of books to compare.
    const st = P.sub([0.64, 0, -0.04]);
    P.box([0.52, 0.04, 0.38], [0, 0.56, 0], '#8a5a35', null, st);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1])
        P.box([0.04, 0.54, 0.04], [sx * 0.22, 0.27, sz * 0.15], '#6e4628', null, st);
    }
    P.box([0.17, 0.12, 0.22], [-0.12, 0.64, 0], '#fbfaf6', null, st);
    P.box([0.17, 0.012, 0.22], [-0.12, 0.705, 0], '#cfe0f5', null, st);
    P.box([0.17, 0.1, 0.22], [0.12, 0.63, 0], '#fbfaf6', null, st);
    P.box([0.17, 0.012, 0.22], [0.12, 0.685, 0], '#f5e3cf', null, st);
    const mark = (color: string, strokes: readonly (readonly [number, Vec3, number])[]) => {
      const g = P.sub([-0.12, 0.714, 0], st);
      g.rotation.x = -Math.PI / 2;
      for (const [s, p, a] of strokes) P.box([0.03, s, 0.006], p, color, [0, 0, a], g);
      g.visible = false;
      return g;
    };
    const check = mark('#2e9e5b', [
      [0.07, [-0.03, -0.01, 0], 0.7],
      [0.14, [0.025, 0.02, 0], -0.55],
    ]);
    const cross = mark('#d63c3c', [
      [0.14, [0, 0, 0], 0.785],
      [0.14, [0, 0, 0], -0.785],
    ]);
    c.mark('prop', [0.64, 0.72, -0.04]);
    c.mark('slot', [0.76, 0.72, -0.04]);
    c.def('stamp', () => {
      let done = false;
      return [
        S(1.3, (u, p) => {
          to(p, { hy: -0.2, hp: 0.4 }, env(u, 0, 0.1, 0.25, 0.32));
          c.facing = 0.9 * env(u, 0.25, 0.4, 0.85, 1);
          to(
            p,
            { hy: -0.25 + 0.5 * smooth((u - 0.38) / 0.2), hp: 0.35 },
            env(u, 0.32, 0.4, 0.58, 0.64),
          );
          const slam = bump(u, 0.62, 0.76);
          to(p, { lx: -2.3 + 0.45 * slam, lz: 0.05, hp: 0.4 }, env(u, 0.5, 0.6, 0.82, 0.95));
          p.sy = 1 - 0.03 * slam;
          if (!done && u > 0.69) {
            done = true;
            check.visible = true;
            cross.visible = false;
          }
          p.hp += 0.12 * bump(u, 0.85, 1);
        }),
      ];
    });
    // A failed check: the usual alert, and a red cross on the books.
    const alert = c.defs.alert;
    c.def('alert', (o) => {
      const steps = alert ? alert(o) : [];
      const first = steps[0];
      if (o.bad && first) {
        const start = first.start;
        first.start = () => {
          start?.();
          cross.visible = true;
          check.visible = false;
        };
      }
      return steps;
    });
    c.main = 'stamp';
  },

  vault(c) {
    const { F, P } = c;
    const r = (c.rig = rigPerson(F, {
      skin: SKIN.b,
      shirt: '#7d1f1a',
      pants: '#2b2b33',
      shoes: '#1c1c1e',
    }));
    hair(F, r, '#3a2416');
    const { headW: W, headH: H } = r;
    F.box([W + 0.04, 0.1, 0.44], [0, H + 0.05, 0], '#2b2b33', null, r.head);
    F.box([W + 0.1, 0.05, 0.5], [0, H + 0.12, 0], '#2b2b33', null, r.head);
    F.box([W * 0.8, 0.025, 0.14], [0, H + 0.01, 0.27], '#111216', null, r.head);
    F.box([0.07, 0.06, 0.02], [0, H + 0.08, 0.225], '#e0b84a', null, r.head);
    for (let i = 0; i < 3; i++) {
      F.box(
        [0.035, 0.035, 0.02],
        [0.07, r.legH + 0.08 + i * 0.11, r.d / 2 + 0.005],
        '#e0b84a',
        null,
        r.body,
      );
    }
    const key = F.sub([0, 0, 0], r.body);
    F.cyl(0.04, 0.015, [0, 0, 0], '#e0b84a', [Math.PI / 2, 0, 0], key);
    F.box([0.025, 0.14, 0.02], [0, -0.08, 0], '#e0b84a', null, key);
    F.box([0.05, 0.025, 0.02], [0.025, -0.13, 0], '#e0b84a', null, key);
    c.carry.push({ obj: key, hand: 'R', off: [0, 0, 0.04], rot: [0, 0, 0] });
    // The safe. Its door turns on the right edge. Sealed envelopes lie inside.
    const st = P.sub([0.64, 0, -0.04]);
    const steel = '#5c6670';
    const y0 = 0.06;
    const Hs = 0.62;
    const Ws = 0.56;
    const Ds = 0.5;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1])
        P.box([0.06, 0.06, 0.06], [sx * 0.22, 0.03, sz * 0.18], '#3a3a3c', null, st);
    }
    P.box([Ws, Hs, 0.04], [0, y0 + Hs / 2, -Ds / 2 + 0.02], steel, null, st);
    for (const s of [-1, 1])
      P.box([0.04, Hs, Ds], [s * (Ws / 2 - 0.02), y0 + Hs / 2, 0], steel, null, st);
    P.box([Ws, 0.04, Ds], [0, y0 + Hs - 0.02, 0], steel, null, st);
    P.box([Ws, 0.04, Ds], [0, y0 + 0.02, 0], steel, null, st);
    P.box([Ws - 0.08, Hs - 0.08, 0.01], [0, y0 + Hs / 2, -Ds / 2 + 0.045], '#2b3036', null, st);
    P.box([Ws - 0.08, 0.02, Ds - 0.08], [0, y0 + Hs / 2, 0], '#4a525a', null, st);
    // Up to six sealed envelopes in two stacks, one on the floor of the safe and one on the
    // shelf. setCount(n) shows the first n. The default is 0: an empty safe.
    const inside: EnvelopeObject[] = [];
    for (let i = 0; i < 6; i++) {
      const e = buildEnvelope();
      e.scale.setScalar(0.85);
      e.rotation.set(-Math.PI / 2, 0, (i % 2 ? -0.12 : 0.1) + (i % 3) * 0.04);
      const level = i % 2 ? y0 + Hs / 2 + 0.02 : y0 + 0.05;
      e.position.set(0, level + Math.floor(i / 2) * 0.022, 0.02);
      e.visible = false;
      st.add(e);
      inside.push(e);
    }
    c.setCount = (n) => inside.forEach((e, i) => (e.visible = i < n));
    const door = P.sub([Ws / 2, y0 + Hs / 2, Ds / 2], st);
    P.box([Ws, Hs, 0.05], [-Ws / 2, 0, 0.025], '#76818c', null, door);
    P.box([Ws - 0.1, Hs - 0.1, 0.01], [-Ws / 2, 0, 0.055], '#828d98', null, door);
    for (const y of [-0.2, 0.2]) P.box([0.04, 0.1, 0.06], [0.0, y, 0.02], '#3a3a3c', null, door);
    const dial = P.sub([-Ws / 2, 0.08, 0.07], door);
    P.cyl(0.085, 0.03, [0, 0, 0], '#c9ced3', [Math.PI / 2, 0, 0], dial);
    P.box([0.02, 0.05, 0.02], [0, 0.06, 0.016], '#3a3a3c', null, dial);
    const hub = P.sub([-Ws / 2, -0.15, 0.07], door);
    P.cyl(0.03, 0.03, [0, 0, 0], '#c9ced3', [Math.PI / 2, 0, 0], hub);
    for (let i = 0; i < 3; i++) {
      const a = (i * 2 * Math.PI) / 3 + Math.PI / 2;
      P.beam([0, 0, 0], [Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0], 0.022, '#c9ced3', hub);
    }
    const env1 = buildEnvelope();
    env1.visible = false;
    st.add(env1);
    c.mark('prop', [0.64, 0.74, -0.04]);
    c.mark('slot', [0.64, 0.42, 0]);
    const IN = new Vector3(0, 0.42, 0);
    const OUT = new Vector3(0, 0.42, 0.42);
    const UPV = new Vector3(0, 1.06, 0.28);
    c.def('open', () => {
      let d0 = 0;
      return [
        S(
          2.0,
          (u, p) => {
            c.facing = env(u, 0, 0.1, 0.82, 0.95);
            to(p, { lx: -1.4, lz: 0.2, hy: 0.3, hp: 0.15 }, env(u, 0.05, 0.15, 0.4, 0.5));
            dial.rotation.z = -Math.PI * 2 * smooth((u - 0.1) / 0.25);
            hub.rotation.z = -1.2 * smooth((u - 0.3) / 0.08);
            door.rotation.y = d0 + (1.9 - d0) * smooth((u - 0.35) / 0.25);
            // The envelope comes out through the door, rises, and opens.
            env1.visible = u > 0.52;
            const s1 = smooth((u - 0.52) / 0.15);
            const s2 = smooth((u - 0.66) / 0.18);
            env1.position.lerpVectors(IN, OUT, s1).lerp(UPV, s2);
            env1.rotation.set((-Math.PI / 2) * (1 - s2), 0, 0);
            env1.userData.open(smooth((u - 0.84) / 0.14));
            to(p, { lx: -2.6, rx: -2.6, lz: 0.4, rz: 0.4, hp: -0.25 }, env(u, 0.8, 0.88, 0.95, 1));
          },
          { start: () => (d0 = door.rotation.y) },
        ),
      ];
    });
    c.def('close', () => {
      let d0 = 0;
      let had = false;
      const p0 = new Vector3();
      return [
        S(
          1.3,
          (u, p) => {
            c.facing = 0.9 * env(u, 0, 0.1, 0.85, 1);
            if (had) {
              env1.userData.open(1 - smooth(u / 0.2));
              const s = smooth((u - 0.15) / 0.3);
              env1.position.lerpVectors(p0, OUT, s).lerp(IN, smooth((u - 0.35) / 0.12));
              env1.rotation.set((-Math.PI / 2) * s, 0, 0);
              env1.visible = u < 0.47;
            }
            to(p, { lx: -1.3, lz: 0.3, hy: 0.3 }, env(u, 0.4, 0.5, 0.75, 0.85));
            door.rotation.y = d0 * (1 - smooth((u - 0.45) / 0.3));
            hub.rotation.z = -1.2 * (1 - smooth((u - 0.76) / 0.08));
            dial.rotation.z = Math.PI * 2 * smooth((u - 0.78) / 0.2);
          },
          {
            start: () => {
              d0 = door.rotation.y;
              had = env1.visible;
              p0.copy(env1.position);
            },
            end: () => (env1.visible = false),
          },
        ),
      ];
    });
    c.resets.push(() => {
      door.rotation.y = dial.rotation.z = hub.rotation.z = 0;
      env1.visible = false;
      env1.userData.open(0);
    });
    c.main = 'open';
  },
};

/** The colors of one clerk. */
interface ClerkPalette {
  vest: string;
  pants: string;
  hair: string;
  visor: string;
  tie: string;
  garter: string;
  booth: string;
  board: string;
  ink: string;
}

/** The clerk at a ticket window. The demo twin uses it too: smaller, lighter, and mirrored. */
function clerk(c: Core, pal: ClerkPalette, word: string, twin = false): void {
  const { F, P } = c;
  const r = (c.rig = rigPerson(F, {
    skin: SKIN.a,
    shirt: '#f4f1ea',
    pants: pal.pants,
    shoes: '#2b2420',
  }));
  hair(F, r, pal.hair);
  const ty = r.legH + r.torsoH;
  F.box(
    [r.w + 0.01, r.torsoH - 0.06, r.d + 0.01],
    [0, r.legH + (r.torsoH - 0.06) / 2, 0],
    pal.vest,
    null,
    r.body,
  );
  F.box([0.12, 0.12, 0.02], [0, ty - 0.1, r.d / 2 + 0.012], '#f4f1ea', null, r.body);
  F.box([0.12, 0.05, 0.02], [0, ty - 0.04, r.d / 2 + 0.02], pal.tie, null, r.body);
  for (const arm of [r.armL, r.armR])
    F.box([0.13, 0.035, 0.15], [0, -0.12, 0], pal.garter, null, arm);
  // A green eyeshade.
  F.box([r.headW + 0.02, 0.05, 0.42], [0, r.headH * 0.88, 0], pal.visor, null, r.head);
  F.box([r.headW * 0.9, 0.02, 0.18], [0, r.headH * 0.86, 0.29], pal.visor, [0.22, 0, 0], r.head);
  // The ticket window: a counter, two posts, and a top board.
  const st = P.sub([0, 0, 0.42]);
  P.box([0.96, 0.5, 0.28], [0, 0.25, 0], pal.booth, null, st);
  P.box([1.02, 0.04, 0.33], [0, 0.52, 0], '#8a5a35', null, st);
  for (const s of [-1, 1]) P.box([0.06, 1.0, 0.06], [s * 0.48, 1.04, -0.06], pal.booth, null, st);
  const board = P.sub([0, 1.6, -0.06], st);
  P.box([1.08, 0.2, 0.06], [0, 0, 0], pal.board, null, board);
  const lbl = P.label(word, 0.56, 0.15, [0, 0, 0.032], '#fbf6ea', pal.board, board);
  // The twin is a mirror image. Mirror the word back, so it reads.
  if (twin) lbl.scale.x = -1;
  // The tape machine: a glass dome on a box, and the tape across the counter.
  const tk = P.sub([0.33, 0.54, -0.02], st);
  P.box([0.14, 0.1, 0.13], [0, 0.05, 0], '#3a3a3c', null, tk);
  P.cyl(0.02, 0.05, [0, 0.12, 0], '#d9a521', null, tk);
  const dome = new Mesh(
    new CylinderGeometry(0.055, 0.055, 0.1, 16),
    new MeshLambertMaterial({
      color: '#d8eef5',
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    }),
  );
  dome.position.y = 0.15;
  tk.add(dome);
  P.box([0.46, 0.006, 0.05], [0.08, 0.543, 0.08], '#f4efe2', null, st);
  const marks = P.sub([0, 0, 0], st);
  for (let i = 0; i < 5; i++)
    P.box([0.012, 0.004, 0.03], [-0.08 + i * 0.08, 0.548, 0.08], '#3a3a3c', null, marks);
  // A desk bell on the right end, for settlements.
  const bell = P.sub([-0.4, 0.54, 0.02], st);
  P.cyl(0.06, 0.02, [0, 0.01, 0], '#3a3a3c', null, bell);
  const bellTop = P.sub([0, 0, 0], bell);
  P.cyl(0.045, 0.045, [0, 0.045, 0], '#d9a521', null, bellTop);
  P.box([0.015, 0.03, 0.015], [0, 0.08, 0], '#d9a521', null, bellTop);
  // The fill slip. The stamp marks it.
  const slip = P.box([0.14, 0.008, 0.1], [-0.26, 0.545, -0.02], '#fff6d6', null, st);
  const ink = P.box([0.07, 0.006, 0.05], [-0.26, 0.551, -0.02], pal.ink, null, st);
  slip.visible = ink.visible = false;
  const stamp = stampTool(F, r.body, pal.ink);
  stamp.visible = false;
  c.carry.push({ obj: stamp, hand: 'R', off: [0, -0.02, 0.02], rot: [0, 0, 0] });
  // A magnifier for 'watch'. It hovers over the tape while the clerk checks it.
  const lens = P.sub([0.28, 0.64, 0.08], st);
  P.cyl(0.075, 0.018, [0, 0, 0], '#3a3a3c', null, lens);
  const glass = new Mesh(
    new CylinderGeometry(0.06, 0.06, 0.022, 20),
    new MeshBasicMaterial({ color: '#cdeeff' }),
  );
  lens.add(glass);
  P.beam([0.04, 0, -0.06], [0.1, 0.05, -0.2], 0.03, '#8a5a35', lens);
  lens.rotation.x = 0.35;
  lens.scale.setScalar(1.5);
  lens.visible = false;
  c.mark('prop', [0, 1.7, 0.36]);
  c.mark('slot', [-0.26, 0.56, 0.4]);
  if (twin) {
    c.space.scale.set(-0.82, 0.82, 0.82);
    c.space.updateMatrix();
  }
  /** Watch the tape, then stamp the slip one or two times. */
  const stampAct = (hits: number): Step[] => {
    let mx0 = 0;
    const at = hits === 2 ? [0.45, 0.63] : [0.5];
    const first = at[0] ?? 0.5;
    return [
      S(
        hits === 2 ? 1.2 : 1.0,
        (u, p) => {
          to(p, { hy: 0.5, hp: 0.3 }, env(u, 0, 0.1, 0.32, 0.42));
          marks.position.x = mx0 - 0.08 * smooth(u / 0.35);
          const slam = Math.max(...at.map((a) => bump(u, a, a + 0.12)));
          to(p, { rx: -1.95 + 0.53 * slam, hp: 0.2 }, env(u, 0.32, 0.42, 0.82, 0.95));
          p.sy = 1 - 0.03 * slam;
          if (u > first + 0.05) ink.visible = true;
          slip.position.x = ink.position.x = -0.26 - 0.3 * smooth((u - 0.82) / 0.18);
        },
        {
          start: () => {
            mx0 = 0;
            slip.visible = stamp.visible = true;
            ink.visible = false;
          },
          end: () => {
            marks.position.x = 0;
            slip.visible = ink.visible = stamp.visible = false;
            slip.position.x = ink.position.x = -0.26;
          },
        },
      ),
    ];
  };
  c.resets.push(() => {
    marks.position.x = 0;
    slip.visible = ink.visible = stamp.visible = false;
    slip.position.x = ink.position.x = -0.26;
    bellTop.position.y = 0;
    lens.visible = false;
  });
  if (twin) {
    c.def('mirror', () => stampAct(1));
    c.main = 'mirror';
    return;
  }
  c.def('stamp', () => stampAct(2));
  // 'watch': the clerk checks the tape n times (opts.n, 1 to 4) with a magnifier. Each check
  // is one sweep along the tape. opts.delay waits first (seconds). No slip and no stamp.
  c.def('watch', (o) => {
    const n = clamp(Math.round(o.n ?? 1), 1, 4);
    const lead = 0.2;
    const tail = 0.25;
    const dur = lead + 0.5 * n + tail;
    let mx0 = 0;
    const steps: Step[] = [];
    const delay = o.delay ?? 0;
    if (delay > 0) steps.push(S(delay, () => {}));
    steps.push(
      S(
        dur,
        (u, p) => {
          const t = u * dur;
          const k = clamp01((t - lead) / 0.5);
          const i = Math.min(n - 1, Math.floor(k));
          const f = smooth(k - i);
          // Even checks go along the tape from the machine, odd checks come back.
          const s = i % 2 ? 1 - f : f;
          const x = lerp(0.28, -0.12, s);
          lens.position.set(x, 0.64 + 0.02 * Math.sin(f * Math.PI), 0.08);
          marks.position.x = mx0 - 0.08 * smooth(k / n);
          const e = env(u, 0, lead / dur, 1 - tail / dur, 1);
          to(p, { hy: Math.atan2(x, 0.5), hp: 0.18, lx: -1.3, lz: lerp(0.15, -0.45, s) }, e);
        },
        {
          start: () => {
            mx0 = marks.position.x;
            lens.visible = true;
            if (o.pulse) pulse(c, c.info.color);
          },
          end: () => {
            lens.visible = false;
            marks.position.x = 0;
          },
        },
      ),
    );
    return steps;
  });
  c.def('settle', () => {
    let rang = false;
    return [
      S(
        1.0,
        (u, p) => {
          const hit = Math.max(bump(u, 0.25, 0.37), bump(u, 0.45, 0.57));
          to(
            p,
            { rx: -1.9 + 0.5 * hit, rz: 0.15, hy: -0.35, hp: 0.3 },
            env(u, 0, 0.15, 0.75, 0.95),
          );
          bellTop.position.y = -0.012 * hit;
          if (!rang && u > 0.3) {
            rang = true;
            spawnGlyph(c, '♪', '#c08a10', [-0.4, 0.85, 0.44], 0.26);
          }
          p.hp += 0.15 * bump(u, 0.7, 0.95);
        },
        { end: () => (bellTop.position.y = 0) },
      ),
    ];
  });
  c.main = 'stamp';
}
