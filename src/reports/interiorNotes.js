import { DEFAULT_SETTINGS } from '../elevation/model/constants.js';
import { sheetThickness } from '../elevation/model/doorStyles.js';
import { getInteriorNode } from '../elevation/model/interiorTree.js';
import { formatInch } from './format.js';

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
export function interiorNotes({ interior, shelves = new Map(), rollouts = new Map(), boxes = [], roomSlideId, settings }) {
  const setting = (key) => settings?.[key] ?? DEFAULT_SETTINGS[key];
  const dividersFor = (path) => interior.dividers.filter((divider) => divider.path === path)
    .sort((a, b) => a.index - b.index).map((divider) => dividerNote(divider, settings));
  const sections = new Map(interior.sections.map((section) => [section.path, section]));

  const leafContents = (path) => {
    const shelf = shelves.get(path);
    const notes = [];
    if (shelf?.count > 0) {
      let text = `${shelf.count} as`;
      if (shelf.glass) text += ` (${formatInch(setting('glassShelfThickness'))} glass)`;
      else if (shelf.nosing?.kind === 'hardwood') {
        text += `, no banding - add ${formatInch(setting('shelfNosingHeight'))} nosing`;
      } else if (shelf.nosing?.kind === 'folded') {
        text += `, +${formatInch(setting('foldedNosingExtra'))} as depth - FF to cut & fold for ${formatInch(setting('shelfNosingHeight'))} nosing`;
      }
      notes.push(text);
    }
    notes.push(...rolloutNotes(rollouts.get(path), roomSlideId));
    const section = sections.get(path);
    // Match shelfZone's ownership test, including ROT and hamper drawer spaces.
    const hasBox = section && boxes.some(({ space }) => {
      const x = space.x + space.width / 2;
      const z = space.z + space.height / 2;
      return x >= section.x && x <= section.x + section.width
        && z >= section.z && z <= section.z + section.height;
    });
    for (const [flag, text] of [['lineBore', 'NLB'], ['hinges', 'NPH (No Doors)']]) {
      if (shelf?.[flag] === false && (!hasBox || shelf[`${flag}Source`] === 'manual')) notes.push(text);
    }
    return notes.join(', ');
  };

  const childNotes = (path, node) => node.children.flatMap((_, index) => {
    const childPath = `${path}.${index}`;
    const child = getInteriorNode(interior.tree, childPath);
    const contents = child.children
      ? [...dividersFor(childPath), ...childNotes(childPath, child)].join(', ')
      : leafContents(childPath);
    if (!contents) return [];
    const name = sectionName(node.direction, node.children.length, index);
    return [`${name}${name.startsWith('Sec ') ? '' : ' Sec'} (${contents})`];
  });
  const root = getInteriorNode(interior.tree, 'r');
  return root.children
    ? { dividers: dividersFor('r'), sections: childNotes('r', root) }
    : { dividers: [], sections: [leafContents('r')].filter(Boolean) };
}
