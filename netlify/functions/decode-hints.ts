type HintRefineRequest = {
  header?: string;
  originalText?: string;
  subject?: string;
  syllabus?: string;
  level?: string;
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

  const header = String(payload.header || '').slice(0, 160);
  const original = String(payload.originalText || '').slice(0, 700);
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 16) : [];

  // Heuristic mode guess per item to aid the model while remaining subject-agnostic
  const guessMode = (q: string, options: string[]): string => {
    const t = (q || '').toLowerCase();
    const optJoined = (options || []).join(' \n ').toLowerCase();
    const hasNumber = /\d/.test(t) || /\d/.test(optJoined);
    const hasEq = /[=+\-*/^]|sin|cos|tan|sqrt|\bmol\b|m\/s|kg|n\b|\bpa\b|°/.test(t + ' ' + optJoined);
    if (hasNumber || hasEq) return 'quantitative';
    if (/(what is|define|best describes|which .* is|identify|classify)/.test(t)) return 'definition';
    if (/(graph|table|trend|axis|slope|y-intercept)/.test(t)) return 'graph';
    if (/(variable|control|hypothesis|apparatus|safety)/.test(t)) return 'experiment';
    if (/(sequence|first|next|step)/.test(t)) return 'process';
    return 'conceptual';
  };

  const prepared = items.map(it => ({
    id: String(it.id || ''),
    question: String(it.question || '').slice(0, 260),
    options: (it.options || []).map(o => String(o || '').slice(0, 140)),
    mode: guessMode(it.question || '', it.options || []),
  }));

  const rules = `Rewrite hints for each item with strong, subject-agnostic guidance. Output JSON ONLY: {"hints":[{"id":"<id>","hint":"<text>"}, ...]}
Rules:
- Prefix with 'Hint: '. Keep 11–18 words.
- Use the item's mode to choose style:
  • quantitative: cite relation family or quantity linkage (e.g., force–mass–acceleration), or unit/axis cues; do not compute.
  • definition/conceptual: cite key attribute/category/mechanism/time-scale; avoid saying 'definition'.
  • graph: mention axis/gradient/intercept or read-off method.
  • experiment: identify variable/control/apparatus principle or safety rationale.
  • process: indicate next logical action in the sequence without revealing the step content.
- Include ONE discriminative cue: attribute/mechanism, elimination rule, or limited contrast vs a common distractor.
- Vary verbs across hints (Use/Check/Note/Look for/Compare/Consider). Limit contrast words ('unlike','vs') to at most one in three hints.
- Never use generic/meta phrasing (avoid: recall/consider/choose/definition/think/clear fact/directly answers).
- Do NOT copy an option verbatim or reveal the exact answer text.`;

  const msg = [
    { type: 'text', text: `${header}` },
    { type: 'text', text: `Original text (trimmed):\n${original}` },
    { type: 'text', text: `Items:\n${JSON.stringify(prepared)}` },
    { type: 'text', text: rules }
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
    let out: Array<{ id: string; hint: string }> = Array.isArray(refined?.hints) ? refined.hints : [];
    // Post-filters: ban generic/meta and de-duplicate; enforce word-count and contrast budget
    const banned = /(recall|definition|choose the option|clear fact|directly answers|think about|consider)/i;
    const normalize = (s: string) => String(s || '').trim().replace(/\s+/g, ' ');
    let contrastBudget = Math.max(1, Math.floor((out.length || 1) / 3));
    const uniq = new Set<string>();
    out = out.map((h) => ({ id: String(h?.id || ''), hint: normalize(h?.hint || '') }))
      .map((h) => {
        let t = h.hint;
        // prefix if missing
        if (!/^hint:/i.test(t)) t = `Hint: ${t}`;
        // trim length
        const words = t.split(/\s+/);
        if (words.length > 18) t = words.slice(0, 18).join(' ');
        if (words.length < 11) t = `${t} Look for a key attribute.`.slice(0, 180);
        // filter banned
        if (banned.test(t)) t = t.replace(banned, '').replace(/\s+/g, ' ').trim();
        // manage contrast quota
        if (/\bunlike\b|\bvs\b/i.test(t)) {
          if (contrastBudget > 0) { contrastBudget--; }
          else t = t.replace(/[,;]?\s*(unlike|vs)\b[\s\S]*$/i, '').trim() + '. Use an attribute to decide.';
        }
        h.hint = t.trim();
        return h;
      })
      .filter((h) => h.id && h.hint.length > 8)
      .filter((h) => { const k = h.hint.toLowerCase(); if (uniq.has(k)) return false; uniq.add(k); return true; });

    // If empty after filters, provide safe fallbacks based on mode guesses
    if (!out.length) {
      out = prepared.map((it) => ({ id: it.id, hint:
        it.mode === 'quantitative' ? 'Hint: check units and link knowns with the governing relation.' :
        it.mode === 'graph' ? 'Hint: use axis labels to decide; consider gradient or intercept where relevant.' :
        it.mode === 'experiment' ? 'Hint: identify the variable or control that isolates the effect.' :
        it.mode === 'process' ? 'Hint: choose the next logical action in the sequence, not the outcome.' :
        'Hint: use a key attribute/mechanism of the term to eliminate distractors.'
      }));
    }

    return respond(200, { hints: out } satisfies HintRefineResponse);
  } catch (e: any) {
    return respond(500, { error: 'Server error', details: String(e?.message || e) });
  }
};

export const config = { path: '/api/ai-refine-hints' } as const;


