// Types from @netlify/functions removed for portability in local linting

type MCQ = { id: string; question: string; options: string[]; correctAnswer: number; hint: string; explanation: string; step: number; calculationStep?: { formula?: string; substitution?: string; result?: string } };
type SolutionSummary = { finalAnswer: string; unit: string; workingSteps: string[]; keyFormulas: string[] };
type ImageItem = { base64: string; mimeType: string };
type DecodeRequest = { text?: string; images?: ImageItem[]; marks?: number; subject?: string; syllabus?: string; level?: string };
type DecodeResponse = { mcqs: MCQ[]; solution: SolutionSummary };

const respond = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const getEnv = (k: string) => { try { return (globalThis as any)?.Netlify?.env?.get?.(k) ?? process.env[k]; } catch { return process.env[k]; } };
const dbg = (...args: any[]) => { try { console.log('[fn decode][dbg]', ...args); } catch {} };

export default async (req: Request) => {
  try { console.log('[fn decode] invocation', { method: req.method, url: req.url }); } catch {}
  if (req.method !== 'POST') return respond(405, { error: 'Method not allowed' });

  let payload: DecodeRequest; try { payload = await req.json(); } catch { return respond(400, { error: 'Invalid JSON body' }); }
  const text = (payload.text || '').toString().trim();
  // Allow up to 8 marks to match the UI selector
  const marks = Math.max(1, Math.min(8, Number(payload.marks ?? 3)));
  const images: ImageItem[] = Array.isArray(payload.images) ? payload.images.filter(it => it && typeof it.base64 === 'string' && typeof it.mimeType === 'string') : [];
  const subject = (payload.subject || '').toString().trim();
  const syllabus = (payload.syllabus || '').toString().trim();
  const level = (payload.level || '').toString().trim();
  if (!text && images.length === 0) return respond(400, { error: "Missing 'text' or 'images'" });
  dbg('input summary', { textLen: text.length, marks, images: images.length });

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

  const headerParts = [
    subject ? `Subject: ${subject}` : '',
    syllabus ? `Syllabus/Board: ${syllabus}` : '',
    level ? `Year/Level: ${level}` : '',
  ].filter(Boolean);
  const userTextRaw = headerParts.length ? `${headerParts.join(' • ')}\n\n${text}` : text;
  // Minimal guardrails to keep outputs correct and structured
  const computeReq = `\n\nCompute step-by-step and choose the option that matches the computed value; verify before finalizing.`;
  const formatReq = `\n\nReturn ONLY a single JSON object with keys 'mcqs' and 'solution'. Each mcq has fields: id, question, options (4), correctAnswer (0-based), hint, explanation, step. solution has: finalAnswer, unit, workingSteps[], keyFormulas[]. No additional text.`;
  // Trim overly long inputs to keep requests fast and under provider limits, reserving room for instructions
  const maxCore = 8000 - (computeReq.length + formatReq.length);
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

  // No custom aborts; let Azure/Netlify control timeouts to avoid premature 500s.

  try {
    // Build shared visual+text content
    const baseContent: any[] = [ { type: 'text', text: userText } ];
    for (let i = 0; i < Math.min(2, images.length); i++) {
      const img = images[i];
      if (img && /^image\//i.test(img.mimeType) && typeof img.base64 === 'string' && img.base64.length > 0) {
        baseContent.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
      }
    }
    const hasImage = baseContent.some((p) => p?.type === 'image_url');

    // STEP 1: Extract concise structured givens/relations JSON + a step plan of length 'marks'
    const parseInstruction = `\n\nReturn ONLY JSON with keys: quantities (array of {name,symbol?,value?,unit?,known:boolean,type:'numeric'|'symbolic'}), relations (array of equation/constraint strings), targets (array of strings), constraints (array of short strings), context (string), subjectHint?:'quantitative'|'conceptual'|'mixed', plan (array of exactly ${marks} items where each item is {step:number, goal:'select relation'|'resolve components'|'balance forces'|'substitute & evaluate'|'compute next quantity'|'derive formula'|'identify concept'|'compare/contrast'|'classify', mustProduce:'number'|'formula'|'fact', note?:string}). No prose.`;
    const parseRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        response_format: { type: 'text' },
        temperature: 0.1,
        messages: [ { role: 'user', content: [ ...baseContent, { type: 'text', text: parseInstruction } ] } ]
      })
    });
    dbg('step1(parse) status', parseRes.status);
    let parsedSummary: any = null;
    if (parseRes.ok) {
      const pr = await parseRes.json();
      const c = pr?.choices?.[0]?.message?.content || '';
      try { parsedSummary = JSON.parse(c); } catch { const m = c.match(/\{[\s\S]*\}/); if (m) { try { parsedSummary = JSON.parse(m[0]); } catch {} } }
    }
    if (!parsedSummary) parsedSummary = { givens: [], relations: [], target: '', constants: [], notes: '' };

    // STEP 2: Generate exactly 'marks' MCQs using summary (and optionally vision) with strict constraints
    const genInstruction = `\n\nUsing the ProblemSummary below, generate EXACTLY ${marks} MCQs that lead the learner step-by-step to the solution. Follow the plan if provided. Mode: if subjectHint is 'quantitative' (or plan goals are computational), prefer numeric/formula tasks; if 'conceptual', prefer concise factual tasks tied to targets (no invented constants). Rules:\n- Each MCQ must have: id, question, options (exactly 4), correctAnswer (0-based), hint, explanation, step.\n- BAN meta-options like 'state the formula', 'substitute values', 'compute result', 'none of the above'.\n- Quantitative mode: options must be numbers with units or explicit formulas; show relation + substitution in explanation.\n- Conceptual mode: options must be short factual statements (not opinions), each tied to syllabus-level facts; explanation cites the relevant fact/reasoning.\n- Questions must not ask to recall verbatim given text (e.g., 'what is the mass given?').\nReturn ONLY JSON { mcqs: [...], solution: {...} }.`;
    const genContent: any[] = [ { type: 'text', text: `ProblemSummary:\n${JSON.stringify(parsedSummary).slice(0, 3500)}` }, { type: 'text', text: genInstruction } ];
    // Also include the original text (trimmed) to preserve context
    genContent.unshift({ type: 'text', text: (userTextRaw.length > 4000 ? userTextRaw.slice(0, 4000) : userTextRaw) });
    // Attach images again if any
    if (hasImage) {
      for (let i = 0; i < Math.min(2, images.length); i++) {
        const img = images[i];
        genContent.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
      }
    }
    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        response_format: { type: 'text' },
        temperature: 0.1,
        messages: [ { role: 'user', content: genContent } ]
      })
    });
    dbg('step2(generate) status', res.status);

    if (!res.ok && hasImage) {
      const details = await res.text().catch(() => '');
      try { console.warn('[fn decode] azure image request failed; retrying text-only', res.status, details?.slice(0, 300)); } catch {}
      // Retry without image attachment
      const retryRes2 = await fetch(url, {
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
      dbg('response (retry text-only) status', retryRes2.status);
      if (retryRes2.ok) {
        // Rebind res for downstream handling
        (res as any) = retryRes2;
      }
    }

    if (!res.ok) { const details = await res.text(); try { console.error('[fn decode] azure error', res.status, details); } catch {}; return respond(res.status, { error: 'Azure error', details }); }

    const data = await res.json();
    try { dbg('azure response raw keys', Object.keys(data || {})); } catch {}
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
      dbg('empty content on primary OK; retry with text format');
      try { console.warn('[fn decode] empty content with OK response; retrying with text format'); } catch {}
      const retryRes = await fetch(url, {
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
      dbg('response (secondary text) status', retryRes.status);
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
    
    let parsed: DecodeResponse | null = null;
    try { 
      parsed = JSON.parse(content); 
    } catch { 
      const m = content.match(/\{[\s\S]*\}/); 
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {}
      }
    }
    // Helper: normalize an options structure into a clean string[4]
    const normalizeOptions = (raw: any): string[] | null => {
      try {
        if (Array.isArray(raw)) {
          // Examples: ["opt A", "opt B", ...] or [{ text, label }, ...]
          const arr = raw.map((v: any) => {
            if (typeof v === 'string') return String(v).trim();
            if (v && typeof v === 'object') {
              const t = v.text ?? v.value ?? v.option ?? v.label ?? '';
              return String(t).trim();
            }
            return '';
          });
          if (arr.length === 4 && arr.every((s: string) => typeof s === 'string' && s.trim().length > 1)) {
            // Strip leading "A) ", "B. ", etc.
            return arr.map((s: string) => s.replace(/^\s*[A-Da-d][).:\-]\s*/, '').trim());
          }
        }
        if (raw && typeof raw === 'object') {
          // Example: { A: '...', B: '...', C: '...', D: '...' }
          const keys = ['A','B','C','D'];
          const arr = keys.map(k => String(raw[k] ?? '').trim());
          if (arr.every((s: string) => s.length > 1)) return arr;
        }
      } catch {}
      return null;
    };

    const letterOnly = (arr: any[]) => Array.isArray(arr) && arr.length === 4 && arr.every(v => typeof v === 'string' && /^[A-Da-d]$/.test(v.trim().replace(/[).]/g,'')));

    if (!parsed || !Array.isArray((parsed as any).mcqs) || !(parsed as any).solution) { 
      try { console.warn('[fn decode] invalid model output; attempting salvage', { preview: content.slice(0, 200) }); } catch {};
      // Lenient salvage: extract questions heuristically and build minimal MCQs
      const salvagedMcqs: MCQ[] = [] as any;
      try {
        const qMatches = Array.from(content.matchAll(/\"question\"\s*:\s*\"([\s\S]*?)\"/g));
        for (let i = 0; i < Math.min(qMatches.length, marks); i++) {
          const qText = (qMatches[i]?.[1] || '').replace(/\s+/g, ' ').trim().slice(0, 280);
          if (!qText) continue;
          // Look for options and correct answer in the text region following this question
          const start = qMatches[i].index ?? 0;
          const end = (qMatches[i+1]?.index ?? content.length);
          const region = content.slice(start, end);

          // Try to capture options as a JSON array first
          let options: string[] | null = null;
          const optJson = region.match(/\"options\"\s*:\s*\[(.*?)\]/s);
          if (optJson && optJson[1]) {
            try {
              const jsonStr = `[${optJson[1]}]`;
              const parsedArr = JSON.parse(jsonStr);
              options = normalizeOptions(parsedArr);
            } catch {}
          }
          // Try alternative key 'choices'
          if (!options) {
            const choicesJson = region.match(/\"choices\"\s*:\s*\[(.*?)\]/s);
            if (choicesJson && choicesJson[1]) {
              try {
                const jsonStr = `[${choicesJson[1]}]`;
                const parsedArr = JSON.parse(jsonStr);
                // choices may be like [{label:'A', text:'...'}]
                options = normalizeOptions(parsedArr);
              } catch {}
            }
          }
          // Fallback: parse lettered lines like "A) text"
          if (!options) {
            const lettered: string[] = [];
            const rgx = /\n?\s*([A-Da-d])[).:\-]\s*([^\n\r]+)[\n\r]?/g;
            let m;
            while ((m = rgx.exec(region)) && lettered.length < 4) {
              lettered.push(String(m[2] || '').trim());
            }
            if (lettered.length === 4) options = lettered;
          }

          // Determine correct answer index
          let correctIdx = 0;
          const mNum = region.match(/\"correctAnswer\"\s*:\s*(\d+)/);
          if (mNum) correctIdx = Math.max(0, Math.min(3, Number(mNum[1])));
          const mLbl = region.match(/\"correct(Label|Option)?\"\s*:\s*\"([A-Da-d])\"/);
          if (mLbl) {
            const L = mLbl[2].toUpperCase().charCodeAt(0) - 65;
            if (!Number.isNaN(L)) correctIdx = Math.max(0, Math.min(3, L));
          }

          // Safety defaults
          if (!options || letterOnly(options)) {
            options = [
              'State the relevant formula/law',
              'Substitute given values',
              'Compute the intermediate result',
              'None of the above'
            ];
            correctIdx = 0;
          }

          salvagedMcqs.push({
            id: `sv-${Date.now()}-${i}`,
            question: qText,
            options,
            correctAnswer: correctIdx,
            hint: 'Think about the next logical step toward the final answer.',
            explanation: 'Proceed step-by-step using the relevant formula before substituting numbers.',
            step: i + 1,
            calculationStep: undefined
          } as any);
        }
      } catch {}
      const safeSolution: SolutionSummary = { finalAnswer: '', unit: '', workingSteps: [], keyFormulas: [] };
      parsed = { mcqs: salvagedMcqs, solution: safeSolution } as any;
    }
    const ensured = (parsed as any) as { mcqs: any[]; solution: any };
    // Server-side validator to drop low-quality items and request replacements if needed
    const isMetaOption = (s: string) => /state the|substitute|compute the|none of the above/i.test(s);
    const isRecallQuestion = (q: string) => /what is the mass of|check the problem statement|refer to the statement|according to the text/i.test(q);
    if (Array.isArray(ensured.mcqs)) {
      ensured.mcqs = ensured.mcqs.filter((m: any) => {
        const q = String(m?.question || '');
        const opts = Array.isArray(m?.options) ? m.options.map((o: any) => String(o || '')) : [];
        if (isRecallQuestion(q)) return false;
        if (opts.length !== 4) return false;
        if (opts.some((o: string) => isMetaOption(o))) return false;
        return true;
      });
    }
    if (!Array.isArray(ensured.mcqs)) ensured.mcqs = [];
    if ((ensured.mcqs as any[]).length < marks) {
      try {
        const missing = Math.max(0, marks - (ensured.mcqs as any[]).length);
        const badNote = 'Replace invalid or missing steps. Rules: no recall questions, options must be numeric or formula, provide hint naming the relation and an explanation with substitution.';
        const replContent: any[] = [
          { type: 'text', text: `ProblemSummary:\n${JSON.stringify(parsedSummary).slice(0, 3000)}` },
          { type: 'text', text: `Generate ONLY ${missing} MCQs continuing the plan. ${badNote}` }
        ];
        if (hasImage) {
          for (let i = 0; i < Math.min(2, images.length); i++) {
            const img = images[i];
            replContent.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
          }
        }
        const replRes = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
          body: JSON.stringify({ response_format: { type: 'text' }, temperature: 0.1, messages: [ { role: 'user', content: replContent } ] })
        });
        if (replRes.ok) {
          const rd = await replRes.json();
          const rc = rd?.choices?.[0]?.message?.content || '';
          try {
            const rj = JSON.parse(rc) || {};
            const add = Array.isArray(rj.mcqs) ? rj.mcqs : [];
            ensured.mcqs = [ ...ensured.mcqs, ...add ].slice(0, marks);
          } catch {}
        }
      } catch {}
    }
    dbg('success parse', { mcqs: ensured?.mcqs?.length, hasSolution: !!ensured?.solution, usage });

    // Do not top-up here; step2 was instructed to return exactly 'marks'

    // Normalize MCQs: fix option shapes, clamp correctAnswer, and replace invalid letter-only options
    const normalized: MCQ[] = [] as any;
    for (let i = 0; i < (ensured.mcqs || []).length; i++) {
      const m: any = ensured.mcqs[i] || {};
      let opts = normalizeOptions(m.options) ?? normalizeOptions(m.choices) ?? null;
      if (!opts || letterOnly(opts)) {
        opts = [
          'State the relevant formula/law',
          'Substitute given values',
          'Compute the intermediate result',
          'None of the above'
        ];
      }
      let ca: any = m.correctAnswer;
      if (typeof ca !== 'number') {
        const label = String(m.correct_label || m.correct || '').trim();
        if (/^[A-Da-d]$/.test(label)) ca = label.toUpperCase().charCodeAt(0) - 65;
      }
      if (typeof ca === 'string' && /^\d+$/.test(ca)) ca = Number(ca);
      if (typeof ca !== 'number' || Number.isNaN(ca)) ca = 0;
      ca = Math.max(0, Math.min(3, ca));
      const rawHint = String(m.hint || '').trim();
      const improvedHint = rawHint && rawHint.length > 0 ? rawHint : (() => {
        const q = String(m.question || '').toLowerCase();
        if (/differentiat|derivative|rate of change/.test(q)) return 'Differentiate the relevant quantity with respect to time.';
        if (/integrat|area under|accumulate/.test(q)) return 'Integrate the known rate to recover the required quantity.';
        if (/resolve|component|incline|angle/.test(q)) return 'Resolve vectors along and perpendicular to the reference direction.';
        if (/pythag|magnitude|resultant/.test(q)) return 'Use Pythagoras on the components to find the magnitude.';
        if (/newton|force|mass|accel/.test(q)) return 'Apply F = ma along the direction of motion.';
        return 'Identify the next governing relationship and apply it before substituting values.';
      })();
      normalized.push({
        id: String(m.id || `mcq-${Date.now()}-${i}`),
        question: String(m.question || '').trim().slice(0, 500) || `Step ${i + 1}: Choose the next best action`,
        options: opts,
        correctAnswer: ca,
        hint: improvedHint.slice(0, 300),
        explanation: String(m.explanation || 'Select the option that logically progresses the solution.').slice(0, 600),
        step: Number(m.step) || (i + 1),
        calculationStep: m.calculationStep
      });
    }
    ensured.mcqs = normalized;

    // Enforce exactly 'marks' MCQs (server-side)
    ensured.mcqs = (ensured.mcqs || []);
    ensured.mcqs = ensured.mcqs.slice(0, marks);
    return respond(200, { ...ensured, usage });
  } catch (err: any) {
    try { console.error('[fn decode] exception', err); } catch {}
    return respond(500, { error: 'Server error', details: String(err?.message || err) });
  }
};

export const config = { path: '/api/ai-decode' } as const;


