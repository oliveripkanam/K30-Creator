# AI Pipeline (Extract → Augment → Decode)

This app converts exam questions (text/photo/PDF/DOCX) into step‑wise MCQs and a solution summary.

## Overview
- Extract (OCR): `/api/extract` → gets plain text from images/PDF/DOC/DOCX using Azure Document Intelligence.
- Clean & Normalize: client removes exam boilerplate and fixes common OCR artefacts (fractions, whitespace).
- Augment (optional vision): `/api/augment` → merges the image and OCR text to produce a single clean statement that includes diagram labels/values without inventing facts.
- Decode (multimodal): `/api/ai-decode` → generates MCQs and a solution summary using Azure OpenAI.

## Endpoints
### 1) /api/extract (OCR)
- Service: Azure Document Intelligence (Form Recognizer)
- Env vars:
  - `AZURE_DOCINTEL_ENDPOINT`
  - `AZURE_DOCINTEL_KEY`
- Input:
```json
{ "fileBase64": "<base64>", "mimeType": "image/png|application/pdf|..." }
```
- Output:
```json
{ "text": "..." }
```
- The function tries modern and legacy API paths and parses both v3.x and v2.1 result shapes.

### 2) /api/augment (Vision rewrite)
- Service: Azure OpenAI (same deployment as decoder)
- Purpose: rewrite OCR output into a clean, single block; pull diagram values from the image if provided.
- Input:
```json
{ "text": "<OCR>", "imageBase64": "<base64>", "imageMimeType": "image/png" }
```
- Output:
```json
{ "text": "<cleaned problem statement>" }
```

### 3) /api/ai-decode (Multimodal decoder)
- Service: Azure OpenAI (o4‑mini or gpt‑4o family)
- Env vars:
  - `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`
- Input:
```json
{ "text": "<verified text>", "marks": 3, "imageBase64": "<optional>", "imageMimeType": "<optional>" }
```
- Output:
```json
{ "mcqs": [ ... ], "solution": { "finalAnswer": "...", "unit": "...", "workingSteps": ["..."], "keyFormulas": ["..."] } }
```

## Client flow
1. Input (text/photo/file)
2. If photo/file → send base64 to `/api/extract`
3. Clean/normalize (strip boilerplate, join fractions)
4. Call `/api/augment` with cleaned text + image to consolidate diagram values (fallback to cleaned text on failure)
5. Show Text Verification for edits
6. Call `/api/ai-decode` with verified text (+ image) to generate MCQs and solution

## Formatting equations
- The verification screen previews maths using HTML superscripts/subscripts transformations (e.g., `v = 3t^2 i – 6t^-1 j` becomes `v = 3t<sup>2</sup> i – 6t<sup>-1</sup> j`).
- For full LaTeX rendering, integrate KaTeX/MathJax later; current approach avoids extra deps.

## Notes
- Vision grounding is optional but improves questions involving diagrams (inclines, pulleys, geometry).
- OCR cleanup is subject-agnostic and avoids removing content‑like lines (math, units, formulae).
- All endpoints return JSON; UI gracefully falls back to mocks on failures.
