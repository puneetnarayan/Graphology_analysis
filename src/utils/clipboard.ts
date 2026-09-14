/** Pulls the first pasted image (if any) out of a clipboard paste event. */
export function extractImageFileFromClipboard(e: { clipboardData: DataTransfer | null }): File | null {
  const items = e.clipboardData ? Array.from(e.clipboardData.items) : [];
  const imageItem = items.find((i) => i.type.startsWith("image/"));
  return imageItem?.getAsFile() ?? null;
}
