import { DEFAULT_PROFILE, DEFAULT_SETTINGS } from './constants.js';

export const SETTING_LEVELS = ['team', 'project', 'phase', 'room', 'wall', 'run', 'cabinet', 'face'];
export const LIBRARY_KEYS = ['teamDoorStyle', 'doorDesigns', 'sectionProfiles', 'shapes', 'pulls', 'slides', 'accessories'];
export const PREF_KEYS = ['orthoWalls', 'showPartNumbers', 'plotScale', 'paperSize', 'planGrid', 'openingSnap', 'cornerSnapDistance'];

const roomNumbers = [
  ['wallThickness', 'Wall thickness'],
  ['roundTo', 'Cabinet rounding'],
  ['runFlex', 'Run flex'],
  ['minCabinetWidth', 'Min cabinet width'],
  ['fillerMinWidth', 'Min filler width'],
  ['fillerWarnWidth', 'Filler warning width'],
  ['defaultInteriorFillerWidth', 'Interior filler width'],
  ['minRunWidth', 'Minimum run width'],
  ['maxRunOverhang', 'Maximum run overhang'],
  ['adjacentRunGap', 'Adjacent run gap'],
  ['sheetThickness', 'Sheet thickness'],
  ['bumperThickness', 'Bumper thickness'],
  ['baseDepth', 'Base depth'],
  ['upperDepth', 'Upper depth'],
  ['tallDepth', 'Tall depth'],
  ['baseCutoutFoot', 'Cutout foot'],
  ['baseCutoutHeight', 'Square cutout height'],
  ['furnitureBaseScribe', 'Furniture base scribe'],
  ['toeKickTopGap', 'Toe kick top gap'],
  ['fillerReturnDepth', 'Filler return depth'],
  ['fillerReturnThickness', 'Filler return thickness'],
  ['fillerThickness', 'Filler face thickness'],
  ['fillerReturnTongue', 'Filler return tongue'],
  ['teeCover', 'Tee cover'],
  ['teeThickness', 'Tee thickness'],
  ['blindFillerWidth', 'Blind filler width'],
  ['cornerFillerMinWidth', 'Corner filler minimum'],
  ['defaultSoffitDepth', 'Soffit depth'],
  ['casingWidth', 'Casing width'],
  ['casingThickness', 'Casing thickness'],
  ['casingClearance', 'Casing clearance'],
  ['pairDoorAboveWidth', 'Pair doors above width'],
  ['woodTopReveal', 'Wood top reveal'],
  ['stoneTopReveal', 'Stone top reveal'],
  ['capturedSingleReveal', 'Captured single reveal'],
  ['stackedUpperBottom', 'Stacked upper bottom reveal'],
  ['stackedLowerTop', 'Stacked lower top reveal'],
  ['floatingShelfThickness', 'Floating shelf thickness'],
  ['drawerBoxAdjustment', 'Drawer box vertical adjustment'],
  ['rolloutHeight', 'Roll-out height'],
  ['rolloutSpacer', 'Roll-out hinge spacer'],
  ['shelfSpacing', 'Min clear between shelves'],
  ['shelfWidthClearance', 'Shelf side clearance'],
  ['shelfSetback', 'Shelf front setback'],
  ['glassShelfThickness', 'Glass shelf thickness'],
  ['shelfNosingHeight', 'Shelf nosing height'],
  ['shelfNosingThickness', 'Shelf nosing thickness'],
  ['foldedNosingExtra', 'Folded nosing extra depth'],
  ['shoeShelfAngle', 'Shoe shelf slope (degrees)'],
  ['shoeShelfClear', 'Min clear above shoe shelves'],
  ['belowRunOverhang', 'Below run overhang'],
  ['belowRunFlushReveal', 'Below run flush reveal'],
];

const teamNumbers = [
  ['doorPanelDefault', 'Door panel thickness'],
  ['minOpeningWidth', 'Minimum opening width'],
  ['defaultDoorWidth', 'Door width'],
  ['defaultDoorHeight', 'Door height'],
  ['defaultWindowWidth', 'Window width'],
  ['defaultWindowHeight', 'Window height'],
  ['defaultWindowSillZ', 'Window sill height'],
];

