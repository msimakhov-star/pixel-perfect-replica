import type { ProblemSpec } from "@/engine/types";

// Placeholder animation used until the real `simulate` function exists.
export function mockSimulationHtml(spec: ProblemSpec): string {
  const g = JSON.stringify(spec.given);
  return `<!doctype html><html><head><style>
html,body{margin:0;height:100%;background:#0b1224;color:#e8ecf4;font-family:ui-monospace,monospace;overflow:hidden}
canvas{display:block;width:100%;height:100%}
#hud{position:absolute;top:12px;left:16px;font-size:13px;opacity:.85}
</style></head><body><div id="hud"></div><canvas id="c"></canvas><script>
const topic=${JSON.stringify(spec.topic)};const G=${g};
const c=document.getElementById('c'),x=c.getContext('2d'),hud=document.getElementById('hud');
function rs(){c.width=innerWidth*devicePixelRatio;c.height=innerHeight*devicePixelRatio;x.setTransform(devicePixelRatio,0,0,devicePixelRatio,0,0)}rs();onresize=rs;
const g=G.g||9.8,rad=d=>d*Math.PI/180;let t0=performance.now();
function grid(W,H){x.strokeStyle='rgba(120,160,255,.08)';for(let i=0;i<W;i+=32){x.beginPath();x.moveTo(i,0);x.lineTo(i,H);x.stroke()}for(let j=0;j<H;j+=32){x.beginPath();x.moveTo(0,j);x.lineTo(W,j);x.stroke()}}
function f(){const W=innerWidth,H=innerHeight;x.clearRect(0,0,W,H);grid(W,H);let t=(performance.now()-t0)/1000;
if(topic==='projectile'){const v=G.v0||50,a=rad(G.angle||45),T=2*v*Math.sin(a)/g,R=v*v*Math.sin(2*a)/g,s=(W-80)/R,base=H-50;t=t%(T+1);const tt=Math.min(t,T);
x.strokeStyle='rgba(255,190,90,.5)';x.setLineDash([5,6]);x.beginPath();for(let k=0;k<=tt;k+=T/200){const px=40+v*Math.cos(a)*k*s,py=base-(v*Math.sin(a)*k-.5*g*k*k)*s;k?x.lineTo(px,py):x.moveTo(px,py)}x.stroke();x.setLineDash([]);
x.strokeStyle='#e8ecf4';x.beginPath();x.moveTo(0,base);x.lineTo(W,base);x.stroke();
const px=40+v*Math.cos(a)*tt*s,py=base-(v*Math.sin(a)*tt-.5*g*tt*tt)*s;x.fillStyle='#5aa9ff';x.beginPath();x.arc(px,py,9,0,7);x.fill();
hud.textContent='t = '+tt.toFixed(2)+' s   x = '+(v*Math.cos(a)*tt).toFixed(1)+' m';}
else if(topic==='pendulum'){const L=G.L||2,th=rad(G.theta||10),w=Math.sqrt(g/L),ang=th*Math.cos(w*t),px=W/2,py=60,len=Math.min(H-140,L*120);
x.strokeStyle='#e8ecf4';x.beginPath();x.moveTo(px-80,py);x.lineTo(px+80,py);x.stroke();const bx=px+len*Math.sin(ang),by=py+len*Math.cos(ang);
x.beginPath();x.moveTo(px,py);x.lineTo(bx,by);x.stroke();x.fillStyle='#ffbe5a';x.beginPath();x.arc(bx,by,14,0,7);x.fill();
hud.textContent='t = '+t.toFixed(2)+' s   θ = '+(ang*180/Math.PI).toFixed(2)+'°';}
else{const th=rad(G.theta||30),d=G.length||5,a=g*Math.sin(th),T=Math.sqrt(2*d/a);t=t%(T+1);const tt=Math.min(t,T),s=.5*a*tt*tt;
const x0=60,y0=H-60,len=Math.min(W-120,(H-120)/Math.sin(th)),x1=x0+len*Math.cos(th),y1=y0-len*Math.sin(th);
x.strokeStyle='#e8ecf4';x.beginPath();x.moveTo(x0,y0);x.lineTo(x1,y1);x.lineTo(x1,y0);x.closePath();x.stroke();
const k=1-s/d,bx=x0+(x1-x0)*k,by=y0+(y1-y0)*k;x.save();x.translate(bx,by);x.rotate(-th);x.fillStyle='#5aa9ff';x.fillRect(-16,-28,32,28);x.restore();
hud.textContent='t = '+tt.toFixed(2)+' s   s = '+s.toFixed(2)+' m';}
requestAnimationFrame(f)}f();
</script></body></html>`;
}
