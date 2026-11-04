import { accessoryText } from '../elevation/model/accessories.js';
import { DEFAULT_SETTINGS } from '../elevation/model/constants.js';
import { sheetThickness } from '../elevation/model/doorStyles.js';
import { getInteriorNode } from '../elevation/model/interiorTree.js';
import { roundTo } from '../elevation/model/units.js';
import { formatInch } from './format.js';

export function faceOrder(a, b) {
  const topA = a.z == null ? 0 : a.z + (a.height ?? 0);
  const topB = b.z == null ? 0 : b.z + (b.height ?? 0);
  return topB - topA || (a.x ?? 0) - (b.x ?? 0);
}

/** Group working fronts by height and tag, retaining their first top-down appearance. */
export function drawerFrontNote(faces = [], slideNames = new Map(), depths = new Map(), accessoryTags = new Map()) {
  const fronts = faces.filter((face) => face.type === 'drawer_front').sort(faceOrder);
  const depthCounts = new Map();
  for (const face of fronts) {
    const depth = depths.get(face.path);
    if (depth != null) depthCounts.set(depth, (depthCounts.get(depth) ?? 0) + 1);
  }
  // Map order breaks equal-frequency ties by the first top-down appearance.
  const commonDepth = [...depthCounts.keys()].reduce((best, depth) =>
    best === null || depthCounts.get(depth) > depthCounts.get(best) ? depth : best, null);
  const groups = new Map();
  for (const face of fronts) {
    const height = roundTo(face.height, 1 / 32);
    const name = slideNames.get(face.path) || null;
    const depth = depths.get(face.path);
    const tag = [name, depth != null && depth !== commonDepth ? `${formatInch(depth)} deep` : null,
      accessoryTags.get(face.path)]
      .filter(Boolean).join(', ');
    const key = JSON.stringify([height, tag]);
    if (!groups.has(key)) groups.set(key, { height, tag, count: 0 });
    groups.get(key).count += 1;
  }
  const notes = [...groups.values()].map(({ height, tag, count }) =>
    `${count} - ${formatInch(height)}${tag ? ` (${tag})` : ''}`);
  if (commonDepth !== null) notes.push(`${formatInch(commonDepth)} ${fronts.length === 1 ? 'drw' : 'drws'}`);
  return groups.size ? `DF's (${notes.join(', ')})` : null;
}

const inside = (x, z, section) => x >= section.x && x <= section.x + section.width
  && z >= section.z && z <= section.z + section.height;

function dividerNote(divider, settings) {
  const { kind, fromBottom, banding, dimFrom } = divider;
  if (kind === 'partition' || kind === 'double_partition') {
    const right = dimFrom === 'right';
    return `${kind === 'double_partition' ? 'dbl pt' : 'pt'} ${formatInch(right ? divider.fromRight : divider.fromLeft)} oc from ${right ? 'R' : 'L'}`;
  }
  if (kind === 'stretcher') return `stretcher up ${formatInch(fromBottom)} oc`;
  const half = sheetThickness(settings) / 2;
  const text = kind === 'double_fixed'
    ? `2 fs (up ${formatInch(fromBottom - half)}, ${formatInch(fromBottom + half)})`
    : `fs up ${formatInch(fromBottom)} oc`;
  return `${text}${banding === false ? ', no banding' : ''}`;
}

function sectionName(direction, count, index) {
  const names = direction === 'vertical'
    ? { 2: ['Top', 'Btm'], 3: ['Top', 'Mid', 'Btm'], 4: ['Top', 'Mid', 'Mid Btm', 'Btm'] }
    : { 2: ['Left', 'Right'], 3: ['Left', 'Mid', 'Right'] };
  return names[count]?.[index] ?? `Sec ${index + 1}`;
}

function rolloutNotes(entry, roomSlideId) {
  const groups = new Map();
  const ordered = [...(entry?.rollouts ?? [])].sort((a, b) => b.z - a.z || a.x - b.x);
  for (const rollout of ordered) {
    const name = rollout.slideId === roomSlideId ? null : rollout.slide.name;
    const key = JSON.stringify([rollout.depth, name]);
    if (!groups.has(key)) groups.set(key, { depth: rollout.depth, name, count: 0 });
    groups.get(key).count += 1;
  }
  return [...groups.values()].map(({ count, depth, name }) =>
    `${count} ro${depth == null ? '' : ` - ${formatInch(depth)}`}${name ? ` (${name})` : ''}`);
}

