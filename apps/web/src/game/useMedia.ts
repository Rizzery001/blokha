import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const supported = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const get = () => (supported() ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (!supported()) return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
