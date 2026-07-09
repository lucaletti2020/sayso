export const SYSTEM_ONBOARDING = `You are an expert English language coach who creates fully personalised professional English courses.
Your tone is warm, encouraging, and professional.
You communicate concisely — no long paragraphs.`;

export function profileExtractionPrompt(linkedinText: string) {
  return `Extract the following fields from this LinkedIn profile text and return ONLY valid JSON.
Fields:
- firstName (string)
- lastName (string)
- jobTitle (string)
- company (string)
- companySize (string — e.g. "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"; infer from any employee-count or company-description signals; null if unknown)
- industry (string — the industry/sector of the company they work in, e.g. "Software", "Hospitality", "Healthcare", "Financial Services", "Manufacturing"; infer from the company and role; null if unknown)
- gender ("male" or "female" — infer from the first name and any pronouns in the text; null if unclear)
- responsibilities (array of up to 5 short strings describing what they do; infer from headline, about, and experience if no explicit list)

If a field is not found, use null.

Profile text:
"""
${linkedinText}
"""`;
}

// Generates ONE onboarding question at a time so the second can adapt to the
// user's first answer. Stage 1 = types of work situations; stage 2 = a
// follow-up that digs into their specific role, based on the stage-1 answer.
export function onboardingQuestionPrompt(
  profile: {
    firstName: string;
    jobTitle: string;
    company: string;
    companySize?: string | null;
    responsibilities: string[];
  },
  stage: 1 | 2,
  priorAnswers: { question: string; answer: string }[]
) {
  const context = `You are designing a personalised English speaking course for ${profile.firstName}, a ${profile.jobTitle} at ${profile.company} (company size: ${profile.companySize ?? "unknown"}). Responsibilities: ${profile.responsibilities.length ? profile.responsibilities.join("; ") : "unknown"}.`;

  const task =
    stage === 1
      ? `Ask ONE multiple-choice question about the TYPES of work situations where this person needs to speak English.

First, think PRIVATELY (do NOT show this reasoning): what are the 5 most common situations at work that a person in THIS exact role and industry has? Base it on their job title, company, and responsibilities.

Then turn those 5 situations into the 5 options for this question.`
      : `So far they told us:
${priorAnswers.map((a) => `- ${a.question} → ${a.answer}`).join("\n")}

Now ask ONE follow-up multiple-choice question that builds on that answer to understand their specific role better — for example who exactly they talk to, or what kind of work those situations involve. Make it clearly follow from what they just said.`;

  const optionsRule =
    stage === 1
      ? "- Provide EXACTLY 5 options — one for each of the 5 most common situations you identified."
      : "- Provide 3 or 4 concrete, mutually distinct options.";

  return `${context}

${task}

Requirements:
- Specific to THIS person — never generic filler.
${optionsRule}
- Options are SHORT phrases, not full sentences (e.g. "Client calls", "Team meetings"). Do NOT start with "I" or a verb.
- Keep the question under 12 words and each option 2-5 words.
- Simple, common words — the user is not a native English speaker. No idioms or jargon.
- Do NOT ask about frequency (how often / how many times).

Return ONLY valid JSON in EXACTLY this shape:
{ "question": "string", "options": ["string", "string", "string"] }`;
}

