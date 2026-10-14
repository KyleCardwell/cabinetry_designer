/**
 * The local draft cache for shop rooms (SPEC-DB6a). While a room has edits the server hasn't
 * confirmed, the browser keeps a copy of the whole document in IndexedDB, so a closed tab, a
 * crash or a dropped connection loses nothing. A draft is
 *   { roomId, teamId, baseVersion, document, schemaVersion, savedAt }
 * where `baseVersion` is the server's `version` the edits started from. It exists only while
 * the room has unsaved changes: a confirmed save deletes it.
 *
 * Every store method resolves and never throws: if IndexedDB is missing or fails (private
 * windows, blocked storage) the editor still works, it just isn't crash-safe.
 */
const DB_NAME = 'cd-designer-drafts';
const STORE = 'roomDrafts';

/** An in-memory store: used when IndexedDB isn't there, and by tests. */
export function createMemoryDraftStore() {
  const drafts = new Map();
  return {
    kind: 'memory',
    async get(roomId) { return drafts.has(roomId) ? structuredClone(drafts.get(roomId)) : null; },
    async put(draft) { drafts.set(draft.roomId, structuredClone(draft)); return true; },
    async delete(roomId) { drafts.delete(roomId); return true; },
    async list() { return structuredClone([...drafts.values()]); },
  };
}

/** The draft store over IndexedDB (`factory` is `globalThis.indexedDB`, or a test's fake). */
export function createIndexedDbDraftStore(factory = globalThis.indexedDB) {
  let opening = null;

  function open() {
    if (!factory) return Promise.resolve(null);
    if (!opening) {
      opening = new Promise((resolve) => {
        try {
          const request = factory.open(DB_NAME, 1);
          request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE, { keyPath: 'roomId' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => resolve(null);
          request.onblocked = () => resolve(null);
        } catch {
          resolve(null);
        }
      });
    }
    return opening;
  }

  async function run(mode, action, fallback) {
    const db = await open();
    if (!db) return fallback;
    return new Promise((resolve) => {
      try {
        const transaction = db.transaction(STORE, mode);
        const request = action(transaction.objectStore(STORE));
        let result = fallback;
        request.onsuccess = () => { result = request.result; };
        transaction.oncomplete = () => resolve(result === undefined ? fallback : result);
        transaction.onerror = () => resolve(fallback);
        transaction.onabort = () => resolve(fallback);
      } catch {
        resolve(fallback);
      }
    });
  }

  return {
    kind: 'indexeddb',
    get: (roomId) => run('readonly', (store) => store.get(roomId), null),
    put: (draft) => run('readwrite', (store) => store.put(draft), null).then((key) => key !== null),
    delete: (roomId) => run('readwrite', (store) => store.delete(roomId), null).then(() => true),
    list: () => run('readonly', (store) => store.getAll(), []),
  };
}

let defaultStore = null;

/** The app's draft store: IndexedDB when the browser has it, memory otherwise. */
export function getDraftStore() {
  if (!defaultStore) {
    defaultStore = typeof globalThis.indexedDB === 'undefined' ? createMemoryDraftStore() : createIndexedDbDraftStore();
  }
  return defaultStore;
}

/** A well-formed draft record, or null for anything else found in storage. */
export function readDraft(value) {
  if (!value || typeof value !== 'object') return null;
  const { roomId, teamId, baseVersion, document, schemaVersion, savedAt } = value;
  if (typeof roomId !== 'string' || !Number.isInteger(baseVersion) || !document || typeof document !== 'object') return null;
  if (!Number.isInteger(schemaVersion)) return null;
  return { roomId, teamId: teamId ?? null, baseVersion, document, schemaVersion, savedAt: savedAt ?? null };
}
