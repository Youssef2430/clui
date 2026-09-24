import type { PillWebSource } from "./gluiPill.js";

export function webSourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

/** Provider search results are untyped JSON; retain only explicit source metadata. */
export function readWebSources(results: ReadonlyArray<unknown> | null | undefined): PillWebSource[] {
  const sources: PillWebSource[] = [];
  for (const result of results ?? []) {
    if (!result || typeof result !== "object") continue;
    const value = result as Record<string, unknown>;
    const url = webSourceUrl(value.url);
    if (!url) continue;
    const title = typeof value.title === "string" ? value.title : undefined;
    const snippet = typeof value.snippet === "string" ? value.snippet : undefined;
    const id = value.citationId ?? value.ref_id ?? value.refId ?? value.id;
    const citationId = typeof id === "string" && /^turn\d+[\w-]+$/.test(id) ? id : undefined;
    if (sources.some(source => source.url === url && source.citationId === citationId)) continue;
    sources.push({ url, ...(title ? { title } : {}), ...(snippet ? { snippet } : {}), ...(citationId ? { citationId } : {}) });
  }
  return sources;
}
