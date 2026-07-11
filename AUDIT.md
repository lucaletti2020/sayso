# TalktheTalk — Codebase Audit

Date: 10 July 2026 · Auditor: Claude Code

## 1. Architecture summary

**Product**: TalktheTalk (talkthetalk.app) — personalised English courses built from a
LinkedIn profile. Onboarding chat → course of 12 curriculum units (or dynamic
scenarios) → per-unit sessions: Pronunciation (Azure assessment), Grammar &
Vocabulary quiz, AI voice conversation (Vapi) → feedback + dashboard.

**Stack**
- **Framework**: Next.js 16 (App Router, Turbopack), React 19, TypeScript (strict), Tailwind v4 + shadcn-style UI components.
- **Auth**: NextAuth v5 (beta) with Google OAuth, Prisma adapter, DB sessions. Route protection via `src/proxy.ts` (Next 16 proxy convention, Node runtime).
- **Database**: Supabase Postgres via Prisma 7 (`@prisma/adapter-pg` + `pg`). Migrations in `prisma/migrations` (several hand-written + `migrate deploy`).
- **Storage**: Supabase Storage (`practice-audio` bucket) for TTS MP3s.
- **AI services**:
  - Azure OpenAI (chat deployment `gpt-5.4english`) — all generation prompts (`src/lib/prompts.ts`).
  - Azure Speech — TTS (`src/lib/tts.ts`) and Pronunciation Assessment (REST).
  - Vapi — live voice conversation (transient assistant, client SDK).
  - Exa — LinkedIn profile content retrieval.
- **Email**: Resend (welcome, feedback-ready, re-engagement); re-engagement runs via Vercel Cron (`vercel.json`, daily 09:00 UTC).
- **Deploy**: Vercel, auto-deploy from GitHub `main`. Build = `prisma generate && next build`.

**Entry points / flows**
- `src/app/page.tsx` — public onboarding chat (LinkedIn → adaptive questions → level → native language → curriculum match → course generation). `?new=1` re-runs it for an additional course.
- `src/app/(app)/*` — authenticated shell (sidebar/mobile drawer): `home` (course list or single course), `course/[id]`, `scenario/[id]` (unit hub) + `pronunciation`, `grammar` (quiz), `simulation` (Vapi), `feedback/[timestamp]`, `dashboard`, `profile`.
- `src/app/api/*` — route handlers: onboarding pipeline, per-scenario content generation (sentences/quiz/simulation-prompt/feedback), audio, pronunciation assessment, dashboard, cron.
- **Data model** (`prisma/schema.prisma`): `User` 1—N `Course` 1—N `ScenarioGroup` 1—N `Scenario` (objectives JSON, cached `simulationPrompt`, `grammarQuiz`) 1—N `PracticeSentence` / `UserAttempt`; reference tables `CurriculumUnit`/`CurriculumScenario` (seeded from `prisma/data/curriculum.csv` by `scripts/seed-curriculum.mjs`).

**Configs**: `next.config.ts` (empty), `tsconfig.json` (strict), `eslint.config.mjs` (next defaults), `prisma.config.ts` (loads `.env.local`), `vercel.json` (cron). No tests and no CI beyond Vercel build at audit start.

---

## 2. Issues found

### Critical
- **C1 — SSRF / weak URL validation** · `src/app/api/onboarding/linkedin/route.ts:57`
  Validation is `url.includes("linkedin.com")`, so `https://evil.com/?x=linkedin.com` passes; the server then fetches the attacker URL and forwards it to Exa. Unauthenticated endpoint. → Strict parse: require https + hostname `linkedin.com`/`*.linkedin.com`.

### High
- **H1 — Cron endpoint fails open** · `src/app/api/cron/reengagement/route.ts:10`
  `if (secret && ...)` skips auth entirely when `CRON_SECRET` is unset → anyone can trigger mass re-engagement emails. → Fail closed.
- **H2 — Onboarding fetch chains without error handling** · `src/app/page.tsx`
  The auth/status check has no `.catch` → a network hiccup leaves the page on an infinite loader. `processLinkedIn`, `fetchNextQuestion`, `loadModules`, `runCurriculum`, `runGeneration` `await fetch` without try/catch → network errors throw unhandled rejections and freeze the chat in a busy state. → Wrap with error handling that returns the user to an actionable step.
