import {
  Fragment,
  useEffect,
  useState,
} from 'react';
import { useDispatch } from 'react-redux';
import {
  frontDepth,
  isJointAnchor,
  positionReadouts,
  startFromReadout,
  stretchedStart,
} from '../../model/index.js';
import { formatRunOverhang } from '../../properties/helpers.js';
import { resizeRun } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field, { ReadOnlyValue } from './Field.jsx';
import StretchInput from './StretchInput.jsx';

export default function RunGeometrySection({
  wall,
  run,
  settings,
  actionBase,
  validateAndDispatch,
}) {
  const dispatch = useDispatch();
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

  return (
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Geometry
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="col-span-2">
            {bothAnchored ? (
              <Field label="Width">
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
          </div>
          <Field label="Depth">
            <InchInput
              value={run.depth}
              onCommit={(value) => validateAndDispatch({ depth: value })}
              aria-label="Run depth"
            />
          </Field>
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
        <div className="mt-2.5">
          <Field label="Front depth">
            <ReadOnlyValue
              value={frontDepth(run, settings)}
              ariaLabel="Installed front depth"
            />
          </Field>
        </div>
        {overhang && (
          <p className="mt-2 text-xs font-medium text-amber-300">{overhang}</p>
        )}
      </section>
  );
}
