import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ScenarioGrid } from "@/components/scenario/ScenarioGrid";
import { readObjectives } from "@/lib/objectives";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from "lucide-react";

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      groups: {
        orderBy: { orderIndex: "asc" },
        include: { scenarios: { orderBy: { id: "asc" } } },
      },
    },
  });

  if (!course || course.userId !== session.user.id) notFound();

  const groupsWithGrammar = course.groups.map((g) => ({
    id: g.id,
    title: g.title,
    scenarios: g.scenarios.map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      grammar: readObjectives(s.objectives).grammarFocus ?? null,
    })),
  }));

  return (
    <div className="max-w-2xl mx-auto">
      <Link
        href="/home"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        My courses
      </Link>

      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-4xl leading-tight">{course.title}</h1>
          {course.cefrLevel && (
            <Badge className="bg-accent text-accent-foreground text-xs">CEFR {course.cefrLevel}</Badge>
          )}
        </div>
        {course.company && (
          <p className="mt-1 text-sm text-muted-foreground">{course.company}</p>
        )}
      </div>

      <ScenarioGrid groups={groupsWithGrammar} />
    </div>
  );
}
