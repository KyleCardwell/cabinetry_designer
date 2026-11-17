import { doorLines } from '../elevation/model/items/doorLines.js';
import { withBuildCache } from '../elevation/model/buildCache.js';
import { partNumbers } from '../elevation/model/partNumbers.js';
import { roundTo } from '../elevation/model/units.js';
import { formatInch, formatSize } from '../elevation/model/items/format.js';

const EPSILON = 1e-6;
const SECTIONS = [['drawer_fronts', 'Drawer Fronts'], ['doors', 'Doors'], ['slab', 'Slab']];
const same = (a, b) => Math.abs(a - b) <= EPSILON;

const numberOrder = (number) => typeof number === 'number' ? number : Infinity;

/** Merge only identically numbered, sized (to 1/32), and annotated parts. */
export function mergeLines(items) {
  const lines = new Map();
  for (const { number, width, height, notes = '', qty = 1 } of items) {
    const w = roundTo(width, 1 / 32);
    const h = roundTo(height, 1 / 32);
    const key = JSON.stringify([number, w, h, notes]);
    if (lines.has(key)) lines.get(key).qty += qty;
    else lines.set(key, { number, qty, width: w, height: h, size: formatSize(w, h), notes });
  }
  return [...lines.values()].sort((a, b) =>
    numberOrder(a.number) - numberOrder(b.number) || b.height - a.height || b.width - a.width);
}

function styleNotes(style, design) {
  if (design.construction !== 'five_piece') return null;
  const { left, right } = style.stiles;
  const { top, bottom } = style.rails;
  if ([right, top, bottom].every((width) => same(left, width))) return `${formatInch(left)} Stiles & Rails`;
  const stiles = same(left, right) ? `${formatInch(left)} Stiles`
    : `${formatInch(left)} LS, ${formatInch(right)} RS`;
  const rails = same(top, bottom) ? `${formatInch(top)} Rails`
    : `${formatInch(top)} TR, ${formatInch(bottom)} BR`;
  return `${stiles}, ${rails}`;
}

function pageHeader(style, design, settings, warnings) {
  function profileName(id, fallback, slot) {
    if (!id) return fallback;
    const profile = (settings.sectionProfiles ?? []).find((entry) => entry.id === id);
    if (profile) return profile.name.toUpperCase();
    warnings.push({ code: 'report-profile-missing', styleId: style.id, id, slot });
    return 'MISSING PROFILE';
  }
  const fivePiece = design.construction === 'five_piece';
  return {
    style: design.code?.trim() || design.description?.toUpperCase(),
    wood: style.material || null,
    vendor: design.vendor?.toUpperCase() || null,
    thickness: formatInch(style.thickness),
    edgeProfile: profileName(style.profiles.outside, 'SQUARE', 'outside'),
    insideProfile: fivePiece ? profileName(style.profiles.inside, 'SQUARE', 'inside') : null,
    panelProfile: fivePiece ? profileName(style.profiles.panel, style.panel.type.toUpperCase(), 'panel') : null,
    appliedMoldings: (style.appliedMoldings ?? []).map(({ profileId }) => profileName(profileId, null, 'applied'))
      .filter(Boolean).join(', ') || null,
    notes: [styleNotes(style, design), settings.report?.doorFormNote].filter(Boolean).join(' - ') || null,
  };
}

/** Installed door order pages, preserving vendor grouping and line merging. */
export function doorOrder(room, settings) {
  return withBuildCache(() => {
    const { byKey } = partNumbers(room, settings);
    const { items, warnings: itemWarnings } = doorLines(room, settings);
    const warnings = [...itemWarnings];
    const pages = new Map();
    const styles = new Map();

    function add(part) {
      const { style, design, pieceId, width, height, type } = part;
      let number = byKey.get(pieceId);
      if (number === undefined) {
        number = '?';
        warnings.push({ code: 'report-part-unnumbered', pieceId, key: part.sourceKey });
      }
      if (!styles.has(style.id)) styles.set(style.id, {
        header: pageHeader(style, design, settings, warnings), firstNumber: Infinity,
      });
      const styleData = styles.get(style.id);
      styleData.firstNumber = Math.min(styleData.firstNumber, numberOrder(number));
      const key = `${style.id}:${type}`;
      if (!pages.has(key)) pages.set(key, {
        styleId: style.id, type,
        header: type === 'slab' ? {
          ...styleData.header, insideProfile: null, panelProfile: null,
          notes: settings.report?.doorFormNote || null,
        } : styleData.header,
        items: [],
      });
      const page = pages.get(key);
      page.items.push({ number, width, height, notes: part.notes.join(' - ') });
    }

    for (const item of items) add(item);

    const result = [...styles.entries()].sort(([, a], [, b]) => a.firstNumber - b.firstNumber)
      .flatMap(([styleId]) => SECTIONS.filter(([type]) => pages.has(`${styleId}:${type}`))
        .map(([id, title]) => {
          const { items, ...page } = pages.get(`${styleId}:${id}`);
          return { ...page, sections: [{ id, title, lines: mergeLines(items) }] };
        }));
    return { pages: result, warnings };
  }, room);
}
