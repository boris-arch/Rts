import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

type Team = 'BLUE' | 'RED';

interface PlayerConn {
  id: string;
  name: string;
  ws: WebSocket;
  roomId: string | null;
  team: Team | null;
  ready: boolean;
}

interface GameRoom {
  id: string;
  isPublic: boolean;
  hostName: string;
  createdAt: number;
  status: 'WAITING' | 'PLAYING' | 'FINISHED';
  blue: PlayerConn | null;
  red: PlayerConn | null;
}

const players = new Map<WebSocket, PlayerConn>();
const rooms = new Map<string, GameRoom>();
const matchmakingQueue: PlayerConn[] = [];

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastLobbyList() {
  const openRooms = Array.from(rooms.values())
    .filter((r) => r.status === 'WAITING' && (!r.blue || !r.red))
    .map((r) => ({
      id: r.id,
      hostName: r.hostName,
      isPublic: r.isPublic,
      createdAt: r.createdAt,
    }));

  const msg = JSON.stringify({
    type: 'lobby:list',
    rooms: openRooms,
    onlineCount: players.size,
    queueCount: matchmakingQueue.length,
  });

  for (const [ws] of players) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  }
}

function removeFromQueue(player: PlayerConn) {
  const idx = matchmakingQueue.indexOf(player);
  if (idx !== -1) {
    matchmakingQueue.splice(idx, 1);
  }
}

function leaveCurrentRoom(player: PlayerConn) {
  removeFromQueue(player);
  if (!player.roomId) return;
  const room = rooms.get(player.roomId);
  player.roomId = null;
  player.team = null;
  player.ready = false;

  if (!room) return;

  if (room.blue?.id === player.id) room.blue = null;
  if (room.red?.id === player.id) room.red = null;

  const remaining = room.blue || room.red;
  if (!remaining) {
    rooms.delete(room.id);
  } else {
    room.status = 'WAITING';
    // Promote remaining player to BLUE host if needed
    if (!room.blue && room.red) {
      room.blue = room.red;
      room.red = null;
      room.blue.team = 'BLUE';
      room.hostName = room.blue.name;
    }
    sendJson(remaining.ws, {
      type: 'room:opponent_left',
      roomId: room.id,
      yourTeam: remaining.team,
    });
  }
  broadcastLobbyList();
}

function startRoomMatch(room: GameRoom) {
  if (!room.blue || !room.red) return;
  room.status = 'PLAYING';

  const payloadBase = {
    type: 'match:start',
    roomId: room.id,
    blueName: room.blue.name,
    redName: room.red.name,
    timestamp: Date.now(),
  };

  sendJson(room.blue.ws, { ...payloadBase, yourTeam: 'BLUE' });
  sendJson(room.red.ws, { ...payloadBase, yourTeam: 'RED' });
  broadcastLobbyList();
}

