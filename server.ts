// Global Process Error Shields: ensure unhandled rejections or exceptions never crash server
process.on('uncaughtException', (err) => {
  console.error('CRITICAL: Uncaught Server Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('CRITICAL: Unhandled Promise Rejection:', reason);
});

import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json() as any);

interface ServerPlayer {
  id: string;
  name: string;
  isHuman: boolean;
  isHost: boolean;
  avatar: string;
  score: number;
  gold?: number;
  inventory?: any;
  infiltratorBoostGold?: number;
  chameleonBoostGold?: number;
  hasShield?: boolean;
  shieldActive?: boolean;
  hasUsedPotionThisTurn?: boolean;
  scrambled?: boolean;
  oracleRevealedRow?: number;
  oracleRevealedCol?: string;
  inkApplied?: boolean;
  role: 'innocent' | 'fox';
  clue: string;
  originalClue?: string;
  forgedBy?: string;
  hasSubmittedClue: boolean;
  votedForId: string | null;
  isReady: boolean;
  isReadyToLeaveShop?: boolean;
  isDisconnected?: boolean;
  disconnectedAt?: number;
  sessionToken?: string;
}

interface ServerGameSettings {
  pointForGuessingFox: boolean;
  foxSeeOneClueEarly: boolean;
  anonymousVoting: boolean;
  turnTimer: boolean;
  turnTimerSeconds: number;
  privateGame: boolean;
  roomPassword?: string;
  infiltratorCount: number;
  chameleonCount?: number;
  targetScore: number;
  innocentCatchPoints: number;
  infiltratorEscapePoints: number;
  chameleonEscapePoints?: number;
  infiltratorStealPoints: number;
  chameleonStealPoints?: number;
  itemsEnabled?: boolean;
}

function cleanupRoomAfterPlayerRemoval(room: ServerRoom, removedPlayerId: string) {
  if (!room || !Array.isArray(room.players)) return;

  // Clean up any votes targeting the removed player
  room.players = (room.players || []).map((p) =>
    p.votedForId === removedPlayerId ? { ...p, votedForId: null } : p
  );

  // If host left, reassign host
  if (room.hostId === removedPlayerId && room.players.length > 0) {
    room.players.forEach((p) => {
      p.isHost = false;
    });
    const nextHost = room.players.find((p) => p.isHuman) || room.players[0];
    if (nextHost) {
      room.hostId = nextHost.id;
      nextHost.isHost = true;
    }
  }

  // Active game flow checks
  if (room.gamePhase !== 'home' && room.gamePhase !== 'lobby') {
    if (room.players.length < 3) {
      room.gamePhase = 'lobby';
    } else {
      // If the removed player was the Infiltrator, assign a new Infiltrator
      if (room.foxPlayerId === removedPlayerId) {
        room.foxPlayerId = room.players[0].id;
        room.players = room.players.map((p, idx) => ({
          ...p,
          role: idx === 0 ? 'fox' : 'innocent',
        }));
      }

      // If in clue submission and all remaining have submitted, advance to voting immediately
      if (room.gamePhase === 'clue_submission' && room.players.every((p) => p.hasSubmittedClue)) {
        room.gamePhase = 'voting';
        if (room.pendingClueForged && room.pendingClueForged.targetPlayerId && room.pendingClueForged.newClue) {
          const target = (room.players || []).find((p) => p.id === room.pendingClueForged!.targetPlayerId);
          if (target) {
            target.originalClue = target.originalClue || target.clue || '';
            target.clue = room.pendingClueForged.newClue;
          }
        }
      }
    }
  }
}

// In-memory room store
const rooms = new Map<string, ServerRoom>();
const roomSubscriptions = new Map<string, Set<WebSocket>>();
// Reconnection grace timers (60s): key = `${roomId}:${playerId}`
const disconnectTimers = new Map<string, NodeJS.Timeout>();

function clearDisconnectTimer(roomId: string, playerId: string) {
  const timerKey = `${roomId}:${playerId}`;
  if (disconnectTimers.has(timerKey)) {
    clearTimeout(disconnectTimers.get(timerKey)!);
    disconnectTimers.delete(timerKey);
  }
}

