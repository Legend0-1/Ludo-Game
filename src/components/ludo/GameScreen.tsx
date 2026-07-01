"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  aiChooseMove,
  checkCapture,
  checkWin,
  COLOR_HEX,
  createPlayersFromSetup,
  getValidMoves,
  getTokenPixelPos,
  lightenColor,
  type GamePhase,
  type Player,
  type SetupEntry,
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

interface GameScreenProps {
  setup: SetupEntry[];
  onExit: () => void;
  onWin: (playerIdx: number) => void;
  onOpenRules: () => void;
}

export default function GameScreen({
  setup,
  onExit,
  onWin,
  onOpenRules,
}: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardBufferRef = useRef<HTMLCanvasElement | null>(null);
  const rollBtnRef = useRef<HTMLButtonElement>(null);
  const diceSceneRef = useRef<HTMLDivElement>(null);

  // Mutable game state (kept in refs so async timers always see the latest)
  const playersRef = useRef<Player[]>(createPlayersFromSetup(setup));
  const currentPlayerRef = useRef(0);
  const diceValueRef = useRef(0); // sum of both dice
  const dice1Ref = useRef(1); // individual die 1 value
  const dice2Ref = useRef(1); // individual die 2 value
  const consecutiveSixesRef = useRef(0);
  const phaseRef = useRef<GamePhase>("idle");
  const validMovesRef = useRef<ValidMove[]>([]);
  const isAnimatingRef = useRef(false);
  const focusedMoveIdxRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // React state — just for things the UI needs to re-render
  const [diceValue, setDiceValue] = useState(1); // die 1
  const [diceValue2, setDiceValue2] = useState(1); // die 2
  const [diceRolling, setDiceRolling] = useState(false);
  const [diceMsg, setDiceMsg] = useState("");
  const [rollBtnDisabled, setRollBtnDisabled] = useState(true);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);
  const [, setMoveTick] = useState(0); // bump after each move to refresh player cards

  /* ---------- Refs that always point to the latest callbacks ---------- */
  // We use this pattern to avoid stale closures inside setTimeout / setInterval.
  const fnRefs = useRef({
    startTurn: () => {},
    nextTurn: () => {},
    aiTurn: () => {},
    handlePostRoll: (_pIdx: number, _value: number) => {},
    executeMove: (_pIdx: number, _move: ValidMove, _cb: () => void) => {},
  });

  /* ---------- Static board buffer (drawn once) ---------- */
  useEffect(() => {
    const buf = document.createElement("canvas");
    buf.width = BOARD_SIZE;
    buf.height = BOARD_SIZE;
    const bctx = buf.getContext("2d");
    if (bctx) drawBoardStatic(bctx);
    boardBufferRef.current = buf;
  }, []);

  /* ---------- Per-frame render loop ---------- */
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const buffer = boardBufferRef.current;
    if (!canvas || !buffer) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(buffer, 0, 0);

    const players = playersRef.current;
    const tokens: TokenDrawInfo[] = [];
    players.forEach((p, pi) => {
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
      phaseRef.current === "waiting_token"
        ? validMovesRef.current.map((m) => ({
            pi: currentPlayerRef.current,
            ti: m.tokenIdx,
          }))
        : [];

    const focusedToken =
      phaseRef.current === "waiting_token" && validMovesRef.current.length > 0
        ? {
            pi: currentPlayerRef.current,
            ti: validMovesRef.current[focusedMoveIdxRef.current].tokenIdx,
          }
        : null;

    drawTokens(ctx, tokens, highlighted, focusedToken, lightenColor, Date.now());
  }, []);

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

  /* ---------- Core game flow ---------- */
  const [phase, setPhaseState] = useState<GamePhase>("idle");
  const setPhase = (p: GamePhase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };

  const rollDiceAnim = useCallback((callback: (value: number) => void) => {
    setPhase("rolling");
    setDiceRolling(true);
    setRollBtnDisabled(true);
    let count = 0;
    const maxCount = 12;
    const interval = setInterval(() => {
      const v1 = Math.floor(Math.random() * 6) + 1;
      const v2 = Math.floor(Math.random() * 6) + 1;
      setDiceValue(v1);
      setDiceValue2(v2);
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
        setDiceValue(finalV1);
        setDiceValue2(finalV2);
        playSound("dice");
        callback(sum);
      }
    }, 80);
  }, []);

  const executeMove = useCallback(
    (pIdx: number, move: ValidMove, callback: () => void) => {
      isAnimatingRef.current = true;
      const p = playersRef.current[pIdx];
      const t = p.tokens[move.tokenIdx];
      const fromPos = t.pos;
      const toPos = move.newPos;

      if (move.type === "enter") {
        t.pos = 0;
        setMoveTick((n) => n + 1);
        playSound("move");
        setTimeout(() => {
          checkCapture(
            pIdx,
            move.tokenIdx,
            playersRef.current,
            true,
            () => {
              playSound("capture");
              pushToast(
                `${playersRef.current[pIdx].name} captured an opponent's token!`,
              );
            },
          );
          setMoveTick((n) => n + 1);
          isAnimatingRef.current = false;
          callback();
        }, 200);
      } else {
        let step = 0;
        const totalSteps = toPos - fromPos;
        const doStep = () => {
          step++;
          t.pos = fromPos + step;
          setMoveTick((n) => n + 1);
          if (step < totalSteps) {
            playSound("move");
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
            setMoveTick((n) => n + 1);
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
    [],
  );

  const handlePostRoll = useCallback(
    (pIdx: number, value: number) => {
      const p = playersRef.current[pIdx];
      const d1 = dice1Ref.current;
      const d2 = dice2Ref.current;
      const hasSix = d1 === 6 || d2 === 6;
      const isDoubles = d1 === d2;

      // Doubles = extra turn (replaces the "rolled a 6" extra-turn rule).
      // Three consecutive doubles forfeit the turn.
      if (isDoubles) {
        consecutiveSixesRef.current++;
        if (consecutiveSixesRef.current >= 3) {
          setDiceMsg("Three doubles! Turn lost.");
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
        setDiceMsg("No valid moves");
        setTimeout(() => fnRefs.current.nextTurn(), 1000);
        return;
      }

      if (p.isAI) {
        const move = aiChooseMove(pIdx, value, moves, playersRef.current, hasSix);
        fnRefs.current.executeMove(pIdx, move, () => {
          if (checkWin(pIdx, playersRef.current)) {
            setPhase("finished");
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
        if (moves.length === 1) {
          setPhase("animating");
          setDiceMsg("Moving...");
          fnRefs.current.executeMove(pIdx, moves[0], () => {
            if (checkWin(pIdx, playersRef.current)) {
              setPhase("finished");
              onWin(pIdx);
              return;
            }
            if (isDoubles && consecutiveSixesRef.current < 3) {
              setPhase("waiting_roll");
              setRollBtnDisabled(false);
              setDiceMsg("Doubles! Roll again!");
              focusDice();
            } else {
              fnRefs.current.nextTurn();
            }
          });
        } else {
          setPhase("waiting_token");
          setDiceMsg("Select a token to move");
        }
      }
    },
    [onWin],
  );

  const aiTurn = useCallback(() => {
    if (phaseRef.current === "finished") return;
    const pIdx = currentPlayerRef.current;
    rollDiceAnim((value) => fnRefs.current.handlePostRoll(pIdx, value));
  }, [rollDiceAnim]);

  const startTurn = useCallback(() => {
    if (phaseRef.current === "finished") return;
    const p = playersRef.current[currentPlayerRef.current];
    setCurrentPlayerIdx(currentPlayerRef.current);
    setDiceMsg("");
    setDiceValue(diceValueRef.current || 1);

    if (p.isAI) {
      setPhase("idle");
      setRollBtnDisabled(true);
      setTimeout(() => fnRefs.current.aiTurn(), 700);
    } else {
      setPhase("waiting_roll");
      setRollBtnDisabled(false);
      setDiceMsg("Your turn — roll the dice");
      focusDice();
    }
  }, []);

  const nextTurn = useCallback(() => {
    consecutiveSixesRef.current = 0;
    currentPlayerRef.current =
      (currentPlayerRef.current + 1) % playersRef.current.length;
    fnRefs.current.startTurn();
  }, []);

  /* Keep refs in sync with the latest callback identities */
  useEffect(() => {
    fnRefs.current.startTurn = startTurn;
    fnRefs.current.nextTurn = nextTurn;
    fnRefs.current.aiTurn = aiTurn;
    fnRefs.current.handlePostRoll = handlePostRoll;
    fnRefs.current.executeMove = executeMove;
  }, [startTurn, nextTurn, aiTurn, handlePostRoll, executeMove]);

  /* ---------- User input handlers ---------- */
  const focusDice = useCallback(() => {
    // Try the visible dice first (mouse/touch users); fall back to hidden button (TV).
    setTimeout(() => {
      diceSceneRef.current?.focus();
    }, 50);
  }, []);

  const humanRoll = useCallback(() => {
    if (phaseRef.current !== "waiting_roll") return;
    primeAudio();
    rollDiceAnim((value) =>
      fnRefs.current.handlePostRoll(currentPlayerRef.current, value),
    );
  }, [rollDiceAnim]);

  const confirmTokenMove = useCallback(
    (move: ValidMove) => {
      const value = diceValueRef.current;
      const d1 = dice1Ref.current;
      const d2 = dice2Ref.current;
      const isDoubles = d1 === d2;
      setPhase("animating");
      setDiceMsg("Moving...");
      const pIdx = currentPlayerRef.current;
      fnRefs.current.executeMove(pIdx, move, () => {
        if (checkWin(pIdx, playersRef.current)) {
          setPhase("finished");
          onWin(pIdx);
          return;
        }
        if (isDoubles && consecutiveSixesRef.current < 3) {
          setPhase("waiting_roll");
          setRollBtnDisabled(false);
          setDiceMsg("Doubles! Roll again!");
          focusDice();
        } else {
          fnRefs.current.nextTurn();
        }
      });
    },
    [onWin],
  );

  const handleCanvasClick = useCallback(
    (
      e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>,
    ) => {
      if (phaseRef.current !== "waiting_token") return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      let clientX: number;
      let clientY: number;
      if ("touches" in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      // Map screen → canvas internal coords (600×600).
      // Note: the board is CSS-tilted in 3D (rotateX), so this is an
      // approximation — we use the post-transform bounding rect, which
      // works well for the center of the board (where most tokens sit)
      // and we use a generous 40px tolerance to absorb perspective error.
      const scaleX = BOARD_SIZE / rect.width;
      const scaleY = BOARD_SIZE / rect.height;
      const mx = (clientX - rect.left) * scaleX;
      const my = (clientY - rect.top) * scaleY;

      const pIdx = currentPlayerRef.current;
      const color = playersRef.current[pIdx].color;
      let clickedMove: ValidMove | null = null;
      let minDist = Infinity;

      validMovesRef.current.forEach((move) => {
        const pos = getTokenPixelPos(
          color,
          move.tokenIdx,
          playersRef.current[pIdx].tokens[move.tokenIdx].pos,
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
    [confirmTokenMove],
  );

  /* ---------- D-pad / keyboard navigation for TV remotes ---------- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (phaseRef.current === "waiting_token") {
        const moves = validMovesRef.current;
        if (moves.length === 0) return;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          focusedMoveIdxRef.current =
            (focusedMoveIdxRef.current + 1) % moves.length;
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          focusedMoveIdxRef.current =
            (focusedMoveIdxRef.current - 1 + moves.length) % moves.length;
        } else if (e.key === "Enter" || e.key === " " || e.key === "OK") {
          e.preventDefault();
          confirmTokenMove(moves[focusedMoveIdxRef.current]);
        }
      } else if (phaseRef.current === "waiting_roll") {
        if (e.key === "Enter" || e.key === " " || e.key === "OK") {
          e.preventDefault();
          humanRoll();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [confirmTokenMove, humanRoll]);

  /* ---------- Kick off the first turn on mount ---------- */
  useEffect(() => {
    fnRefs.current.startTurn();
  }, []);

  /* ---------- Render ---------- */
  const currentPlayer = playersRef.current[currentPlayerIdx];
  const isHumanTurn = !currentPlayer.isAI;
  const diceInteractive =
    isHumanTurn && phase === "waiting_roll" && !diceRolling;

  return (
    <div className="app-shell relative w-full">
      <div className="bg-noise" />
      <div
        className="glow-blob"
        style={{
          width: 500,
          height: 500,
          background: "var(--accent)",
          top: -150,
          left: -150,
          opacity: 0.07,
        }}
      />
      <div
        className="glow-blob"
        style={{
          width: 400,
          height: 400,
          background: COLOR_HEX[currentPlayer.color],
          bottom: -100,
          right: -100,
          opacity: 0.08,
        }}
      />

      <main className="relative z-10 flex-1 flex flex-col items-center p-3 sm:p-4 gap-3">
        {/* Status banner */}
        <div
          className="status-banner"
          style={{
            border: `1px solid ${COLOR_HEX[currentPlayer.color]}55`,
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                background: COLOR_HEX[currentPlayer.color],
                boxShadow: `0 0 10px ${COLOR_HEX[currentPlayer.color]}`,
              }}
            />
            <span
              className="text-[10px] uppercase tracking-widest"
              style={{ color: "var(--muted-foreground)" }}
            >
              Turn
            </span>
            <span
              className="font-display text-base sm:text-lg font-bold truncate"
              style={{ color: COLOR_HEX[currentPlayer.color] }}
            >
              {currentPlayer.name}
              {currentPlayer.isAI && (
                <span
                  className="ml-2 text-[9px] px-1.5 py-0.5 rounded align-middle"
                  style={{
                    background: "var(--secondary)",
                    color: "var(--muted-foreground)",
                  }}
                >
                  AI
                </span>
              )}
            </span>
          </div>
          <div
            className="text-xs sm:text-sm font-medium truncate"
            style={{ color: "var(--muted-foreground)" }}
          >
            {diceMsg ||
              (diceInteractive
                ? "Tap the dice to roll"
                : isHumanTurn
                  ? "Waiting..."
                  : `${currentPlayer.name} is thinking...`)}
          </div>
        </div>

        {/* 3D board with floating dice in the center */}
        <div className="board-stage">
          <div className="board-tilt">
            <canvas
              ref={canvasRef}
              id="ludo-board"
              width={BOARD_SIZE}
              height={BOARD_SIZE}
              onClick={handleCanvasClick}
              onTouchEnd={handleCanvasClick}
              className={phase === "waiting_token" ? "clickable" : ""}
            />
          </div>

          {/* Dice floats above the board center */}
          <div className="board-dice">
            <Dice3D
              ref={diceSceneRef}
              value={diceValue}
              value2={diceValue2}
              rolling={diceRolling}
              interactive={diceInteractive}
              onClick={humanRoll}
              twoDice
            />
          </div>
        </div>

        {/* Bottom player bar */}
        <div className="w-full max-w-[1100px] flex flex-col gap-3 mt-1">
          <div className="player-bar">
            {playersRef.current.map((p, i) => (
              <PlayerCard
                key={p.color}
                player={p}
                isActive={i === currentPlayerIdx}
                index={i}
              />
            ))}
          </div>

          {/* Controls */}
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
              ↻ New Game
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

      {/* Hidden button for TV/remote focus fallback (rolls dice via Enter) */}
      <button
        ref={rollBtnRef}
        onClick={humanRoll}
        disabled={rollBtnDisabled}
        className="sr-only"
        aria-label="Roll dice"
        tabIndex={diceInteractive ? 0 : -1}
      >
        Roll Dice
      </button>
    </div>
  );
}
