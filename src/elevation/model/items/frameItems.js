import { cornerEnd } from '../cornerEnd.js';
import { frameMembers, regionOpenings } from '../frames.js';
import { runFrame } from '../styles.js';
import { cornerFrameNotes } from './cornerNotes.js';
import { formatSize } from './format.js';
import { frameMemberRoles, frameNotes, frameNotchNotes, frameReasons, frameReturnNotes, frameStandards, frameStepReturnNotes } from './frameNotes.js';

export const frameItems = {
  kinds: ['frame'],
  description(part, context) {
    return context.cornerFrame ? `Corner ${context.cornerFrame.kind} Face Frame` : 'Face Frame';
  },
  size(part, context, { room, settings }) {
    if (context.cornerFrame) {
      const { diagonal, frame } = context.cornerFrame;
      return diagonal ? formatSize(diagonal.frontWidth, frame.height, frame.thickness) : '';
    }
    const { run } = context;
    return formatSize(part.width, part.height, runFrame(room, run, settings).thickness);
  },
  notes(part, context, { room, settings, shop, numberOf, doorNotes }) {
    if (context.cornerFrame) {
      const { wall, run, scene, cornerFrame } = context;
      const { returnSide } = cornerEnd(room, wall, run, cornerFrame.side, settings, scene.result);
      return { 10: cornerFrameNotes(cornerFrame, returnSide) };
    }
    const { run, scene, wall } = context;
    const groups = {};
    groups[10] = doorNotes(part.key);
    const region = scene.frames.regions.find(({ id }) => id === part.key);
    const members = region && frameMembers(region, regionOpenings(region, scene.faceLayouts));
    if (members) {
      const bead = runFrame(room, run, settings).bead;
      const standards = frameStandards(shop.insetFrame, bead);
      const entries = frameReasons(room, wall, run, scene, region,
        frameMemberRoles(region, members, scene.cells.pieces), settings, standards);
      groups[10] = frameNotes(entries, standards, { bead, numberOf });
    }
    groups[10] = [...(groups[10] ?? []), ...frameReturnNotes(run, region),
      ...frameNotchNotes(region, scene.cells.pieces, numberOf),
      ...frameStepReturnNotes(run, region, scene.cells, numberOf)];
    return groups;
  },
};