function removePlayerFromRoom(roomId: string, playerId: string): ServerRoom | null {
  clearDisconnectTimer(roomId, playerId);
  const room = rooms.get(roomId);
  if (!room || !playerId) return room || null;

  const wasPresent = room.players.some((p) => p.id === playerId);
  if (!wasPresent) return room;

  room.players = room.players.filter((p) => p.id !== playerId);
  room.lastActive = Date.now();
  if (room.players.length === 0) {
    rooms.delete(roomId);
    return null;
  }

  cleanupRoomAfterPlayerRemoval(room, playerId);
  broadcastToRoom(roomId, {
    type: 'PLAYER_LEFT',
    playerId,
    hostId: room.hostId,
    room,
  });
  broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room });
  return room;
}

interface ServerRoom {
  id: string;
  password?: string;
  hostId: string;
  gameMode: 'solo' | 'pass_and_play' | 'room';
  gamePhase: 'home' | 'lobby' | 'clue_submission' | 'voting' | 'fox_guess' | 'round_resolution' | 'shop';
  roundNumber: number;
  players: ServerPlayer[];
  selectedCategoryId: string;
  category?: any;
  secretCoordinate?: any;
  foxPlayerId?: string;
  roundResolution?: any;
  voteRound?: number;
  suddenDeath?: boolean;
  settings: ServerGameSettings;
  pendingClueForged?: { targetPlayerId: string; newClue: string } | null;
  forgedTargetPlayerId?: string | null;
  createdAt: number;
  lastActive: number;
}

// WebSocket client registry: ws -> { roomId, playerId }
interface ClientMeta {
  roomId?: string;
  playerId?: string;
  isAlive: boolean;
}
const clients = new Map<WebSocket, ClientMeta>();

// Safe WebSocket Broadcasting: protect against disconnected or corrupted sockets
function broadcastToRoom(roomId: string, message: any, excludeWs?: WebSocket) {
  if (!roomId) return;
  const clientsInRoom = roomSubscriptions.get(roomId);
  let payload: string;
  try {
    payload = JSON.stringify(message);
  } catch (err) {
    console.error('Error stringifying message for room broadcast:', err);
    return;
  }

  if (clientsInRoom && clientsInRoom.size > 0) {
    for (const client of clientsInRoom) {
      if (client !== excludeWs && client.readyState === 1 /* WebSocket.OPEN */) {
        try {
          client.send(payload);
        } catch (err) {
          console.error('Error sending message to client in room:', err);
        }
      }
    }
  } else {
    // Fallback iteration over registered clients
    for (const [ws, meta] of clients.entries()) {
      if (meta.roomId === roomId && ws !== excludeWs && ws.readyState === 1 /* WebSocket.OPEN */) {
        try {
          ws.send(payload);
        } catch (err) {
          console.error('Error sending message to client:', err);
        }
      }
    }
  }
}

// REST Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', activeRooms: rooms.size, timestamp: Date.now() });
});

