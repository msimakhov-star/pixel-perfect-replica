// Runs generated experiments inside a sandboxed iframe (allow-scripts only,
// never allow-same-origin) and asks them to measure via numerical integration.

const HARNESS = `<script>(function(){
function send(m){parent.postMessage(m,'*')}
addEventListener('message',function(e){var d=e.data;if(!d||d.type!=='p2p-measure')return;
try{if(typeof window.measure!=='function')throw new Error('window.measure is not defined');
Promise.resolve(window.measure(JSON.parse(JSON.stringify(d.given)))).then(
function(v){send({type:'p2p-result',id:d.id,value:Number(v)})},
function(err){send({type:'p2p-result',id:d.id,error:String(err&&err.message||err)})});
}catch(err){send({type:'p2p-result',id:d.id,error:String(err&&err.message||err)})}});
send({type:'p2p-ready'});
})();</script>`;

export function withHarness(html: string): string {
  const i = html.toLowerCase().lastIndexOf("</body>");
  return i >= 0 ? html.slice(0, i) + HARNESS + html.slice(i) : html + HARNESS;
}

export class MeasureError extends Error {
  constructor(message: string, public kind: "timeout" | "error") { super(message); }
}

/** Loads the html once and runs `measure(given)` for each parameter set. */
export async function measureAll(html: string, sets: Record<string, number>[], timeoutMs = 15000): Promise<number[]> {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:800px;height:600px;opacity:0;pointer-events:none";
  let onMsg: ((e: MessageEvent) => void) | null = null;
  try {
    const wait = <T,>(pred: (d: { type?: string; id?: number; value?: number; error?: string }) => T | undefined, label: string) =>
      new Promise<T>((resolve, reject) => {
        const t = setTimeout(() => reject(new MeasureError(`${label} timed out after ${timeoutMs / 1000}s`, "timeout")), timeoutMs);
        onMsg = (e: MessageEvent) => {
          if (e.source !== frame.contentWindow) return;
          const r = pred(e.data ?? {});
          if (r !== undefined) { clearTimeout(t); resolve(r); }
        };
        window.addEventListener("message", onMsg);
      }).finally(() => { if (onMsg) window.removeEventListener("message", onMsg); });

    const ready = wait((d) => (d.type === "p2p-ready" ? true : undefined), "Loading the experiment");
    frame.srcdoc = withHarness(html);
    document.body.appendChild(frame);
    await ready;

    const out: number[] = [];
    for (let i = 0; i < sets.length; i++) {
      const p = wait((d) => (d.type === "p2p-result" && d.id === i ? d : undefined), "Measuring");
      frame.contentWindow?.postMessage({ type: "p2p-measure", id: i, given: sets[i] }, "*");
      const r = await p;
      if (r.error) throw new MeasureError(`Experiment threw: ${r.error}`, "error");
      if (typeof r.value !== "number" || !Number.isFinite(r.value)) throw new MeasureError("Experiment returned a non-numeric measurement", "error");
      out.push(r.value);
    }
    return out;
  } finally {
    frame.remove();
  }
}
