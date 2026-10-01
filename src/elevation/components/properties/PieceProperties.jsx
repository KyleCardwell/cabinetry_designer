import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  boxInsets, endPieceBottom, endPieceNotes, frameRegions, partNumbers, resolveStyle, teeFillers, wallSideOf,
} from '../../model/index.js';
import { removeItem, setCellExtend, setItemWidth } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CabinetProperties from './CabinetProperties.jsx';
import CellProperties from './CellProperties.jsx';
import EndFields from './EndFields.jsx';
import ExtendFields from './ExtendFields.jsx';
import FrameSection from './FrameSection.jsx';
import Field from './Field.jsx';
import PartNumberField from './PartNumberField.jsx';
import TeeProperties from './TeeProperties.jsx';
import TFillerSection from './TFillerSection.jsx';

function InteriorFillerProperties({ wallId, run, piece, item, extendRuns }) {
  const dispatch = useDispatch();
  const actionBase = { wallId, runId: run.id, itemId: item.id };

  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Interior filler
        </h3>
        <Field label="Width">
          <InchInput
            value={piece.width}
            onCommit={(width) => dispatch(setItemWidth({ ...actionBase, width }))}
            aria-label="Interior filler width"
          />
        </Field>
        <ExtendFields
          directions={['up', 'down']}
          extend={item.extend}
          runs={extendRuns}
          label="Interior filler"
          onChange={(direction, target) => dispatch(setCellExtend({
            wallId, runId: run.id, cellId: item.id, direction, target,
          }))}
        />
      </section>
      <button
        type="button"
        onClick={() => dispatch(removeItem(actionBase))}
        className="w-full rounded bg-red-900/70 px-3 py-2 text-sm text-red-100 hover:bg-red-800"
      >
        Remove
      </button>
    </div>
  );
}

function EndProperties({ wallId, run, side, settings, extendRuns }) {
  return (
    <section>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
        {side} end piece
      </h3>
      <div className="rounded border border-gray-700 bg-gray-900/45 p-3">
        <EndFields
          actionBase={{ wallId, runId: run.id }}
          run={run}
          side={side}
          settings={settings}
          extendRuns={extendRuns}
        />
      </div>
    </section>
  );
}

export default function PieceProperties({
  room, wall, run, layout, cells, selectionContext, settings,
}) {
  const {
    piece, item, side, tee,
  } = selectionContext;
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const frames = useMemo(() => frameRegions(room, run, layout, settings), [room, run, layout, settings]);
  const insets = useMemo(() => boxInsets(frames, layout, settings), [frames, layout, settings]);
  const region = frames.regions.find((candidate) => candidate.cabinetIds.includes(piece.id)) ?? null;
  const frameSection = region ? (
    <FrameSection
      room={room}
      wall={wall}
      run={run}
      layout={layout}
      region={region}
      numbers={numbers}
      settings={settings}
    />
  ) : null;
  const partKey = piece.id;
  const partNumberField = piece.kind === 'void' || piece.kind === 'shelves' ? null : (
    <PartNumberField
      roomId={room.id}
      partKey={partKey}
      autoNumber={numbers.byKey.get(partKey)}
      override={room.partNumberOverrides?.[partKey]}
      duplicate={numbers.warnings.some((warning) => warning.keys.includes(partKey))}
    />
  );
  const teeNotes = tee ? teeFillers(room, run, cells, settings).notes.get(tee.id) ?? [] : [];
  const tSection = (
    <TFillerSection room={room} wall={wall} run={run} cells={cells} settings={settings} piece={piece} />
  );
  const endNotes = (piece.kind === 'filler' || piece.kind === 'end_panel')
    && !piece.extend?.down
    ? endPieceNotes(piece.kind, endPieceBottom(run, resolveStyle(settings, room, run), settings))
    : [];
  const shapeNotes = side
    ? (teeFillers(room, run, cells, settings).notes.get(piece.id) ?? [])
      .filter((note) => note === 'T-shape' || note === 'L-shape')
    : [];
  const notes = [...shapeNotes, ...endNotes];
  const notesLine = notes.length > 0 ? (
    <p className="text-xs text-cyan-300">{notes.join(' · ')}</p>
  ) : null;
  const extendRuns = wall.runs.filter((other) => other.id !== run.id && wallSideOf(other) === wallSideOf(run));

  if (tee && !side) {
    return <TeeProperties tee={tee} notes={teeNotes} partNumberField={partNumberField} settings={settings} />;
  }
  if (side) {
    return (
      <>
        {partNumberField}
        {notesLine}
        <EndProperties
          wallId={wall.id}
          run={run}
          side={side}
          settings={settings}
          extendRuns={extendRuns}
        />
      </>
    );
  }
  if (!item) return null;
  if (item.kind === 'filler') {
    return (
      <>
        {partNumberField}
        {notesLine}
        <InteriorFillerProperties
          wallId={wall.id}
          run={run}
          piece={piece}
          item={item}
          extendRuns={extendRuns}
        />
      </>
    );
  }
  if (piece.columnId || item.kind !== 'cabinet') {
    return (
      <>
        {partNumberField}
        <CellProperties
          wall={wall}
          run={run}
          piece={piece}
          item={item}
          layout={layout}
          cells={cells}
          settings={settings}
          insets={insets}
        />
        {tSection}
        {frameSection}
      </>
    );
  }
  return (
    <>
      {partNumberField}
      <CabinetProperties
        wall={wall}
        run={run}
        piece={piece}
        item={item}
        layout={layout}
        cells={cells}
        settings={settings}
        inset={insets.get(piece.id)}
      />
      {tSection}
      {frameSection}
    </>
  );
}
