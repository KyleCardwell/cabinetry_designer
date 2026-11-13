import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { setReportPartField } from '../../store/elevationSlice.js';
import { controlBorder } from '../overrideHelpers.js';
import Field from './Field.jsx';

export function ReportTextField({
  label, value = '', onCommit, maxLength, placeholder, overridden = false, multiline = false,
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const Control = multiline ? 'textarea' : 'input';

  const commit = () => {
    const trimmed = text.trim();
    onCommit(trimmed);
    setText(trimmed);
  };

  return (
    <Field label={label}>
      <Control
        type={multiline ? undefined : 'text'}
        rows={multiline ? 3 : undefined}
        aria-label={label}
        value={text}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (!multiline && event.key === 'Enter') event.currentTarget.blur();
        }}
        className={`w-full rounded border ${controlBorder(overridden)} bg-gray-900 px-2.5 py-1.5 text-sm text-gray-100 focus:border-blue-500 focus:outline-none`}
      />
    </Field>
  );
}

export default function PartReportFields({ room, partKey, kind, settings, autoName }) {
  const dispatch = useDispatch();
  const entry = room.reportParts?.[partKey] ?? {};
  const commit = (field, value) => dispatch(setReportPartField({
    roomId: room.id, key: partKey, field, value,
  }));
  const textField = (field, label, maxLength, placeholder) => (
    <ReportTextField
      key={`${room.id}:${partKey}:${field}`}
      label={label}
      value={entry[field] ?? ''}
      maxLength={maxLength}
      placeholder={placeholder}
      overridden={field !== 'note' && Boolean(entry[field])}
      onCommit={(value) => commit(field, value)}
    />
  );

  return (
    <div className="space-y-2">
      {kind === 'cabinet' && textField('name', 'Name', 60, autoName ?? '')}
      {kind === 'cabinet' && textField('boxes', 'Boxes', 120, settings?.report?.boxMaterial || 'Room boxes')}
      <label className="flex items-center gap-2 text-xs text-gray-400">
        <input
          type="checkbox"
          aria-label="Shop-built"
          checked={entry.shopBuilt === true}
          onChange={(event) => commit('shopBuilt', event.target.checked)}
        />
        Shop-built
      </label>
      {textField('note', 'Note', 200)}
    </div>
  );
}
