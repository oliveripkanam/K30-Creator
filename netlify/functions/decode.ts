import type { Context, Config } from "@netlify/functions";

type MCQ = { id: string; question: string; options: string[]; correctAnswer: number; hint: string; explanation: string; step: number; calculationStep?: { formula?: string; substitution?: string; result?: string } };
type SolutionSummary = { finalAnswer: string; unit: string; workingSteps: string[]; keyFormulas: string[] };
type DecodeRequest = { text: string; marks?: number; imageBase64?: string; imageMimeType?: string };
type DecodeResponse = { mcqs: MCQ[]; solution: SolutionSummary };

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const getEnv = (k: string) => { try { /* @ts-ignore */ return Netlify?.env?.get?.(k) ?? process.env[k]; } catch { return process.env[k]; } };

export default async (req: Request, _context: Context) => {
  try { console.log('[fn decode] invocation', { method: req.method, url: req.url }); } catch {}
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  let payload: DecodeRequest; try { payload = await req.json(); } catch { return respond(400, { error: 'Invalid JSON body' }); }
  const text = (payload.text || '').toString().trim();
  const marks = Math.max(1, Math.min(5, Number(payload.marks ?? 3)));
  const imageBase64 = (payload.imageBase64 || '').trim();
  const imageMimeType = (payload.imageMimeType || '').trim();
  if (!text) return respond(400, { error: "Missing 'text'" });

  // Bypass switch for routing checks
  if ((getEnv('DEBUG_BYPASS_AZURE') || '') === '1') {
    return respond(200, { mcqs: [], solution: { finalAnswer: 'bypass', unit: '', workingSteps: [], keyFormulas: [] } });
  }

  const rawEndpoint = (getEnv('AZURE_OPENAI_ENDPOINT') || '').trim();
  const apiKey = getEnv('AZURE_OPENAI_API_KEY') || '';
  const deployment = (getEnv('AZURE_OPENAI_DEPLOYMENT') || '').trim();
  const apiVersion = (getEnv('AZURE_OPENAI_API_VERSION') || '2024-06-01').trim();
  if (!rawEndpoint || !apiKey) {
    try { console.error('[fn decode] missing config', { hasEndpoint: !!rawEndpoint, hasKey: !!apiKey }); } catch {}
    return respond(500, { error: 'Missing Azure OpenAI endpoint or api key' });
  }

  const system = `You are a precise A-Level mechanics tutor.
You MUST base everything ONLY on the given problem. Do not invent unrelated scenarios.
Return STRICT JSON with keys: mcqs (array) and solution (object).
mcqs[i] fields: id, question, options (exactly 4), correctAnswer (0-based index), hint, explanation, step (1..N), calculationStep { formula, substitution, result } optional.
solution fields: finalAnswer, unit, workingSteps[], keyFormulas[].
Questions MUST directly progress toward the final answer for THIS problem.`;

  const userText = `Problem text:\n${text}\n\nTarget number of steps (marks): ${marks}.\nIf an image is attached, use it only to disambiguate geometry/labels. Output JSON ONLY (no prose).`;

  const buildUrl = (endpointValue: string, deploymentName: string, version: string): string => {
    const endpointNoSlash = endpointValue.replace(/\/$/, '');
    const isFull = /\/openai\/deployments\//.test(endpointNoSlash);
    try {
      if (isFull) {
        let full = endpointNoSlash; if (!/\/chat\/completions(\?|$)/.test(full)) full = `${full}/chat/completions`;
        const u = new URL(full); if (version) u.searchParams.set('api-version', version); return u.toString();
      }
    } catch {}
    if (!deploymentName) throw new Error('Missing AZURE_OPENAI_DEPLOYMENT when using base endpoint');
    return `${endpointNoSlash}/openai/deployments/${deploymentName}/chat/completions?api-version=${version}`;
  };

  let url: string; try { url = buildUrl(rawEndpoint, deployment, apiVersion); } catch (e: any) { try { console.error('[fn decode] url build error', e); } catch {}; return respond(500, { error: e?.message || 'Invalid Azure config' }); }
  try { console.log('[fn decode] config', { endpoint: rawEndpoint, deployment, apiVersion, url }); } catch {}

  try {
    const messageContent: any[] = [ { type: 'text', text: userText } ];
    if (imageBase64 && imageMimeType) {
      // Azure Chat Completions expects { type: 'image_url', image_url: { url } }
      messageContent.push({ type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } });
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        max_completion_tokens: 8000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: messageContent }
        ]
      })
    });
    if (!res.ok) { const details = await res.text(); try { console.error('[fn decode] azure error', res.status, details); } catch {}; return respond(res.status, { error: 'Azure error', details }); }

    const data = await res.json();
    try { console.log('[fn decode] azure response', JSON.stringify(data, null, 2)); } catch {}
    const choice = data?.choices?.[0];
    const content: string = choice?.message?.content || choice?.delta?.content || '';
    try { 
      console.log('[fn decode] choice details:', {
        finish_reason: choice?.finish_reason,
        content_length: content?.length,
        usage: data?.usage,
        first_100_chars: content?.slice(0, 100)
      });
    } catch {}
    
    if (!content?.trim()) {
      return respond(502, { error: 'Empty response from Azure', azureData: data });
    }
    
    let parsed: DecodeResponse | null = null;
    try { 
      parsed = JSON.parse(content); 
    } catch { 
      const m = content.match(/\{[\s\S]*\}/); 
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }
    if (!parsed || !Array.isArray(parsed.mcqs) || !parsed.solution) { 
      try { console.error('[fn decode] invalid model output', { content, parsed }); } catch {}; 
      return respond(502, { error: 'Invalid model output', raw: content, parsed }); 
    }
    return respond(200, { ...parsed, mcqs: parsed.mcqs.slice(0, marks) });
  } catch (err: any) {
    try { console.error('[fn decode] exception', err); } catch {}
    return respond(500, { error: 'Server error', details: String(err?.message || err) });
  }
};

export const config: Config = { path: '/api/ai-decode' };


