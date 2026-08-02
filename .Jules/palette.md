## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-17 - Dynamic Forms Accessibility and Selection State Tracking in Segmented Button Controls
**Learning:** When rendering forms and toggles inside a mapped loop (such as dynamically added rules), programmatically generating unique IDs containing the index and associating them with hidden screen-reader-only labels ensures perfect accessible names and prevents DOM conflicts. Furthermore, setting the `aria-pressed` state on segmented/toggle button controls properly broadcasts the currently selected active option to screen reader users.
**Action:** Always use dynamic index-based IDs in mapped form arrays to link labels to their inputs, and apply `aria-pressed` to segmented toggle groups to expose selection state.
