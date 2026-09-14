import { NextRequest, NextResponse } from "next/server";
import type { FormationEntry } from "@/types";

/**
 * The Letter Formations library's canonical storage when GitHub sync is
 * configured: GET returns the current library from the repo; PUT commits an
 * updated one, plus a timestamped snapshot under backups/, pruning older
 * snapshots beyond GITHUB_BACKUP_KEEP. This is the app's only server code —
 * everything else stays fully client-side (see README's Privacy section).
 * The GitHub write credential lives only in server environment variables
 * and is never sent to the browser.
 *
 * Writes go through the Git Data API (blob/tree/commit/ref), not the
 * simpler Contents API PUT, because the Contents API caps an individual
 * file write around 1MB — easy to exceed once a formations library has a
 * meaningful number of embedded images. The Git Data API has no such limit
 * for files this size, and lets one save (canonical update + new snapshot +
 * any pruned-snapshot deletions) land as a single commit.
 */

const GITHUB_API = "https://api.github.com";

interface GithubConfig {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  dataPath: string;
  backupsFolder: string;
  keep: number;
}

function config(): GithubConfig | null {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  const owner = process.env.GITHUB_BACKUP_OWNER;
  const repo = process.env.GITHUB_BACKUP_REPO;
  if (!token || !owner || !repo) return null;
  const keep = Number(process.env.GITHUB_BACKUP_KEEP);
  return {
    token,
    owner,
    repo,
    branch: process.env.GITHUB_BACKUP_BRANCH || "main",
    dataPath: process.env.GITHUB_BACKUP_DATA_PATH || "data/formations.json",
    backupsFolder: (process.env.GITHUB_BACKUP_FOLDER || "backups").replace(/^\/+|\/+$/g, ""),
    keep: Number.isFinite(keep) && keep > 0 ? keep : 20,
  };
}

const NOT_CONFIGURED_MESSAGE =
  "GitHub sync isn't configured on this deployment. Set GITHUB_BACKUP_TOKEN, GITHUB_BACKUP_OWNER, and GITHUB_BACKUP_REPO as environment variables (see README).";

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, { ...init, headers: { ...ghHeaders(token), ...(init?.headers as Record<string, string> | undefined) } });
}

async function errText(res: Response): Promise<string> {
  return (await res.text().catch(() => "")).slice(0, 400);
}

/** Reads a file's decoded content, or null if it doesn't exist yet. */
async function getFile(cfg: GithubConfig, path: string): Promise<string | null> {
  const res = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub read of ${path} failed (${res.status}): ${await errText(res)}`);
  const json = await res.json();
  return Buffer.from(json.content, "base64").toString("utf-8");
}

/** Lists file paths directly inside a directory, or [] if it doesn't exist. */
async function listDir(cfg: GithubConfig, dir: string): Promise<string[]> {
  const res = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/contents/${dir}?ref=${encodeURIComponent(cfg.branch)}`, cfg.token);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub directory listing of ${dir} failed (${res.status}): ${await errText(res)}`);
  const json = await res.json();
  if (!Array.isArray(json)) return [];
  return json.filter((e: { type?: string }) => e.type === "file").map((e: { path: string }) => e.path);
}

/** Commits one or more file writes/deletes together as a single commit on cfg.branch. */
async function commitFiles(
  cfg: GithubConfig,
  writes: { path: string; content: string }[],
  deletes: string[],
  message: string,
): Promise<void> {
  const refRes = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodeURIComponent(cfg.branch)}`, cfg.token);
  if (!refRes.ok) throw new Error(`Could not read branch ref (${refRes.status}): ${await errText(refRes)}`);
  const baseCommitSha = (await refRes.json()).object.sha as string;

  const commitRes = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/git/commits/${baseCommitSha}`, cfg.token);
  if (!commitRes.ok) throw new Error(`Could not read base commit (${commitRes.status}): ${await errText(commitRes)}`);
  const baseTreeSha = (await commitRes.json()).tree.sha as string;

  const treeEntries: { path: string; mode: string; type: string; sha: string | null }[] = [];
  for (const w of writes) {
    const blobRes = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/git/blobs`, cfg.token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: Buffer.from(w.content, "utf-8").toString("base64"), encoding: "base64" }),
    });
    if (!blobRes.ok) throw new Error(`Could not create blob for ${w.path} (${blobRes.status}): ${await errText(blobRes)}`);
    const blobSha = (await blobRes.json()).sha as string;
    treeEntries.push({ path: w.path, mode: "100644", type: "blob", sha: blobSha });
  }
  for (const path of deletes) {
    treeEntries.push({ path, mode: "100644", type: "blob", sha: null });
  }

  const treeRes = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/git/trees`, cfg.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
  });
  if (!treeRes.ok) throw new Error(`Could not create tree (${treeRes.status}): ${await errText(treeRes)}`);
  const newTreeSha = (await treeRes.json()).sha as string;

  const newCommitRes = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/git/commits`, cfg.token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] }),
  });
  if (!newCommitRes.ok) throw new Error(`Could not create commit (${newCommitRes.status}): ${await errText(newCommitRes)}`);
  const newCommitSha = (await newCommitRes.json()).sha as string;

  // force: true — a save always wins over whatever else has happened to the branch in the
  // meantime, matching this feature's deliberately simple last-write-wins conflict handling.
  const updateRefRes = await ghFetch(`/repos/${cfg.owner}/${cfg.repo}/git/refs/heads/${encodeURIComponent(cfg.branch)}`, cfg.token, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommitSha, force: true }),
  });
  if (!updateRefRes.ok) throw new Error(`Could not update branch ref (${updateRefRes.status}): ${await errText(updateRefRes)}`);
}

export async function GET() {
  const cfg = config();
  if (!cfg) return NextResponse.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 501 });

  try {
    const content = await getFile(cfg, cfg.dataPath);
    if (content === null) return NextResponse.json({ exists: false, formations: [] });
    const parsed = JSON.parse(content);
    const formations = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.formations) ? parsed.formations : [];
    return NextResponse.json({ exists: true, formations });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to read from GitHub." }, { status: 502 });
  }
}

interface PutBody {
  formations?: unknown;
}

export async function PUT(req: NextRequest) {
  const cfg = config();
  if (!cfg) return NextResponse.json({ error: NOT_CONFIGURED_MESSAGE }, { status: 501 });

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.formations)) {
    return NextResponse.json({ error: "Expected a { formations: [...] } payload." }, { status: 400 });
  }
  const formations = body.formations as FormationEntry[];

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const snapshotPath = `${cfg.backupsFolder}/formations-${timestamp}.json`;
    const content = JSON.stringify({ exportedAt: new Date().toISOString(), formations }, null, 2);

    const existingBackups = (await listDir(cfg, cfg.backupsFolder)).sort();
    // Keep (cfg.keep - 1) existing ones, since this save is about to add one more.
    const overBy = existingBackups.length - Math.max(0, cfg.keep - 1);
    const toDelete = overBy > 0 ? existingBackups.slice(0, overBy) : [];

    await commitFiles(
      cfg,
      [
        { path: cfg.dataPath, content },
        { path: snapshotPath, content },
      ],
      toDelete,
      `Sync Letter Formations library (${formations.length} entries)`,
    );

    return NextResponse.json({ ok: true, path: cfg.dataPath, snapshot: snapshotPath, prunedCount: toDelete.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to sync to GitHub." }, { status: 502 });
  }
}
