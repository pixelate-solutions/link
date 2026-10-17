"use client";

import { Slider } from "@/components/ui/slider";
import { useState } from "react";

/** The one dial that sets Link's optimization objective: speed to goals vs. today's lifestyle. */
export function LifestyleSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  return (
    <div>
      <Slider
        min={0}
        max={100}
        step={5}
        value={[v]}
        onValueChange={([x]) => setV(x!)}
        onValueCommit={([x]) => onCommit(x!)}
        aria-label="Balance between reaching goals sooner and protecting today's lifestyle"
      />
      <div className="mt-2 flex justify-between text-[12px] text-muted">
        <span>Reach goals sooner</span>
        <span>Protect today&apos;s lifestyle</span>
      </div>
    </div>
  );
}
