import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = session.user.id;

  const [groups, attempts] = await Promise.all([
    prisma.scenarioGroup.findMany({
      where: { userId },
      orderBy: { orderIndex: "asc" },
      include: { scenarios: { select: { id: true, status: true } } },
    }),
    prisma.userAttempt.findMany({
      where: { userId, type: "SIMULATION" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { scenario: { select: { title: true } } },
    }),
  ]);

  const totalScenarios = groups.reduce((a, g) => a + g.scenarios.length, 0);
  const completedScenarios = groups.reduce(
    (a, g) => a + g.scenarios.filter((s) => s.status === "COMPLETED").length,
    0
  );
  const scores = attempts.map((a) => a.score).filter((s): s is number => s !== null);
  const avgScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

  return NextResponse.json({
    totalScenarios,
    completedScenarios,
    avgScore,
    groups: groups.map((g) => ({
      title: g.title,
      total: g.scenarios.length,
      completed: g.scenarios.filter((s) => s.status === "COMPLETED").length,
    })),
    recentAttempts: attempts.map((a) => ({
      id: a.id,
      scenarioId: a.scenarioId,
      timestamp: a.createdAt.getTime(),
      scenarioTitle: a.scenario.title,
      score: a.score,
      createdAt: a.createdAt,
    })),
  });
}