// Create or initialize a room
app.post('/api/rooms/create', (req, res) => {
  const { roomId, hostPlayer, settings, gameMode, selectedCategoryId } = req.body;
  if (!roomId || !hostPlayer) {
    return res.status(400).json({ error: 'Missing roomId or hostPlayer' });
  }

  const defaultSettings: ServerGameSettings = {
    pointForGuessingFox: true,
    foxSeeOneClueEarly: false,
    anonymousVoting: false,
    turnTimer: true,
    turnTimerSeconds: 60,
    privateGame: false,
    infiltratorCount: 1,
    targetScore: 5,
    innocentCatchPoints: 2,
    infiltratorEscapePoints: 2,
    infiltratorStealPoints: 1,
    chameleonCount: 1,
    chameleonEscapePoints: 2,
    chameleonStealPoints: 1,
    ...settings,
  };

  const newRoom: ServerRoom = {
    id: roomId,
    password: settings?.roomPassword || '',
    hostId: hostPlayer.id,
    gameMode: gameMode || 'room',
    gamePhase: 'lobby',
    roundNumber: 1,
    voteRound: 1,
    suddenDeath: false,
    // In room multiplayer, ONLY the host starts in the room! No unsolicited bots.
    players: [
      {
        ...hostPlayer,
        isHost: true,
        isHuman: true,
        score: hostPlayer.score || 0,
        clue: '',
        hasSubmittedClue: false,
        votedForId: null,
        isReady: false,
      },
    ],
    selectedCategoryId: selectedCategoryId || 'sports',
    settings: defaultSettings,
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  rooms.set(roomId, newRoom);
  res.json({ success: true, room: newRoom });
});

// Join an existing room
app.post('/api/rooms/:roomId/join', (req, res) => {
  const { roomId } = req.params;
  const { player, password } = req.body;

  let room = rooms.get(roomId);

  // If room doesn't exist yet on server (e.g. created by link or code), auto-create or restore
  if (!room) {
    const defaultSettings: ServerGameSettings = {
      pointForGuessingFox: true,
      foxSeeOneClueEarly: false,
      anonymousVoting: false,
      turnTimer: true,
      turnTimerSeconds: 60,
      privateGame: false,
      infiltratorCount: 1,
      chameleonCount: 1,
      targetScore: 5,
      innocentCatchPoints: 2,
      infiltratorEscapePoints: 2,
      chameleonEscapePoints: 2,
      infiltratorStealPoints: 1,
      chameleonStealPoints: 1,
      itemsEnabled: true,
      roomPassword: password || '',
    };

    room = {
      id: roomId,
      password: password || '',
      hostId: player?.id || 'host',
      gameMode: 'room',
      gamePhase: 'lobby',
      roundNumber: 1,
      voteRound: 1,
      suddenDeath: false,
      players: player
        ? [
            {
              ...player,
              isHost: true,
              isHuman: true,
              score: 0,
              gold: 0,
              inventory: {},
              clue: '',
              hasSubmittedClue: false,
              votedForId: null,
              isReady: false,
              isReadyToLeaveShop: false,
            },
          ]
        : [],
      selectedCategoryId: 'sports',
      settings: defaultSettings,
      createdAt: Date.now(),
      lastActive: Date.now(),
    };
    rooms.set(roomId, room);
    return res.json({ success: true, room, joinedPlayer: player });
  }

  // Check password if room has password and not joining with matching password
  if (room.password && room.password.trim() !== '') {
    if (!password || password.trim() !== room.password.trim()) {
      return res.status(401).json({ error: 'Incorrect room password', requiresPassword: true });
    }
  }

  // Add player if not already present
  if (player) {
    if (!Array.isArray(room.players)) room.players = [];
    const existingIndex = room.players.findIndex((p) => p.id === player.id);
    if (existingIndex >= 0) {
      clearDisconnectTimer(roomId, player.id);
      const existing = room.players[existingIndex];
      const validName = player.name && player.name.trim().length > 0 ? player.name.trim() : (existing.name && existing.name.trim().length > 0 ? existing.name.trim() : `Player ${existingIndex + 1}`);
      // Update existing player details and clear disconnected status
      room.players[existingIndex] = {
        ...existing,
        name: validName,
        avatar: player.avatar || existing.avatar,
        isDisconnected: false,
        disconnectedAt: undefined,
        sessionToken: player.sessionToken || existing.sessionToken,
      };
    } else {
      // New joining player
      const validName = player.name && player.name.trim().length > 0 ? player.name.trim() : `Player ${room.players.length + 1}`;
      room.players.push({
        id: player.id,
        name: validName,
        avatar: player.avatar || '🦊',
        isHuman: true,
        isHost: false,
        score: 0,
        gold: 0,
        inventory: {},
        role: 'innocent',
        clue: '',
        hasSubmittedClue: false,
        votedForId: null,
        isReady: false,
        isReadyToLeaveShop: false,
        isDisconnected: false,
        sessionToken: player.sessionToken,
      });
    }
  }

  room.lastActive = Date.now();
  // Notify other players in the room
  broadcastToRoom(roomId, {
    type: 'ROOM_STATE_SYNC',
    room,
  });

  res.json({ success: true, room });
});

// Reconnect session via REST
app.post('/api/rooms/:roomId/reconnect', (req, res) => {
  const { roomId } = req.params;
  const { playerId, sessionToken } = req.body;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const player = (room.players || []).find((p) => p.id === playerId);
  if (!player) {
    return res.status(404).json({ error: 'Player not found in room' });
  }

  clearDisconnectTimer(roomId, playerId);
  player.isDisconnected = false;
  delete player.disconnectedAt;
  if (sessionToken && !player.sessionToken) {
    player.sessionToken = sessionToken;
  }
  room.lastActive = Date.now();

  broadcastToRoom(roomId, { type: 'PLAYER_RECONNECTED', playerId, room });
  broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room });

  res.json({ success: true, room, player });
});

