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

export function diagnosticQuestionsPrompt(profile: {
  firstName: string;
  jobTitle: string;
  company: string;
  companySize?: string | null;
  responsibilities: string[];
}) {
  return `You are an expert English course designer preparing a personalised course for one professional.

Profile:
- Name: ${profile.firstName}
- Job title: ${profile.jobTitle}
- Company: ${profile.company}
- Company size: ${profile.companySize ?? "unknown"}
- Responsibilities: ${profile.responsibilities.length ? profile.responsibilities.join("; ") : "unknown"}

Work through these steps PRIVATELY. Do NOT include any of this reasoning in your output:
1. Infer the specific situations in which this person most likely needs to speak English at work, given their role, company, and company size.
2. List the open questions you still have that would most change how you design their course (e.g. who they speak English with, in what formats/situations, what feels hardest, what their goal is).
3. Select the 4 most useful of those open questions and turn each into a single multiple-choice question the user can answer by tapping.

Requirements for the 4 questions:
- Each must be specific to THIS person's role and context — never generic filler.
- Each has 3 or 4 concrete, mutually distinct options.
- Options must be SHORT phrases, not full sentences. Do NOT start with "I" or a verb. For the question "Who do I speak English with most at work?" write "Clients and sales partners" — NOT "I speak with clients and sales partners". For "What is hardest for me?" write "Speaking on calls" — NOT "I find speaking on calls hard".
- Keep each option to about 2-5 words. Keep each question under 12 words.
- Together the questions should clarify: who they speak English with, the formats/situations, and their biggest challenge or goal.
- Use simple, common words. The user is not a native English speaker, so keep everything short, clear, and easy to read. Avoid idioms and jargon.

IMPORTANT — do NOT ask about frequency. Never ask how often, how many times per week/month, or how regularly they speak English. That information is irrelevant.

Return ONLY valid JSON in EXACTLY this shape, with no commentary before or after:
{
  "questions": [
    { "question": "string", "options": ["string", "string", "string"] }
  ]
}
The "questions" array must contain exactly 4 items.`;
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

Propose exactly 10 course modules. Each module is a theme of professional situations in which this person speaks English at work. They are the high-level building blocks of the course — the user will pick the ones most relevant to them.

For example, the modules for a doctor might be: "Patient Consultations", "Taking Medical Histories", "Symptom Assessment & Diagnosis", "Physical Examinations", "Explaining Conditions & Test Results", "Treatment & Medication Discussions", "Procedures & Informed Consent", "Emergency & Urgent Care Situations", "Difficult Conversations", "Follow-up & Chronic Care Management".

Requirements:
- Exactly 10 modules, each clearly distinct and specific to THIS person's role and industry.
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
The "modules" array must contain exactly 10 items.`;
}

export function scenarioGenerationPrompt(profile: {
  firstName: string;
  jobTitle: string;
  company: string;
  companySize?: string | null;
  responsibilities: string[];
  answers: { question: string; answer: string }[];
  modules: { title: string; description: string }[];
}) {
  return `You are creating a personalised English speaking course for ${profile.firstName}, a ${profile.jobTitle} at ${profile.company} (company size: ${profile.companySize ?? "unknown"}).

Their responsibilities: ${profile.responsibilities.join(", ")}.

What they told us about their English needs (answers to a short questionnaire):
${profile.answers.map((a, i) => `${i + 1}. ${a.question}\n   → ${a.answer}`).join("\n")}

The user has chosen the following ${profile.modules.length} modules for their course:
${profile.modules.map((m, i) => `${i + 1}. ${m.title} — ${m.description}`).join("\n")}

For EACH chosen module, generate exactly 5 professional speaking scenarios — concrete, realistic situations in which this person would need to speak English, specific to their role and industry. Keep every scenario within the theme of its module.

Scenario title rules:
- Each title must still read as a CLEAR, specific situation — usually an action or a moment (e.g. "First Call With a Prospect", "Handling a Price Objection", "Giving Feedback to a Team Member").
- Keep it short: aim for 4-6 words. Drop only the qualifiers that are NOT essential — e.g. write "First Call With a Prospect" (good), NOT "First Call With a Mid-Market Prospect" (too long) and NOT "Prospect Call" or "Budget Concerns" (too vague — these lost the situation).
- Use simple, common words (the user is not a native English speaker). No jargon or idioms.

The description is one short, simple sentence on the situation and what they'll practise.

Return ONLY valid JSON in this exact shape, with one group per chosen module, in the same order:
{
  "groups": [
    {
      "title": "Module title (exactly as given)",
      "scenarios": [
        { "title": "Scenario title", "description": "One simple sentence describing the situation and what they'll practise." }
      ]
    }
  ]
}
Each group must contain exactly 5 scenarios.`;
}

export function sentenceGenerationPrompt(
  scenario: { title: string; description: string },
  profile: { jobTitle: string; englishLevel?: string | null }
) {
  const level = profile.englishLevel ?? "Intermediate";
  const levelGuide: Record<string, string> = {
    beginner:
      "Use very simple, short sentences (about 5-8 words). Basic, high-frequency words and present-simple grammar. No idioms or complex clauses.",
    intermediate:
      "Use short, everyday sentences (about 6-10 words). Common workplace vocabulary and straightforward grammar. Avoid idioms.",
    "upper intermediate":
      "Use natural, fairly concise sentences (about 8-14 words). Some professional vocabulary and varied grammar (polite requests, conditionals) are fine.",
    advanced:
      "Use natural, polished sentences (about 10-16 words). Precise professional vocabulary and nuanced, diplomatic phrasing are welcome.",
  };
  const guidance = levelGuide[level.toLowerCase()] ?? levelGuide["intermediate"];

  return `A ${profile.jobTitle} (English level: ${level}) is preparing for this work situation where they must speak English:
"${scenario.title}" — ${scenario.description}

List the 10 MOST useful English sentences they will actually need in this exact situation — the key phrases they would really say.

Guidelines:
- REALISTIC and natural — real things a person says in this situation, not textbook examples.
- SHORT — keep every sentence brief and easy to say out loud.
- Match the user's English level: ${guidance}
- Cover the range of moments: opening, asking questions, clarifying, responding, being polite, and closing.
- Specific to THIS situation and role — phrases they could use almost word-for-word.

Return ONLY valid JSON in exactly this shape:
{ "sentences": ["sentence 1", "sentence 2", "... 10 in total"] }`;
}

// Meta-prompt: asks the model to WRITE the voice agent's system prompt for a
// specific scenario, strictly following the fixed two-user-turn format.
export function simulationPromptBuilderPrompt(
  profile: { firstName: string; jobTitle: string; company: string },
  scenario: { title: string; description: string }
) {
  return `You are designing the system prompt for an AI voice agent. The agent will role-play a short English speaking practice call with ${profile.firstName}, who is a ${profile.jobTitle} at ${profile.company}.

The scenario to practise is:
"${scenario.title}" — ${scenario.description}

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

* If the user asks you to repeat something, repeat it and immediately continue the conversation from where it stopped.
* Keep responses short and conversational.
* Aim for about 10 seconds of speaking time per response.
* Do not change the conversation flow or add extra topics/questions.`;
}

export function simulationFeedbackPrompt(transcript: string, scenario: { title: string }) {
  return `You are an expert English language coach. Analyse this conversation transcript from a professional English speaking simulation.
Scenario: "${scenario.title}"

Transcript:
${transcript}

Return ONLY valid JSON with this shape:
{
  "overallScore": 0-100,
  "fluency": 0-100,
  "vocabulary": 0-100,
  "grammar": 0-100,
  "highlights": ["positive observation 1", "positive observation 2", "positive observation 3"],
  "improvements": ["specific improvement 1", "specific improvement 2"],
  "summary": "2-3 sentence overall assessment"
}`;
}
