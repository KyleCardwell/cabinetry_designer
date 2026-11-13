import { useSelector } from 'react-redux';
import { doorSection, doorSectionDimensions } from '../model/doorSection.js';
import { doorProfileOffsets } from '../model/doorProfileLines.js';
import SectionSvg from './SectionSvg.jsx';

const SLOT_LABELS = {
  outside: 'Outside edge',
  inside: 'Inside profile',
  panel: 'Raised panel',
  applied: 'Applied molding',
};
const slotLabel = (slot, index) => slot === 'applied' ? `Applied molding ${index + 1}` : SLOT_LABELS[slot];

export default function DoorSectionView({ style, design }) {
  const profiles = useSelector((state) => state.elevation.settings.sectionProfiles);
  const section = doorSection(style, design, profiles);
  const warnings = doorProfileOffsets(style, design, profiles).warnings;
  const thinMessages = warnings.filter(({ code }) => code === 'door-profile-too-thin').map(({ slot }) => (
    <p key={slot} className="text-xs text-amber-300">{SLOT_LABELS[slot]} can't shrink to this thickness — shown unstretched</p>
  ));
  const deep = warnings.filter(({ code }) => code === 'door-profile-too-deep').map(({ slot }) => SLOT_LABELS[slot]);

  if (section === null) {
    return (
      <>
        <p className="text-xs text-gray-400">Too thin to draw a section (thickness and stile/inset must be over 1/2").</p>
        {thinMessages}
      </>
    );
  }

  return (
    <>
      <SectionSvg
        section={section}
        dimensions={doorSectionDimensions(style, design, profiles)}
        style={style}
        label="Door section"
      />
      <p className="text-xs text-gray-400">
        Half section through the left stile, front face up, at this style's thickness and width. Open lines cut the wood back to the face; closed shapes are applied. Raised panels draw over the flat panel for now.
      </p>
      {section.skipped.length > 0 && (
        <p className="text-xs text-amber-300">
          Not shown (missing or wrong kind): {warnings.filter(({ code }) => code === 'door-profile-missing')
            .map(({ slot, index }) => slotLabel(slot, index)).join(', ')}.
        </p>
      )}
      {thinMessages}
      {deep.length > 0 && (
        <p className="text-xs text-amber-300">Cuts deeper than the door is thick: {deep.join(', ')}.</p>
      )}
    </>
  );
}
