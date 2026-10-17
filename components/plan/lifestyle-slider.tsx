"use client";

import { Slider } from "radix-ui";
import { useState } from "react";

/** The one dial that sets Link's optimization objective: speed to goals vs. today's lifestyle. */
export function LifestyleSlider({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  return (
    <div>
      <Slider.Root
        className="relative flex h-6 w-full touch-none select-none items-center"
        min={0}
        max={100}
        step={5}
        value={[v]}
        onValueChange={([x]) => setV(x!)}
        onValueCommit={([x]) => onCommit(x!)}
        aria-label="Balance between reaching goals sooner and protecting today's lifestyle"
      >
        <Slider.Track className="relative h-1.5 grow rounded-full bg-surface-3">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb className="block h-5 w-5 rounded-full border border-line bg-surface shadow-soft outline-none focus-visible:ring-4 focus-visible:ring-[var(--focus)]" />
      </Slider.Root>
      <div className="mt-2 flex justify-between text-[12px] text-muted">
        <span>Reach goals sooner</span>
        <span>Protect today&apos;s lifestyle</span>
      </div>
    </div>
  );
}
