import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { newSectionProfile, profileFile } from '../sectionProfiles.js';
import { doorDesignFile } from '../doorDesigns.js';
import { newAccessory } from '../accessories.js';
import { newShape } from '../libraryShapes.js';
import { libraryExport, mergeLibrary, parseLibraryFile, remapLibraryIds } from '../libraryFile.js';

const profile = newSectionProfile([], 'profile-old');
const shape = newShape([], 'shape-old');
const accessory = { ...newAccessory([], 'accessory-old'), shapeId: shape.id };
const design = { ...DEFAULT_SETTINGS.doorDesigns[0], id: 'design-old', code: 'Custom' };

describe('library files', () => {
  // Reference-graph fixtures exercise the collector without changing the item schemas:
  // current door designs have no profiles field and shapes embed profile geometry.
  it.each(['doorDesigns', 'accessories'])('exports selected %s with transitive dependencies (LX1)', (key) => {
    const referencedDesign = { ...design, profiles: { inside: profile.id } };
    const referencedShape = { ...shape, profileId: profile.id, accessoryId: accessory.id };
    const settings = {
      ...DEFAULT_SETTINGS,
      doorDesigns: [...DEFAULT_SETTINGS.doorDesigns, referencedDesign, { ...design, id: 'other', code: 'Other' }],
      sectionProfiles: [{ ...profile, archived: true }],
      shapes: [referencedShape], accessories: [accessory],
    };
    const row = key === 'doorDesigns' ? referencedDesign : accessory;
    const file = libraryExport(settings, key, [row.id]);
    expect(file.items).toEqual({ [key]: [row] });
    expect(file.dependencies.sectionProfiles).toEqual(settings.sectionProfiles);
    expect(file.dependencies.shapes).toEqual(key === 'accessories' ? [referencedShape] : undefined);
    expect(file.dependencies.accessories).toBeUndefined();
    expect(file.items[key][0]).not.toBe(row);
  });

  it('omits built-ins from whole-kind exports and dependencies (LX1)', () => {
    for (const key of ['doorDesigns', 'pulls', 'slides']) {
      expect(libraryExport(DEFAULT_SETTINGS, key, []).items).toEqual({});
    }
    const row = {
      ...accessory, designId: DEFAULT_SETTINGS.doorDesigns[0].id,
      pullId: DEFAULT_SETTINGS.pulls[0].id, slideId: DEFAULT_SETTINGS.slides[0].id,
    };
    const settings = { ...DEFAULT_SETTINGS, accessories: [row], shapes: [shape] };
    expect(libraryExport(settings, 'accessories', [])).toEqual({
      kind: 'library', version: 1, items: { accessories: [row] }, dependencies: { shapes: [shape] },
    });
    expect(libraryExport({ ...DEFAULT_SETTINGS, doorDesigns: [...DEFAULT_SETTINGS.doorDesigns, design] }, 'doorDesigns', []).items)
      .toEqual({ doorDesigns: [design] });
  });

  it('parses versioned libraries and legacy envelopes and rejects malformed files (LX1)', () => {
    const file = { kind: 'library', version: 1, items: { accessories: [accessory] }, dependencies: { shapes: [shape] } };
    expect(parseLibraryFile(JSON.stringify(file))).toEqual(file);
    const { kind, ...oldProfile } = profile;
    expect(parseLibraryFile(JSON.stringify(profileFile([{ ...oldProfile, tags: [kind] }])))).toEqual({
      kind: 'library', version: 1, items: { sectionProfiles: [profile] }, dependencies: {},
    });
    expect(parseLibraryFile(JSON.stringify(doorDesignFile([design]))).items.doorDesigns).toEqual([design]);
    const malformed = {
      ...profile, kind: 'crown', attach: { box_front: 'p2', box_top: 'p2' },
      geometry: { ...profile.geometry, loops: [null] },
    };
    const parsed = parseLibraryFile(JSON.stringify(profileFile([profile, malformed])));
    expect(mergeLibrary(DEFAULT_SETTINGS, parsed)).toMatchObject({ added: 1, skipped: 1 });
    for (const text of [
      'no json', 'null', JSON.stringify({ ...file, kind: 'other' }), JSON.stringify({ ...file, version: 2 }),
      JSON.stringify({ ...file, items: { accessories: {} } }),
      JSON.stringify({ ...file, dependencies: { shapes: null } }),
      JSON.stringify({ ...file, items: [] }), JSON.stringify({ ...file, items: { unknown: [] } }),
    ]) expect(parseLibraryFile(text)).toBeNull();
  });

  it('remaps Shop identities and all nested profile and shape references (LX1)', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const file = {
      kind: 'library', version: 1,
      items: { doorDesigns: [{ ...design, profiles: { inside: profile.id }, nested: [profile.id, uuid, 'slab'] }], accessories: [accessory] },
      dependencies: { sectionProfiles: [profile], shapes: [shape] },
    };
    const remapped = remapLibraryIds(file, {
      [design.id]: 'new-design', [profile.id]: 'new-profile', [shape.id]: 'new-shape', [accessory.id]: 'new-accessory',
      [uuid]: 'do-not-use', slab: 'do-not-use',
    });
    expect(remapped.items.doorDesigns[0]).toMatchObject({ id: 'new-design', profiles: { inside: 'new-profile' }, nested: ['new-profile', uuid, 'slab'] });
    expect(remapped.items.accessories[0]).toMatchObject({ id: 'new-accessory', shapeId: 'new-shape' });
    expect(remapped.dependencies.sectionProfiles[0].id).toBe('new-profile');
    expect(remapped.dependencies.shapes[0].id).toBe('new-shape');
    expect(file.items.accessories[0].shapeId).toBe(shape.id);
    expect(remapLibraryIds(file, {})).toEqual(file);
  });

  it('replaces items in place and adds only missing dependencies with counts (LX1)', () => {
    const existing = { ...profile, name: 'Existing' };
    const added = { ...profile, id: 'another-profile', name: 'Another' };
    const lists = { ...DEFAULT_SETTINGS, sectionProfiles: [existing], shapes: [shape] };
    const result = mergeLibrary(lists, {
      items: { sectionProfiles: [profile, added, { invalid: true }], doorDesigns: [DEFAULT_SETTINGS.doorDesigns[0]] },
      dependencies: { shapes: [{ ...shape, name: 'Do not replace' }], accessories: [accessory] },
    });
    expect(result).toMatchObject({ added: 1, replaced: 1, dependenciesAdded: 1, skipped: 3 });
    expect(result.lists.sectionProfiles).toEqual([profile, added]);
    expect(result.lists.shapes).toBe(lists.shapes);
    expect(result.lists.accessories).toEqual([accessory]);
    expect(lists.sectionProfiles).toEqual([existing]);
  });

  it('rejects a conflicting list atomically while accepting other kinds (LX1)', () => {
    const lists = { ...DEFAULT_SETTINGS, shapes: [shape] };
    const result = mergeLibrary(lists, {
      items: { shapes: [{ ...shape, id: 'duplicate-name' }, { invalid: true }], sectionProfiles: [profile] },
      dependencies: { shapes: [{ ...shape, id: 'third-shape', name: 'Third' }] },
    });
    expect(result).toMatchObject({ added: 1, replaced: 0, dependenciesAdded: 0, skipped: 3 });
    expect(result.lists.shapes).toBe(lists.shapes);
    expect(result.lists.sectionProfiles).toEqual([profile]);
  });

  it('applies accessory and slide defaults before single-item validation (LX1)', () => {
    const oldAccessory = { ...accessory };
    delete oldAccessory.depthAnchor;
    delete oldAccessory.size;
    const oldSlide = { ...DEFAULT_SETTINGS.slides[0], id: 'custom-slide', name: 'Custom slide' };
    delete oldSlide.backClearance;
    const result = mergeLibrary(DEFAULT_SETTINGS, { items: { accessories: [oldAccessory], slides: [oldSlide, null] } });
    expect(result).toMatchObject({ added: 2, replaced: 0, dependenciesAdded: 0, skipped: 1 });
    expect(result.lists.accessories[0]).toEqual(accessory);
    expect(result.lists.slides.at(-1)).toMatchObject({ id: 'custom-slide', backClearance: 0 });
  });
});
