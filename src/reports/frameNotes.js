import { DEFAULT_SETTINGS } from '../elevation/model/constants.js';
import { BOTTOM_PART_LABELS, frameBottomParts } from '../elevation/model/bottoms.js';
import { cornerLap } from '../elevation/model/cornerLaps.js';
import { runEndThickness, wallPanelThickness } from '../elevation/model/panelThickness.js';
import { runSeamGap } from '../elevation/model/styles.js';
import { wallEndPanelAt } from '../elevation/model/wallSides.js';
import { formatInch } from './format.js';

const EPSILON = 1e-6;

/** Add report roles and the region's overlapping box IDs without changing member order. */
export function frameMemberRoles(region, members, boxes) {
  const cabinetIds = new Set(region.cabinetIds);
  const regionBoxes = boxes.filter((box) => cabinetIds.has(box.id))
    .sort((a, b) => a.x - b.x || a.z - b.z);

  return members.map((member) => {
    const sitsOn = regionBoxes.filter((box) => (
      Math.min(member.x + member.width, box.x + box.width) - Math.max(member.x, box.x) > EPSILON
      && Math.min(member.z + member.height, box.z + box.height) - Math.max(member.z, box.z) > EPSILON
    )).map((box) => box.id);

    let role = member.kind;
    if (member.kind === 'stile') {
      if (Math.abs(member.x - region.x) <= EPSILON) role = 'left-stile';
      else if (Math.abs(member.x + member.width - region.x - region.width) <= EPSILON) role = 'right-stile';
    } else if (member.kind === 'rail') {
      if (Math.abs(member.z - region.z) <= EPSILON) role = 'bottom-rail';
      else if (Math.abs(member.z + member.height - region.z - region.height) <= EPSILON) role = 'top-rail';
      else role = sitsOn.length >= 2 ? 'rail' : 'mid-rail';
    }

    return { ...member, role, sitsOn };
  });
}

/** Shop standard member widths, including the bead on each exposed edge. */
export function frameStandards(insetFrame, bead = 0) {
  const frame = { ...DEFAULT_SETTINGS.insetFrame, ...insetFrame };
  return {
    'left-stile': 2 * frame.stile + bead,
    'right-stile': 2 * frame.stile + bead,
    'top-rail': frame.rail + bead,
    'bottom-rail': frame.rail + bead,
    stile: 2 * frame.stile + 2 * bead,
    rail: frame.rail + 2 * bead,
    'mid-rail': frame.midRail + 2 * bead,
    mullion: frame.mullion + 2 * bead,
  };
}

const NOTE_ORDER = ['left-stile', 'right-stile', 'top-rail', 'bottom-rail', 'stile', 'rail', 'mid-rail', 'mullion'];
const STILE_ROLES = new Set(['left-stile', 'right-stile', 'stile', 'mullion']);
const INTERIOR_ROLES = new Set(['stile', 'rail', 'mid-rail', 'mullion']);
const WIDTH_EPSILON = 1e-4;
const sameWidth = (a, b) => Math.abs(a - b) <= WIDTH_EPSILON;
const uniformWidth = (members) => members.length > 0
  && members.every((member) => sameWidth(member.width, members[0].width));

/** Explain differing widths using the first applicable construction rule. */
export function frameReasons(room, wall, run, scene, region, entries, settings, standards) {
  const edge = (rect, side) => rect.x + (side === 'right' ? rect.width : 0);
  const atEdge = (piece, side) => Math.abs(edge(piece, side) - edge(region, side)) <= EPSILON;
  const pieces = scene.cells.pieces;
  const reasonFor = (member) => {
    if (member.role === 'left-stile' || member.role === 'right-stile') {
      const side = member.role === 'left-stile' ? 'left' : 'right';
      if (atEdge(run, side) && cornerLap(room, wall, run, side, settings)?.laps) return 'corner lap';
      if (pieces.some((piece) => region.fillerIds.includes(piece.id) && atEdge(piece, side))) return 'filler';
      if (pieces.some((piece) => piece.id === `${run.id}:${side}`
        && piece.kind === 'end_panel' && region.panelIds.includes(piece.id) && atEdge(piece, side))) {
        return `mitered to ${formatInch(runEndThickness(room, wall, run, settings)[side])} end panel`;
      }
      if (region.wallPanels?.some((panel) => panel.side === side && atEdge(panel, side))) {
        const { endpoint } = wallEndPanelAt(room, wall, side, settings);
        return `mitered to ${formatInch(wallPanelThickness(room, wall, settings)[endpoint])} end panel`;
      }
    }
    if (member.role === 'stile') {
      const boxes = pieces.filter((piece) => member.sitsOn.includes(piece.id));
      const seam = runSeamGap(room, run, settings);
      for (const left of boxes) {
        for (const right of boxes) {
          const gap = right.x - left.x - left.width;
          const overlap = Math.min(left.z + left.height, right.z + right.height) - Math.max(left.z, right.z);
          if (gap - seam > EPSILON && overlap > EPSILON
            && left.x + left.width >= member.x - EPSILON
            && right.x <= member.x + member.width + EPSILON) {
            return `${formatInch(gap - seam)} spacer`;
          }
        }
      }
    }
    if (member.role === 'bottom-rail') {
      const { height, count } = frameBottomParts(run);
      if (height > 0) {
        return `${run.bottom.slice(0, count).map((part) => BOTTOM_PART_LABELS[part.kind].toLowerCase()).join(' & ')} behind`;
      }
    }
    return null;
  };
  return entries.map((entry) => {
    const width = STILE_ROLES.has(entry.role) ? entry.width : entry.height;
    const reason = !sameWidth(width, standards[entry.role]) && reasonFor(entry);
    return reason ? { ...entry, reason } : entry;
  });
}

