## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-17 - Micro-UX and Aria-Pressed Optimization in Rule Builder
**Learning:** Adding explicit aria-labels to dynamic dynamically-mapped fields and aria-pressed states to choice presets (like check-interval or reach mode options) ensures that complex multi-rule and config flows are easily navigated and fully understood by assistive technologies.
**Action:** Apply dynamic aria-labels in loops and ensure segmented buttons explicitly use aria-pressed to communicate selected state.
