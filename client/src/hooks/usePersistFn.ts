import { useRef } from "react";

type Callback = (...args: any[]) => any;

/** Returns a stable callback reference while always invoking the latest function. */
export function usePersistFn<T extends Callback>(fn: T) {
  const fnRef = useRef<T>(fn);
  fnRef.current = fn;

  const stableRef = useRef<T | null>(null);
  if (!stableRef.current) {
    stableRef.current = function (this: unknown, ...args: Parameters<T>) {
      return fnRef.current.apply(this, args);
    } as T;
  }

  return stableRef.current;
}
