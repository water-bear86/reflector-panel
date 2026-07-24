## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-24 - Semantic Form Labeling Constraints and Dynamic Form Inputs
**Learning:** HTML <label> tags with htmlFor must only target standard labelable elements (like input, select, textarea, button). Pointing them to <code> or <div> results in invalid HTML and is ignored by screen readers. Furthermore, interactive dynamic loops containing inputs/selects should have dynamic index-based aria-labels to guarantee distinct and precise accessible names for assistive devices.
**Action:** Always label non-form fields with styled <span> tags combined with aria-describedby for assistive device association instead of <label htmlFor="..." />. In mapped loops, use template literals like `Rule ${index + 1} type` to dynamically produce unique ARIA labels.
