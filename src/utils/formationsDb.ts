import type { FormationEntry } from "@/types";

/**
 * IndexedDB-backed storage for the Letter Formations library. Replaces the
 * earlier localStorage-based store (capped around 5-10MB, which a growing
 * library of embedded images would eventually exhaust) — IndexedDB's quota
 * is typically hundreds of MB or more, and writes are per-record rather than
 * rewriting one giant serialized blob on every change.
 */
const DB_NAME = "graphology_formations_db";
const DB_VERSION = 1;
const STORE = "formations";

/** The old localStorage key this store migrates data away from, once, on first load. */
const LEGACY_LOCALSTORAGE_KEY = "graphology_formations_v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function dbGetAll(): Promise<FormationEntry[]> {
  const db = await openDb();
  const entries = await new Promise<FormationEntry[]>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result as FormationEntry[]);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return entries;
}

/**
 * Normalizes one record from IndexedDB into the current `FormationEntry`
 * shape. Entries saved before the Parameter/Character split (see
 * `src/types/formations.ts`) had a free-text `category` field instead of
 * `parameter`, and no `character` field at all. For those:
 * - `category`'s value becomes `parameter` verbatim (so nothing is lost,
 *   even if it doesn't match the current controlled vocabulary).
 * - If that text matches the common "Letter X" pattern people used as a
 *   stand-in category (e.g. "Letter T"), the letter is pulled out into the
 *   new `character` field as a one-time helpful backfill.
 * Returns `changed: false` for records already in the current shape, so the
 * caller knows which ones are worth writing back.
 */
export function normalizeFormationEntry(raw: Record<string, unknown>): { entry: FormationEntry; changed: boolean } {
  if (typeof raw.parameter === "string") {
    return { entry: raw as unknown as FormationEntry, changed: false };
  }
  const legacyCategory = typeof raw.category === "string" ? raw.category : "";
  let character = typeof raw.character === "string" && raw.character ? raw.character : undefined;
  if (!character) {
    const m = /^letter\s+([a-z0-9])$/i.exec(legacyCategory.trim());
    if (m) character = m[1].toLowerCase();
  }
  const { category: _category, ...rest } = raw;
  void _category;
  const entry = { ...rest, parameter: legacyCategory, character } as FormationEntry;
  return { entry, changed: true };
}

export async function dbPut(entry: FormationEntry): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function dbBulkPut(entries: FormationEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const entry of entries) store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function dbDelete(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function dbBulkDelete(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const id of ids) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function dbClear(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/**
 * One-time migration from the old localStorage-based store. Runs on every
 * load but is a no-op after the first successful run: it only copies data
 * over when IndexedDB is still empty and the legacy key still has something
 * in it. The legacy key is removed only after the IndexedDB write succeeds,
 * so a failed migration leaves the old data intact to retry next load.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  if (typeof window === "undefined") return;
  let legacyRaw: string | null;
  try {
    legacyRaw = window.localStorage.getItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    return;
  }
  if (!legacyRaw) return;

  const existing = await dbGetAll();
  if (existing.length > 0) {
    // Already migrated (or the store was seeded some other way) — just drop the stale legacy copy.
    try {
      window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
    } catch {
      // Non-fatal — leftover legacy key is harmless once IndexedDB is the source of truth.
    }
    return;
  }

  let legacyEntries: FormationEntry[];
  try {
    const parsed = JSON.parse(legacyRaw);
    legacyEntries = Array.isArray(parsed) ? parsed : [];
  } catch {
    return;
  }
  if (legacyEntries.length === 0) return;

  await dbBulkPut(legacyEntries);
  try {
    window.localStorage.removeItem(LEGACY_LOCALSTORAGE_KEY);
  } catch {
    // Migration itself succeeded (data is safely in IndexedDB); leaving the old key around is harmless.
  }
}
