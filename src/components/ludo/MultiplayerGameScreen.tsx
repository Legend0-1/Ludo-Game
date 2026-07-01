"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkCapture,
  checkWin,
  COLOR_HEX,
  createPlayersFromSetup,
  getValidMoves,
  getTokenPixelPos,
  lightenColor,
  type Color,
  type GamePhase,
  type Player,
  type ValidMove,
} from "@/lib/ludo";
import {
  BOARD_SIZE,
  drawBoardStatic,
  drawTokens,
  type TokenDrawInfo,
} from "@/lib/ludo-render";
import { playSound, primeAudio } from "@/lib/sounds";
import Dice3D from "./Dice";
import PlayerCard from "./PlayerCard";
import { pushToast } from "./Toast";
import type { RoomPlayer } from "@/hooks/use-multiplayer";

/** Authoritative game state — broadcast by host to all clients. */
interface GameState {
  players: Player[];
  currentPlayerIdx: number;
  diceValue: number; // die 1
  diceValue2: number; // die 2
  consecutiveSixes: number;
  phase: GamePhase;
  validMoves: ValidMove[];
  focusedMoveIdx: number;
  winnerIdx: number | null;
}

interface Props {
  roomCode: string;
  roomPlayers: RoomPlayer[];
  mySlot: number;
  isHost: boolean;
  /** Host→clients: full state broadcast. */
  broadcastState: (state: unknown) => void;
  /** Client→host: action (roll / move). */
  sendAction: (type: string, payload?: unknown) => void;
  /** Latest state received from host (clients only). null = no remote state yet. */
  remoteState: GameState | null;
  /** Latest action received from a client (host only). null = no new action. */
  remoteAction: { fromSlot: number; type: string; payload?: unknown; _id: number } | null;
  onExit: () => void;
  onOpenRules: () => void;
  onWin: (playerIdx: number) => void;
}

const COLORS_ORDER: Color[] = ["red", "green", "yellow", "blue"];

function makeInitialState(roomPlayers: RoomPlayer[]): Player[] {
  return createPlayersFromSetup(
    roomPlayers
      .filter((p) => p.connected || p.isAI)
      .map((p) => ({
        color: COLORS_ORDER[p.slot],
        name: p.isAI ? `AI ${COLORS_ORDER[p.slot]}` : p.name,
        active: true,
        isAI: p.isAI,
      })),
  );
}

