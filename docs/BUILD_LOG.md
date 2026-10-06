# Build log (6 Oct 2026, GPT-6 Astra Hackathon London)

- Lovable: generated the Photo-to-Physics app (snap / read / experiment / check flow, animations, replays).
- Codex: connected to the Lovable workspace via the Lovable MCP server; reviewed the generated app, found that early versions used scripted demo data, and had Lovable replace it with real wiring: GPT-6 Astra extraction and simulation calls, deterministic solvers, sandboxed measurement harness, perturbation test, 3-round self-check loop, saved runs.
- Lovable Cloud: `runs` table for real replays; OpenAI key and pricing stored as server secrets.
- GitHub: two-way sync connected, repository made public.
- First real end-to-end run (projectile sample, photo): Astra read 50 m/s, 45°, g 9.8; the generated experiment matched the formula on round 1 (max height 63.78 m), g +10% perturbation test passed; 89 s, $0.21.
- Bug fixes: samples/photos re-encoded to compact JPEG before upload (phone photos no longer hit the size limit, sample loading no longer fails), zero-reference guard in error %, clear failure states instead of frozen loaders.
