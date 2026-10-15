import { useEffect, useState } from 'react';

const isOnline = () => typeof navigator === 'undefined' ? true : navigator.onLine;

export default function useOnline() {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const update = () => setOnline(isOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
