import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDispatch } from 'react-redux';
import { auto, room, wall, run as makeRun } from '../../../test/builders.js';
import elevationReducer, { setRunEnd, setTrackSize } from '../../store/elevationSlice.js';
import { stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import { wallLabel } from '../../model/topology.js';
import EndFields from '../properties/EndFields.jsx';
import EndLegsFields from '../properties/EndLegsFields.jsx';
import RunEndsSection from '../properties/RunEndsSection.jsx';
import WarningsList from '../properties/WarningsList.jsx';
import InchInput from '../InchInput.jsx';
import ExtendFields from '../properties/ExtendFields.jsx';
import PartStyleFields from '../properties/PartStyleFields.jsx';

vi.mock('react-redux', () => ({ useDispatch: vi.fn() }));
vi.mock('react', async (original) => ({ ...await original(), useMemo: (compute) => compute() }));

let state;
const currentRoom = () => state.rooms[0];
const currentWall = () => currentRoom().walls[0];
const returnWall = () => currentRoom().walls[1];
const run = () => currentWall().runs[0];
const at = { roomId: 'room-1', wallId: 'wall-1', runId: 'run-1' };
const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree == null || typeof tree === 'boolean' ? '' : String(tree);
const fields = (side = 'left') => nodes(EndFields({
  room: currentRoom(), wall: currentWall(), run: run(), side,
  settings: state.settings, actionBase: at,
}));
const field = (name, side = 'left') => fields(side).find(({ props }) => props['aria-label'] === `${side} end ${name}`);
const pick = (name, value, side = 'left') => field(name, side).props.onChange({ target: { value } });
const commit = (name, value) => field(name).props.onCommit(value);
const options = (select) => nodes(select).filter(({ type }) => type === 'option')
  .map(({ props }) => [props.value, text(props.children)]);
const corner = (kind = 90) => pick('type', `corner:${kind}`);

beforeEach(() => {
  vi.clearAllMocks();
  state = {
    ...stateWithRun(),
    rooms: [room({ name: 'Room A', walls: [
      wall({ runs: [makeRun({ autoCount: false, items: [auto('cc'), auto('a')],
        style: { cabinetStyleId: 13 }, anchors: { left: true, right: false },
      })], connections: { start: { wallId: 'wall-2', endpoint: 'end' }, end: null } }),
      wall({ id: 'wall-2', x1: 0, y1: 144, x2: 0, y2: 0,
        connections: { start: null, end: { wallId: 'wall-1', endpoint: 'start' } },
      }),
    ] })],
  };
  useDispatch.mockReturnValue(dispatch);
});

describe('CC3 step d corner run end fields', () => {
  it('anchor 1: offers both corner kinds after Blind corner on an anchored owner', () => {
    const choices = options(field('type'));
    expect(choices.slice(choices.findIndex(([value]) => value === 'blind'))).toEqual([
      ['blind', 'Blind corner'], ['corner:90', 'Corner 90'], ['corner:45', 'Corner 45'],
    ]);
  });

  it('anchor 2: omits corner choices on an unanchored filler end', () => {
    run().anchors.left = false;
    expect(options(field('type')).some(([value]) => value.startsWith('corner:'))).toBe(false);
    expect(options(field('type', 'right')).some(([value]) => value.startsWith('corner:'))).toBe(false);
  });

  it('anchor 3: creates a 45 corner and a manual 36-inch root column', () => {
    corner(45);
    expect(run().ends.left).toEqual({ type: 'corner', width: null, corner: {
      kind: 45, legB: null, depthB: null, returnPiece: 'auto', returnWidth: null, doors: null,
    } });
    expect(run().grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 36 });
    expect(field('type').props.value).toBe('corner:45');
  });

  it('anchor 4: preserves every stored corner choice when changing kind and other fields', () => {
    run().ends.left = { type: 'corner', width: null, corner: {
      kind: 90, legB: 30, depthB: 15, returnPiece: 'filler', returnWidth: 3, doors: 'a_long',
    } };
    corner(45);
    expect(run().ends.left.corner).toEqual({ kind: 45, legB: 30, depthB: 15, returnPiece: 'filler', returnWidth: 3, doors: 'a_long' });
    commit('corner return width', 4);
    expect(run().ends.left.corner).toEqual({ kind: 45, legB: 30, depthB: 15, returnPiece: 'filler', returnWidth: 4, doors: 'a_long' });
    commit('corner return width', null);
    expect(run().ends.left.corner).toEqual({ kind: 45, legB: 30, depthB: 15, returnPiece: 'filler', returnWidth: null, doors: 'a_long' });
  });

  it('anchor 5: edits leg A through its outer root track and resets blank to 36', () => {
    corner();
    expect(field('corner leg A').type).toBe(InchInput);
    expect(field('corner leg A').props.value).toBe(36);
    const trackId = run().grid.cols[0].id;
    commit('corner leg A', 30);
    expect(dispatch).toHaveBeenLastCalledWith(setTrackSize({ ...at, trackId, size: 30 }));
    expect(run().grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 30 });
    expect(field('corner leg A').props.value).toBe(30);
    commit('corner leg A', null);
    expect(run().grid.cols[0]).toMatchObject({ sizeMode: 'manual', size: 36 });
  });

  it('anchor 6: shows automatic leg B and depth B and stores or clears their overrides', () => {
    corner();
    expect(field('corner leg B').props).toMatchObject({ value: null, placeholder: '36', allowAuto: true, allowBlank: true });
    expect(field('corner depth B').props).toMatchObject({ value: null, placeholder: '24', allowAuto: true, allowBlank: true });
    commit('corner leg B', 30);
    commit('corner depth B', 15);
    expect(run().ends.left.corner).toMatchObject({ kind: 90, legB: 30, depthB: 15 });
    expect(field('corner leg B').props.value).toBe(30);
    expect(field('corner depth B').props.value).toBe(15);
    commit('corner leg B', null);
    commit('corner depth B', null);
    expect(run().ends.left.corner).toMatchObject({ legB: null, depthB: null });
    commit('corner leg A', 32);
    expect(field('corner leg B').props.placeholder).toBe('32');
  });

  it('anchor 7: uses the anchored return run box depth for automatic depth B', () => {
    returnWall().runs = [makeRun({ id: 'return', depth: 21, anchors: { left: false, right: true } })];
    corner();
    expect(field('corner depth B').props.placeholder).toBe('21');
  });

  it('anchor 8: resolves the automatic return panel and switches to a filler', () => {
    corner();
    expect(field('corner return side').props.value).toBe('auto');
    expect(options(field('corner return side'))).toEqual([
      ['auto', 'Auto (end panel)'], ['end_panel', 'End panel'], ['filler', 'Filler'], ['none', 'None'],
    ]);
    expect(field('corner return width').props).toMatchObject({ value: null, placeholder: '13/16' });
    pick('corner return side', 'filler');
    expect(run().ends.left.corner.returnPiece).toBe('filler');
    expect(field('corner return width').props.placeholder).toBe('1 1/2');
    pick('corner return side', 'none');
    expect(field('corner return width')).toBeUndefined();
  });

  it('anchor 9: hides return width when a covering return run resolves Auto to none', () => {
    returnWall().runs = [makeRun({ id: 'return', anchors: { left: false, right: true } })];
    corner();
    expect(options(field('corner return side'))[0]).toEqual(['auto', 'Auto (none)']);
    expect(field('corner return width')).toBeUndefined();
  });

  it('anchor 10: reads out both shown legs and the return wall, plus true size on a 45', () => {
    for (const kind of [90, 45]) {
      corner(kind);
      const readout = fields().find(({ type, props }) => type === 'p' && text(props.children).startsWith('Shows '));
      expect(readout.props.className).toBe('text-xs text-gray-500');
      expect(text(readout)).toBe(`Shows 12" here · 12" on ${wallLabel(currentRoom(), returnWall())}${kind === 45 ? ' · face 16 31/32" true, 45°' : ''}`);
    }
  });

  it('anchor 11: keeps inactive corners selectable, warns, and hides ordinary end and leg fields', () => {
    run().anchors.left = false;
    corner();
    expect(field('type').props.value).toBe('corner:90');
    expect(fields().some(({ type, props }) => type === 'p' && props.className.includes('text-amber-300')
      && props.children === "The corner cabinet isn't anchored into a square inside corner.")).toBe(true);
    for (const name of ['width', 'height', 'panel L-shape', 'filler ordered width', 'filler return depth', 'filler corner', 'filler T-filler']) {
      expect(field(name)).toBeUndefined();
    }
    expect(fields().some(({ type }) => type === ExtendFields || type === PartStyleFields)).toBe(false);
    const section = nodes(RunEndsSection({ room: currentRoom(), wall: currentWall(), run: run(), settings: state.settings, actionBase: at }));
    expect(section.filter(({ type }) => type === EndLegsFields).map(({ props }) => props.side)).toEqual(['right']);
    expect(section.find(({ props }) => props['aria-label'] === 'left run anchor').props.value).toBe('free');
    commit('corner leg B', 20);
    expect(fields().some(({ type, props }) => type === 'p' && props.className.includes('text-amber-300')
      && props.children === "The corner cabinet's legs are shorter than the depths beside them.")).toBe(true);
    expect(fields().some(({ type, props }) => type === 'p' && text(props.children).startsWith('Shows '))).toBe(false);
  });

  it('anchor 12: tells the return run which wall owns its corner cabinet and keeps its fields', () => {
    returnWall().runs = [makeRun({ id: 'return', anchors: { left: false, right: true } })];
    corner();
    const result = EndFields({ room: currentRoom(), wall: returnWall(), run: returnWall().runs[0], side: 'right',
      settings: state.settings, actionBase: { ...at, wallId: 'wall-2', runId: 'return' } });
    expect(text(result)).toContain(`Dies into the corner cabinet on ${wallLabel(currentRoom(), currentWall())}.`);
    expect(nodes(result).find(({ props }) => props['aria-label'] === 'right end type').props.value).toBe('none');
    expect(nodes(result).some(({ props }) => props['aria-label'] === 'right end corner leg A')).toBe(false);
  });

  it('edits the outermost root column at a right corner end', () => {
    const owner = run();
    owner.anchors = { left: false, right: true };
    currentWall().runs = [];
    returnWall().runs = [owner];
    const rightAt = { ...at, wallId: 'wall-2' };
    const rightFields = () => nodes(EndFields({
      room: currentRoom(), wall: returnWall(), run: returnWall().runs[0], side: 'right',
      settings: state.settings, actionBase: rightAt,
    }));
    const rightField = (name) => rightFields().find(({ props }) => props['aria-label'] === `right end ${name}`);
    rightField('type').props.onChange({ target: { value: 'corner:90' } });
    const cols = returnWall().runs[0].grid.cols;
    rightField('corner leg A').props.onCommit(30);
    expect(dispatch).toHaveBeenLastCalledWith(setTrackSize({ ...rightAt, trackId: cols.at(-1).id, size: 30 }));
    expect(returnWall().runs[0].grid.cols.at(-1)).toMatchObject({ sizeMode: 'manual', size: 30 });
    expect(returnWall().runs[0].grid.cols[0].sizeMode).toBe('auto');
  });

  it('replaces the readout with warnings when an active corner has no valid shape', () => {
    corner();
    commit('corner leg B', 20);
    expect(fields().some(({ type, props }) => type === 'p' && props.className.includes('text-amber-300')
      && props.children === "The corner cabinet's legs are shorter than the depths beside them.")).toBe(true);
    expect(fields().some(({ type, props }) => type === 'p' && text(props.children).startsWith('Shows '))).toBe(false);
    expect(fields().filter(({ props }) => props['aria-label']).map(({ props }) => props['aria-label'])).toEqual([
      'left end type', 'left end corner leg A', 'left end corner leg B',
      'left end corner depth B', 'left end corner return side', 'left end corner return width',
    ]);
  });

  it('anchor 13: displays a corner warning message instead of its code', () => {
    const result = WarningsList({ layout: { errors: [], warnings: [{ code: 'corner-crossed', message: 'X' }] } });
    expect(nodes(result).find(({ type }) => type === 'li').props.children).toBe('X');
  });
});
