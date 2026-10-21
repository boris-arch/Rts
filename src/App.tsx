import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Swords,
  Shield,
  Zap,
  Flag,
  Volume2,
  VolumeX,
  Pause,
  Play,
  RotateCcw,
  Crown,
  Flame,
  Eye,
  Crosshair,
  Award,
  Sparkles,
  Users,
  Bot,
  Globe,
  Copy,
  Check,
  LogOut,
  Wifi,
} from 'lucide-react';
import { sfx } from './audio';

// ============================================================================
// TYPES & CONSTANTS
// ============================================================================

type Team = 'BLUE' | 'RED';
type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type MatchMode = 'ONLINE_1V1' | 'AI' | 'LOCAL_2P';
type UnitKind = 'VANGUARD' | 'MARKSMAN' | 'BRUTE' | 'SIEGE' | 'GOLEM';
type AIDifficulty = 'TACTICAL' | 'RUTHLESS';
type CameraMode = 'FOLLOW' | 'ARENA';

interface UnitTemplate {
  kind: UnitKind;
  name: string;
  shortName: string;
  hotkey: string;
  cost: number;
  count: number;
  hp: number;
  damage: number;
  range: number;
  speed: number;
  attackCooldown: number;
  radius: number;
  roleDesc: string;
  bounty: number;
  buildingMultiplier: number;
  ignoresUnits?: boolean;
  projectileSpeed?: number;
  shieldBlock?: number;
}

const UNIT_CATALOG: Record<Exclude<UnitKind, 'GOLEM'>, UnitTemplate> = {
  VANGUARD: {
    kind: 'VANGUARD',
    name: 'Vanguard Squad',
    shortName: 'Vanguard x3',
    hotkey: '1',
    cost: 30,
    count: 3,
    hp: 150,
    damage: 16,
    range: 34,
    speed: 96,
    attackCooldown: 0.78,
    radius: 13,
    roleDesc: '3x Fast Melee',
    bounty: 9,
    buildingMultiplier: 0.75,
  },
  MARKSMAN: {
    kind: 'MARKSMAN',
    name: 'Arcane Marksmen',
    shortName: 'Marksmen x2',
    hotkey: '2',
    cost: 45,
    count: 2,
    hp: 105,
    damage: 24,
    range: 195,
    speed: 82,
    attackCooldown: 0.95,
    radius: 12,
    roleDesc: '2x Ranged DPS',
    bounty: 14,
    buildingMultiplier: 0.65,
    projectileSpeed: 420,
  },
  BRUTE: {
    kind: 'BRUTE',
    name: 'Ironclad Brute',
    shortName: 'Iron Brute',
    hotkey: '3',
    cost: 70,
    count: 1,
    hp: 520,
    damage: 34,
    range: 42,
    speed: 68,
    attackCooldown: 1.15,
    radius: 20,
    roleDesc: '1x Shield Tank',
    bounty: 24,
    buildingMultiplier: 0.95,
    shieldBlock: 0.35,
  },
  SIEGE: {
    kind: 'SIEGE',
    name: 'Siege Ram Mech',
    shortName: 'Siege Mech',
    hotkey: '4',
    cost: 120,
    count: 1,
    hp: 780,
    damage: 78,
    range: 52,
    speed: 52,
    attackCooldown: 1.5,
    radius: 25,
    roleDesc: '1x Base Breaker',
    bounty: 35,
    buildingMultiplier: 1.45,
    ignoresUnits: true,
  },
};

const GOLEM_TEMPLATE: UnitTemplate = {
  kind: 'GOLEM',
  name: 'Elder Soul Golem',
  shortName: 'Elder Golem',
  hotkey: '',
  cost: 0,
  count: 1,
  hp: 1650,
  damage: 66,
  range: 50,
  speed: 60,
  attackCooldown: 1.15,
  radius: 30,
  roleDesc: 'Altar Boss',
  bounty: 65,
  buildingMultiplier: 1.35,
  shieldBlock: 0.25,
};

const WORLD_WIDTH = 2200;
const WORLD_HEIGHT = 760;
const LANE_TOP = 110;
const LANE_BOTTOM = 650;
const BLUE_CITADEL_X = 165;
const RED_CITADEL_X = WORLD_WIDTH - 165;
const BLUE_OUTPOST_X = 640;
const RED_OUTPOST_X = WORLD_WIDTH - 640;
const CITADEL_Y = WORLD_HEIGHT / 2;
const CITADEL_MAX_HP = 3800;
const OUTPOST_MAX_HP = 2200;
const CITADEL_RADIUS = 68;
const OUTPOST_RADIUS = 44;
const MATCH_DURATION = 240; // 4:00 Sudden Death timer

interface Commander {
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  radius: number;
  speed: number;
  dead: boolean;
  respawnTimer: number;
  comboStep: number;
  comboResetTimer: number;
  attackCd: number;
  attackAnimTimer: number;
  dashCd: number;
  dashTimer: number;
  dashDirX: number;
  dashDirY: number;
  shieldTimer: number;
  warbreakerCd: number;
  warbreakerWindup: number;
  bannerCd: number;
  stunTimer: number;
  hitFlash: number;
  kills: number;
  unitsSpawned: number;
}

interface Minion {
  id: number;
  team: Team;
  kind: UnitKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: number;
  hp: number;
  maxHp: number;
  damage: number;
  range: number;
  speed: number;
  attackCd: number;
  attackMaxCd: number;
  radius: number;
  bounty: number;
  buildingMultiplier: number;
  ignoresUnits: boolean;
  projectileSpeed?: number;
  shieldBlock?: number;
  stunTimer: number;
  hitFlash: number;
  attackAnim: number;
}

interface Projectile {
  id: number;
  team: Team;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  life: number;
  color: string;
}

interface RallyBannerEntity {
  id: number;
  team: Team;
  x: number;
  y: number;
  radius: number;
  timer: number;
  maxTimer: number;
  healTickTimer: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface ShockwaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  color: string;
  life: number;
  maxLife: number;
  lineWidth: number;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

interface Citadel {
  team: Team;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  attackCd: number;
  hitFlash: number;
}

interface SoulAltar {
  x: number;
  y: number;
  radius: number;
  active: boolean;
  cooldownTimer: number;
  progress: number;
  captureDuration: number;
  capturingTeam: Team | 'CONTESTED' | null;
}

interface BattlefieldRune {
  id: string;
  x: number;
  y: number;
  active: boolean;
  respawnTimer: number;
}

interface OpenRoomSummary {
  id: string;
  hostName: string;
  isPublic: boolean;
  createdAt: number;
}

interface HUDState {
  blueHp: number;
  redHp: number;
  blueCitadelHp: number;
  redCitadelHp: number;
  blueGold: number;
  redGold: number;
  matchTimeRemaining: number;
  localCommander: {
    team: Team;
    hp: number;
    maxHp: number;
    dead: boolean;
    respawnTimer: number;
    attackCd: number;
    dashCd: number;
    warbreakerCd: number;
    bannerCd: number;
    shieldTimer: number;
    comboStep: number;
    gold: number;
  };
  blueCommander: {
    hp: number;
    maxHp: number;
    dead: boolean;
    respawnTimer: number;
    executeReady: boolean;
  };
  redCommander: {
    hp: number;
    maxHp: number;
    dead: boolean;
    respawnTimer: number;
    executeReady: boolean;
  };
  blueBerserkTimer: number;
  redBerserkTimer: number;
  altar: {
    active: boolean;
    cooldownTimer: number;
    progress: number;
    captureDuration: number;
    capturingTeam: Team | 'CONTESTED' | null;
  };
  bannerAnnouncement: {
    title: string;
    subtitle: string;
    team: Team | 'NEUTRAL';
    timer: number;
  } | null;
  blueUnitCount: number;
  redUnitCount: number;
  blueOutpostHp: number;
  redOutpostHp: number;
  blueForgeTier: number;
  redForgeTier: number;
  localForgeTier: number;
  aiDirective?: {
    posture: string;
    spawnUnit: string;
    skillPriority: string;
    battleCry: string;
    reasoning: string;
  } | null;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function App() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [matchMode, setMatchMode] = useState<MatchMode>('ONLINE_1V1');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('TACTICAL');
  const [cameraMode, setCameraMode] = useState<CameraMode>('FOLLOW');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Online 1v1 Lobby & Connection State
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [pingMs, setPingMs] = useState<number>(18);
  const [playerName, setPlayerName] = useState<string>('');
  const [myTeam, setMyTeam] = useState<Team>('BLUE');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [joinCodeInput, setJoinCodeInput] = useState<string>('');
  const [lobbyStatus, setLobbyStatus] = useState<
    'IDLE' | 'QUEUEING' | 'WAITING_IN_ROOM' | 'IN_MATCH'
  >('IDLE');
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [openRooms, setOpenRooms] = useState<OpenRoomSummary[]>([]);
  const [onlineStats, setOnlineStats] = useState<{
    onlineCount: number;
    queueCount: number;
  }>({ onlineCount: 1, queueCount: 0 });
  const [matchPlayers, setMatchPlayers] = useState<{
    blueName: string;
    redName: string;
  }>({ blueName: 'Blue Commander', redName: 'Red Rival' });
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [rematchRequested, setRematchRequested] = useState<boolean>(false);
  const [opponentRequestedRematch, setOpponentRequestedRematch] =
    useState<boolean>(false);

