# AGENTS.md

This file defines repository-specific instructions for `dsh-univer-office`, an installable Univer bundle for DeepSeek Harness (DSH). Follow inherited instructions as well.

## 1. Sources of truth

- Read [`docs/architecture.md`](docs/architecture.md) before changing architecture, ownership, trust boundaries, cross-process protocols, tool flows, or deployment behavior.
- Keep standing development rules and commands in this file.
- Keep user-visible capabilities, configuration, and limitations synchronized in both [`README.md`](README.md) and [`README.zh-CN.md`](README.zh-CN.md).
- Keep model workflows in `skills/`. Do not duplicate tool schemas or step-by-step agent workflows elsewhere.
- Describe only the current implementation. Do not preserve prototype behavior unless it remains a documented product contract.

## 2. Commands and validation

Use Node.js `>=22.19.0` and `pnpm@11.23.0`.

```sh
pnpm install
pnpm run lint
pnpm run lint:fix
pnpm run typecheck
pnpm run format:check
pnpm run format
```

- Treat `oxlint.config.ts` as project policy. Fix lint errors instead of weakening rules; change rule severity only when the task explicitly targets lint policy.
- `lint:fix` and `format` mutate files. Run them only when their full write scope is intended and reviewed.
- `format` and `format:check` are repository-wide. Do not create unrelated formatting churn. For a narrow change, check supported files directly with `pnpm exec oxfmt --check <files>`.
- `pnpm run build` builds Host/Client, Worker, Gateway, Render Machine, and Viewer. Use `build:lib`, `build:worker`, `build:gateway`, `build:render`, or `build:viewer` for a narrower build.
- Smoke tests consume `lib/` and `artifacts/`. Always build the affected target from the current source before running its smoke test.

Choose the narrowest validation that proves the change:

| Change                                                                                        | Build first                      | Test                                                            |
| --------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Host, HTTP, or tools                                                                          | `pnpm run build:lib`             | `pnpm run test:host`                                            |
| DSH Client                                                                                    | `pnpm run build:lib`             | `pnpm run test:client`                                          |
| Bundled skills                                                                                | None                             | `pnpm run test:skills`                                          |
| Viewer UI                                                                                     | `pnpm run build:viewer`          | Add `test:integration` when behavior crosses a process boundary |
| Gateway, Worker, persistence, worktree lifecycle, Render Machine, or a cross-process protocol | Build every affected application | `pnpm run test:integration`                                     |
| Cross-layer or release change                                                                 | None separately                  | `pnpm test` (builds every target first)                         |

Run `pnpm run typecheck` for TypeScript changes and `git diff --check` before every handoff. Report the exact commands that completed successfully.

## 3. Architecture and Cordis boundaries

- A complete capability seam consists of a Service Definition, Provider, and Consumer. `UniverService` is the stable Host boundary; HTTP and tools remain Consumers, while concrete Gateway, Worker, cache, and worktree behavior remains in the Provider.
- WebServer and tools call only `ctx.univer`. They must not access Gateway adapters, workers, subprocesses, or the filesystem directly.
- Function plugins export the applicable named members among `name`, `inject`, `Config`, and `apply`; do not add a default export. Declare dependencies through `inject`, not mounting order.
- Mount the root plugin by bare package name in `cordis.patch.yml`. A relative or internal entry prevents DSH from discovering the browser bundle declared by `package.json#dsh.client`.
- Every registration belongs to the current Cordis fiber and must be reversible. Use `ctx.effect()`, `ctx.on()`, or a registry API that returns an exact disposer. Unload must leave no routes, tools, skill providers, listeners, timers, or subprocesses behind.
- Validate deployable configuration before use. Resolve behavioral defaults explicitly in the Provider that owns them; do not hide deployment defaults deep inside execution code.
- Model-visible facts must come from replayable structured session events. `univer_*` tools return the file, worktree, and Unit identities required to recover a target; Client code must not parse free text or shell output.
- Tool presentation depends only on arguments and persisted results. Before adding a tool, define execution, cancellation, timeout, structured output, presentation, approval, and skill guidance, then validate the real Consumer path.

## 4. Runtime boundaries

