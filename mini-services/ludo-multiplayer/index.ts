/**
 * LUDO Multiplayer Server — Socket.io relay.
 *
 * Design: the host client is authoritative over game state. The server just
 * relays messages between players in the same room and assigns slots when
 * players join. All game logic (dice, moves, captures, AI) lives in the host
 * client; non-host clients render the state the host broadcasts.
 *
 * Message flow:
 *   client → server:  "action"  { type, payload }     (forwarded to host)
 *   host → server:    "state"   { ... }                (broadcast to room)
 *   server → client:  "state"                          (everyone including host echo)
 *
 * Room lifecycle:
 *   - host creates room → server assigns 4-char code, slot 0
 *   - others join with code → server assigns next free slot (1..3)
 *   - host clicks "Start" → broadcasts initial state
 *   - players leave → server notifies room, host may continue with AI fill
 */

import { createServer } from "http";
import { Server } from "socket.io";

const httpServer = createServer();
const io = new Server(httpServer, {
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

interface RoomPlayer {
  socketId: string;
  name: string;
  slot: number; // 0..3 — also maps to LUDO color order red/green/yellow/blue
  isHost: boolean;
  isAI: boolean;
  connected: boolean;
}

interface Room {
  code: string;
  players: RoomPlayer[]; // up to 4
  hostSocketId: string;
  started: boolean;
}

const rooms = new Map<string, Room>();

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars
function generateCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  // Avoid collisions
  if (rooms.has(code)) return generateCode();
  return code;
}

function publicPlayer(p: RoomPlayer) {
  return {
    name: p.name,
    slot: p.slot,
    isHost: p.isHost,
    isAI: p.isAI,
    connected: p.connected,
  };
}

function broadcastRoomState(room: Room) {
  const payload = {
    code: room.code,
    players: room.players.map(publicPlayer),
    started: room.started,
    hostSlot: room.players.find((p) => p.isHost)?.slot ?? 0,
  };
  io.to(room.code).emit("room-update", payload);
}

io.on("connection", (socket) => {
  console.log(`[connect] ${socket.id}`);

  /* ---------- Create a new room ---------- */
  socket.on("create-room", (data: { name: string }) => {
    const name = (data?.name || "Host").slice(0, 20);
    const code = generateCode();
    const room: Room = {
      code,
      players: [
        {
          socketId: socket.id,
          name,
          slot: 0,
          isHost: true,
          isAI: false,
          connected: true,
        },
      ],
      hostSocketId: socket.id,
      started: false,
    };
    rooms.set(code, room);
    socket.join(code);
    console.log(`[create-room] ${name} created ${code}`);
    broadcastRoomState(room);
    socket.emit("room-joined", { code, slot: 0, isHost: true });
  });

  /* ---------- Join an existing room ---------- */
  socket.on(
    "join-room",
    (data: { code: string; name: string }) => {
      const code = (data?.code || "").toUpperCase();
      const name = (data?.name || "Player").slice(0, 20);
      const room = rooms.get(code);
      if (!room) {
        socket.emit("room-error", { message: `Room ${code} not found` });
        return;
      }
      if (room.players.length >= 4) {
        socket.emit("room-error", { message: "Room is full" });
        return;
      }
      if (room.started) {
        socket.emit("room-error", { message: "Game already started" });
        return;
      }
      // Find next free slot
      const usedSlots = new Set(room.players.map((p) => p.slot));
      let slot = -1;
      for (let i = 0; i < 4; i++) {
        if (!usedSlots.has(i)) {
          slot = i;
          break;
        }
      }
      if (slot === -1) {
        socket.emit("room-error", { message: "No free slot" });
        return;
      }
      const player: RoomPlayer = {
        socketId: socket.id,
        name,
        slot,
        isHost: false,
        isAI: false,
        connected: true,
      };
      room.players.push(player);
      socket.join(code);
      console.log(`[join-room] ${name} joined ${code} as slot ${slot}`);
      broadcastRoomState(room);
      socket.emit("room-joined", { code, slot, isHost: false });
    },
  );

  /* ---------- Leave a room ---------- */
  socket.on("leave-room", () => {
    leaveCurrentRoom(socket.id);
  });

  /* ---------- Toggle AI fill for a slot (host only) ---------- */
  socket.on(
    "toggle-ai",
    (data: { code: string; slot: number; isAI: boolean }) => {
      const room = rooms.get(data.code);
      if (!room) return;
      if (socket.id !== room.hostSocketId) return;

      const existing = room.players.find((pp) => pp.slot === data.slot);
      if (data.isAI) {
        // Add an AI player to the slot (or mark existing non-host as AI)
        if (existing) {
          if (!existing.isHost) existing.isAI = true;
        } else {
          const colorName = ["red", "green", "yellow", "blue"][data.slot];
          room.players.push({
            socketId: `ai-${data.slot}-${room.code}`,
            name: `AI ${colorName}`,
            slot: data.slot,
            isHost: false,
            isAI: true,
            connected: true,
          });
        }
      } else {
        // Remove AI player (or unmark non-host human-claimed slot — shouldn't happen)
        if (existing && existing.isAI) {
          room.players = room.players.filter((pp) => pp.slot !== data.slot);
        } else if (existing && !existing.isHost) {
          existing.isAI = false;
        }
      }
      broadcastRoomState(room);
    },
  );

  /* ---------- Start the game (host only) ---------- */
  socket.on("start-game", (data: { code: string }) => {
    const room = rooms.get(data.code);
    if (!room) return;
    if (socket.id !== room.hostSocketId) return;
    room.started = true;
    console.log(`[start-game] room ${data.code}`);
    io.to(data.code).emit("game-started", {
      players: room.players.map(publicPlayer),
    });
    broadcastRoomState(room);
  });

  /* ---------- Game action: client → host ---------- */
  socket.on(
    "action",
    (data: { code: string; type: string; payload?: unknown }) => {
      const room = rooms.get(data.code);
      if (!room) return;
      // Forward to host only (host applies and rebroadcasts state)
      io.to(room.hostSocketId).emit("action", {
        fromSlot: room.players.find((p) => p.socketId === socket.id)?.slot,
        type: data.type,
        payload: data.payload,
      });
    },
  );

  /* ---------- State broadcast: host → everyone ---------- */
  socket.on(
    "state",
    (data: { code: string; state: unknown }) => {
      const room = rooms.get(data.code);
      if (!room) return;
      if (socket.id !== room.hostSocketId) return;
      io.to(data.code).emit("state", data.state);
    },
  );

  /* ---------- Chat / quick reactions ---------- */
  socket.on(
    "chat",
    (data: { code: string; text: string }) => {
      const room = rooms.get(data.code);
      if (!room) return;
      const sender = room.players.find((p) => p.socketId === socket.id);
      if (!sender) return;
      io.to(data.code).emit("chat", {
        slot: sender.slot,
        name: sender.name,
        text: (data.text || "").slice(0, 200),
        ts: Date.now(),
      });
    },
  );

  /* ---------- Disconnect ---------- */
  socket.on("disconnect", () => {
    console.log(`[disconnect] ${socket.id}`);
    leaveCurrentRoom(socket.id);
  });

  socket.on("error", (err) => {
    console.error(`[socket-error] ${socket.id}:`, err);
  });
});

function leaveCurrentRoom(socketId: string) {
  for (const [code, room] of rooms.entries()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (!player) continue;

    if (player.isHost) {
      // Host left — close the room entirely
      io.to(code).emit("room-closed", { reason: "Host left" });
      rooms.delete(code);
      console.log(`[room-closed] ${code} (host left)`);
    } else {
      // Non-host left — remove them and notify
      room.players = room.players.filter((p) => p.socketId !== socketId);
      broadcastRoomState(room);
      console.log(`[leave] ${player.name} left ${code}`);
    }
    return;
  }
}

const PORT = 3003;
httpServer.listen(PORT, () => {
  console.log(`LUDO multiplayer server running on port ${PORT}`);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});
