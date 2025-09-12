// Types from @netlify/functions removed for portability in local linting

type MCQ = { id: string; question: string; options: string[]; correctAnswer: number; hint: string; explanation: string; step: number; calculationStep?: { formula?: string; substitution?: string; result?: string } };
type SolutionSummary = { finalAnswer: string; unit: string; workingSteps: string[]; keyFormulas: string[] };
type DecodeRequest = { text: string; marks?: number; imageBase64?: string; imageMimeType?: string };
type DecodeResponse = { mcqs: MCQ[]; solution: SolutionSummary };

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const getEnv = (k: string) => { try { return (globalThis as any)?.Netlify?.env?.get?.(k) ?? process.env[k]; } catch { return process.env[k]; } };

export default async (req: Request) => {
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
  // Prefer a dedicated non-reasoning model for decoding to reduce latency
  const deployment = (getEnv('DECODER_OPENAI_DEPLOYMENT') || getEnv('AZURE_OPENAI_DEPLOYMENT') || '').trim();
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
    if (imageBase64 && imageMimeType && /^image\//i.test(imageMimeType)) {
      // Azure Chat Completions expects { type: 'image_url', image_url: { url } }
      messageContent.push({ type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } });
    }

    const includedImage = messageContent.some((p) => p?.type === 'image_url');
    const maxTokens = Math.min(2000, Math.max(800, Number(getEnv('DECODER_MAX_TOKENS') || 1200)));
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        max_completion_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: messageContent }
        ]
      })
    });

    if (!res.ok && includedImage) {
      const details = await res.text().catch(() => '');
      try { console.warn('[fn decode] azure image request failed; retrying text-only', res.status, details?.slice(0, 300)); } catch {}
      // Retry without image attachment
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          max_completion_tokens: Math.min(maxTokens, 1200),
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: [{ type: 'text', text: userText }] }
          ]
        })
      });
    }

    if (!res.ok) { const details = await res.text(); try { console.error('[fn decode] azure error', res.status, details); } catch {}; return respond(res.status, { error: 'Azure error', details }); }

    const data = await res.json();
    try { console.log('[fn decode] azure response', JSON.stringify(data, null, 2)); } catch {}
    const choice = data?.choices?.[0];
    let content: string = choice?.message?.content || choice?.delta?.content || '';
    let usage: any = (data as any)?.usage;
    try { 
      console.log('[fn decode] choice details:', {
        finish_reason: choice?.finish_reason,
        content_length: content?.length,
        usage: data?.usage,
        first_100_chars: content?.slice(0, 100)
      });
    } catch {}
    
    if (!content?.trim()) {
      try { console.warn('[fn decode] empty content with OK response; retrying with text format'); } catch {}
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          max_completion_tokens: Math.min(1200, Number(getEnv('DECODER_MAX_TOKENS') || 1200)),
          response_format: { type: 'text' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: [{ type: 'text', text: `${userText}\n\nReturn ONLY the JSON object with keys mcqs and solution.` }] }
          ]
        })
      });
      if (retryRes.ok) {
        const retryData = await retryRes.json();
        const retryChoice = retryData?.choices?.[0];
        const retryContent: string = retryChoice?.message?.content || retryChoice?.delta?.content || '';
        if (retryContent?.trim()) {
          content = retryContent;
          usage = (retryData as any)?.usage || usage;
        }
      }
      // If still empty, try alternate non-reasoning deployment if available
      if (!content?.trim()) {
        const altDeployment = (getEnv('DECODER_OPENAI_FALLBACK_DEPLOYMENT') || getEnv('AUGMENT_OPENAI_DEPLOYMENT') || '').trim();
        if (altDeployment && altDeployment !== deployment) {
          try {
            const altUrl = buildUrl(rawEndpoint, altDeployment, apiVersion);
            const altRes = await fetch(altUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
              body: JSON.stringify({
                max_completion_tokens: Math.min(1200, Number(getEnv('DECODER_MAX_TOKENS') || 1200)),
                response_format: { type: 'json_object' },
                messages: [
                  { role: 'system', content: system },
                  { role: 'user', content: [{ type: 'text', text: userText }] }
                ]
              })
            });
            if (altRes.ok) {
              const altData = await altRes.json();
              const altChoice = altData?.choices?.[0];
              const altContent: string = altChoice?.message?.content || altChoice?.delta?.content || '';
              if (altContent?.trim()) {
                content = altContent;
                usage = (altData as any)?.usage || usage;
              }
            }
            if (!content?.trim()) {
              // Final fallback: alt deployment with text response
              const altTextRes = await fetch(altUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
                body: JSON.stringify({
                  max_completion_tokens: Math.min(1000, Number(getEnv('DECODER_MAX_TOKENS') || 1200)),
                  response_format: { type: 'text' },
                  messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: [{ type: 'text', text: `${userText}\n\nReturn ONLY the JSON object with keys mcqs and solution.` }] }
                  ]
                })
              });
              if (altTextRes.ok) {
                const altTextData = await altTextRes.json();
                const altTextChoice = altTextData?.choices?.[0];
                const altTextContent: string = altTextChoice?.message?.content || altTextChoice?.delta?.content || '';
                if (altTextContent?.trim()) {
                  content = altTextContent;
                  usage = (altTextData as any)?.usage || usage;
                }
              }
            }
          } catch {}
        }
      }
      if (!content?.trim()) {
        return respond(502, { error: 'Empty response from Azure', azureData: data });
      }
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
    return respond(200, { ...parsed, mcqs: parsed.mcqs.slice(0, marks), usage });
  } catch (err: any) {
    try { console.error('[fn decode] exception', err); } catch {}
    return respond(500, { error: 'Server error', details: String(err?.message || err) });
  }
};

export const config = { path: '/api/ai-decode' } as const;


