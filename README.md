## A Level Maths Exam Decoder

React + Vite app that helps students solve A‑Level mechanics problems by turning each question into step‑wise multiple‑choice questions (MCQs) with hints/explanations and a final solution summary.

Design reference: [Figma design](https://www.figma.com/design/3sE8tAxfNcDZ9Dym9UR9BK/A-Level-Maths-Exam-Decoder)

### What’s included
- Inputs: typed text, photo, or PDF/DOCX
- OCR via Azure AI Document Intelligence (prebuilt-read, with layout/v2.1 fallbacks)
- Text augmentation (optionally vision‑assisted) via Azure OpenAI
- Decoding to MCQs + solution via Azure OpenAI
- Client + server logs with token‑usage surfaced in dev console
- Dashboard, history, tokens/streaks, radar chart

### Tech stack
- React 18 + TypeScript, Vite
- shadcn/ui (Radix primitives) + Tailwind‑style utilities
- Netlify Functions for serverless API

### Endpoints (Netlify Functions)
- `/api/extract` → Azure Document Intelligence OCR (with small in‑memory cache)
- `/api/augment` → Azure OpenAI rewrite/cleanup (multimodal text+image when provided)
- `/api/ai-decode` → Azure OpenAI MCQ + solution generation (multimodal when provided)
- `/api/health` → simple health check

See the detailed flow in `docs/AI-Pipeline.md`.

### Configuration
Netlify `netlify.toml` is set to build to `dist` and serve functions from `netlify/functions`. A redirect maps `/api/*` → `/.netlify/functions/:splat`.

Required environment variables (set in Netlify → Site settings → Environment variables):

Azure OpenAI (use your Azure OpenAI resource’s endpoint/key, not AI Foundry inference):
- `AZURE_OPENAI_ENDPOINT` (e.g. `https://<name>.openai.azure.com`)
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION` (e.g. `2024-12-01-preview`)
- `DECODER_OPENAI_DEPLOYMENT` (e.g. `gpt-4o-mini`)
- `AUGMENT_OPENAI_DEPLOYMENT` (e.g. `gpt-4o-mini`)

Azure Document Intelligence:
- `AZURE_DOCINTEL_ENDPOINT` (e.g. `https://<name>.cognitiveservices.azure.com`)
- `AZURE_DOCINTEL_KEY`

Optional:
- `DECODER_OPENAI_FALLBACK_DEPLOYMENT` (alternate non‑reasoning model)
- `DECODER_MAX_TOKENS` (default 1200; 800–2000 typical)
- `DEBUG_BYPASS_AZURE=1` (route checks only)

### Getting started
1) Install dependencies
```bash
npm i
```
2) Start dev server
```bash
npm run dev
```
3) Build for production
```bash
npm run build
```

### Project structure (high‑level)
```text
src/
  App.tsx                    // app state machine (routes between screens)
  components/
    QuestionInput.tsx        // text/photo/PDF inputs + marks
    TextExtractor.tsx        // OCR orchestrator + augmentation
    TextVerification.tsx     // user verifies/edits cleaned text
    QuestionDecoder.tsx      // Azure-backed decode + fallback
    MCQInterface.tsx         // step‑by‑step MCQ flow
    SolutionSummary.tsx      // final answer + working + tokens
    Dashboard.tsx, LoginPage.tsx, History, ui/*
netlify/functions/
  extract.ts, augment.ts, decode.ts, health.ts
```

### Notes
- Reasoning models like `o4-mini` can consume output budget as reasoning tokens and return empty content. We default to non‑reasoning `gpt‑4o‑mini` for reliability/cost.
- For OCR costs, Document Intelligence is billed per page; token logs shown in console apply to OpenAI calls only.

### License
MIT — see `LICENSE`.
