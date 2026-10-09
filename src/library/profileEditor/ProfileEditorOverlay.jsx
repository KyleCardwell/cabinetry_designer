import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ProfileEditor from './ProfileEditor.jsx';

export default function ProfileEditorOverlay({ profileId, backLabel, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    ref.current.focus();
    return () => previousFocus?.focus();
  }, []);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Profile editor"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col bg-gray-900 outline-none"
    >
      <ProfileEditor key={profileId} profileId={profileId} backLabel={backLabel} onClose={onClose} />
    </div>,
    document.body,
  );
}
