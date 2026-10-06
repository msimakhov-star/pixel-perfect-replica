import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import {
  Camera, Upload, ChevronDown, X, Download, RotateCcw, Loader2, History, AlertTriangle, Atom, Mic, MicOff, Send, Type, Check,
} from "lucide-react";
import type { ProblemSpec, Round, RunRecord } from "@/engine/types";
import { extract, runExperiment, listReplays, loadReplay, saveRun, imageUrlToDataUrl, MODEL_NAME, MAX_ROUNDS, BUDGET_USD } from "@/lib/api";
import { UNITS, reference } from "@/lib/physics";
import { AnimatedCheck, Chip, CountUp, PendulumLoader, Progress, useElapsed } from "@/components/p2p/bits";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Photo-to-Physics — turn a problem photo into a live experiment" },
      { name: "description", content: "Photograph or describe a physics problem and watch it become an interactive experiment, checked honestly against the textbook formula." },
      { property: "og:title", content: "Photo-to-Physics" },
      { property: "og:description", content: "Snap or describe a physics problem. Get a live experiment and an honest check against the formula." },
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

const EXAMPLES = [
  { label: "Projectile", text: "A ball kicked at 20 m/s at 40 degrees off a 2 m wall. How far does it land?" },
  { label: "Pendulum", text: "A pendulum with a 1.5 m string swings 8 degrees. What is its period?" },
  { label: "Incline", text: "A block slides from rest down a 4 m frictionless ramp tilted at 25 degrees. How long does it take?" },
];

const CHANGE_CHIPS = ["Now on the Moon", "Double the length", "Add friction 0.3"];
const PHASES = ["Reading the problem", "Writing the experiment", "Measuring", "Checking against the formula"];
const spring = { type: "spring" as const, stiffness: 260, damping: 28, duration: 0.35 };

interface Version {
  label: string;
  spec: ProblemSpec;
  rounds: Round[];
  run: RunRecord | null;
  changed: Record<string, number>; // key -> previous value
}

function versionLabel(n: number, instruction?: string) {
  if (!instruction) return `v${n} Earth`;
  if (/moon/i.test(instruction)) return `v${n} Moon`;
  return `v${n} ${instruction.split(" ").slice(0, 2).join(" ")}`;
}

function diffGiven(a: ProblemSpec, b: ProblemSpec) {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.given)) {
    const old = a.given[k];
    if (old !== undefined && old !== v) out[k] = old;
  }
  return out;
}

