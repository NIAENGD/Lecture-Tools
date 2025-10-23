import { useEffect, useState } from 'react';

export const useReducedMotionPreference = () => {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(media.matches);

    const handler = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    media.addEventListener('change', handler);

    return () => media.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    document.body.dataset.reducedMotion = reducedMotion ? 'true' : 'false';
  }, [reducedMotion]);

  return reducedMotion;
};
