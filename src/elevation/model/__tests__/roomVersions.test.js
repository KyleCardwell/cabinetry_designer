import { describe, expect, it } from 'vitest';
import { drawingRevision } from '../roomVersions.js';

describe('DB8b drawing revision', () => {
  it('labels an issued version from its issued metadata', () => {
    expect(drawingRevision('version', {
      issued: { label: 'KC 10/15/26', seq: 2 },
      lastVersion: { label: 'Later', seq: 3 },
    })).toBe('KC 10/15/26 (v2)');
  });

  it('marks cloud drawings as drafts with the last issued version when present', () => {
    expect(drawingRevision('cloud', { lastVersion: { label: 'KC 10/15/26', seq: 2 } }))
      .toBe('DRAFT · last issued KC 10/15/26 (v2)');
    expect(drawingRevision('cloud', { lastVersion: null })).toBe('DRAFT');
  });

  it('omits revisions for local drawings or missing room information', () => {
    expect(drawingRevision('local', { lastVersion: { label: 'KC 10/15/26', seq: 2 } })).toBeNull();
    expect(drawingRevision('cloud')).toBeNull();
    expect(drawingRevision('version', null)).toBeNull();
    expect(drawingRevision('version', {})).toBeNull();
  });
});
