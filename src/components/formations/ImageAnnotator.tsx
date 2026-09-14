"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type Mode = "crop" | "highlight";

/** A rectangle in whatever pixel space it was captured in (display px, or source px once divided by scale). */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MAX_DISPLAY_PX = 640;
const MIN_DRAG_PX = 6;
const HIGHLIGHT_FILL = "rgba(255,176,32,0.35)";
const HIGHLIGHT_STROKE = "rgba(196,110,20,0.95)";

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  c.getContext("2d")!.drawImage(src, 0, 0);
  return c;
}

/**
 * Crop-and-highlight editor for a formation's image. Crop trims the image
 * to the relevant part of the sample; Highlight draws a permanent,
 * semi-transparent box directly onto the saved image pixels marking exactly
 * what the Detail field is describing — so reviewing the row later doesn't
 * require guessing which part of the crop the text refers to. "Use This
 * Image" flattens everything into a single JPEG File, which plugs into the
 * same upload path as any picked/dropped/pasted image.
 */
export function ImageAnnotator({
  imageUrl,
  onSave,
  onClose,
}: {
  imageUrl: string;
  onSave: (file: File) => void;
  onClose: () => void;
}) {
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLCanvasElement | null>(null);
  const workingRef = useRef<HTMLCanvasElement | null>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);
  const scaleRef = useRef(1);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("crop");
  const [dragRect, setDragRect] = useState<Rect | null>(null);
  const [highlight, setHighlight] = useState<Rect | null>(null);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d")!.drawImage(img, 0, 0);
      originalRef.current = c;
      workingRef.current = cloneCanvas(c);
      setLoaded(true);
    };
    img.onerror = () => setError("Could not load this image for editing.");
    img.src = imageUrl;
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  /** Rebuilds the scaled offscreen preview (image + baked highlight) and paints it onto the visible canvas. */
  function rebuildBase() {
    const working = workingRef.current;
    const display = displayCanvasRef.current;
    if (!working || !display) return;
    const s = Math.min(1, MAX_DISPLAY_PX / Math.max(working.width, working.height));
    scaleRef.current = s;
    const base = document.createElement("canvas");
    base.width = Math.max(1, Math.round(working.width * s));
    base.height = Math.max(1, Math.round(working.height * s));
    const ctx = base.getContext("2d")!;
    ctx.drawImage(working, 0, 0, base.width, base.height);
    if (highlight) {
      ctx.fillStyle = HIGHLIGHT_FILL;
      ctx.strokeStyle = HIGHLIGHT_STROKE;
      ctx.lineWidth = 2;
      ctx.fillRect(highlight.x * s, highlight.y * s, highlight.w * s, highlight.h * s);
      ctx.strokeRect(highlight.x * s, highlight.y * s, highlight.w * s, highlight.h * s);
    }
    baseRef.current = base;
    display.width = base.width;
    display.height = base.height;
    display.getContext("2d")!.drawImage(base, 0, 0);
  }

  useEffect(() => {
    if (loaded) rebuildBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, highlight]);

  function paintWithOverlay(rect: Rect | null) {
    const base = baseRef.current;
    const display = displayCanvasRef.current;
    if (!base || !display) return;
    const ctx = display.getContext("2d")!;
    ctx.clearRect(0, 0, display.width, display.height);
    ctx.drawImage(base, 0, 0);
    if (rect) {
      ctx.save();
      ctx.strokeStyle = mode === "crop" ? "#6e5fc4" : HIGHLIGHT_STROKE;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
    }
  }

  function getPos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = displayCanvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!loaded) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const p = getPos(e);
    dragStartRef.current = p;
    setDragRect({ x: p.x, y: p.y, w: 0, h: 0 });
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!dragStartRef.current) return;
    const p = getPos(e);
    const { x: startX, y: startY } = dragStartRef.current;
    const rect: Rect = {
      x: Math.min(startX, p.x),
      y: Math.min(startY, p.y),
      w: Math.abs(p.x - startX),
      h: Math.abs(p.y - startY),
    };
    setDragRect(rect);
    paintWithOverlay(rect);
  }

  function handlePointerUp() {
    dragStartRef.current = null;
  }

  function toSourceRect(displayRect: Rect): Rect {
    const s = scaleRef.current;
    return { x: displayRect.x / s, y: displayRect.y / s, w: displayRect.w / s, h: displayRect.h / s };
  }

  function applyCrop() {
    if (!dragRect || dragRect.w < MIN_DRAG_PX || dragRect.h < MIN_DRAG_PX || !workingRef.current) return;
    const src = toSourceRect(dragRect);
    const cropped = document.createElement("canvas");
    cropped.width = Math.max(1, Math.round(src.w));
    cropped.height = Math.max(1, Math.round(src.h));
    cropped.getContext("2d")!.drawImage(workingRef.current, src.x, src.y, src.w, src.h, 0, 0, cropped.width, cropped.height);
    workingRef.current = cropped;
    setHighlight(null); // prior highlight coordinates no longer make sense against the new crop
    setDragRect(null);
    rebuildBase();
  }

  function applyHighlight() {
    if (!dragRect || dragRect.w < MIN_DRAG_PX || dragRect.h < MIN_DRAG_PX) return;
    setHighlight(toSourceRect(dragRect));
    setDragRect(null);
  }

  function clearHighlight() {
    setHighlight(null);
    setDragRect(null);
  }

  function resetToOriginal() {
    if (!originalRef.current) return;
    workingRef.current = cloneCanvas(originalRef.current);
    setHighlight(null);
    setDragRect(null);
    rebuildBase();
  }

  function handleSave() {
    if (!workingRef.current) return;
    // Bake the highlight onto a full-resolution clone — `workingRef` itself is never scaled,
    // but `highlight` coordinates were captured in scaled/source space via toSourceRect(), so
    // they apply directly here without re-scaling. This keeps the exported file at full
    // resolution with the highlight actually present in the saved pixels, not just the preview.
    const out = cloneCanvas(workingRef.current);
    if (highlight) {
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = HIGHLIGHT_FILL;
      ctx.strokeStyle = HIGHLIGHT_STROKE;
      ctx.lineWidth = Math.max(2, Math.round(2 / scaleRef.current));
      ctx.fillRect(highlight.x, highlight.y, highlight.w, highlight.h);
      ctx.strokeRect(highlight.x, highlight.y, highlight.w, highlight.h);
    }
    out.toBlob(
      (blob) => {
        if (!blob) return;
        onSave(new File([blob], "formation.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6" role="dialog" aria-modal="true">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <CardTitle>Crop &amp; highlight</CardTitle>
        <CardSubtitle>
          Crop to the relevant part of the sample, and/or drag a box to highlight exactly what the Detail field
          describes — the highlight is drawn permanently onto the saved image.
        </CardSubtitle>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {!loaded && !error && <p className="mt-4 text-sm text-text-muted">Loading image…</p>}

        {loaded && (
          <>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => setMode("crop")}
                className={`rounded-full px-3 py-1 text-xs font-medium ${mode === "crop" ? "bg-primary text-white" : "bg-surface-alt text-text-muted"}`}
              >
                ✂ Crop
              </button>
              <button
                onClick={() => setMode("highlight")}
                className={`rounded-full px-3 py-1 text-xs font-medium ${mode === "highlight" ? "bg-primary text-white" : "bg-surface-alt text-text-muted"}`}
              >
                🖊 Highlight
              </button>
            </div>

            <div className="mt-3 flex justify-center bg-surface-alt rounded-xl p-2 overflow-auto">
              <canvas
                ref={displayCanvasRef}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className="rounded-lg border border-border-soft cursor-crosshair touch-none"
              />
            </div>

            <p className="mt-2 text-[11px] text-text-muted text-center">
              {mode === "crop" ? "Drag a box over the part to keep, then Apply Crop." : "Drag a box over the detail being described, then Add Highlight."}
            </p>

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {mode === "crop" ? (
                <Button variant="outline" onClick={applyCrop} disabled={!dragRect}>
                  Apply Crop
                </Button>
              ) : (
                <>
                  <Button variant="outline" onClick={applyHighlight} disabled={!dragRect}>
                    Add Highlight
                  </Button>
                  {highlight && (
                    <Button variant="outline" onClick={clearHighlight}>
                      Clear Highlight
                    </Button>
                  )}
                </>
              )}
              <Button variant="outline" onClick={resetToOriginal}>
                Reset to Original
              </Button>
            </div>
          </>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!loaded}>
            Use This Image
          </Button>
        </div>
      </Card>
    </div>
  );
}
