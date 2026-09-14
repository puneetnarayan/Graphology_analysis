"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas } from "@/utils/canvas";
import { saveBackupHandle, loadBackupHandle, clearBackupHandle } from "@/utils/fileHandleStore";
import type { FormationEntry } from "@/types";

const STORAGE_KEY = "graphology_formations_v1";
/** Formation reference images are small illustrative crops, not full samples — keep them light. */
const MAX_FORMATION_IMAGE_DIM = 400;
/** Wait for a quiet moment after the last change before writing the auto-backup file. */
const AUTO_BACKUP_DEBOUNCE_MS = 800;

function readFromStorage(): FormationEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeToStorage(entries: FormationEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage disabled — the in-memory list still works for this session.
  }
}

/** Downscales an uploaded image and returns it as a compact JPEG data URL for storage. */
async function fileToStoredDataUrl(file: File): Promise<string> {
  const img = await loadImageElement(file);
  const canvas = toAnalysisCanvas(imageElementToCanvas(img), MAX_FORMATION_IMAGE_DIM);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function isFormationEntry(v: unknown): v is FormationEntry {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return typeof e.imageDataUrl === "string" && typeof e.detail === "string" && typeof e.trait === "string";
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type AutoBackupStatus = "unsupported" | "disabled" | "active" | "permission-needed" | "error";

/**
 * Client-side, browser-local library of user-contributed letter-formation
 * examples (image + detail + trait). Stored in localStorage — the reference
 * images never leave the browser, same privacy guarantee as the rest of the
 * app — plus:
 *
 * - Manual export/import as a JSON file, which works in every browser and is
 *   the only real backup against clearing this browser's site data (that
 *   wipes localStorage and the auto-backup file handle together).
 * - Optional automatic backup to a file on disk via the File System Access
 *   API (Chromium browsers only): once granted, every change is written to
 *   that same file with no further prompts, so a manual export is never
 *   strictly required — but export/import is still there as the universal
 *   fallback where that API isn't available (Firefox, Safari) or the grant
 *   lapses.
 *
 * Call this once and share the returned object — it holds the single source
 * of truth for the list; don't call it again per sub-component, or each
 * instance's local state can drift from the others until it happens to
 * remount.
 */
export function useFormations() {
  // Read once, synchronously, on first client render — this app has no SSR data
  // dependent on this list, so there's nothing to hydrate-mismatch against.
  const [formations, setFormations] = useState<FormationEntry[]>(() => readFromStorage());
  const [loaded] = useState(true);

  const supported = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";

  const [autoBackupStatus, setAutoBackupStatus] = useState<AutoBackupStatus>(() => (supported ? "disabled" : "unsupported"));
  const [autoBackupFileName, setAutoBackupFileName] = useState<string | null>(null);
  const [autoBackupError, setAutoBackupError] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const handleRef = useRef<FileSystemFileHandle | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstFormationsEffect = useRef(true);

  // On mount, see if a backup file handle was granted in a previous session.
  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const handle = await loadBackupHandle();
        if (!handle || cancelled) return;
        const permission = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "granted";
        handleRef.current = handle;
        setAutoBackupFileName(handle.name);
        setAutoBackupStatus(permission === "granted" ? "active" : "permission-needed");
      } catch {
        // No stored handle yet, or it can't be read back — treat as disabled.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const writeBackupNow = useCallback(async (entries: FormationEntry[]) => {
    const handle = handleRef.current;
    if (!handle) return;
    try {
      const writable = await handle.createWritable();
      await writable.write(JSON.stringify({ exportedAt: new Date().toISOString(), formations: entries }, null, 2));
      await writable.close();
      setLastBackupAt(new Date().toISOString());
      setAutoBackupStatus("active");
      setAutoBackupError(null);
    } catch (err) {
      setAutoBackupStatus("error");
      setAutoBackupError(err instanceof Error ? err.message : "Auto-backup write failed.");
    }
  }, []);

  // Debounced auto-backup: write the connected file shortly after formations change.
  useEffect(() => {
    if (isFirstFormationsEffect.current) {
      isFirstFormationsEffect.current = false;
      return;
    }
    if (autoBackupStatus !== "active" || !handleRef.current) return;
    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(() => {
      writeBackupNow(formations);
    }, AUTO_BACKUP_DEBOUNCE_MS);
    return () => {
      if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formations]);

  const enableAutoBackup = useCallback(async () => {
    if (!supported || typeof window.showSaveFilePicker !== "function") return;
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "graphology-formations-backup.json",
        types: [{ description: "JSON backup", accept: { "application/json": [".json"] } }],
      });
      const permission = (await handle.requestPermission?.({ mode: "readwrite" })) ?? "granted";
      if (permission !== "granted") {
        setAutoBackupStatus("permission-needed");
        return;
      }
      handleRef.current = handle;
      await saveBackupHandle(handle);
      setAutoBackupFileName(handle.name);
      setAutoBackupStatus("active");
      setAutoBackupError(null);
      await writeBackupNow(formations);
    } catch (err) {
      // AbortError = user cancelled the picker; not a real error.
      if (err instanceof Error && err.name === "AbortError") return;
      setAutoBackupStatus("error");
      setAutoBackupError(err instanceof Error ? err.message : "Could not connect a backup file.");
    }
  }, [formations, supported, writeBackupNow]);

  const reconnectAutoBackup = useCallback(async () => {
    const handle = handleRef.current;
    if (!handle) return enableAutoBackup();
    try {
      const permission = (await handle.requestPermission?.({ mode: "readwrite" })) ?? "granted";
      if (permission === "granted") {
        setAutoBackupStatus("active");
        setAutoBackupError(null);
        await writeBackupNow(formations);
      } else {
        setAutoBackupStatus("permission-needed");
      }
    } catch (err) {
      setAutoBackupStatus("error");
      setAutoBackupError(err instanceof Error ? err.message : "Could not reconnect the backup file.");
    }
  }, [enableAutoBackup, formations, writeBackupNow]);

  const disableAutoBackup = useCallback(async () => {
    handleRef.current = null;
    setAutoBackupFileName(null);
    setAutoBackupStatus(supported ? "disabled" : "unsupported");
    setAutoBackupError(null);
    await clearBackupHandle();
  }, [supported]);

  const addFormation = useCallback(
    async (file: File, detail: string, trait: string, category: string, subCategory: string) => {
      const imageDataUrl = await fileToStoredDataUrl(file);
      const entry: FormationEntry = {
        id: newId(),
        imageDataUrl,
        detail: detail.trim(),
        trait: trait.trim(),
        category: category.trim(),
        subCategory: subCategory.trim(),
        createdAt: new Date().toISOString(),
      };
      setFormations((prev) => {
        const next = [entry, ...prev];
        writeToStorage(next);
        return next;
      });
      return entry;
    },
    [],
  );

  const removeFormation = useCallback((id: string) => {
    setFormations((prev) => {
      const next = prev.filter((f) => f.id !== id);
      writeToStorage(next);
      return next;
    });
  }, []);

  /** Downloads the current library as a JSON file — works in every browser, no permissions needed. */
  const exportFormations = useCallback(() => {
    const payload = { exportedAt: new Date().toISOString(), formations };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `graphology-formations-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [formations]);

  /**
   * Restores a previously exported (or auto-backed-up) JSON file.
   * `mode: "merge"` adds entries not already present (re-IDing any id
   * collision so nothing existing is overwritten); `"replace"` discards the
   * current library and adopts the file's contents exactly.
   */
  const importFormations = useCallback(async (file: File, mode: "merge" | "replace") => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incomingRaw = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.formations) ? parsed.formations : null;
    if (!incomingRaw) throw new Error("This file doesn't look like a Letter Formations backup.");
    const incoming = incomingRaw.filter(isFormationEntry).map((e: FormationEntry) => ({
      id: typeof e.id === "string" && e.id ? e.id : newId(),
      imageDataUrl: e.imageDataUrl,
      detail: e.detail,
      trait: e.trait,
      category: e.category ?? "",
      subCategory: e.subCategory ?? "",
      createdAt: e.createdAt ?? new Date().toISOString(),
    }));
    if (incoming.length === 0) throw new Error("No valid formation entries found in this file.");

    setFormations((prev) => {
      let next: FormationEntry[];
      if (mode === "replace") {
        next = incoming;
      } else {
        const existingIds = new Set(prev.map((f) => f.id));
        const deduped = incoming.map((e: FormationEntry) => (existingIds.has(e.id) ? { ...e, id: newId() } : e));
        next = [...deduped, ...prev];
      }
      writeToStorage(next);
      return next;
    });
    return incoming.length;
  }, []);

  return {
    formations,
    loaded,
    addFormation,
    removeFormation,
    exportFormations,
    importFormations,
    autoBackup: {
      supported,
      status: autoBackupStatus,
      fileName: autoBackupFileName,
      lastBackupAt,
      error: autoBackupError,
      enable: enableAutoBackup,
      reconnect: reconnectAutoBackup,
      disable: disableAutoBackup,
    },
  };
}
