"use client";

import { useEffect, useState } from "react";

export interface ToastMsg {
  id: number;
  text: string;
}

let toastId = 0;
let listeners: ((t: ToastMsg) => void)[] = [];

export function pushToast(text: string): void {
  const msg: ToastMsg = { id: ++toastId, text };
  listeners.forEach((fn) => fn(msg));
}

export function useToastQueue(): ToastMsg[] {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const fn = (t: ToastMsg) => {
      setItems((prev) => [...prev, t]);
      setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== t.id));
      }, 2500);
    };
    listeners.push(fn);
    return () => {
      listeners = listeners.filter((l) => l !== fn);
    };
  }, []);
  return items;
}

export function ToastContainer() {
  const toasts = useToastQueue();
  return (
    <div className="fixed top-4 left-0 right-0 z-100 flex flex-col items-center pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast show"
          style={{ position: "relative", transform: "none", marginBottom: 8 }}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
