import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ProblemSpec, RunRecord } from "@/engine/types";
import { GIVEN_KEYS, UNKNOWNS } from "./physics";
import { callStructured, MODEL } from "./openai.server";

const specSchema = z.object({
  topic: z.enum(["projectile", "pendulum", "incline", "unsupported"]),
  given: z.record(z.string(), z.number()),
  unknown: z.string(),
  unitsNote: z.string().optional(),
  questionText: z.string().optional(),
  confidence: z.number(),
  assumptions: z.array(z.string()),
  readFromPhoto: z.array(z.string()),
  reason: z.string().optional(),
});

const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["topic", "given", "unknown", "questionText", "confidence", "assumptions", "readFromPhoto", "reason", "unitsNote"],
  properties: {
    topic: { type: "string", enum: ["projectile", "pendulum", "incline", "unsupported"] },
    given: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["key", "value"],
        properties: { key: { type: "string", enum: [...GIVEN_KEYS] }, value: { type: "number" } },
      },
    },
    unknown: { type: "string", enum: [...UNKNOWNS] },
    questionText: { type: "string" },
    confidence: { type: "number" },
    assumptions: { type: "array", items: { type: "string" } },
    readFromPhoto: { type: "array", items: { type: "string" } },
    reason: { type: ["string", "null"] },
    unitsNote: { type: ["string", "null"] },
  },
};

const EXTRACT_RULES = `You read introductory mechanics problems and convert them to a structured spec.
Supported topics: projectile (keys v0 m/s, angle degrees above horizontal, h launch height m, g), pendulum (L m, theta amplitude degrees, g), incline (theta degrees, length m along the slope, mu kinetic friction coefficient, g; block starts from rest).
Unknowns: projectile -> range | maxHeight | flightTime; pendulum -> period; incline -> time | finalSpeed | acceleration.
Convert all values to SI (angles stay in degrees). Only include values actually stated or clearly implied. Always include g: use the stated value, otherwise 9.81 and add the assumption "g = 9.81 m/s² (not stated)".
readFromPhoto: short verbatim snippets you actually read from the input. confidence: 0..1, your honest certainty that the spec is correct.
If the problem is not one of the supported topics or asks for an unsupported unknown, set topic "unsupported", unknown "none", and explain in reason.
Never invent numbers that are not in the input.`;

type RawSpec = {
  topic: ProblemSpec["topic"]; given: { key: string; value: number }[]; unknown: string; questionText: string;
  confidence: number; assumptions: string[]; readFromPhoto: string[]; reason: string | null; unitsNote: string | null;
};

function toSpec(r: RawSpec): ProblemSpec {
  const given: Record<string, number> = {};
  for (const { key, value } of r.given) if (Number.isFinite(value)) given[key] = value;
  return {
    topic: r.topic, given, unknown: r.unknown, questionText: r.questionText,
    confidence: Math.max(0, Math.min(1, r.confidence)), assumptions: r.assumptions, readFromPhoto: r.readFromPhoto,
    ...(r.reason ? { reason: r.reason } : {}), ...(r.unitsNote ? { unitsNote: r.unitsNote } : {}),
  };
}

export const extractFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      imageBase64: z.string().max(12_000_000).optional(),
      text: z.string().max(4000).optional(),
      currentSpec: specSchema.optional(),
      instruction: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const content: Parameters<typeof callStructured>[0]["content"] = [];
    if (data.currentSpec && data.instruction) {
      content.push({
        type: "input_text",
        text: `Current spec (JSON):\n${JSON.stringify(data.currentSpec)}\n\nApply this change and return the complete updated spec. Change only what the instruction requires, keep everything else, and list the change in assumptions. If the change cannot be represented with the supported keys, keep values unchanged and explain in unitsNote; if it leaves the supported topics, return topic "unsupported".\nInstruction: ${data.instruction}`,
      });
    } else if (data.text) {
      content.push({ type: "input_text", text: `Problem description:\n${data.text}` });
    } else if (data.imageBase64) {
      if (!data.imageBase64.startsWith("data:image/")) throw new Error("Upload must be an image");
      content.push({ type: "input_text", text: "Read the physics problem in this photo." });
      content.push({ type: "input_image", image_url: data.imageBase64 });
    } else {
      throw new Error("Nothing to read: send a photo, a description, or a change");
    }
    const { data: raw, usage } = await callStructured<RawSpec>({
      instructions: EXTRACT_RULES, content, schemaName: "problem_spec", schema: EXTRACT_SCHEMA,
    });
    return { spec: toSpec(raw), usage };
  });