export default function MultiplayerGameScreen({
  roomCode,
  roomPlayers,
  mySlot,
  isHost,
  broadcastState,
  sendAction,
  remoteState,
  remoteAction,
  onExit,
  onOpenRules,
  onWin,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardBufferRef = useRef<HTMLCanvasElement | null>(null);
  const diceSceneRef = useRef<HTMLDivElement>(null);

  /* ---------- Host-only mutable game state ---------- */
  const playersRef = useRef<Player[]>(makeInitialState(roomPlayers));
  const currentPlayerRef = useRef(0);
  const diceValueRef = useRef(0); // sum of both dice
  const dice1Ref = useRef(1); // individual die 1
  const dice2Ref = useRef(1); // individual die 2
  const consecutiveSixesRef = useRef(0);
  const phaseRef = useRef<GamePhase>("idle");
  const validMovesRef = useRef<ValidMove[]>([]);
  const focusedMoveIdxRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  /* ---------- Render state ---------- */
  const initialRender: GameState = {
    players: playersRef.current,
    currentPlayerIdx: 0,
    diceValue: 1,
    diceValue2: 1,
    consecutiveSixes: 0,
    phase: "idle",
    validMoves: [],
    focusedMoveIdx: 0,
    winnerIdx: null,
  };
  const [render, setRender] = useState<GameState>(initialRender);
  const [diceRolling, setDiceRolling] = useState(false);

  /* ---------- Latest-callback refs ---------- */
  const fnRefs = useRef({
    startTurn: () => {},
    nextTurn: () => {},
    aiTurn: () => {},
    handlePostRoll: (_pIdx: number, _value: number) => {},
    executeMove: (_pIdx: number, _move: ValidMove, _cb: () => void) => {},
  });

  /* ---------- Static board buffer ---------- */
  useEffect(() => {
    const buf = document.createElement("canvas");
    buf.width = BOARD_SIZE;
    buf.height = BOARD_SIZE;
    const bctx = buf.getContext("2d");
    if (bctx) drawBoardStatic(bctx);
    boardBufferRef.current = buf;
  }, []);

  /* ---------- Client: render remote state when it arrives ---------- */
  useEffect(() => {
    if (!isHost && remoteState) {
      setRender(remoteState);
      setDiceRolling(remoteState.phase === "rolling");
    }
  }, [isHost, remoteState]);

  /* ---------- Helper: my local player index in playersRef ---------- */
  const myLocalIdx = useCallback(() => {
    const myColor = COLORS_ORDER[mySlot];
    return playersRef.current.findIndex((p) => p.color === myColor);
  }, [mySlot]);

  /* ---------- Host: publish state to local render + broadcast ---------- */
  const publish = useCallback(
    (overrides: Partial<GameState> = {}) => {
      const state: GameState = {
        players: playersRef.current.map((p) => ({
          ...p,
          tokens: p.tokens.map((t) => ({ ...t })),
        })),
        currentPlayerIdx: currentPlayerRef.current,
        diceValue: dice1Ref.current,
        diceValue2: dice2Ref.current,
        consecutiveSixes: consecutiveSixesRef.current,
        phase: phaseRef.current,
        validMoves: validMovesRef.current,
        focusedMoveIdx: focusedMoveIdxRef.current,
        winnerIdx: null,
        ...overrides,
      };
      setRender(state);
      broadcastState(state);
    },
    [broadcastState],
  );

  const setPhase = (p: GamePhase) => {
    phaseRef.current = p;
  };

  /* ---------- Host: dice roll animation ---------- */
  const rollDiceAnim = useCallback(
    (callback: (value: number) => void) => {
      setPhase("rolling");
      setDiceRolling(true);
      let count = 0;
      const maxCount = 12;
      const interval = setInterval(() => {
        const v1 = Math.floor(Math.random() * 6) + 1;
        const v2 = Math.floor(Math.random() * 6) + 1;
        setRender((s) => ({ ...s, diceValue: v1, diceValue2: v2, phase: "rolling" }));
        count++;
        if (count >= maxCount) {
          clearInterval(interval);
          setDiceRolling(false);
          const finalV1 = Math.floor(Math.random() * 6) + 1;
          const finalV2 = Math.floor(Math.random() * 6) + 1;
          const sum = finalV1 + finalV2;
          dice1Ref.current = finalV1;
          dice2Ref.current = finalV2;
          diceValueRef.current = sum;
          playSound("dice");
          callback(sum);
        }
      }, 80);
    },
    [],
  );

  /* ---------- Host: execute a move (with animation) ---------- */
  const executeMove = useCallback(
    (pIdx: number, move: ValidMove, callback: () => void) => {
      isAnimatingRef.current = true;
      const p = playersRef.current[pIdx];
      const t = p.tokens[move.tokenIdx];
      const fromPos = t.pos;
      const toPos = move.newPos;

      if (move.type === "enter") {
        t.pos = 0;
        playSound("move");
        publish({ phase: "animating" });
        setTimeout(() => {
          checkCapture(pIdx, move.tokenIdx, playersRef.current, true, () => {
            playSound("capture");
            pushToast(`${playersRef.current[pIdx].name} captured an opponent's token!`);
          });
          isAnimatingRef.current = false;
          callback();
        }, 200);
      } else {
        let step = 0;
        const totalSteps = toPos - fromPos;
        const doStep = () => {
          step++;
          t.pos = fromPos + step;
          if (step < totalSteps) {
            playSound("move");
            publish({ phase: "animating" });
            setTimeout(doStep, 120);
          } else {
            if (t.pos === 58) {
              playSound("home");
              pushToast(`${p.name} got a token home!`);
            } else {
              playSound("move");
            }
            checkCapture(pIdx, move.tokenIdx, playersRef.current, true, () => {
              playSound("capture");
              pushToast(`${p.name} captured an opponent's token!`);
            });
            isAnimatingRef.current = false;
            callback();
          }
        };
        if (totalSteps > 0) doStep();
        else {
          isAnimatingRef.current = false;
          callback();
        }
      }
    },
    [publish],
  );

  /* ---------- Host: handle a rolled dice value ---------- */
  const handlePostRoll = useCallback(
    (pIdx: number, value: number) => {
      const p = playersRef.current[pIdx];
      const d1 = dice1Ref.current;
      const d2 = dice2Ref.current;
      const hasSix = d1 === 6 || d2 === 6;
      const isDoubles = d1 === d2;

      // Doubles = extra turn. Three consecutive doubles forfeit.
      if (isDoubles) {
        consecutiveSixesRef.current++;
        if (consecutiveSixesRef.current >= 3) {
          publish({ phase: "idle" });
          pushToast(`${p.name} rolled three doubles — turn forfeited!`);
          setTimeout(() => fnRefs.current.nextTurn(), 1200);
          return;
        }
      } else {
        consecutiveSixesRef.current = 0;
      }

      const moves = getValidMoves(pIdx, value, playersRef.current, hasSix);
      validMovesRef.current = moves;
      focusedMoveIdxRef.current = 0;

      if (moves.length === 0) {
        publish({ phase: "idle", validMoves: [] });
        setTimeout(() => fnRefs.current.nextTurn(), 1000);
        return;
      }

      if (p.isAI) {
        const move = aiChooseMove(pIdx, value, moves, playersRef.current, hasSix);
        fnRefs.current.executeMove(pIdx, move, () => {
          if (checkWin(pIdx, playersRef.current)) {
            setPhase("finished");
            publish({ phase: "finished", winnerIdx: pIdx });
            onWin(pIdx);
            return;
          }
          if (isDoubles && consecutiveSixesRef.current < 3) {
            setTimeout(() => fnRefs.current.aiTurn(), 600);
          } else {
            setTimeout(() => fnRefs.current.nextTurn(), 400);
          }
        });
      } else {
        setPhase("waiting_token");
        publish({ phase: "waiting_token", validMoves: moves });
      }
    },
    [publish, onWin],
  );

  /* ---------- Host: AI turn ---------- */
  const aiTurn = useCallback(() => {
    if (phaseRef.current === "finished") return;
    const pIdx = currentPlayerRef.current;
    rollDiceAnim((value) => fnRefs.current.handlePostRoll(pIdx, value));
  }, [rollDiceAnim]);

  /* ---------- Host: start a turn ---------- */
  const startTurn = useCallback(() => {
    if (phaseRef.current === "finished") return;
    const p = playersRef.current[currentPlayerRef.current];
    if (p.isAI) {
      setPhase("idle");
      publish({ phase: "idle" });
      setTimeout(() => fnRefs.current.aiTurn(), 700);
    } else {
      setPhase("waiting_roll");
      publish({ phase: "waiting_roll" });
    }
  }, [publish]);

  /* ---------- Host: advance to next turn ---------- */
  const nextTurn = useCallback(() => {
    consecutiveSixesRef.current = 0;
    currentPlayerRef.current =
      (currentPlayerRef.current + 1) % playersRef.current.length;
    fnRefs.current.startTurn();
  }, []);

  useEffect(() => {
    fnRefs.current.startTurn = startTurn;
    fnRefs.current.nextTurn = nextTurn;
    fnRefs.current.aiTurn = aiTurn;
    fnRefs.current.handlePostRoll = handlePostRoll;
    fnRefs.current.executeMove = executeMove;
  }, [startTurn, nextTurn, aiTurn, handlePostRoll, executeMove]);

  /* ---------- Host: kick off first turn ---------- */
  useEffect(() => {
    if (isHost) {
      fnRefs.current.startTurn();
    }
  }, []);

  /* ---------- Host: handle remote action from a client ---------- */
  useEffect(() => {
    if (!isHost || !remoteAction) return;
    const fromLocalIdx = (() => {
      const fromColor = COLORS_ORDER[remoteAction.fromSlot];
      return playersRef.current.findIndex((p) => p.color === fromColor);
    })();
    if (fromLocalIdx === -1) return;
    // Only honor action if it's that player's turn
    if (fromLocalIdx !== currentPlayerRef.current) return;

    if (remoteAction.type === "roll" && phaseRef.current === "waiting_roll") {
      rollDiceAnim((value) => fnRefs.current.handlePostRoll(fromLocalIdx, value));
    } else if (remoteAction.type === "move" && phaseRef.current === "waiting_token") {
      const payload = remoteAction.payload as { tokenIdx: number } | undefined;
      if (!payload) return;
      const move = validMovesRef.current.find((m) => m.tokenIdx === payload.tokenIdx);
      if (!move) return;
      setPhase("animating");
      const isDoubles = dice1Ref.current === dice2Ref.current;
      fnRefs.current.executeMove(fromLocalIdx, move, () => {
        if (checkWin(fromLocalIdx, playersRef.current)) {
          setPhase("finished");
          publish({ phase: "finished", winnerIdx: fromLocalIdx });
          onWin(fromLocalIdx);
          return;
        }
        if (isDoubles && consecutiveSixesRef.current < 3) {
          setPhase("waiting_roll");
          publish({ phase: "waiting_roll" });
        } else {
          fnRefs.current.nextTurn();
        }
      });
    }
  }, [isHost, remoteAction, rollDiceAnim, publish, onWin]);

  /* ---------- User input: roll the dice ---------- */
  const humanRoll = useCallback(() => {
    if (render.phase !== "waiting_roll") return;
    if (myLocalIdx() !== render.currentPlayerIdx) return;
    primeAudio();
    if (isHost) {
      rollDiceAnim((value) =>
        fnRefs.current.handlePostRoll(currentPlayerRef.current, value),
      );
    } else {
      sendAction("roll");
    }
  }, [render, isHost, myLocalIdx, rollDiceAnim, sendAction]);

  /* ---------- User input: confirm token move ---------- */
  const confirmTokenMove = useCallback(
    (move: ValidMove) => {
      if (render.phase !== "waiting_token") return;
      if (myLocalIdx() !== render.currentPlayerIdx) return;
      if (isHost) {
        setPhase("animating");
        const isDoubles = dice1Ref.current === dice2Ref.current;
        fnRefs.current.executeMove(currentPlayerRef.current, move, () => {
          if (checkWin(currentPlayerRef.current, playersRef.current)) {
            setPhase("finished");
            publish({ phase: "finished", winnerIdx: currentPlayerRef.current });
            onWin(currentPlayerRef.current);
            return;
          }
          if (isDoubles && consecutiveSixesRef.current < 3) {
            setPhase("waiting_roll");
            publish({ phase: "waiting_roll" });
          } else {
            fnRefs.current.nextTurn();
          }
        });
      } else {
        sendAction("move", { tokenIdx: move.tokenIdx });
      }
    },
    [render, isHost, myLocalIdx, publish, onWin, sendAction],
  );

  /* ---------- Canvas click handler ---------- */
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (render.phase !== "waiting_token") return;
      if (myLocalIdx() !== render.currentPlayerIdx) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const scaleX = BOARD_SIZE / rect.width;
      const scaleY = BOARD_SIZE / rect.height;
      const mx = (clientX - rect.left) * scaleX;
      const my = (clientY - rect.top) * scaleY;
      const color = render.players[render.currentPlayerIdx].color;
      let clickedMove: ValidMove | null = null;
      let minDist = Infinity;
      render.validMoves.forEach((move) => {
        const pos = getTokenPixelPos(
          color,
          move.tokenIdx,
          render.players[render.currentPlayerIdx].tokens[move.tokenIdx].pos,
        );
        const dx = mx - pos.x;
        const dy = my - pos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 40 && dist < minDist) {
          minDist = dist;
          clickedMove = move;
        }
      });
      if (clickedMove) confirmTokenMove(clickedMove);
    },
    [render, myLocalIdx, confirmTokenMove],
  );

  /* ---------- D-pad / keyboard ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (render.phase === "waiting_token") {
        if (myLocalIdx() !== render.currentPlayerIdx) return;
        const moves = render.validMoves;
        if (moves.length === 0) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          focusedMoveIdxRef.current = (focusedMoveIdxRef.current + 1) % moves.length;
          setRender((s) => ({ ...s, focusedMoveIdx: focusedMoveIdxRef.current }));
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          focusedMoveIdxRef.current =
            (focusedMoveIdxRef.current - 1 + moves.length) % moves.length;
          setRender((s) => ({ ...s, focusedMoveIdx: focusedMoveIdxRef.current }));
        } else if (e.key === "Enter" || e.key === " " || e.key === "OK") {
          e.preventDefault();
          confirmTokenMove(moves[focusedMoveIdxRef.current]);
        }
      } else if (render.phase === "waiting_roll") {
        if (myLocalIdx() !== render.currentPlayerIdx) return;
        if (e.key === "Enter" || e.key === " " || e.key === "OK") {
          e.preventDefault();
          humanRoll();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [render, myLocalIdx, confirmTokenMove, humanRoll]);

  /* ---------- Per-frame render ---------- */
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const buffer = boardBufferRef.current;
    if (!canvas || !buffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(buffer, 0, 0);

    const tokens: TokenDrawInfo[] = [];
    render.players.forEach((p, pi) => {
      p.tokens.forEach((t, ti) => {
        tokens.push({
          pi,
          ti,
          color: p.color,
          pos: t.pos,
          finished: t.pos === 58,
          x: 0,
          y: 0,
        });
      });
    });

    const highlighted =
      render.phase === "waiting_token"
        ? render.validMoves.map((m) => ({
            pi: render.currentPlayerIdx,
            ti: m.tokenIdx,
          }))
        : [];

    const focusedToken =
      render.phase === "waiting_token" && render.validMoves.length > 0
        ? {
            pi: render.currentPlayerIdx,
            ti: render.validMoves[render.focusedMoveIdx].tokenIdx,
          }
        : null;

    drawTokens(ctx, tokens, highlighted, focusedToken, lightenColor, Date.now());
  }, [render]);

  useEffect(() => {
    const loop = () => {
      renderFrame();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [renderFrame]);

  /* ---------- Render ---------- */
  const currentPlayer = render.players[render.currentPlayerIdx];
  if (!currentPlayer) {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="text-center">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            Waiting for game state…
          </p>
          <button onClick={onExit} className="roll-btn tv-focusable mt-4 px-6 py-2">
            Leave
          </button>
        </div>
      </div>
    );
  }

  const isMyTurn = myLocalIdx() === render.currentPlayerIdx;
  const diceInteractive = isMyTurn && render.phase === "waiting_roll" && !diceRolling;

  return (
    <div className="app-shell relative w-full">
      <div className="bg-noise" />
      <div
        className="glow-blob"
        style={{
          width: 500,
          height: 500,
          background: COLOR_HEX[currentPlayer.color],
          bottom: -100,
          right: -100,
          opacity: 0.08,
        }}
      />

      <main className="relative z-10 flex-1 flex flex-col items-center p-3 sm:p-4 gap-3">
        <div
          className="status-banner"
          style={{ border: `1px solid ${COLOR_HEX[currentPlayer.color]}55` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                background: COLOR_HEX[currentPlayer.color],
                boxShadow: `0 0 10px ${COLOR_HEX[currentPlayer.color]}`,
              }}
            />
            <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
              Turn
            </span>
            <span
              className="font-display text-base sm:text-lg font-bold truncate"
              style={{ color: COLOR_HEX[currentPlayer.color] }}
            >
              {currentPlayer.name}
              {isMyTurn && (
                <span
                  className="ml-2 text-[9px] px-1.5 py-0.5 rounded align-middle"
                  style={{ background: "var(--accent)", color: "#0e0e0e" }}
                >
                  YOU
                </span>
              )}
            </span>
          </div>
          <div className="text-xs sm:text-sm font-medium truncate" style={{ color: "var(--muted-foreground)" }}>
            Room {roomCode} ·{" "}
            {render.phase === "waiting_roll"
              ? isMyTurn
                ? "Tap the dice to roll"
                : "Waiting for roll"
              : render.phase === "waiting_token"
                ? isMyTurn
                  ? "Select a token to move"
                  : "Waiting for move"
                : render.phase === "rolling"
                  ? "Rolling…"
                  : render.phase === "animating"
                    ? "Moving…"
                    : ""}
          </div>
        </div>

        <div className="board-stage">
          <div className="board-tilt">
            <canvas
              ref={canvasRef}
              id="ludo-board"
              width={BOARD_SIZE}
              height={BOARD_SIZE}
              onClick={handleCanvasClick}
              onTouchEnd={handleCanvasClick}
              className={render.phase === "waiting_token" && isMyTurn ? "clickable" : ""}
            />
          </div>
          <div className="board-dice">
            <Dice3D
              ref={diceSceneRef}
              value={render.diceValue}
              value2={render.diceValue2}
              rolling={diceRolling}
              interactive={diceInteractive}
              onClick={humanRoll}
              twoDice
            />
          </div>
        </div>

        <div className="w-full max-w-[1100px] flex flex-col gap-3 mt-1">
          <div className="player-bar">
            {render.players.map((p, i) => (
              <PlayerCard
                key={p.color}
                player={p}
                isActive={i === render.currentPlayerIdx}
                index={i}
              />
            ))}
          </div>
          <div className="flex gap-2 max-w-[1100px] mx-auto w-full">
            <button
              onClick={onExit}
              className="flex-1 text-xs py-2.5 rounded-lg font-semibold tv-focusable"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--muted-foreground)",
                cursor: "pointer",
              }}
            >
              ↻ Leave Room
            </button>
            <button
              onClick={onOpenRules}
              className="flex-1 text-xs py-2.5 rounded-lg font-semibold tv-focusable"
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                color: "var(--muted-foreground)",
                cursor: "pointer",
              }}
            >
              ? Rules
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* ---------- AI move picker (local copy) ---------- */
function aiChooseMove(
  pIdx: number,
  dice: number,
  moves: ValidMove[],
  players: Player[],
  hasSix: boolean = dice === 6,
): ValidMove {
  const p = players[pIdx];
  const startIdx = p.color === "red" ? 0 : p.color === "green" ? 13 : p.color === "yellow" ? 26 : 39;
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

  for (const move of moves) {
    if (move.type === "move" && move.newPos <= 51) {
      const absPos = (startIdx + move.newPos) % 52;
      if (SAFE.has(absPos)) continue;
      let canCapture = false;
      players.forEach((op, oi) => {
        if (oi === pIdx) return;
        op.tokens.forEach((ot) => {
          if (ot.pos >= 0 && ot.pos <= 51) {
            const otherAbs = (startIdx + ot.pos) % 52;
            if (otherAbs === absPos) canCapture = true;
          }
        });
      });
      if (canCapture) return move;
    }
  }
  for (const move of moves) if (move.newPos === 58) return move;
  for (const move of moves) if (move.newPos >= 52 && move.newPos < 58) return move;
  if (hasSix) {
    const enterMove = moves.find((m) => m.type === "enter");
    if (enterMove && p.tokens.filter((t) => t.pos === -1).length > 2) return enterMove;
  }
  let bestMove = moves[0];
  let bestPos = -999;
  moves.forEach((m) => {
    if (m.newPos > bestPos) {
      bestPos = m.newPos;
      bestMove = m;
    }
  });
  if (moves.length > 1 && Math.random() < 0.2) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  return bestMove;
}
