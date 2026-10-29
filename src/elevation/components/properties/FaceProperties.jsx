import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  CABINET_TYPE_IDS,
  FACE_TYPE_LABELS,
  FACE_TYPES,
  MAX_FACE_SPLIT,
  PANEL_MATERIALS,
  ROOT_FACE_PATH,
  runFaceLayouts,
  defaultFace,
  equalizeGroup,
  faceOutline,
  formatInches,
  getFaceNode,
  isInsetStyle,
  makeDrawerStack,
  parentFacePath,
  panelMaterial,
  presetsFor,
  removeFace,
  setFaceAction,
  setFaceHinge,
  setFaceMatch,
  setFacePanelMaterial,
  setFaceSize,
  setFaceType,
  setGroupCount,
  setSeamNoRail,
  splitFace,
} from '../../model/index.js';
import { DEFAULT_SETTINGS } from '../../model/constants.js';
import { facePartType, cabinetFaceLevels } from '../../model/doorStyleResolve.js';
import { runDoorDetails } from '../../model/doorDetails.js';
import { PULL_POSITIONS, pullPartType, pullPickOptions, resolvePull } from '../../model/pulls.js';
import { facePullPlacement, pullDefaults, pullPositionLabel, runPulls } from '../../model/pullLayouts.js';
import { setFacePull, setFacePart, setFacePullPlacement } from '../../model/faceTree.js';
import { setFacePath, setItemFace } from '../../store/elevationSlice.js';
import InchInput from '../InchInput.jsx';
import PanelSection from '../panel/PanelSection.jsx';
import CabinetStyleProperties from './CabinetStyleProperties.jsx';
import BoxConstructionFields from './BoxConstructionFields.jsx';
import InteriorFields from './InteriorFields.jsx';
import DrawerBoxFields from './DrawerBoxFields.jsx';
import PartStyleFields from './PartStyleFields.jsx';

const BUTTON_CLASS = 'rounded bg-gray-700 px-2.5 py-2 text-xs text-gray-100 hover:bg-gray-600';
const DISABLED_CLASS = 'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-700';
const NUMBER_CLASS = 'w-16 rounded border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';
const SLOT_LABELS = {
  outside: 'Outside edge',
  inside: 'Inside profile',
  panel: 'Raised panel',
  applied: 'Applied molding',
};
const WARNING_MESSAGES = {
  'face-too-small': 'Sections don\'t fit. Reduce a fixed size.',
  'pair-door-covers-panel': 'A pair door can\'t cover a side panel — it\'s hinged on both sides.',
  'hinge-on-covered-side': 'This door is hinged on the side that covers a panel.',
  'front-panel-over-taller': 'A shorter front above has a bigger panel than the one below it — adjust its rails.',
  'door-design-missing': 'This face\'s door design is missing — drawn as 5-piece square.',
  'door-profile-missing': 'A profile picked in this face\'s door style is missing or the wrong kind — it isn\'t drawn.',
  'door-profile-too-deep': 'A profile in this face\'s door style cuts deeper than the door is thick.',
  'door-profile-too-wide': 'The door style\'s edge and inside/applied profiles are wider than a stile or rail on this face.',
  'door-profile-panel-too-small': 'The panel (or molding) opening is too small for the door style\'s profiles.',
  'mid-layout-overfull': "Panel sizes don't fit. Clear or reduce a typed panel.",
  'panel-material-needs-frame': (material) => `A ${material} panel needs a 5-piece door — this face's style is a slab here.`,
  'pull-needs-hinge': 'Set a hinge side (or pick a centred or rail pull position) so this door\'s pull can be placed.',
  'pull-too-long': 'This pull is longer than the space it sits in on this face.',
};

function groupLabel(node) {
  const cuts = node.noRail?.length ?? 0;
  const rail = cuts ? ` · no ${node.direction === 'vertical' ? 'rail' : 'mullion'} at ${cuts}` : '';
  if (
    node.direction === 'vertical'
    && node.children.every((child) => child.type === 'drawer_front')
  ) {
    return `Drawer stack × ${node.children.length}${rail}`;
  }
  const name = node.direction === 'horizontal' ? 'Side by side' : 'Stack';
  return `${name} × ${node.children.length}${rail}`;
}

