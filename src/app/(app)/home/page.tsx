import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { ScenarioGrid } from "@/components/scenario/ScenarioGrid";

export default async function HomePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, jobTitle: true, company: true, onboardingDone: true },
  });

  if (!user?.onboardingDone) redirect("/");

  const groups = await prisma.scenarioGroup.findMany({
    where: { userId: session.user.id },
    orderBy: { orderIndex: "asc" },
    include: {
      scenarios: {
        orderBy: { id: "asc" },
      },
    },
  });

  const firstName = user.name?.split(" ")[0] ?? "there";

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-4xl leading-tight">Welcome, {firstName}</h1>
        {user.jobTitle && (
          <p className="text-sm text-muted-foreground mt-1">
            {user.jobTitle}{user.company ? ` · ${user.company}` : ""}
          </p>
        )}
      </div>

      <ScenarioGrid groups={groups} />
    </div>
  );
}
