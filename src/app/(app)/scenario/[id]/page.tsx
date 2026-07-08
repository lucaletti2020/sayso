import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Mic, BookOpen, MessageCircle, Target, ArrowRight } from "lucide-react";
import { readObjectives } from "@/lib/objectives";

export default async function UnitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const scenario = await prisma.scenario.findUnique({
    where: { id },
    include: { group: true },
  });

  if (!scenario || scenario.userId !== session.user.id) notFound();

  const objectives = readObjectives(scenario.objectives);

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/home"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to my course
      </Link>

      <div className="mb-2 flex items-center gap-2">
        <Badge variant="secondary" className="text-xs">{scenario.group.title}</Badge>
        {objectives.unitNumber != null && (
          <Badge variant="secondary" className="text-xs">Unit {objectives.unitNumber}</Badge>
        )}
        {objectives.cefrLevel && (
          <Badge className="bg-accent text-accent-foreground text-xs">CEFR {objectives.cefrLevel}</Badge>
        )}
      </div>
      <h1 className="font-display text-4xl leading-tight mb-3">{scenario.title}</h1>
      <p className="text-muted-foreground mb-4">{scenario.description}</p>

      {(objectives.canDo || objectives.grammarFocus || objectives.vocabulary || objectives.functions?.length) && (
        <div className="mb-8 flex flex-col gap-3 rounded-xl border bg-muted/30 p-4">
          {objectives.canDo && (
            <div className="flex items-start gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">You'll practise</p>
                <p className="text-sm">{objectives.canDo}</p>
              </div>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-3 pl-6 text-xs">
            {objectives.grammarFocus && (
              <div>
                <p className="font-medium uppercase tracking-wide text-muted-foreground">Grammar</p>
                <p className="mt-0.5">{objectives.grammarFocus}</p>
              </div>
            )}
            {objectives.vocabulary && (
              <div>
                <p className="font-medium uppercase tracking-wide text-muted-foreground">Vocabulary</p>
                <p className="mt-0.5">{objectives.vocabulary}</p>
              </div>
            )}
            {objectives.functions?.length ? (
              <div>
                <p className="font-medium uppercase tracking-wide text-muted-foreground">Functions</p>
                <p className="mt-0.5">{objectives.functions.join("; ")}</p>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Your sessions
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {/* 1 — Pronunciation */}
        <Link href={`/scenario/${id}/pronunciation`} className="group block">
          <div className="flex h-full flex-col rounded-2xl border-2 border-border bg-card p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-foreground group-hover:shadow-pop">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Mic className="h-5 w-5" />
              </div>
              <span className="font-display text-2xl text-muted-foreground/40">1</span>
            </div>
            <h3 className="font-semibold mb-1">Pronunciation</h3>
            <p className="flex-1 text-sm text-muted-foreground">
              Repeat key sentences and get instant feedback on every word.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
              Start <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>

        {/* 2 — Grammar & Vocabulary (coming soon) */}
        <div className="flex h-full flex-col rounded-2xl border-2 border-dashed border-border bg-muted/20 p-5 opacity-70">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BookOpen className="h-5 w-5" />
            </div>
            <span className="font-display text-2xl text-muted-foreground/40">2</span>
          </div>
          <h3 className="font-semibold mb-1">Grammar &amp; Vocabulary</h3>
          <p className="flex-1 text-sm text-muted-foreground">
            Learn and practise this unit's grammar and key words.
          </p>
          <Badge variant="secondary" className="mt-4 w-fit text-xs">Coming soon</Badge>
        </div>

        {/* 3 — AI Conversation */}
        <Link href={`/scenario/${id}/simulation`} className="group block">
          <div className="flex h-full flex-col rounded-2xl border-2 border-border bg-card p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-foreground group-hover:shadow-pop">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <MessageCircle className="h-5 w-5" />
              </div>
              <span className="font-display text-2xl text-muted-foreground/40">3</span>
            </div>
            <h3 className="font-semibold mb-1">AI Conversation</h3>
            <p className="flex-1 text-sm text-muted-foreground">
              Role-play the situation live with your AI practice partner.
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium">
              Start <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
