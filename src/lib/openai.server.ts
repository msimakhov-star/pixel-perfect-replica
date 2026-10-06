// Server-only OpenAI Responses API client. Never import from client code.
export const MODEL = "gpt-6-astra";

export interface Usage { inputTokens: number; outputTokens: number; costUsd: number }

function pricing() {
  const inp = Number(process.env["OPENAI_PRICE_INPUT_PER_MTOK"]);
  const out = Number(process.env["OPENAI_PRICE_OUTPUT_PER_MTOK"]);
  if (!Number.isFinite(inp) || !Number.isFinite(out) || inp <= 0 || out <= 0) {
    throw new Error("Model pricing is not configured (OPENAI_PRICE_INPUT_PER_MTOK / OPENAI_PRICE_OUTPUT_PER_MTOK), so cost cannot be measured.");
  }
  return { inp, out };
}

export async function callStructured<T>(opts: {
  instructions: string;
  content: Array<{ type: "input_text"; text: string } | { type: "input_image"; image_url: string }>;
  schemaName: string;
  schema: Record<string, unknown>;
  effort?: "low" | "medium" | "high";
}): Promise<{ data: T; usage: Usage }> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("OPENAI_API_KEY is not set, so Astra cannot run.");
  const price = pricing();

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        instructions: opts.instructions,
        input: [{ role: "user", content: opts.content }],
        reasoning: { effort: opts.effort ?? "low" },
        store: false,
        text: { format: { type: "json_schema", name: opts.schemaName, strict: true, schema: opts.schema } },
      }),
    });
  } catch (e) {
    throw new Error(`Could not reach OpenAI: ${e instanceof Error ? e.message : String(e)}`);
  }

  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    output?: Array<{ type: string; content?: Array<{ type: string; text?: string; refusal?: string }> }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;

  if (!res.ok) {
    throw new Error(`OpenAI error ${res.status}: ${body?.error?.message ?? res.statusText}`);
  }
  const parts = (body?.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
  const refusal = parts.find((p) => p.type === "refusal");
  if (refusal) throw new Error(`The model declined: ${refusal.refusal ?? "no reason given"}`);
  const text = parts.filter((p) => p.type === "output_text").map((p) => p.text ?? "").join("");
  if (!text) throw new Error("The model returned no output.");

  const inputTokens = body?.usage?.input_tokens ?? 0;
  const outputTokens = body?.usage?.output_tokens ?? 0;
  const costUsd = (inputTokens * price.inp + outputTokens * price.out) / 1_000_000;

  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new Error("The model returned malformed JSON."); }
  return { data, usage: { inputTokens, outputTokens, costUsd } };
}
