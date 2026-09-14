"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FORMATIONS_SUB_TABS, type FormationsSubTab } from "@/state/navigation";
import { useFormations } from "@/state/useFormations";
import { extractImageFileFromClipboard } from "@/utils/clipboard";
import type { FormationEntry } from "@/types";

type FormationsStore = ReturnType<typeof useFormations>;

/** How long to wait, with no unsaved-change activity, before nagging for a backup. */
const BACKUP_REMINDER_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Drag-drop / click-to-upload / paste-from-clipboard image picker. Used both
 * for adding a new formation and (in compact form) for replacing an existing
 * one's image inline. Click or Tab into it, then Ctrl/Cmd+V to paste.
 */
function DropZone({
  imageUrl,
  onFile,
  compact = false,
}: {
  /** Either a local object URL for a pending File, or an existing stored data URL. */
  imageUrl: string | null;
  onFile: (f: File | null) => void;
  compact?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  }

  function handlePaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const file = extractImageFileFromClipboard(e);
    if (file) {
      e.preventDefault();
      onFile(file);
    }
  }

  return (
    <div
      tabIndex={0}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={() => inputRef.current?.click()}
      title="Click to browse, drag & drop, or paste an image (Ctrl/Cmd+V)"
      className={`flex ${compact ? "h-24" : "h-40"} cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        isDragging ? "border-primary bg-primary-soft" : "border-border-soft bg-surface-alt hover:bg-primary-softer"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0] ?? null);
          e.target.value = "";
        }}
      />
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className={`${compact ? "h-16" : "h-28"} rounded-lg object-contain`} />
      ) : (
        <>
          <span className="text-xs font-medium text-text-body">Drag, click to browse, or paste (Ctrl/Cmd+V)</span>
          <span className="text-[11px] text-text-muted">A cropped snippet of the formation works best</span>
        </>
      )}
    </div>
  );
}

/** Turns a File into an object URL for local preview, revoking the previous one on change/unmount. */
function useObjectUrl(file: File | null | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

interface DraftFields {
  file: File | null;
  category: string;
  subCategory: string;
  detail: string;
  trait: string;
}

const EMPTY_DRAFT: DraftFields = { file: null, category: "", subCategory: "", detail: "", trait: "" };

function useCategoryOptions(formations: FormationEntry[]) {
  return useMemo(() => {
    const categories = Array.from(new Set(formations.map((f) => f.category).filter(Boolean)));
    const subCategories = Array.from(new Set(formations.map((f) => f.subCategory).filter(Boolean)));
    return { categories, subCategories };
  }, [formations]);
}

function ImageThumb({ src, size = "h-14 w-20" }: { src: string | null; size?: string }) {
  if (!src) {
    return (
      <div className={`${size} rounded-lg bg-surface-alt border border-dashed border-border-soft flex items-center justify-center text-[10px] text-text-muted text-center px-1`}>
        No image
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" className={`${size} rounded-lg object-contain bg-surface-alt border border-border-soft`} />;
}

interface EditFields {
  file?: File | null;
  category: string;
  subCategory: string;
  detail: string;
  trait: string;
}

function FormationRow({
  f,
  onRemove,
  onUpdate,
  showAdded = false,
}: {
  f: FormationEntry;
  onRemove: (id: string) => void;
  onUpdate: FormationsStore["updateFormation"];
  showAdded?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [edit, setEdit] = useState<EditFields>({
    category: f.category,
    subCategory: f.subCategory,
    detail: f.detail,
    trait: f.trait,
  });
  const [isSaving, setIsSaving] = useState(false);
  const editImageUrl = useObjectUrl(edit.file ?? null);
  const displayImageUrl = edit.file === null ? null : edit.file ? editImageUrl : (f.imageDataUrl ?? null);

  function startEdit() {
    setEdit({ category: f.category, subCategory: f.subCategory, detail: f.detail, trait: f.trait });
    setIsEditing(true);
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      await onUpdate(f.id, edit);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  if (isEditing) {
    return (
      <tr className="border-b border-border-soft/60 last:border-0 bg-primary-softer/60">
        <td className="py-2 px-2 align-top">
          <DropZone imageUrl={displayImageUrl} onFile={(file) => setEdit({ ...edit, file })} compact />
          {f.imageDataUrl && edit.file !== null && (
            <button
              onClick={() => setEdit({ ...edit, file: null })}
              className="mt-1 block w-full text-[11px] text-text-muted hover:text-danger px-1.5 py-1 rounded-md"
            >
              Clear image
            </button>
          )}
        </td>
        <td className="py-2 px-2 align-top">
          <input
            value={edit.category}
            onChange={(e) => setEdit({ ...edit, category: e.target.value })}
            placeholder="Category"
            className="w-full rounded-lg bg-surface px-2 py-1.5 text-sm"
          />
        </td>
        <td className="py-2 px-2 align-top">
          <input
            value={edit.subCategory}
            onChange={(e) => setEdit({ ...edit, subCategory: e.target.value })}
            placeholder="Sub-category"
            className="w-full rounded-lg bg-surface px-2 py-1.5 text-sm"
          />
        </td>
        <td className="py-2 px-2 align-top">
          <input
            value={edit.detail}
            onChange={(e) => setEdit({ ...edit, detail: e.target.value })}
            placeholder="Detail"
            className="w-full rounded-lg bg-surface px-2 py-1.5 text-sm"
          />
        </td>
        <td className="py-2 px-2 align-top">
          <input
            value={edit.trait}
            onChange={(e) => setEdit({ ...edit, trait: e.target.value })}
            placeholder="Trait"
            className="w-full rounded-lg bg-surface px-2 py-1.5 text-sm"
          />
        </td>
        {showAdded && <td className="py-2 px-2 align-top text-text-muted whitespace-nowrap">{new Date(f.createdAt).toLocaleDateString()}</td>}
        <td className="py-2 px-2 align-top text-right whitespace-nowrap">
          <Button variant="primary" className="px-2.5 py-1 text-xs" disabled={isSaving} onClick={handleSave}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button variant="outline" className="px-2.5 py-1 text-xs ml-1.5" onClick={() => setIsEditing(false)}>
            Cancel
          </Button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-border-soft/60 last:border-0">
      <td className="py-2 px-2">
        <ImageThumb src={f.imageDataUrl ?? null} />
      </td>
      <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.category || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.subCategory || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 text-text-body max-w-[220px]">{f.detail || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 font-semibold text-primary-dark">{f.trait || <span className="text-text-muted italic font-normal">—</span>}</td>
      {showAdded && <td className="py-2 px-2 text-text-muted whitespace-nowrap">{new Date(f.createdAt).toLocaleDateString()}</td>}
      <td className="py-2 px-2 text-right whitespace-nowrap">
        <Button variant="outline" className="px-2.5 py-1 text-xs" onClick={startEdit}>
          Edit
        </Button>
        <Button
          variant="outline"
          className="px-2.5 py-1 text-xs ml-1.5 hover:bg-danger-soft hover:text-[#8a3030] focus-visible:ring-danger/30"
          onClick={() => onRemove(f.id)}
        >
          Remove
        </Button>
      </td>
    </tr>
  );
}

/** Shared entry form: category, sub-category, detail, trait + image. Used on both sub-tabs. */
function EntryForm({
  draft,
  setDraft,
  onSubmit,
  isSaving,
  error,
  categories,
  subCategories,
  compact = false,
  submitLabel = "Add to Formation Library",
}: {
  draft: DraftFields;
  setDraft: (d: DraftFields) => void;
  onSubmit: () => void;
  isSaving: boolean;
  error: string | null;
  categories: string[];
  subCategories: string[];
  compact?: boolean;
  submitLabel?: string;
}) {
  const draftImageUrl = useObjectUrl(draft.file);
  const hasContent =
    !!draft.file || !!draft.category.trim() || !!draft.subCategory.trim() || !!draft.detail.trim() || !!draft.trait.trim();
  const canSubmit = hasContent && !isSaving;

  return (
    <>
      <div className={`grid grid-cols-1 ${compact ? "sm:grid-cols-[160px_1fr_1fr_1fr_1fr_auto]" : "sm:grid-cols-2"} gap-3 items-start`}>
        <DropZone imageUrl={draftImageUrl} onFile={(file) => setDraft({ ...draft, file })} compact={compact} />
        <div className={`flex flex-col gap-3 ${compact ? "contents" : ""}`}>
          <label className="text-xs font-medium text-text-body">
            {!compact && "Category"}
            <input
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              placeholder="Category (e.g. Letter connections)"
              list="formation-categories"
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-xs font-medium text-text-body">
            {!compact && "Sub-category"}
            <input
              value={draft.subCategory}
              onChange={(e) => setDraft({ ...draft, subCategory: e.target.value })}
              placeholder="Sub-category (e.g. Garland)"
              list="formation-subcategories"
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-xs font-medium text-text-body">
            {!compact && "Detail of the formation"}
            <input
              value={draft.detail}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
              placeholder='Detail (e.g. "Wavy line — no angles, just curves")'
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-xs font-medium text-text-body">
            {!compact && "Trait / personality aspect"}
            <input
              value={draft.trait}
              onChange={(e) => setDraft({ ...draft, trait: e.target.value })}
              placeholder='Trait (e.g. "Diplomatic")'
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          {compact && (
            <Button disabled={!canSubmit} onClick={onSubmit} className="h-10">
              {isSaving ? "Adding…" : "Add"}
            </Button>
          )}
        </div>
      </div>
      <datalist id="formation-categories">
        {categories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="formation-subcategories">
        {subCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {!compact && (
        <div className="mt-4 flex justify-end">
          <Button disabled={!canSubmit} onClick={onSubmit}>
            {isSaving ? "Saving…" : submitLabel}
          </Button>
        </div>
      )}
    </>
  );
}

function AddFormationTab({ store }: { store: FormationsStore }) {
  const { formations, addFormation, removeFormation, updateFormation } = store;
  const { categories, subCategories } = useCategoryOptions(formations);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionIds, setSessionIds] = useState<string[]>([]);

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);
    try {
      const entry = await addFormation(draft.file, draft.detail, draft.trait, draft.category, draft.subCategory);
      setSessionIds((prev) => [entry.id, ...prev]);
      // Keep category/sub-category (usually stay the same for a run of related entries); clear the rest.
      setDraft({ file: null, category: draft.category, subCategory: draft.subCategory, detail: "", trait: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this formation.");
    } finally {
      setIsSaving(false);
    }
  }

  const justAdded = formations.filter((f) => sessionIds.includes(f.id));

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Add a letter formation</CardTitle>
        <CardSubtitle>
          Upload an image of the formation, its category/sub-category, a short detail, and the trait it&apos;s said
          to indicate — or save with only some fields filled in and fill in the rest later (edit any row below). The
          form stays open after each add so you can enter several rows one after another. Saved in your browser only.
        </CardSubtitle>
        <div className="mt-4">
          <EntryForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={handleSubmit}
            isSaving={isSaving}
            error={error}
            categories={categories}
            subCategories={subCategories}
          />
        </div>
      </Card>

      {justAdded.length > 0 && (
        <Card padding="p-3">
          <CardTitle className="px-2 pt-1">Added this session ({justAdded.length})</CardTitle>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b border-border-soft">
                  <th className="py-2 px-2 font-medium">Formation</th>
                  <th className="py-2 px-2 font-medium">Category</th>
                  <th className="py-2 px-2 font-medium">Sub-category</th>
                  <th className="py-2 px-2 font-medium">Detail</th>
                  <th className="py-2 px-2 font-medium">Trait</th>
                  <th className="py-2 px-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {justAdded.map((f) => (
                  <FormationRow key={f.id} f={f} onRemove={removeFormation} onUpdate={updateFormation} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FormationTableTab({ store }: { store: FormationsStore }) {
  const { formations, loaded, addFormation, removeFormation, updateFormation } = store;
  const { categories, subCategories } = useCategoryOptions(formations);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);
    try {
      await addFormation(draft.file, draft.detail, draft.trait, draft.category, draft.subCategory);
      setDraft({ file: null, category: draft.category, subCategory: draft.subCategory, detail: "", trait: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this formation.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Submit a formation</CardTitle>
        <CardSubtitle>Drag &amp; drop or upload an image, fill in the details, and add a row to the table below. Add several in a row — the form stays ready.</CardSubtitle>
        <div className="mt-3">
          <EntryForm
            draft={draft}
            setDraft={setDraft}
            onSubmit={handleSubmit}
            isSaving={isSaving}
            error={error}
            categories={categories}
            subCategories={subCategories}
            compact
          />
        </div>
      </Card>

      <Card padding="p-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-text-muted border-b border-border-soft">
                <th className="py-2 px-2 font-medium">Formation</th>
                <th className="py-2 px-2 font-medium">Category</th>
                <th className="py-2 px-2 font-medium">Sub-category</th>
                <th className="py-2 px-2 font-medium">Detail</th>
                <th className="py-2 px-2 font-medium">Trait</th>
                <th className="py-2 px-2 font-medium">Added</th>
                <th className="py-2 px-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {formations.map((f) => (
                <FormationRow key={f.id} f={f} onRemove={removeFormation} onUpdate={updateFormation} showAdded />
              ))}
              {loaded && formations.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-sm text-text-muted">
                    No formations yet. Add one above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(iso).toLocaleString();
}

function BackupControls({ store }: { store: FormationsStore }) {
  const { formations, exportFormations, importFormations, autoBackup } = store;
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleImportFile(file: File) {
    setImportError(null);
    setImportMessage(null);
    try {
      const count = await importFormations(file, importMode);
      setImportMessage(`Imported ${count} formation${count === 1 ? "" : "s"} (${importMode === "merge" ? "merged with" : "replacing"} existing library).`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not import this file.");
    }
  }

  const autoBadge = {
    unsupported: null,
    disabled: <Badge tone="neutral">Auto-backup off</Badge>,
    active: <Badge tone="success">Auto-backup on{autoBackup.fileName ? ` — ${autoBackup.fileName}` : ""}</Badge>,
    "permission-needed": <Badge tone="warning">Auto-backup needs reconnecting</Badge>,
    error: <Badge tone="danger">Auto-backup error</Badge>,
  }[autoBackup.status];

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle>Backup &amp; Restore</CardTitle>
          <CardSubtitle>
            {formations.length} formation{formations.length === 1 ? "" : "s"} saved in this browser. Export/import
            work everywhere; automatic backup to a file on disk is available in Chromium browsers (Chrome, Edge).
          </CardSubtitle>
        </div>
        {autoBadge}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl bg-surface-alt px-4 py-3">
          <p className="text-xs font-semibold text-text-strong mb-2">Manual backup (all browsers)</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportFormations} disabled={formations.length === 0}>
              Export as JSON
            </Button>
            <Button variant="outline" onClick={() => importInputRef.current?.click()}>
              Import from JSON
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f);
                e.target.value = "";
              }}
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={importMode === "replace"}
              onChange={(e) => setImportMode(e.target.checked ? "replace" : "merge")}
            />
            Replace entire library on import (unchecked = merge with what&apos;s already here)
          </label>
          {importMessage && <p className="mt-2 text-xs text-[#2f6b4d]">{importMessage}</p>}
          {importError && <p className="mt-2 text-xs text-danger">{importError}</p>}
        </div>

        <div className="rounded-xl bg-surface-alt px-4 py-3">
          <p className="text-xs font-semibold text-text-strong mb-2">Automatic backup to disk</p>
          {!autoBackup.supported && (
            <p className="text-xs text-text-muted">
              Not available in this browser. Use Export/Import (left) as your backup — ideally after adding a batch
              of formations.
            </p>
          )}
          {autoBackup.supported && autoBackup.status === "disabled" && (
            <>
              <p className="text-xs text-text-muted mb-2">
                Connect a file once; every add/remove is then written to it automatically, no further prompts.
              </p>
              <Button variant="outline" onClick={autoBackup.enable}>
                Connect a backup file…
              </Button>
            </>
          )}
          {autoBackup.status === "active" && (
            <>
              <p className="text-xs text-text-muted">
                Writing to <strong>{autoBackup.fileName}</strong> automatically.{" "}
                {autoBackup.lastBackupAt ? `Last saved ${timeAgo(autoBackup.lastBackupAt)}.` : ""}
              </p>
              <Button variant="ghost" className="mt-2 px-0 text-xs text-text-muted hover:text-danger" onClick={autoBackup.disable}>
                Disconnect
              </Button>
            </>
          )}
          {autoBackup.status === "permission-needed" && (
            <>
              <p className="text-xs text-text-muted mb-2">
                Permission to write to {autoBackup.fileName ?? "the backup file"} needs to be reconfirmed (this
                happens after a browser restart in some cases).
              </p>
              <Button variant="outline" onClick={autoBackup.reconnect}>
                Reconnect
              </Button>
            </>
          )}
          {autoBackup.status === "error" && (
            <>
              <p className="text-xs text-danger mb-2">{autoBackup.error ?? "Auto-backup failed."}</p>
              <Button variant="outline" onClick={autoBackup.reconnect}>
                Retry
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * Every 15 minutes while there are unsaved-to-backup changes (an add, edit,
 * or remove since the last export/auto-backup), nudge the user to back up.
 * "Saved" here means backed up externally — localStorage already persists
 * every change immediately, so this is purely a reminder, not a data-loss
 * risk in the moment; skipping it just means asking again in 15 more minutes.
 */
function BackupReminderModal({ store }: { store: FormationsStore }) {
  const { hasUnsavedChanges, markBackedUp, exportFormations, formations } = store;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setOpen((wasOpen) => wasOpen || hasUnsavedChanges);
    }, BACKUP_REMINDER_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasUnsavedChanges]);

  if (!open || formations.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
      <Card className="max-w-sm w-full">
        <CardTitle>Back up your Letter Formations?</CardTitle>
        <CardSubtitle>
          It&apos;s been 15 minutes since your last backup and you&apos;ve made changes. Your data is already saved
          in this browser, but exporting a backup file protects it if browser data ever gets cleared.
        </CardSubtitle>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setOpen(false);
              markBackedUp();
            }}
          >
            Continue without saving
          </Button>
          <Button
            onClick={() => {
              exportFormations();
              setOpen(false);
            }}
          >
            Export now
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function FormationsPanel() {
  const store = useFormations();
  const [subTab, setSubTab] = useState<FormationsSubTab>("add");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Letter Formations</h2>
        <p className="text-sm text-text-muted mt-1">
          A reference library of letter-formation examples, grouped by category and sub-category, and the
          personality trait each is said to indicate — your own annotated notes, kept in this browser. This library
          is informational only: it is not wired into the automated rule engine or trait scoring elsewhere in the
          app.
        </p>
      </div>

      <BackupControls store={store} />

      <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
        {FORMATIONS_SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
              tab.key === subTab ? "bg-primary text-white" : "bg-surface-alt text-text-muted hover:text-text-strong"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {subTab === "add" && <AddFormationTab store={store} />}
      {subTab === "table" && <FormationTableTab store={store} />}

      <BackupReminderModal store={store} />
    </div>
  );
}
