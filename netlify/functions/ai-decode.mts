import type { Context, Config } from "@netlify/functions";

type MCQ = {
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
};

type SolutionSummary = {
  finalAnswer: string;
  unit: string;
  workingSteps: string[];
  keyFormulas: string[];
};

type DecodeRequest = {
  text: string;
  marks?: number;
};

type DecodeResponse = {
  mcqs: MCQ[];
  solution: SolutionSummary;
};

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const getEnv = (key: string) => {
  try {
    // Netlify runtime env accessor
    // @ts-ignore
    return Netlify?.env?.get?.(key) ?? process.env[key];
  } catch {
    return process.env[key];
  }
};

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  let payload: DecodeRequest;
  try {
    payload = await req.json();
  } catch {
    return respond(400, { error: "Invalid JSON body" });
  }

  const text = (payload.text || "").toString().trim();
  const marks = Math.max(1, Math.min(5, Number(payload.marks ?? 3)));
  if (!text) return respond(400, { error: "Missing 'text'" });

  const rawEndpoint = (getEnv("AZURE_OPENAI_ENDPOINT") || "").trim();
  const apiKey = getEnv("AZURE_OPENAI_API_KEY") || "";
  const deployment = (getEnv("AZURE_OPENAI_DEPLOYMENT") || "").trim();
  const apiVersion = (getEnv("AZURE_OPENAI_API_VERSION") || "2024-06-01").trim();

  if (!rawEndpoint || !apiKey) {
    return respond(500, { error: "Missing Azure OpenAI endpoint or api key" });
  }

  const system = `You are an assistant that turns an A-Level mechanics problem into a step-by-step solution.
Return strictly valid JSON with keys: mcqs (array) and solution (object).
Each MCQ must have: id, question, options (4), correctAnswer (0-based), hint, explanation, step (1..N), and optional calculationStep { formula, substitution, result }.
The solution must have: finalAnswer (as a number/string), unit, workingSteps (string[]), keyFormulas (string[]).
Keep steps minimal, logical, and lead to the final answer.`;

  const user = {
    role: "user",
    content: [
      {
        type: "text",
        text: `Problem text:\n${text}\n\nNumber of steps (target): ${marks}. Output JSON only, no prose.`,
      },
    ],
  } as const;

  const buildUrl = (endpointValue: string, deploymentName: string, version: string): string => {
    const endpointNoSlash = endpointValue.replace(/\/$/, "");
    const isFull = /\/openai\/deployments\//.test(endpointNoSlash);
    try {
      if (isFull) {
        // Endpoint already includes /openai/deployments/... possibly with query
        // Ensure path ends with /chat/completions and override api-version if provided
        let full = endpointNoSlash;
        if (!/\/chat\/completions(\?|$)/.test(full)) {
          full = `${full}/chat/completions`;
        }
        const u = new URL(full);
        if (version) u.searchParams.set("api-version", version);
        return u.toString();
      }
    } catch {
      // fall through; we'll construct from base
    }
    // Construct from base resource URL
    if (!deploymentName) {
      throw new Error("Missing AZURE_OPENAI_DEPLOYMENT when using base endpoint");
    }
    return `${endpointNoSlash}/openai/deployments/${deploymentName}/chat/completions?api-version=${version}`;
  };

  let url: string;
  try {
    url = buildUrl(rawEndpoint, deployment, apiVersion);
  } catch (e: any) {
    return respond(500, { error: e?.message || "Invalid Azure OpenAI configuration" });
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          user,
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return respond(res.status, { error: "Azure error", details: body });
    }

    const data = await res.json();
    const content: string =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.delta?.content ||
      "";

    let parsed: DecodeResponse | null = null;
    try {
      parsed = JSON.parse(content);
    } catch {
      // try extracting JSON substring
      const match = content.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    if (!parsed || !Array.isArray(parsed.mcqs) || !parsed.solution) {
      return respond(502, { error: "Invalid model output", raw: content });
    }

    const limited = { ...parsed, mcqs: parsed.mcqs.slice(0, marks) };
    return respond(200, limited);
  } catch (err: any) {
    return respond(500, { error: "Server error", details: String(err?.message || err) });
  }
};

export const config: Config = {
  path: "/api/ai-decode",
};


