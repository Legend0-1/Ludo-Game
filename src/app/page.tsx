"use client";

import { useCallback, useRef, useState } from "react";
import SetupScreen from "@/components/ludo/SetupScreen";
import GameScreen from "@/components/ludo/GameScreen";
import MultiplayerGameScreen from "@/components/ludo/MultiplayerGameScreen";
import LobbyScreen from "@/components/ludo/LobbyScreen";
import RulesModal from "@/components/ludo/RulesModal";
import WinOverlay from "@/components/ludo/WinOverlay";
import SpotifyPanel from "@/components/ludo/SpotifyPanel";
import { ToastContainer } from "@/components/ludo/Toast";
import {
  COLOR_NAMES,
  createPlayersFromSetup,
  type Color,
  type SetupEntry,
} from "@/lib/ludo";
import { playSound } from "@/lib/sounds";
import {
  useMultiplayer,
  type ChatMsg,
  type RoomPlayer,
  type RoomState,
} from "@/hooks/use-multiplayer";

type Screen = "setup" | "lobby" | "game" | "mp-game";

interface RemoteState {
  players: { color: Color; name: string; isAI: boolean; tokens: { pos: number }[] }[];
  currentPlayerIdx: number;
  diceValue: number;
  diceValue2: number;
  consecutiveSixes: number;
  phase: "idle" | "waiting_roll" | "rolling" | "waiting_token" | "animating" | "finished";
  validMoves: { tokenIdx: number; newPos: number; type: "enter" | "move" }[];
  focusedMoveIdx: number;
  winnerIdx: number | null;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [setup, setSetup] = useState<SetupEntry[] | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [winOpen, setWinOpen] = useState(false);
  const [winner, setWinner] = useState<{ color: Color; name: string } | null>(null);
  const [spotifyOpen, setSpotifyOpen] = useState(false);
  const [gameKey, setGameKey] = useState(0);
  const [playerName, setPlayerName] = useState("Player 1");

  /* ---------- Multiplayer state (owned by parent for whole session) ---------- */
  const [remoteState, setRemoteState] = useState<RemoteState | null>(null);
  const [remoteAction, setRemoteAction] = useState<
    { fromSlot: number; type: string; payload?: unknown; _id: number } | null
  >(null);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const actionCounter = useRef(0);

  const mp = useMultiplayer({
    onStateUpdate: (state) => {
      setRemoteState(state as RemoteState);
    },
    onAction: (action) => {
      actionCounter.current++;
      setRemoteAction({ ...action, _id: actionCounter.current });
    },
    onChat: (msg) => {
      setChat((c) => [...c.slice(-50), msg]);
    },
  });

  /* ---------- Single-player flow ---------- */
  const handleStart = useCallback((s: SetupEntry[]) => {
    setSetup(s);
    setWinOpen(false);
    setWinner(null);
    setGameKey((k) => k + 1);
    setScreen("game");
  }, []);

  const handleExit = useCallback(() => {
    setScreen("setup");
    setWinOpen(false);
    setWinner(null);
  }, []);

  const handleWin = useCallback(
    (playerIdx: number) => {
      if (!setup) return;
      const activeSetup = setup.filter((p) => p.active);
      const winningPlayer = activeSetup[playerIdx];
      if (!winningPlayer) return;
      setWinner({
        color: winningPlayer.color,
        name: COLOR_NAMES[winningPlayer.color],
      });
      setWinOpen(true);
      playSound("win");
    },
    [setup],
  );

  const handlePlayAgain = useCallback(() => {
    setWinOpen(false);
    setWinner(null);
    setScreen("setup");
  }, []);

  /* ---------- Multiplayer flow ---------- */
  const handleMultiplayer = useCallback(() => {
    setScreen("lobby");
  }, []);

  const handleLobbyExit = useCallback(() => {
    mp.disconnect();
    setRemoteState(null);
    setRemoteAction(null);
    setScreen("setup");
  }, [mp]);

  const handleGameStart = useCallback(() => {
    setScreen("mp-game");
  }, []);

  const handleMpExit = useCallback(() => {
    mp.disconnect();
    setRemoteState(null);
    setRemoteAction(null);
    setScreen("setup");
  }, [mp]);

  const handleMpWin = useCallback(
    (playerIdx: number) => {
      if (!mp.room) return;
      const roomPlayers = mp.room.players;
      const winning = roomPlayers[playerIdx];
      if (!winning) return;
      setWinner({
        color: ["red", "green", "yellow", "blue"][winning.slot] as Color,
        name: winning.name,
      });
      setWinOpen(true);
      playSound("win");
    },
    [mp.room],
  );

  /* ---------- Suppress unused warning for createPlayersFromSetup (kept for future use) ---------- */
  void createPlayersFromSetup;

  return (
    <>
      <ToastContainer />

      {screen === "setup" && (
        <SetupScreen
          onStart={handleStart}
          onMultiplayer={(name) => {
            setPlayerName(name);
            handleMultiplayer();
          }}
        />
      )}

      {screen === "game" && setup && (
        <GameScreen
          key={gameKey}
          setup={setup}
          onExit={handleExit}
          onWin={handleWin}
          onOpenRules={() => setRulesOpen(true)}
        />
      )}

      {screen === "lobby" && (
        <LobbyScreen
          mp={mp}
          chat={chat}
          playerName={playerName}
          onExit={handleLobbyExit}
          onGameStart={handleGameStart}
        />
      )}

      {screen === "mp-game" && mp.room && (
        <MultiplayerGameScreen
          roomCode={mp.room.code}
          roomPlayers={mp.room.players}
          mySlot={mp.mySlot}
          isHost={mp.isHost}
          broadcastState={mp.broadcastState}
          sendAction={mp.sendAction}
          remoteState={remoteState}
          remoteAction={remoteAction}
          onExit={handleMpExit}
          onOpenRules={() => setRulesOpen(true)}
          onWin={handleMpWin}
        />
      )}

      <RulesModal open={rulesOpen} onClose={() => setRulesOpen(false)} />

      <WinOverlay
        open={winOpen}
        winnerColor={winner?.color ?? "red"}
        winnerName={winner?.name ?? ""}
        onPlayAgain={handlePlayAgain}
      />

      <SpotifyPanel
        open={spotifyOpen}
        onToggle={() => setSpotifyOpen((v) => !v)}
      />
    </>
  );
}

/* ---------- Types re-exported for clarity ---------- */
export type { RoomPlayer, RoomState };
