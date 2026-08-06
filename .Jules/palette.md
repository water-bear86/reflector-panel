## 2026-07-16 - Accessible Form Elements and Screen Reader Optimization in Pipeline Creator
**Learning:** Proper programmatic association using htmlFor, id, and aria-describedby for form elements, as well as marking decorative elements as aria-hidden="true" when adjacent to explicit text, provides a clean, robust, and noise-free experience for assistive technologies like screen readers without visual styling compromises.
**Action:** Always link labels to inputs with id/htmlFor, connect instructions/hint texts to form inputs with aria-describedby, and hide redundant or decorative adjacent graphics/icons using aria-hidden="true".

## 2026-07-17 - Dynamic ARIA Labels in Form Loops and Uniform Copy Micro-interactions
**Learning:** Form inputs mapped in dynamic loops (such as multi-rule lists) require dynamic accessible names (e.g. `aria-label={`Rule ${i + 1} type`}`) to ensure screen readers provide unique context to the user. Additionally, clipboard copy elements should uniformly apply design system classes like `dazzle-copy`/`dazzle-copied` and state-driven `aria-label` text to make dynamic transitions both visually clear and accessible.
**Action:** For loops generating multiple form controls, inject dynamic index-based accessible labels. For any copy button, wrap it in a micro-interaction feedback handler with state-driven ARIA text indicators.
