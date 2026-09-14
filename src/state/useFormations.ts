"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas } from "@/utils/canvas";
import { saveBackupHandle, loadBackupHandle, clearBackupHandle } from "@/utils/fileHandleStore";
import { dbGetAll, dbPut, dbDelete, dbClear, dbBulkPut, migrateFromLocalStorage } from "@/utils/formationsDb";
import type { FormationEntry } from "@/types";

/** Formation reference images are small illustrative crops, not full samples — keep them light. */
const MAX_FORMATION_IMAGE_DIM = 400;
/** Wait for a quiet moment after the last change before writing the auto-backup file. */
const AUTO_BACKUP_DEBOUNCE_MS = 800;

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

function hasAnyContent(fields: { category?: string; subCategory?: string; detail?: string; trait?: string }, hasImage: boolean): boolean {
  return (
    hasImage ||
    !!fields.category?.trim() ||
    !!fields.subCategory?.trim() ||
    !!fields.detail?.trim() ||
    !!fields.trait?.trim()
  );
}

/**
 * Client-side, browser-local library of user-contributed letter-formation
 * examples (image + detail + trait). Stored in IndexedDB (`src/utils/formationsDb.ts`)
 * — the reference images never leave the browser, same privacy guarantee as
 * the rest of the app. IndexedDB replaced an earlier localStorage-based
 * store (capped around 5-10MB, which a growing library of embedded images
 * would eventually exhaust); any pre-existing localStorage library is
 * migrated over automatically, once, the first time this loads after the
 * update. Plus:
 *
 * - Manual export/import as a JSON file, which works in every browser and is
 *   the only real backup against clearing this browser's site data (that
 *   wipes IndexedDB and the auto-backup file handle together).
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
  const [formations, setFormations] = useState<FormationEntry[]>([]);
  /** False until the initial IndexedDB read (and one-time legacy-localStorage migration) completes. */
  const [loaded, setLoaded] = useState(false);
  /** True once something has changed since the last export/backup-file write — drives the periodic backup reminder. */
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load from IndexedDB on mount, migrating any pre-existing localStorage
  // library over first (see src/utils/formationsDb.ts) — a no-op after the
  // first successful run.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await migrateFromLocalStorage();
        const entries = await dbGetAll();
        if (cancelled) return;
        entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setFormations(entries);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const supported = typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";

  const [autoBackupStatus, setAutoBackupStatus] = useState<AutoBackupStatus>(() => (supported ? "disabled" : "unsupported"));
  const [autoBackupFileName, setAutoBackupFileName] = useState<string | null>(null);
  const [autoBackupError, setAutoBackupError] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const handleRef = useRef<FileSystemFileHandle | null>(null);
  const backupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setHasUnsavedChanges(false);
    } catch (err) {
      setAutoBackupStatus("error");
      setAutoBackupError(err instanceof Error ? err.message : "Auto-backup write failed.");
    }
  }, []);

  // Debounced auto-backup: write the connected file shortly after formations
  // change. Gated on `loaded` so the initial IndexedDB read populating
  // `formations` doesn't itself count as a change worth backing up.
  useEffect(() => {
    if (!loaded || autoBackupStatus !== "active" || !handleRef.current) return;
    if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = setTimeout(() => {
      writeBackupNow(formations);
    }, AUTO_BACKUP_DEBOUNCE_MS);
    return () => {
      if (backupTimerRef.current) clearTimeout(backupTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formations, loaded]);

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

  /**
   * `file` is optional — incomplete entries (e.g. a trait you want to note
   * down before you have an image for it) are allowed, as long as at least
   * one field isn't blank. Throws if every field would be empty.
   */
  const addFormation = useCallback(
    async (file: File | null, detail: string, trait: string, category: string, subCategory: string) => {
      if (!hasAnyContent({ category, subCategory, detail, trait }, !!file)) {
        throw new Error("Add at least an image or one field before saving.");
      }
      const imageDataUrl = file ? await fileToStoredDataUrl(file) : undefined;
      const entry: FormationEntry = {
        id: newId(),
        imageDataUrl,
        detail: detail.trim(),
        trait: trait.trim(),
        category: category.trim(),
        subCategory: subCategory.trim(),
        createdAt: new Date().toISOString(),
      };
      setFormations((prev) => [entry, ...prev]);
      await dbPut(entry);
      setHasUnsavedChanges(true);
      return entry;
    },
    [],
  );

  /**
   * Inline-edits an existing entry. `file === null` clears the image,
   * `file === undefined` (the default) leaves it untouched, and a `File`
   * replaces it — covers drag-drop/upload/paste-driven image replacement.
   */
  const updateFormation = useCallback(
    async (
      id: string,
      patch: { file?: File | null; detail?: string; trait?: string; category?: string; subCategory?: string },
    ) => {
      const imageDataUrl = patch.file === undefined ? undefined : patch.file === null ? null : await fileToStoredDataUrl(patch.file);
      let updated: FormationEntry | null = null;
      setFormations((prev) =>
        prev.map((f) => {
          if (f.id !== id) return f;
          updated = {
            ...f,
            ...(imageDataUrl === undefined ? {} : { imageDataUrl: imageDataUrl ?? undefined }),
            ...(patch.detail !== undefined ? { detail: patch.detail.trim() } : {}),
            ...(patch.trait !== undefined ? { trait: patch.trait.trim() } : {}),
            ...(patch.category !== undefined ? { category: patch.category.trim() } : {}),
            ...(patch.subCategory !== undefined ? { subCategory: patch.subCategory.trim() } : {}),
          };
          return updated;
        }),
      );
      if (updated) await dbPut(updated);
      setHasUnsavedChanges(true);
    },
    [],
  );

  const removeFormation = useCallback(async (id: string) => {
    setFormations((prev) => prev.filter((f) => f.id !== id));
    await dbDelete(id);
    setHasUnsavedChanges(true);
  }, []);

  /** Call after a manual export or an auto-backup write to clear the "unsaved" reminder state. */
  const markBackedUp = useCallback(() => setHasUnsavedChanges(false), []);

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
    setHasUnsavedChanges(false);
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

    if (mode === "replace") {
      setFormations(incoming);
      await dbClear();
      await dbBulkPut(incoming);
    } else {
      let deduped: FormationEntry[] = [];
      setFormations((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        deduped = incoming.map((e: FormationEntry) => (existingIds.has(e.id) ? { ...e, id: newId() } : e));
        return [...deduped, ...prev];
      });
      await dbBulkPut(deduped);
    }
    return incoming.length;
  }, []);

  return {
    formations,
    loaded,
    hasUnsavedChanges,
    markBackedUp,
    addFormation,
    updateFormation,
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
