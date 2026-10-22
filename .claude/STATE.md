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

## Current Work: P1-1 typed client + centralized permissions (Codex handoff)

<!-- Maintained by the Claude main agent as a rate-limit fallback. If Claude is unavailable, a Codex session can resume from here. Last updated: 2026-10-22 (after PR-A verification). -->

**Status (2026-10-22, PR-A merged to develop):** #44 merged (develop `a81bff8`, staging DB deploy succeeded). Release PR #45 (develop → main) opened; after merge, the production `Deploy Supabase` needs Yuulis's approval (applies `20261022140000`, `20261022150000`; both compatible with deployed code).
**Open decision (blocks PR-B):** in PRODUCTION the `会計` role has `type = 'admin'` (2 users), so 会計 users are global admins in both `is_admin()` and `lib/roles/parse.ts:53`. Staging/local seed has `会計` type `accounting`. Until this is resolved, D3/D4/D7 and the step-11 self-approval guard do not restrict production 会計 users. Ask the user before changing production role data; change only after PR-A is live in production.
Next: release #45 → prod checks → resolve the 会計 type decision → read-only prod inventory → PR-B (plan steps 11–12).
**会計 role decision (user, 2026-10-22):** fix production `会計` role type admin→accounting (the 会計 user who also holds `Admin` stays admin). Grant 会計 additionally: delete others' transactions + soft-delete subsidy items, and accounting-group/fiscal-year management. Keep admin-only: wallet master, past-FY budget edit/approval, own-row break-glass, reassigning created_by/approved_by, officer-role appointment. Release: widening + type-fix together, approving the prod DB deploy only after Vercel is live.
**会計 split status:** implemented + verified by main agent on `feature/accounting-role-split` (commits 8cfbfd7, c84058c, e716cb3; vitest 486/486, build 0, test db 142 PASS with 6 TODO, no drift). Opened as PR #46 (→ develop). PR-A is LIVE in production (#45 merged, prod DB at `20261022150000`, deploy success). Migrations: A `20261023100000` (widening + `soft_delete_subsidy_item` RPC), B `20261023110000` (会計 type admin→accounting). Prod: the 1 non-Admin 会計 user has a group role, so non-club filing keeps working after B. PR-B NOTE: when fixing the insert-policy tautology (step 12), allow 会計 (has_role) to file into all non-club groups, matching the app.
Known residual issues: non-admin `deleteMember` still has the 0-row/auth-cascade problem; admin can self-approve in two logged steps (reassign created_by, then approve); break-glass intent audit row persists if the update fails.

**Read first:**
- Per-step progress log (appended by the implementer after each commit): `.claude/logs/p1-progress.md`.
- Plan + binding user decisions: `.claude/docs/plans/p1-typed-permissions.md` (§4 steps, §10 decisions + amendment).
- Project status / roadmap (Japanese): `docs/manual/project-status/roadmap.md`.

**Binding decisions (summary):**
- Approvers = admin + 会計, never own rows, and past fiscal years admin-only. Leaders cannot approve or edit others' transactions.
- Edit-form status change: admin + 会計 on others' rows. An admin may also change their OWN rows (break-glass) and must write an audit_logs entry. 会計 may not change their own rows. The normal approval action blocks self-approval for everyone.
- Budget edit: admin always, 会計 current fiscal year only, leaders never.
- The approval RPC is deferred to R6. Use a conditional UPDATE that requires exactly 1 row.
- PR-A = steps 1–10 + 13, with additive migrations only. PR-B = steps 11–12 (restrictive migrations). Release PR-B only after PR-A is live in production, and run a read-only production role/group inventory before step 12.

**How to resume (Codex):**
1. Run `git log --oneline develop..HEAD` and compare the commits against plan §4 to find the next step.
2. Implement the remaining steps with the same rules: tests that prove each bug before its fix, no skipped or weakened tests, Japanese commit messages, no push.
3. Acceptance:
   - `npm run lint`
   - `npm run typecheck`
   - `npm test`
   - `npm run build` (with the dummy env from `.github/workflows/ci.yml`)
   - `supabase db reset --local`, `supabase db lint --local`, `supabase test db --local`
   - a types drift check: `supabase gen types typescript --local` and `git diff --exit-code lib/database.types.ts`

**Environment notes:**
- Supabase CLI 2.121.0 with the Docker WSL integration. The project is linked, so always pass `--local`; never `db push` or `--linked`.
- Production DB deploys (main) wait for manual approval by Yuulis.
- Prod ref: `csphhemmhzayyhlasirc`. Staging ref: `gygyuqivcvwgvyuekqvy`.

**Done so far (all in production):** P0 S1–S4 and B1–B3 (PRs #39–#43).
