import { describe, expect, it } from 'vitest';
import { SETTINGS_REGISTRY, allowedAt, registryEntry } from '../settingsRegistry.js';
import { CHOICE_LABELS, SETTING_GROUPS, UNGROUPED_KEYS, choiceOptions, groupsFor } from '../index.js';

const expectedGroups = [
  ['Cabinets & depths', [
    'roundTo', 'minCabinetWidth', 'maxCabinetWidth', 'snapHeightsToDefaults', 'baseDepth',
    'upperDepth', 'tallDepth', 'standardDrawerHeights.european', 'standardDrawerHeights.faceFrame',
    'pairDoorAboveWidth', 'floatingShelfThickness',
  ]],
  ['Runs & ends', [
    'minRunWidth', 'maxRunOverhang', 'runFlex', 'adjacentRunGap', 'defaultEnds.left', 'defaultEnds.right',
    'autoEndPanelOnFreeEnd', 'sheetThickness', 'bumperThickness',
  ]],
  ['Fillers & corners', [
    'fillerMinWidth', 'fillerWarnWidth', 'defaultInteriorFillerWidth', 'fillerReturnDepth',
    'fillerReturnThickness', 'fillerThickness', 'fillerReturnTongue',
    'teeCover', 'teeThickness', 'blindFillerWidth', 'cornerFillerMinWidth',
  ]],
  ['Reveals', [
    'capturedSingleReveal', 'stackedUpperBottom', 'stackedLowerTop', 'woodTopReveal', 'stoneTopReveal',
    'profiledFit.edge', 'profiledFit.pairEdge', 'profiledFit.pairGap', 'profiledFit.sharedGap',
  ]],
  ['Inset face frame', [
    'insetFrame.stile', 'insetFrame.rail', 'insetFrame.midRail', 'insetFrame.mullion',
    'insetFrame.upperDrop', 'insetFrame.thickness',
  ]],
  ['Bases, tops & bands', [
    'baseCutoutFoot', 'baseCutoutHeight', 'furnitureBaseScribe', 'bottomPartHeights.light_rail',
    'bottomPartHeights.light_trough', 'bottomPartHeights.panel', 'bottomPartHeights.bottom_cap',
    'bottomPartHeights.corbels', 'belowRunOverhang', 'belowRunFlushReveal', 'bandDepths.toeKickSetback',
    'bandDepths.toeKickEndPanelSetback', 'bandDepths.toeKickSideSetback',
    'bandDepths.countertopOverhang', 'bandDepths.crownProjection',
  ]],
  ['Openings & soffits', [
    'casingWidth', 'casingThickness', 'casingClearance', 'openingsHaveCasing', 'defaultOpeningMeasureMode',
    'defaultSoffitDepth', 'defaultSoffitMolding', 'doorPanelDefault', 'minOpeningWidth',
    'defaultDoorWidth', 'defaultDoorHeight', 'defaultWindowWidth', 'defaultWindowHeight', 'defaultWindowSillZ',
  ]],
  ['Pulls', ['doorPullId', 'drawerPullId', 'pullHeight']],
  ['Drawer boxes', [
    'drawerSlideId', 'drawerBoxHeights.from', 'drawerBoxHeights.to', 'drawerBoxHeights.thenFrom',
    'drawerBoxHeights.max', 'drawerBoxHeights.step', 'drawerBoxHeights.warnAbove',
    'drawerBoxAdjustment', 'rolloutHeight', 'rolloutSpacer',
    'drawerBoxOrder.sideMaterial', 'drawerBoxOrder.sideThickness', 'drawerBoxOrder.bottomMaterial',
    'drawerBoxOrder.topEdge', 'drawerBoxOrder.bottomPlacement', 'drawerBoxOrder.assembly',
    'drawerBoxOrder.comments',
  ]],
  ['Shelves', [
    'shelfSpacing', 'shelfWidthClearance', 'shelfSetback', 'glassShelfThickness',
    'shelfNosingHeight', 'shelfNosingThickness', 'foldedNosingExtra',
  ]],
  ['Reports', [
    'report.companyName', 'report.companyAddress', 'report.companyCity', 'report.companyState',
    'report.companyZip', 'report.companyPhone', 'report.companyFax', 'report.doorFormNote',
    'report.jobNumber', 'report.wood', 'report.finish', 'report.boxMaterial',
    'report.wireBrushed', 'report.edgebandAlert',
  ]],
];

