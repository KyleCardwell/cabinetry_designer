import { useMemo } from 'react';
import { combinedSoffitJoins, combinedViewOf } from '../../model/combinedElevations.js';
import { combinedFaceParts, seamHiddenEdges } from '../../model/combinedSeams.js';
import { wallInteriors } from '../../model/interiors.js';
import { wallDrawerBoxes } from '../../model/drawerBoxes.js';
import { wallShelves } from '../../model/shelves.js';
import { wallRollouts } from '../../model/rollouts.js';
import { wallAccessories } from '../../model/accessories.js';
import { wallShowThrough } from '../../model/showThrough.js';
import { resolveProfile } from '../../model/profile.js';
import { partNumbers } from '../../model/partNumbers.js';
import { roomDiagnostics } from '../../model/room.js';
import { resolveCombinedFaces } from '../CombinedFaces.jsx';

export default function useWallOverlays({ room, wall, settings, doorsOff, stretchPreview }) {
  const combined = useMemo(
    () => (room && wall ? combinedViewOf(room, wall.id, wall.side) : null),
    [room, wall],
  );
  const combinedFaces = useMemo(
    () => (combined ? resolveCombinedFaces(room, combined, settings) : null),
    [combined, room, settings],
  );
  const soffitJoins = useMemo(
    () => (combined ? combinedSoffitJoins(room, combined) : []),
    [combined, room],
  );
  // Seams hide under joined soffits and anything running across them, as in the DXF (Kyle 2026-10-23).
  const hiddenEdges = useMemo(() => (combined ? seamHiddenEdges(combined, combinedFaceParts(room, combined, settings,
    new Map([...combinedFaces].map(([key, { shapes }]) => [key, shapes]))), soffitJoins) : new Map()),
  [combined, combinedFaces, room, settings, soffitJoins]);
  const diagnostics = useMemo(
    () => (room ? roomDiagnostics(room, settings) : {}),
    [room, settings],
  );
  const partNumbering = useMemo(
    () => (room && settings.showPartNumbers ? partNumbers(room, settings) : null),
    [room, settings],
  );
  const interiors = useMemo(
    () => (doorsOff && room && wall
      ? wallInteriors(room, wall.sideSource ?? wall, wall.side ?? 'front', settings) : []),
    [doorsOff, room, wall, settings],
  );
  const showThrough = useMemo(
    () => (!doorsOff && room && wall
      ? [...wallShowThrough(room, wall.sideSource ?? wall, wall.side ?? 'front', settings).values()] : []),
    [doorsOff, room, wall, settings],
  );
  const previewShowThrough = useMemo(
    () => (!doorsOff && stretchPreview
      ? [...wallShowThrough(stretchPreview.room, stretchPreview.wall.sideSource ?? stretchPreview.wall,
        stretchPreview.wall.side ?? 'front', settings).values()] : []),
    [doorsOff, stretchPreview, settings],
  );
  const drawerBoxes = useMemo(
    () => (doorsOff && room && wall
      ? [...wallDrawerBoxes(room, wall.sideSource ?? wall, wall.side ?? 'front', settings)]
        .map(([itemId, entry]) => ({ itemId, ...entry })) : []),
    [doorsOff, room, wall, settings],
  );
  const adjustableShelves = useMemo(
    () => (doorsOff && room && wall
      ? wallShelves(room, wall.sideSource ?? wall, wall.side ?? 'front', settings) : new Map()),
    [doorsOff, room, wall, settings],
  );
  const rollouts = useMemo(
    () => (doorsOff && room && wall
      ? wallRollouts(room, wall.sideSource ?? wall, wall.side ?? 'front', settings) : new Map()),
    [doorsOff, room, wall, settings],
  );
  const accessories = useMemo(
    () => (doorsOff && room && wall
      ? wallAccessories(room, wall.sideSource ?? wall, wall.side ?? 'front', settings) : new Map()),
    [doorsOff, room, wall, settings],
  );
  const profile = useMemo(
    () => (room && wall ? resolveProfile(settings, room, wall) : null),
    [room, settings, wall],
  );

  return {
    combined,
    combinedFaces,
    soffitJoins,
    hiddenEdges,
    diagnostics,
    partNumbering,
    interiors,
    showThrough,
    previewShowThrough,
    drawerBoxes,
    adjustableShelves,
    rollouts,
    accessories,
    profile,
  };
}
