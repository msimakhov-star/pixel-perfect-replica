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

/** Decodes any image the browser can show (sample URL, data URL) and re-encodes it as a
 *  compact JPEG (max 1600 px) so phone photos stay well under the server's upload limit. */
export async function toUploadDataUrl(src: string, maxSide = 1600): Promise<string> {
  const img = new Image();
  img.src = src;
  try {
    await img.decode();
  } catch {
    throw new Error("Could not open that image. Try a JPEG or PNG photo.");
  }
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare the image");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export const imageUrlToDataUrl = (url: string) => toUploadDataUrl(url);

// Relative error in %; near-zero references (e.g. a 0° launch from the ground) fall back to absolute error.
const pctErr = (m: number, ref: number) => (Math.abs(m - ref) / Math.max(Math.abs(ref), 1e-6)) * 100;

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
