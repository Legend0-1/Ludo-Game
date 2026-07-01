"use client";

import { useEffect, useRef } from "react";
import { COLOR_HEX, COLOR_NAMES, type Color } from "@/lib/ludo";

interface WinOverlayProps {
  open: boolean;
  winnerColor: Color;
  winnerName: string;
  onPlayAgain: () => void;
}

export default function WinOverlay({
  open,
  winnerColor,
  winnerName,
  onPlayAgain,
}: WinOverlayProps) {
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      btnRef.current?.focus();
      spawnConfetti(COLOR_HEX[winnerColor]);
    }
  }, [open, winnerColor]);

  if (!open) return null;

  return (
    <div
      className="win-overlay show"
      role="dialog"
      aria-label={`${winnerName} wins`}
    >
      <div className="text-center px-6">
        <div
          className="font-display text-5xl sm:text-7xl font-black mb-4"
          style={{ color: COLOR_HEX[winnerColor] }}
        >
          {COLOR_NAMES[winnerColor]} Wins!
        </div>
        <p
          className="text-base sm:text-lg mb-8"
          style={{ color: "var(--muted-foreground)" }}
        >
          All tokens reached home!
        </p>
        <button
          ref={btnRef}
          onClick={onPlayAgain}
          className="roll-btn tv-focusable"
          style={{ fontSize: 16, padding: "14px 40px" }}
        >
          Play Again
        </button>
      </div>
    </div>
  );
}

/** Spawn confetti pieces for the win celebration. */
function spawnConfetti(baseColor: string): void {
  if (typeof document === "undefined") return;
  const colors = [baseColor, "#fff", "#ffd700", mixToWhite(baseColor)];
  for (let i = 0; i < 80; i++) {
    const el = document.createElement("div");
    el.className = "confetti-piece";
    el.style.left = Math.random() * 100 + "vw";
    el.style.top = "-20px";
    el.style.width = Math.random() * 8 + 4 + "px";
    el.style.height = Math.random() * 8 + 4 + "px";
    el.style.background = colors[Math.floor(Math.random() * colors.length)];
    el.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
    el.style.animationDuration = (Math.random() * 2 + 2) + "s";
    el.style.animationDelay = Math.random() * 1.5 + "s";
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }
}

function mixToWhite(hex: string): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, ((num >> 16) & 0xff) + 80);
  const g = Math.min(255, ((num >> 8) & 0xff) + 80);
  const b = Math.min(255, (num & 0xff) + 80);
  return `rgb(${r},${g},${b})`;
}
