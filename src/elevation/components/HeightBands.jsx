import { matchingBandFields, MOLDING_NOTES, warningBandId } from '../model/heightBands.js';
import { formatInches } from '../model/units.js';
import PanelSection from './panel/PanelSection.jsx';

export default function HeightBands({ level, fields, renderField, isSet, warnings = [], overlap, extras = {}, query = '' }) {
  const searching = query.trim().length > 0;
  const bands = searching ? matchingBandFields(fields, query) : fields;
  return (
    <div className="space-y-3" data-height-level={level}>
      {bands.map((band) => {
        const rows = band.rows.map((row) => row.map((field) => ({ field, control: renderField(field) }))
          .filter(({ control }) => control != null)).filter((row) => row.length > 0);
        if (!rows.length) return null;
        return (
          <PanelSection
            key={band.id}
            id={`band.${band.id}`}
            title={band.label}
            level={2}
            forceOpen={searching}
            data-height-band={band.id}
            badge={isSet ? band.rows.flat().filter(({ key }) => isSet(key)).length : undefined}
          >
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.map(({ field }) => field.key).join('-')} className={row.length === 2 ? 'grid grid-cols-2 gap-2' : undefined}>
                  {row.map(({ field, control }) => <div key={field.key}>{control}</div>)}
                </div>
              ))}
            </div>
            {band.id === 'crown' && overlap !== undefined && (
              <p className={`mt-2 text-xs ${overlap < 0 ? 'text-amber-500/80' : 'text-gray-500'}`}>
                {overlap < 0 ? 'Gap' : 'Overlap'} {formatInches(Math.abs(overlap))}
              </p>
            )}
            {warnings.filter((warning) => warningBandId(warning) === band.id).map(({ code, slot, ...warning }, index) => (
              <p key={`${code}-${slot ?? index}`} className="mt-1 text-xs text-amber-400">
                {code === 'crown-gap'
                  ? `The top mold doesn't reach the crown (gap of ${formatInches(Math.abs(overlap))}).`
                  : typeof MOLDING_NOTES[code] === 'function' ? MOLDING_NOTES[code](warning) : MOLDING_NOTES[code]}
              </p>
            ))}
            {extras[band.id]}
          </PanelSection>
        );
      })}
    </div>
  );
}
