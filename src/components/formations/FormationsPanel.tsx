"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FORMATIONS_SUB_TABS, type FormationsSubTab } from "@/state/navigation";
import { useFormations } from "@/state/useFormations";
import type { FormationEntry } from "@/types";

function DropZone({
  file,
  onFile,
  compact = false,
}: {
  file: File | null;
  onFile: (f: File | null) => void;
  compact?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewUrl = file ? URL.createObjectURL(file) : null;

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex ${compact ? "h-24" : "h-40"} cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 text-center transition-colors ${
        isDragging ? "border-primary bg-primary-soft" : "border-border-soft bg-surface-alt hover:bg-primary-softer"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewUrl} alt="" className={`${compact ? "h-16" : "h-28"} rounded-lg object-contain`} />
      ) : (
        <>
          <span className="text-xs font-medium text-text-body">Drag &amp; drop an image here, or click to browse</span>
          <span className="text-[11px] text-text-muted">A cropped snippet of the formation works best</span>
        </>
      )}
    </div>
  );
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

function MiniFormationRow({ f, onRemove }: { f: FormationEntry; onRemove: (id: string) => void }) {
  return (
    <tr className="border-b border-border-soft/60 last:border-0">
      <td className="py-2 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={f.imageDataUrl} alt="" className="h-14 w-20 rounded-lg object-contain bg-surface-alt border border-border-soft" />
      </td>
      <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.category || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.subCategory || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 text-text-body max-w-[220px]">{f.detail}</td>
      <td className="py-2 px-2 font-semibold text-primary-dark">{f.trait}</td>
      <td className="py-2 px-2 text-right">
        <button onClick={() => onRemove(f.id)} className="text-xs text-text-muted hover:text-danger" title="Remove">
          Remove
        </button>
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
  const canSubmit = !!draft.file && draft.detail.trim().length > 0 && draft.trait.trim().length > 0 && !isSaving;

  return (
    <>
      <div className={`grid grid-cols-1 ${compact ? "sm:grid-cols-[160px_1fr_1fr_1fr_1fr_auto]" : "sm:grid-cols-2"} gap-3 items-start`}>
        <DropZone file={draft.file} onFile={(file) => setDraft({ ...draft, file })} compact={compact} />
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

function AddFormationTab() {
  const { formations, addFormation, removeFormation } = useFormations();
  const { categories, subCategories } = useCategoryOptions(formations);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionIds, setSessionIds] = useState<string[]>([]);

  async function handleSubmit() {
    if (!draft.file) return;
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
          to indicate. The form stays open after each add so you can enter several rows one after another. Saved in
          your browser only.
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
                  <MiniFormationRow key={f.id} f={f} onRemove={removeFormation} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function FormationTableTab() {
  const { formations, loaded, addFormation, removeFormation } = useFormations();
  const { categories, subCategories } = useCategoryOptions(formations);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!draft.file) return;
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
                <tr key={f.id} className="border-b border-border-soft/60 last:border-0">
                  <td className="py-2 px-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.imageDataUrl} alt="" className="h-14 w-20 rounded-lg object-contain bg-surface-alt border border-border-soft" />
                  </td>
                  <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.category || <span className="text-text-muted italic">—</span>}</td>
                  <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.subCategory || <span className="text-text-muted italic">—</span>}</td>
                  <td className="py-2 px-2 text-text-body max-w-[220px]">{f.detail}</td>
                  <td className="py-2 px-2 font-semibold text-primary-dark">{f.trait}</td>
                  <td className="py-2 px-2 text-text-muted whitespace-nowrap">
                    {new Date(f.createdAt).toLocaleDateString()}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <button
                      onClick={() => removeFormation(f.id)}
                      className="text-xs text-text-muted hover:text-danger"
                      title="Remove"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
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

export function FormationsPanel() {
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

      {subTab === "add" && <AddFormationTab />}
      {subTab === "table" && <FormationTableTab />}
    </div>
  );
}
