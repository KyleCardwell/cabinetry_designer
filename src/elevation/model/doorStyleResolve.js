import {
  DEFAULT_DESIGN_ID,
  DOOR_DESIGNS,
  findDoorDesign,
  sheetPanelStyle,
  teamDoorStyle,
} from './doorStyles.js';
import { gridLeaves } from './grid.js';
import { doorProfileOffsets, inset } from './doorProfileLines.js';
import { midDefaults, partSizes } from './doorSizes.js';

export function facePartType(type) {
  if (type === 'open') return null;
  return type === 'drawer_front' ? 'drawer_front' : 'door';
}

export function cabinetFaceLevels(room, wall, run, cabinet, face) {
  return [
    { level: 'face', node: face },
    { level: 'cabinet', node: cabinet },
    { level: 'run', node: run },
    { level: 'wall', node: wall },
    { level: 'room', node: room },
  ].filter(({ node }) => node !== null && node !== undefined);
}

export function panelLevels(room, wall, run, part, { sheet = false } = {}) {
  return [
    { level: 'part', node: part },
    ...(sheet ? [{ level: 'spot', node: { panelStyleId: 'sheet' } }] : []),
    { level: 'run', node: run },
    { level: 'wall', node: wall },
    { level: 'room', node: room },
  ].filter(({ node }) => node !== null && node !== undefined);
}

const CHAIN_KEYS = {
  door: ['doorStyleId'],
  drawer_front: ['drawerFrontStyleId', 'doorStyleId'],
  panel: ['panelStyleId', 'doorStyleId'],
};

export function resolveDoorStyle(room, settings, partType, levels, designs = settings?.doorDesigns ?? DOOR_DESIGNS) {
  const styles = room?.doorStyles ?? [];
  const warnings = [];
  let style;
  let source;

  function pick({ level, node }, key) {
    const id = node[key];
    if (id === null || id === undefined) return false;
    if (id === 'default') {
      style = teamDoorStyle(settings);
      source = { level, key };
      return true;
    }
    if (id === 'sheet') {
      if (partType === 'panel') {
        style = sheetPanelStyle(settings);
        source = { level, key };
        return true;
      }
      warnings.push({ code: 'door-style-missing', level, id });
      return false;
    }
    const candidate = styles.find((entry) => entry.id === id);
    if (!candidate) {
      warnings.push({ code: 'door-style-missing', level, id });
      return false;
    }
    style = candidate;
    source = { level, key };
    return true;
  }

  const isPart = ({ level }) => level === 'face' || level === 'part';
  const partLevels = levels.filter(isPart);
  const otherLevels = levels.filter((entry) => !isPart(entry));

  // Exhaust each chain before falling back to the next, even at a nearer level.
  if (!partLevels.some((entry) => pick(entry, 'styleId'))) {
    for (const key of CHAIN_KEYS[partType]) {
      if (otherLevels.some((entry) => pick(entry, key))) break;
    }
  }

  if (!style) {
    style = teamDoorStyle(settings);
    source = { level: 'team', key: null };
  }

  let design = findDoorDesign(style.designId, designs);
  if (design === null) {
    design = findDoorDesign(DEFAULT_DESIGN_ID, designs) ?? DOOR_DESIGNS[0];
    warnings.push({ code: 'door-design-missing', id: style.designId });
  }

  return { style, design, source, warnings };
}

/** Whether a face at its profiled size keeps its outside profile after the short-face rule. */
export function faceEdgeProfiled(room, wall, run, item, faceNode, rect, settings) {
  const partType = facePartType(faceNode.type);
  if (partType === null) return false;
  const { style, design } = resolveDoorStyle(
    room, settings, partType, cabinetFaceLevels(room, wall, run, item, faceNode),
  );
  if (!style.profiles.outside) return false;
  const offsets = doorProfileOffsets(style, design, settings?.sectionProfiles ?? []);
  const core = inset(rect, offsets.slots.outside?.reachOut ?? 0);
  const sizeRect = design.construction === 'slab' ? rect : core;
  return partSizes(style, design, {
    width: sizeRect.width, height: sizeRect.height, coreHeight: core.height, sizes: faceNode.sizes,
  }, midDefaults(style, design, offsets)).slab !== 'rule';
}

/** The resolved style and design of every non-open cabinet face in a run. */
export function runFaceStyles(room, wall, run, settings) {
  const faces = [];
  function visit(node, cabinet) {
    if (node.type) {
      if (node.type === 'open') return;
      const { style, design } = resolveDoorStyle(
        room, settings, facePartType(node.type),
        cabinetFaceLevels(room, wall, run, cabinet, node),
      );
      faces.push({ style, design });
      return;
    }
    for (const child of node.children) visit(child, cabinet);
  }
  for (const cabinet of run.grid ? gridLeaves(run.grid) : []) {
    if (cabinet.kind === 'cabinet') visit(cabinet.face ?? { type: 'door' }, cabinet);
  }
  return faces;
}

/** The thickest non-open cabinet face in a run (SPEC-46 P11). */
export function runDoorThickness(room, wall, run, settings) {
  const faces = runFaceStyles(room, wall, run, settings);
  return faces.length ? Math.max(...faces.map(({ style }) => style.thickness))
    : teamDoorStyle(settings).thickness;
}
