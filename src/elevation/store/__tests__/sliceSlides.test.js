import { describe, expect, it } from 'vitest';
import { BUILT_IN_SLIDES, isSlideList } from '../../model/slides.js';
import { isUuid } from '../../model/cloudRows.js';
import elevationReducer, { addSlide, updateSlide, deleteSlide } from '../elevationSlice.js';
import { stateWithRun } from './helpers/sliceFixtures.js';

describe('IN4b step b slide reducers', () => {
  it('deep copies the first or chosen slide with fresh UUIDs, unique names and no estimator link', () => {
    const initial = stateWithRun();
    const linked = { ...initial, settings: { ...initial.settings, slides: BUILT_IN_SLIDES.map((slide) => ({ ...slide, hardwareSlideId: 42 })) } };
    const first = addSlide();
    const second = addSlide({ baseId: 'accuride-4034' });
    expect(isUuid(first.payload.id)).toBe(true);
    expect(isUuid(second.payload.id)).toBe(true);
    expect(first.payload.id).not.toBe(second.payload.id);
    let state = elevationReducer(linked, first);
    expect(state.settings.slides).toHaveLength(4);
    expect(state.settings.slides[3]).toEqual({ ...BUILT_IN_SLIDES[0], id: first.payload.id, name: 'Blum Tandem 562H copy', hardwareSlideId: null });
    expect(state.settings.slides[3].lengths).not.toBe(state.settings.slides[0].lengths);
    expect(state.settings.slides[3].lengths[2]).not.toBe(state.settings.slides[0].lengths[2]);
    state = elevationReducer(state, second);
    expect(state.settings.slides[4]).toEqual({ ...BUILT_IN_SLIDES[2], id: second.payload.id, name: 'Accuride 4034 copy', hardwareSlideId: null });
    state = elevationReducer(state, addSlide({ baseId: 'missing' }));
    expect(state.settings.slides[5].name).toBe('Blum Tandem 562H copy 2');
    expect(state.rooms).toBe(initial.rooms);
    expect(isSlideList(state.settings.slides)).toBe(true);
  });

  it('retains ids and built-in mounts, edits custom mounts, and rejects invalid lists without changing rooms', () => {
    const initial = stateWithRun();
    const resized = elevationReducer(initial, updateSlide({
      slideId: 'blum-562h',
      slide: { ...BUILT_IN_SLIDES[0], id: 'ignored', mount: 'side', name: 'Shop Blum', lengths: [{ nominal: 9 }, { nominal: 12 }, { nominal: 15 }] },
    }));
    expect(resized.settings.slides[0]).toEqual({ ...BUILT_IN_SLIDES[0], name: 'Shop Blum', lengths: [{ nominal: 9 }, { nominal: 12 }, { nominal: 15 }] });
    expect(resized.rooms).toBe(initial.rooms);
    const state = elevationReducer(resized, addSlide());
    const custom = state.settings.slides[3];
    const updated = { ...custom, mount: 'side', sideClearance: 0, hardwareSlideId: 42 };
    const changed = elevationReducer(state, updateSlide({ slideId: custom.id, slide: updated }));
    expect(changed.settings.slides[3]).toEqual(updated);
    expect(changed.rooms).toBe(initial.rooms);
    for (const patch of [
      { name: 'ACCURIDE 3832' }, { name: ' ' }, { sideClearance: -1 }, { height: 0 },
      { lengths: [] }, { lengths: [{ nominal: 12 }, { nominal: 9 }] },
      { lengths: [{ nominal: 36 }, { nominal: 36 }] },
      { lengths: [{ nominal: 9, length: 0 }] }, { price: 5 },
    ]) {
      expect(elevationReducer(state, updateSlide({ slideId: custom.id, slide: { ...custom, ...patch } }))).toBe(state);
    }
    expect(elevationReducer(state, updateSlide({ slideId: 'missing', slide: updated }))).toBe(state);
  });

  it('removes only custom slides in sandbox and shop data and locks library edits in issued versions', () => {
    const initial = stateWithRun();
    const action = addSlide();
    const state = elevationReducer(initial, action);
    for (const slideId of [...BUILT_IN_SLIDES.map(({ id }) => id), 'missing']) {
      expect(elevationReducer(state, deleteSlide({ slideId }))).toBe(state);
    }
    for (const source of ['local', 'cloud']) {
      const deleted = elevationReducer({ ...state, source }, deleteSlide({ slideId: action.payload.id }));
      expect(deleted.settings.slides).toEqual(BUILT_IN_SLIDES);
      expect(deleted.rooms).toBe(initial.rooms);
    }
    const version = { ...state, source: 'version' };
    for (const action of [addSlide(), updateSlide({ slideId: 'blum-562h', slide: { ...BUILT_IN_SLIDES[0], height: 2 } }), deleteSlide({ slideId: state.settings.slides[3].id })]) {
      expect(elevationReducer(version, action)).toBe(version);
    }
  });
});