// Fetch current room state
app.get('/api/rooms/:roomId', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  room.lastActive = Date.now();
  res.json({ success: true, room });
});

// Update room state (sync from host or player action)
app.post('/api/rooms/:roomId/sync', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const { updates } = req.body;
  if (updates) {
    if (Array.isArray(updates.players)) {
      updates.players = updates.players.map((p: any, idx: number) => {
        const existing = (room.players || []).find((oldP) => oldP.id === p.id);
        const validName = p.name && p.name.trim().length > 0 ? p.name.trim() : (existing?.name && existing.name.trim().length > 0 ? existing.name.trim() : `Player ${idx + 1}`);
        return {
          ...(existing || {}),
          ...p,
          name: validName,
        };
      });
    }

    // Reset single-round buffs and potion locks on new round
    if (updates.gamePhase === 'clue_submission' && room.gamePhase !== 'clue_submission') {
      room.pendingClueForged = undefined;
      room.forgedTargetPlayerId = undefined;
      if (Array.isArray(updates.players)) {
        updates.players = updates.players.map((p: any) => ({
          ...p,
          hasShield: false,
          shieldActive: false,
          hasUsedPotionThisTurn: false,
          scrambled: false,
          oracleRevealedRow: undefined,
          oracleRevealedCol: undefined,
          inkApplied: false,
          originalClue: undefined,
          forgedBy: undefined,
        }));
      }
    }

    // Apply pending clue forgery when entering voting
    if (updates.gamePhase === 'voting') {
      const pending = (updates as any).pendingClueForged || room.pendingClueForged;
      if (pending && pending.targetPlayerId && pending.newClue) {
        const targetList = Array.isArray(updates.players) ? updates.players : room.players;
        const target = (targetList || []).find((p: any) => p.id === pending.targetPlayerId);
        if (target) {
          target.originalClue = target.originalClue || target.clue || '';
          target.clue = String(pending.newClue).trim().slice(0, 30);
        }
      }
    }

    Object.assign(room, updates);
    room.lastActive = Date.now();
    broadcastToRoom(roomId, {
      type: 'ROOM_STATE_SYNC',
      room,
    });
  }

  res.json({ success: true, room });
});

// Update room settings (infiltrator count, times, points, etc.)
app.post('/api/rooms/:roomId/settings', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  const { settings } = req.body;
  if (settings) {
    room.settings = {
      ...room.settings,
      ...settings,
    };
    if (settings.roomPassword !== undefined) {
      room.password = settings.roomPassword;
    }
    room.lastActive = Date.now();
    broadcastToRoom(roomId, {
      type: 'ROOM_SETTINGS_UPDATED',
      settings: room.settings,
      room,
    });
  }

  res.json({ success: true, settings: room.settings, room });
});

// Add AI Bot to room
app.post('/api/rooms/:roomId/bot', (req, res) => {
  const { roomId } = req.params;
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const { bot } = req.body;
  if (bot) {
    room.players.push(bot);
    room.lastActive = Date.now();
    broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room });
  }
  res.json({ success: true, room });
});

