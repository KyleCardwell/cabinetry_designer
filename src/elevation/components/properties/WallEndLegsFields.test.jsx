import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch, useSelector } from 'react-redux';
import { room, run, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { S, legShape, noEnds } from '../../model/__tests__/fixtures/legs.js';
import { partNumbers } from '../../model/partNumbers.js';
import { runLegs } from '../../model/legs.js';
import { wallSideView } from '../../model/wallSides.js';
import elevationReducer, { createInitialElevationState, setWallEndLegs } from '../../store/elevationSlice.js';
import EndLegsFields from './EndLegsFields.jsx';
import LegFields, { LegHeightFields, LegShapeSelect, LegSitsOnSelect } from './LegFields.jsx';
import RunLegsSection from './RunLegsSection.jsx';
import WallEndLegsFields from './WallEndLegsFields.jsx';
import WallEndPanelFields from './WallEndPanelFields.jsx';
import WallHeightProperties from './WallHeightProperties.jsx';

vi.mock('react', async (load) => ({ ...await load(), useMemo: (fn) => fn(), useEffect: vi.fn(),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
}));
vi.mock('react-redux', () => ({ useDispatch: vi.fn(), useSelector: vi.fn() }));

const settings = { ...DEFAULT_SETTINGS, shapes: [legShape()] };
const expanded = [LegFields, LegHeightFields, LegShapeSelect, LegSitsOnSelect];
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object'
    ? [tree, ...nodes(expanded.includes(tree.type) ? tree.type(tree.props) : tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const field = (tree, label) => nodes(tree).find(({ props }) => props['aria-label'] === label);
const copyButton = (tree) => nodes(tree).find(({ type, props }) => type === 'button'
  && props.children === 'Copy to the other end');
const change = (node, value) => node.props.onChange({ target: { value } });
const tick = (node, checked) => node.props.onChange({ target: { checked } });
let state;
let dispatch;
const currentRoom = () => state.rooms[0];
const currentWall = () => currentRoom().walls[0];
const props = (endpoint = 'start') => ({ room: currentRoom(), wall: currentWall(), endpoint,
  label: endpoint === 'start' ? 'Left end' : 'Right end', settings: state.settings });
const render = (endpoint) => WallEndLegsFields(props(endpoint));
const selectLegs = (value, face = 'front') => change(field(render(), `Left end ${face}-face Legs`), value);
const frontLabel = 'Left end front-face front leg';

beforeEach(() => {
  vi.clearAllMocks();
  state = createInitialElevationState({ settings, rooms: [room({ walls: [wall({ id: 'w', x2: 96, thickness: 4.5,
    endPanels: { start: { width: null } }, runs: [run({ width: 36, anchors: { left: true, right: false }, ends: noEnds })],
  })] })], activeRoomId: 'room-1', activeWallId: 'w' });
  dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  useDispatch.mockReturnValue(dispatch);
  useSelector.mockImplementation((selector) => selector({ elevation: state }));
});

describe('SH7.6 step d wall end legs', () => {
  it('anchor 1: Both stores default specs and displays numbered leg blocks with their placements', () => {
    selectLegs('both');
    expect(currentWall().endLegs.start.faces.front).toEqual({ legs: 'both', front: S, back: S });
    const tree = render();
    const numbers = partNumbers(currentRoom(), state.settings);
    const placements = runLegs(currentRoom(), currentWall(), currentWall().runs[0], state.settings);
    const fields = nodes(tree).filter(({ type }) => type === LegFields);
    expect(fields).toHaveLength(2);
    for (const [index, edge] of ['front', 'back'].entries()) {
      const id = `w:wallleg:start-front-${edge}`;
      const number = numbers.byKey.get(id);
      expect(number).toBeDefined();
      expect(text(field(tree, `Left end front-face ${edge} leg`))).toContain(`${edge === 'front' ? 'Front' : 'Back'} leg #${number}`);
      expect(fields[index].props).toMatchObject({ fixedRefs: true, leg: { id },
        placement: placements.find(({ leg }) => leg.id === id) });
    }
    expect(text(tree)).toContain("Along: to the leg's outside face from the wall end.");
  });

  it('anchor 2: disables a face with no anchored run and explains why', () => {
    const tree = render();
    expect(field(tree, 'Left end front-face Legs').props.disabled).toBe(false);
    expect(field(tree, 'Left end back-face Legs').props.disabled).toBe(true);
    expect(text(tree)).toContain('No run on this face stops at this end.');
    expect(field(render('end'), 'Right end front-face Legs').props.disabled).toBe(true);
  });

  it('anchor 3: edits In/out and stores mirror flips while displaying effective mirrors and fixed references', () => {
    selectLegs('both');
    expect(field(render(), `${frontLabel} Mirror left–right`).props.checked).toBe(true);
    field(render(), `${frontLabel} In/out`).props.onCommit(0.5);
    tick(field(render(), `${frontLabel} Mirror left–right`), false);
    expect(currentWall().endLegs.start.faces.front.front).toEqual({ ...S, y: 0.5, mirror: true });
    expect(field(render(), `${frontLabel} Mirror left–right`).props.checked).toBe(false);
    tick(field(render(), `${frontLabel} Mirror left–right`), true);
    expect(currentWall().endLegs.start.faces.front.front).not.toHaveProperty('mirror');
    const backLabel = 'Left end front-face back leg';
    expect(field(render(), `${backLabel} Mirror front–back`).props.checked).toBe(true);
    tick(field(render(), `${backLabel} Mirror front–back`), false);
    expect(currentWall().endLegs.start.faces.front.back.mirrorDepth).toBe(true);
    expect(field(render(), `${backLabel} Mirror front–back`).props.checked).toBe(false);
    tick(field(render(), `${backLabel} Mirror front–back`), true);
    expect(currentWall().endLegs.start.faces.front.back).not.toHaveProperty('mirrorDepth');
    for (const name of ['Along', 'In/out']) expect(field(render(), `${frontLabel} ${name} reference`)).toBeUndefined();
  });

  it('anchor 4: copies only faces to the other free end, keeping panels and omitting the button for connections or landings', () => {
    dispatch(setWallEndLegs({ wallId: 'w', endpoint: 'start', endLegs: {
      faces: { front: { legs: 'both', front: S, back: S } }, fit: 'between', panel: { inset: 0.5 },
    } }));
    state = { ...state, rooms: [{ ...currentRoom(), walls: [{ ...currentWall(),
      endPanels: { ...currentWall().endPanels, end: { width: 1.5 } },
    }] }] };
    const panels = currentWall().endPanels;
    const faces = currentWall().endLegs.start.faces;
    copyButton(render()).props.onClick();
    expect(dispatch.mock.calls.at(-1)[0].payload).toEqual({ roomId: 'room-1', wallId: 'w', endpoint: 'end', endLegs: { faces } });
    expect(currentWall().endLegs.end).toEqual({ faces });
    expect(currentWall().endPanels).toEqual(panels);
    expect(currentWall().endLegs.start).toMatchObject({ fit: 'between', panel: { inset: 0.5 } });
    for (const key of ['connections', 'landings']) {
      expect(copyButton(WallEndLegsFields({ ...props(), wall: { ...currentWall(), [key]: { end: {} } } }))).toBeUndefined();
    }
  });

  it('anchor 5: mounts below panel fields only at free ends, including when the panel is off', () => {
    selectLegs('both');
    let tree = WallHeightProperties(props());
    let children = nodes(tree).filter(({ type }) => [WallEndPanelFields, WallEndLegsFields].includes(type));
    expect(children.map(({ type }) => type)).toEqual([WallEndPanelFields, WallEndLegsFields, WallEndLegsFields]);
    expect(children.filter(({ type }) => type === WallEndLegsFields).map(({ props }) => props.endpoint)).toEqual(['start', 'end']);
    expect(nodes(tree).find(({ props }) => props.id === 'wall.endPanels')).toBeDefined();
    for (const key of ['connections', 'landings']) {
      const blocked = { ...currentWall(), [key]: { end: {} } };
      tree = WallHeightProperties({ ...props(), wall: blocked });
      children = nodes(tree).filter(({ type }) => type === WallEndLegsFields);
      expect(children.map(({ props }) => props.endpoint)).toEqual(['start']);
      expect(WallEndLegsFields({ ...props('end'), wall: blocked })).toBeNull();
    }
  });

  it('anchor 6: replaces run end controls with the wall note and summarizes wall legs in the Legs section', () => {
    selectLegs('both');
    const args = { ...props(), run: currentWall().runs[0], side: 'left',
      actionBase: { roomId: 'room-1', wallId: 'w', runId: 'run-1' } };
    expect(text(EndLegsFields(args))).toBe('Legs for this end are set on the wall (End panels).');
    expect(nodes(EndLegsFields(args)).some(({ type }) => type === 'select')).toBe(false);
    expect(text(RunLegsSection(args))).toContain('Left end: front and back legs (set on the wall, under End panels).');
    expect(text(RunLegsSection({ ...args, run: { ...args.run, cabinetTypeId: 'other' } })))
      .toContain('Left end: front and back legs (set on the wall, under End panels).');
  });

  it('preserves kept specs and the other face, defaults to square with no live shapes, and clears empty endpoints', () => {
    state = createInitialElevationState({ ...state, rooms: [room({ walls: [wall({ ...currentWall(), runs: [
      ...currentWall().runs, run({ id: 'back', width: 36, wallSide: 'back', anchors: { right: true }, ends: noEnds }),
    ] })] })] });
    selectLegs('both');
    field(render(), `${frontLabel} In/out`).props.onCommit(0.5);
    selectLegs('front', 'back');
    const back = currentWall().endLegs.start.faces.back;
    const backFields = nodes(render()).find(({ type, props }) => type === LegFields && props.leg.wall.face === 'back');
    expect(backFields.props.wall.side).toBe('back');
    expect(backFields.props.placement).toEqual(runLegs(currentRoom(), wallSideView(currentWall(), 'back'),
      currentWall().runs[1], state.settings)[0]);
    expect(field(render(), 'Left end back-face front leg Mirror left–right').props.checked).toBe(false);
    tick(field(render(), 'Left end back-face front leg Mirror left–right'), true);
    expect(currentWall().endLegs.start.faces.back.front.mirror).toBe(true);
    selectLegs('front');
    expect(currentWall().endLegs.start.faces.front).toEqual({ legs: 'front', front: { ...S, y: 0.5 } });
    selectLegs('');
    expect(currentWall().endLegs.start.faces).toEqual({ back: { ...back, front: { ...S, mirror: true } } });
    state = { ...state, settings: { ...state.settings, shapes: [{ ...legShape(), archived: true }] } };
    selectLegs('back');
    expect(currentWall().endLegs.start.faces.front.back).toEqual({ square: {}, height: 'full', x: 0, y: 0 });
    selectLegs('');
    selectLegs('', 'back');
    expect(currentWall()).not.toHaveProperty('endLegs');
  });
});
