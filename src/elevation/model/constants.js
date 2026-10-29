import { DEFAULT_DOOR_STYLE, DOOR_DESIGNS } from './doorStyles.js';
import { BUILT_IN_PULLS } from './pulls.js';
import { BUILT_IN_SLIDES } from './slides.js';

export const ACCESSORY_PLACES = ['section', 'drawer_box'];

export const SHAPE_KINDS = {
  accessory: 'Accessory',
  appliance: 'Appliance',
  leg: 'Leg / column',
  other: 'Other',
};

export const FRAME_RETURN_WIDTH = 6;

/** Root items a pin can place (SPEC-8): cabinets and open (void) cells. */
export const PINNABLE_KINDS = new Set(['cabinet', 'void']);

export const PANEL_MATERIALS = [
  { id: 'glass', label: 'Glass', seeThrough: true, glassMarks: true, orderText: 'sash panel (glass)' },
];

export function panelMaterial(id) {
  return PANEL_MATERIALS.find((row) => row.id === id) ?? null;
}

/** Cabinet type identifiers shared with ff-job-schedule. */
export const CABINET_TYPE_IDS = {
  BASE: 1,
  UPPER: 2,
  TALL: 3,
  FILLER: 5,
  END_PANEL: 10,
};

/** Default room height profile used by new rooms. */
export const DEFAULT_PROFILE = {
  wallHeight: 96,
  toeKickHeight: 4,
  baseKind: 'toe_kick',
  furnitureBaseProud: 0.8125,
  furnitureBaseProfileId: null,
  baseCutoutProfileId: null,
  baseBoxHeight: 30.5,
  countertopThickness: 1.5,
  nosingProfileId: null,
  upperClearance: 18,
  crownTop: 96,
  topMoldHeight: 3,
  topMoldOverhang: 0.25,
  topMoldProfileId: null,
  crownProfileId: null,
  crownHeight: 4.5,
  crownStackHeight: 6,
};

/** Transient view and input preferences, reset on every load. */
export const DEFAULT_PREFS = {
  orthoWalls: true,
  showPartNumbers: false,
  plotScale: 24,
  paperSize: 'archD',
  planGrid: 0.5,
  openingSnap: 0.5,
  cornerSnapDistance: 3,
};

