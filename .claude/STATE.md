# Agent State

## Main Agent

Claude Code

<!-- Default only: each session's main agent is decided by its entry point (`claude` or an interactive `codex`); see root AGENTS.md. -->

## Repository Identity

<!-- Managed by /init. Re-run /init to refresh. -->

_Not initialized yet. Run `/init` to populate._

Macro requirements and design live in [docs/DESIGN.md](docs/DESIGN.md).

## Progress Tracker

Rolling progress summary (latest 5 checkpoints): [PROGRESS.md](../PROGRESS.md)

<!-- Working state below is maintained by workflow skills and manual notes. -->

<!-- Existing CLAUDE.md content preserved by scripts/install.sh. -->

# CLAUDE.md — Claude Code Orchestrator Contract

Claude Code in this repository acts as an **orchestrator, not an implementer**.
Top priorities are "conversation quality" and "context conservation".

## 1) Mission

- Organize, prioritize, and build consensus on user requests
- Delegate to appropriate agents (Codex / Opus Subagents / Antigravity)
- Integrate results, make decisions, and present next actions

## 2) Non-Goals (things Claude should NOT do directly)

- Large-scale implementation (guideline: implementations exceeding 10 LOC)
- Large-scale investigation (cross-codebase analysis, web research) → delegate to Opus subagents
- Sequential reading of lengthy logs / large numbers of files

The above must always be delegated.

## 3) Routing Policy

- **Planning** → Claude leads and finalizes; consult Codex (sol, high effort) as a design consultant for complex/high-stakes design (architecture, data model, security-sensitive)
- **Implementation** → Codex subagent (via `general-purpose` or direct `codex exec`)
- **Code review** → Claude subagents: Sonnet by default, Opus for high-risk changes; `/codex:review` as an additional cross-tool lane for high-risk diffs
- **External research, broad analysis** → `general-purpose` subagent (Opus); Antigravity may assist in the information-gathering phase as needed
- **Multimodal input (PDF, images, etc.)** → Claude handles directly (Opus 4.7+ has strong multimodal capabilities); delegate large-scale analysis to the `general-purpose` subagent
- **Error root cause analysis** → `codex-debugger`
- **Cross-model second opinion (high-stakes design/plan verification, tiebreaks)** → Antigravity CLI (`agy`, Gemini 3.x)
- **Minor fixes (single file, small changes)** → Claude handles directly

Model/effort lane map (SSOT, incl. Codex-side sol/terra/luna routing): `.claude/rules/model-routing.md`.
Codex delegation detail (when to delegate, triggers, prompt contract): `.claude/rules/codex-delegation.md`.
Antigravity delegation detail (second-opinion policy, prompt contract): `.claude/rules/antigravity-delegation.md`.

## 4) Delegation Trigger

Delegate when any of the following apply:

1. Output is likely to exceed 10 lines
2. Need to read 3 or more files
3. Web information or up-to-date information needs to be verified

Codex-specific triggers (multi-file changes, design decisions, trade-off analysis, unclear root cause): see `.claude/rules/codex-delegation.md` — Delegation Decision.

## 5) Execution Patterns

### A. Foreground (wait for result)
Use when the next step depends on the result. Request a 3–5 bullet summary as the return format.

### B. Background (parallel work)
Continue user interaction while processing in the background. Launch independent tasks concurrently.

### C. Save-to-file (large output)
Save results exceeding 20 lines to `.claude/docs/` and return only a summary to the conversation.

## 6) Output Contract to User

- Lead with the conclusion, then rationale, then next actions
- Make uncertainty explicit (distinguish between speculation, unverified, and needs confirmation)
- Always show executed commands, changed files, and test results

## 7) Quality Gates (before final response)

- Change intent matches the user's request
- Diff files have been self-reviewed
- At least one executable test/check has been run
- If failures exist, clearly state the cause and blast radius

## 8) Language Protocol

See `.claude/rules/language.md` (SSOT): think in English, respond to the user in Japanese, code/identifiers/commands in English.

## 9) Repository Conventions

- Python environment uses `uv` (do not use `pip` directly)
- Existing rules in `.claude/rules/` take highest priority
- Research notes are stored in `.claude/docs/research/` (keep empty when distributing templates)
- Document map: `CLAUDE.md` = orchestrator contract; `.claude/docs/DESIGN.md` = 要件定義書 (macro requirements/design); `PROGRESS.md` = micro work progress (latest 5 checkpoints); `docs/manual/<theme>/` = Japanese spec/status summaries (`.claude/rules/manual-docs.md`).

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# @orchestra:template-boundary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Repository Identity

<!-- Managed by /init. Re-run /init to refresh. -->

_Not initialized yet. Run `/init` to populate._

Macro requirements & design live in **[.claude/docs/DESIGN.md](.claude/docs/DESIGN.md)** (要件定義書).
Keep this section thin — a brief identity line + pointer. Thick content belongs in DESIGN.md.

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# @orchestra:repo-boundary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<!-- Working state below: appended by /feature, /design-tracker, /checkpointing, and manual notes. -->