  const [winnerInfo, setWinnerInfo] = useState<{
    winner: Team;
    reason: string;
    duration: number;
    blueKills: number;
    redKills: number;
    blueUnits: number;
    redUnits: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const myTeamRef = useRef<Team>('BLUE');
  const matchModeRef = useRef<MatchMode>('ONLINE_1V1');

  useEffect(() => {
    myTeamRef.current = myTeam;
  }, [myTeam]);

  useEffect(() => {
    matchModeRef.current = matchMode;
  }, [matchMode]);

  // Gemini AI Bot Commander Tactical Brain Ref
  const aiBrainRef = useRef<{
    inFlight: boolean;
    cooldown: number;
    posture:
      | 'HUNT_EXECUTE'
      | 'CONTEST_ALTAR'
      | 'DUEL_PLAYER'
      | 'SIEGE_PUSH'
      | 'KITE_RETREAT';
    spawnUnit: 'VANGUARD' | 'MARKSMAN' | 'BRUTE' | 'SIEGE' | 'HOLD_GOLD';
    skillPriority:
      | 'WARBREAKER'
      | 'RALLY_BANNER'
      | 'DASH_ENGAGE'
      | 'DASH_ESCAPE'
      | 'NONE';
    battleCry: string;
    reasoning: string;
    speechTimer: number;
  }>({
    inFlight: false,
    cooldown: 0.5,
    posture: 'DUEL_PLAYER',
    spawnUnit: 'VANGUARD',
    skillPriority: 'WARBREAKER',
    battleCry: 'March forth and crush their Citadel!',
    reasoning: 'Opening vanguard pressure',
    speechTimer: 4.0,
  });

  // Virtual thumbstick UI state
  const [joystickUI, setJoystickUI] = useState<{
    active: boolean;
    originX: number;
    originY: number;
    knobX: number;
    knobY: number;
  }>({
    active: false,
    originX: 0,
    originY: 0,
    knobX: 0,
    knobY: 0,
  });

  // Mutable Input Ref (local + remote network input)
  const inputRef = useRef<{
    keys: Set<string>;
    joyActive: boolean;
    joyPointerId: number | null;
    joyOriginX: number;
    joyOriginY: number;
    joyVecX: number;
    joyVecY: number;
    attackHeld: boolean;
    remoteMoveX: number;
    remoteMoveY: number;
    remoteTargetX: number | null;
    remoteTargetY: number | null;
    remoteFacing: number | null;
  }>({
    keys: new Set(),
    joyActive: false,
    joyPointerId: null,
    joyOriginX: 0,
    joyOriginY: 0,
    joyVecX: 0,
    joyVecY: 0,
    attackHeld: false,
    remoteMoveX: 0,
    remoteMoveY: 0,
    remoteTargetX: null,
    remoteTargetY: null,
    remoteFacing: null,
  });

  // Mutable Game World Ref
  const worldRef = useRef<{
    nextEntityId: number;
    matchTime: number;
    hitStopTimer: number;
    shakeIntensity: number;
    cameraX: number;
    blueGold: number;
    redGold: number;
    blueForgeTier: number;
    redForgeTier: number;
    blueBerserkTimer: number;
    redBerserkTimer: number;
    blueCitadel: Citadel;
    redCitadel: Citadel;
    blueOutpost: Citadel;
    redOutpost: Citadel;
    blueCommander: Commander;
    redCommander: Commander;
    minions: Minion[];
    projectiles: Projectile[];
    banners: RallyBannerEntity[];
    particles: Particle[];
    shockwaves: ShockwaveRing[];
    floatingTexts: FloatingText[];
    altar: SoulAltar;
    runes: BattlefieldRune[];
    announcement: {
      title: string;
      subtitle: string;
      team: Team | 'NEUTRAL';
      timer: number;
    } | null;
    aiThinkTimer: number;
    aiSpawnTimer: number;
  } | null>(null);

  const [hud, setHud] = useState<HUDState>({
    blueHp: 850,
    redHp: 850,
    blueCitadelHp: CITADEL_MAX_HP,
    redCitadelHp: CITADEL_MAX_HP,
    blueGold: 65,
    redGold: 65,
    matchTimeRemaining: MATCH_DURATION,
    localCommander: {
      team: 'BLUE',
      hp: 850,
      maxHp: 850,
      dead: false,
      respawnTimer: 0,
      attackCd: 0,
      dashCd: 0,
      warbreakerCd: 0,
      bannerCd: 0,
      shieldTimer: 0,
      comboStep: 1,
      gold: 65,
    },
    blueCommander: {
      hp: 850,
      maxHp: 850,
      dead: false,
      respawnTimer: 0,
      executeReady: false,
    },
    redCommander: {
      hp: 850,
      maxHp: 850,
      dead: false,
      respawnTimer: 0,
      executeReady: false,
    },
    blueBerserkTimer: 0,
    redBerserkTimer: 0,
    altar: {
      active: false,
      cooldownTimer: 55,
      progress: 0,
      captureDuration: 4,
      capturingTeam: null,
    },
    bannerAnnouncement: null,
    blueUnitCount: 0,
    redUnitCount: 0,
    blueOutpostHp: OUTPOST_MAX_HP,
    redOutpostHp: OUTPOST_MAX_HP,
    blueForgeTier: 1,
    redForgeTier: 1,
    localForgeTier: 1,
  });

  // Helper: Send WebSocket payload
  const sendWs = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  // Initialize or Reset World
  const initWorld = useCallback((localTeam: Team = 'BLUE') => {
    inputRef.current.remoteMoveX = 0;
    inputRef.current.remoteMoveY = 0;
    inputRef.current.remoteTargetX = null;
    inputRef.current.remoteTargetY = null;
    inputRef.current.remoteFacing = null;

    worldRef.current = {
      nextEntityId: 1,
      matchTime: 0,
      hitStopTimer: 0,
      shakeIntensity: 0,
      cameraX:
        localTeam === 'BLUE' ? BLUE_CITADEL_X + 260 : RED_CITADEL_X - 260,
      blueGold: 65,
      redGold: 65,
      blueForgeTier: 1,
      redForgeTier: 1,
      blueBerserkTimer: 0,
      redBerserkTimer: 0,
      blueCitadel: {
        team: 'BLUE',
        x: BLUE_CITADEL_X,
        y: CITADEL_Y,
        hp: CITADEL_MAX_HP,
        maxHp: CITADEL_MAX_HP,
        radius: CITADEL_RADIUS,
        attackCd: 0,
        hitFlash: 0,
      },
      redCitadel: {
        team: 'RED',
        x: RED_CITADEL_X,
        y: CITADEL_Y,
        hp: CITADEL_MAX_HP,
        maxHp: CITADEL_MAX_HP,
        radius: CITADEL_RADIUS,
        attackCd: 0,
        hitFlash: 0,
      },
      blueOutpost: {
        team: 'BLUE',
        x: BLUE_OUTPOST_X,
        y: CITADEL_Y,
        hp: OUTPOST_MAX_HP,
        maxHp: OUTPOST_MAX_HP,
        radius: OUTPOST_RADIUS,
        attackCd: 0,
        hitFlash: 0,
      },
      redOutpost: {
        team: 'RED',
        x: RED_OUTPOST_X,
        y: CITADEL_Y,
        hp: OUTPOST_MAX_HP,
        maxHp: OUTPOST_MAX_HP,
        radius: OUTPOST_RADIUS,
        attackCd: 0,
        hitFlash: 0,
      },
      blueCommander: {
        team: 'BLUE',
        x: BLUE_CITADEL_X + 160,
        y: CITADEL_Y,
        vx: 0,
        vy: 0,
        facing: 0,
        hp: 850,
        maxHp: 850,
        radius: 22,
        speed: 225,
        dead: false,
        respawnTimer: 0,
        comboStep: 1,
        comboResetTimer: 0,
        attackCd: 0,
        attackAnimTimer: 0,
        dashCd: 0,
        dashTimer: 0,
        dashDirX: 1,
        dashDirY: 0,
        shieldTimer: 0,
        warbreakerCd: 0,
        warbreakerWindup: 0,
        bannerCd: 0,
        stunTimer: 0,
        hitFlash: 0,
        kills: 0,
        unitsSpawned: 0,
      },
      redCommander: {
        team: 'RED',
        x: RED_CITADEL_X - 160,
        y: CITADEL_Y,
        vx: 0,
        vy: 0,
        facing: Math.PI,
        hp: 850,
        maxHp: 850,
        radius: 22,
        speed: 225,
        dead: false,
        respawnTimer: 0,
        comboStep: 1,
        comboResetTimer: 0,
        attackCd: 0,
        attackAnimTimer: 0,
        dashCd: 0,
        dashTimer: 0,
        dashDirX: -1,
        dashDirY: 0,
        shieldTimer: 0,
        warbreakerCd: 0,
        warbreakerWindup: 0,
        bannerCd: 0,
        stunTimer: 0,
        hitFlash: 0,
        kills: 0,
        unitsSpawned: 0,
      },
      minions: [],
      projectiles: [],
      banners: [],
      particles: [],
      shockwaves: [],
      floatingTexts: [],
      altar: {
        x: WORLD_WIDTH / 2,
        y: CITADEL_Y,
        radius: 95,
        active: false,
        cooldownTimer: 45,
        progress: 0,
        captureDuration: 4.0,
        capturingTeam: null,
      },
      runes: [
        {
          id: 'TOP_RUNE',
          x: WORLD_WIDTH / 2,
          y: LANE_TOP + 52,
          active: true,
          respawnTimer: 0,
        },
        {
          id: 'BOT_RUNE',
          x: WORLD_WIDTH / 2,
          y: LANE_BOTTOM - 52,
          active: true,
          respawnTimer: 0,
        },
      ],
      announcement: {
        title: 'BATTLE ENGAGED',
        subtitle:
          'Destroy the Rival Outpost Tower to shatter their Citadel Barrier!',
        team: localTeam,
        timer: 3.5,
      },
      aiThinkTimer: 0,
      aiSpawnTimer: 1.2,
    };
  }, []);

  // Helper: Spawn floating text
  const addFloatingText = (
    x: number,
    y: number,
    text: string,
    color: string,
    scale: number = 1
  ) => {
    const w = worldRef.current;
    if (!w) return;
    w.floatingTexts.push({
      id: w.nextEntityId++,
      x: x + (Math.random() - 0.5) * 18,
      y: y - 12,
      vy: -42,
      text,
      color,
      life: 0.85,
      maxLife: 0.85,
      scale,
    });
  };

  // Helper: Particle burst
  const addParticles = (
    x: number,
    y: number,
    color: string,
    count: number = 10,
    speed: number = 140
  ) => {
    const w = worldRef.current;
    if (!w) return;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.3 + Math.random() * 0.7) * speed;
      const life = 0.25 + Math.random() * 0.35;
      w.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        radius: 2.5 + Math.random() * 3.5,
        color,
        alpha: 1,
        life,
        maxLife: life,
      });
    }
  };

  // Helper: Shockwave ring
  const addShockwave = (
    x: number,
    y: number,
    maxRadius: number,
    color: string,
    duration: number = 0.35,
    lineWidth: number = 4
  ) => {
    const w = worldRef.current;
    if (!w) return;
    w.shockwaves.push({
      x,
      y,
      radius: 8,
      maxRadius,
      color,
      life: duration,
      maxLife: duration,
      lineWidth,
    });
  };

  // Spawn Squad for a Team
  const spawnSquad = useCallback(
    (
      team: Team,
      kind: Exclude<UnitKind, 'GOLEM'> | 'GOLEM',
      free: boolean = false,
      isRemote: boolean = false
    ) => {
      const w = worldRef.current;
      if (!w) return false;

      const template = kind === 'GOLEM' ? GOLEM_TEMPLATE : UNIT_CATALOG[kind];
      if (!free) {
        const currentGold = team === 'BLUE' ? w.blueGold : w.redGold;
        if (currentGold < template.cost && !isRemote) return false;
        if (team === 'BLUE') {
          w.blueGold = Math.max(0, w.blueGold - template.cost);
          w.blueCommander.unitsSpawned += template.count;
        } else {
          w.redGold = Math.max(0, w.redGold - template.cost);
          w.redCommander.unitsSpawned += template.count;
        }
      }

      if (!isRemote && matchModeRef.current === 'ONLINE_1V1' && kind !== 'GOLEM') {
        sendWs({
          type: 'squad:spawn',
          team,
          kind,
        });
      }

      // Forward deployment if enemy Outpost is destroyed!
      const enemyOutpostDown =
        team === 'BLUE' ? w.redOutpost.hp <= 0 : w.blueOutpost.hp <= 0;
      const baseX =
        kind === 'GOLEM'
          ? w.altar.x + (team === 'BLUE' ? -40 : 40)
          : team === 'BLUE'
          ? BLUE_CITADEL_X + (enemyOutpostDown ? 280 : 95)
          : RED_CITADEL_X - (enemyOutpostDown ? 280 : 95);
      const baseY = kind === 'GOLEM' ? w.altar.y : CITADEL_Y;

      const forgeTier = team === 'BLUE' ? w.blueForgeTier : w.redForgeTier;
      const tierMult = forgeTier === 3 ? 1.48 : forgeTier === 2 ? 1.22 : 1.0;
      const scaledHp = Math.round(template.hp * tierMult);
      const scaledDmg = Math.round(template.damage * tierMult);

      for (let i = 0; i < template.count; i++) {
        const offsetY =
          template.count === 1
            ? 0
            : (i - (template.count - 1) / 2) * 38;
        w.minions.push({
          id: w.nextEntityId++,
          team,
          kind: template.kind,
          x: baseX,
          y: Math.max(LANE_TOP + 30, Math.min(LANE_BOTTOM - 30, baseY + offsetY)),
          vx: 0,
          vy: 0,
          facing: team === 'BLUE' ? 0 : Math.PI,
          hp: scaledHp,
          maxHp: scaledHp,
          damage: scaledDmg,
          range: template.range,
          speed: template.speed,
          attackCd: 0.2,
          attackMaxCd: template.attackCooldown,
          radius: template.radius,
          bounty: template.bounty,
          buildingMultiplier: template.buildingMultiplier,
          ignoresUnits: Boolean(template.ignoresUnits),
          projectileSpeed: template.projectileSpeed,
          shieldBlock: template.shieldBlock,
          stunTimer: 0,
          hitFlash: 0,
          attackAnim: 0,
        });
      }

      if (team === myTeamRef.current || kind === 'GOLEM') {
        sfx.playSpawn();
      }
      addShockwave(
        baseX,
        baseY,
        45,
        team === 'BLUE' ? '#38bdf8' : '#f87171',
        0.28,
        3
      );
      return true;
    },
    [sendWs]
  );

  // Upgrade Blacksmith War-Forge Tier (Tier I -> II -> III)
  const upgradeForgeTier = useCallback(
    (team: Team, isRemote: boolean = false) => {
      const w = worldRef.current;
      if (!w) return false;
      const currentTier = team === 'BLUE' ? w.blueForgeTier : w.redForgeTier;
      if (currentTier >= 3) return false;
      const cost = currentTier === 1 ? 85 : 140;
      const currentGold = team === 'BLUE' ? w.blueGold : w.redGold;
      if (!isRemote && currentGold < cost) return false;

      if (team === 'BLUE') {
        w.blueGold = Math.max(0, w.blueGold - cost);
        w.blueForgeTier += 1;
      } else {
        w.redGold = Math.max(0, w.redGold - cost);
        w.redForgeTier += 1;
      }

      const newTier = team === 'BLUE' ? w.blueForgeTier : w.redForgeTier;
      if (!isRemote && matchModeRef.current === 'ONLINE_1V1') {
        sendWs({
          type: 'forge:upgrade',
          team,
          tier: newTier,
        });
      }

      const cmd = team === 'BLUE' ? w.blueCommander : w.redCommander;
      sfx.playBanner();
      addShockwave(cmd.x, cmd.y, 130, '#fbbf24', 0.45, 5);
      addFloatingText(
        cmd.x,
        cmd.y - 32,
        `⚒ WAR-FORGE TIER ${newTier}! (+${newTier === 2 ? '22%' : '48%'} ARMY)`,
        '#fde047',
        1.25
      );
      return true;
    },
    [sendWs]
  );

  // Handle Outpost Destruction
  const checkOutpostDestruction = (outpost: Citadel, attackerTeam: Team) => {
    const w = worldRef.current;
    if (!w) return;
    if (outpost.hp <= 0) {
      outpost.hp = 0;
      if (attackerTeam === 'BLUE') {
        w.blueGold = Math.min(999, w.blueGold + 100);
      } else {
        w.redGold = Math.min(999, w.redGold + 100);
      }
      sfx.playAltarCapture();
      w.shakeIntensity = Math.max(w.shakeIntensity, 16);
      addShockwave(outpost.x, outpost.y, 220, '#f59e0b', 0.65, 7);
      addParticles(
        outpost.x,
        outpost.y,
        attackerTeam === 'BLUE' ? '#38bdf8' : '#ef4444',
        36,
        250
      );
      addFloatingText(
        outpost.x,
        outpost.y - 30,
        'OUTPOST DESTROYED! +100G',
        '#fde047',
        1.4
      );
      w.announcement = {
        title: `${outpost.team} OUTPOST FALLEN!`,
        subtitle: `${outpost.team} Citadel Barrier Shattered & Forward Spawn Unlocked!`,
        team: attackerTeam,
        timer: 3.8,
      };
    }
  };

  // Handle Commander Death & Execution Berserk Frenzy
  const handleCommanderDeath = (
    victim: Commander,
    killerTeam: Team,
    executedByHero: boolean
  ) => {
    const w = worldRef.current;
    if (!w || victim.dead) return;

    victim.dead = true;
    victim.hp = 0;
    victim.respawnTimer = 7.5;
    victim.stunTimer = 0;
    victim.dashTimer = 0;

    const killerCmd = killerTeam === 'BLUE' ? w.blueCommander : w.redCommander;
    killerCmd.kills += 1;

    if (killerTeam === 'BLUE') {
      w.blueGold += 75;
      w.blueBerserkTimer = 10.0;
    } else {
      w.redGold += 75;
      w.redBerserkTimer = 10.0;
    }

    w.hitStopTimer = 0.15;
    w.shakeIntensity = 18;

    sfx.playExecuteFrenzy();
    addParticles(
      victim.x,
      victim.y,
      killerTeam === 'BLUE' ? '#38bdf8' : '#ef4444',
      32,
      260
    );
    addShockwave(victim.x, victim.y, 180, '#f59e0b', 0.55, 6);
    addFloatingText(
      victim.x,
      victim.y - 24,
      executedByHero ? 'EXECUTED! +75G' : 'COMMANDER SLAIN! +75G',
      '#fbbf24',
      1.45
    );

    w.announcement = {
      title: 'EXECUTION FRENZY!',
      subtitle: `${killerTeam} ARMY GAINS +75% SPEED & +50% ATTACK SPEED (10S)`,
      team: killerTeam,
      timer: 3.5,
    };
  };

  // Commander Actions: Basic Combo Cleave
  const triggerCommanderAttack = useCallback(
    (cmd: Commander, isRemote: boolean = false) => {
      const w = worldRef.current;
      if (!w || cmd.dead || cmd.stunTimer > 0) return;
      if (!isRemote && (cmd.attackCd > 0 || cmd.dashTimer > 0)) return;

      if (!isRemote && matchModeRef.current === 'ONLINE_1V1') {
        sendWs({
          type: 'commander:action',
          action: 'ATTACK',
          x: cmd.x,
          y: cmd.y,
          facing: cmd.facing,
          comboStep: cmd.comboStep,
        });
      }

      const enemyTeam: Team = cmd.team === 'BLUE' ? 'RED' : 'BLUE';
      const enemyCmd = enemyTeam === 'BLUE' ? w.blueCommander : w.redCommander;
      const enemyOutpost = enemyTeam === 'BLUE' ? w.blueOutpost : w.redOutpost;
      const enemyCitadel = enemyTeam === 'BLUE' ? w.blueCitadel : w.redCitadel;
      const activeEnemyStructure =
        enemyOutpost.hp > 0 ? enemyOutpost : enemyCitadel;

      const isThirdHit = cmd.comboStep === 3;
      cmd.attackCd = isThirdHit ? 0.42 : 0.3;
      cmd.attackAnimTimer = 0.22;
      cmd.comboResetTimer = 1.45;

      const cleaveRange = isThirdHit ? 96 : 80;
      const cleaveArc = isThirdHit ? Math.PI * 0.92 : Math.PI * 0.74;
      let baseDamage = isThirdHit ? 60 : cmd.comboStep === 2 ? 42 : 35;

      // Smart Target-Assist: snap facing to nearest enemy in cleave range if not actively steering away
      if (!isRemote) {
        let lockTargetX: number | null = null;
        let lockTargetY: number | null = null;
        const assistRange = cleaveRange + 36;

        if (
          !enemyCmd.dead &&
          Math.hypot(enemyCmd.x - cmd.x, enemyCmd.y - cmd.y) <=
            assistRange + enemyCmd.radius
        ) {
          lockTargetX = enemyCmd.x;
          lockTargetY = enemyCmd.y;
        } else {
          let closestMinionDist = assistRange;
          for (const m of w.minions) {
            if (m.team !== enemyTeam || m.hp <= 0) continue;
            const d = Math.hypot(m.x - cmd.x, m.y - cmd.y);
            if (d <= closestMinionDist + m.radius) {
              closestMinionDist = d;
              lockTargetX = m.x;
              lockTargetY = m.y;
            }
          }
          if (
            lockTargetX === null &&
            Math.hypot(
              activeEnemyStructure.x - cmd.x,
              activeEnemyStructure.y - cmd.y
            ) <=
              assistRange + activeEnemyStructure.radius
          ) {
            lockTargetX = activeEnemyStructure.x;
            lockTargetY = activeEnemyStructure.y;
          }
        }

        if (lockTargetX !== null && lockTargetY !== null) {
          cmd.facing = Math.atan2(lockTargetY - cmd.y, lockTargetX - cmd.x);
        }
      }

      const berserkActive =
        (cmd.team === 'BLUE' && w.blueBerserkTimer > 0) ||
        (cmd.team === 'RED' && w.redBerserkTimer > 0);
      if (berserkActive) {
        baseDamage = Math.round(baseDamage * 1.25);
        cmd.attackCd *= 0.75;
      }

      sfx.playCleave(cmd.comboStep);

      cmd.x += Math.cos(cmd.facing) * (isThirdHit ? 15 : 8);
      cmd.y += Math.sin(cmd.facing) * (isThirdHit ? 15 : 8);

      let hitSomething = false;

      for (const m of w.minions) {
        if (m.team !== enemyTeam || m.hp <= 0) continue;
        const dx = m.x - cmd.x;
        const dy = m.y - cmd.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= cleaveRange + m.radius) {
          const angleToTarget = Math.atan2(dy, dx);
          let angleDiff = angleToTarget - cmd.facing;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          if (Math.abs(angleDiff) <= cleaveArc / 2 || dist < cmd.radius + m.radius + 10) {
            m.hp -= baseDamage;
            m.hitFlash = 0.14;
            hitSomething = true;
            if (isThirdHit) {
              m.x += Math.cos(cmd.facing) * 22;
              m.y += Math.sin(cmd.facing) * 22;
            }
            addFloatingText(
              m.x,
              m.y,
              `-${baseDamage}`,
              '#f8fafc',
              isThirdHit ? 1.15 : 0.95
            );
            addParticles(
              m.x,
              m.y,
              cmd.team === 'BLUE' ? '#60a5fa' : '#f87171',
              5,
              110
            );
          }
        }
      }

      if (!enemyCmd.dead) {
        const dx = enemyCmd.x - cmd.x;
        const dy = enemyCmd.y - cmd.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= cleaveRange + enemyCmd.radius) {
          const angleToTarget = Math.atan2(dy, dx);
          let angleDiff = angleToTarget - cmd.facing;
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

          if (
            Math.abs(angleDiff) <= cleaveArc / 2 ||
            dist < cmd.radius + enemyCmd.radius + 12
          ) {
            hitSomething = true;
            const isExecute = enemyCmd.hp / enemyCmd.maxHp <= 0.15;
            const dmg =
              enemyCmd.shieldTimer > 0
                ? Math.round(baseDamage * 0.25)
                : isExecute
                ? enemyCmd.hp + 10
                : baseDamage;
            enemyCmd.hp -= dmg;
            enemyCmd.hitFlash = 0.16;
            addFloatingText(
              enemyCmd.x,
              enemyCmd.y,
              enemyCmd.shieldTimer > 0 ? `BLOCKED -${dmg}` : `-${dmg}`,
              isExecute ? '#ef4444' : '#fbbf24',
              1.2
            );
            addParticles(enemyCmd.x, enemyCmd.y, '#fbbf24', 8, 150);

            if (enemyCmd.hp <= 0) {
              handleCommanderDeath(enemyCmd, cmd.team, true);
            }
          }
        }
      }

      // Check Outpost Hit or Citadel Hit (Citadel is shielded while Outpost stands)
      if (
        enemyOutpost.hp > 0 &&
        Math.hypot(enemyOutpost.x - cmd.x, enemyOutpost.y - cmd.y) <=
          cleaveRange + enemyOutpost.radius
      ) {
        hitSomething = true;
        enemyOutpost.hp = Math.max(0, enemyOutpost.hp - baseDamage);
        enemyOutpost.hitFlash = 0.14;
        w.shakeIntensity = Math.max(w.shakeIntensity, 4);
        addFloatingText(
          enemyOutpost.x,
          enemyOutpost.y - 26,
          `-${baseDamage}`,
          '#fbbf24',
          1.05
        );
        if (enemyOutpost.hp <= 0) {
          checkOutpostDestruction(enemyOutpost, cmd.team);
        }
      } else if (
        Math.hypot(enemyCitadel.x - cmd.x, enemyCitadel.y - cmd.y) <=
        cleaveRange + enemyCitadel.radius
      ) {
        hitSomething = true;
        if (enemyOutpost.hp > 0) {
          addFloatingText(
            enemyCitadel.x,
            enemyCitadel.y - 34,
            'SHIELDED BY OUTPOST!',
            '#38bdf8',
            1.05
          );
        } else {
          enemyCitadel.hp = Math.max(0, enemyCitadel.hp - baseDamage);
          enemyCitadel.hitFlash = 0.14;
          w.shakeIntensity = Math.max(w.shakeIntensity, 4);
          addFloatingText(
            enemyCitadel.x,
            enemyCitadel.y - 30,
            `-${baseDamage}`,
            '#f87171',
            1.1
          );
        }
      }

      if (hitSomething) {
        sfx.playHit(isThirdHit);
        if (isThirdHit) {
          w.shakeIntensity = Math.max(w.shakeIntensity, 5);
        }
      }

      cmd.comboStep = cmd.comboStep >= 3 ? 1 : cmd.comboStep + 1;
    },
    [sendWs]
  );

  // Skill 1: Tactical Dash
  const triggerCommanderDash = useCallback(
    (
      cmd: Commander,
      moveX?: number,
      moveY?: number,
      isRemote: boolean = false
    ) => {
      const w = worldRef.current;
      if (!w || cmd.dead || cmd.stunTimer > 0) return;
      if (!isRemote && cmd.dashCd > 0) return;

      cmd.dashCd = 3.0;
      cmd.dashTimer = 0.22;

      let dx = moveX ?? Math.cos(cmd.facing);
      let dy = moveY ?? Math.sin(cmd.facing);
      const len = Math.hypot(dx, dy);
      if (len > 0.01) {
        dx /= len;
        dy /= len;
        cmd.facing = Math.atan2(dy, dx);
      } else {
        dx = Math.cos(cmd.facing);
        dy = Math.sin(cmd.facing);
      }

      cmd.dashDirX = dx;
      cmd.dashDirY = dy;

      if (!isRemote && matchModeRef.current === 'ONLINE_1V1') {
        sendWs({
          type: 'commander:action',
          action: 'DASH',
          x: cmd.x,
          y: cmd.y,
          dx,
          dy,
        });
      }

      const enemyCmd = cmd.team === 'BLUE' ? w.redCommander : w.blueCommander;
      const distToEnemy = Math.hypot(enemyCmd.x - cmd.x, enemyCmd.y - cmd.y);
      if (!enemyCmd.dead && distToEnemy <= 220) {
        cmd.shieldTimer = 2.0;
        addFloatingText(cmd.x, cmd.y - 20, 'TACTICAL SHIELD!', '#38bdf8', 1.15);
      }

      sfx.playDash();
      addParticles(
        cmd.x,
        cmd.y,
        cmd.team === 'BLUE' ? '#38bdf8' : '#fb7185',
        12,
        160
      );
      addShockwave(cmd.x, cmd.y, 48, '#e0f2fe', 0.22, 3);
    },
    [sendWs]
  );

  // Skill 2: Warbreaker Slam
  const triggerCommanderWarbreaker = useCallback(
    (cmd: Commander, isRemote: boolean = false) => {
      const w = worldRef.current;
      if (!w || cmd.dead || cmd.stunTimer > 0) return;
      if (!isRemote && cmd.warbreakerCd > 0) return;

      if (!isRemote && matchModeRef.current === 'ONLINE_1V1') {
        sendWs({
          type: 'commander:action',
          action: 'WARBREAKER',
          x: cmd.x,
          y: cmd.y,
        });
      }

      cmd.warbreakerCd = 6.0;
      const slamRadius = 145;
      const slamDamage = 95;
      const enemyTeam: Team = cmd.team === 'BLUE' ? 'RED' : 'BLUE';
      const enemyCmd = enemyTeam === 'BLUE' ? w.blueCommander : w.redCommander;

      sfx.playWarbreaker();
      w.shakeIntensity = Math.max(w.shakeIntensity, 11);

      addShockwave(
        cmd.x,
        cmd.y,
        slamRadius,
        cmd.team === 'BLUE' ? '#38bdf8' : '#f97316',
        0.42,
        6
      );
      addParticles(
        cmd.x,
        cmd.y,
        cmd.team === 'BLUE' ? '#60a5fa' : '#fb923c',
        24,
        220
      );
      addFloatingText(cmd.x, cmd.y - 28, 'WARBREAKER!', '#f59e0b', 1.25);

      for (const m of w.minions) {
        if (m.team !== enemyTeam || m.hp <= 0) continue;
        const dx = m.x - cmd.x;
        const dy = m.y - cmd.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= slamRadius + m.radius) {
          m.hp -= slamDamage;
          m.hitFlash = 0.2;
          m.stunTimer = Math.max(m.stunTimer, 0.8);
          const pushAngle = Math.atan2(dy, dx);
          const pushDist = m.kind === 'SIEGE' || m.kind === 'GOLEM' ? 25 : 70;
          m.x += Math.cos(pushAngle) * pushDist;
          m.y += Math.sin(pushAngle) * pushDist;
          addFloatingText(m.x, m.y, `-${slamDamage}`, '#fbbf24', 1.1);
        }
      }

      if (!enemyCmd.dead) {
        const dx = enemyCmd.x - cmd.x;
        const dy = enemyCmd.y - cmd.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= slamRadius + enemyCmd.radius) {
          const isExecute = enemyCmd.hp / enemyCmd.maxHp <= 0.15;
          const dmg =
            enemyCmd.shieldTimer > 0
              ? Math.round(slamDamage * 0.3)
              : isExecute
              ? enemyCmd.hp + 25
              : slamDamage;
          enemyCmd.hp -= dmg;
          enemyCmd.hitFlash = 0.22;
          if (enemyCmd.shieldTimer <= 0) {
            enemyCmd.stunTimer = 1.0;
            const pushAngle = Math.atan2(dy, dx);
            enemyCmd.x += Math.cos(pushAngle) * 55;
            enemyCmd.y += Math.sin(pushAngle) * 55;
          }
          addFloatingText(
            enemyCmd.x,
            enemyCmd.y - 16,
            enemyCmd.shieldTimer > 0 ? `SHIELDED -${dmg}` : `STUNNED! -${dmg}`,
            '#f59e0b',
            1.3
          );

          if (enemyCmd.hp <= 0) {
            handleCommanderDeath(enemyCmd, cmd.team, true);
          }
        }
      }
    },
    [sendWs]
  );

  // Skill 3: Rally Banner
  const triggerCommanderBanner = useCallback(
    (cmd: Commander, isRemote: boolean = false) => {
      const w = worldRef.current;
      if (!w || cmd.dead || cmd.stunTimer > 0) return;
      if (!isRemote && cmd.bannerCd > 0) return;

      if (!isRemote && matchModeRef.current === 'ONLINE_1V1') {
        sendWs({
          type: 'commander:action',
          action: 'BANNER',
          x: cmd.x,
          y: cmd.y,
        });
      }

      cmd.bannerCd = 15.0;
      w.banners.push({
        id: w.nextEntityId++,
        team: cmd.team,
        x: cmd.x,
        y: cmd.y,
        radius: 175,
        timer: 6.0,
        maxTimer: 6.0,
        healTickTimer: 0.25,
      });

      sfx.playBanner();
      addShockwave(cmd.x, cmd.y, 175, '#10b981', 0.45, 4);
      addFloatingText(cmd.x, cmd.y - 28, 'RALLY BANNER!', '#34d399', 1.3);
    },
    [sendWs]
  );

  // ============================================================================
  // WEBSOCKET CONNECTION & ONLINE 1V1 EVENT HANDLER
  // ============================================================================
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pingInterval: number | null = null;
    let reconnectTimeout: number | null = null;
    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        // Check if URL has ?room=XXXX invite code
        const params = new URLSearchParams(window.location.search);
        const urlRoom = params.get('room');
        if (urlRoom && urlRoom.trim().length === 4) {
          const code = urlRoom.trim().toUpperCase();
          setJoinCodeInput(code);
          ws?.send(JSON.stringify({ type: 'room:join', roomId: code }));
        }
      };

      ws.onmessage = (event) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        const type = msg.type as string;

        if (type === 'connected') {
          setPlayerName((prev) => prev || String(msg.defaultName || 'Commander'));
        } else if (type === 'pong') {
          const rtt = Date.now() - Number(msg.clientTime || Date.now());
          setPingMs(Math.max(1, Math.min(999, rtt)));
        } else if (type === 'lobby:list') {
          setOpenRooms((msg.rooms as OpenRoomSummary[]) || []);
          setOnlineStats({
            onlineCount: Number(msg.onlineCount || 1),
            queueCount: Number(msg.queueCount || 0),
          });
        } else if (type === 'queue:waiting') {
          setLobbyStatus('QUEUEING');
          setLobbyError(null);
        } else if (type === 'queue:left') {
          setLobbyStatus('IDLE');
        } else if (type === 'room:created' || type === 'room:joined') {
          const rId = String(msg.roomId);
          const assignedTeam = (msg.yourTeam as Team) || 'BLUE';
          setRoomId(rId);
          setMyTeam(assignedTeam);
          setLobbyStatus('WAITING_IN_ROOM');
          setLobbyError(null);
        } else if (type === 'room:error') {
          setLobbyError(String(msg.message || 'Unable to join room.'));
        } else if (type === 'match:start') {
          const assignedTeam = (msg.yourTeam as Team) || 'BLUE';
          const rId = String(msg.roomId);
          setMatchMode('ONLINE_1V1');
          setRoomId(rId);
          setMyTeam(assignedTeam);
          myTeamRef.current = assignedTeam;
          setMatchPlayers({
            blueName: String(msg.blueName || 'Blue Commander'),
            redName: String(msg.redName || 'Red Commander'),
          });
          setLobbyStatus('IN_MATCH');
          setLobbyError(null);
          setRematchRequested(false);
          setOpponentRequestedRematch(false);
          setWinnerInfo(null);
          initWorld(assignedTeam);
          setGameState('PLAYING');
        } else if (type === 'room:opponent_left') {
          const w = worldRef.current;
          if (w) {
            w.announcement = {
              title: 'OPPONENT DISCONNECTED',
              subtitle: 'Your rival left the battlefield.',
              team: myTeamRef.current,
              timer: 4.0,
            };
          }
          setOpponentRequestedRematch(false);
        } else if (type === 'player:input') {
          const w = worldRef.current;
          if (!w) return;
          const senderTeam = msg.senderTeam as Team;
          if (senderTeam === myTeamRef.current) return;

          inputRef.current.remoteMoveX = Number(msg.moveX || 0);
          inputRef.current.remoteMoveY = Number(msg.moveY || 0);
          inputRef.current.remoteTargetX = Number(msg.x);
          inputRef.current.remoteTargetY = Number(msg.y);
          inputRef.current.remoteFacing = Number(msg.facing);
        } else if (type === 'commander:action') {
          const w = worldRef.current;
          if (!w) return;
          const senderTeam = msg.senderTeam as Team;
          if (senderTeam === myTeamRef.current) return;

          const remoteCmd =
            senderTeam === 'BLUE' ? w.blueCommander : w.redCommander;
          if (typeof msg.x === 'number' && typeof msg.y === 'number') {
            remoteCmd.x = msg.x;
            remoteCmd.y = msg.y;
          }
          if (typeof msg.facing === 'number') {
            remoteCmd.facing = msg.facing;
          }

          const action = msg.action as string;
          if (action === 'ATTACK') {
            if (typeof msg.comboStep === 'number') {
              remoteCmd.comboStep = msg.comboStep;
            }
            triggerCommanderAttack(remoteCmd, true);
          } else if (action === 'DASH') {
            triggerCommanderDash(
              remoteCmd,
              Number(msg.dx || 0),
              Number(msg.dy || 0),
              true
            );
          } else if (action === 'WARBREAKER') {
            triggerCommanderWarbreaker(remoteCmd, true);
          } else if (action === 'BANNER') {
            triggerCommanderBanner(remoteCmd, true);
          }
        } else if (type === 'squad:spawn') {
          const senderTeam = msg.senderTeam as Team;
          if (senderTeam === myTeamRef.current) return;
          const kind = msg.kind as Exclude<UnitKind, 'GOLEM'>;
          if (kind && UNIT_CATALOG[kind]) {
            spawnSquad(senderTeam, kind, false, true);
          }
        } else if (type === 'forge:upgrade') {
          const senderTeam = msg.senderTeam as Team;
          if (senderTeam === myTeamRef.current) return;
          upgradeForgeTier(senderTeam, true);
        } else if (type === 'world:sync') {
          // RED Challenger reconciles authoritative world state from BLUE Host
          const w = worldRef.current;
          if (!w || myTeamRef.current === 'BLUE') return;

          w.matchTime = Number(msg.matchTime ?? w.matchTime);
          w.blueGold = Number(msg.blueGold ?? w.blueGold);
          w.redGold = Number(msg.redGold ?? w.redGold);
          w.blueForgeTier = Number(msg.blueForgeTier ?? w.blueForgeTier);
          w.redForgeTier = Number(msg.redForgeTier ?? w.redForgeTier);
          w.blueBerserkTimer = Number(msg.blueBerserkTimer ?? w.blueBerserkTimer);
          w.redBerserkTimer = Number(msg.redBerserkTimer ?? w.redBerserkTimer);
          w.blueCitadel.hp = Number(msg.blueCitadelHp ?? w.blueCitadel.hp);
          w.redCitadel.hp = Number(msg.redCitadelHp ?? w.redCitadel.hp);
          w.blueOutpost.hp = Number(msg.blueOutpostHp ?? w.blueOutpost.hp);
          w.redOutpost.hp = Number(msg.redOutpostHp ?? w.redOutpost.hp);

          if (msg.altar) {
            const a = msg.altar as SoulAltar;
            w.altar.active = a.active;
            w.altar.cooldownTimer = a.cooldownTimer;
            w.altar.progress = a.progress;
            w.altar.capturingTeam = a.capturingTeam;
          }

          if (msg.blueCmd) {
            const bc = msg.blueCmd as Partial<Commander>;
            w.blueCommander.hp = Number(bc.hp ?? w.blueCommander.hp);
            w.blueCommander.dead = Boolean(bc.dead);
            w.blueCommander.respawnTimer = Number(
              bc.respawnTimer ?? w.blueCommander.respawnTimer
            );
            w.blueCommander.kills = Number(bc.kills ?? w.blueCommander.kills);
          }

          if (msg.redCmd) {
            const rc = msg.redCmd as Partial<Commander>;
            w.redCommander.hp = Number(rc.hp ?? w.redCommander.hp);
            w.redCommander.dead = Boolean(rc.dead);
            w.redCommander.respawnTimer = Number(
              rc.respawnTimer ?? w.redCommander.respawnTimer
            );
            w.redCommander.kills = Number(rc.kills ?? w.redCommander.kills);
          }

          if (Array.isArray(msg.minions)) {
            const incoming = msg.minions as Array<{
              id: number;
              team: Team;
              kind: UnitKind;
              x: number;
              y: number;
              facing: number;
              hp: number;
              maxHp: number;
            }>;
            const existingMap = new Map(w.minions.map((m) => [m.id, m]));
            const synced: Minion[] = [];

            for (const im of incoming) {
              const ex = existingMap.get(im.id);
              if (ex) {
                ex.x += (im.x - ex.x) * 0.45;
                ex.y += (im.y - ex.y) * 0.45;
                ex.facing = im.facing;
                ex.hp = im.hp;
                synced.push(ex);
              } else {
                const tmpl =
                  im.kind === 'GOLEM' ? GOLEM_TEMPLATE : UNIT_CATALOG[im.kind];
                synced.push({
                  id: im.id,
                  team: im.team,
                  kind: im.kind,
                  x: im.x,
                  y: im.y,
                  vx: 0,
                  vy: 0,
                  facing: im.facing,
                  hp: im.hp,
                  maxHp: im.maxHp,
                  damage: tmpl.damage,
                  range: tmpl.range,
                  speed: tmpl.speed,
                  attackCd: 0.2,
                  attackMaxCd: tmpl.attackCooldown,
                  radius: tmpl.radius,
                  bounty: tmpl.bounty,
                  buildingMultiplier: tmpl.buildingMultiplier,
                  ignoresUnits: Boolean(tmpl.ignoresUnits),
                  projectileSpeed: tmpl.projectileSpeed,
                  shieldBlock: tmpl.shieldBlock,
                  stunTimer: 0,
                  hitFlash: 0,
                  attackAnim: 0,
                });
              }
            }
            w.minions = synced;
          }
        } else if (type === 'match:over') {
          if (msg.winnerInfo) {
            setWinnerInfo(
              msg.winnerInfo as {
                winner: Team;
                reason: string;
                duration: number;
                blueKills: number;
                redKills: number;
                blueUnits: number;
                redUnits: number;
              }
            );
            setGameState('GAME_OVER');
          }
        } else if (type === 'rematch:request') {
          setOpponentRequestedRematch(true);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!unmounted) {
          reconnectTimeout = window.setTimeout(connect, 2000);
        }
      };
    };

    connect();

    pingInterval = window.setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'ping', clientTime: Date.now() })
        );
      }
    }, 2500);

    return () => {
      unmounted = true;
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [
    initWorld,
    spawnSquad,
    upgradeForgeTier,
    triggerCommanderAttack,
    triggerCommanderDash,
    triggerCommanderWarbreaker,
    triggerCommanderBanner,
  ]);

  // Toggle sound
  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sfx.enabled = next;
  };

  // Start Offline Match (AI or Local 2P)
  const startOfflineMatch = useCallback(
    (mode: 'AI' | 'LOCAL_2P') => {
      if (lobbyStatus !== 'IDLE') {
        sendWs({ type: 'room:leave' });
        setLobbyStatus('IDLE');
        setRoomId(null);
      }
      setMatchMode(mode);
      setMyTeam('BLUE');
      myTeamRef.current = 'BLUE';
      setMatchPlayers({
        blueName: playerName || 'Blue Commander',
        redName: mode === 'AI' ? `Gemini AI (${aiDifficulty})` : 'Player 2 (Red)',
      });
      initWorld('BLUE');
      setWinnerInfo(null);
      setGameState('PLAYING');
    },
    [aiDifficulty, initWorld, lobbyStatus, playerName, sendWs]
  );

  // Copy Shareable Room Link
  const copyRoomInvite = () => {
    if (!roomId) return;
    const url = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    navigator.clipboard.writeText(url).catch(() => {});
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Helper: Get Local Player's Commander
  const getLocalCommander = useCallback(() => {
    const w = worldRef.current;
    if (!w) return null;
    if (matchMode === 'ONLINE_1V1' && myTeam === 'RED') {
      return w.redCommander;
    }
    return w.blueCommander;
  }, [matchMode, myTeam]);

  // Keyboard Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      inputRef.current.keys.add(code);

      if (gameState !== 'PLAYING') return;
      const w = worldRef.current;
      const localCmd = getLocalCommander();
      if (!w || !localCmd) return;

      if (code === 'Escape' && matchMode !== 'ONLINE_1V1') {
        setGameState((prev) => (prev === 'PLAYING' ? 'PAUSED' : prev));
        return;
      }

      const activeTeam: Team =
        matchMode === 'ONLINE_1V1' ? myTeam : 'BLUE';

      if (code === 'Space') {
        e.preventDefault();
        triggerCommanderAttack(localCmd);
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        e.preventDefault();
        triggerCommanderDash(localCmd);
      } else if (code === 'KeyQ') {
        triggerCommanderWarbreaker(localCmd);
      } else if (code === 'KeyE' || code === 'KeyR') {
        triggerCommanderBanner(localCmd);
      } else if (code === 'Digit1') {
        spawnSquad(activeTeam, 'VANGUARD');
      } else if (code === 'Digit2') {
        spawnSquad(activeTeam, 'MARKSMAN');
      } else if (code === 'Digit3') {
        spawnSquad(activeTeam, 'BRUTE');
      } else if (code === 'Digit4') {
        spawnSquad(activeTeam, 'SIEGE');
      } else if (code === 'Digit5' || code === 'KeyF') {
        upgradeForgeTier(activeTeam);
      }

      // Red Player 2 Local Controls (if 2P Local Mode enabled)
      if (matchMode === 'LOCAL_2P') {
        if (code === 'KeyU' || code === 'Enter') {
          triggerCommanderAttack(w.redCommander);
        } else if (code === 'KeyO') {
          triggerCommanderDash(w.redCommander);
        } else if (code === 'KeyP') {
          triggerCommanderWarbreaker(w.redCommander);
        } else if (code === 'KeyH') {
          triggerCommanderBanner(w.redCommander);
        } else if (code === 'Digit7') {
          spawnSquad('RED', 'VANGUARD');
        } else if (code === 'Digit8') {
          spawnSquad('RED', 'MARKSMAN');
        } else if (code === 'Digit9') {
          spawnSquad('RED', 'BRUTE');
        } else if (code === 'Digit0') {
          spawnSquad('RED', 'SIEGE');
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      inputRef.current.keys.delete(e.code);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    gameState,
    matchMode,
    myTeam,
    getLocalCommander,
    triggerCommanderAttack,
    triggerCommanderDash,
    triggerCommanderWarbreaker,
    triggerCommanderBanner,
    spawnSquad,
    upgradeForgeTier,
  ]);

  // Prevent iOS / iPadOS Safari Smart Zoom, Double-Tap Zoom & Pinch Zoom
  useEffect(() => {
    let lastTouchStart = 0;
    let lastTouchEnd = 0;

    const handleTouchStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      // Block multi-finger pinch zoom immediately
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }

      // If touching any element inside [data-no-safari-zoom="true"], prevent default on touchstart.
      // Pointer events (onPointerDown / onPointerMove / onPointerUp) fire BEFORE touchstart and still work 100%!
      if (target && target.closest('[data-no-safari-zoom="true"]')) {
        e.preventDefault();
        return;
      }

      // Block rapid second touchstart anywhere (<450ms) to defeat iPadOS Safari Smart Zoom
      const now = performance.now();
      if (now - lastTouchStart <= 450) {
        e.preventDefault();
      }
      lastTouchStart = now;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (target && target.closest('[data-no-safari-zoom="true"]')) {
        e.preventDefault();
        return;
      }
      const now = performance.now();
      if (now - lastTouchEnd <= 450) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.touches.length > 1) {
        e.preventDefault();
        return;
      }
      if (target && target.closest('[data-no-safari-zoom="true"]')) {
        e.preventDefault();
      }
    };

    const preventDefaultEvent = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
    };

    const lockScrollPosition = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, {
      passive: false,
      capture: true,
    });
    document.addEventListener('touchend', handleTouchEnd, {
      passive: false,
      capture: true,
    });
    document.addEventListener('touchmove', handleTouchMove, {
      passive: false,
      capture: true,
    });
    document.addEventListener('dblclick', preventDefaultEvent, {
      passive: false,
      capture: true,
    });
    document.addEventListener('gesturestart', preventDefaultEvent, {
      passive: false,
      capture: true,
    });
    document.addEventListener('gesturechange', preventDefaultEvent, {
      passive: false,
      capture: true,
    });
    document.addEventListener('gestureend', preventDefaultEvent, {
      passive: false,
      capture: true,
    });
    window.addEventListener('scroll', lockScrollPosition, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchmove', handleTouchMove, true);
      document.removeEventListener('dblclick', preventDefaultEvent, true);
      document.removeEventListener('gesturestart', preventDefaultEvent, true);
      document.removeEventListener('gesturechange', preventDefaultEvent, true);
      document.removeEventListener('gestureend', preventDefaultEvent, true);
      window.removeEventListener('scroll', lockScrollPosition);
    };
  }, []);

  // ============================================================================
  // MAIN 60FPS GAME ENGINE LOOP (Delta-Time, Network Sync & Render)
  // ============================================================================

  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    let animationFrameId: number;
    let lastTime = performance.now();
    let hudSyncAccumulator = 0;
    let netInputAccumulator = 0;
    let netWorldSyncAccumulator = 0;

    const updateWorld = (dt: number) => {
      const w = worldRef.current;
      if (!w) return;

      if (w.hitStopTimer > 0) {
        w.hitStopTimer -= dt;
        dt *= 0.12;
      }

      const prevTimeRemaining = Math.max(0, MATCH_DURATION - (w.matchTime - dt));
      w.matchTime += dt;
      const timeRemaining = Math.max(0, MATCH_DURATION - w.matchTime);

      // Trigger Sudden Death 2x Gold Surge at 0:45 remaining
      if (prevTimeRemaining > 45 && timeRemaining <= 45) {
        w.announcement = {
          title: '⚡ SUDDEN DEATH: 2X GOLD SURGE!',
          subtitle: 'Final 45 Seconds — Passive Gold Doubled (+18G/sec)!',
          team: 'NEUTRAL',
          timer: 3.5,
        };
        w.shakeIntensity = Math.max(w.shakeIntensity, 8);
      }

      if (w.shakeIntensity > 0) {
        w.shakeIntensity = Math.max(0, w.shakeIntensity - dt * 28);
      }

      if (w.announcement) {
        w.announcement.timer -= dt;
        if (w.announcement.timer <= 0) {
          w.announcement = null;
        }
      }

      const goldRate = timeRemaining <= 45 ? 18.0 : 9.5;
      w.blueGold = Math.min(999, w.blueGold + goldRate * dt);
      w.redGold = Math.min(999, w.redGold + goldRate * dt);

      // Update Top & Bottom Alcove Vitality Runes
      for (const rune of w.runes) {
        if (!rune.active) {
          rune.respawnTimer -= dt;
          if (rune.respawnTimer <= 0) {
            rune.active = true;
            addShockwave(rune.x, rune.y, 55, '#34d399', 0.4, 3);
          }
        } else {
          for (const cmd of [w.blueCommander, w.redCommander]) {
            if (
              !cmd.dead &&
              Math.hypot(cmd.x - rune.x, cmd.y - rune.y) <= cmd.radius + 24
            ) {
              rune.active = false;
              rune.respawnTimer = 32.0;
              cmd.hp = Math.min(cmd.maxHp, cmd.hp + 220);
              cmd.dashCd = 0;
              cmd.warbreakerCd = 0;
              if (cmd.team === 'BLUE') {
                w.blueGold = Math.min(999, w.blueGold + 25);
              } else {
                w.redGold = Math.min(999, w.redGold + 25);
              }
              sfx.playBanner();
              addShockwave(rune.x, rune.y, 85, '#10b981', 0.4, 4);
              addParticles(rune.x, rune.y, '#34d399', 16, 150);
              addFloatingText(
                cmd.x,
                cmd.y - 26,
                'VITALITY RUNE! +220HP +25G & CD RESET',
                '#34d399',
                1.15
              );
              break;
            }
          }
        }
      }

      if (w.blueBerserkTimer > 0)
        w.blueBerserkTimer = Math.max(0, w.blueBerserkTimer - dt);
      if (w.redBerserkTimer > 0)
        w.redBerserkTimer = Math.max(0, w.redBerserkTimer - dt);

      // ------------------------------------------------------------------------
      // 1. GATHER LOCAL PLAYER MOVEMENT INPUT
      // ------------------------------------------------------------------------
      const keys = inputRef.current.keys;
      let localMoveX = 0;
      let localMoveY = 0;
      if (keys.has('KeyW') || keys.has('ArrowUp')) localMoveY -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) localMoveY += 1;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) localMoveX -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) localMoveX += 1;

      if (inputRef.current.joyActive) {
        localMoveX += inputRef.current.joyVecX;
        localMoveY += inputRef.current.joyVecY;
      }

      const localCmd =
        matchMode === 'ONLINE_1V1' && myTeam === 'RED'
          ? w.redCommander
          : w.blueCommander;

      if (inputRef.current.attackHeld) {
        triggerCommanderAttack(localCmd);
      }

      const updateCommanderEntity = (
        cmd: Commander,
        mx: number,
        my: number,
        isRemoteControlled: boolean = false
      ) => {
        if (cmd.dead) {
          cmd.respawnTimer -= dt;
          if (cmd.respawnTimer <= 0) {
            cmd.dead = false;
            cmd.hp = cmd.maxHp;
            cmd.x =
              cmd.team === 'BLUE' ? BLUE_CITADEL_X + 140 : RED_CITADEL_X - 140;
            cmd.y = CITADEL_Y;
            cmd.shieldTimer = 1.5;
            addShockwave(
              cmd.x,
              cmd.y,
              80,
              cmd.team === 'BLUE' ? '#38bdf8' : '#f87171',
              0.35,
              4
            );
            addFloatingText(
              cmd.x,
              cmd.y - 24,
              'COMMANDER RESPAWNED',
              '#f8fafc',
              1.15
            );
          }
          return;
        }

        if (cmd.attackCd > 0) cmd.attackCd = Math.max(0, cmd.attackCd - dt);
        if (cmd.attackAnimTimer > 0)
          cmd.attackAnimTimer = Math.max(0, cmd.attackAnimTimer - dt);
        if (cmd.dashCd > 0) cmd.dashCd = Math.max(0, cmd.dashCd - dt);
        if (cmd.warbreakerCd > 0)
          cmd.warbreakerCd = Math.max(0, cmd.warbreakerCd - dt);
        if (cmd.bannerCd > 0) cmd.bannerCd = Math.max(0, cmd.bannerCd - dt);
        if (cmd.shieldTimer > 0)
          cmd.shieldTimer = Math.max(0, cmd.shieldTimer - dt);
        if (cmd.stunTimer > 0) cmd.stunTimer = Math.max(0, cmd.stunTimer - dt);
        if (cmd.hitFlash > 0) cmd.hitFlash = Math.max(0, cmd.hitFlash - dt);

        if (cmd.comboResetTimer > 0) {
          cmd.comboResetTimer -= dt;
          if (cmd.comboResetTimer <= 0) cmd.comboStep = 1;
        }

        const isBerserk =
          (cmd.team === 'BLUE' && w.blueBerserkTimer > 0) ||
          (cmd.team === 'RED' && w.redBerserkTimer > 0);
        const speedMult = isBerserk ? 1.35 : 1.0;

        if (cmd.dashTimer > 0) {
          cmd.dashTimer -= dt;
          cmd.x += cmd.dashDirX * 640 * dt;
          cmd.y += cmd.dashDirY * 640 * dt;
          if (Math.random() < 0.65) {
            addParticles(
              cmd.x,
              cmd.y,
              cmd.team === 'BLUE' ? '#38bdf8' : '#fb7185',
              1,
              40
            );
          }
        } else if (cmd.stunTimer <= 0) {
          const len = Math.hypot(mx, my);
          if (len > 0.05) {
            const normX = mx / Math.max(1, len);
            const normY = my / Math.max(1, len);
            cmd.vx = normX * cmd.speed * speedMult;
            cmd.vy = normY * cmd.speed * speedMult;
            cmd.x += cmd.vx * dt;
            cmd.y += cmd.vy * dt;
            cmd.facing = Math.atan2(normY, normX);
          } else {
            cmd.vx = 0;
            cmd.vy = 0;
          }

          // Smooth dead-reckoning reconciliation for remote online player
          if (
            isRemoteControlled &&
            inputRef.current.remoteTargetX !== null &&
            inputRef.current.remoteTargetY !== null
          ) {
            cmd.x += (inputRef.current.remoteTargetX - cmd.x) * Math.min(1, dt * 12);
            cmd.y += (inputRef.current.remoteTargetY - cmd.y) * Math.min(1, dt * 12);
            if (inputRef.current.remoteFacing !== null) {
              cmd.facing = inputRef.current.remoteFacing;
            }
          }
        }

        cmd.x = Math.max(90, Math.min(WORLD_WIDTH - 90, cmd.x));
        cmd.y = Math.max(
          LANE_TOP + cmd.radius,
          Math.min(LANE_BOTTOM - cmd.radius, cmd.y)
        );
      };

      // ------------------------------------------------------------------------
      // 2. UPDATE COMMANDERS BASED ON MATCH MODE (ONLINE 1V1 / AI / LOCAL 2P)
      // ------------------------------------------------------------------------
      if (matchMode === 'ONLINE_1V1') {
        if (myTeam === 'BLUE') {
          updateCommanderEntity(w.blueCommander, localMoveX, localMoveY, false);
          updateCommanderEntity(
            w.redCommander,
            inputRef.current.remoteMoveX,
            inputRef.current.remoteMoveY,
            true
          );
        } else {
          updateCommanderEntity(w.redCommander, localMoveX, localMoveY, false);
          updateCommanderEntity(
            w.blueCommander,
            inputRef.current.remoteMoveX,
            inputRef.current.remoteMoveY,
            true
          );
        }

        // Stream local Commander input/position at 30Hz
        netInputAccumulator += dt;
        if (netInputAccumulator >= 0.033) {
          netInputAccumulator = 0;
          sendWs({
            type: 'player:input',
            moveX: localMoveX,
            moveY: localMoveY,
            x: Math.round(localCmd.x),
            y: Math.round(localCmd.y),
            facing: Number(localCmd.facing.toFixed(2)),
          });
        }
      } else if (matchMode === 'LOCAL_2P') {
        updateCommanderEntity(w.blueCommander, localMoveX, localMoveY, false);
        let redMoveX = 0;
        let redMoveY = 0;
        if (keys.has('KeyI')) redMoveY -= 1;
        if (keys.has('KeyK')) redMoveY += 1;
        if (keys.has('KeyJ')) redMoveX -= 1;
        if (keys.has('KeyL')) redMoveX += 1;
        updateCommanderEntity(w.redCommander, redMoveX, redMoveY, false);
      } else {
        // GEMINI AI COMMANDER MODE (Macro LLM Strategy + 60FPS Micro Reflexes)
        updateCommanderEntity(w.blueCommander, localMoveX, localMoveY, false);

        let redMoveX = 0;
        let redMoveY = 0;
        const ai = w.redCommander;
        const player = w.blueCommander;
        const brain = aiBrainRef.current;

        if (brain.speechTimer > 0) {
          brain.speechTimer = Math.max(0, brain.speechTimer - dt);
        }

        // Poll Gemini AI Tactical Brain every ~3.2s (non-blocking)
        brain.cooldown -= dt;
        if (brain.cooldown <= 0 && !brain.inFlight) {
          brain.inFlight = true;
          brain.cooldown = aiDifficulty === 'RUTHLESS' ? 2.8 : 3.8;

          const snapshot = {
            difficulty: aiDifficulty,
            matchTime: Math.round(w.matchTime),
            redHp: Math.round(ai.hp),
            redMaxHp: ai.maxHp,
            redDead: ai.dead,
            redGold: Math.floor(w.redGold),
            redCitadelHp: Math.round(w.redCitadel.hp),
            blueHp: Math.round(player.hp),
            blueMaxHp: player.maxHp,
            blueDead: player.dead,
            blueGold: Math.floor(w.blueGold),
            blueCitadelHp: Math.round(w.blueCitadel.hp),
            altarActive: w.altar.active,
            altarCooldown: Math.round(w.altar.cooldownTimer),
            altarCapturing: w.altar.capturingTeam,
            redBerserkActive: w.redBerserkTimer > 0,
            blueBerserkActive: w.blueBerserkTimer > 0,
            blueUnits: {
              vanguard: w.minions.filter(
                (m) => m.team === 'BLUE' && m.kind === 'VANGUARD'
              ).length,
              marksman: w.minions.filter(
                (m) => m.team === 'BLUE' && m.kind === 'MARKSMAN'
              ).length,
              brute: w.minions.filter(
                (m) => m.team === 'BLUE' && m.kind === 'BRUTE'
              ).length,
              siege: w.minions.filter(
                (m) => m.team === 'BLUE' && m.kind === 'SIEGE'
              ).length,
            },
            redUnits: {
              vanguard: w.minions.filter(
                (m) => m.team === 'RED' && m.kind === 'VANGUARD'
              ).length,
              marksman: w.minions.filter(
                (m) => m.team === 'RED' && m.kind === 'MARKSMAN'
              ).length,
              brute: w.minions.filter(
                (m) => m.team === 'RED' && m.kind === 'BRUTE'
              ).length,
              siege: w.minions.filter(
                (m) => m.team === 'RED' && m.kind === 'SIEGE'
              ).length,
            },
          };

          fetch('/api/ai-commander/decide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot),
          })
            .then((r) => r.json())
            .then((data) => {
              if (data?.ok && data.decision) {
                const d = data.decision;
                if (
                  [
                    'HUNT_EXECUTE',
                    'CONTEST_ALTAR',
                    'DUEL_PLAYER',
                    'SIEGE_PUSH',
                    'KITE_RETREAT',
                  ].includes(d.posture)
                ) {
                  brain.posture = d.posture;
                }
                if (
                  [
                    'VANGUARD',
                    'MARKSMAN',
                    'BRUTE',
                    'SIEGE',
                    'HOLD_GOLD',
                  ].includes(d.spawnUnit)
                ) {
                  brain.spawnUnit = d.spawnUnit;
                }
                if (
                  [
                    'WARBREAKER',
                    'RALLY_BANNER',
                    'DASH_ENGAGE',
                    'DASH_ESCAPE',
                    'NONE',
                  ].includes(d.skillPriority)
                ) {
                  brain.skillPriority = d.skillPriority;
                }
                if (d.battleCry) {
                  brain.battleCry = String(d.battleCry).slice(0, 48);
                  brain.speechTimer = 3.4;
                }
                if (d.reasoning) {
                  brain.reasoning = String(d.reasoning).slice(0, 65);
                }
              }
            })
            .catch(() => {
              // Silent fallback to local heuristic if offline
            })
            .finally(() => {
              brain.inFlight = false;
            });
        }

        // Execute Gemini's Unit Spawn & War-Forge Upgrade Directive
        w.aiSpawnTimer -= dt;
        if (w.aiSpawnTimer <= 0) {
          w.aiSpawnTimer = aiDifficulty === 'RUTHLESS' ? 0.75 : 1.25;
          const desiredUnit = brain.spawnUnit;

          // AI invests in Blacksmith War-Forge Tier II / III as match progresses
          if (w.matchTime > 42 && w.redForgeTier === 1 && w.redGold >= 90) {
            upgradeForgeTier('RED');
          } else if (
            w.matchTime > 95 &&
            w.redForgeTier === 2 &&
            w.redGold >= 145
          ) {
            upgradeForgeTier('RED');
          } else if (desiredUnit !== 'HOLD_GOLD') {
            const unitCost = UNIT_CATALOG[desiredUnit].cost;
            if (w.redGold >= unitCost) {
              spawnSquad('RED', desiredUnit);
            }
          } else if (w.redGold >= 125) {
            // Uncap if holding gold and already reached Siege threshold
            spawnSquad('RED', 'SIEGE');
          }
        }

        if (!ai.dead && ai.stunTimer <= 0) {
          const distToPlayer = Math.hypot(player.x - ai.x, player.y - ai.y);
          const lowHp = ai.hp / ai.maxHp < 0.25;
          const playerExecuteVulnerable =
            !player.dead && player.hp / player.maxHp <= 0.18;

          let targetX = WORLD_WIDTH / 2 + 120;
          let targetY = CITADEL_Y;

          // Combine Gemini macro posture with immediate execution/survival overrides
          const activePosture = playerExecuteVulnerable
            ? 'HUNT_EXECUTE'
            : lowHp && w.redBerserkTimer <= 0
            ? 'KITE_RETREAT'
            : w.altar.active && brain.posture === 'CONTEST_ALTAR'
            ? 'CONTEST_ALTAR'
            : brain.posture;

          if (activePosture === 'HUNT_EXECUTE' && !player.dead) {
            targetX = player.x;
            targetY = player.y;
            if (distToPlayer > 125 && distToPlayer < 420 && ai.dashCd <= 0) {
              triggerCommanderDash(ai, player.x - ai.x, player.y - ai.y);
            }
          } else if (activePosture === 'KITE_RETREAT') {
            targetX = RED_CITADEL_X - 205;
            targetY = CITADEL_Y + Math.sin(w.matchTime * 2.5) * 90;
            if (
              (distToPlayer < 155 || brain.skillPriority === 'DASH_ESCAPE') &&
              ai.dashCd <= 0
            ) {
              triggerCommanderDash(ai, 1, 0);
            }
          } else if (w.altar.active || activePosture === 'CONTEST_ALTAR') {
            targetX = w.altar.x + Math.cos(w.matchTime * 1.8) * 35;
            targetY = w.altar.y + Math.sin(w.matchTime * 1.8) * 35;
          } else if (activePosture === 'DUEL_PLAYER' && !player.dead) {
            targetX = player.x + 38;
            targetY = player.y + Math.sin(w.matchTime * 3.0) * 24;
            if (
              brain.skillPriority === 'DASH_ENGAGE' &&
              distToPlayer > 140 &&
              distToPlayer < 360 &&
              ai.dashCd <= 0
            ) {
              triggerCommanderDash(ai, player.x - ai.x, player.y - ai.y);
            }
          } else {
            // SIEGE_PUSH or default frontline escort
            const closestEnemy = w.minions
              .filter((m) => m.team === 'BLUE')
              .sort(
                (a, b) =>
                  Math.hypot(a.x - ai.x, a.y - ai.y) -
                  Math.hypot(b.x - ai.x, b.y - ai.y)
              )[0];

            if (!player.dead && distToPlayer < 260) {
              targetX = player.x + 42;
              targetY = player.y;
            } else if (closestEnemy) {
              targetX = closestEnemy.x + 45;
              targetY = closestEnemy.y;
            } else {
              targetX = BLUE_CITADEL_X + 120;
              targetY = CITADEL_Y;
            }
          }

          const dx = targetX - ai.x;
          const dy = targetY - ai.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 14) {
            redMoveX = dx / dist;
            redMoveY = dy / dist;
          }

          const nearbyBlueMinions = w.minions.filter(
            (m) =>
              m.team === 'BLUE' && Math.hypot(m.x - ai.x, m.y - ai.y) <= 135
          ).length;
          const nearbyRedMinions = w.minions.filter(
            (m) => m.team === 'RED' && Math.hypot(m.x - ai.x, m.y - ai.y) <= 165
          ).length;

          if (
            ai.warbreakerCd <= 0 &&
            ((!player.dead && distToPlayer <= 125) ||
              nearbyBlueMinions >= 3 ||
              (brain.skillPriority === 'WARBREAKER' && nearbyBlueMinions >= 2))
          ) {
            triggerCommanderWarbreaker(ai);
          }

          if (
            ai.bannerCd <= 0 &&
            ((nearbyRedMinions >= 2 && nearbyBlueMinions >= 1) ||
              ai.hp < ai.maxHp * 0.65 ||
              (brain.skillPriority === 'RALLY_BANNER' && nearbyRedMinions >= 1))
          ) {
            triggerCommanderBanner(ai);
          }

          const inAttackRangeOfPlayer = !player.dead && distToPlayer <= 84;
          const inAttackRangeOfCitadel =
            Math.hypot(w.blueCitadel.x - ai.x, w.blueCitadel.y - ai.y) <=
            w.blueCitadel.radius + 70;

          if (
            inAttackRangeOfPlayer ||
            nearbyBlueMinions >= 1 ||
            inAttackRangeOfCitadel
          ) {
            if (inAttackRangeOfPlayer) {
              ai.facing = Math.atan2(player.y - ai.y, player.x - ai.x);
            }
            triggerCommanderAttack(ai);
          }
        }

        updateCommanderEntity(w.redCommander, redMoveX, redMoveY, false);
      }

      // ------------------------------------------------------------------------
      // 3. UPDATE RALLY BANNERS
      // ------------------------------------------------------------------------
      for (let i = w.banners.length - 1; i >= 0; i--) {
        const b = w.banners[i];
        b.timer -= dt;
        b.healTickTimer -= dt;

        if (b.healTickTimer <= 0) {
          b.healTickTimer = 0.5;
          const healAmount = 16;
          for (const m of w.minions) {
            if (
              m.team === b.team &&
              m.hp > 0 &&
              m.hp < m.maxHp &&
              Math.hypot(m.x - b.x, m.y - b.y) <= b.radius
            ) {
              m.hp = Math.min(m.maxHp, m.hp + healAmount);
              addParticles(m.x, m.y, '#34d399', 2, 50);
            }
          }
          const friendlyCmd =
            b.team === 'BLUE' ? w.blueCommander : w.redCommander;
          if (
            !friendlyCmd.dead &&
            friendlyCmd.hp < friendlyCmd.maxHp &&
            Math.hypot(friendlyCmd.x - b.x, friendlyCmd.y - b.y) <= b.radius
          ) {
            friendlyCmd.hp = Math.min(
              friendlyCmd.maxHp,
              friendlyCmd.hp + 22
            );
            addFloatingText(
              friendlyCmd.x,
              friendlyCmd.y - 16,
              '+22',
              '#34d399',
              0.9
            );
          }
        }

        if (b.timer <= 0) {
          w.banners.splice(i, 1);
        }
      }

      // ------------------------------------------------------------------------
      // 4. UPDATE MID-LANE SOUL ALTAR OBJECTIVE
      // ------------------------------------------------------------------------
      const altar = w.altar;
      if (!altar.active) {
        altar.cooldownTimer -= dt;
        if (altar.cooldownTimer <= 0) {
          altar.active = true;
          altar.progress = 0;
          altar.capturingTeam = null;
          addShockwave(altar.x, altar.y, altar.radius * 1.4, '#a855f7', 0.6, 5);
          w.announcement = {
            title: 'SOUL ALTAR AWAKENED!',
            subtitle: 'Hold the Center Ring for 4s to Summon an Elder Golem',
            team: 'NEUTRAL',
            timer: 3.0,
          };
        }
      } else {
        const blueIn =
          !w.blueCommander.dead &&
          Math.hypot(
            w.blueCommander.x - altar.x,
            w.blueCommander.y - altar.y
          ) <= altar.radius;
        const redIn =
          !w.redCommander.dead &&
          Math.hypot(w.redCommander.x - altar.x, w.redCommander.y - altar.y) <=
            altar.radius;

        if (blueIn && redIn) {
          altar.capturingTeam = 'CONTESTED';
        } else if (blueIn) {
          altar.capturingTeam = 'BLUE';
          altar.progress = Math.min(altar.captureDuration, altar.progress + dt);
        } else if (redIn) {
          altar.capturingTeam = 'RED';
          altar.progress = Math.max(
            -altar.captureDuration,
            altar.progress - dt
          );
        } else {
          altar.capturingTeam = null;
          if (altar.progress > 0)
            altar.progress = Math.max(0, altar.progress - dt * 0.5);
          if (altar.progress < 0)
            altar.progress = Math.min(0, altar.progress + dt * 0.5);
        }

        if (Math.abs(altar.progress) >= altar.captureDuration) {
          const winnerTeam: Team = altar.progress > 0 ? 'BLUE' : 'RED';
          altar.active = false;
          altar.cooldownTimer = 45.0;
          altar.progress = 0;
          altar.capturingTeam = null;

          spawnSquad(winnerTeam, 'GOLEM', true, true);
          sfx.playAltarCapture();
          w.shakeIntensity = Math.max(w.shakeIntensity, 12);
          addShockwave(altar.x, altar.y, 210, '#c084fc', 0.6, 7);

          w.announcement = {
            title: 'SOUL ALTAR CAPTURED!',
            subtitle: `${winnerTeam} SUMMONED THE ELDER SOUL GOLEM!`,
            team: winnerTeam,
            timer: 3.4,
          };
        }
      }

      // ------------------------------------------------------------------------
      // 5. UPDATE MINIONS
      // ------------------------------------------------------------------------
      for (let i = 0; i < w.minions.length; i++) {
        const m = w.minions[i];
        if (m.hp <= 0) continue;

        if (m.hitFlash > 0) m.hitFlash = Math.max(0, m.hitFlash - dt);
        if (m.attackAnim > 0) m.attackAnim = Math.max(0, m.attackAnim - dt);
        if (m.stunTimer > 0) {
          m.stunTimer -= dt;
          continue;
        }

        const enemyTeam: Team = m.team === 'BLUE' ? 'RED' : 'BLUE';
        const enemyOutpost =
          enemyTeam === 'BLUE' ? w.blueOutpost : w.redOutpost;
        const enemyCitadel =
          enemyTeam === 'BLUE' ? w.blueCitadel : w.redCitadel;
        const primaryStructure =
          enemyOutpost.hp > 0 ? enemyOutpost : enemyCitadel;
        const enemyCmd =
          enemyTeam === 'BLUE' ? w.blueCommander : w.redCommander;

        const isBerserk =
          (m.team === 'BLUE' && w.blueBerserkTimer > 0) ||
          (m.team === 'RED' && w.redBerserkTimer > 0);
        const inBanner = w.banners.some(
          (b) =>
            b.team === m.team && Math.hypot(m.x - b.x, m.y - b.y) <= b.radius
        );

        const moveSpeedMult = isBerserk ? 1.75 : 1.0;
        const attackSpeedMult =
          (isBerserk ? 1.5 : 1.0) * (inBanner ? 1.4 : 1.0);

        if (m.attackCd > 0) {
          m.attackCd = Math.max(0, m.attackCd - dt * attackSpeedMult);
        }

        let targetX = primaryStructure.x;
        let targetY = primaryStructure.y;
        let targetRadius = primaryStructure.radius;
        let targetType: 'STRUCTURE' | 'MINION' | 'COMMANDER' = 'STRUCTURE';
        let targetMinion: Minion | null = null;

        if (!m.ignoresUnits) {
          let bestDist = 290;
          for (const other of w.minions) {
            if (other.team !== enemyTeam || other.hp <= 0) continue;
            const d = Math.hypot(other.x - m.x, other.y - m.y);
            if (d < bestDist) {
              bestDist = d;
              targetX = other.x;
              targetY = other.y;
              targetRadius = other.radius;
              targetType = 'MINION';
              targetMinion = other;
            }
          }

          if (!enemyCmd.dead) {
            const dCmd = Math.hypot(enemyCmd.x - m.x, enemyCmd.y - m.y);
            if (dCmd < bestDist) {
              bestDist = dCmd;
              targetX = enemyCmd.x;
              targetY = enemyCmd.y;
              targetRadius = enemyCmd.radius;
              targetType = 'COMMANDER';
              targetMinion = null;
            }
          }
        }

        const dx = targetX - m.x;
        const dy = targetY - m.y;
        const distToTarget = Math.hypot(dx, dy);
        const effectiveRange = m.range + targetRadius + m.radius;

        if (distToTarget <= effectiveRange) {
          m.facing = Math.atan2(dy, dx);
          if (m.attackCd <= 0) {
            m.attackCd = m.attackMaxCd;
            m.attackAnim = 0.18;

            if (m.projectileSpeed) {
              const pAngle = Math.atan2(dy, dx);
              w.projectiles.push({
                id: w.nextEntityId++,
                team: m.team,
                x: m.x + Math.cos(pAngle) * 14,
                y: m.y + Math.sin(pAngle) * 14,
                vx: Math.cos(pAngle) * m.projectileSpeed,
                vy: Math.sin(pAngle) * m.projectileSpeed,
                damage: m.damage,
                radius: 5,
                life: 0.85,
                color: m.team === 'BLUE' ? '#38bdf8' : '#fb7185',
              });
            } else {
              if (targetType === 'MINION' && targetMinion) {
                const dmg = targetMinion.shieldBlock
                  ? Math.round(m.damage * (1 - targetMinion.shieldBlock))
                  : m.damage;
                targetMinion.hp -= dmg;
                targetMinion.hitFlash = 0.12;
                addParticles(
                  targetMinion.x,
                  targetMinion.y,
                  m.team === 'BLUE' ? '#60a5fa' : '#f87171',
                  3,
                  70
                );
              } else if (targetType === 'COMMANDER') {
                const dmg =
                  enemyCmd.shieldTimer > 0
                    ? Math.round(m.damage * 0.3)
                    : m.damage;
                enemyCmd.hp -= dmg;
                enemyCmd.hitFlash = 0.12;
                if (enemyCmd.hp <= 0) {
                  handleCommanderDeath(enemyCmd, m.team, false);
                }
              } else if (targetType === 'STRUCTURE') {
                const structDmg = Math.max(
                  1,
                  Math.round(m.damage * m.buildingMultiplier)
                );
                primaryStructure.hp = Math.max(
                  0,
                  primaryStructure.hp - structDmg
                );
                primaryStructure.hitFlash = 0.14;
                if (m.kind === 'SIEGE' || m.kind === 'GOLEM') {
                  w.shakeIntensity = Math.max(w.shakeIntensity, 6);
                  addShockwave(
                    primaryStructure.x,
                    primaryStructure.y,
                    primaryStructure.radius + 25,
                    '#f97316',
                    0.25,
                    4
                  );
                }
                addFloatingText(
                  primaryStructure.x,
                  primaryStructure.y - 25,
                  `-${structDmg}`,
                  '#fb923c',
                  m.kind === 'SIEGE' ? 1.2 : 0.95
                );
                if (
                  primaryStructure === enemyOutpost &&
                  enemyOutpost.hp <= 0
                ) {
                  checkOutpostDestruction(enemyOutpost, m.team);
                }
              }
            }
          }
        } else {
          let sepX = 0;
          let sepY = 0;
          for (let j = 0; j < w.minions.length; j++) {
            if (i === j) continue;
            const o = w.minions[j];
            if (o.hp <= 0) continue;
            const sdx = m.x - o.x;
            const sdy = m.y - o.y;
            const sdist = Math.hypot(sdx, sdy);
            const minDist = m.radius + o.radius + 4;
            if (sdist > 0 && sdist < minDist) {
              const push = (minDist - sdist) / minDist;
              sepX += (sdx / sdist) * push * 1.4;
              sepY += (sdy / sdist) * push * 1.4;
            }
          }

          const dirX = dx / Math.max(1, distToTarget) + sepX * 0.35;
          const dirY = dy / Math.max(1, distToTarget) + sepY * 0.35;
          const norm = Math.hypot(dirX, dirY) || 1;
          m.vx = (dirX / norm) * m.speed * moveSpeedMult;
          m.vy = (dirY / norm) * m.speed * moveSpeedMult;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          m.facing = Math.atan2(m.vy, m.vx);

          m.y = Math.max(
            LANE_TOP + m.radius,
            Math.min(LANE_BOTTOM - m.radius, m.y)
          );
        }

        if (isBerserk && Math.random() < 0.28) {
          addParticles(m.x, m.y, '#ef4444', 1, 45);
        }
      }

      // ------------------------------------------------------------------------
      // 6. UPDATE CITADEL & OUTPOST DEFENSIVE TURRETS
      // ------------------------------------------------------------------------
      const updateDefensiveTurret = (
        structure: Citadel,
        turretRange: number,
        turretDamage: number,
        fireInterval: number
      ) => {
        if (structure.hp <= 0) return;
        if (structure.hitFlash > 0) {
          structure.hitFlash = Math.max(0, structure.hitFlash - dt);
        }
        if (structure.attackCd > 0) {
          structure.attackCd -= dt;
          return;
        }
        const enemyTeam: Team = structure.team === 'BLUE' ? 'RED' : 'BLUE';

        let targetX: number | null = null;
        let targetY: number | null = null;

        for (const m of w.minions) {
          if (m.team === enemyTeam && m.hp > 0) {
            const d = Math.hypot(m.x - structure.x, m.y - structure.y);
            if (d <= turretRange) {
              targetX = m.x;
              targetY = m.y;
              break;
            }
          }
        }

        const enemyCmd =
          enemyTeam === 'BLUE' ? w.blueCommander : w.redCommander;
        if (targetX === null && !enemyCmd.dead) {
          const d = Math.hypot(
            enemyCmd.x - structure.x,
            enemyCmd.y - structure.y
          );
          if (d <= turretRange) {
            targetX = enemyCmd.x;
            targetY = enemyCmd.y;
          }
        }

        if (targetX !== null && targetY !== null) {
          structure.attackCd = fireInterval;
          const ang = Math.atan2(targetY - structure.y, targetX - structure.x);
          w.projectiles.push({
            id: w.nextEntityId++,
            team: structure.team,
            x: structure.x + Math.cos(ang) * 32,
            y: structure.y - 16 + Math.sin(ang) * 32,
            vx: Math.cos(ang) * 480,
            vy: Math.sin(ang) * 480,
            damage: turretDamage,
            radius: 6.5,
            life: 0.78,
            color: structure.team === 'BLUE' ? '#60a5fa' : '#f87171',
          });
        }
      };

      updateDefensiveTurret(w.blueOutpost, 265, 45, 0.95);
      updateDefensiveTurret(w.redOutpost, 265, 45, 0.95);
      updateDefensiveTurret(w.blueCitadel, 315, 62, 0.85);
      updateDefensiveTurret(w.redCitadel, 315, 62, 0.85);

      // ------------------------------------------------------------------------
      // 7. UPDATE PROJECTILES
      // ------------------------------------------------------------------------
      for (let i = w.projectiles.length - 1; i >= 0; i--) {
        const p = w.projectiles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;

        let consumed = false;
        const enemyTeam: Team = p.team === 'BLUE' ? 'RED' : 'BLUE';
        const enemyCmd =
          enemyTeam === 'BLUE' ? w.blueCommander : w.redCommander;
        const enemyOutpost =
          enemyTeam === 'BLUE' ? w.blueOutpost : w.redOutpost;
        const enemyCitadel =
          enemyTeam === 'BLUE' ? w.blueCitadel : w.redCitadel;

        for (const m of w.minions) {
          if (m.team !== enemyTeam || m.hp <= 0) continue;
          if (Math.hypot(m.x - p.x, m.y - p.y) <= m.radius + p.radius) {
            const dmg = m.shieldBlock
              ? Math.round(p.damage * (1 - m.shieldBlock * 1.4))
              : p.damage;
            m.hp -= dmg;
            m.hitFlash = 0.1;
            addParticles(p.x, p.y, p.color, 4, 90);
            consumed = true;
            break;
          }
        }

        if (
          !consumed &&
          !enemyCmd.dead &&
          enemyCmd.dashTimer <= 0 &&
          Math.hypot(enemyCmd.x - p.x, enemyCmd.y - p.y) <=
            enemyCmd.radius + p.radius
        ) {
          const dmg =
            enemyCmd.shieldTimer > 0 ? Math.round(p.damage * 0.25) : p.damage;
          enemyCmd.hp -= dmg;
          enemyCmd.hitFlash = 0.12;
          addParticles(p.x, p.y, p.color, 5, 100);
          consumed = true;
          if (enemyCmd.hp <= 0) {
            handleCommanderDeath(enemyCmd, p.team, false);
          }
        }

        if (
          !consumed &&
          enemyOutpost.hp > 0 &&
          Math.hypot(enemyOutpost.x - p.x, enemyOutpost.y - p.y) <=
            enemyOutpost.radius + p.radius
        ) {
          enemyOutpost.hp = Math.max(
            0,
            enemyOutpost.hp - Math.max(1, Math.round(p.damage * 0.7))
          );
          enemyOutpost.hitFlash = 0.1;
          addParticles(p.x, p.y, p.color, 4, 80);
          consumed = true;
          if (enemyOutpost.hp <= 0) {
            checkOutpostDestruction(enemyOutpost, p.team);
          }
        }

        if (
          !consumed &&
          Math.hypot(enemyCitadel.x - p.x, enemyCitadel.y - p.y) <=
            enemyCitadel.radius + p.radius
        ) {
          if (enemyOutpost.hp <= 0) {
            enemyCitadel.hp = Math.max(
              0,
              enemyCitadel.hp - Math.max(1, Math.round(p.damage * 0.65))
            );
            enemyCitadel.hitFlash = 0.1;
          }
          addParticles(p.x, p.y, p.color, 4, 80);
          consumed = true;
        }

        if (consumed || p.life <= 0) {
          w.projectiles.splice(i, 1);
        }
      }

      // ------------------------------------------------------------------------
      // 8. CLEANUP SLAIN MINIONS & AWARD KILL BOUNTIES
      // ------------------------------------------------------------------------
      for (let i = w.minions.length - 1; i >= 0; i--) {
        const m = w.minions[i];
        if (m.hp <= 0) {
          const killerTeam: Team = m.team === 'BLUE' ? 'RED' : 'BLUE';
          if (killerTeam === 'BLUE') {
            w.blueGold += m.bounty;
          } else {
            w.redGold += m.bounty;
          }
          addParticles(
            m.x,
            m.y,
            m.team === 'BLUE' ? '#38bdf8' : '#ef4444',
            12,
            150
          );
          addFloatingText(
            m.x,
            m.y - 10,
            `+${m.bounty}g`,
            killerTeam === 'BLUE' ? '#fde047' : '#fca5a5',
            0.95
          );
          w.minions.splice(i, 1);
        }
      }

      // ------------------------------------------------------------------------
      // 9. UPDATE PARTICLES, SHOCKWAVES, FLOATING TEXT
      // ------------------------------------------------------------------------
      for (let i = w.particles.length - 1; i >= 0; i--) {
        const pt = w.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        pt.alpha = Math.max(0, pt.life / pt.maxLife);
        if (pt.life <= 0) w.particles.splice(i, 1);
      }

      for (let i = w.shockwaves.length - 1; i >= 0; i--) {
        const sw = w.shockwaves[i];
        sw.life -= dt;
        const progress = 1 - sw.life / sw.maxLife;
        sw.radius = 8 + (sw.maxRadius - 8) * progress;
        if (sw.life <= 0) w.shockwaves.splice(i, 1);
      }

      for (let i = w.floatingTexts.length - 1; i >= 0; i--) {
        const ft = w.floatingTexts[i];
        ft.y += ft.vy * dt;
        ft.life -= dt;
        if (ft.life <= 0) w.floatingTexts.splice(i, 1);
      }

      // ------------------------------------------------------------------------
      // 10. AUTHORITATIVE WORLD SYNC BROADCAST (BLUE HOST -> RED CHALLENGER)
      // ------------------------------------------------------------------------
      if (matchMode === 'ONLINE_1V1' && myTeam === 'BLUE') {
        netWorldSyncAccumulator += dt;
        if (netWorldSyncAccumulator >= 0.05) {
          netWorldSyncAccumulator = 0;
          sendWs({
            type: 'world:sync',
            matchTime: Number(w.matchTime.toFixed(2)),
            blueGold: Math.floor(w.blueGold),
            redGold: Math.floor(w.redGold),
            blueForgeTier: w.blueForgeTier,
            redForgeTier: w.redForgeTier,
            blueBerserkTimer: Number(w.blueBerserkTimer.toFixed(2)),
            redBerserkTimer: Number(w.redBerserkTimer.toFixed(2)),
            blueCitadelHp: Math.ceil(w.blueCitadel.hp),
            redCitadelHp: Math.ceil(w.redCitadel.hp),
            blueOutpostHp: Math.ceil(w.blueOutpost.hp),
            redOutpostHp: Math.ceil(w.redOutpost.hp),
            altar: w.altar,
            blueCmd: {
              hp: Math.ceil(w.blueCommander.hp),
              dead: w.blueCommander.dead,
              respawnTimer: Number(w.blueCommander.respawnTimer.toFixed(2)),
              kills: w.blueCommander.kills,
            },
            redCmd: {
              hp: Math.ceil(w.redCommander.hp),
              dead: w.redCommander.dead,
              respawnTimer: Number(w.redCommander.respawnTimer.toFixed(2)),
              kills: w.redCommander.kills,
            },
            minions: w.minions.map((m) => ({
              id: m.id,
              team: m.team,
              kind: m.kind,
              x: Math.round(m.x),
              y: Math.round(m.y),
              facing: Number(m.facing.toFixed(2)),
              hp: Math.ceil(m.hp),
              maxHp: m.maxHp,
            })),
          });
        }
      }

      // ------------------------------------------------------------------------
      // 11. CHECK WIN CONDITIONS
      // ------------------------------------------------------------------------
      if (
        (matchMode !== 'ONLINE_1V1' || myTeam === 'BLUE') &&
        (w.blueCitadel.hp <= 0 || w.redCitadel.hp <= 0 || timeRemaining <= 0)
      ) {
        let winner: Team = 'BLUE';
        let reason = 'Enemy Citadel Destroyed!';
        if (w.redCitadel.hp <= 0) {
          winner = 'BLUE';
          reason = 'Red Citadel Reduced to Rubble!';
        } else if (w.blueCitadel.hp <= 0) {
          winner = 'RED';
          reason = 'Blue Citadel Reduced to Rubble!';
        } else {
          winner = w.blueCitadel.hp >= w.redCitadel.hp ? 'BLUE' : 'RED';
          reason = `Sudden Death Timer Expired (${Math.ceil(w.blueCitadel.hp)} vs ${Math.ceil(w.redCitadel.hp)} HP)`;
        }

        const summary = {
          winner,
          reason,
          duration: Math.round(w.matchTime),
          blueKills: w.blueCommander.kills,
          redKills: w.redCommander.kills,
          blueUnits: w.blueCommander.unitsSpawned,
          redUnits: w.redCommander.unitsSpawned,
        };

        if (matchMode === 'ONLINE_1V1') {
          sendWs({ type: 'match:over', winnerInfo: summary });
        }

        setWinnerInfo(summary);
        setGameState('GAME_OVER');
      }
    };

    // ==========================================================================
    // CANVAS RENDERING ENGINE
    // ==========================================================================
    const renderWorld = (dt: number) => {
      const canvas = canvasRef.current;
      const w = worldRef.current;
      if (!canvas || !w) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (
        canvas.width !== Math.floor(rect.width * dpr) ||
        canvas.height !== Math.floor(rect.height * dpr)
      ) {
        canvas.width = Math.floor(rect.width * dpr);
        canvas.height = Math.floor(rect.height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      const viewW = rect.width;
      const viewH = rect.height;

      let scale: number;
      if (cameraMode === 'ARENA') {
        scale = Math.min(viewW / WORLD_WIDTH, viewH / WORLD_HEIGHT);
      } else {
        const targetVisibleWidth = viewW < 768 ? 1050 : 1420;
        scale = Math.max(viewH / WORLD_HEIGHT, viewW / targetVisibleWidth);
      }

      const visibleWorldW = viewW / scale;
      const focusedCmd =
        matchMode === 'ONLINE_1V1' && myTeam === 'RED'
          ? w.redCommander
          : w.blueCommander;
      const fallbackX =
        focusedCmd.team === 'BLUE'
          ? BLUE_CITADEL_X + visibleWorldW * 0.35
          : RED_CITADEL_X - visibleWorldW * 0.35;
      const targetCamX = focusedCmd.dead ? fallbackX : focusedCmd.x;
      w.cameraX += (targetCamX - w.cameraX) * Math.min(1, dt * 8);

      const minCamX = visibleWorldW / 2;
      const maxCamX = Math.max(minCamX, WORLD_WIDTH - visibleWorldW / 2);
      const clampedCamX =
        cameraMode === 'ARENA'
          ? WORLD_WIDTH / 2
          : Math.max(minCamX, Math.min(maxCamX, w.cameraX));

      const shakeX = (Math.random() - 0.5) * w.shakeIntensity;
      const shakeY = (Math.random() - 0.5) * w.shakeIntensity;

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, viewW, viewH);

      ctx.translate(viewW / 2 + shakeX, viewH / 2 + shakeY);
      ctx.scale(scale, scale);
      ctx.translate(-clampedCamX, -(WORLD_HEIGHT / 2));

      // Battlefield Lane
      const laneGrad = ctx.createLinearGradient(0, LANE_TOP, 0, LANE_BOTTOM);
      laneGrad.addColorStop(0, '#0f172a');
      laneGrad.addColorStop(0.5, '#1e293b');
      laneGrad.addColorStop(1, '#0f172a');
      ctx.fillStyle = laneGrad;
      ctx.fillRect(40, LANE_TOP, WORLD_WIDTH - 80, LANE_BOTTOM - LANE_TOP);

      const territoryGrad = ctx.createLinearGradient(0, 0, WORLD_WIDTH, 0);
      territoryGrad.addColorStop(0, 'rgba(56, 189, 248, 0.10)');
      territoryGrad.addColorStop(0.45, 'rgba(15, 23, 42, 0)');
      territoryGrad.addColorStop(0.55, 'rgba(15, 23, 42, 0)');
      territoryGrad.addColorStop(1, 'rgba(239, 68, 68, 0.10)');
      ctx.fillStyle = territoryGrad;
      ctx.fillRect(40, LANE_TOP, WORLD_WIDTH - 80, LANE_BOTTOM - LANE_TOP);

      ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
      ctx.lineWidth = 2;
      for (let gx = 100; gx < WORLD_WIDTH; gx += 100) {
        ctx.beginPath();
        ctx.moveTo(gx, LANE_TOP);
        ctx.lineTo(gx, LANE_BOTTOM);
        ctx.stroke();
      }
      for (let gy = LANE_TOP; gy <= LANE_BOTTOM; gy += 90) {
        ctx.beginPath();
        ctx.moveTo(40, gy);
        ctx.lineTo(WORLD_WIDTH - 40, gy);
        ctx.stroke();
      }

      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, WORLD_WIDTH, LANE_TOP);
      ctx.fillRect(0, LANE_BOTTOM, WORLD_WIDTH, WORLD_HEIGHT - LANE_BOTTOM);

      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(40, LANE_TOP);
      ctx.lineTo(WORLD_WIDTH - 40, LANE_TOP);
      ctx.moveTo(40, LANE_BOTTOM);
      ctx.lineTo(WORLD_WIDTH - 40, LANE_BOTTOM);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.22)';
      ctx.setLineDash([12, 12]);
      ctx.beginPath();
      ctx.moveTo(WORLD_WIDTH / 2, LANE_TOP + 10);
      ctx.lineTo(WORLD_WIDTH / 2, LANE_BOTTOM - 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Soul Altar (Animated Arcane Summoning Circle)
      const altar = w.altar;
      ctx.save();
      ctx.translate(altar.x, altar.y);

      const altarPulse = Math.sin(w.matchTime * 4) * 0.08 + 1;
      ctx.beginPath();
      ctx.arc(0, 0, altar.radius, 0, Math.PI * 2);
      ctx.fillStyle = altar.active
        ? 'rgba(168, 85, 247, 0.16)'
        : 'rgba(30, 41, 59, 0.35)';
      ctx.fill();
      ctx.lineWidth = altar.active ? 3.5 : 2;
      ctx.strokeStyle = altar.active ? '#c084fc' : '#475569';
      ctx.stroke();

      // Rotating inner rune ring
      ctx.save();
      ctx.rotate(w.matchTime * (altar.active ? 0.9 : 0.25));
      ctx.strokeStyle = altar.active
        ? 'rgba(216, 180, 254, 0.45)'
        : 'rgba(100, 116, 139, 0.25)';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]);
      ctx.beginPath();
      ctx.arc(0, 0, altar.radius * 0.68, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 4 Cardinal Rune Pillars
      for (let i = 0; i < 4; i++) {
        const pAng = (i * Math.PI) / 2;
        const px = Math.cos(pAng) * (altar.radius - 10);
        const py = Math.sin(pAng) * (altar.radius - 10);
        ctx.fillStyle = altar.active ? '#e879f9' : '#475569';
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (altar.active && Math.abs(altar.progress) > 0.01) {
        const frac = Math.min(
          1,
          Math.abs(altar.progress) / altar.captureDuration
        );
        ctx.beginPath();
        ctx.arc(
          0,
          0,
          altar.radius - 5,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * frac
        );
        ctx.strokeStyle = altar.progress > 0 ? '#38bdf8' : '#f43f5e';
        ctx.lineWidth = 8;
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.arc(0, 0, 26 * altarPulse, 0, Math.PI * 2);
      ctx.fillStyle = altar.active ? '#581c87' : '#1e293b';
      ctx.fill();
      ctx.strokeStyle = altar.active ? '#f0abfc' : '#64748b';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.fillStyle = altar.active ? '#fae8ff' : '#94a3b8';
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        altar.active
          ? altar.capturingTeam === 'CONTESTED'
            ? 'CONTESTED!'
            : 'SOUL ALTAR'
          : `ALTAR ${Math.ceil(altar.cooldownTimer)}S`,
        0,
        4
      );
      ctx.restore();

      // Top & Bottom Alcove Vitality Runes (+220 HP, +25G, Skill CD Reset)
      for (const rune of w.runes) {
        ctx.save();
        ctx.translate(rune.x, rune.y);
        const rPulse = 1 + Math.sin(w.matchTime * 5) * 0.1;

        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fillStyle = rune.active
          ? 'rgba(16, 185, 129, 0.16)'
          : 'rgba(30, 41, 59, 0.35)';
        ctx.fill();
        ctx.strokeStyle = rune.active ? '#34d399' : '#475569';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (rune.active) {
          ctx.save();
          ctx.scale(rPulse, rPulse);
          ctx.fillStyle = '#10b981';
          ctx.strokeStyle = '#ecfdf5';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -13);
          ctx.lineTo(11, 0);
          ctx.lineTo(0, 13);
          ctx.lineTo(-11, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          ctx.fillStyle = '#a7f3d0';
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('VITALITY RUNE', 0, -32);
        } else {
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(`${Math.ceil(rune.respawnTimer)}s`, 0, 4);
        }
        ctx.restore();
      }

      // Rally Banners
      for (const b of w.banners) {
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fillStyle =
          b.team === 'BLUE'
            ? 'rgba(16, 185, 129, 0.13)'
            : 'rgba(245, 158, 11, 0.13)';
        ctx.fill();
        ctx.strokeStyle = b.team === 'BLUE' ? '#10b981' : '#f59e0b';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 8);
        ctx.lineTo(0, -34);
        ctx.stroke();

        const flagWave = Math.sin(w.matchTime * 10 + b.id) * 3;
        ctx.fillStyle = b.team === 'BLUE' ? '#10b981' : '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(0, -34);
        ctx.lineTo(26, -24 + flagWave);
        ctx.lineTo(0, -14);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // Citadels (Gothic Warlord Bastions with Corner Turrets & Arcane Core)
      const drawCitadel = (c: Citadel) => {
        ctx.save();
        ctx.translate(c.x, c.y);

        // Ground Moat / Foundation Shadow
        ctx.beginPath();
        ctx.arc(0, 8, c.radius + 10, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(2, 6, 23, 0.65)';
        ctx.fill();

        // Outer Defensive Range Ring (subtle)
        ctx.beginPath();
        ctx.arc(0, 0, 285, 0, Math.PI * 2);
        ctx.strokeStyle =
          c.team === 'BLUE'
            ? 'rgba(56, 189, 248, 0.08)'
            : 'rgba(244, 63, 94, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 10]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Octagonal Stone Bastion Base
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4 + Math.PI / 8;
          const rx = Math.cos(ang) * c.radius;
          const ry = Math.sin(ang) * c.radius;
          if (i === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        const bastionGrad = ctx.createRadialGradient(0, -12, 8, 0, 0, c.radius);
        bastionGrad.addColorStop(
          0,
          c.hitFlash > 0
            ? '#ffffff'
            : c.team === 'BLUE'
            ? '#1e40af'
            : '#991b1b'
        );
        bastionGrad.addColorStop(
          1,
          c.hitFlash > 0
            ? '#e2e8f0'
            : c.team === 'BLUE'
            ? '#0f172a'
            : '#450a0a'
        );
        ctx.fillStyle = bastionGrad;
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = c.team === 'BLUE' ? '#38bdf8' : '#f43f5e';
        ctx.stroke();

        // 4 Corner Battlement Towers
        for (let i = 0; i < 4; i++) {
          const tAng = (i * Math.PI) / 2 + Math.PI / 4;
          const tx = Math.cos(tAng) * (c.radius * 0.78);
          const ty = Math.sin(tAng) * (c.radius * 0.78);
          ctx.fillStyle = '#1e293b';
          ctx.strokeStyle = c.team === 'BLUE' ? '#7dd3fc' : '#fda4af';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(tx, ty, 13, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        // Inner Sanctum Keep
        ctx.beginPath();
        ctx.roundRect(-28, -28, 56, 56, 12);
        ctx.fillStyle = c.team === 'BLUE' ? '#172554' : '#4c0519';
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.5;
        ctx.fill();
        ctx.stroke();

        // Levitating Arcane Turret Crystal Core
        const corePulse = 1 + Math.sin(w.matchTime * 6) * 0.08;
        ctx.save();
        ctx.scale(corePulse, corePulse);
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.lineTo(18, 0);
        ctx.lineTo(0, 22);
        ctx.lineTo(-18, 0);
        ctx.closePath();
        ctx.fillStyle = c.team === 'BLUE' ? '#38bdf8' : '#fb7185';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();

        // Citadel Overhead Health Bar & Outpost Arcane Shield
        const isShieldedByOutpost =
          c.team === 'BLUE' ? w.blueOutpost.hp > 0 : w.redOutpost.hp > 0;
        if (isShieldedByOutpost) {
          ctx.beginPath();
          ctx.arc(0, 0, c.radius + 13, 0, Math.PI * 2);
          ctx.strokeStyle =
            c.team === 'BLUE'
              ? 'rgba(56, 189, 248, 0.78)'
              : 'rgba(251, 113, 133, 0.78)';
          ctx.lineWidth = 3.5;
          ctx.setLineDash([10, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        const barW = 118;
        const barH = 11;
        const hpRatio = Math.max(0, c.hp / c.maxHp);
        ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
        ctx.beginPath();
        ctx.roundRect(-barW / 2 - 1, -c.radius - 29, barW + 2, barH + 2, 4);
        ctx.fill();

        ctx.fillStyle = isShieldedByOutpost
          ? '#fbbf24'
          : c.team === 'BLUE'
          ? '#38bdf8'
          : '#f43f5e';
        ctx.beginPath();
        ctx.roundRect(
          -barW / 2,
          -c.radius - 28,
          barW * hpRatio,
          barH,
          3
        );
        ctx.fill();

        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          isShieldedByOutpost
            ? `🛡 SHIELDED (${Math.ceil(c.hp)})`
            : `${Math.ceil(c.hp)} / ${c.maxHp}`,
          0,
          -c.radius - 34
        );

        ctx.restore();
      };

      // Frontline Outpost Towers & Arcane Conduit Beams
      const drawOutpost = (outpost: Citadel, parentCitadel: Citadel) => {
        if (outpost.hp <= 0) {
          // Ruined Outpost Foundation Crater (Forward Spawn Beacon)
          ctx.save();
          ctx.translate(outpost.x, outpost.y);
          ctx.beginPath();
          ctx.arc(0, 0, outpost.radius * 0.85, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 6]);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = '#64748b';
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('OUTPOST RUINS', 0, 4);
          ctx.restore();
          return;
        }

        // Arcane Shield Conduit Beam connecting Outpost to Citadel
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(outpost.x, outpost.y);
        ctx.lineTo(parentCitadel.x, parentCitadel.y);
        ctx.strokeStyle =
          outpost.team === 'BLUE'
            ? 'rgba(56, 189, 248, 0.28)'
            : 'rgba(244, 63, 94, 0.28)';
        ctx.lineWidth = 6;
        ctx.setLineDash([14, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        ctx.save();
        ctx.translate(outpost.x, outpost.y);

        // Turret Range Ring
        ctx.beginPath();
        ctx.arc(0, 0, 265, 0, Math.PI * 2);
        ctx.strokeStyle =
          outpost.team === 'BLUE'
            ? 'rgba(56, 189, 248, 0.08)'
            : 'rgba(244, 63, 94, 0.08)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        // Hexagonal Outpost Bastion
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI) / 3;
          const rx = Math.cos(ang) * outpost.radius;
          const ry = Math.sin(ang) * outpost.radius;
          if (i === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.fillStyle =
          outpost.hitFlash > 0
            ? '#ffffff'
            : outpost.team === 'BLUE'
            ? '#1e3a8a'
            : '#7f1d1d';
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = outpost.team === 'BLUE' ? '#38bdf8' : '#fb7185';
        ctx.stroke();

        // Inner Sentinel Turret Spire
        const pulse = 1 + Math.sin(w.matchTime * 6) * 0.08;
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, Math.PI * 2);
        ctx.fillStyle = outpost.team === 'BLUE' ? '#38bdf8' : '#f43f5e';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.restore();

        // Outpost Health Bar
        const bw = 86;
        const bh = 8;
        const ratio = Math.max(0, outpost.hp / outpost.maxHp);
        ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
        ctx.beginPath();
        ctx.roundRect(-bw / 2 - 1, -outpost.radius - 23, bw + 2, bh + 2, 3);
        ctx.fill();

        ctx.fillStyle = outpost.team === 'BLUE' ? '#38bdf8' : '#fb7185';
        ctx.beginPath();
        ctx.roundRect(-bw / 2, -outpost.radius - 22, bw * ratio, bh, 2);
        ctx.fill();

        ctx.fillStyle = '#e2e8f0';
        ctx.font = 'bold 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillText(
          `OUTPOST ${Math.ceil(outpost.hp)}`,
          0,
          -outpost.radius - 27
        );

        ctx.restore();
      };

      drawOutpost(w.blueOutpost, w.blueCitadel);
      drawOutpost(w.redOutpost, w.redCitadel);
      drawCitadel(w.blueCitadel);
      drawCitadel(w.redCitadel);

      // Minions (High-Craft Minimalist Character Art)
      for (const m of w.minions) {
        if (m.hp <= 0) continue;
        ctx.save();
        ctx.translate(m.x, m.y);

        const isBerserk =
          (m.team === 'BLUE' && w.blueBerserkTimer > 0) ||
          (m.team === 'RED' && w.redBerserkTimer > 0);

        const speedLen = Math.hypot(m.vx, m.vy);
        const isMoving = speedLen > 5;
        const phase = w.matchTime * 13 + m.id * 1.9;
        const walkCycle = isMoving ? Math.sin(phase) : 0;
        const breathe = Math.sin(w.matchTime * 4 + m.id) * 0.035;
        const bobY = isMoving ? Math.abs(walkCycle) * -3.2 : Math.sin(w.matchTime * 4 + m.id) * -0.8;
        const leanAngle = isMoving ? 0.11 : 0;
        const strikeProgress =
          m.attackAnim > 0 ? Math.sin((m.attackAnim / 0.18) * Math.PI) : 0;
        const strikeLunge = strikeProgress * 7.5;
        const flipX = Math.cos(m.facing) < 0 ? -1 : 1;

        // Soft ambient ground shadow
        ctx.beginPath();
        ctx.ellipse(
          0,
          m.radius * 0.72,
          m.radius * 0.92,
          m.radius * 0.36,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = 'rgba(2, 6, 23, 0.55)';
        ctx.fill();

        // Berserk crimson-gold ground rune ring
        if (isBerserk) {
          ctx.beginPath();
          ctx.ellipse(
            0,
            m.radius * 0.65,
            m.radius + 7,
            (m.radius + 7) * 0.45,
            0,
            0,
            Math.PI * 2
          );
          ctx.fillStyle = 'rgba(239, 68, 68, 0.28)';
          ctx.fill();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        const isHit = m.hitFlash > 0;
        const teamMain = isHit
          ? '#ffffff'
          : m.team === 'BLUE'
          ? '#3b82f6'
          : '#ef4444';
        const teamDeep = isHit
          ? '#f8fafc'
          : m.team === 'BLUE'
          ? '#1d4ed8'
          : '#991b1b';
        const teamTrim = isHit
          ? '#ffffff'
          : m.team === 'BLUE'
          ? '#7dd3fc'
          : '#fda4af';
        const eyeGlow = m.team === 'BLUE' ? '#38bdf8' : '#fb7185';

        ctx.save();
        ctx.scale(flipX * (1 - breathe * 0.5), 1 + breathe);
        ctx.translate(strikeLunge, bobY);
        ctx.rotate(leanAngle);

        if (m.kind === 'VANGUARD') {
          // 1. VANGUARD FOOTMAN: Fluttering scarf, heraldic tabard, barbute knight helm, broadsword & kite shield
          const wave = Math.sin(w.matchTime * 11 + m.id) * 3;

          // Fluttering tail scarf behind shoulder
          ctx.fillStyle = teamDeep;
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(-4, -6);
          ctx.quadraticCurveTo(-12, -5 + wave * 0.5, -15, 1 + wave);
          ctx.lineTo(-9, 3 + wave * 0.6);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Animated Armored Boots
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(-5.5, 5 + walkCycle * 2.8, 4, 6, 2);
          ctx.roundRect(1.5, 5 - walkCycle * 2.8, 4, 6, 2);
          ctx.fill();
          ctx.stroke();

          // Heraldic Surcoat / Torso
          const torsoGrad = ctx.createLinearGradient(0, -6, 0, 8);
          torsoGrad.addColorStop(0, teamMain);
          torsoGrad.addColorStop(1, teamDeep);
          ctx.fillStyle = torsoGrad;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(-7.5, -5.5, 15, 13, 5);
          ctx.fill();
          ctx.stroke();

          // Center Surcoat Stripe & Belt
          ctx.fillStyle = teamTrim;
          ctx.fillRect(-1.5, -4.5, 3, 11);
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-7, 2, 14, 2.2);
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-1.8, 1.6, 3.6, 3);

          // Steel Barbute Helm (with metallic gradient & rim highlight)
          const helmGrad = ctx.createLinearGradient(-6, -17, 6, -5);
          helmGrad.addColorStop(0, isHit ? '#ffffff' : '#f8fafc');
          helmGrad.addColorStop(1, isHit ? '#e2e8f0' : '#94a3b8');
          ctx.fillStyle = helmGrad;
          ctx.beginPath();
          ctx.roundRect(-6.5, -16.5, 13, 12.5, 6);
          ctx.fill();
          ctx.stroke();

          // Glowing Y-Visor Slit
          ctx.fillStyle = '#090d16';
          ctx.fillRect(0.5, -12, 5.5, 2.4);
          ctx.fillStyle = eyeGlow;
          ctx.fillRect(1.8, -11.5, 3.2, 1.4);

          // Flowing Feather Plume on Helm
          ctx.fillStyle = teamMain;
          ctx.beginPath();
          ctx.moveTo(-1, -16.5);
          ctx.quadraticCurveTo(-6, -22, -10, -17 + wave * 0.4);
          ctx.quadraticCurveTo(-5, -15, -1, -16.5);
          ctx.fill();
          ctx.stroke();

          // Right Hand Broadsword (swings with slash trail)
          ctx.save();
          ctx.translate(5.5, -1);
          ctx.rotate(m.attackAnim > 0 ? 0.75 : -0.35);
          // Blade
          ctx.fillStyle = '#f8fafc';
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(0, -2.2);
          ctx.lineTo(14, -1.5);
          ctx.lineTo(17.5, 0);
          ctx.lineTo(14, 1.5);
          ctx.lineTo(0, 2.2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          // Gold Crossguard
          ctx.fillStyle = '#fbbf24';
          ctx.fillRect(-1.5, -4.5, 3, 9);
          ctx.restore();

          // Left Hand Heater / Kite Shield
          ctx.save();
          ctx.translate(-5.5, 0.5);
          ctx.fillStyle = teamDeep;
          ctx.strokeStyle = '#fde047';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(-4.5, -5.5);
          ctx.lineTo(4.5, -5.5);
          ctx.lineTo(4.5, 0);
          ctx.quadraticCurveTo(4.5, 5.5, 0, 7.5);
          ctx.quadraticCurveTo(-4.5, 5.5, -4.5, 0);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        } else if (m.kind === 'MARKSMAN') {
          // 2. ARCANE MARKSMAN: Sculpted ranger cowl, back quiver, luminous eyes, ornate recurve bow
          const wave = Math.sin(w.matchTime * 10 + m.id) * 2.5;

          // Back Quiver with Fletched Arrows
          ctx.fillStyle = '#451a03';
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 1.6;
          ctx.save();
          ctx.translate(-6, -6);
          ctx.rotate(-0.35);
          ctx.beginPath();
          ctx.roundRect(-2.5, -6, 5, 11, 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = teamTrim;
          ctx.fillRect(-2, -9, 1.5, 3);
          ctx.fillRect(0.8, -8.5, 1.5, 3);
          ctx.restore();

          // Agile Boots
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(-4.5, 5 + walkCycle * 2.5, 3.5, 5.5, 1.5);
          ctx.roundRect(1, 5 - walkCycle * 2.5, 3.5, 5.5, 1.5);
          ctx.fill();
          ctx.stroke();

          // Layered Ranger Cloak & Mantle
          const cloakGrad = ctx.createLinearGradient(0, -6, 0, 8);
          cloakGrad.addColorStop(0, teamMain);
          cloakGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = cloakGrad;
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-8.5 - wave * 0.3, 7.5);
          ctx.quadraticCurveTo(-7, -2, -5.5, -6);
          ctx.lineTo(5.5, -6);
          ctx.quadraticCurveTo(7.5, 0, 7.5, 7.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Gold Cloak Clasp
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.arc(1.5, -4, 2.2, 0, Math.PI * 2);
          ctx.fill();

          // Sculpted Pointed Ranger Hood
          ctx.fillStyle = teamMain;
          ctx.beginPath();
          ctx.moveTo(-6.5, -4.5);
          ctx.quadraticCurveTo(-8, -16, -3.5, -18.5);
          ctx.quadraticCurveTo(5.5, -16.5, 7, -6.5);
          ctx.quadraticCurveTo(2, -3.5, -6.5, -4.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // Shadowed Face Void & Luminous Arcane Eyes
          ctx.fillStyle = '#090d16';
          ctx.beginPath();
          ctx.arc(2, -10, 4.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#fef08a';
          ctx.beginPath();
          ctx.ellipse(3.2, -10.2, 2.2, 1.2, -0.1, 0, Math.PI * 2);
          ctx.fill();

          // Ornate Gilded Recurve Bow & Drawn Bowstring
          const drawPull = m.attackAnim > 0 ? 0 : 3.5;
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(6.5, -10);
          ctx.lineTo(4 - drawPull, -1.5);
          ctx.lineTo(6.5, 7);
          ctx.stroke();

          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.arc(4, -1.5, 9.5, -Math.PI * 0.44, Math.PI * 0.44);
          ctx.stroke();

          // Glowing Arcane Arrow Nocked
          ctx.strokeStyle = eyeGlow;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(4 - drawPull, -1.5);
          ctx.lineTo(16, -1.5);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(14.5, -4);
          ctx.lineTo(19, -1.5);
          ctx.lineTo(14.5, 1);
          ctx.closePath();
          ctx.fill();
        } else if (m.kind === 'BRUTE') {
          // 3. IRONCLAD BRUTE: Hulking gothic plate, horned greathelm, war-maul & runic tower shield
          // Sabatons (Heavy Iron Boots)
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.roundRect(-8, 8 + walkCycle * 2.2, 6, 7, 2);
          ctx.roundRect(2, 8 - walkCycle * 2.2, 6, 7, 2);
          ctx.fill();
          ctx.stroke();

          // Heavy Gothic Cuirass
          const plateGrad = ctx.createLinearGradient(0, -10, 0, 12);
          plateGrad.addColorStop(0, isHit ? '#ffffff' : '#64748b');
          plateGrad.addColorStop(0.5, teamMain);
          plateGrad.addColorStop(1, teamDeep);
          ctx.fillStyle = plateGrad;
          ctx.beginPath();
          ctx.roundRect(-13, -9, 26, 20, 7);
          ctx.fill();
          ctx.stroke();

          // Layered Shoulder Pauldrons with Rim Trim
          ctx.fillStyle = isHit ? '#ffffff' : '#cbd5e1';
          ctx.beginPath();
          ctx.arc(-12, -4, 6.5, 0, Math.PI * 2);
          ctx.arc(12, -4, 6.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Horned Greathelm
          ctx.fillStyle = '#e2e8f0';
          ctx.beginPath();
          ctx.moveTo(-6, -16);
          ctx.quadraticCurveTo(-13, -21, -11, -26);
          ctx.quadraticCurveTo(-8, -21, -4, -18);
          ctx.moveTo(6, -16);
          ctx.quadraticCurveTo(13, -21, 11, -26);
          ctx.quadraticCurveTo(8, -21, 4, -18);
          ctx.fill();
          ctx.stroke();

          const bruteHelmGrad = ctx.createLinearGradient(0, -21, 0, -7);
          bruteHelmGrad.addColorStop(0, isHit ? '#ffffff' : '#e2e8f0');
          bruteHelmGrad.addColorStop(1, '#64748b');
          ctx.fillStyle = bruteHelmGrad;
          ctx.beginPath();
          ctx.roundRect(-7.5, -19.5, 15, 12.5, 4);
          ctx.fill();
          ctx.stroke();

          // Glowing Ember T-Visor
          ctx.fillStyle = '#090d16';
          ctx.fillRect(-1.5, -15, 8, 2.5);
          ctx.fillRect(2, -15, 2.2, 6);
          ctx.fillStyle = eyeGlow;
          ctx.fillRect(0, -14.5, 5.5, 1.5);

          // Heavy War-Maul (Back Hand)
          ctx.save();
          ctx.translate(-12, -2);
          ctx.rotate(m.attackAnim > 0 ? 0.65 : -0.2);
          ctx.fillStyle = '#78350f';
          ctx.fillRect(-1.5, -14, 3, 18);
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.roundRect(-6, -19, 12, 7, 2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();

          // Massive Fortress Pavise Shield (Front Hand)
          ctx.save();
          ctx.translate(8, 0);
          const shieldGrad = ctx.createLinearGradient(0, -12, 0, 12);
          shieldGrad.addColorStop(0, teamMain);
          shieldGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = shieldGrad;
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.roundRect(-4.5, -11.5, 10, 23, 3.5);
          ctx.fill();
          ctx.stroke();

          // Glowing Shield Boss Rune
          ctx.fillStyle = '#7dd3fc';
          ctx.beginPath();
          ctx.arc(0.5, 0, 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (m.kind === 'SIEGE') {
          // 4. STEAM-RUNE SIEGE RAM: Ironclad juggernaut, rotating wheels, furnace glow & dragon ram
          const wheelRot = w.matchTime * (isMoving ? 8 : 0);

          // Heavy Spoked Iron Wheels
          for (const wx of [-12, 12]) {
            ctx.save();
            ctx.translate(wx, 11);
            ctx.rotate(wheelRot);
            ctx.fillStyle = '#1e293b';
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-6, 0);
            ctx.lineTo(6, 0);
            ctx.moveTo(0, -6);
            ctx.lineTo(0, 6);
            ctx.stroke();
            ctx.restore();
          }

          // Beveled Ironclad Hull
          const hullGrad = ctx.createLinearGradient(0, -13, 0, 11);
          hullGrad.addColorStop(0, isHit ? '#ffffff' : '#475569');
          hullGrad.addColorStop(1, '#0f172a');
          ctx.fillStyle = hullGrad;
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.6;
          ctx.beginPath();
          ctx.roundRect(-21, -12, 40, 22, 6);
          ctx.fill();
          ctx.stroke();

          // Team Banner Stripe & Glowing Furnace Grate
          ctx.fillStyle = teamMain;
          ctx.fillRect(-16, -9, 26, 6);
          ctx.fillStyle = '#fb923c';
          ctx.fillRect(-14, 1, 14, 4);

          // Armored Commander Cupola on Top
          ctx.fillStyle = teamDeep;
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(-3, -12, 8.5, Math.PI, 0);
          ctx.fill();
          ctx.stroke();

          // Gilded Dragon-Head Battering Ram Piston
          ctx.fillStyle = '#fbbf24';
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(18, -9);
          ctx.lineTo(29 + strikeLunge * 0.75, -3);
          ctx.lineTo(32 + strikeLunge * 0.75, 0);
          ctx.lineTo(29 + strikeLunge * 0.75, 3);
          ctx.lineTo(18, 9);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (m.kind === 'GOLEM') {
          // 5. ELDER SOUL GOLEM: Floating obsidian monolith colossus with arcane crystal core & floating pauldrons
          const floatOffset = Math.sin(w.matchTime * 5 + m.id) * 2.5;

          // Heavy Obsidian Legs
          ctx.fillStyle = '#1e1b4b';
          ctx.strokeStyle = '#090d16';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(-11, 11 + walkCycle * 3, 8, 9, 3);
          ctx.roundRect(3, 11 - walkCycle * 3, 8, 9, 3);
          ctx.fill();
          ctx.stroke();

          // Runic Monolith Torso
          const golemGrad = ctx.createLinearGradient(0, -18, 0, 16);
          golemGrad.addColorStop(0, isHit ? '#ffffff' : '#581c87');
          golemGrad.addColorStop(1, '#1e1b4b');
          ctx.fillStyle = golemGrad;
          ctx.strokeStyle = '#c084fc';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.roundRect(-18, -15, 36, 29, 9);
          ctx.fill();
          ctx.stroke();

          // Floating Runic Shoulder Monoliths
          ctx.fillStyle = '#7e22ce';
          ctx.beginPath();
          ctx.roundRect(-24, -14 + floatOffset, 7, 14, 3);
          ctx.roundRect(17, -14 - floatOffset, 7, 14, 3);
          ctx.fill();
          ctx.stroke();

          // Radiant Soul Crystal in Chest
          ctx.fillStyle = '#f0abfc';
          ctx.beginPath();
          ctx.moveTo(0, -8);
          ctx.lineTo(6, -1);
          ctx.lineTo(0, 6);
          ctx.lineTo(-6, -1);
          ctx.closePath();
          ctx.fill();

          // Horned Obsidian Head
          ctx.fillStyle = '#3b0764';
          ctx.beginPath();
          ctx.roundRect(-9.5, -27, 19, 13, 4);
          ctx.fill();
          ctx.stroke();

          // LuminousCyclops Visor
          ctx.fillStyle = '#fde047';
          ctx.fillRect(-3.5, -22, 10, 3.5);

          // Colossal Rune Fist
          ctx.fillStyle = '#6b21a8';
          ctx.beginPath();
          ctx.arc(19 + strikeLunge * 0.6, 2, 8.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }

        ctx.restore();

        // Sleek Beveled Micro-HP Bar
        if (m.hp < m.maxHp || m.kind === 'GOLEM' || m.kind === 'SIEGE') {
          const bw = m.radius * 2.1;
          const bh = 5;
          const by = -m.radius - 19;
          ctx.fillStyle = 'rgba(9, 13, 22, 0.9)';
          ctx.beginPath();
          ctx.roundRect(-bw / 2 - 1, by - 1, bw + 2, bh + 2, 3);
          ctx.fill();

          ctx.fillStyle = m.team === 'BLUE' ? '#38bdf8' : '#f43f5e';
          ctx.beginPath();
          ctx.roundRect(
            -bw / 2,
            by,
            bw * Math.max(0, m.hp / m.maxHp),
            bh,
            2
          );
          ctx.fill();
        }
        ctx.restore();
      }

      // Commanders (Heroic Warlord Miniature with Flowing Mantle & Runeblade)
      const drawCommander = (cmd: Commander, label: string) => {
        if (cmd.dead) return;
        ctx.save();
        ctx.translate(cmd.x, cmd.y);

        const isBerserk =
          (cmd.team === 'BLUE' && w.blueBerserkTimer > 0) ||
          (cmd.team === 'RED' && w.redBerserkTimer > 0);
        const isMoving = Math.hypot(cmd.vx, cmd.vy) > 5 || cmd.dashTimer > 0;
        const walkCycle = isMoving ? Math.sin(w.matchTime * 14) : 0;
        const breathe = Math.sin(w.matchTime * 4) * 0.04;
        const bobY = isMoving ? Math.abs(walkCycle) * -3.5 : Math.sin(w.matchTime * 4) * -1;
        const leanAngle = isMoving ? 0.12 : 0;
        const flipX = Math.cos(cmd.facing) < 0 ? -1 : 1;
        const capeWave = Math.sin(w.matchTime * 11) * 4;

        // Heroic Ground Aura & Shadow
        ctx.beginPath();
        ctx.ellipse(
          0,
          cmd.radius * 0.76,
          cmd.radius * 1.1,
          cmd.radius * 0.45,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle =
          cmd.team === 'BLUE'
            ? 'rgba(56, 189, 248, 0.22)'
            : 'rgba(244, 63, 94, 0.22)';
        ctx.fill();
        ctx.strokeStyle =
          cmd.team === 'BLUE'
            ? 'rgba(56, 189, 248, 0.65)'
            : 'rgba(244, 63, 94, 0.65)';
        ctx.lineWidth = 2;
        ctx.stroke();

        if (isBerserk) {
          ctx.beginPath();
          ctx.arc(0, 0, cmd.radius + 14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(245, 158, 11, 0.26)';
          ctx.fill();
        }

        if (cmd.shieldTimer > 0) {
          ctx.beginPath();
          ctx.arc(0, 0, cmd.radius + 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
          ctx.fill();
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Multi-Layer Crescent Cleave Slash Effect
        if (cmd.attackAnimTimer > 0) {
          const isThird = cmd.comboStep === 1;
          const arcRadius = isThird ? 92 : 76;
          const arcSpan = isThird ? Math.PI * 0.88 : Math.PI * 0.68;
          ctx.save();
          ctx.rotate(cmd.facing);
          ctx.beginPath();
          ctx.arc(0, 0, arcRadius, -arcSpan / 2, arcSpan / 2);
          ctx.strokeStyle =
            cmd.team === 'BLUE'
              ? 'rgba(56, 189, 248, 0.85)'
              : 'rgba(251, 113, 133, 0.85)';
          ctx.lineWidth = isThird ? 16 : 10;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, arcRadius + 4, -arcSpan * 0.4, arcSpan * 0.4);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.restore();
        }

        ctx.save();
        ctx.scale(flipX * (1 - breathe * 0.4), 1 + breathe);
        ctx.translate(0, bobY);
        ctx.rotate(leanAngle);

        // Billowing Royal War-Cape
        const capeGrad = ctx.createLinearGradient(-4, -12, -22, 16);
        capeGrad.addColorStop(0, cmd.team === 'BLUE' ? '#2563eb' : '#e11d48');
        capeGrad.addColorStop(1, cmd.team === 'BLUE' ? '#0f172a' : '#450a0a');
        ctx.fillStyle = capeGrad;
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(-5, -10);
        ctx.quadraticCurveTo(
          -18,
          -2 + capeWave * 0.4,
          -22 - Math.abs(walkCycle) * 4,
          14 + capeWave * 0.5
        );
        ctx.quadraticCurveTo(-11, 16, -2, 13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Armored Greaves
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.roundRect(-6.5, 9 + walkCycle * 2.8, 5, 6.5, 2);
        ctx.roundRect(1.5, 9 - walkCycle * 2.8, 5, 6.5, 2);
        ctx.fill();
        ctx.stroke();

        // Heroic Plate Cuirass
        const heroGrad = ctx.createLinearGradient(0, -10, 0, 12);
        heroGrad.addColorStop(
          0,
          cmd.hitFlash > 0
            ? '#ffffff'
            : cmd.team === 'BLUE'
            ? '#38bdf8'
            : '#fb7185'
        );
        heroGrad.addColorStop(
          1,
          cmd.hitFlash > 0
            ? '#f8fafc'
            : cmd.team === 'BLUE'
            ? '#0369a1'
            : '#9f1239'
        );
        ctx.fillStyle = heroGrad;
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.roundRect(-10.5, -8.5, 21, 19.5, 6.5);
        ctx.fill();
        ctx.stroke();

        // Golden Chest Diamond Emblem
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.moveTo(1, -4);
        ctx.lineTo(4.5, 0.5);
        ctx.lineTo(1, 5);
        ctx.lineTo(-2.5, 0.5);
        ctx.closePath();
        ctx.fill();

        // Articulated Gilded Pauldrons
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(-10.5, -4.5, 5.5, 0, Math.PI * 2);
        ctx.arc(10.5, -4.5, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Crowned Warlord Helm
        const cmdHelmGrad = ctx.createLinearGradient(0, -24, 0, -6);
        cmdHelmGrad.addColorStop(0, '#ffffff');
        cmdHelmGrad.addColorStop(1, '#cbd5e1');
        ctx.fillStyle = cmdHelmGrad;
        ctx.beginPath();
        ctx.roundRect(-8.5, -23.5, 17, 16, 7.5);
        ctx.fill();
        ctx.stroke();

        // Radiant Visor Eyes
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0.5, -17.5, 7.5, 3.2);
        ctx.fillStyle = cmd.team === 'BLUE' ? '#38bdf8' : '#fb7185';
        ctx.fillRect(2, -16.8, 5, 1.8);

        // Winged Golden Crown Crest
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.moveTo(-7, -21.5);
        ctx.lineTo(-4.5, -29);
        ctx.lineTo(0, -24.5);
        ctx.lineTo(4.5, -29);
        ctx.lineTo(7, -21.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Legendary Runic Greatsword
        ctx.save();
        ctx.translate(9, 0);
        ctx.rotate(cmd.attackAnimTimer > 0 ? 0.85 : -0.38);

        // Outer Blade
        ctx.fillStyle = '#f8fafc';
        ctx.strokeStyle = '#090d16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -3.5);
        ctx.lineTo(25, -2.2);
        ctx.lineTo(30, 0);
        ctx.lineTo(25, 2.2);
        ctx.lineTo(0, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing Energy Fuller down the center of the blade
        ctx.fillStyle = cmd.team === 'BLUE' ? '#38bdf8' : '#fb7185';
        ctx.fillRect(2, -1, 20, 2);

        // Winged Gold Crossguard & Pommel
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.roundRect(-2.5, -7, 4.5, 14, 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        ctx.restore();

        // Player Nameplate
        ctx.fillStyle = cmd.team === 'BLUE' ? '#bae6fd' : '#fecdd3';
        ctx.font = 'bold 11px "Outfit", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, cmd.radius + 22);

        if (cmd.stunTimer > 0) {
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 12px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('STUNNED', 0, -cmd.radius - 40);
        }

        const isExecute = cmd.hp / cmd.maxHp <= 0.15;
        if (isExecute) {
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 13px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⚔ EXECUTE!', 0, -cmd.radius - 40);
        }

        const barW = 68;
        const barH = 8;
        const by = -cmd.radius - 29;
        ctx.fillStyle = 'rgba(9, 13, 22, 0.94)';
        ctx.beginPath();
        ctx.roundRect(-barW / 2 - 1, by - 1, barW + 2, barH + 2, 4);
        ctx.fill();

        ctx.fillStyle = isExecute
          ? '#ef4444'
          : cmd.team === 'BLUE'
          ? '#38bdf8'
          : '#f43f5e';
        ctx.beginPath();
        ctx.roundRect(
          -barW / 2,
          by,
          barW * Math.max(0, cmd.hp / cmd.maxHp),
          barH,
          3
        );
        ctx.fill();

        // Gemini AI Commander Speech Bubble Callout
        if (
          matchMode === 'AI' &&
          cmd.team === 'RED' &&
          aiBrainRef.current.speechTimer > 0 &&
          aiBrainRef.current.battleCry
        ) {
          const cry = aiBrainRef.current.battleCry;
          ctx.font = 'bold 11px "Outfit", sans-serif';
          const textW = Math.min(240, ctx.measureText(cry).width + 20);
          const bubbleY = -cmd.radius - 58;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
          ctx.strokeStyle = '#fb7185';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.roundRect(-textW / 2, bubbleY - 18, textW, 22, 6);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#ffe4e6';
          ctx.textAlign = 'center';
          ctx.fillText(cry, 0, bubbleY - 3);
        }

        ctx.restore();
      };

      drawCommander(w.blueCommander, matchPlayers.blueName);
      drawCommander(w.redCommander, matchPlayers.redName);

      // Directional Glowing Arcane Bolts & Turret Lances
      for (const p of w.projectiles) {
        const ang = Math.atan2(p.vy, p.vx);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);

        // Glowing Bolt Tail
        const tailGrad = ctx.createLinearGradient(-18, 0, 6, 0);
        tailGrad.addColorStop(0, 'rgba(255,255,255,0)');
        tailGrad.addColorStop(1, p.color);
        ctx.fillStyle = tailGrad;
        ctx.beginPath();
        ctx.roundRect(-18, -p.radius * 0.65, 22, p.radius * 1.3, p.radius);
        ctx.fill();

        // Spearhead Energy Core
        ctx.beginPath();
        ctx.arc(2, 0, p.radius * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = p.color;
        ctx.stroke();
        ctx.restore();
      }

      for (const sw of w.shockwaves) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, sw.life / sw.maxLife);
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.lineWidth = sw.lineWidth;
        ctx.stroke();
        ctx.restore();
      }

      for (const pt of w.particles) {
        ctx.save();
        ctx.globalAlpha = pt.alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.radius, 0, Math.PI * 2);
        ctx.fillStyle = pt.color;
        ctx.fill();
        ctx.restore();
      }

      for (const ft of w.floatingTexts) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.life / ft.maxLife);
        ctx.font = `bold ${Math.round(14 * ft.scale)}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#090d16';
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      ctx.restore();

      // ======================================================================
      // SCREEN-SPACE TACTICAL LANE MINI-MAP RADAR (Top-Center below HUD)
      // ======================================================================
      const mapW = Math.min(260, viewW * 0.42);
      const mapH = 22;
      const mapX = (viewW - mapW) / 2;
      const mapY = 58;

      ctx.save();
      ctx.fillStyle = 'rgba(9, 13, 22, 0.82)';
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(mapX, mapY, mapW, mapH, 6);
      ctx.fill();
      ctx.stroke();

      // Center Altar Marker on Minimap
      ctx.fillStyle = w.altar.active ? '#c084fc' : '#475569';
      ctx.beginPath();
      ctx.arc(mapX + mapW / 2, mapY + mapH / 2, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Citadel & Outpost Markers on Minimap
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(mapX + 5, mapY + 5, 5, mapH - 10);
      if (w.blueOutpost.hp > 0) {
        ctx.fillRect(
          mapX + (BLUE_OUTPOST_X / WORLD_WIDTH) * mapW - 2,
          mapY + 6,
          4,
          mapH - 12
        );
      }
      ctx.fillStyle = '#f43f5e';
      ctx.fillRect(mapX + mapW - 10, mapY + 5, 5, mapH - 10);
      if (w.redOutpost.hp > 0) {
        ctx.fillRect(
          mapX + (RED_OUTPOST_X / WORLD_WIDTH) * mapW - 2,
          mapY + 6,
          4,
          mapH - 12
        );
      }

      // Minion Dots
      for (const m of w.minions) {
        if (m.hp <= 0) continue;
        const mx = mapX + (m.x / WORLD_WIDTH) * mapW;
        const my =
          mapY +
          4 +
          ((m.y - LANE_TOP) / (LANE_BOTTOM - LANE_TOP)) * (mapH - 8);
        ctx.fillStyle = m.team === 'BLUE' ? '#7dd3fc' : '#fda4af';
        ctx.fillRect(mx - 1.5, my - 1.5, 3, 3);
      }

      // Hero Commander Markers
      if (!w.blueCommander.dead) {
        const bx = mapX + (w.blueCommander.x / WORLD_WIDTH) * mapW;
        const by =
          mapY +
          4 +
          ((w.blueCommander.y - LANE_TOP) / (LANE_BOTTOM - LANE_TOP)) *
            (mapH - 8);
        ctx.fillStyle = '#38bdf8';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      if (!w.redCommander.dead) {
        const rx = mapX + (w.redCommander.x / WORLD_WIDTH) * mapW;
        const ry =
          mapY +
          4 +
          ((w.redCommander.y - LANE_TOP) / (LANE_BOTTOM - LANE_TOP)) *
            (mapH - 8);
        ctx.fillStyle = '#f43f5e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(rx, ry, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Camera Viewport Indicator Box
      const camLeftFrac = Math.max(
        0,
        (clampedCamX - visibleWorldW / 2) / WORLD_WIDTH
      );
      const camWidthFrac = Math.min(
        1 - camLeftFrac,
        visibleWorldW / WORLD_WIDTH
      );
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(
        mapX + camLeftFrac * mapW,
        mapY + 1,
        camWidthFrac * mapW,
        mapH - 2
      );

      ctx.restore();
    };

    const loop = (now: number) => {
      const rawDt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      updateWorld(rawDt);
      renderWorld(rawDt);

      hudSyncAccumulator += rawDt;
      if (hudSyncAccumulator >= 0.06 && worldRef.current) {
        hudSyncAccumulator = 0;
        const w = worldRef.current;
        const activeTeam: Team =
          matchMode === 'ONLINE_1V1' ? myTeam : 'BLUE';
        const lCmd =
          activeTeam === 'RED' ? w.redCommander : w.blueCommander;
        const lGold = activeTeam === 'RED' ? w.redGold : w.blueGold;

        setHud({
          blueHp: Math.ceil(w.blueCommander.hp),
          redHp: Math.ceil(w.redCommander.hp),
          blueCitadelHp: Math.ceil(w.blueCitadel.hp),
          redCitadelHp: Math.ceil(w.redCitadel.hp),
          blueGold: Math.floor(w.blueGold),
          redGold: Math.floor(w.redGold),
          matchTimeRemaining: Math.max(0, MATCH_DURATION - w.matchTime),
          localCommander: {
            team: activeTeam,
            hp: Math.ceil(lCmd.hp),
            maxHp: lCmd.maxHp,
            dead: lCmd.dead,
            respawnTimer: lCmd.respawnTimer,
            attackCd: lCmd.attackCd,
            dashCd: lCmd.dashCd,
            warbreakerCd: lCmd.warbreakerCd,
            bannerCd: lCmd.bannerCd,
            shieldTimer: lCmd.shieldTimer,
            comboStep: lCmd.comboStep,
            gold: Math.floor(lGold),
          },
          blueCommander: {
            hp: Math.ceil(w.blueCommander.hp),
            maxHp: w.blueCommander.maxHp,
            dead: w.blueCommander.dead,
            respawnTimer: w.blueCommander.respawnTimer,
            executeReady:
              !w.blueCommander.dead &&
              w.blueCommander.hp / w.blueCommander.maxHp <= 0.15,
          },
          redCommander: {
            hp: Math.ceil(w.redCommander.hp),
            maxHp: w.redCommander.maxHp,
            dead: w.redCommander.dead,
            respawnTimer: w.redCommander.respawnTimer,
            executeReady:
              !w.redCommander.dead &&
              w.redCommander.hp / w.redCommander.maxHp <= 0.15,
          },
          blueBerserkTimer: w.blueBerserkTimer,
          redBerserkTimer: w.redBerserkTimer,
          altar: { ...w.altar },
          bannerAnnouncement: w.announcement ? { ...w.announcement } : null,
          blueUnitCount: w.minions.filter((m) => m.team === 'BLUE').length,
          redUnitCount: w.minions.filter((m) => m.team === 'RED').length,
          blueOutpostHp: Math.ceil(w.blueOutpost.hp),
          redOutpostHp: Math.ceil(w.redOutpost.hp),
          blueForgeTier: w.blueForgeTier,
          redForgeTier: w.redForgeTier,
          localForgeTier:
            activeTeam === 'RED' ? w.redForgeTier : w.blueForgeTier,
          aiDirective:
            matchMode === 'AI'
              ? {
                  posture: aiBrainRef.current.posture,
                  spawnUnit: aiBrainRef.current.spawnUnit,
                  skillPriority: aiBrainRef.current.skillPriority,
                  battleCry: aiBrainRef.current.battleCry,
                  reasoning: aiBrainRef.current.reasoning,
                }
              : null,
        });
      }

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [
    gameState,
    cameraMode,
    matchMode,
    myTeam,
    aiDifficulty,
    matchPlayers,
    sendWs,
    triggerCommanderAttack,
    triggerCommanderDash,
    triggerCommanderWarbreaker,
    triggerCommanderBanner,
    spawnSquad,
    upgradeForgeTier,
  ]);

  // ============================================================================
  // MOBILE VIRTUAL JOYSTICK POINTER HANDLERS
  // ============================================================================
  const JOY_MAX_RADIUS = 52;

  const handleJoystickPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (gameState !== 'PLAYING') return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const ox = e.clientX - rect.left;
    const oy = e.clientY - rect.top;

    inputRef.current.joyActive = true;
    inputRef.current.joyPointerId = e.pointerId;
    inputRef.current.joyOriginX = ox;
    inputRef.current.joyOriginY = oy;
    inputRef.current.joyVecX = 0;
    inputRef.current.joyVecY = 0;

    setJoystickUI({
      active: true,
      originX: ox,
      originY: oy,
      knobX: ox,
      knobY: oy,
    });
  };

  const handleJoystickPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (
      !inputRef.current.joyActive ||
      inputRef.current.joyPointerId !== e.pointerId
    )
      return;
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const dx = cx - inputRef.current.joyOriginX;
    const dy = cy - inputRef.current.joyOriginY;
    const dist = Math.hypot(dx, dy);
    const clampedDist = Math.min(JOY_MAX_RADIUS, dist);
    const angle = Math.atan2(dy, dx);

    const kx = inputRef.current.joyOriginX + Math.cos(angle) * clampedDist;
    const ky = inputRef.current.joyOriginY + Math.sin(angle) * clampedDist;

    inputRef.current.joyVecX =
      dist > 6 ? (Math.cos(angle) * clampedDist) / JOY_MAX_RADIUS : 0;
    inputRef.current.joyVecY =
      dist > 6 ? (Math.sin(angle) * clampedDist) / JOY_MAX_RADIUS : 0;

    setJoystickUI((prev) => ({
      ...prev,
      knobX: kx,
      knobY: ky,
    }));
  };

  const handleJoystickPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (inputRef.current.joyPointerId !== e.pointerId) return;
    inputRef.current.joyActive = false;
    inputRef.current.joyPointerId = null;
    inputRef.current.joyVecX = 0;
    inputRef.current.joyVecY = 0;
    setJoystickUI((prev) => ({ ...prev, active: false }));
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeLocalTeam: Team =
    matchMode === 'ONLINE_1V1' ? myTeam : 'BLUE';

  return (
    <div
      onDoubleClick={(e) => e.preventDefault()}
      className="relative w-screen h-dvh bg-slate-950 text-slate-100 overflow-hidden select-none touch-none flex flex-col justify-between"
    >
      {/* ==================================================================== */}
      {/* ACTIVE BATTLEFIELD CANVAS */}
      {/* ==================================================================== */}
      <canvas
        ref={canvasRef}
        data-no-safari-zoom="true"
        onMouseDown={(e) => {
          const localCmd = getLocalCommander();
          if (gameState === 'PLAYING' && e.button === 0 && localCmd) {
            triggerCommanderAttack(localCmd);
          }
        }}
        className="absolute inset-0 w-full h-full block z-0 cursor-crosshair touch-none"
      />

      {/* ==================================================================== */}
      {/* TOP HUD BAR: CITADEL HEALTH, SUDDEN DEATH TIMER & ONLINE TELEMETRY */}
      {/* ==================================================================== */}
      <header className="relative z-20 w-full px-3 pt-2 pb-1.5 bg-gradient-to-b from-slate-950/95 via-slate-950/75 to-transparent pointer-events-auto">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-4">
          {/* BLUE CITADEL & HERO STATUS */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-sky-400 font-semibold truncate">
                {matchPlayers.blueName} {activeLocalTeam === 'BLUE' ? '(YOU)' : ''} ·{' '}
                {hud.blueUnitCount} Troops
              </span>
              <span className="font-mono-num text-slate-200 font-bold">
                {hud.blueCitadelHp} / {CITADEL_MAX_HP}
              </span>
            </div>
            <div className="w-full h-3 bg-slate-900/90 rounded-sm overflow-hidden border border-sky-500/40">
              <div
                className="h-full bg-gradient-to-r from-sky-600 to-cyan-400 transition-transform duration-150 origin-left"
                style={{
                  transform: `scaleX(${Math.max(
                    0,
                    hud.blueCitadelHp / CITADEL_MAX_HP
                  )})`,
                }}
              />
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-300">
              <span className="text-sky-300 font-medium whitespace-nowrap">
                {hud.blueCommander.dead
                  ? `Respawn ${hud.blueCommander.respawnTimer.toFixed(1)}s`
                  : `Hero HP ${hud.blueCommander.hp}/${hud.blueCommander.maxHp}`}
              </span>
              <span className="text-amber-300/90 font-mono-num whitespace-nowrap">
                · Outpost {hud.blueOutpostHp > 0 ? `${hud.blueOutpostHp}HP` : 'DOWN'}
              </span>
              <span className="text-emerald-300 font-mono-num whitespace-nowrap hidden sm:inline">
                · Forge T{hud.blueForgeTier}
              </span>
              {hud.blueCommander.executeReady && (
                <span className="text-rose-400 font-bold whitespace-nowrap">
                  · EXECUTE!
                </span>
              )}
              {hud.blueBerserkTimer > 0 && (
                <span className="text-amber-400 font-bold whitespace-nowrap">
                  · BERSERK {hud.blueBerserkTimer.toFixed(1)}S
                </span>
              )}
            </div>
          </div>

          {/* CENTER MATCH CLOCK & SOUL ALTAR TRACKER */}
          <div className="shrink-0 flex flex-col items-center px-2 sm:px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setCameraMode((prev) =>
                    prev === 'FOLLOW' ? 'ARENA' : 'FOLLOW'
                  )
                }
                title="Toggle Camera View (Follow Hero / Full Arena)"
                className="min-h-[38px] min-w-[38px] px-2.5 rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-200 hover:bg-slate-800 flex items-center gap-1.5 text-xs font-medium whitespace-nowrap"
              >
                {cameraMode === 'FOLLOW' ? (
                  <>
                    <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                    <span className="hidden sm:inline">Follow</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span className="hidden sm:inline">Arena</span>
                  </>
                )}
              </button>

              <div className="px-3 py-1 rounded-lg bg-slate-900/95 border border-slate-700/80 text-center">
                <div className="font-mono-num text-sm sm:text-base font-bold tracking-tight text-slate-100">
                  {formatTime(hud.matchTimeRemaining)}
                </div>
                <div className="text-[10px] text-slate-400 whitespace-nowrap">
                  {matchMode === 'ONLINE_1V1'
                    ? `Room ${roomId || 'LIVE'} · ${pingMs}ms`
                    : hud.altar.active
                    ? 'ALTAR ACTIVE'
                    : `Altar ${Math.ceil(hud.altar.cooldownTimer)}s`}
                </div>
              </div>

              <button
                onClick={toggleSound}
                aria-label="Toggle Sound"
                className="min-h-[38px] min-w-[38px] rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center"
              >
                {soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-sky-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {gameState === 'PLAYING' && (
                <button
                  onClick={() => {
                    if (matchMode === 'ONLINE_1V1') {
                      sendWs({ type: 'room:leave' });
                      setLobbyStatus('IDLE');
                      setRoomId(null);
                      setGameState('TITLE_MENU');
                    } else {
                      setGameState('PAUSED');
                    }
                  }}
                  aria-label="Menu or Leave"
                  className="min-h-[38px] min-w-[38px] rounded-lg bg-slate-900/90 border border-slate-700/80 text-slate-300 hover:text-white flex items-center justify-center"
                >
                  {matchMode === 'ONLINE_1V1' ? (
                    <LogOut className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Pause className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* RED CITADEL & RIVAL STATUS */}
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="font-mono-num text-slate-200 font-bold">
                {hud.redCitadelHp} / {CITADEL_MAX_HP}
              </span>
              <span className="text-rose-400 font-semibold truncate">
                {hud.redUnitCount} Troops · {matchPlayers.redName}{' '}
                {activeLocalTeam === 'RED' ? '(YOU)' : ''}
              </span>
            </div>
            <div className="w-full h-3 bg-slate-900/90 rounded-sm overflow-hidden border border-rose-500/40">
              <div
                className="h-full bg-gradient-to-l from-rose-600 to-red-400 transition-transform duration-150 origin-right"
                style={{
                  transform: `scaleX(${Math.max(
                    0,
                    hud.redCitadelHp / CITADEL_MAX_HP
                  )})`,
                }}
              />
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px] text-slate-300">
              {hud.redBerserkTimer > 0 && (
                <span className="text-amber-400 font-bold whitespace-nowrap">
                  BERSERK {hud.redBerserkTimer.toFixed(1)}S ·
                </span>
              )}
              {hud.redCommander.executeReady && (
                <span className="text-rose-400 font-bold whitespace-nowrap">
                  EXECUTE READY ·
                </span>
              )}
              <span className="text-emerald-300 font-mono-num whitespace-nowrap hidden sm:inline">
                Forge T{hud.redForgeTier} ·
              </span>
              <span className="text-amber-300/90 font-mono-num whitespace-nowrap">
                Outpost {hud.redOutpostHp > 0 ? `${hud.redOutpostHp}HP` : 'DOWN'} ·
              </span>
              <span className="text-rose-300 font-medium whitespace-nowrap">
                {hud.redCommander.dead
                  ? `Respawn ${hud.redCommander.respawnTimer.toFixed(1)}s`
                  : `Hero HP ${hud.redCommander.hp}/${hud.redCommander.maxHp}`}
              </span>
            </div>
            {matchMode === 'AI' && hud.aiDirective && (
              <div className="flex items-center justify-end gap-1.5 text-[10px] text-rose-200/90 truncate">
                <Bot className="w-3 h-3 text-rose-400 shrink-0" />
                <span className="font-mono-num font-semibold text-amber-300">
                  [{hud.aiDirective.posture}]
                </span>
                <span className="text-slate-400 truncate">
                  Next: {hud.aiDirective.spawnUnit} · {hud.aiDirective.reasoning}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ==================================================================== */}
      {/* BIG HYPE ANNOUNCEMENT BANNER */}
      {/* ==================================================================== */}
      {hud.bannerAnnouncement && gameState === 'PLAYING' && (
        <div className="relative z-20 pointer-events-none flex justify-center px-4 mt-2">
          <div
            className={`px-6 py-2.5 rounded-xl border backdrop-blur-md text-center shadow-2xl ${
              hud.bannerAnnouncement.team === 'BLUE'
                ? 'bg-sky-950/90 border-sky-400/70 text-sky-100'
                : hud.bannerAnnouncement.team === 'RED'
                ? 'bg-rose-950/90 border-rose-400/70 text-rose-100'
                : 'bg-purple-950/90 border-purple-400/70 text-purple-100'
            }`}
          >
            <div className="font-display text-base sm:text-xl font-bold tracking-wider">
              {hud.bannerAnnouncement.title}
            </div>
            <div className="text-xs sm:text-sm font-medium opacity-90">
              {hud.bannerAnnouncement.subtitle}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MOBILE & DESKTOP INTERACTIVE CONTROLS OVERLAY */}
      {/* ==================================================================== */}
      {gameState === 'PLAYING' && (
        <div
          data-no-safari-zoom="true"
          className="relative z-10 flex-1 flex flex-col justify-end pointer-events-none touch-none"
        >
          {/* LEFT TOUCH ZONE: FLOATING MULTI-TOUCH THUMBSTICK */}
          <div
            data-no-safari-zoom="true"
            onPointerDown={handleJoystickPointerDown}
            onPointerMove={handleJoystickPointerMove}
            onPointerUp={handleJoystickPointerUp}
            onPointerCancel={handleJoystickPointerUp}
            className="absolute left-0 bottom-0 w-2/5 h-3/4 pointer-events-auto touch-none"
          >
            <div
              className="absolute w-28 h-28 rounded-full border-2 border-slate-400/30 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center pointer-events-none transition-opacity"
              style={{
                left: joystickUI.active ? joystickUI.originX - 56 : 36,
                top: joystickUI.active ? joystickUI.originY - 56 : undefined,
                bottom: joystickUI.active ? undefined : 28,
              }}
            >
              <div className="w-12 h-12 rounded-full border border-sky-400/40 bg-sky-500/20 flex items-center justify-center text-[10px] font-mono-num text-sky-200/80">
                MOVE
              </div>
            </div>

            {joystickUI.active && (
              <div
                className="absolute w-14 h-14 rounded-full bg-sky-400/80 border-2 border-white shadow-lg pointer-events-none"
                style={{
                  left: joystickUI.knobX - 28,
                  top: joystickUI.knobY - 28,
                }}
              />
            )}
          </div>

          {/* BOTTOM HUD DOCK: TACTICAL SQUAD SPAWN CARDS + HERO COMBAT SKILLS */}
          <div
            data-no-safari-zoom="true"
            className="relative z-20 w-full px-3 pb-3 pt-2 flex flex-col md:flex-row items-end justify-between gap-3 pointer-events-none touch-none"
          >
            <div className="hidden md:flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3.5 py-2 rounded-xl pointer-events-auto">
              <div className="text-xs text-slate-300">
                <span className="font-semibold text-sky-400">
                  Team: {activeLocalTeam}
                </span>
                <span className="mx-2 text-slate-600">·</span>
                <span className="font-semibold text-amber-400">Spawn:</span> Keys 1–4
                <span className="mx-2 text-slate-600">·</span>
                <span className="font-semibold text-emerald-400">Skills:</span>{' '}
                Space, Shift, Q, E
              </div>
            </div>

            {/* CENTER: GOLD RESERVE, WAR-FORGE TECH UPGRADE & 4 TACTICAL SQUAD SPAWN CARDS */}
            <div className="w-full md:w-auto flex flex-col items-center gap-1.5 pointer-events-auto touch-none">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <div className="flex items-center gap-2.5 px-3 py-1 rounded-lg bg-slate-900/95 border border-amber-500/40 shadow-md">
                  <span className="text-xs font-semibold text-amber-300">
                    GOLD
                  </span>
                  <span className="font-mono-num text-base font-bold text-amber-400">
                    {hud.localCommander.gold} G
                  </span>
                  <span className="text-[11px] text-slate-400 font-mono-num">
                    {hud.matchTimeRemaining <= 45 ? '+18/s' : '+9.5/s'}
                  </span>
                </div>

                {/* BLACKSMITH WAR-FORGE TECH TREE UPGRADE BUTTON */}
                {(() => {
                  const tier = hud.localForgeTier;
                  const maxTier = tier >= 3;
                  const forgeCost = tier === 1 ? 85 : 140;
                  const canUpgrade =
                    !maxTier && hud.localCommander.gold >= forgeCost;
                  return (
                    <button
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        upgradeForgeTier(activeLocalTeam);
                      }}
                      disabled={!canUpgrade}
                      className={`px-3 py-1 rounded-lg border text-xs font-bold flex items-center gap-1.5 transition-transform active:scale-95 touch-none ${
                        maxTier
                          ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                          : canUpgrade
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md hover:bg-amber-500/30'
                          : 'bg-slate-900/85 border-slate-800 text-slate-500'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400 pointer-events-none" />
                      <span className="pointer-events-none">
                        {maxTier
                          ? 'FORGE MAX (T3 +48%)'
                          : `[F] FORGE T${tier}→T${tier + 1} (${forgeCost}G)`}
                      </span>
                    </button>
                  );
                })()}
              </div>

              <div className="grid grid-cols-4 gap-1.5 sm:gap-2 w-full max-w-md touch-none">
                {(
                  Object.keys(UNIT_CATALOG) as Array<Exclude<UnitKind, 'GOLEM'>>
                ).map((kindKey) => {
                  const unit = UNIT_CATALOG[kindKey];
                  const canAfford = hud.localCommander.gold >= unit.cost;
                  return (
                    <button
                      key={unit.kind}
                      type="button"
                      onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        spawnSquad(activeLocalTeam, unit.kind);
                      }}
                      disabled={!canAfford}
                      className={`min-h-[58px] px-2 py-1.5 rounded-xl border text-left transition-transform active:scale-95 flex flex-col justify-between touch-none ${
                        canAfford
                          ? 'bg-slate-900/95 border-sky-500/60 hover:border-sky-400 text-slate-100 shadow-lg'
                          : 'bg-slate-950/80 border-slate-800 text-slate-500 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full gap-1 pointer-events-none">
                        <span className="font-mono-num text-[11px] font-bold text-sky-400">
                          [{unit.hotkey}]
                        </span>
                        <span
                          className={`font-mono-num text-xs font-bold ${
                            canAfford ? 'text-amber-400' : 'text-slate-500'
                          }`}
                        >
                          {unit.cost}G
                        </span>
                      </div>
                      <div className="text-xs font-semibold truncate leading-tight pointer-events-none">
                        {unit.shortName}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate pointer-events-none">
                        {unit.roleDesc}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT THUMB ZONE: HERO COMMANDER DIRECT COMBAT SKILLS */}
            <div className="flex items-center gap-2 self-end pointer-events-auto touch-none">
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const localCmd = getLocalCommander();
                  if (localCmd) {
                    triggerCommanderDash(
                      localCmd,
                      inputRef.current.joyActive
                        ? inputRef.current.joyVecX
                        : undefined,
                      inputRef.current.joyActive
                        ? inputRef.current.joyVecY
                        : undefined
                    );
                  }
                }}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 flex flex-col items-center justify-center transition-transform active:scale-90 touch-none ${
                  hud.localCommander.dashCd <= 0
                    ? 'bg-slate-900/95 border-sky-400 text-sky-300 shadow-lg'
                    : 'bg-slate-950/90 border-slate-800 text-slate-500'
                }`}
              >
                <Zap className="w-5 h-5 pointer-events-none" />
                <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap pointer-events-none">
                  {hud.localCommander.dashCd > 0
                    ? `${hud.localCommander.dashCd.toFixed(1)}s`
                    : 'DASH'}
                </span>
                <span className="text-[9px] text-slate-400 hidden sm:inline pointer-events-none">
                  Shift
                </span>
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const localCmd = getLocalCommander();
                  if (localCmd) {
                    triggerCommanderWarbreaker(localCmd);
                  }
                }}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 flex flex-col items-center justify-center transition-transform active:scale-90 touch-none ${
                  hud.localCommander.warbreakerCd <= 0
                    ? 'bg-slate-900/95 border-amber-400 text-amber-300 shadow-lg'
                    : 'bg-slate-950/90 border-slate-800 text-slate-500'
                }`}
              >
                <Flame className="w-5 h-5 pointer-events-none" />
                <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap pointer-events-none">
                  {hud.localCommander.warbreakerCd > 0
                    ? `${hud.localCommander.warbreakerCd.toFixed(1)}s`
                    : 'SLAM'}
                </span>
                <span className="text-[9px] text-slate-400 hidden sm:inline pointer-events-none">
                  Key Q
                </span>
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const localCmd = getLocalCommander();
                  if (localCmd) {
                    triggerCommanderBanner(localCmd);
                  }
                }}
                className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 flex flex-col items-center justify-center transition-transform active:scale-90 touch-none ${
                  hud.localCommander.bannerCd <= 0
                    ? 'bg-slate-900/95 border-emerald-400 text-emerald-300 shadow-lg'
                    : 'bg-slate-950/90 border-slate-800 text-slate-500'
                }`}
              >
                <Flag className="w-5 h-5 pointer-events-none" />
                <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap pointer-events-none">
                  {hud.localCommander.bannerCd > 0
                    ? `${Math.ceil(hud.localCommander.bannerCd)}s`
                    : 'RALLY'}
                </span>
                <span className="text-[9px] text-slate-400 hidden sm:inline pointer-events-none">
                  Key E
                </span>
              </button>

              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  inputRef.current.attackHeld = true;
                  const localCmd = getLocalCommander();
                  if (localCmd) {
                    triggerCommanderAttack(localCmd);
                  }
                }}
                onPointerUp={() => {
                  inputRef.current.attackHeld = false;
                }}
                onPointerCancel={() => {
                  inputRef.current.attackHeld = false;
                }}
                className={`relative w-20 h-20 sm:w-22 sm:h-22 rounded-full border-2 text-white shadow-xl flex flex-col items-center justify-center active:scale-90 transition-transform touch-none ${
                  activeLocalTeam === 'BLUE'
                    ? 'bg-gradient-to-br from-sky-500 to-blue-700 border-sky-200'
                    : 'bg-gradient-to-br from-rose-500 to-red-700 border-rose-200'
                }`}
              >
                <Swords className="w-7 h-7 pointer-events-none" />
                <span className="text-xs font-extrabold tracking-wide mt-0.5 pointer-events-none">
                  CLEAVE
                </span>
                <span className="font-mono-num text-[10px] opacity-90 pointer-events-none">
                  Hit {hud.localCommander.comboStep}/3
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TITLE MENU & ONLINE 1V1 MULTIPLAYER LOBBY */}
      {/* ==================================================================== */}
      {gameState === 'TITLE_MENU' && (
        <div className="fixed inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-2xl my-auto">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <span className="text-xs font-semibold text-amber-400 tracking-wider">
                ONLINE 1V1 ACTION-RTS · TUG-OF-WAR BRAWLER
              </span>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-mono-num">
                <Wifi
                  className={`w-3.5 h-3.5 ${
                    wsConnected ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                />
                <span>
                  {wsConnected
                    ? `${onlineStats.onlineCount} Online · ${pingMs}ms`
                    : 'Connecting...'}
                </span>
              </div>
            </div>

            <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
              Siege &amp; Destroy: Commander&apos;s Blood
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm text-slate-300 max-w-2xl">
              Clash with live rival Commanders online or practice against AI. Execute the enemy Commander below 15% HP to trigger a 10-second{' '}
              <strong className="text-amber-400">Berserk Frenzy</strong> across your army.
            </p>

            {/* ONLINE 1V1 LOBBY SECTION */}
            <div className="mt-5 p-4 sm:p-5 rounded-xl bg-slate-950/80 border border-sky-500/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-400 shrink-0" />
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-white">
                      Online 1v1 Multiplayer Arena
                    </h2>
                    <p className="text-xs text-slate-400">
                      Matchmake globally, create a room code, or share an invite link
                    </p>
                  </div>
                </div>

                {/* Commander Callsign Input */}
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="commander-name"
                    className="text-xs text-slate-400 whitespace-nowrap"
                  >
                    Callsign:
                  </label>
                  <input
                    id="commander-name"
                    type="text"
                    value={playerName}
                    maxLength={18}
                    onChange={(e) => {
                      setPlayerName(e.target.value);
                      sendWs({
                        type: 'player:set_name',
                        name: e.target.value,
                      });
                    }}
                    placeholder="Commander Name"
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-medium text-white focus:outline-none focus:border-sky-400 w-40"
                  />
                </div>
              </div>

              {lobbyError && (
                <div className="mt-3 px-3 py-2 rounded-lg bg-rose-950/80 border border-rose-500/50 text-xs text-rose-200">
                  {lobbyError}
                </div>
              )}

              {/* STATE A: WAITING IN ROOM */}
              {lobbyStatus === 'WAITING_IN_ROOM' && roomId && (
                <div className="mt-4 p-4 rounded-xl bg-sky-950/40 border border-sky-500/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <div className="text-xs text-sky-300 font-semibold">
                      WAITING FOR CHALLENGER TO JOIN...
                    </div>
                    <div className="mt-1 flex items-center gap-3">
                      <span className="text-xs text-slate-400">Room Code:</span>
                      <span className="font-mono-num text-2xl font-extrabold tracking-widest text-amber-400">
                        {roomId}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Open this app in another tab or send the invite link to a friend for instant 1v1!
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                      onClick={copyRoomInvite}
                      className="flex-1 sm:flex-initial px-4 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-4 h-4" />
                          Invite Link Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          Copy Invite Link
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        sendWs({ type: 'room:leave' });
                        setLobbyStatus('IDLE');
                        setRoomId(null);
                      }}
                      className="px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold whitespace-nowrap cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* STATE B: QUEUEING FOR QUICK MATCH */}
              {lobbyStatus === 'QUEUEING' && (
                <div className="mt-4 p-4 rounded-xl bg-amber-950/30 border border-amber-500/50 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-amber-300">
                      Searching for Online 1v1 Opponent...
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {onlineStats.queueCount} Commander(s) in matchmaking queue
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      sendWs({ type: 'queue:leave' });
                      setLobbyStatus('IDLE');
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold whitespace-nowrap cursor-pointer"
                  >
                    Leave Queue
                  </button>
                </div>
              )}

              {/* STATE C: IDLE LOBBY CONTROLS */}
              {lobbyStatus === 'IDLE' && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* 1. Quick Matchmaking */}
                  <button
                    onClick={() => {
                      setLobbyError(null);
                      sendWs({ type: 'queue:join', name: playerName });
                    }}
                    disabled={!wsConnected}
                    className="p-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-slate-950 font-bold text-left flex flex-col justify-between shadow-lg cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-extrabold">
                        Find Online 1v1 Match
                      </span>
                      <Swords className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-medium text-slate-900 mt-1">
                      Auto-pair with the next available Commander
                    </span>
                  </button>

                  {/* 2. Create Room */}
                  <button
                    onClick={() => {
                      setLobbyError(null);
                      sendWs({
                        type: 'room:create',
                        name: playerName,
                        isPublic: true,
                      });
                    }}
                    disabled={!wsConnected}
                    className="p-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-left flex flex-col justify-between cursor-pointer disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white">
                        Create 1v1 Room Code
                      </span>
                      <Crown className="w-4 h-4 text-amber-400" />
                    </div>
                    <span className="text-xs text-slate-400 mt-1">
                      Host a room &amp; share the 4-letter code or link
                    </span>
                  </button>

                  {/* 3. Join by Code */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 flex flex-col justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-300">
                      Join by Room Code
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={joinCodeInput}
                        maxLength={4}
                        onChange={(e) =>
                          setJoinCodeInput(e.target.value.toUpperCase())
                        }
                        placeholder="CODE"
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 font-mono-num text-sm font-bold uppercase tracking-widest text-amber-400 focus:outline-none focus:border-sky-400"
                      />
                      <button
                        onClick={() => {
                          if (joinCodeInput.trim().length < 4) {
                            setLobbyError('Enter a 4-character room code.');
                            return;
                          }
                          setLobbyError(null);
                          sendWs({
                            type: 'room:join',
                            roomId: joinCodeInput.trim().toUpperCase(),
                            name: playerName,
                          });
                        }}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs whitespace-nowrap cursor-pointer"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Open Public Rooms List */}
              {openRooms.length > 0 && lobbyStatus === 'IDLE' && (
                <div className="mt-3 pt-3 border-t border-slate-800/80">
                  <div className="text-xs font-semibold text-slate-400 mb-2">
                    OPEN CHALLENGER LOBBIES ({openRooms.length})
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {openRooms.map((r) => (
                      <div
                        key={r.id}
                        className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between"
                      >
                        <div>
                          <span className="text-xs font-bold text-white">
                            {r.hostName}&apos;s Arena
                          </span>
                          <span className="ml-2 font-mono-num text-xs text-amber-400">
                            [{r.id}]
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            sendWs({
                              type: 'room:join',
                              roomId: r.id,
                              name: playerName,
                            })
                          }
                          className="px-3 py-1 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
                        >
                          Accept 1v1
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* OFFLINE / PRACTICE MODES (VS SMART AI OR 2P LOCAL) */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Bot className="w-4 h-4 text-amber-400" />
                    Solo Practice vs Smart AI
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => setAiDifficulty('TACTICAL')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        aiDifficulty === 'TACTICAL'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      Tactical AI
                    </button>
                    <button
                      onClick={() => setAiDifficulty('RUTHLESS')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        aiDifficulty === 'RUTHLESS'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      Ruthless AI
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => startOfflineMatch('AI')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Play vs AI
                </button>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-rose-400" />
                    2-Player Local Keyboard
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    P1: WASD + Space/Q/E · P2: IJKL + U/O/P/H
                  </p>
                </div>
                <button
                  onClick={() => startOfflineMatch('LOCAL_2P')}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  2P Local
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* PAUSE MODAL */}
      {/* ==================================================================== */}
      {gameState === 'PAUSED' && (
        <div className="fixed inset-0 z-40 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center shadow-2xl">
            <h2 className="font-display text-2xl font-bold text-white">
              Battle Paused
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Commander awaiting orders on the frontline.
            </p>
            <div className="mt-6 flex flex-col gap-2.5">
              <button
                onClick={() => setGameState('PLAYING')}
                className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                Resume Battle
              </button>
              <button
                onClick={() =>
                  startOfflineMatch(matchMode === 'LOCAL_2P' ? 'LOCAL_2P' : 'AI')
                }
                className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Restart Match
              </button>
              <button
                onClick={() => setGameState('TITLE_MENU')}
                className="w-full py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
              >
                Return to Lobby
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* GAME OVER / VICTORY MODAL */}
      {/* ==================================================================== */}
      {gameState === 'GAME_OVER' && winnerInfo && (
        <div className="fixed inset-0 z-40 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-victory-backdrop">
          <div
            className={`w-full max-w-lg bg-slate-900 border rounded-2xl p-6 sm:p-8 text-center shadow-2xl animate-victory-modal ${
              winnerInfo.winner === activeLocalTeam
                ? 'border-amber-400/50'
                : 'border-rose-500/40'
            }`}
          >
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-950 border mb-3 animate-victory-crest ${
                winnerInfo.winner === activeLocalTeam
                  ? 'border-amber-400/60 shadow-[0_0_24px_rgba(251,191,36,0.3)]'
                  : 'border-rose-500/50 shadow-[0_0_24px_rgba(244,63,94,0.25)]'
              }`}
            >
              {winnerInfo.winner === activeLocalTeam ? (
                <Crown className="w-9 h-9 text-amber-400" />
              ) : (
                <Award className="w-9 h-9 text-rose-500" />
              )}
            </div>
            <h2
              className={`font-display text-3xl sm:text-4xl font-extrabold tracking-wide ${
                winnerInfo.winner === activeLocalTeam
                  ? 'text-sky-400 drop-shadow-[0_2px_12px_rgba(56,189,248,0.45)]'
                  : 'text-rose-400 drop-shadow-[0_2px_12px_rgba(244,63,94,0.45)]'
              }`}
            >
              {winnerInfo.winner === activeLocalTeam
                ? 'VICTORY!'
                : `${winnerInfo.winner} WINS!`}
            </h2>
            <p className="text-sm text-slate-300 mt-1">{winnerInfo.reason}</p>

            <div className="mt-6 grid grid-cols-3 gap-3 text-left bg-slate-950/80 border border-slate-800 rounded-xl p-4 animate-victory-stats">
              <div>
                <div className="text-[11px] text-slate-400">Match Duration</div>
                <div className="font-mono-num text-lg font-bold text-white mt-0.5">
                  {formatTime(winnerInfo.duration)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">
                  Commander Executions
                </div>
                <div className="font-mono-num text-lg font-bold text-sky-400 mt-0.5">
                  {winnerInfo.blueKills}{' '}
                  <span className="text-slate-600">vs</span>{' '}
                  <span className="text-rose-400">{winnerInfo.redKills}</span>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Troops Deployed</div>
                <div className="font-mono-num text-lg font-bold text-amber-400 mt-0.5">
                  {winnerInfo.blueUnits}{' '}
                  <span className="text-slate-600">vs</span>{' '}
                  <span className="text-rose-400">{winnerInfo.redUnits}</span>
                </div>
              </div>
            </div>

            {opponentRequestedRematch && (
              <div className="mt-4 text-xs font-semibold text-amber-400 animate-pulse">
                Your opponent wants a rematch!
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3 animate-victory-actions">
              <button
                onClick={() => {
                  if (matchMode === 'ONLINE_1V1') {
                    setRematchRequested(true);
                    sendWs({ type: 'rematch:request' });
                  } else {
                    startOfflineMatch(
                      matchMode === 'LOCAL_2P' ? 'LOCAL_2P' : 'AI'
                    );
                  }
                }}
                disabled={matchMode === 'ONLINE_1V1' && rematchRequested}
                className="flex-1 py-3.5 px-6 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-60"
              >
                <RotateCcw className="w-4 h-4" />
                {matchMode === 'ONLINE_1V1'
                  ? rematchRequested
                    ? 'Waiting for Rival...'
                    : 'Request Online Rematch'
                  : 'Play Again'}
              </button>
              <button
                onClick={() => {
                  if (matchMode === 'ONLINE_1V1') {
                    sendWs({ type: 'room:leave' });
                    setLobbyStatus('IDLE');
                    setRoomId(null);
                  }
                  setGameState('TITLE_MENU');
                }}
                className="py-3.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm cursor-pointer"
              >
                Main Lobby
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
