import { NextRequest, NextResponse } from "next/server";
import { getAzureOpenAI, DEPLOYMENT } from "@/lib/azure-openai";
import { profileExtractionPrompt } from "@/lib/prompts";

// Returns a normalised https LinkedIn URL, or null if the input is not a
// genuine linkedin.com address.
function parseLinkedInUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length > 500) return null;
  let parsed: URL;
  try {
    parsed = new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const host = parsed.hostname.toLowerCase();
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
  parsed.protocol = "https:";
  return parsed.toString();
}

// Fetches a LinkedIn profile's text via the Exa content API (which can read
// pages that block naive scraping), then extracts structured fields via GPT.
// Falls back to a plain fetch if Exa isn't configured.
async function fetchProfileText(url: string): Promise<string> {
  const exaKey = process.env.EXA_API_KEY;

  if (exaKey) {
    const exaRes = await fetch("https://api.exa.ai/contents", {
      method: "POST",
      headers: { "x-api-key": exaKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        urls: [url],
        text: { maxCharacters: 6000 },
        livecrawl: "fallback", // use Exa's index, crawl live only if needed
      }),
    });
    if (exaRes.ok) {
      const data = await exaRes.json();
      const r = data?.results?.[0];
      const text = [r?.title, r?.author, r?.text].filter(Boolean).join("\n");
      if (text.trim()) return text.slice(0, 6000);
    }
  }

  // Fallback: plain fetch (usually hits LinkedIn's login wall).
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  const html = await res.text();
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 6000);
}

export async function POST(req: NextRequest) {
  const { url, text } = await req.json();

  // Mode 1: the user typed their details directly — extract from that text.
  if (text) {
    const openai = getAzureOpenAI();
    const completion = await openai.chat.completions.create({
      model: DEPLOYMENT,
      messages: [{ role: "user", content: profileExtractionPrompt(text) }],
      response_format: { type: "json_object" },
      temperature: 0,
    });
    const profile = JSON.parse(completion.choices[0].message.content ?? "{}");
    return NextResponse.json({ profile });
  }

  // Strict validation: only https URLs whose host IS linkedin.com (or a
  // subdomain) are fetched — a substring check would allow SSRF via
  // attacker-controlled hosts (e.g. https://evil.com/?x=linkedin.com).
  const safeUrl = parseLinkedInUrl(url);
  if (!safeUrl) {
    return NextResponse.json({ error: "Invalid LinkedIn URL" }, { status: 400 });
  }

  let profileText = "";
  try {
    profileText = await fetchProfileText(safeUrl);
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
