import { NextRequest, NextResponse } from "next/server";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { curriculumMatchPrompt } from "@/lib/prompts";
import { listIndustries, listJobTitles } from "@/lib/curriculum";

// Classifies the user's industry + job title onto the fixed curriculum
// taxonomy. Returns { matched, industry, jobTitle }. If not matched, the
// caller falls back to dynamic course generation.
export async function POST(req: NextRequest) {
  const { profile } = await req.json();

  const industries = await listIndustries();
  const taxonomy = await Promise.all(
    industries.map(async (industry) => ({ industry, jobTitles: await listJobTitles(industry) }))
  );
  // No curriculum seeded: let the frontend fall back to dynamic generation.
  if (taxonomy.length === 0 || taxonomy.every((t) => t.jobTitles.length === 0)) {
    return NextResponse.json({ matched: false });
  }

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      {
        role: "user",
        content: curriculumMatchPrompt(
          {
            industry: profile?.industry,
            company: profile?.company,
            jobTitle: profile?.jobTitle,
            responsibilities: profile?.responsibilities ?? [],
          },
          taxonomy
        ),
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_completion_tokens: 200,
  });

  let result: { industry?: string | null; jobTitle?: string | null } = {};
  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    result = parsed?.industry !== undefined ? parsed : (parsed.content ?? {});
  } catch {
    result = {};
  }

  // Validate the model's answer against the real taxonomy (case-insensitive),
  // falling back deterministically so a course can ALWAYS be built on the
  // curriculum backbone.
  const wantIndustry = (result.industry ?? "").trim().toLowerCase();
  const wantJob = (result.jobTitle ?? "").trim().toLowerCase();
  const industryEntry =
    taxonomy.find((t) => t.industry.toLowerCase() === wantIndustry) ?? taxonomy[0];
  const jobTitle =
    industryEntry.jobTitles.find((j) => j.toLowerCase() === wantJob) ??
    industryEntry.jobTitles[0];

  return NextResponse.json({ matched: true, industry: industryEntry.industry, jobTitle });
}