describe('DB2 b setting groups and choice labels', () => {
  it('partitions every registry key exactly once with 38 ungrouped keys (anchor 1)', () => {
    const keys = [...SETTING_GROUPS.flatMap((group) => group.keys), ...UNGROUPED_KEYS];
    expect(keys.toSorted()).toEqual(SETTINGS_REGISTRY.map(({ key }) => key).toSorted());
    expect(new Set(keys).size).toBe(keys.length);
    expect(UNGROUPED_KEYS).toHaveLength(38);
    expect(UNGROUPED_KEYS).toEqual(SETTINGS_REGISTRY.map(({ key }) => key)
      .filter((key) => /^(defaultProfile|faceReveals|defaultStyle)\./.test(key)));
  });

  it('keeps eleven team groups and 115 keys in order, excluding project-only Job #', () => {
    const groups = groupsFor('team');
    expect(groups.map(({ label, keys }) => [label, keys])).toEqual(expectedGroups.map(([label, keys]) => [label, keys.filter((key) => allowedAt(key, 'team'))]));
    expect(groups.flatMap(({ keys }) => keys)).not.toContain('report.jobNumber');
    expect(groups.map(({ keys }) => keys.length)).toEqual([11, 9, 11, 9, 6, 15, 14, 3, 17, 7, 13]);
    expect(groups.flatMap(({ keys }) => keys)).toHaveLength(115);
    expect(new Set(groups.map(({ id }) => id)).size).toBe(11);
    for (const { id } of groups) expect(id).toEqual(expect.any(String));
  });

  it('filters room groups to 100 allowed keys without team-only or managed entries', () => {
    const groups = groupsFor('room');
    const keys = groups.flatMap((group) => group.keys);
    expect(groups.map((group) => group.keys.length)).toEqual([10, 9, 11, 9, 6, 15, 7, 3, 17, 7, 6]);
    expect(keys).toHaveLength(100);
    expect(groups.map(({ label, keys }) => [label, keys])).toEqual(expectedGroups
      .map(([label, groupKeys]) => [label, groupKeys.filter((key) => allowedAt(key, 'room'))]));
    expect(groups.map(({ id }) => id)).toEqual(SETTING_GROUPS.map(({ id }) => id));
    for (const key of keys) {
      expect(registryEntry(key).lowest).not.toBe('team');
      expect(registryEntry(key).managedBy).toBeUndefined();
    }
    groups[0].keys.pop();
    expect(SETTING_GROUPS.map(({ label, keys }) => [label, keys])).toEqual(expectedGroups);
    expect(groupsFor('unknown')).toEqual([]);
  });

  it('labels opening measurement choices in registry order (anchor 4)', () => {
    expect(choiceOptions('defaultOpeningMeasureMode')).toEqual([
      { value: 'jamb', label: 'Jamb' }, { value: 'casing', label: 'Outside casing' },
    ]);
  });

  it('offers boolean On and Off choices (anchor 5)', () => {
    expect(choiceOptions('openingsHaveCasing')).toEqual([
      { value: true, label: 'On' }, { value: false, label: 'Off' },
    ]);
  });

  it('labels default ends in registry order (anchor 6)', () => {
    expect(choiceOptions('defaultEnds.left')).toEqual([
      { value: 'filler', label: 'Filler' }, { value: 'end_panel', label: 'End panel' },
      { value: 'none', label: 'None' },
    ]);
    expect(choiceOptions('defaultEnds.right')).toEqual(choiceOptions('defaultEnds.left'));
  });

  it('provides the remaining choice labels and falls back for unlabeled values', () => {
    expect(CHOICE_LABELS).toEqual({
      filler: 'Filler', end_panel: 'End panel', none: 'None', crown: 'Crown', topMold: 'Top mold',
      jamb: 'Jamb', casing: 'Outside casing', toe_kick: 'Toe kick', furniture_base: 'Furniture base',
    });
    expect(choiceOptions('defaultSoffitMolding')).toEqual([
      { value: 'crown', label: 'Crown' }, { value: 'topMold', label: 'Top mold' },
      { value: 'none', label: 'None' },
    ]);
    expect(choiceOptions('defaultProfile.baseKind')).toEqual([
      { value: 'toe_kick', label: 'Toe kick' }, { value: 'furniture_base', label: 'Furniture base' },
    ]);
    expect(choiceOptions('defaultStyle.cabinetStyleId')).toEqual([
      { value: 13, label: '13' }, { value: 14, label: '14' }, { value: 15, label: '15' },
    ]);
    expect(choiceOptions('baseDepth')).toEqual([]);
    expect(choiceOptions('unknown')).toEqual([]);
  });
});
