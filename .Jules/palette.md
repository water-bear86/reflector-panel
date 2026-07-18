## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-17 - Micro-UX and Clipboard Accessibility for Dynamic Pipeline Elements
**Learning:** Copy-to-clipboard interactions, especially for crucial developer assets like generated wallet public keys, require immediate, high-contrast visual feedback and polite ARIA live-region updates (`aria-live="polite"`, `aria-label`) so that both visual users and screen-reader users receive instantaneous confirmation without layout shifts.
**Action:** Always complement clipboard buttons with a temporary success state (e.g., "Copied"), dynamic accessibility labels, and style cues (like `dazzle-copied`) to build a reassuring and solid user experience.
