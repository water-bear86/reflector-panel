## 2025-05-14 - Accessible Form Controls and Icon Links
**Learning:** Screen readers need explicit programmatic associations between labels, inputs, and their corresponding helper/hint text to provide full context to users. Icon-only links and buttons are invisible to screen readers without ARIA labels.
**Action:** Always link form labels using `htmlFor`/`id`, use `aria-describedby` to associate hint text with inputs, and provide `aria-label` for all icon-only interactive elements.
