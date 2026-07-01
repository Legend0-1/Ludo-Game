/**
 * Static board renderer for LUDO — flat "classic app icon" style with:
 *   - 4 solid-color corner quadrants (green / yellow / red / blue), each
 *     holding a white rounded "dice-face" home icon with 4 pip slots
 *   - Clean white playing track with a thin grid
 *   - Directional arrows + star safe-spots on the track
 *   - A 4-triangle color pinwheel in the very center
 *
 * Tokens are drawn separately as 3D chess-pawn pieces (see drawTokens).
 */
import {
  BOARD,
  CS,
  COLOR_HEX,
  COLORS,
  HOME_AREAS,
  HOME_BASE_POS,
  HOME_STRETCH,
  MAIN_PATH,
  PLAYER_START_IDX,
  SAFE_SPOTS,
  type Color,
} from "./ludo";

export const BOARD_SIZE = BOARD * CS; // 600

const GRID_LINE = "rgba(0,0,0,0.12)";
const TRACK_WHITE = "#ffffff";
const INK = "#20242b";

/* ---------- Small helpers ---------- */
function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function drawArrow(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  direction: "up" | "down" | "left" | "right",
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  switch (direction) {
    case "up":
      c.moveTo(cx, cy - size);
      c.lineTo(cx + size * 0.7, cy + size * 0.4);
      c.lineTo(cx - size * 0.7, cy + size * 0.4);
      break;
    case "down":
      c.moveTo(cx, cy + size);
      c.lineTo(cx + size * 0.7, cy - size * 0.4);
      c.lineTo(cx - size * 0.7, cy - size * 0.4);
      break;
    case "left":
      c.moveTo(cx - size, cy);
      c.lineTo(cx + size * 0.4, cy + size * 0.7);
      c.lineTo(cx + size * 0.4, cy - size * 0.7);
      break;
    case "right":
      c.moveTo(cx + size, cy);
      c.lineTo(cx - size * 0.4, cy + size * 0.7);
      c.lineTo(cx - size * 0.4, cy - size * 0.7);
      break;
  }
  c.closePath();
  c.fill();
}

