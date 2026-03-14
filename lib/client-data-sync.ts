"use client";

const DATA_SYNC_STORAGE_KEY = "financeflow:data-sync-version";
const DATA_SYNC_EVENT_NAME = "financeflow:data-sync-updated";

type DataSyncSource = "returns" | "investments";

export function getDataSyncVersion(): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(DATA_SYNC_STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function publishDataSyncUpdate(source: DataSyncSource): number {
  const version = Date.now();
  if (typeof window === "undefined") return version;
  window.localStorage.setItem(DATA_SYNC_STORAGE_KEY, String(version));
  window.dispatchEvent(
    new CustomEvent(DATA_SYNC_EVENT_NAME, {
      detail: { version, source },
    }),
  );
  return version;
}

export function subscribeDataSync(
  listener: (version: number, source: string | null) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key !== DATA_SYNC_STORAGE_KEY || !event.newValue) return;
    const version = Number(event.newValue);
    if (Number.isFinite(version)) {
      listener(version, null);
    }
  };

  const onCustom = (event: Event) => {
    const custom = event as CustomEvent<{ version?: number; source?: string }>;
    const version = Number(custom.detail?.version);
    if (Number.isFinite(version)) {
      listener(version, custom.detail?.source ?? null);
    }
  };

  window.addEventListener("storage", onStorage);
  window.addEventListener(DATA_SYNC_EVENT_NAME, onCustom as EventListener);

  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(DATA_SYNC_EVENT_NAME, onCustom as EventListener);
  };
}
