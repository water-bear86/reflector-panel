import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

interface TourStep {
  selector: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    selector: '[data-tour="brand"]',
    title: "Welcome to Wen Stimmy",
    body: "Turn your Pump.fun creator fees into automatic holder growth — airdrops, buybacks, or straight transfers. No manual claiming, no custody of your keys.",
  },
  {
    selector: '[data-tour="wallet-hud"]',
    title: "Non-custodial by design",
    body: "Creating a pipeline generates a fresh wallet just for it. You set that wallet as your token's sole Pump.fun fee receiver — your own private key never touches this app.",
  },
  {
    selector: '[data-tour="rule-builder"]',
    title: "Build your rules",
    body: "Pick what happens to collected fees: Airdrop to holders, Buy back & burn, or Send to a wallet. Add as many rules as you like — their percentages must add up to 100%.",
  },
  {
    selector: '[data-tour="holder-modes"]',
    title: "Choose your reach",
    body: "Airdrop rules have three reach modes — Bless (10 lucky holders, big drops each), @Here (a thicker spread), or Spam (max holders per buy). The per-holder payout estimate updates live under the drop threshold below.",
  },
  {
    selector: '[data-tour="drop-threshold"]',
    title: "Set a drop threshold",
    body: "Fees accumulate until spendable SOL clears this amount, then a round fires.",
  },
  {
    selector: '[data-tour="poll-interval"]',
    title: "Pick a check interval",
    body: "How often the pipeline checks for collectible fees — Spam (every 3 min), Middle Bun (every 5 min), or Low (every 10 min).",
  },
  {
    selector: '[data-tour="validate-button"]',
    title: "Validate, then commit",
    body: "Press VALIDATE to see the exact workflow before creating anything. This matters: once created there's no edit screen, so validating is your one real chance to catch a mistake.",
  },
  {
    selector: '[data-tour="create-button"]',
    title: "Activate on Pump.fun",
    body: "After creating, set the generated wallet as your token's fee receiver on Pump.fun, then hit Activate. Once verified on-chain, fees start flowing automatically.",
  },
];

const HOLE_PAD = 8;
const GAP = 16; // space between the cutout and the tooltip
const MARGIN = 16; // minimum space kept between the tooltip and the viewport edge
const TOOLTIP_W = 340;
const FALLBACK_CARD_HEIGHT = 260; // best guess before the card's real height is measured