async function startServer() {
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      onlinePlayers: players.size,
      activeRooms: rooms.size,
    });
  });

  // Gemini AI Bot Commander Tactical Brain Endpoint
  app.post('/api/ai-commander/decide', async (req, res) => {
    try {
      const state = req.body || {};
      const prompt = `You are the Red Warlord AI Commander in a real-time 1v1 Action-RTS ("Siege & Destroy: Commander's Blood").
Analyze this live battlefield state and choose your immediate tactical directive:
${JSON.stringify(state)}

Unit costs & counter-play:
- VANGUARD (30g, 3x fast melee infantry, counters Marksmen, weak to AoE)
- MARKSMAN (45g, 2x long-range high DPS, melts Brutes and enemy Commander)
- BRUTE (70g, 1x shield tank, blocks 35% projectile dmg, anchors frontline)
- SIEGE (120g, 1x base-breaker ram, ignores units, massive Citadel damage; save for 120g if you have frontline protection)
- HOLD_GOLD (save gold for a higher-tier unit like BRUTE or SIEGE)

Posture rules:
- HUNT_EXECUTE: Choose if blueHp / blueMaxHp <= 0.22 to land the execution blow and trigger a 10s Berserk Frenzy.
- CONTEST_ALTAR: Choose if altarActive is true so you capture the center Soul Altar for an Elder Soul Golem.
- KITE_RETREAT: Choose if redHp / redMaxHp < 0.28 and redBerserkActive is false.
- DUEL_PLAYER: Choose to aggressively pressure the Blue Commander in mid-lane.
- SIEGE_PUSH: Choose to escort your army directly into the Blue Citadel.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          systemInstruction:
            'You are an elite, ruthless dark-fantasy Warlord AI Commander. Respond strictly in JSON matching the schema. Keep battleCry under 45 characters and reasoning under 60 characters.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          temperature: 0.7,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              posture: {
                type: Type.STRING,
                description:
                  'One of: HUNT_EXECUTE, CONTEST_ALTAR, DUEL_PLAYER, SIEGE_PUSH, KITE_RETREAT',
              },
              spawnUnit: {
                type: Type.STRING,
                description:
                  'One of: VANGUARD, MARKSMAN, BRUTE, SIEGE, HOLD_GOLD',
              },
              skillPriority: {
                type: Type.STRING,
                description:
                  'One of: WARBREAKER, RALLY_BANNER, DASH_ENGAGE, DASH_ESCAPE, NONE',
              },
              battleCry: {
                type: Type.STRING,
                description:
                  'Short in-character warlord taunt or battle cry (max 45 chars)',
              },
              reasoning: {
                type: Type.STRING,
                description:
                  'Concise tactical rationale for this decision (max 60 chars)',
              },
            },
            required: [
              'posture',
              'spawnUnit',
              'skillPriority',
              'battleCry',
              'reasoning',
            ],
          },
        },
      });

      const rawText = response.text?.trim() || '{}';
      const decision = JSON.parse(rawText);
      res.json({ ok: true, decision });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Gemini AI tactical call failed';
      res.status(500).json({ ok: false, error: message });
    }
  });

  // WebSocket Server mounted selectively on /ws (noServer mode prevents aborting Vite HMR upgrades)
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const pathname = req.url?.split('?')[0];
    if (pathname === '/ws') {
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    }
  });

  wss.on('connection', (ws) => {
    const player: PlayerConn = {
      id: Math.random().toString(36).substring(2, 10),
      name: `Commander-${Math.floor(100 + Math.random() * 900)}`,
      ws,
      roomId: null,
      team: null,
      ready: false,
    };
    players.set(ws, player);

    sendJson(ws, {
      type: 'connected',
      playerId: player.id,
      defaultName: player.name,
    });
    broadcastLobbyList();

    ws.on('message', (raw) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw.toString());
      } catch {
        return;
      }

      const type = data.type as string;

      if (type === 'ping') {
        sendJson(ws, { type: 'pong', clientTime: data.clientTime });
        return;
      }

      if (type === 'player:set_name') {
        const clean = String(data.name || '').trim().slice(0, 18);
        if (clean) player.name = clean;
        broadcastLobbyList();
        return;
      }

      // Quick Matchmaking Queue
      if (type === 'queue:join') {
        leaveCurrentRoom(player);
        if (typeof data.name === 'string' && data.name.trim()) {
          player.name = data.name.trim().slice(0, 18);
        }

        // First check if there is already an open public room waiting
        const openPublicRoom = Array.from(rooms.values()).find(
          (r) => r.isPublic && r.status === 'WAITING' && r.blue && !r.red && r.blue.id !== player.id
        );

        if (openPublicRoom) {
          openPublicRoom.red = player;
          player.roomId = openPublicRoom.id;
          player.team = 'RED';
          startRoomMatch(openPublicRoom);
          return;
        }

        if (!matchmakingQueue.includes(player)) {
          matchmakingQueue.push(player);
        }

        if (matchmakingQueue.length >= 2) {
          const p1 = matchmakingQueue.shift()!;
          const p2 = matchmakingQueue.shift()!;
          const roomId = generateRoomCode();
          const room: GameRoom = {
            id: roomId,
            isPublic: true,
            hostName: p1.name,
            createdAt: Date.now(),
            status: 'PLAYING',
            blue: p1,
            red: p2,
          };
          p1.roomId = roomId;
          p1.team = 'BLUE';
          p2.roomId = roomId;
          p2.team = 'RED';
          rooms.set(roomId, room);
          startRoomMatch(room);
        } else {
          sendJson(ws, { type: 'queue:waiting' });
          broadcastLobbyList();
        }
        return;
      }

      if (type === 'queue:leave') {
        removeFromQueue(player);
        sendJson(ws, { type: 'queue:left' });
        broadcastLobbyList();
        return;
      }

      // Create Room
      if (type === 'room:create') {
        leaveCurrentRoom(player);
        if (typeof data.name === 'string' && data.name.trim()) {
          player.name = data.name.trim().slice(0, 18);
        }
        const roomId = generateRoomCode();
        const isPublic = data.isPublic !== false;
        const room: GameRoom = {
          id: roomId,
          isPublic,
          hostName: player.name,
          createdAt: Date.now(),
          status: 'WAITING',
          blue: player,
          red: null,
        };
        player.roomId = roomId;
        player.team = 'BLUE';
        rooms.set(roomId, room);

        sendJson(ws, {
          type: 'room:created',
          roomId,
          yourTeam: 'BLUE',
          isPublic,
        });
        broadcastLobbyList();
        return;
      }

      // Join Room by Code
      if (type === 'room:join') {
        const targetCode = String(data.roomId || '')
          .trim()
          .toUpperCase();
        if (typeof data.name === 'string' && data.name.trim()) {
          player.name = data.name.trim().slice(0, 18);
        }

        const room = rooms.get(targetCode);
        if (!room) {
          sendJson(ws, {
            type: 'room:error',
            message: `Room "${targetCode}" not found.`,
          });
          return;
        }
        if (room.status !== 'WAITING' || (room.blue && room.red)) {
          sendJson(ws, {
            type: 'room:error',
            message: `Room "${targetCode}" is already full or in battle.`,
          });
          return;
        }

        leaveCurrentRoom(player);
        if (!room.blue) {
          room.blue = player;
          player.team = 'BLUE';
        } else {
          room.red = player;
          player.team = 'RED';
        }
        player.roomId = room.id;

        if (room.blue && room.red) {
          startRoomMatch(room);
        } else {
          sendJson(ws, {
            type: 'room:joined',
            roomId: room.id,
            yourTeam: player.team,
          });
        }
        broadcastLobbyList();
        return;
      }

      if (type === 'room:leave') {
        leaveCurrentRoom(player);
        return;
      }

      // Relay In-Game Real-Time Messages to Opponent in Same Room
      if (
        type === 'player:input' ||
        type === 'commander:action' ||
        type === 'squad:spawn' ||
        type === 'forge:upgrade' ||
        type === 'world:sync' ||
        type === 'match:over' ||
        type === 'rematch:request'
      ) {
        if (!player.roomId) return;
        const room = rooms.get(player.roomId);
        if (!room) return;

        const opponent =
          player.team === 'BLUE' ? room.red : room.blue;
        if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
          sendJson(opponent.ws, {
            ...data,
            senderTeam: player.team,
          });
        }

        // If both players request rematch or host triggers rematch
        if (type === 'rematch:request') {
          player.ready = true;
          if (room.blue?.ready && room.red?.ready) {
            room.blue.ready = false;
            room.red.ready = false;
            startRoomMatch(room);
          }
        }
      }
    });

    ws.on('close', () => {
      leaveCurrentRoom(player);
      players.delete(ws);
      broadcastLobbyList();
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Siege & Destroy Online 1v1 Server listening on port ${PORT}`);
  });
}

startServer();
