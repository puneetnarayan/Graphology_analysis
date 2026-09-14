import { NextRequest, NextResponse } from "next/server";
import type { FormationEntry } from "@/types";

/**
 * The only server route this app has. Everything else is client-only by
 * design (see README's Privacy section) — this exists purely so "Backup to
 * GitHub" has somewhere to send the GitHub write credential, which must
 * never reach the browser. The credential and target repo live in Vercel
 * environment variables, read only here, never sent to the client.
 */

interface BackupPayload {
  exportedAt?: string;
  formations?: unknown;
}

function isFormationArray(v: unknown): v is FormationEntry[] {
  return Array.isArray(v);
}

export async function POST(req: NextRequest) {
  const token = process.env.GITHUB_BACKUP_TOKEN;
  const owner = process.env.GITHUB_BACKUP_OWNER;
  const repo = process.env.GITHUB_BACKUP_REPO;
  const branch = process.env.GITHUB_BACKUP_BRANCH || "main";
  const folder = (process.env.GITHUB_BACKUP_FOLDER || "backups").replace(/^\/+|\/+$/g, "");

  if (!token || !owner || !repo) {
    return NextResponse.json(
      {
        error:
          "GitHub backup isn't configured on this deployment. Set GITHUB_BACKUP_TOKEN, GITHUB_BACKUP_OWNER, and GITHUB_BACKUP_REPO as environment variables (see README).",
      },
      { status: 501 },
    );
  }

  let payload: BackupPayload;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isFormationArray(payload.formations)) {
    return NextResponse.json({ error: "Expected a { formations: [...] } payload." }, { status: 400 });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `${folder}/formations-${timestamp}.json`;
  const body = JSON.stringify({ exportedAt: payload.exportedAt ?? new Date().toISOString(), formations: payload.formations }, null, 2);
  const contentBase64 = Buffer.from(body, "utf-8").toString("base64");

  let ghRes: Response;
  try {
    ghRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        message: `Backup Letter Formations library (${payload.formations.length} entries)`,
        content: contentBase64,
        branch,
      }),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? `Network error reaching GitHub: ${err.message}` : "Network error reaching GitHub." }, { status: 502 });
  }

  if (!ghRes.ok) {
    const text = await ghRes.text().catch(() => "");
    return NextResponse.json({ error: `GitHub API error (${ghRes.status}): ${text.slice(0, 500)}` }, { status: 502 });
  }

  const ghJson = (await ghRes.json().catch(() => null)) as { content?: { html_url?: string } } | null;

  return NextResponse.json({ path, url: ghJson?.content?.html_url ?? null });
}
