import HeightBands from '../HeightBands.jsx';
import PanelTabs from '../panel/PanelTabs.jsx';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { gridFromItems } from '../../model/grid.js';
import { runScene } from '../../model/runScene.js';
import { toElevationDocument } from '../../store/persistence.js';
import elevationReducer from '../../store/elevationSlice.js';
import { fixed, run as fixtureRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import KindPanel from '../../../library/profileEditor/KindPanel.jsx';
import InchInput from '../InchInput.jsx';
import SettingsPanel from '../SettingsPanel.jsx';
import ShopHeightsPanel from '../ShopHeightsPanel.jsx';
import SettingGroups from '../SettingGroups.jsx';
import SettingField from '../SettingField.jsx';
import RoomHeightsPanel from '../RoomHeightsPanel.jsx';
import OverrideField from '../OverrideField.jsx';
import OverrideInput from '../OverrideInput.jsx';
import BaseCutoutRow from '../properties/BaseCutoutRow.jsx';
import AddBaseCutoutButton from '../properties/AddBaseCutoutButton.jsx';
import CabinetProperties from '../properties/CabinetProperties.jsx';
import CellProperties from '../properties/CellProperties.jsx';
import PieceProperties from '../properties/PieceProperties.jsx';
import RunProperties from '../properties/RunProperties.jsx';
import RunBaseCutoutsSection from '../properties/RunBaseCutoutsSection.jsx';
import RunHeightsSection from '../properties/RunHeightsSection.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({
  ...await original(), useState: vi.fn(), useEffect: vi.fn(), useMemo: (callback) => callback(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const cut1 = { id: 'cut1', name: 'Cutout cove', kind: 'base_cutout', geometry: { units: 'in',
  points: { a: [0, 0], b: [1.5, 1.5] }, loops: [{ id: 'L1', closed: false,
    segs: [{ type: 'arc', from: 'a', to: 'b', center: [0, 1.5], ccw: true }] }] } };
let state;
const dispatch = vi.fn((action) => { state = structuredClone(elevationReducer(state, action)); });
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const props = () => ({ room: room(), wall: wall(), run: run(), settings: state.settings });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? tree.type === ShopHeightsPanel || tree.type === HeightBands || tree.type === OverrideInput || tree.type === OverrideField || tree.type === SettingGroups || tree.type === SettingField
      ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : text(tree?.props?.children ?? []);
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const options = (picker) => nodes(picker).filter(({ type }) => type === 'option');
const warnings = (tree) => nodes(tree).filter(({ type, props }) => type === 'p' && props.className?.includes('text-amber-400')).map(text);
const expandCutoutRows = (tree) => {
  if (Array.isArray(tree)) return tree.map(expandCutoutRows);
  if (!tree || typeof tree !== 'object') return tree;
  if (tree.type === BaseCutoutRow) return expandCutoutRows(BaseCutoutRow(tree.props));
  return { ...tree, props: { ...tree.props, children: expandCutoutRows(tree.props.children) } };
};
const render = (extra = {}) => expandCutoutRows(RunBaseCutoutsSection({ ...props(), ...extra }));
const sizeTab = (tree) => nodes(tree).find(({ type }) => type === PanelTabs).props.children('size');
const piecePanel = (id = 'c1') => {
  const scene = runScene(room(), wall(), run(), state.settings);
  const piece = scene.cells.pieces.find((candidate) => candidate.id === id);
  const item = { id, kind: 'cabinet', width: piece.width };
  const outer = PieceProperties({ ...props(), layout: scene.result, cells: scene.cells, selectionContext: { piece, item } });
  const component = nodes(outer).find(({ type }) => type === CabinetProperties || type === CellProperties);
  const panel = sizeTab(component.type(component.props));
  const section = nodes(panel).find(({ type }) => type === RunBaseCutoutsSection);
  return expandCutoutRows(RunBaseCutoutsSection(section.props));
};
const commit = (label, value, panel = render) => field(panel(), `Cutout 1 ${label}`).props.onCommit(value);
const change = (label, value) => field(render(), label).props.onChange({ target: { value } });
const add = (id = 'c1') => {
  const scene = runScene(room(), wall(), run(), state.settings);
  const piece = scene.cells.pieces.find((piece) => piece.id === id);
  AddBaseCutoutButton({ ...props(), piece }).props.onClick();
};
const panels = [
  ['Default', () => SettingsPanel(), () => state.settings.defaultProfile],
  ['Room', () => RoomHeightsPanel(), () => room().profile],
  ['Wall', () => WallHeightProperties({ room: room(), wall: wall(), plan: false }), () => wall().profile],
];

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(fixtureRun({ x: 30, width: 36, autoCount: false,
    ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [fixed('c1', 18), fixed('c2', 18)],
  }));
  room().profile = {};
  Object.assign(state.settings.defaultProfile, { baseKind: 'furniture_base', toeKickHeight: 4 });
  state.settings.sectionProfiles = structuredClone([cut1, { ...cut1, id: 'archived', archived: true }, { ...cut1, id: 'wrong', kind: 'crown' }]);
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
  useState.mockImplementation(() => [true, vi.fn()]);
});

