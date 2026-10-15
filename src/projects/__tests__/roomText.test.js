import { describe, expect, it } from 'vitest';
import { editorsText, missingDesignName, openRoomChips, readOnlyText, statusBlockText } from '../roomText.js';

describe('DB6b c room text', () => {
  it('joins zero, one, two and three editor names (anchor 1)', () => {
    expect(editorsText([])).toBe('Someone else');
    expect(editorsText([{ userName: 'Jane' }])).toBe('Jane');
    expect(editorsText([{ userName: 'Jane' }, { userName: 'Bob' }])).toBe('Jane and Bob');
    expect(editorsText([{ userName: 'Jane' }, { userName: 'Bob' }, { userName: 'Ann' }])).toBe('Jane, Bob and Ann');
  });

  it('deduplicates names and supplies missing names (anchor 2)', () => {
    expect(editorsText([{ userName: 'Jane' }, { userName: 'Jane' }, { userName: null }])).toBe('Jane and Someone');
    expect(editorsText([{}, { userName: '' }])).toBe('Someone');
  });

  it('uses plural grammar for distinct editors (anchor 3)', () => {
    expect(readOnlyText('others', [{ userName: 'Jane' }, { userName: 'Bob' }])).toBe("Jane and Bob have this room open. You're viewing only.");
    expect(readOnlyText('others', [{ userName: 'Jane' }, { userName: 'Jane' }])).toBe("Jane has this room open. You're viewing only.");
  });

  it('explains each read-only reason and ignores unknown reasons (anchor 4)', () => {
    expect(readOnlyText('permission', [])).toBe("View only: you don't have permission to edit designs.");
    expect(readOnlyText(null, [])).toBeNull();
    expect(readOnlyText('unknown', [])).toBeNull();
    expect(readOnlyText('archived')).toBe('This room is archived. Restore it on the project page to edit it.');
    expect(readOnlyText('version')).toBe("This is an issued version. It can't be edited.");
  });

  it('names the released status and author (anchor 5)', () => {
    expect(statusBlockText({ status: 'released', byName: 'Kyle' })).toBe('This room is Released to shop (by Kyle). Saving your changes will move it back to Drafting.');
  });

  it('omits the author when absent (anchor 6)', () => {
    expect(statusBlockText({ status: 'approved', byName: null })).toBe('This room is Approved. Saving your changes will move it back to Drafting.');
  });

  it('groups editors before viewers and omits empty groups (anchor 7)', () => {
    expect(openRoomChips([{ userName: 'Jane', readOnly: false }, { userName: 'Bob', readOnly: true }, { userName: 'Ann', readOnly: false }])).toEqual([
      { label: 'Open · Jane and Ann', editing: true }, { label: 'Viewing · Bob', editing: false },
    ]);
    expect(openRoomChips([])).toEqual([]);
    expect(openRoomChips([{ userName: 'Bob', readOnly: true }])).toEqual([{ label: 'Viewing · Bob', editing: false }]);
  });

  it('describes UUID designs as archived and keeps legacy IDs (anchor 8)', () => {
    expect(missingDesignName('0192a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b')).toBe('An archived door design');
    expect(missingDesignName('old')).toBe('Door design `old`');
    expect(missingDesignName('0192A3B4-5C6D-7E8F-9A0B-1C2D3E4F5A6B')).toBe('An archived door design');
  });
});
