## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-21 - Unique Accessible Labeling in Mapped Form Loops
**Learning:** Standardizing static ARIA labels or placeholder-only descriptions inside React maps/loops creates screen reader clutter and ambiguity. Providing dynamic, index-based labels (e.g. `Rule 1 action type` vs `Rule 2 action type`) and explicitly setting `aria-pressed` for active button states within looped toggle components dramatically increases context and navigational ease for screen reader users.
**Action:** Always include dynamic indexes in labels, descriptions, and name-based attributes when mapping form elements, and ensure selection-style states are explicitly marked with `aria-pressed`.
