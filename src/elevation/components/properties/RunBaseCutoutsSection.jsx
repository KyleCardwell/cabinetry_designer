import { useMemo } from 'react';
import { runBase, runBaseProfile } from '../../model/furnitureBase.js';
import { partNumbers } from '../../model/partNumbers.js';
import { runScene } from '../../model/runScene.js';
import AddBaseCutoutButton, { coveringBaseCutouts } from './AddBaseCutoutButton.jsx';
import BaseCutoutRow from './BaseCutoutRow.jsx';

export default function RunBaseCutoutsSection({ room, wall, run, settings, piece, numbers: suppliedNumbers }) {
  const numbers = useMemo(() => suppliedNumbers ?? partNumbers(room, settings), [suppliedNumbers, room, settings]);
  const cutouts = run.baseCutouts ?? [];
  if (!cutouts.length && runBaseProfile(room, wall, run, settings).kind !== 'furniture_base') return null;
  if (piece && (piece.kind !== 'cabinet' || Math.abs(piece.z - run.z) > 1e-6)) return null;
  const scene = runScene(room, wall, run, settings);
  const cabinets = scene.cells.pieces.filter((candidate) => candidate.kind === 'cabinet'
    && Math.abs(candidate.z - run.z) <= 1e-6).sort((a, b) => a.x - b.x);
  const displayed = piece ? coveringBaseCutouts(run, piece, settings, cabinets) : cutouts;
  if (piece && !displayed.length) {
    return <AddBaseCutoutButton room={room} wall={wall} run={run} piece={piece} settings={settings} cabinets={cabinets} />;
  }
  const base = runBase(room, wall, run, settings, scene);

  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">{piece ? 'Base cutout' : 'Base cutouts'}</h3>
      {!cutouts.length && <p className="text-xs text-gray-500">Select a bottom-row cabinet to add a base cutout.</p>}
      <div className="space-y-3">
        {displayed.map((cutout) => (
          <BaseCutoutRow
            key={cutout.id}
            wall={wall}
            run={run}
            cutout={cutout}
            index={cutouts.indexOf(cutout)}
            cabinets={cabinets}
            settings={settings}
            numbers={numbers}
            warnings={base.warnings}
          />
        ))}
      </div>
    </section>
  );
}
