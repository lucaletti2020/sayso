"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Lock, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

type Scenario = {
  id: string;
  title: string;
  description: string;
  status: "UNLOCKED" | "IN_PROGRESS" | "COMPLETED";
};

type Group = {
  id: string;
  title: string;
  scenarios: Scenario[];
};

function statusIcon(status: Scenario["status"]) {
  if (status === "COMPLETED") return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (status === "IN_PROGRESS") return <Circle className="h-4 w-4 text-blue-500 fill-blue-100" />;
  return <Circle className="h-4 w-4 text-muted-foreground" />;
}

function statusBadge(status: Scenario["status"]) {
  if (status === "COMPLETED") return <Badge variant="secondary" className="text-green-700 bg-green-100">Done</Badge>;
  if (status === "IN_PROGRESS") return <Badge variant="secondary" className="text-blue-700 bg-blue-100">In progress</Badge>;
  return null;
}

function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const router = useRouter();
  return (
    <button
      onClick={() => router.push(`/scenario/${scenario.id}`)}
      className="w-full text-left flex items-start gap-3 rounded-xl border bg-background p-4 transition-colors hover:bg-muted/50 hover:border-primary/40"
    >
      <div className="mt-0.5 shrink-0">{statusIcon(scenario.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{scenario.title}</span>
          {statusBadge(scenario.status)}
        </div>
      </div>
    </button>
  );
}

function GroupCard({ group, defaultOpen }: { group: Group; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const completed = group.scenarios.filter((s) => s.status === "COMPLETED").length;

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-base">{group.title}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {completed}/{group.scenarios.length}
            </span>
          </div>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </CardHeader>
      {open && (
        <CardContent className="flex flex-col gap-2 pt-0">
          {group.scenarios.map((s) => (
            <ScenarioCard key={s.id} scenario={s} />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function ScenarioGrid({ groups }: { groups: Group[] }) {
  if (groups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No scenarios yet. Complete onboarding to generate your course.
      </p>
    );
  }
  // The "current" module is the first one that still has unfinished scenarios.
  // For a brand-new user that's the top module; once a module is fully done,
  // the next one becomes current. Falls back to the first module.
  const currentGroupId =
    groups.find((g) => g.scenarios.some((s) => s.status !== "COMPLETED"))?.id ?? groups[0]?.id;

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <GroupCard key={g.id} group={g} defaultOpen={g.id === currentGroupId} />
      ))}
    </div>
  );
}