/** Default persisted settings for Elevation Lab schema v3. */
export const DEFAULT_SETTINGS = {
  wallThickness: 4.5,
  defaultProfile: { ...DEFAULT_PROFILE },
  report: {
    companyName: '',
    companyAddress: '',
    companyCity: '',
    companyState: '',
    companyZip: '',
    companyPhone: '',
    companyFax: '',
    doorFormNote: '',
    jobNumber: '',
    wood: '',
    finish: '',
    boxMaterial: '',
    wireBrushed: false,
    edgebandAlert: '',
  },
  baseDepth: 24,
  upperDepth: 12,
  tallDepth: 24,
  roundTo: 0.5,
  runFlex: 0.25,
  maxCabinetWidth: 36,
  minCabinetWidth: 9,
  fillerMinWidth: 1.5,
  fillerWarnWidth: 6,
  sheetThickness: 0.75,
  defaultInteriorFillerWidth: 3,
  minRunWidth: 9,
  maxRunOverhang: 36,
  snapHeightsToDefaults: true,
  defaultEnds: { left: 'filler', right: 'filler' },
  bumperThickness: 0.0625,
  teamDoorStyle: DEFAULT_DOOR_STYLE,
  doorPanelDefault: 0.5,
  doorDesigns: DOOR_DESIGNS,
  pulls: BUILT_IN_PULLS,
  slides: BUILT_IN_SLIDES,
  accessories: [],
  drawerSlideId: 'blum-562h',
  doorPullId: 'pull-4',
  drawerPullId: 'pull-4',
  pullHeight: 45,
  doorPullAt: 'auto',
  doorPullOrientation: 'auto',
  drawerPullAt: 'center',
  drawerPullOrientation: 'auto',
  sectionProfiles: [],
  shapes: [],
  baseCutoutFoot: 3,
  baseCutoutHeight: 1.5,
  furnitureBaseScribe: 0.5,
  woodTopScribe: 0.5,
  toeKickTopGap: 0.125,
  fillerReturnDepth: 2.5,
  fillerReturnThickness: 0.75,
  fillerThickness: 0.8125,
  fillerReturnTongue: 0.125,
  teeCover: 0.75,
  teeThickness: 0.8125,
  blindFillerWidth: 6,
  cornerFillerMinWidth: 1.5,
  defaultSoffitDepth: 14,
  defaultSoffitMolding: 'crown',
  autoEndPanelOnFreeEnd: true,
  adjacentRunGap: 1,
  casingWidth: 3,
  casingThickness: 0.75,
  casingClearance: 0,
  openingsHaveCasing: true,
  defaultOpeningMeasureMode: 'jamb',
  defaultDoorWidth: 36,
  defaultDoorHeight: 80,
  defaultWindowWidth: 36,
  defaultWindowHeight: 48,
  defaultWindowSillZ: 36,
  minOpeningWidth: 6,
  pairDoorAboveWidth: 24,
  faceReveals: {
    [CABINET_TYPE_IDS.BASE]: {
      top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
    [CABINET_TYPE_IDS.UPPER]: {
      top: 0.125, bottom: -0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
    [CABINET_TYPE_IDS.TALL]: {
      top: 0.125, bottom: 0.125, left: 0.0625, right: 0.0625, horizontal: 0.125, vertical: 0.125,
    },
  },
  defaultStyle: { cabinetStyleId: 13, beadWidth: 0.25 },
  insetFrame: {
    stile: 0.75,
    rail: 1.5,
    midRail: 1.5,
    mullion: 1.5,
    upperDrop: 0.75,
    thickness: 0.8125,
  },
  profiledFit: { edge: 0.09375, pairEdge: 0.0625, pairGap: 0.125, sharedGap: 0.0625 },
  woodTopReveal: 0.125,
  stoneTopReveal: 0.25,
  capturedSingleReveal: 0.09375,
  stackedUpperBottom: 0,
  stackedLowerTop: 0.125,
  floatingShelfThickness: 1.5,
  standardDrawerHeights: { european: 5.875, faceFrame: 5 },
  /** ProBox preset drawer box heights (INTERIORS-PLAN ID11): from..to, then thenFrom..max, by step. */
  drawerBoxHeights: { from: 2.25, to: 10.25, thenFrom: 11.125, max: 22.125, step: 1, warnAbove: 15.125 },
  /** Vertical adjustment on the slide clips: how much too tall a drawer box can be and still fit (IN7.1). */
  drawerBoxAdjustment: 0.125,
  rolloutHeight: 4.25,
  rolloutSpacer: 1.25,
  /** Extra width on pre-finished maple drawer boxes and roll-outs, centred on the box (AU8; 0 = the shop doesn't add any). */
  prefinishedMapleExtra: 0.0625,
  drawerBoxOrder: {
    sideMaterial: 'Baltic Birch Ply',
    sideThickness: '5/8"',
    bottomMaterial: '1/4" Baltic Birch Ply',
    topEdge: 'Flat Flush',
    bottomPlacement: 'Standard',
    assembly: 'Pre-finished & assembled',
    comments: 'Cross Grain Bottoms',
  },
  shelfSpacing: 11,
  shelfWidthClearance: 1 / 16, // per side
  shelfSetback: 1 / 8,
  glassShelfThickness: 1 / 4,
  shelfNosingHeight: 1.5,
  shelfNosingThickness: 13 / 16,
  foldedNosingExtra: 2,
  shoeShelfAngle: 12,
  shoeShelfClear: 6,
  belowRunOverhang: -0.125,
  belowRunFlushReveal: 0.125,
  bottomPartHeights: { light_rail: 1.5, light_trough: 3, panel: 0.75, bottom_cap: 1.5, corbels: 6 },
  bandDepths: {
    toeKickSetback: 3,
    toeKickEndPanelSetback: 1,
    toeKickSideSetback: 0.25,
    countertopOverhang: 0.75,
    crownProjection: 3,
  },
};

export const FRAME_JOINS = ['miter', 'butt'];

/**
 * What a cabinet is for (INTERIORS-PLAN ID4). Set by hand, never guessed; shop rules key off it
 * (spreaders and no "full top" for sink/cooktop, ROT and hamper boxes, slide rules…). Absent = none.
 */
export const CABINET_PURPOSES = [
  ['sink', 'Sink'],
  ['cooktop', 'Cooktop'],
  ['oven', 'Oven'],
  ['trash', 'Trash (ROT)'],
  ['hamper', 'Hamper'],
  ['file', 'File drawers'],
  ['medicine', 'Medicine cabinet'],
];
export const CABINET_PURPOSE_IDS = new Set(CABINET_PURPOSES.map(([id]) => id));

/** Cabinet box construction overrides; absent keys use automatic values. */
export const BOX_BACKS = ['dado', 'inset', 'applied', 'none'];
export const BOX_TOPS = ['between', 'overlay', 'spreaders', 'none'];
export const BOX_KEYS = ['back', 'top', 'bottom', 'left', 'right', 'finTop', 'finBottom'];

export const SHELF_NOSINGS = ['none', 'hardwood', 'folded'];
export const ROLLOUT_LAYOUTS = ['stack', 'pair'];
export const MAX_ROLLOUTS = 8;
export const MAX_SECTION_ACCESSORIES = 12;
export const MAX_ACCESSORY_QTY = 20;

/** Interior divider families follow the group's stacking direction. */
export const INTERIOR_DIVIDERS = {
  vertical: ['fixed', 'double_fixed', 'stretcher'],
  horizontal: ['partition', 'double_partition'],
};
export const INTERIOR_DIVIDER_LABELS = {
  fixed: 'Fixed shelf',
  double_fixed: 'Double fixed shelf',
  stretcher: 'Stretcher',
  partition: 'Partition',
  double_partition: 'Double partition',
};
export const STRETCHER_DEPTH = 4;
export const DADO_BACK_SETBACK = 0.75;
export const BACK_PANEL_THICKNESS = 0.25;

/** Display labels for derived piece kinds. */
export const KIND_LABELS = {
  cabinet: 'Cabinet',
  filler: 'Filler',
  end_panel: 'End panel',
  panel: 'Panel',
  void: 'Open',
  shelves: 'Shelves',
  shelf: 'Shelf',
};

/** Display colors for derived piece kinds. */
export const KIND_COLORS = {
  cabinet: '#3b82f6',
  filler: '#f59e0b',
  end_panel: '#8b5cf6',
  panel: '#8b5cf6',
  void: '#475569',
  shelves: '#0ea5e9',
  shelf: '#0ea5e9',
};

/** Display colors for cabinet run types. */
export const CABINET_TYPE_COLORS = {
  [CABINET_TYPE_IDS.BASE]: '#3b82f6',
  [CABINET_TYPE_IDS.UPPER]: '#14b8a6',
  [CABINET_TYPE_IDS.TALL]: '#8b5cf6',
};
