"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { FORMATIONS_SUB_TABS, type FormationsSubTab } from "@/state/navigation";
import { useFormations } from "@/state/useFormations";
import { extractImageFileFromClipboard } from "@/utils/clipboard";
import { HANDWRITING_PARAMETERS, FORMATION_TAGS, FORMATION_TAG_LABELS, type FormationEntry, type FormationTag } from "@/types";

type FormationsStore = ReturnType<typeof useFormations>;

/** How long to wait, with unsaved changes pending, before nagging for a backup. */
const BACKUP_REMINDER_INTERVAL_MS = 15 * 60 * 1000;
/** Longer interval used once an automatic backup file is connected — there's less at stake. */
const BACKUP_REMINDER_INTERVAL_ACTIVE_MS = 30 * 60 * 1000;

/** dd-mm-yyyy, per the app's date display convention. */
function formatDateDMY(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

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
  parameter: string;
  character: string;
  subCategory: string;
  detail: string;
  trait: string;
  tag: FormationTag | "";
}

const EMPTY_DRAFT: DraftFields = { file: null, parameter: "", character: "", subCategory: "", detail: "", trait: "", tag: "" };

function useSubCategoryOptions(formations: FormationEntry[]) {
  return useMemo(() => Array.from(new Set(formations.map((f) => f.subCategory).filter(Boolean))), [formations]);
}

const TAG_BADGE_TONE: Record<FormationTag, "success" | "danger" | "warning"> = {
  positive: "success",
  negative: "danger",
  medium: "warning",
};

function TagBadge({ tag }: { tag?: FormationTag }) {
  if (!tag) return <span className="text-text-muted italic text-xs">—</span>;
  return <Badge tone={TAG_BADGE_TONE[tag]}>{FORMATION_TAG_LABELS[tag]}</Badge>;
}

function TagField({ value, onChange, compact = false }: { value: FormationTag | ""; onChange: (v: FormationTag | "") => void; compact?: boolean }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as FormationTag | "")}
      className={`w-full rounded-lg bg-surface text-sm h-10 ${compact ? "px-2" : "border border-border-soft px-3"}`}
    >
      <option value="">Unspecified</option>
      {FORMATION_TAGS.map((t) => (
        <option key={t} value={t}>
          {FORMATION_TAG_LABELS[t]}
        </option>
      ))}
    </select>
  );
}

/**
 * Dropdown of the app's own handwriting-analysis parameter vocabulary
 * (`HANDWRITING_PARAMETERS`), so formations line up with the same
 * categories the rule engine measures elsewhere in the app. Falls back to a
 * free-text field via "Other…" for anything that doesn't fit, and also
 * surfaces as free text automatically if the current value is an older
 * custom category that predates this list, so nothing gets silently reset.
 */
