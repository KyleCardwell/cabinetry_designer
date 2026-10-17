import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { boxConstruction } from '../../model/boxConstruction.js';
import { effectiveSettings } from '../../model/effectiveSettings.js';
import { gridLeaves } from '../../model/grid.js';
import { resolveWall } from '../../model/room.js';
import { runScene } from '../../model/runScene.js';
import elevationReducer, { setCabinetBox, setCabinetPurpose } from '../../store/elevationSlice.js';
import { auto, run as makeRun, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import BoxConstructionFields from './BoxConstructionFields.jsx';
import CabinetStyleProperties from './CabinetStyleProperties.jsx';
import FaceProperties from './FaceProperties.jsx';

vi.mock('react', async (original) => ({ ...await original(), useState: (value) => [value, vi.fn()] }));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const find = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children)
    : typeof tree === 'string' ? tree : '';
const options = (tree) => nodes(tree).filter(({ type }) => type === 'option')
  .map(({ props }) => [props.value, text(props.children)]);
let state;
const room = () => state.rooms[0];
const wall = () => room().walls[0];
const run = () => wall().runs[0];
const item = () => gridLeaves(run().grid)[0];
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1', itemIds: ['c1'] };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); return action; });
const render = () => BoxConstructionFields({ room: room(), wall: wall(), run: run(), item: item() });
const change = (label, value) => find(render(), label).props.onChange({ target: { value } });
const edit = (fn) => { state = structuredClone(state); fn(); };

beforeEach(() => {
  vi.clearAllMocks();
  state = stateWithRun(makeRun({ autoCount: false, width: 36, items: [auto('c1')] }));
  state.facePath = null;
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('IN1b Box section', () => {
  it('anchor 1: selects Auto (Spreaders · sink) for a base sink and shows all part choices', () => {
    item().purpose = 'sink';
    expect(find(render(), 'Top').props.value).toBe('');
    expect(options(find(render(), 'Top'))).toEqual([
      ['', 'Auto (Spreaders · sink)'], ['between', 'Between sides'], ['overlay', 'Overlay sides'],
      ['spreaders', 'Spreaders'], ['none', 'None'],
    ]);
    expect(options(find(render(), 'Back'))).toEqual([
      ['', 'Auto (1/4" dado · standard)'], ['dado', '1/4" dado'], ['inset', '3/4" inset'],
      ['applied', '1/4" applied'], ['none', 'None'],
    ]);
    expect(options(find(render(), 'Bottom'))[0]).toEqual(['', 'Auto (Between sides · standard)']);
    for (const label of ['Left side', 'Right side']) {
      expect(options(find(render(), label))).toEqual([
        ['', 'Auto (Built · standard)'], ['true', 'Built'], ['false', 'Left off'],
      ]);
    }
  });

  it('anchor 2: dispatches Back inset and stores manual values, including boolean sides and standards', () => {
    change('Back', 'inset');
    expect(dispatch).toHaveBeenLastCalledWith(setCabinetBox({ ...at, key: 'back', value: 'inset' }));
    expect(item().box).toEqual({ back: 'inset' });
    expect(find(render(), 'Back').props.value).toBe('inset');
    for (const [label, key, value] of [
      ['Top', 'top', 'between'], ['Bottom', 'bottom', 'overlay'],
      ['Left side', 'left', false], ['Right side', 'right', true],
    ]) {
      change(label, String(value));
      expect(dispatch).toHaveBeenLastCalledWith(setCabinetBox({ ...at, key, value }));
      expect(item().box[key]).toBe(value);
      expect(find(render(), label).props.value).toBe(String(value));
    }
    dispatch(setCabinetPurpose({ ...at, purpose: 'sink' }));
    expect(find(render(), 'Top').props.value).toBe('between');
    expect(options(find(render(), 'Top'))[0]).toEqual(['', 'Auto (Spreaders · sink)']);
  });

  it('anchor 3: dispatches null on Auto and previews the inherited value and source per field', () => {
    for (const [patch, label, expected] of [
      [() => {}, 'Back', 'Auto (1/4" dado · standard)'],
      [() => { item().purpose = 'medicine'; }, 'Back', 'Auto (1/4" applied · medicine)'],
      [() => { run().hanging = true; }, 'Back', 'Auto (3/4" inset · hanging base)'],
      [() => { wall().thickness = 0; }, 'Back', 'Auto (3/4" inset · island)'],
      [() => { item().box.bottom = 'none'; }, 'Back', 'Auto (3/4" inset · no bottom)'],
      [() => { item().purpose = 'cooktop'; }, 'Top', 'Auto (Spreaders · cooktop)'],
    ]) {
      edit(() => {
        delete item().purpose;
        run().hanging = false;
        wall().thickness = 4.5;
        item().box = { back: 'none', top: 'overlay' };
        patch();
      });
      expect(options(find(render(), label))[0]).toEqual(['', expected]);
      const key = label.toLowerCase();
      change(label, '');
      expect(dispatch).toHaveBeenLastCalledWith(setCabinetBox({ ...at, key, value: null }));
      expect(item().box).not.toHaveProperty(key);
      expect(find(render(), label).props.value).toBe('');
    }
    for (const label of ['Back', 'Top', 'Bottom', 'Left side', 'Right side']) change(label, '');
    expect(item()).not.toHaveProperty('box');
  });

  it('anchor 4: keeps dormant finishes checked with a hint and restores them on full parts', () => {
    item().purpose = 'sink';
    change('Bottom', 'none');
    for (const [part, key] of [['top', 'finTop'], ['bottom', 'finBottom']]) {
      const label = `Finished ${part}`;
      find(render(), label).props.onChange({ target: { checked: true } });
      expect(dispatch).toHaveBeenLastCalledWith(setCabinetBox({ ...at, key, value: true }));
      expect(item().box[key]).toBe(true);
      expect(find(render(), label).props.checked).toBe(true);
      expect(find(render(), label).props.disabled).toBeUndefined();
      expect(text(render())).toContain(`only on a full ${part}`);
      expect(boxConstruction(item(), run(), wall())[key]).toBe(false);
      change(part === 'top' ? 'Top' : 'Bottom', 'overlay');
      expect(find(render(), label).props.checked).toBe(true);
      expect(text(render())).not.toContain(`only on a full ${part}`);
      expect(boxConstruction(item(), run(), wall())[key]).toBe(true);
      find(render(), label).props.onChange({ target: { checked: false } });
      expect(item().box[key]).toBe(false);
      expect(find(render(), label).props.checked).toBe(false);
    }
  });

  it('renders Box immediately after Cabinet style in the cabinet panel with the same context', () => {
    const resolvedWall = resolveWall(room(), wall());
    const settings = effectiveSettings(state, room());
    const scene = runScene(room(), resolvedWall, run(), settings);
    const tree = FaceProperties({ wall: resolvedWall, run: run(), item: item(), settings,
      piece: scene.cells.pieces.find(({ id }) => id === 'c1'), layout: scene.result, cells: scene.cells });
    const children = tree.props.children;
    expect(children[0].type).toBe(CabinetStyleProperties);
    expect(children[1].type).toBe(BoxConstructionFields);
    for (const key of ['room', 'wall', 'run', 'item']) {
      expect(children[1].props[key]).toBe(children[0].props[key]);
    }
  });
});
