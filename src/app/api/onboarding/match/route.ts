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

  let result: { matched?: boolean; industry?: string | null; jobTitle?: string | null } = {};
  try {
    const parsed = JSON.parse(completion.choices[0].message.content ?? "{}");
    result = parsed?.matched !== undefined ? parsed : (parsed.content ?? {});
  } catch {
    return NextResponse.json({ matched: false });
  }

  // Validate the model's answer against the real taxonomy.
  const industry = result.industry ?? "";
  const jobTitle = result.jobTitle ?? "";
  const industryEntry = taxonomy.find((t) => t.industry === industry);
  const validJob = industryEntry?.jobTitles.includes(jobTitle);

  if (!result.matched || !industryEntry || !validJob) {
    return NextResponse.json({ matched: false });
  }

  return NextResponse.json({ matched: true, industry, jobTitle });
}
