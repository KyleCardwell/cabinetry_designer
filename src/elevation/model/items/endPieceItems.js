import { panelOrientation } from '../cells.js';
import { runEndThickness } from '../panelThickness.js';
import { fillerOrderedDepth, fillerReturnDepth, runFillerThickness } from '../planPieces.js';
import { endPieceBottom, endPieceNotes, resolveStyle, runFrame } from '../styles.js';
import { openBelowDrops } from '../tees.js';
import { formatSize } from './format.js';
import { nosingNote, orderedThickness, TYPE_LABELS } from './shared.js';

export const endPieceItems = {
  kinds: ['corner_return', 'filler', 'end_panel', 'panel', 'shelf'],
  description(part, context) {
    const { run, scene, piece, blindPanel, shelfBack } = context;
    const type = TYPE_LABELS[run?.cabinetTypeId];
    let description;
    if (part.source === 'corner_return') {
      description = `${type} ${part.kind === 'end_panel' ? 'End Panel' : 'Filler'}`;
    } else switch (part.kind) {
      case 'filler': description = `${type} ${blindPanel ? 'Blind Panel' : 'Filler'}`; break;
      case 'end_panel': description = `${type} ${scene.panelPieceIds.has(part.key) ? 'Blind' : 'End'} Panel`; break;
      case 'panel': {
        const orientation = panelOrientation(piece);
        const position = piece?.z + piece?.height / 2 > run.z + run.height / 2 ? 'Top' : 'Bottom';
        description = shelfBack ? 'Shelf Back Panel' : `${type} ${
          orientation === 'side' ? 'Side' : orientation === 'back' ? 'Back' : position
        } Panel`;
        break;
      }
      case 'shelf': description = 'Floating Shelf'; break;
    }
    return description;
  },
  size(part, context, { room, settings }) {
    if (part.source === 'corner_return') {
      const { wall, run, corner, style } = context;
      return part.kind === 'end_panel'
        ? formatSize(corner.depthB, run.height, orderedThickness(corner.returnSide.width, style))
        : formatSize(corner.returnSide.width, run.height, runFillerThickness(room, wall, run, settings));
    }
    const { wall, run, scene, piece, end, blindPanel, style } = context;
    // End parts retain box heights in the numbered list; order the extra open-below overhang too.
    const openDrop = piece && end && !piece.inside && ['filler', 'end_panel'].includes(part.kind)
      ? openBelowDrops(room, run, scene.cells, settings)(piece) : 0;
    const height = openDrop > 0
      ? scene.drawnPieces.find(({ id }) => id === piece.id).height : part.height;
    if (blindPanel) return formatSize(part.width, height,
      orderedThickness(runEndThickness(room, wall, run, settings)[end], style));
    if (part.kind === 'filler') {
      const tee = scene.tees.some((tee) => tee.id === part.key || tee.pieceId === part.key);
      const thickness = tee ? settings.teeThickness + settings.fillerReturnDepth - settings.fillerReturnTongue
        : fillerOrderedDepth(room, wall, run, piece, settings);
      return formatSize(part.width, height, thickness);
    }
    const rect = context.rectangle();
    const depth = rect.front - rect.back;
    switch (part.kind) {
      case 'end_panel': {
        const butted = scene.frames.regions.some((region) => region.legButts
          ?.some((joint) => joint.panelId === part.key));
        // A leg-covered butt keeps the mitered panel's ordered depth behind the frame.
        const orderedDepth = butted ? depth - runFrame(room, run, settings).thickness : depth;
        return formatSize(orderedDepth,
          height, orderedThickness(runEndThickness(room, wall, run, settings)[end], style));
      }
      case 'panel': {
        const orientation = panelOrientation(piece);
        const sizes = orientation === 'side' ? [depth, part.height, part.width]
          : orientation === 'top' ? [part.width, depth, part.height] : [part.width, part.height, depth];
        sizes[2] = orderedThickness(sizes[2], style);
        return formatSize(...sizes);
      }
      case 'shelf': return formatSize(part.width, depth, part.height);
    }
  },
  notes(part, context, { room, settings }) {
    const { run, scene, piece, shapeNotes, style, wall, end } = context;
    const groups = {};
    // Scribe is already in the ordered size, so it gets no note of its own (Kyle 2026-10-23).
    if (part.source === 'corner_return') {
      groups[9] = endPieceNotes(part.kind, endPieceBottom(run, resolveStyle(settings, room, run), settings));
    } else if (['filler', 'end_panel'].includes(part.kind)) {
      const tee = scene.tees.find((tee) => tee.id === part.key || tee.pieceId === part.key);
      const notes = shapeNotes.get(tee?.id ?? part.key) ?? [];
      groups[8] = notes.filter((note) => note.startsWith('T-shape') || note === 'L-shape');
      if (!groups[8].length && part.kind === 'filler' && fillerReturnDepth(run, piece, settings) > 0) {
        const index = scene.cells.pieces.indexOf(piece);
        const returns = [-1, 1].filter((offset) => scene.cells.pieces[index + offset]?.kind === 'cabinet').length;
        groups[8] = returns === 2 ? ['U-shape'] : returns === 1 ? ['L-shape'] : [];
      }
      if (!piece?.extend?.down) {
        groups[9] = tee ? notes.filter((note) => !note.startsWith('T-shape'))
          : endPieceNotes(part.kind, {
            ...endPieceBottom(run, resolveStyle(settings, room, run), settings),
            drop: piece ? piece.z - (scene.drawnPieces.find(({ id }) => id === piece.id)?.z ?? piece.z) : 0,
          });
      }
    }
    if (style && style.id !== 'sheet') {
      let drawn;
      if (part.source === 'corner_return') drawn = context.corner.returnSide.width;
      else if (part.kind === 'end_panel' || context.blindPanel) drawn = runEndThickness(room, wall, run, settings)[end];
      else if (part.kind === 'panel') {
        const orientation = panelOrientation(piece);
        drawn = orientation === 'side' ? part.width : orientation === 'top' ? part.height
          : context.rectangle().front - context.rectangle().back;
      }
      groups[11] = nosingNote(drawn, style);
    }
    return groups;
  },
};
