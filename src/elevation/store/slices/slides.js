import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import { BUILT_IN_SLIDE_IDS, findSlide, isSlideList, newSlide, roomSlideUses } from '../../model/slides.js';

import { effectiveSettings } from '../../model/effectiveSettings.js';
import { roomIndexFor, syncRoomAt } from './helpers.js';

export const slideReducers = {
  moveMissingSlide(state, action) {
    const { roomId, slideId, reassignTo } = action.payload;
    const index = roomIndexFor(state, roomId);
    if (index === -1 || typeof slideId !== 'string' || !slideId) return;
    const slides = effectiveSettings(state, state.rooms[index]).slides;
    if (findSlide(slideId, slides) || (reassignTo !== null && !findSlide(reassignTo, slides))) return;
    const uses = [...roomSlideUses(state.rooms[index])].filter(({ node, key }) => node[key] === slideId);
    if (!uses.length) return;
    for (const { node, key, face } of uses) {
      if (reassignTo === null) {
        delete node[key];
        if (face && !Object.keys(node).length) delete face.drawerBox;
      } else node[key] = reassignTo;
    }
    syncRoomAt(state, index);
  },
  addSlide: {
    reducer(state, action) {
      const { baseId, id } = action.payload;
      const slides = current(state.settings).slides;
      const base = findSlide(baseId, slides) ?? slides[0];
      if (!base) return;
      const next = [...slides, newSlide(slides, base, id)];
      if (!isSlideList(next)) return;
      state.settings.slides = next;
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: uuid() } };
    },
  },
  updateSlide(state, action) {
    const { slideId, slide } = action.payload;
    const slides = current(state.settings).slides;
    const previous = findSlide(slideId, slides);
    if (!previous) return;
    const updated = { ...slide, id: slideId };
    if (BUILT_IN_SLIDE_IDS.includes(slideId)) updated.mount = previous.mount;
    const next = slides.map((entry) => entry.id === slideId ? updated : entry);
    if (!isSlideList(next)) return;
    state.settings.slides = next;
  },
  deleteSlide(state, action) {
    const { slideId } = action.payload;
    const slides = current(state.settings).slides;
    if (BUILT_IN_SLIDE_IDS.includes(slideId) || !findSlide(slideId, slides)) return;
    state.settings.slides = slides.filter((slide) => slide.id !== slideId);
  },
};
