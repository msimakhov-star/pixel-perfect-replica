# Photo-to-Physics

**Snap a physics problem. Watch it become an experiment. Check it against the formula.**

A student photographs a physics problem (printed or handwritten) or describes an experiment in words. GPT-6 Astra reads it, writes a live interactive experiment that runs in the browser, and the app then **checks the experiment against the textbook formula**. If they disagree, Astra gets the measured error back and fixes its simulation (up to 3 rounds).

Not every school has a physics lab. Every student has a phone.

Built at the GPT-6 Astra Hackathon London (6 Oct 2026) with **GPT-6 Astra**, **Codex** and **Lovable**.

## How it works

```
photo / description / "now on the Moon"
        │
        ▼
  extract  (GPT-6 Astra, vision + structured output)  ──►  ProblemSpec  ──►  student confirms / edits values
        │
        ├──►  reference answer  (deterministic closed-form solver, src/lib/physics.ts)   ← ground truth, no AI
        │
        ▼
  simulate (GPT-6 Astra writes one self-contained HTML experiment with window.measure)
        │
        ▼
  sandboxed iframe (allow-scripts only, no same-origin)  ──►  measure(given)  by numerical integration
        │
        ├──►  compare: |measured − reference| / reference ≤ 2 %
        ├──►  perturbation test: re-measure with g × 1.1, the result must move like the formula says
        │      (a hard-coded number fails this)
        ▼
  match ─► green badge          mismatch ─► feedback to Astra, next round (max 3 rounds, max $1.50)
```

- **Topics:** projectile motion, simple pendulum, block on an incline (with friction).
- **Inputs:** photo, typed description, voice dictation (where the browser supports it).
- **Change by describing:** "now on the Moon", "double the length", "add friction 0.3" updates the spec and re-runs the check; every version is kept.
- **Replays:** real runs are saved and can be played back, labelled as replays.

Key files: `src/lib/engine.functions.ts` (Astra calls), `src/lib/openai.server.ts` (Responses API client, server only), `src/lib/physics.ts` (ground-truth solvers + perturbation), `src/lib/harness.ts` (sandboxed measurement), `src/lib/api.ts` (self-check loop, rounds, budget).

## How GPT-6 Astra, Codex and Lovable were used

**While building**
- **Lovable** generated the app (TanStack Start + Tailwind + shadcn, Lovable Cloud backend, animations) and keeps this repo in two-way sync.
- **Codex** was connected to the Lovable workspace through the Lovable MCP server (`https://mcp.lovable.dev/mcp`) and drove the build: sending build requests, reviewing the generated code, replacing placeholder data with real wiring, and wiring secrets.
- Build history: see `docs/BUILD_LOG.md` and the commit log.

**In the product**
- **GPT-6 Astra** (`gpt-6-astra`, Responses API, structured outputs) reads photos and descriptions into a typed spec, applies "change it" instructions, and writes the experiment code.
- Astra never grades itself: correctness is decided by deterministic code (formula + perturbation test) in a sandbox.

## Run locally

```sh
npm install
npm run dev
```
Server secrets (set in Lovable Cloud): `OPENAI_API_KEY`, `OPENAI_PRICE_INPUT_PER_MTOK`, `OPENAI_PRICE_OUTPUT_PER_MTOK`. The OpenAI key is only used server-side and is never committed.

## Honest limitations

- Three topics only, ideal conditions (no air resistance).
- Extraction can misread handwriting; the student confirms values before simulating.
- "Match" means the experiment's numerical result agrees with the formula within 2 % and reacts correctly to a change in g. It does not prove every detail of the animation is right.
- Generated code runs in a sandboxed iframe and is never executed in the main page.
- Costs and timings shown in the app are measured from real API usage.

## License

MIT