export function moduleGenerationPrompt(profile: {
  firstName: string;
  jobTitle: string;
  company: string;
  companySize?: string | null;
  responsibilities: string[];
  answers: { question: string; answer: string }[];
}) {
  return `You are designing a personalised English speaking course for ${profile.firstName}, a ${profile.jobTitle} at ${profile.company} (company size: ${profile.companySize ?? "unknown"}).

Their responsibilities: ${profile.responsibilities.join(", ")}.

What they told us about their English needs (answers to a short questionnaire):
${profile.answers.map((a, i) => `${i + 1}. ${a.question}\n   → ${a.answer}`).join("\n")}

Propose exactly 8 course modules. Each module is a theme of professional situations in which this person speaks English at work. They are the high-level building blocks of the course — the user will pick the ones most relevant to them.

For example, the modules for a doctor might be: "Patient Consultations", "Taking Medical Histories", "Symptom Assessment & Diagnosis", "Physical Examinations", "Explaining Conditions & Test Results", "Treatment & Medication Discussions", "Procedures & Informed Consent", "Emergency & Urgent Care Situations", "Difficult Conversations", "Follow-up & Chronic Care Management".

Requirements:
- Exactly 8 modules, each clearly distinct and specific to THIS person's role and industry.
- NO repeats and no near-duplicates: every module must cover a genuinely different theme. Do not list two modules that mean the same thing or overlap heavily (e.g. never both "Explaining Concepts Clearly" and "Explaining Ideas Simply").
- Title: 2-4 words, title case, as short as possible. Use simple, common words (the user is not a native English speaker). Drop any word that is not essential.
- Description: one short, simple sentence on what kinds of conversations it covers.
- Order them roughly from most to least central to their daily work.

Return ONLY valid JSON in this exact shape:
{
  "modules": [
    { "title": "Module title", "description": "One sentence on what it covers." }
  ]
}
The "modules" array must contain exactly 8 items.`;
}

export function scenarioGenerationPrompt(profile: {
  firstName: string;
  jobTitle: string;
  company: string;
  companySize?: string | null;
  responsibilities: string[];
  answers: { question: string; answer: string }[];
  modules: { title: string; description: string }[];
  cefrBand: string;
  cefrGuidance: string;
}) {
  return `You are an expert designer of English for Specific Purposes (ESP) courses, working to CEFR standards. You are creating a personalised English speaking course for ${profile.firstName}, a ${profile.jobTitle} at ${profile.company} (company size: ${profile.companySize ?? "unknown"}).

Their responsibilities: ${profile.responsibilities.join(", ")}.

What they told us about their English needs (answers to a short questionnaire):
${profile.answers.map((a, i) => `${i + 1}. ${a.question}\n   → ${a.answer}`).join("\n")}

The learner's level:
${profile.cefrGuidance}

The user has chosen the following ${profile.modules.length} modules for their course:
${profile.modules.map((m, i) => `${i + 1}. ${m.title} — ${m.description}`).join("\n")}

For EACH chosen module, generate exactly 5 professional speaking scenarios — concrete, realistic situations in which this person would need to speak English, specific to their role and industry. Keep every scenario within the theme of its module, and calibrate every scenario to CEFR ${profile.cefrBand}.

For each scenario, define clear, measurable learning objectives:
- "title": a CLEAR, specific situation (an action or a moment), 4-6 words, simple common words (e.g. "First Call With a Prospect", "Handling a Price Objection"). No jargon or idioms.
- "description": one short, simple sentence on the situation and what they'll practise.
- "canDo": a single CEFR can-do statement this scenario practises, written for level ${profile.cefrBand} and phrased as "Can ..." (e.g. "Can politely interrupt and ask for clarification in a meeting").
- "functions": 2-4 communicative functions practised (e.g. "asking for clarification", "making polite requests", "disagreeing diplomatically").
- "grammarFocus": one key grammar point appropriate to ${profile.cefrBand} (e.g. "polite requests with could/would", "second conditional").
- "targetPhrases": 4-6 useful phrases or chunks the learner should be able to use, written at ${profile.cefrBand} level.

Return ONLY valid JSON in this exact shape, with one group per chosen module, in the same order:
{
  "groups": [
    {
      "title": "Module title (exactly as given)",
      "scenarios": [
        {
          "title": "Scenario title",
          "description": "One simple sentence.",
          "canDo": "Can ...",
          "functions": ["...", "..."],
          "grammarFocus": "...",
          "targetPhrases": ["...", "..."]
        }
      ]
    }
  ]
}
Each group must contain exactly 5 scenarios.`;
}

