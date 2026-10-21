import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { MOLDING_NOTES } from '../../model/heightBands.js';
import elevationReducer from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import HeightBands from '../HeightBands.jsx';
import InchInput from '../InchInput.jsx';
import Field, { ReadOnlyValue } from '../properties/Field.jsx';
import RunHeightsSection from '../properties/RunHeightsSection.jsx';
import WallHeightProperties from '../properties/WallHeightProperties.jsx';

vi.mock('react', async (original) => ({
  ...await original(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
  useEffect: vi.fn(),
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [HeightBands, Field, ReadOnlyValue].includes(tree.type)
      ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const bands = (tree) => nodes(tree).filter(({ props }) => props['data-height-band']);
const band = (tree, id) => bands(tree).find(({ props }) => props['data-height-band'] === id);
const controls = (tree) => nodes(tree).filter(({ type }) => type === InchInput || type === 'select')
  .map(({ props }) => props['aria-label']);
const getByLabelText = (tree, label) => {
  const control = nodes(tree).find(({ props }) => props['aria-label'] === label);
  expect(control, label).toBeDefined();
  return control;
};
const hasAutoTag = (tree, label) => {
  const readout = getByLabelText(tree, label);
  const wrapper = nodes(tree).find(({ type, props }) => type === 'label' && nodes(props.children).some(({ props }) => props['aria-label'] === label));
  expect(nodes(wrapper).some(({ type, props }) => type === 'span' && props.children === 'auto')).toBe(true);
  expect(readout.props.className).toContain('border-dashed border-gray-700');
};
const notes = (tree) => nodes(tree).filter(({ type, props }) => type === 'p' && props.className?.includes('text-amber-400')).map(text);
let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const wallTree = () => WallHeightProperties({ room: room(), wall: wall(), plan: false });
const runTree = () => RunHeightsSection({
  room: room(), wall: wall(), run: run(), settings: state.settings,
  actionBase: { wallId: wall().id, runId: run().id }, validateAndDispatch: vi.fn(),
});
const runLabels = (labels) => labels.map((label) => `Run ${label} override`);
const wallLabels = (labels) => labels.map((label) => `Wall ${label} override`);

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ heightMode: 'auto' }));
  state.settings.defaultProfile = { ...state.settings.defaultProfile, crownProfileId: 'none', topMoldProfileId: 'none' };
  room().profile = {};
  state.settings.sectionProfiles = [];
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: { ...state, settings: { ...state.settings } } }));
});

