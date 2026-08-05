## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-08-05 - Multi-Option Interactive Elements and Dynamic State Accessibility
**Learning:** Utilizing unique dynamic labels inside loops (e.g. indexing form controls with 'Rule {i + 1}') provides screen readers with context-aware names for identical controls. Applying 'aria-pressed' to selection state buttons and managing 'aria-label' dynamically for state-changing buttons (like 'Copy' vs. 'Copied') makes the interface's dynamic behavior instantly clear to assistive technologies.
**Action:** Use loop indices or loop context for unique control labels, implement aria-pressed on toggle buttons, and provide state-reflective labels on dynamically updating click actions.
