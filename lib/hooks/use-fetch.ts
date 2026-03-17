"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseFetchOptions {
  refreshInterval?: number;
  enabled?: boolean;
}

export function useFetch<T>(url: string, options: UseFetchOptions = {}) {
  const { refreshInterval, enabled = true } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json.data ?? json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, [url, enabled]);

  useEffect(() => {
    fetchData();

    if (refreshInterval && enabled) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [fetchData, refreshInterval, enabled]);

  return { data, error, loading, refetch: fetchData };
}
