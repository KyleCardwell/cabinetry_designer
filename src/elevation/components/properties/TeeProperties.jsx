import PanelSection from '../panel/PanelSection.jsx';
import { formatInches } from '../../model/index.js';
import PartReportFields from './PartReportFields.jsx';

export default function TeeProperties({
  room, tee, notes, partNumberField, settings,
}) {
  return (
    <>
      {partNumberField}
      <PartReportFields room={room} partKey={tee.id} kind="filler" settings={settings} autoName="" />
      {notes.length > 0 && (
        <p className="text-xs text-cyan-300">{notes.join(' · ')}</p>
      )}
      <PanelSection id="piece.tee" title={`${tee.orientation === 'vertical' ? 'Vertical' : 'Horizontal'} T-filler`}>
        <div className="grid grid-cols-2 gap-2 rounded border border-gray-700 bg-gray-900/45 p-3 text-xs">
          <div>
            <p className="text-gray-500">Flat width</p>
            <p className="mt-1 text-gray-200">{formatInches(tee.partWidth)}</p>
          </div>
          <div>
            <p className="text-gray-500">Height</p>
            <p className="mt-1 text-gray-200">{formatInches(tee.height)}</p>
          </div>
          <div>
            <p className="text-gray-500">Thickness</p>
            <p className="mt-1 text-gray-200">{formatInches(settings.teeThickness)}</p>
          </div>
          <div>
            <p className="text-gray-500">Return</p>
            <p className="mt-1 text-gray-200">
              {formatInches(settings.fillerReturnThickness)} × {formatInches(settings.fillerReturnDepth)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-gray-500">
          Change it from the cabinet on either side.
        </p>
      </PanelSection>
    </>
  );
}
