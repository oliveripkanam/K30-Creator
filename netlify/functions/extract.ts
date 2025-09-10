import type { Context, Config } from "@netlify/functions";

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

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return respond(405, { error: "Method not allowed" });

  let payload: ExtractRequest;
  try {
    payload = await req.json();
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }

  const { fileBase64, mimeType } = payload || {};
  if (!fileBase64 || !mimeType) return respond(400, { error: "Missing fileBase64 or mimeType" });

  const endpoint = (getEnv("AZURE_DOCINTEL_ENDPOINT") || "").replace(/\/$/, "");
  const key = getEnv("AZURE_DOCINTEL_KEY") || "";
  const apiVersion = "2023-10-31";

  if (!endpoint || !key) return respond(500, { error: "Missing AZURE_DOCINTEL_ENDPOINT or AZURE_DOCINTEL_KEY" });

  try {
    const bytes = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));

    // Submit analyze request
    const analyzeUrl = `${endpoint}/formrecognizer/documentModels/prebuilt-read:analyze?api-version=${apiVersion}`;
    const submit = await fetch(analyzeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "Ocp-Apim-Subscription-Key": key,
      },
      body: bytes,
    });

    if (!submit.ok) {
      const t = await submit.text();
      return respond(submit.status, { error: "analyze submit failed", details: t });
    }

    const opLocation = submit.headers.get("operation-location") || submit.headers.get("Operation-Location");
    if (!opLocation) return respond(502, { error: "Missing Operation-Location header" });

    // Poll for result
    const maxWaitMs = 20000;
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
      const status = json.status || json."operationState";
      if ((status || "").toLowerCase() === "succeeded") {
        result = json;
        break;
      }
      if ((status || "").toLowerCase() === "failed") {
        return respond(502, { error: "analyze failed", details: json });
      }
      await new Promise(res => setTimeout(res, intervalMs));
    }

    if (!result) return respond(504, { error: "timeout waiting for analysis" });

    // Extract text from analyzeResult
    const blocks: string[] = [];
    const readResult = result.analyzeResult || result.documents || result;
    const pages = readResult?.pages || [];
    for (const p of pages) {
      const lines = p.lines || [];
      for (const line of lines) {
        if (line.content) blocks.push(line.content);
      }
    }
    const content = blocks.join("\n");
    return respond(200, { text: content });
  } catch (err: any) {
    return respond(500, { error: "server error", details: String(err?.message || err) });
  }
};

export const config: Config = { path: "/api/extract" };


