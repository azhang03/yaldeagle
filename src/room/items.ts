// The items in the room. This is the one home of the item data: place, status, text, and gear.
// To mark a credential as earned, change its `status`. This file has no Three.js and no DOM.
// The text is about Nick, like an about-me page. Facts only, and no notes to the team.
import type { MountName } from '../eagle/model';
import type { AreaId } from './areas';

export type ItemId =
  | 'fe'
  | 'pe'
  | 'pls'
  | 'qsd'
  | 'leed'
  | 'leedap'
  | 'storm'
  | 'se'
  | 'work'
  | 'viewpoint'
  | 'bronco'
  | 'cs2'
  | 'kerchief'
  | 'eagle'
  | 'commission';

export type ItemStatus = 'earned' | 'progress' | 'locked';

/** How the eagle wears the item when it is earned. */
export interface Worn {
  readonly mount: MountName;
  /** The full model, or one part of it (see `PARTS` in models.ts). */
  readonly part: 'model' | 'tube' | 'kerchief';
  readonly pos: readonly [number, number, number];
  readonly rot?: readonly [number, number, number];
  readonly scale: number;
  /** The "On the eagle" text of the panel. */
  readonly text: string;
}

/** A best rank that we type in. The icon is a file in public/ranks/, shown at this size in px. */
export interface Peak {
  readonly label: string;
  readonly value: string;
  readonly icon?: { readonly src: string; readonly width: number; readonly height: number };
}

export interface ItemDef {
  readonly id: ItemId;
  readonly area: AreaId;
  /** The place in room coordinates (see `roomPoint`). */
  readonly u: number;
  readonly v: number;
  readonly status: ItemStatus;
  /** The name of the model, for example "Hard Hat". */
  readonly name: string;
  /** The credential or role. */
  readonly title: string;
  /** One short line. The panel shows it under the title, except while locked. */
  readonly line: string;
  /** The "About" text. */
  readonly what: string;
  /** The "Highlights": what Nick did. Not shown while locked. */
  readonly history?: readonly string[];
  /** The "Requirements". Not shown after he earns it. */
  readonly earn?: readonly string[];
  /** Shows the CS2 stats, with these peaks that we type in. The live stats are in src/stats. */
  readonly stats?: { readonly peaks: readonly Peak[] };
  /** The gear on the eagle. Only these items have an "On the eagle" section. */
  readonly worn?: Worn;
}

