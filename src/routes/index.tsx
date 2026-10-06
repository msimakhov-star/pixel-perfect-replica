import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Camera, Upload, ChevronDown, Check, X, Download, RotateCcw, Loader2, History, AlertTriangle, Atom,
} from "lucide-react";
import type { ProblemSpec, Round, RunRecord } from "@/engine/types";
import { extract, runExperiment, listReplays, loadReplay, MODEL_NAME } from "@/lib/api";
import { UNITS, reference } from "@/lib/physics";
import { CountUp, Progress, useElapsed } from "@/components/p2p/bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Photo-to-Physics — turn a problem photo into a live experiment" },
      { name: "description", content: "Photograph a physics problem and watch it become an interactive experiment, checked honestly against the textbook formula." },
      { property: "og:title", content: "Photo-to-Physics" },
      { property: "og:description", content: "Snap a physics problem. Get a live experiment and an honest check against the formula." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SAMPLES = [
  { id: "projectile", title: "Projectile", img: "/samples/projectile.jpg" },
  { id: "pendulum", title: "Pendulum", img: "/samples/pendulum.jpg" },
  { id: "incline", title: "Incline", img: "/samples/incline.jpg" },
] as const;

const PHASES = ["Reading the problem", "Writing the experiment", "Measuring", "Checking against the formula"];

function Index() {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [spec, setSpec] = useState<ProblemSpec | null>(null);
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState(false);
  const elapsed = useElapsed(running || reading);

  function reset() {
    setStep(0); setPhoto(null); setSpec(null); setRounds([]); setRun(null); setError(null); setReplay(false);
  }

  async function startRead(image: string, preview: string) {
    reset();
    setPhoto(preview); setStep(1); setReading(true);
    try {
      setSpec(await extract({ imageBase64: image }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the photo");
    } finally {
      setReading(false);
    }
  }

  function onFile(f: File) {
    const r = new FileReader();
    r.onload = () => startRead(String(r.result), String(r.result));
    r.readAsDataURL(f);
  }

  async function build() {
    if (!spec) return;
    setStep(2); setRunning(true); setRounds([]); setRun(null); setError(null); setPhase(0);
    try {
      const rec = await runExperiment(spec, (r) => setRounds((p) => [...p, r]), setPhase);
      setRun(rec); setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The experiment failed to build");
    } finally {
      setRunning(false);
    }
  }

  async function playReplay(id: string) {
    reset();
    setReplay(true);
    try {
      const rec = await loadReplay(id);
      const sample = SAMPLES.find((s) => s.id === rec.spec.topic);
      setPhoto(sample?.img ?? null); setSpec(rec.spec); setStep(1);
      await new Promise((r) => setTimeout(r, 1400));
      setStep(2); setRunning(true);
      for (const r of rec.rounds) {
        for (let p = 0; p < 4; p++) { setPhase(p); await new Promise((x) => setTimeout(x, 350)); }
        setRounds((prev) => [...prev, r]);
      }
      setRunning(false); setRun(rec); setStep(3);
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : "Replay failed");
    }
  }

  return (
    <div className="graph-paper min-h-screen bg-background text-foreground">
      <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-6 py-6 lg:px-10">
        <button onClick={reset} className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"><Atom className="h-5 w-5" /></span>
          <span className="text-xl font-bold tracking-tight">Photo-to-Physics</span>
        </button>
        <div className="hidden md:block"><Progress step={step} /></div>
        <ReplaysMenu onPick={playReplay} />
      </header>
      <div className="px-6 md:hidden"><Progress step={step} /></div>

      <main className="mx-auto max-w-[1600px] px-6 pb-20 pt-6 lg:px-10">
        {replay && (
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-accent">
            <History className="h-3.5 w-3.5" /> Replay of a real run
          </div>
        )}
        {error && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-destructive/50 bg-destructive/10 px-5 py-4 text-destructive">
            <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span>
            <button onClick={reset} className="text-sm underline">Start over</button>
          </div>
        )}

        {step === 0 && <Snap onFile={onFile} onSample={(id, img) => startRead(`sample:${id}`, img)} />}
        {step === 1 && (
          <Read photo={photo} spec={spec} reading={reading} elapsed={elapsed} setSpec={setSpec} onBuild={build}
            onSample={(id, img) => startRead(`sample:${id}`, img)} readonly={replay} />
        )}
        {step >= 2 && spec && (
          <div key="exp" className="grid animate-rise gap-6 xl:grid-cols-[1.5fr_1fr]">
            <Experiment html={run?.finalHtml ?? null} running={running} phase={phase} elapsed={elapsed} />
            <CheckPanel spec={spec} rounds={rounds} run={run} onReset={reset} />
          </div>
        )}
      </main>
    </div>
  );
}

function Snap({ onFile, onSample }: { onFile: (f: File) => void; onSample: (id: string, img: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <section className="animate-rise">
      <h1 className="max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
        Snap a problem.<br /><span className="text-primary">Watch it</span> <span className="text-accent">become physics.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Astra reads the question, builds a live experiment, then checks the result against the textbook formula — honestly.
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
        onClick={() => input.current?.click()}
        className={`mt-10 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-16 text-center transition-all md:py-20 ${
          drag ? "border-accent bg-accent/10" : "border-primary/40 bg-card/50 hover:border-primary hover:bg-card/80"
        }`}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Camera className="h-8 w-8" /></span>
        <p className="mt-5 text-2xl font-semibold md:text-3xl">Photograph a physics problem</p>
        <p className="mt-2 text-muted-foreground">Drop an image here or click to upload</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground"><Upload className="h-4 w-4" />Upload photo</span>
          <button
            onClick={(e) => { e.stopPropagation(); cam.current?.click(); }}
            className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 font-medium md:hidden"
          ><Camera className="h-4 w-4" />Use camera</button>
        </div>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      </div>
      <h2 className="mt-14 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Try a sample</h2>
      <SampleCards onSample={onSample} />
    </section>
  );
}

function SampleCards({ onSample }: { onSample: (id: string, img: string) => void }) {
  return (
    <div className="mt-4 grid gap-5 sm:grid-cols-3">
      {SAMPLES.map((s) => (
        <button key={s.id} onClick={() => onSample(s.id, s.img)}
          className="group overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:-translate-y-1 hover:border-primary">
          <img src={s.img} alt={`${s.title} sample problem`} loading="lazy" width={992} height={672} className="aspect-[3/2] w-full object-cover opacity-90 transition group-hover:opacity-100" />
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-lg font-semibold">{s.title}</span>
            <span className="font-mono text-xs text-primary">Load →</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function Read({ photo, spec, reading, elapsed, setSpec, onBuild, onSample, readonly }: {
  photo: string | null; spec: ProblemSpec | null; reading: boolean; elapsed: number; readonly: boolean;
  setSpec: (s: ProblemSpec) => void; onBuild: () => void; onSample: (id: string, img: string) => void;
}) {
  const low = spec ? spec.confidence < 0.6 : false;
  return (
    <section className="grid animate-rise gap-8 lg:grid-cols-2">
      <div className="overflow-hidden rounded-3xl border border-border bg-card">
        {photo ? <img src={photo} alt="Your physics problem" className="h-full max-h-[640px] w-full object-contain" /> : <div className="aspect-[4/3]" />}
      </div>
      <div className="rounded-3xl border border-border bg-card/70 p-8 backdrop-blur">
        {reading || !spec ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-lg">Astra is reading the problem…</p>
            <p className="font-mono text-sm">{elapsed.toFixed(1)}s</p>
          </div>
        ) : spec.topic === "unsupported" ? (
          <div>
            <h2 className="text-3xl font-bold">Not supported yet</h2>
            <p className="mt-3 text-muted-foreground">This version supports projectile, pendulum and incline problems.</p>
            {spec.reason && <p className="mt-2 text-sm text-muted-foreground">{spec.reason}</p>}
            <SampleCards onSample={onSample} />
          </div>
        ) : (
          <>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-accent">{spec.topic}</p>
            <h2 className="mt-2 text-3xl font-bold leading-tight">What Astra read</h2>
            {spec.questionText && <p className="mt-3 text-muted-foreground">{spec.questionText}</p>}

            <div className="mt-6">
              <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <span>Confidence</span><span className={low ? "text-accent" : "text-success"}>{Math.round(spec.confidence * 100)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all duration-700 ${low ? "bg-accent" : "bg-success"}`} style={{ width: `${spec.confidence * 100}%` }} />
              </div>
              {low && <p className="mt-3 flex items-center gap-2 text-sm text-accent"><AlertTriangle className="h-4 w-4" />Check these values</p>}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(spec.given).map(([k, v]) => (
                <label key={k} className={`rounded-xl border bg-background/60 px-4 py-3 ${low ? "border-accent/70 ring-1 ring-accent/30" : "border-border"}`}>
                  <span className="font-mono text-xs text-muted-foreground">{k}</span>
                  <span className="mt-1 flex items-baseline gap-1">
                    <input type="number" value={v} disabled={readonly}
                      onChange={(e) => setSpec({ ...spec, given: { ...spec.given, [k]: Number(e.target.value) } })}
                      className="w-full bg-transparent font-mono text-xl font-semibold outline-none" />
                    <span className="font-mono text-sm text-muted-foreground">{UNITS[k] ?? ""}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-5 text-sm"><span className="text-muted-foreground">Asked for: </span><span className="font-semibold text-primary">{spec.unknown}</span></p>

            <div className="mt-5 flex flex-wrap gap-2">
              {spec.readFromPhoto.map((c) => (
                <span key={c} className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">{c}</span>
              ))}
            </div>
            <ul className="mt-5 space-y-1 text-sm text-muted-foreground">
              {spec.assumptions.map((a) => <li key={a}>· {a}</li>)}
            </ul>
            {!readonly && (
              <button onClick={onBuild} className="mt-8 w-full rounded-2xl bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground shadow-[0_10px_40px_-10px] shadow-primary/60 transition hover:brightness-110">
                Build the experiment
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function Experiment({ html, running, phase, elapsed }: { html: string | null; running: boolean; phase: number; elapsed: number }) {
  return (
    <div className="relative min-h-[480px] overflow-hidden rounded-3xl border border-border bg-card xl:min-h-[640px]">
      {html && !running ? (
        <iframe title="Generated experiment" sandbox="allow-scripts" srcDoc={html} className="absolute inset-0 h-full w-full" />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 p-8">
          <ul className="space-y-4">
            {PHASES.map((p, i) => (
              <li key={p} className={`flex items-center gap-4 text-xl transition-all ${i <= phase ? "text-foreground" : "text-muted-foreground/40"}`}>
                <span className={`flex h-8 w-8 items-center justify-center rounded-full border ${i < phase ? "border-success bg-success/15 text-success" : i === phase ? "border-primary text-primary" : "border-border"}`}>
                  {i < phase ? <Check className="h-4 w-4" /> : i === phase ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
                </span>
                {p}
              </li>
            ))}
          </ul>
          <p className="font-mono text-sm text-muted-foreground">{elapsed.toFixed(1)}s elapsed</p>
        </div>
      )}
    </div>
  );
}

function CheckPanel({ spec, rounds, run, onReset }: { spec: ProblemSpec; rounds: Round[]; run: RunRecord | null; onReset: () => void }) {
  const ref = reference(spec);
  const last = rounds[rounds.length - 1];
  const unit = run?.unit ?? ref.unit;
  const cost = run?.totalCostUsd ?? rounds.reduce((s, r) => s + r.costUsd, 0);
  const ok = last?.status === "match";

  function download() {
    if (!run) return;
    const url = URL.createObjectURL(new Blob([run.finalHtml], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url; a.download = `experiment-${spec.topic}.html`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="flex flex-col gap-5 rounded-3xl border border-border bg-card/70 p-7 backdrop-blur">
      <div className="grid grid-cols-2 gap-4">
        <Big label="Experiment" value={last?.measured ?? null} unit={unit} tone="text-primary" />
        <Big label="Formula" value={last?.reference ?? null} unit={unit} tone="text-accent" sub={ref.label} />
      </div>

      {last && last.errorPct != null && (
        <div className={`flex items-center gap-3 rounded-2xl px-5 py-4 text-lg font-semibold ${ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
          {ok ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
          {ok ? `Match within ${last.errorPct.toFixed(1)}%` : `Disagree by ${last.errorPct.toFixed(1)}%`}
        </div>
      )}
      {last && (
        <p className="font-mono text-sm text-muted-foreground">
          Perturbation test (g +10%):{" "}
          <span className={last.perturbationPassed ? "text-success" : "text-destructive"}>
            {last.perturbationPassed == null ? "—" : last.perturbationPassed ? "passed" : "failed"}
          </span>
        </p>
      )}

      <div>
        <h3 className="font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Round history</h3>
        <div className="mt-3 space-y-2">
          {rounds.length === 0 && <p className="text-sm text-muted-foreground">Waiting for the first round…</p>}
          {rounds.map((r) => <RoundRow key={r.round} r={r} unit={unit} />)}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4 font-mono text-sm">
        <span className="text-muted-foreground">{MODEL_NAME}</span>
        <span>${cost.toFixed(2)}</span>
      </div>

      {run && (
        <div className="flex flex-wrap gap-3">
          <button onClick={onReset} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 font-medium hover:bg-secondary">
            <RotateCcw className="h-4 w-4" />Try another problem
          </button>
          <button onClick={download} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground hover:brightness-110">
            <Download className="h-4 w-4" />Download experiment (.html)
          </button>
        </div>
      )}
    </aside>
  );
}

function Big({ label, value, unit, tone, sub }: { label: string; value: number | null; unit: string; tone: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-background/60 p-5">
      <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-4xl font-semibold tabular-nums ${tone}`}>
        {value == null ? "—" : <CountUp value={value} />}<span className="ml-1 text-lg text-muted-foreground">{unit}</span>
      </p>
      {sub && <p className="mt-1 font-mono text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

function RoundRow({ r, unit }: { r: Round; unit: string }) {
  const [open, setOpen] = useState(false);
  const ok = r.status === "match";
  return (
    <div className="animate-rise rounded-xl border border-border bg-background/50">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left font-mono text-sm">
        <span className={`h-2 w-2 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
        <span className="font-semibold">Round {r.round}</span>
        <span className="text-muted-foreground">{r.measured?.toFixed(2) ?? "—"} {unit}</span>
        <span className={ok ? "text-success" : "text-destructive"}>{r.errorPct?.toFixed(1) ?? "—"}%</span>
        <span className="ml-auto text-muted-foreground">{r.seconds.toFixed(1)}s · ${r.costUsd.toFixed(2)}</span>
        <ChevronDown className={`h-4 w-4 transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{r.feedback ?? "No feedback."}</p>}
    </div>
  );
}

function ReplaysMenu({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; title: string }[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (open && !items) listReplays().then(setItems).catch(() => setErr(true));
  }, [open, items]);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
        <History className="h-4 w-4" />Replays<ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
          {err && <p className="p-4 text-sm text-destructive">Couldn't load replays.</p>}
          {!err && !items && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {items?.map((it) => (
            <button key={it.id} onClick={() => { setOpen(false); onPick(it.id); }} className="block w-full px-4 py-3 text-left text-sm hover:bg-secondary">
              {it.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
