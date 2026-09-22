# Jarvis Design System — sync notes

## Why this repo needed non-default config

`code_docs` is a full-stack app (Family Management health tracker + Jarvis),
**not a published component-library package**. `package.json` has no
`main`/`module`/`exports` field, and `npm run build` (`tsc -b && vite build`)
produces a full application bundle — there is no `dist/` entry a converter
can point `--entry` at. This is not a config-override situation; it's genuine.

Scope was deliberately narrowed to **primitives only** — the components that
are actually generic/reusable, not tightly wired to Jarvis's own data model.
Confirmed with the user (2026-09-22): `Icon`, `HudPanel`, `Overlay`,
`ToastProvider`, `ApprovalDialog`, all under `src/features/jarvis/ui/`.
Everything else under `src/features/jarvis/` (JarvisApp, ConversationStream,
ContextPanel, JarvisCore, panels/*, console/*, etc.) is excluded — those are
single-purpose screens that need real Jarvis conversation/memory/voice state
to render meaningfully, not composable design-system building blocks.

## Required local setup before every build (re-syncs too)

1. **Junction** (Windows dir junction, not a symlink — no admin needed):
   `node_modules/jarvis-design-system` → `src/features/jarvis`. This gives
   the converter a `node_modules/<pkg>` layout to resolve `PKG_DIR` from,
   with `--node-modules` pointed at the repo's real `node_modules` (so
   `react`/`react-dom` also resolve normally). Recreate on a fresh clone:
   ```
   mklink /J node_modules\jarvis-design-system src\features\jarvis
   ```
   (or `New-Item -ItemType Junction` in PowerShell). Remove when done working
   in this repo — it's disposable, `npm ci` wipes `node_modules` anyway.

2. **Generated CSS entry**: `src/features/jarvis/design/.ds-sync-bundle.css`
   — the literal concatenated content of `tokens.css` + `layout.css` +
   `components.css`, in that order, nothing rewritten. Required because
   `cfg.cssEntry`'s content is read and appended/copied **verbatim** (the
   converter does not resolve `@import` inside it), so a barrel file of
   `@import` statements would silently produce broken references once
   copied to the output root. Order between the three doesn't matter for
   correctness — they only interact via `:root` custom properties
   (`var(--j-*)`), not cascade-order-dependent same-selector overrides.
   Regenerate before every build:
   ```sh
   cat src/features/jarvis/design/tokens.css \
       src/features/jarvis/design/layout.css \
       src/features/jarvis/design/components.css \
       > src/features/jarvis/design/.ds-sync-bundle.css
   ```
   Gitignored (see below) — never hand-edit it.

   **Path-depth gotcha**: `cfgPath` resolves relative config paths (like
   `extraFonts`) against `PKG_DIR` as the junction path itself
   (`node_modules/jarvis-design-system`, 2 segments from repo root) — NOT
   its realpath target (`src/features/jarvis`, 3 segments). So `extraFonts`
   entries need `../../node_modules/...`, not `../../../node_modules/...`.

3. **A minimal `src/features/jarvis/package.json`** (`{"name":
   "jarvis-design-system", "version": "0.0.0", "private": true}`) —
   `lib/dts.mjs`'s `projectFor()` reads `package.json` directly from the
   junction target with no fallback, so it must exist even though nothing
   else about the file matters (no real `.d.ts`/`types`/`typings` field —
   the component list comes entirely from `componentSrcMap`, not dist
   exports). Gitignored, recreate each session.

4. Fonts come through `cfg.extraFonts` pointing directly at the real
   `@fontsource/rajdhani` / `@fontsource/jetbrains-mono` CSS files in
   `node_modules` (Jarvis loads these via a JS side-effect import in
   `design/fonts.ts`, not a CSS `@import`, so the scraper can't find them
   any other way).

`cfg.srcDir: "ui"` + an explicit `componentSrcMap` pin for all 5 components
keeps discovery scoped exactly to `src/features/jarvis/ui/` — nothing outside
that folder is walked or bundled, so the ~15 excluded app screens never end
up in the shipped `_ds_bundle.js` even via synth-entry's `export *` fallback.

4. **`cfg.dtsPropsFor` is required for all 5 components**, not optional
   polish. With no real compiled `.d.ts` tree, prop extraction silently
   degrades to `{[key: string]: unknown}` for every component —
   `package-validate.mjs`'s "all .d.ts parse cleanly" line only checks
   TypeScript SYNTAX, not that real prop names were captured. Caught this
   by actually reading the emitted `.d.ts`/`.prompt.md` files before
   upload, not by trusting the validator's summary line. If any of the 5
   components' real prop signatures change (`ApprovalDialog.tsx`,
   `HudPanel.tsx`, `Icon.tsx`, `Overlay.tsx`, `ToastProvider.tsx`), update
   the matching `dtsPropsFor` entry in config by hand and re-verify the
   emitted `.d.ts` content directly — don't trust a clean validate run
   alone to mean the props are right.

## Known render warns

(none — the 3 [GRID_OVERFLOW] warnings on ApprovalDialog/Overlay/
ToastProvider were resolved with `cardMode: "single"` overrides, not
triaged-and-ignored; a clean re-sync should show zero warnings)

## Re-sync risks

- The `.ds-sync-bundle.css` concatenation is regenerated fresh, not diffed —
  if `tokens.css`/`layout.css`/`components.css` change, a re-sync must
  regenerate it before rebuilding, or it'll validate against stale CSS.
- If the 5 scoped components' props/behavior change in ways that make an
  authored preview no longer representative (e.g. `ApprovalDialog` gains a
  new required prop), the preview `.tsx` files need a look, not just a
  rebuild.
- `ToastProvider` calls `setCoreSignal('attention', ...)` from
  `../logic/coreStore.ts` internally (not exported, just bundled as a
  dependency) — harmless in the design-agent's sandbox (nothing reads that
  store there), but if `coreStore.ts`'s import path or shape changes, the
  bundle build could break even though nothing about the toast UI itself
  changed.
- `useToast` is exposed on the bundle (via the entry barrel) purely so the
  `ToastProvider` preview can call it and share the same `ToastContext`
  instance as the bundled provider — it's not a documented "component" and
  has no card of its own. If `toastContext.ts`'s export shape changes,
  re-check the entry barrel and the `ToastProvider` preview together.
- If this repo ever grows a *real* component-library package boundary
  (e.g. `src/features/jarvis` becomes its own workspace package with a real
  build), switch `shape`/`componentSrcMap`/`cssEntry` over to point at that
  instead of this synth-entry workaround — it'll be a strictly better source
  of truth (`.d.ts`-driven discovery instead of hand-pinned names).
