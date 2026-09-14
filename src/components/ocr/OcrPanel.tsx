"use client";

import { useMemo, useState } from "react";
import { useWorkflow } from "@/state/workflowStore";
import { Card, CardTitle, CardSubtitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { OCR_SUB_TABS, type OcrSubTab } from "@/state/navigation";
import { OCR_LOW_CONFIDENCE_THRESHOLD } from "@/analysis/ocr/types";
import type { ImageRegion } from "@/types";

function confidenceTone(confidence: number): "success" | "warning" | "danger" {
  if (confidence >= 80) return "success";
  if (confidence >= OCR_LOW_CONFIDENCE_THRESHOLD) return "warning";
  return "danger";
}

export function OcrPanel() {
  const ctx = useWorkflow();
  const [subTab, setSubTab] = useState<OcrSubTab>("text");

  const result = ctx.ocrResult;

  const highlightRegion: ImageRegion | null = useMemo(() => {
    if (!result || ctx.highlightedOcrCharIndex === null) return null;
    return result.chars[ctx.highlightedOcrCharIndex]?.region ?? null;
  }, [result, ctx.highlightedOcrCharIndex]);

  if (!ctx.accepted) {
    return (
      <Card>
        <CardTitle>No analysis yet</CardTitle>
        <CardSubtitle>Accept the scan quality assessment first, then run letter recognition here.</CardSubtitle>
        <Button className="mt-4" onClick={() => ctx.setActiveSection("quality")}>
          Go to Scan Quality
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-text-strong">Letter Recognition (OCR)</h2>
        <p className="text-sm text-text-muted mt-1">
          Real per-letter identification via Tesseract.js — this actually reads what each character is, unlike the
          Analysis tab, which only buckets stroke <em>shapes</em> (loops, stems, dots) without knowing which letter
          they belong to. The two are independent and can disagree; neither corrects the other.
        </p>
      </div>

      {!result && !ctx.isRunningOcr && (
        <Card>
          <CardTitle>Run letter recognition</CardTitle>
          <CardSubtitle>
            Runs entirely in your browser via Tesseract.js (WebAssembly). The handwriting image is never uploaded —
            only Tesseract&apos;s pretrained English letter model is fetched once, from its own CDN, and cached by
            the browser afterward. This can take anywhere from a few seconds to around a minute depending on image
            size and device.
          </CardSubtitle>
          <Button className="mt-4" onClick={() => ctx.runOcr()}>
            Run OCR on this sample
          </Button>
          {ctx.ocrError && <p className="mt-3 text-xs text-danger">{ctx.ocrError}</p>}
        </Card>
      )}

      {ctx.isRunningOcr && (
        <Card>
          <CardTitle>Recognizing letters&hellip;</CardTitle>
          <CardSubtitle>
            {ctx.ocrProgress ? `${ctx.ocrProgress.status} (${Math.round(ctx.ocrProgress.progress * 100)}%)` : "Starting the OCR engine..."}
          </CardSubtitle>
          <div className="mt-3 h-1.5 w-full rounded-full bg-surface-alt overflow-hidden">
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${Math.round((ctx.ocrProgress?.progress ?? 0) * 100)}%` }}
            />
          </div>
        </Card>
      )}

      {result && (
        <>
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Recognition Summary</CardTitle>
                <CardSubtitle>Ran in {(result.durationMs / 1000).toFixed(1)}s</CardSubtitle>
              </div>
              <Button variant="outline" onClick={() => ctx.runOcr()}>
                Re-run OCR
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-primary-soft px-4 py-3">
                <p className="text-2xl font-bold text-text-strong">{Math.round(result.meanConfidence)}%</p>
                <p className="text-xs text-text-muted mt-0.5">Mean OCR Confidence</p>
              </div>
              <div className="rounded-xl bg-mint-soft px-4 py-3">
                <p className="text-2xl font-bold text-text-strong">{result.chars.length}</p>
                <p className="text-xs text-text-muted mt-0.5">Characters Recognized</p>
              </div>
              <div className="rounded-xl bg-sky-soft px-4 py-3">
                <p className="text-2xl font-bold text-text-strong">{result.words.length}</p>
                <p className="text-xs text-text-muted mt-0.5">Words Recognized</p>
              </div>
              <div className="rounded-xl bg-peach-soft px-4 py-3">
                <p className="text-2xl font-bold text-text-strong">{result.lowConfidenceCharCount}</p>
                <p className="text-xs text-text-muted mt-0.5">Low-Confidence Chars (&lt;{OCR_LOW_CONFIDENCE_THRESHOLD}%)</p>
              </div>
            </div>
          </Card>

          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
            {OCR_SUB_TABS.map((tab) => (
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

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
            <Card padding="p-3">
              {subTab === "text" && (
                <div className="p-2">
                  <p className="text-xs text-text-muted mb-2">
                    Recognized text, grouped by line. Click any word to highlight it on the scan.
                  </p>
                  <div className="flex flex-col gap-2">
                    {result.lines.map((line, li) => (
                      <div key={li} className="rounded-xl bg-surface-alt px-3 py-2 text-sm leading-relaxed">
                        {line.words.map((word, wi) => {
                          const firstCharIndex = result.chars.indexOf(word.chars[0]);
                          return (
                            <button
                              key={wi}
                              onClick={() => ctx.setHighlightedOcrChar(firstCharIndex === -1 ? null : firstCharIndex)}
                              className="mr-1.5 mb-1 inline-block rounded px-1 py-0.5 hover:bg-primary-softer"
                              title={`${Math.round(word.confidence)}% confidence`}
                            >
                              {word.text || <span className="text-text-muted italic">(blank)</span>}
                            </button>
                          );
                        })}
                        {line.words.length === 0 && <span className="text-text-muted italic">(no words on this line)</span>}
                      </div>
                    ))}
                    {result.lines.length === 0 && (
                      <p className="text-sm text-text-muted">No text recognized. Try improving Tone &amp; Clarity or use a clearer scan.</p>
                    )}
                  </div>
                </div>
              )}

              {subTab === "letters" && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-text-muted border-b border-border-soft">
                        <th className="py-2 px-2 font-medium">#</th>
                        <th className="py-2 px-2 font-medium">Character</th>
                        <th className="py-2 px-2 font-medium text-right">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.chars.map((c, i) => (
                        <tr
                          key={i}
                          onClick={() => ctx.setHighlightedOcrChar(i === ctx.highlightedOcrCharIndex ? null : i)}
                          className={`cursor-pointer border-b border-border-soft/60 last:border-0 hover:bg-primary-softer ${
                            i === ctx.highlightedOcrCharIndex ? "bg-primary-soft" : ""
                          }`}
                        >
                          <td className="py-1.5 px-2 text-text-muted">{i + 1}</td>
                          <td className="py-1.5 px-2 font-mono font-semibold text-text-strong">
                            {c.text.trim() ? c.text : <span className="text-text-muted italic">(space)</span>}
                          </td>
                          <td className="py-1.5 px-2 text-right">
                            <Badge tone={confidenceTone(c.confidence)}>{Math.round(c.confidence)}%</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {subTab === "confidence" && (
                <div className="p-2">
                  <p className="text-xs text-text-muted mb-3">
                    Letter frequency and mean OCR confidence for each recognized letter (a-z), based on this sample
                    only &mdash; not a population norm.
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {result.letterFrequency.map((l) => (
                      <div key={l.letter} className="rounded-lg bg-surface-alt px-3 py-2 flex items-center justify-between">
                        <span className="font-mono font-semibold text-text-strong">{l.letter}</span>
                        <span className="text-text-muted">&times;{l.count}</span>
                        <Badge tone={confidenceTone(l.meanConfidence)}>{Math.round(l.meanConfidence)}%</Badge>
                      </div>
                    ))}
                    {result.letterFrequency.length === 0 && (
                      <p className="text-sm text-text-muted col-span-full">No letters recognized yet.</p>
                    )}
                  </div>
                </div>
              )}
            </Card>

            <Card>
              <CardTitle>Visual</CardTitle>
              <CardSubtitle>
                {highlightRegion ? "Highlighting the selected character/word." : "Click a word or a table row to highlight it here."}
              </CardSubtitle>
              <div className="relative mt-3">
                {ctx.previewDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ctx.previewDataUrl} alt="" className="w-full rounded-lg border border-border-soft" />
                )}
                {highlightRegion && (
                  <div
                    className="absolute border-2 border-gray-400 bg-gray-400/30 rounded-sm pointer-events-none"
                    style={{
                      left: `${highlightRegion.x * 100}%`,
                      top: `${highlightRegion.y * 100}%`,
                      width: `${highlightRegion.width * 100}%`,
                      height: `${highlightRegion.height * 100}%`,
                    }}
                  />
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