function Index() {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<string | null>(null);
  const [described, setDescribed] = useState<string | null>(null);
  const [spec, setSpec] = useState<ProblemSpec | null>(null);
  const [changed, setChanged] = useState<Record<string, number>>({});
  const [reading, setReading] = useState(false);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0);
  const [versions, setVersions] = useState<Version[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [replay, setReplay] = useState(false);
  const [changing, setChanging] = useState(false);
  const elapsed = useElapsed(running || reading || changing);

  const current = versions[active];

  function reset() {
    setStep(0); setPhoto(null); setDescribed(null); setSpec(null); setChanged({}); setVersions([]); setActive(0);
    setError(null); setReplay(false);
  }

  async function startRead(input: { imageBase64?: string; text?: string; sampleUrl?: string }, preview: string | null) {
    reset();
    setPhoto(preview); setDescribed(input.text ?? null); setStep(1); setReading(true);
    try {
      const src = input.sampleUrl ?? input.imageBase64;
      const imageBase64 = input.text == null && src ? await imageUrlToDataUrl(src) : undefined;
      setSpec(await extract(input.text != null ? { text: input.text } : { imageBase64: imageBase64 ?? "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the problem");
    } finally {
      setReading(false);
    }
  }

  function onFile(f: File) {
    const r = new FileReader();
    r.onload = () => startRead({ imageBase64: String(r.result) }, String(r.result));
    r.readAsDataURL(f);
  }

  async function buildVersion(s: ProblemSpec, label: string, diff: Record<string, number>, index: number) {
    setVersions((p) => {
      const next = p.slice(0, index);
      next[index] = { label, spec: s, rounds: [], run: null, changed: diff };
      return next.concat(p.slice(index + 1));
    });
    setActive(index); setStep(2); setRunning(true); setPhase(0); setError(null);
    const update = (fn: (v: Version) => Version) =>
      setVersions((p) => p.map((v, i) => (i === index ? fn(v) : v)));
    try {
      const rec = await runExperiment(s, (r) => update((v) => ({ ...v, rounds: [...v.rounds, r] })), setPhase);
      update((v) => ({ ...v, run: rec }));
      setStep(3);
      saveRun(rec).catch((e) => console.warn("Run not saved for replays:", e));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The experiment failed to build");
    } finally {
      setRunning(false);
    }
  }

  function build() {
    if (!spec) return;
    void buildVersion(spec, versionLabel(1), {}, 0);
  }

  async function change(instruction: string) {
    if (!current || changing || running) return;
    setChanging(true); setError(null);
    try {
      const next = await extract({ currentSpec: current.spec, instruction });
      const diff = diffGiven(current.spec, next);
      setSpec(next); setChanged(diff); setStep(1);
      if (next.topic === "unsupported") return;
      await new Promise((r) => setTimeout(r, 1800));
      await buildVersion(next, versionLabel(versions.length + 1, instruction), diff, versions.length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not apply that change");
    } finally {
      setChanging(false);
    }
  }

  function pickVersion(i: number) {
    const v = versions[i];
    if (!v || running) return;
    setActive(i); setSpec(v.spec); setChanged(v.changed);
    setStep(v.run ? 3 : 2);
  }

  async function playReplay(id: string) {
    reset();
    setReplay(true);
    try {
      const rec = await loadReplay(id);
      const sample = SAMPLES.find((s) => s.id === rec.spec.topic);
      setPhoto(sample?.img ?? null); setSpec(rec.spec); setStep(1);
      setReading(true);
      await new Promise((r) => setTimeout(r, 1400));
      setReading(false);
      await new Promise((r) => setTimeout(r, 1200));
      setVersions([{ label: "v1 Earth", spec: rec.spec, rounds: [], run: null, changed: {} }]);
      setActive(0); setStep(2); setRunning(true);
      for (const r of rec.rounds) {
        for (let p = 0; p < 4; p++) { setPhase(p); await new Promise((x) => setTimeout(x, 350)); }
        setVersions((prev) => prev.map((v) => ({ ...v, rounds: [...v.rounds, r] })));
      }
      setRunning(false);
      setVersions((prev) => prev.map((v) => ({ ...v, run: rec })));
      setStep(3);
    } catch (e) {
      setRunning(false);
      setError(e instanceof Error ? e.message : "Replay failed");
    }
  }

  const showRead = step === 1;

  return (
    <MotionConfig reducedMotion="user">
      <div className="graph-paper animate-drift min-h-screen bg-background text-foreground">
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
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-1.5 font-mono text-xs uppercase tracking-widest text-accent">
              <History className="h-3.5 w-3.5" /> Replay of a real run
            </motion.div>
          )}
          {error && (
            <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-destructive/50 bg-destructive/10 px-5 py-4 text-destructive">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{error}</span>
              <button onClick={reset} className="text-sm underline">Start over</button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === 0 && (
              <StepWrap key="snap">
                <Snap onFile={onFile} onSample={(id, img) => startRead({ sampleUrl: img }, img)}
                  onDescribe={(text) => startRead({ text }, null)} />
              </StepWrap>
            )}
            {showRead && (
              <StepWrap key={`read-${versions.length}`}>
                <Read photo={photo} described={described} spec={spec} reading={reading} elapsed={elapsed} setSpec={setSpec}
                  onBuild={build} changed={changed} rebuilding={versions.length > 0}
                  onSample={(id, img) => startRead({ sampleUrl: img }, img)} readonly={replay} />
              </StepWrap>
            )}
            {step >= 2 && current && (
              <StepWrap key="exp">
                <VersionStrip versions={versions} active={active} onPick={pickVersion} />
                <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                  <div className="flex flex-col gap-4">
                    <Experiment key={`${active}-${current.run ? "done" : "run"}`} html={current.run?.finalHtml ?? null}
                      running={running} phase={phase} elapsed={elapsed} />
                    {!replay && <ChangeBox busy={changing || running} onSend={change} />}
                  </div>
                  <CheckPanel spec={current.spec} rounds={current.rounds} run={current.run} onReset={reset} />
                </div>
              </StepWrap>
            )}
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  );
}

function StepWrap({ children }: { children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={spring}
    >
      {children}
    </motion.section>
  );
}

const MotionButton = motion.button;
const lift = { whileHover: { y: -2 }, whileTap: { scale: 0.97 } };

/* ---------------- Step 1: Snap or describe ---------------- */

function Snap({ onFile, onSample, onDescribe }: {
  onFile: (f: File) => void; onSample: (id: string, img: string) => void; onDescribe: (t: string) => void;
}) {
  const [tab, setTab] = useState<"photo" | "describe">("photo");
  return (
    <div>
      <h1 className="max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight md:text-7xl">
        Snap a problem.<br /><span className="text-primary">Watch it</span> <span className="text-accent">become physics.</span>
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
        Astra reads the question, builds a live experiment, then checks the result against the textbook formula — honestly.
      </p>

      <div className="mt-10 grid w-full max-w-md grid-cols-2 rounded-full border border-border bg-card/60 p-1">
        {([["photo", "Photo", Camera], ["describe", "Describe", Type]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)} className="relative flex items-center justify-center gap-2 rounded-full py-2.5 text-sm font-medium">
            {tab === id && <motion.span layoutId="tab" className="absolute inset-0 rounded-full bg-primary" transition={spring} />}
            <span className={`relative flex items-center gap-2 ${tab === id ? "text-primary-foreground" : "text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />{label}
            </span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === "photo" ? (
          <motion.div key="p" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring}>
            <DropZone onFile={onFile} />
          </motion.div>
        ) : (
          <motion.div key="d" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={spring}>
            <Describe onSubmit={onDescribe} />
          </motion.div>
        )}
      </AnimatePresence>

      <h2 className="mt-14 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">Try a sample</h2>
      <SampleCards onSample={onSample} />
    </div>
  );
}

function DropZone({ onFile }: { onFile: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => input.current?.click()}
      className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-16 text-center transition-all md:py-20 ${
        drag ? "border-accent bg-accent/10" : "border-primary/40 bg-card/50 hover:border-primary hover:bg-card/80"
      }`}
    >
      <motion.span animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Camera className="h-8 w-8" /></motion.span>
      <p className="mt-5 text-2xl font-semibold md:text-3xl">Photograph a physics problem</p>
      <p className="mt-2 text-muted-foreground">Drop an image here or click to upload</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <motion.span {...lift} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-medium text-primary-foreground"><Upload className="h-4 w-4" />Upload photo</motion.span>
        <button
          onClick={(e) => { e.stopPropagation(); cam.current?.click(); }}
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 font-medium md:hidden"
        ><Camera className="h-4 w-4" />Use camera</button>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
    </div>
  );
}

type SpeechRec = {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void;
};

function Describe({ onSubmit }: { onSubmit: (t: string) => void }) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [typing, setTyping] = useState(false);
  const [supported, setSupported] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const base = useRef("");

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    setSupported(Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);

  function toggleMic() {
    if (listening) { rec.current?.stop(); return; }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US"; r.interimResults = true; r.continuous = true;
    base.current = text ? text.trimEnd() + " " : "";
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i]?.[0]?.transcript ?? "";
      setText(base.current + t);
    };
    r.onend = () => setListening(false);
    rec.current = r; r.start(); setListening(true);
  }

  const active = listening || typing;
  return (
    <div className="mt-6">
      <div className="relative rounded-3xl">
        <motion.div
          className="pointer-events-none absolute -inset-px rounded-3xl border-2 border-primary"
          animate={active ? { opacity: [0.25, 1, 0.25] } : { opacity: 0 }}
          transition={active ? { duration: 1.6, repeat: Infinity } : { duration: 0.3 }}
        />
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value); setTyping(true);
            if (typingTimer.current) clearTimeout(typingTimer.current);
            typingTimer.current = setTimeout(() => setTyping(false), 900);
          }}
          rows={5}
          placeholder="Describe an experiment, for example: a ball kicked at 20 m/s at 40 degrees off a 2 m wall"
          className="block w-full resize-none rounded-3xl border border-border bg-card/60 px-7 py-6 pr-20 text-xl leading-relaxed outline-none placeholder:text-muted-foreground/60"
        />
        {supported && (
          <MotionButton {...lift} type="button" onClick={toggleMic} aria-label={listening ? "Stop dictation" : "Dictate"}
            className={`absolute right-5 top-5 flex h-12 w-12 items-center justify-center rounded-full ${listening ? "bg-destructive text-destructive-foreground" : "bg-primary/15 text-primary"}`}>
            {listening && (
              <motion.span className="absolute inset-0 rounded-full bg-destructive" animate={{ scale: [1, 1.6], opacity: [0.5, 0] }} transition={{ duration: 1.2, repeat: Infinity }} />
            )}
            {listening ? <MicOff className="relative h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </MotionButton>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => <Chip key={ex.label} onClick={() => setText(ex.text)}>{ex.label}</Chip>)}
        </div>
        <MotionButton {...lift} disabled={!text.trim()} onClick={() => onSubmit(text.trim())}
          className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-40">
          Read this problem →
        </MotionButton>
      </div>
    </div>
  );
}

function SampleCards({ onSample }: { onSample: (id: string, img: string) => void }) {
  return (
    <div className="mt-4 grid gap-5 sm:grid-cols-3" style={{ perspective: 900 }}>
      {SAMPLES.map((s, i) => (
        <motion.button key={s.id} onClick={() => onSample(s.id, s.img)}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: i * 0.06 }}
          whileHover={{ rotateX: 4, rotateY: i === 0 ? 5 : i === 2 ? -5 : 0, y: -6 }}
          className="group overflow-hidden rounded-2xl border border-border bg-card text-left transition-colors hover:border-primary">
          <img src={s.img} alt={`${s.title} sample problem`} loading="lazy" width={992} height={672} className="aspect-[3/2] w-full object-cover opacity-90 transition-opacity group-hover:opacity-100" />
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-lg font-semibold">{s.title}</span>
            <span className="font-mono text-xs text-primary">Load →</span>
          </div>
        </motion.button>
      ))}
    </div>
  );
}

