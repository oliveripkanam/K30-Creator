// Types from @netlify/functions removed for portability in local linting

type ExtractRequest = {
  fileBase64: string; // raw base64, no data: prefix
  mimeType: string;   // e.g., image/png, application/pdf
};

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const getEnv = (k: string) => {
  try {
    // @ts-ignore
    return Netlify?.env?.get?.(k) ?? process.env[k];
  } catch {
    return process.env[k];
  }
};

// Simple in-memory cache (per function instance)
const cache: Map<string, { text: string; pages?: number; ts: number }> = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export default async (req: Request) => {
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });

  let payload: ExtractRequest;
  try {
    payload = await req.json();
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }

  const { fileBase64, mimeType } = payload || {};
  if (!fileBase64 || !mimeType) return respond(400, { error: "Missing fileBase64 or mimeType" });

  // Cache key: SHA-256 of base64 + mime
  const encoder = new TextEncoder();
  const keyBytes = await crypto.subtle.digest('SHA-256', encoder.encode(`${mimeType}:${fileBase64}`));
  const keyHex = Array.from(new Uint8Array(keyBytes)).map(b => b.toString(16).padStart(2, '0')).join('');
  const now = Date.now();
  const hit = cache.get(keyHex);
  if (hit && now - hit.ts < CACHE_TTL_MS) {
    return respond(200, { text: hit.text, pages: hit.pages ?? undefined, cached: true });
  }

  const endpoint = (getEnv("AZURE_DOCINTEL_ENDPOINT") || "").replace(/\/$/, "");
  const key = getEnv("AZURE_DOCINTEL_KEY") || "";
  const apiVersion = "2023-10-31";

  if (!endpoint || !key) return respond(500, { error: "Missing AZURE_DOCINTEL_ENDPOINT or AZURE_DOCINTEL_KEY" });

  try {
    // Convert base64 to bytes (Node-safe)
    const bytes = Buffer.from(fileBase64, 'base64');

    // Try new Document Intelligence path first; fall back to Form Recognizer path
    const analyzeUrls = [
      `${endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-07-31`,
      `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=${apiVersion}`,
    ];

    let submit: Response | null = null;
    let lastErrText = '';
    for (const url of analyzeUrls) {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "Ocp-Apim-Subscription-Key": key,
        },
        body: bytes,
      });
      if (r.ok) { submit = r; break; }
      lastErrText = await r.text().catch(() => '');
    }

    // If both modern endpoints failed, try legacy v2.1 layout
    if (!submit) {
      const legacyUrl = `${endpoint}/formrecognizer/v2.1/layout/analyze`;
      const r = await fetch(legacyUrl, {
        method: "POST",
        headers: {
          "Content-Type": mimeType || "application/octet-stream",
          "Ocp-Apim-Subscription-Key": key,
        },
        body: bytes,
      });
      if (r.ok) {
        submit = r;
      } else {
        const t = await r.text().catch(() => lastErrText);
        return respond(404, { error: "analyze submit failed", details: t || lastErrText });
      }
    }

    const opLocation = submit.headers.get("operation-location") || submit.headers.get("Operation-Location");
    if (!opLocation) return respond(502, { error: "Missing Operation-Location header" });

    // Poll for result
    const maxWaitMs = 60000;
    const intervalMs = 800;
    const start = Date.now();
    let result: any = null;
    while (Date.now() - start < maxWaitMs) {
      const r = await fetch(opLocation, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      if (!r.ok) {
        const t = await r.text();
        return respond(r.status, { error: "poll failed", details: t });
      }
      const json = await r.json();
      const status = ((json?.status || json?.operationState || '') as string).toLowerCase();
      if (status === "succeeded") {
        result = json;
        break;
      }
      if (status === "failed") {
        return respond(502, { error: "analyze failed", details: json });
      }
      await new Promise(res => setTimeout(res, intervalMs));
    }

    if (!result) return respond(504, { error: "timeout waiting for analysis" });

    // Extract text and page count from analyzeResult
    const blocks: string[] = [];
    const analyze = result.analyzeResult || result.documents || result;
    let pagesCount = 0;
    if (analyze?.pages) {
      // v3.x structure
      pagesCount = Array.isArray(analyze.pages) ? analyze.pages.length : 0;
      for (const p of analyze.pages) {
        const lines = p.lines || [];
        for (const line of lines) {
          if (line.content) blocks.push(line.content);
        }
      }
    } else if (analyze?.readResults) {
      // v2.1 structure
      pagesCount = Array.isArray(analyze.readResults) ? analyze.readResults.length : 0;
      for (const rr of analyze.readResults) {
        const lines = rr.lines || [];
        for (const line of lines) {
          if (line.text) blocks.push(line.text);
        }
      }
    }
    const content = blocks.join("\n");
    cache.set(keyHex, { text: content, pages: pagesCount, ts: now });
    return respond(200, { text: content, pages: pagesCount });
  } catch (err: any) {
    return respond(500, { error: "server error", details: String(err?.message || err) });
  }
};

export const config = { path: "/api/extract" } as const;


