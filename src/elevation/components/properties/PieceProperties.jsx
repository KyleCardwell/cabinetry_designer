import { useMemo } from 'react';
import { useDispatch } from 'react-redux';
import { partNumbers } from '../../model/index.js';
import { removeItem, setItemWidth } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import CabinetProperties from './CabinetProperties.jsx';
import EndFields from './EndFields.jsx';
import Field from './Field.jsx';
import PartNumberField from './PartNumberField.jsx';

function InteriorFillerProperties({ wallId, run, piece, item }) {
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

function EndProperties({ wallId, run, side, settings }) {
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
        />
      </div>
    </section>
  );
}

export default function PieceProperties({ room, wall, run, layout, selectionContext, settings }) {
  const { piece, item, side } = selectionContext;
  const numbers = useMemo(() => partNumbers(room, settings), [room, settings]);
  const partKey = piece.id;
  const partNumberField = (
    <PartNumberField
      roomId={room.id}
      partKey={partKey}
      autoNumber={numbers.byKey.get(partKey)}
      override={room.partNumberOverrides?.[partKey]}
      duplicate={numbers.warnings.some((warning) => warning.keys.includes(partKey))}
    />
  );

  if (side) {
    return (
      <>
        {partNumberField}
        <EndProperties wallId={wall.id} run={run} side={side} settings={settings} />
      </>
    );
  }
  if (!item) return null;
  if (item.kind === 'filler') {
    return (
      <>
        {partNumberField}
        <InteriorFillerProperties
          wallId={wall.id}
          run={run}
          piece={piece}
          item={item}
        />
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
        settings={settings}
      />
    </>
  );
}

