# Palette's Journal

## 2025-05-14 - Clipboard Feedback Pattern
**Learning:** The project uses a specific `dazzle-copy` and `dazzle-copied` CSS pattern in `globals.css` to provide visual feedback for clipboard actions, including a pink border and glow. This was missing from the newly generated pipeline wallet address, leading to a static interaction.
**Action:** Apply `dazzle-copy` class and a `copied` state to all clipboard-interactive elements to maintain consistency with the `TokenDetails` component.
