type HintRefineRequest = {
  header?: string;
  originalText?: string;
  items: Array<{ id: string; question: string; options: string[]; hint?: string }>;
};
type HintRefineResponse = { hints: Array<{ id: string; hint: string }> };

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const getEnv = (k: string) => { try { return (globalThis as any)?.Netlify?.env?.get?.(k) ?? process.env[k]; } catch { return process.env[k]; } };

export default async (req: Request) => {
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });
  let payload: HintRefineRequest; try { payload = await req.json(); } catch { return respond(400, { error: 'Invalid JSON body' }); }
  const rawEndpoint = (getEnv('AZURE_OPENAI_ENDPOINT') || '').trim();
  const apiKey = getEnv('AZURE_OPENAI_API_KEY') || '';
  const deployment = (getEnv('DECODER_OPENAI_DEPLOYMENT') || getEnv('AZURE_OPENAI_DEPLOYMENT') || '').trim();
  const apiVersion = (getEnv('AZURE_OPENAI_API_VERSION') || '2024-06-01').trim();
  if (!rawEndpoint || !apiKey) return respond(500, { error: 'Missing Azure config' });

  const buildUrl = (endpointValue: string, deploymentName: string, version: string): string => {
    const endpointNoSlash = endpointValue.replace(/\/$/, '');
    const isFull = /\/openai\/deployments\//.test(endpointNoSlash);
    if (isFull) { let full = endpointNoSlash; if (!/\/chat\/completions(\?|$)/.test(full)) full = `${full}/chat/completions`; const u = new URL(full); if (version) u.searchParams.set('api-version', version); return u.toString(); }
    if (!deploymentName) throw new Error('Missing AZURE_OPENAI_DEPLOYMENT when using base endpoint');
    return `${endpointNoSlash}/openai/deployments/${deploymentName}/chat/completions?api-version=${version}`;
  };

  let url: string; try { url = buildUrl(rawEndpoint, deployment, apiVersion); } catch (e: any) { return respond(500, { error: e?.message || 'Invalid Azure config' }); }

  const header = String(payload.header || '').slice(0, 120);
  const original = String(payload.originalText || '').slice(0, 600);
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 20) : [];
  const msg = [
    { type: 'text', text: header },
    { type: 'text', text: `Original text (trimmed):\n${original}` },
    { type: 'text', text: `Rewrite hints with discriminative cues. Output JSON only: { "hints": [{"id":"<mcq id>", "hint":"<rewritten>"}, ...] }. Rules:\n- Start with 'Hint: ' and keep 11–18 words.\n- Reference the stem concept (key term) or focus (e.g., time scale) explicitly.\n- Use a MIX of cue types across hints: (a) key attribute/mechanism/time scale, (b) elimination rule, (c) limited contrast vs a common distractor.\n- Vary verbs: Note/Use/Check/Look for/Consider.\n- Avoid generic/meta phrasing and do not reveal exact answer text.\nInput: ${JSON.stringify(items)}` }
  ];

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({ response_format: { type: 'text' }, temperature: 0.2, messages: [ { role: 'user', content: msg } ] })
    });
    if (!res.ok) {
      const details = await res.text().catch(() => '');
      return respond(res.status, { error: 'Azure error', details: details.slice(0, 400) });
    }
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content || '';
    let refined: any = null;
    try { refined = JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); if (m) { try { refined = JSON.parse(m[0]); } catch {} } }
    if (!refined || !Array.isArray(refined.hints)) return respond(200, { hints: [] } satisfies HintRefineResponse);
    const clean = refined.hints.map((h: any) => ({ id: String(h?.id || ''), hint: String(h?.hint || '').slice(0, 180) }));
    return respond(200, { hints: clean } satisfies HintRefineResponse);
  } catch (e: any) {
    return respond(500, { error: 'Server error', details: String(e?.message || e) });
  }
};

export const config = { path: '/api/ai-refine-hints' } as const;