- **H3 — Dev StrictMode double-fires resume generation** · `src/app/page.tsx`
  The sign-in resume effect can run twice (React StrictMode) and create two courses. → One-shot ref guard.
- **H4 — HTML injection into transactional email** · `src/lib/email.ts:44,62–65,78`
  User display name (attacker-controllable via Google profile) and model-generated scenario titles are interpolated raw into email HTML. → Escape interpolated values.
- **H5 — Vulnerable/unused dependencies** · `package.json`
  `microsoft-cognitiveservices-speech-sdk` (unused — Speech is called via REST) transitively carries all 7 moderate `npm audit` findings; `@azure/openai` and `@supabase/ssr` are also unused. → Remove.
- **H6 — Unvalidated model output can 500 the feedback route** · `src/app/api/scenario/feedback/route.ts:60`
  Scores from model JSON aren’t coerced to numbers (`NaN` → Prisma float error); `max_completion_tokens: 800` risks truncated JSON now that feedback is written in the learner’s native language. → `Number()` coercion + raise token cap.
- **H7 — `cefrGuidance()` throws on invalid band** · `src/lib/cefr.ts:67`
  `CEFR[band]` is unguarded; an invalid band string (from stored JSON) becomes a TypeError. → Fallback to B1.

### Technical debt
- **T1** Duplicated `playCorrect`/`playWrong` + `wordColor` in `grammar/page.tsx` and `pronunciation/page.tsx` → extract shared module.
- **T2** Dead code: `GET /api/scenario/feedback` has no callers (feedback page reads Prisma directly) → remove. `api/scenario/realtime-session` is intentionally parked Azure-Realtime code (kept per docs/) — leave.
- **T3** 12 ESLint errors: unescaped apostrophes (×6), `<a href="/">` instead of `<Link>`, `setState`-in-effect (×3, hook-pattern warnings), use-before-declare (×2 — hoisted function declarations, safe at runtime).
- **T4** `src/app/page.tsx` (~700 lines) mixes chat UI, onboarding state machine, and generation orchestration → needs decomposition.
- **T5** Dashboard aggregates groups/attempts across ALL courses (“Progress by topic” mixes courses) — needs a per-course product decision.
- **T6** Onboarding APIs (`linkedin`, `questions`, `modules`, `match`) are unauthenticated by design (pre-login onboarding) → unmetered LLM/Exa cost-abuse vector; no rate limiting anywhere.
- **T7** No tests at all. Highest-value starting point: pure libs (`quiz.sanitizeQuiz`, `cefr`, `objectives`).
- **T8** `@types/pg` listed under `dependencies` (belongs in `devDependencies`).
- **T9** Local `.env` duplicates `DATABASE_URL` from `.env.local` (both untracked; recommend deleting `.env` locally to avoid divergence).
- **T10** No concurrency guard on sentence/quiz generation — two parallel first requests could double-generate (single-user product: low likelihood). Suggested: unique constraint or advisory lock.

## 3. Fixes applied (one commit each)

| Issue | Fix | Commit |
|---|---|---|
| C1 | Strict LinkedIn URL parsing (`parseLinkedInUrl`: https + exact/`*.linkedin.com` host) in `src/app/api/onboarding/linkedin/route.ts` | `fix: strict LinkedIn URL validation to prevent SSRF` |
| H1 | `src/app/api/cron/reengagement/route.ts` now rejects when `CRON_SECRET` is missing | `fix: cron re-engagement endpoint fails closed without CRON_SECRET` |
| H2 | All 6 onboarding fetch sites in `src/app/page.tsx` recover to an actionable step (status check `.catch`, try/catch around linkedin ×2, questions, modules, generate-course, generate-scenarios) | `fix: onboarding survives network errors; guard resume against double-fire` |
| H3 | `resumeFiredRef` one-shot guard on the sign-in resume path (same commit as H2) | ↑ |
| H4 | `esc()` applied to name/scenario-title interpolations in `src/lib/email.ts` | `fix: escape user/model-provided values in transactional email HTML` |
| H5 | Removed `@azure/openai`, `microsoft-cognitiveservices-speech-sdk`, `@supabase/ssr`; `@types/pg` → devDeps | `chore: remove unused deps` |
| H6 | Score coercion to finite 0–100 + token cap 800→1200 in `src/app/api/scenario/feedback/route.ts` | `fix: harden model-output handling` |
| H7 | `cefrGuidance` falls back to B1 on invalid band (`src/lib/cefr.ts:68`) | ↑ (same commit) |
| T1 | Extracted `src/lib/feedback-fx.ts` (playCorrect/playWrong/wordColor); quiz + pronunciation pages import it | `refactor: extract shared feedback sounds/word colors` |
| T2 | Removed dead `GET /api/scenario/feedback` | `chore: remove dead GET /api/scenario/feedback` |
| T3 | Fixed 7 of 12 lint errors (unescaped entities ×6, logo `<a>` → `<Link>`) | `chore: fix mechanical lint errors` |
| T7 | Added `npm test` (node:test + tsx): 7 characterization tests for `cefr`, `quiz`, `objectives` | `test: add characterization tests for pure libs` |

