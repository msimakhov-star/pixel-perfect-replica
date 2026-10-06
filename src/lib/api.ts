// All engine calls live here. Swap the mock bodies for real backend calls
// once the `extract` and `simulate` functions exist.
import type { ProblemSpec, Round, RunRecord } from "@/engine/types";
import { SAMPLE_SPECS, reference } from "./physics";
import { mockSimulationHtml } from "./mockSim";

export const MODEL_NAME = "gpt-6-astra";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function extract({ imageBase64 }: { imageBase64: string }): Promise<ProblemSpec> {
  await wait(1500);
  const m = imageBase64.match(/sample:(projectile|pendulum|incline)/);
  return structuredClone(SAMPLE_SPECS[(m?.[1] as keyof typeof SAMPLE_SPECS) ?? "projectile"]);
}

export async function simulate({ spec }: { spec: ProblemSpec; feedback?: string | undefined }) {
  await wait(1500);
  return { html: mockSimulationHtml(spec), usage: { costUsd: 0.12 + Math.random() * 0.06 } };
}

/** Runs simulate in rounds until the measurement matches the formula. */
export async function runExperiment(
  spec: ProblemSpec,
  onRound: (r: Round) => void,
  onPhase: (phase: number) => void,
): Promise<RunRecord> {
  const ref = reference(spec);
  const rounds: Round[] = [];
  const errors = [9.4, 0.8];
  let html = "";
  let feedback: string | undefined;
  for (let i = 0; i < errors.length; i++) {
    const t0 = performance.now();
    onPhase(1);
    const res = await simulate({ spec, feedback });
    html = res.html;
    onPhase(2);
    await wait(700);
    onPhase(3);
    await wait(500);
    const err = errors[i] ?? 0;
    const measured = ref.value * (1 + (i === 0 ? err : -err) / 100);
    const ok = err <= 2;
    const r: Round = {
      round: i + 1,
      measured,
      reference: ref.value,
      errorPct: err,
      perturbationPassed: ok,
      seconds: (performance.now() - t0) / 1000,
      costUsd: res.usage.costUsd,
      status: ok ? "match" : "mismatch",
      feedback: feedback ?? "Initial build from the problem spec.",
    };
    rounds.push(r);
    onRound(r);
    if (ok) break;
    feedback = `Measured ${measured.toFixed(2)} ${ref.unit} vs formula ${ref.value.toFixed(2)} ${ref.unit} (${err}% off). Timestep too coarse — use a smaller dt and measure at the exact crossing.`;
  }
  return {
    id: `run-${Date.now()}`,
    spec,
    rounds,
    finalHtml: html,
    unit: ref.unit,
    totalCostUsd: rounds.reduce((s, r) => s + r.costUsd, 0),
  };
}

export async function listReplays(): Promise<{ id: string; title: string }[]> {
  const r = await fetch("/replays/index.json");
  if (!r.ok) throw new Error("Could not load replays");
  return r.json();
}

export async function loadReplay(id: string): Promise<RunRecord> {
  const r = await fetch(`/replays/${id}.json`);
  if (!r.ok) throw new Error("Could not load replay");
  const rec = (await r.json()) as RunRecord;
  if (!rec.finalHtml) rec.finalHtml = mockSimulationHtml(rec.spec);
  return rec;
}
