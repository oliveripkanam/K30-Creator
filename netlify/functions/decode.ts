// Types from @netlify/functions removed for portability in local linting


type MCQ = { id: string; question: string; options: string[]; correctAnswer: number; hint: string; explanation: string; step: number; calculationStep?: { formula?: string; substitution?: string; result?: string } };
type SolutionSummary = { finalAnswer: string; unit: string; workingSteps: string[]; keyFormulas: string[]; keyPoints?: string[]; applications?: string[]; pitfalls?: string[] };
type ImageItem = { base64: string; mimeType: string };
type DecodeRequest = { text?: string; images?: ImageItem[]; marks?: number; subject?: string; syllabus?: string; level?: string; maxTokens?: number };
type DecodeResponse = { mcqs: MCQ[]; solution: SolutionSummary };

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const getEnv = (k: string) => { try { return (globalThis as any)?.Netlify?.env?.get?.(k) ?? process.env[k]; } catch { return process.env[k]; } };
const dbg = (...args: any[]) => { try { console.log('[fn decode][dbg]', ...args); } catch {} };

export default async (req: Request) => {
  try { console.log('[fn decode] invocation', { method: req.method, url: req.url }); } catch {}
  const fnStart = Date.now();
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  let payload: DecodeRequest; try { payload = await req.json(); } catch { return respond(400, { error: 'Invalid JSON body' }); }
  const text = (payload.text || '').toString().trim();
  // Allow up to 8 marks to match the UI selector
  const marks = Math.max(1, Math.min(8, Number(payload.marks ?? 3)));
  const images: ImageItem[] = Array.isArray(payload.images) ? payload.images.filter(it => it && typeof it.base64 === 'string' && typeof it.mimeType === 'string') : [];
  const subject = (payload.subject || '').toString().trim();
  const syllabus = (payload.syllabus || '').toString().trim();
  const level = (payload.level || '').toString().trim();
  // Interpret client value as a TOTAL BUDGET for the entire request (all stages)
  const userTotalBudget = (() => { const n = Number((payload as any)?.maxTokens); return Number.isFinite(n) ? Math.max(200, Math.min(1000000, Math.floor(n))) : 0; })();
  if (!text && images.length === 0) return respond(400, { error: "Missing 'text' or 'images'" });
  dbg('input summary', { textLen: text.length, marks, images: images.length });

  // Global token budget manager (hard cap for all stages)
  const globalBudget = userTotalBudget || 0; // 0 => no global cap
  let remainingBudget = globalBudget;
  const estimateTokensAny = (s: string): number => Math.ceil(String(s || '').length / 4);
  const estimateMessagesTokensAny = (arr: any[]): number => { let chars = 0; for (const m of arr || []) if (m?.type === 'text') chars += String(m.text || '').length; return estimateTokensAny('' + chars); };
  const consumeUsageFromStage = (u: any, stage: string) => {
    if (!globalBudget || !u) return;
    const used = Number(u.total_tokens || 0) || (Number(u.prompt_tokens || 0) + Number(u.completion_tokens || 0));
    remainingBudget = Math.max(0, remainingBudget - (used || 0));
    try { console.log('[fn decode] budget consume', { stage, used, remainingBudget }); } catch {}
  };

  // Added: notation normalization and multi-question detection
  const normalizeNotation = (s: string): string => {
    try {
      let t = String(s || '');
      t = t
        .replace(/[×✕✖✗]/g, 'x')
        .replace(/[·•]/g, '·')
        .replace(/μ/g, 'micro ')
        .replace(/°\s*C/gi, ' deg C')
        .replace(/°/g, ' deg ')
        .replace(/[′’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/–|—/g, '-')
        .replace(/Ω/g, 'ohm')
        .replace(/±/g, '+/-')
        .replace(/\s+/g, ' ')
        .trim();
      t = t
        .replace(/m\s*\/\s*s\s*\^\s*2|m\s*\/\s*s²/gi, 'm/s^2')
        .replace(/m²/gi, 'm^2')
        .replace(/cm²/gi, 'cm^2')
        .replace(/m³/gi, 'm^3');
      return t;
    } catch { return s; }
  };
  const looksLikeMultipleQuestions = (s: string): boolean => {
    try {
      const lines = String(s || '').split(/\r?\n/).map(l => l.trim());
      let count = 0;
      for (const ln of lines) {
        if (/^(?:\d{1,2}[).]|\([a-d]\)|[a-d]\)|\d+\s*[a-d]\)|\d+\.)/i.test(ln)) count++;
      }
      const inlineHits = (s.match(/\b(?:\(i+\)|\d+\.|[A-Da-d]\))/g) || []).length;
      return count >= 2 || inlineHits >= 3;
    } catch { return false; }
  };
  if (!images.length && looksLikeMultipleQuestions(text)) {
    return respond(400, { error: 'Multiple questions detected in text input. Please submit one question at a time.', code: 'MULTIPLE_QUESTIONS' });
  }

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

  // Optional RAG via Azure AI Search
  const searchEndpoint = (getEnv('AZURE_SEARCH_ENDPOINT') || '').trim();
  const searchIndex = (getEnv('AZURE_SEARCH_INDEX_NAME') || '').trim();
  const searchKey = (getEnv('AZURE_SEARCH_API_KEY') || getEnv('AZURE_SEARCH_ADMIN_KEY') || '').trim();

  const headerParts = [
    subject ? `Subject: ${subject}` : '',
    syllabus ? `Syllabus: ${syllabus}` : '',
    level ? `Level: ${level}` : '',
  ].filter(Boolean);
  // Keep headers compact and cap overall user text for latency/limits
  const userTextHeader = headerParts.length ? `${headerParts.join(' • ')}\n` : '';
  const userTextRaw = normalizeNotation((userTextHeader + (text || '')).slice(0, 1400));
  // Minimal guardrails to keep outputs correct and structured
  const computeReq = `\n\nCompute step-by-step and choose the option that matches the computed value; verify before finalizing.`;
  const formatReq = `\n\nReturn ONLY a single JSON object with keys 'mcqs' and 'solution'. Each mcq has fields: id, question, options (4), correctAnswer (0-based), hint, explanation, step. solution has: finalAnswer, unit, workingSteps[], keyFormulas[]. No additional text.`;
  // Trim overly long inputs to keep requests fast and under provider limits, reserving room for instructions
  const maxCore = 7200 - (computeReq.length + formatReq.length);
  const userText = (userTextRaw.length > maxCore ? userTextRaw.slice(0, Math.max(0, maxCore)) : userTextRaw) + computeReq + formatReq;

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
  try {
    const endpointHost = (() => { try { return new URL(rawEndpoint.includes('http') ? rawEndpoint : 'https://placeholder/' + rawEndpoint).host; } catch { return 'unknown'; } })();
    console.log('[fn decode] config', { endpointHost, hasApiKey: !!apiKey, deployment, apiVersion, url });
  } catch {}

  // No custom aborts on server; let Azure/Netlify control timeouts.

  try {
    // Build shared visual+text content
    const baseContent: any[] = [ { type: 'text', text: userText } ];
    for (let i = 0; i < Math.min(1, images.length); i++) {
      const img = images[i];
      if (img && /^image\//i.test(img.mimeType) && typeof img.base64 === 'string' && img.base64.length > 0) {
        baseContent.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
      }
    }
    const hasImage = baseContent.some((p) => p?.type === 'image_url');

    // Prepare holders for summary and mode across branches
    let parsedSummary: any = null;
    let isConceptual: boolean = false;

    // STEP 1: Extract concise structured givens/relations JSON + a step plan of length 'marks'
    const parseInstruction = `\n\nReturn JSON only: { quantities:[{name,symbol?,value?,unit?,known:boolean,type:'numeric'|'symbolic'}], relations:[string], targets:[string], constraints:[string], context:string, subjectHint?:'quantitative'|'conceptual'|'mixed', plan:[{step:number, goal:'select relation'|'resolve components'|'balance forces'|'substitute & evaluate'|'compute next quantity'|'derive formula'|'identify concept'|'compare/contrast'|'classify', mustProduce:'number'|'formula'|'fact', note?:string}] }. Plan length must be exactly ${marks}.`;
    // Track token usage per stage
    let usage_parse: any = null;
    let usage_generate: any = null;
    let usage_synth: any = null;
    let usage_pitfalls: any = null;

    // Compute parse stage budget
    let parseMaxTokens = 300;
    if (globalBudget) {
      const parsePromptEst = estimateTokensAny(userText.slice(0, 900) + parseInstruction);
      parseMaxTokens = Math.max(0, remainingBudget - parsePromptEst);
      if (parseMaxTokens >= 50) {
        const parseRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': apiKey }, body: JSON.stringify({ response_format: { type: 'text' }, temperature: 0.1, messages: [ { role: 'user', content: [ { type: 'text', text: userText.slice(0, 900) }, { type: 'text', text: parseInstruction }, ...baseContent.filter((p) => p.type === 'image_url') ] } ], max_tokens: parseMaxTokens }) });
        dbg('step1(parse) status', parseRes.status);
        if (parseRes.ok) {
          const pr = await parseRes.json();
          usage_parse = (pr as any)?.usage || null;
          const c = pr?.choices?.[0]?.message?.content || '';
          try { parsedSummary = JSON.parse(c); } catch { const m = c.match(/\{[\s\S]*\}/); if (m) { try { parsedSummary = JSON.parse(m[0]); } catch {} } }
          consumeUsageFromStage(usage_parse, 'parse');
        }
      } else {
        // Budget too low: synthesize a minimal parsed summary to avoid extra calls
        parsedSummary = { givens: [], relations: [], targets: [], constraints: [], context: '', subjectHint: 'mixed', plan: Array.from({ length: Math.max(1, Math.min(8, marks)) }, (_, i) => ({ step: i + 1, goal: 'identify concept', mustProduce: 'fact' })) };
      }
    }
    if (!parsedSummary && !globalBudget) {
      const parseRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': apiKey }, body: JSON.stringify({ response_format: { type: 'text' }, temperature: 0.1, messages: [ { role: 'user', content: [ { type: 'text', text: userText.slice(0, 900) }, { type: 'text', text: parseInstruction }, ...baseContent.filter((p) => p.type === 'image_url') ] } ], max_tokens: 300 }) });
      dbg('step1(parse) status', parseRes.status);
      if (parseRes.ok) {
        const pr = await parseRes.json();
        usage_parse = (pr as any)?.usage || null;
        const c = pr?.choices?.[0]?.message?.content || '';
        try { parsedSummary = JSON.parse(c); } catch { const m = c.match(/\{[\s\S]*\}/); if (m) { try { parsedSummary = JSON.parse(m[0]); } catch {} } }
      }
    }
    if (!parsedSummary) parsedSummary = { givens: [], relations: [], targets: [], constraints: [], context: '', subjectHint: 'mixed', plan: [] };
    const subjectHint: string = String(parsedSummary?.subjectHint || '').toLowerCase();
    isConceptual = subjectHint === 'conceptual' || (!/\d/.test(userTextRaw));

    // Lightweight retrieval (if configured) to ground generation
    let retrievedSnippets: string[] = [];
    let retrievalMeta: { used: boolean; count: number; docs: Array<{ name?: string; subject?: string; syllabus?: string }>; } = { used: false, count: 0, docs: [] };
    const runSearch = async () => {
      if (!searchEndpoint || !searchIndex || !searchKey) return;
      const qParts: string[] = [];
      if (subject) qParts.push(`subject:${subject}`);
      if (syllabus) qParts.push(`syllabus:${syllabus}`);
      if (level) qParts.push(`level:${level}`);
      // use a short slice of the question text as the main query
      qParts.push(text.slice(0, 200));
      const query = qParts.filter(Boolean).join(' ');
      const url = `${searchEndpoint.replace(/\/$/, '')}/indexes/${encodeURIComponent(searchIndex)}/docs/search?api-version=2024-07-01`;
      const controller = new AbortController();
      const t = setTimeout(() => { try { controller.abort(); } catch {} }, 1500);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'api-key': searchKey },
          body: JSON.stringify({
            search: query || '*',
            top: 3,
            select: 'merged_content,content,metadata_storage_name,metadata_subject,metadata_syllabus,metadata_year',
          }),
          signal: controller.signal as any
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null) as any;
        const values = Array.isArray(data?.value) ? data.value : [];
        const pick = (doc: any) => String(doc?.merged_content || doc?.content || '').trim();
        const rawSnips = values.map((v: any) => pick(v)?.slice(0, 500)).filter((s: string) => s && s.length > 60);
        const seen = new Set<string>();
        const uniq: string[] = [];
        for (const s of rawSnips) {
          const key = s.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 80);
          if (!seen.has(key)) { seen.add(key); uniq.push(s); }
        }
        retrievedSnippets = uniq.slice(0, 3);
        retrievalMeta.used = true;
        retrievalMeta.count = Math.min(3, uniq.length);
        retrievalMeta.docs = values.slice(0, 3).map((v: any) => ({ name: v?.metadata_storage_name, subject: v?.metadata_subject, syllabus: v?.metadata_syllabus }));
      } catch {} finally { clearTimeout(t); }
    };
    await runSearch();

    // STEP 2: Generate exactly 'marks' MCQs using summary (and optionally vision) with strict constraints
    const genInstruction = `\n\nGenerate EXACTLY ${marks} step MCQs from ProblemSummary. If subjectHint='quantitative' (or plan is computational): use numeric/formula tasks. If 'conceptual': use concise factual tasks tied to targets; do not invent constants. Rules:\n- mcq: {id, question, options(4), correctAnswer(0-based), hint, explanation, step}.\n- Ban meta-options: 'state the formula', 'substitute values', 'compute result', 'none of the above'.\n- Physics quantitative: name the governing relation (e.g., v=u+at, s=ut+1/2at^2, F=ma) and give a one-line substitution that leads to the correct option; keep explanation to one sentence.\n- Conceptual: ONE atomic fact per MCQ (never ask for two/both/multiple). Options are short factual statements; explanation cites the specific syllabus fact. Hints must reference the stem concept (e.g., the defined term) and any focus like short-term vs long-term).\n- Do not ask to recall verbatim givens.\nReturn ONLY JSON { mcqs: [...], solution: { finalAnswer, unit, workingSteps, keyFormulas } }. Ensure final_answer_text and final_choice for MCQ summary are derivable.`;
    const genContent: any[] = [ { type: 'text', text: `ProblemSummary:\n${JSON.stringify(parsedSummary).slice(0, 900)}` }, { type: 'text', text: genInstruction } ];
    // Include a compact original text snippet for grounding
    genContent.unshift({ type: 'text', text: userTextRaw.slice(0, 1200) });
    // If we have retrieved context, prepend it compactly
    if (retrievedSnippets.length) {
      const header = 'Retrieved Context (use for facts, avoid copying):';
      const body = retrievedSnippets.map((s, i) => `(${i+1}) ${s}`).join('\n');
      genContent.unshift({ type: 'text', text: `${header}\n${body}` });
    }

    // Global-budgeted generate stage
    const estimateTokens = (s: string): number => Math.ceil(String(s || '').length / 4);
    const estimateMessagesTokens = (arr: any[]): number => {
      let chars = 0; for (const m of arr) if (m?.type === 'text') chars += String(m.text || '').length; return estimateTokens('' + chars);
    };
    const minCompletion = 120;
    const targetBudget = globalBudget ? remainingBudget : 0; // 0 => use default below
    let promptEst = estimateMessagesTokens(genContent);
    if (targetBudget && promptEst + minCompletion > targetBudget) {
      // Trim retrieved snippets first, then original text header, to fit budget
      const recompute = () => estimateMessagesTokens(genContent);
      const reduceSnippets = () => {
        for (let i = 0; i < genContent.length; i++) {
          const c = genContent[i];
          if (c?.type === 'text' && /Retrieved Context/.test(String(c.text || ''))) {
            const lines = String(c.text || '').split('\n').filter(Boolean);
            const trimmed = [lines[0], ...lines.slice(1).slice(0, 2).map((s: string) => s.slice(0, 220))].join('\n');
            genContent[i] = { type: 'text', text: trimmed };
            break;
          }
        }
      };
      const reduceUserText = () => {
        for (let i = 0; i < genContent.length; i++) {
          const c = genContent[i];
          if (c?.type === 'text' && c.text && !/ProblemSummary:|Retrieved Context/.test(c.text)) {
            genContent[i] = { type: 'text', text: String(c.text).slice(0, 600) };
            break;
          }
        }
      };
      reduceSnippets();
      promptEst = recompute();
      if (promptEst + minCompletion > targetBudget) {
        reduceUserText();
        promptEst = recompute();
      }
    }
    const computedMaxCompletion = targetBudget ? Math.max(0, Math.min(1000000, targetBudget - promptEst)) : 450;
    try { console.log('[fn decode] token budget', { globalBudget, remainingBudget, promptEst, max_completion: computedMaxCompletion }); } catch {}
    if (globalBudget && computedMaxCompletion < 50) {
      const minimal: DecodeResponse = { mcqs: [], solution: { finalAnswer: '', unit: '', workingSteps: [], keyFormulas: [] } } as any;
      return respond(200, { ...minimal, usage: { stages: {}, totals: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }, meta: { global_budget: globalBudget, used_total: globalBudget - remainingBudget, remaining_budget: remainingBudget, retrieval: { used: false, count: 0, docs: [] } } });
    }

    const genController = new AbortController();
    const genTimeout = setTimeout(() => { try { genController.abort(); } catch {} }, 12000);
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        response_format: { type: 'json_object' },
        temperature: 0.1,
        messages: [ { role: 'user', content: genContent } ],
        max_tokens: computedMaxCompletion
      }),
      signal: genController.signal as any
    });
    dbg('step2(generate) status', res.status);
    try { clearTimeout(genTimeout); } catch {}

    if (!res.ok && hasImage) {
      const details = await res.text().catch(() => '');
      try { console.warn('[fn decode] azure image request failed; retrying text-only', res.status, details?.slice(0, 300)); } catch {}
      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => { try { retryController.abort(); } catch {} }, 10000);
      const retryRes2 = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          response_format: { type: 'text' },
          temperature: 0.1,
          messages: [ { role: 'user', content: [{ type: 'text', text: userText.slice(0, 3000) }] } ]
        }),
        signal: retryController.signal as any
      });
      dbg('response (retry text-only) status', retryRes2.status);
      try { clearTimeout(retryTimeout); } catch {}
      if (retryRes2.ok) {
        (res as any) = retryRes2;
      }
    }

    if (!res.ok) { const details = await res.text(); try { console.error('[fn decode] azure error', res.status, details); } catch {}; return respond(res.status, { error: 'Azure error', details }); }

    const data = await res.json();
    try { dbg('azure response raw keys', Object.keys(data || {})); } catch {}
    const choice = data?.choices?.[0];
    let content: string = choice?.message?.content || choice?.delta?.content || '';
    let usage: any = (data as any)?.usage;
    const finishReason = choice?.finish_reason;
    const hitGenerateCap = finishReason === 'length';
    try { 
      console.log('[fn decode] choice details:', {
        finish_reason: finishReason,
        content_length: content?.length,
        usage: data?.usage,
        first_100_chars: content?.slice(0, 100)
      });
    } catch {}
    if (hitGenerateCap) {
      try { console.warn('[fn decode] token limit reached on generate', { max_tokens: computedMaxCompletion, budget_total: (globalBudget || null), prompt_estimate: promptEst }); } catch {}
    }

    consumeUsageFromStage(usage, 'generate');

    if (!content?.trim()) {
      dbg('empty content on primary OK; retry with text format');
      try { console.warn('[fn decode] empty content with OK response; retrying with text format'); } catch {}
      const secController = new AbortController();
      const secTimeout = setTimeout(() => { try { secController.abort(); } catch {} }, 8000);
      const retryRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          response_format: { type: 'text' },
          temperature: 0.1,
          messages: [
            { role: 'user', content: [{ type: 'text', text: `${userText}` }] }
          ]
        }),
        signal: secController.signal as any
      });
      dbg('response (secondary text) status', retryRes.status);
      try { clearTimeout(secTimeout); } catch {}
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
            dbg('attempting alternate deployment', { altDeployment, altUrl });
            const altRes = await fetch(altUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
              body: JSON.stringify({
                response_format: { type: 'text' },
                temperature: 0.1,
                messages: [
                  { role: 'user', content: [{ type: 'text', text: userText }] }
                ]
              })
            });
            dbg('response (alt json/text) status', altRes.status);
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
                  response_format: { type: 'text' },
                  temperature: 0.1,
                  messages: [
                    { role: 'user', content: [{ type: 'text', text: `${userText}` }] }
                  ]
                })
              });
              dbg('response (alt text) status', altTextRes.status);
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
        try { console.error('[fn decode] still empty after retries', { url, deployment, apiVersion, contentLen: content?.length }); } catch {}
        return respond(502, { error: 'Empty response from Azure', azureData: data });
      }
    }
    // Record usage for generation stage after final content is resolved
    let usage_generate_local = usage || null;

    let parsed: DecodeResponse | null = null;
    try { 
      parsed = JSON.parse(content); 
    } catch { 
      const m = content.match(/\{[\s\S]*\}/); 
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }
    try { console.log('[fn decode] parsed keys', Object.keys((parsed as any) || {})); } catch {}

    // Track counts for diagnostics
    let dbgCounts = { rawParsed: 0, salvagedOnInvalid: 0, afterFilter: 0, afterTopup: 0, afterFinal: 0 } as any;

    if (parsed && Array.isArray((parsed as any).mcqs)) { dbgCounts.rawParsed = (parsed as any).mcqs.length; }

    // If model output is invalid, attempt a light salvage ONLY when we did not hit the cap
    if ((!parsed || !Array.isArray((parsed as any).mcqs) || !(parsed as any).solution) && !hitGenerateCap) {
      try { console.warn('[fn decode] invalid model output; attempting salvage'); } catch {}
      const salvagedMcqs: MCQ[] = [] as any;
      try {
        // Extract questions heuristically
        const qMatches = Array.from(content.matchAll(/\"question\"\s*:\s*\"([\s\S]*?)\"/g));
        for (let i = 0; i < Math.min(qMatches.length, marks); i++) {
          const qText = (qMatches[i]?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 280);
          if (!qText) continue;
          const start = qMatches[i].index ?? 0;
          const end = (qMatches[i+1]?.index ?? content.length);
          const region = content.slice(start, end);
          const normalizeOptions = (raw: any): string[] | null => {
            try {
              if (Array.isArray(raw)) {
                const arr = raw.map((v: any) => typeof v === 'string' ? v.trim() : String(v?.text ?? v?.value ?? v?.label ?? '').trim());
                if (arr.length === 4 && arr.every((s: string) => s.length > 1)) return arr.map((s: string) => s.replace(/^\s*[A-Da-d][).:\-]\s*/, '').trim());
              }
            } catch {}
            return null;
          };
          // Try JSON-ish options
          let options: string[] | null = null;
          const optJson = region.match(/\"options\"\s*:\s*\[(.*?)\]/s);
          if (optJson && optJson[1]) { try { options = normalizeOptions(JSON.parse(`[${optJson[1]}]`)); } catch {} }
          if (!options) {
            const lettered: string[] = [];
            const rgx = /\n?\s*([A-Da-d])[).:\-]\s*([^\n\r]+)[\n\r]?/g;
            let m; while ((m = rgx.exec(region)) && lettered.length < 4) { lettered.push(String(m[2] || '').trim()); }
            if (lettered.length === 4) options = lettered;
          }
          let correctIdx = 0;
          const mNum = region.match(/\"correctAnswer\"\s*:\s*(\d+)/); if (mNum) correctIdx = Math.max(0, Math.min(3, Number(mNum[1])));
          const mLbl = region.match(/\"correct(Label|Option)?\"\s*:\s*\"([A-Da-d])\"/); if (mLbl) { const L = mLbl[2].toUpperCase().charCodeAt(0) - 65; if (!Number.isNaN(L)) correctIdx = Math.max(0, Math.min(3, L)); }
          if (!options) options = ['Choose governing relation','Substitute given values','Compute result','None of the above'];
          salvagedMcqs.push({ id: `sv-${Date.now()}-${i}`, question: qText, options, correctAnswer: correctIdx, hint: 'Use the next governing relation, then substitute.', explanation: 'Progress logically toward the final result.', step: i + 1 } as any);
        }
      } catch {}
      dbgCounts.salvagedOnInvalid = salvagedMcqs.length;
      const safeSolution: SolutionSummary = { finalAnswer: '', unit: '', workingSteps: [], keyFormulas: [] };
      parsed = { mcqs: salvagedMcqs, solution: safeSolution } as any;
    }

    // Build ensured struct
    if (!parsed || !Array.isArray((parsed as any).mcqs) || !(parsed as any).solution) { 
      parsed = { mcqs: [], solution: { finalAnswer: '', unit: '', workingSteps: [], keyFormulas: [] } as any } as any;
    }
    const ensured = (parsed as any) as { mcqs: any[]; solution: any };

    // If the generate cap was hit, do not return any MCQs
    if (hitGenerateCap) { ensured.mcqs = []; }

    // Server-side validator
    const isMetaOption = (s: string) => /state the|substitute|compute the|none of the above/i.test(s);
    const isRecallQuestion = (q: string) => /what is the mass of|check the problem statement|refer to the statement|according to the text/i.test(q);
    const isMultiItemConceptual = (q: string) => /\b(two|both|select two|choose two|two short|two long|multiple)\b/i.test(q);
    if (Array.isArray(ensured.mcqs)) {
      ensured.mcqs = ensured.mcqs.filter((m: any) => {
        const q = String(m?.question || '');
        const opts = Array.isArray(m?.options) ? m.options.map((o: any) => String(o || '')) : [];
        if (isRecallQuestion(q)) return false;
        if (opts.length !== 4) return false;
        if (opts.some((o: string) => isMetaOption(o))) return false;
        if (isConceptual && isMultiItemConceptual(q)) return false;
        return true;
      });
    }
    dbgCounts.afterFilter = Array.isArray(ensured.mcqs) ? ensured.mcqs.length : 0;

    // Replacement generation only if budget allows AND cap not hit
    if ((ensured.mcqs as any[]).length < marks && (!globalBudget || remainingBudget > 180) && !hitGenerateCap) {
      try {
        const missing = Math.max(0, marks - (ensured.mcqs as any[]).length);
        const badNote = isConceptual ? 'Replace invalid or missing steps. Conceptual mode: ONE atomic fact per MCQ...' : 'Replace invalid or missing steps. Quantitative mode: numeric or formula options...';
        const replContent: any[] = [ { type: 'text', text: `ProblemSummary:\n${JSON.stringify(parsedSummary).slice(0, 3000)}` }, { type: 'text', text: `Generate ONLY ${missing} MCQs continuing the plan. ${badNote}` } ];
        const replPromptEst = estimateMessagesTokens(replContent);
        const replMax = globalBudget ? Math.max(0, remainingBudget - replPromptEst) : 220;
        if (!globalBudget || replMax > 50) {
          const replRes = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': apiKey }, body: JSON.stringify({ response_format: { type: 'text' }, temperature: 0.1, messages: [ { role: 'user', content: replContent } ], max_tokens: globalBudget ? replMax : 220 }) });
          if (replRes.ok) { const rd = await replRes.json(); const rc = rd?.choices?.[0]?.message?.content || ''; try { const rj = JSON.parse(rc) || {}; const add = Array.isArray(rj.mcqs) ? rj.mcqs : []; ensured.mcqs = [ ...ensured.mcqs, ...add ].slice(0, marks); } catch {} consumeUsageFromStage((rd as any)?.usage, 'generate-repl'); }
        }
      } catch {}
    }
    dbgCounts.afterTopup = Array.isArray(ensured.mcqs) ? ensured.mcqs.length : 0;

    // Second salvage if still empty after filters/top-up and cap not hit
    if ((!ensured.mcqs || ensured.mcqs.length === 0) && !hitGenerateCap) {
      try { console.warn('[fn decode] MCQs empty after filters/top-up; salvage second pass'); } catch {}
      const salvageAgain: MCQ[] = [] as any;
      try {
        const blocks = content.split(/\n\n|\r\n\r\n/).filter(Boolean).slice(0, marks);
        for (let i = 0; i < blocks.length && salvageAgain.length < marks; i++) {
          const b = blocks[i];
          const stem = b.replace(/\s+/g, ' ').slice(0, 240) || `Step ${i+1}: choose next action`;
          const opts = [ 'Use governing relation', 'Substitute known values', 'Compute result', 'Check units' ];
          salvageAgain.push({ id: `sv2-${Date.now()}-${i}`, question: stem, options: opts, correctAnswer: 0, hint: 'Pick the relation that advances the solution.', explanation: 'Use relation, then substitute and compute.', step: i + 1 } as any);
        }
      } catch {}
      ensured.mcqs = salvageAgain.slice(0, marks);
    }

    // Ensure solution fields
    ensured.solution = ensured.solution || {}; if (!Array.isArray(ensured.solution.workingSteps)) ensured.solution.workingSteps = []; if (!Array.isArray(ensured.solution.keyFormulas)) ensured.solution.keyFormulas = [];

    dbgCounts.afterFinal = Array.isArray(ensured.mcqs) ? ensured.mcqs.length : 0;
    try { console.log('[fn decode] mcq counts', dbgCounts); } catch {}

    // Aggregate usage and respond
    const sumUsage = (arr: any[]) => { const tot = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } as any; for (const u of arr) { if (!u) continue; tot.prompt_tokens += Number(u.prompt_tokens || 0); tot.completion_tokens += Number(u.completion_tokens || 0); tot.total_tokens += Number(u.total_tokens || 0); } return tot; };
    const usageBreakdown = { stages: { parse: usage_parse, generate: usage, synth: usage_synth, pitfalls: usage_pitfalls }, totals: sumUsage([usage_parse, usage, usage_synth, usage_pitfalls]) };
    try { console.log('[fn decode] token usage breakdown', usageBreakdown); } catch {}
    return respond(200, { ...ensured, usage: usageBreakdown, meta: { hit_generate_cap: hitGenerateCap, global_budget: globalBudget || null, remaining_budget: globalBudget ? remainingBudget : null, debug_counts: dbgCounts, retrieval: retrievalMeta } });
  } catch (err: any) {
    try { console.error('[fn decode] exception', err); } catch {}
    return respond(500, { error: 'Server error', details: String(err?.message || err) });
  }
};

export const config = { path: '/api/ai-decode' } as const;


