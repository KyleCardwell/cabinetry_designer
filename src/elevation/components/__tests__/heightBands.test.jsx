import { describe, expect, it } from 'vitest';
import HeightBands from '../HeightBands.jsx';
import { bandFieldsFor, MOLDING_NOTES } from '../../model/heightBands.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';

const nodes = (tree) => Array.isArray(tree) ? tree.flatMap(nodes)
  : tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
const text = (tree) => Array.isArray(tree) ? tree.map(text).join('')
  : tree && typeof tree === 'object' ? text(tree.props?.children) : tree ?? '';
const keys = (bands) => bands.flatMap(({ rows }) => rows.flat().map(({ key }) => key));

describe('UI1 shared height bands', () => {
  it('shares shop/room rows, filters by level and cabinet type, and omits empty bands', () => {
    for (const furnitureBase of [false, true]) {
      expect(bandFieldsFor('shop', { furnitureBase })).toEqual(bandFieldsFor('room', { furnitureBase }));
    }
    const wall = bandFieldsFor('wall', { furnitureBase: true });
    expect(wall.map(({ id }) => id)).toEqual(['crown', 'countertop', 'base']);
    expect(wall.flatMap(({ rows }) => rows.flat()).some(({ type }) => type === 'setting')).toBe(false);
    expect(keys(bandFieldsFor('run', { cabinetTypeId: CABINET_TYPE_IDS.UPPER, furnitureBase: true })))
      .toEqual(['boxTop', 'upperClearance']);
    expect(keys(bandFieldsFor('run', { cabinetTypeId: CABINET_TYPE_IDS.BASE, furnitureBase: true })))
      .toEqual(['countertopThickness', 'baseKind', 'toeKickHeight', 'baseBoxHeight', 'furnitureBaseProfileId', 'furnitureBaseProud']);
    expect(keys(bandFieldsFor('run', { cabinetTypeId: CABINET_TYPE_IDS.TALL })))
      .toEqual(['boxTop', 'baseKind', 'toeKickHeight']);
    const tree = HeightBands({ level: 'room', fields: bandFieldsFor('room'), renderField: () => null });
    expect(nodes(tree).filter(({ type }) => type === 'h3')).toEqual([]);
  });

  it('places warnings under the band of each molding slot and keeps gap text with the crown overlap', () => {
    const warnings = [
      { code: 'molding-profile-missing', slot: 'crown' },
      { code: 'molding-profile-open', slot: 'top_mold' },
      { code: 'top-mold-too-short' }, { code: 'crown-gap' },
      { code: 'molding-profile-missing', slot: 'nosing' },
      { code: 'molding-profile-missing', slot: 'furniture_base' },
      { code: 'molding-profile-open', slot: 'base_cutout' },
      { code: 'furniture-base-too-short' },
    ];
    for (const level of ['shop', 'room']) {
      const tree = HeightBands({ level, fields: bandFieldsFor(level, { furnitureBase: true }),
        renderField: ({ label }) => <span>{label}</span>, warnings, overlap: -0.5 });
      const notes = (id) => nodes(nodes(tree).find(({ props }) => props['data-height-band'] === id))
        .filter(({ type, props }) => type === 'p' && props.className.includes('text-amber-400')).map(text);
      expect(notes('crown')).toEqual([MOLDING_NOTES['molding-profile-missing'], MOLDING_NOTES['molding-profile-open'],
        MOLDING_NOTES['top-mold-too-short'], 'The top mold doesn\'t reach the crown (gap of 1/2").']);
      expect(notes('countertop')).toEqual([MOLDING_NOTES['molding-profile-missing']]);
      expect(notes('base')).toEqual([MOLDING_NOTES['molding-profile-missing'], MOLDING_NOTES['molding-profile-open'],
        MOLDING_NOTES['furniture-base-too-short']]);
      expect(notes('wall')).toEqual([]);
      expect(notes('uppers')).toEqual([]);
      expect(text(tree)).toContain('Gap 1/2"');
    }
  });
});