// Remove or kick player from room (Only host can kick others)
app.delete('/api/rooms/:roomId/players/:playerId', (req, res) => {
  const { roomId, playerId } = req.params;
  const isKick = req.query.kick === 'true' || req.body?.isKick;
  const requesterId = (req.query.requesterId as string) || req.body?.requesterId || (req.headers['x-player-id'] as string);
  const room = rooms.get(roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });

  // Security: Only the host may kick other players
  if (isKick && requesterId && room.hostId && requesterId !== room.hostId && requesterId !== playerId) {
    return res.status(403).json({ error: 'Only the host can kick players from the room' });
  }

  room.players = room.players.filter((p) => p.id !== playerId);
  room.lastActive = Date.now();

  // Clear room association from matching websockets
  for (const [ws, meta] of clients.entries()) {
    if (meta.roomId === roomId && meta.playerId === playerId) {
      meta.roomId = undefined;
      meta.playerId = undefined;
    }
  }

  if (room.players.length === 0) {
    rooms.delete(roomId);
    return res.json({ success: true, message: 'Room closed since all players left' });
  }

  cleanupRoomAfterPlayerRemoval(room, playerId);

  if (isKick) {
    broadcastToRoom(roomId, { type: 'PLAYER_KICKED', kickedPlayerId: playerId, room });
  } else {
    broadcastToRoom(roomId, { type: 'PLAYER_LEFT', playerId, hostId: room.hostId, room });
    broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room });
  }
  res.json({ success: true, room });
});

// Leave room endpoint (called on tab close via sendBeacon or fetch)
app.post('/api/rooms/:roomId/leave', (req, res) => {
  const { roomId } = req.params;
  let playerId = req.body?.playerId;
  if (!playerId && typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body);
      playerId = parsed.playerId;
    } catch {
      // ignore
    }
  }
  if (roomId && playerId) {
    clearDisconnectTimer(roomId, playerId);
    removePlayerFromRoom(roomId, playerId);
  }
  res.json({ success: true });
});

