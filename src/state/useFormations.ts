"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas } from "@/utils/canvas";
import { saveBackupHandle, loadBackupHandle, clearBackupHandle } from "@/utils/fileHandleStore";
import { dbGetAll, dbPut, dbDelete, dbClear, dbBulkPut, dbBulkDelete, migrateFromLocalStorage, normalizeFormationEntry } from "@/utils/formationsDb";
import { parseCsv, toCsv } from "@/utils/csv";
import { applyPreprocessing } from "@/utils/preprocess";
import { autoTuneToneForQuality } from "@/utils/autoTune";
import { FORMATION_TAGS, DEFAULT_PREPROCESSING, type FormationEntry, type FormationTag } from "@/types";

const CSV_COLUMNS = ["parameter", "character", "subCategory", "detail", "trait", "tag"];

/**
 * Formation reference images are small illustrative crops, not full samples,
 * but they're also printed at real size in the Book/PDF export — capping
 * this too low is what made exported images look pixelated (they were being
 * scaled up past their native resolution to fill the printed page). 1200px
 * is enough for a sharp ~4in-wide image at 300 DPI while staying well within
 * IndexedDB's storage headroom.
 */
const MAX_FORMATION_IMAGE_DIM = 1200;
/** Wait for a quiet moment after the last change before writing the auto-backup file. */
const AUTO_BACKUP_DEBOUNCE_MS = 800;

/**
 * Downscales an uploaded image and returns it as a compact JPEG data URL for
 * storage. When `autoCorrect` is true, runs the same tone-auto-tune search
 * used for full analysis samples (brightness/contrast/sharpen/noise
 * reduction/grayscale/background normalization) before downscaling, so
 * formation crops get sharpened/cleaned up the same way. Geometry (rotation,
 * crop, deskew) and binarization are left untouched either way — those
 * aren't relevant to a small illustrative crop.
 */
async function fileToStoredDataUrl(file: File, autoCorrect: boolean): Promise<string> {
  const img = await loadImageElement(file);
  let canvas = imageElementToCanvas(img);
  if (autoCorrect) {
    const { settings } = autoTuneToneForQuality(canvas, DEFAULT_PREPROCESSING);
    canvas = applyPreprocessing(canvas, settings);
  }
  const analysisCanvas = toAnalysisCanvas(canvas, MAX_FORMATION_IMAGE_DIM);
  return analysisCanvas.toDataURL("image/jpeg", 0.85);
}

/** Content fields compared to decide whether two entries are exact duplicates — id/createdAt are expected to differ and are ignored. */
function contentFingerprint(e: FormationEntry): string {
  return JSON.stringify([e.parameter, e.character ?? "", e.subCategory, e.detail, e.trait, e.tag ?? "", e.imageDataUrl ?? ""]);
}

export interface ImportAnalysis {
  /** All entries parsed from the file, unfiltered. */
  entries: FormationEntry[];
  /** Count of entries that repeat an earlier row within the same file. */
  duplicateWithinFile: number;
  /** Count of entries whose content already matches something in the current library (only meaningful for merge mode). */
  duplicateWithExisting: number;
  /** `entries` with duplicates (both kinds) removed, first occurrence kept. */
  deduped: FormationEntry[];
}

export interface LibraryDuplicateGroup {
  /** The entry kept — the oldest of the group by createdAt. */
  keep: FormationEntry;
  /** The rest of the group — candidates for removal. */
  remove: FormationEntry[];
}

export interface LibraryDuplicateScan {
  groups: LibraryDuplicateGroup[];
  /** Total entries across all groups' `remove` lists — how many rows removing everything would delete. */
  totalDuplicates: number;
}

function analyzeDuplicates(incoming: FormationEntry[], existing: FormationEntry[]): ImportAnalysis {
  const existingFingerprints = new Set(existing.map(contentFingerprint));
  const seenInFile = new Set<string>();
  let duplicateWithinFile = 0;
  let duplicateWithExisting = 0;
  const deduped: FormationEntry[] = [];
  for (const e of incoming) {
    const fp = contentFingerprint(e);
    if (existingFingerprints.has(fp)) {
      duplicateWithExisting += 1;
      continue;
    }
    if (seenInFile.has(fp)) {
      duplicateWithinFile += 1;
      continue;
    }
    seenInFile.add(fp);
    deduped.push(e);
  }
  return { entries: incoming, duplicateWithinFile, duplicateWithExisting, deduped };
}

