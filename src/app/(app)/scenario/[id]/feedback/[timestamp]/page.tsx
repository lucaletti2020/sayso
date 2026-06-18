import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

type Feedback = {
  overallScore: number;
  fluency: number;
  vocabulary: number;
  grammar: number;
  improvements: string[];
  summary: string;
};

function ScoreCircle({ label, value }: { label: string; value: number }) {
  const color = value >= 75 ? "text-green-600" : value >= 50 ? "text-yellow-600" : "text-red-500";
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={`text-2xl font-bold ${color}`}>{Math.round(value)}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ id: string; timestamp: string }>;
}) {
  const { id, timestamp } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const ms = Number(timestamp);
  if (!Number.isFinite(ms)) notFound();

  const attempt = await prisma.userAttempt.findFirst({
    where: {
      userId: session.user.id,
      scenarioId: id,
      type: "SIMULATION",
      createdAt: new Date(ms),
    },
    include: { scenario: { select: { title: true } } },
  });

  if (!attempt || !attempt.feedbackJson) notFound();

  const feedback = attempt.feedbackJson as unknown as Feedback;
  const when = attempt.createdAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href={`/scenario/${id}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to scenario
      </Link>

      <h1 className="font-display text-4xl leading-tight mb-1">Your feedback</h1>
      <p className="text-sm text-muted-foreground mb-6">
        {attempt.scenario.title} · {when}
      </p>

      <div className="rounded-2xl border p-6 mb-6">
        <div className="flex justify-around mb-6">
          <ScoreCircle label="Overall" value={feedback.overallScore} />
          <ScoreCircle label="Fluency" value={feedback.fluency} />
          <ScoreCircle label="Vocabulary" value={feedback.vocabulary} />
          <ScoreCircle label="Grammar" value={feedback.grammar} />
        </div>
        <p className="text-sm text-center text-muted-foreground">{feedback.summary}</p>
      </div>

      <div className="rounded-2xl border p-6 mb-8">
        <h3 className="text-sm font-semibold text-blue-700 mb-3">How to improve</h3>
        <ul className="flex flex-col gap-2">
          {feedback.improvements?.map((imp, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-blue-500 shrink-0">→</span> {imp}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex gap-3">
        <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
          My progress
        </Link>
        <Link href={`/scenario/${id}/simulation`} className={buttonVariants({ className: "flex-1" })}>
          Try again
        </Link>
      </div>
    </div>
  );
}
