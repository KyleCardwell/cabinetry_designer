/**
 * Who has which room open (SPEC-DB6a.1): Supabase Realtime Presence on one private channel
 * per project, `design-project:<est_project_id>`. Nothing is written to the database; a tab
 * that closes or loses its connection drops off the list on its own.
 *
 * `createPresenceService(client)` → `{ join(estProjectId, { key, onChange }) }`, and `join`
 * returns a handle:
 *   ready  — Promise<boolean>: true once joined, false if the channel failed or timed out
 *   track(payload) — what this tab shares: { userId, userName, roomId, openedAt, readOnly }
 *   leave()
 * `onChange(entries)` gets everyone on the channel (this tab too), each `{ key, ...payload }`.
 * Tests use a fake with the same shape.
 */
export const presenceTopic = (estProjectId) => `design-project:${estProjectId}`;

/** presenceState() → `{ key: [meta, …] }`; one entry per key (each tab has its own key). */
export function presenceEntries(state) {
  return Object.entries(state ?? {}).flatMap(([key, metas]) => {
    const meta = Array.isArray(metas) ? metas.at(-1) : null;
    if (!meta) return [];
    const { phx_ref: ref, phx_ref_prev: prev, ...payload } = meta;
    void ref;
    void prev;
    return [{ key, ...payload }];
  });
}

export function createPresenceService(client) {
  return {
    join(estProjectId, { key, onChange }) {
      let subscribed = false;
      let payload = null;
      let channel = null;
      let closed = false;

      const ready = (async () => {
        try {
          // Private channels are checked against the user's JWT (RLS on realtime.messages).
          const { data } = await client.auth.getSession();
          if (data?.session?.access_token && client.realtime?.setAuth) await client.realtime.setAuth(data.session.access_token);
        } catch {
          // Joining still tries; the policy refuses it if the token is missing.
        }
        if (closed) return false;
        channel = client.channel(presenceTopic(estProjectId), { config: { private: true, presence: { key } } });
        channel.on('presence', { event: 'sync' }, () => onChange(presenceEntries(channel.presenceState())));
        return new Promise((resolve) => {
          channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              subscribed = true;
              if (payload) await channel.track(payload);
              resolve(true);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              subscribed = false;
              resolve(false);
            }
          });
        });
      })();

      return {
        ready,
        async track(next) {
          payload = next;
          if (subscribed && channel) await channel.track(next);
        },
        async leave() {
          closed = true;
          if (!channel) return;
          try {
            if (subscribed) await channel.untrack();
          } finally {
            await client.removeChannel(channel);
          }
        },
      };
    },
  };
}

let defaultService = null;

/** The app's presence over the real Supabase client, loaded on first use (keeps tests env-free). */
export async function getPresenceService() {
  if (!defaultService) {
    const { supabase } = await import('./supabaseClient.js');
    defaultService = createPresenceService(supabase);
  }
  return defaultService;
}
