"use client";

interface RulesModalProps {
  open: boolean;
  onClose: () => void;
}

export default function RulesModal({ open, onClose }: RulesModalProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="rounded-2xl p-6 sm:p-7 max-w-md w-full max-h-[80vh] overflow-y-auto tv-focusable"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
        }}
        role="dialog"
        aria-label="How to play"
      >
        <h2
          className="font-display text-xl font-bold mb-4"
          style={{ color: "var(--accent)" }}
        >
          How to Play
        </h2>
        <div
          className="space-y-3 text-sm"
          style={{ color: "var(--muted-foreground)", lineHeight: 1.7 }}
        >
          <p>
            <strong style={{ color: "var(--foreground)" }}>Roll 2 dice</strong> —
            the sum of both dice is how far you move. Roll a{" "}
            <strong style={{ color: "var(--foreground)" }}>6 on either die</strong>{" "}
            to bring a token out of your home base.
          </p>
          <p>
            <strong style={{ color: "var(--foreground)" }}>Move tokens</strong>{" "}
            clockwise by the sum shown on the dice.
          </p>
          <p>
            <strong style={{ color: "var(--foreground)" }}>Capture</strong> an
            opponent&apos;s token by landing on it (not on safe spots marked with
            stars).
          </p>
          <p>
            <strong style={{ color: "var(--foreground)" }}>Doubles</strong> (both
            dice showing the same number) give you an extra turn. Three
            consecutive doubles forfeit your turn.
          </p>
          <p>
            <strong style={{ color: "var(--foreground)" }}>Home stretch</strong> —
            after going around the board, enter your colored column. You need an
            exact roll to reach the center.
          </p>
          <p>
            <strong style={{ color: "var(--foreground)" }}>Win</strong> by
            getting all 4 tokens to the center home.
          </p>
          <p>
            <strong style={{ color: "var(--foreground)" }}>On TV</strong> — use
            the D-pad to navigate tokens and OK to confirm your move.
          </p>
        </div>
        <button
          onClick={onClose}
          className="roll-btn tv-focusable mt-5 w-full text-center"
          style={{ fontSize: 13, padding: "10px" }}
          autoFocus
        >
          Got It
        </button>
      </div>
    </div>
  );
}
