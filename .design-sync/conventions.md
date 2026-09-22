## Jarvis design system — conventions

A dark, technical HUD language (corner-bracketed panels, monospace labels,
cyan-primary/semantic-color glow). No provider/root wrapper is required —
these components carry their own styling and work standalone.

**Styling idiom: CSS custom properties + real class names**, not utility
classes or a prop-based theme system. Read `styles.css` and its `@import`
closure (`_ds_bundle.css`) before styling anything new — every token below
is defined there.

Color is semantic — use the token that matches the *meaning*, not just a
color you like:

| Token | Meaning |
|---|---|
| `--j-cyan` / `--j-cyan-bright` | normal / active |
| `--j-blue` / `--j-blue-bright` | system, informational |
| `--j-green` | ready, approved, success |
| `--j-amber` | attention, pending, warning |
| `--j-red` | error, destructive |
| `--j-bg` / `--j-bg-2` | page background (near-black) |
| `--j-panel` / `--j-panel-solid` / `--j-raised` | surface layers |
| `--j-line` / `--j-line-soft` / `--j-line-strong` | border opacity steps |
| `--j-text` / `--j-text-h` / `--j-muted` | body / heading / muted text |
| `--j-font-display` | Rajdhani — headings, brand word, buttons |
| `--j-font-mono` | JetBrains Mono — labels, meta, timestamps |
| `--j-font-body` | system-ui — long-form body text |
| `--j-radius` / `--j-radius-lg` | 3px / 6px corner radius |
| `--j-gap` | 12px, the standard spacing unit |
| `--j-glow` / `--j-glow-strong` | box-shadow glow, state indication only |
| `--j-ease`, `--j-dur-fast/--j-dur/--j-dur-slow` | one motion curve, 3 speeds |

For new markup around these components (not the components' own internals,
which are already styled), reuse the real class vocabulary rather than
inventing new classes: `.j-panel` (+ `.j-panel-head`/`.j-panel-title`/
`.j-panel-body`/`.j-panel-actions`) for a framed section; `.j-btn` with a
modifier — `.j-btn.primary`, `.j-btn.ghost`, `.j-btn.danger`, `.j-btn.small`,
`.j-btn.block` — for buttons; `.j-icon-btn` for icon-only buttons;
`.j-badge` for small inline tags. Labels read `"LABEL //"` (a trailing
double-slash), not plain text.

**`ToastProvider` is a context provider, not a visual component on its
own** — wrap the part of the app that should be able to raise
notifications in `<ToastProvider>`, then call `useToast().notify({tone,
label, text, action?, attention?})` from anywhere inside it. `tone` is one
of `info | success | warn | error` and drives both the color and the
default sound/duration — don't hardcode a color when a tone exists for it.

**`Overlay`** (`variant="modal" | "drawer" | "sheet"`) is the single
mechanism behind every dialog, drawer and bottom sheet — reach for it
instead of hand-building an overlay. `ApprovalDialog` is the pattern to
copy for a confirm/cancel step that needs a working state.

### Example — a panel with a primary action, in the DS's own idiom

```tsx
import { HudPanel, Icon } from 'jarvis-design-system'

<HudPanel label="MEMORY" meta="3 SAVED">
  <p style={{ margin: 0, color: 'var(--j-text)', fontSize: 13 }}>
    3 facts recalled from the last 7 days.
  </p>
  <button type="button" className="j-btn primary">
    <Icon name="check" size={16} /> REVIEW
  </button>
</HudPanel>
```
