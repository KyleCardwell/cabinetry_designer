/**
 * Joining a project's presence channel and saying which room this tab has open
 * (SPEC-DB6a.1). The service comes from the thunk extra `getPresence` (the app passes the
 * Supabase one; tests a fake). Without it every thunk is a no-op, so presence never blocks
 * opening or editing a room.
 */
import { presenceEntries, presenceJoining, presenceLeft, presenceStatus } from './presenceSlice.js';

const TAB_KEY = globalThis.crypto?.randomUUID?.() ?? `tab-${Math.random().toString(36).slice(2)}`;
const JOIN_TIMEOUT = 4000;

// One channel per store (the app has one; tests make several "tabs"): store's thunk extra → { estProjectId, handle, payload, ready }.
let actives = new WeakMap();
const GLOBAL = {};
const slotOf = (extra) => extra ?? GLOBAL;

function selfOf(getState) {
  const { auth } = getState();
  return { userId: auth?.session?.user?.id ?? null, userName: auth?.userName ?? null };
}

async function serviceOf(extra) {
  return extra?.getPresence ? extra.getPresence() : null;
}

/**
 * Join `design-project:<estProjectId>` (leaving any other project first). Resolves once joined,
 * or after a short timeout: `{ ok: true, joined }`. Joining the project already joined is a no-op.
 */
export function joinProjectPresence(estProjectId) {
  return async (dispatch, getState, extra) => {
    const service = await serviceOf(extra);
    if (!service) return { ok: true, joined: false };
    const slot = slotOf(extra);
    const active = actives.get(slot);
    if (active?.estProjectId === estProjectId) {
      return { ok: true, joined: await active.ready };
    }
    if (active) await dispatch(leaveProjectPresence());
    const key = extra?.presenceKey ?? TAB_KEY;
    dispatch(presenceJoining({ estProjectId, selfKey: key }));
    const payload = { ...selfOf(getState), roomId: null, openedAt: null, readOnly: false };
    const handle = service.join(estProjectId, {
      key,
      onChange: (entries) => {
        if (actives.get(slot)?.handle === handle) dispatch(presenceEntries(entries));
      },
    });
    const timeout = extra?.presenceTimeout ?? JOIN_TIMEOUT;
    const ready = Promise.race([
      handle.ready.catch(() => false),
      new Promise((resolve) => { globalThis.setTimeout(() => resolve(false), timeout); }),
    ]);
    actives.set(slot, { estProjectId, handle, payload, ready });
    await handle.track(payload);
    const joined = await ready;
    if (actives.get(slot)?.handle === handle) dispatch(presenceStatus(joined ? 'joined' : 'unavailable'));
    return { ok: true, joined };
  };
}

/** Say which room this tab has open (`roomId` null = just the project page). */
export function setPresenceRoom({ roomId, readOnly = false }) {
  return async (dispatch, getState, extra) => {
    const active = actives.get(slotOf(extra));
    if (!active) return { ok: true };
    const sameRoom = active.payload.roomId === roomId;
    active.payload = {
      ...active.payload,
      roomId: roomId ?? null,
      readOnly: Boolean(roomId) && readOnly,
      openedAt: roomId ? (sameRoom ? active.payload.openedAt : new Date().toISOString()) : null,
    };
    await active.handle.track(active.payload);
    return { ok: true };
  };
}

export function leaveProjectPresence() {
  return async (dispatch, getState, extra) => {
    const slot = slotOf(extra);
    const current = actives.get(slot);
    actives.delete(slot);
    dispatch(presenceLeft());
    if (current) {
      try { await current.handle.leave(); } catch { /* already gone */ }
    }
    return { ok: true };
  };
}

/** Tests only: forget the module's channel between stores. */
export function resetPresenceForTests() {
  actives = new WeakMap();
}
