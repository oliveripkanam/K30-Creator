import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';

interface Question {
  id: string;
  content: string;
  extractedText?: string;
  marks: number;
  type: 'photo' | 'file' | 'text';
  timestamp: Date;
  fileData?: { base64: string; mimeType: string; name: string };
  subject?: string;
  syllabus?: string;
  level?: string;
}

interface MCQ {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number;
  hint: string;
  explanation: string;
  step: number;
  calculationStep?: {
    formula?: string;
    substitution?: string;
    result?: string;
  };
}

interface SolutionSummary {
  finalAnswer: string;
  unit: string;
  workingSteps: string[];
  keyFormulas: string[];
}

interface QuestionDecoderProps {
  question: Question;
  onDecoded: (mcqs: MCQ[], solution: SolutionSummary) => void;
  onBack: () => void;
}

export function QuestionDecoder({ question, onDecoded, onBack }: QuestionDecoderProps) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  // -----------------------------
  // Hint improvement utilities
  // -----------------------------
  const isWeakHint = (hint?: string): boolean => {
    if (!hint) return true;
    const h = hint.trim();
    if (h.length < 12) return true;
    const genericBits = ['consider', 'think about', 'recall', 'maybe', 'try', 'reflect'];
    return genericBits.some((g) => h.toLowerCase().includes(g));
  };

  const deriveHintFromCalc = (mcq: MCQ): string | null => {
    const calc = mcq.calculationStep;
    if (!calc) return null;
    if (calc.formula && calc.substitution) {
      return `Use ${calc.formula} and substitute: ${calc.substitution}.`;
    }
    if (calc.formula) return `Start with ${calc.formula}. Identify knowns, then substitute.`;
    if (calc.substitution) return `Substitute given values: ${calc.substitution}.`;
    return null;
  };

  const deriveHintFromQuestion = (mcq: MCQ, q: Question): string | null => {
    const text = `${q.extractedText || q.content} ${mcq.question}`.toLowerCase();
    const stem = String(mcq.question || '');
    const isConceptualLikely = !/[=0-9]/.test(stem) && /(what is|which of the following|define|best describes|identify|classify)/i.test(stem);

    // Generic definitional/classification hints (subject-agnostic)
    if (isConceptualLikely) {
      // Try to extract concept and context: "What is the X in Y?"
      const m1 = stem.match(/what is (?:the |an )?([^?]+?)(?: in ([^?]+))?\?/i);
      const m2 = stem.match(/which (?:of the following )?(?:is|are) (?:the |an )?([^?]+?)(?: in ([^?]+))?\?/i);
      const concept = (m1?.[1] || m2?.[1] || '').trim();
      const context = (m1?.[2] || m2?.[2] || '').trim();
      if (concept && context) {
        return `Recall the definition of “${concept}” in “${context}”; choose the option that states it.`;
      }
      if (concept) {
        return `Recall the syllabus definition of “${concept}”; pick the option that states it.`;
      }
      return 'Use the syllabus definition of the asked term; choose the option that states it.';
    }

    // Biology / conceptual cues
    if (/(short\-term|long\-term|effect|risk|symptom|cause|mechanism|process)/.test(text)) {
      if (/short\-term/.test(text)) return 'Focus on immediate physiological or behavioral effects (hours to days).';
      if (/long\-term/.test(text)) return 'Think chronic risks that develop over months or years.';
      return 'Identify the category (short-term vs long-term) and pick one clear, syllabus-valid fact.';
    }
    // General quantitative cues
    if (text.includes('velocity') || text.includes('speed')) return 'Identify knowns, then pick the relation linking them to the asked quantity.';
    if (text.includes('force') || text.includes('mass') || text.includes('acceleration')) return 'Link given quantities with one governing relation before computing.';
    if (text.includes('concentration') || text.includes('mole') || text.includes('ph')) return 'Match the asked quantity to the formula that directly relates your knowns.';
    if (text.includes('graph') || text.includes('table')) return 'Read the axis/headers for the needed variable and use the nearest relation.';
    return null;
  };

  const deriveHintFromOptions = (mcq: MCQ): string | null => {
    const opts = mcq.options || [];
    const hasFormula = opts.some(o => /formula|law|equation/i.test(o));
    const hasSub = opts.some(o => /substitute|plug|insert/i.test(o));
    const hasCompute = opts.some(o => /compute|calculate|evaluate/i.test(o));
    if (hasFormula && hasSub) return 'First choose the governing relation, then substitute known values.';
    if (hasSub && hasCompute) return 'Substitute the given values before computing the result.';
    if (hasFormula) return 'Select the relation that directly connects given to target.';
    return null;
  };

  const strengthenHint = (mcq: MCQ, q: Question): string => {
    const fromCalc = deriveHintFromCalc(mcq);
    if (fromCalc) return fromCalc;
    const fromQ = deriveHintFromQuestion(mcq, q);
    if (fromQ) return fromQ;
    const fromOpts = deriveHintFromOptions(mcq);
    if (fromOpts) return fromOpts;
    // Non-generic fallback: echo stem concept without revealing answer
    const stem = String(mcq.question || '').replace(/\s+/g, ' ').trim();
    const m = stem.match(/what is (?:the |an )?([^?]+?)\?/i) || stem.match(/which of the following.*?\?/i) || stem.match(/define ([^?]+?)\?/i);
    if (m && m[1]) {
      const concept = m[1].trim();
      return `Hint: recall the syllabus meaning of “${concept}” and select the matching statement.`;
    }
    return 'Hint: focus on the key term in the question and recall its syllabus definition.';
  };

  const improveHints = (mcqs: MCQ[], q: Question): MCQ[] => {
    const used = new Set<string>();
    const normalize = (s: string) => s.trim().toLowerCase();
    const altHintFor = (mcq: MCQ): string => {
      const text = `${q.extractedText || q.content} ${mcq.question}`.toLowerCase();
      if (/long\-term|chronic/.test(text)) return 'Hint: unlike short-term effects, cite one chronic risk (months–years).';
      if (/short\-term|acute/.test(text)) return 'Hint: pick one immediate effect (hours–days), not a chronic outcome.';
      // Definitional stems: add discriminative cue
      const stem = String(mcq.question || '');
      if (/(what is|define|best describes|identify)/i.test(stem)) {
        const m = stem.match(/what is (?:the |an )?([^?]+?)(?: in ([^?]+))?\?/i);
        const concept = (m?.[1] || '').trim();
        const context = (m?.[2] || '').trim();
        if (concept && context) return `Hint: key attribute of “${concept}” in “${context}” (not a function).`;
        if (concept) return `Hint: key attribute of “${concept}” (structure/property, not its use).`;
      }
      return 'Hint: use a key attribute or mechanism to eliminate common distractors.';
    };
    let contrastBudget = Math.floor(mcqs.length / 3);
    const hasContrast = (s: string) => /\bunlike\b|\bvs\b/i.test(String(s || ''));
    return mcqs.map((m) => {
      let hint = isWeakHint(m.hint) ? strengthenHint(m, q) : String(m.hint || '').trim();
      const key = normalize(hint);
      if (used.has(key)) {
        hint = altHintFor(m);
      }
      if (hasContrast(hint)) {
        if (contrastBudget > 0) {
          contrastBudget--;
        } else {
          // convert contrast to attribute/mechanism phrasing
          const noContrast = hint.replace(/[,;]?\s*(unlike|vs)\b[\s\S]*$/i, '').trim();
          hint = noContrast && noContrast.length > 8
            ? `${noContrast}. Use a key attribute or mechanism to decide.`
            : 'Hint: look for a key attribute or mechanism to eliminate distractors.';
        }
      }
      used.add(normalize(hint));
      return { ...m, hint };
    });
  };

  const steps = [
    'Analyzing question content...',
    'Identifying key concepts...',
    'Breaking down into logical steps...',
    'Generating multiple choice questions...',
    'Creating hints and explanations...',
    'Finalizing step-by-step guide...'
  ];

  useEffect(() => {
    let cancelled = false;
    // Show each step for ~3s for a smoother, predictable cadence
    const stepDuration = 3000;
    let currentIndex = 0;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (currentIndex < steps.length) {
        setCurrentStep(steps[currentIndex]);
        setProgress(((currentIndex + 1) / steps.length) * 100);
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, stepDuration);

    // Start decoding immediately (in parallel) and finish when ready
    const decode = async () => {
      try {
        console.log('[decoder] POST /api/ai-decode');
        // Helpers for PDF (first 2 pages) and DOCX (plain text)
        const renderPdfFirstTwoPagesToImages = async (base64: string): Promise<string[]> => {
          try {
            const { getDocument, GlobalWorkerOptions }: any = await import('pdfjs-dist');
            const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
            (GlobalWorkerOptions as any).workerSrc = workerUrl;
            const raw = atob(base64);
            const len = raw.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) bytes[i] = raw.charCodeAt(i);
            const pdf = await getDocument({ data: bytes }).promise;
            const pageCount = Math.min(2, pdf.numPages || 0);
            const outputs: string[] = [];
            for (let p = 1; p <= pageCount; p++) {
              const page = await pdf.getPage(p);
              const viewport = page.getViewport({ scale: 1.25 });
              const targetW = 900;
              const scale = Math.min(2.0, targetW / viewport.width);
              const v2 = page.getViewport({ scale });
              const canvas = document.createElement('canvas');
              canvas.width = Math.floor(v2.width);
              canvas.height = Math.floor(v2.height);
              const ctx = canvas.getContext('2d');
              if (!ctx) continue;
              await page.render({ canvasContext: ctx as any, viewport: v2 }).promise;
              const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
              const idx = dataUrl.indexOf(',');
              outputs.push(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
            }
            return outputs;
          } catch {
            return [];
          }
        };
        // Downscale/compress raw image uploads to reduce payload
        const compressImageBase64 = async (base64: string, mime: string): Promise<string> => {
          try {
            const img = new Image();
            img.src = `data:${mime};base64,${base64}`;
            await new Promise((resolve, reject) => { img.onload = resolve as any; img.onerror = reject as any; });
            const maxW = 768; // tighter target width to reduce payload size
            const scale = Math.min(1, maxW / (img.width || maxW));
            const w = Math.max(1, Math.floor((img.width || maxW) * scale));
            const h = Math.max(1, Math.floor((img.height || maxW) * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return base64;
            ctx.drawImage(img, 0, 0, w, h);
            const out = canvas.toDataURL('image/jpeg', 0.5);
            const idx = out.indexOf(',');
            return idx >= 0 ? out.slice(idx + 1) : out;
          } catch {
            return base64;
          }
        };
        const extractDocxPlainText = async (base64: string): Promise<string> => {
          try {
            const mammoth: any = await import('mammoth');
            // Convert base64 -> ArrayBuffer
            const binary = atob(base64);
            const buf = new ArrayBuffer(binary.length);
            const view = new Uint8Array(buf);
            for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
            const { value } = await mammoth.extractRawText({ arrayBuffer: buf });
            return String(value || '').trim();
          } catch {
            return '';
          }
        };

        // Build single-call decode payload with optional text and images[]
        const images: Array<{ base64: string; mimeType: string }> = [];
        let textForDecode = question.type === 'text' ? (question.extractedText || question.content) : (question.extractedText || '');
        // Trim very long text to keep server requests under gateway timeouts
        if (textForDecode && textForDecode.length > 6000) {
          textForDecode = textForDecode.slice(0, 6000);
        }
        if (question.fileData?.base64 && question.fileData?.mimeType) {
          const mime = question.fileData.mimeType.toLowerCase();
          if (mime.startsWith('image/')) {
            const b64 = await compressImageBase64(question.fileData.base64, question.fileData.mimeType);
            images.push({ base64: b64, mimeType: 'image/jpeg' });
          } else if (mime === 'application/pdf' || question.fileData.name.toLowerCase().endsWith('.pdf')) {
            const imgs = await renderPdfFirstTwoPagesToImages(question.fileData.base64);
            for (const b64 of imgs) images.push({ base64: b64, mimeType: 'image/jpeg' });
          } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword' || question.fileData.name.toLowerCase().endsWith('.docx') || question.fileData.name.toLowerCase().endsWith('.doc')) {
            const rawText = await extractDocxPlainText(question.fileData.base64);
            if (rawText) textForDecode = rawText;
          }
        }
        const payload: any = {
          text: textForDecode,
          images: images.length ? images : undefined,
          marks: Math.min(8, Math.max(1, question.marks)),
          subject: question.subject,
          syllabus: question.syllabus,
          level: question.level,
        };
        let res = await fetch('/api/ai-decode', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload)
        });
        console.log('[decoder] /api/ai-decode status', res.status);
        // Keep only primary path and one Netlify fallback
        if (res.status === 404) {
          console.log('[decoder] trying /.netlify/functions/ai-decode');
          res = await fetch('/.netlify/functions/ai-decode', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
          });
          console.log('[decoder] /.netlify/functions/ai-decode status', res.status);
        }
        if (res.ok) {
          const data = await res.json();
          console.log('[decoder] response ok; keys', Object.keys(data || {}));
          if (data?.usage) console.log('[decoder] token usage:', data.usage);
          if (Array.isArray(data.mcqs) && data.solution) {
            // Enforce MCQ count equals marks (no placeholder wording)
            let mcqsOut = Array.isArray(data.mcqs) ? data.mcqs.slice(0) : [];
            const need = Math.max(0, Math.min(8, question.marks) - mcqsOut.length);
            if (need > 0) {
              const base = mcqsOut.length;
              for (let i = 0; i < need; i++) {
                const stepNum = base + i + 1;
                mcqsOut.push({
                  id: `client-fill-${Date.now()}-${i}`,
                  question: `Step ${stepNum} — choose the next concrete action toward the solution.`,
                  options: [
                    'State the relevant formula/law',
                    'Substitute given values',
                    'Compute the intermediate result',
                    'None of the above'
                  ],
                  correctAnswer: 0,
                  hint: 'State the governing relation first (e.g., F=ma, T=mg±ma, v=u+at), then proceed.',
                  explanation: 'Using the correct governing formula at each step is essential before substitution and computation.',
                  step: stepNum,
                  calculationStep: undefined
                });
              }
            }

            // Normalize solution object to guarantee arrays/strings
            let transformedSolution: any = {
              finalAnswer: '',
              unit: '',
              workingSteps: [],
              keyFormulas: [],
            };
            const sol: any = data.solution || {};
            if (typeof sol.finalAnswer === 'object' && sol.finalAnswer) {
              transformedSolution.finalAnswer = Object.entries(sol.finalAnswer).map(([k, v]) => `${k}: ${v}`).join(', ');
            } else {
              transformedSolution.finalAnswer = String(sol.finalAnswer || '');
            }
            transformedSolution.unit = String(sol.unit || '');
            transformedSolution.workingSteps = Array.isArray(sol.workingSteps) ? sol.workingSteps : [];
            transformedSolution.keyFormulas = Array.isArray(sol.keyFormulas) ? sol.keyFormulas : [];
            // Improve weak/missing hints for all steps
            mcqsOut = improveHints(mcqsOut, question);

            // Deduplicate by question+options+answer and renumber steps sequentially
            const unique = new Map<string, typeof mcqsOut[number]>();
            for (const m of mcqsOut) {
              const isFiller = String(m.id || '').startsWith('client-fill-');
              if (isFiller) {
                unique.set(`${m.id}`, m); // keep all fillers distinct
              } else {
                const key = `${String(m.question || '').trim().toLowerCase()}|${(m.options || []).join('||')}|${m.correctAnswer}`;
                if (!unique.has(key)) unique.set(key, m);
              }
            }
            mcqsOut = Array.from(unique.values());
            mcqsOut = mcqsOut.slice(0, Math.min(8, question.marks)).map((m, idx) => ({ ...m, step: idx + 1 }));

            if (!cancelled) {
              setProgress(100);
              setIsComplete(true);
              onDecoded(mcqsOut, transformedSolution);
            }
            return;
          }
        } else {
          try {
            const errorData = await res.json();
            console.error('[decoder] error response', res.status, errorData);
          } catch {
            const errorText = await res.text();
            console.error('[decoder] error response', res.status, errorText);
          }
        }
      } catch {}

      // Fallback
      if (!cancelled) {
        console.warn('[decoder] falling back to local mock generation');
        let { mcqs: generatedMCQs, solution } = generateSolutionMCQs(question);
        generatedMCQs = improveHints(generatedMCQs, question);
        setProgress(100);
        setIsComplete(true);
          onDecoded(generatedMCQs, solution);
      }
    };

    decode();

    return () => { cancelled = true; clearInterval(interval); };
  }, [question]);

  const generateSolutionMCQs = (q: Question): { mcqs: MCQ[], solution: SolutionSummary } => {
    // Analyze question content to generate solution-oriented MCQs
    const questionText = (q.extractedText || q.content).toLowerCase();
    const isProjectileMotion = questionText.includes('thrown') || questionText.includes('projectile') || questionText.includes('trajectory') || questionText.includes('launched');
    const isForces = questionText.includes('force') || questionText.includes('friction') || questionText.includes('tension') || questionText.includes('incline');
    const isMomentum = questionText.includes('momentum') || questionText.includes('collision') || questionText.includes('impact');
    const isEnergy = questionText.includes('energy') || questionText.includes('kinetic') || questionText.includes('potential') || questionText.includes('spring');

    let mcqTemplates: any[] = [];
    let solutionData: SolutionSummary;

    // Generate solution-oriented MCQs that lead to final answers
    if (isProjectileMotion) {
      mcqTemplates = [
        {
          question: "Given: A ball is thrown horizontally from a 20m high cliff with initial velocity 15 m/s. What information do we need to find the time of flight?",
          options: [
            "Only the horizontal velocity",
            "Only the height and gravity",
            "Both initial velocity and height",
            "Just the final position"
          ],
          correctAnswer: 1,
          hint: "Time of flight depends only on vertical motion. The horizontal velocity doesn't affect fall time.",
          explanation: "For projectile motion, time of flight is determined by vertical motion: t = √(2h/g). We need height (20m) and gravity (9.8 m/s²).",
          calculationStep: {
            formula: "t = √(2h/g)",
            substitution: "t = √(2 × 20 / 9.8)",
            result: "t = 2.02 s"
          }
        },
        {
          question: "Now calculate the horizontal distance traveled using the time of flight t = 2.02s and horizontal velocity vₓ = 15 m/s:",
          options: [
            "Range = 30.3 m",
            "Range = 25.5 m", 
            "Range = 35.0 m",
            "Range = 20.0 m"
          ],
          correctAnswer: 0,
          hint: "Use Range = vₓ × t, where vₓ is constant horizontal velocity.",
          explanation: "Range = horizontal velocity × time = 15 × 2.02 = 30.3 m",
          calculationStep: {
            formula: "Range = vₓ × t",
            substitution: "Range = 15 × 2.02",
            result: "Range = 30.3 m"
          }
        },
        {
          question: "What is the final vertical velocity when the ball hits the ground?",
          options: [
            "vᵧ = -19.8 m/s",
            "vᵧ = -15.0 m/s",
            "vᵧ = -25.2 m/s",
            "vᵧ = 0 m/s"
          ],
          correctAnswer: 0,
          hint: "Use vᵧ = gt, where g = 9.8 m/s² and t = 2.02s. The negative indicates downward direction.",
          explanation: "Final vertical velocity: vᵧ = gt = 9.8 × 2.02 = 19.8 m/s downward (negative)",
          calculationStep: {
            formula: "vᵧ = gt",
            substitution: "vᵧ = 9.8 × 2.02",
            result: "vᵧ = -19.8 m/s"
          }
        }
      ];
      
      solutionData = {
        finalAnswer: "30.3",
        unit: "meters (horizontal range)",
        workingSteps: [
          "Given: h = 20m, vₓ = 15 m/s, g = 9.8 m/s²",
          "Find time of flight: t = √(2h/g) = √(2×20/9.8) = 2.02 s",
          "Calculate horizontal range: Range = vₓ × t = 15 × 2.02 = 30.3 m",
          "Final vertical velocity: vᵧ = gt = 9.8 × 2.02 = 19.8 m/s downward"
        ],
        keyFormulas: [
          "t = √(2h/g)",
          "Range = vₓ × t", 
          "vᵧ = gt"
        ]
      };
    } else if (isForces) {
      mcqTemplates = [
        {
          question: "A 10kg block slides down a 30° incline with friction coefficient μ = 0.2. What is the component of weight parallel to the incline?",
          options: [
            "W∥ = 49.0 N",
            "W∥ = 84.9 N", 
            "W∥ = 98.0 N",
            "W∥ = 50.0 N"
          ],
          correctAnswer: 0,
          hint: "The parallel component is mg sin θ, where θ is the incline angle.",
          explanation: "W∥ = mg sin θ = 10 × 9.8 × sin(30°) = 10 × 9.8 × 0.5 = 49.0 N",
          calculationStep: {
            formula: "W∥ = mg sin θ",
            substitution: "W∥ = 10 × 9.8 × sin(30°)",
            result: "W∥ = 49.0 N"
          }
        },
        {
          question: "Calculate the friction force opposing the motion:",
          options: [
            "f = 16.97 N",
            "f = 19.6 N",
            "f = 20.0 N", 
            "f = 15.0 N"
          ],
          correctAnswer: 0,
          hint: "Friction = μ × Normal force, where Normal force = mg cos θ",
          explanation: "f = μN = μmg cos θ = 0.2 × 10 × 9.8 × cos(30°) = 0.2 × 10 × 9.8 × 0.866 = 16.97 N",
          calculationStep: {
            formula: "f = μmg cos θ",
            substitution: "f = 0.2 × 10 × 9.8 × cos(30°)",
            result: "f = 16.97 N"
          }
        },
        {
          question: "What is the net force down the incline and the acceleration?",
          options: [
            "Net F = 32.03 N, a = 3.20 m/s²",
            "Net F = 30.0 N, a = 3.0 m/s²",
            "Net F = 35.0 N, a = 3.5 m/s²",
            "Net F = 29.0 N, a = 2.9 m/s²"
          ],
          correctAnswer: 0,
          hint: "Net force = W∥ - f, then use F = ma to find acceleration.",
          explanation: "Net F = 49.0 - 16.97 = 32.03 N down the incline. a = F/m = 32.03/10 = 3.20 m/s²",
          calculationStep: {
            formula: "F_net = W∥ - f, a = F_net/m",
            substitution: "F_net = 49.0 - 16.97 = 32.03 N, a = 32.03/10",
            result: "a = 3.20 m/s²"
          }
        }
      ];

      solutionData = {
        finalAnswer: "3.20",
        unit: "m/s² (acceleration down the incline)",
        workingSteps: [
          "Given: m = 10kg, θ = 30°, μ = 0.2, g = 9.8 m/s²",
          "Weight parallel to incline: W∥ = mg sin θ = 10 × 9.8 × sin(30°) = 49.0 N",
          "Normal force: N = mg cos θ = 10 × 9.8 × cos(30°) = 84.87 N",
          "Friction force: f = μN = 0.2 × 84.87 = 16.97 N",
          "Net force down incline: F_net = W∥ - f = 49.0 - 16.97 = 32.03 N", 
          "Acceleration: a = F_net/m = 32.03/10 = 3.20 m/s²"
        ],
        keyFormulas: [
          "W∥ = mg sin θ",
          "N = mg cos θ",
          "f = μN",
          "F_net = ma"
        ]
      };
    } else {
      // Default kinematics problem
      mcqTemplates = [
        {
          question: "A car accelerates from rest at 2.5 m/s² for 8 seconds. What information do we have?",
          options: [
            "u = 0 m/s, a = 2.5 m/s², t = 8s",
            "Only the acceleration",
            "Only the time", 
            "We need more information"
          ],
          correctAnswer: 0,
          hint: "'From rest' means initial velocity u = 0.",
          explanation: "Given: initial velocity u = 0 m/s (from rest), acceleration a = 2.5 m/s², time t = 8s",
          calculationStep: {
            formula: "Given values identified",
            substitution: "u = 0, a = 2.5 m/s², t = 8s",
            result: "Ready to calculate"
          }
        },
        {
          question: "Calculate the final velocity after 8 seconds:",
          options: [
            "v = 20 m/s",
            "v = 16 m/s",
            "v = 25 m/s",
            "v = 18 m/s"
          ],
          correctAnswer: 0,
          hint: "Use v = u + at",
          explanation: "v = u + at = 0 + 2.5 × 8 = 20 m/s",
          calculationStep: {
            formula: "v = u + at",
            substitution: "v = 0 + 2.5 × 8",
            result: "v = 20 m/s"
          }
        },
        {
          question: "Calculate the distance traveled during this acceleration:",
          options: [
            "s = 80 m",
            "s = 64 m",
            "s = 100 m",
            "s = 72 m"
          ],
          correctAnswer: 0,
          hint: "Use s = ut + ½at² or s = (u + v)t/2",
          explanation: "s = ut + ½at² = 0 × 8 + ½ × 2.5 × 8² = 0 + ½ × 2.5 × 64 = 80 m",
          calculationStep: {
            formula: "s = ut + ½at²",
            substitution: "s = 0 × 8 + ½ × 2.5 × 64",
            result: "s = 80 m"
          }
        }
      ];

      solutionData = {
        finalAnswer: "80",
        unit: "meters (distance traveled)",
        workingSteps: [
          "Given: u = 0 m/s (from rest), a = 2.5 m/s², t = 8s",
          "Final velocity: v = u + at = 0 + 2.5 × 8 = 20 m/s",
          "Distance traveled: s = ut + ½at² = 0 + ½ × 2.5 × 64 = 80 m"
        ],
        keyFormulas: [
          "v = u + at",
          "s = ut + ½at²",
          "v² = u² + 2as"
        ]
      };
    }

    const numMCQs = Math.min(q.marks, mcqTemplates.length);
    let mcqs = mcqTemplates.slice(0, numMCQs).map((template, index) => ({
      id: `mcq-${index}`,
      question: template.question,
      options: template.options,
      correctAnswer: template.correctAnswer,
      hint: template.hint,
      explanation: template.explanation,
      step: index + 1,
      calculationStep: template.calculationStep
    }));

    // Do not synthesize placeholder steps here; server handles top-up or client will enforce count after decode

    return { mcqs, solution: solutionData };
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </Button>
            <h1 className="text-xl">Decoding Question</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Question Overview */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Question Analysis</CardTitle>
              <Badge variant="secondary">{question.marks} marks</Badge>
            </div>
            <CardDescription>
              Processing your {question.type === 'text' ? 'written' : question.type} question
              {question.extractedText && question.type !== 'text' && ' (text extracted using AI)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 p-4 rounded-lg">
              {question.type !== 'text' && (
                <div className="mb-3 pb-3 border-b">
                  <p className="text-xs text-muted-foreground mb-1">Source:</p>
                  <p className="text-xs">{question.content}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Question:</p>
                <p className="text-sm">{question.extractedText || question.content}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Progress Card */}
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="flex items-center justify-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center animate-spin">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <span>AI Processing</span>
            </CardTitle>
            <CardDescription>
              Breaking down your question into step-by-step multiple choice questions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {currentStep}
              </p>

              {isComplete && (
                <div className="space-y-3">
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                    <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-green-600 font-medium">Analysis Complete!</p>
                  <p className="text-sm text-muted-foreground">
                    Generated {question.marks} step-by-step questions to guide you through the solution.
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Steps Overview */}
        <Card>
          <CardHeader>
            <CardTitle>Processing Steps</CardTitle>
            <CardDescription>AI analysis breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {steps.map((step, index) => {
                const isActive = currentStep === step;
                const isCompleted = progress > ((index + 1) / steps.length) * 100;
                
                return (
                  <div 
                    key={index} 
                    className={`flex items-center space-x-3 p-2 rounded transition-colors ${
                      isActive ? 'bg-blue-50 border border-blue-200' : 
                      isCompleted ? 'bg-green-50' : 'bg-gray-50'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      isCompleted ? 'bg-green-500' : isActive ? 'bg-blue-500' : 'bg-gray-300'
                    }`}>
                      {isCompleted ? (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-xs text-white font-medium">{index + 1}</span>
                      )}
                    </div>
                    <span className={`text-sm ${isActive ? 'font-medium text-blue-700' : 'text-gray-600'}`}>
                      {step}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}