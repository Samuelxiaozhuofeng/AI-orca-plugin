<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the plugin source. Entry point is `src/main.ts`.
- UI registration and Orca integration live in `src/ui/`.
- React view components are in `src/views/`.
- State is in `src/store/`, services in `src/services/` (subfolders `ai/`, `external/`, `notes/`), settings schema in `src/settings/`.
- Utilities are in `src/utils/`; shared components in `src/components/`; styles in `src/styles/`.
- `bridge/` is the local-AI relay (Orca Agent Bridge, see `bridge/README.md`); `scripts/` holds build/package/test scripts.
- Docs live under `module-docs/` and `plugin-docs/`. Build output goes to `dist/`.

## Build, Test, and Development Commands
- `npm run dev`: Vite dev server with hot reload for local iteration.
- `npm run build`: Type-checks with `tsc`, builds the production bundle, then runs `scripts/post-build.mjs`, which copies `dist/` to the `copyTo` path in `build.config.local.json` (skipped if that file is absent).
- `npm run package`: Builds the release zip (`scripts/package-release.mjs`).
- `npm test`: Bundles `tests/run-tests.ts` with esbuild and runs it.
- `npm run preview`: Serves the production build locally for verification.

## Coding Style & Naming Conventions
- TypeScript, 2-space indentation, `tsconfig.json` is `strict`.
- Naming patterns:
  - UI registration: `src/ui/*.ts`
  - React views: `src/views/*.tsx`
  - Stores: `src/store/*-store.ts`
  - Services: `src/services/*.ts`
- React is accessed via `window.React` and components are created with `createElement`.
- Use `--orca-color-*` CSS variables and inline styles to keep theme compatibility.

## Testing Guidelines
- Tests live in `tests/*.test.ts` and use the small harness in `tests/test-harness.ts`; register each new test file by importing it in `tests/run-tests.ts`, then run `npm test`.
- The bridge has its own self-check: `node bridge/selftest.mjs`.
- Validate behavior in Orca Note (panel registration, context selection, streaming UI).

## Commit & Pull Request Guidelines
- The repo has git history; commit messages are short Chinese sentences describing the user-visible effect.
- Use concise, imperative commit messages (e.g., "Add context preview caching").
- PRs should include: summary, testing notes, and screenshots for UI changes.

## Security & Configuration Tips
- API credentials are configured via Orca settings (`src/settings/ai-chat-settings.ts`).
- Do not commit secrets; rely on user settings or environment-provided values.

## Agent-Specific Notes
- `CLAUDE.md` (local, gitignored) may hold extra architecture notes; `ARCHITECTURE.md` is the checked-in overview.
- Use `module-docs/` for module behavior and UI expectations.
