import { useDispatch } from 'react-redux';
import { setPartNumberOverride } from '../../store/elevationSlice.js';

function Field({ label, children }) {
  return (
    <label className="block text-xs text-gray-400">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

export default function PartNumberField({
  roomId,
  partKey,
  autoNumber,
  override,
  duplicate,
}) {
  const dispatch = useDispatch();

  return (
    <Field label="Part number">
      <input
        type="number"
        min="1"
        step="1"
        value={override ?? ''}
        placeholder={String(autoNumber ?? '')}
        onChange={(event) => {
          const value = event.target.value;
          if (value === '') {
            dispatch(setPartNumberOverride({ roomId, key: partKey, number: null }));
            return;
          }
          const number = Number(value);
          if (Number.isInteger(number) && number > 0) {
            dispatch(setPartNumberOverride({ roomId, key: partKey, number }));
          }
        }}
        aria-label="Part number"
        className={`w-full rounded border bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:outline-none ${
          duplicate
            ? 'border-amber-500 focus:border-amber-400'
            : 'border-gray-600 focus:border-blue-500'
        }`}
      />
    </Field>
  );
}