/* ---------- Static board ---------- */
export function drawBoardStatic(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // Clip everything to a rounded card so the whole board reads as one
  // clean rounded-corner icon, like the reference artwork.
  ctx.save();
  roundRect(ctx, 0, 0, BOARD_SIZE, BOARD_SIZE, 20);
  ctx.clip();

  // 1) Base white playing surface
  ctx.fillStyle = TRACK_WHITE;
  ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

  // 2) Four solid-color corner quadrants, each with a dice-face home icon
  for (const color of COLORS) {
    const a = HOME_AREAS[color];
    const x = a.c1 * CS;
    const y = a.r1 * CS;
    const w = (a.c2 - a.c1 + 1) * CS;
    const h = (a.r2 - a.r1 + 1) * CS;

    ctx.fillStyle = COLOR_HEX[color];
    ctx.fillRect(x, y, w, h);

    // White rounded "dice face" home icon, inset within the quadrant
    const inset = w * 0.1;
    const iconX = x + inset;
    const iconY = y + inset;
    const iconSize = w - inset * 2;
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, iconX, iconY, iconSize, iconSize, iconSize * 0.16);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 2;
    roundRect(ctx, iconX, iconY, iconSize, iconSize, iconSize * 0.16);
    ctx.stroke();

    // 4 pip slots (also the real token home-base positions), styled like
    // the dots on a die face showing "4".
    const positions = HOME_BASE_POS[color];
    positions.forEach((pos) => {
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, CS * 0.4, 0, Math.PI * 2);
      const pipGrad = ctx.createRadialGradient(
        pos.x - CS * 0.12,
        pos.y - CS * 0.12,
        CS * 0.05,
        pos.x,
        pos.y,
        CS * 0.4,
      );
      pipGrad.addColorStop(0, lightenHex(COLOR_HEX[color], 40));
      pipGrad.addColorStop(1, COLOR_HEX[color]);
      ctx.fillStyle = pipGrad;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.15)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // 3) Main path cells — white with thin grid lines
  MAIN_PATH.forEach(([r, col], idx) => {
    const x = col * CS;
    const y = r * CS;

    let fillColor = TRACK_WHITE;
    let startColor: Color | null = null;
    for (const color of COLORS) {
      if (idx === PLAYER_START_IDX[color]) {
        startColor = color;
        fillColor = lightenHex(COLOR_HEX[color], 55);
      }
    }

    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, CS, CS);

    ctx.strokeStyle = GRID_LINE;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, CS - 1, CS - 1);

    // Safe spot: small dark star (matches the reference art)
    if (SAFE_SPOTS.has(idx)) {
      drawStar(ctx, x + CS / 2, y + CS / 2, 8, 3.4, 5, INK);
    }

    // Directional arrow on each player's start cell
    if (startColor) {
      const dir: Record<Color, "up" | "down" | "left" | "right"> = {
        red: "right",
        green: "down",
        yellow: "left",
        blue: "up",
      };
      drawArrow(
        ctx,
        x + CS / 2,
        y + CS / 2,
        CS * 0.3,
        dir[startColor],
        COLOR_HEX[startColor],
      );
    }
  });

  // 4) Home stretch lanes — solid color tint with an arrow toward center
  for (const color of COLORS) {
    HOME_STRETCH[color].forEach(([r, col], i) => {
      const x = col * CS;
      const y = r * CS;
      ctx.fillStyle = lightenHex(COLOR_HEX[color], 15);
      ctx.fillRect(x, y, CS, CS);
      ctx.strokeStyle = GRID_LINE;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, CS - 1, CS - 1);

      if (i === HOME_STRETCH[color].length - 1) {
        const dir: Record<Color, "up" | "down" | "left" | "right"> = {
          red: "left",
          green: "up",
          yellow: "right",
          blue: "down",
        };
        drawArrow(
          ctx,
          x + CS / 2,
          y + CS / 2,
          CS * 0.22,
          dir[color],
          "#ffffff",
        );
      }
    });
  }

  // 5) Center pinwheel — 4 triangles pointing inward, colored per player
  // (each triangle sits on the same side its color's home-stretch enters
  // from, so it lines up visually with that player's lane)
  const cx = 7.5 * CS;
  const cy = 7.5 * CS;
  const half = 1.5 * CS;
  const corners = {
    tl: { x: cx - half, y: cy - half },
    tr: { x: cx + half, y: cy - half },
    bl: { x: cx - half, y: cy + half },
    br: { x: cx + half, y: cy + half },
  };
  const sideColor: Record<"top" | "right" | "bottom" | "left", Color> = {
    top: "green",
    right: "yellow",
    bottom: "blue",
    left: "red",
  };
  const triangles: { pts: { x: number; y: number }[]; color: Color }[] = [
    { pts: [corners.tl, corners.tr, { x: cx, y: cy }], color: sideColor.top },
    { pts: [corners.tr, corners.br, { x: cx, y: cy }], color: sideColor.right },
    { pts: [corners.br, corners.bl, { x: cx, y: cy }], color: sideColor.bottom },
    { pts: [corners.bl, corners.tl, { x: cx, y: cy }], color: sideColor.left },
  ];
  triangles.forEach(({ pts, color }) => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.closePath();
    ctx.fillStyle = COLOR_HEX[color];
    ctx.fill();
  });
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);

  ctx.restore();

  // Faint outer frame for definition
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, BOARD_SIZE - 2, BOARD_SIZE - 2, 20);
  ctx.stroke();
}

function drawStar(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
  color: string,
) {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = (Math.PI / 2) * 3 + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) c.moveTo(x, y);
    else c.lineTo(x, y);
  }
  c.closePath();
  c.fill();
}

function lightenHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + percent);
  const g = Math.min(255, ((num >> 8) & 0xff) + percent);
  const b = Math.min(255, (num & 0xff) + percent);
  return `rgb(${r},${g},${b})`;
}

function darkenHex(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, (num >> 16) - percent);
  const g = Math.max(0, ((num >> 8) & 0xff) - percent);
  const b = Math.max(0, (num & 0xff) - percent);
  return `rgb(${r},${g},${b})`;
}

/* ---------- Token rendering: 3D chess-pawn pieces ---------- */
export interface TokenDrawInfo {
  pi: number;
  ti: number;
  color: Color;
  pos: number;
  finished: boolean;
  x: number;
  y: number;
}

