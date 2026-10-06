// All engine calls live here. Model calls run on the server; measurement runs
// in a sandboxed iframe; the reference value comes from deterministic solvers.
import type { ProblemSpec, Round, RunRecord } from "@/engine/types";
import { reference, perturbed } from "./physics";
import { measureAll, MeasureError } from "./harness";
import { extractFn, simulateFn, saveRunFn, listRunsFn, getRunFn } from "./engine.functions";

export const MODEL_NAME = "gpt-6-astra";
export const MAX_ROUNDS = 3;
export const BUDGET_USD = 1.5;
export const TOLERANCE_PCT = 2;

export interface ExtractInput {
  imageBase64?: string;
  text?: string;
  currentSpec?: ProblemSpec;
  instruction?: string;
}

export async function extract(input: ExtractInput): Promise<ProblemSpec> {
  const { spec } = await extractFn({ data: input });
  return spec;
}

export async function simulate({ spec, feedback }: { spec: ProblemSpec; feedback?: string | undefined }) {
  const r = await simulateFn({ data: { spec, ...(feedback ? { feedback } : {}) } });
  return { html: r.html, usage: r.usage };
}

export async function imageUrlToDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the sample image"));
    r.readAsDataURL(blob);
  });
}

const pctErr = (m: number, ref: number) => (Math.abs(m - ref) / Math.abs(ref)) * 100;

/** Up to 3 rounds / $1.50: generate, measure in the sandbox, compare, feed back. */
export async function runExperiment(
  spec: ProblemSpec,
  onRound: (r: Round) => void,
  onPhase: (phase: number) => void,
): Promise<RunRecord> {
  const ref = reference(spec); // throws an honest error if unsolvable
  const refP = reference(perturbed(spec));
  const rounds: Round[] = [];
  let html = "";
  let feedback: string | undefined;
  let spent = 0;

  for (let i = 0; i < MAX_ROUNDS; i++) {
    if (spent >= BUDGET_USD) break;
    const t0 = performance.now();
    onPhase(1);
    const res = await simulate({ spec, feedback });
    spent += res.usage.costUsd;
    html = res.html;

    onPhase(2);
    let measured: number | null = null;
    let measuredP: number | null = null;
    let status: Round["status"];
    let note: string;
    try {
      const [a, b] = await measureAll(html, [spec.given, perturbed(spec).given]);
      measured = a ?? null;
      measuredP = b ?? null;
      status = "mismatch";
      note = "";
    } catch (e) {
      status = e instanceof MeasureError ? e.kind : "error";
      note = e instanceof Error ? e.message : String(e);
    }

    onPhase(3);
    const errorPct = measured != null ? pctErr(measured, ref.value) : null;
    const errP = measuredP != null ? pctErr(measuredP, refP.value) : null;
    const perturbationPassed = errP != null ? errP <= TOLERANCE_PCT : null;
    if (errorPct != null) status = errorPct <= TOLERANCE_PCT && perturbationPassed ? "match" : "mismatch";

    const r: Round = {
      round: i + 1, measured, reference: ref.value, errorPct, perturbationPassed,
      seconds: (performance.now() - t0) / 1000, costUsd: res.usage.costUsd, status,
      feedback: feedback ?? "Initial build from the problem spec.",
    };
    rounds.push(r);
    onRound(r);
    if (status === "match") break;

    feedback =
      status === "mismatch"
        ? `measure(given) returned ${measured?.toPrecision(6)} ${ref.unit}, which is ${errorPct?.toFixed(2)}% from the independent check (tolerance ${TOLERANCE_PCT}%). ` +
          `With g increased by 10% the result was ${errP?.toFixed(2)}% off. Check the equations of motion, units (degrees vs radians), the time step, and event interpolation.`
        : `The harness could not get a measurement: ${note}. window.measure(given) must be defined synchronously and return a finite number.`;
  }

  return {
    id: `run-${Date.now()}`, spec, rounds, finalHtml: html, unit: ref.unit,
    totalCostUsd: rounds.reduce((s, r) => s + r.costUsd, 0),
  };
}

export async function saveRun(rec: RunRecord): Promise<void> {
  const { id: _id, ...rest } = rec;
  await saveRunFn({ data: rest });
}

export async function listReplays(): Promise<{ id: string; title: string }[]> {
  return listRunsFn();
}

export async function loadReplay(id: string): Promise<RunRecord> {
  return getRunFn({ data: { id } });
}