// Generates the pronunciation-session sentence set for a unit: 8–15 sentences
// that fit the unit's situation, use its grammar + vocabulary, cover EVERY
// grammar element, and match the learner's level.
export function sentenceGenerationPrompt(
  scenario: {
    title: string;
    description: string;
    canDo?: string | null;
    functions?: string[];
    grammarFocus?: string | null;
    vocabulary?: string | null;
    targetPhrases?: string[];
  },
  profile: {
    jobTitle: string;
    firstName?: string | null;
    company?: string | null;
    nativeLanguage?: string | null;
    cefrBand: string;
    cefrGuidance: string;
  }
) {
  const nativeLanguage = profile.nativeLanguage?.trim();
  const translationGuide =
    nativeLanguage && nativeLanguage.toLowerCase() !== "english"
      ? `For each sentence, also provide a natural translation into ${nativeLanguage} in a "translation" field.`
      : `Leave the "translation" field as an empty string.`;

  const lengthGuide: Record<string, string> = {
    A2: "Sentences must be SHORT and SIMPLE (about 5-9 words), with basic everyday vocabulary.",
    B1: "Sentences should be clear and moderately short (about 8-12 words).",
    B2: "Sentences can be fuller and more varied (about 10-16 words), with some professional nuance.",
    C1: "Sentences can be longer and more complex (about 14-22 words), with sophisticated structure and precise vocabulary.",
  };

  return `You are creating a PRONUNCIATION practice set for ${profile.firstName ? `${profile.firstName}, ` : ""}a ${profile.jobTitle}${profile.company ? ` at ${profile.company}` : ""}, preparing for this work situation:
"${scenario.title}" — ${scenario.description}
${scenario.canDo ? `Objective (can-do): ${scenario.canDo}` : ""}

This unit's language focus (from the course curriculum):
- Grammar: ${scenario.grammarFocus ?? "(none specified)"}
- Vocabulary: ${scenario.vocabulary ?? "(none specified)"}
- Functions: ${scenario.functions?.length ? scenario.functions.join("; ") : "(none specified)"}

The learner's level:
${profile.cefrGuidance}
${lengthGuide[profile.cefrBand] ?? lengthGuide["B1"]}

Your task:
1. PRIVATELY split the unit's grammar into its distinct elements (e.g. "Verb be (I am/you are); subject pronouns" has two elements: the verb be, and subject pronouns).
2. Write between 8 and 15 sentences the learner will repeat aloud. Choose the count based on grammar complexity: at least one sentence per grammar element, two or more for the harder elements. Do not pad with filler.
3. EVERY grammar element must be covered by at least one sentence — none left out.
4. Every sentence must sound like something this person would genuinely say in THIS situation, and should use the unit's vocabulary where natural.
5. PERSONAL RELEVANCE: the sentences are spoken BY the learner. ${profile.firstName ? `If a sentence involves introducing themselves or saying their name, use their real name "${profile.firstName}" — NEVER invent a name for the learner.` : "Never invent a name for the learner — write self-introductions without a name."} ${profile.company ? `Refer to their real company "${profile.company}" where a company is mentioned.` : ""}
6. Label each sentence with the grammar element it practises in a short "grammarPoint" field (3-6 words).
7. ${translationGuide}

Return ONLY valid JSON in exactly this shape:
{ "sentences": [ { "text": "the English sentence", "translation": "translation or empty string", "grammarPoint": "short label" } ] }`;
}

// Review pass: checks that a generated sentence set covers every grammar
// element of the unit. Returns the missing elements (empty when complete).
export function sentenceCoverageReviewPrompt(grammar: string, sentences: string[]) {
  return `A course unit teaches this grammar:
"${grammar}"

Here are the practice sentences generated for the unit:
${sentences.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Split the unit's grammar into its distinct elements. Then check, element by element, whether at least one sentence genuinely PRACTISES that element (uses the structure itself — not merely mentions it).

Return ONLY valid JSON:
{ "missing": ["grammar element not covered", ...] }
Return { "missing": [] } if every element is covered.`;
}

