import { describe, expect, it } from 'vitest';
import elevationReducer, {
  addRecess, addSoffit, clearSelection, createInitialElevationState, removeCell, removeItem,
  setActiveRoom, setActiveWall, setCellKind, setDoorsOff, setFacePath, setInteriorPath,
  setSelection, setView,
} from '../elevationSlice.js';
import { toElevationDocument } from '../persistence.js';
import { auto, run, stateWithRun } from './helpers/sliceFixtures.js';

const at = { wallId: 'wall-1', runId: 'run-1' };
const base = () => elevationReducer(stateWithRun(run({
  autoCount: false, items: [auto('c1'), auto('c2')],
})), setSelection({ runId: 'run-1', pieceId: 'c1' }));
const selected = () => elevationReducer(base(), setInteriorPath({ path: 'r.0', divider: 1 }));

describe('IN3 doors-off view and shared interior selection', () => {
  it('anchor 1: validates the doors-off flag, clears faces only when enabled, and never persists UI state', () => {
    const initial = createInitialElevationState(null);
    expect(initial).toMatchObject({ doorsOff: false, interiorPath: null, interiorDivider: null });
    const before = elevationReducer(selected(), setFacePath('r.0'));
    const on = elevationReducer(before, setDoorsOff(true));
    expect(on).toMatchObject({ doorsOff: true, facePath: null, interiorPath: 'r.0', interiorDivider: 1 });
    for (const invalid of ['yes', null, undefined, 0, 1, {}]) {
      expect(elevationReducer(on, setDoorsOff(invalid))).toBe(on);
    }
    const withFace = elevationReducer(on, setFacePath('r.1'));
    expect(elevationReducer(withFace, setDoorsOff(false))).toMatchObject({ doorsOff: false, facePath: 'r.1' });
    const saved = toElevationDocument(on);
    expect(saved).toEqual(toElevationDocument(before));
    for (const key of ['doorsOff', 'interiorPath', 'interiorDivider']) expect(saved).not.toHaveProperty(key);
    expect(createInitialElevationState({ ...saved, doorsOff: true, interiorPath: 'r.0', interiorDivider: 1 }))
      .toMatchObject({ doorsOff: false, interiorPath: null, interiorDivider: null });
  });

  it('anchor 3: rejects malformed selections and clears both values with null or an omitted divider', () => {
    const before = selected();
    for (const payload of [undefined, false, 1, 'r', [], {}, { path: '' }, { path: 1 },
      { path: 'r', divider: -1 }, { path: 'r', divider: 0.5 }, { path: 'r', divider: '1' },
      { path: 'r', divider: NaN }, { path: 'r', divider: Infinity }]) {
      expect(elevationReducer(before, setInteriorPath(payload))).toBe(before);
    }
    expect(elevationReducer(before, setInteriorPath(null)))
      .toMatchObject({ interiorPath: null, interiorDivider: null });
    for (const payload of [{ path: 'r' }, { path: 'r', divider: null }]) {
      expect(elevationReducer(before, setInteriorPath(payload)))
        .toMatchObject({ interiorPath: 'r', interiorDivider: null });
    }
    expect(elevationReducer(before, setInteriorPath({ path: 'reader-validates-this', divider: 0 })))
      .toMatchObject({ interiorPath: 'reader-validates-this', interiorDivider: 0 });
  });

  it('anchor 2: clears interior selection wherever a selection change clears the face', () => {
    const before = elevationReducer(selected(), setFacePath('r.1'));
    expect(before).toMatchObject({ interiorPath: 'r.0', interiorDivider: 1 });
    const actions = [
      setSelection({ runId: 'run-1', pieceId: 'c2' }), setSelection({ runId: 'run-1' }),
      setSelection({ openingId: 'door-1' }), clearSelection(), setView('plan'),
      setActiveRoom('room-1'), setActiveWall('wall-1'),
      removeItem({ ...at, itemId: 'c1' }), removeCell({ ...at, cellId: 'c1' }),
      setCellKind({ ...at, cellId: 'c1', kind: 'void' }),
      addSoffit({ wallId: 'wall-1', soffit: {
        id: 'SF', wallSide: 'front', x: 40, width: 60, bottom: 84, depth: 14,
        molding: 'crown', anchors: { left: false, right: false },
      } }),
      addRecess({ wallId: 'wall-1', recess: {
        id: 'R', kind: 'recess', label: 'R1', wallSide: 'front', offsetFrom: 'left', offsetAnchor: 'edge',
        offset: 60, width: 48, bottom: 0, height: null, depth: 24, molding: 'crown',
      } }),
    ];
    for (const action of actions) {
      expect(elevationReducer(before, action), action.type)
        .toMatchObject({ facePath: null, interiorPath: null, interiorDivider: null });
    }
    expect(elevationReducer(before, setSelection({ runId: 'run-1', pieceId: 'c2' })).selection)
      .toMatchObject({ runId: 'run-1', pieceId: 'c2' });
    expect(elevationReducer(before, removeItem({ ...at, itemId: 'c2' })))
      .toMatchObject({ interiorPath: 'r.0', interiorDivider: 1 });
  });

  it('allows the UI reducers on read-only rooms and issued versions', () => {
    for (const locked of [{ ...base(), cloud: { room: { readOnly: true } } }, { ...base(), source: 'version' }]) {
      const on = elevationReducer(locked, setDoorsOff(true));
      const chosen = elevationReducer(on, setInteriorPath({ path: 'r.1', divider: 0 }));
      expect(chosen).toMatchObject({ doorsOff: true, interiorPath: 'r.1', interiorDivider: 0 });
      expect(chosen.rooms).toBe(locked.rooms);
      expect(elevationReducer(chosen, setInteriorPath(null)))
        .toMatchObject({ interiorPath: null, interiorDivider: null });
    }
  });
});
