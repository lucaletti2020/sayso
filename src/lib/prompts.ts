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

export function sentenceGenerationPrompt(
  scenario: {
    title: string;
    description: string;
    canDo?: string | null;
    functions?: string[];
    grammarFocus?: string | null;
    targetPhrases?: string[];
  },
  profile: {
    jobTitle: string;
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

  const objectives = [
    scenario.canDo ? `- Objective (can-do): ${scenario.canDo}` : "",
    scenario.functions?.length ? `- Functions to practise: ${scenario.functions.join(", ")}` : "",
    scenario.grammarFocus ? `- Grammar focus: ${scenario.grammarFocus}` : "",
    scenario.targetPhrases?.length ? `- Target phrases to build on: ${scenario.targetPhrases.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `A ${profile.jobTitle} is preparing for this work situation where they must speak English:
"${scenario.title}" — ${scenario.description}

The learner's level:
${profile.cefrGuidance}

Learning objectives for this scenario:
${objectives || "- (none provided)"}

List the 10 MOST useful English sentences they will actually need in this situation — the key phrases they would really say, which realise the functions and objectives above.

Guidelines:
- REALISTIC and natural — real things a person says, not textbook examples.
- SHORT and easy to say out loud.
- Calibrated to CEFR ${profile.cefrBand} (match the complexity guidance above).
- Cover the range of moments: opening, asking, clarifying, responding, being polite, and closing.
- Include and expand on the target phrases where natural; specific to THIS situation and role.
- ${translationGuide}

Return ONLY valid JSON in exactly this shape (10 items):
{ "sentences": [ { "text": "the English sentence", "translation": "translation or empty string" } ] }`;
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