const SIM_RULES = `You write a single self-contained HTML document (inline CSS/JS only, no network, no external libraries) that is an interactive physics experiment.
Hard requirements:
1. Define window.measure = function(given) { ... return number; } synchronously. "given" is an object with the same keys as the spec (angles in degrees, SI units). It must compute the requested unknown by NUMERICAL INTEGRATION of the equations of motion (e.g. RK4 or semi-implicit Euler with a small fixed dt, with interpolation at events such as ground crossing or zero crossing). Do NOT use the closed-form textbook answer anywhere in measure. Return the value in SI units (m, s, m/s, m/s²).
2. measure must be pure and fast (< 2 s), must not depend on the DOM or the animation, and must use only the values passed in "given".
3. Also render a clear canvas animation of the same simulation using the spec values: dark navy background (#0b1224), chalk-white lines, accents #5aa9ff and #ffbe5a, a small HUD with time and the key quantity. It must fill the viewport and resize.
4. Never call parent, top, fetch, XMLHttpRequest, localStorage or cookies.`;

export const simulateFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ spec: specSchema, feedback: z.string().max(4000).optional() }).parse(d))
  .handler(async ({ data }) => {
    if (data.spec.topic === "unsupported") throw new Error("This version supports projectile, pendulum and incline problems");
    const text = `Spec (JSON): ${JSON.stringify(data.spec)}\nUnknown to measure: ${data.spec.unknown}` +
      (data.feedback ? `\n\nYour previous attempt was checked by an independent harness. Feedback:\n${data.feedback}\nFix the integration; do not hard-code answers.` : "");
    const { data: out, usage } = await callStructured<{ html: string }>({
      instructions: SIM_RULES,
      content: [{ type: "input_text", text }],
      schemaName: "experiment",
      schema: { type: "object", additionalProperties: false, required: ["html"], properties: { html: { type: "string" } } },
      effort: "medium",
    });
    if (!out.html || out.html.length < 50) throw new Error("The model returned an empty experiment");
    return { html: out.html, usage, model: MODEL };
  });

/* ---------- Saved runs (real recordings, used by Replays) ---------- */

const roundSchema = z.object({
  round: z.number(), measured: z.number().nullable(), reference: z.number(), errorPct: z.number().nullable(),
  perturbationPassed: z.boolean().nullable(), seconds: z.number(), costUsd: z.number(), feedback: z.string().optional(),
  status: z.enum(["match", "mismatch", "timeout", "error"]),
});

export const saveRunFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      spec: specSchema, rounds: z.array(roundSchema).min(1).max(3), finalHtml: z.string().max(400_000),
      unit: z.string().max(10), totalCostUsd: z.number(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const title = `${data.spec.topic[0]?.toUpperCase()}${data.spec.topic.slice(1)} — ${(data.spec.questionText ?? data.spec.unknown).slice(0, 60)}`;
    const { data: row, error } = await supabaseAdmin.from("runs").insert({ title, record: data }).select("id").single();
    if (error) throw new Error(`Could not save run: ${error.message}`);
    return { id: row.id };
  });

export const listRunsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.from("runs").select("id, title, created_at").order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(`Could not load replays: ${error.message}`);
  return data.map((r) => ({ id: r.id, title: r.title }));
});

export const getRunFn = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin.from("runs").select("id, record").eq("id", data.id).single();
    if (error) throw new Error(`Could not load replay: ${error.message}`);
    return { ...(row.record as unknown as Omit<RunRecord, "id">), id: row.id } as RunRecord;
  });
