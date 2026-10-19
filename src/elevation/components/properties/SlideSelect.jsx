const SELECT_CLASS = 'w-full rounded border border-gray-600 bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none';

export default function SlideSelect({ value, automatic, slides, label, onChange }) {
  return (
    <select aria-label={label} className={SELECT_CLASS} value={value ?? ''}
      onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{automatic}</option>
      {slides.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
      {value && !slides.some(({ id }) => id === value) && (
        <option value={value}>{`Missing (${value})`}</option>
      )}
    </select>
  );
}