// `layout` is the run's splitRun result; it supplies the same-width targets.
export default function FaceProperties({ part, wall, run, piece, item, itemIds = [item.id], layout, cells, settings }) {
  const dispatch = useDispatch();
  const facePath = useSelector((state) => state.elevation.facePath);
  const stored = item.face ?? null;
  const face = stored ?? defaultFace(piece.width, settings);
  const room = useSelector((state) => state.elevation.rooms.find(
    (candidate) => candidate.id === state.elevation.activeRoomId,
  ));
  const faceLayout = runFaceLayouts(room, wall, run, settings, layout).get(piece.id);
  const doorDetails = runDoorDetails(room, wall, run, settings);
  const warnings = [
    ...(faceLayout?.warnings ?? []),
    ...doorDetails.warnings.filter(
      (warning) => warning.pieceId === piece.id && warning.code !== 'door-style-missing',
    ),
    ...runPulls(room, wall, run, settings, undefined, doorDetails).warnings.filter(
      (warning) => warning.pieceId === piece.id && (facePath === null || warning.path === facePath),
    ),
  ];
  const [splitCount, setSplitCount] = useState(2);
  const warningMessage = ({ code, key }) => {
    const message = WARNING_MESSAGES[code];
    if (typeof message !== 'function') return message;
    const material = panelMaterial(doorDetails.parts.find((part) => part.key === key)?.panelMaterial);
    return material ? message(material.label.toLowerCase()) : null;
  };
  const selected = facePath === null ? null : getFaceNode(face, facePath);
  const pullPick = selected && pullPartType(selected.type)
    ? pullPickOptions(settings, pullPartType(selected.type),
      cabinetFaceLevels(room, wall, run, item, selected).slice(1), selected, 'pullId') : null;
  const resolvedFace = faceLayout?.faces.find((entry) => entry.path === facePath);
  const resolvedPull = pullPick ? resolvePull(settings, pullPartType(selected.type),
    cabinetFaceLevels(room, wall, run, item, selected).slice(0, 4)).pull : null;
  const autoPull = resolvedPull && resolvedFace ? facePullPlacement({
    face: resolvedFace,
    part: doorDetails.parts.find((part) => part.key === `${piece.id}:${facePath}${resolvedFace.half ? `:${resolvedFace.half}` : ''}`),
    pull: resolvedPull,
    pullHeight: item.pullHeight ?? settings?.pullHeight ?? DEFAULT_SETTINGS.pullHeight,
    defaults: pullDefaults(settings, resolvedFace.type),
  }) : null;
  const drawerPulls = ['drawer_front', 'false_front'].includes(selected?.type);
  const sameWidthIds = (cells?.pieces ?? layout.pieces)
    .filter((p) => p.kind === 'cabinet' && p.role === 'item' && Math.abs(p.width - piece.width) < 1e-6)
    .map((p) => p.id);
  const hasOtherMatches = sameWidthIds.some((id) => id !== item.id);

  const commit = (nextFace) => dispatch(setItemFace({
    wallId: wall.id,
    runId: run.id,
    itemIds: [item.id],
    face: nextFace,
  }));

  const applyPreset = (nextFace) => {
    commit(nextFace);
    dispatch(setFacePath(null));
  };

  const commitIfChanged = (nextFace) => {
    if (nextFace !== face) commit(nextFace);
  };

  const allowStandard = (path) => setFaceMatch(face, path, 'standard') !== face;
  const sizePlaceholder = (node, path) => {
    const rule = node.match === 'standard' ? 'std' : node.match ?? 'auto';
    const laidOut = faceLayout?.layoutFace ? getFaceNode(faceLayout.layoutFace, path) : null;
    const resolved = faceLayout?.faces.find((entry) => entry.path === path);
    const direction = getFaceNode(face, parentFacePath(path))?.direction;
    const size = node.match ? laidOut?.size
      : resolved?.[direction === 'vertical' ? 'height' : 'width'];
    return Number.isFinite(size) ? `${rule} (${formatInches(size)})` : rule;
  };

  const remove = () => {
    commitIfChanged(removeFace(face, facePath));
    dispatch(setFacePath(parentFacePath(facePath)));
  };

  const applyToSameWidth = () => dispatch(setItemFace({
    wallId: wall.id,
    runId: run.id,
    itemIds: sameWidthIds,
    face: stored,
  }));

  if (part === 'inside') {
    return (
      <div className="space-y-3">
        <BoxConstructionFields room={room} wall={wall} run={run} item={item} />
        <InteriorFields key={item.id} room={room} wall={wall} run={run} item={item} settings={settings} />
        {faceLayout?.faces.some(({ type, action }) => type === 'drawer_front'
          || (type === 'door' && action === 'pullout' && ['trash', 'hamper'].includes(item.purpose))) && (
          <DrawerBoxFields key={`drawers-${item.id}`} room={room} wall={wall} run={run} item={item}
            itemIds={itemIds} settings={settings} faceLayout={faceLayout} />
        )}
      </div>
    );
  }
  if (part !== 'style') return null;

  return (
    <div className="space-y-3">
      {faceLayout && (
        <CabinetStyleProperties
          room={room}
          wall={wall}
          run={run}
          item={item}
          settings={settings}
          faceLayout={faceLayout}
        />
      )}
      <PanelSection id="piece.faces" title="Faces" badge={Number(stored !== null)} actions={
        stored === null ? (
          <span className="text-xs text-gray-500">Default</span>
        ) : (
          <button
            type="button"
            onClick={() => applyPreset(null)}
            className="rounded bg-gray-700 px-2 py-1 text-xs text-gray-100 hover:bg-gray-600"
          >
            Reset
          </button>
        )
      }>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {presetsFor(run.cabinetTypeId).map((preset) => (
              <button
                key={preset.key}
                type="button"
                title={preset.description}
                onClick={() => applyPreset(preset.face)}
                className={BUTTON_CLASS}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {faceOutline(face).map(({ path, depth, node }) => (
              <div
                key={path}
                onClick={() => dispatch(setFacePath(path))}
                style={{ paddingLeft: depth * 12 }}
                className={`flex cursor-pointer items-center gap-2 border-l-2 py-1 pr-1 ${
                  path === facePath ? 'border-blue-500 bg-gray-800/60' : 'border-transparent'
                }`}
              >
                <div className="min-w-0 flex-1">
                  {node.type ? (
                    <select
                      value={node.type}
                      onChange={(event) => commit(setFaceType(face, path, event.target.value))}
                      aria-label={`Face type ${path}`}
                      className={SELECT_CLASS}
                    >
                      {FACE_TYPES.map((type) => (
                        <option key={type} value={type}>{FACE_TYPE_LABELS[type]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-300">{groupLabel(node)}</span>
                  )}
                </div>
                {path !== ROOT_FACE_PATH && (
                  <div className={`${node.size === null ? 'w-32' : 'w-20'} shrink-0`}>
                    <InchInput
                      value={node.size}
                      allowBlank
                      allowAuto
                      allowStandard={allowStandard(path)}
                      onStandard={() => {
                        const next = setFaceMatch(face, path, 'standard');
                        if (next === face) return false;
                        commit(next);
                        return true;
                      }}
                      placeholder={sizePlaceholder(node, path)}
                      className="placeholder:text-gray-500"
                      aria-label={`Face size ${path}`}
                      onCommit={(value) => {
                        const next = value === null && node.match
                          ? setFaceMatch(face, path, null) : setFaceSize(face, path, value);
                        if (next === face) return false;
                        commit(next);
                        return true;
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {selected && (
            <div className="space-y-2 rounded border border-gray-700 p-2">
              {allowStandard(facePath) && (
                <label className="flex items-center gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={selected.match === 'standard'}
                    onChange={(event) => commitIfChanged(setFaceMatch(
                      face, facePath, event.target.checked ? 'standard' : null,
                    ))}
                    aria-label="Standard"
                  />
                  Standard
                </label>
              )}
              {selected.type && selected.type !== 'open' && resolvedFace && (
                <PartStyleFields
                  room={room}
                  settings={settings}
                  partType={facePartType(selected.type)}
                  levels={cabinetFaceLevels(room, wall, run, item, selected)}
                  part={selected}
                  width={resolvedFace.width}
                  height={resolvedFace.height}
                  label={`Face ${facePath}`}
                  onChange={(patch) => commitIfChanged(setFacePart(face, facePath, patch))}
                />
              )}
              {pullPick && (
                <label className="block text-xs text-gray-300">
                  Pull
                  <select
                    value={selected.type === 'false_front' && selected.pullId === 'none' ? '' : selected.pullId ?? ''}
                    onChange={(event) => commitIfChanged(setFacePull(face, facePath, event.target.value || null))}
                    aria-label="Pull"
                    className={`${SELECT_CLASS} mt-1`}
                  >
                    <option value="">{pullPick.inherit.text}</option>
                    {pullPick.options.map((option) => <option key={option.id} value={option.id}>{option.text}</option>)}
                  </select>
                </label>
              )}
              {autoPull && (
                <>
                  <label className="block text-xs text-gray-300">
                    Pull position
                    <select
                      value={selected.pullAt ?? ''}
                      onChange={(event) => commitIfChanged(setFacePullPlacement(
                        face, facePath, { pullAt: event.target.value || null },
                      ))}
                      aria-label="Pull position"
                      className={`${SELECT_CLASS} mt-1`}
                    >
                      <option value="">{`Auto (${autoPull.warnings.includes('pull-needs-hinge') ? 'needs hinge' : pullPositionLabel(autoPull.at)})`}</option>
                      {PULL_POSITIONS[drawerPulls ? 'drawer' : 'door'].map((at) => (
                        <option key={at} value={at}>{pullPositionLabel(at)}</option>
                      ))}
                    </select>
                  </label>
                  {resolvedPull.kind === 'pull' && (
                    <label className="block text-xs text-gray-300">
                      Pull direction
                      <select
                        value={selected.pullOrientation ?? ''}
                        onChange={(event) => commitIfChanged(setFacePullPlacement(
                          face, facePath, { pullOrientation: event.target.value || null },
                        ))}
                        aria-label="Pull direction"
                        className={`${SELECT_CLASS} mt-1`}
                      >
                        <option value="">{`Auto (${autoPull.orientation === 'vertical' ? 'Vertical' : 'Horizontal'})`}</option>
                        <option value="vertical">Vertical</option>
                        <option value="horizontal">Horizontal</option>
                      </select>
                    </label>
                  )}
                  {drawerPulls && (
                    <label className="block text-xs text-gray-300">
                      Pulls across
                      <select
                        value={selected.pullCount ?? 1}
                        onChange={(event) => commitIfChanged(setFacePullPlacement(
                          face, facePath, { pullCount: Number(event.target.value) },
                        ))}
                        aria-label="Pulls across"
                        className={`${SELECT_CLASS} mt-1`}
                      >
                        {[1, 2, 3, 4].map((count) => <option key={count} value={count}>{count}</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
              {['door', 'pair_door'].includes(selected.type) && (
                <label className="block text-xs text-gray-300">
                  Opens
                  <select
                    value={selected.action ?? 'swing'}
                    onChange={(event) => commitIfChanged(setFaceAction(
                      face,
                      facePath,
                      event.target.value === 'swing' ? null : event.target.value,
                    ))}
                    aria-label="Opens"
                    className={`${SELECT_CLASS} mt-1`}
                  >
                    <option value="swing">Swing</option>
                    <option value="flipper">Flipper</option>
                    <option value="pocket">Pocket</option>
                    <option value="sliding">Sliding</option>
                    {selected.type === 'door' && <option value="pullout">Pull-out</option>}
                  </select>
                </label>
              )}
              {['door', 'pair_door'].includes(selected.type) && selected.action !== 'pullout' && (
                <div>
                  <label className="block text-xs text-gray-300">
                    Panel
                    <select
                      value={selected.panelMaterial ?? ''}
                      onChange={(event) => commitIfChanged(setFacePanelMaterial(face, facePath, event.target.value || null))}
                      aria-label="Panel"
                      className={`${SELECT_CLASS} mt-1`}
                    >
                      <option value="">Standard</option>
                      {PANEL_MATERIALS.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </label>
                  {/* Material-specific options can follow the picker here. */}
                </div>
              )}
              {selected.type === 'door' && !['sliding', 'pullout'].includes(selected.action) && (
                <label className="block text-xs text-gray-300">
                  Hinge
                  <select
                    value={selected.hinge ?? ''}
                    onChange={(event) => commitIfChanged(setFaceHinge(
                      face,
                      facePath,
                      event.target.value || null,
                    ))}
                    aria-label="Hinge"
                    className={`${SELECT_CLASS} mt-1`}
                  >
                    <option value="">
                      {resolvedFace?.hingeRule ? `Auto (${resolvedFace.hinge})` : 'Auto'}
                    </option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    {!['flipper', 'pocket'].includes(selected.action) && (
                      <>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </>
                    )}
                  </select>
                </label>
              )}
              {selected.type ? (
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    Sections
                    <input
                      type="number"
                      min={2}
                      max={MAX_FACE_SPLIT}
                      value={splitCount}
                      onChange={(event) => setSplitCount(event.target.value)}
                      onBlur={() => {
                        const n = Math.round(Number(splitCount));
                        setSplitCount(Number.isFinite(n) ? Math.min(MAX_FACE_SPLIT, Math.max(2, n)) : 2);
                      }}
                      className={NUMBER_CLASS}
                    />
                  </label>
                  <button
                    type="button"
                    title="Split side by side"
                    aria-label="Split side by side"
                    onClick={() => commitIfChanged(splitFace(face, facePath, 'horizontal', Number(splitCount)))}
                    className={`${BUTTON_CLASS} flex h-7 w-7 items-center justify-center p-0`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <path d="M8 2v12M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title="Split into a stack"
                    aria-label="Split into a stack"
                    onClick={() => commitIfChanged(splitFace(face, facePath, 'vertical', Number(splitCount)))}
                    className={`${BUTTON_CLASS} flex h-7 w-7 items-center justify-center p-0`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 2v12M5.5 5 2.5 8l3 3M10.5 5l3 3-3 3"
                        transform="rotate(90 8 8)"
                      />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => commitIfChanged(makeDrawerStack(
                      face,
                      facePath,
                      Number(splitCount),
                      { match: run.cabinetTypeId === CABINET_TYPE_IDS.TALL },
                    ))}
                    className={BUTTON_CLASS}
                  >
                    Drawer stack
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-300">
                      Sections
                      <input
                        type="number"
                        min={1}
                        max={MAX_FACE_SPLIT}
                        value={selected.children.length}
                        onChange={(event) => {
                          if (event.target.value === '') return;
                          commitIfChanged(setGroupCount(face, facePath, Number(event.target.value)));
                        }}
                        className={NUMBER_CLASS}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => commitIfChanged(equalizeGroup(face, facePath))}
                      className={BUTTON_CLASS}
                    >
                      Make equal
                    </button>
                  </div>
                  {facePath !== ROOT_FACE_PATH
                    && getFaceNode(face, parentFacePath(facePath))?.direction === 'vertical' && (
                    <label className="flex items-center gap-2 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={selected.match === 'base'}
                        onChange={(event) => commitIfChanged(setFaceMatch(
                          face, facePath, event.target.checked ? 'base' : null,
                        ))}
                        aria-label="Match base drawers"
                      />
                      Match base drawers
                    </label>
                  )}
                  {faceLayout && isInsetStyle(faceLayout.style) && selected.children.slice(0, -1).map((child, seam) => {
                    if (!child.type || !selected.children[seam + 1].type) return null;
                    const word = selected.direction === 'vertical' ? 'rail' : 'mullion';
                    const label = `No ${word} between ${seam + 1} and ${seam + 2}`;
                    return (
                      <label key={label} className="flex items-center gap-2 text-xs text-gray-300">
                        <input
                          type="checkbox"
                          checked={selected.noRail?.includes(seam) === true}
                          onChange={(event) => commitIfChanged(
                            setSeamNoRail(face, facePath, seam, event.target.checked),
                          )}
                          aria-label={label}
                        />
                        {label}
                      </label>
                    );
                  })}
                </>
              )}
              {facePath !== ROOT_FACE_PATH && (
                <button type="button" onClick={remove} className={BUTTON_CLASS}>
                  Remove
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={applyToSameWidth}
            disabled={!hasOtherMatches}
            className={`w-full ${BUTTON_CLASS} ${DISABLED_CLASS}`}
          >
            Apply to same-width cabinets
          </button>

          {[...new Set(warnings.filter(({ code }) => code === 'door-profile-too-thin').map(({ slot }) => slot))].map((slot) => (
            <p key={`too-thin:${slot}`} className="text-xs font-medium text-amber-300">
              {SLOT_LABELS[slot]} can't shrink to this thickness — shown unstretched
            </p>
          ))}
          {[...new Set(warnings.filter(({ code }) => code === 'applied-molding-no-room').map(({ index }) => index))].map((index) => (
            <p key={`applied-no-room:${index}`} className="text-xs font-medium text-amber-300">
              Applied molding {index + 1} doesn't fit on this face.
            </p>
          ))}
          {[...new Set(warnings.filter(({ code, side }) => code === 'door-profile-too-wide' && side === 'molding').map(({ index }) => index))].map((index) => (
            <p key={`molding-too-wide:${index}`} className="text-xs font-medium text-amber-300">
              Applied molding {index + 1} sits on the edge profile.
            </p>
          ))}
          {[...new Set(warnings.filter(({ code }) => code === 'drawer-stack-base-mismatch')
            .map(({ baseHeight, matchedHeight }) => `Base drawers on this wall are ${formatInches(baseHeight)}; this stack matches the ${formatInches(matchedHeight)} standard.`))].map((message) => (
            <p key={message} className="text-xs font-medium text-amber-300">{message}</p>
          ))}
          {[...new Set(warnings.filter(({ code, side }) => code !== 'door-profile-too-wide' || side !== 'molding')
            .map(warningMessage).filter(Boolean))].map((message) => (
            <p key={message} className="text-xs font-medium text-amber-300">{message}</p>
          ))}
        </div>
      </PanelSection>
    </div>
  );
}
