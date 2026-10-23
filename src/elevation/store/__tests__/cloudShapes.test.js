import { afterEach, expect, it, vi } from 'vitest';
import { shapeToRow } from '../../model/cloudRows.js';
import { newShape } from '../../model/libraryShapes.js';
import { addShape, deleteShape, setShapeArchived, updateShape } from '../elevationSlice.js';
import { openCloudWorkspace } from '../cloudThunks.js';
import { setupCloudSync } from '../cloudSync.js';
import { ALL, cloudStore, fakeDesignApi, fakeUuid, TEAM_ID } from './helpers/fakeDesignApi.js';

const syncs = [];
afterEach(() => {
  while (syncs.length) syncs.pop().stop();
  vi.useRealTimers();
});

it('SH2 anchor 3: loads live and archived shapes in row order, notes unreadable rows, and never seeds shapes', async () => {
  const rod = { ...newShape([], fakeUuid()), name: 'Rod' };
  const archived = { ...rod, id: fakeUuid(), name: 'rod', archived: true };
  for (const count of [1, 2]) {
    const api = fakeDesignApi({ shapes: [
      { ...shapeToRow(rod), version: 4 },
      { ...shapeToRow(archived), version: 7, archived_at: 't' },
      ...Array.from({ length: count }, () => ({ shape_id: fakeUuid(), name: 'Bad', data: {} })),
    ] });
    const store = cloudStore(api);
    const sync = setupCloudSync(store, { getDesignApi: async () => api });
    syncs.push(sync);
    expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
    const state = store.getState().elevation;
    expect(state.settings.shapes).toEqual([rod, archived]);
    expect(state.cloud.rows.shapes).toEqual({ [rod.id]: { rowId: rod.id, version: 4 }, [archived.id]: { rowId: archived.id, version: 7 } });
    expect(state.message).toBe(count === 1 ? "1 shape couldn't be read and was left out."
      : "2 shapes couldn't be read and were left out.");
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls.some(([name]) => name === 'saveShape')).toBe(false);
  }
  for (const manage of [true, false]) {
    const api = fakeDesignApi();
    const store = cloudStore(api, { ...ALL, manage });
    expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
    expect(store.getState().elevation.settings.shapes).toEqual([]);
    expect(store.getState().elevation.cloud.rows.shapes).toEqual({});
    expect(api.calls.some(([name]) => name === 'saveShape')).toBe(false);
  }
});

it('SH2 anchor 4: stops loading on conflicting live names or a shapes fetch failure before saving anything', async () => {
  const shape = { ...newShape([], fakeUuid()), name: 'Rod' };
  const api = fakeDesignApi({ shapes: [{ ...shapeToRow(shape), version: 1 },
    { ...shapeToRow({ ...shape, id: fakeUuid() }), name: ' ROD ', version: 1 }] });
  const store = cloudStore(api);
  const message = "The shop's shapes conflict (two shapes share a name). Fix them in Supabase, then reload.";
  expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: false, reason: 'bad_input', message });
  expect(store.getState().elevation.workspace.error).toBe(message);
  expect(store.getState().elevation.source).toBe('local');
  api.replies.listShapes = { ok: false, reason: 'network', message: 'Offline' };
  expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: false, reason: 'network', message: "Couldn't load the shop data: Offline" });
  expect(api.calls.some(([name]) => name.startsWith('save'))).toBe(false);
});

it('SH2 anchor 5: saves after 15 seconds, flushes archive and restore, edits archived shapes without archiving again, and archives removals', async () => {
  vi.useFakeTimers();
  const api = fakeDesignApi();
  const store = cloudStore(api);
  const sync = setupCloudSync(store, { getDesignApi: async () => api });
  syncs.push(sync);
  await store.dispatch(openCloudWorkspace());
  const save = vi.spyOn(api, 'saveShape');
  const archive = vi.spyOn(api, 'archiveLibraryItem');
  const shape = { ...newShape([], fakeUuid()), name: 'Rod' };
  store.dispatch(addShape({ shape }));
  await vi.advanceTimersByTimeAsync(14999);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith({ teamId: TEAM_ID, shapeId: shape.id, name: shape.name,
    data: shapeToRow(shape).data, expectedVersion: 0 });
  expect(store.getState().elevation.cloud.rows.shapes[shape.id]).toEqual({ rowId: shape.id, version: 1 });
  store.dispatch(setShapeArchived({ shapeId: shape.id, archived: true }));
  expect(await sync.flush()).toEqual({ ok: true });
  expect(archive).toHaveBeenCalledTimes(1);
  expect(archive).toHaveBeenCalledWith('shape', shape.id, true);
  expect(save).toHaveBeenCalledTimes(1);
  const edited = { ...store.getState().elevation.settings.shapes[0], box: { ...shape.box, w: 30 } };
  store.dispatch(updateShape({ shape: edited }));
  await vi.advanceTimersByTimeAsync(15000);
  expect(save).toHaveBeenLastCalledWith({ teamId: TEAM_ID, shapeId: shape.id, name: shape.name,
    data: { ...shapeToRow(edited).data, version: 2 }, expectedVersion: 1 });
  expect(archive).toHaveBeenCalledTimes(1);
  expect(api.db.shapes[0]).toMatchObject({ archived_at: 't', version: 2, data: { version: 2 } });
  expect(store.getState().elevation.cloud.rows.shapes[shape.id].version).toBe(2);
  store.dispatch(setShapeArchived({ shapeId: shape.id, archived: false }));
  await sync.flush();
  expect(archive).toHaveBeenLastCalledWith('shape', shape.id, false);
  store.dispatch(deleteShape({ shapeId: shape.id }));
  await sync.flush();
  expect(archive).toHaveBeenLastCalledWith('shape', shape.id, true);
  expect(archive).toHaveBeenCalledTimes(3);
  expect(api.db.shapes).toHaveLength(1);
  expect(api.db.shapes[0].archived_at).toBe('t');
  expect(api.calls.some(([name]) => name === 'saveTeamSettings')).toBe(false);
});

it('SH2 pauses a conflicted shape target with its label until the shop data reloads', async () => {
  const shape = { ...newShape([], fakeUuid()), name: 'Rod', archived: true };
  const api = fakeDesignApi({ shapes: [{ ...shapeToRow(shape), version: 4, archived_at: 't' }] });
  const store = cloudStore(api);
  const sync = setupCloudSync(store, { getDesignApi: async () => api });
  syncs.push(sync);
  await store.dispatch(openCloudWorkspace());
  api.db.shapes[0].version = 5;
  store.dispatch(updateShape({ shape: { ...shape, notes: 'Changed' } }));
  expect(await sync.flush()).toEqual({ ok: false });
  expect(store.getState().elevation.cloud.conflict).toEqual({ target: `shape:${shape.id}`,
    what: 'Shape "Rod"', updatedByName: 'Other', updatedAt: 't' });
  store.dispatch(updateShape({ shape: { ...shape, notes: 'Another edit' } }));
  await sync.flush();
  expect(api.calls.filter(([name]) => name === 'saveShape')).toHaveLength(1);
  await store.dispatch(openCloudWorkspace());
  store.dispatch(updateShape({ shape: { ...shape, notes: 'Changed' } }));
  expect(await sync.flush()).toEqual({ ok: true });
  expect(store.getState().elevation.cloud.rows.shapes[shape.id].version).toBe(6);
  expect(api.calls.some(([name]) => name === 'archiveLibraryItem')).toBe(false);
});