describe('Step 494 base cutout controls', () => {
  it('adds a cutout from a cabinet, stores typed width 24 and removes the key when cleared', () => {
    add();
    expect(run().baseCutouts).toEqual([{ id: expect.any(String), from: 'c1', to: 'c1' }]);
    expect(field(render(), 'Cutout 1 Width').props).toMatchObject({ value: null, allowBlank: true, placeholder: '12' });
    useState.mockReturnValueOnce(['24', vi.fn()]);
    InchInput(field(render(), 'Cutout 1 Width').props).props.onBlur();
    expect(run().baseCutouts[0].width).toBe(24);
    useState.mockReturnValueOnce(['', vi.fn()]);
    InchInput(field(render(), 'Cutout 1 Width').props).props.onBlur();
    expect(run().baseCutouts[0]).not.toHaveProperty('width');
    expect(toElevationDocument(state).rooms[0].walls[0].runs[0].baseCutouts[0]).not.toHaveProperty('width');
    expect(field(render(), 'Cutout 1 Width').props.value).toBeNull();
    expect(field(render(), 'Cutout 1 Width').props.onCommit(0)).toBe(false);
    expect(field(render(), 'Cutout 1 Width').props.onCommit(-1)).toBe(false);
  });

  it('wires the cabinet and run panels and keeps Add base cutout limited to floor cabinets', () => {
    const scene = runScene(room(), wall(), run(), state.settings);
    const piece = scene.cells.pieces.find(({ id }) => id === 'c1');
    const panelProps = { ...props(), piece, item: { id: 'c1', kind: 'cabinet', width: 18 }, layout: scene.result, cells: scene.cells };
    const outer = PieceProperties({ ...panelProps, selectionContext: { piece, item: panelProps.item } });
    const cabinet = nodes(outer).find(({ type }) => type === CabinetProperties);
    expect(cabinet.props.room).toBe(room());
    const section = nodes(sizeTab(CabinetProperties(cabinet.props))).find(({ type }) => type === RunBaseCutoutsSection);
    expect(section.props.numbers).toBe(cabinet.props.numbers);
    const cutouts = RunBaseCutoutsSection(section.props);
    const button = nodes(cutouts).find(({ type }) => type === AddBaseCutoutButton);
    expect(text(AddBaseCutoutButton(button.props))).toBe('Add base cutout');
    const panel = RunProperties({ ...props(), layout: scene.result, showMessage: vi.fn() });
    const runPanel = panel.props.children('heights');
    expect(nodes(runPanel).find(({ type }) => type === RunBaseCutoutsSection).props).toMatchObject(props());
    expect(AddBaseCutoutButton({ ...props(), piece: { ...piece, z: piece.z + 1 } })).toBeNull();
    expect(AddBaseCutoutButton({ ...props(), piece: { ...piece, kind: 'filler' } })).toBeNull();
    for (const changes of [
      { overrides: { baseKind: 'toe_kick' } }, { overrides: { toeKickHeight: 0 } },
      { cabinetTypeId: CABINET_TYPE_IDS.UPPER }, { stack: { below: { runId: 'below', offset: 0 } } },
    ]) {
      expect(AddBaseCutoutButton({ ...props(), run: { ...run(), ...changes }, piece })).toBeNull();
    }
  });

  it('offers split bottom-row cells and excludes the upper cell from endpoint options', () => {
    const stack = { id: 'column', cols: [{ id: 'col', size: null }],
      rows: [{ id: 'top', size: null }, { id: 'bottom', size: null }], cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 1, node: { id: 'upper', kind: 'cabinet' } },
        { col: 0, row: 1, colSpan: 1, rowSpan: 1, node: { id: 'lower', kind: 'cabinet' } },
      ] };
    run().grid = gridFromItems(run().id, [{ id: 'column', kind: 'cabinet', width: null, grid: stack }]);
    const scene = runScene(room(), wall(), run(), state.settings);
    const piece = scene.cells.pieces.find(({ id }) => id === 'lower');
    const item = stack.cells[1].node;
    const panelProps = { ...props(), piece, item, layout: scene.result, cells: scene.cells };
    const outer = PieceProperties({ ...panelProps, selectionContext: { piece, item } });
    const cell = nodes(outer).find(({ type }) => type === CellProperties);
    expect(cell.props.room).toBe(room());
    const section = nodes(sizeTab(CellProperties(cell.props))).find(({ type }) => type === RunBaseCutoutsSection);
    expect(section.props.numbers).toBe(cell.props.numbers);
    const cutouts = RunBaseCutoutsSection(section.props);
    const button = nodes(cutouts).find(({ type }) => type === AddBaseCutoutButton);
    AddBaseCutoutButton(button.props).props.onClick();
    expect(run().baseCutouts[0]).toMatchObject({ from: 'lower', to: 'lower' });
    expect(options(field(render(), 'Cutout 1 From')).map(({ props }) => props.value)).toEqual(['lower']);
    expect(field(piecePanel('lower'), 'Cutout 1 From').props.value).toBe('lower');
    expect(nodes(piecePanel('lower')).some(({ type }) => type === AddBaseCutoutButton)).toBe(false);
    expect(text(piecePanel('upper'))).toBe('');
    expect(AddBaseCutoutButton({ ...props(), piece: scene.cells.pieces.find(({ id }) => id === 'upper') })).toBeNull();
  });

  it('orders endpoints by position, updates spans and their automatic width', () => {
    add('c2');
    const choices = options(field(render(), 'Cutout 1 From'));
    expect(choices.map(({ props }) => props.value)).toEqual(['c1', 'c2']);
    expect(choices.map(text)).toEqual(['#2 — 18"', '#3 — 18"']);
    change('Cutout 1 From', 'c1');
    expect(run().baseCutouts[0]).toMatchObject({ from: 'c1', to: 'c2' });
    expect(field(render(), 'Cutout 1 Width').props.placeholder).toBe('30');
    change('Cutout 1 From', 'c2');
    change('Cutout 1 To', 'c1');
    expect(field(render(), 'Cutout 1 Width').props.placeholder).toBe('30');
    state.settings.baseCutoutFoot = 4;
    expect(field(render(), 'Cutout 1 Width').props.placeholder).toBe('28');
  });

  it('case 1: edits an added single-cabinet cutout in the cabinet panel with 3 / 30 / 3 placeholders', () => {
    run().grid = gridFromItems(run().id, [fixed('c1', 36)]);
    add();
    const panel = piecePanel();
    expect(panel.props.title).toBe('Base cutouts');
    expect(nodes(panel).some(({ type }) => type === AddBaseCutoutButton)).toBe(false);
    expect(field(panel, 'Cutout 1 From').props.value).toBe('c1');
    expect(['Left', 'Width', 'Right'].map((label) => field(panel, `Cutout 1 ${label}`).props.placeholder))
      .toEqual(['3', '30', '3']);
    commit('Left', 2, piecePanel);
    expect(run().baseCutouts[0].left).toBe(2);
    expect(field(render(), 'Cutout 1 Width').props.placeholder).toBe('31');
    field(piecePanel(), 'Remove base cutout 1').props.onClick();
    expect(text(AddBaseCutoutButton(nodes(piecePanel()).find(({ type }) => type === AddBaseCutoutButton).props))).toBe('Add base cutout');
  });

  it('case 2: shows a spanning cutout on the second cabinet with derived width 30', () => {
    add();
    change('Cutout 1 To', 'c2');
    const panel = piecePanel('c2');
    expect(field(panel, 'Cutout 1 From').props.value).toBe('c1');
    expect(field(panel, 'Cutout 1 To').props.value).toBe('c2');
    expect(field(panel, 'Cutout 1 Width').props.placeholder).toBe('30');
    expect(nodes(panel).some(({ type }) => type === AddBaseCutoutButton)).toBe(false);
    const scene = runScene(room(), wall(), run(), state.settings);
    expect(AddBaseCutoutButton({ ...props(), piece: scene.cells.pieces.find(({ id }) => id === 'c2') })).toBeNull();
    // Coverage uses the full cabinet span, even if the resolved opening is narrower.
    commit('Width', 1);
    expect(field(piecePanel('c2'), 'Cutout 1 From')).toBeDefined();
  });

  it('case 3: keeps Left 2 and Right 5, then centres Width 24 by clearing both clearances', () => {
    add();
    commit('Left', 2);
    commit('Right', 5);
    const refs = { id: run().baseCutouts[0].id, from: 'c1', to: 'c1' };
    expect(run().baseCutouts[0]).toEqual({ ...refs, left: 2, right: 5 });
    commit('Width', 24);
    expect(run().baseCutouts[0]).toEqual({ ...refs, width: 24 });
  });

  it('case 4: clears Width 24 when Right 1 is typed alongside Left 4 (and mirrors this for Left)', () => {
    add();
    commit('Width', 24);
    commit('Left', 4);
    expect(run().baseCutouts[0]).toMatchObject({ width: 24, left: 4 });
    commit('Right', 1);
    const refs = { id: run().baseCutouts[0].id, from: 'c1', to: 'c1' };
    expect(run().baseCutouts[0]).toEqual({ ...refs, left: 4, right: 1 });
    commit('Left', null);
    commit('Width', 24);
    expect(run().baseCutouts[0]).toEqual({ ...refs, width: 24, right: 1 });
    commit('Left', 2);
    expect(run().baseCutouts[0]).toEqual({ ...refs, left: 2, right: 1 });
  });

  it('case 5: labels endpoint options with part-number overrides and falls back to position', () => {
    room().partNumberOverrides = { c1: 7, c2: 8 };
    add();
    for (const panel of [render(), piecePanel()]) {
      for (const key of ['From', 'To']) {
        expect(options(field(panel, `Cutout 1 ${key}`)).map(text)).toEqual(['#7 — 18"', '#8 — 18"']);
      }
    }
    expect(options(field(render({ numbers: { byKey: new Map() } }), 'Cutout 1 From')).map(text))
      .toEqual(['1 — 18"', '2 — 18"']);
  });

  it('derives placeholders for all dimension pairs and for cutouts skipped by warnings', () => {
    run().grid = gridFromItems(run().id, [fixed('c1', 36)]);
    add();
    const refs = run().baseCutouts[0];
    for (const [dimensions, expected] of [
      [{}, ['3', '30', '3']], [{ width: 24 }, ['6', '24', '6']],
      [{ left: 2 }, ['2', '31', '3']], [{ right: 5 }, ['3', '28', '5']],
      [{ left: 2, right: 5 }, ['2', '29', '5']],
      [{ width: 24, left: 4 }, ['4', '24', '8']], [{ width: 24, right: 1 }, ['11', '24', '1']],
      [{ left: 40, right: 5 }, ['40', '-9', '5']],
    ]) {
      run().baseCutouts = [{ ...refs, ...dimensions }];
      expect(['Left', 'Width', 'Right'].map((label) => field(render(), `Cutout 1 ${label}`).props.placeholder))
        .toEqual(expected);
    }
    expect(warnings(piecePanel())).toEqual(['The cutout is too narrow for its profile or feet.']);
    run().baseCutouts[0].to = 'missing';
    expect(['Left', 'Width', 'Right'].map((label) => field(render(), `Cutout 1 ${label}`).props.placeholder))
      .toEqual(['Auto', 'Auto', 'Auto']);
  });

  it('accepts zero clearances, rejects negative and nonfinite dimensions, and removes cleared keys', () => {
    add();
    for (const label of ['Left', 'Right', 'Width']) {
      for (const value of [-1, Infinity, NaN]) expect(commit(label, value)).toBe(false);
    }
    for (const label of ['Left', 'Right']) {
      commit(label, 0);
      expect(run().baseCutouts[0][label.toLowerCase()]).toBe(0);
      useState.mockReturnValueOnce(['', vi.fn()]);
      InchInput(field(render(), `Cutout 1 ${label}`).props).props.onBlur();
      expect(run().baseCutouts[0]).not.toHaveProperty(label.toLowerCase());
    }
    expect(toElevationDocument(state).rooms[0].walls[0].runs[0].baseCutouts[0])
      .toEqual({ id: expect.any(String), from: 'c1', to: 'c1' });
  });

  it('shows every covering cutout, including coverage of an interior cabinet in a reversed span', () => {
    run().grid = gridFromItems(run().id, [fixed('c1', 12), fixed('c2', 12), fixed('c3', 12)]);
    run().baseCutouts = [
      { id: 'first', from: 'c3', to: 'c1' },
      { id: 'second', from: 'c2', to: 'c2' },
    ];
    const panel = piecePanel('c2');
    expect(field(panel, 'Cutout 1 From').props.value).toBe('c3');
    expect(field(panel, 'Cutout 2 From').props.value).toBe('c2');
    expect(nodes(panel).some(({ type }) => type === AddBaseCutoutButton)).toBe(false);
    run().baseCutouts = [{ id: 'only', from: 'c1', to: 'c1' }];
    expect(text(AddBaseCutoutButton(nodes(piecePanel('c2')).find(({ type }) => type === AddBaseCutoutButton).props))).toBe('Add base cutout');
  });

  it('distinguishes Inherit, Square and active profiles and retains unavailable picks', () => {
    add();
    expect(options(field(render(), 'Cutout 1 Profile')).map(text)).toEqual(['Inherit', 'Square', 'Cutout cove']);
    change('Cutout 1 Profile', 'cut1');
    expect(run().baseCutouts[0].profileId).toBe('cut1');
    state.settings.sectionProfiles[0].archived = true;
    expect(options(field(render(), 'Cutout 1 Profile')).at(-1).props.disabled).toBe(true);
    expect(warnings(render())).toEqual([]);
    change('Cutout 1 Profile', 'square');
    expect(run().baseCutouts[0].profileId).toBeNull();
    change('Cutout 1 Profile', '');
    expect(run().baseCutouts[0]).not.toHaveProperty('profileId');
    expect(field(render(), 'Cutout 1 Profile').props.value).toBe('');
  });

  for (const [code, changes, message] of [
    ['orphaned', { to: 'missing' }, 'A selected cabinet is missing or is no longer on the bottom row.'],
    ['no-base', {}, 'This run has no furniture base.'],
    ['profile-bad', { profileId: 'missing' }, 'The profile must be an open line from the floor to its highest point; square notch used.'],
    ['too-narrow', { profileId: 'cut1', width: 1 }, 'The cutout is too narrow for its profile or feet.'],
    ['too-tall', {}, 'The cutout must be shorter than the base.'],
    ['overlap', { width: 40 }, 'The cutout overlaps another cutout or extends past the base ends.'],
  ]) {
    it(`shows the ${code} warning beside its row`, () => {
      add();
      add('c2');
      Object.assign(run().baseCutouts[0], changes);
      if (code === 'no-base') run().overrides.baseKind = 'toe_kick';
      if (code === 'too-tall') state.settings.baseCutoutHeight = 4;
      const tree = render();
      expect(warnings(field(tree, 'Base cutout 1'))).toEqual([message]);
      if (!['no-base', 'too-tall'].includes(code)) expect(warnings(field(tree, 'Base cutout 2'))).toEqual([]);
      if (code === 'orphaned') {
        expect(text(options(field(tree, 'Cutout 1 To'))[0])).toBe('Missing cabinet');
        expect(options(field(tree, 'Cutout 1 To'))[0].props.disabled).toBe(true);
      }
      const heights = RunHeightsSection({ ...props(), actionBase: { wallId: wall().id, runId: run().id }, validateAndDispatch: vi.fn() });
      expect(warnings(heights)).toEqual([]);
    });
  }

  it('removes the selected row and keeps an empty list usable', () => {
    add();
    add('c2');
    field(render(), 'Remove base cutout 1').props.onClick();
    expect(run().baseCutouts).toEqual([{ id: expect.any(String), from: 'c2', to: 'c2' }]);
    field(render(), 'Remove base cutout 1').props.onClick();
    expect(run().baseCutouts).toEqual([]);
    expect(text(render())).toContain('Select a bottom-row cabinet');
    run().overrides.baseKind = 'toe_kick';
    expect(render()).toBeNull();
  });

  it('saves Cutout foot and Square cutout height settings and rejects invalid dimensions', () => {
    useState.mockImplementation((initial) => [typeof initial === 'object' ? { 'bases-tops-bands': true } : true, vi.fn()]);
    expect(field(SettingsPanel(), 'Cutout foot').props.value).toBe(3);
    expect(field(SettingsPanel(), 'Square cutout height').props.value).toBe(1.5);
    field(SettingsPanel(), 'Cutout foot').props.onCommit(0);
    field(SettingsPanel(), 'Square cutout height').props.onCommit(2);
    expect(state.settings).toMatchObject({ baseCutoutFoot: 0, baseCutoutHeight: 2 });
    expect(field(SettingsPanel(), 'Cutout foot').props.onCommit(-1)).toBe(false);
    expect(field(SettingsPanel(), 'Square cutout height').props.onCommit(0)).toBe(false);
    expect(field(SettingsPanel(), 'Square cutout height').props.onCommit(-1)).toBe(false);
  });

  for (const [scope, panel, target] of panels) {
    it(`${scope}: saves cutout profiles with furniture fields and clears picks according to scope`, () => {
      const label = `${scope} Cutout profile${scope === 'Wall' ? ' override' : ''}`;
      const picker = field(panel(), label);
      expect(options(picker).map(text)).toEqual(scope === 'Default'
        ? ['Square', 'Cutout cove'] : [scope === 'Room' ? 'Inherit (Square)' : 'Inherit', 'Square', 'Cutout cove']);
      picker.props.onChange({ target: { value: 'cut1' } });
      expect(target().baseCutoutProfileId).toBe('cut1');
      state.settings.sectionProfiles[0].archived = true;
      expect(options(field(panel(), label)).at(-1).props.disabled).toBe(true);
      field(panel(), label).props.onChange({ target: { value: 'plain' } });
      expect(target().baseCutoutProfileId).toBeNull();
      if (scope !== 'Default') {
        field(panel(), label).props.onChange({ target: { value: '' } });
        expect(target()).not.toHaveProperty('baseCutoutProfileId');
      }
      target().baseKind = 'toe_kick';
      expect(field(panel(), label)).toBeUndefined();
    });
  }

  it('explains the open mirrored cutout in the profile editor and names its usage', () => {
    const tree = KindPanel({ profile: cut1, onApply: vi.fn() });
    expect(text(tree)).toContain("0, 0 is where the cutout leaves the floor. Draw one side as an open line rising to the cutout's top; it's mirrored, and a level line joins the two.");
    expect(text(tree)).toContain('Can be picked for base cutouts.');
    expect(text(tree)).not.toContain('Draw the shape from there');
    expect(field(tree, 'Stretch line')).toBeUndefined();
  });
});
