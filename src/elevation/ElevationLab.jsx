import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cloudSync } from './store/cloudSync.js';
import { openLocalWorkspace } from './store/cloudThunks.js';
import DesignerEditor from './DesignerEditor.jsx';

/**
 * The Elevation Lab is the localStorage dev-only sandbox (SPEC-DB7): coming here from the
 * shop data finishes its saves, then switches back to this browser's document (SPEC-DB4 g).
 */
export default function ElevationLab() {
  const dispatch = useDispatch();
  const source = useSelector((state) => state.elevation.source);

  // Shop data or an issued version (SPEC-DB8a) → back to this browser's document.
  const away = source === 'cloud' || source === 'version';
  useEffect(() => {
    if (!away) return undefined;
    let cancelled = false;
    cloudSync.flush().then(() => {
      if (!cancelled) dispatch(openLocalWorkspace());
    });
    return () => { cancelled = true; };
  }, [dispatch, away]);

  if (away) {
    return <div className="flex h-full items-center justify-center bg-gray-900 text-gray-400">Opening the sandbox…</div>;
  }
  return <DesignerEditor mode="lab" />;
}
