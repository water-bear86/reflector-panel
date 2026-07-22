## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-22 - Improving Form Loop Accessibility and Toggle Button ARIA States
**Learning:** Standard form loops mapping over dynamic fields (like rules) often lack unique, accessible names for interactive elements, which confuses assistive technologies. Adding dynamic `sr-only` labels associated via htmlFor/id, using `aria-pressed` on multi-toggle button presets, and dynamically updating `aria-label` for buttons that toggle state (like Copy to Copied) creates an intuitive screen reader journey without modifying visual layout.
**Action:** Map dynamic, unique IDs to loop items, utilize visually hidden labels for implicit form fields, and strictly apply `aria-pressed` or dynamic `aria-label` states on custom buttons with active selection states.
