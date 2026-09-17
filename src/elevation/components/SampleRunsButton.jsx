import { useDispatch, useSelector } from 'react-redux';
import { createRun } from '../model/runDefaults.js';
import { addRun } from '../store/elevationSlice.js';
import { resolveWall } from '../model/room.js';

function withSampleAnchors(run, settings, anchors) {
  return {
    ...run,
    anchors,
    ends: Object.fromEntries(['left', 'right'].map((side) => [
      side,
      anchors[side]
        ? run.ends[side]
        : { type: settings.defaultEnds[side], width: null },
    ])),
  };
}

export default function SampleRunsButton() {
  const dispatch = useDispatch();
  const {
    activeRoomId,
    activeWallId,
    settings,
    rooms,
  } = useSelector((state) => state.elevation);
  const room = rooms.find((candidate) => candidate.id === activeRoomId);
  const storedWall = room?.walls.find((candidate) => candidate.id === activeWallId);
  const wall = resolveWall(room, storedWall);

  if (!import.meta.env.DEV) return null;

  const addSamples = () => {
    if (!wall) return;
    const tallWidth = 24;
    const samples = [
      withSampleAnchors(
        createRun(
          { x: 0, width: 120, bottomZ: 2, topZ: 30 },
          { settings, room, wall },
        ),
        settings,
        { left: true, right: false },
      ),
      withSampleAnchors(
        createRun(
          { x: 0, width: 96, bottomZ: 50, topZ: 80 },
          { settings, room, wall },
        ),
        settings,
        { left: true, right: false },
      ),
    ];

    if (wall.length - 120 >= tallWidth) {
      samples.push(withSampleAnchors(
        createRun({
          x: wall.length - tallWidth,
          width: tallWidth,
          bottomZ: 1,
          topZ: 90,
        }, { settings, room, wall }),
        settings,
        { left: false, right: true },
      ));
    }

    for (const run of samples) dispatch(addRun({ wallId: wall.id, run }));
  };

  return (
    <button
      type="button"
      onClick={addSamples}
      disabled={!wall}
      className="w-full rounded border border-dashed border-cyan-700/70 bg-cyan-950/30 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-900/40 disabled:cursor-not-allowed disabled:opacity-40"
    >
      Add sample runs
    </button>
  );
}
