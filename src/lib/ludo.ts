/**
 * LUDO game logic — types, constants, board geometry, move validation,
 * captures, and AI decision-making. Pure (no React, no DOM) so it can be
 * tested and reused across mobile / tablet / TV surfaces.
 */

export type Color = "red" | "green" | "yellow" | "blue";

export type GamePhase =
  | "idle"
  | "waiting_roll"
  | "rolling"
  | "waiting_token"
  | "animating"
  | "finished";

export interface Token {
  /** -1 = home base, 0..51 = main path offset, 52..57 = home stretch, 58 = finished */
  pos: number;
}

export interface Player {
  color: Color;
  name: string;
  isAI: boolean;
  tokens: [Token, Token, Token, Token];
}

export interface ValidMove {
  tokenIdx: number;
  newPos: number;
  type: "enter" | "move";
}

export interface CaptureInfo {
  playerIdx: number;
  tokenIdx: number;
  color: Color;
}

/* ================================================================
   BOARD GEOMETRY
   15x15 grid. Each cell is rendered at CS px (canvas) or scaled.
   ================================================================ */
export const BOARD = 15;
export const CS = 40; // base cell size in pixels (canvas is 600x600)
export const COLORS: Color[] = ["red", "green", "yellow", "blue"];

export const COLOR_HEX: Record<Color, string> = {
  red: "#e63946",
  green: "#2a9d5c",
  yellow: "#e9b825",
  blue: "#3a86c8",
};

export const COLOR_LIGHT: Record<Color, string> = {
  red: "#f8d7da",
  green: "#d4edda",
  yellow: "#fff3cd",
  blue: "#d1ecf1",
};

export const COLOR_NAMES: Record<Color, string> = {
  red: "Red",
  green: "Green",
  yellow: "Yellow",
  blue: "Blue",
};

/** Index in MAIN_PATH where each color enters from home base. */
export const PLAYER_START_IDX: Record<Color, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/** 52-cell main path clockwise — [row, col] */
export const MAIN_PATH: [number, number][] = [
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
];

/** Home stretch (6 cells each) leading toward center. */
export const HOME_STRETCH: Record<Color, [number, number][]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

/** Pixel positions of the 4 token slots inside each home base. */
export const HOME_BASE_POS: Record<Color, { x: number; y: number }[]> = {
  red: [
    { x: 1.5 * CS, y: 10.5 * CS },
    { x: 3.5 * CS, y: 10.5 * CS },
    { x: 1.5 * CS, y: 12.5 * CS },
    { x: 3.5 * CS, y: 12.5 * CS },
  ],
  green: [
    { x: 1.5 * CS, y: 1.5 * CS },
    { x: 3.5 * CS, y: 1.5 * CS },
    { x: 1.5 * CS, y: 3.5 * CS },
    { x: 3.5 * CS, y: 3.5 * CS },
  ],
  yellow: [
    { x: 10.5 * CS, y: 1.5 * CS },
    { x: 12.5 * CS, y: 1.5 * CS },
    { x: 10.5 * CS, y: 3.5 * CS },
    { x: 12.5 * CS, y: 3.5 * CS },
  ],
  blue: [
    { x: 10.5 * CS, y: 10.5 * CS },
    { x: 12.5 * CS, y: 10.5 * CS },
    { x: 10.5 * CS, y: 12.5 * CS },
    { x: 12.5 * CS, y: 12.5 * CS },
  ],
};

/** Absolute indices in MAIN_PATH that are safe (no capture). */
export const SAFE_SPOTS = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);

/** 6x6 corner areas for each player's home base. */
export const HOME_AREAS: Record<
  Color,
  { r1: number; r2: number; c1: number; c2: number }
> = {
  red: { r1: 9, r2: 14, c1: 0, c2: 5 },
  green: { r1: 0, r2: 5, c1: 0, c2: 5 },
  yellow: { r1: 0, r2: 5, c1: 9, c2: 14 },
  blue: { r1: 9, r2: 14, c1: 9, c2: 14 },
};

/* ================================================================
   MOVE VALIDATION & CAPTURE
   ================================================================ */
/**
 * Compute valid moves for a player given a dice value.
 *
 * In 2-dice mode, pass the SUM as `dice` and set `hasSix=true` if either
 * individual die showed a 6 — that allows tokens to leave the home base.
 */
export function getValidMoves(
  pIdx: number,
  dice: number,
  players: Player[],
  hasSix: boolean = dice === 6,
): ValidMove[] {
  const p = players[pIdx];
  const moves: ValidMove[] = [];

  p.tokens.forEach((t, ti) => {
    if (t.pos === 58) return; // already finished

    if (t.pos === -1) {
      // In home base — need a 6 (on either die in 2-dice mode) to come out
      if (hasSix) {
        moves.push({ tokenIdx: ti, newPos: 0, type: "enter" });
      }
    } else {
      const newPos = t.pos + dice;
      if (newPos > 58) return; // overshoot — not allowed (need exact)

      // Friendly-token block check on main path
      if (newPos <= 51) {
        const absNew = (PLAYER_START_IDX[p.color] + newPos) % 52;
        let blocked = false;
        p.tokens.forEach((ot, oi) => {
          if (oi === ti) return;
          if (ot.pos >= 0 && ot.pos <= 51) {
            const absOther = (PLAYER_START_IDX[p.color] + ot.pos) % 52;
            if (absOther === absNew) blocked = true;
          }
        });
        if (!blocked) moves.push({ tokenIdx: ti, newPos, type: "move" });
      } else {
        moves.push({ tokenIdx: ti, newPos, type: "move" });
      }
    }
  });

  return moves;
}