### Behavioral changes — needs review
- **H1**: if `CRON_SECRET` is not set in the Vercel env, the daily re-engagement cron now returns 401 instead of running. ✅ Confirmed set in Vercel production (11 Jul 2026) — no action needed.
- **T2**: `GET /api/scenario/feedback` removed — it had no callers in the app; only external consumers (none known) would notice.
- No other API contracts, schemas, or user-visible behaviors changed.

## 4. Deferred (needs product/infra decision)

- **T6 — Unauthenticated onboarding APIs / no rate limiting** (`linkedin`, `questions`, `modules`, `match`): pre-login onboarding is a product feature, but these endpoints spend Azure OpenAI/Exa money per call and can be scripted. Suggested: IP-based rate limiting (Vercel WAF rules or Upstash Ratelimit), or move onboarding behind sign-in.
- **Remaining 5 npm-audit moderates**: transitive in `prisma` (`@hono/node-server` — dev tooling) and `next` (nested `postcss` — build-time). Fixes require major version changes; neither is runtime-reachable. Revisit on the next framework upgrade.
- **T4 — `src/app/page.tsx` (~750 lines)**: onboarding chat UI + state machine + generation orchestration in one client component. Suggested: extract a `useOnboarding` hook + smaller step components — do it with a browser-test pass, not blind.
- **T5 — Dashboard mixes all courses**: "Progress by topic" aggregates every course's groups. Decide: per-course filter or overall view.
- **T10 — Generation race**: two concurrent first requests to sentences/quiz for the same scenario could double-generate. Low likelihood (single user). Suggested: unique constraint + upsert, or a `pg_advisory_xact_lock` on scenarioId.
- **Remaining 5 lint errors**: 3× `react-hooks/set-state-in-effect` (drawer close-on-navigate, quiz celebration, pronunciation session reset — established patterns; refactoring risks behavior for zero user value) and 2× "use before declare" false positives (hoisted function declarations referenced by an effect defined above them).
- **T9**: delete the local `.env` (duplicates `DATABASE_URL` from `.env.local`; both untracked).

## 5. Verification & recommendations

**Before → after**
- Type check: PASS → PASS (`npx tsc --noEmit`)
- Tests: none → **7/7 pass** (`npm test`)
- Production build: PASS → PASS (`next build`)
- ESLint: 12 errors → **5** (remaining documented above)
- `npm audit` (prod deps): 7 moderate → **5 moderate** (all transitive build-time; see Deferred)
- Secrets scan of tracked files: clean (env files untracked, no keys in git history)

**Prioritized recommendations**
1. Add rate limiting to the unauthenticated onboarding endpoints (cost exposure — highest remaining risk).
2. Split `src/app/page.tsx` into a hook + step components, with a Playwright smoke test of the onboarding chat first.
3. Decide dashboard behavior for multi-course users and add a per-course view.
4. Extend the test suite to API routes (mock Prisma/OpenAI) — start with `sentences` and `quiz` validation paths, whose pure helpers are already under test.
5. Add CI (GitHub Action: `tsc`, `eslint`, `npm test`, `next build`) so these gates run on every push.
