"use client";

import { forwardRef } from "react";
import { DICE_DOTS } from "@/lib/ludo";

interface Dice3DProps {
  /** When 2 dice are used, this is the first die's value. */
  value: number;
  /** Second die's value (optional — only used when `twoDice` is true). */
  value2?: number;
  rolling: boolean;
  onClick?: () => void;
  interactive?: boolean; // when true, shows pulse ring & accepts clicks
  twoDice?: boolean; // when true, render 2 dice side by side
}

// CSS transforms to bring each face to the front of the cube
const FACE_TRANSFORMS: Record<number, string> = {
  1: "rotateX(0deg) rotateY(0deg)",
  2: "rotateX(-90deg) rotateY(0deg)",
  3: "rotateX(0deg) rotateY(-90deg)",
  4: "rotateX(0deg) rotateY(90deg)",
  5: "rotateX(90deg) rotateY(0deg)",
  6: "rotateX(180deg) rotateY(0deg)",
};

const Dice3D = forwardRef<HTMLDivElement, Dice3DProps>(function Dice3D(
  { value, value2, rolling, onClick, interactive = false, twoDice = false },
  ref,
) {
  const faces = [
    { num: 1, cls: "front" },
    { num: 6, cls: "back" },
    { num: 3, cls: "right" },
    { num: 4, cls: "left" },
    { num: 5, cls: "top" },
    { num: 2, cls: "bottom" },
  ];

  return (
    <div
      ref={ref}
      className={`dice-scene dice-scene-sm ${interactive && !rolling ? "idle" : ""} ${twoDice ? "dice-pair" : ""}`}
      role="button"
      tabIndex={interactive && !rolling ? 0 : -1}
      aria-label={
        rolling
          ? "Dice rolling"
          : twoDice
            ? `Dice showing ${value} and ${value2}. ${interactive ? "Click to roll." : ""}`
            : `Dice showing ${value}. ${interactive ? "Click to roll." : ""}`
      }
      onClick={interactive && !rolling ? onClick : undefined}
      onKeyDown={
        interactive && !rolling
          ? (e) => {
              if (e.key === "Enter" || e.key === " " || e.key === "OK") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={{ cursor: interactive && !rolling ? "pointer" : "default" }}
    >
      {interactive && !rolling && (
        <span className="dice-ring active" aria-hidden />
      )}

      <div className="dice-pair-row">
        <DieCube value={value} rolling={rolling} faces={faces} />
        {twoDice && <DieCube value={value2 || 1} rolling={rolling} faces={faces} />}
      </div>

      <span
        className={`dice-shadow ${rolling ? "rolling" : ""}`}
        aria-hidden
      />
    </div>
  );
});

export default Dice3D;

function DieCube({
  value,
  rolling,
  faces,
}: {
  value: number;
  rolling: boolean;
  faces: { num: number; cls: string }[];
}) {
  return (
    <div
      className={`dice-cube ${rolling ? "rolling" : ""}`}
      style={
        rolling
          ? undefined
          : { transform: FACE_TRANSFORMS[value] || FACE_TRANSFORMS[1] }
      }
    >
      {faces.map((f) => (
        <Face key={f.num} num={f.num} cls={f.cls} />
      ))}
    </div>
  );
}

function Face({ num, cls }: { num: number; cls: string }) {
  const dots = DICE_DOTS[num] || [];
  return (
    <div className={`dice-face ${cls}`}>
      {Array.from({ length: 9 }, (_, i) => {
        const cellNum = i + 1;
        return (
          <div key={cellNum} className="dot-cell">
            {dots.includes(cellNum) && <div className="dot" />}
          </div>
        );
      })}
    </div>
  );
}
