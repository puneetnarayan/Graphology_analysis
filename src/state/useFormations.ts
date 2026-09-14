"use client";

import { useCallback, useState } from "react";
import { loadImageElement, imageElementToCanvas, toAnalysisCanvas } from "@/utils/canvas";
import type { FormationEntry } from "@/types";

const STORAGE_KEY = "graphology_formations_v1";
/** Formation reference images are small illustrative crops, not full samples — keep them light. */
const MAX_FORMATION_IMAGE_DIM = 400;

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

/**
 * Client-side, browser-local library of user-contributed letter-formation
 * examples (image + detail + trait). Stored in localStorage, same as any
 * other browser-local preference — the reference images never leave the
 * browser, same privacy guarantee as the rest of the app, but (unlike the
 * analyzed handwriting sample) this library is deliberately persisted
 * across sessions so it can be built up over time.
 */
export function useFormations() {
  // Read once, synchronously, on first client render — this app has no SSR data
  // dependent on this list, so there's nothing to hydrate-mismatch against.
  const [formations, setFormations] = useState<FormationEntry[]>(() => readFromStorage());
  const [loaded] = useState(true);

  const addFormation = useCallback(
    async (file: File, detail: string, trait: string, category: string, subCategory: string) => {
      const imageDataUrl = await fileToStoredDataUrl(file);
      const entry: FormationEntry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

  return { formations, loaded, addFormation, removeFormation };
}
