import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../constants.js';
import { effectiveSettings } from '../effectiveSettings.js';
import { partNumbers } from '../partNumbers.js';
import { syncRoom } from '../room.js';

describe('face frame numbering', () => {
  it.each([
    ['all runs', false, [
      'def96f42-4938-4201-8bb0-2b15e034abcc',
      'frame:def96f42-4938-4201-8bb0-2b15e034abcc',
      '4254454f-e4a3-47e8-8ef4-ac465099a094:right',
      '5a5fb61b-8fef-4756-8272-830d61b6439d',
      'frame:5a5fb61b-8fef-4756-8272-830d61b6439d',
      'c16de5d5-e162-46ce-973d-e1d705fe71c3',
      '0ae7b290-8bf2-45c5-ae30-a477b318e35f',
      'frame:c16de5d5-e162-46ce-973d-e1d705fe71c3',
      '91b7e4ee-77f6-4244-8103-ce7eac75f8f0',
      'frame:91b7e4ee-77f6-4244-8103-ce7eac75f8f0',
      '7881344d-63bd-4029-ad44-a71a9d72578a',
      'frame:7881344d-63bd-4029-ad44-a71a9d72578a',
      'b0505231-35e6-4630-8a1e-e9b2181d443c',
      'b0505231-35e6-4630-8a1e-e9b2181d443c:frame',
      'a72f41f6-a4ab-4c0e-a91f-8b9d98590429',
      'a72f41f6-a4ab-4c0e-a91f-8b9d98590429:frame',
      '9cac2af0-d263-418c-af07-bffe64548bd6',
      'de8680d7-d74c-4c0c-bbfa-aed5a21bbc3a',
      'e840f92e-041d-49fe-b378-f3809f3b7a43',
      '24bd1619-02e7-4f10-8723-e3f078669ec0',
      'frame:24bd1619-02e7-4f10-8723-e3f078669ec0',
      '30580003-5747-40b6-8495-50e172644bbb:right',
      '251df567-cf33-45f3-bf83-b8f66e2a8536',
      'frame:251df567-cf33-45f3-bf83-b8f66e2a8536',
      'fa801266-189a-4f40-a1fa-10cb1a24f6c5:right',
      'molding:toeKick',
    ]],
    ['empty return run', true, [
      'b0505231-35e6-4630-8a1e-e9b2181d443c',
      'b0505231-35e6-4630-8a1e-e9b2181d443c:return',
      'b0505231-35e6-4630-8a1e-e9b2181d443c:frame',
    ]],
  ])('numbers frames after their cabinet groups with %s (CC9.1)', (_, emptyReturn, expected) => {
    const source = JSON.parse(readFileSync(new URL('./fixtures/room8cc.json', import.meta.url), 'utf8'));
    source.style = { cabinetStyleId: 14 };
    const wall3 = source.walls.find(({ name }) => name === 'Wall 3');
    for (const run of wall3.runs) {
      for (const end of Object.values(run.ends ?? {})) {
        if (end?.type === 'corner') end.corner.kind = 90;
      }
    }
    if (emptyReturn) source.walls.find(({ name }) => name === 'Wall 4').runs = [];
    const settings = effectiveSettings({ settings: { ...DEFAULT_SETTINGS } }, source);
    const room = syncRoom(source, settings);
    const parts = partNumbers(room, settings).parts;
    expect(parts.map(({ number }) => number)).toEqual(parts.map((_, index) => index + 1));
    const keys = parts.map(({ key }) => key);
    if (emptyReturn) {
      const start = keys.indexOf(expected[0]);
      expect(start).toBeGreaterThanOrEqual(0);
      expect(keys.slice(start, start + expected.length)).toEqual(expected);
    } else {
      expect(keys).toEqual(expected);
    }
  });
});
