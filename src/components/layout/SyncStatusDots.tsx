"use client";

import type { FormationsStore } from "@/components/formations/FormationsPanel";

type DotTone = "green" | "amber" | "red" | "grey";

const DOT_CLASS: Record<DotTone, string> = {
  green: "bg-[#3fa06c]",
  amber: "bg-[#d99a2b]",
  red: "bg-danger",
  grey: "bg-text-muted/40",
};

function localDot(status: FormationsStore["autoBackup"]["status"]): { tone: DotTone; label: string } {
  switch (status) {
    case "active":
      return { tone: "green", label: "Local auto-backup: on and up to date" };
    case "permission-needed":
      return { tone: "amber", label: "Local auto-backup: needs reconnecting" };
    case "error":
      return { tone: "red", label: "Local auto-backup: error" };
    case "disabled":
      return { tone: "grey", label: "Local auto-backup: off" };
    case "unsupported":
    default:
      return { tone: "grey", label: "Local auto-backup: not available in this browser" };
  }
}

function githubDot(status: FormationsStore["githubSync"]["status"]): { tone: DotTone; label: string } {
  switch (status) {
    case "synced":
      return { tone: "green", label: "GitHub sync: up to date" };
    case "syncing":
    case "checking":
      return { tone: "amber", label: "GitHub sync: in progress" };
    case "error":
      return { tone: "red", label: "GitHub sync: error" };
    case "unconfigured":
    default:
      return { tone: "grey", label: "GitHub sync: not configured" };
  }
}

/**
 * Two small status dots — local (IndexedDB/auto-backup-to-disk) and GitHub
 * sync — shown next to the "Backup & Restore" nav item so sync health is
 * visible without opening that page. Color alone never carries the meaning:
 * each dot's `title` spells out the state for screen readers / hover.
 */
export function SyncStatusDots({ store }: { store: FormationsStore }) {
  const local = localDot(store.autoBackup.status);
  const github = githubDot(store.githubSync.status);
  return (
    <span className="inline-flex items-center gap-1" aria-hidden={false}>
      <span
        title={local.label}
        aria-label={local.label}
        className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[local.tone]}`}
      />
      <span
        title={github.label}
        aria-label={github.label}
        className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[github.tone]}`}
      />
    </span>
  );
}
