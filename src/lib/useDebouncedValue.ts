import { useEffect, useState } from 'react';

// Returns a copy of `value` that only updates after `delayMs` of no changes.
// Used to throttle search queries while the user is typing.
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
