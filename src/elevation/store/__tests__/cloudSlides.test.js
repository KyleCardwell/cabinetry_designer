import { afterEach, describe, expect, it, vi } from 'vitest';
import { slideToRow } from '../../model/cloudRows.js';
import { BUILT_IN_SLIDES, BUILT_IN_SLIDE_IDS, isSlideList } from '../../model/slides.js';
import { addSlide, deleteSlide, updateSlide } from '../elevationSlice.js';
import { openCloudWorkspace } from '../cloudThunks.js';
import { setupCloudSync } from '../cloudSync.js';
import { ALL, cloudStore, fakeDesignApi, fakeUuid, TEAM_ID } from './helpers/fakeDesignApi.js';

const syncs = [];
afterEach(() => {
  while (syncs.length) syncs.pop().stop();
  vi.useRealTimers();
});

const rowFor = (slide, version = 2) => ({ slide_id: fakeUuid(), ...slideToRow(slide), version, archived_at: null });
const builtIns = () => BUILT_IN_SLIDES.map((slide) => rowFor(slide));
const hettichRow = () => rowFor({ ...BUILT_IN_SLIDES[0], id: fakeUuid(), name: 'Hettich', hardwareSlideId: 3 });

async function open(options = {}, permissions = ALL, syncEnabled = false) {
  const api = fakeDesignApi(options);
  const store = cloudStore(api, permissions);
  let sync;
  if (syncEnabled) {
    sync = setupCloudSync(store, { getDesignApi: async () => api });
    syncs.push(sync);
  }
  expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
  return { api, store, sync };
}