// Repair pass: generates extra sentences for grammar elements the review
// found uncovered.
export function sentenceRepairPrompt(
  scenario: { title: string; description: string },
  missing: string[],
  profile: { jobTitle: string; nativeLanguage?: string | null; cefrBand: string; cefrGuidance: string }
) {
  const nativeLanguage = profile.nativeLanguage?.trim();
  const translationGuide =
    nativeLanguage && nativeLanguage.toLowerCase() !== "english"
      ? `For each sentence, also provide a natural translation into ${nativeLanguage} in a "translation" field.`
      : `Leave the "translation" field as an empty string.`;

  return `A ${profile.jobTitle} is practising pronunciation for this work situation:
"${scenario.title}" — ${scenario.description}

The learner's level:
${profile.cefrGuidance}

These grammar elements are NOT yet covered by the practice set:
${missing.map((m, i) => `${i + 1}. ${m}`).join("\n")}

Write ONE sentence per missing element (realistic for this situation, at the learner's level, genuinely using that grammar structure). Label each with its "grammarPoint" (3-6 words). ${translationGuide}

Return ONLY valid JSON:
{ "sentences": [ { "text": "...", "translation": "...", "grammarPoint": "..." } ] }`;
}

// Meta-prompt: asks the model to WRITE the voice agent's system prompt for a
// specific scenario, strictly following the fixed two-user-turn format.
export function simulationPromptBuilderPrompt(
  profile: { firstName: string; jobTitle: string; company: string; englishLevel?: string | null },
  scenario: {
    title: string;
    description: string;
    canDo?: string | null;
    functions?: string[];
  }
) {
  const level = profile.englishLevel ?? "Intermediate";
  const levelSpeech: Record<string, string> = {
    beginner:
      "The user is a BEGINNER in English. Speak SLOWLY and clearly, with small pauses between sentences. Use short, simple sentences, basic everyday vocabulary, and simple grammar. Avoid idioms, phrasal verbs, and complex structures.",
    intermediate:
      "The user is at an INTERMEDIATE level. Speak SLOWLY and clearly, at a relaxed, unhurried pace. Use common, everyday vocabulary and straightforward sentences. Go easy on idioms and rare words.",
    "upper intermediate":
      "The user is UPPER INTERMEDIATE. Speak at a natural pace. You can use a good range of vocabulary and varied sentence structures, with the occasional idiom.",
    advanced:
      "The user is ADVANCED. Speak naturally at a normal pace. Feel free to use rich vocabulary, idiomatic expressions, and more complex sentence structures.",
  };
  const speechGuidance = levelSpeech[level.toLowerCase()] ?? levelSpeech["intermediate"];

  return `You are designing the system prompt for an AI voice agent. The agent will role-play a short English speaking practice call with ${profile.firstName}, who is a ${profile.jobTitle} at ${profile.company}. The user's English level is ${level}.

The scenario to practise is:
"${scenario.title}" — ${scenario.description}
${scenario.canDo ? `\nLearning objective (can-do): ${scenario.canDo}` : ""}${scenario.functions?.length ? `\nFunctions the learner should practise: ${scenario.functions.join(", ")}` : ""}

Design the conversation so it naturally gives ${profile.firstName} the chance to practise that objective and those functions.

First, decide which character the AI should play. ${profile.firstName} is the LEARNER and will speak as themselves (the ${profile.jobTitle}). The AI must play the OTHER person in the conversation — the counterpart ${profile.firstName} is talking to (e.g. the client, customer, patient, candidate, colleague, or manager), NEVER ${profile.firstName} and NEVER a ${profile.jobTitle}. For example, if the scenario is a salesperson handling a client's price objection, the AI plays the CLIENT raising the objection. Then design a natural, friendly conversation for that counterpart.

CRITICAL conversation rules (must be reflected in the prompt you write):
- The user speaks EXACTLY twice, then the call ends.
- Turn structure:
  1. The agent greets and asks ONE question.
  2. The user replies (their 1st turn).
  3. The agent briefly acknowledges, responds to what they said, and asks ONE more question.
  4. The user replies again (their 2nd turn).
  5. The agent answers any question they asked, makes a short closing comment, and says goodbye. NO more questions.

Output ONLY the finished system prompt as plain text — no JSON, no preamble, no explanation, no code fences. It MUST follow EXACTLY this structure and wording style, with the bracketed parts replaced to fit the scenario:

You are a [persona] [handling this situation]. Be warm, casual and natural. Only speak English.

Conversation flow:

1. Start with:
   "[the agent's opening greeting and first question]"

2. After the user replies:

* Briefly acknowledge their answer naturally.
* [respond in a way that fits the scenario].
* Ask [one relevant second question].

3. After the user replies again:

* Do NOT ask any more questions.
* Answer their question if they asked one.
* [give the natural closing action for this scenario].
* Say goodbye.

Additional rules:

* ${speechGuidance}
* If the user asks you to repeat something, repeat it and immediately continue the conversation from where it stopped.
* Keep responses short and conversational.
* Aim for about 10 seconds of speaking time per response.
* Do not change the conversation flow or add extra topics/questions.

IMPORTANT: Include the level-adaptation rule above ("${speechGuidance}") verbatim as the first item in the "Additional rules" section of the prompt you output.`;
}

