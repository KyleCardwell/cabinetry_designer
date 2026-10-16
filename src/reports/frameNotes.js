import { DEFAULT_SETTINGS } from '../elevation/model/constants.js';

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
