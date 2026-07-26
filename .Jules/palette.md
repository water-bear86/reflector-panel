## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-26 - Dynamic Form Fields Accessibility and Semantic Aria Attributes
**Learning:** For dynamic or mapped lists of inputs (such as a list of builder rules), using dynamic `aria-label` attributes containing the index of the item (e.g. `Rule 1 type`) allows screen readers to clearly identify which specific rule or field is being configured, while `aria-pressed` indicates the active selection state of custom toggle button groups.
**Action:** Always provide unique, dynamically labeled `aria-label` attributes for mapped inputs, and set `aria-pressed` on custom button-toggles within forms.