export function simulationFeedbackPrompt(
  transcript: string,
  scenario: {
    title: string;
    canDo?: string | null;
    functions?: string[];
    cefrBand?: string | null;
  }
) {
  const objective = scenario.canDo ? `\nLearning objective (can-do): ${scenario.canDo}` : "";
  const fns = scenario.functions?.length ? `\nFunctions to practise: ${scenario.functions.join(", ")}` : "";
  const band = scenario.cefrBand ? ` The learner's CEFR level is ${scenario.cefrBand}; judge performance relative to what is expected at that level.` : "";

  return `You are an expert teacher of English as a foreign language. Analyse what the LEARNER said in this conversation transcript from a professional English speaking simulation. Only assess the learner's lines, not the AI partner's.${band}
Scenario: "${scenario.title}"${objective}${fns}

Transcript:
${transcript}

Score fluency, vocabulary, and grammar from 0-100 (relative to the learner's level).

For "improvements": act as a supportive expert teacher.
- First, briefly note whether the learner achieved the learning objective (the can-do) and used the target functions.
- Then point out the specific vocabulary and grammar MISTAKES the learner actually made. For each, quote the words they used, then give a simple, clear correction or a better way to say it.
- Keep each point short and easy to understand (the learner is not a native speaker). Use plain language.
- If the learner made NO real mistakes, do NOT invent any. Instead return a single item that congratulates them warmly and adds one brief encouraging comment.

Return ONLY valid JSON with this shape:
{
  "fluency": 0-100,
  "vocabulary": 0-100,
  "grammar": 0-100,
  "improvements": ["point 1", "point 2"],
  "summary": "2-3 sentence overall assessment"
}`;
}

// Classifies a user's free-text industry + job title onto the curriculum's
// fixed taxonomy. Returns matched=false if the industry isn't reasonably
// covered (caller then falls back to dynamic generation).
export function curriculumMatchPrompt(
  user: { industry?: string | null; company?: string | null; jobTitle?: string | null; responsibilities?: string[] },
  taxonomy: { industry: string; jobTitles: string[] }[]
) {
  return `Match this professional to the closest entry in a fixed course taxonomy.

User:
- Industry: ${user.industry ?? "unknown"}
- Company: ${user.company ?? "unknown"}
- Job title: ${user.jobTitle ?? "unknown"}
- Responsibilities: ${user.responsibilities?.length ? user.responsibilities.join("; ") : "unknown"}

Taxonomy (industry → available job titles):
${taxonomy.map((t) => `- ${t.industry}: ${t.jobTitles.join(", ")}`).join("\n")}

Rules:
- Pick the single closest industry ONLY if the user's industry is genuinely covered by the taxonomy. If it is a clearly different sector not represented here, set "matched" to false.
- If matched, also pick the single closest job title from THAT industry's list (exact string from the list).

Return ONLY valid JSON: { "matched": true/false, "industry": "exact industry or null", "jobTitle": "exact job title or null" }`;
}

