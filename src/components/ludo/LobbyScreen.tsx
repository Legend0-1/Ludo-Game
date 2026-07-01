"use client";

import { useEffect, useRef, useState } from "react";
import {
  COLOR_HEX,
  COLOR_NAMES,
  COLORS,
} from "@/lib/ludo";
import {
  useMultiplayer,
  type ChatMsg,
  type RoomPlayer,
} from "@/hooks/use-multiplayer";

type MP = ReturnType<typeof useMultiplayer>;

interface LobbyScreenProps {
  mp: MP;
  chat: ChatMsg[];
  playerName: string;
  onExit: () => void;
  onGameStart: () => void;
}

export default function LobbyScreen({
  mp,
  chat,
  playerName,
  onExit,
  onGameStart,
}: LobbyScreenProps) {
  const [mode, setMode] = useState<"menu" | "create" | "join" | "waiting">("menu");
  const [joinCode, setJoinCode] = useState("");
  const [chatInput, setChatInput] = useState("");
  const startedRef = useRef(false);

  // Auto-connect on mount
  useEffect(() => {
    mp.connect();
  }, [mp]);

  // Listen for first state update = game started
  useEffect(() => {
    if (mp.room?.started && !startedRef.current) {
      startedRef.current = true;
      onGameStart();
    }
  }, [mp.room?.started, onGameStart]);

  const handleCreate = () => {
    setMode("waiting");
    mp.createRoom(playerName);
  };

  const handleJoin = () => {
    if (joinCode.length !== 4) return;
    setMode("waiting");
    mp.joinRoom(joinCode, playerName);
  };

  const handleStart = () => {
    if (mp.isHost && mp.room && mp.room.players.length >= 2) {
      mp.startGame();
    }
  };

  const handleSendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    mp.sendChat(text);
    setChatInput("");
  };

  /* ---------- MENU screen ---------- */
  if (mode === "menu") {
    return (
      <LobbyShell onExit={onExit} title="MULTIPLAYER" subtitle="Play with up to 4 friends online">
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <button
            onClick={handleCreate}
            className="roll-btn tv-focusable py-4 text-base"
          >
            Create Room
          </button>
          <div className="text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
            — or —
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={4}
              placeholder="CODE"
              value={joinCode}
              onChange={(e) =>
                setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
              }
              className="flex-1 px-4 py-3 rounded-lg text-center text-lg font-display font-bold tracking-widest tv-focusable"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
            <button
              onClick={handleJoin}
              disabled={joinCode.length !== 4}
              className="roll-btn tv-focusable px-6"
              style={{ opacity: joinCode.length === 4 ? 1 : 0.4 }}
            >
              Join
            </button>
          </div>

          {mp.status === "connecting" && (
            <div className="text-center text-xs" style={{ color: "var(--muted-foreground)" }}>
              Connecting to server…
            </div>
          )}
          {mp.error && (
            <div
              className="text-center text-xs p-2 rounded"
              style={{ color: "#e63946", background: "rgba(230,57,70,0.1)" }}
            >
              {mp.error}
            </div>
          )}
        </div>
      </LobbyShell>
    );
  }

  /* ---------- WAITING room ---------- */
  return (
    <LobbyShell
      onExit={onExit}
      title="ROOM"
      subtitle={mp.room ? `Code: ${mp.room.code}` : "Connecting…"}
    >
      <div className="w-full max-w-md flex flex-col gap-4">
        {mp.room && (
          <div
            className="text-center p-4 rounded-xl"
            style={{
              background: "var(--card)",
              border: "1px solid var(--accent)",
            }}
          >
            <div
              className="text-[10px] uppercase tracking-widest mb-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Share this code
            </div>
            <div
              className="font-display text-4xl font-black tracking-[0.3em]"
              style={{ color: "var(--accent)" }}
            >
              {mp.room.code}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {COLORS.map((color, slot) => {
            const player = mp.room?.players.find((p) => p.slot === slot);
            return (
              <PlayerSlot
                key={color}
                color={color}
                player={player}
                isMe={slot === mp.mySlot}
                isHost={mp.isHost}
                onToggleAI={() => mp.toggleAI(slot, !player?.isAI)}
              />
            );
          })}
        </div>

        <div
          className="rounded-xl p-3 flex flex-col gap-2"
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            height: 160,
          }}
        >
          <div
            className="text-[10px] uppercase tracking-widest"
            style={{ color: "var(--muted-foreground)" }}
          >
            Lobby chat
          </div>
          <div className="flex-1 overflow-y-auto sp-scroll text-xs space-y-1">
            {chat.length === 0 && (
              <div style={{ color: "var(--muted-foreground)" }}>
                Say hi to your opponents…
              </div>
            )}
            {chat.map((m, i) => (
              <div key={i}>
                <span
                  className="font-semibold"
                  style={{ color: COLOR_HEX[COLORS[m.slot]] }}
                >
                  {m.name}:
                </span>{" "}
                <span style={{ color: "var(--foreground)" }}>{m.text}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSendChat();
              }}
              maxLength={200}
              placeholder="Message…"
              className="flex-1 px-3 py-2 rounded-lg text-xs tv-focusable"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: "var(--foreground)",
                outline: "none",
              }}
            />
            <button
              onClick={handleSendChat}
              className="text-xs px-3 py-2 rounded-lg font-semibold tv-focusable"
              style={{
                background: "var(--accent)",
                color: "#0e0e0e",
                border: "none",
              }}
            >
              Send
            </button>
          </div>
        </div>

        {mp.isHost && (
          <button
            onClick={handleStart}
            disabled={!mp.room || mp.room.players.length < 2}
            className="roll-btn tv-focusable py-4 text-base"
            style={{ opacity: mp.room && mp.room.players.length >= 2 ? 1 : 0.4 }}
          >
            {mp.room && mp.room.players.length < 2
              ? "Need at least 2 players"
              : "Start Game"}
          </button>
        )}
        {!mp.isHost && mp.room && (
          <div
            className="text-center text-xs p-3 rounded-lg"
            style={{
              color: "var(--muted-foreground)",
              background: "var(--card)",
            }}
          >
            Waiting for host to start the game…
          </div>
        )}

        {mp.error && (
          <div
            className="text-center text-xs p-2 rounded"
            style={{ color: "#e63946", background: "rgba(230,57,70,0.1)" }}
          >
            {mp.error}
          </div>
        )}
      </div>
    </LobbyShell>
  );
}

