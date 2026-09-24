import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  crownOverlap,
  formatInches,
  formatInchesInput,
  landingRefCreatesCycle,
  landingsOn,
  wallFrame,
  wallNumbers,
  wallNumberWarnings,
} from '../../model/index.js';
import { wallHasCabinets, wallLabel } from '../../model/topology.js';
import { resolveWall } from '../../model/room.js';
import {
  detachWallLanding,
  flipWall,
  setWallEndPanel,
  setWallLanding,
  setWallLength,
  updateWall,
} from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import Field from './Field.jsx';
import StretchInput from './StretchInput.jsx';

const WALL_OVERRIDE_FIELDS = [
  ['crownTop', 'Top of crown'],
  ['toeKickHeight', 'Toe kick height'],
  ['countertopThickness', 'Countertop thickness'],
  ['topMoldHeight', 'Top mold'],
  ['crownHeight', 'Crown'],
  ['crownStackHeight', 'Crown total'],
];

export default function WallHeightProperties({ room, wall, plan }) {
  const dispatch = useDispatch();
  const settings = useSelector((state) => state.elevation.settings);
  const autoNumber = wallNumbers(room).get(wall.id);
  const duplicateNumber = wallNumberWarnings(room)
    .some((warning) => warning.wallIds.includes(wall.id));
  const resolvedProfile = { ...room.profile, ...wall.profile };
  const overlap = crownOverlap(resolvedProfile);
  const frame = wallFrame(room, wall);
  const leftFree = !wall.connections?.[frame.leftEndpoint]
    && !wall.landings?.[frame.leftEndpoint];
  const rightFree = !wall.connections?.[frame.rightEndpoint]
    && !wall.landings?.[frame.rightEndpoint];
  const preferredGrowEnd = leftFree !== rightFree && leftFree ? 'left' : 'right';
  const [growEnd, setGrowEnd] = useState(preferredGrowEnd);

  useEffect(() => {
    setGrowEnd(preferredGrowEnd);
  }, [preferredGrowEnd, wall.id]);

  const updateLength = (length) => {
    if (length <= 0) return false;
    dispatch(setWallLength({ wallId: wall.id, length, growEnd }));
    setGrowEnd(preferredGrowEnd);
    return true;
  };

  return (
    <div className="space-y-5">
      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Wall
        </h3>
        <p className="mb-3 text-sm font-medium text-gray-200">{wallLabel(room, wall)}</p>
        <div className="mb-3 grid grid-cols-2 gap-2.5">
          <Field label="Name (optional)">
            <input
              type="text"
              value={wall.name}
              onChange={(event) => dispatch(updateWall({
                wallId: wall.id,
                changes: { name: event.target.value },
              }))}
              aria-label="Wall name"
              className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
            />
          </Field>
          <Field label="Number">
            <input
              type="number"
              min="1"
              step="1"
              value={wall.numberOverride ?? ''}
              placeholder={String(autoNumber ?? '')}
              onChange={(event) => {
                const value = event.target.value;
                if (value === '') {
                  dispatch(updateWall({ wallId: wall.id, changes: { numberOverride: null } }));
                  return;
                }
                const number = Number(value);
                if (Number.isInteger(number) && number > 0) {
                  dispatch(updateWall({ wallId: wall.id, changes: { numberOverride: number } }));
                }
              }}
              aria-label="Wall number"
              className={`w-full rounded border bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none ${
                duplicateNumber
                  ? 'border-amber-500 focus:border-amber-400'
                  : 'border-gray-600 focus:border-blue-500'
              }`}
            />
          </Field>
        </div>
        {!wallHasCabinets(wall) && (
          <label className="mb-3 flex items-center gap-2 text-xs text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(wall.elevationForced)}
              onChange={(event) => dispatch(updateWall({
                wallId: wall.id,
                changes: { elevationForced: event.target.checked },
              }))}
              aria-label="Include in elevations"
            />
            Include in elevations
          </label>
        )}
        {duplicateNumber && (
          <p className="mb-3 text-xs text-amber-400">This wall number is also assigned to another wall.</p>
        )}
        {plan ? (
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <div className="col-span-2">
                <StretchInput
                  label="Length"
                  value={wall.length}
                  grow={growEnd}
                  onGrowChange={setGrowEnd}
                  onCommit={updateLength}
                  ariaLabel="Wall length"
                />
              </div>
              <Field label="Height">
                <InchInput
                  value={wall.height}
                  onCommit={(height) => dispatch(updateWall({
                    wallId: wall.id,
                    changes: { height },
                  }))}
                  aria-label="Wall height"
                />
              </Field>
              <Field label="Thickness">
                <InchInput
                  value={wall.thickness}
                  onCommit={(thickness) => dispatch(updateWall({
                    wallId: wall.id,
                    changes: { thickness },
                  }))}
                  aria-label="Wall thickness"
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={() => dispatch(flipWall({ wallId: wall.id }))}
              className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
            >
              Flip interior side
            </button>
          </div>
        ) : (
          <>
            <Field label="Wall height">
              <InchInput
                value={wall.height}
                onCommit={(height) => dispatch(updateWall({
                  wallId: wall.id,
                  changes: { height },
                }))}
                aria-label="Wall height"
              />
            </Field>
          </>
        )}
      </section>

      {[
        ['left', frame.leftEndpoint],
        ['right', frame.rightEndpoint],
      ].map(([side, endpoint]) => {
        const landing = wall.landings?.[endpoint];
        if (!landing) return null;
        const host = room.walls.find((candidate) => candidate.id === landing.wallId);
        if (!host) return null;
        const hostView = resolveWall(room, host, landing.side);
        const referenceWalls = landingsOn(room, hostView)
          .filter((interval) => interval.wallId !== wall.id)
          .map((interval) => room.walls.find(
            (candidate) => candidate.id === interval.wallId,
          ))
          .filter((candidate) => candidate && !landingRefCreatesCycle(
            room,
            wall.id,
            host.id,
            landing.side,
            candidate.id,
          ));
        return (
          <section key={endpoint}>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              {`Lands on ${wallLabel(room, host)} · ${landing.side === 'front' ? 'Front' : 'Back'}`}
            </h3>
            <div className="space-y-2.5">
              <Field label="Measured from">
                <select
                  value={landing.ref}
                  onChange={(event) => dispatch(setWallLanding({
                    wallId: wall.id,
                    endpoint,
                    ref: event.target.value,
                  }))}
                  aria-label={`${side} landing measured from`}
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="left">Left end</option>
                  <option value="right">Right end</option>
                  {referenceWalls.map((referenceWall) => (
                    <option key={referenceWall.id} value={referenceWall.id}>
                      {wallLabel(room, referenceWall)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="To">
                <select
                  value={landing.to}
                  onChange={(event) => dispatch(setWallLanding({
                    wallId: wall.id,
                    endpoint,
                    to: event.target.value,
                  }))}
                  aria-label={`${side} landing measured to`}
                  className="w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="near">Near face</option>
                  <option value="far">Far face</option>
                  <option value="center">Centre</option>
                </select>
              </Field>
              <Field label="Distance">
                <InchInput
                  value={landing.offset}
                  onCommit={(offset) => dispatch(setWallLanding({
                    wallId: wall.id,
                    endpoint,
                    offset,
                  }))}
                  aria-label={`${side} landing distance`}
                />
              </Field>
              <button
                type="button"
                onClick={() => dispatch(detachWallLanding({
                  wallId: wall.id,
                  endpoint,
                }))}
                className="w-full rounded bg-gray-700 px-3 py-2 text-sm font-medium text-gray-100 hover:bg-gray-600"
              >
                Detach
              </button>
            </div>
          </section>
        );
      })}

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Wall end panels
        </h3>
        <div className="space-y-2.5">
          {[
            ['Left end', frame.leftEndpoint, leftFree],
            ['Right end', frame.rightEndpoint, rightFree],
          ].map(([label, endpoint, free]) => {
            const panel = wall.endPanels?.[endpoint] ?? null;
            return (
              <div
                key={endpoint}
                className="rounded border border-gray-700 bg-gray-900/45 px-3 py-2"
              >
                <label className={`flex items-center justify-between text-sm ${free ? 'text-gray-300' : 'text-gray-500'}`}>
                  {label}
                  <input
                    type="checkbox"
                    checked={Boolean(panel)}
                    disabled={!free}
                    onChange={(event) => dispatch(setWallEndPanel({
                      wallId: wall.id,
                      endpoint,
                      panel: event.target.checked ? { width: null } : null,
                    }))}
                    aria-label={`${label} wall end panel`}
                  />
                </label>
                {!free && (
                  <p className="mt-1 text-xs text-gray-500">Connected — corner</p>
                )}
                {panel && (
                  <div className="mt-2">
                    <Field label="Width">
                      <InchInput
                        value={panel.width}
                        allowBlank
                        placeholder={formatInches(settings.endPanelThickness)}
                        onCommit={(width) => dispatch(setWallEndPanel({
                          wallId: wall.id,
                          endpoint,
                          panel: { width },
                        }))}
                        aria-label={`${label} panel width`}
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Heights
        </h3>
        <p className="mb-3 text-xs text-gray-500">Blank values inherit from the room.</p>
        <div className="space-y-2.5">
          {WALL_OVERRIDE_FIELDS.map(([key, label]) => (
            <Field key={key} label={label}>
              <InchInput
                value={wall.profile[key] ?? null}
                allowBlank
                placeholder={formatInchesInput(room.profile[key])}
                onCommit={(value) => dispatch(updateWall({
                  wallId: wall.id,
                  changes: { profile: { [key]: value } },
                }))}
                aria-label={`Wall ${label} override`}
              />
            </Field>
          ))}
        </div>
        <p className={`mt-2 text-xs ${overlap < 0 ? 'text-amber-500/80' : 'text-gray-500'}`}>
          {overlap < 0 ? 'Gap' : 'Overlap'} {formatInches(Math.abs(overlap))}
        </p>
      </section>
    </div>
  );
}