/** Format frame note text from roles, shop standards and optional member reasons. */
export function frameNotes(entries, standards, { bead = 0, numberOf = () => null } = {}) {
  const notes = [];
  if (bead > 0) {
    const beadText = bead === 0.25 ? '' : ` (${formatInch(bead)} bead)`;
    const outer = formatInch(standards['left-stile']);
    const widths = entries.some((entry) => INTERIOR_ROLES.has(entry.role))
      ? `${outer} outer stiles & rails, ${formatInch(standards.stile)} interior stiles & rails`
      : `${outer} stiles & rails`;
    notes.push(`beaded face frame${beadText} - ${widths}`);
  }

  // Rails run horizontally, so their cross-section width is the rectangle's height.
  const members = entries.map((entry) => ({
    ...entry,
    width: STILE_ROLES.has(entry.role) ? entry.width : entry.height,
  }));
  const differing = members.filter((member) => !sameWidth(member.width, standards[member.role]));
  if (differing.length === 0) return notes;

  if (!differing.some((member) => member.reason)) {
    if (uniformWidth(members)) return [...notes, `${formatInch(members[0].width)} stiles & rails`];
    const stiles = members.filter((member) => STILE_ROLES.has(member.role));
    const rails = members.filter((member) => !STILE_ROLES.has(member.role));
    if (uniformWidth(stiles) && uniformWidth(rails)) {
      return [...notes, `${formatInch(stiles[0].width)} stiles, ${formatInch(rails[0].width)} rails`];
    }
  }

  const groups = [];
  for (const member of differing) {
    const { role, width } = member;
    const reason = member.reason || '';
    const numbers = [...new Set(member.sitsOn.map(numberOf).filter((number) => number != null))]
      .sort((a, b) => a - b);
    let needsLocation = INTERIOR_ROLES.has(role);
    if (role === 'top-rail' || role === 'bottom-rail') {
      needsLocation = !members.filter((other) => other.role === role).every((other) => (
        differing.includes(other) && sameWidth(other.width, width)
      ));
    }
    const location = needsLocation ? numbers.map((number) => `#${number}`).join('/') : '';
    let group = groups.find((other) => other.role === role
      && sameWidth(other.width, width) && other.reason === reason);
    if (!group) {
      group = { role, width, reason, count: 0, locations: [], lowest: Infinity };
      groups.push(group);
    }
    group.count += 1;
    group.lowest = Math.min(group.lowest, numbers[0] ?? Infinity);
    if (location && !group.locations.some((item) => item.text === location)) {
      group.locations.push({ text: location, lowest: numbers[0] });
    }
  }

  groups.sort((a, b) => NOTE_ORDER.indexOf(a.role) - NOTE_ORDER.indexOf(b.role)
    || (a.lowest === b.lowest ? 0 : a.lowest - b.lowest));
  return notes.concat(groups.map((group) => {
    const word = group.role.replace('-', ' ')
      + (INTERIOR_ROLES.has(group.role) && group.count > 1 ? 's' : '');
    const locations = group.locations.sort((a, b) => a.lowest - b.lowest).map((item) => item.text);
    const location = locations.length > 0 ? ` @ ${locations.join(', ')}` : '';
    const reason = group.reason ? ` (${group.reason})` : '';
    return `${formatInch(group.width)} ${word}${location}${reason}`;
  }));
}
