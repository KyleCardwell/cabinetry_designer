import { expect, it, vi } from 'vitest';
import { useState } from 'react';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { resolveWall, syncRoom } from '../../model/room.js';
import { wallInteriors } from '../../model/interiors.js';
import { wallToScreen } from '../../canvas/transform.js';
import elevationReducer, { setInteriorPath, setSelection } from '../../store/elevationSlice.js';
import { run, stateWithRun } from '../../store/__tests__/helpers/sliceFixtures.js';
import usePicker from './usePicker.js';

vi.mock('react', async (original) => ({
  ...await original(), useCallback: (callback) => callback, useState: vi.fn(),
}));

it('shares interior selection through canvas clicks and the stacked menu, and closes stale lists on toggle', () => {
  let state = stateWithRun(run({
    cabinetTypeId: CABINET_TYPE_IDS.TALL, x: 10, z: 0, width: 24, height: 84,
    autoCount: false, ends: { left: { type: 'none' }, right: { type: 'none' } },
    items: [{ id: 'cabinet', kind: 'cabinet', width: 24, face: { type: 'door' },
      interior: { direction: 'vertical', children: [{}, {}], dividers: [{ kind: 'fixed' }] } }],
  }));
  const settings = state.settings;
  const room = syncRoom(state.rooms[0], settings);
  const wall = resolveWall(room, room.walls[0], 'front');
  const [entry] = wallInteriors(room, wall.sideSource, 'front', settings);
  const transform = { scale: 8, offsetX: 20, offsetY: 30, wallHeight: 96 };
  let point = { x: entry.box.x + 12, z: entry.box.z + 42 };
  const dispatch = vi.fn((action) => { state = elevationReducer(state, action); });
  let pickerState = null;
  useState.mockImplementation(() => [pickerState, (next) => {
    pickerState = typeof next === 'function' ? next(pickerState) : next;
  }]);
  const suppressClickRef = { current: false };
  const TestPicker = (extra = {}) => usePicker({
    room, wall, settings, transform, dispatch, tool: 'select', doorsOff: true, suppressClickRef,
    stageRef: { current: { getPointerPosition: () => wallToScreen(point, transform) } }, ...extra,
  });
  TestPicker().pick();
  expect(state.selection).toMatchObject({ runId: 'run-1', pieceId: 'cabinet' });
  expect(state.interiorPath).toBeNull();
  expect(TestPicker().picker.activeKey).toBe('piece:run-1:cabinet');
  TestPicker().pickInterior();
  expect(dispatch.mock.calls.slice(-2).map(([action]) => action)).toEqual([
    setSelection({ runId: 'run-1', pieceId: 'cabinet' }), setInteriorPath({ path: 'r', divider: 0 }),
  ]);
  expect(state).toMatchObject({ interiorPath: 'r', interiorDivider: 0, facePath: null });
  point = { x: entry.box.x + 12, z: entry.box.z + 20 };
  TestPicker().pickInterior();
  expect(state).toMatchObject({ interiorPath: 'r.1', interiorDivider: null });
  TestPicker().choosePick('piece:run-1:cabinet');
  expect(state).toMatchObject({ interiorPath: null, interiorDivider: null });
  expect(TestPicker().picker).toBeNull();
  TestPicker().pick();
  TestPicker().choosePick('section:run-1:cabinet:r.1');
  expect(state.interiorPath).toBe('r.1');
  TestPicker().pick();
  expect(TestPicker({ doorsOff: false }).picker).toBeNull();
  expect(TestPicker({ tool: 'draw' }).picker).toBeNull();
  const before = dispatch.mock.calls.length;
  suppressClickRef.current = true;
  TestPicker().pickInterior();
  expect(dispatch).toHaveBeenCalledTimes(before);
});
