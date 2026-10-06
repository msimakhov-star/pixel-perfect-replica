import type { ProblemSpec } from "@/engine/types";

export const UNITS: Record<string, string> = {
  v0: "m/s", angle: "°", h: "m", g: "m/s²", L: "m", theta: "°", length: "m", mu: "",
};

export const GIVEN_KEYS = ["v0", "angle", "h", "g", "L", "theta", "length", "mu"] as const;
export const UNKNOWNS = ["range", "maxHeight", "flightTime", "period", "time", "finalSpeed", "acceleration", "none"] as const;

const rad = (d: number) => (d * Math.PI) / 180;

function need(spec: ProblemSpec, k: string): number {
  const v = spec.given[k];
  if (v === undefined || !Number.isFinite(v)) throw new Error(`Missing value "${k}" needed for the formula`);
  return v;
}

/**
 * Deterministic closed-form solvers. These are the ground truth the
 * generated experiment is checked against; they never call a model.
 */
export function reference(spec: ProblemSpec): { value: number; unit: string; label: string } {
  const g = need(spec, "g");
  if (g <= 0) throw new Error("g must be positive");

  if (spec.topic === "projectile") {
    const v = need(spec, "v0");
    const a = rad(need(spec, "angle"));
    const h = spec.given["h"] ?? 0;
    const vx = v * Math.cos(a);
    const vy = v * Math.sin(a);
    const T = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
    switch (spec.unknown) {
      case "range": return { value: vx * T, unit: "m", label: h ? "R = vₓ·(v_y+√(v_y²+2gh))/g" : "R = v₀² sin2θ / g" };
      case "flightTime": return { value: T, unit: "s", label: "T = (v_y+√(v_y²+2gh))/g" };
      case "maxHeight": return { value: h + (vy * vy) / (2 * g), unit: "m", label: "H = h + v_y² / 2g" };
    }
  }

  if (spec.topic === "pendulum" && spec.unknown === "period") {
    const L = need(spec, "L");
    const th = rad(spec.given["theta"] ?? 0);
    const T0 = 2 * Math.PI * Math.sqrt(L / g);
    // Finite-amplitude series correction (accurate to < 0.1% below ~60°).
    const T = T0 * (1 + (th * th) / 16 + (11 * th ** 4) / 3072);
    return { value: T, unit: "s", label: "T = 2π√(L/g)·(1 + θ²/16 + …)" };
  }

  if (spec.topic === "incline") {
    const th = rad(need(spec, "theta"));
    const mu = spec.given["mu"] ?? 0;
    const a = g * (Math.sin(th) - mu * Math.cos(th));
    if (a <= 0) throw new Error("With this friction the block does not slide, so there is nothing to measure");
    switch (spec.unknown) {
      case "acceleration": return { value: a, unit: "m/s²", label: "a = g(sinθ − μcosθ)" };
      case "time": return { value: Math.sqrt((2 * need(spec, "length")) / a), unit: "s", label: "t = √(2d / a)" };
      case "finalSpeed": return { value: Math.sqrt(2 * a * need(spec, "length")), unit: "m/s", label: "v = √(2ad)" };
    }
  }

  throw new Error(`No formula for "${spec.unknown}" in a ${spec.topic} problem`);
}

export function perturbed(spec: ProblemSpec): ProblemSpec {
  return { ...spec, given: { ...spec.given, g: need(spec, "g") * 1.1 } };
}
