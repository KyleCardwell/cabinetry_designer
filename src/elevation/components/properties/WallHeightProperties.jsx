import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectRoomInheritedChain, selectSettings } from '../../store/selectors.js';
import { resolveSetting } from '../../model/settingsResolve.js';
import {
  crownOverlap,
  formatInchesInput,
  landingRefCreatesCycle,
  landingsOn,
  wallFrame,
  wallEndPanelFramed,
  wallEndPanels,
  wallNumbers,
  wallNumberWarnings,
} from '../../model/index.js';
import { resolveProfile } from '../../model/profile.js';
import { wallHasCabinets, wallLabel } from '../../model/topology.js';
import { resolveWall } from '../../model/room.js';
import { wallBuiltEnds } from '../../model/wallEndPanels.js';
import {
  detachWallLanding,
  flipWall,
  setDoorStylePick,
  setPullPick,
  setWallEndPanel,
  setWallLanding,
  setWallLength,
  updateWall,
} from '../../store/elevationSlice.js';
import { CABINET_TYPE_IDS } from '../../model/constants.js';
import { runBase } from '../../model/furnitureBase.js';
import { moldingProfiles } from '../../model/moldingProfiles.js';
import InchInput from '../InchInput.jsx';
import HeightBands from '../HeightBands.jsx';
import { bandFieldsFor } from '../../model/heightBands.js';
import OverrideInput from '../OverrideInput.jsx';
import DoorStylePicks from './DoorStylePicks.jsx';
import PullPicks from './PullPicks.jsx';
import Field from './Field.jsx';
import WallEndPanelFields from './WallEndPanelFields.jsx';
import StretchInput from './StretchInput.jsx';

