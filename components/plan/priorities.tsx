"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setPreferencesAction } from "@/app/actions";
import { LifestyleSlider } from "./lifestyle-slider";

export function Priorities({ weight }: { weight: number }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className={pending ? "opacity-70" : undefined}>
      <LifestyleSlider value={weight} onCommit={(v) => start(async () => { await setPreferencesAction({ lifestyleWeight: v }); router.refresh(); })} />
      <p className="mt-3 text-[13px] text-muted">Link uses this to decide how much of your surplus to plan around, and how hard to push on spending.</p>
    </div>
  );
}
