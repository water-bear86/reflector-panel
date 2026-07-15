## 2025-05-14 - Visual Feedback for Copy Actions
**Learning:** In applications involving wallet addresses or contract mints, providing immediate visual feedback upon "Copy" is critical for user confidence. Using a transient "Copied" state with a clear visual transition (glow/border change) prevents repeated clicks and reduces uncertainty.
**Action:** Always implement a `copied` state and update button text/styles when handling clipboard actions. Ensure the transition is accessible via `aria-label` updates.

## 2025-05-14 - Tutorial Interference in UI Automation
**Learning:** Persistent "First Time Tutorial" overlays can block automated UI verification scripts by masking the intended interaction targets.
**Action:** Verification scripts should explicitly check for and dismiss tutorial modals/masks before attempting to interact with the page.