function ParameterField({ value, onChange, compact = false }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const isKnown = (HANDWRITING_PARAMETERS as readonly string[]).includes(value);
  const [customMode, setCustomMode] = useState(!!value && !isKnown);

  if (customMode) {
    return (
      <div className="flex gap-1 items-center">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Custom parameter"
          className={`w-full rounded-lg bg-surface text-sm h-10 ${compact ? "px-2" : "border border-border-soft px-3"}`}
        />
        <button
          type="button"
          title="Choose from the standard list instead"
          onClick={() => {
            setCustomMode(false);
            onChange("");
          }}
          className="shrink-0 rounded-lg px-2 py-1.5 text-xs text-text-muted"
        >
          List
        </button>
      </div>
    );
  }

  return (
    <select
      value={isKnown ? value : ""}
      onChange={(e) => {
        if (e.target.value === "__other__") {
          setCustomMode(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      className={`w-full rounded-lg bg-surface text-sm h-10 ${compact ? "px-2" : "border border-border-soft px-3"}`}
    >
      <option value="">Select a parameter…</option>
      {HANDWRITING_PARAMETERS.map((p) => (
        <option key={p} value={p}>
          {p}
        </option>
      ))}
      <option value="__other__">Other…</option>
    </select>
  );
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
  parameter: string;
  character: string;
  subCategory: string;
  detail: string;
  trait: string;
  tag: FormationTag | "";
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
    parameter: f.parameter,
    character: f.character ?? "",
    subCategory: f.subCategory,
    detail: f.detail,
    trait: f.trait,
    tag: f.tag ?? "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const editImageUrl = useObjectUrl(edit.file ?? null);
  const displayImageUrl = edit.file === null ? null : edit.file ? editImageUrl : (f.imageDataUrl ?? null);

  function startEdit() {
    setEdit({
      parameter: f.parameter,
      character: f.character ?? "",
      subCategory: f.subCategory,
      detail: f.detail,
      trait: f.trait,
      tag: f.tag ?? "",
    });
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
          <ParameterField value={edit.parameter} onChange={(v) => setEdit({ ...edit, parameter: v })} compact />
        </td>
        <td className="py-2 px-2 align-top">
          <input
            value={edit.character}
            onChange={(e) => setEdit({ ...edit, character: e.target.value })}
            placeholder="Character"
            maxLength={4}
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
        <td className="py-2 px-2 align-top">
          <TagField value={edit.tag} onChange={(v) => setEdit({ ...edit, tag: v })} compact />
        </td>
        {showAdded && <td className="py-2 px-2 align-top text-text-muted whitespace-nowrap">{formatDateDMY(f.createdAt)}</td>}
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
      <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.parameter || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 text-text-body whitespace-nowrap font-mono">{f.character || <span className="text-text-muted italic font-sans">—</span>}</td>
      <td className="py-2 px-2 text-text-body whitespace-nowrap">{f.subCategory || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 text-text-body max-w-[220px]">{f.detail || <span className="text-text-muted italic">—</span>}</td>
      <td className="py-2 px-2 font-semibold text-primary-dark">{f.trait || <span className="text-text-muted italic font-normal">—</span>}</td>
      <td className="py-2 px-2 whitespace-nowrap">
        <TagBadge tag={f.tag} />
      </td>
      {showAdded && <td className="py-2 px-2 text-text-muted whitespace-nowrap">{formatDateDMY(f.createdAt)}</td>}
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

/** Shared entry form: parameter, character, sub-category, detail, trait + image. Used on both sub-tabs. */
/**
 * Wide, full-width entry form: an image picker beside a grid of fields that
 * spreads out across the available width (rather than being squeezed into a
 * narrow sidebar column), so longer detail/trait text is actually readable
 * while typing.
 */
function EntryForm({
  draft,
  setDraft,
  onSubmit,
  isSaving,
  error,
  subCategories,
  submitLabel = "Add to Formation Library",
}: {
  draft: DraftFields;
  setDraft: (d: DraftFields) => void;
  onSubmit: () => void;
  isSaving: boolean;
  error: string | null;
  subCategories: string[];
  submitLabel?: string;
}) {
  const draftImageUrl = useObjectUrl(draft.file);
  const hasContent =
    !!draft.file ||
    !!draft.parameter.trim() ||
    !!draft.character.trim() ||
    !!draft.subCategory.trim() ||
    !!draft.detail.trim() ||
    !!draft.trait.trim();
  const canSubmit = hasContent && !isSaving;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
        <DropZone imageUrl={draftImageUrl} onFile={(file) => setDraft({ ...draft, file })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-xs font-medium text-text-body">
            Parameter
            <div className="mt-1">
              <ParameterField value={draft.parameter} onChange={(v) => setDraft({ ...draft, parameter: v })} />
            </div>
          </label>
          <label className="text-xs font-medium text-text-body">
            Character
            <input
              value={draft.character}
              onChange={(e) => setDraft({ ...draft, character: e.target.value })}
              placeholder='e.g. "t" — optional'
              maxLength={4}
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-xs font-medium text-text-body">
            Sub-category
            <input
              value={draft.subCategory}
              onChange={(e) => setDraft({ ...draft, subCategory: e.target.value })}
              placeholder="e.g. Garland"
              list="formation-subcategories"
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-xs font-medium text-text-body sm:col-span-2">
            Detail of the formation
            <input
              value={draft.detail}
              onChange={(e) => setDraft({ ...draft, detail: e.target.value })}
              placeholder='e.g. "Wavy line — no angles, just curves"'
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-xs font-medium text-text-body">
            Trait / personality aspect
            <input
              value={draft.trait}
              onChange={(e) => setDraft({ ...draft, trait: e.target.value })}
              placeholder='e.g. "Diplomatic"'
              className="mt-1 w-full rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-10 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </label>
          <label className="text-xs font-medium text-text-body">
            Tag
            <div className="mt-1">
              <TagField value={draft.tag} onChange={(v) => setDraft({ ...draft, tag: v })} />
            </div>
          </label>
        </div>
      </div>
      <datalist id="formation-subcategories">
        {subCategories.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      <div className="mt-4 flex justify-end">
        <Button disabled={!canSubmit} onClick={onSubmit}>
          {isSaving ? "Saving…" : submitLabel}
        </Button>
      </div>
    </>
  );
}

/**
 * The Formation Library sub-tab: the entry form sits in a left column right
 * next to the workflow sidebar, the table of saved formations to its right.
 * There's no separate "add" tab — this form is always here, and whatever you
 * add appears immediately at the top of the table beside it.
 */
type GroupBy = "none" | "parameter" | "character" | "tag";

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs whitespace-nowrap ${active ? "bg-primary text-white" : "bg-surface-alt text-text-muted hover:text-text-strong"}`}
    >
      {children}
    </button>
  );
}

const TABLE_COLUMN_COUNT = 9;

/**
 * The saved-formations table: full width, with search, Parameter/Tag filter
 * chips, and an optional Group-by (Parameter / Character / Tag) that renders
 * collapsible group headers instead of one flat list.
 */
function FormationsTable({ store }: { store: FormationsStore }) {
  const { formations, loaded, removeFormation, updateFormation } = store;
  const [search, setSearch] = useState("");
  const [parameterFilter, setParameterFilter] = useState<string>("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const parameters = useMemo(
    () => Array.from(new Set(formations.map((f) => f.parameter).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [formations],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return formations.filter((f) => {
      if (parameterFilter !== "all" && f.parameter !== parameterFilter) return false;
      if (tagFilter !== "all" && (f.tag ?? "") !== tagFilter) return false;
      if (q) {
        const haystack = [f.parameter, f.character, f.subCategory, f.detail, f.trait].filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [formations, parameterFilter, tagFilter, search]);

  const groups = useMemo(() => {
    if (groupBy === "none") return [{ key: "__all__", label: null as string | null, items: filtered }];
    const map = new Map<string, FormationEntry[]>();
    for (const f of filtered) {
      const key =
        groupBy === "parameter"
          ? f.parameter || "(no parameter)"
          : groupBy === "character"
            ? f.character || "(no character)"
            : f.tag
              ? FORMATION_TAG_LABELS[f.tag]
              : "Unspecified";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => ({ key, label: key as string | null, items }));
  }, [filtered, groupBy]);

  function toggleGroup(key: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card padding="p-3">
      <div className="flex flex-wrap items-center gap-2 px-2 pt-1 pb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search parameter, character, detail, trait…"
          className="flex-1 min-w-[200px] rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-9 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="rounded-lg border border-border-soft bg-surface px-2 text-sm h-9"
        >
          <option value="none">No grouping</option>
          <option value="parameter">Group by Parameter</option>
          <option value="character">Group by Character</option>
          <option value="tag">Group by Tag</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5 px-2 pb-2">
        <FilterChip active={tagFilter === "all"} onClick={() => setTagFilter("all")}>
          All tags
        </FilterChip>
        {FORMATION_TAGS.map((t) => (
          <FilterChip key={t} active={tagFilter === t} onClick={() => setTagFilter(t)}>
            {FORMATION_TAG_LABELS[t]}
          </FilterChip>
        ))}
      </div>

      {parameters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2 pb-3 border-b border-border-soft mb-2">
          <FilterChip active={parameterFilter === "all"} onClick={() => setParameterFilter("all")}>
            All parameters
          </FilterChip>
          {parameters.map((p) => (
            <FilterChip key={p} active={parameterFilter === p} onClick={() => setParameterFilter(p)}>
              {p}
            </FilterChip>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-muted border-b border-border-soft">
              <th className="py-2 px-2 font-medium">Formation</th>
              <th className="py-2 px-2 font-medium">Parameter</th>
              <th className="py-2 px-2 font-medium">Character</th>
              <th className="py-2 px-2 font-medium">Sub-category</th>
              <th className="py-2 px-2 font-medium">Detail</th>
              <th className="py-2 px-2 font-medium">Trait</th>
              <th className="py-2 px-2 font-medium">Tag</th>
              <th className="py-2 px-2 font-medium">Added</th>
              <th className="py-2 px-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                {g.label !== null && (
                  <tr>
                    <td colSpan={TABLE_COLUMN_COUNT} className="pt-3 pb-1 px-2">
                      <button
                        onClick={() => toggleGroup(g.key)}
                        className="flex items-center gap-1.5 text-xs font-semibold text-text-strong px-2 py-1 rounded-lg hover:bg-surface-alt"
                      >
                        <span className="text-text-muted">{collapsedGroups.has(g.key) ? "▶" : "▼"}</span>
                        {g.label} <span className="text-text-muted font-normal">({g.items.length})</span>
                      </button>
                    </td>
                  </tr>
                )}
                {!collapsedGroups.has(g.key) &&
                  g.items.map((f) => <FormationRow key={f.id} f={f} onRemove={removeFormation} onUpdate={updateFormation} showAdded />)}
              </Fragment>
            ))}
            {loaded && formations.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLUMN_COUNT} className="py-6 text-center text-sm text-text-muted">
                  No formations yet. Add one above.
                </td>
              </tr>
            )}
            {loaded && formations.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={TABLE_COLUMN_COUNT} className="py-6 text-center text-sm text-text-muted">
                  No formations match this search/filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * The Formation Library sub-tab: the entry form sits in a full-width card
 * above the table (so its fields have room to show longer text while
 * typing), and the table below spans the full page width. There's no
 * separate "add" tab — this form is always here, and whatever you add
 * appears immediately at the top of the table beneath it.
 */
function FormationLibraryTab({ store }: { store: FormationsStore }) {
  const { formations, addFormation } = store;
  const subCategories = useSubCategoryOptions(formations);
  const [draft, setDraft] = useState<DraftFields>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setIsSaving(true);
    setError(null);
    try {
      await addFormation({
        file: draft.file,
        detail: draft.detail,
        trait: draft.trait,
        parameter: draft.parameter,
        character: draft.character,
        subCategory: draft.subCategory,
        tag: draft.tag,
      });
      // Keep parameter/character/sub-category/tag (usually stay the same for a run of related entries); clear the rest.
      setDraft({
        file: null,
        parameter: draft.parameter,
        character: draft.character,
        subCategory: draft.subCategory,
        detail: "",
        trait: "",
        tag: draft.tag,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this formation.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardTitle>Add a letter formation</CardTitle>
        <CardSubtitle>
          Upload an image, the handwriting-analysis parameter it&apos;s about (the same categories used in
          Analysis), the specific character if relevant, a short detail, the trait it&apos;s said to indicate, and
          whether that trait reads positive/negative/medium — or save with only some fields filled in and fill in
          the rest later via Edit. New entries appear at the top of the table below, and the form stays ready for
          the next one.
        </CardSubtitle>
        <div className="mt-4">
          <EntryForm draft={draft} setDraft={setDraft} onSubmit={handleSubmit} isSaving={isSaving} error={error} subCategories={subCategories} />
        </div>
      </Card>

      <FormationsTable store={store} />
    </div>
  );
}

function TraitFormationCard({ f, onRemove }: { f: FormationEntry; onRemove: (id: string) => void }) {
  return (
    <div className="flex gap-3 rounded-xl border border-border-soft bg-surface-alt p-2.5">
      <ImageThumb src={f.imageDataUrl ?? null} size="h-16 w-16" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-text-strong">{f.parameter || <span className="italic font-normal text-text-muted">No parameter</span>}</span>
          {f.character && <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-surface text-text-body border border-border-soft">{f.character}</span>}
          <TagBadge tag={f.tag} />
        </div>
        {f.subCategory && <p className="text-[11px] text-text-muted mt-0.5">{f.subCategory}</p>}
        <p className="text-xs text-text-body mt-1 line-clamp-2">{f.detail || <span className="italic text-text-muted">No detail</span>}</p>
      </div>
      <button
        onClick={() => onRemove(f.id)}
        className="self-start shrink-0 text-[11px] text-text-muted hover:text-danger px-1.5 py-1 rounded-md"
      >
        Remove
      </button>
    </div>
  );
}

type TraitSortBy = "alpha" | "count";

/**
 * The reverse of the Formation Library: instead of "what is this formation
 * about," this answers "what formations point to trait X" — every distinct
 * trait in the library with all the formations that indicate it grouped
 * underneath, collapsible per trait. Read-focused: use Formation Library's
 * search (which also matches trait text) to find and Edit a specific row.
 */
function TraitIndexTab({ store }: { store: FormationsStore }) {
  const { formations, loaded, removeFormation } = store;
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<TraitSortBy>("alpha");
  const [collapsedTraits, setCollapsedTraits] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, FormationEntry[]>();
    for (const f of formations) {
      if (tagFilter !== "all" && (f.tag ?? "") !== tagFilter) continue;
      const key = f.trait.trim() || "(no trait yet)";
      if (q && !key.toLowerCase().includes(q)) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    const arr = Array.from(map.entries()).map(([trait, items]) => ({ trait, items }));
    arr.sort((a, b) => (sortBy === "alpha" ? a.trait.localeCompare(b.trait) : b.items.length - a.items.length));
    return arr;
  }, [formations, tagFilter, search, sortBy]);

  function toggleTrait(key: string) {
    setCollapsedTraits((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <Card padding="p-3">
      <div className="px-2 pt-1 pb-3">
        <CardTitle>Trait Index</CardTitle>
        <CardSubtitle>
          Every distinct trait in your library, with all the formations that indicate it grouped underneath — the
          reverse of the Formation Library&apos;s view. Handy for answering &quot;what formations point to
          Diplomatic?&quot; instead of &quot;what&apos;s this formation about?&quot;
        </CardSubtitle>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-2 pb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search trait…"
          className="flex-1 min-w-[200px] rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm h-9 focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as TraitSortBy)}
          className="rounded-lg border border-border-soft bg-surface px-2 text-sm h-9"
        >
          <option value="alpha">Sort A–Z</option>
          <option value="count">Sort by most formations</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-1.5 px-2 pb-3 border-b border-border-soft mb-3">
        <FilterChip active={tagFilter === "all"} onClick={() => setTagFilter("all")}>
          All tags
        </FilterChip>
        {FORMATION_TAGS.map((t) => (
          <FilterChip key={t} active={tagFilter === t} onClick={() => setTagFilter(t)}>
            {FORMATION_TAG_LABELS[t]}
          </FilterChip>
        ))}
      </div>

      <div className="flex flex-col gap-1 px-2 pb-2">
        {groups.map((g) => (
          <div key={g.trait}>
            <button
              onClick={() => toggleTrait(g.trait)}
              className="flex items-center gap-1.5 w-full text-left text-sm font-semibold text-text-strong px-2 py-2 rounded-lg hover:bg-surface-alt"
            >
              <span className="text-text-muted text-xs">{collapsedTraits.has(g.trait) ? "▶" : "▼"}</span>
              {g.trait}
              <span className="text-text-muted font-normal text-xs">({g.items.length})</span>
            </button>
            {!collapsedTraits.has(g.trait) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 pl-6 pb-3">
                {g.items.map((f) => (
                  <TraitFormationCard key={f.id} f={f} onRemove={removeFormation} />
                ))}
              </div>
            )}
          </div>
        ))}
        {loaded && formations.length === 0 && (
          <p className="text-center text-sm text-text-muted py-6">No formations yet. Add some in the Formation Library tab.</p>
        )}
        {loaded && formations.length > 0 && groups.length === 0 && (
          <p className="text-center text-sm text-text-muted py-6">No traits match this search/filter.</p>
        )}
      </div>
    </Card>
  );
}

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(iso).toLocaleString();
}

function BackupTab({ store }: { store: FormationsStore }) {
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
 * Nudges the user to back up while there are unsaved-to-backup changes (an
 * add, edit, or remove since the last export/auto-backup) — every 15 minutes
 * normally, or every 30 minutes once an automatic backup file is connected
 * (less urgent, since changes are already being written there). "Saved" here
 * means backed up externally — localStorage already persists every change
 * immediately, so this is purely a reminder, not a data-loss risk in the
 * moment; skipping it just means asking again next interval.
 */
function BackupReminderModal({ store }: { store: FormationsStore }) {
  const { hasUnsavedChanges, markBackedUp, exportFormations, formations, autoBackup } = store;
  const [open, setOpen] = useState(false);
  const intervalMs = autoBackup.status === "active" ? BACKUP_REMINDER_INTERVAL_ACTIVE_MS : BACKUP_REMINDER_INTERVAL_MS;

  useEffect(() => {
    const timer = setInterval(() => {
      setOpen((wasOpen) => wasOpen || hasUnsavedChanges);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [hasUnsavedChanges, intervalMs]);

  if (!open || formations.length === 0) return null;

  const minutes = intervalMs / 60_000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
      <Card className="max-w-sm w-full">
        <CardTitle>Back up your Letter Formations?</CardTitle>
        <CardSubtitle>
          It&apos;s been {minutes} minutes since your last backup and you&apos;ve made changes. Your data is already
          saved in this browser, but exporting a backup file protects it if browser data ever gets cleared.
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
  const [subTab, setSubTab] = useState<FormationsSubTab>("library");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Letter Formations</h2>
        <p className="text-sm text-text-muted mt-1">
          A reference library of letter-formation examples, organized by handwriting-analysis parameter (the same
          vocabulary as the Analysis tabs — Slant, T-Bars, Margins, and so on), the specific character when
          relevant, and a sub-category, alongside the personality trait each is said to indicate — your own
          annotated notes, kept in this browser. This library is informational only: it is not wired into the
          automated rule engine or trait scoring elsewhere in the app.
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

      {subTab === "library" && <FormationLibraryTab store={store} />}
      {subTab === "traitIndex" && <TraitIndexTab store={store} />}
      {subTab === "backup" && <BackupTab store={store} />}

      <BackupReminderModal store={store} />
    </div>
  );
}