describe('IN4b c shop slides', () => {
  it('seeds an empty team once, or uses unsaved built-ins without manage permission (anchor 3)', async () => {
    const { api, store } = await open();
    expect(api.calls.filter(([name]) => name === 'saveSlide')).toEqual([
      ['saveSlide', null, 0, 'Blum Tandem 562H'], ['saveSlide', null, 0, 'Accuride 3832'],
      ['saveSlide', null, 0, 'Accuride 4034'],
    ]);
    expect(store.getState().elevation.settings.slides).toEqual(BUILT_IN_SLIDES);
    for (const row of api.db.slides) {
      expect(store.getState().elevation.cloud.rows.slides[row.data.seedId]).toEqual({ rowId: row.slide_id, version: row.version });
    }
    await store.dispatch(openCloudWorkspace());
    expect(api.calls.filter(([name]) => name === 'saveSlide')).toHaveLength(3);
    const viewer = await open({}, { view: true, edit: false, manage: false });
    expect(viewer.api.calls.filter(([name]) => name === 'saveSlide')).toEqual([]);
    expect(viewer.store.getState().elevation.settings.slides).toEqual(BUILT_IN_SLIDES);
    expect(viewer.store.getState().elevation.cloud.rows.slides).toEqual({});
    expect(viewer.store.getState().elevation.message).toBeNull();
  });

  it('orders built-ins before team rows, skips invalid rows and excludes archived slides (anchor 4)', async () => {
    const hettich = hettichRow();
    const { api, store } = await open({ slides: [hettich, { ...hettich, slide_id: fakeUuid(), data: {} },
      ...builtIns().reverse(), { ...hettich, slide_id: fakeUuid(), name: 'Archived', archived_at: 't' }] });
    const state = store.getState().elevation;
    expect(state.settings.slides.map((slide) => slide.id)).toEqual([...BUILT_IN_SLIDE_IDS, hettich.slide_id]);
    expect(state.cloud.rows.slides[hettich.slide_id]).toEqual({ rowId: hettich.slide_id, version: 2 });
    expect(state.message).toBe("1 slide couldn't be read and was left out.");
    expect(api.calls.filter(([name]) => name === 'saveSlide')).toEqual([]);
  });

  it('keeps failed seeds unsaved and gives colliding fallbacks unique names ignoring case', async () => {
    const clash = { ...hettichRow(), name: 'BLUM TANDEM 562H' };
    for (const manage of [true, false]) {
      const api = fakeDesignApi({ slides: [clash] });
      api.replies.saveSlide = { ok: false, reason: 'duplicate', message: 'Name taken' };
      const store = cloudStore(api, { ...ALL, manage });
      expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: true });
      const state = store.getState().elevation;
      expect(state.settings.slides[0].name).toBe('Blum Tandem 562H (built-in)');
      expect(isSlideList(state.settings.slides)).toBe(true);
      expect(state.cloud.rows.slides['blum-562h']).toBeUndefined();
      expect(state.cloud.rows.slides['accuride-3832']).toBeUndefined();
      if (manage) expect(state.message).toContain('The built-in "Blum Tandem 562H" slide couldn\'t be saved (Name taken); using it unsaved.');
      else expect(state.message).toBeNull();
    }
  });

  it('fails the open on a slides fetch failure before seeding anything', async () => {
    const api = fakeDesignApi();
    api.replies.listSlides = { ok: false, reason: 'network', message: 'Offline' };
    const store = cloudStore(api);
    expect(await store.dispatch(openCloudWorkspace())).toEqual({ ok: false, reason: 'network', message: "Couldn't load the shop data: Offline" });
    expect(store.getState().elevation.workspace.error).toBe("Couldn't load the shop data: Offline");
    expect(api.calls.some(([name]) => name.startsWith('save'))).toBe(false);
  });

  it('saves an edit after 15 seconds, preserves its estimator link and archives removal (anchor 5)', async () => {
    vi.useFakeTimers();
    const hettich = hettichRow();
    const { api, store, sync } = await open({ slides: [...builtIns(), hettich] }, ALL, true);
    const save = vi.spyOn(api, 'saveSlide');
    const slide = store.getState().elevation.settings.slides.at(-1);
    store.dispatch(updateSlide({ slideId: slide.id, slide: { ...slide, sideClearance: 0.3125 } }));
    await vi.advanceTimersByTimeAsync(14999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ teamId: TEAM_ID, slideId: hettich.slide_id, name: 'Hettich',
      data: { ...hettich.data, sideClearance: 0.3125 }, hardwareSlideId: 3, expectedVersion: 2 });
    expect(store.getState().elevation.cloud.rows.slides[slide.id].version).toBe(3);
    expect(api.db.slides.at(-1).hardware_slide_id).toBe(3);
    store.dispatch(deleteSlide({ slideId: slide.id }));
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls.at(-1)).toEqual(['archiveLibraryItem', 'slide', hettich.slide_id, true]);
    expect(api.calls.some(([name]) => name === 'saveTeamSettings')).toBe(false);
  });

  it('pauses a conflicting slide until reload and labels it by name (anchor 5)', async () => {
    const hettich = hettichRow();
    const { api, store, sync } = await open({ slides: [...builtIns(), hettich] }, ALL, true);
    api.db.slides.at(-1).version = 3;
    const slide = store.getState().elevation.settings.slides.at(-1);
    store.dispatch(updateSlide({ slideId: slide.id, slide: { ...slide, sideClearance: 0.3125 } }));
    expect(await sync.flush()).toEqual({ ok: false });
    expect(store.getState().elevation.cloud.conflict).toEqual({
      target: `slide:${slide.id}`, what: 'Slide "Hettich"', updatedByName: 'Other', updatedAt: 't',
    });
    await sync.flush();
    expect(api.calls.filter(([name]) => name === 'saveSlide')).toHaveLength(1);
    await store.dispatch(openCloudWorkspace());
    store.dispatch(updateSlide({ slideId: slide.id, slide: { ...slide, sideClearance: 0.3125 } }));
    expect(await sync.flush()).toEqual({ ok: true });
    expect(store.getState().elevation.cloud.rows.slides[slide.id].version).toBe(4);
  });

  it('flushes a new uuid slide and an edited unsaved built-in with expected version zero', async () => {
    const api = fakeDesignApi();
    api.replies.saveSlide = { ok: false, reason: 'network', message: 'Offline' };
    const store = cloudStore(api);
    const sync = setupCloudSync(store, { getDesignApi: async () => api });
    syncs.push(sync);
    await store.dispatch(openCloudWorkspace());
    api.calls.length = 0;
    delete api.replies.saveSlide;
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls).toEqual([]);
    store.dispatch(addSlide());
    const added = store.getState().elevation.settings.slides.at(-1);
    store.dispatch(updateSlide({ slideId: 'blum-562h', slide: { ...BUILT_IN_SLIDES[0], sideClearance: 0.3125 } }));
    expect(await sync.flush()).toEqual({ ok: true });
    expect(api.calls).toEqual([['saveSlide', null, 0, 'Blum Tandem 562H'], ['saveSlide', added.id, 0, added.name]]);
    expect(api.db.slides[0].data.seedId).toBe('blum-562h');
    expect(api.db.slides[1].data).not.toHaveProperty('seedId');
    expect(store.getState().elevation.cloud.rows.slides[added.id]).toEqual({ rowId: added.id, version: 1 });
  });
});
