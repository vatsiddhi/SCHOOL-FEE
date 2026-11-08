import { useEffect, useState } from "react";
import { http } from "./api";

const cache = new Map<string, Promise<any[]>>();
/** Small lookup loader for dropdowns. Pass bust=true after edits. */
export function useList<T = any>(endpoint: string, bust = 0): T[] {
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    const key = endpoint + "#" + bust;
    if (!cache.has(key)) cache.set(key, http.get<any[]>(endpoint).catch(() => []));
    cache.get(key)!.then(setRows);
  }, [endpoint, bust]);
  return rows;
}
export const clearLists = () => cache.clear();
