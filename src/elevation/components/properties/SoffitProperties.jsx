import { useDispatch } from 'react-redux';
import { SOFFIT_MOLDINGS, landingsOn } from '../../model/index.js';
import { wallLabel } from '../../model/topology.js';
import { deleteSoffit, setSoffitAnchor, updateSoffit } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';

export default function SoffitProperties({ room, wall, soffit, settings }) {
  const dispatch = useDispatch();
  const actionBase = { wallId: wall.id, soffitId: soffit.id };
  const moldingLabels = {
    crown: 'Crown',
    topMold: 'Top mold',
    none: 'None',
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Soffit
        </h3>
        <div className="space-y-2.5">
          <Field label="Left">
            {!soffit.anchors?.left && !soffit.anchors?.right ? (
              <InchInput
                value={soffit.x}
                onCommit={(x) => dispatch(updateSoffit({
                  ...actionBase,
                  changes: { x },
                }))}
                aria-label="Soffit left"
              />
            ) : (
              <ReadOnlyValue value={soffit.x} ariaLabel="Soffit left" />
            )}
          </Field>
          <Field label="Width">
            {soffit.anchors?.left && soffit.anchors?.right ? (
              <ReadOnlyValue value={soffit.width} ariaLabel="Soffit width" />
            ) : (
              <InchInput
                value={soffit.width}
                onCommit={(width) => dispatch(updateSoffit({
                  ...actionBase,
                  changes: { width },
                }))}
                aria-label="Soffit width"
              />
            )}
          </Field>
          <Field label="Bottom">
            <InchInput
              value={soffit.bottom}
              onCommit={(bottom) => dispatch(updateSoffit({
                ...actionBase,
                changes: { bottom },
              }))}
              aria-label="Soffit bottom"
            />
          </Field>
          <Field label="Depth">
            <InchInput
              value={soffit.depth ?? settings.defaultSoffitDepth}
              onCommit={(depth) => dispatch(updateSoffit({
                ...actionBase,
                changes: { depth },
              }))}
              aria-label="Soffit depth"
            />
          </Field>
          <Field label="Molding">
            <select
              value={soffit.molding}
              onChange={(event) => dispatch(updateSoffit({
                ...actionBase,
                changes: { molding: event.target.value },
              }))}
              aria-label="Soffit molding"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            >
              {SOFFIT_MOLDINGS.map((molding) => (
                <option key={molding} value={molding}>{moldingLabels[molding]}</option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Ends
        </h3>
        <div className="space-y-2">
          {['left', 'right'].map((side) => {
            const anchor = soffit.anchors?.[side] ?? false;
            const anchorValue = anchor?.to === 'end'
              ? 'end'
              : anchor?.to === 'wall'
                ? `wall:${anchor.wallId}`
                : 'free';
            return (
              <div
                key={side}
                className="rounded border border-gray-700 bg-gray-900/45 p-3"
              >
                <Field label={`${side === 'left' ? 'Left' : 'Right'} end`}>
                  <select
                    value={anchorValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      const nextAnchor = value === 'free'
                        ? false
                        : value === 'end'
                          ? { to: 'end', offset: 0 }
                          : {
                              to: 'wall',
                              wallId: value.slice('wall:'.length),
                              offset: 0,
                            };
                      dispatch(setSoffitAnchor({
                        ...actionBase,
                        side,
                        anchor: nextAnchor,
                      }));
                    }}
                    aria-label={`${side} soffit anchor`}
                    className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="free">Free</option>
                    <option value="end">Wall end</option>
                    {landingsOn(room, wall).map((interval) => {
                      const landedWall = room.walls.find(
                        (candidate) => candidate.id === interval.wallId,
                      );
                      return landedWall ? (
                        <option
                          key={`${interval.wallId}:${interval.endpoint}`}
                          value={`wall:${interval.wallId}`}
                        >
                          {wallLabel(room, landedWall)}
                        </option>
                      ) : null;
                    })}
                  </select>
                </Field>
                {anchor && (
                  <div className="mt-2">
                    <Field label="Offset">
                      <InchInput
                        value={anchor.offset}
                        allowBlank
                        placeholder="0"
                        onCommit={(offset) => dispatch(setSoffitAnchor({
                          ...actionBase,
                          side,
                          anchor: { ...anchor, offset },
                        }))}
                        aria-label={`${side} soffit anchor offset`}
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <button
        type="button"
        onClick={() => dispatch(deleteSoffit(actionBase))}
        className="w-full rounded border border-red-700 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
      >
        Delete soffit
      </button>
    </div>
  );
}

