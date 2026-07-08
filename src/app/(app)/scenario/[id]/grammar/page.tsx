"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type GapQuestion = {
  type: "gap";
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  grammarPoint?: string;
};
type MatchPair = { left: string; right: string };
type MatchQuestion = {
  type: "match";
  kind: "translation" | "synonym" | "opposite" | "other";
  pairs: MatchPair[];
  explanation?: string;
};
type QuizQuestion = GapQuestion | MatchQuestion;

// Feedback sounds (lazy singletons so they're only created in the browser).
let correctSound: HTMLAudioElement | null = null;
let wrongSound: HTMLAudioElement | null = null;

function playCorrect() {
  if (typeof window === "undefined") return;
  correctSound ??= new Audio("/sounds/correct.mp3");
  correctSound.currentTime = 0;
  correctSound.play().catch(() => {});
}

function playWrong() {
  if (typeof window === "undefined") return;
  wrongSound ??= new Audio("/sounds/wrong.mp3");
  wrongSound.currentTime = 0;
  wrongSound.play().catch(() => {});
}

// Short celebratory fanfare for the results screen (synthesised — no asset).
function playFanfare() {
  if (typeof window === "undefined") return;
  try {
    const ctx = new AudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      osc.start(t);
      osc.stop(t + 0.65);
    });
  } catch {
    // Audio not available — celebration stays visual.
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Renders the gap sentence, showing the answer in the blank once revealed.
function GapSentence({ prompt, filled }: { prompt: string; filled: string | null }) {
  const parts = prompt.split("___");
  return (
    <p className="text-xl font-medium leading-relaxed">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 &&
            (filled ? (
              <span className="mx-0.5 rounded-md bg-accent px-1.5 text-accent-foreground">{filled}</span>
            ) : (
              <span className="mx-1 inline-block w-16 border-b-2 border-foreground/60 align-baseline">
                &nbsp;
              </span>
            ))}
        </span>
      ))}
    </p>
  );
}

