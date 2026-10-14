import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbDraftStore, createMemoryDraftStore, readDraft } from '../roomDrafts.js';

const draft = (roomId = 'rm-1', extra = {}) => ({
  roomId, teamId: 't', baseVersion: 3, schemaVersion: 4, savedAt: 'now', document: { id: roomId, walls: [{ id: 'w' }] }, ...extra,
});

function behavesLikeADraftStore(make) {
  it('puts, gets, lists and deletes drafts, keeping copies', async () => {
    const store = make();
    expect(await store.get('rm-1')).toBeNull();
    const original = draft();
    expect(await store.put(original)).toBe(true);
    original.document.walls.push({ id: 'later' });
    expect((await store.get('rm-1')).document.walls).toHaveLength(1);
    await store.put(draft('rm-1', { baseVersion: 4 }));
    await store.put(draft('rm-2'));
    expect((await store.get('rm-1')).baseVersion).toBe(4);
    expect((await store.list()).map((entry) => entry.roomId).sort()).toEqual(['rm-1', 'rm-2']);
    await store.delete('rm-1');
    expect(await store.get('rm-1')).toBeNull();
    expect((await store.list()).map((entry) => entry.roomId)).toEqual(['rm-2']);
  });
}

describe('DB6a draft stores', () => {
  describe('memory', () => behavesLikeADraftStore(createMemoryDraftStore));
  describe('IndexedDB', () => behavesLikeADraftStore(() => createIndexedDbDraftStore(new IDBFactory())));

  it('IndexedDB drafts survive a new store over the same database (a reloaded page)', async () => {
    const factory = new IDBFactory();
    await createIndexedDbDraftStore(factory).put(draft());
    expect((await createIndexedDbDraftStore(factory).get('rm-1')).baseVersion).toBe(3);
  });

  it('never throws when IndexedDB is missing or broken', async () => {
    for (const factory of [null, { open() { throw new Error('blocked'); } }]) {
      const store = createIndexedDbDraftStore(factory);
      expect(await store.get('rm-1')).toBeNull();
      expect(await store.put(draft())).toBe(false);
      expect(await store.delete('rm-1')).toBe(true);
      expect(await store.list()).toEqual([]);
    }
  });

  it('readDraft accepts well-formed records only', () => {
    expect(readDraft(draft())).toEqual(draft());
    expect(readDraft(draft('rm-1', { teamId: undefined })).teamId).toBeNull();
    for (const bad of [null, 'x', {}, draft('rm-1', { baseVersion: '3' }), draft('rm-1', { document: null }),
      draft('rm-1', { schemaVersion: undefined }), { ...draft(), roomId: 5 }]) {
      expect(readDraft(bad)).toBeNull();
    }
  });
});
