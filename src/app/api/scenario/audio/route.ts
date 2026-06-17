import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSpeechConfig } from "@/lib/azure-speech";
import { prisma } from "@/lib/prisma";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { sentenceId } = await req.json();

  const sentence = await prisma.practiceSentence.findUnique({ where: { id: sentenceId } });
  if (!sentence) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Return cached audio URL if it already exists
  if (sentence.audioUrl) return NextResponse.json({ audioUrl: sentence.audioUrl });

  const { key, region } = getSpeechConfig();

  // Call Azure TTS REST API (avoids SDK bundling issues in Node.js edge)
  const ssml = `<speak version='1.0' xml:lang='en-US'>
    <voice name='en-US-JennyNeural'>${sentence.text}</voice>
  </speak>`;

  const ttsRes = await fetch(
    `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`,
    {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-16khz-128kbitrate-mono-mp3",
      },
      body: ssml,
    }
  );

  if (!ttsRes.ok) {
    return NextResponse.json({ error: "TTS generation failed" }, { status: 500 });
  }

  const audioBuffer = await ttsRes.arrayBuffer();
  const fileName = `audio/${sentenceId}.mp3`;

  const { error: uploadError } = await supabase.storage
    .from("practice-audio")
    .upload(fileName, audioBuffer, { contentType: "audio/mpeg", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("practice-audio").getPublicUrl(fileName);
  const audioUrl = urlData.publicUrl;

  await prisma.practiceSentence.update({ where: { id: sentenceId }, data: { audioUrl } });

  return NextResponse.json({ audioUrl });
}