function isFormationEntryLike(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const e = v as Record<string, unknown>;
  return typeof e.detail === "string" && typeof e.trait === "string";
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export type AutoBackupStatus = "unsupported" | "disabled" | "active" | "permission-needed" | "error";

function hasAnyContent(
  fields: { parameter?: string; character?: string; subCategory?: string; detail?: string; trait?: string },
  hasImage: boolean,
): boolean {
  return (
    hasImage ||
    !!fields.parameter?.trim() ||
    !!fields.character?.trim() ||
    !!fields.subCategory?.trim() ||
    !!fields.detail?.trim() ||
    !!fields.trait?.trim()
  );
}

/**
 * Library of user-contributed letter-formation examples (image + detail +
 * trait). Two storage layers, depending on whether GitHub sync is
 * configured on this deployment (`src/app/api/formations/route.ts` —
 * GITHUB_BACKUP_TOKEN/OWNER/REPO env vars):
 *
 * - **Configured**: GitHub is canonical. On load, the current library is
 *   fetched from the repo (`data/formations.json` by default) and that's
 *   what's used — it wins over anything cached locally. Every change
 *   (add/edit/remove/import) is pushed back shortly after (debounced
 *   ~600ms), landing as one commit that updates the canonical file, adds a
 *   new timestamped snapshot under `backups/`, and prunes old snapshots
 *   beyond the configured keep count. IndexedDB is still written to, but
 *   only as a local cache (offline access, faster subsequent loads) — not
 *   the source of truth. If two devices/tabs both make changes, whichever
 *   syncs last simply overwrites the other (no conflict resolution).
 * - **Not configured, or unreachable**: falls back to IndexedDB
 *   (`src/utils/formationsDb.ts`) as it worked before this existed — the
 *   reference images never leave the browser in this mode. IndexedDB
 *   replaced an earlier localStorage-based store (capped around 5-10MB,
 *   which a growing library of embedded images would eventually exhaust);
 *   any pre-existing localStorage library is migrated over automatically,
 *   once, the first time this loads.
 *
 * Either way, also available:
 * - Manual export/import as a JSON file, which works in every browser and
 *   doesn't depend on GitHub sync being configured.
 * - Optional automatic backup to a file on disk via the File System Access
 *   API (Chromium browsers only) — a second, independent local safety net.
 *
 * Call this once and share the returned object — it holds the single source
 * of truth for the list; don't call it again per sub-component, or each
 * instance's local state can drift from the others until it happens to
 * remount.
 */
export type GithubSyncStatus = "checking" | "unconfigured" | "synced" | "syncing" | "error";

const GITHUB_SYNC_DEBOUNCE_MS = 600;

export function useFormations() {
  const [formations, setFormations] = useState<FormationEntry[]>([]);
  /** False until the initial load (GitHub if configured, else IndexedDB) completes. */
  const [loaded, setLoaded] = useState(false);
  /** True once something has changed since the last export/backup-file write — drives the periodic backup reminder. */
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const [githubSyncStatus, setGithubSyncStatus] = useState<GithubSyncStatus>("checking");
  const [githubSyncError, setGithubSyncError] = useState<string | null>(null);
  const [lastGithubSyncAt, setLastGithubSyncAt] = useState<string | null>(null);
  const githubSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Skips the debounced sync effect's very first run (right after the initial load populates `formations`). */
  const skipNextSyncRef = useRef(true);

  /**
   * Reads whatever's in IndexedDB, migrating any pre-existing localStorage
   * library over first (see src/utils/formationsDb.ts) — a no-op after the
   * first successful run — and normalizing any entries still in the older
   * pre-Parameter/Character shape. Used as: (a) the whole load path when
   * GitHub sync isn't configured/reachable, and (b) the seed for a
   * first-ever push to GitHub when sync is configured but no canonical
   * file exists there yet.
   */
  const loadFromIndexedDbFallback = useCallback(async (): Promise<FormationEntry[]> => {
    await migrateFromLocalStorage();
    const raw = await dbGetAll();
    const changedEntries: FormationEntry[] = [];
    const entries = raw.map((r) => {
      const { entry, changed } = normalizeFormationEntry(r as unknown as Record<string, unknown>);
      if (changed) changedEntries.push(entry);
      return entry;
    });
    if (changedEntries.length > 0) await dbBulkPut(changedEntries);
    entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setFormations(entries);
    return entries;
  }, []);

  /**
   * Pushes `entries` to /api/formations, which commits them as the
   * canonical GitHub file plus a new timestamped snapshot (pruning old
   * ones beyond the configured keep count) in one commit. Safe to call
   * even when sync isn't configured — it just reports "unconfigured".
   */
  const syncToGithubNow = useCallback(async (entries: FormationEntry[]) => {
    setGithubSyncStatus("syncing");
    try {
      const res = await fetch("/api/formations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formations: entries }),
      });
      if (res.status === 501) {
        setGithubSyncStatus("unconfigured");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Sync failed (${res.status}).`);
      setGithubSyncStatus("synced");
      setGithubSyncError(null);
      setLastGithubSyncAt(new Date().toISOString());
      setHasUnsavedChanges(false);
    } catch (err) {
      setGithubSyncStatus("error");
      setGithubSyncError(err instanceof Error ? err.message : "GitHub sync failed.");
    }
  }, []);

  // Initial load: GitHub is canonical when sync is configured and reachable
  // — its content wins over whatever's cached locally, and gets written
  // through to IndexedDB as a local cache for offline/fast access. If
  // GitHub has no canonical file yet (first time this is turned on) but
  // IndexedDB already has a library, that local library becomes the seed
  // and is immediately pushed up to create the canonical file. If sync
  // isn't configured, or GitHub can't be reached, this falls back to
  // IndexedDB alone so the app stays fully usable either way.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/formations", { method: "GET" });
        if (res.status === 501) {
          if (cancelled) return;
          setGithubSyncStatus("unconfigured");
          await loadFromIndexedDbFallback();
          return;
        }
        if (!res.ok) throw new Error(`Could not read the library from GitHub (${res.status}).`);
        const data = await res.json();
        if (cancelled) return;
        if (data.exists) {
          const entries = (data.formations as Record<string, unknown>[]).map((r) => normalizeFormationEntry(r).entry);
          entries.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
          setFormations(entries);
          await dbClear();
          await dbBulkPut(entries);
          setGithubSyncStatus("synced");
          setLastGithubSyncAt(new Date().toISOString());
        } else {
          const localEntries = await loadFromIndexedDbFallback();
          if (cancelled) return;
          if (localEntries.length > 0) {
            await syncToGithubNow(localEntries);
          } else {
            setGithubSyncStatus("synced");
          }
        }
      } catch (err) {
        if (cancelled) return;
        setGithubSyncStatus("error");
        setGithubSyncError(err instanceof Error ? err.message : "Could not reach GitHub sync.");
        await loadFromIndexedDbFallback();
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced auto-sync to GitHub: shortly after `formations` changes (and
  // sync is configured), push the current library. Skips its first run —
  // the one caused by the initial load itself populating `formations`,
  // which the mount effect above already handles (including the
  // first-ever bootstrap push) — so this only fires for actual edits.
  useEffect(() => {
    if (!loaded || githubSyncStatus === "unconfigured" || githubSyncStatus === "checking") return;
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }
    if (githubSyncTimerRef.current) clearTimeout(githubSyncTimerRef.current);
    githubSyncTimerRef.current = setTimeout(() => {
      syncToGithubNow(formations);
    }, GITHUB_SYNC_DEBOUNCE_MS);
    return () => {
      if (githubSyncTimerRef.current) clearTimeout(githubSyncTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formations, loaded]);

  const retryGithubSync = useCallback(() => syncToGithubNow(formations), [formations, syncToGithubNow]);

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
    async (input: {
      file: File | null;
      /** Whether to auto-sharpen/clean up `file` before storing. Ignored if `file` is null. Defaults to true. */
      autoCorrect?: boolean;
      detail: string;
      trait: string;
      parameter: string;
      character: string;
      subCategory: string;
      tag: FormationTag | "";
    }) => {
      const { file, autoCorrect = true, detail, trait, parameter, character, subCategory, tag } = input;
      if (!hasAnyContent({ parameter, character, subCategory, detail, trait }, !!file)) {
        throw new Error("Add at least an image or one field before saving.");
      }
      const imageDataUrl = file ? await fileToStoredDataUrl(file, autoCorrect) : undefined;
      const entry: FormationEntry = {
        id: newId(),
        imageDataUrl,
        detail: detail.trim(),
        trait: trait.trim(),
        parameter: parameter.trim(),
        character: character.trim() || undefined,
        subCategory: subCategory.trim(),
        tag: tag || undefined,
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
      patch: {
        file?: File | null;
        /** Whether to auto-sharpen/clean up a replacement `file` before storing. Ignored unless `file` is a new File. Defaults to true. */
        autoCorrect?: boolean;
        detail?: string;
        trait?: string;
        parameter?: string;
        character?: string;
        subCategory?: string;
        tag?: FormationTag | "";
      },
    ) => {
      const imageDataUrl =
        patch.file === undefined ? undefined : patch.file === null ? null : await fileToStoredDataUrl(patch.file, patch.autoCorrect ?? true);
      let updated: FormationEntry | null = null;
      setFormations((prev) =>
        prev.map((f) => {
          if (f.id !== id) return f;
          updated = {
            ...f,
            ...(imageDataUrl === undefined ? {} : { imageDataUrl: imageDataUrl ?? undefined }),
            ...(patch.detail !== undefined ? { detail: patch.detail.trim() } : {}),
            ...(patch.trait !== undefined ? { trait: patch.trait.trim() } : {}),
            ...(patch.parameter !== undefined ? { parameter: patch.parameter.trim() } : {}),
            ...(patch.character !== undefined ? { character: patch.character.trim() || undefined } : {}),
            ...(patch.subCategory !== undefined ? { subCategory: patch.subCategory.trim() } : {}),
            ...(patch.tag !== undefined ? { tag: patch.tag || undefined } : {}),
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

  /**
   * Scans the current library itself for exact content duplicates (same
   * definition as import-time duplicate detection — see `contentFingerprint`
   * above). For each group of duplicates, the oldest (by createdAt) is kept
   * and the rest are candidates for removal — this is a scan only, nothing
   * is deleted until removeDuplicateFormations() is called with the ids the
   * user actually agreed to remove.
   */
  const findLibraryDuplicates = useCallback((): LibraryDuplicateScan => {
    const byFingerprint = new Map<string, FormationEntry[]>();
    for (const f of formations) {
      const fp = contentFingerprint(f);
      const list = byFingerprint.get(fp);
      if (list) list.push(f);
      else byFingerprint.set(fp, [f]);
    }
    const groups: LibraryDuplicateGroup[] = [];
    let totalDuplicates = 0;
    for (const entries of byFingerprint.values()) {
      if (entries.length < 2) continue;
      const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const [keep, ...remove] = sorted;
      groups.push({ keep, remove });
      totalDuplicates += remove.length;
    }
    return { groups, totalDuplicates };
  }, [formations]);

  /** Removes specific formations by id — used to act on a findLibraryDuplicates() scan the user has approved. */
  const removeDuplicateFormations = useCallback(async (ids: string[]): Promise<number> => {
    if (ids.length === 0) return 0;
    const idSet = new Set(ids);
    setFormations((prev) => prev.filter((f) => !idSet.has(f.id)));
    await dbBulkDelete(ids);
    setHasUnsavedChanges(true);
    return ids.length;
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

  /** Shared by JSON and CSV import: writes `incoming` in either merge or replace mode. */
  const applyIncoming = useCallback(async (incoming: FormationEntry[], mode: "merge" | "replace") => {
    if (mode === "replace") {
      setFormations(incoming);
      await dbClear();
      await dbBulkPut(incoming);
    } else {
      let deduped: FormationEntry[] = [];
      setFormations((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        deduped = incoming.map((e) => (existingIds.has(e.id) ? { ...e, id: newId() } : e));
        return [...deduped, ...prev];
      });
      await dbBulkPut(deduped);
    }
    setHasUnsavedChanges(true);
  }, []);

  /** Parses a JSON backup file into entries, without writing anything yet. */
  const parseJsonImportFile = useCallback(async (file: File): Promise<FormationEntry[]> => {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const incomingRaw: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.formations) ? parsed.formations : null;
    if (!incomingRaw) throw new Error("This file doesn't look like a Letter Formations backup.");
    const incoming = incomingRaw
      .filter(isFormationEntryLike)
      .map((raw): FormationEntry => normalizeFormationEntry(raw).entry)
      .map((e) => ({
        ...e,
        id: typeof e.id === "string" && e.id ? e.id : newId(),
        subCategory: e.subCategory ?? "",
        createdAt: e.createdAt ?? new Date().toISOString(),
      }));
    if (incoming.length === 0) throw new Error("No valid formation entries found in this file.");
    return incoming;
  }, []);

  /** Downloads the text fields (no images) as a CSV — a spreadsheet-friendly view/edit path. */
  const exportFormationsCsv = useCallback(() => {
    const rows = formations.map((f) => [f.parameter, f.character ?? "", f.subCategory, f.detail, f.trait, f.tag ?? ""]);
    const csv = toCsv(CSV_COLUMNS, rows);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `graphology-formations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setHasUnsavedChanges(false);
  }, [formations]);

  /**
   * Imports rows from a CSV with a header row naming any of
   * parameter/category, character, subCategory, detail, trait, tag (any
   * order, case-insensitive; missing columns are just left blank). No image
   * column — CSV rows land as text-only entries; add images afterward via
   * Edit. Blank rows (nothing in any recognized column) are skipped.
   */
  const parseCsvImportFile = useCallback(async (file: File): Promise<FormationEntry[]> => {
    const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) throw new Error("This CSV file is empty.");
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const colIndex = (names: string[]) => {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i !== -1) return i;
        }
        return -1;
      };
      const iParameter = colIndex(["parameter", "category"]);
      const iCharacter = colIndex(["character", "char"]);
      const iSubCategory = colIndex(["subcategory", "sub-category", "sub category"]);
      const iDetail = colIndex(["detail", "details"]);
      const iTrait = colIndex(["trait"]);
      const iTag = colIndex(["tag"]);

      const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");
      const incoming: FormationEntry[] = [];
      for (const row of rows.slice(1)) {
        const parameter = cell(row, iParameter);
        const character = cell(row, iCharacter);
        const subCategory = cell(row, iSubCategory);
        const detail = cell(row, iDetail);
        const trait = cell(row, iTrait);
        const rawTag = cell(row, iTag).toLowerCase();
        const tag = (FORMATION_TAGS as readonly string[]).includes(rawTag) ? (rawTag as FormationTag) : undefined;
        if (!parameter && !character && !subCategory && !detail && !trait) continue;
        incoming.push({
          id: newId(),
          parameter,
          character: character || undefined,
          subCategory,
          detail,
          trait,
          tag,
          createdAt: new Date().toISOString(),
        });
      }
      if (incoming.length === 0) {
        throw new Error(
          "No usable rows found. Expected a header row naming parameter/category, character, subCategory, detail, trait, and/or tag columns.",
        );
      }
      return incoming;
    },
    [],
  );

  /**
   * Parses an import file (JSON backup or CSV) and checks it for exact
   * content duplicates — both against what's already in the library and
   * within the file itself — without writing anything. The caller decides
   * whether to proceed with `analysis.entries` (keep duplicates) or
   * `analysis.deduped` (skip them) via commitImport().
   */
  const analyzeImportFile = useCallback(
    async (file: File, kind: "json" | "csv", mode: "merge" | "replace"): Promise<ImportAnalysis> => {
      const incoming = kind === "json" ? await parseJsonImportFile(file) : await parseCsvImportFile(file);
      // In "replace" mode the current library is discarded, so matches against it aren't
      // meaningful duplicates to warn about — only within-file repeats are.
      return analyzeDuplicates(incoming, mode === "merge" ? formations : []);
    },
    [parseJsonImportFile, parseCsvImportFile, formations],
  );

  /** Writes entries the caller has already decided on (see analyzeImportFile) into the library. */
  const commitImport = useCallback(
    async (entries: FormationEntry[], mode: "merge" | "replace"): Promise<number> => {
      await applyIncoming(entries, mode);
      return entries.length;
    },
    [applyIncoming],
  );

  return {
    formations,
    loaded,
    hasUnsavedChanges,
    markBackedUp,
    addFormation,
    updateFormation,
    removeFormation,
    findLibraryDuplicates,
    removeDuplicateFormations,
    exportFormations,
    analyzeImportFile,
    commitImport,
    exportFormationsCsv,
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
    githubSync: {
      status: githubSyncStatus,
      error: githubSyncError,
      lastSyncedAt: lastGithubSyncAt,
      retry: retryGithubSync,
    },
  };
}
