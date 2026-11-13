import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { leaveProjectPresence } from '../elevation/store/presenceThunks.js';

export function inProject(pathname) {
  return /^\/projects\/[^/]+(?:\/|$)/.test(pathname);
}

export default function useLeaveProjectPresence() {
  const { pathname } = useLocation();
  const dispatch = useDispatch();
  useEffect(() => {
    if (!inProject(pathname)) dispatch(leaveProjectPresence());
  }, [dispatch, pathname]);
}
