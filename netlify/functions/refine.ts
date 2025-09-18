// Types kept minimal to avoid cross-file imports
type MCQ = { id: string; question: string; options: string[]; correctAnswer: number; hint?: string; explanation?: string; step?: number; calculationStep?: { formula?: string; substitution?: string; result?: string } };
type RefinableSolution = { workingSteps?: string[]; keyFormulas?: string[]; keyPoints?: string[]; pitfalls?: string[] };

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const getEnv = (k: string) => { try { return (globalThis as any)?.Netlify?.env?.get?.(k) ?? process.env[k]; } catch { return process.env[k]; } };
const dbg = (...args: any[]) => { try { console.log('[fn refine][dbg]', ...args); } catch {} };

export default async (req: Request) => {
  try { console.log('[fn refine] invocation', { method: req.method, url: req.url }); } catch {}
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  let payload: { subject?: string; syllabus?: string; level?: string; originalText?: string; mcqs?: MCQ[]; solution?: RefinableSolution };
  try { payload = await req.json(); } catch { return respond(400, { error: 'Invalid JSON body' }); }
  const subject = (payload.subject || '').toString().trim();
  const syllabus = (payload.syllabus || '').toString().trim();
  const level = (payload.level || '').toString().trim();
  const originalText = (payload.originalText || '').toString();
  const mcqs = Array.isArray(payload.mcqs) ? payload.mcqs : [];
  const baseSolution: RefinableSolution = payload.solution || {};

  const rawEndpoint = (getEnv('AZURE_OPENAI_ENDPOINT') || '').trim();
  const apiKey = getEnv('AZURE_OPENAI_API_KEY') || '';
  const deployment = (getEnv('DECODER_OPENAI_DEPLOYMENT') || getEnv('AZURE_OPENAI_DEPLOYMENT') || '').trim();
  const apiVersion = (getEnv('AZURE_OPENAI_API_VERSION') || '2024-06-01').trim();
  if (!rawEndpoint || !apiKey) return respond(500, { error: 'Missing Azure OpenAI endpoint or api key' });

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
  let url: string; try { url = buildUrl(rawEndpoint, deployment, apiVersion); } catch (e: any) { return respond(500, { error: e?.message || 'Invalid Azure config' }); }

  // Assemble compact context
  const header = [subject && `Subject: ${subject}`, syllabus && `Syllabus: ${syllabus}`, level && `Level: ${level}`].filter(Boolean).join(' • ');
  const compactMcqs = (mcqs || []).slice(0, 10).map(m => ({
    step: Number(m.step) || 0,
    question: String(m.question || '').slice(0, 400),
    explanation: String(m.explanation || '').slice(0, 400),
    correct: Array.isArray(m.options) ? String(m.options[m.correctAnswer] || m.options[0] || '').slice(0, 120) : '',
    formula: m?.calculationStep?.formula || '',
    substitution: m?.calculationStep?.substitution || '',
    result: m?.calculationStep?.result || ''
  }));
  const compactSolution = {
    workingSteps: Array.isArray(baseSolution.workingSteps) ? baseSolution.workingSteps.slice(0, 8) : [],
    keyFormulas: Array.isArray(baseSolution.keyFormulas) ? baseSolution.keyFormulas.slice(0, 6) : [],
    keyPoints: Array.isArray(baseSolution.keyPoints) ? baseSolution.keyPoints.slice(0, 6) : [],
    pitfalls: Array.isArray(baseSolution.pitfalls) ? baseSolution.pitfalls.slice(0, 6) : []
  };

  let usage_synth: any = null;
  let usage_pitfalls: any = null;

  const runSynthesis = async () => {
    const synthInstruction = `Return ONLY JSON: { workingSteps: string[], keyPoints: string[] }.
Rules:
- workingSteps: 3-6 ordered, imperative, concrete actions. For quantitative: include (1) a governing relation (e.g., F = ma / v = u + at) and (2) one explicit substitution with units.
- keyPoints: 2-4 DISTINCT, SHORT noun-phrases (≤ 10 words each). No leading verbs. No overlap with workingSteps. Avoid generic advice. Prefer constants or laws (e.g., 'g ≈ 9.81 m/s² near Earth').`;
    const controller = new AbortController();
    const timeout = setTimeout(() => { try { controller.abort(); } catch {} }, 4500);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          response_format: { type: 'json_object' },
          temperature: 0.1,
          messages: [ { role: 'user', content: [
            { type: 'text', text: `${header}\n\nOriginal:\n${String(originalText || '').slice(0, 900)}` },
            { type: 'text', text: `Context:\n${JSON.stringify({ mcqs: compactMcqs, solution: compactSolution }).slice(0, 3500)}` },
            { type: 'text', text: synthInstruction }
          ] } ],
          max_tokens: 320
        }),
        signal: controller.signal as any
      });
      dbg('step(synth) status', res.status);
      if (!res.ok) return { workingSteps: compactSolution.workingSteps || [], keyPoints: compactSolution.keyPoints || [] };
      const data = await res.json();
      usage_synth = (data as any)?.usage || null;
      const sc = data?.choices?.[0]?.message?.content || '';
      try { return JSON.parse(sc); } catch { return { workingSteps: compactSolution.workingSteps || [], keyPoints: compactSolution.keyPoints || [] }; }
    } finally { clearTimeout(timeout); }
  };

  const runPitfalls = async () => {
    const pitInstruction = `Return ONLY JSON: { pitfalls: string[] }.
Rules:
- Generate 3-5 common mistakes SPECIFIC to the formulas/plan used above.
- Each item ≤ 14 words, starts with a noun phrase (no verbs like 'use/apply/recognize').
- Avoid duplicates and generic advice.`;
    const controller = new AbortController();
    const timeout = setTimeout(() => { try { controller.abort(); } catch {} }, 3500);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          response_format: { type: 'json_object' },
          temperature: 0.2,
          messages: [ { role: 'user', content: [
            { type: 'text', text: `${header}` },
            { type: 'text', text: `Context:\n${JSON.stringify({ formulas: compactSolution.keyFormulas, steps: compactSolution.workingSteps, mcqs: compactMcqs }).slice(0, 3500)}` },
            { type: 'text', text: pitInstruction }
          ] } ],
          max_tokens: 220
        }),
        signal: controller.signal as any
      });
      dbg('step(pitfalls) status', res.status);
      if (!res.ok) return { pitfalls: compactSolution.pitfalls || [] };
      const data = await res.json();
      usage_pitfalls = (data as any)?.usage || null;
      const sc = data?.choices?.[0]?.message?.content || '';
      try { return JSON.parse(sc); } catch { return { pitfalls: compactSolution.pitfalls || [] }; }
    } finally { clearTimeout(timeout); }
  };

  const [synth, pit] = await Promise.allSettled([ runSynthesis(), runPitfalls() ]);
  const synthVal: any = (synth as any)?.value || { workingSteps: compactSolution.workingSteps || [], keyPoints: compactSolution.keyPoints || [] };
  const pitVal: any = (pit as any)?.value || { pitfalls: compactSolution.pitfalls || [] };

  // Post-process: distinct, filter generic, ensure quantitative guardrails
  const isGeneric = (s: string) => /proceed step-by-step|use the correct formula|substitute numbers/i.test(String(s || ''));
  let workingSteps: string[] = Array.isArray(synthVal.workingSteps) ? synthVal.workingSteps.map((s: any) => String(s || '').trim()).filter(Boolean) : [];
  workingSteps = Array.from(new Set(workingSteps.filter(s => !isGeneric(s)))).slice(0, 6);
  if (!workingSteps.length) workingSteps = compactSolution.workingSteps || [];

  let keyPoints: string[] = Array.isArray(synthVal.keyPoints) ? synthVal.keyPoints.map((s: any) => String(s || '').trim()).filter(Boolean) : [];
  const wsSet = new Set(workingSteps.map(s => s.toLowerCase()));
  keyPoints = keyPoints.filter(p => !wsSet.has(String(p || '').toLowerCase()) && !isGeneric(p)).slice(0, 4);

  let pitfalls: string[] = Array.isArray(pitVal.pitfalls) ? pitVal.pitfalls.map((s: any) => String(s || '').trim()).filter(Boolean) : [];
  const looksLikeStep = (s: string) => /substitute|compute|use|apply|identify|recognize|derive|select/i.test(String(s || ''));
  pitfalls = pitfalls.filter(p => p && !looksLikeStep(p) && !isGeneric(p)).slice(0, 5);

  const usage = {
    stages: { synth: usage_synth, pitfalls: usage_pitfalls },
    totals: (() => {
      const tot = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } as any;
      for (const u of [usage_synth, usage_pitfalls]) {
        if (!u) continue;
        tot.prompt_tokens += Number(u.prompt_tokens || 0);
        tot.completion_tokens += Number(u.completion_tokens || 0);
        tot.total_tokens += Number(u.total_tokens || 0);
      }
      return tot;
    })()
  };

  return respond(200, { workingSteps, keyPoints, pitfalls, usage });
};

export const config = { path: '/api/ai-refine' } as const;


