import { describe, expect, it, vi } from 'vitest';
import { room, wall } from '../../../test/builders.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { syncRoom } from '../../model/room.js';
import usePlanWallEdits from '../usePlanWallEdits.js';

vi.mock('react', () => ({
  useCallback: (callback) => callback,
  useEffect: () => {},
}));

const subject = room({ walls: [
  wall({ id: 'host', x2: 100,
    connections: { start: null, end: { wallId: 'moved', endpoint: 'start' } } }),
  wall({ id: 'moved', x1: 100, y1: 0, x2: 100, y2: 100,
    connections: { start: { wallId: 'host', endpoint: 'end' }, end: null } }),
  wall({ id: 'landed', x1: 50, y1: -50, x2: 50, y2: -4.5,
    connections: { start: { wallId: 'other', endpoint: 'end' }, end: null },
    landings: { start: null,
      end: { wallId: 'host', side: 'back', ref: 'left', to: 'center', offset: 47.75 } } }),
  wall({ id: 'other', x1: 0, y1: -50, x2: 50, y2: -50,
    connections: { start: null, end: { wallId: 'landed', endpoint: 'start' } } }),
] });

describe('WL1 b: perpendicular move previews hold landed walls', () => {
  it('re-measures a held landing before preview sync so the wall stays square', () => {
    const setWallMovePreview = vi.fn();
    const edits = usePlanWallEdits({ room: subject, selectedWall: subject.walls[1],
      setWallMovePreview, settings: DEFAULT_SETTINGS });
    edits.previewPerpendicularMove(10);
    const preview = setWallMovePreview.mock.calls[0][0];
    expect(preview).toMatchObject({ delta: 10, affectedWallIds: ['moved', 'host'] });
    expect(preview.room.walls.find(({ id }) => id === 'host').x2).toBe(90);
    expect(preview.room.walls.find(({ id }) => id === 'landed').landings.end.offset).toBe(37.75);
    expect(syncRoom(preview.room, DEFAULT_SETTINGS).walls.find(({ id }) => id === 'landed'))
      .toMatchObject({ x1: 50, y1: -50, x2: 50, y2: -4.5 });
    expect(subject.walls[2].landings.end.offset).toBe(47.75);
  });

  it('refuses the preview when moving the corner would leave a held landing off its host', () => {
    const setWallMovePreview = vi.fn();
    const edits = usePlanWallEdits({ room: subject, selectedWall: subject.walls[1],
      setWallMovePreview, settings: DEFAULT_SETTINGS });
    edits.previewPerpendicularMove(70);
    expect(setWallMovePreview).toHaveBeenCalledTimes(1);
    expect(setWallMovePreview).toHaveBeenCalledWith({
      delta: 70, room: null, affectedWallIds: [],
    });
    expect(subject.walls[0].x2).toBe(100);
  });
});
