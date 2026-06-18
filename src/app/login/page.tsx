"use client";

import { useEffect, useState } from "react";
import { signIn, getProviders } from "next-auth/react";

export default function LoginPage() {
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    getProviders().then((p) => setProviders(p ? Object.keys(p) : []));
  }, []);

  return (
    <main className="grain flex min-h-screen items-center justify-center bg-background px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-2xl text-accent-foreground">
            🔊
          </div>
          <h1 className="font-display text-4xl leading-none">Chatterbox</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Sign in to pick up your personalised course.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card p-5 shadow-soft">
          {providers.includes("linkedin") && (
            <button
              onClick={() => signIn("linkedin", { callbackUrl: "/home" })}
              className="w-full rounded-2xl bg-primary px-4 py-3 text-center text-[15px] font-medium text-primary-foreground transition-transform hover:translate-y-[-1px]"
            >
              Continue with LinkedIn
            </button>
          )}
          {providers.includes("google") && (
            <button
              onClick={() => signIn("google", { callbackUrl: "/home" })}
              className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-center text-[15px] font-medium transition-all hover:border-foreground hover:shadow-pop"
            >
              Continue with Google
            </button>
          )}
        </div>

        <p className="mt-6 text-center font-display text-sm italic text-muted-foreground">
          Speak the job you're already doing.
        </p>
      </div>
    </main>
  );
}
