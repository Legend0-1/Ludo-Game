"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { io, type Socket } from "socket.io-client";

export interface RoomPlayer {
  name: string;
  slot: number; // 0..3 → red/green/yellow/blue
  isHost: boolean;
  isAI: boolean;
  connected: boolean;
}

export interface RoomState {
  code: string;
  players: RoomPlayer[];
  started: boolean;
  hostSlot: number;
}

export interface ChatMsg {
  slot: number;
  name: string;
  text: string;
  ts: number;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

interface UseMultiplayerOptions {
  onStateUpdate?: (state: unknown) => void;
  onAction?: (action: { fromSlot: number; type: string; payload?: unknown }) => void;
  onChat?: (msg: ChatMsg) => void;
}

/**
 * useMultiplayer — manages a Socket.io connection to the LUDO relay server.
 *
 * Connection URL is relative ("/") so Caddy can route it via the
 * XTransformPort=3003 query parameter.
 */
export function useMultiplayer(opts: UseMultiplayerOptions = {}) {
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [room, setRoom] = useState<RoomState | null>(null);
  const [mySlot, setMySlot] = useState<number>(-1);
  const [isHost, setIsHost] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const optsRef = useRef(opts);
  useEffect(() => {
    optsRef.current = opts;
  });

  const connect = useCallback(() => {
    if (socketRef.current) return;
    setStatus("connecting");
    const socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus("connected");
      setError(null);
    });
    socket.on("disconnect", () => {
      setStatus("disconnected");
    });
    socket.on("connect_error", (err: Error) => {
      setStatus("error");
      setError(err.message);
    });

    socket.on("room-joined", (data: { code: string; slot: number; isHost: boolean }) => {
      setMySlot(data.slot);
      setIsHost(data.isHost);
    });
    socket.on("room-update", (data: RoomState) => {
      setRoom(data);
    });
    socket.on("room-error", (data: { message: string }) => {
      setError(data.message);
    });
    socket.on("room-closed", (data: { reason: string }) => {
      setError(data.reason);
      setRoom(null);
      setStatus("disconnected");
    });
    socket.on("game-started", () => {
      if (optsRef.current.onStateUpdate) {
        // The host will broadcast initial state separately
      }
    });
    socket.on("state", (state: unknown) => {
      optsRef.current.onStateUpdate?.(state);
    });
    socket.on("action", (action: { fromSlot: number; type: string; payload?: unknown }) => {
      optsRef.current.onAction?.(action);
    });
    socket.on("chat", (msg: ChatMsg) => {
      optsRef.current.onChat?.(msg);
    });
  }, []);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.emit("leave-room");
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setStatus("disconnected");
    setRoom(null);
    setMySlot(-1);
    setIsHost(false);
  }, []);

  const createRoom = useCallback((name: string) => {
    socketRef.current?.emit("create-room", { name });
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    socketRef.current?.emit("join-room", { code, name });
  }, []);

  const toggleAI = useCallback((slot: number, isAI: boolean) => {
    if (!room) return;
    socketRef.current?.emit("toggle-ai", { code: room.code, slot, isAI });
  }, [room]);

  const startGame = useCallback(() => {
    if (!room) return;
    socketRef.current?.emit("start-game", { code: room.code });
  }, [room]);

  const sendAction = useCallback((type: string, payload?: unknown) => {
    if (!room) return;
    socketRef.current?.emit("action", { code: room.code, type, payload });
  }, [room]);

  const broadcastState = useCallback((state: unknown) => {
    if (!room) return;
    socketRef.current?.emit("state", { code: room.code, state });
  }, [room]);

  const sendChat = useCallback((text: string) => {
    if (!room) return;
    socketRef.current?.emit("chat", { code: room.code, text });
  }, [room]);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  return {
    status,
    room,
    mySlot,
    isHost,
    error,
    connect,
    disconnect,
    createRoom,
    joinRoom,
    toggleAI,
    startGame,
    sendAction,
    broadcastState,
    sendChat,
  };
}
