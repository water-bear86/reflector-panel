## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-08-07 - Dynamic Aria Labels and Pressed States for Custom Forms
**Learning:** Dynamically-generated form controls and button-based selections inside a mapped array can present confusing duplicate labels for screen-reader users unless distinguished with dynamic `aria-label` attributes incorporating indices or context, and custom toggle buttons are supplemented with explicit `aria-pressed` state attributes.
**Action:** Use dynamic indices or labels for inputs inside loops, and apply `aria-pressed` to buttons functioning as selection tabs or toggle controls.
