import { describe, expect, it } from 'vitest';
import HeightBands from '../HeightBands.jsx';
import { bandFieldsFor } from '../../model/heightBands.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';

const ids = (tree) => tree.props.children.filter(Boolean).map((band) => band.props.id);

describe('HeightBands extras', () => {
  it('keeps a band with an extra control when all its fields are hidden (manual run heights)', () => {
    const fields = bandFieldsFor('run', { cabinetTypeId: CABINET_TYPE_IDS.BASE });
    const tree = HeightBands({ level: 'run', fields, renderField: () => null, extras: { countertop: <span>Top</span> } });
    expect(ids(tree)).toEqual(['band.countertop']);
  });
});