/** Format already-resolved interior data without changing or resolving the inputs. */
export function interiorNotes({
  interior, shelves = new Map(), rollouts = new Map(), accessories = new Map(), boxes = [], roomSlideId, settings,
  faces = [], slideNames = new Map(), depths = new Map(), accessoryTags = new Map(),
}) {
  const setting = (key) => settings?.[key] ?? DEFAULT_SETTINGS[key];
  const dividersFor = (path) => interior.dividers.filter((divider) => divider.path === path && divider.kind !== 'zone')
    .sort((a, b) => a.index - b.index).map((divider) => dividerNote(divider, settings));
  const physicalSections = interior.physicalSections ?? interior.sections.map((section) => ({
    ...section, key: section.path, members: [section.path],
  }));
  const sections = new Map(physicalSections.map((section) => [section.key, section]));
  const physicalByPath = new Map(physicalSections.flatMap(({ key, members }) => members.map((path) => [path, key])));

  // A drawer front belongs to the section holding its centre, as its drawer box does (IN5).
  const frontsIn = (section) => faces.filter((face) => face.type === 'drawer_front'
    && inside(face.x + face.width / 2, face.z + face.height / 2, section));

  /** One item per note: flags first (Kyle 2026-10-19), then drawer fronts, shelves, roll-outs and accessories. */
  const leafContents = (key) => {
    const section = sections.get(key);
    const shelf = shelves.get(section.members[0]);
    // Match shelfZone's ownership test, including ROT and hamper drawer spaces.
    const hasBox = section && boxes.some(({ space }) => inside(space.x + space.width / 2, space.z + space.height / 2, section));
    const flags = [['lineBore', 'NLB'], ['hinges', 'NPH (No Doors)']]
      .filter(([flag]) => shelf?.[flag] === false && (!hasBox || shelf[`${flag}Source`] === 'manual'))
      .map(([, text]) => text);
    const notes = [flags.join(', '), section ? drawerFrontNote(frontsIn(section), slideNames, depths, accessoryTags) : null];
    const shelfCounts = new Map();
    let shoeCount = 0;
    let thirdRow = false;
    for (const path of section.members) {
      const member = shelves.get(path);
      if (member?.count > 0) {
        let text = 'as';
        if (member.glass) text += ` (${formatInch(setting('glassShelfThickness'))} glass)`;
        else if (member.nosing?.kind === 'hardwood') {
          text += `, no banding - add ${formatInch(setting('shelfNosingHeight'))} nosing`;
        } else if (member.nosing?.kind === 'folded') {
          text += `, +${formatInch(setting('foldedNosingExtra'))} as depth - FF to cut & fold for ${formatInch(setting('shelfNosingHeight'))} nosing`;
        }
        shelfCounts.set(text, (shelfCounts.get(text) ?? 0) + member.count);
      }
      const shoes = member?.shoe?.count ?? 0;
      shoeCount += shoes;
      if ((member?.count ?? 0) + shoes > 0 && accessories.get(path)?.lineBoreRow && member.lineBore) thirdRow = true;
    }
    notes.push(...[...shelfCounts].map(([text, count]) => `${count} ${text}`));
    if (shoeCount > 0) notes.push(`${shoeCount} shoe ${shoeCount === 1 ? 'shelf' : 'shelves'}`);
    if (thirdRow) notes.push('3rd row lb');
    // All roll-out groups are one note, like the DF's.
    notes.push(rolloutNotes({ rollouts: section.members.flatMap((path) => rollouts.get(path)?.rollouts ?? []) }, roomSlideId).join(', '));
    notes.push(section.members.flatMap((path) => accessories.get(path)?.items ?? [])
      .filter(({ accessory }) => accessory?.attachesTo === 'section')
      .map(({ accessory, qty, orderedLength }) =>
        `${qty > 1 ? `${qty} ` : ''}${accessoryText(accessory)}${orderedLength == null ? '' : ` - ${formatInch(orderedLength)}`}`)
      .join(', '));
    return notes.filter(Boolean);
  };

  // Collapse zone-only subtrees and adjacent members before counting/naming report sections.
  const reportTree = (path, node) => {
    if (!node.children) return { key: physicalByPath.get(path) };
    const children = node.children.map((child, index) => reportTree(`${path}.${index}`, child))
      .filter((child, index, all) => !child.key || child.key !== all[index - 1]?.key);
    return children.length === 1 && children[0].key ? children[0] : { path, direction: node.direction, children };
  };
  const childNotes = (node) => node.children.flatMap((child, index) => {
    const contents = child.children
      ? [...dividersFor(child.path), ...childNotes(child)].join(', ')
      : leafContents(child.key).join(', ');
    if (!contents) return [];
    const name = sectionName(node.direction, node.children.length, index);
    return [`${name}${name.startsWith('Sec ') ? '' : ' Sec'} (${contents})`];
  });
  const root = reportTree('r', getInteriorNode(interior.tree, 'r'));
  const outside = faces.filter((face) => !physicalSections.some((section) => frontsIn(section).includes(face)));
  return {
    // One section prints each item on its own line; named sections join them inside their parentheses.
    dividers: root.children ? dividersFor('r') : [],
    sections: root.children ? childNotes(root) : leafContents(root.key),
    fronts: drawerFrontNote(outside, slideNames, depths, accessoryTags),
  };
}