function GapCard({
  question,
  onDone,
}: {
  question: GapQuestion;
  onDone: (correct: boolean) => void;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = answered && picked === question.correctIndex;

  return (
    <div>
      <GapSentence
        prompt={question.prompt}
        filled={answered ? question.options[question.correctIndex] : null}
      />

      <div className="mt-6 flex flex-col gap-2">
        {question.options.map((opt, i) => {
          let style = "border-border bg-card hover:border-foreground hover:shadow-pop";
          if (answered) {
            if (i === question.correctIndex) style = "border-green-500 bg-green-50 text-green-800";
            else if (i === picked) style = "border-red-400 bg-red-50 text-red-700";
            else style = "border-border bg-card opacity-50";
          }
          return (
            <button
              key={i}
              disabled={answered}
              onClick={() => {
                setPicked(i);
                if (i === question.correctIndex) playCorrect();
                else playWrong();
              }}
              className={`w-full rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-medium transition-all ${style}`}
            >
              {opt}
            </button>
          );
        })}
      </div>

      {answered && (
        <div
          className={`mt-5 rounded-2xl border p-4 ${
            correct ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          <p className={`font-semibold ${correct ? "text-green-700" : "text-red-700"}`}>
            {correct ? "Correct!" : "Not quite"}
          </p>
          {!correct && (
            <p className="mt-1 text-sm text-foreground">
              Correct answer: <strong>{question.options[question.correctIndex]}</strong>
            </p>
          )}
          {question.explanation && (
            <p className="mt-1 text-sm text-muted-foreground">{question.explanation}</p>
          )}
          <Button className="mt-3 w-full" onClick={() => onDone(correct)}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

function MatchCard({
  question,
  onDone,
}: {
  question: MatchQuestion;
  onDone: (correct: boolean) => void;
}) {
  // Right column shuffled once per mount.
  const rightOrder = useMemo(
    () => shuffle(question.pairs.map((_, i) => i)),
    [question]
  );
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<{ left: number; right: number } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const complete = matched.size === question.pairs.length;

  function pickRight(pairIndex: number) {
    if (selectedLeft === null || matched.has(pairIndex)) return;
    if (pairIndex === selectedLeft) {
      playCorrect();
      const next = new Set(matched);
      next.add(pairIndex);
      setMatched(next);
      setSelectedLeft(null);
    } else {
      playWrong();
      setMistakes((m) => m + 1);
      setWrongFlash({ left: selectedLeft, right: pairIndex });
      setTimeout(() => setWrongFlash(null), 500);
      setSelectedLeft(null);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        {question.kind === "opposite" ? "Match the opposites" : "Match the pairs"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-2">
          {question.pairs.map((p, i) => {
            const isMatched = matched.has(i);
            const isSelected = selectedLeft === i;
            const isWrong = wrongFlash?.left === i;
            return (
              <button
                key={i}
                disabled={isMatched}
                onClick={() => setSelectedLeft(isSelected ? null : i)}
                className={`min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-medium break-words transition-all ${
                  isMatched
                    ? "border-green-200 bg-green-50 text-green-700 opacity-60"
                    : isWrong
                      ? "border-red-400 bg-red-50 text-red-700"
                      : isSelected
                        ? "border-foreground bg-accent text-accent-foreground shadow-pop"
                        : "border-border bg-card hover:border-foreground"
                }`}
              >
                {p.left}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          {rightOrder.map((pairIndex) => {
            const isMatched = matched.has(pairIndex);
            const isWrong = wrongFlash?.right === pairIndex;
            return (
              <button
                key={pairIndex}
                disabled={isMatched}
                onClick={() => pickRight(pairIndex)}
                className={`min-h-12 rounded-xl border-2 px-3 py-2 text-sm font-medium break-words transition-all ${
                  isMatched
                    ? "border-green-200 bg-green-50 text-green-700 opacity-60"
                    : isWrong
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-border bg-card hover:border-foreground"
                }`}
              >
                {question.pairs[pairIndex].right}
              </button>
            );
          })}
        </div>
      </div>

      {complete && (
        <div
          className={`mt-5 rounded-2xl border p-4 ${
            mistakes === 0 ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          <p className={`font-semibold ${mistakes === 0 ? "text-green-700" : "text-amber-700"}`}>
            {mistakes === 0 ? "Perfect match!" : `Done — with ${mistakes} ${mistakes === 1 ? "slip" : "slips"}`}
          </p>
          {question.kind !== "translation" && question.explanation && (
            <p className="mt-1 text-sm text-muted-foreground">{question.explanation}</p>
          )}
          <Button className="mt-3 w-full" onClick={() => onDone(mistakes === 0)}>
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

export default function GrammarQuizPage() {
  const { id } = useParams<{ id: string }>();

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [done, setDone] = useState(false);
  const [attempt, setAttempt] = useState(0); // bump to remount question components

  async function loadQuiz(regenerate = false) {
    if (regenerate) setRegenerating(true);
    else setLoading(true);
    try {
      const res = await fetch("/api/scenario/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenarioId: id, regenerate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setQuestions(data.questions ?? []);
      setIndex(0);
      setResults([]);
      setDone(false);
      setAttempt((a) => a + 1);
    } catch {
      toast.error("Couldn't load the quiz. Please try again.");
    } finally {
      setLoading(false);
      setRegenerating(false);
    }
  }

  useEffect(() => {
    loadQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Celebrate on the results screen: fanfare + confetti bursts.
  useEffect(() => {
    if (!done) return;
    playFanfare();
    import("canvas-confetti").then(({ default: confetti }) => {
      confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
      setTimeout(() => confetti({ particleCount: 70, angle: 60, spread: 80, origin: { x: 0, y: 0.6 } }), 250);
      setTimeout(() => confetti({ particleCount: 70, angle: 120, spread: 80, origin: { x: 1, y: 0.6 } }), 450);
    });
  }, [done]);

  const current = questions[index];

  function handleDone(correct: boolean) {
    const nextResults = [...results, correct];
    setResults(nextResults);
    if (index + 1 >= questions.length) {
      setDone(true);
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <BookOpen className="h-7 w-7" />
        </div>
        <h1 className="font-display text-3xl leading-tight mb-2">Preparing your quiz</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The first time takes about 15 seconds — we're writing questions that cover this unit's grammar and vocabulary.
        </p>
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (done) {
    const score = results.filter(Boolean).length;
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <CheckCircle2 className="mx-auto mb-5 h-14 w-14 text-green-500" />
        <h1 className="font-display text-4xl leading-tight mb-2">
          {score}/{questions.length}
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          {score === questions.length
            ? "Perfect score — brilliant work!"
            : score >= questions.length * 0.7
              ? "Great job! Practise again to make it perfect."
              : "Good effort — one more round will make it stick."}
        </p>
        <div className="mx-auto flex max-w-sm flex-col gap-2">
          <Button size="lg" onClick={() => { setIndex(0); setResults([]); setDone(false); setAttempt((a) => a + 1); }}>
            Practise again
          </Button>
          <Link href={`/scenario/${id}`} className="w-full">
            <Button variant="outline" size="lg" className="w-full">Back to unit</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="max-w-2xl mx-auto text-sm text-muted-foreground">
        No quiz yet.{" "}
        <button onClick={() => loadQuiz(true)} className="underline">Generate it now</button>.
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <Link
          href={`/scenario/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to unit
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => loadQuiz(true)}
          disabled={regenerating}
          className="text-muted-foreground"
        >
          {regenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          <span className="ml-1.5">Regenerate</span>
        </Button>
      </div>

      <h1 className="font-display text-4xl leading-tight mb-1">Grammar &amp; Vocabulary</h1>

      {regenerating ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Creating a new quiz…
        </div>
      ) : (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between">
            <p className="text-sm font-semibold">
              Question {index + 1} of {questions.length}
            </p>
            {current.type === "gap" && current.grammarPoint && (
              <Badge variant="secondary" className="text-xs">{current.grammarPoint}</Badge>
            )}
          </div>
          <div className="mb-6 h-1 w-full rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${((index + 1) / questions.length) * 100}%` }}
            />
          </div>

          {current.type === "gap" ? (
            <GapCard key={`${attempt}-${index}`} question={current} onDone={handleDone} />
          ) : (
            <MatchCard key={`${attempt}-${index}`} question={current} onDone={handleDone} />
          )}
        </>
      )}
    </div>
  );
}