export default function WallHeightProperties({ room, wall, plan }) {
  const dispatch = useDispatch();
  const settings = useSelector(selectSettings);
  const inheritedChain = useSelector(selectRoomInheritedChain);
  const autoNumber = wallNumbers(room).get(wall.id);
  const duplicateNumber = wallNumberWarnings(room)
    .some((warning) => warning.wallIds.includes(wall.id));
  const inheritedProfile = resolveProfile(settings, room);
  const resolvedProfile = resolveProfile(settings, room, wall);
  const moldings = moldingProfiles(resolvedProfile, settings);
  const base = runBase(room, wall, { cabinetTypeId: CABINET_TYPE_IDS.BASE }, settings);
  const overlap = crownOverlap(resolvedProfile);
  const frame = wallFrame(room, wall);
  const builtEnds = wallBuiltEnds(wall);
  const builtLength = frame.length + builtEnds.start + builtEnds.end;
  const showPlannedLength = settings.runFlex !== 0
    && Math.abs(builtLength - frame.length) > 1e-6;
  const leftFree = !wall.connections?.[frame.leftEndpoint]
    && !wall.landings?.[frame.leftEndpoint];
  const rightFree = !wall.connections?.[frame.rightEndpoint]
    && !wall.landings?.[frame.rightEndpoint];
  const framedEnds = new Set(wallEndPanels(room, wall, settings)
    .filter((candidate) => wallEndPanelFramed(wall, candidate))
    .map((candidate) => candidate.endpoint));
  const heightField = (
    <OverrideInput
      kind="number"
      label="Height"
      aria-label="Wall height"
      level="Wall"
      value={wall.profile?.wallHeight ?? null}
      inherited={inheritedProfile.wallHeight}
      source={room.profile?.wallHeight != null
        ? 'Room'
        : resolveSetting('defaultProfile.wallHeight', inheritedChain).source}
      onChange={(height) => dispatch(updateWall({ wallId: wall.id, changes: { height } }))}
    />
  );
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

  const renderHeightField = ({ key, label, type, pickKind: kind }) => {
    // Walls retain their existing override capabilities (no box-height override).
    if (key === 'baseBoxHeight') return null;
    if (type === 'baseKind') return (
      <label className="block text-xs text-gray-400">
        Base
        <select
          aria-label="Wall Base override"
          value={wall.profile.baseKind ?? ''}
          onChange={(event) => {
            const value = event.target.value || undefined;
            dispatch(updateWall({ wallId: wall.id, changes: { profile: { baseKind: value } } }));
          }}
          className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
        >
          <option value="">Inherit</option>
          <option value="toe_kick">Toe kick</option>
          <option value="furniture_base">Furniture base</option>
        </select>
      </label>
    );
    if (key === 'furnitureBaseProud') return (
      <label className="block text-xs text-gray-400">
        Base proud
        <InchInput
          aria-label="Wall Base proud override"
          value={wall.profile.furnitureBaseProud ?? null}
          allowBlank
          placeholder={formatInchesInput(inheritedProfile.furnitureBaseProud)}
          onCommit={(value) => value !== null && value < 0 ? false : dispatch(updateWall({ wallId: wall.id, changes: { profile: { furnitureBaseProud: value } } }))}
          className="mt-1"
        />
      </label>
    );
    if (type === 'pick') {
      const pickedId = wall.profile[key];
      const choices = (settings.sectionProfiles ?? []).filter((entry) => entry.kind === kind && !entry.archived);
      const unavailable = pickedId && !choices.some((entry) => entry.id === pickedId);
      return (
        <label key={key} className="block text-xs text-gray-400">
          {label}
          <select
            aria-label={`Wall ${label} override`}
            value={pickedId === null ? 'plain' : pickedId ?? ''}
            onChange={(event) => {
              const value = event.target.value === 'plain' ? null : event.target.value || undefined;
              dispatch(updateWall({ wallId: wall.id, changes: { profile: { [key]: value } } }));
            }}
            className="mt-1 w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          >
            <option value="">Inherit</option>
            <option value="plain">{kind === 'nosing' ? 'None' : kind === 'base_cutout' ? 'Square' : 'Plain'}</option>
            {choices.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
            {unavailable && <option value={pickedId} disabled>{settings.sectionProfiles?.find((entry) => entry.id === pickedId)?.name ?? 'Missing profile'} (unavailable)</option>}
          </select>
        </label>
      );
    }
    const fromProfile = (key === 'crownHeight' && Boolean(moldings.crown))
      || (key === 'topMoldHeight' && Boolean(moldings.topMold && !moldings.topMold.profile.stretch));
    return (
      <Field key={key} label={label} tag={fromProfile ? 'profile' : undefined}>
        <InchInput
          value={fromProfile ? resolvedProfile[key] : wall.profile[key] ?? null}
          allowBlank
          placeholder={formatInchesInput(inheritedProfile[key])}
          readOnly={fromProfile}
          onCommit={(value) => fromProfile ? undefined : dispatch(updateWall({ wallId: wall.id, changes: { profile: { [key]: value } } }))}
          aria-label={`Wall ${label} override`}
          className="mt-1"
        />
      </Field>
    );
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
                {showPlannedLength && (
                  <p className="mt-1 text-xs text-gray-500">
                    {`Planned ${formatInchesInput(frame.length)} → built ${formatInchesInput(builtLength)}`}
                  </p>
                )}
              </div>
              {heightField}
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
            {heightField}
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
                    <WallEndPanelFields
                      wall={wall}
                      endpoint={endpoint}
                      panel={panel}
                      label={label}
                      framed={framedEnds.has(endpoint)}
                      settings={settings}
                    />
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
        <HeightBands
          level="wall"
          fields={bandFieldsFor('wall', { furnitureBase: resolvedProfile.baseKind === 'furniture_base' })}
          renderField={renderHeightField}
          isSet={(key) => wall.profile?.[key] !== undefined}
          warnings={[...moldings.warnings, ...base.warnings]}
          overlap={overlap}
        />
      </section>

      {room.doorStyles?.length > 0 && (
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Door styles
          </h3>
          <DoorStylePicks
            room={room}
            settings={settings}
            node={room.walls.find((w) => w.id === wall.id)}
            levelsAbove={[{ level: 'room', node: room }]}
            label="Wall"
            onChange={(key, styleId) => dispatch(setDoorStylePick({
              level: 'wall', wallId: wall.id, key, styleId,
            }))}
          />
        </section>
      )}
      <PullPicks
        settings={settings}
        node={room.walls.find((candidate) => candidate.id === wall.id)}
        levelsAbove={[]}
        label="Wall"
        onChange={(key, pullId) => dispatch(setPullPick({
          roomId: room.id, level: 'wall', wallId: wall.id, key, pullId,
        }))}
      />
    </div>
  );
}