## Progress Tracker

Rolling progress summary (latest 5 checkpoints): [PROGRESS.md](./PROGRESS.md)

## Current Work: P2 orphaned receipts + deleteMember (Codex handoff)

<!-- Maintained by the Claude main agent as a rate-limit fallback. If Claude is unavailable, a Codex session can resume from here. The main agent commits this file on the PR branch right before each push. Last updated: 2026-10-24. -->

**Status (2026-10-25):** everything through #56 (transfers auto-approved + audit-log viewer) is merged to develop. #52–#56 are NOT yet released to main; migrations pending prod: `20261024120000_rate_limit_buckets.sql` (#52), `20261025100000_auto_approve_transfers.sql`, `20261025110000_audit_logs_select_accounting.sql` (#56) — all compatible with deployed code; approve prod DB deploy on release.
**User decisions (2026-10-25):** transfers approved at creation; financial_accounts UI deferred; audit-log viewer = admin + 会計.
**Current task:** branch `feature/p2-cleanup-integrity` from develop @ `c876fa6`. Codex Sol run, label `p2-cleanup-integrity`, spec `.claude/logs/p2-cleanup-integrity-prompt.md`, result `.claude/logs/p2-cleanup-integrity-result.json`. (A) prevent new orphaned receipt files (cleanup of abandoned uploads with ownership + not-referenced checks; files of deleted records are KEPT as evidence) and a read-only `npm run report:orphans` script (no delete mode). Prod read-only count 2026-10-25: 412 objects, 58 orphans (~11.8 MB). Deleting prod files needs explicit user approval. (B) `deleteMember` → SECURITY DEFINER RPC `soft_delete_member` (migration `20261025120000_soft_delete_member_rpc.sql`, DB must deploy first/with the code) + ban the Auth user instead of deleting it.
**Progress:** DONE by Codex Sol (d24ac0f, 48b2c04, 1fbc32a, f3c9354) + main agent fix 4737d77 (removed duplicate app-side DELETE audit for subsidy-linked transactions; DB trigger `audit_deleted_transaction` now records every physical delete). Verified: lint/typecheck OK, vitest 631/631, db lint OK, test db 420 PASS, types no drift, build OK, E2E 16/16, local report:orphans OK, no deleteUser in app/lib. Migrations: 20261025120000 soft_delete_member RPC, 20261025121000 delete-evidence triggers, 20261025122000 receipt cleanup claims (SHARE locks on transactions/subsidy_items/audit_logs during claim; deploy DB first or together). PR to develop opened. NEXT: after merge, with user approval, run `npm run report:orphans` against prod (read-only) and ask before deleting any prod file; P2 then complete → offer main release PR (#52–#57).
**Authorization (user):** after verification, push + open PRs without asking; still ask before merges, prod deploy approval, remote data writes. Merged branches/worktrees may be deleted.
**Routing rule (user):** clear-spec / simple tasks → Codex Luna xhigh (`--model "${CODEX_MODEL_LUNA:-gpt-6-luna}" --config model_reasoning_effort=xhigh`); design / review / debugging → Sol. Implementers must not touch `.claude/STATE.md` (not even revert it).

**Binding permission decisions (P1):** approvers = admin + 会計, never own rows, past fiscal years admin-only; admin may change own rows via edit form (audited, fail-closed); budget edit: admin always, 会計 current FY only; leaders cannot approve or edit others' rows; 部長/副部長 read the club ledger read-only. Details: `.claude/docs/plans/p1-typed-permissions.md` §10, `.claude/docs/plans/accounting-role-split.md`.
**Known residual issues:** non-admin `deleteMember` 0-row/auth-cascade problem; admin can self-approve in two logged steps; orphaned storage files; `TransferForm` not mounted; no `financial_accounts` / audit-log UI.

**Environment notes:**
- Prefix commands with `export PATH=/home/yuulis/.nvm/versions/node/v24.21.0/bin:$PATH` (else node v18 + Windows codex shim → "Missing optional dependency @openai/codex-linux-x64").
- Supabase CLI 2.121.0; project is linked, so always `--local`; never `db push`/`--linked`. Slim stack: `supabase start -x studio,logflare,vector,realtime,mailpit,imgproxy,edge-runtime`. Keep Docker load low: no restarts, few E2E runs.
- E2E: export env from `supabase status -o env` without printing keys (API_URL → NEXT_PUBLIC_SUPABASE_URL + SUPABASE_URL, ANON_KEY → NEXT_PUBLIC_SUPABASE_ANON_KEY, SERVICE_ROLE_KEY → SUPABASE_SERVICE_ROLE_KEY); port 3000 is another project's dev server → `E2E_PORT=3100`.
- Prod ref `csphhemmhzayyhlasirc`, staging ref `gygyuqivcvwgvyuekqvy`; prod DB deploys (main) need approval by Yuulis.
- Roadmap (Japanese): `docs/manual/project-status/roadmap.md`.

