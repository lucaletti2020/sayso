"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

type DashboardData = {
  totalScenarios: number;
  completedScenarios: number;
  avgScore: number | null;
  groups: { title: string; total: number; completed: number }[];
  recentAttempts: {
    id: string;
    scenarioId: string;
    timestamp: number;
    scenarioTitle: string;
    score: number | null;
    createdAt: string;
  }[];
};

function scoreColor(score: number) {
  if (score >= 75) return "text-green-600";
  if (score >= 50) return "text-yellow-600";
  return "text-red-500";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  const completionPct = data.totalScenarios
    ? Math.round((data.completedScenarios / data.totalScenarios) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="font-display text-4xl leading-tight mb-6">Progress</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{data.completedScenarios}</p>
            <p className="text-xs text-muted-foreground">of {data.totalScenarios} scenarios</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{completionPct}%</p>
            <Progress value={completionPct} className="mt-2 h-1.5" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. score</CardTitle>
          </CardHeader>
          <CardContent>
            {data.avgScore !== null ? (
              <p className={`text-3xl font-bold ${scoreColor(data.avgScore)}`}>{data.avgScore}</p>
            ) : (
              <p className="text-3xl font-bold text-muted-foreground">—</p>
            )}
            <p className="text-xs text-muted-foreground">from conversations</p>
          </CardContent>
        </Card>
      </div>

      {/* Group progress */}
      <h2 className="text-base font-semibold mb-4">Progress by topic</h2>
      <div className="grid gap-3 mb-8 sm:grid-cols-2">
        {data.groups.map((g) => (
          <div key={g.title} className="rounded-xl border p-4">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium truncate">{g.title}</span>
              <span className="text-xs text-muted-foreground ml-2 shrink-0">
                {g.completed}/{g.total}
              </span>
            </div>
            <Progress value={g.total ? (g.completed / g.total) * 100 : 0} className="h-1.5" />
          </div>
        ))}
      </div>

      {/* Recent attempts */}
      {data.recentAttempts.length > 0 && (
        <>
          <h2 className="text-base font-semibold mb-4">Your conversations</h2>
          <div className="flex flex-col gap-2">
            {data.recentAttempts.map((a) => (
              <Link
                key={a.id}
                href={`/scenario/${a.scenarioId}/feedback/${a.timestamp}`}
                className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors hover:bg-muted/50 hover:border-primary/40"
              >
                <div>
                  <p className="text-sm font-medium">{a.scenarioTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>
                {a.score !== null && (
                  <span className={`text-lg font-bold ${scoreColor(a.score)}`}>
                    {Math.round(a.score)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
