## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-31 - Mapped Dynamic Form Controls & Accessible States
**Learning:** For dynamic forms generated via mapped arrays (like growth rules), standard form labels can become redundant or hard to link programmatically. Using dynamic, contextual `aria-label` attributes on controls (such as specifying "Rule 1 action type", "Rule 1 percentage") ensures unique accessible names. Furthermore, using `aria-pressed` on toggle/preset buttons accurately communicates selected states to assistive technologies without breaking custom non-standard markup architectures.
**Action:** Always provide unique contextual labels on input arrays and use `aria-pressed` for custom toggles/segmented controls to ensure accessible state synchronization.