/** The radius of the floor patch under each item. */
export const PATCH_RADIUS = 1.2;
/** The eagle's feet stay at least this far from the center of each item. */
export const ITEM_CLEARANCE = 0.75;

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'fe',
    area: 'licenses',
    u: -4.2,
    v: -3.0,
    status: 'earned',
    name: 'Hard Hat',
    title: 'FE exam and EIT',
    line: 'Engineer in Training.',
    what: 'The Fundamentals of Engineering (FE) exam from NCEES is the first step to a Professional Engineer license. After the pass, the state board grants the title Engineer in Training (EIT).',
    history: ['Passed the FE exam.', 'Earned the Engineer in Training (EIT) title.'],
    worn: {
      mount: 'hat',
      part: 'model',
      pos: [0, -0.09, 0.02],
      scale: 1.1,
      text: 'The eagle wears the hard hat.',
    },
  },
  {
    id: 'pe',
    area: 'licenses',
    u: -1.3,
    v: -2.6,
    status: 'progress',
    name: 'The Seal',
    title: 'PE, Civil',
    line: 'Next up: sign and seal.',
    what: 'The Professional Engineer (PE) license lets an engineer sign and seal plans. It takes the NCEES PE Civil exam. In California, it also takes the state Seismic and Surveying exams.',
    history: ['Passed the FE exam.', 'Studying for the PE Civil exam now.'],
    earn: [
      'Pass the PE Civil exam.',
      'Pass the California Seismic exam.',
      'Pass the California Surveying exam.',
      "Meet the state board's experience rule.",
    ],
  },
  {
    id: 'pls',
    area: 'licenses',
    u: 1.6,
    v: -3.2,
    status: 'locked',
    name: 'Tripod',
    title: 'LSIT and PLS',
    line: 'Measure twice.',
    what: 'The Fundamentals of Surveying (FS) exam gives the title Land Surveyor in Training (LSIT). The Principles and Practice of Surveying (PS) exam and a state exam give the Professional Land Surveyor (PLS) license. A PLS signs survey maps.',
    earn: [
      'Pass the FS exam for the LSIT.',
      'Pass the PS exam and the state exam for the PLS.',
      "Meet the state board's experience rule.",
    ],
  },
  {
    id: 'qsd',
    area: 'licenses',
    u: 4.4,
    v: -2.7,
    status: 'locked',
    name: 'Silt Fence',
    title: 'QSD and QSP',
    line: 'Keep the dirt on the site.',
    what: 'Two roles in the California Construction General Permit. A Qualified SWPPP Developer (QSD) writes the Stormwater Pollution Prevention Plan. A Qualified SWPPP Practitioner (QSP) carries out the plan on the site. CASQA runs the training.',
    earn: [
      'Hold a qualifying license or certificate for each role.',
      'Take the CASQA training and pass the exam for each role.',
    ],
  },
  {
    id: 'leed',
    area: 'licenses',
    u: -4.6,
    v: -6.0,
    status: 'locked',
    name: 'Leaf',
    title: 'LEED Green Associate',
    line: 'Green building, step one.',
    what: 'The first LEED credential, from GBCI. It shows a working knowledge of green building.',
    earn: ['Pass the LEED Green Associate exam.'],
  },
  {
    id: 'leedap',
    area: 'licenses',
    u: -1.8,
    v: -5.5,
    status: 'locked',
    name: 'Tree',
    title: 'LEED AP and LEED Fellow',
    line: 'The leaf grows up.',
    what: 'LEED AP comes after the Green Associate, with one specialty: BD+C, O+M, ID+C, ND, or Homes. LEED Fellow is the top tier.',
    earn: [
      'Pass the exam for a LEED AP specialty.',
      'For LEED Fellow: a nomination after years of LEED work.',
    ],
  },
  {
    id: 'storm',
    area: 'licenses',
    u: 1.0,
    v: -6.1,
    status: 'locked',
    name: 'Culvert',
    title: 'Storm water certificates',
    line: 'Where does the rain go?',
    what: 'Four storm water certificates from EnviroCert: CPSWQ (storm water quality), CPESC (erosion and sediment control), CPMSM (municipal storm water), and CESSWI (inspection).',
    earn: [
      'Meet the education and experience rule of the certificate.',
      'Pass the EnviroCert exam for the certificate.',
    ],
  },
  {
    id: 'se',
    area: 'licenses',
    u: 3.8,
    v: -5.4,
    status: 'locked',
    name: 'I-Beam',
    title: 'SE (Structural Engineer)',
    line: 'Almost a career change.',
    what: 'The Structural Engineer (SE) license. It takes the 16-hour NCEES SE exam.',
    earn: ['Pass the NCEES SE exam.', 'Change careers, a little.'],
  },
  {
    id: 'work',
    area: 'work',
    u: -6.0,
    v: 0.4,
    status: 'earned',
    name: 'Blueprints',
    title: 'Civil Engineer, Fuscoe Engineering',
    line: 'On the job since July 2020.',
    what: 'Nick is a Civil Engineer at Fuscoe Engineering.',
    history: ['July 2020: joined Fuscoe Engineering as a Civil Engineer.'],
    worn: {
      mount: 'back',
      part: 'tube',
      pos: [0, 0.22, 0.06],
      rot: [0.25, 0, 0.55],
      scale: 0.9,
      text: 'The eagle carries the drawing tube on its back.',
    },
  },
  {
    id: 'viewpoint',
    area: 'esports',
    u: 4.8,
    v: 0.2,
    status: 'earned',
    name: 'Trophy',
    title: 'Founder, Viewpoint esports',
    line: 'He started the team.',
    what: 'Nick founded the esports program at Viewpoint, his high school.',
  },
  {
    id: 'bronco',
    area: 'esports',
    u: 7.0,
    v: 1.8,
    status: 'earned',
    name: 'Pennant',
    title: 'President, Bronco Esports',
    line: 'Green and gold.',
    what: 'Nick is the president of Bronco Esports, the esports club of Cal Poly Pomona.',
    history: ['President since 2024.'],
  },
  {
    id: 'cs2',
    area: 'esports',
    u: 4.4,
    v: 3.0,
    status: 'earned',
    name: 'Monitor',
    title: 'CS2 stats',
    line: 'Counter-Strike, by the numbers.',
    what: 'His CS2 numbers from Leetify, his lifetime totals from Steam, and his best ranks.',
    stats: {
      peaks: [
        {
          label: 'CS:GO',
          value: 'Global Elite',
          icon: { src: '/ranks/csgo-global-elite.png', width: 54, height: 22 },
        },
        {
          label: 'FACEIT',
          value: 'Level 10',
          icon: { src: '/ranks/faceit-level-10.svg', width: 22, height: 22 },
        },
      ],
    },
  },
  {
    id: 'kerchief',
    area: 'extracurriculars',
    u: -2.0,
    v: 4.2,
    status: 'earned',
    name: 'Neckerchief',
    title: 'Scouting, 2014 to 2021',
    line: 'Be prepared.',
    what: 'Nick was a Scout from 2014 to 2021.',
    history: ['2014: joined Scouting.', '2021: earned the Eagle Scout rank.'],
    worn: {
      mount: 'neck',
      part: 'kerchief',
      pos: [0, -0.01, 0],
      scale: 0.85,
      text: 'The eagle wears the neckerchief.',
    },
  },
  {
    id: 'eagle',
    area: 'extracurriculars',
    u: 0.9,
    v: 4.8,
    status: 'earned',
    name: 'Eagle Medal',
    title: 'Eagle Scout',
    line: 'An eagle, for the eagle.',
    what: 'Eagle Scout is the highest rank in Scouts BSA. Nick earned it in 2021.',
  },
  {
    id: 'commission',
    area: 'extracurriculars',
    u: -4.8,
    v: 3.6,
    status: 'earned',
    name: 'Traffic Light',
    title: 'Student Commissioner, Calabasas Traffic and Transportation Safety Commission',
    line: 'City of Calabasas, 2019 to 2021.',
    what: 'From 2019 to 2021, Nick served as a Student Commissioner on the Traffic and Transportation Safety Commission of the City of Calabasas.',
  },
];
