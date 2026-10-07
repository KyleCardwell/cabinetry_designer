import { describe, expect, it } from 'vitest';
import { CABINET_TYPE_IDS, DEFAULT_SETTINGS } from '../../model/constants.js';
import { DEFAULT_DOOR_STYLE } from '../../model/doorStyles.js';
import { gridFromItems } from '../../model/grid.js';
import { isElevationDocument, toElevationDocument } from '../persistence.js';

const A = { ...DEFAULT_DOOR_STYLE, id: 'ds-a', label: 'A', name: 'Kitchen' };
const B = { ...DEFAULT_DOOR_STYLE, id: 'ds-b', label: 'B', thickness: 1 };

/** One wall with a wall end panel and a base run: end panel left, a cabinet, a back panel cell. */
function document({ room = {}, wall = {}, run = {}, cabinet = {}, panel = {}, leftEnd = {}, endPanel = {} } = {}) {
  const settings = structuredClone(DEFAULT_SETTINGS);
  return {
    schemaVersion: 4,
    settings,
    rooms: [{
      id: 'room-1',
      name: 'Room 1',
      profile: { ...settings.defaultProfile },
      wallOrder: ['wall-a'],
      walls: [{
        id: 'wall-a', name: '', numberOverride: null, elevationForced: false,
        x1: 0, y1: 0, x2: 240, y2: 0, height: 108, thickness: 4.5, flipped: false,
        connections: { start: null, end: null }, profile: {}, openings: [],
        endPanels: { start: { width: null, ...endPanel }, end: null },
        runs: [{
          id: 'a', cabinetTypeId: CABINET_TYPE_IDS.BASE, x: 60, width: 48, z: 4, height: 30.5, depth: 24,
          ends: { left: { type: 'end_panel', width: null, ...leftEnd }, right: { type: 'filler', width: null } },
          autoCount: false, maxCabinetWidth: null, heightMode: 'manual', overrides: {},
          anchors: { left: false, right: false },
          grid: gridFromItems('a', [
            { id: 'a-cab', kind: 'cabinet', width: null, ...cabinet },
            { id: 'a-pan', kind: 'panel', width: 0.75, depth: 0.75, align: 'back', ...panel },
          ]),
          ...run,
        }],
        ...wall,
      }],
      ...room,
    }],
    activeRoomId: 'room-1',
    activeWallId: 'wall-a',
    view: 'elevation',
  };
}

describe('SPEC-46 door styles in the saved document', () => {
  it('keeps the room\'s styles, the picks at every level and per-part sizes', () => {
    const saved = document({
      room: { doorStyles: [A, B], doorStyleId: 'ds-a', drawerFrontStyleId: null, panelStyleId: 'ds-b' },
      wall: { doorStyleId: 'ds-b' },
      run: { drawerFrontStyleId: 'ds-a' },
      cabinet: {
        doorStyleId: 'ds-b',
        face: {
          direction: 'vertical',
          size: null,
          children: [
            { type: 'drawer_front', size: 6, styleId: 'ds-a', sizes: { rails: { top: 2.625, bottom: 2.625 } } },
            { type: 'door', size: null, sizes: { midRails: [{ at: 12 }], notes: { top: 'match' } } },
          ],
        },
      },
      panel: { styleId: 'ds-b', sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' } } },
      leftEnd: { styleId: 'ds-a', sizes: { stiles: { left: 3.5 }, notes: { left: 'scribe' } } },
      endPanel: { styleId: 'ds-b', sizes: { rails: { bottom: 3.5 } } },
    });
    expect(isElevationDocument(saved)).toBe(true);
    expect(toElevationDocument(saved)).toEqual(saved);
  });

  it('rejects a style list with a bad or repeated style', () => {
    expect([
      document({ room: { doorStyles: [A, { ...B, id: 'ds-a' }] } }),
      document({ room: { doorStyles: [A, { ...B, label: 'A' }] } }),
      document({ room: { doorStyles: [{ ...A, thickness: 0 }] } }),
      document({ room: { doorStyles: [{ ...A, id: 'default' }] } }),
      document({ room: { doorStyles: { a: A } } }),
    ].map(isElevationDocument)).toEqual([false, false, false, false, false]);
  });

  it('rejects picks that aren\'t style ids, and bad part sizes', () => {
    expect([
      document({ room: { doorStyleId: 5 } }),
      document({ wall: { panelStyleId: '' } }),
      document({ run: { doorStyleId: 7 } }),
      document({ cabinet: { drawerFrontStyleId: {} } }),
      document({ leftEnd: { styleId: 7 } }),
      document({ endPanel: { sizes: {} } }),
      document({ panel: { styleId: 3 } }),
      document({ panel: { sizes: { rails: { top: -1 } } } }),
    ].map(isElevationDocument)).toEqual(Array(8).fill(false));
  });

  it('rejects a bad pick or sizes on a face, at any depth', () => {
    expect([
      document({ cabinet: { face: { type: 'door', size: null, styleId: 4 } } }),
      document({ cabinet: { face: { type: 'door', size: null, sizes: { color: 'red' } } } }),
      document({
        cabinet: {
          face: {
            direction: 'vertical',
            size: null,
            children: [{ type: 'drawer_front', size: 6, sizes: { rails: {} } }, { type: 'door', size: null }],
          },
        },
      }),
    ].map(isElevationDocument)).toEqual([false, false, false]);
  });

  it('still loads a pick of a style the room doesn\'t list (the resolver warns instead)', () => {
    expect(isElevationDocument(document({ run: { doorStyleId: 'gone' } }))).toBe(true);
  });
});
