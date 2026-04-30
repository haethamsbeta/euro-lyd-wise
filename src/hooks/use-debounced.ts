import { useEffect, useState } from "react";

/**
 * Returns a value that only updates after `delay` ms have passed without
 * further changes. Useful for search inputs feeding React Query keys so we
 * don't refetch on every keystroke.
 */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
