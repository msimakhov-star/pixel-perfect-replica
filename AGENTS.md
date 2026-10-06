<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Model calls (extract/simulate) run as TanStack server functions in src/lib/engine.functions.ts via src/lib/openai.server.ts, not Supabase Edge Functions — the stack forbids new edge functions.
- Experiment correctness is judged only by deterministic solvers (src/lib/physics.ts) against measurements from the sandboxed iframe harness (src/lib/harness.ts); never let the model supply the reference value.