// Personalises a fixed curriculum (12 units) into scenarios for one learner.
// Grammar/vocabulary/functions come from the curriculum unit (not the model);
// the model only personalises the situation title/description and adds a
// can-do + target phrases, grounded in the unit's base scenario and the user.
export function curriculumCoursePrompt(
  profile: { jobTitle: string; company: string; industry: string; answers: { question: string; answer: string }[] },
  units: { unitNumber: number; grammar: string; vocabulary: string; functions: string; baseScenarioTitle: string }[]
) {
  return `You are personalising a fixed English course for ${profile.jobTitle} at ${profile.company} (industry: ${profile.industry}).

What they told us about their English needs:
${profile.answers.map((a, i) => `${i + 1}. ${a.question} → ${a.answer}`).join("\n")}

Below are ${units.length} course units. Each has a grammar/vocabulary/functions focus and a base scenario. Keep each unit's focus EXACTLY as given — only personalise the situation so it feels real for THIS person (use their role, company, and answers), staying true to the unit's base scenario and language focus.

${units
  .map(
    (u) =>
      `Unit ${u.unitNumber}\n  Base scenario: ${u.baseScenarioTitle}\n  Grammar: ${u.grammar}\n  Vocabulary: ${u.vocabulary}\n  Functions: ${u.functions}`
  )
  .join("\n\n")}

For each unit return:
- "unitNumber": the unit number
- "title": a short, clear situation title (4-7 words), personalised to their role/context
- "description": one simple sentence on the situation and what they'll practise
- "canDo": a CEFR can-do statement for this unit ("Can ...")
- "targetPhrases": 4-6 useful phrases/chunks for this situation, matching the unit's grammar/vocabulary/functions

Return ONLY valid JSON: { "units": [ { "unitNumber", "title", "description", "canDo", "targetPhrases" } ] } with one entry per unit, same order.`;
}

// Generates the Grammar & Vocabulary quiz: 10 Duolingo-style questions
// covering all of the unit's grammar and core vocabulary at the learner's level.
export function grammarQuizPrompt(
  scenario: {
    title: string;
    description: string;
    grammarFocus?: string | null;
    vocabulary?: string | null;
    functions?: string[];
  },
  profile: {
    jobTitle: string;
    firstName?: string | null;
    company?: string | null;
    nativeLanguage?: string | null;
    cefrBand: string;
    cefrGuidance: string;
  }
) {
  const band = profile.cefrBand;
  const higher = band === "B2" || band === "C1";
  const native = profile.nativeLanguage?.trim() || "the learner's native language";

  const mixRule = higher
    ? `Create EXACTLY 7 "gap" questions and EXACTLY 3 "match" questions (10 total).`
    : `Create EXACTLY 5 "gap" questions and EXACTLY 5 "match" questions (10 total).`;

  const matchRule = higher
    ? `Match questions must be ENGLISH ONLY — absolutely no translation. Each match question pairs unit-relevant words with their SYNONYMS ("kind":"synonym") or OPPOSITES ("kind":"opposite"). Use vocabulary sophisticated enough to challenge a ${band} learner.`
    : `Match questions are mostly TRANSLATION ("kind":"translation"): English words/phrases on the left, their ${native} translations on the right. Choose vocabulary that is CORE to this situation and complex enough to merit a question (never trivial words). You may also include one or two non-translation match questions (synonyms, opposites, or word→collocation; set "kind" accordingly).`;

  const sentenceCap =
    band === "A2"
      ? "Gap sentences: maximum 8 words, very simple structures."
      : band === "B1"
        ? "Gap sentences: maximum 10 words, clear and simple."
        : band === "B2"
          ? "Gap sentences: maximum 12 words — test COMPLEX grammar in SHORT sentences."
          : "Gap sentences: maximum 14 words — test NUANCED grammar (register, subtle meaning differences) in SHORT sentences.";

  const explanationRule = higher
    ? `Each gap question has a 1-sentence "explanation" in ENGLISH of why the correct answer is right.`
    : `Each gap question has a 1-sentence "explanation" written in ${native}, in very simple words, of why the correct answer is right.`;

  return `You are writing a Duolingo-style quiz for ${profile.firstName ? `${profile.firstName}, ` : ""}a ${profile.jobTitle}${profile.company ? ` at ${profile.company}` : ""}, learning English. The quiz is set in this work situation:
"${scenario.title}" — ${scenario.description}

This unit's language focus:
- Grammar: ${scenario.grammarFocus ?? "(none)"}
- Vocabulary: ${scenario.vocabulary ?? "(none)"}
- Functions: ${scenario.functions?.length ? scenario.functions.join("; ") : "(none)"}

The learner's level:
${profile.cefrGuidance}

Rules:
1. ${mixRule}
2. Together, the 10 questions must cover EVERY grammar element of the unit and the CORE vocabulary — nothing left out.
3. "gap" questions test grammar: a sentence from the situation with exactly one blank written as ___ , plus exactly 3 short answer options (1-3 words each) of which EXACTLY ONE is correct. The two wrong options must be plausible but unambiguously incorrect in that sentence. Set "correctIndex" (0-2).
4. ${sentenceCap}
5. ${matchRule}
6. Every match question has exactly 4 pairs. Every item (option or match cell) must be at most 24 characters so it fits its button.
7. ${explanationRule} Translation match questions need no explanation; synonym/opposite match questions get a very short note (e.g. "rise ↔ fall are opposites").
8. Duolingo style: the question contains NO instructions and relies on NO outside context or images.
9. PERSONAL RELEVANCE: questions are about the LEARNER's situation. ${profile.firstName ? `If a sentence mentions the learner by name (e.g. an introduction), use their real name "${profile.firstName}" — NEVER invent a name for the learner.` : "Never invent a name for the learner."} ${profile.company ? `Use their real company "${profile.company}" where a company is mentioned.` : ""}
10. Mix the question order (do not put all gaps first).

Return ONLY valid JSON:
{ "questions": [
  { "type":"gap", "prompt":"sentence with ___", "options":["a","b","c"], "correctIndex":0, "explanation":"...", "grammarPoint":"short label" },
  { "type":"match", "kind":"translation|synonym|opposite|other", "pairs":[{"left":"...","right":"..."} ×4], "explanation":"optional" }
] }`;
}

