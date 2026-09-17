/**
 * The Infiltrator - Social Deduction Word Game
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { CATEGORIES, BOT_NAMES, BOT_AVATARS } from './data/categories';
import {
  Category,
  Coordinate,
  GameMode,
  GamePhase,
  GameSettings,
  Player,
  RoundResolution,
} from './types';
import { generateBotClue, decideBotVote, botFoxGuessWord } from './utils/aiBot';
import { sound, initAudio } from './utils/sound';
import { POTION_CATALOG } from './data/potions';

import { HeaderBar } from './components/HeaderBar';
import { motion, AnimatePresence } from 'motion/react';
import { Grid3X3, Users } from 'lucide-react';
import { LeftColumnTable } from './components/LeftColumnTable';
import { RightColumnGrid } from './components/RightColumnGrid';
import { ActionTray } from './components/ActionTray';
import { LobbyView } from './components/LobbyView';
import { OptionsModal } from './components/OptionsModal';
import { RulesModal } from './components/RulesModal';
import { InfiltratorGuessModal } from './components/InfiltratorGuessModal';
import { RoundResolutionModal } from './components/RoundResolutionModal';
import { PassAndPlayModal } from './components/PassAndPlayModal';
import { ShopModal } from './components/ShopModal';
import { OracleSerumModal } from './components/OracleSerumModal';
import { ClueForgeryModal } from './components/ClueForgeryModal';
import { SilencePotionModal } from './components/SilencePotionModal';
import { InfiltratorBoosterModal } from './components/InfiltratorBoosterModal';
import { HomeView } from './components/HomeView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { parseInviteUrl } from './utils/inviteUrl';
import { socketClient } from './utils/socketClient';
import { SocketConnectionState } from './utils/socketClient';
import { DiscussionMessage, EmojiReaction } from './types';
import { FloatingReactions, ReactionPicker, REACTION_EMOJIS } from './components/FloatingReactions';

// Helper to generate a friendly Room ID
function generateRoomId(): string {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const num = Math.floor(1000 + Math.random() * 9000);
  const letter = letters[Math.floor(Math.random() * letters.length)];
  return `CHAM-${num}${letter}`;
}

// Initial default settings matching prompt
const DEFAULT_SETTINGS: GameSettings = {
  pointForGuessingFox: true,
  foxSeeOneClueEarly: false,
  anonymousVoting: false,
  turnTimer: false,
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
  categoryDeckMode: 'random',
  categoryPool: CATEGORIES.map((c) => c.id),
  itemsEnabled: true,
};

// Initial default 4 players (1 human + 3 bots)
const INITIAL_PLAYERS: Player[] = [
  {
    id: 'player-1',
    name: 'You',
    isHuman: true,
    isHost: true,
    avatar: '🦎',
    score: 0,
    gold: 0,
    inventory: {},
    role: 'innocent',
    clue: '',
    hasSubmittedClue: false,
    votedForId: null,
    isReady: false,
    personality: 'literal',
  },
  {
    id: 'bot-1',
    name: 'Detective Hazel',
    isHuman: false,
    isHost: false,
    avatar: '🕵️‍♂️',
    score: 0,
    gold: 0,
    inventory: {},
    role: 'innocent',
    clue: '',
    hasSubmittedClue: false,
    votedForId: null,
    isReady: false,
    personality: 'pop_culture',
  },
  {
    id: 'bot-2',
    name: 'Captain Sterling',
    isHuman: false,
    isHost: false,
    avatar: '🦉',
    score: 0,
    gold: 0,
    inventory: {},
    role: 'innocent',
    clue: '',
    hasSubmittedClue: false,
    votedForId: null,
    isReady: false,
    personality: 'abstract',
  },
  {
    id: 'bot-3',
    name: 'Dr. Watson',
    isHuman: false,
    isHost: false,
    avatar: '🐱',
    score: 0,
    gold: 0,
    inventory: {},
    role: 'innocent',
    clue: '',
    hasSubmittedClue: false,
    votedForId: null,
    isReady: false,
    personality: 'literal',
  },
];

function sanitizeClue(value: string, trim = true): string {
  const sanitized = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .slice(0, 30);
  return trim ? sanitized.trim() : sanitized;
}

function sanitizePlayerName(value: string, trim = true): string {
  const sanitized = value.replace(/\s+/g, ' ').slice(0, 20);
  return trim ? sanitized.trim() : sanitized;
}

function sanitizePlayers(newPlayers: Player[], existingPlayers?: Player[]): Player[] {
  return newPlayers.map((player, idx) => {
    const existing = existingPlayers?.find((p) => p.id === player.id);
    let cleanName = player.name !== undefined ? sanitizePlayerName(player.name, false) : '';
    if (!cleanName.trim()) {
      cleanName = existing?.name ? sanitizePlayerName(existing.name, false) : `Player ${idx + 1}`;
    }
    return {
      ...(existing || {}),
      ...player,
      name: cleanName,
      clue: sanitizeClue(player.clue || ''),
    };
  });
}

function InfiltratorApp() {
  // Keep layouts usable when mobile browser chrome changes the visual viewport.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const updateViewport = () => {
      const height = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--app-height', `${height}px`);
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('resize', updateViewport);
    return () => {
      window.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('resize', updateViewport);
    };
  }, []);

  // Parse any invite link query or hash parameters on initial load
  const inviteInfo = useRef(parseInviteUrl()).current;

  // Cached session check on startup
  const cachedSession = useRef(typeof window !== 'undefined' ? socketClient.getCachedSession() : null).current;

  // Player ID stored per browser session
  const myPlayerId = useRef<string>(
    typeof window !== 'undefined'
      ? (() => {
          if (cachedSession?.playerId) return cachedSession.playerId;
          const stored = sessionStorage.getItem('infiltrator_player_id') || sessionStorage.getItem('chameleon_player_id');
          if (stored) return stored;
          const gen = `p-${Math.random().toString(36).substring(2, 8)}`;
          sessionStorage.setItem('infiltrator_player_id', gen);
          return gen;
        })()
      : 'player-1'
  ).current;

  // Room ID: strictly empty on startup unless a valid invite link was provided or cachedSession exists
  const [roomId, setRoomId] = useState<string>(() => {
    if (inviteInfo.roomId) return inviteInfo.roomId;
    if (cachedSession?.roomId) return cachedSession.roomId;
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '').trim();
      if (hash && (hash.startsWith('INF-') || hash.startsWith('CHAM-') || hash.startsWith('FOX-'))) return hash;
    }
    return '';
  });

  // Core Game State
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    if (inviteInfo.roomId || cachedSession?.roomId) return 'room';
    return 'solo';
  });
  const [gamePhase, setGamePhase] = useState<GamePhase>(() => {
    if (inviteInfo.autoJoin && inviteInfo.roomId) return 'lobby';
    if (cachedSession?.roomId) return 'lobby';
    return 'home';
  });
  const [roundNumber, setRoundNumber] = useState(1);
  const [players, setPlayers] = useState<Player[]>(INITIAL_PLAYERS);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('sports');
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  const [secretCoordinate, setSecretCoordinate] = useState<Coordinate | null>(null);
  const [foxPlayerId, setFoxPlayerId] = useState<string>('');
  const [settings, setSettings] = useState<GameSettings>(() => ({
    ...DEFAULT_SETTINGS,
    roomPassword: inviteInfo.password || '',
  }));
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [volume, setVolume] = useState(0.7);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactDisplay, setCompactDisplay] = useState(false);

  // Active inputs
  const [clueInput, setClueInput] = useState('');
  const [isEditingClue, setIsEditingClue] = useState(false);
  const [selectedVoteTargetId, setSelectedVoteTargetId] = useState<string | null>(null);
  const [selectedGuessWord, setSelectedGuessWord] = useState<string | null>(null);
  const [roundResolution, setRoundResolution] = useState<RoundResolution | null>(null);

  // Single random clue revealed exclusively to the Infiltrator during clue_submission
  const [impostorPeekPlayerId, setImpostorPeekPlayerId] = useState<string | null>(null);

  // Bot timeouts ref for clean lifecycle and pause/resume during clue editing
  const botTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const clearBotTimeouts = useCallback(() => {
    botTimeoutsRef.current.forEach((t) => clearTimeout(t));
    botTimeoutsRef.current = [];
  }, []);

  // Refs for tracking active round state across async timers and socket closures
  const categoryRef = useRef<Category>(category);
  const secretCoordinateRef = useRef<Coordinate | null>(secretCoordinate);
  const roomIdRef = useRef<string>(roomId);
  const gamePhaseRef = useRef<GamePhase>(gamePhase);
  const playersRef = useRef<Player[]>(players);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    roomIdRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    gamePhaseRef.current = gamePhase;
  }, [gamePhase]);

  useEffect(() => {
    categoryRef.current = category;
  }, [category]);

  useEffect(() => {
    secretCoordinateRef.current = secretCoordinate;
  }, [secretCoordinate]);

  // Turn timer
  const [timeLeft, setTimeLeft] = useState(60);
  const [voteRound, setVoteRound] = useState(1);
  const [suddenDeath, setSuddenDeath] = useState(false);

  // Modals
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isFoxGuessModalOpen, setIsFoxGuessModalOpen] = useState(false);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [caughtInfiltratorId, setCaughtInfiltratorId] = useState<string | null>(null);

  // Shop & Potion States
  const [hasUsedPotionThisTurn, setHasUsedPotionThisTurn] = useState(false);
  const [hasUsedOracleThisRound, setHasUsedOracleThisRound] = useState(false);
  const [oracleHighlight, setOracleHighlight] = useState<{ type: 'row' | 'col'; value: number | string } | null>(null);
  const [isOracleModalOpen, setIsOracleModalOpen] = useState(false);
  const [activeVoteShields, setActiveVoteShields] = useState<string[]>([]);
  const [clueLensPeekPlayerId, setClueLensPeekPlayerId] = useState<string | null>(null);
  const [isScrambling, setIsScrambling] = useState(false);
  const [recentlyUsedPotionPlayerId, setRecentlyUsedPotionPlayerId] = useState<string | null>(null);
  const [recentlyUsedPotionId, setRecentlyUsedPotionId] = useState<string | null>(null);
  const [activePotionToast, setActivePotionToast] = useState<{
    message: string;
    icon: string;
    style: 'sky' | 'cyan' | 'purple' | 'amber';
    isInfiltratorOnly?: boolean;
    isChameleonOnly?: boolean;
  } | null>(null);
  const [isClueForgeryModalOpen, setIsClueForgeryModalOpen] = useState(false);
  const [pendingClueForged, setPendingClueForged] = useState<{ targetPlayerId: string; newClue: string } | null>(null);
  const pendingClueForgedRef = useRef<{ targetPlayerId: string; newClue: string } | null>(null);
  const [forgedTargetPlayerId, setForgedTargetPlayerId] = useState<string | null>(null);
  const [oracleShattered, setOracleShattered] = useState(false);

  // Silence potion states
  const [silencedPlayerIds, setSilencedPlayerIds] = useState<string[]>([]);
  // Responsive layout tab on mobile/iPhone: 'board' | 'clues' | 'both'
  const [mobileGameTab, setMobileGameTab] = useState<'board' | 'clues' | 'both'>('board');
  const [isSilenceModalOpen, setIsSilenceModalOpen] = useState(false);

  // Infiltrator odds booster state
  const [isInfiltratorBoosterModalOpen, setIsInfiltratorBoosterModalOpen] = useState(false);

  // Round discussion and accusations messages
  const [discussionMessages, setDiscussionMessages] = useState<DiscussionMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<EmojiReaction[]>([]);

  // Pass and play states
  const [passAndPlayIndex, setPassAndPlayIndex] = useState(0);
  const [isPassAndPlayModalOpen, setIsPassAndPlayModalOpen] = useState(false);

  // Multiplayer Broadcast channel
  const [peerCount, setPeerCount] = useState(0);
  const [connectionState, setConnectionState] = useState<SocketConnectionState>(socketClient.getState());
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);

  // Active player is this client's player (or pass and play current turn)
  const safePlayers = (players || []).filter((p): p is Player => Boolean(p && p.id));
  const myPlayer = safePlayers.find((p) => p.id === myPlayerId) || safePlayers[0] || INITIAL_PLAYERS[0];
  const activePlayer =
    gameMode === 'pass_and_play' && (gamePhase === 'clue_submission' || gamePhase === 'voting' || gamePhase === 'fox_guess')
      ? safePlayers.filter((p) => p.isHuman)[passAndPlayIndex] || myPlayer
      : myPlayer;

  const isHost =
    safePlayers.find((p) => p.id === myPlayerId)?.isHost ?? (safePlayers[0]?.id === myPlayerId);

  // Sync sound utility with state and initialize browser audio unlock listeners
  useEffect(() => {
    initAudio();
    sound.enabled = soundEnabled;
    sound.setVolume(volume);
  }, [soundEnabled, volume]);

  // Sync room in URL hash only when a valid room exists, otherwise keep URL clean
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (roomId) {
        window.location.hash = roomId;
      } else if (window.location.hash) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, [roomId]);

  // Chameleon single random clue peek during clue_submission
  useEffect(() => {
    if (gamePhase !== 'clue_submission') {
      if (impostorPeekPlayerId) setImpostorPeekPlayerId(null);
      return;
    }

    // Identify players other than the imposter who have submitted their clue
    const submittedOthers = players.filter(
      (p) => p.hasSubmittedClue && p.id !== foxPlayerId
    );

    if (submittedOthers.length > 0) {
      // Pick exactly ONE at random, and preserve it throughout the clue submission phase
      if (!impostorPeekPlayerId || !submittedOthers.some((p) => p.id === impostorPeekPlayerId)) {
        const picked = submittedOthers[Math.floor(Math.random() * submittedOthers.length)].id;
        setImpostorPeekPlayerId(picked);
      }
    }
  }, [players, foxPlayerId, gamePhase, impostorPeekPlayerId]);

  // Setup Realtime WebSocket and BroadcastChannel Sync
  useEffect(() => {
    const unsubscribe = socketClient.subscribe((event) => {
      if (event.type === 'SOCKET_STATE') {
        setConnectionState(event.state as SocketConnectionState);
        return;
      }
      // If user is at home or not in a room, completely ignore room events
      if (gamePhaseRef.current === 'home' || !roomIdRef.current) {
        return;
      }

      if (event.type === 'SESSION_RECONNECT_FAILED') {
        console.warn('Session reconnection failed:', event.reason);
        socketClient.clearSession();
        setGameMode('solo');
        setGamePhase('home');
        setRoomId('');
        roomIdRef.current = '';
        return;
      }

      if ((event.type === 'ROOM_STATE_SYNC' || event.type === 'SESSION_RECONNECTED' || event.type === 'PLAYER_DISCONNECTED') && event.room) {
        if (event.type === 'SESSION_RECONNECTED') {
          setRoomId(event.room.id);
          roomIdRef.current = event.room.id;
          setGameMode('room');
        } else if (!roomIdRef.current || (event.room.id && event.room.id !== roomIdRef.current)) {
          return;
        }

        // Verify this player hasn't left or been removed from the room
        const amInRoom = event.room.players?.some((p: any) => p && p.id === myPlayerId);
        if (!amInRoom) {
          return;
        }

        const isNewRoundStarting =
          event.room.gamePhase === 'clue_submission' && gamePhaseRef.current !== 'clue_submission';

        if (Array.isArray(event.room.players)) {
          const validList = event.room.players.filter(Boolean);
          const sanitized = sanitizePlayers(validList, playersRef.current);
          setPlayers((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(sanitized)) return prev;
            return sanitized;
          });
          if (isNewRoundStarting) {
            setActiveVoteShields([]);
            setHasUsedPotionThisTurn(false);
          } else {
            const shielded = sanitized.filter((p: any) => p && p.hasShield).map((p: any) => p.id);
            setActiveVoteShields((prev) => (JSON.stringify(prev) === JSON.stringify(shielded) ? prev : shielded));
          }
        }
        if (event.room.settings) {
          setSettings((prev) => {
            const next = { ...prev, ...event.room.settings };
            if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
            return next;
          });
        }
        if (event.room.gamePhase && event.room.gamePhase !== gamePhaseRef.current) {
          setGamePhase(event.room.gamePhase);
          gamePhaseRef.current = event.room.gamePhase;
        }
        if (event.room.category && JSON.stringify(categoryRef.current) !== JSON.stringify(event.room.category)) {
          setCategory(event.room.category);
          categoryRef.current = event.room.category;
        }
        if (event.room.secretCoordinate !== undefined && JSON.stringify(secretCoordinateRef.current) !== JSON.stringify(event.room.secretCoordinate)) {
          setSecretCoordinate(event.room.secretCoordinate);
          secretCoordinateRef.current = event.room.secretCoordinate;
        }
        if (event.room.foxPlayerId !== undefined) {
          setFoxPlayerId((prev) => (prev === event.room.foxPlayerId ? prev : event.room.foxPlayerId));
        }
        if (event.room.roundResolution !== undefined) {
          setRoundResolution((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(event.room.roundResolution)) return prev;
            if (event.room.roundResolution) setIsResolutionModalOpen(true);
            return event.room.roundResolution;
          });
        }
        if (event.room.roundNumber !== undefined) {
          setRoundNumber((prev) => (prev === event.room.roundNumber ? prev : event.room.roundNumber));
        }
        if (event.room.voteRound !== undefined) {
          setVoteRound((prev) => (prev === event.room.voteRound ? prev : event.room.voteRound));
        }
        if (event.room.suddenDeath !== undefined) {
          setSuddenDeath((prev) => (prev === Boolean(event.room.suddenDeath) ? prev : Boolean(event.room.suddenDeath)));
        }
        if (event.room.forgedTargetPlayerId !== undefined) {
          setForgedTargetPlayerId((prev) => (prev === event.room.forgedTargetPlayerId ? prev : event.room.forgedTargetPlayerId));
        }
        if (event.room.pendingClueForged !== undefined && !pendingClueForgedRef.current) {
          setPendingClueForged(event.room.pendingClueForged);
          pendingClueForgedRef.current = event.room.pendingClueForged;
        }
      } else if (event.type === 'EMOJI_REACTION' && event.reaction) {
        if (!roomIdRef.current) return;
        const reaction = event.reaction as EmojiReaction;
        if (!REACTION_EMOJIS.includes(reaction.emoji)) return;
        setFloatingReactions((previous) => [...previous.slice(-19), reaction]);
        window.setTimeout(() => {
          setFloatingReactions((previous) => previous.filter((item) => item.id !== reaction.id));
        }, 3200);
      } else if (event.type === 'ROOM_SETTINGS_UPDATED' && event.settings) {
        if (event.room && event.room.id !== roomIdRef.current) return;
        setSettings((prev) => {
          const next = { ...prev, ...event.settings };
          if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
          return next;
        });
      } else if ((event.type === 'PLAYER_JOINED' || event.type === 'PLAYER_LEFT') && event.room) {
        if (event.room.id !== roomIdRef.current) return;
        const amInRoom = event.room.players?.some((p: any) => p && p.id === myPlayerId);
        if (!amInRoom) return;
        if (Array.isArray(event.room.players)) {
          const sanitized = sanitizePlayers(event.room.players.filter(Boolean), playersRef.current);
          setPlayers((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(sanitized)) return prev;
            return sanitized;
          });
        }
      } else if (event.type === 'PLAYER_KICKED') {
        if (event.kickedPlayerId === myPlayerId) {
          alert('You were removed from the party by the host.');
          handleLeaveRoom();
          return;
        }
        if (event.room && event.room.id === roomIdRef.current && event.room.players) {
          setPlayers(sanitizePlayers(event.room.players, playersRef.current));
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [myPlayerId]);

  // Tab Close / Window Unload: Remove player immediately from the room
  useEffect(() => {
    const handleTabClose = () => {
      const activeRoom = roomIdRef.current;
      const pId = myPlayerId;
      if (activeRoom && pId) {
        try {
          const payload = JSON.stringify({ playerId: pId });
          if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            navigator.sendBeacon(
              `/api/rooms/${activeRoom}/leave`,
              new Blob([payload], { type: 'application/json' })
            );
          }
          socketClient.leaveRoom(activeRoom, pId);
        } catch {
          // Ignore page teardown errors
        }
      }
    };

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose);
    return () => {
      window.removeEventListener('beforeunload', handleTabClose);
      window.removeEventListener('pagehide', handleTabClose);
    };
  }, [myPlayerId]);

  const handleSendReaction = useCallback((emoji: string) => {
    if (!REACTION_EMOJIS.includes(emoji)) return;
    const reaction: EmojiReaction = {
      id: `reaction-${Date.now()}-${myPlayerId}`,
      playerId: myPlayerId,
      playerName: activePlayer.name,
      playerAvatar: activePlayer.avatar,
      emoji,
      timestamp: Date.now(),
    };
    if (gameMode === 'room' && roomId) {
      socketClient.sendReaction(roomId, myPlayerId, emoji);
    } else {
      setFloatingReactions((previous) => [...previous.slice(-19), reaction]);
      window.setTimeout(() => {
        setFloatingReactions((previous) => previous.filter((item) => item.id !== reaction.id));
      }, 3200);
    }
  }, [activePlayer.avatar, activePlayer.name, gameMode, myPlayerId, roomId]);

  // Setup BroadcastChannel for Room Multiplayer fallback
  useEffect(() => {
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined' || !roomId) return;

    const channel = new BroadcastChannel(`fox_game_room_${roomId}`);
    broadcastChannelRef.current = channel;

    // Ping peers
    channel.postMessage({ type: 'PING' });

    channel.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'PING') {
        channel.postMessage({ type: 'PONG' });
        setPeerCount((prev) => Math.max(prev, 1));
      } else if (data.type === 'PONG') {
        setPeerCount((prev) => prev + 1);
      } else if (data.type === 'STATE_SYNC' && gameMode === 'room') {
        if (gamePhaseRef.current === 'home' || !roomIdRef.current) return;
        if (data.phase) setGamePhase(data.phase);
        if (data.players) setPlayers(sanitizePlayers(data.players));
        if (data.roundNumber !== undefined) setRoundNumber(data.roundNumber);
        if (data.category) {
          setCategory(data.category);
          categoryRef.current = data.category;
        }
        if (data.secretCoordinate) {
          setSecretCoordinate(data.secretCoordinate);
          secretCoordinateRef.current = data.secretCoordinate;
        }
        if (data.foxPlayerId) setFoxPlayerId(data.foxPlayerId);
        if (data.roundResolution) {
          setRoundResolution(data.roundResolution);
          setIsResolutionModalOpen(true);
        }
        if (data.voteRound !== undefined) setVoteRound(data.voteRound);
        if (data.suddenDeath !== undefined) setSuddenDeath(Boolean(data.suddenDeath));
      }
    };

    return () => {
      channel.close();
    };
  }, [roomId, gameMode]);

  // Broadcast helper
  const broadcastState = useCallback((phase?: GamePhase, updatedPlayers?: Player[], res?: RoundResolution | null, currentRound?: number) => {
    if (gameMode !== 'room' || !broadcastChannelRef.current) return;
    broadcastChannelRef.current.postMessage({
      type: 'STATE_SYNC',
      phase: phase || gamePhase,
      players: updatedPlayers || players,
      category,
      secretCoordinate,
      foxPlayerId,
      roundResolution: res !== undefined ? res : roundResolution,
      roundNumber: currentRound !== undefined ? currentRound : roundNumber,
      voteRound,
      suddenDeath,
    });
  }, [gameMode, gamePhase, players, category, secretCoordinate, foxPlayerId, roundResolution, roundNumber, voteRound, suddenDeath]);

  // Turn timer effect
  useEffect(() => {
    const timerEnabled = settings.turnTimer || (gamePhase === 'voting' && suddenDeath);
    if (!timerEnabled) return;
    if (gamePhase !== 'clue_submission' && gamePhase !== 'voting') return;

    const duration = gamePhase === 'voting' && suddenDeath ? 20 : (settings.turnTimerSeconds || 60);
    setTimeLeft(duration);

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Timer expired: auto-advance
          if (gamePhase === 'clue_submission') {
            autoSubmitCurrentClue();
          } else if (gamePhase === 'voting') {
            if (suddenDeath) {
              if (gameMode !== 'room' || isHost) resolveSuddenDeathTimeout();
            } else {
              autoSubmitCurrentVote();
            }
          }
          return 0;
        }
        if (prev <= 5 && soundEnabled) {
          sound.tick();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gamePhase, settings.turnTimer, settings.turnTimerSeconds, soundEnabled, suddenDeath, gameMode, isHost]);

  // Setup New Round
  const startNewRound = useCallback((keepScores = true, targetRoundNumber?: number) => {
    // Only the host may start the game or begin the next round in multiplayer rooms
    if (gameMode === 'room' && !isHost) {
      console.warn('Only the room host can start the round');
      return;
    }

    sound.click();

    const nextRound = targetRoundNumber !== undefined ? targetRoundNumber : (keepScores ? roundNumber : 1);
    setRoundNumber(nextRound);

    // 1. Determine Category
    let chosenCat: Category;
    const mode = settings.categoryDeckMode || (selectedCategoryId === 'random' ? 'random' : 'select_one');

    if (mode === 'select_random') {
      const poolIds = (settings.categoryPool && settings.categoryPool.length > 0)
        ? settings.categoryPool
        : CATEGORIES.map((c) => c.id);
      const available = CATEGORIES.filter((c) => poolIds.includes(c.id));
      const pool = available.length > 0 ? available : CATEGORIES;
      chosenCat = pool[Math.floor(Math.random() * pool.length)];
    } else if (mode === 'random' || selectedCategoryId === 'random') {
      chosenCat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    } else {
      chosenCat = CATEGORIES.find((c) => c.id === selectedCategoryId) || CATEGORIES[0];
    }
    setCategory(chosenCat);
    categoryRef.current = chosenCat;

    // 2. Pick Random Coordinate: col (A-D) & row (1-4)
    const cols: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
    const rows: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
    const cIdx = Math.floor(Math.random() * 4);
    const rIdx = Math.floor(Math.random() * 4);
    const col = cols[cIdx];
    const row = rows[rIdx];
    const item = chosenCat.items[rIdx * 4 + cIdx];

    const coord: Coordinate = {
      col,
      row,
      colIndex: cIdx,
      rowIndex: rIdx,
      label: `${col}${row}`,
      item,
    };
    setSecretCoordinate(coord);
    secretCoordinateRef.current = coord;

    // 3. Secretly assign FOX / Infiltrator based on settings.infiltratorCount and gold-based lottery weights
    const count = Math.min(settings.infiltratorCount ?? settings.chameleonCount ?? 1, Math.max(1, Math.floor(players.length / 2)));

    // Calculate tickets for each player: 1 base ticket + 1 ticket per 50 gold invested
    const playerTickets = players.map((p) => {
      const boostGold = p.infiltratorBoostGold ?? p.chameleonBoostGold ?? 0;
      return 1 + Math.floor(boostGold / 50);
    });

    const chosenFoxIndices = new Set<number>();
    const pool = players.map((_, i) => i);

    for (let c = 0; c < count; c++) {
      const remainingPool = pool.filter((idx) => !chosenFoxIndices.has(idx));
      if (remainingPool.length === 0) break;
      const totalWeight = remainingPool.reduce((sum, idx) => sum + playerTickets[idx], 0);
      let rand = Math.random() * totalWeight;
      let pickedIdx = remainingPool[0];
      for (const idx of remainingPool) {
        rand -= playerTickets[idx];
        if (rand <= 0) {
          pickedIdx = idx;
          break;
        }
      }
      chosenFoxIndices.add(pickedIdx);
    }

    const assignedFoxId = players[[...chosenFoxIndices][0]]?.id || players[0].id;
    setFoxPlayerId(assignedFoxId);

    // Toast feedback if the active player invested gold for boost
    const activeBoost = activePlayer.infiltratorBoostGold ?? activePlayer.chameleonBoostGold ?? 0;
    const activeIsChosenFox = chosenFoxIndices.has(players.findIndex((p) => p.id === activePlayer.id));
    if (activeBoost > 0) {
      if (activeIsChosenFox) {
        sound.powerup();
        setActivePotionToast({
          message: `🕵️ Your gold bribe succeeded! You were chosen as The Infiltrator!`,
          icon: '🕵️',
          style: 'amber',
          isInfiltratorOnly: true,
          isChameleonOnly: true,
        });
        setTimeout(() => setActivePotionToast(null), 4500);
      } else {
        setActivePotionToast({
          message: `🪙 Your Infiltrator boost (${Math.floor(activeBoost / 50)} extra tickets) was used this round!`,
          icon: '🪙',
          style: 'amber',
          isInfiltratorOnly: true,
          isChameleonOnly: true,
        });
        setTimeout(() => setActivePotionToast(null), 3500);
      }
    }

    // Reset players for new round & deduct consumed boost gold
    const updatedPlayers: Player[] = players.map((p, idx) => {
      const boostSpent = p.infiltratorBoostGold ?? p.chameleonBoostGold ?? 0;
      return {
        ...p,
        name: p.name?.trim() || `Player ${idx + 1}`,
        role: chosenFoxIndices.has(idx) ? 'fox' : 'innocent',
        clue: '',
        originalClue: '',
        hasSubmittedClue: false,
        votedForId: null,
        isReady: false,
        isReadyToLeaveShop: false,
        score: keepScores ? p.score : 0,
        gold: keepScores ? Math.max(0, (p.gold ?? 0) - boostSpent) : 0,
        inventory: keepScores ? (p.inventory || {}) : {},
        infiltratorBoostGold: 0,
        chameleonBoostGold: 0,
        hasUsedPotionThisTurn: false,
        hasShield: false,
        shieldActive: false,
        silenced: false,
        forgedBy: undefined,
      };
    });

    setPlayers(updatedPlayers);
    setClueInput('');
    setIsEditingClue(false);
    setImpostorPeekPlayerId(null);
    clearBotTimeouts();
    setSelectedVoteTargetId(null);
    setSelectedGuessWord(null);
    setRoundResolution(null);
    setCaughtInfiltratorId(null);
    setIsFoxGuessModalOpen(false);
    setIsResolutionModalOpen(false);
    setHasUsedPotionThisTurn(false);
    setHasUsedOracleThisRound(false);
    setOracleHighlight(null);
    setIsOracleModalOpen(false);
    setActiveVoteShields([]);
    setClueLensPeekPlayerId(null);
    setIsScrambling(false);
    setRecentlyUsedPotionPlayerId(null);
    setRecentlyUsedPotionId(null);
    setActivePotionToast(null);
    setIsClueForgeryModalOpen(false);
    setPendingClueForged(null);
    pendingClueForgedRef.current = null;
    setForgedTargetPlayerId(null);
    setOracleShattered(false);
    setSilencedPlayerIds([]);
    setDiscussionMessages([]);

    if (gameMode === 'pass_and_play') {
      setPassAndPlayIndex(0);
      setIsPassAndPlayModalOpen(true);
    }

    setGamePhase('clue_submission');
    gamePhaseRef.current = 'clue_submission';
    setVoteRound(1);
    setSuddenDeath(false);

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, {
        gamePhase: 'clue_submission',
        roundNumber: nextRound,
        players: updatedPlayers,
        category: chosenCat,
        secretCoordinate: coord,
        foxPlayerId: assignedFoxId,
        roundResolution: null,
        voteRound: 1,
        suddenDeath: false,
        pendingClueForged: null,
        forgedTargetPlayerId: null,
      });
    }

    broadcastState('clue_submission', updatedPlayers, null, nextRound);

    // Stagger AI bots with natural timing so human has comfortable time to think & edit clue
    if (gameMode !== 'pass_and_play') {
      const hasBots = updatedPlayers.some((p) => !p.isHuman);
      if (hasBots && (gameMode !== 'room' || isHost)) {
        processBotClues(updatedPlayers, 3500, coord, chosenCat);
      }
    }
  }, [selectedCategoryId, players, gameMode, settings.infiltratorCount, settings.chameleonCount, settings.categoryDeckMode, settings.categoryPool, roomId, broadcastState, isHost, roundNumber]);

  // Handle Player Management in Lobby
  const handleAddBot = () => {
    if (players.length >= 8) return;
    sound.click();
    const usedNames = players.map((p) => p.name);
    const availableNames = BOT_NAMES.filter((n) => !usedNames.includes(n));
    const botName = availableNames[0] || `Bot ${players.length + 1}`;
    const botAvatar = BOT_AVATARS[players.length % BOT_AVATARS.length];

    const newBot: Player = {
      id: `bot-${Date.now()}`,
      name: botName,
      isHuman: false,
      isHost: false,
      avatar: botAvatar,
      score: 0,
      gold: 0,
      inventory: {},
      role: 'innocent',
      clue: '',
      hasSubmittedClue: false,
      votedForId: null,
      isReady: false,
      personality: (['literal', 'pop_culture', 'abstract'] as const)[players.filter((p) => !p.isHuman).length % 3],
    };
    const updated = [...players, newBot];
    setPlayers(updated);
    if (gameMode === 'room' && roomId) {
      socketClient.addBot(roomId, newBot);
      broadcastState(gamePhase, updated);
    }
  };

  const handleUpdatePlayerName = (id: string, newName: string) => {
    // Strictly prevent modifying other players' names
    if (gameMode !== 'pass_and_play' && id !== myPlayerId) {
      return;
    }
    const updated = players.map((p) => (p.id === id ? { ...p, name: sanitizePlayerName(newName, false) } : p));
    setPlayers(updated);
    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, { players: updated });
    }
  };

  const handleUpdateSettings = (newSettings: Partial<GameSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newSettings };
      if (gameMode === 'room' && roomId) {
        socketClient.updateSettings(roomId, updated);
      }
      return updated;
    });
  };

  // Start editing clue before the last person submits
  const handleStartEditClue = () => {
    // If all players have already submitted, editing is locked
    const unsubmitted = players.filter((p) => !p.hasSubmittedClue);
    if (unsubmitted.length === 0) return;

    sound.click();
    setIsEditingClue(true);
    setClueInput(activePlayer.originalClue || activePlayer.clue || '');
    clearBotTimeouts();

    const updated = players.map((p) =>
      p.id === activePlayer.id
        ? { ...p, hasSubmittedClue: false, isReady: false }
        : p
    );
    setPlayers(updated);

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, { players: updated });
      broadcastState('clue_submission', updated);
    }
  };

  // Cancel editing clue and restore prior submitted clue
  const handleCancelEditClue = () => {
    sound.click();
    setIsEditingClue(false);
    setClueInput('');

    const updated = players.map((p) =>
      p.id === activePlayer.id && p.clue
        ? { ...p, hasSubmittedClue: true, isReady: true }
        : p
    );
    setPlayers(updated);

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, { players: updated });
      broadcastState('clue_submission', updated);
    }

    const activeParticipants = updated.filter((p) => !p.isDisconnected);
    if (activeParticipants.length >= 2 && activeParticipants.every((p) => p.hasSubmittedClue)) {
      transitionToVoting(updated);
    } else {
      const hasBots = activeParticipants.some((p) => !p.isHuman && !p.hasSubmittedClue);
      if (hasBots && (gameMode !== 'room' || isHost)) {
        processBotClues(updated, 1500);
      }
    }
  };

  // Submit human player clue
  const handleSubmitClue = () => {
    if (!clueInput.trim()) return;
    sound.clueChime();

    const formattedClue = sanitizeClue(clueInput);
    const currentActiveId = activePlayer.id;
    setIsEditingClue(false);

    // Update player
    const updated = players.map((p) => {
      if (p.id === currentActiveId) {
        if (p.forgedBy || p.id === forgedTargetPlayerId || p.id === pendingClueForgedRef.current?.targetPlayerId) {
          return {
            ...p,
            originalClue: formattedClue,
            clue: formattedClue,
            hasSubmittedClue: true,
            isReady: true,
          };
        }
        return { ...p, clue: formattedClue, hasSubmittedClue: true, isReady: true };
      }
      return p;
    });
    setPlayers(updated);
    setClueInput('');

    // In Room mode, sync submitted clue immediately so other peers see it live
    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, { players: updated });
      broadcastState('clue_submission', updated);
    }

    // In Pass & Play mode: advance to next player or check if all done
    if (gameMode === 'pass_and_play') {
      const nextIdx = passAndPlayIndex + 1;
      const humanPlayers = updated.filter((p) => p.isHuman);
      if (nextIdx < humanPlayers.length) {
        setPassAndPlayIndex(nextIdx);
        setIsPassAndPlayModalOpen(true);
        return;
      }
    }

    const activeParticipants = updated.filter((p) => !p.isDisconnected);
    // Strict requirement: MUST wait for everyone to input their clue before starting voting section!
    if (activeParticipants.length >= 2 && activeParticipants.every((p) => p.hasSubmittedClue)) {
      transitionToVoting(updated);
      return;
    }

    // If there are unsubmitted AI bots, trigger their clues with staggered delays
    const hasUnsubmittedBots = activeParticipants.some((p) => !p.isHuman && !p.hasSubmittedClue);
    if (hasUnsubmittedBots && (gameMode !== 'room' || isHost)) {
      processBotClues(updated, 1800);
    }
  };

  const autoSubmitCurrentClue = () => {
    setIsEditingClue(false);
    clearBotTimeouts();
    const activeCoord = secretCoordinateRef.current || secretCoordinate;
    const activeCat = categoryRef.current || category;
    const secretWord = activeCoord?.item || activeCat?.items[0] || '';

    // For anyone who hasn't submitted a clue yet, auto-assign valid clues
    setPlayers((prev) => {
      const existingClues = prev.filter((p) => p.hasSubmittedClue && p.clue && p.clue.trim()).map((p) => p.clue);
      const updated = prev.map((p) => {
        if (p.hasSubmittedClue && p.clue && p.clue.trim()) return p;
        if (p.id === pendingClueForgedRef.current?.targetPlayerId || p.id === forgedTargetPlayerId) {
          const fallback = p.isHuman
            ? (p.role === 'fox' ? 'Wild' : (secretWord || 'Hint'))
            : generateBotClue(p, activeCat, secretWord, existingClues, settings.foxSeeOneClueEarly);
          return {
            ...p,
            originalClue: p.originalClue || sanitizeClue(fallback),
            clue: sanitizeClue(fallback),
            hasSubmittedClue: true,
            isReady: true,
          };
        }
        const fallback = p.isHuman
          ? (p.role === 'fox' ? 'Wild' : (secretWord || 'Hint'))
          : generateBotClue(p, activeCat, secretWord, existingClues, settings.foxSeeOneClueEarly);
        return { ...p, clue: sanitizeClue(fallback), hasSubmittedClue: true, isReady: true };
      });
      if (gameMode === 'room' && roomId) {
        socketClient.syncState(roomId, { players: updated });
        broadcastState('clue_submission', updated);
      }
      // Everyone has a clue now, transition to voting
      transitionToVoting(updated);
      return updated;
    });
  };

  // Simulate AI bots submitting clues
  const processBotClues = (
    currentPlayers: Player[],
    baseDelay = 1200,
    overrideCoord?: Coordinate | null,
    overrideCat?: Category
  ) => {
    clearBotTimeouts();
    const activeParticipants = currentPlayers.filter((p) => !p.isDisconnected);
    const unsubmittedBots = activeParticipants.filter((p) => !p.isHuman && !p.hasSubmittedClue);

    if (unsubmittedBots.length === 0) {
      // Check if all active players have submitted
      if (activeParticipants.length >= 2 && activeParticipants.every((p) => p.hasSubmittedClue)) {
        transitionToVoting(currentPlayers);
      }
      return;
    }

    const currentCoord = overrideCoord || secretCoordinateRef.current || secretCoordinate;
    const currentCat = overrideCat || categoryRef.current || category;
    const secretWord = currentCoord?.item || currentCat?.items[0] || '';

    // Stagger bot clues realistically
    unsubmittedBots.forEach((bot, idx) => {
      const delay = baseDelay + idx * 3000 + Math.floor(Math.random() * 800);

      const t = setTimeout(() => {
        setPlayers((prev) => {
          const currentBot = prev.find((p) => p.id === bot.id);
          if (!currentBot || currentBot.hasSubmittedClue) return prev;

          const existingClues = prev
            .filter((p) => p.hasSubmittedClue && p.clue && p.clue.trim())
            .map((p) => p.clue);

          const activeCoord = overrideCoord || secretCoordinateRef.current || secretCoordinate;
          const activeCat = overrideCat || categoryRef.current || category;
          const targetItem = activeCoord?.item || activeCat?.items[0] || secretWord;

          const botClue = generateBotClue(
            currentBot,
            activeCat,
            targetItem,
            existingClues,
            settings.foxSeeOneClueEarly
          );

          const isBotForged =
            bot.id === pendingClueForgedRef.current?.targetPlayerId ||
            bot.id === forgedTargetPlayerId;

          const nextPlayers = prev.map((p) => {
            if (p.id === bot.id) {
              if (isBotForged) {
                return {
                  ...p,
                  originalClue: p.originalClue || sanitizeClue(botClue),
                  clue: p.clue || sanitizeClue(botClue),
                  hasSubmittedClue: true,
                  isReady: true,
                };
              }
              return { ...p, clue: sanitizeClue(botClue), hasSubmittedClue: true, isReady: true };
            }
            return p;
          });

          if (gameMode === 'room' && roomId) {
            socketClient.syncState(roomId, { players: nextPlayers });
            broadcastState('clue_submission', nextPlayers);
          }

          sound.click();

          // Check if EVERY active player has now submitted their clue
          const activeParticipants = nextPlayers.filter((p) => !p.isDisconnected);
          if (activeParticipants.length >= 2 && activeParticipants.every((p) => p.hasSubmittedClue)) {
            const finishTimer = setTimeout(() => {
              setPlayers((latest) => {
                const latestActive = latest.filter((p) => !p.isDisconnected);
                // Strict requirement: MUST wait for everyone to input their clue before starting voting section!
                if (latestActive.length >= 2 && latestActive.every((p) => p.hasSubmittedClue)) {
                  transitionToVoting(latest);
                }
                return latest;
              });
            }, 600);
            botTimeoutsRef.current.push(finishTimer);
          }

          return nextPlayers;
        });
      }, delay);

      botTimeoutsRef.current.push(t);
    });
  };

  // Transition from Clues to Voting Phase
  const transitionToVoting = (finalPlayers: Player[]) => {
    clearBotTimeouts();
    setIsEditingClue(false);
    sound.accuse();

    const activeCoord = secretCoordinateRef.current || secretCoordinate;
    const activeCat = categoryRef.current || category;
    const secretWord = activeCoord?.item || activeCat?.items[0] || '';

    // GUARANTEE: Every player (especially AI bots) has a non-empty submitted clue!
    const verifiedPlayers = finalPlayers.map((p) => {
      if (p.clue && p.clue.trim() !== '') {
        return { ...p, hasSubmittedClue: true, isReady: true };
      }
      const existingClues = finalPlayers.filter((pl) => pl.clue && pl.clue.trim()).map((pl) => pl.clue);
      const generated = p.isHuman
        ? (p.role === 'fox' ? 'Wild' : (secretWord || 'Hint'))
        : generateBotClue(p, activeCat, secretWord, existingClues, settings.foxSeeOneClueEarly);
      return {
        ...p,
        clue: sanitizeClue(generated || (p.role === 'fox' ? 'Wild' : 'Clue')),
        hasSubmittedClue: true,
        isReady: true,
      };
    });
 
    // Silently execute Chameleon Forgery if one was planned!
    const pending = pendingClueForgedRef.current;
    const targetForgedId = pending?.targetPlayerId || forgedTargetPlayerId;
    const forgedText = pending?.newClue;

    let finalWithForgedClues = verifiedPlayers;
    if (targetForgedId && forgedText) {
      finalWithForgedClues = verifiedPlayers.map((p) =>
        p.id === targetForgedId
          ? {
              ...p,
              originalClue: p.originalClue || p.clue,
              clue: sanitizeClue(forgedText),
              forgedBy: p.forgedBy,
              hasSubmittedClue: true,
              isReady: true,
            }
          : p
      );
      setForgedTargetPlayerId(targetForgedId);
    } else if (targetForgedId) {
      setForgedTargetPlayerId(targetForgedId);
    }

    setPlayers(finalWithForgedClues);
    setGamePhase('voting');
    gamePhaseRef.current = 'voting';
    setVoteRound(1);
    setSuddenDeath(false);
    sound.voteStart();
    setSelectedVoteTargetId(null);

    if (gameMode === 'pass_and_play') {
      setPassAndPlayIndex(0);
      setIsPassAndPlayModalOpen(true);
    }

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, {
        gamePhase: 'voting',
        players: finalWithForgedClues,
        voteRound: 1,
        suddenDeath: false,
      });
    }
    broadcastState('voting', finalWithForgedClues);
  };

  // Automatically transition from clues to voting when all remaining active players have submitted clues
  useEffect(() => {
    if (gamePhase !== 'clue_submission') return;
    if (isEditingClue) return;
    const activeParticipants = players.filter((p) => !p.isDisconnected);
    if (activeParticipants.length >= 2 && activeParticipants.every((p) => p.hasSubmittedClue)) {
      if (gameMode !== 'room' || isHost) {
        const timer = setTimeout(() => {
          transitionToVoting(players);
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [gamePhase, players, gameMode, isHost, isEditingClue]);

  // Human player submits vote
  const handleSubmitVote = () => {
    if (!selectedVoteTargetId) return;
    sound.click();

    const currentVoterId = activePlayer.id;
    const updated = players.map((p) =>
      p.id === currentVoterId ? { ...p, votedForId: selectedVoteTargetId } : p
    );
    setPlayers(updated);

    // In Room mode, sync vote immediately
    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, { players: updated });
      broadcastState('voting', updated);
    }

    // In Pass & Play mode: advance to next player or check if all done
    if (gameMode === 'pass_and_play') {
      const nextIdx = passAndPlayIndex + 1;
      const humanPlayers = updated.filter((p) => p.isHuman);
      if (nextIdx < humanPlayers.length) {
        setPassAndPlayIndex(nextIdx);
        setSelectedVoteTargetId(null);
        setIsPassAndPlayModalOpen(true);
        return;
      }
    }

    const activeParticipants = updated.filter((p) => !p.isDisconnected);
    // Check if there are unsubmitted AI bots that need to vote
    const hasUnsubmittedBots = activeParticipants.some((p) => !p.isHuman && !p.votedForId);
    if (hasUnsubmittedBots && (gameMode !== 'room' || isHost)) {
      processBotVotes(updated);
      return;
    }

    // Strict requirement: MUST wait for everyone active to put in their vote before showing results!
    if (activeParticipants.length >= 2 && activeParticipants.every((p) => Boolean(p.votedForId))) {
      setTimeout(() => {
        evaluateVotingTally(updated);
      }, 250);
    }
  };

  const resolveSuddenDeathTimeout = () => {
    if (gamePhaseRef.current !== 'voting') return;
    const currentPlayers = players;
    const actualFox = currentPlayers.find((p) => p.role === 'fox') || currentPlayers[0];
    if (!actualFox) return;
    const tally: Record<string, number> = {};
    currentPlayers.forEach((p) => {
      if (p.votedForId) tally[p.votedForId] = (tally[p.votedForId] || 0) + 1;
    });
    resolveRound(false, undefined, currentPlayers, tally, null, actualFox, 'fox_won_sudden_death');
  };

  const autoSubmitCurrentVote = () => {
    // For anyone who hasn't voted yet, assign a vote to another random player
    setPlayers((prev) => {
      const updated = prev.map((p) => {
        if (p.votedForId) return p;
        const candidates = prev.filter((cand) => cand.id !== p.id);
        const randomTarget = candidates[Math.floor(Math.random() * candidates.length)]?.id || prev[0].id;
        return { ...p, votedForId: randomTarget };
      });
      if (gameMode === 'room' && roomId) {
        socketClient.syncState(roomId, { players: updated });
        broadcastState('voting', updated);
      }
      // Everyone has voted now, evaluate tally
      setTimeout(() => {
        evaluateVotingTally(updated);
      }, 250);
      return updated;
    });
  };

  // Process AI Bot Votes with realistic deliberation stagger
  const processBotVotes = (currentPlayers: Player[]) => {
    const activeParticipants = currentPlayers.filter((p) => !p.isDisconnected);
    const unvotedBots = activeParticipants.filter((p) => !p.isHuman && !p.votedForId);

    if (unvotedBots.length === 0) {
      // Check if everyone active has voted
      if (activeParticipants.length >= 2 && activeParticipants.every((p) => Boolean(p.votedForId))) {
        setTimeout(() => {
          evaluateVotingTally(currentPlayers);
        }, 250);
      }
      return;
    }

    let delay = 200;
    unvotedBots.forEach((bot, idx) => {
      setTimeout(() => {
        setPlayers((prev) => {
          const voteId = decideBotVote(
            bot,
            prev,
            category,
            secretCoordinate?.item || ''
          );

          const nextPlayers = prev.map((p) =>
            p.id === bot.id ? { ...p, votedForId: voteId } : p
          );

          if (gameMode === 'room' && roomId) {
            socketClient.syncState(roomId, { players: nextPlayers });
            broadcastState('voting', nextPlayers);
          }

          sound.click();

          // Check if this was the last bot AND if everyone active has voted
          if (idx === unvotedBots.length - 1) {
            setTimeout(() => {
              setPlayers((latest) => {
                const latestActive = latest.filter((p) => !p.isDisconnected);
                // Strict requirement: MUST wait for everyone active to put in their vote before showing results!
                if (latestActive.length >= 2 && latestActive.every((p) => Boolean(p.votedForId))) {
                  evaluateVotingTally(latest);
                }
                return latest;
              });
            }, 250);
          }

          return nextPlayers;
        });
      }, delay);
      delay += 250;
    });
  };

  // Automatically evaluate voting tally as soon as ALL active players have cast their votes
  useEffect(() => {
    if (gamePhase !== 'voting') return;
    const activeParticipants = players.filter((p) => !p.isDisconnected);
    if (activeParticipants.length >= 2 && activeParticipants.every((p) => Boolean(p.votedForId))) {
      if (gameMode !== 'room' || isHost) {
        const timer = setTimeout(() => {
          evaluateVotingTally(players);
        }, 250);
        return () => clearTimeout(timer);
      }
    }
  }, [gamePhase, players, gameMode, isHost]);

  // Automated AI bot discussion remarks during voting / debate phase
  useEffect(() => {
    if (gamePhase !== 'voting') return;
    const bots = players.filter((p) => !p.isHuman);
    if (bots.length === 0) return;

    const shuffledBots = [...bots].sort(() => Math.random() - 0.5).slice(0, Math.min(2, bots.length));
    const timeouts: NodeJS.Timeout[] = [];

    shuffledBots.forEach((bot, idx) => {
      const isBotSilenced = silencedPlayerIds.includes(bot.id);
      const delay = 900 + idx * 2400;

      const t = setTimeout(() => {
        setDiscussionMessages((prev) => {
          if (prev.some((m) => m.playerId === bot.id)) return prev;

          let msg = '';
          if (isBotSilenced) {
            msg = '... [muffled attempts to speak through the magical silence curse] 🤐';
          } else {
            const suspectCandidates = players.filter((p) => p.id !== bot.id && p.clue);
            const suspect = suspectCandidates[Math.floor(Math.random() * suspectCandidates.length)];
            const phrases = [
              suspect
                ? `I'm analyzing clues carefully... ${suspect.name}'s clue "${suspect.clue}" feels really suspicious! 🧐`
                : "Look closely at the grid coordinates!",
              "My clue connects directly to the category topic, I assure everyone! 🎯",
              suspect
                ? `Notice how ${suspect.name}'s clue is super broad? Anyone could guess that without knowing the secret word!`
                : "The Infiltrator is definitely hiding among us.",
              "I'm voting based on grid alignment. Trust the clues! 🗺️",
            ];
            msg = phrases[Math.floor(Math.random() * phrases.length)];
          }

          return [
            ...prev,
            {
              id: `msg-${Date.now()}-${bot.id}`,
              playerId: bot.id,
              playerName: bot.name,
              playerAvatar: bot.avatar,
              message: msg,
              timestamp: Date.now(),
              isSilencedAttempt: isBotSilenced,
            },
          ];
        });
      }, delay);

      timeouts.push(t);
    });

    return () => timeouts.forEach((t) => clearTimeout(t));
  }, [gamePhase, silencedPlayerIds, players]);

  // Calculate Infiltrator drawing odds for active player
  const myInfiltratorOdds = React.useMemo(() => {
    const list = players.map((p) => 1 + Math.floor((p.infiltratorBoostGold ?? p.chameleonBoostGold ?? 0) / 50));
    const total = list.reduce((a, b) => a + b, 0);
    const myTickets = 1 + Math.floor((activePlayer.infiltratorBoostGold ?? activePlayer.chameleonBoostGold ?? 0) / 50);
    return total > 0 ? (myTickets / total) * 100 : 0;
  }, [players, activePlayer]);

  // Evaluate votes and determine if Fox was caught
  const evaluateVotingTally = (votedPlayers: Player[]) => {
    if (gamePhaseRef.current !== 'voting') return;
    // Strict requirement: MUST wait for everyone to put in their vote before showing results!
    if (!votedPlayers.every((p) => Boolean(p.votedForId))) {
      return;
    }
    sound.voteEnd();
    const tally: Record<string, number> = {};
    votedPlayers.forEach((p) => {
      if (p.votedForId) {
        tally[p.votedForId] = (tally[p.votedForId] || 0) + 1;
      }
    });

    // Deduct 1 vote against shielded players (Vote Shield effect)
    activeVoteShields.forEach((shieldedId) => {
      if (tally[shieldedId] !== undefined) {
        tally[shieldedId] = Math.max(0, tally[shieldedId] - 1);
      }
    });

    // Find player with highest votes and check if multiple players share the max vote count
    let maxVotes = -1;
    const playersWithMaxVotes: string[] = [];

    Object.entries(tally).forEach(([targetId, count]) => {
      if (count > maxVotes) {
        maxVotes = count;
        playersWithMaxVotes.length = 0;
        playersWithMaxVotes.push(targetId);
      } else if (count === maxVotes && count > 0) {
        playersWithMaxVotes.push(targetId);
      }
    });

    const isTie = playersWithMaxVotes.length > 1 || maxVotes <= 0;
    const accusedId = !isTie && playersWithMaxVotes.length === 1 ? playersWithMaxVotes[0] : null;

    const accusedPlayer = votedPlayers.find((p) => p.id === accusedId) || null;
    const actualFox = votedPlayers.find((p) => p.role === 'fox') || votedPlayers[0];
    const caughtFox = votedPlayers.find((p) => p.id === accusedId && p.role === 'fox') || actualFox;

    // Voting Tie-Breaker Edge Case Handling:
    // If two or more players receive the exact same highest vote count,
    // treat the round as "Infiltrator Escapes" (confusion in the group allowed the Infiltrator to slip away unnoticed).
    if (isTie) {
      sound.caught();
      setCaughtInfiltratorId(null);
      resolveRound(
        false,
        undefined,
        votedPlayers,
        tally,
        null,
        actualFox,
        'TIE_VOTE',
        'Tied vote! The Infiltrator slipped away in the confusion.'
      );
      return;
    }

    // Otherwise, if the accused player has the infiltrator role, they were caught.
    const accusedIsFox = votedPlayers.some((p) => p.role === 'fox' && p.id === accusedId);
    const foxWasCaught = !isTie && accusedId !== null && accusedIsFox;

    if (foxWasCaught) {
      sound.caught();
      const targetFox = caughtFox || actualFox;
      setCaughtInfiltratorId(targetFox.id);
      setGamePhase('fox_guess');

      if (gameMode === 'pass_and_play') {
        // Specifically switch pass-and-play turn to the caught Infiltrator
        const chamIdx = votedPlayers.filter((p) => p.isHuman).findIndex((p) => p.id === targetFox.id);
        if (chamIdx !== -1) {
          setPassAndPlayIndex(chamIdx);
          setIsPassAndPlayModalOpen(true);
        }
      }

      if (gameMode === 'room' && roomId) {
        socketClient.syncState(roomId, {
          gamePhase: 'fox_guess',
          players: votedPlayers,
          foxPlayerId: targetFox.id,
        });
        broadcastState('fox_guess', votedPlayers);
      }

      // CRITICAL: Only open the interactive guess modal for the ACTUAL caught infiltrator if human!
      // Regular innocent players are NEVER given the task of guessing the word!
      if (targetFox.id === myPlayerId && targetFox.isHuman) {
        setIsFoxGuessModalOpen(true);
      } else {
        setIsFoxGuessModalOpen(false);
      }

      // If Fox is an AI bot, let AI bot guess automatically after brief snappy deliberation
      if (!targetFox.isHuman) {
        setTimeout(() => {
          const allInnocentClues = votedPlayers
            .filter((p) => p.role === 'innocent')
            .map((p) => p.clue);

          const aiGuess = botFoxGuessWord(category, allInnocentClues);
          setSelectedGuessWord(aiGuess);

          setTimeout(() => {
            resolveRound(true, aiGuess, votedPlayers, tally, accusedPlayer, targetFox);
          }, 350);
        }, 500);
      }
    } else {
      // Fox escaped undetected! Innocents voted for someone else.
      sound.victory();
      setCaughtInfiltratorId(null);
      resolveRound(false, undefined, votedPlayers, tally, accusedPlayer, actualFox);
    }
  };

  // Fox submits escape guess
  const handleSubmitFoxGuess = () => {
    if (!selectedGuessWord) return;
    sound.click();
    setIsFoxGuessModalOpen(false);

    const actualFox =
      players.find((p) => p.id === (caughtInfiltratorId || foxPlayerId)) ||
      players.find((p) => p.role === 'fox') ||
      players[0];
    const accusedPlayer = actualFox; // Fox was accused
    const tally: Record<string, number> = {};
    players.forEach((p) => {
      if (p.votedForId) tally[p.votedForId] = (tally[p.votedForId] || 0) + 1;
    });

    resolveRound(true, selectedGuessWord, players, tally, accusedPlayer, actualFox);
  };

  // Finalize Round Resolution & Scoring
  const resolveRound = (
    foxWasCaught: boolean,
    foxGuessWord: string | undefined,
    currentPlayers: Player[],
    tally: Record<string, number>,
    accusedPlayer: Player | null,
    actualFox: Player,
    forcedReason?: RoundResolution['reason'],
    customMessage?: string
  ) => {
    const targetWord = secretCoordinate?.item || '';
    const pointsAwarded: Record<string, { points: number; explanation: string }> = {};

    let winner: 'innocents' | 'fox';
    let reason: RoundResolution['reason'];

    const innocentCatchPts = settings.innocentCatchPoints || 2;
    const infiltratorStealPts = settings.infiltratorStealPoints ?? settings.chameleonStealPoints ?? 1;
    const infiltratorEscapePts = settings.infiltratorEscapePoints ?? settings.chameleonEscapePoints ?? 2;

    if (forcedReason === 'TIE_VOTE') {
      winner = 'fox';
      reason = 'TIE_VOTE';
      pointsAwarded[actualFox.id] = {
        points: infiltratorEscapePts,
        explanation: `Tied vote! The Infiltrator slipped away in the confusion (+${infiltratorEscapePts} pts)!`,
      };
    } else if (foxWasCaught) {
      const isGuessCorrect =
        foxGuessWord?.trim().toLowerCase() === targetWord.trim().toLowerCase();

      if (isGuessCorrect) {
        // Fox steals the win
        winner = 'fox';
        reason = 'fox_stole_win';
        pointsAwarded[actualFox.id] = {
          points: infiltratorStealPts,
          explanation: `Caught, but correctly guessed the secret word (+${infiltratorStealPts} pts)!`,
        };
      } else {
        // Innocents win
        winner = 'innocents';
        reason = 'innocents_caught_fox';
        currentPlayers.forEach((p) => {
          if (p.role === 'innocent') {
            let pts = innocentCatchPts;
            let expl = `Infiltrator caught (+${innocentCatchPts} pts)`;
            // Bonus 1 pt for guessing fox if setting enabled
            if (settings.pointForGuessingFox && p.votedForId === actualFox.id) {
              pts += 1;
              expl = `Infiltrator caught (+${innocentCatchPts} pts) + Correct Infiltrator vote bonus (+1 pt)`;
            }
            pointsAwarded[p.id] = { points: pts, explanation: expl };
          }
        });
      }
    } else {
      // Fox escapes undetected
      winner = 'fox';
      reason = forcedReason || 'fox_escaped_undetected';
      pointsAwarded[actualFox.id] = {
        points: infiltratorEscapePts,
        explanation: forcedReason === 'fox_won_sudden_death'
          ? `Won the sudden-death vote (+${infiltratorEscapePts} pts)!`
          : `Escaped undetected by blending in (+${infiltratorEscapePts} pts)!`,
      };
    }

    // Award bonus point for guessing fox to any innocents who did vote for fox even if fox won or escaped
    if (settings.pointForGuessingFox && !pointsAwarded[actualFox.id]?.explanation.includes('bonus')) {
      currentPlayers.forEach((p) => {
        if (p.role === 'innocent' && p.votedForId === actualFox.id && !pointsAwarded[p.id]) {
          pointsAwarded[p.id] = {
            points: 1,
            explanation: 'Correct Infiltrator accusation bonus (+1 pt)',
          };
        }
      });
    }

    // Update cumulative scores and award 100 Gold coins per round
    const updatedPlayers = currentPlayers.map((p) => {
      const earned = pointsAwarded[p.id]?.points || 0;
      const priorStats = p.lifetimeStats || {
        roundsPlayed: 0,
        correctInfiltratorVotes: 0,
        accusationVotesReceived: 0,
        infiltratorRoundsWonWithoutAccusation: 0,
        goldSpent: 0,
      };
      return {
        ...p,
        score: p.score + earned,
        gold: (p.gold ?? 0) + 100,
        lifetimeStats: {
          ...priorStats,
          roundsPlayed: priorStats.roundsPlayed + 1,
          correctInfiltratorVotes: priorStats.correctInfiltratorVotes + (p.role === 'innocent' && p.votedForId === actualFox.id ? 1 : 0),
          accusationVotesReceived: priorStats.accusationVotesReceived + (tally[p.id] || 0),
          infiltratorRoundsWonWithoutAccusation: priorStats.infiltratorRoundsWonWithoutAccusation +
            (p.id === actualFox.id && winner === 'fox' && (tally[p.id] || 0) === 0 ? 1 : 0),
        },
      };
    });

    const isMatchComplete = settings.targetScore > 0 && updatedPlayers.some((p) => p.score >= settings.targetScore);
    const accolades: Record<string, string[]> = {};
    updatedPlayers.forEach((p) => {
      const stats = p.lifetimeStats!;
      const earned: string[] = [];
      if (stats.infiltratorRoundsWonWithoutAccusation > 0) earned.push('🎭 Master of Disguise');
      if (stats.roundsPlayed > 0 && stats.correctInfiltratorVotes === stats.roundsPlayed) earned.push('🔍 Sherlock');
      accolades[p.id] = earned;
    });
    const spender = [...updatedPlayers].sort((a, b) => (b.lifetimeStats?.goldSpent || 0) - (a.lifetimeStats?.goldSpent || 0))[0];
    if (spender && (spender.lifetimeStats?.goldSpent || 0) > 0) {
      accolades[spender.id] = [...(accolades[spender.id] || []), '💰 Big Spender'];
    }

    const resolution: RoundResolution = {
      winner,
      reason,
      message:
        customMessage ||
        (reason === 'TIE_VOTE'
          ? 'Tied vote! The Infiltrator slipped away in the confusion.'
          : undefined),
      foxPlayerId: actualFox.id,
      foxPlayerName: actualFox.name,
      accusedPlayerId: accusedPlayer?.id || null,
      accusedPlayerName: accusedPlayer?.name || null,
      targetWord,
      targetCoordinate: secretCoordinate?.label || '',
      foxGuessWord,
      voteTally: tally,
      pointsAwarded,
      accolades,
      isMatchComplete,
    };

    setPlayers(updatedPlayers);
    setRoundResolution(resolution);
    setGamePhase('round_resolution');
    gamePhaseRef.current = 'round_resolution';
    setIsFoxGuessModalOpen(false);
    setIsResolutionModalOpen(true);

    if (winner === 'innocents') {
      sound.victory();
    } else {
      sound.caught();
    }

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, {
        gamePhase: 'round_resolution',
        roundNumber,
        players: updatedPlayers,
        roundResolution: resolution,
      });
    }

    broadcastState('round_resolution', updatedPlayers, resolution, roundNumber);
  };

  // Robust player removal: cleans up clues, votes, active effects, and immediately advances game phase if needed
  const handleRemovePlayer = (id: string) => {
    // Only host can kick other players in multiplayer room mode
    if (gameMode === 'room' && !isHost && id !== myPlayerId) {
      console.warn('Only the host can kick players');
      return;
    }

    sound.click();

    // 1. Filter out the removed player, and reset any votes that targeted this player
    const remaining = players
      .filter((p) => p.id !== id)
      .map((p) => (p.votedForId === id ? { ...p, votedForId: null } : p));

    // 2. Clear transient potion & peek effects referencing removed player
    if (impostorPeekPlayerId === id) setImpostorPeekPlayerId(null);
    if (clueLensPeekPlayerId === id) setClueLensPeekPlayerId(null);
    if (forgedTargetPlayerId === id) setForgedTargetPlayerId(null);
    if (pendingClueForged?.targetPlayerId === id) {
      setPendingClueForged(null);
      pendingClueForgedRef.current = null;
    }
    setActiveVoteShields((prev) => prev.filter((pid) => pid !== id));
    setSilencedPlayerIds((prev) => prev.filter((pid) => pid !== id));

    // 3. Minimum player constraint: If fewer than 3 players remain during active game
    if (gamePhase !== 'home' && gamePhase !== 'lobby' && remaining.length < 3) {
      setPlayers(remaining);
      setGamePhase('lobby');
      gamePhaseRef.current = 'lobby';
      clearBotTimeouts();
      setIsEditingClue(false);
      setIsFoxGuessModalOpen(false);
      setIsResolutionModalOpen(false);
      alert('A player was removed and fewer than 3 players remain. Returning to the Lobby.');
      if (gameMode === 'room' && roomId) {
        socketClient.removePlayer(roomId, id);
        socketClient.syncState(roomId, { gamePhase: 'lobby', players: remaining });
        broadcastState('lobby', remaining);
      }
      return;
    }

    // 4. Ensure there is still an Infiltrator/Fox assigned if an active round is ongoing
    let nextPlayers = remaining;
    if (gamePhase !== 'home' && gamePhase !== 'lobby' && nextPlayers.length >= 3) {
      const hasFox = nextPlayers.some((p) => p.role === 'fox');
      if (!hasFox) {
        nextPlayers = nextPlayers.map((p, idx) => ({
          ...p,
          role: idx === 0 ? 'fox' : 'innocent',
        }));
        setFoxPlayerId(nextPlayers[0].id);
      }
    }

    setPlayers(nextPlayers);

    if (gameMode === 'room' && roomId) {
      socketClient.removePlayer(roomId, id);
      socketClient.syncState(roomId, { players: nextPlayers });
      broadcastState(gamePhase, nextPlayers);
    }

    // 5. Clue submission phase:
    // CRITICAL FIX: If all remaining players have submitted their clues, IMMEDIATELY transition to voting!
    if (gamePhase === 'clue_submission') {
      const allSubmitted = nextPlayers.every((p) => p.hasSubmittedClue);
      if (allSubmitted && nextPlayers.length >= 3) {
        transitionToVoting(nextPlayers);
      } else {
        // Trigger any pending unsubmitted bots so the round does not hang
        const hasUnsubmittedBots = nextPlayers.some((p) => !p.isHuman && !p.hasSubmittedClue);
        if (hasUnsubmittedBots && (gameMode !== 'room' || isHost)) {
          processBotClues(nextPlayers, 1200);
        }
      }
    }

    // 6. Voting phase:
    // If all remaining players have voted, evaluate tally immediately!
    if (gamePhase === 'voting') {
      const allVoted = nextPlayers.every((p) => Boolean(p.votedForId));
      if (allVoted && nextPlayers.length >= 3) {
        evaluateVotingTally(nextPlayers);
      }
    }

    // 7. Fox guess phase:
    if (gamePhase === 'fox_guess') {
      if (caughtInfiltratorId === id) {
        setIsFoxGuessModalOpen(false);
        const actualFox = nextPlayers.find((p) => p.role === 'fox') || nextPlayers[0];
        resolveRound(false, undefined, nextPlayers, {}, null, actualFox);
      }
    }
  };

  // Next round trigger from resolution
  const handleNextRound = () => {
    // Only host can start next round in multiplayer rooms
    if (gameMode === 'room' && !isHost) {
      console.warn('Only the room host can start the next round');
      return;
    }

    setIsResolutionModalOpen(false);
    if (roundNumber % 3 === 0 && settings.itemsEnabled !== false) {
      // Reset all players' readiness to leave the shop
      const resetPlayers = players.map((p) => ({
        ...p,
        isReadyToLeaveShop: false,
      }));
      setPlayers(resetPlayers);
      setGamePhase('shop');
      gamePhaseRef.current = 'shop';
      if (gameMode === 'room' && roomId) {
        socketClient.syncState(roomId, {
          gamePhase: 'shop',
          players: resetPlayers,
          roundNumber,
        });
      }
      broadcastState('shop', resetPlayers, null, roundNumber);
    } else {
      const nextRound = roundNumber + 1;
      setRoundNumber(nextRound);
      startNewRound(true, nextRound);
    }
  };

  // Buy Potion in Shop (supports both active player and pass-and-play selected shopper)
  const handleBuyPotion = (potionId: string, cost: number, targetPlayerId?: string) => {
    const shopperId = targetPlayerId || activePlayer.id;
    const updated = players.map((p) => {
      if (p.id === shopperId) {
        const curGold = p.gold ?? 0;
        if (curGold < cost) return p;
        const currentInv = { ...(p.inventory || {}) };
        currentInv[potionId] = (currentInv[potionId] || 0) + 1;
        return {
          ...p,
          gold: curGold - cost,
          inventory: currentInv,
          lifetimeStats: {
            ...(p.lifetimeStats || {
              roundsPlayed: 0,
              correctInfiltratorVotes: 0,
              accusationVotesReceived: 0,
              infiltratorRoundsWonWithoutAccusation: 0,
              goldSpent: 0,
            }),
            goldSpent: (p.lifetimeStats?.goldSpent || 0) + cost,
          },
        };
      }
      return p;
    });
    setPlayers(updated);
    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, { players: updated });
    }
    broadcastState(gamePhase, updated);
  };

  // Toggle Confirm Leave Shop for a player
  const handleToggleConfirmLeave = (targetPlayerId: string, isReady: boolean) => {
    const updated = players.map((p) =>
      p.id === targetPlayerId ? { ...p, isReadyToLeaveShop: isReady } : p
    );
    setPlayers(updated);
    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, { players: updated });
    }
    broadcastState(gamePhase, updated);
  };

  // Exit Shop and transition to next round (roundNumber + 1)
  const handleExitShop = () => {
    if (gameMode === 'room' && !isHost) {
      console.warn('Only the room host can exit shop and start next round');
      return;
    }
    sound.shopDepart();
    const nextRound = roundNumber + 1;
    setRoundNumber(nextRound);
    startNewRound(true, nextRound);
  };

  // Use Potion from Inventory Panel
  const handleUsePotion = (potionId: string) => {
    if (settings.itemsEnabled === false) return;
    if (hasUsedPotionThisTurn) return;

    const potion = POTION_CATALOG.find((item) => item.id === potionId);
    const roleCompatible = !potion || potion.roleTarget === 'all' ||
      (potion.roleTarget === 'fox' && activePlayer.role === 'fox') ||
      (potion.roleTarget === 'innocent' && activePlayer.role === 'innocent');
    if (!roleCompatible) {
      setActivePotionToast({
        message: `${potion?.name || 'That potion'} is unavailable for your current role.`,
        icon: '🚫',
        style: 'amber',
      });
      return;
    }

    const currentInv = activePlayer.inventory || {};
    const count = currentInv[potionId] || 0;
    if (count <= 0) return;

    // Restrict Chameleon Oracle Serum to max 1 per round
    if (potionId === 'oracle_serum' && hasUsedOracleThisRound) {
      return;
    }

    // If Chameleon is using Ink of Deceit, open target selector & clue editor popup first
    if (potionId === 'ink_of_deceit') {
      sound.potionDrink();
      setIsClueForgeryModalOpen(true);
      return;
    }

    // If Chameleon is using Silence Curse, open player selection modal
    if (potionId === 'silence_curse') {
      sound.potionDrink();
      setIsSilenceModalOpen(true);
      return;
    }

    // Deduct potion from player inventory
    const updatedPlayers = players.map((p) => {
      if (p.id === activePlayer.id) {
        const nextInv = { ...(p.inventory || {}) };
        if (nextInv[potionId] > 1) {
          nextInv[potionId] -= 1;
        } else {
          delete nextInv[potionId];
        }
        return {
          ...p,
          inventory: nextInv,
          hasUsedPotionThisTurn: true,
          ...(potionId === 'vote_shield' ? { hasShield: true, shieldActive: true } : {}),
        };
      }
      return p;
    });
    setPlayers(updatedPlayers);

    // Enforce 1 use per turn
    setHasUsedPotionThisTurn(true);

    // Visual bubble/sparkle animation on active player row (filtered sneaky in UI)
    setRecentlyUsedPotionPlayerId(activePlayer.id);
    setRecentlyUsedPotionId(potionId);
    setTimeout(() => {
      setRecentlyUsedPotionPlayerId(null);
      setRecentlyUsedPotionId(null);
    }, 2400);

    if (potionId === 'oracle_serum') {
      sound.potionDrink();
      setIsOracleModalOpen(true);
      if (gameMode === 'room' && roomId) {
        socketClient.usePotion(roomId, activePlayer.id, 'oracle_serum');
        socketClient.syncState(roomId, { players: updatedPlayers });
      }
    } else if (potionId === 'grid_scrambler') {
      sound.powerup();
      setIsScrambling(true);
      setTimeout(() => {
        setIsScrambling(false);
      }, 750);

      // Innocent effect: Public announcement for everyone including the Chameleon
      setActivePotionToast({
        message: `${activePlayer.name} activated Grid Scrambler — matrix randomized!`,
        icon: '🌀',
        style: 'cyan',
        isChameleonOnly: false,
      });
      setTimeout(() => setActivePotionToast(null), 3800);

      // If Chameleon previously used Oracle Serum, Scrambler shatters and strips their insight!
      if (oracleHighlight) {
        sound.shatter();
        setOracleHighlight(null);
        setOracleShattered(true);
        setTimeout(() => {
          setOracleShattered(false);
        }, 5000);
      }

      // Scramble the 16 words while keeping the secret target word!
      const currentTargetWord = secretCoordinate?.item;
      if (currentTargetWord) {
        const shuffled = [...category.items].sort(() => Math.random() - 0.5);
        const newCat: Category = { ...category, items: shuffled };
        setCategory(newCat);
        categoryRef.current = newCat;

        const newIndex = shuffled.indexOf(currentTargetWord);
        const newRIdx = Math.floor(newIndex / 4);
        const newCIdx = newIndex % 4;
        const cols: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];
        const rows: Array<1 | 2 | 3 | 4> = [1, 2, 3, 4];
        const newCoord: Coordinate = {
          col: cols[newCIdx],
          row: rows[newRIdx],
          colIndex: newCIdx,
          rowIndex: newRIdx,
          label: `${cols[newCIdx]}${rows[newRIdx]}`,
          item: currentTargetWord,
        };
        setSecretCoordinate(newCoord);
        secretCoordinateRef.current = newCoord;

        if (gameMode === 'room' && roomId) {
          socketClient.usePotion(roomId, activePlayer.id, 'grid_scrambler', {
            category: newCat,
            secretCoordinate: newCoord,
          });
          socketClient.syncState(roomId, {
            category: newCat,
            secretCoordinate: newCoord,
            players: updatedPlayers,
          });
          broadcastState(gamePhase, updatedPlayers);
        }
      }
    } else if (potionId === 'clue_lens') {
      sound.potionDrink();
      // Reveals a second player's submitted clue early during clue phase
      const otherPlayers = players.filter(
        (p) => p.id !== activePlayer.id && p.id !== impostorPeekPlayerId
      );
      if (otherPlayers.length > 0) {
        const target = otherPlayers.find((p) => p.hasSubmittedClue && p.clue) || otherPlayers[0];
        setClueLensPeekPlayerId(target.id);
      }

      if (gameMode === 'room' && roomId) {
        socketClient.usePotion(roomId, activePlayer.id, 'clue_lens');
        socketClient.syncState(roomId, {
          players: updatedPlayers,
        });
        broadcastState(gamePhase, updatedPlayers);
      }

      // Innocent effect: Public announcement for everyone including the Chameleon
      setActivePotionToast({
        message: `${activePlayer.name} activated Clue Lens (inspected an extra clue)!`,
        icon: '👁️',
        style: 'cyan',
        isChameleonOnly: false,
      });
      setTimeout(() => setActivePotionToast(null), 3800);
    } else if (potionId === 'vote_shield') {
      sound.potionDrink();
      setActiveVoteShields((prev) => (prev.includes(activePlayer.id) ? prev : [...prev, activePlayer.id]));

      if (gameMode === 'room' && roomId) {
        socketClient.usePotion(roomId, activePlayer.id, 'vote_shield');
        socketClient.syncState(roomId, {
          players: updatedPlayers,
        });
        broadcastState(gamePhase, updatedPlayers);
      }

      // Innocent effect: Public announcement for everyone including the Chameleon
      setActivePotionToast({
        message: `${activePlayer.name} activated Vote Shield (-1 incoming vote penalty)!`,
        icon: '🛡️',
        style: 'sky',
        isChameleonOnly: false,
      });
      setTimeout(() => setActivePotionToast(null), 3800);
    }
  };

  // Chameleon confirms Ink of Deceit / Clue Forgery
  const handleConfirmClueForgery = (targetPlayerId: string, newClue: string) => {
    sound.powerup();

    const sanitizedForgedClue = sanitizeClue(newClue);

    // Update players state without alerting the target player
    const updated = players.map((p) => {
      if (p.id === activePlayer.id) {
        const nextInv = { ...(p.inventory || {}) };
        if (nextInv['ink_of_deceit'] > 1) {
          nextInv['ink_of_deceit'] -= 1;
        } else {
          delete nextInv['ink_of_deceit'];
        }
        return {
          ...p,
          inventory: nextInv,
          hasUsedPotionThisTurn: true,
        };
      }
      if (p.id === targetPlayerId) {
        return {
          ...p,
          originalClue: p.originalClue || p.clue || '',
          forgedBy: activePlayer.id,
          // CRITICAL: Do NOT overwrite p.clue during clue_submission!
          // The target player will continue to see their own entered clue until voting begins.
        };
      }
      return p;
    });

    setPlayers(updated);
    setHasUsedPotionThisTurn(true);
    setPendingClueForged({ targetPlayerId, newClue: sanitizedForgedClue });
    pendingClueForgedRef.current = { targetPlayerId, newClue: sanitizedForgedClue };
    setForgedTargetPlayerId(targetPlayerId);
    setIsClueForgeryModalOpen(false);

    if (gameMode === 'room' && roomId) {
      socketClient.usePotion(roomId, activePlayer.id, 'ink_of_deceit', {
        targetPlayerId,
        newClue: sanitizedForgedClue,
      });
      socketClient.syncState(roomId, {
        players: updated,
        forgedTargetPlayerId: targetPlayerId,
        pendingClueForged: { targetPlayerId, newClue: sanitizedForgedClue },
      });
      broadcastState('clue_submission', updated);
    }

    // Sneaky visual bubble strictly on Chameleon only
    setRecentlyUsedPotionPlayerId(activePlayer.id);
    setRecentlyUsedPotionId('ink_of_deceit');
    setTimeout(() => {
      setRecentlyUsedPotionPlayerId(null);
      setRecentlyUsedPotionId(null);
    }, 2400);

    // Chameleon stealth toast (strictly Chameleon eyes)
    setActivePotionToast({
      message: `Ink of Deceit active: forged clue "${sanitizedForgedClue}" will take effect when voting starts!`,
      icon: '✒️',
      style: 'purple',
      isChameleonOnly: true,
    });
    setTimeout(() => setActivePotionToast(null), 4000);
  };

  // Chameleon confirms Silence Curse on target player
  const handleConfirmSilence = (targetPlayerId: string) => {
    const target = players.find((p) => p.id === targetPlayerId);
    if (!target) return;

    sound.silence();

    // Deduct 1 silence_curse from active player's inventory
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === activePlayer.id) {
          const nextInv = { ...(p.inventory || {}) };
          if (nextInv['silence_curse'] > 1) {
            nextInv['silence_curse'] -= 1;
          } else {
            delete nextInv['silence_curse'];
          }
          return {
            ...p,
            inventory: nextInv,
          };
        }
        return p;
      })
    );

    setHasUsedPotionThisTurn(true);
    setSilencedPlayerIds((prev) => (prev.includes(targetPlayerId) ? prev : [...prev, targetPlayerId]));
    setIsSilenceModalOpen(false);

    setRecentlyUsedPotionPlayerId(activePlayer.id);
    setRecentlyUsedPotionId('silence_curse');
    setTimeout(() => {
      setRecentlyUsedPotionPlayerId(null);
      setRecentlyUsedPotionId(null);
    }, 2400);

    // Public announcement toast: everyone knows this player is muted during discussion
    setActivePotionToast({
      message: `🤐 ${target.name} has been silenced by an Elixir of Silence! They cannot speak during discussion!`,
      icon: '🤐',
      style: 'purple',
      isChameleonOnly: false,
    });
    setTimeout(() => setActivePotionToast(null), 4200);

    // Add entry to round discussion feed
    setDiscussionMessages((prev) => [
      ...prev,
      {
        id: `sys-${Date.now()}`,
        playerId: 'system',
        playerName: 'Game Master',
        playerAvatar: '⚖️',
        message: `🤐 ${target.name} was silenced by an Elixir of Silence! Their clue remains visible, but they cannot speak during discussion!`,
        timestamp: Date.now(),
      },
    ]);

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, {
        silencedPlayerIds: [...silencedPlayerIds, targetPlayerId],
      });
    }
  };

  // Handle sending discussion message from active player
  const handleSendDiscussionMessage = (text: string) => {
    const isSilenced = silencedPlayerIds.includes(activePlayer.id);
    if (isSilenced) {
      sound.click();
      setActivePotionToast({
        message: `🤐 You are silenced by The Infiltrator! You cannot speak during discussion!`,
        icon: '🤐',
        style: 'purple',
        isChameleonOnly: false,
      });
      setTimeout(() => setActivePotionToast(null), 3000);
      return;
    }

    sound.click();
    const newMsg: DiscussionMessage = {
      id: `msg-${Date.now()}-${activePlayer.id}`,
      playerId: activePlayer.id,
      playerName: activePlayer.name,
      playerAvatar: activePlayer.avatar,
      message: text,
      timestamp: Date.now(),
    };

    setDiscussionMessages((prev) => [...prev, newMsg]);

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, {
        discussionMessages: [...discussionMessages, newMsg],
      });
    }
  };

  // Handle gold investment to boost Infiltrator odds
  const handleUpdateInfiltratorBoost = (playerId: string, goldAmount: number) => {
    sound.coin();
    const val = Math.max(0, goldAmount);
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === playerId) {
          return {
            ...p,
            infiltratorBoostGold: val,
            chameleonBoostGold: val,
          };
        }
        return p;
      })
    );

    if (gameMode === 'room' && roomId) {
      socketClient.syncState(roomId, {
        players: players.map((p) =>
          p.id === playerId
            ? { ...p, infiltratorBoostGold: val, chameleonBoostGold: val }
            : p
        ),
      });
    }
  };

  const handleSelectOracleChoice = (choice: 'row' | 'col') => {
    if (!secretCoordinate) return;
    sound.powerup();
    if (choice === 'row') {
      setOracleHighlight({ type: 'row', value: secretCoordinate.row });
    } else {
      setOracleHighlight({ type: 'col', value: secretCoordinate.col });
    }
    setHasUsedOracleThisRound(true);
    setIsOracleModalOpen(false);

    // Chameleon stealth toast (strictly Chameleon eyes)
    setActivePotionToast({
      message: `Oracle insight locked: Target word is in ${
        choice === 'row' ? 'Row ' + (secretCoordinate.rowIndex + 1) : 'Column ' + secretCoordinate.col
      }!`,
      icon: '🧪',
      style: 'purple',
      isChameleonOnly: true,
    });
    setTimeout(() => setActivePotionToast(null), 4000);
  };

  // Create room handler from Homepage
  const handleCreateRoom = async (
    playerName: string,
    avatar: string,
    mode: GameMode,
    customRoomId?: string,
    password?: string
  ) => {
    sound.click();
    const newRoomId = (customRoomId || generateRoomId()).trim().toUpperCase();
    setRoomId(newRoomId);
    setGameMode(mode);
    if (password) {
      setSettings((prev) => ({ ...prev, roomPassword: password }));
    }

    const hostPlayer: Player = {
      id: myPlayerId,
      name: playerName || 'Player 1',
      avatar: avatar || '🦊',
      isHuman: true,
      isHost: true,
      score: 0,
      gold: 0,
      inventory: {},
      role: 'innocent',
      clue: '',
      hasSubmittedClue: false,
      votedForId: null,
      isReady: true,
    };

    if (mode === 'room') {
      // Room multiplayer: start with ONLY the host, no default AI bots!
      setPlayers([hostPlayer]);
      await socketClient.createRoom(newRoomId, hostPlayer, settings, mode, selectedCategoryId, password);
      socketClient.connect(newRoomId, hostPlayer, password);
    } else {
      // Solo / Pass & Play: populate bot companions
      setPlayers([
        hostPlayer,
        ...INITIAL_PLAYERS.slice(1),
      ]);
    }
    setGamePhase('lobby');
  };

  // Join room handler from Homepage
  const handleJoinRoom = async (
    targetRoomId: string,
    playerName: string,
    avatar: string,
    password?: string
  ) => {
    sound.click();
    const cleanRoomId = targetRoomId.trim().toUpperCase();
    setRoomId(cleanRoomId);
    setGameMode('room');
    if (password) {
      setSettings((prev) => ({ ...prev, roomPassword: password }));
    }

    const guestPlayer: Player = {
      id: myPlayerId,
      name: playerName || 'Guest',
      avatar: avatar || '🕵️',
      isHuman: true,
      isHost: false,
      score: 0,
      gold: 0,
      inventory: {},
      role: 'innocent',
      clue: '',
      hasSubmittedClue: false,
      votedForId: null,
      isReady: true,
    };

    // Join room on the server to get actual room players
    const result = await socketClient.joinRoom(cleanRoomId, guestPlayer, password);
    if (result && result.room && Array.isArray(result.room.players) && result.room.players.length > 0) {
      setPlayers(sanitizePlayers(result.room.players));
      if (result.room.settings) setSettings((prev) => ({ ...prev, ...result.room.settings }));
      if (result.room.gamePhase) setGamePhase(result.room.gamePhase);
      if (result.room.roundNumber !== undefined) setRoundNumber(result.room.roundNumber);
      if (result.room.voteRound !== undefined) setVoteRound(result.room.voteRound);
      if (result.room.suddenDeath !== undefined) setSuddenDeath(Boolean(result.room.suddenDeath));
      if (result.room.selectedCategoryId) setSelectedCategoryId(result.room.selectedCategoryId);
      if (result.room.category) setCategory(result.room.category);
    } else {
      // If room was not on server yet, initialize with just the guest player (no bots)
      setPlayers([guestPlayer]);
    }

    socketClient.connect(cleanRoomId, guestPlayer, password);
    setGamePhase('lobby');
  };

  // Auto-join if user loaded via direct invite link with autoJoin flag, OR reconnect cached session on tab refresh!
  useEffect(() => {
    if (inviteInfo.autoJoin && inviteInfo.roomId) {
      handleJoinRoom(inviteInfo.roomId, 'Player 2', '🕵️', inviteInfo.password);
    } else if (cachedSession && cachedSession.roomId && cachedSession.sessionToken) {
      const { roomId: cRoomId, playerId: cPlayerId, sessionToken: cToken, playerName, playerAvatar } = cachedSession;
      setRoomId(cRoomId);
      roomIdRef.current = cRoomId;
      setGameMode('room');
      const placeholderPlayer: Player = {
        id: cPlayerId,
        name: playerName || 'Player',
        avatar: playerAvatar || '🦊',
        isHuman: true,
        isHost: false,
        score: 0,
        role: 'innocent',
        clue: '',
        hasSubmittedClue: false,
        votedForId: null,
        isReady: true,
        sessionToken: cToken,
      };
      socketClient.reconnectSession(cRoomId, cPlayerId, cToken, placeholderPlayer);
      socketClient.reconnectSessionRest(cRoomId, cPlayerId, cToken).then((res) => {
        if (res?.room) {
          const room = res.room;
          if (room.players) setPlayers(sanitizePlayers(room.players));
          if (room.settings) setSettings((prev) => ({ ...prev, ...room.settings }));
          if (room.gamePhase) {
            setGamePhase(room.gamePhase);
            gamePhaseRef.current = room.gamePhase;
          }
          if (room.category) {
            setCategory(room.category);
            categoryRef.current = room.category;
          }
          if (room.secretCoordinate !== undefined) {
            setSecretCoordinate(room.secretCoordinate);
            secretCoordinateRef.current = room.secretCoordinate;
          }
          if (room.foxPlayerId !== undefined) setFoxPlayerId(room.foxPlayerId);
          if (room.roundResolution !== undefined) {
            setRoundResolution(room.roundResolution);
            if (room.roundResolution) setIsResolutionModalOpen(true);
          }
          if (room.roundNumber !== undefined) setRoundNumber(room.roundNumber);
          if (room.voteRound !== undefined) setVoteRound(room.voteRound);
          if (room.suddenDeath !== undefined) setSuddenDeath(Boolean(room.suddenDeath));
        }
      });
    }
  }, []);

  // Leave room / return to homepage
  const handleLeaveRoom = () => {
    sound.click();
    clearBotTimeouts();

    // 1. Notify server and cleanly close socket/polling connections
    const currentRoomId = roomId;
    const currentPlayerId = myPlayerId;
    socketClient.clearSession();
    if (currentRoomId) {
      socketClient.leaveRoom(currentRoomId, currentPlayerId);
    } else {
      socketClient.disconnect();
    }

    // 2. Close BroadcastChannel fallback
    if (broadcastChannelRef.current) {
      try {
        broadcastChannelRef.current.close();
      } catch (e) {}
      broadcastChannelRef.current = null;
    }

    // 3. Clear URL hash and query parameters
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', window.location.pathname);
    }
    inviteInfo.roomId = null;
    inviteInfo.password = null;
    inviteInfo.autoJoin = false;

    // 4. Reset room tracking
    setRoomId('');
    roomIdRef.current = '';
    setGameMode('solo');

    // 5. Reset players to fresh initial solo roster
    setPlayers(
      INITIAL_PLAYERS.map((p) => ({
        ...p,
        score: 0,
        role: 'innocent',
        clue: '',
        hasSubmittedClue: false,
        votedForId: null,
        isReady: false,
      }))
    );

    // 6. Reset all gameplay and modal states
    setGamePhase('home');
    gamePhaseRef.current = 'home';
    setRoundNumber(1);
    setRoundResolution(null);
    setIsResolutionModalOpen(false);
    setIsFoxGuessModalOpen(false);
    setCaughtInfiltratorId(null);
    setSecretCoordinate(null);
    secretCoordinateRef.current = null;
    setFoxPlayerId('');
    setClueInput('');
    setIsEditingClue(false);
    setSelectedVoteTargetId(null);
    setSelectedGuessWord(null);
    setImpostorPeekPlayerId(null);
    setPeerCount(0);
  };

  // Kick player handler for host
  const handleKickPlayer = async (targetPlayerId: string) => {
    if (gameMode === 'room' && !isHost) {
      console.warn('Only the host can kick players');
      return;
    }
    sound.click();
    const updated = players.filter((p) => p.id !== targetPlayerId);
    setPlayers(updated);

    if (gameMode === 'room' && roomId) {
      await socketClient.kickPlayer(roomId, targetPlayerId);
      socketClient.syncState(roomId, { players: updated });
      broadcastState(gamePhase, updated);
    }
  };

  const actualFoxPlayer =
    players.find((p) => p.id === (caughtInfiltratorId || foxPlayerId)) ||
    players.find((p) => p.role === 'fox') ||
    null;
  const isCurrentPlayerTheCaughtFox =
    activePlayer.role === 'fox' &&
    (caughtInfiltratorId ? activePlayer.id === caughtInfiltratorId : activePlayer.id === foxPlayerId);

  return (
    <div className="h-[100dvh] max-h-[100dvh] bg-dark-pattern flex flex-col overflow-hidden selection:bg-emerald-500 selection:text-slate-950 text-slate-100">
      {/* Header Bar */}
      <div className="shrink-0">
        <HeaderBar
          roomId={roomId}
          gameMode={gameMode}
          gamePhase={gamePhase}
          roundNumber={roundNumber}
          soundEnabled={soundEnabled}
          onToggleSound={() => setSoundEnabled(!soundEnabled)}
          onOpenOptions={() => setIsOptionsOpen(true)}
          onOpenRules={() => setIsRulesOpen(true)}
          onLeaveRoom={handleLeaveRoom}
          peerCount={peerCount}
          connectionState={connectionState}
          roomPassword={settings.roomPassword}
          players={players}
          isHost={isHost}
          myPlayerId={myPlayerId}
          onKickPlayer={handleKickPlayer}
          myInfiltratorOdds={myInfiltratorOdds}
          myInfiltratorBoostGold={activePlayer.infiltratorBoostGold ?? activePlayer.chameleonBoostGold}
        />
      </div>

      <FloatingReactions reactions={floatingReactions} />
      {gamePhase !== 'home' && (
        <div className="safe-bottom fixed bottom-3 right-3 z-30">
          <ReactionPicker onReact={handleSendReaction} />
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 min-h-0 max-w-7xl w-full mx-auto px-3 sm:px-6 py-2 sm:py-3 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {gamePhase === 'home' ? (
            /* HOMEPAGE VIEW */
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-0 overflow-y-auto flex flex-col"
            >
              <HomeView
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
                onOpenRules={() => setIsRulesOpen(true)}
                defaultRoomId={inviteInfo.roomId || ''}
                initialPassword={inviteInfo.password || ''}
                initialJoinTab={Boolean(inviteInfo.roomId && !inviteInfo.autoJoin)}
              />
            </motion.div>
          ) : gamePhase === 'lobby' ? (
            /* LOBBY VIEW */
            <motion.div
              key="lobby"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-0 overflow-y-auto flex flex-col"
            >
              <LobbyView
                players={players}
                myPlayerId={myPlayerId}
                gameMode={gameMode}
                selectedCategoryId={selectedCategoryId}
                onSelectCategory={(id) => {
                  setSelectedCategoryId(id);
                  if (gameMode === 'room' && roomId) {
                    const cat = CATEGORIES.find((c) => c.id === id) || CATEGORIES[0];
                    socketClient.syncState(roomId, { selectedCategoryId: id, category: cat });
                  }
                }}
                onAddBot={handleAddBot}
                onRemovePlayer={handleRemovePlayer}
                onUpdatePlayerName={handleUpdatePlayerName}
                onStartGame={() => startNewRound(false)}
                onOpenOptions={() => setIsOptionsOpen(true)}
                onOpenRules={() => setIsRulesOpen(true)}
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                roomId={roomId}
                onLeaveRoom={handleLeaveRoom}
                isHost={isHost}
                onUpdateInfiltratorBoost={handleUpdateInfiltratorBoost}
              />
            </motion.div>
          ) : (
            /* ACTIVE ARENA: TWO-COLUMN LAYOUT */
            <motion.div
              key="arena"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="flex-1 min-h-0 flex flex-col justify-between overflow-hidden"
            >
              {/* Middle content area: Left column table + 4x4 grid (scrollable on mobile) */}
              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                {/* Mobile/iPhone View Switcher: Quick toggle between 4x4 Board and Players/Clues */}
                <div className="lg:hidden sticky top-0 z-10 mb-3 flex items-center bg-slate-900/95 p-1 rounded-xl border border-slate-700/80 shadow-md backdrop-blur-md">
                  <button
                    type="button"
                    onClick={() => setMobileGameTab('board')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-display font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                      mobileGameTab === 'board'
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Grid3X3 className="w-3.5 h-3.5" />
                    <span>4×4 Board</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileGameTab('clues')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-display font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all ${
                      mobileGameTab === 'clues'
                        ? 'bg-emerald-500 text-slate-950 shadow-md'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Clues ({players.filter((p) => p.hasSubmittedClue).length}/{players.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileGameTab('both')}
                    className={`py-1.5 px-2.5 rounded-lg text-[11px] font-display font-bold uppercase tracking-wider transition-all ${
                      mobileGameTab === 'both'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    Both
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start pb-2">
                  {/* LEFT COLUMN: Player & Clue Table (expanded to 7 cols on lg/xl for full clue visibility) */}
                  <div className={`lg:col-span-7 flex flex-col ${mobileGameTab === 'board' ? 'hidden lg:flex' : 'flex'}`}>
                    <LeftColumnTable
                      players={players}
                      activePlayerId={activePlayer.id}
                      activePlayerRole={activePlayer.role}
                      impostorPeekPlayerId={impostorPeekPlayerId}
                      clueLensPeekPlayerId={clueLensPeekPlayerId}
                      activeVoteShields={activeVoteShields}
                      gamePhase={gamePhase}
                      anonymousVoting={settings.anonymousVoting}
                      hasUsedPotionThisTurn={hasUsedPotionThisTurn}
                      onUsePotion={handleUsePotion}
                      recentlyUsedPotionPlayerId={recentlyUsedPotionPlayerId}
                      recentlyUsedPotionId={recentlyUsedPotionId}
                      activePotionToast={activePotionToast}
                      inventory={activePlayer.inventory || {}}
                      gold={activePlayer.gold ?? 0}
                      pendingClueForged={pendingClueForged}
                      forgedTargetPlayerId={forgedTargetPlayerId}
                      silencedPlayerIds={silencedPlayerIds}
                      itemsEnabled={settings.itemsEnabled !== false}
                    />
                  </div>

                  {/* RIGHT COLUMN: 4x4 Grid Card & Banners (5 cols on lg/xl) */}
                  <div className={`lg:col-span-5 flex flex-col ${mobileGameTab === 'clues' ? 'hidden lg:flex' : 'flex'}`}>
                    <RightColumnGrid
                      key={`${activePlayer.id}-${gamePhase}`}
                      category={category}
                      role={activePlayer.role}
                      secretCoordinate={secretCoordinate}
                      gamePhase={gamePhase}
                      isFoxGuesser={gamePhase === 'fox_guess' && isCurrentPlayerTheCaughtFox}
                      onSelectWordGuess={(word) => setSelectedGuessWord(word)}
                      selectedGuessWord={selectedGuessWord}
                      isPassAndPlay={gameMode === 'pass_and_play'}
                      oracleHighlight={oracleHighlight}
                      isScrambling={isScrambling}
                      oracleShattered={oracleShattered}
                    />
                    {settings.itemsEnabled !== false && (
                      <button
                        type="button"
                        onClick={() => setIsInfiltratorBoosterModalOpen(true)}
                        className="mt-2 w-full rounded-xl border border-amber-500/60 bg-amber-950/80 px-3 py-2 text-xs font-display font-black uppercase tracking-wider text-amber-300 hover:bg-amber-900/90 transition-colors"
                      >
                        🕵️ Buy Infiltrator Odds Booster Ticket
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ACTION & VOTING TRAY (BOTTOM SECTION - FIXED & ACCESSIBLE) */}
              <div className="shrink-0 pt-2 safe-bottom">
                <ActionTray
                  gamePhase={gamePhase}
                  activePlayer={activePlayer}
                  players={players}
                  settings={settings}
                  timeLeft={timeLeft}
                  voteRound={voteRound}
                  suddenDeath={suddenDeath}
                  clueInput={clueInput}
                  onChangeClueInput={(value) => setClueInput(sanitizeClue(value, false))}
                  onSubmitClue={handleSubmitClue}
                  onStartEditClue={handleStartEditClue}
                  isEditingClue={isEditingClue}
                  onCancelEditClue={handleCancelEditClue}
                  silencedPlayerIds={silencedPlayerIds}
                  discussionMessages={discussionMessages}
                  onSendDiscussionMessage={handleSendDiscussionMessage}
                  selectedVoteTargetId={selectedVoteTargetId}
                  onSelectVoteTarget={(id) => setSelectedVoteTargetId(id)}
                  onSubmitVote={handleSubmitVote}
                  hasCurrentPlayerVoted={Boolean(activePlayer.votedForId)}
                  selectedGuessWord={selectedGuessWord}
                  onSubmitFoxGuess={handleSubmitFoxGuess}
                  isCurrentPlayerTheCaughtFox={isCurrentPlayerTheCaughtFox}
                  caughtFoxPlayer={actualFoxPlayer}
                  roundResolution={roundResolution}
                  onNextRound={handleNextRound}
                  onOpenResolutionModal={() => setIsResolutionModalOpen(true)}
                  roundNumber={roundNumber}
                  isHost={isHost}
                  gameMode={gameMode}
                  forgedTargetPlayerId={forgedTargetPlayerId}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* OPTIONS MODAL */}
      <OptionsModal
        isOpen={isOptionsOpen}
        onClose={() => setIsOptionsOpen(false)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((enabled) => !enabled)}
        volume={volume}
        onChangeVolume={setVolume}
        reducedMotion={reducedMotion}
        onToggleReducedMotion={() => setReducedMotion((enabled) => !enabled)}
        compactDisplay={compactDisplay}
        onToggleCompactDisplay={() => setCompactDisplay((enabled) => !enabled)}
      />

      {/* RULES MODAL */}
      <RulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
      />

      {/* INFILTRATOR GUESS MODAL (Exclusively shown to the caught Infiltrator for their escape guess) */}
      <InfiltratorGuessModal
        isOpen={isFoxGuessModalOpen && isCurrentPlayerTheCaughtFox}
        category={category}
        foxPlayerName={actualFoxPlayer?.name || 'The Infiltrator'}
        isHumanFox={isCurrentPlayerTheCaughtFox}
        players={players}
        onSelectGuess={(word) => setSelectedGuessWord(word)}
        selectedGuessWord={selectedGuessWord}
        onSubmitGuess={handleSubmitFoxGuess}
      />

      {/* ROUND RESOLUTION MODAL (With celebratory particles & host-only controls) */}
      <RoundResolutionModal
        isOpen={isResolutionModalOpen}
        roundResolution={roundResolution}
        players={players}
        onNextRound={handleNextRound}
        onClose={() => setIsResolutionModalOpen(false)}
        roundNumber={roundNumber}
        targetScore={settings.targetScore}
        isHost={isHost}
        gameMode={gameMode}
        activePlayerId={activePlayer.id}
      />

      {/* THE MYSTIC SHOP MODAL (Triggers every 3 rounds with all-player confirm-to-leave) */}
      <ShopModal
        isOpen={gamePhase === 'shop'}
        player={activePlayer}
        players={players}
        onBuyPotion={handleBuyPotion}
        onToggleConfirmLeave={handleToggleConfirmLeave}
        onNextRound={handleExitShop}
        roundNumber={roundNumber}
        isHost={isHost}
        gameMode={gameMode}
        myPlayerId={myPlayerId}
      />

      {/* INFILTRATOR ORACLE SERUM PROMPT MODAL */}
      <OracleSerumModal
        isOpen={isOracleModalOpen}
        onClose={() => setIsOracleModalOpen(false)}
        onSelectChoice={handleSelectOracleChoice}
      />

      {/* INFILTRATOR INK OF DECEIT / CLUE FORGERY MODAL */}
      <ClueForgeryModal
        isOpen={isClueForgeryModalOpen}
        players={players}
        activePlayerId={activePlayer.id}
        onConfirmForgery={handleConfirmClueForgery}
        onClose={() => setIsClueForgeryModalOpen(false)}
      />

      {/* PASS & PLAY PRIVACY SCREEN */}
      <PassAndPlayModal
        isOpen={isPassAndPlayModalOpen && gameMode === 'pass_and_play'}
        player={players[passAndPlayIndex] || null}
        onConfirmReady={() => setIsPassAndPlayModalOpen(false)}
        gamePhase={gamePhase}
      />

      {/* SILENCE POTION MODAL */}
      <SilencePotionModal
        isOpen={isSilenceModalOpen}
        players={players}
        activePlayerId={activePlayer.id}
        onConfirmSilence={handleConfirmSilence}
        onClose={() => setIsSilenceModalOpen(false)}
      />

      {/* INFILTRATOR ODDS BOOSTER MODAL (Spend gold to boost role chances) */}
      <InfiltratorBoosterModal
        isOpen={isInfiltratorBoosterModalOpen}
        player={activePlayer}
        allPlayers={players}
        onUpdateBoost={handleUpdateInfiltratorBoost}
        onClose={() => setIsInfiltratorBoosterModalOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <InfiltratorApp />
    </ErrorBoundary>
  );
}
