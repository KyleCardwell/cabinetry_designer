import { current } from '@reduxjs/toolkit';
import { v4 as uuid } from 'uuid';
import {
  isSectionProfile,
  isSectionProfileList,
  mergeImportedProfiles,
  newSectionProfile,
} from '../../model/sectionProfiles.js';
import { isUuid } from '../../model/cloudRows.js';

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
    state.settings.sectionProfiles = list.filter((profile) => profile.id !== profileId);
  },
  importSectionProfiles: {
    reducer(state, action) {
      const { profiles, freshIds = [] } = action.payload;
      if (!Array.isArray(profiles)) return;
      let incoming = structuredClone(profiles);
      // Shop library rows are keyed by uuid (SPEC-DB4): old-style ids get a new one.
      if (state.source === 'cloud') {
        incoming = incoming.map((profile, index) => (
          profile && typeof profile === 'object' && !isUuid(profile.id) && freshIds[index]
            ? { ...profile, id: freshIds[index] } : profile));
      }
      const list = current(state.settings).sectionProfiles;
      const { profiles: next, added, replaced } = mergeImportedProfiles(list, incoming);
      if (added + replaced === 0) return;
      state.settings.sectionProfiles = next;
    },
    prepare(payload = {}) {
      const count = Array.isArray(payload.profiles) ? payload.profiles.length : 0;
      return { payload: { ...payload, freshIds: Array.from({ length: count }, () => uuid()) } };
    },
  },
};
