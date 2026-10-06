import { useEffect, useRef, useState } from "react";

export function useElapsed(running: boolean) {
  const [s, setS] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (!running) return;
    start.current = performance.now();
    setS(0);
    const id = setInterval(() => setS((performance.now() - start.current) / 1000), 100);
    return () => clearInterval(id);
  }, [running]);
  return s;
}

export function CountUp({ value, decimals = 2 }: { value: number; decimals?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 1100);
      setV(value * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{v.toFixed(decimals)}</>;
}

export const STEPS = ["Snap", "Read", "Experiment", "Check"] as const;

export function Progress({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((label, i) => (
        <li key={label} className="flex items-center gap-2 sm:gap-4">
          <span
            className={`flex items-center gap-2 font-mono text-xs uppercase tracking-widest transition-colors ${
              i <= step ? "text-foreground" : "text-muted-foreground/50"
            }`}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] transition-all ${
                i < step
                  ? "border-primary bg-primary text-primary-foreground"
                  : i === step
                    ? "border-accent text-accent shadow-[0_0_16px] shadow-accent/40"
                    : "border-border"
              }`}
            >
              {i + 1}
            </span>
            <span className="hidden sm:inline">{label}</span>
          </span>
          {i < STEPS.length - 1 && (
            <span className={`h-px w-6 sm:w-12 ${i < step ? "bg-primary" : "bg-border"}`} />
          )}
        </li>
      ))}
    </ol>
  );
}
