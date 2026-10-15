import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { cloudSync } from './store/cloudSync.js';
import { openLocalWorkspace } from './store/cloudThunks.js';
import DesignerEditor from './DesignerEditor.jsx';

/**
 * The Elevation Lab is the localStorage sandbox until the import (D7): coming here from the
 * shop data finishes its saves, then switches back to this browser's document (SPEC-DB4 g).
 */
export default function ElevationLab() {
  const dispatch = useDispatch();
  const source = useSelector((state) => state.elevation.source);

  useEffect(() => {
    if (source !== 'cloud') return undefined;
    let cancelled = false;
    cloudSync.flush().then(() => {
      if (!cancelled) dispatch(openLocalWorkspace());
    });
    return () => { cancelled = true; };
  }, [dispatch, source]);

  if (source === 'cloud') {
    return <div className="flex h-full items-center justify-center bg-gray-900 text-gray-400">Opening the sandbox…</div>;
  }
  return <DesignerEditor mode="lab" />;
}
