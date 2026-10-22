"use client";
import { useCallback, useEffect, useState } from "react";
import { call, ClientApiError } from "./client-api";
import { messageFor } from "./messages";

export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const reload = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try { setData(await call<T>(path)); setError(null); }
    catch (e) { setError(messageFor(e instanceof ClientApiError ? e.code : undefined)); }
    finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}
