import { SETTINGS_REGISTRY, allowedAt, registryEntry } from './settingsRegistry.js';

export const SETTING_GROUPS = [
  {
    id: 'cabinets-depths', label: 'Cabinets & depths',
    keys: [
      'roundTo', 'minCabinetWidth', 'maxCabinetWidth', 'snapHeightsToDefaults',
      'baseDepth', 'upperDepth', 'tallDepth', 'standardDrawerHeights.european',
      'standardDrawerHeights.faceFrame', 'pairDoorAboveWidth',
      'floatingShelfThickness',
    ],
  },
  {
    id: 'runs-ends', label: 'Runs & ends',
    keys: [
      'minRunWidth', 'maxRunOverhang', 'runFlex', 'adjacentRunGap', 'defaultEnds.left',
      'defaultEnds.right', 'autoEndPanelOnFreeEnd', 'sheetThickness', 'bumperThickness',
      'furnitureBaseScribe', 'woodTopScribe',
    ],
  },
  {
    id: 'fillers-corners', label: 'Fillers & corners',
    keys: [
      'fillerMinWidth', 'fillerWarnWidth', 'defaultInteriorFillerWidth', 'fillerReturnDepth',
      'fillerReturnThickness', 'fillerThickness', 'fillerReturnTongue',
      'teeCover', 'teeThickness', 'blindFillerWidth', 'cornerFillerMinWidth',
    ],
  },
  {
    id: 'reveals', label: 'Reveals',
    keys: [
      'capturedSingleReveal', 'stackedUpperBottom', 'stackedLowerTop', 'woodTopReveal',
      'stoneTopReveal', 'profiledFit.edge', 'profiledFit.pairEdge', 'profiledFit.pairGap',
      'profiledFit.sharedGap',
    ],
  },
  {
    id: 'inset-face-frame', label: 'Inset face frame',
    keys: [
      'insetFrame.stile', 'insetFrame.rail', 'insetFrame.midRail', 'insetFrame.mullion',
      'insetFrame.upperDrop', 'insetFrame.thickness',
    ],
  },
  {
    id: 'bases-tops-bands', label: 'Bases, tops & bands',
    keys: [
      'baseCutoutFoot', 'baseCutoutHeight', 'toeKickTopGap', 'bottomPartHeights.light_rail',
      'bottomPartHeights.light_trough', 'bottomPartHeights.panel', 'bottomPartHeights.bottom_cap',
      'bottomPartHeights.corbels', 'belowRunOverhang', 'belowRunFlushReveal',
      'bandDepths.toeKickSetback', 'bandDepths.toeKickEndPanelSetback', 'bandDepths.toeKickSideSetback',
      'bandDepths.countertopOverhang', 'bandDepths.crownProjection',
    ],
  },
  {
    id: 'walls', label: 'Walls', keys: ['wallThickness'],
  },
  {
    id: 'openings-soffits', label: 'Openings & soffits',
    keys: [
      'casingWidth', 'casingThickness', 'casingClearance', 'openingsHaveCasing',
      'defaultOpeningMeasureMode', 'defaultSoffitDepth', 'defaultSoffitMolding',
      'doorPanelDefault', 'minOpeningWidth', 'defaultDoorWidth', 'defaultDoorHeight',
      'defaultWindowWidth', 'defaultWindowHeight', 'defaultWindowSillZ',
    ],
  },
  { id: 'pulls', label: 'Pulls', keys: [
    'doorPullId', 'doorPullAt', 'doorPullOrientation', 'pullHeight',
    'drawerPullId', 'drawerPullAt', 'drawerPullOrientation',
  ] },
  {
    id: 'drawer-boxes', label: 'Drawer boxes',
    keys: [
      'drawerSlideId', 'drawerBoxHeights.from', 'drawerBoxHeights.to', 'drawerBoxHeights.thenFrom',
      'drawerBoxHeights.max', 'drawerBoxHeights.step', 'drawerBoxHeights.warnAbove',
      'drawerBoxAdjustment', 'rolloutHeight', 'rolloutSpacer', 'prefinishedMapleExtra',
      'drawerBoxOrder.sideMaterial', 'drawerBoxOrder.sideThickness', 'drawerBoxOrder.bottomMaterial',
      'drawerBoxOrder.topEdge', 'drawerBoxOrder.bottomPlacement', 'drawerBoxOrder.assembly',
      'drawerBoxOrder.comments',
    ],
  },
  {
    id: 'shelves', label: 'Shelves',
    keys: [
      'shelfSpacing', 'shelfWidthClearance', 'shelfSetback', 'glassShelfThickness',
      'shelfNosingHeight', 'shelfNosingThickness', 'foldedNosingExtra',
      'shoeShelfAngle', 'shoeShelfClear',
    ],
  },
  {
    id: 'reports', label: 'Reports',
    keys: [
      'report.companyName', 'report.companyAddress', 'report.companyCity', 'report.companyState',
      'report.companyZip', 'report.companyPhone', 'report.companyFax', 'report.doorFormNote',
      'report.jobNumber', 'report.wood', 'report.finish', 'report.boxMaterial',
      'report.wireBrushed', 'report.edgebandAlert',
    ],
  },
];

const groupedKeys = new Set(SETTING_GROUPS.flatMap(({ keys }) => keys));
export const UNGROUPED_KEYS = SETTINGS_REGISTRY
  .map(({ key }) => key)
  .filter((key) => !groupedKeys.has(key));

export function groupsFor(scope) {
  return SETTING_GROUPS
    .map((group) => ({ ...group, keys: group.keys.filter((key) => allowedAt(key, scope)) }))
    .filter(({ keys }) => keys.length > 0);
}

export const CHOICE_LABELS = {
  filler: 'Filler',
  end_panel: 'End panel',
  none: 'None',
  crown: 'Crown',
  topMold: 'Top mold',
  jamb: 'Jamb',
  casing: 'Outside casing',
  toe_kick: 'Toe kick',
  furniture_base: 'Furniture base',
  auto: 'Auto',
  'top-corner': 'Top corner',
  'bottom-corner': 'Bottom corner',
  height: 'Tall pull height',
  center: 'Centred',
  'top-rail': 'On top rail',
  'bottom-rail': 'On bottom rail',
  vertical: 'Vertical',
  horizontal: 'Horizontal',
};

function plainWords(value) {
  return String(value).replaceAll('_', ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

export function choiceOptions(key) {
  const entry = registryEntry(key);
  if (entry?.kind === 'bool') return [{ value: true, label: 'On' }, { value: false, label: 'Off' }];
  if (entry?.kind === 'choice') {
    return entry.choices.map((value) => ({ value, label: CHOICE_LABELS[value] ?? plainWords(value) }));
  }
  return [];
}