// Review/fix pass for the quiz: verifies coverage, single-correct gaps, counts,
// language rules, and length caps — and returns a corrected set when needed.
export function grammarQuizReviewPrompt(
  quizJson: string,
  unit: { grammarFocus?: string | null; vocabulary?: string | null },
  rules: { band: string; gapCount: number; matchCount: number; nativeLanguage?: string | null }
) {
  const higher = rules.band === "B2" || rules.band === "C1";
  return `Review this English-learning quiz (JSON below) against the rules. Fix ONLY what is wrong; keep everything that is correct unchanged.

Unit grammar: ${unit.grammarFocus ?? "(none)"}
Unit vocabulary: ${unit.vocabulary ?? "(none)"}

Rules to verify:
1. Exactly ${rules.gapCount} "gap" and ${rules.matchCount} "match" questions.
2. All grammar elements of the unit are tested by at least one question; core unit vocabulary appears across the questions.
3. Every gap question: sentence contains exactly one ___; exactly 3 options; EXACTLY ONE option is grammatically correct in the blank — check each distractor and fix any that could also be correct; correctIndex points to the correct option.
4. Every match question has exactly 4 pairs and each pair is correctly matched (left[i] ↔ right[i]).
5. ${higher ? "NO translation anywhere — match questions must be English-only synonyms or opposites." : `Match translations must be accurate ${rules.nativeLanguage ?? ""} translations.`}
6. All options and match items ≤ 24 characters; gap sentences ≤ 90 characters.
7. Gap explanations present (1 short sentence${higher ? ", in English" : `, in ${rules.nativeLanguage ?? "the learner's language"}`}).

Quiz:
${quizJson}

Return ONLY valid JSON:
- If everything passes: { "ok": true }
- Otherwise: { "ok": false, "questions": [ ...the corrected full set of 10 questions in the same schema... ] }`;
}
