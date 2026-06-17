"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Vapi from "@vapi-ai/web";
import { ArrowLeft, Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type CallState = "idle" | "connecting" | "active" | "ending" | "error";
type Turn = { role: "user" | "assistant"; text: string };

export default function SimulationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const vapiRef = useRef<Vapi | null>(null);
  const promptRef = useRef<string | null>(null);
  const firstMessageRef = useRef<string | null>(null);
  const transcriptRef = useRef<Turn[]>([]);
  const endedRef = useRef(false);
  // Turn tracking driven by the conversation history (robust to mid-turn pauses).
  const sawSecondTurnRef = useRef(false);
  const assistantCountAtSecondTurnRef = useRef(0);
  const closingRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [callState, setCallState] = useState<CallState>("idle");
  const [isMuted, setIsMuted] = useState(false);

  // Generate (or load the cached) conversation prompt the first time the page
  // is opened, and keep it ready to drive the call.
  useEffect(() => {
    loadPrompt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadPrompt() {
    if (promptRef.current) return;
    const r = await fetch("/api/scenario/simulation-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id }),
    });
    const d = await r.json();
    promptRef.current = d.prompt ?? null;
    firstMessageRef.current = d.firstMessage ?? null;
  }

  useEffect(() => {
    return () => { vapiRef.current?.stop(); };
  }, []);

  async function startCall() {
    setCallState("connecting");
    endedRef.current = false;
    sawSecondTurnRef.current = false;
    assistantCountAtSecondTurnRef.current = 0;
    closingRef.current = false;
    transcriptRef.current = [];

    try {
      // Make sure the scenario prompt is loaded before connecting (avoids a
      // generic opening if Start is clicked during generation).
      await loadPrompt();

      const vapi = new Vapi(process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY!);
      vapiRef.current = vapi;

      vapi.on("call-start", () => setCallState("active"));
      vapi.on("call-end", () => finishCall());
      vapi.on("error", () => { if (!endedRef.current) setCallState("error"); });

      // End once the agent finishes its closing reply (after the 2nd user turn).
      vapi.on("speech-end", () => {
        if (closingRef.current && !endedRef.current) finishCall();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vapi.on("message", (msg: any) => {
        // Keep a running transcript for the feedback step.
        if (msg?.type === "transcript" && msg?.transcriptType === "final") {
          transcriptRef.current.push({
            role: msg.role === "user" ? "user" : "assistant",
            text: msg.transcript,
          });
          return;
        }

        // Count real turns from the conversation history (one entry per turn).
        if (msg?.type === "conversation-update") {
          const conv: { role: string }[] = msg.conversation ?? msg.messages ?? [];
          const userCount = conv.filter((m) => m.role === "user").length;
          const assistantCount = conv.filter(
            (m) => m.role === "assistant" || m.role === "bot"
          ).length;

          if (!sawSecondTurnRef.current && userCount >= 2) {
            // The user has now spoken twice; remember how many agent replies
            // existed at this point.
            sawSecondTurnRef.current = true;
            assistantCountAtSecondTurnRef.current = assistantCount;
          } else if (
            sawSecondTurnRef.current &&
            assistantCount > assistantCountAtSecondTurnRef.current
          ) {
            // The agent has now delivered its reply to the 2nd turn (the
            // closing). Let it finish speaking, then hang up.
            scheduleClose();
          }
        }
      });

      // Transient (inline) assistant — no dashboard setup required.
      // If we extracted the template's opening line, speak it verbatim;
      // otherwise let the model generate the first message from the prompt.
      const opening = firstMessageRef.current;
      await vapi.start({
        firstMessage: opening ?? undefined,
        firstMessageMode: opening
          ? "assistant-speaks-first"
          : "assistant-speaks-first-with-model-generated-message",
        model: {
          provider: "openai",
          model: "gpt-4o",
          messages: [{ role: "system", content: promptRef.current ?? "" }],
        },
        voice: { provider: "vapi", voiceId: "Elliot" },
        maxDurationSeconds: 180,
        metadata: { scenarioId: id },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);
    } catch {
      setCallState("error");
    }
  }

  // Marks the conversation as closing and ends it after the agent's final
  // reply finishes (speech-end), with a timeout fallback.
  function scheduleClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    closeTimerRef.current = setTimeout(() => finishCall(), 9000);
  }

  async function finishCall() {
    if (endedRef.current) return;
    endedRef.current = true;
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    vapiRef.current?.stop();
    setCallState("ending");

    const transcript = transcriptRef.current
      .map((t) => `${t.role === "user" ? "Learner" : "Partner"}: ${t.text}`)
      .join("\n");

    if (!transcript.trim()) {
      setCallState("error");
      return;
    }

    const res = await fetch("/api/scenario/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id, transcript }),
    });
    if (!res.ok) {
      setCallState("error");
      return;
    }
    // Feedback lives on its own URL, identified by the attempt timestamp.
    const { timestamp } = await res.json();
    router.push(`/scenario/${id}/feedback/${timestamp}`);
  }

  function toggleMute() {
    if (!vapiRef.current) return;
    const next = !isMuted;
    vapiRef.current.setMuted(next);
    setIsMuted(next);
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/scenario/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to scenario
      </Link>

      {callState === "idle" && (
        <div className="text-center py-16">
          <div className="mb-6">
            <Mic className="h-12 w-12 mx-auto text-primary mb-4" />
            <h1 className="font-display text-4xl leading-tight mb-2">Ready for your conversation?</h1>
            <p className="text-sm text-muted-foreground">
              Speak naturally — don&apos;t worry about mistakes. The call ends on its own.
            </p>
          </div>
          <Button size="lg" onClick={startCall} className="px-8">
            Start conversation
          </Button>
        </div>
      )}

      {callState === "connecting" && (
        <div className="text-center py-16">
          <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary mb-4" />
          <p className="text-sm text-muted-foreground">Connecting…</p>
        </div>
      )}

      {callState === "active" && (
        <div className="text-center py-16">
          <div className="mb-8">
            <div className="h-20 w-20 rounded-full bg-primary/10 border-4 border-primary/30 mx-auto flex items-center justify-center mb-4 animate-pulse">
              <Mic className="h-8 w-8 text-primary" />
            </div>
            <Badge variant="secondary" className="text-green-700 bg-green-100">Live</Badge>
          </div>
          <div className="flex justify-center gap-4">
            <Button variant="outline" size="lg" onClick={toggleMute}>
              {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </Button>
            <Button variant="destructive" size="lg" onClick={finishCall}>
              <PhoneOff className="h-5 w-5 mr-2" /> End now
            </Button>
          </div>
        </div>
      )}

      {callState === "ending" && (
        <div className="text-center py-16">
          <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary mb-4" />
          <p className="font-medium mb-1">Analysing your conversation…</p>
          <p className="text-sm text-muted-foreground">Your feedback will be ready in a moment.</p>
        </div>
      )}

      {callState === "error" && (
        <div className="text-center py-16">
          <p className="text-sm text-destructive mb-4">Something went wrong. Please try again.</p>
          <Button onClick={() => setCallState("idle")}>Try again</Button>
        </div>
      )}
    </div>
  );
}
