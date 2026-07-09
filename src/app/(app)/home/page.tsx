import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ScenarioGrid } from "@/components/scenario/ScenarioGrid";
import { readObjectives } from "@/lib/objectives";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const courses = await prisma.course.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    include: {
      groups: {
        orderBy: { orderIndex: "asc" },
        include: { scenarios: { orderBy: { id: "asc" } } },
      },
    },
  });

  // No course yet → onboarding.
  if (courses.length === 0) redirect("/");

  // Welcome uses the first name from the user's FIRST course profile.
  const firstName = courses[0].firstName ?? session.user.name?.split(" ")[0] ?? "there";

  const header = (
    <div className="mb-8 flex items-start justify-between gap-4">
      <h1 className="font-display text-4xl leading-tight">Welcome, {firstName}</h1>
      <Link
        href="/?new=1"
        className={buttonVariants({ variant: "outline", className: "shrink-0" })}
      >
        <Plus className="h-4 w-4" />
        <span className="ml-1">New course</span>
      </Link>
    </div>
  );

  // Single course → show it directly (as before).
  if (courses.length === 1) {
    const groupsWithGrammar = courses[0].groups.map((g) => ({
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
        {header}
        <ScenarioGrid groups={groupsWithGrammar} />
      </div>
    );
  }

  // Multiple courses → "My Courses" list.
  return (
    <div className="max-w-2xl mx-auto">
      {header}
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        My courses
      </h2>
      <div className="flex flex-col gap-3">
        {courses.map((course) => {
          const scenarios = course.groups.flatMap((g) => g.scenarios);
          const completed = scenarios.filter((s) => s.status === "COMPLETED").length;
          return (
            <Link key={course.id} href={`/course/${course.id}`} className="group block">
              <div className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card p-5 transition-all group-hover:-translate-y-0.5 group-hover:border-foreground group-hover:shadow-pop">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{course.title}</h3>
                    {course.cefrLevel && (
                      <Badge className="bg-accent text-accent-foreground text-xs">
                        CEFR {course.cefrLevel}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {course.company ? `${course.company} · ` : ""}
                    {completed}/{scenarios.length} units completed
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
