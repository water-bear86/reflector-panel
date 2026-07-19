## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-19 - Stateful Feedback and Semantic ARIA Integration in Actionable Interfaces
**Learning:** Ensuring clipboard or dynamic actions provide clear visual and state-based screen reader feedback (such as changing ARIA label from 'Copy' to 'Copied') prevents user confusion when interacting with address inputs or dynamic rule configs, especially for multi-stage pipelines where actions have asynchronous or permanent consequences.
**Action:** Always map screen reader-friendly roles, pressed states (aria-pressed), and dynamic aria-labels to state changes, while preserving the existing aesthetics and design tokens.