describe('UI1 step b wall and run height bands', () => {
  it('groups the wall toe-kick fields without wall, uppers, settings or new overrides (anchor 1)', () => {
    room().profile = { baseKind: 'toe_kick', crownTop: 90 };
    const tree = wallTree();
    expect(bands(tree).map(({ props }) => props['data-height-band'])).toEqual(['crown', 'countertop', 'base']);
    const crown = band(tree, 'crown');
    expect(controls(crown)).toEqual(wallLabels(['Top of crown', 'Crown total', 'Crown', 'Crown profile',
      'Top mold', 'Top mold profile', 'Top mold overhang']));
    expect(crown.props.children[0].props.children.slice(0, 3).map(controls)).toEqual([
      wallLabels(['Top of crown', 'Crown total']), wallLabels(['Crown', 'Crown profile']), wallLabels(['Top mold', 'Top mold profile']),
    ]);
    expect(text(crown.props.children[1])).toMatch(/Overlap|Gap/);
    expect(controls(band(tree, 'countertop'))).toEqual(wallLabels(['Countertop thickness', 'Nosing profile']));
    expect(controls(band(tree, 'base'))).toEqual(wallLabels(['Base', 'Toe kick / base height']));
    expect(getByLabelText(tree, 'Wall Top of crown override').props).toMatchObject({ value: null, placeholder: '90' });
    getByLabelText(tree, 'Wall Top of crown override').props.onCommit(92);
    expect(wall().profile.crownTop).toBe(92);
    state = structuredClone(state);
    Object.assign(room().profile, { baseKind: 'furniture_base', furnitureBaseProfileId: 'missing', nosingProfileId: 'missing' });
    const furniture = wallTree();
    expect(controls(band(furniture, 'base'))).toEqual(wallLabels(['Base', 'Toe kick / base height',
      'Furniture base profile', 'Base proud', 'Cutout profile']));
    expect(notes(band(furniture, 'base'))).toEqual([MOLDING_NOTES['molding-profile-missing']]);
    expect(notes(band(furniture, 'countertop'))).toEqual([MOLDING_NOTES['molding-profile-missing']]);
    expect(notes(band(furniture, 'crown'))).toEqual([]);
  });

  it('puts upper auto readouts before Crown Box top and Uppers clearance (anchor 2)', () => {
    run().cabinetTypeId = CABINET_TYPE_IDS.UPPER;
    const tree = runTree();
    expect(bands(tree).map(({ props }) => props['data-height-band'])).toEqual(['crown', 'uppers']);
    expect(controls(band(tree, 'crown'))).toEqual(runLabels(['Box top']));
    expect(controls(band(tree, 'uppers'))).toEqual(runLabels(['Clearance above counter']));
    hasAutoTag(tree, 'Resolved run z');
    hasAutoTag(tree, 'Resolved run height');
    const ordered = nodes(tree);
    const crownIndex = ordered.findIndex(({ props }) => props['data-height-band'] === 'crown');
    expect(ordered.findIndex(({ props }) => props['aria-label'] === 'Resolved run z')).toBeLessThan(crownIndex);
    expect(ordered.findIndex(({ props }) => props['aria-label'] === 'Resolved run height')).toBeLessThan(crownIndex);
    getByLabelText(tree, 'Run Box top override').props.onCommit(84);
    expect(run().overrides.boxTop).toBe(84);
  });

  it('pairs furniture base overrides below the base run Countertop band (anchor 3)', () => {
    getByLabelText(runTree(), 'Run Base override').props.onChange({ target: { value: 'furniture_base' } });
    const tree = runTree();
    expect(bands(tree).map(({ props }) => props['data-height-band'])).toEqual(['countertop', 'base']);
    expect(controls(band(tree, 'countertop'))).toEqual(runLabels(['Countertop']));
    expect(controls(band(tree, 'base'))).toEqual(runLabels(['Base', 'Toe kick / base height', 'Box height',
      'Furniture base profile', 'Base proud']));
    expect(band(tree, 'base').props.children[0].props.children.map(controls)).toEqual([
      runLabels(['Base', 'Toe kick / base height']), runLabels(['Box height']), runLabels(['Furniture base profile', 'Base proud']),
    ]);
    getByLabelText(tree, 'Run Base proud override').props.onCommit(0);
    expect(run().overrides.furnitureBaseProud).toBe(0);
    expect(getByLabelText(tree, 'Run Base proud override').props.onCommit(-1)).toBe(false);
  });

  it('labels the stack picker Stacks on and preserves its aria label and stacking action (anchor 4)', () => {
    wall().runs.push(makeRun({ id: 'lower' }));
    const tree = runTree();
    const picker = getByLabelText(tree, 'Run below stack');
    expect(picker.type).toBe('select');
    const label = nodes(tree).find(({ type, props }) => type === 'label' && props.children?.includes(picker));
    expect(text(label.props.children[0])).toBe('Stacks on');
    expect(nodes(picker).find(({ type, props }) => type === 'option' && props.value === 'lower')).toBeDefined();
    picker.props.onChange({ target: { value: 'lower' } });
    expect(dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'elevation/joinRunStack', payload: { wallId: wall().id, runId: run().id, edge: 'below', leaderRunId: 'lower' },
    }));
    expect(text(tree.props.children.at(-1))).toBe('Reset heights to defaults');
  });

  it('keeps tall rows, manual base-only overrides and stacked restrictions with inherited furniture bases', () => {
    room().profile.baseKind = 'furniture_base';
    for (const cabinetTypeId of [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL, CABINET_TYPE_IDS.UPPER]) {
      run().cabinetTypeId = cabinetTypeId;
      run().heightMode = 'auto';
      if (cabinetTypeId === CABINET_TYPE_IDS.TALL) {
        expect(controls(runTree())).toEqual([...runLabels(['Box top', 'Base', 'Toe kick / base height', 'Furniture base profile', 'Base proud']),
          'Run below stack', 'Run above stack']);
      }
      run().heightMode = 'manual';
      const tree = runTree();
      expect(bands(tree).map(({ props }) => props['data-height-band'])).toEqual(cabinetTypeId === CABINET_TYPE_IDS.UPPER ? [] : ['base']);
      expect(controls(band(tree, 'base'))).toEqual(cabinetTypeId === CABINET_TYPE_IDS.UPPER ? []
        : runLabels(['Base', 'Furniture base profile', 'Base proud']));
      getByLabelText(tree, 'Run z');
      getByLabelText(tree, 'Run height');
    }
    run().cabinetTypeId = CABINET_TYPE_IDS.BASE;
    run().stack = { below: { runId: 'lower', offset: 0 } };
    expect(bands(runTree())).toEqual([]);
    hasAutoTag(runTree(), 'Run z');
    expect(getByLabelText(runTree(), 'Run height').type).toBe(InchInput);
    run().stack.above = { runId: 'upper', offset: 0 };
    hasAutoTag(runTree(), 'Run height');
    run().heightMode = 'auto';
    expect(controls(band(runTree(), 'base'))).toEqual(runLabels(['Toe kick / base height', 'Box height']));
  });
});
