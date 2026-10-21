import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { CABINET_STYLE_IDS, CABINET_TYPE_IDS } from '../../model/index.js';
import elevationReducer from '../../store/elevationSlice.js';
import { run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import HeightBands from '../HeightBands.jsx';
import Field from '../properties/Field.jsx';
import RunHeightsSection from '../properties/RunHeightsSection.jsx';
import RunStyleFields from '../properties/RunStyleFields.jsx';
import RunTopFields from '../properties/RunTopFields.jsx';
import StyleFields from '../properties/StyleFields.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [HeightBands, Field, RunTopFields].includes(tree.type)
      ? nodes(tree.type(tree.props)) : [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const labels = (tree) => nodes(tree).map(({ props }) => props['aria-label']).filter(Boolean);
const bandById = (tree, id) => nodes(tree).find(({ props }) => props['data-height-band'] === id);
const countertop = (tree) => bandById(tree, 'countertop');
let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const props = () => ({ room: room(), wall: wall(), run: run(), settings: state.settings });
const heights = () => RunHeightsSection({
  ...props(), actionBase: { wallId: wall().id, runId: run().id }, validateAndDispatch: vi.fn(),
});
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ heightMode: 'auto', top: 'wood' }));
  useDispatch.mockReturnValue(dispatch);
});

describe('UI5 step a run countertop fields', () => {
  it('anchor 1: puts Countertop, Top, Nosing, Overhang and Waterfall in order in the Countertop band', () => {
    const band = countertop(heights());
    expect(band).toBeDefined();
    expect(labels(band)).toEqual([
      'Run Countertop override', 'Run top', 'Run Nosing profile',
      'Run front overhang', 'Run back overhang', 'Run left overhang', 'Run right overhang',
      'Run left waterfall', 'Run right waterfall',
    ]);
    expect(nodes(band).filter(({ type }) => type === 'h4').map(text)).toEqual(['Overhang', 'Waterfall']);
    nodes(band).find(({ props }) => props['aria-label'] === 'Run top').props.onChange({ target: { value: 'stone' } });
    expect(run().top).toBe('stone');
    expect(labels(countertop(heights()))).not.toContain('Run Nosing profile');
  });

  it('anchor 2: leaves only StyleFields and inset Hanging in the Cabinet style section', () => {
    for (const cabinetStyleId of [CABINET_STYLE_IDS.EUROPEAN, CABINET_STYLE_IDS.INSET]) {
      run().style = { cabinetStyleId };
      const tree = RunStyleFields(props());
      expect(nodes(tree).filter(({ type }) => type === StyleFields)).toHaveLength(1);
      expect(labels(tree)).toEqual(cabinetStyleId === CABINET_STYLE_IDS.INSET ? ['Hanging base'] : []);
      expect(text(tree)).not.toMatch(/Top|Nosing|Overhang|Waterfall/);
      if (cabinetStyleId === CABINET_STYLE_IDS.INSET) {
        nodes(tree).find(({ props }) => props['aria-label'] === 'Hanging base').props.onChange({ target: { checked: true } });
        expect(run().hanging).toBe(true);
      }
    }
  });

  it('anchor 3: ends the upper Crown band with Top and keeps Upper bottom in Cabinet style', () => {
    Object.assign(run(), { cabinetTypeId: CABINET_TYPE_IDS.UPPER, top: null });
    const tree = heights();
    expect(countertop(tree)).toBeUndefined();
    const crown = bandById(tree, 'crown');
    expect(labels(crown)).toEqual(['Run Box top override', 'Run top']);
    expect(crown.props.children.at(-1).type).toBe(RunTopFields);
    const top = nodes(crown).find(({ props }) => props['aria-label'] === 'Run top');
    expect(top.props.value).toBe('');
    expect(text(nodes(top).find(({ type, props }) => type === 'option' && props.value === ''))).toBe('Default · Crown');
    let style = RunStyleFields(props());
    expect(labels(style)).toEqual(['Upper bottom']);
    nodes(style).find(({ props }) => props['aria-label'] === 'Upper bottom').props.onChange({ target: { value: 'counter' } });
    expect(run().upperBottom).toBe('counter');
    state = structuredClone(state);
    run().bottom = [{ kind: 'wood' }];
    style = RunStyleFields(props());
    expect(labels(style)).toEqual([]);
    expect(text(style)).toContain('Bottom: set by Below the run');
  });

  it('anchor 4: puts tall Top fields in Crown and keeps countertop controls conditional on the Top pick', () => {
    run().cabinetTypeId = CABINET_TYPE_IDS.TALL;
    for (const top of [null, 'crown', 'topMold', 'none', 'stone', 'wood']) {
      run().top = top;
      const tree = heights();
      expect(countertop(tree)).toBeUndefined();
      const crown = bandById(tree, 'crown');
      expect(crown.props.children.at(-1).type).toBe(RunTopFields);
      expect(labels(crown)).toEqual([
        'Run Box top override', 'Run top',
        ...(top === 'wood' ? ['Run Nosing profile'] : []),
        ...(['stone', 'wood'].includes(top) ? [
          'Run front overhang', 'Run back overhang', 'Run left overhang', 'Run right overhang',
          'Run left waterfall', 'Run right waterfall',
        ] : []),
      ]);
    }
    // Manual mode removes the host height rows; extras must not create a band.
    for (const cabinetTypeId of [CABINET_TYPE_IDS.BASE, CABINET_TYPE_IDS.TALL, CABINET_TYPE_IDS.UPPER]) {
      Object.assign(run(), { cabinetTypeId, heightMode: 'manual' });
      expect(countertop(heights())).toBeUndefined();
      expect(bandById(heights(), 'crown')).toBeUndefined();
      expect(labels(heights())).not.toContain('Run top');
    }
  });
});