- Client components do not call `fetch` directly. Keep HTTP in `src/client/api/` and polling or mutations in hooks.
- The Client projects replayable session events and authoritative Host state; it does not own worktree truth, read local files, or manage Gateway processes.
- `src/shared/wire/` contains JSON-serializable data only and must not depend on Node.js, React, Cordis, or Univer.
- Validate every process, HTTP, and wire boundary at runtime. Do not duplicate hostile-input validation for values that remain in one TypeScript process.
- Use existing branded types for file, worktree, and Unit identities across boundaries.
- Host creates Viewer URLs only after authorizing the resource. Client treats file, worktree, Unit, mode, and scope parameters as opaque and may append only presentation-only values such as language.
- Gateway, Worker, Viewer, and Render Machine are independent applications. Communicate through explicit protocols; do not import process-owned state across applications or depend on a global `univer` CLI or external source checkout.

## 5. Security and lifecycle invariants

- Content writes require an explicit `draft` worktree. `ready` and `reopen` are normal agent operations. `merge` and `discard` require an explicit user request plus DSH approval and must never be automatic cleanup.
- `merged` and `discarded` are terminal. Preserve their historical review projection, but remove live windows and mutation controls.
- Bind every browser query and mutation to both the DSH session and workspace scope. Caches, polling, window deduplication, and review state must never leak across sessions.
- Authorize every file, import, export, screenshot output, and SVG resource against the explicit tool/session workspace, then verify it again with `realpath` at the Provider boundary. A shared Gateway process does not grant shared file access.
- Concurrent Gateway starts share one startup operation. Failure, early exit, and unload must clear ownership and allow retry. Stop only subprocesses started by this plugin, skip occupied ports, and verify the health endpoint identity.
- Cancellation and teardown must reach quiescence: reject new notifications, abort or kill owned work, and await Worker, browser, and subprocess exit. One clear owner manages settlement and cleanup for each asynchronous operation.
- `univer_screenshot` may return model-visible PNG attachments only when the current model supports image input and every output path is authorized. Claim visual verification only for images actually inspected; structural readback and Slide lint are not pixel-level proof.

## 6. TypeScript and error contracts

- Use ESM, explicit `.ts` relative imports, and top-level `import type` declarations. Keep `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax` passing.
- Do not bypass type safety with broad assertions or unexplained `any`.
- Handle closed unions exhaustively by discriminant.
- Define stable errors in the layer that owns the failure. HTTP and tool Consumers map those errors without parsing messages or exposing stacks, internal absolute paths, or raw subprocess output.
- Comments and JSDoc explain non-obvious behavior, failure modes, timing, ownership, or security constraints. Do not restate code or preserve reasoning transcripts. An empty `catch` must name the expected failure it ignores.
- Follow the surrounding format and naming. Avoid repository-wide cleanup during a scoped task.

## 7. Testing

- Test observable behavior and external effects, not implementation claims. Read files back after file operations and assert final state plus resource cleanup for lifecycle behavior.
- Cover relevant success, rejection, cancellation, and race paths for new behavior.
- Use temporary workspaces and dynamic ports. Tests must not depend on a global CLI, existing demo files, fixed ports, or leftover local processes.
- Mock only expensive or nondeterministic external boundaries such as network and time. Prefer real Service, Router, Gateway, and package entry paths elsewhere.
- Keep source and artifact validation separate: typecheck `src/`; built smoke tests consume artifacts generated from the same checkout immediately before the test.

## 8. Documentation, generated files, and workspace safety

- Keep public README sections such as How it works, Built-in tools, and Development written for users or external contributors. Internal layering, trust boundaries, protocol details, and packaging decisions belong in `docs/architecture.md` or this file.
- Update both READMEs for any user-visible capability, configuration, or limitation change. Update the relevant core or Unit skill when a model workflow changes.
- Do not hand-edit or commit `lib/`, `artifacts/`, `dist/`, `*.tgz`, or `*.zip`. Run `scripts/build-dist.sh` only when explicitly producing release artifacts.
- Exact Univer SDK, API Reference, and insiders versions form one cross-application compatibility contract. Upgrade them as one compatible family and run the full build and integration suite. Install and validate native dependencies on the target platform; never copy `node_modules` between platforms as a release artifact.
- Inspect `git status` before editing. Preserve staged, unstaged, and untracked user work, including intentional manifest and lockfile versions. Run dependency installation only when the task requires dependency changes.
- Prefer `rg` and `rg --files`. Modify only files required by the task and never revert unrelated changes.
