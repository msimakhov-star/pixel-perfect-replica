import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, animate, useReducedMotion } from "framer-motion";

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
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setV(value); return; }
    const c = animate(0, value, { duration: 1.1, ease: [0.2, 0.7, 0.2, 1], onUpdate: setV });
    return () => c.stop();
  }, [value, reduce]);
  return <>{v.toFixed(decimals)}</>;
}

export const STEPS = ["Snap", "Read", "Experiment", "Check"] as const;

export function Progress({ step }: { step: number }) {
  const pct = (step / (STEPS.length - 1)) * 100;
  return (
    <div className="relative">
      <div className="absolute left-3 right-3 top-3 h-px bg-border" />
      <motion.div
        className="absolute left-3 top-3 h-px origin-left bg-primary"
        style={{ width: "calc(100% - 1.5rem)" }}
        initial={false}
        animate={{ scaleX: pct / 100 }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      <motion.div
        className="pointer-events-none absolute top-[7px] h-2.5 w-10 rounded-full bg-primary/50 blur-[3px]"
        initial={false}
        animate={{ left: `calc(${pct}% * 0.92)`, opacity: [0.4, 1, 0.4] }}
        transition={{ left: { type: "spring", stiffness: 120, damping: 20 }, opacity: { duration: 2, repeat: Infinity } }}
      />
      <ol className="relative flex items-center justify-between gap-6 sm:gap-12">
        {STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 bg-background pr-2 font-mono text-xs uppercase tracking-widest transition-colors ${i <= step ? "text-foreground" : "text-muted-foreground/50"}`}>
            <motion.span
              animate={{ scale: i === step ? 1.12 : 1 }}
              className={`flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${
                i < step ? "border-primary bg-primary text-primary-foreground" : i === step ? "border-accent text-accent shadow-[0_0_16px] shadow-accent/40" : "border-border"
              }`}
            >
              {i + 1}
            </motion.span>
            <span className="hidden sm:inline">{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function PendulumLoader() {
  return (
    <svg width="56" height="64" viewBox="0 0 56 64" aria-hidden>
      <line x1="10" y1="4" x2="46" y2="4" className="stroke-muted-foreground" strokeWidth="2" />
      <motion.g
        style={{ originX: "28px", originY: "4px" }}
        animate={{ rotate: [28, -28, 28] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <line x1="28" y1="4" x2="28" y2="48" className="stroke-foreground" strokeWidth="1.5" />
        <circle cx="28" cy="52" r="7" className="fill-accent" />
      </motion.g>
    </svg>
  );
}

export function AnimatedCheck() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <motion.path
        d="M3 8.5l3.2 3L13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.35 }}
      />
    </svg>
  );
}

export function Chip({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  return (
    <motion.button
      type="button"
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.95 }}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const id = Date.now();
        setRipples((p) => [...p, { id, x: e.clientX - r.left, y: e.clientY - r.top }]);
        setTimeout(() => setRipples((p) => p.filter((q) => q.id !== id)), 600);
        onClick?.();
      }}
      className={`relative overflow-hidden rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 font-mono text-xs text-primary ${className}`}
    >
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          className="pointer-events-none absolute h-8 w-8 rounded-full bg-primary/40"
          style={{ left: r.x - 16, top: r.y - 16 }}
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 5, opacity: 0 }}
          transition={{ duration: 0.6 }}
        />
      ))}
      <span className="relative">{children}</span>
    </motion.button>
  );
}
