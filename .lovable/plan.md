# Photo-to-Physics — build plan

Single-page app: snap a physics problem photo, review extracted values, watch a generated experiment, and see an honest check against the textbook formula. Fully clickable with mock data until your engine and backend functions land.

## Look and feel ("night lab")
- Deep navy background with faint graph-paper grid, chalk-white text, electric blue + warm amber accents, green = match, red = disagree.
- Large confident display type (Space Grotesk headings, IBM Plex Mono for numbers/units).
- Smooth step transitions, animated count-up on numbers. Tuned for 1920x1080 recording; photo step works on mobile.

## Page flow (4-step progress bar at top)
1. **Snap** — big drop zone "Photograph a physics problem" (upload + mobile camera capture). "Try a sample" cards: Projectile, Pendulum, Incline with thumbnails in `public/samples/` (generated illustrations).
2. **Read** — photo left; right side shows editable value fields with units, the unknown, "read from photo" chips, assumptions, confidence meter. Confidence < 0.6 highlights fields + "Check these values". "Build the experiment" button. Unsupported topic shows a friendly card + sample buttons.
3. **Experiment** — large panel with `<iframe sandbox="allow-scripts" srcdoc>` (never allow-same-origin). Loading state with four steps and elapsed seconds.
4. **Check** — Experiment vs Formula big numbers + % difference; green/red badge (red never hidden); perturbation test line; expandable Round history (value, error %, seconds, cost, feedback); running cost + model name "gpt-6-astra"; "Try another problem" and "Download experiment (.html)".

**Replays menu** (top right): loads `public/replays/index.json` and `<id>.json`, plays back a run step by step with a "Replay of a real run" badge. I will include one or two sample replay files.

## Technical details
- Types exactly as specified in `src/engine/types.ts`.
- All engine calls in `src/lib/api.ts`: `extract({imageBase64})` and `simulate({spec, feedback?})`, currently mocked (1.5 s delay, sample spec per topic, placeholder canvas animation HTML). Mock simulate runs a short round loop producing Round records. Errors and slow responses handled with elapsed timers.
- Stack is TanStack Start (not plain Vite/React Router) — the page lives at `/`; works the same. Lovable Cloud enabled so your `extract`/`simulate` backend functions can be added later; no tables, no auth.
- GitHub sync is connected by you from the project's Connectors/GitHub settings (cannot be done from chat).
- Proper page title/description metadata.
