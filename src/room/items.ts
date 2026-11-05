// The items in the room. This is the one home of the item data: place, status, text, and gear.
// To mark a credential as earned, change its `status`. This file has no Three.js and no DOM.
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
  /** One short line. The panel shows it under the title. */
  readonly line: string;
  /** What the credential is. */
  readonly what: string;
  /** What Nick did. Not shown while locked. */
  readonly history?: readonly string[];
  /** How he earns it. Not shown after he earns it. */
  readonly earn?: readonly string[];
  /** A fact to check with Nick. */
  readonly confirm?: string;
  /** Shows the stats layout. */
  readonly stats?: boolean;
  /** Shows the "Try it" button. */
  readonly tryIt?: boolean;
  /** Where the gear goes on the eagle. */
  readonly wearText: string;
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
    tryIt: true,
    name: 'Hard Hat',
    title: 'FE exam and EIT',
    line: 'Passed the FE. Now an Engineer in Training.',
    what: 'The Fundamentals of Engineering (FE) exam is the first exam on the path to a PE license. NCEES writes it. After a pass, the state gives the title Engineer in Training (EIT).',
    history: ['Passed the FE exam.', 'Earned the EIT title.'],
    confirm: 'The year he passed.',
    wearText: 'The hard hat sits on the head.',
    worn: { mount: 'hat', part: 'model', pos: [0, -0.09, 0.02], scale: 1.1 },
  },
  {
    id: 'pe',
    area: 'licenses',
    u: -1.3,
    v: -2.6,
    status: 'progress',
    tryIt: true,
    name: 'The Seal',
    title: 'PE, Civil',
    line: 'Sign and seal. He is studying for it now.',
    what: 'The Principles and Practice of Engineering (PE) exam, Civil. With a PE license, an engineer can sign and seal plans. California also asks for its Seismic and Surveying exams.',
    history: ['Passed the FE first.', 'Studying for the PE now.'],
    earn: [
      'Pass the PE Civil exam.',
      'Pass the California Seismic exam.',
      'Pass the California Surveying exam.',
    ],
    wearText: 'The seal goes on the chest when he earns it.',
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
    what: 'The Fundamentals of Surveying (FS) exam gives the LSIT title. The Principles and Practice of Surveying (PS) exam and a state exam give the PLS license. A PLS can sign survey maps.',
    earn: ['Pass the FS exam for the LSIT.', 'Pass the PS exam and the state exam for the PLS.'],
    wearText: 'The tripod goes on the back when he earns it.',
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
    what: 'Two roles in the California Construction General Permit. A QSD writes the Stormwater Pollution Prevention Plan (SWPPP). A QSP carries out the plan on the site. CASQA runs the training.',
    earn: ['Take the CASQA training and pass the exam for each role.'],
    wearText: 'A rolled wattle goes on the back when he earns it.',
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
    what: 'The first LEED credential. GBCI gives it. It shows that a person knows the basics of green building.',
    earn: ['Pass the LEED Green Associate exam.'],
    wearText: 'The leaf goes on the head, like a feather, when he earns it.',
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
    what: 'LEED AP with a specialty follows the Green Associate. The specialties are BD+C, O+M, ID+C, ND, and Homes. LEED Fellow is the top tier.',
    earn: [
      'Pass the exam for one LEED AP specialty.',
      'For Fellow: a nomination after many years of LEED work.',
    ],
    confirm: 'Andrew did not remember the name. The room shows every candidate.',
    wearText: 'In the room only.',
  },
  {
    id: 'storm',
    area: 'licenses',
    u: 1.0,
    v: -6.1,
    status: 'locked',
    name: 'Culvert',
    title: 'Storm water designer',
    line: 'Where does the rain go?',
    what: 'EnviroCert gives four candidate certificates: CPSWQ (storm water quality), CPESC (erosion and sediment control), CPMSM (municipal storm water), and CESSWI (inspector).',
    earn: ['Pass the EnviroCert exam for one of the four.'],
    confirm: 'Andrew did not remember the name. All four are candidates.',
    wearText: 'In the room only.',
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
    what: 'The Structural Engineer license. It needs the 16-hour NCEES SE exam. This one is a maybe.',
    earn: ['Pass the NCEES SE exam.', 'Decide to change careers, a little.'],
    wearText: 'In the room only.',
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
    what: 'Nick works as a Civil Engineer at Fuscoe Engineering.',
    history: ['July 2020: started at Fuscoe Engineering as a Civil Engineer.'],
    wearText: 'The drawing tube sits on the back.',
    worn: { mount: 'back', part: 'tube', pos: [0, 0.22, 0.06], rot: [0.25, 0, 0.55], scale: 0.9 },
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
    history: ['Founded the Viewpoint esports program.'],
    confirm: 'The year he founded it.',
    wearText: 'In the room only.',
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
    history: ['President since 2024 or 2025.'],
    confirm: 'Since 2024 or 2025?',
    wearText: 'In the room only.',
  },
  {
    id: 'cs2',
    area: 'esports',
    u: 4.4,
    v: 3.0,
    status: 'earned',
    name: 'Monitor',
    title: 'CS2 stats',
    line: 'Live numbers, later.',
    what: "A screen with Nick's Counter-Strike 2 stats.",
    stats: true,
    confirm: 'The data source: a file that we update by hand, the Steam Web API, or FACEIT.',
    wearText: 'In the room only.',
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
    what: 'Nick was in Scouting from 2014 to 2021.',
    history: ['2014 to 2021 in Scouting.'],
    wearText: 'The neckerchief hangs at the neck.',
    worn: { mount: 'neck', part: 'kerchief', pos: [0, -0.01, 0], scale: 0.85 },
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
    what: 'Eagle Scout is the highest rank in Scouts BSA.',
    history: ['Earned the Eagle Scout rank.'],
    confirm: 'Did he earn the rank? In which year?',
    wearText: 'In the room only.',
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
    history: ['2019 to 2021: Student Commissioner, City of Calabasas.'],
    wearText: 'In the room only.',
  },
];
