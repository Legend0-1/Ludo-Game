"use client";

import { COLOR_HEX, type Player } from "@/lib/ludo";

interface PlayerCardProps {
  player: Player;
  isActive: boolean;
  index: number;
}

export default function PlayerCard({ player, isActive }: PlayerCardProps) {
  const finishedCount = player.tokens.filter((t) => t.pos === 58).length;
  const color = COLOR_HEX[player.color];

  return (
    <div
      className={`player-card transition-all ${
        isActive ? "active" : ""
      }`}
      style={{
        background: "var(--card)",
        border: `1px solid ${isActive ? color + "aa" : "var(--border)"}`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <div
          className="w-3 h-3 sm:w-4 sm:h-4 rounded-full flex-shrink-0"
          style={{
            background: color,
            boxShadow: isActive ? `0 0 8px ${color}` : "none",
          }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs sm:text-sm truncate">
              {player.name}
            </span>
            {player.isAI && (
              <span
                className="text-[9px] px-1 py-0.5 rounded"
                style={{
                  background: "var(--secondary)",
                  color: "var(--muted-foreground)",
                }}
              >
                AI
              </span>
            )}
          </div>
          <div className="flex gap-1 mt-0.5">
            {player.tokens.map((t, j) => {
              let cls = "token-dot";
              if (t.pos === -1) cls += " home";
              if (t.pos === 58) cls += " finished";
              return (
                <span
                  key={j}
                  className={cls}
                  style={{
                    background: color,
                    width: 8,
                    height: 8,
                  }}
                />
              );
            })}
          </div>
        </div>
        <span
          className="text-[10px] sm:text-xs font-mono"
          style={{ color: "var(--muted-foreground)" }}
        >
          {finishedCount}/4
        </span>
      </div>
    </div>
  );
}
