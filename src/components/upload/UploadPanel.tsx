"use client";

import { useCallback, useRef, useState } from "react";
import { useWorkflow } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadPanel() {
  const ctx = useWorkflow();
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;
      if (!ACCEPTED_TYPES.includes(file.type)) {
        return;
      }
      ctx.loadFile(file);
    },
    [ctx],
  );

  const onPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const items = Array.from(e.clipboardData.items);
      const imageItem = items.find((i) => i.type.startsWith("image/"));
      const file = imageItem?.getAsFile();
      if (file) handleFiles([file]);
    },
    [handleFiles],
  );

  return (
    <div className="flex flex-col gap-6" onPaste={onPaste}>
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Upload Handwriting Sample</h2>
        <p className="text-sm text-text-muted mt-1">
          Start a new analysis by adding a scanned or photographed handwriting sample.
        </p>
      </div>

      <Card
        padding="p-0"
        className={`overflow-hidden transition-colors ${isDragging ? "ring-2 ring-primary" : ""}`}
      >
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center bg-gradient-to-b from-primary-softer to-surface"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-soft text-3xl text-primary-dark font-handwritten">
            ✎
          </div>
          <div>
            <p className="text-sm font-semibold text-text-strong">
              Drag and drop a handwriting image, or click to browse
            </p>
            <p className="text-xs text-text-muted mt-1">JPG, PNG or WebP &middot; paste from clipboard also works</p>
          </div>
          <Button onClick={() => inputRef.current?.click()}>Choose File</Button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>
      </Card>

      {ctx.sampleMetadata && (
        <Card>
          <CardTitle>Sample Details</CardTitle>
          <CardSubtitle>Filename metadata is shown for reference only and is never used for analysis.</CardSubtitle>
          <dl className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-xs text-text-muted">Filename</dt>
              <dd className="font-medium text-text-strong truncate">{ctx.sampleMetadata.filename}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Dimensions</dt>
              <dd className="font-medium text-text-strong">
                {ctx.sampleMetadata.width} × {ctx.sampleMetadata.height}px
              </dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">File size</dt>
              <dd className="font-medium text-text-strong">{formatBytes(ctx.sampleMetadata.fileSizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-xs text-text-muted">Orientation</dt>
              <dd className="font-medium text-text-strong capitalize">{ctx.sampleMetadata.orientation}</dd>
            </div>
          </dl>
          {ctx.previewDataUrl && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={ctx.previewDataUrl}
              alt="Uploaded handwriting sample preview"
              className="mt-4 max-h-72 w-full rounded-xl border border-border-soft object-contain bg-surface-alt"
            />
          )}
          <div className="mt-5 flex justify-end">
            <Button onClick={() => ctx.setActiveSection("prepare")}>Continue to Image Preparation →</Button>
          </div>
        </Card>
      )}

      <Card className="bg-sky-soft border-transparent">
        <div className="flex gap-3 items-start">
          <span className="text-lg">🔒</span>
          <div>
            <p className="text-sm font-semibold text-[#2f5a82]">Your handwriting stays on this device</p>
            <p className="text-xs text-[#2f5a82]/80 mt-1">
              Your handwriting is analyzed locally in your browser and is not stored by this application. Nothing is
              uploaded to a server or any external AI service.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