/* ---------------- Step 2: Read ---------------- */

function Read({ photo, described, spec, reading, elapsed, setSpec, onBuild, onSample, readonly, changed, rebuilding }: {
  photo: string | null; described: string | null; spec: ProblemSpec | null; reading: boolean; elapsed: number; readonly: boolean;
  changed: Record<string, number>; rebuilding: boolean;
  setSpec: (s: ProblemSpec) => void; onBuild: () => void; onSample: (id: string, img: string) => void;
}) {
  const low = spec ? spec.confidence < 0.6 : false;
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-card">
        {photo ? (
          <img src={photo} alt="Your physics problem" className="h-full max-h-[640px] w-full object-contain" />
        ) : (
          <div className="flex min-h-[320px] items-center p-10">
            <p className="text-2xl leading-relaxed text-foreground/90 md:text-3xl">“{described ?? spec?.questionText}”</p>
          </div>
        )}
        <AnimatePresence>
          {reading && (
            <motion.div key="scan" className="pointer-events-none absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="absolute inset-0 bg-primary/5" />
              <motion.div
                className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-transparent via-primary/30 to-transparent"
                animate={{ y: ["-30%", "520%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
              >
                <div className="absolute inset-x-0 top-1/2 h-px bg-primary shadow-[0_0_12px] shadow-primary" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="rounded-3xl border border-border bg-card/70 p-8 backdrop-blur">
        {!reading && !spec ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <p className="text-lg">Astra couldn't read this one.</p>
            <p className="text-sm">See the message above, then use Start over to try again.</p>
          </div>
        ) : reading || !spec ? (
          <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4 text-muted-foreground">
            <PendulumLoader />
            <p className="text-lg">Astra is reading{photo ? "" : " your description"}…</p>
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
            <h2 className="mt-2 text-3xl font-bold leading-tight">{rebuilding ? "Astra changed the experiment" : "What Astra read"}</h2>
            {spec.questionText && <p className="mt-3 text-muted-foreground">{spec.questionText}</p>}
            {spec.unitsNote && <p className="mt-2 text-sm text-accent">{spec.unitsNote}</p>}

            <div className="mt-6">
              <div className="flex items-center justify-between font-mono text-xs uppercase tracking-widest text-muted-foreground">
                <span>Confidence</span><span className={low ? "text-accent" : "text-success"}>{Math.round(spec.confidence * 100)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                <motion.div className={`h-full origin-left rounded-full ${low ? "bg-accent" : "bg-success"}`}
                  initial={{ scaleX: 0 }} animate={{ scaleX: spec.confidence }} transition={{ duration: 0.8, ease: "easeOut" }} />
              </div>
              {low && <p className="mt-3 flex items-center gap-2 text-sm text-accent"><AlertTriangle className="h-4 w-4" />Check these values</p>}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {Object.entries(spec.given).map(([k, v], i) => {
                const old = changed[k];
                const isChanged = old !== undefined;
                return (
                  <motion.label key={k}
                    initial={{ opacity: 0, x: photo ? -120 : 0, y: photo ? 0 : 12, scale: 0.9 }}
                    animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                    transition={{ ...spring, delay: 0.08 * i }}
                    className={`relative overflow-hidden rounded-xl border bg-background/60 px-4 py-3 ${
                      isChanged ? "border-accent ring-2 ring-accent/40 shadow-[0_0_24px] shadow-accent/30" : low ? "border-accent/70 ring-1 ring-accent/30" : "border-border"
                    }`}>
                    <motion.span className="pointer-events-none absolute inset-0 bg-primary/20"
                      initial={{ opacity: 0.8 }} animate={{ opacity: 0 }} transition={{ duration: 0.9, delay: 0.08 * i + 0.2 }} />
                    <span className="relative flex items-center gap-2 font-mono text-xs text-muted-foreground">
                      {k}
                      {isChanged && <span className="text-muted-foreground line-through">{old}</span>}
                    </span>
                    <span className="relative mt-1 flex items-baseline gap-1">
                      <AnimatePresence mode="popLayout">
                        <motion.input key={`${k}-${v}`} type="number" value={v} disabled={readonly}
                          initial={isChanged ? { y: 18, opacity: 0 } : false} animate={{ y: 0, opacity: 1 }} exit={{ y: -18, opacity: 0 }}
                          onChange={(e) => setSpec({ ...spec, given: { ...spec.given, [k]: Number(e.target.value) } })}
                          className={`w-full bg-transparent font-mono text-xl font-semibold outline-none ${isChanged ? "text-accent" : ""}`} />
                      </AnimatePresence>
                      <span className="font-mono text-sm text-muted-foreground">{UNITS[k] ?? ""}</span>
                    </span>
                  </motion.label>
                );
              })}
            </div>
            <p className="mt-5 text-sm"><span className="text-muted-foreground">Asked for: </span><span className="font-semibold text-primary">{spec.unknown}</span></p>

            <div className="mt-5 flex flex-wrap gap-2">
              {spec.readFromPhoto.map((c, i) => (
                <motion.span key={c} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.3 + i * 0.08 }}
                  className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-xs text-primary">{c}</motion.span>
              ))}
            </div>
            <ul className="mt-5 space-y-1 text-sm text-muted-foreground">
              {spec.assumptions.map((a) => <li key={a}>· {a}</li>)}
            </ul>
            {rebuilding ? (
              <p className="mt-8 flex items-center gap-3 font-mono text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-primary" />Rebuilding the experiment…</p>
            ) : !readonly && (
              <MotionButton {...lift} onClick={onBuild} className="mt-8 w-full rounded-2xl bg-primary px-6 py-4 text-lg font-semibold text-primary-foreground shadow-[0_10px_40px_-10px] shadow-primary/60">
                Build the experiment
              </MotionButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- Step 3: Experiment ---------------- */

function VersionStrip({ versions, active, onPick }: { versions: Version[]; active: number; onPick: (i: number) => void }) {
  if (versions.length === 0) return null;
  return (
    <div className="mb-4 flex gap-3 overflow-x-auto pb-1" style={{ perspective: 800 }}>
      <AnimatePresence initial={false}>
        {versions.map((v, i) => {
          const last = v.rounds[v.rounds.length - 1];
          const ok = last?.status === "match";
          const first = Object.entries(v.changed)[0];
          return (
            <motion.button key={i} onClick={() => onPick(i)}
              initial={{ rotateY: -90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ ...spring, duration: 0.5 }}
              whileHover={{ y: -2 }}
              className={`min-w-[170px] shrink-0 rounded-2xl border px-4 py-3 text-left ${i === active ? "border-primary bg-primary/10" : "border-border bg-card/60"}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{v.label}</span>
                {last ? (
                  <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {ok ? "match" : "off"} {last.errorPct?.toFixed(1)}%
                  </span>
                ) : <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {first ? `${first[0]} ${first[1]} → ${v.spec.given[first[0]]}` : i === 0 ? "original" : "no value change"}
              </p>
            </motion.button>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function Experiment({ html, running, phase, elapsed }: { html: string | null; running: boolean; phase: number; elapsed: number }) {
  const ready = html && !running;
  return (
    <motion.div
      initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...spring, duration: 0.5 }}
      className="relative min-h-[480px] overflow-hidden rounded-3xl border border-border bg-card xl:min-h-[600px]"
    >
      {ready ? (
        <>
          <iframe title="Generated experiment" sandbox="allow-scripts" srcDoc={html} className="absolute inset-0 h-full w-full" />
          <motion.div className="graph-paper pointer-events-none absolute inset-0 bg-primary/20"
            initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ duration: 0.9, ease: "easeOut" }} />
        </>
      ) : !html && !running ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
          <p className="text-lg">The experiment couldn't be built this time.</p>
          <p className="text-sm">See the message above. The round history on the right shows what was tried.</p>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center gap-12 p-8">
          <div className="hidden sm:block"><PendulumLoader /></div>
          <div>
            <ul className="space-y-4">
              {PHASES.map((p, i) => (
                <motion.li key={p} animate={{ opacity: i <= phase ? 1 : 0.35, x: i === phase ? 6 : 0 }} transition={spring}
                  className="flex items-center gap-4 text-xl">
                  <span className={`flex h-8 w-8 items-center justify-center rounded-full border transition-colors ${i < phase ? "border-success bg-success/15 text-success" : i === phase ? "border-primary text-primary" : "border-border"}`}>
                    {i < phase ? <AnimatedCheck /> : i === phase ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
                  </span>
                  {p}
                </motion.li>
              ))}
            </ul>
            <p className="mt-6 font-mono text-sm text-muted-foreground">{elapsed.toFixed(1)}s elapsed</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ChangeBox({ busy, onSend }: { busy: boolean; onSend: (t: string) => void }) {
  const [text, setText] = useState("");
  function send(t: string) {
    if (!t.trim() || busy) return;
    onSend(t.trim()); setText("");
  }
  return (
    <div className="rounded-2xl border border-border bg-card/70 p-4">
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-3">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Change the experiment..."
          className="flex-1 rounded-xl border border-border bg-background/60 px-4 py-3 outline-none focus:border-primary" />
        <MotionButton {...lift} type="submit" disabled={busy || !text.trim()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send
        </MotionButton>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {CHANGE_CHIPS.map((c) => <Chip key={c} onClick={() => send(c)}>{c}</Chip>)}
      </div>
    </div>
  );
}

/* ---------------- Step 4: Check ---------------- */

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

      {last && (last.status === "error" || last.status === "timeout") && (
        <div className="flex items-start gap-3 rounded-2xl bg-destructive/15 px-5 py-4 text-destructive">
          <X className="mt-1 h-5 w-5 shrink-0" />
          <span><span className="text-lg font-semibold">{last.status === "timeout" ? "Experiment timed out" : "Experiment failed"}</span>
          <span className="block text-sm opacity-80">No measurement was produced, so there is nothing to compare.</span></span>
        </div>
      )}
      {run && last?.status !== "match" && (
        <p className="font-mono text-xs text-muted-foreground">Stopped after {run.rounds.length} of {MAX_ROUNDS} rounds (budget ${BUDGET_USD.toFixed(2)}).</p>
      )}
      {last && last.errorPct != null && (
        <>
          <div>
            <div className="flex justify-between font-mono text-xs text-muted-foreground"><span>Difference</span><span>{last.errorPct.toFixed(1)}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <motion.div key={last.round} className={`h-full origin-left rounded-full ${ok ? "bg-success" : "bg-destructive"}`}
                initial={{ scaleX: 0 }} animate={{ scaleX: Math.min(1, last.errorPct / 10) }} transition={{ duration: 0.9, ease: "easeOut" }} />
            </div>
          </div>
          <motion.div key={`badge-${last.round}-${ok}`}
            initial={ok ? { scale: 0.6, opacity: 0 } : { opacity: 0 }}
            animate={ok ? { scale: [0.6, 1.08, 1], opacity: 1 } : { opacity: 1, x: [0, -10, 10, -6, 6, 0] }}
            transition={{ duration: 0.5 }}
            className={`relative flex items-center gap-3 rounded-2xl px-5 py-4 text-lg font-semibold ${ok ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
            {ok && (
              <motion.span className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-success"
                initial={{ scale: 1, opacity: 0.8 }} animate={{ scale: 1.08, opacity: 0 }} transition={{ duration: 1, delay: 0.2 }} />
            )}
            {ok ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
            {ok ? `Match within ${last.errorPct.toFixed(1)}%` : `Disagree by ${last.errorPct.toFixed(1)}%`}
          </motion.div>
        </>
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
        <div className="relative mt-3 space-y-2 pl-5">
          {rounds.length > 1 && (
            <motion.span className="absolute bottom-6 left-[5px] top-6 w-px origin-top bg-border"
              initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.6 }} key={rounds.length} />
          )}
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
          <MotionButton {...lift} onClick={onReset} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 py-3 font-medium hover:bg-secondary">
            <RotateCcw className="h-4 w-4" />Try another problem
          </MotionButton>
          <MotionButton {...lift} onClick={download} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-primary-foreground">
            <Download className="h-4 w-4" />Download experiment (.html)
          </MotionButton>
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
    <motion.div initial={{ opacity: 0, x: -24 }} animate={{ opacity: 1, x: 0 }} transition={spring}
      className="relative rounded-xl border border-border bg-background/50">
      <span className={`absolute -left-[19px] top-[18px] h-2.5 w-2.5 rounded-full ${ok ? "bg-success" : "bg-destructive"}`} />
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3 text-left font-mono text-sm">
        <span className="font-semibold">Round {r.round}</span>
        <span className="text-muted-foreground">{r.measured?.toFixed(2) ?? "—"} {unit}</span>
        <span className={ok ? "text-success" : "text-destructive"}>{r.errorPct?.toFixed(1) ?? "—"}%</span>
        <span className="ml-auto text-muted-foreground">{r.seconds.toFixed(1)}s · ${r.costUsd.toFixed(2)}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="border-t border-border px-4 py-3 text-sm text-muted-foreground">{r.feedback ?? "No feedback."}</motion.p>
        )}
      </AnimatePresence>
    </motion.div>
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
      <MotionButton {...lift} onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-secondary">
        <History className="h-4 w-4" />Replays<ChevronDown className="h-3.5 w-3.5" />
      </MotionButton>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }}
            className="absolute right-0 z-20 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl">
            {err && <p className="p-4 text-sm text-destructive">Couldn't load replays.</p>}
            {!err && !items && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
            {items?.map((it) => (
              <button key={it.id} onClick={() => { setOpen(false); onPick(it.id); }} className="block w-full px-4 py-3 text-left text-sm hover:bg-secondary">
                {it.title}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