const profileLabels = {
  wallHeight: 'Wall height',
  toeKickHeight: 'Toe kick / base height',
  baseKind: 'Base',
  furnitureBaseProud: 'Base proud',
  furnitureBaseProfileId: 'Furniture base profile',
  baseCutoutProfileId: 'Cutout profile',
  baseBoxHeight: 'Base box height',
  countertopThickness: 'Countertop thickness',
  nosingProfileId: 'Nosing profile',
  upperClearance: 'Upper clearance',
  crownTop: 'Top of crown',
  topMoldHeight: 'Top mold',
  topMoldOverhang: 'Top mold overhang',
  topMoldProfileId: 'Top mold profile',
  crownProfileId: 'Crown profile',
  crownHeight: 'Crown',
  crownStackHeight: 'Crown total',
};

function plainWords(key) {
  return key.replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function numberGroup(key, label) {
  return Object.keys(DEFAULT_SETTINGS[key]).map((leaf) => ({
    key: `${key}.${leaf}`, label: `${label} ${plainWords(leaf)}`, kind: 'number', lowest: 'room',
  }));
}

/** Each entry describes one settings leaf; managed entries retain their existing fields. */
export const SETTINGS_REGISTRY = [
  ...[
    ['companyName', 'Company name'],
    ['companyAddress', 'Address'],
    ['companyCity', 'City'],
    ['companyState', 'State'],
    ['companyZip', 'Zip'],
    ['companyPhone', 'Phone'],
    ['companyFax', 'Fax'],
    ['doorFormNote', 'Door form note'],
  ].map(([key, label]) => ({ key: `report.${key}`, label, kind: 'text', lowest: 'team' })),
  { key: 'report.jobNumber', label: 'Job #', kind: 'text', highest: 'project', lowest: 'room' },
  ...[
    ['wood', 'Wood'],
    ['finish', 'Finish'],
    ['boxMaterial', 'Boxes'],
    ['edgebandAlert', 'Edgeband alert'],
  ].map(([key, label]) => ({ key: `report.${key}`, label, kind: 'text', lowest: 'room' })),
  { key: 'report.wireBrushed', label: 'Wire brushed', kind: 'bool', lowest: 'room' },
  { key: 'doorPullId', label: 'Door pull', kind: 'pull', lowest: 'room' },
  { key: 'drawerPullId', label: 'Drawer pull', kind: 'pull', lowest: 'room' },
  { key: 'pullHeight', label: 'Tall door pull height', kind: 'number', lowest: 'room' },
  { key: 'doorPullAt', label: 'Door pull position', kind: 'choice', lowest: 'room',
    choices: ['auto', 'top-corner', 'bottom-corner', 'height', 'center', 'top-rail', 'bottom-rail'] },
  { key: 'doorPullOrientation', label: 'Door pull direction', kind: 'choice', lowest: 'room', choices: ['auto', 'vertical', 'horizontal'] },
  { key: 'drawerPullAt', label: 'Drawer pull position', kind: 'choice', lowest: 'room', choices: ['center', 'top-rail'] },
  { key: 'drawerPullOrientation', label: 'Drawer pull direction', kind: 'choice', lowest: 'room', choices: ['auto', 'vertical', 'horizontal'] },
  ...teamNumbers.map(([key, label]) => ({ key, label, kind: 'number', lowest: 'team' })),
  ...roomNumbers.map(([key, label]) => ({ key, label, kind: 'number', lowest: 'room' })),
  ...[
    ['snapHeightsToDefaults', 'Snap run heights to defaults'],
    ['autoEndPanelOnFreeEnd', 'Add end panels to free run ends'],
    ['openingsHaveCasing', 'New openings include casing'],
  ].map(([key, label]) => ({ key, label, kind: 'bool', lowest: 'room' })),
  ...['left', 'right'].map((side) => ({
    key: `defaultEnds.${side}`, label: `Default ends ${side}`, kind: 'choice', lowest: 'room',
    choices: ['filler', 'end_panel', 'none'],
  })),
  { key: 'defaultSoffitMolding', label: 'Soffit molding', kind: 'choice', lowest: 'room', choices: ['crown', 'topMold', 'none'] },
  { key: 'defaultOpeningMeasureMode', label: 'Default measured to', kind: 'choice', lowest: 'room', choices: ['jamb', 'casing'] },
  ...numberGroup('insetFrame', 'Inset frame'),
  ...numberGroup('profiledFit', 'Profiled fit'),
  ...numberGroup('standardDrawerHeights', 'Standard drawer height'),
  ...numberGroup('bottomPartHeights', 'Bottom part height'),
  { key: 'drawerSlideId', label: 'Drawer slide', kind: 'slide', lowest: 'room' },
  ...[
    ['from', 'Drawer box heights from'],
    ['to', 'Drawer box heights to'],
    ['thenFrom', 'Drawer box heights then from'],
    ['max', 'Tallest drawer box'],
    ['step', 'Drawer box height step'],
    ['warnAbove', 'Drawer box warning above'],
  ].map(([leaf, label]) => ({ key: `drawerBoxHeights.${leaf}`, label, kind: 'number', lowest: 'room' })),
  ...[
    ['sideMaterial', 'Box side material'],
    ['sideThickness', 'Box side thickness'],
    ['bottomMaterial', 'Box bottom material'],
    ['topEdge', 'Box top edge'],
    ['bottomPlacement', 'Box bottom placement'],
    ['assembly', 'Box assembly & finish'],
    ['comments', 'Box order comments'],
  ].map(([leaf, label]) => ({ key: `drawerBoxOrder.${leaf}`, label, kind: 'text', lowest: 'room' })),
  ...numberGroup('bandDepths', 'Band depth'),
  { key: 'maxCabinetWidth', label: 'Max cabinet width', kind: 'number', lowest: 'run', managedBy: 'run.maxCabinetWidth' },
  ...Object.keys(DEFAULT_PROFILE).map((leaf) => ({
    key: `defaultProfile.${leaf}`, label: profileLabels[leaf],
    kind: leaf.endsWith('Id') ? 'id' : leaf === 'baseKind' ? 'choice' : 'number',
    lowest: 'wall', managedBy: 'room.profile / wall.profile',
    ...(leaf === 'baseKind' ? { choices: ['toe_kick', 'furniture_base'] } : {}),
  })),
  ...Object.entries(DEFAULT_SETTINGS.faceReveals).flatMap(([type, reveals]) =>
    Object.keys(reveals).map((side) => ({
      key: `faceReveals.${type}.${side}`,
      label: `${{ 1: 'Base', 2: 'Upper', 3: 'Tall' }[type]} ${side} reveal`,
      kind: 'number', lowest: 'face', managedBy: 'cabinet / face reveals',
    }))),
  { key: 'defaultStyle.cabinetStyleId', label: 'Cabinet style', kind: 'choice', lowest: 'cabinet', managedBy: 'style fields', choices: [13, 14, 15] },
  { key: 'defaultStyle.beadWidth', label: 'Bead width', kind: 'number', lowest: 'cabinet', managedBy: 'style fields' },
];

const entriesByKey = new Map(SETTINGS_REGISTRY.map((entry) => [entry.key, entry]));

export function registryEntry(key) {
  return entriesByKey.get(key);
}

/** Managed settings may be set above room, but keep their existing override mechanism below it. */
export function allowedAt(key, level) {
  const entry = registryEntry(key);
  const rank = SETTING_LEVELS.indexOf(level);
  return Boolean(entry && rank >= 0
    && rank >= SETTING_LEVELS.indexOf(entry.highest ?? 'team')
    && rank <= SETTING_LEVELS.indexOf(entry.lowest)
    && !(entry.managedBy && rank >= SETTING_LEVELS.indexOf('room')));
}
