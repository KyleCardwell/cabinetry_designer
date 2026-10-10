import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import {
  isSectionProfile,
  isSectionProfileList,
  mergeImportedProfiles,
  newSectionProfile,
  sectionProfileUses,
} from '../../model/sectionProfiles.js';

export const sectionProfileReducers = {
  addSectionProfile: {
    reducer(state, action) {
      const { baseId, id, kind } = action.payload;
      const list = current(state.settings).sectionProfiles;
      const base = baseId == null ? null : list.find((profile) => profile.id === baseId);
      if (baseId != null && !base) return;
      const next = [...list, newSectionProfile(list, id, base, kind)];
      if (!isSectionProfileList(next)) return;
      state.settings.sectionProfiles = next;
    },
    prepare(payload = {}) {
      return { payload: { ...payload, id: payload.id ?? uuid() } };
    },
  },
  updateSectionProfile(state, action) {
    const { profileId, profile } = action.payload;
    const list = current(state.settings).sectionProfiles;
    const profileIndex = list.findIndex((entry) => entry.id === profileId);
    if (profileIndex === -1) return;
    const existing = list[profileIndex];
    const changed = JSON.stringify([profile?.geometry, profile?.drawnPoints, profile?.stretch])
      !== JSON.stringify([existing.geometry, existing.drawnPoints, existing.stretch]);
    const next = {
      ...structuredClone(profile),
      id: existing.id,
      version: existing.version + (changed ? 1 : 0),
      archived: existing.archived,
    };
    if (!isSectionProfile(next)) return;
    state.settings.sectionProfiles = list.map((entry, index) => (index === profileIndex ? next : entry));
  },
  setSectionProfileArchived(state, action) {
    const { profileId, archived } = action.payload;
    const list = current(state.settings).sectionProfiles;
    const profileIndex = list.findIndex((entry) => entry.id === profileId);
    if (profileIndex === -1 || typeof archived !== 'boolean') return;
    state.settings.sectionProfiles[profileIndex].archived = archived;
  },
  deleteSectionProfile(state, action) {
    const { profileId } = action.payload;
    const settings = current(state.settings);
    const list = settings.sectionProfiles;
    if (!list.some((profile) => profile.id === profileId)) return;
    if (sectionProfileUses(settings, current(state.rooms), profileId).length) return;
    state.settings.sectionProfiles = list.filter((profile) => profile.id !== profileId);
  },
  importSectionProfiles(state, action) {
    const { profiles } = action.payload;
    if (!Array.isArray(profiles)) return;
    const list = current(state.settings).sectionProfiles;
    const { profiles: next, added, replaced } = mergeImportedProfiles(list, structuredClone(profiles));
    if (added + replaced === 0) return;
    state.settings.sectionProfiles = next;
  },
};
