import { useState } from 'react';
import { useSelector } from 'react-redux';
import { doorMidSection, doorMidSectionDimensions } from '../model/doorSection.js';
import { doorProfileOffsets } from '../model/doorProfileLines.js';
import { midDefaults } from '../model/doorSizes.js';
import SectionSvg from './SectionSvg.jsx';

export default function DoorMidSectionView({ style, design }) {
  const profiles = useSelector((state) => state.elevation.settings.sectionProfiles);
  const [kind, setKind] = useState('stile');
  if (design?.construction !== 'five_piece') return null;

  const widths = midDefaults(style, design, doorProfileOffsets(style, design, profiles));
  const showChips = Math.abs(widths.rail - widths.stile) > 1e-6;
  const selected = showChips ? kind : 'stile';
  const section = doorMidSection(style, design, profiles, selected);

  return (
    <section className="space-y-2">
      {showChips ? (
        <div className="flex gap-2" role="group" aria-label="Mid section">
          {['stile', 'rail'].map((entry) => (
            <button
              key={entry}
              type="button"
              aria-pressed={kind === entry}
              onClick={() => setKind(entry)}
              className={`rounded-full border px-3 py-1 text-xs ${kind === entry
                ? 'border-blue-400 bg-blue-900 text-blue-100'
                : 'border-gray-600 text-gray-300 hover:border-gray-400'}`}
            >
              Mid {entry}
            </button>
          ))}
        </div>
      ) : <h3 className="text-sm font-semibold text-gray-300">Mid section</h3>}
      {section === null ? (
        <p className="text-xs text-gray-400">Too thin to draw a mid section (thickness and half the mid width must be over 1/2").</p>
      ) : (
        <SectionSvg
          section={section}
          dimensions={doorMidSectionDimensions(style, design, profiles, selected)}
          style={style}
          label="Mid section"
        />
      )}
    </section>
  );
}