/** Detect & optionally perform captures when a token lands on a main-path cell. */
export function checkCapture(
  pIdx: number,
  tokenIdx: number,
  players: Player[],
  doCapture: boolean,
  onCapture?: (info: CaptureInfo, capturingColor: Color) => void,
): CaptureInfo | null {
  const p = players[pIdx];
  const t = p.tokens[tokenIdx];
  if (t.pos < 0 || t.pos > 51) return null;
  const absPos = (PLAYER_START_IDX[p.color] + t.pos) % 52;
  if (SAFE_SPOTS.has(absPos)) return null;

  let captured: CaptureInfo | null = null;
  players.forEach((op, oi) => {
    if (oi === pIdx) return;
    op.tokens.forEach((ot, oti) => {
      if (ot.pos < 0 || ot.pos > 51) return;
      const otherAbs = (PLAYER_START_IDX[op.color] + ot.pos) % 52;
      if (otherAbs === absPos && doCapture) {
        ot.pos = -1;
        captured = { playerIdx: oi, tokenIdx: oti, color: op.color };
        onCapture?.(captured, p.color);
      }
    });
  });
  return captured;
}

export function checkWin(pIdx: number, players: Player[]): boolean {
  return players[pIdx].tokens.every((t) => t.pos === 58);
}

/* ================================================================
   AI DECISION-MAKING
   Priority: capture > reach home > enter home stretch > bring out new
             token on 6 > move furthest token (with a small random factor)
   ================================================================ */
export function aiChooseMove(
  pIdx: number,
  dice: number,
  moves: ValidMove[],
  players: Player[],
  hasSix: boolean = dice === 6,
): ValidMove {
  const p = players[pIdx];

  // Priority 1: Capture
  for (const move of moves) {
    if (move.type === "move" && move.newPos <= 51) {
      const absPos = (PLAYER_START_IDX[p.color] + move.newPos) % 52;
      if (SAFE_SPOTS.has(absPos)) continue;
      let canCapture = false;
      players.forEach((op, oi) => {
        if (oi === pIdx) return;
        op.tokens.forEach((ot) => {
          if (ot.pos >= 0 && ot.pos <= 51) {
            const otherAbs = (PLAYER_START_IDX[op.color] + ot.pos) % 52;
            if (otherAbs === absPos) canCapture = true;
          }
        });
      });
      if (canCapture) return move;
    }
  }

  // Priority 2: Reach home (finish a token)
  for (const move of moves) {
    if (move.newPos === 58) return move;
  }

  // Priority 3: Enter home stretch
  for (const move of moves) {
    if (move.newPos >= 52 && move.newPos < 58) return move;
  }

  // Priority 4: Bring out a new token on 6
  if (hasSix) {
    const enterMove = moves.find((m) => m.type === "enter");
    if (enterMove && p.tokens.filter((t) => t.pos === -1).length > 2) {
      return enterMove;
    }
  }

  // Priority 5: Move furthest token (with randomness)
  let bestMove = moves[0];
  let bestPos = -999;
  moves.forEach((move) => {
    if (move.newPos > bestPos) {
      bestPos = move.newPos;
      bestMove = move;
    }
  });
  if (moves.length > 1 && Math.random() < 0.2) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  return bestMove;
}

/* ================================================================
   PIXEL COORDINATE HELPERS
   ================================================================ */
export function getTokenPixelPos(
  color: Color,
  tokenIdx: number,
  pos: number,
): { x: number; y: number } {
  if (pos === -1) {
    return { ...HOME_BASE_POS[color][tokenIdx] };
  } else if (pos >= 0 && pos <= 51) {
    const absIdx = (PLAYER_START_IDX[color] + pos) % 52;
    const [r, c] = MAIN_PATH[absIdx];
    return { x: c * CS + CS / 2, y: r * CS + CS / 2 };
  } else if (pos >= 52 && pos <= 57) {
    const [r, c] = HOME_STRETCH[color][pos - 52];
    return { x: c * CS + CS / 2, y: r * CS + CS / 2 };
  } else {
    return { x: 7.5 * CS, y: 7.5 * CS };
  }
}

/** Lighten a hex color by mixing it toward white. */
export function lightenColor(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + percent);
  const g = Math.min(255, ((num >> 8) & 0xff) + percent);
  const b = Math.min(255, (num & 0xff) + percent);
  return `rgb(${r},${g},${b})`;
}

/* ================================================================
   DEFAULT SETUP
   ================================================================ */
export interface SetupEntry {
  color: Color;
  name: string;
  active: boolean;
  isAI: boolean;
}

export const DEFAULT_SETUP: SetupEntry[] = [
  { color: "red", name: "Red", active: true, isAI: false },
  { color: "green", name: "Green", active: true, isAI: true },
  { color: "yellow", name: "Yellow", active: true, isAI: true },
  { color: "blue", name: "Blue", active: true, isAI: true },
];

export function createPlayersFromSetup(setup: SetupEntry[]): Player[] {
  return setup
    .filter((p) => p.active)
    .map((p) => ({
      color: p.color,
      name: p.name,
      isAI: p.isAI,
      tokens: [
        { pos: -1 },
        { pos: -1 },
        { pos: -1 },
        { pos: -1 },
      ] as [Token, Token, Token, Token],
    }));
}

/** Dice dot positions (1..9 grid cells). */
export const DICE_DOTS: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
