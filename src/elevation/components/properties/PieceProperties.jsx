import PanelSection from '../panel/PanelSection.jsx';
import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import {
  boxInsets, endPieceBottom, endPieceNotes, findLeaf, frameRegions, partNumbers, resolveStyle, teeFillers, wallSideOf,
} from '../../model/index.js';
import { pickOptions } from '../../model/doorStyleEdits.js';
import { panelLevels } from '../../model/doorStyleResolve.js';
import { removeItem, setCellExtend, setItemWidth, setPartStyle } from '../../store/elevationSlice.js';
import { shippingDescription } from '../../../reports/shippingList.js';
import InchInput from '../InchInput.jsx';
import CabinetProperties from './CabinetProperties.jsx';
import CellProperties from './CellProperties.jsx';
import EndFields from './EndFields.jsx';
import ExtendFields from './ExtendFields.jsx';
import FrameSection from './FrameSection.jsx';
import Field from './Field.jsx';
import PartNumberField from './PartNumberField.jsx';
import PartReportFields from './PartReportFields.jsx';
import TeeProperties from './TeeProperties.jsx';
import TFillerSection from './TFillerSection.jsx';
import InsideEndsSection from './InsideEndsSection.jsx';
import StepEndsSection from './StepEndsSection.jsx';

function InsidePanelProperties({ room, wall, run, piece, cells, settings }) {
  const dispatch = useDispatch();
  const OwnerEndsSection = piece.step ? StepEndsSection : InsideEndsSection;
  const styleId = run.ends[piece.side].styleId ?? 'default';
  const picker = pickOptions(room, settings, 'panel', panelLevels(room, wall, run, null));
  return (
    <>
      <PanelSection id="piece.insidePanel" title="Inside end panel">
        <Field label="Style">
          <select
            aria-label="Inside end panel style"
            value={styleId}
            onChange={(event) => dispatch(setPartStyle({
              roomId: room.id, wallId: wall.id, runId: run.id,
              part: 'runEnd', side: piece.side, styleId: event.target.value,
            }))}
            className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            {picker.options.map((option) => <option key={option.id} value={option.id}>{option.text}</option>)}
            {!picker.options.some((option) => option.id === styleId)
              && <option value={styleId}>Missing ({styleId})</option>}
          </select>
        </Field>
        <p className="mt-1 text-xs text-gray-500">Uses the run’s {piece.side} end panel style.</p>
      </PanelSection>
      <OwnerEndsSection
        room={room} wall={wall} run={run} cells={cells} settings={settings}
        item={findLeaf(run.grid, piece.ownerId)} side={piece.side}
      />
    </>
  );
}

function InteriorFillerProperties({ wallId, run, piece, item, extendRuns }) {
  const dispatch = useDispatch();
  const actionBase = { wallId, runId: run.id, itemId: item.id };

  return (
    <div className="space-y-4">
      <PanelSection id="piece.filler" title="Interior filler">
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
      </PanelSection>
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

function EndProperties({ room, wall, wallId, run, side, settings, extendRuns }) {
  return (
    <PanelSection id="piece.end" title={`${side} end piece`}>
      <div className="rounded border border-gray-700 bg-gray-900/45 p-3">
        <EndFields
          actionBase={{ wallId, runId: run.id }}
          room={room}
          wall={wall}
          run={run}
          side={side}
          settings={settings}
          extendRuns={extendRuns}
        />
      </div>
    </PanelSection>
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
  const reportFields = partNumberField ? (
    <PartReportFields room={room} partKey={partKey} kind={piece.kind} settings={settings}
      autoName={shippingDescription(room, settings, {
        key: partKey, kind: piece.kind, wallId: wall.id, runId: run.id, side: wallSideOf(run),
      })} />
  ) : null;
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

  if (piece.inside) {
    return (
      <>
        {partNumberField}
        {reportFields}
        {notesLine}
        <InsidePanelProperties room={room} wall={wall} run={run} piece={piece} cells={cells} settings={settings} />
      </>
    );
  }
  if (tee && !side) {
    return (
      <TeeProperties
        room={room} tee={tee} notes={teeNotes} partNumberField={partNumberField} settings={settings}
      />
    );
  }
  if (side) {
    return (
      <>
        {partNumberField}
        {reportFields}
        {notesLine}
        <EndProperties
          room={room}
          wall={wall}
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
        {reportFields}
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
        {reportFields}
        <CellProperties
          room={room}
          wall={wall}
          run={run}
          piece={piece}
          item={item}
          layout={layout}
          cells={cells}
          settings={settings}
          numbers={numbers}
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
      {reportFields}
      <CabinetProperties
        room={room}
        wall={wall}
        run={run}
        piece={piece}
        item={item}
        layout={layout}
        cells={cells}
        settings={settings}
        numbers={numbers}
        inset={insets.get(piece.id)}
      />
      {tSection}
      {frameSection}
    </>
  );
}
