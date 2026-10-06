import type { ProblemSpec, Topic } from "@/engine/types";

export const UNITS: Record<string, string> = {
  v0: "m/s", angle: "°", g: "m/s²", L: "m", theta: "°", mass: "kg", mu: "", length: "m", h: "m",
};

export const SAMPLE_SPECS: Record<Exclude<Topic, "unsupported">, ProblemSpec> = {
  projectile: {
    topic: "projectile",
    given: { v0: 50, angle: 45, g: 9.8 },
    unknown: "range",
    questionText: "A cannon fires a ball at 50 m/s at 45°. How far does it land?",
    confidence: 0.92,
    assumptions: ["No air resistance", "Launch and landing at same height"],
    readFromPhoto: ["v₀ = 50 m/s", "θ = 45°", "g = 9.8 m/s²", "Find: range R"],
  },
  pendulum: {
    topic: "pendulum",
    given: { L: 2, theta: 10, g: 9.8 },
    unknown: "period",
    questionText: "A pendulum of length 2 m swings through 10°. What is its period?",
    confidence: 0.55,
    assumptions: ["Small-angle approximation", "Massless string"],
    readFromPhoto: ["L = string length", "θ from vertical", "T = 2π√(L/g)"],
  },
  incline: {
    topic: "incline",
    given: { theta: 30, length: 5, g: 9.8 },
    unknown: "time",
    questionText: "A block slides from rest down a 5 m frictionless ramp at 30°. How long does it take?",
    confidence: 0.81,
    assumptions: ["Frictionless surface", "Starts from rest"],
    readFromPhoto: ["θ = angle of incline", "a = g sin θ", "No friction"],
  },
};

export function reference(spec: ProblemSpec): { value: number; unit: string; label: string } {
  const g = spec.given['g'] ?? 9.8;
  const rad = (d: number) => (d * Math.PI) / 180;
  if (spec.topic === "projectile") {
    const v = spec.given['v0'] ?? 0;
    return { value: (v * v * Math.sin(2 * rad(spec.given['angle'] ?? 45))) / g, unit: "m", label: "R = v₀² sin2θ / g" };
  }
  if (spec.topic === "pendulum") {
    return { value: 2 * Math.PI * Math.sqrt((spec.given['L'] ?? 1) / g), unit: "s", label: "T = 2π √(L/g)" };
  }
  if (spec.topic === "incline") {
    const a = g * Math.sin(rad(spec.given['theta'] ?? 30));
    return { value: Math.sqrt((2 * (spec.given['length'] ?? 1)) / a), unit: "s", label: "t = √(2d / g sinθ)" };
  }
  return { value: 0, unit: "", label: "" };
}
