import PanelSection from '../panel/PanelSection.jsx';
import {
  Fragment,
  useEffect,
  useState,
} from 'react';
import { useDispatch } from 'react-redux';
import {
  formatInchesInput,
  frontDepth,
  isJointAnchor,
  positionReadouts,
  recessesOn,
  startFromReadout,
  stretchedStart,
} from '../../model/index.js';
import { formatRunOverhang } from '../../properties/helpers.js';
import { isPanelOnlyRun } from '../../model/wallEndPanels.js';
import {
  resizeRun, setRunHoldWidth, setRunRecess, startCenterPick,
} from '../../store/elevationSlice.js';
import { centerPickRefusal } from '../canvas/useCenterPick.js';
import InchInput from '../InchInput.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import StretchInput from './StretchInput.jsx';

export default function RunGeometrySection({
  room = null,
  canCenter = false,
  showMessage = () => {},
  wall,
  run,
  settings,
  actionBase,
  validateAndDispatch,
}) {
  const dispatch = useDispatch();
  const panelOnly = isPanelOnlyRun(run);
  const overhang = formatRunOverhang(run, wall.length);
  const leftGrowLocked = run.anchors.left && !isJointAnchor(run.anchors.left);
  const rightGrowLocked = run.anchors.right && !isJointAnchor(run.anchors.right);
  const bothAnchored = leftGrowLocked && rightGrowLocked;
  // A non-joint anchored end can't move, so stretch away from it.
  const preferredRunGrow = leftGrowLocked ? 'right' : rightGrowLocked ? 'left' : 'right';
  const runGrowLocked = [
    ...(leftGrowLocked ? ['left', 'both'] : []),
    ...(rightGrowLocked ? ['right', 'both'] : []),
  ];
  const [runGrow, setRunGrow] = useState(preferredRunGrow);
  useEffect(() => {
    setRunGrow(preferredRunGrow);
  }, [preferredRunGrow, run.id]);
  const runPositions = positionReadouts(run.x, run.width, wall.length);
  const plannedWidth = run.width - (run.flex?.left ?? 0) - (run.flex?.right ?? 0);
  const showPlannedWidth = settings.runFlex !== 0 && !run.holdWidth && run.flex
    && Math.abs(run.width - plannedWidth) > 1e-6;

  return (
      <PanelSection id="run.geometry" title="Geometry">
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            {bothAnchored ? (
              <Field label="Width" tag="auto">
                <ReadOnlyValue value={run.width} ariaLabel="Resolved run width" />
              </Field>
            ) : (
              <StretchInput
                label="Width"
                value={run.width}
                grow={runGrow}
                onGrowChange={setRunGrow}
                locked={runGrowLocked}
                onCommit={(width) => {
                  if (isJointAnchor(run.anchors.left) || isJointAnchor(run.anchors.right)) {
                    dispatch(resizeRun({ ...actionBase, width, grow: runGrow }));
                    setRunGrow(preferredRunGrow);
                    return true;
                  }
                  const accepted = validateAndDispatch({
                    width,
                    x: stretchedStart(run.x, run.width, width, runGrow),
                  });
                  if (accepted) setRunGrow(preferredRunGrow);
                  return accepted;
                }}
                ariaLabel="Run width"
              />
            )}
            {showPlannedWidth && (
              <p className="mt-1 text-xs text-gray-500">
                {`Planned ${formatInchesInput(plannedWidth)} → ${formatInchesInput(run.width)}`}
              </p>
            )}
          </div>
          <div className="col-span-2">
            <Field label={(
              <span className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={run.holdWidth === true}
                  onChange={(event) => dispatch(setRunHoldWidth({
                    ...actionBase,
                    hold: event.target.checked,
                  }))}
                  aria-label="Hold run width"
                />
                Hold run width
              </span>
            )}>
              <span className="text-gray-500">
                Keep this run exactly as drawn; the boxes take any change.
              </span>
            </Field>
          </div>
          <Field label="Depth" tag={panelOnly ? 'auto' : undefined}>
            {panelOnly ? (
              <>
                <ReadOnlyValue value={run.depth} ariaLabel="Run depth" />
                <p className="mt-1 text-xs text-gray-500">Follows its panels</p>
              </>
            ) : (
              <InchInput
                value={run.depth}
                onCommit={(value) => validateAndDispatch({ depth: value })}
                aria-label="Run depth"
              />
            )}
          </Field>
          <Field label="Outset">
            <InchInput
              value={run.outset ?? 0}
              onCommit={(value) => {
                if (value === null || value < 0) return false;
                return validateAndDispatch({ outset: value });
              }}
              aria-label="Run outset"
            />
          </Field>
          {(recessesOn(wall).length > 0 || run.recessId) && (
            <div className="col-span-2">
              <Field label="Sits on">
                <select
                  value={run.recessId ?? ''}
                  onChange={(event) => dispatch(setRunRecess({
                    ...actionBase,
                    recessId: event.target.value || null,
                  }))}
                  aria-label="Run plane"
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">Wall face</option>
                  {recessesOn(wall).map((recess) => (
                    <option key={recess.id} value={recess.id}>
                      {`${recess.label} ${recess.kind === 'projection' ? 'face' : 'back'}`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-[auto_1fr_1fr] items-end gap-2">
          <span />
          <span className="text-center text-xs text-gray-500">Edge</span>
          <span className="text-center text-xs text-gray-500">Center</span>
          {['left', 'right'].map((side) => (
            <Fragment key={side}>
              <span className="text-xs capitalize text-gray-400">{side} end</span>
              {['edge', 'center'].map((anchor) => {
                const readOnly = run.anchors[side];
                const className = anchor === 'center' ? 'opacity-60' : '';
                const ariaLabel = `Run ${side} ${anchor} position`;
                return (
                  <div key={anchor} className={className}>
                    {readOnly ? (
                      <ReadOnlyValue
                        value={runPositions[side][anchor]}
                        ariaLabel={ariaLabel}
                        tag="auto"
                      />
                    ) : (
                      <InchInput
                        value={runPositions[side][anchor]}
                        onCommit={(value) => validateAndDispatch({
                          x: startFromReadout(
                            side,
                            anchor,
                            value,
                            run.width,
                            wall.length,
                          ),
                        })}
                        aria-label={ariaLabel}
                      />
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        {canCenter && room && (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => {
                const refusal = centerPickRefusal(room, wall.id, run, settings);
                if (refusal) showMessage(refusal);
                else dispatch(startCenterPick({ wallId: wall.id, runId: run.id }));
              }}
              aria-label="Center run over a cell"
              className="rounded border border-gray-600 bg-gray-800 px-2.5 py-1 text-xs text-gray-200 hover:border-blue-500 hover:text-white"
            >
              Center over…
            </button>
          </div>
        )}
        <div className="mt-2.5">
          <Field label="Front depth" tag="auto">
            <ReadOnlyValue
              value={frontDepth(run, settings)}
              ariaLabel="Installed front depth"
            />
          </Field>
        </div>
        {overhang && (
          <p className="mt-2 text-xs font-medium text-amber-300">{overhang}</p>
        )}
      </PanelSection>
  );
}
