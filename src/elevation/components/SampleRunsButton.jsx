import { useDispatch, useSelector } from 'react-redux';
import { createRun } from '../model/runDefaults.js';
import { addRun } from '../store/elevationSlice.js';

export default function SampleRunsButton() {
  const dispatch = useDispatch();
  const { activeWallId, settings, walls } = useSelector((state) => state.elevation);
  const wall = walls.find((candidate) => candidate.id === activeWallId);

  if (!import.meta.env.DEV) return null;

  const addSamples = () => {
    if (!wall) return;
    const samples = [
      createRun({ x: 0, width: 120, bottomZ: 2, topZ: 30 }, settings),
      createRun({ x: 0, width: 96, bottomZ: 50, topZ: 80 }, settings),
    ];

    // SPEC-QUESTION: The sample tall-run width is not specified; use a 24-inch run.
    const tallWidth = 24;
    if (wall.length - 120 >= tallWidth) {
      samples.push(createRun({
        x: wall.length - tallWidth,
        width: tallWidth,
        bottomZ: 1,
        topZ: 90,
      }, settings));
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
