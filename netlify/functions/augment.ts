import type { Context, Config } from "@netlify/functions";

type AugmentRequest = {
  text: string;
  imageBase64?: string;
  imageMimeType?: string;
};

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const getEnv = (k: string) => { try { /* @ts-ignore */ return Netlify?.env?.get?.(k) ?? process.env[k]; } catch { return process.env[k]; } };

export default async (req: Request, _context: Context) => {
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  let payload: AugmentRequest;
  try { payload = await req.json(); } catch { return respond(400, { error: 'Invalid JSON body' }); }

  const text = (payload.text || '').toString().trim();
  if (!text) return respond(400, { error: "Missing 'text'" });
  const imageBase64 = (payload.imageBase64 || '').trim();
  const imageMimeType = (payload.imageMimeType || '').trim();

  const endpoint = (getEnv('AZURE_OPENAI_ENDPOINT') || '').trim();
  const apiKey = getEnv('AZURE_OPENAI_API_KEY') || '';
  const deployment = (getEnv('AZURE_OPENAI_DEPLOYMENT') || '').trim();
  const apiVersion = (getEnv('AZURE_OPENAI_API_VERSION') || '2024-06-01').trim();
  if (!endpoint || !apiKey) return respond(500, { error: 'Missing Azure OpenAI config' });

  const buildUrl = (endpointValue: string, deploymentName: string, version: string): string => {
    const noSlash = endpointValue.replace(/\/$/, '');
    const isFull = /\/openai\/deployments\//.test(noSlash);
    try {
      if (isFull) {
        let full = noSlash; if (!/\/chat\/completions(\?|$)/.test(full)) full = `${full}/chat/completions`;
        const u = new URL(full); if (version) u.searchParams.set('api-version', version); return u.toString();
      }
    } catch {}
    if (!deploymentName) throw new Error('Missing AZURE_OPENAI_DEPLOYMENT when using base endpoint');
    return `${noSlash}/openai/deployments/${deploymentName}/chat/completions?api-version=${version}`;
  };

  const url = buildUrl(endpoint, deployment, apiVersion);

  const system = `You rewrite OCR output of A-Level mechanics problems into a clean, single-block statement suitable for solving.
- Use diagram/image (if provided) to recover numeric labels (masses, angles, tan values) and relationships.
- Normalize fractions and units: join stacked lines (5/12, 12mg/5), keep symbols (α, μ) where present.
- Remove headings like "Figure 1", stray labels (A, B) unless referenced, and page numbers.
- Output ONLY the final cleaned problem text. No explanations.`;

  const userText = `OCR text:\n${text}`;
  const contentPayload: any = (imageBase64 && imageMimeType)
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } }
      ]
    : userText;

  try {
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        max_completion_tokens: 1000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: contentPayload },
        ]
      })
    });
    if (!res.ok && Array.isArray(contentPayload)) {
      // Fallback: retry with text-only (some deployments disallow images)
      const res2 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          max_completion_tokens: 600,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userText },
          ]
        })
      });
      res = res2;
    }
    if (!res.ok) return respond(res.status, { error: 'Azure error', details: await res.text() });
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    if (!content?.trim()) return respond(502, { error: 'Empty augmentation response', azureData: data });
    return respond(200, { text: content.trim() });
  } catch (err: any) {
    return respond(500, { error: 'Server error', details: String(err?.message || err) });
  }
};

export const config: Config = { path: '/api/augment' };


