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
    </div>
  );
}
