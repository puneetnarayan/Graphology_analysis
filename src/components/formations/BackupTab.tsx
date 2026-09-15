"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { formatDateDMY, type FormationsStore } from "./FormationsPanel";
import type { ImportAnalysis, LibraryDuplicateScan } from "@/state/useFormations";
import type { FormationEntry } from "@/types";

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return new Date(iso).toLocaleString();
}

function DuplicateImportModal({
  analysis,
  mode,
  onResolve,
}: {
  analysis: ImportAnalysis;
  mode: "merge" | "replace";
  onResolve: (choice: "skip" | "keep" | "cancel") => void;
}) {
  const total = analysis.duplicateWithinFile + analysis.duplicateWithExisting;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
      <Card className="max-w-md w-full">
        <CardTitle>Duplicate entries found</CardTitle>
        <CardSubtitle>
          {analysis.duplicateWithExisting > 0 && (
            <>
              {analysis.duplicateWithExisting} entr{analysis.duplicateWithExisting === 1 ? "y" : "ies"} in this file{" "}
              {analysis.duplicateWithExisting === 1 ? "is" : "are"} an exact match (same parameter, character,
              sub-category, detail, trait, tag, and image) for something already in your library.{" "}
            </>
          )}
          {analysis.duplicateWithinFile > 0 && (
            <>
              {analysis.duplicateWithinFile} entr{analysis.duplicateWithinFile === 1 ? "y" : "ies"} repeat
              {analysis.duplicateWithinFile === 1 ? "s" : ""} another row within this same file.{" "}
            </>
          )}
          {total} of {analysis.entries.length} total will be skipped if you remove duplicates; {analysis.deduped.length}{" "}
          would be imported{mode === "merge" ? " (merged with what's already here)" : ""}.
        </CardSubtitle>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={() => onResolve("skip")}>Skip duplicates, import the rest ({analysis.deduped.length})</Button>
          <Button variant="outline" onClick={() => onResolve("keep")}>
            Import everything anyway, keep duplicates ({analysis.entries.length})
          </Button>
          <Button variant="outline" onClick={() => onResolve("cancel")}>
            Cancel import
          </Button>
        </div>
      </Card>
    </div>
  );
}