// Kick off HTTP server & WebSockets
async function startServer() {
  const server = http.createServer(app);

  // Setup WebSocket Server
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws: WebSocket, req) => {
    // Parse query params if available
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const queryRoomId = url.searchParams.get('roomId');
    const queryPlayerId = url.searchParams.get('playerId');

    const meta: ClientMeta = {
      roomId: queryRoomId || undefined,
      playerId: queryPlayerId || undefined,
      isAlive: true,
    };
    clients.set(ws, meta);

    // Heartbeat pong listener
    ws.on('pong', () => {
      const m = clients.get(ws);
      if (m) m.isAlive = true;
    });

    ws.on('message', (rawData) => {
      try {
        const data = JSON.parse(rawData.toString());
        if (!data || !data.type) return;
        if (meta.roomId) {
          const activeRoom = rooms.get(meta.roomId);
          if (activeRoom) activeRoom.lastActive = Date.now();
        }

        if (data.type === 'PING') {
          if (meta.roomId) {
            const r = rooms.get(meta.roomId);
            if (r) r.lastActive = Date.now();
          }
          ws.send(JSON.stringify({ type: 'PONG' }));
          return;
        }

        if (data.type === 'JOIN_ROOM') {
          const { roomId, player, password } = data;
          if (!roomId) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Missing roomId' }));
            } catch {}
            return;
          }
          meta.roomId = roomId;
          meta.playerId = player?.id;

          if (!roomSubscriptions.has(roomId)) {
            roomSubscriptions.set(roomId, new Set());
          }
          roomSubscriptions.get(roomId)!.add(ws);

          let room = rooms.get(roomId);
          if (!room) {
            // Create room on the fly
            const initialName = player?.name && player.name.trim().length > 0 ? player.name.trim() : 'Player 1';
            room = {
              id: roomId,
              password: password || '',
              hostId: player?.id || 'host',
              gameMode: 'room',
              gamePhase: 'lobby',
              roundNumber: 1,
              voteRound: 1,
              suddenDeath: false,
              players: player ? [{ ...player, name: initialName, isHost: true }] : [],
              selectedCategoryId: 'sports',
              settings: {
                pointForGuessingFox: true,
                foxSeeOneClueEarly: false,
                anonymousVoting: false,
                turnTimer: true,
                turnTimerSeconds: 60,
                privateGame: false,
                infiltratorCount: 1,
                chameleonCount: 1,
                targetScore: 5,
                innocentCatchPoints: 2,
                infiltratorEscapePoints: 2,
                chameleonEscapePoints: 2,
                infiltratorStealPoints: 1,
                chameleonStealPoints: 1,
                roomPassword: password || '',
              },
              createdAt: Date.now(),
              lastActive: Date.now(),
            };
            rooms.set(roomId, room);
          } else if (player) {
            if (!Array.isArray(room.players)) room.players = [];
            const existing = room.players.find((p) => p.id === player.id);
            if (existing) {
              clearDisconnectTimer(roomId, player.id);
              existing.isDisconnected = false;
              delete existing.disconnectedAt;
              if (player.name && player.name.trim().length > 0) existing.name = player.name.trim();
              if (player.avatar) existing.avatar = player.avatar;
              if (player.sessionToken) existing.sessionToken = player.sessionToken;
            } else {
              const validName = player.name && player.name.trim().length > 0 ? player.name.trim() : `Player ${room.players.length + 1}`;
              room.players.push({
                ...player,
                name: validName,
                isHost: room.players.length === 0,
                isHuman: true,
                score: 0,
                clue: '',
                hasSubmittedClue: false,
                votedForId: null,
                isReady: false,
                isDisconnected: false,
              });
            }
          }
          if (!Array.isArray(room.players)) room.players = [];
          room.lastActive = Date.now();

          // Send current state back to joining client
          ws.send(JSON.stringify({ type: 'ROOM_STATE_SYNC', room }));
          // Broadcast to all other peers in room
          broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room }, ws);
        } else if (data.type === 'RECONNECT_SESSION') {
          const { roomId, playerId, sessionToken } = data;
          if (!roomId) {
            try {
              ws.send(JSON.stringify({ type: 'SESSION_RECONNECT_FAILED', reason: 'Missing roomId' }));
            } catch {}
            return;
          }
          meta.roomId = roomId;
          meta.playerId = playerId;

          if (!roomSubscriptions.has(roomId)) {
            roomSubscriptions.set(roomId, new Set());
          }
          roomSubscriptions.get(roomId)!.add(ws);

          const room = rooms.get(roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'SESSION_RECONNECT_FAILED', reason: 'Room not found' }));
            return;
          }
          if (!Array.isArray(room.players)) {
            room.players = [];
          }

          const player = (room.players || []).find((p) => p.id === playerId);
          if (!player) {
            ws.send(JSON.stringify({ type: 'SESSION_RECONNECT_FAILED', reason: 'Player not found in room' }));
            return;
          }

          clearDisconnectTimer(roomId, playerId);
          player.isDisconnected = false;
          delete player.disconnectedAt;
          if (sessionToken && !player.sessionToken) {
            player.sessionToken = sessionToken;
          }
          room.lastActive = Date.now();

          // Confirm reconnect to player and sync state
          ws.send(JSON.stringify({ type: 'SESSION_RECONNECTED', playerId, room }));
          ws.send(JSON.stringify({ type: 'ROOM_STATE_SYNC', room }));

          // Notify all other clients in room
          broadcastToRoom(roomId, { type: 'PLAYER_RECONNECTED', playerId, room }, ws);
          broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room }, ws);
        } else if (data.type === 'STATE_SYNC' || data.type === 'SYNC_STATE') {
          const { roomId, updates } = data;
          if (!roomId) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Missing roomId' }));
            } catch {}
            return;
          }
          const room = rooms.get(roomId);
          if (!room) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
            } catch {}
            return;
          }
          if (!Array.isArray(room.players)) {
            room.players = [];
          }

          if (updates) {
            if (Array.isArray(updates.players)) {
              updates.players = updates.players.map((p: any, idx: number) => {
                const existing = (room.players || []).find((oldP) => oldP.id === p.id);
                const validName = p.name && p.name.trim().length > 0 ? p.name.trim() : (existing?.name && existing.name.trim().length > 0 ? existing.name.trim() : `Player ${idx + 1}`);
                return {
                  ...(existing || {}),
                  ...p,
                  name: validName,
                };
              });
            }

            // Reset single-round buffs and potion locks on new round
            if (updates.gamePhase === 'clue_submission' && room.gamePhase !== 'clue_submission') {
              room.pendingClueForged = undefined;
              room.forgedTargetPlayerId = undefined;
              if (Array.isArray(updates.players)) {
                updates.players = updates.players.map((p: any) => ({
                  ...p,
                  hasShield: false,
                  shieldActive: false,
                  hasUsedPotionThisTurn: false,
                  scrambled: false,
                  oracleRevealedRow: undefined,
                  oracleRevealedCol: undefined,
                  inkApplied: false,
                  originalClue: undefined,
                  forgedBy: undefined,
                }));
              }
            }

            // Apply pending clue forgery when entering voting
            if (updates.gamePhase === 'voting') {
              const pending = (updates as any).pendingClueForged || room.pendingClueForged;
              if (pending && pending.targetPlayerId && pending.newClue) {
                const targetList = Array.isArray(updates.players) ? updates.players : room.players;
                const target = (targetList || []).find((p: any) => p.id === pending.targetPlayerId);
                if (target) {
                  target.originalClue = target.originalClue || target.clue || '';
                  target.clue = String(pending.newClue).trim().slice(0, 30);
                }
              }
            }

            Object.assign(room, updates);
            if (!Array.isArray(room.players)) room.players = [];
            room.lastActive = Date.now();
            broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room });
          }
        } else if (data.type === 'USE_POTION') {
          const { roomId, playerId, potionId, targetPlayerId, newClue, category, secretCoordinate } = data;
          if (!roomId) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Missing roomId' }));
            } catch {}
            return;
          }
          const room = rooms.get(roomId);
          if (!room) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
            } catch {}
            return;
          }
          if (!Array.isArray(room.players)) {
            room.players = [];
          }

          const sender = room.players.find((p) => p.id === playerId);
          if (sender) {
            sender.hasUsedPotionThisTurn = true;
            if (sender.inventory && sender.inventory[potionId]) {
              sender.inventory[potionId] = Math.max(0, sender.inventory[potionId] - 1);
            }
          }

          if (potionId === 'ink_of_deceit' && targetPlayerId && newClue) {
            const sanitizedForged = String(newClue).trim().slice(0, 30);
            const target = room.players.find((p) => p.id === targetPlayerId);
            if (target) {
              target.originalClue = target.originalClue || target.clue || '';
              target.forgedBy = playerId;
              // If voting has already started, apply immediately, otherwise keep original clue during clue submission
              if (room.gamePhase === 'voting' || room.gamePhase === 'round_resolution') {
                target.clue = sanitizedForged;
              }
            }
            room.pendingClueForged = {
              targetPlayerId,
              newClue: sanitizedForged,
            };
            room.forgedTargetPlayerId = targetPlayerId;
          } else if (potionId === 'grid_scrambler') {
            if (category) {
              room.category = category;
            }
            if (secretCoordinate) {
              room.secretCoordinate = secretCoordinate;
            }
          } else if (potionId === 'vote_shield') {
            if (sender) {
              sender.hasShield = true;
            }
          }

          room.lastActive = Date.now();
          broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room });
        } else if (data.type === 'UPDATE_SETTINGS' || data.type === 'SETTINGS_UPDATE') {
          const { roomId, settings } = data;
          if (!roomId) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Missing roomId' }));
            } catch {}
            return;
          }
          const room = rooms.get(roomId);
          if (!room) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
            } catch {}
            return;
          }
          if (!Array.isArray(room.players)) {
            room.players = [];
          }
          if (settings) {
            room.settings = { ...room.settings, ...settings };
            room.lastActive = Date.now();
            broadcastToRoom(roomId, { type: 'ROOM_SETTINGS_UPDATED', settings: room.settings, room });
          }
        } else if (data.type === 'EMOJI_REACTION') {
          const { roomId, playerId, emoji } = data;
          const allowedEmojis = new Set(['🤨', '🚨', '🦎', '💀', '👏']);
          if (roomId === meta.roomId && playerId === meta.playerId && allowedEmojis.has(emoji)) {
            const room = rooms.get(roomId);
            const sender = room?.players?.find((p) => p.id === playerId);
            if (room && sender) {
              room.lastActive = Date.now();
              broadcastToRoom(roomId, {
                type: 'EMOJI_REACTION',
                reaction: {
                  id: `reaction-${Date.now()}-${playerId}`,
                  playerId,
                  playerName: sender.name,
                  playerAvatar: sender.avatar,
                  emoji,
                  timestamp: Date.now(),
                },
              });
            }
          }
        } else if (data.type === 'LEAVE_ROOM') {
          const { roomId, playerId } = data;
          meta.roomId = undefined;
          meta.playerId = undefined;
          if (!roomId) return;
          clearDisconnectTimer(roomId, playerId);
          const room = rooms.get(roomId);
          if (!room) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
            } catch {}
            return;
          }
          if (!Array.isArray(room.players)) {
            room.players = [];
          }
          if (playerId) {
            removePlayerFromRoom(roomId, playerId);
          }
        } else if (data.type === 'KICK_PLAYER') {
          const { roomId, playerId } = data;
          if (!roomId) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Missing roomId' }));
            } catch {}
            return;
          }
          const room = rooms.get(roomId);
          if (!room) {
            try {
              ws.send(JSON.stringify({ type: 'ERROR', message: 'Room not found' }));
            } catch {}
            return;
          }
          if (!Array.isArray(room.players)) {
            room.players = [];
          }
          if (playerId) {
            clearDisconnectTimer(roomId, playerId);
            room.players = room.players.filter((p) => p.id !== playerId);
            room.lastActive = Date.now();
            if (room.players.length === 0) {
              rooms.delete(roomId);
            } else {
              cleanupRoomAfterPlayerRemoval(room, playerId);
              broadcastToRoom(roomId, { type: 'PLAYER_KICKED', kickedPlayerId: playerId, room });
            }
          }
        }
      } catch (err) {
        console.error('WebSocket message parsing error:', err);
      }
    });

    ws.on('close', () => {
      const closedMeta = clients.get(ws);
      clients.delete(ws);
      if (closedMeta?.roomId && roomSubscriptions.has(closedMeta.roomId)) {
        roomSubscriptions.get(closedMeta.roomId)!.delete(ws);
      }
      if (!closedMeta?.roomId || !closedMeta.playerId) return;

      const { roomId, playerId } = closedMeta;

      // A reconnecting tab may already have a newer socket. Do not disconnect
      // if there is an active replacement connection for this player.
      const hasReplacement = [...clients.values()].some(
        (other) => other.roomId === roomId && other.playerId === playerId
      );
      if (hasReplacement) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const player = (room.players || []).find((p) => p.id === playerId);
      if (!player) return;

      // Mark player as disconnected with timestamp
      player.isDisconnected = true;
      player.disconnectedAt = Date.now();
      room.lastActive = Date.now();

      // Broadcast disconnect status immediately to peers
      broadcastToRoom(roomId, {
        type: 'PLAYER_DISCONNECTED',
        playerId,
        disconnectedAt: player.disconnectedAt,
        room,
      });
      broadcastToRoom(roomId, { type: 'ROOM_STATE_SYNC', room });

      // Short 2-second grace period for rapid page reloads; if tab was closed, remove permanently.
      clearDisconnectTimer(roomId, playerId);
      const timerKey = `${roomId}:${playerId}`;
      const timer = setTimeout(() => {
        disconnectTimers.delete(timerKey);
        const currentRoom = rooms.get(roomId);
        if (!currentRoom) return;
        const targetPlayer = currentRoom.players.find((p) => p.id === playerId);
        if (targetPlayer && targetPlayer.isDisconnected) {
          console.log(`Player ${playerId} disconnected (tab closed) in room ${roomId}. Removing immediately.`);
          removePlayerFromRoom(roomId, playerId);
        }
      }, 2000);

      disconnectTimers.set(timerKey, timer);
    });
  });

  // Keep-alive ping interval every 25s
  const pingInterval = setInterval(() => {
    for (const [ws, meta] of clients.entries()) {
      if (!meta.isAlive) {
        ws.terminate();
        continue;
      }
      meta.isAlive = false;
      ws.ping();
    }
  }, 25000);

  const ROOM_TIMEOUT_MS = 30 * 60 * 1000;
  const roomCleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
      if (now - (room.lastActive || room.createdAt) > ROOM_TIMEOUT_MS) {
        console.log(`Purging inactive room: ${roomId}`);
        roomSubscriptions.delete(roomId);
        rooms.delete(roomId);
      }
    }
  }, 5 * 60 * 1000);

  server.on('close', () => {
    clearInterval(pingInterval);
    clearInterval(roomCleanupInterval);
  });

  // Vite middleware in dev mode, static serving in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares as any);
  } else {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath) as any);
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`The Infiltrator Realtime Game Server running on port ${PORT}`);
  });
}

startServer();
