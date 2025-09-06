
  ## A Level Maths Exam Decoder

  A React + Vite app that helps students work through A‑Level mechanics problems by breaking them into step‑wise multiple‑choice questions, showing hints/explanations, and summarizing the final solution. The current build simulates AI behavior; Azure services will be wired for real OCR/reasoning next.

  Design reference: [Figma design](https://www.figma.com/design/3sE8tAxfNcDZ9Dym9UR9BK/A-Level-Maths-Exam-Decoder)

  ### Features
  - Mocked AI “decoder” that turns a question into step‑wise MCQs with hints/explanations
  - Inputs: typed text, photo, or PDF (photo/PDF go through simulated extraction)
  - Dashboard with tokens, streaks, common mistakes, radar performance chart
  - Solution summary with final answer, working steps, and key formulas
  - Question history with search/filter/sort and basic stats

  ### Tech stack
  - React 18 + TypeScript, Vite
  - shadcn/ui (Radix primitives), Tailwind‑style utilities
  - Recharts for the radar chart

  ### Getting started
  1) Install dependencies
  ```bash
  npm i
  ```
  2) Start the dev server
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
    App.tsx                    // in‑app navigation state machine
    components/
      LoginPage.tsx            // mock SSO entry
      Dashboard.tsx            // stats, achievements, radar chart
      QuestionInput.tsx        // text/photo/PDF inputs + marks
      TextExtractor.tsx        // simulated OCR pipeline
      TextVerification.tsx     // user verifies/edits extracted text
      QuestionDecoder.tsx      // simulated AI: generates MCQs + solution
      MCQInterface.tsx         // step‑by‑step MCQ flow
      SolutionSummary.tsx      // final answer + working + tokens
      QuestionHistory.tsx      // searchable history
      ui/                      // shadcn components
    styles/globals.css         // theme tokens and base styles
  ```

  ### AI integration (planned)
  - OCR: Azure AI Vision Read / Azure Document Intelligence (prebuilt‑read/layout)
  - Reasoning/Generation: Azure OpenAI (gpt‑4o / gpt‑4o‑mini) to produce steps, MCQs, and a solution summary
  - The current implementation uses timers and templates to simulate these steps for UI testing

  ### License
  MIT — see `LICENSE`.
  