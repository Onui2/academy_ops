"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LivePartQuote, LivePartPricesResponse } from "@/lib/part-price-service";

export function useLivePartPrices(partIds: string[], enabled = true) {
  const idsKey = useMemo(() => [...new Set(partIds)].sort().join(","), [partIds]);
  const [quotes, setQuotes] = useState<Record<string, LivePartQuote>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled || !idsKey) return;

    setIsLoading(true);

    try {
      const response = await fetch(`/api/parts/prices?ids=${encodeURIComponent(idsKey)}`, {
        method: "GET",
        cache: "no-store"
      });

      if (!response.ok) {
        return;
      }

      const payload = (await response.json()) as LivePartPricesResponse;
      const nextQuotes = payload.items.reduce<Record<string, LivePartQuote>>((acc, item) => {
        acc[item.partId] = item;
        return acc;
      }, {});

      setQuotes(nextQuotes);
      setLastCheckedAt(payload.checkedAt);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, idsKey]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);

  return {
    quotes,
    isLoading,
    lastCheckedAt,
    refresh
  };
}
