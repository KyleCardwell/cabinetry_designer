import {
  DEFAULT_DESIGN_ID,
  DOOR_DESIGNS,
  findDoorDesign,
  teamDoorStyle,
} from './doorStyles.js';

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

export function panelLevels(room, wall, run, part) {
  return [
    { level: 'part', node: part },
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

export function resolveDoorStyle(room, settings, partType, levels, designs = DOOR_DESIGNS) {
  const styles = room?.doorStyles ?? [];
  const warnings = [];
  let style;
  let source;

  function pick({ level, node }, key) {
    const id = node[key];
    if (id === null || id === undefined) return false;
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
