"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getDataSyncVersion, subscribeDataSync } from "../../lib/client-data-sync";

export function DataRefreshBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const lastAppliedRef = useRef(0);

  useEffect(() => {
    lastAppliedRef.current = getDataSyncVersion();
  }, []);

  useEffect(() => {
    return subscribeDataSync((version) => {
      if (version <= lastAppliedRef.current) return;
      lastAppliedRef.current = version;
      router.refresh();
    });
  }, [router]);

  useEffect(() => {
    const latestVersion = getDataSyncVersion();
    if (latestVersion <= lastAppliedRef.current) return;
    lastAppliedRef.current = latestVersion;
    router.refresh();
  }, [pathname, router]);

  return null;
}
