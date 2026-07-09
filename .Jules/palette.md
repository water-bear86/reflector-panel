## 2025-05-14 - Initial Accessibility Audit
**Learning:** The application uses several icon-only interactive elements (buttons, links, selects) that lack descriptive labels for screen readers. It also uses hint text for form fields that isn't programmatically linked to the input.
**Action:** Always check for missing aria-labels on icon buttons and ensure form labels are correctly associated with inputs using htmlFor/id. Use aria-describedby to link helper text to its corresponding input.
