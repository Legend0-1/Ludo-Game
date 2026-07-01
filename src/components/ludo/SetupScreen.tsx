"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLOR_HEX,
  COLOR_NAMES,
  DEFAULT_SETUP,
  type SetupEntry,
} from "@/lib/ludo";
import { primeAudio } from "@/lib/sounds";

interface SetupScreenProps {
  onStart: (setup: SetupEntry[]) => void;
  onMultiplayer: (playerName: string) => void;
}

export default function SetupScreen({ onStart, onMultiplayer }: SetupScreenProps) {
  const [setup, setSetup] = useState<SetupEntry[]>(
    DEFAULT_SETUP.map((e) => ({ ...e })),
  );
  const [playerName, setPlayerName] = useState("Player 1");
  const startBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    startBtnRef.current?.focus();
  }, []);

  const toggleActive = (i: number) => {
    setSetup((s) =>
      s.map((p, idx) => (idx === i ? { ...p, active: !p.active } : p)),
    );
  };

  const toggleAI = (i: number) => {
    setSetup((s) =>
      s.map((p, idx) => (idx === i ? { ...p, isAI: !p.isAI } : p)),
    );
  };

  const handleStart = () => {
    primeAudio();
    const active = setup.filter((p) => p.active);
    if (active.length < 2) return;
    onStart(setup);
  };

  return (
    <div className="app-shell relative w-full overflow-hidden">
      {/* African aesthetic background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url(/african-bg.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {/* Dark vignette overlay so text is readable */}
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(14,14,14,0.78) 0%, rgba(14,14,14,0.94) 70%, rgba(14,14,14,0.98) 100%)",
        }}
      />
      <div className="bg-noise" style={{ opacity: 0.06 }} />
      <div
        className="glow-blob"
        style={{
          width: 500,
          height: 500,
          background: "var(--accent)",
          top: -150,
          left: -150,
          opacity: 0.1,
        }}
      />

      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg">
          <div className="text-center mb-6 sm:mb-8">
            <h1
              className="font-display text-5xl sm:text-7xl font-black tracking-wider mb-2 sm:mb-3"
              style={{
                color: "var(--accent)",
                textShadow: "0 4px 24px rgba(200, 149, 108, 0.5)",
              }}
            >
              LUDO
            </h1>
            <p
              className="text-xs sm:text-sm"
              style={{ color: "var(--muted-foreground)" }}
            >
              The classic board game — phone · tablet · TV
            </p>
          </div>

          {/* Mode buttons */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              ref={startBtnRef}
              type="button"
              onClick={handleStart}
              className="roll-btn tv-focusable py-4 text-base sm:text-lg"
            >
              vs AI
            </button>
            <button
              type="button"
              onClick={() => {
                primeAudio();
                onMultiplayer(playerName.trim() || "Player 1");
              }}
              className="tv-focusable py-4 text-base sm:text-lg font-bold uppercase tracking-wider rounded-xl transition-all"
              style={{
                background: "linear-gradient(135deg, #1db954, #169c46)",
                color: "#fff",
                border: "none",
                cursor: "pointer",
              }}
            >
              Multiplayer
            </button>
          </div>

          {/* Player name (used for multiplayer) */}
          <div className="mb-5">
            <label
              className="text-[10px] uppercase tracking-widest mb-1.5 block"
              style={{ color: "var(--muted-foreground)" }}
            >
              Your name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
              className="w-full px-4 py-3 rounded-lg text-sm tv-focusable"
              style={{
                background: "rgba(24, 24, 24, 0.7)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                outline: "none",
                backdropFilter: "blur(6px)",
              }}
              placeholder="Player 1"
            />
          </div>

          {/* Local vs AI setup */}
          <div className="space-y-2 mb-5">
            <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "var(--muted-foreground)" }}>
              Local vs AI · choose opponents
            </div>
            {setup.map((p, i) => (
              <div
                key={p.color}
                className="flex items-center gap-3 rounded-xl p-2.5 sm:p-3 transition-all"
                style={{
                  background: "rgba(24, 24, 24, 0.7)",
                  border: `1px solid ${
                    p.active ? COLOR_HEX[p.color] + "55" : "var(--border)"
                  }`,
                  opacity: p.active ? 1 : 0.45,
                  backdropFilter: "blur(6px)",
                }}
              >
                <div
                  className="w-5 h-5 rounded-full flex-shrink-0"
                  style={{ background: COLOR_HEX[p.color] }}
                />
                <span className="flex-1 font-semibold text-xs sm:text-sm">
                  {COLOR_NAMES[p.color]}
                </span>
                <button
                  type="button"
                  onClick={() => toggleActive(i)}
                  className="text-[10px] px-2 py-0.5 rounded-md transition-colors tv-focusable"
                  style={{
                    background: p.active
                      ? COLOR_HEX[p.color] + "22"
                      : "var(--secondary)",
                    color: p.active ? COLOR_HEX[p.color] : "var(--muted-foreground)",
                    border: `1px solid ${p.active ? COLOR_HEX[p.color] + "44" : "var(--border)"}`,
                  }}
                  aria-pressed={p.active}
                >
                  {p.active ? "In" : "Out"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleAI(i)}
                  className={`toggle-switch tv-focusable ${p.isAI ? "active" : ""}`}
                  title={p.isAI ? "AI opponent" : "Human player"}
                  aria-label={
                    p.isAI
                      ? `Switch ${COLOR_NAMES[p.color]} to human`
                      : `Switch ${COLOR_NAMES[p.color]} to AI`
                  }
                />
                <span
                  className="text-[10px] w-10"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {p.isAI ? "AI" : "Human"}
                </span>
              </div>
            ))}
          </div>

          <div
            className="p-3 rounded-xl text-[11px]"
            style={{
              background: "rgba(24, 24, 24, 0.7)",
              border: "1px solid var(--border)",
              color: "var(--muted-foreground)",
              lineHeight: 1.7,
              backdropFilter: "blur(6px)",
            }}
          >
            <span style={{ color: "var(--accent)" }}>vs AI</span> — play locally
            against 1-3 computer opponents.{" "}
            <span style={{ color: "#1db954" }}>Multiplayer</span> — create or
            join a room with up to 4 friends online. On TV, use the D-pad and
            OK button.
          </div>
        </div>
      </main>
    </div>
  );
}
