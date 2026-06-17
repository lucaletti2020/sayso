import { NextRequest, NextResponse } from "next/server";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { profileExtractionPrompt } from "@/lib/prompts";

// Scrape LinkedIn profile page HTML and extract profile data via GPT.
// We use a lightweight fetch + GPT approach. For production, swap the
// scrape step for Proxycurl API to handle auth-gated profiles.
export async function POST(req: NextRequest) {
  const { url } = await req.json();

  if (!url || !url.includes("linkedin.com")) {
    return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 });
  }

  let profileText = "";

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    // Strip HTML tags for a lightweight text version
    profileText = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000);
  } catch {
    return NextResponse.json(
      { error: "Could not fetch LinkedIn profile. Please paste your profile text instead." },
      { status: 422 }
    );
  }

  const openai = getAzureOpenAI();
  const completion = await openai.chat.completions.create({
    model: DEPLOYMENT,
    messages: [
      { role: "user", content: profileExtractionPrompt(profileText) },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const raw = completion.choices[0].message.content ?? "{}";
  const profile = JSON.parse(raw);

  return NextResponse.json({ profile });
}
