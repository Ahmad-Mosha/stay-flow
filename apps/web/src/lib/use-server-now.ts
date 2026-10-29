'use client';

import { useEffect, useState } from 'react';
import { serverNow } from '@/api/server-clock';

/** Server time, ticking. Hold deadlines come from the database clock, not this device's. */
export function useServerNow(intervalMs = 1000): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(serverNow());
    }, intervalMs);
    return () => {
      clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
