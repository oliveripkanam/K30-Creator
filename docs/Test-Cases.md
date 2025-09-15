## Manual Test Cases — Steps 1–2

Preconditions
- Env vars set locally in `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Providers enabled in Supabase: Google, Azure.
- Profiles table and RLS created.
- Questions + MCQ tables and RLS created (Step 2 SQL).
- Run app: `npm run dev` (http://localhost:5173).

### Step 1 — Auth + Profiles

TC-1.1 Google sign-in
- Steps:
  1) Open app → click “Continue with Google”.
  2) Select Google account and consent.
- Expected:
  - Redirects to Dashboard (no return to Login).
  - Header shows welcome name (from Google).
  - Supabase `public.profiles` has row with your `auth.users.id`, provider `google`, non-empty `display_name`, `avatar_url` set.

TC-1.2 Microsoft (Azure) sign-in
- Steps:
  1) Sign out (Dashboard → Sign Out).
  2) Click “Continue with Microsoft”. Complete login.
- Expected:
  - Redirects to Dashboard.
  - `public.profiles` has row with provider `azure`. `avatar_url` may be null; UI shows fallback image `/img/microsoft-default.png`.

TC-1.3 Session persistence
- Steps:
  1) With an active session, refresh the page (F5).
- Expected:
  - Remains on Dashboard (no flash back to Login).

Negative checks
- Using an unapproved Google account (Consent screen in Testing):
  - Should show “app not configured for account” → add as Test user or publish consent.

### Step 2 — Persist Completion & History

TC-2.1 Complete a Text question and persist
- Steps:
  1) From Dashboard → Start Decoding.
  2) Choose Text input; paste a short mechanics question; set Marks (e.g., 3) → Submit.
  3) Verify/Decode → Answer MCQs (any choices) → Continue to Solution → Finish.
  4) Go to History.
- Expected:
  - New entry appears with correct Type (Text), Marks, Tokens, Time, and question text.
  - Supabase `public.questions` has 1 new row with your `user_id`, `source_type='text'`, `marks`, `tokens_earned>0`, `time_spent_minutes>=0`, `solution_summary` JSON.
  - Supabase `public.mcq_steps` has N rows with `question_id` matching the new question.

TC-2.2 Complete a Photo/File question and persist
- Steps:
  1) Start Decoding → upload an image/PDF (small) → proceed through Extract → Verify → Decode → Finish.
  2) Go to History.
- Expected:
  - Entry appears with Type Photo/File and cleaned `extracted_text` present (or original file name in `original_input`).
  - `public.questions.source_type` matches photo/file.

TC-2.3 History search/filter/sort
- Steps:
  1) In History, use Search to type a word from the question.
  2) Change Sort to Marks and then Tokens.
  3) Filter Type to Text/Photo/File.
- Expected:
  - List updates accordingly; no errors; empty state message shows when nothing matches.

TC-2.4 Refresh persistence
- Steps:
  1) Refresh the browser while on History.
- Expected:
  - Entries load from DB (no loss, no in-memory reliance).

Troubleshooting quick checks
- Login loop on Microsoft: ensure Azure Token configuration adds `email` claim and API permission Microsoft Graph → `User.Read` with admin consent; redirect URI exact.
- History empty after finishing: confirm Step 2 tables/policies exist; check browser console for `persist completion failed` logs.