interface Hole {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

/* First-run walkthrough — a spotlight mask (not a modal): the whole page dims except a cutout
   around the real element each step describes, with a callout beside it. Shown once
   automatically (see the localStorage gate in pages/index.tsx), reopenable any time via the
   header's "?" button. */
export default function FirstTimeTutorial({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [hole, setHole] = useState<Hole | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(FALLBACK_CARD_HEIGHT);

  const measure = useCallback(() => {
    const el = document.querySelector(STEPS[step].selector) as HTMLElement | null;
    // querySelector still matches elements hidden via `display: none` (e.g. the Configuration
    // HUD below Tailwind's lg breakpoint) — those report a degenerate 0x0 rect at (0,0), which
    // would otherwise look like a "valid" hole in the corner instead of falling back cleanly.
    const isHidden = !el || (el.offsetWidth === 0 && el.offsetHeight === 0);
    if (!el || isHidden) {
      setHole(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Clamp every edge to BOTH ends of its axis, not just one — mid-scroll (before
    // scrollIntoView finishes) the target can sit far outside the viewport, and a one-sided
    // clamp lets top/left run arbitrarily large, producing a hole taller than the viewport
    // itself and a wildly out-of-bounds tooltip position.
    setHole({
      top: Math.min(vh, Math.max(0, r.top - HOLE_PAD)),
      left: Math.min(vw, Math.max(0, r.left - HOLE_PAD)),
      right: Math.max(0, Math.min(vw, r.right + HOLE_PAD)),
      bottom: Math.max(0, Math.min(vh, r.bottom + HOLE_PAD)),
    });
  }, [step]);

  useEffect(() => {
    if (!open) return;
    measure();
    document.querySelector(STEPS[step].selector)?.scrollIntoView({ behavior: "smooth", block: "center" });
    // Smooth scrolling fires many scroll events — keep re-measuring so the cutout tracks the
    // target the whole way, not just before/after the animation.
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, step, measure]);

  // Measure the card's REAL height (it varies by step — longer body text, Back button present
  // or not) before paint, so the position below never has to guess and then overflow.
  useLayoutEffect(() => {
    if (!open || !cardRef.current) return;
    setCardHeight(cardRef.current.getBoundingClientRect().height);
  }, [open, step, hole]);

  if (!open) return null;

  const isFirst = step === 0;
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const finish = () => {
    setStep(0);
    setHole(null);
    onClose();
  };
  const next = () => setStep((s) => Math.min(STEPS.length - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));

  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;

  // Always resolved to a `top` in px, clamped so the card's REAL (measured) height never pushes
  // it past either viewport edge — a fixed-position box that overflows the viewport can't be
  // scrolled into view, so it just reads as "covered by the browser window."
  let tooltipTop: number;
  if (!hole) {
    tooltipTop = Math.max(MARGIN, vh / 2 - cardHeight / 2);
  } else {
    const spaceBelow = vh - hole.bottom - GAP - MARGIN;
    const spaceAbove = hole.top - GAP - MARGIN;
    tooltipTop =
      spaceBelow >= cardHeight || spaceBelow >= spaceAbove
        ? Math.min(hole.bottom + GAP, vh - cardHeight - MARGIN) // below, clamped to the bottom edge
        : Math.max(MARGIN, hole.top - GAP - cardHeight); // above, clamped to the top edge
    tooltipTop = Math.max(MARGIN, tooltipTop);
  }
  const tooltipLeft = hole
    ? Math.min(Math.max(hole.left, MARGIN), Math.max(MARGIN, vw - TOOLTIP_W - MARGIN))
    : Math.max(MARGIN, vw / 2 - TOOLTIP_W / 2);

  return (
    <>
      {hole ? (
        <>
          {/* Four bars dim everything outside the cutout; the hole itself is left uncovered so
              the highlighted element stays visible and interactive. */}
          <div className="fixed bg-black/75 z-[90]" style={{ top: 0, left: 0, right: 0, height: hole.top }} />
          <div className="fixed bg-black/75 z-[90]" style={{ top: hole.bottom, left: 0, right: 0, bottom: 0 }} />
          <div className="fixed bg-black/75 z-[90]" style={{ top: hole.top, left: 0, width: hole.left, height: hole.bottom - hole.top }} />
          <div className="fixed bg-black/75 z-[90]" style={{ top: hole.top, left: hole.right, right: 0, height: hole.bottom - hole.top }} />
          <div
            className="fixed pointer-events-none z-[90] border-2 border-pink-400 shadow-[0_0_0_4px_rgba(236,72,153,0.15),0_0_24px_2px_rgba(236,72,153,0.6)]"
            style={{ top: hole.top, left: hole.left, width: hole.right - hole.left, height: hole.bottom - hole.top }}
          />
        </>
      ) : (
        <div className="fixed inset-0 bg-black/75 z-[90]" />
      )}

      <div
        className="fixed z-[91]"
        style={{ top: tooltipTop, left: tooltipLeft, width: `min(${TOOLTIP_W}px, calc(100vw - 2rem))` }}
      >
        <div
          ref={cardRef}
          className="glass-card p-5 space-y-4 overflow-y-auto"
          style={{ maxHeight: vh - MARGIN * 2 }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-pink-300 font-bold">
              Step {step + 1} of {STEPS.length}
            </span>
            <button onClick={finish} aria-label="Close tutorial" className="dazzle-close">
              <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
                <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div>
            <h3 className="text-base font-bold text-white mb-1.5">{current.title}</h3>
            <p className="text-sm text-slate-300 leading-relaxed">{current.body}</p>
          </div>

          <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`w-1.5 h-1.5 ${i === step ? "bg-pink-400" : "bg-white/15"}`} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button type="button" onClick={back} className="btn-secondary flex-1 text-sm">
                Back
              </button>
            )}
            {!isLast ? (
              <button type="button" onClick={next} className="btn-primary flex-1 text-sm">
                Next
              </button>
            ) : (
              <button type="button" onClick={finish} className="btn-deploy flex-1 text-sm">
                Let's go
              </button>
            )}
          </div>

          {!isLast && (
            <button
              type="button"
              onClick={finish}
              className="w-full text-center text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Skip tutorial
            </button>
          )}
        </div>
      </div>
    </>
  );
}
