/**
 * An in-memory Realtime Presence channel shared by several "tabs" (stores). `hub.service()`
 * has the same shape as createPresenceService(). `hub.fail = true` makes joins fail.
 */
export function fakePresenceHub() {
  const channels = new Map(); // estProjectId → Map(key → { payload, onChange })
  const hub = {
    fail: false,
    channels,
    entries(estProjectId) {
      return [...(channels.get(estProjectId)?.entries() ?? [])]
        .filter(([, member]) => member.payload)
        .map(([key, member]) => ({ key, ...structuredClone(member.payload) }));
    },
    broadcast(estProjectId) {
      const list = hub.entries(estProjectId);
      for (const member of channels.get(estProjectId)?.values() ?? []) {
        queueMicrotask(() => member.onChange(structuredClone(list)));
      }
    },
    service() {
      return {
        join(estProjectId, { key, onChange }) {
          if (hub.fail) return { ready: Promise.resolve(false), async track() {}, async leave() {} };
          if (!channels.has(estProjectId)) channels.set(estProjectId, new Map());
          const members = channels.get(estProjectId);
          members.set(key, { payload: null, onChange });
          return {
            ready: Promise.resolve(true),
            async track(payload) {
              if (!members.has(key)) return;
              members.get(key).payload = structuredClone(payload);
              hub.broadcast(estProjectId);
            },
            async leave() {
              members.delete(key);
              hub.broadcast(estProjectId);
            },
          };
        },
      };
    },
  };
  return hub;
}