function LibraryDuplicateModal({
  scan,
  onResolve,
}: {
  scan: LibraryDuplicateScan;
  onResolve: (choice: "remove" | "cancel") => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4" role="dialog" aria-modal="true">
      <Card className="max-w-md w-full max-h-[80vh] overflow-y-auto">
        <CardTitle>Duplicate entries in your library</CardTitle>
        <CardSubtitle>
          Found {scan.groups.length} group{scan.groups.length === 1 ? "" : "s"} of exact duplicates (same parameter,
          character, sub-category, detail, trait, tag, and image) — {scan.totalDuplicates} extra{" "}
          entr{scan.totalDuplicates === 1 ? "y" : "ies"} beyond the first, oldest copy of each. Nothing is removed
          until you confirm.
        </CardSubtitle>
        <div className="mt-3 max-h-56 overflow-y-auto rounded-lg bg-surface-alt px-3 py-2">
          {scan.groups.map((g, i) => (
            <p key={g.keep.id} className={`text-xs text-text-body ${i > 0 ? "mt-1.5 pt-1.5 border-t border-border-soft" : ""}`}>
              <span className="font-semibold">
                {g.keep.parameter || "(no parameter)"}
                {g.keep.character ? ` "${g.keep.character}"` : ""}
              </span>{" "}
              <span className="text-text-muted">
                — {g.remove.length + 1} copies, keeping the one added {formatDateDMY(g.keep.createdAt)}
              </span>
            </p>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Button onClick={() => onResolve("remove")}>Remove {scan.totalDuplicates} duplicate{scan.totalDuplicates === 1 ? "" : "s"}</Button>
          <Button variant="outline" onClick={() => onResolve("cancel")}>
            Cancel, keep everything
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function BackupTab({ store }: { store: FormationsStore }) {
  const {
    formations,
    exportFormations,
    analyzeImportFile,
    commitImport,
    exportFormationsCsv,
    autoBackup,
    githubSync,
    findLibraryDuplicates,
    removeDuplicateFormations,
  } = store;
  const importInputRef = useRef<HTMLInputElement>(null);
  const importCsvInputRef = useRef<HTMLInputElement>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ analysis: ImportAnalysis; mode: "merge" | "replace" } | null>(null);
  const [libraryScan, setLibraryScan] = useState<LibraryDuplicateScan | null>(null);
  const [dupCheckMessage, setDupCheckMessage] = useState<string | null>(null);

  function handleCheckDuplicates() {
    setDupCheckMessage(null);
    const scan = findLibraryDuplicates();
    if (scan.totalDuplicates === 0) {
      setDupCheckMessage("No duplicates found — every entry in your library is unique.");
    } else {
      setLibraryScan(scan);
    }
  }

  async function handleLibraryDuplicateChoice(choice: "remove" | "cancel") {
    if (!libraryScan) return;
    const scan = libraryScan;
    setLibraryScan(null);
    if (choice === "cancel") return;
    const ids = scan.groups.flatMap((g) => g.remove.map((f) => f.id));
    const count = await removeDuplicateFormations(ids);
    setDupCheckMessage(`Removed ${count} duplicate${count === 1 ? "" : "s"}.`);
  }

  async function finishImport(entries: FormationEntry[], mode: "merge" | "replace") {
    const count = await commitImport(entries, mode);
    setImportMessage(`Imported ${count} formation${count === 1 ? "" : "s"} (${mode === "merge" ? "merged with" : "replacing"} existing library).`);
  }

  async function handleImportFile(file: File, kind: "json" | "csv") {
    setImportError(null);
    setImportMessage(null);
    try {
      const analysis = await analyzeImportFile(file, kind, importMode);
      if (analysis.duplicateWithinFile + analysis.duplicateWithExisting > 0) {
        setPendingImport({ analysis, mode: importMode });
      } else {
        await finishImport(analysis.entries, importMode);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Could not import this file.");
    }
  }

  async function handleDuplicateChoice(choice: "skip" | "keep" | "cancel") {
    if (!pendingImport) return;
    const { analysis, mode } = pendingImport;
    setPendingImport(null);
    if (choice === "cancel") return;
    await finishImport(choice === "skip" ? analysis.deduped : analysis.entries, mode);
  }

  const autoBadge = {
    unsupported: null,
    disabled: <Badge tone="neutral">Auto-backup off</Badge>,
    active: <Badge tone="success">Auto-backup on{autoBackup.fileName ? ` — ${autoBackup.fileName}` : ""}</Badge>,
    "permission-needed": <Badge tone="warning">Auto-backup needs reconnecting</Badge>,
    error: <Badge tone="danger">Auto-backup error</Badge>,
  }[autoBackup.status];

  const githubBadge = {
    checking: null,
    unconfigured: null,
    synced: <Badge tone="success">Synced to GitHub{githubSync.lastSyncedAt ? ` — ${timeAgo(githubSync.lastSyncedAt)}` : ""}</Badge>,
    syncing: <Badge tone="neutral">Syncing to GitHub…</Badge>,
    error: <Badge tone="danger">GitHub sync error</Badge>,
  }[githubSync.status];

  const githubConfigured = githubSync.status !== "unconfigured" && githubSync.status !== "checking";

  return (
    <Card>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <CardTitle>Backup &amp; Restore</CardTitle>
          <CardSubtitle>
            {githubConfigured ? (
              <>
                {formations.length} formation{formations.length === 1 ? "" : "s"} — this library lives in your
                GitHub repo (synced automatically after each change); IndexedDB in this browser is a local cache
                for offline/fast access.
              </>
            ) : (
              <>
                {formations.length} formation{formations.length === 1 ? "" : "s"} saved in this browser. Export/import
                work everywhere; automatic backup to a file on disk is available in Chromium browsers (Chrome, Edge).
              </>
            )}
          </CardSubtitle>
        </div>
        <div className="flex flex-col items-end gap-1">
          {githubBadge}
          {autoBadge}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3 flex-wrap">
        <Button variant="outline" onClick={handleCheckDuplicates} disabled={formations.length === 0}>
          Check Library for Duplicates
        </Button>
        {dupCheckMessage && <p className="text-xs text-text-muted">{dupCheckMessage}</p>}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                if (f) handleImportFile(f, "json");
                e.target.value = "";
              }}
            />
            <Button variant="outline" onClick={exportFormationsCsv} disabled={formations.length === 0}>
              Export as CSV
            </Button>
            <Button variant="outline" onClick={() => importCsvInputRef.current?.click()}>
              Import from CSV
            </Button>
            <input
              ref={importCsvInputRef}
              type="file"
              accept="text/csv,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImportFile(f, "csv");
                e.target.value = "";
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-text-muted">
            CSV covers text fields only (parameter, character, sub-category, detail, trait, tag) — a header row
            naming any of those columns, any order; no images. Handy for bulk-editing in a spreadsheet, then adding
            images afterward via Edit. JSON is the full round-trip format, images included.
          </p>
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

        <div className="rounded-xl bg-surface-alt px-4 py-3">
          <p className="text-xs font-semibold text-text-strong mb-2">GitHub sync</p>
          {githubSync.status === "checking" && <p className="text-xs text-text-muted">Checking…</p>}
          {githubSync.status === "unconfigured" && (
            <p className="text-xs text-text-muted">
              Not set up on this deployment — the library stays local to this browser (left/middle). To make GitHub
              the live source of truth (readable/writable from any device), set{" "}
              <code>GITHUB_BACKUP_TOKEN</code>, <code>GITHUB_BACKUP_OWNER</code>, and{" "}
              <code>GITHUB_BACKUP_REPO</code> as environment variables (see README) and redeploy.
            </p>
          )}
          {(githubSync.status === "synced" || githubSync.status === "syncing") && (
            <p className="text-xs text-text-muted">
              Every add, edit, or remove is committed automatically a moment later — one commit updates the live
              file and adds a new timestamped snapshot (oldest ones pruned beyond the configured count).{" "}
              {githubSync.lastSyncedAt ? `Last synced ${timeAgo(githubSync.lastSyncedAt)}.` : ""}
            </p>
          )}
          {githubSync.status === "error" && (
            <>
              <p className="text-xs text-danger mb-2">{githubSync.error ?? "GitHub sync failed."}</p>
              <Button variant="outline" onClick={githubSync.retry} disabled={formations.length === 0}>
                Retry Sync
              </Button>
            </>
          )}
        </div>
      </div>

      {pendingImport && (
        <DuplicateImportModal analysis={pendingImport.analysis} mode={pendingImport.mode} onResolve={handleDuplicateChoice} />
      )}
      {libraryScan && <LibraryDuplicateModal scan={libraryScan} onResolve={handleLibraryDuplicateChoice} />}
    </Card>
  );
}

/** How long to wait, with unsaved changes pending, before nagging for a backup. */
const BACKUP_REMINDER_INTERVAL_MS = 15 * 60 * 1000;
/** Longer interval used once an automatic backup file is connected — there's less at stake. */
const BACKUP_REMINDER_INTERVAL_ACTIVE_MS = 30 * 60 * 1000;

/**
 * Nudges the user to back up while there are unsaved-to-backup changes (an
 * add, edit, or remove since the last export/auto-backup) — every 15 minutes
 * normally, or every 30 minutes once an automatic backup file is connected
 * (less urgent, since changes are already being written there). "Saved" here
 * means backed up externally — localStorage already persists every change
 * immediately, so this is purely a reminder, not a data-loss risk in the
 * moment; skipping it just means asking again next interval. Mounted once at
 * the app shell level (not per-page) so it keeps firing no matter which
 * section is currently active.
 */
export function BackupReminderModal({ store }: { store: FormationsStore }) {
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