function getTokenPixelForDraw(
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

/**
 * Draw a single 3D chess-pawn shaped token: a wide rounded base, a tapered
 * body, a small collar, and a round head on top — all shaded with
 * gradients to read as a real glossy 3D playing piece.
 */
function drawPawn(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  highlighted: boolean,
  focused: boolean,
  now: number,
  size: number = 1,
) {
  const baseR = CS * 0.27 * size;
  const baseY = y + baseR * 0.75;
  const neckR = baseR * 0.42;
  const neckY = baseY - baseR * 1.55;
  const collarR = neckR * 1.55;
  const collarY = neckY - baseR * 0.08;
  const headR = collarR * 0.82;
  const headY = collarY - headR * 1.05;

  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(x, baseY + baseR * 0.28, baseR * 1.15, baseR * 0.36, 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.fill();

  // Highlighted glow (valid-move pulse)
  if (highlighted) {
    const pulse = Math.sin(now / 200) * 0.15 + 0.85;
    ctx.beginPath();
    ctx.arc(x, y - baseR * 0.3, baseR * 1.7 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = color + "44";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - baseR * 0.3, baseR * 1.55 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Focus ring (D-pad navigation)
  if (focused) {
    ctx.beginPath();
    ctx.arc(x, y - baseR * 0.3, baseR * 1.8, 0, Math.PI * 2);
    ctx.strokeStyle = "#c8956c";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  const bodyGrad = ctx.createLinearGradient(x - baseR, 0, x + baseR, 0);
  bodyGrad.addColorStop(0, darkenHex(color, 45));
  bodyGrad.addColorStop(0.38, color);
  bodyGrad.addColorStop(0.55, lightenHex(color, 35));
  bodyGrad.addColorStop(1, darkenHex(color, 35));

  // Base disc (the round foot of the pawn)
  ctx.beginPath();
  ctx.ellipse(x, baseY, baseR, baseR * 0.32, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Tapered body from base up to the neck
  ctx.beginPath();
  ctx.moveTo(x - baseR, baseY - baseR * 0.05);
  ctx.lineTo(x - neckR, neckY);
  ctx.lineTo(x + neckR, neckY);
  ctx.lineTo(x + baseR, baseY - baseR * 0.05);
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Collar (the flared ring below the head, classic pawn silhouette)
  ctx.beginPath();
  ctx.ellipse(x, collarY, collarR, collarR * 0.48, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Head (sphere) with radial shading for a glossy 3D look
  const headGrad = ctx.createRadialGradient(
    x - headR * 0.35,
    headY - headR * 0.35,
    headR * 0.15,
    x,
    headY,
    headR * 1.1,
  );
  headGrad.addColorStop(0, lightenHex(color, 60));
  headGrad.addColorStop(0.55, color);
  headGrad.addColorStop(1, darkenHex(color, 35));
  ctx.beginPath();
  ctx.arc(x, headY, headR, 0, Math.PI * 2);
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glossy highlight dot on the head
  ctx.beginPath();
  ctx.ellipse(
    x - headR * 0.32,
    headY - headR * 0.35,
    headR * 0.32,
    headR * 0.2,
    -0.6,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.fill();

  // Left-edge highlight running down the body (glossy plastic streak)
  ctx.beginPath();
  ctx.moveTo(x - baseR * 0.55, baseY - baseR * 0.3);
  ctx.lineTo(x - neckR * 0.7, neckY + baseR * 0.1);
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();
}

/** Draw all live tokens (handles overlap by offsetting stacked tokens). */
export function drawTokens(
  ctx: CanvasRenderingContext2D,
  tokens: TokenDrawInfo[],
  highlighted: { pi: number; ti: number }[],
  focusedToken: { pi: number; ti: number } | null,
  _lightenColor: (hex: string, percent: number) => string,
  now: number,
): void {
  const liveTokens = tokens.filter((t) => !t.finished);
  const groups: Record<string, TokenDrawInfo[]> = {};
  liveTokens.forEach((tp) => {
    const { x, y } = getTokenPixelForDraw(tp.color, tp.ti, tp.pos);
    const key = `${Math.round(x)},${Math.round(y)}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push({ ...tp, x, y });
  });

  const offsets = [
    [-6, -4],
    [6, -4],
    [-6, 6],
    [6, 6],
  ];

  Object.values(groups).forEach((group) => {
    group.forEach((tp, idx) => {
      let dx = 0;
      let dy = 0;
      if (group.length > 1) {
        dx = offsets[idx % 4][0];
        dy = offsets[idx % 4][1];
      }
      const x = tp.x + dx;
      const y = tp.y + dy;
      const isHighlighted = highlighted.some(
        (h) => h.pi === tp.pi && h.ti === tp.ti,
      );
      const isFocused = focusedToken
        ? focusedToken.pi === tp.pi && focusedToken.ti === tp.ti
        : false;
      // Slightly shrink tokens when stacked so they all fit
      const size = group.length > 1 ? 0.82 : 1;
      drawPawn(
        ctx,
        x,
        y,
        COLOR_HEX[tp.color],
        isHighlighted,
        isFocused,
        now,
        size,
      );
    });
  });

  // Finished tokens drawn tucked into the center pinwheel
  tokens
    .filter((t) => t.finished)
    .forEach((tp) => {
      const angle: Record<Color, number> = {
        red: Math.PI * 0.75,
        green: Math.PI * 1.25,
        yellow: Math.PI * 1.75,
        blue: Math.PI * 0.25,
      };
      const r = CS * 0.55;
      const cx = 7.5 * CS + Math.cos(angle[tp.color]) * r;
      const cy = 7.5 * CS + Math.sin(angle[tp.color]) * r;
      drawPawn(ctx, cx, cy, COLOR_HEX[tp.color], false, false, now, 0.55);
    });
}
