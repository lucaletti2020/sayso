"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession, getProviders } from "next-auth/react";
import { Loader2 } from "lucide-react";

type Message = { id: string; role: "agent" | "user"; text: string };
type Step =
  | "awaiting_linkedin"
  | "processing_linkedin"
  | "native_language"
  | "questions"
  | "loading_modules"
  | "modules"
  | "generating"
  | "done";
type MCQ = { question: string; options: string[]; single?: boolean };
type Module = { title: string; description: string };
type Profile = Record<string, unknown>;

const MAX_MODULES = 8;

// The final question is always about English level (single-choice).
const LEVEL_QUESTION: MCQ = {
  question: "Last one — how would you rate your English right now?",
  options: ["Beginner", "Intermediate", "Upper intermediate", "Advanced"],
  single: true,
};

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: "agent",
      text: "Hi! 👋 I'll build an English course for your job. To start, paste your LinkedIn profile link.",
    },
  ]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState<Step>("awaiting_linkedin");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [questions, setQuestions] = useState<MCQ[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [answers, setAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModules, setSelectedModules] = useState<string[]>([]);
  const [providers, setProviders] = useState<string[]>([]);
  // For logged-in users we don't render the onboarding chat until we know
  // whether to send them to their course (avoids a flash of the chat/button).
  const [redirecting, setRedirecting] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);
  const [thinking, setThinking] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy =
    step === "processing_linkedin" ||
    step === "loading_modules" ||
    step === "generating" ||
    thinking;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy, currentQ, step]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/onboarding/status")
      .then((r) => r.json())
      .then((d) => {
        if (d.onboardingDone) {
          // Existing user → take them straight to their course.
          setRedirecting(true);
          router.replace("/home");
          return;
        }
        setOnboardingChecked(true);
        // Resume an onboarding that was interrupted by the sign-in step.
        const pendingProfile = sessionStorage.getItem("pending_profile");
        const pendingAnswers = sessionStorage.getItem("pending_answers");
        const pendingModules = sessionStorage.getItem("pending_modules");
        if (pendingProfile && pendingAnswers && pendingModules) {
          runGeneration(
            JSON.parse(pendingProfile),
            JSON.parse(pendingAnswers),
            JSON.parse(pendingModules)
          );
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router]);

  useEffect(() => {
    getProviders().then((p) => setProviders(p ? Object.keys(p) : []));
  }, []);

  const progress = useMemo(() => {
    if (step === "awaiting_linkedin" || step === "processing_linkedin") return 0.06;
    if (step === "questions") return 0.12 + (currentQ / 3) * 0.48;
    if (step === "native_language") return 0.66;
    if (step === "loading_modules" || step === "modules") return 0.78;
    return 1;
  }, [step, currentQ]);

  function addAgent(text: string) {
    setMessages((m) => [...m, { id: uid(), role: "agent", text }]);
  }
  function addUser(text: string) {
    setMessages((m) => [...m, { id: uid(), role: "user", text }]);
  }

  const linkedInRegex = /^(https?:\/\/)?([\w-]+\.)?linkedin\.com\/in\/[\w\-_%]+\/?.*$/i;

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const value = input.trim();

    if (step === "awaiting_linkedin") {
      if (!value) { setError("Pop your LinkedIn URL in here."); return; }
      if (!linkedInRegex.test(value)) { setError("Hmm, that doesn't look like a LinkedIn profile URL."); return; }
      setError(null);
      addUser(value);
      setInput("");
      await processLinkedIn(value);
      return;
    }

    if (step === "native_language") {
      if (!value) { setError("Please type your native language."); return; }
      setError(null);
      addUser(value);
      setInput("");
      setProfile((prev) => ({ ...(prev ?? {}), nativeLanguage: value }));
      await loadModules(answers);
      return;
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  async function processLinkedIn(url: string) {
    setStep("processing_linkedin");

    const res = await fetch("/api/onboarding/linkedin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      addAgent("Sorry, I couldn't read that link. Please check it and try again.");
      setStep("awaiting_linkedin");
      return;
    }

    const { profile: p } = await res.json();
    const fullProfile = { ...p, linkedinUrl: url };
    setProfile(fullProfile);

    const name = p.firstName ?? "there";
    const role = p.jobTitle ? `a ${p.jobTitle}` : "a professional";
    const at = p.company ? ` at ${p.company}` : "";
    addAgent(
      `Hey ${name}! 👋 I see you're ${role}${at} — nice. I'll ask just 3 quick questions (no essays, I promise 😄). Tap the answers that fit, then hit Continue. Here we go:`
    );
    await fetchNextQuestion(fullProfile, []);
  }

  // Fetches the next adaptive question (stage 1 then stage 2) and shows it.
  async function fetchNextQuestion(
    profileForQuestions: Profile,
    prior: { question: string; answer: string }[]
  ) {
    setThinking(true);
    const qRes = await fetch("/api/onboarding/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: profileForQuestions, priorAnswers: prior }),
    });
    setThinking(false);

    if (!qRes.ok) {
      addAgent("Oops, my brain hiccuped. Mind trying that again?");
      return;
    }
    const { question } = await qRes.json();
    if (!question) {
      addAgent("Oops, my brain hiccuped. Mind trying that again?");
      return;
    }

    setQuestions((prev) => [...prev, question]);
    setCurrentQ(prior.length);
    setStep("questions");
    addAgent(`(${prior.length + 1}/3) ${question.question}`);
  }

  function toggleOption(option: string) {
    const single = questions[currentQ]?.single;
    setSelected((prev) => {
      if (single) return prev.includes(option) ? [] : [option];
      return prev.includes(option) ? prev.filter((o) => o !== option) : [...prev, option];
    });
  }

  async function confirmSelection() {
    if (selected.length === 0) return;
    const q = questions[currentQ];
    const answerText = selected.join(", ");
    addUser(answerText);
    const newAnswers = [...answers, { question: q.question, answer: answerText }];
    setAnswers(newAnswers);
    setSelected([]);

    if (newAnswers.length === 1) {
      // Q1 answered → generate the adaptive follow-up (Q2).
      await fetchNextQuestion(profile ?? {}, newAnswers);
    } else if (newAnswers.length === 2) {
      // Q2 answered → show the fixed English-level question (Q3).
      setQuestions((prev) => [...prev, LEVEL_QUESTION]);
      setCurrentQ(2);
      addAgent(`(3/3) ${LEVEL_QUESTION.question}`);
    } else {
      // Q3 (level) answered → ask for native language.
      setStep("native_language");
      addAgent(
        "Brilliant. One last thing — what's your native language? (Type it below. There are no wrong answers… unless you say Klingon. 😄)"
      );
    }
  }

  // After the questions, ask the AI to propose 10 course modules to choose from.
  async function loadModules(finalAnswers: { question: string; answer: string }[]) {
    setStep("loading_modules");

    const res = await fetch("/api/onboarding/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile, answers: finalAnswers }),
    });

    if (!res.ok) {
      addAgent("Sorry, something went wrong. Please try again.");
      setStep("questions");
      return;
    }

    const { modules: mods } = await res.json();
    if (!mods?.length) {
      addAgent("Sorry, something went wrong. Please try again.");
      setStep("questions");
      return;
    }

    setModules(mods);
    setSelectedModules([]);
    setStep("modules");
    addAgent(`Here are 10 topics for your course. Pick the ones you need — up to ${MAX_MODULES}. I'll make 5 practice scenarios for each.`);
  }

  function toggleModule(title: string) {
    setSelectedModules((prev) => {
      if (prev.includes(title)) return prev.filter((t) => t !== title);
      if (prev.length >= MAX_MODULES) return prev;
      return [...prev, title];
    });
  }

  async function confirmModules() {
    if (selectedModules.length === 0) return;
    const chosen = modules.filter((m) => selectedModules.includes(m.title));
    addUser(`I'll go with: ${chosen.map((m) => m.title).join(", ")}.`);
    setStep("generating");

    if (!session?.user) {
      addAgent("Almost done! Sign in to save your course.");
      sessionStorage.setItem("pending_profile", JSON.stringify(profile));
      sessionStorage.setItem("pending_answers", JSON.stringify(answers));
      sessionStorage.setItem("pending_modules", JSON.stringify(chosen));
      return;
    }

    await runGeneration(profile, answers, chosen);
  }

  // Calls the generation endpoint and routes to /home. Used both for the
  // logged-in flow and when resuming after a sign-in redirect.
  async function runGeneration(
    profileData: Profile | null,
    finalAnswers: { question: string; answer: string }[],
    chosenModules: Module[]
  ) {
    setStep("generating");
    const count = chosenModules.length * 5;
    addAgent(`Great! Building your course now — ${count} scenarios. One moment ✨`);

    const res = await fetch("/api/onboarding/generate-scenarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profile: profileData, answers: finalAnswers, modules: chosenModules }),
    });

    if (!res.ok) {
      addAgent("Sorry, something went wrong. Please try again.");
      setStep("done");
      return;
    }

    sessionStorage.removeItem("pending_profile");
    sessionStorage.removeItem("pending_answers");
    sessionStorage.removeItem("pending_modules");
    setStep("done");
    addAgent("Your course is ready! Let's go 🎉");
    setTimeout(() => router.push("/home"), 1800);
  }

  const currentQuestion = step === "questions" ? questions[currentQ] : null;

  // While auth is resolving — or a logged-in user is being routed to their
  // course — show a loader instead of flashing the onboarding chat.
  const showLoader =
    status === "loading" ||
    redirecting ||
    (status === "authenticated" && !onboardingChecked);

  if (showLoader) {
    return (
      <main className="grain flex min-h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="grain min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-5 py-4 sm:px-8 sm:py-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground text-lg">
              🔊
            </div>
            <span className="font-display text-2xl leading-none">Chatterbox</span>
          </a>
          {status === "unauthenticated" && (
            <a
              href="/login"
              className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium transition-all hover:border-foreground hover:shadow-pop"
            >
              Log in
            </a>
          )}
        </header>

        {/* Hero */}
        <section className="mt-5 sm:mt-7">
          <h1 className="font-display text-3xl leading-[1.15] sm:text-5xl">
            Your career. Your{" "}
            <em className="bg-accent px-1.5 italic text-accent-foreground">English</em>{" "}
            conversation course.
          </h1>
          <p className="mt-4 text-sm text-muted-foreground sm:text-base">
            Chatterbox turns your LinkedIn profile into a personalized English conversation course focused on what you need to succeed at work.
          </p>
        </section>

        {/* Chat card */}
        <section className="mt-5 flex-1">
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-soft">
            <div className="h-1 w-full bg-muted">
              <div
                className="h-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${progress * 100}%` }}
              />
            </div>

            <div
              ref={scrollRef}
              className="max-h-[57vh] min-h-[330px] space-y-4 overflow-y-auto px-5 py-5 sm:px-7"
            >
              {messages.map((m) =>
                m.role === "agent" ? (
                  <AgentBubble key={m.id} text={m.text} />
                ) : (
                  <UserBubble key={m.id} text={m.text} />
                )
              )}
              {busy && <TypingBubble />}

              {/* Multiple-choice answers (select one or more) */}
              {currentQuestion && !busy && (
                <div className="flex flex-col gap-2 pl-11">
                  <span className="text-xs text-muted-foreground">
                    {currentQuestion.single ? "Choose one" : "Select all that apply"}
                  </span>
                  {currentQuestion.options.map((option, i) => {
                    const isSelected = selected.includes(option);
                    const rounded = currentQuestion.single ? "rounded-full" : "rounded-md";
                    return (
                      <button
                        key={i}
                        onClick={() => toggleOption(option)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] leading-snug transition-all ${
                          isSelected
                            ? "border-foreground bg-accent text-accent-foreground shadow-pop"
                            : "border-border bg-card hover:border-foreground hover:shadow-pop"
                        }`}
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center border ${rounded} ${
                            isSelected ? "border-foreground bg-foreground text-background" : "border-muted-foreground/40"
                          }`}
                        >
                          {isSelected && <CheckIcon />}
                        </span>
                        {option}
                      </button>
                    );
                  })}
                  <button
                    onClick={confirmSelection}
                    disabled={selected.length === 0}
                    className="mt-1 self-start rounded-2xl bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground transition-transform hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue
                  </button>
                </div>
              )}

              {/* Module selection (pick up to MAX_MODULES) */}
              {step === "modules" && !busy && (
                <div className="flex flex-col gap-2 pl-11">
                  <span className="text-xs text-muted-foreground">
                    {selectedModules.length}/{MAX_MODULES} selected
                  </span>
                  {modules.map((mod, i) => {
                    const isSelected = selectedModules.includes(mod.title);
                    const atLimit = !isSelected && selectedModules.length >= MAX_MODULES;
                    return (
                      <button
                        key={i}
                        onClick={() => toggleModule(mod.title)}
                        disabled={atLimit}
                        className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-all ${
                          isSelected
                            ? "border-foreground bg-accent text-accent-foreground shadow-pop"
                            : atLimit
                              ? "border-border bg-card opacity-40"
                              : "border-border bg-card hover:border-foreground hover:shadow-pop"
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border ${
                            isSelected ? "border-foreground bg-foreground text-background" : "border-muted-foreground/40"
                          }`}
                        >
                          {isSelected && <CheckIcon />}
                        </span>
                        <span>
                          <span className="block text-[15px] font-medium leading-snug">{mod.title}</span>
                          <span className={`block text-[13px] leading-snug ${isSelected ? "text-accent-foreground/80" : "text-muted-foreground"}`}>
                            {mod.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                  <button
                    onClick={confirmModules}
                    disabled={selectedModules.length === 0}
                    className="mt-1 self-start rounded-2xl bg-primary px-5 py-2.5 text-[15px] font-medium text-primary-foreground transition-transform hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Create my course ({selectedModules.length * 5} scenarios)
                  </button>
                </div>
              )}

              {/* Sign-in gate */}
              {step === "generating" && !session?.user && (
                <div className="flex flex-col gap-2 pl-11">
                  {providers.includes("linkedin") && (
                    <button
                      onClick={() => signIn("linkedin")}
                      className="w-full rounded-2xl bg-primary px-4 py-3 text-center text-[15px] font-medium text-primary-foreground transition-transform hover:translate-y-[-1px]"
                    >
                      Continue with LinkedIn
                    </button>
                  )}
                  {providers.includes("google") && (
                    <button
                      onClick={() => signIn("google")}
                      className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-center text-[15px] font-medium transition-all hover:border-foreground hover:shadow-pop"
                    >
                      Continue with Google
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Composer — text input for the LinkedIn URL and native language steps */}
            {(step === "awaiting_linkedin" ||
              step === "processing_linkedin" ||
              step === "native_language") && (
              <form
                onSubmit={handleSubmit}
                className="border-t border-border bg-background/60 px-3 py-3 sm:px-4 sm:py-4"
              >
                {error && (
                  <div className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    {error}
                  </div>
                )}
                <div className="flex items-end gap-2 rounded-2xl border border-border bg-card px-3 py-2 transition-shadow focus-within:border-foreground focus-within:shadow-pop">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onKey}
                    placeholder={
                      step === "native_language"
                        ? "e.g. Spanish, Portuguese, Mandarin…"
                        : "https://linkedin.com/in/your-handle"
                    }
                    disabled={step === "processing_linkedin"}
                    rows={1}
                    maxLength={step === "native_language" ? 40 : 300}
                    className="min-h-[24px] flex-1 resize-none border-0 bg-transparent py-1.5 text-[15px] leading-snug placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-60"
                  />
                  <button
                    type="submit"
                    disabled={step === "processing_linkedin" || !input.trim()}
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-transform hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Send"
                  >
                    <SendIcon />
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            We only use your profile to build your course — nothing else.
          </p>
        </section>

        <footer className="mt-5 flex items-center justify-between border-t border-border pt-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Chatterbox</span>
          <span className="font-display text-sm italic">Speak the job you're already doing.</span>
        </footer>
      </div>
    </main>
  );
}

function AgentBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-base text-primary-foreground">
        S
      </div>
      <div className="inline-block w-fit max-w-[85%] whitespace-pre-wrap pt-0.5 text-[15px] leading-relaxed text-foreground">
        {text}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] leading-relaxed text-primary-foreground shadow-soft">
        {text}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-display text-base text-primary-foreground">
        S
      </div>
      <div className="flex h-8 items-center gap-1 rounded-2xl bg-muted px-3">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}

function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