function LobbyShell({
  title,
  subtitle,
  onExit,
  children,
}: {
  title: string;
  subtitle: string;
  onExit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell relative w-full">
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: "url(/african-bg.jpg)",
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.18,
        }}
      />
      <div
        className="absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(14,14,14,0.7) 0%, rgba(14,14,14,0.95) 100%)",
        }}
      />

      <header className="relative z-10 p-4 flex items-center justify-between">
        <button
          onClick={onExit}
          className="text-xs px-3 py-2 rounded-lg font-semibold tv-focusable"
          style={{
            background: "rgba(24,24,24,0.7)",
            border: "1px solid var(--border)",
            color: "var(--muted-foreground)",
            backdropFilter: "blur(6px)",
          }}
        >
          ← Back
        </button>
        <div className="text-right">
          <div
            className="font-display text-lg font-bold"
            style={{ color: "var(--accent)" }}
          >
            {title}
          </div>
          <div className="text-[10px]" style={{ color: "var(--muted-foreground)" }}>
            {subtitle}
          </div>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-4">
        {children}
      </main>
    </div>
  );
}

function PlayerSlot({
  color,
  player,
  isMe,
  isHost,
  onToggleAI,
}: {
  color: (typeof COLORS)[number];
  player?: RoomPlayer;
  isMe: boolean;
  isHost: boolean;
  onToggleAI: () => void;
}) {
  const empty = !player;
  return (
    <div
      className="rounded-xl p-3 transition-all"
      style={{
        background: empty ? "var(--card)" : COLOR_HEX[color] + "22",
        border: `1px solid ${empty ? "var(--border)" : COLOR_HEX[color] + "88"}`,
        opacity: empty ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <div
          className="w-4 h-4 rounded-full flex-shrink-0"
          style={{ background: COLOR_HEX[color] }}
        />
        <span className="font-semibold text-xs flex-1 truncate">
          {empty ? "Empty" : player!.name}
        </span>
        {player?.isHost && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "var(--accent)", color: "#0e0e0e" }}
          >
            HOST
          </span>
        )}
        {isMe && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded"
            style={{
              background: "var(--secondary)",
              color: "var(--muted-foreground)",
            }}
          >
            YOU
          </span>
        )}
      </div>
      <button
        onClick={empty && isHost ? onToggleAI : undefined}
        disabled={!empty || !isHost}
        className="text-[10px] text-left w-full disabled:cursor-default tv-focusable"
        style={{ color: "var(--muted-foreground)" }}
      >
        {empty
          ? isHost
            ? "→ Add AI"
            : "Waiting…"
          : player!.isAI
            ? "AI opponent"
            : COLOR_NAMES[color]}
      </button>
    </div>
  );
}
