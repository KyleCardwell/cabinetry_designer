import { useMemo } from 'react';
import { runItems } from '../../model/grid.js';
import { partNumbers } from '../../model/partNumbers.js';
import { resolveProfile } from '../../model/profile.js';
import { runScene } from '../../model/runScene.js';
import { resolveTopSegments } from '../../model/topSegments.js';
import { isCountertop, runTop } from '../../model/tops.js';
import PanelSection from '../panel/PanelSection.jsx';
import AddTopSegmentButton, { coveringTopSegments } from './AddTopSegmentButton.jsx';
import TopSegmentRow from './TopSegmentRow.jsx';

export default function RunTopSegmentsSection({ room, wall, run, settings, piece, numbers: suppliedNumbers }) {
  const numbers = useMemo(() => suppliedNumbers ?? partNumbers(room, settings), [suppliedNumbers, room, settings]);
  const segments = run.topSegments ?? [];
  const items = runItems(run);
  const top = runTop(wall, run, resolveProfile(settings, room, wall));
  if (!segments.length && !isCountertop(top.kind)) return null;
  if (piece && (piece.kind !== 'cabinet' || !items.some(({ id }) => id === piece.id))) return null;
  const displayed = piece ? coveringTopSegments(run, piece) : segments;
  if (piece && !displayed.length) {
    if (!isCountertop(top.kind)) return null;
    return (
      <PanelSection id="piece.topSegments" title="Top segments">
        <AddTopSegmentButton room={room} wall={wall} run={run} piece={piece} settings={settings} />
      </PanelSection>
    );
  }
  const scene = runScene(room, wall, run, settings);
  const columns = items.map((item) => scene.result.pieces.find(({ id }) => id === item.id) ?? item);
  const { warnings } = resolveTopSegments(run, top.kind);

  return (
    <PanelSection id={piece ? 'piece.topSegments' : 'run.topSegments'} title="Top segments">
      {!segments.length && <p className="text-xs text-gray-500">Select a root cabinet column to add a top segment.</p>}
      <div className="space-y-3">
        {displayed.map((segment) => (
          <TopSegmentRow
            key={segment.id}
            wall={wall}
            run={run}
            segment={segment}
            index={segments.indexOf(segment)}
            columns={columns}
            numbers={numbers}
            warnings={warnings}
          />
        ))}
      </div>
    </PanelSection>
  );
}
