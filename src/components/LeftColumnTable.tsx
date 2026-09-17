import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Clock, Bot, User, HelpCircle, Shield, Sparkles, ArrowUpDown, Layers, ArrowUp, ArrowDown, Package, Wand2 } from 'lucide-react';
import { Player, GamePhase, PlayerInventory } from '../types';
import { POTION_CATALOG } from '../data/potions';
import { sound } from '../utils/sound';

export type InventorySortOption = 'default' | 'type' | 'quantity_desc' | 'quantity_asc';

export const POTION_TYPES: Record<string, { label: string; tagColor: string; description: string }> = {
  oracle_serum: {
    label: 'Intel',
    tagColor: 'text-purple-300 bg-purple-950/90 border-purple-600/70',
    description: 'Psychic vision & coordinate insight',
  },
  clue_lens: {
    label: 'Recon',
    tagColor: 'text-cyan-300 bg-cyan-950/90 border-cyan-600/70',
    description: 'Stealth scouting & clue peek',
  },
  grid_scrambler: {
    label: 'Disruption',
    tagColor: 'text-amber-300 bg-amber-950/90 border-amber-600/70',
    description: 'Matrix randomization',
  },
  vote_shield: {
    label: 'Defense',
    tagColor: 'text-sky-300 bg-sky-950/90 border-sky-600/70',
    description: 'Vote penalty nullification',
  },
  ink_of_deceit: {
    label: 'Deception',
    tagColor: 'text-rose-300 bg-rose-950/90 border-rose-600/70',
    description: 'Clue forgery & misdirection',
  },
  silence_curse: {
    label: 'Sabotage',
    tagColor: 'text-rose-300 bg-rose-950/90 border-rose-600/70',
    description: 'Silences a player from speaking in discussion',
  },
};

interface LeftColumnTableProps {
  players: Player[];
  activePlayerId: string;
  activePlayerRole?: 'innocent' | 'fox';
  impostorPeekPlayerId?: string | null;
  clueLensPeekPlayerId?: string | null;
  activeVoteShields?: string[];
  silencedPlayerIds?: string[];
  gamePhase: GamePhase;
  anonymousVoting: boolean;
  hasUsedPotionThisTurn?: boolean;
  onUsePotion?: (potionId: string) => void;
  onOpenOddsBooster?: () => void;
  recentlyUsedPotionPlayerId?: string | null;
  recentlyUsedPotionId?: string | null;
  activePotionToast?: { message: string; icon: string; style: 'sky' | 'cyan' | 'purple' | 'amber'; isInfiltratorOnly?: boolean; isChameleonOnly?: boolean } | null;
  inventory?: PlayerInventory;
  gold?: number;
  pendingClueForged?: { targetPlayerId: string; newClue: string } | null;
  forgedTargetPlayerId?: string | null;
  itemsEnabled?: boolean;
}

export const LeftColumnTable: React.FC<LeftColumnTableProps> = ({
  players,
  activePlayerId,
  activePlayerRole = 'innocent',
  impostorPeekPlayerId = null,
  clueLensPeekPlayerId = null,
  activeVoteShields = [],
  silencedPlayerIds = [],
  gamePhase,
  anonymousVoting,
  hasUsedPotionThisTurn = false,
  onUsePotion,
  onOpenOddsBooster,
  recentlyUsedPotionPlayerId = null,
  recentlyUsedPotionId = null,
  activePotionToast = null,
  inventory = {},
  gold = 0,
  pendingClueForged = null,
  forgedTargetPlayerId = null,
  itemsEnabled = true,
}) => {
  // Navigation tabs: 'players' (main table) vs 'inventory' (dedicated potion inventory tab)
  const [activeTab, setActiveTab] = useState<'players' | 'inventory'>('players');

  // Sorting state for collected potions: 'default' | 'type' | 'quantity_desc' | 'quantity_asc'
  const [inventorySort, setInventorySort] = useState<InventorySortOption>('default');
  const [animatingPotionId, setAnimatingPotionId] = useState<string | null>(null);

  const handleUsePotionWithAnimation = (potionId: string) => {
    sound.potionUse(potionId);
    setAnimatingPotionId(potionId);
    setTimeout(() => setAnimatingPotionId(null), 1200);
    onUsePotion?.(potionId);
  };

  // During clue submission:
  // - Innocents see ONLY their own clue
  // - Imposter sees their own clue + exactly 1 random other player's clue (+ 2nd clue if clue lens used)
  // When voting or resolution, clues are fully public to all players!
  const isVotingOrResolution = gamePhase === 'voting' || gamePhase === 'fox_guess' || gamePhase === 'round_resolution';
  const isImpostor = activePlayerRole === 'fox';

  // Clues submitted & votes cast counts
  const cluesSubmittedCount = players.filter((p) => p.hasSubmittedClue).length;
  const votesCastCount = players.filter((p) => Boolean(p.votedForId)).length;

  // Keep all purchased potions visible; role compatibility only gates usage.
  const compatiblePotions = POTION_CATALOG.filter((item) => (inventory[item.id] || 0) > 0).map((item) => ({
    potion: item,
    quantity: inventory[item.id] || 0,
  }));

  const totalPotionsCount = compatiblePotions.reduce((sum, item) => sum + item.quantity, 0);

  // Sorted potions based on user choice: by Type, Quantity (desc/asc), or Default catalog
  const sortedPotions = [...compatiblePotions].sort((a, b) => {
    if (inventorySort === 'type') {
      const typeA = POTION_TYPES[a.potion.id]?.label || a.potion.name;
      const typeB = POTION_TYPES[b.potion.id]?.label || b.potion.name;
      const cmp = typeA.localeCompare(typeB);
      if (cmp !== 0) return cmp;
      return a.potion.name.localeCompare(b.potion.name);
    }
    if (inventorySort === 'quantity_desc') {
      if (b.quantity !== a.quantity) return b.quantity - a.quantity;
      return a.potion.name.localeCompare(b.potion.name);
    }
    if (inventorySort === 'quantity_asc') {
      if (a.quantity !== b.quantity) return a.quantity - b.quantity;
      return a.potion.name.localeCompare(b.potion.name);
    }
    return 0; // 'default'
  });

  // Reusable Sorting Toolbar for the inventory tab & panel
  const renderSortToolbar = (isCompact: boolean = false) => (
    <div
      className={`flex items-center justify-between gap-1.5 p-1.5 rounded-lg bg-slate-900/90 border border-slate-800 ${
        isCompact ? 'mb-2 text-[11px]' : 'mb-3 text-xs'
      }`}
    >
      <div className="flex items-center gap-1 text-slate-400 font-mono">
        <ArrowUpDown className="w-3.5 h-3.5 text-purple-400 shrink-0" />
        <span className="font-semibold text-slate-300">Sort:</span>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => setInventorySort('default')}
          className={`px-2 py-1 rounded text-[11px] font-bold transition-all cursor-pointer ${
            inventorySort === 'default'
              ? 'bg-purple-900 text-purple-100 border border-purple-500 shadow-xs ring-1 ring-purple-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Restore standard catalog order"
        >
          Default
        </button>

        <button
          onClick={() => setInventorySort('type')}
          className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
            inventorySort === 'type'
              ? 'bg-purple-900 text-purple-100 border border-purple-500 shadow-xs ring-1 ring-purple-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Organize potions by Type (Intel, Recon, Disruption, Defense, Deception)"
        >
          <span>By Type</span>
          {inventorySort === 'type' && <span className="text-[10px] text-purple-300">✓</span>}
        </button>

        <button
          onClick={() => {
            if (inventorySort === 'quantity_desc') {
              setInventorySort('quantity_asc');
            } else {
              setInventorySort('quantity_desc');
            }
          }}
          className={`px-2 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer ${
            inventorySort === 'quantity_desc' || inventorySort === 'quantity_asc'
              ? 'bg-purple-900 text-purple-100 border border-purple-500 shadow-xs ring-1 ring-purple-400/40'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
          }`}
          title="Sort by quantity in inventory (Click to toggle highest/lowest count)"
        >
          <span>By Qty</span>
          {inventorySort === 'quantity_desc' ? (
            <span className="text-[10px] font-mono text-purple-300 flex items-center">↓ (high)</span>
          ) : inventorySort === 'quantity_asc' ? (
            <span className="text-[10px] font-mono text-purple-300 flex items-center">↑ (low)</span>
          ) : null}
        </button>
      </div>
    </div>
  );

  return (
    <div className="retro-card rounded-xl p-4 sm:p-5 flex flex-col h-full bg-[#131B2E] border-2 border-slate-700 text-slate-100 shadow-xl overflow-hidden">
      {/* Table Header & Title */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b-2 border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <h2 className="text-base sm:text-xl font-display font-bold uppercase tracking-tight text-white">
            Players & Clues
          </h2>
        </div>

        <div className="flex items-center gap-2">
          {gamePhase === 'clue_submission' && isImpostor && (
            <span className="text-[11px] font-bold bg-purple-950 text-purple-300 border border-purple-600 px-2 py-0.5 rounded-md flex items-center gap-1">
              🕵️ Infiltrator Intel
            </span>
          )}

          {gamePhase === 'clue_submission' ? (
            <span className="text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600 px-2.5 py-0.5 rounded-md flex items-center gap-1">
              Clues: {cluesSubmittedCount}/{players.length}
            </span>
          ) : gamePhase === 'voting' ? (
            <span className="text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-600 px-2.5 py-0.5 rounded-md flex items-center gap-1">
              Votes: {votesCastCount}/{players.length}
            </span>
          ) : (
            <span className="text-xs font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700 px-2.5 py-0.5 rounded-md">
              {players.length} Players
            </span>
          )}
        </div>
      </div>

      {/* Active Potion Toast Banner */}
      {activePotionToast && (!activePotionToast.isInfiltratorOnly && !activePotionToast.isChameleonOnly || isImpostor) && (
        <div
          className={`mb-3 p-2.5 rounded-lg border flex items-center justify-between text-xs font-mono font-bold shadow-md transition-all ${
            activePotionToast.style === 'sky'
              ? 'bg-sky-950/90 border-sky-400 text-sky-200 shadow-sky-900/30'
              : activePotionToast.style === 'cyan'
              ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-cyan-900/30'
              : activePotionToast.style === 'purple'
              ? 'bg-purple-950/90 border-purple-400 text-purple-200 shadow-purple-900/30'
              : 'bg-amber-950/90 border-amber-400 text-amber-200 shadow-amber-900/30'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-base select-none">{activePotionToast.icon}</span>
            <span>{activePotionToast.message}</span>
          </div>
          {activePotionToast.isInfiltratorOnly || activePotionToast.isChameleonOnly ? (
            <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider bg-purple-900 text-purple-300 border border-purple-400 px-1.5 py-0.5 rounded">
              Sneaky
            </span>
          ) : (
            <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-600 px-1.5 py-0.5 rounded">
              Innocent
            </span>
          )}
        </div>
      )}

      {/* Navigation Tab Switcher: Players Table vs Inventory Tab (only when items are enabled) */}
      {itemsEnabled && (
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 rounded-lg border border-slate-700/80 mb-3 shrink-0">
          <button
            onClick={() => setActiveTab('players')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'players'
                ? 'bg-slate-700 text-white shadow-xs border border-slate-600'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span className="text-sm">📋</span>
            <span>Players & Clues</span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
              {players.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'inventory'
                ? 'bg-purple-900/90 text-purple-100 shadow-xs border border-purple-500 ring-1 ring-purple-400/40'
                : 'text-slate-400 hover:text-purple-300 hover:bg-slate-800/60'
            }`}
          >
            <span className="text-sm">🧪</span>
            <span>Inventory Tab</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                totalPotionsCount > 0
                  ? 'bg-purple-950 text-purple-300 border border-purple-700 font-bold'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              {totalPotionsCount}
            </span>
          </button>
        </div>
      )}

      {itemsEnabled && activeTab === 'inventory' ? (
        /* DEDICATED INVENTORY TAB VIEW */
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          {/* Inventory Tab Header */}
          <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-purple-500/30 mb-2.5 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xl">🎒</span>
              <div>
                <h3 className="text-xs sm:text-sm font-display font-black uppercase tracking-wider text-purple-200">
                  Potion Inventory ({totalPotionsCount} items)
                </h3>
                <span className="text-[10px] text-slate-400">
                  Select and activate during your turn (1 use per turn)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono">
              {onOpenOddsBooster && (
                <button
                  onClick={onOpenOddsBooster}
                  className="text-[10px] font-bold text-amber-300 hover:text-amber-100 bg-amber-950/80 border border-amber-500/60 px-2 py-0.5 rounded cursor-pointer transition-colors flex items-center gap-1"
                  title="Boost your chances of drawing The Infiltrator role next round using gold"
                >
                  <span>🕵️ Odds</span>
                </button>
              )}
              <span className="text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-600/60">
                🪙 {gold}g
              </span>
              {hasUsedPotionThisTurn ? (
                <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-600 px-1.5 py-0.5 rounded">
                  Used This Turn ✓
                </span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-600 px-1.5 py-0.5 rounded">
                  Ready
                </span>
              )}
            </div>
          </div>

          {/* Sorting controls for inventory: by Type, by Quantity, or Default */}
          {renderSortToolbar(false)}

          {/* Potions List */}
          {sortedPotions.length > 0 ? (
            <div className="space-y-2 flex-1 overflow-y-auto pr-0.5">
              {sortedPotions.map(({ potion, quantity }) => {
                const isRoleCompatible = potion.roleTarget === 'all' ||
                  (potion.roleTarget === 'fox' && isImpostor) ||
                  (potion.roleTarget === 'innocent' && !isImpostor);
                const potionType = POTION_TYPES[potion.id] || {
                  label: 'Item',
                  tagColor: 'text-purple-300 bg-purple-950/80 border-purple-600/60',
                  description: '',
                };

                return (
                  <div
                    key={potion.id}
                    className="p-3 rounded-xl bg-slate-900/90 border border-purple-500/40 text-xs shadow-sm hover:border-purple-400/70 transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span className="text-2xl select-none shrink-0 p-1 bg-slate-800 rounded-lg border border-slate-700">
                          {potion.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white text-sm">
                              {potion.name}
                            </span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border font-mono ${potionType.tagColor}`}>
                              {potionType.label}
                            </span>
                            <span className="font-mono text-purple-200 font-black text-xs bg-purple-950 px-2 py-0.5 rounded border border-purple-600">
                              x{quantity}
                            </span>
                            {potion.roleTarget === 'fox' ? (
                              <span className="text-[9px] font-bold bg-purple-950 text-purple-300 border border-purple-700 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Infiltrator Sneaky
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold bg-slate-800 text-slate-300 border border-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Innocent Potion
                              </span>
                            )}
                            {!isRoleCompatible && (
                              <span className="text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Unavailable ({potion.roleTarget === 'fox' ? 'Infiltrator' : 'Innocent'} Only)
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                            {potion.description}
                          </p>
                        </div>
                      </div>

                      <motion.button
                        disabled={hasUsedPotionThisTurn || !isRoleCompatible}
                        whileTap={!hasUsedPotionThisTurn && isRoleCompatible ? { scale: 0.92 } : undefined}
                        onClick={() => handleUsePotionWithAnimation(potion.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-display font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                          animatingPotionId === potion.id
                            ? 'bg-purple-400 text-slate-950 ring-4 ring-purple-300 animate-pulse'
                            : hasUsedPotionThisTurn || !isRoleCompatible
                            ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                            : 'retro-button bg-purple-600 hover:bg-purple-500 active:scale-95 text-white border-purple-400 shadow-sm'
                        }`}
                        title={!isRoleCompatible ? 'Unavailable for your current role' : hasUsedPotionThisTurn ? 'Already used 1 potion this turn' : `Use ${potion.name}`}
                      >
                        {animatingPotionId === potion.id ? 'CASTING… ✨' : !isRoleCompatible ? 'UNAVAILABLE' : 'USE'}
                      </motion.button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2 flex-1">
              <span className="text-3xl select-none">🧪</span>
              <span className="font-bold text-slate-300 text-sm">Your potion bag is empty!</span>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Earn gold by surviving rounds, catching The Infiltrator, or guessing clues. The Potion Shop opens every 3 rounds!
              </p>
              <span className="mt-1 text-[11px] font-mono text-amber-300 font-bold bg-amber-950/70 border border-amber-700/60 px-2 py-1 rounded">
                Current Gold: 🪙 {gold}g
              </span>
            </div>
          )}

          <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <button
              onClick={() => setActiveTab('players')}
              className="text-[11px] text-purple-300 hover:text-purple-200 underline font-semibold cursor-pointer"
            >
              ← Back to Players & Clues
            </button>
            <span className="font-mono text-[10px] text-slate-400">
              Sorted by: {inventorySort === 'type' ? 'Type' : inventorySort.startsWith('quantity') ? 'Quantity' : 'Default'}
            </span>
          </div>
        </div>
      ) : (
        /* PLAYERS & CLUES VIEW */
        <>
          {/* Expanded Table container with responsive horizontal scroll and generous column containment */}
          <div className="w-full flex-1 overflow-x-auto overflow-y-auto min-h-[220px]">
        <table className="w-full min-w-[560px] sm:min-w-full table-fixed text-left border-collapse text-xs sm:text-sm">
          <colgroup>
            <col className="w-[23%] sm:w-[21%]" />
            <col className="w-[11%] sm:w-[10%]" />
            <col className="w-[36%] sm:w-[37%]" />
            <col className="w-[8%] sm:w-[8%]" />
            <col className="w-[22%] sm:w-[24%]" />
          </colgroup>
          <thead>
            <tr className="border-b-2 border-slate-700 bg-slate-800/90 text-slate-300 font-display font-bold uppercase text-[11px] sm:text-xs tracking-wider">
              <th className="py-3 px-2 sm:px-3 text-left rounded-tl-lg">Player</th>
              <th className="py-3 px-1 sm:px-2 text-center">Score</th>
              <th className="py-3 px-2 sm:px-3 text-left">Word / Clue</th>
              <th className="py-3 px-1 sm:px-2 text-center">Ready</th>
              <th className="py-3 px-2 sm:px-3 text-right rounded-tr-lg">Decision / Vote</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 font-medium">
            {players.map((p) => {
              const isCurrent = p.id === activePlayerId;
              const isForgedByActiveImpostor =
                isImpostor &&
                (p.id === forgedTargetPlayerId ||
                  p.id === pendingClueForged?.targetPlayerId ||
                  p.forgedBy === activePlayerId);

              // During voting/resolution, any submitted non-empty clue is considered present
              const hasClue = isVotingOrResolution
                ? Boolean((p.clue && p.clue.trim() !== '') || (isForgedByActiveImpostor && pendingClueForged?.newClue))
                : Boolean((p.clue && p.hasSubmittedClue) || isForgedByActiveImpostor);
              const isImpostorPeekTarget = isImpostor && p.id === impostorPeekPlayerId;
              const isClueLensTarget = isImpostor && p.id === clueLensPeekPlayerId;

              // Visibility rules:
              // 1. Voting/Resolution: all clues are 100% public to all players!
              // 2. Clue submission:
              //    - Current active player always sees their own clue
              //    - Infiltrator ALWAYS sees the clue they forged for any player!
              //    - Imposter (Infiltrator) sees exactly ONE other player's clue at random (+ 2nd clue if Clue Lens active)
              //    - Innocents see NO other players' clues
              const isClueVisible =
                isVotingOrResolution ||
                isCurrent ||
                isForgedByActiveImpostor ||
                (gamePhase === 'clue_submission' && (isImpostorPeekTarget || isClueLensTarget));

              const displayedClue =
                isForgedByActiveImpostor && pendingClueForged?.targetPlayerId === p.id && pendingClueForged.newClue
                  ? pendingClueForged.newClue
                  : gamePhase === 'clue_submission' && p.originalClue
                  ? p.originalClue
                  : p.clue;

              // Voting indicator logic
              const votedTarget = players.find(target => target.id === p.votedForId);
              const isShielded = activeVoteShields.includes(p.id);
              const isSilenced = silencedPlayerIds?.includes(p.id);

              // Strict Sneaky rule:
              // Infiltrator potion visuals ONLY appear for the Infiltrator themselves!
              // Innocent potion visuals appear for EVERYONE including the Infiltrator!
              const isTargetOfPotionEffect = recentlyUsedPotionPlayerId === p.id;
              const isInfiltratorPotion =
                recentlyUsedPotionId === 'oracle_serum' ||
                recentlyUsedPotionId === 'ink_of_deceit' ||
                recentlyUsedPotionId === 'silence_curse' ||
                p.role === 'fox';

              const shouldShowPotionEffect =
                isTargetOfPotionEffect &&
                (!isInfiltratorPotion || (isImpostor && p.id === activePlayerId));

              // Select tailored animation class based on potion type
              const potionAnimationClass = shouldShowPotionEffect
                ? recentlyUsedPotionId === 'vote_shield'
                  ? 'animate-shield-burst ring-2 ring-sky-400 bg-sky-950/40'
                  : recentlyUsedPotionId === 'clue_lens'
                  ? 'animate-lens-pulse ring-2 ring-cyan-400 bg-cyan-950/40'
                  : recentlyUsedPotionId === 'grid_scrambler'
                  ? 'animate-potion-bubble ring-2 ring-cyan-400 bg-cyan-950/40'
                  : 'animate-potion-bubble ring-2 ring-purple-400 bg-purple-950/30'
                : '';

              return (
                <tr
                  key={p.id}
                  className={`transition-colors ${
                    isCurrent ? 'bg-slate-800/70 border-l-2 border-l-emerald-400' : 'hover:bg-slate-800/40'
                  } ${potionAnimationClass}`}
                >
                  {/* Player info */}
                  <td className="py-3 px-2 sm:px-3 align-middle overflow-hidden">
                    <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                      <span className="text-xl select-none shrink-0" role="img" aria-label="avatar">
                        {p.avatar || '👤'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap content-start">
                          <span className="font-bold text-white text-xs sm:text-sm break-words [overflow-wrap:anywhere] w-full max-w-[130px] leading-tight whitespace-normal">
                            {p.name}
                          </span>
                          {isCurrent && (
                            <span className="text-[10px] bg-emerald-500 text-slate-950 font-black px-1.5 py-0.2 rounded uppercase tracking-tighter shrink-0">
                              YOU
                            </span>
                          )}
                          {isShielded && (
                            <span className="text-[10px] bg-sky-950 text-sky-300 border border-sky-600 px-1 rounded font-mono font-bold flex items-center gap-0.5 shrink-0" title="Vote Shield Active (-1 vote against you)">
                              <Shield className="w-2.5 h-2.5 text-sky-400" /> Shielded
                            </span>
                          )}
                          {isSilenced && (
                            <span
                              className="text-[10px] bg-rose-950/90 text-rose-300 border border-rose-600/80 px-1.5 py-0.2 rounded font-mono font-bold flex items-center gap-0.5 shrink-0 animate-pulse"
                              title="Silenced by Infiltrator's Elixir of Silence! Clue is still active on board, but cannot speak during discussion."
                            >
                              🤐 MUTED
                            </span>
                          )}
                          {shouldShowPotionEffect && recentlyUsedPotionId === 'vote_shield' && (
                            <span className="text-[10px] bg-sky-900/90 text-sky-200 border border-sky-400 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1 animate-pulse shrink-0">
                              <Shield className="w-2.5 h-2.5 text-sky-300" /> Shield Up!
                            </span>
                          )}
                          {shouldShowPotionEffect && recentlyUsedPotionId === 'grid_scrambler' && (
                            <span className="text-[10px] bg-cyan-900/90 text-cyan-200 border border-cyan-400 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1 animate-pulse shrink-0">
                              🌀 Scrambler!
                            </span>
                          )}
                          {shouldShowPotionEffect && recentlyUsedPotionId === 'clue_lens' && (
                            <span className="text-[10px] bg-cyan-900/90 text-cyan-200 border border-cyan-400 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1 animate-pulse shrink-0">
                              👁️ Lens Peek!
                            </span>
                          )}
                          {shouldShowPotionEffect && isInfiltratorPotion && isImpostor && p.id === activePlayerId && (
                            <span className="text-[10px] bg-purple-900/90 text-purple-200 border border-purple-400 px-1.5 py-0.5 rounded font-mono font-bold flex items-center gap-1 animate-pulse shrink-0">
                              🧪 Covert Action
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          {p.isHuman ? (
                            <span className="flex items-center gap-0.5 text-cyan-400 truncate">
                              <User className="w-2.5 h-2.5 shrink-0" /> Human
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5 text-amber-400 truncate">
                              <Bot className="w-2.5 h-2.5 shrink-0" /> Bot
                            </span>
                          )}
                          {p.isHost && (
                            <span className="text-purple-400 font-semibold text-[10px] shrink-0">
                              • Host
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Score */}
                  <td className="py-3 px-1 sm:px-2 text-center align-middle">
                    <span className="inline-flex items-center justify-center font-mono font-bold text-slate-200 bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-xs">
                      {p.score} <span className="text-[10px] text-slate-400 ml-0.5">pts</span>
                    </span>
                  </td>

                  {/* Word / Clue - Expanded with wrapping and strictly contained */}
                  <td className="py-3 px-2 sm:px-3 align-middle min-w-0 overflow-hidden">
                    {hasClue ? (
                      isClueVisible ? (
                        <div
                          className={`w-full ${
                            isForgedByActiveImpostor
                              ? 'bg-purple-950/80 border-purple-400 text-purple-100 shadow-md ring-1 ring-purple-500/50'
                              : isImpostorPeekTarget && gamePhase === 'clue_submission'
                              ? 'bg-purple-950/70 border-purple-500/80 text-purple-200 shadow-sm'
                              : isClueLensTarget && gamePhase === 'clue_submission'
                              ? 'bg-cyan-950/70 border-cyan-400/80 text-cyan-200 shadow-sm'
                              : 'bg-amber-950/50 border-amber-500/50 text-amber-200'
                          } border font-bold px-2.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-mono tracking-tight shadow-xs break-words [overflow-wrap:anywhere] [word-break:break-word] whitespace-normal leading-relaxed overflow-hidden`}
                        >
                          "{displayedClue}"
                          {isForgedByActiveImpostor && (
                            <span className="block mt-1 text-[10px] font-sans font-extrabold uppercase tracking-wider text-purple-300 flex items-center gap-1">
                              ✒️ Forged by You
                            </span>
                          )}
                          {isImpostorPeekTarget && gamePhase === 'clue_submission' && !isForgedByActiveImpostor && (
                            <span className="block mt-1 text-[10px] font-sans font-extrabold uppercase tracking-wider text-purple-300">
                              🕵️ Infiltrator Intel (1 Clue)
                            </span>
                          )}
                          {isClueLensTarget && gamePhase === 'clue_submission' && !isForgedByActiveImpostor && (
                            <span className="block mt-1 text-[10px] font-sans font-extrabold uppercase tracking-wider text-cyan-300">
                              👁️ Clue Lens Intel (2nd Clue)
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1 text-slate-400 font-mono text-xs italic bg-slate-900 px-2.5 py-1 rounded-md border border-slate-700">
                          <span>🔒 Clue Locked</span>
                        </div>
                      )
                    ) : isVotingOrResolution ? (
                      <span className="text-slate-500 font-mono text-xs italic">No clue</span>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs italic">
                        <Clock className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
                        <span>Thinking...</span>
                      </div>
                    )}
                  </td>

                  {/* Ready (✓) - Strictly centered */}
                  <td className="py-3 px-1 sm:px-2 text-center align-middle whitespace-nowrap">
                    <div className="flex items-center justify-center">
                      {p.hasSubmittedClue || p.isReady || isForgedByActiveImpostor ? (
                        <motion.span
                          initial={{ scale: 0.6, rotate: -15 }}
                          animate={{ scale: 1, rotate: 0 }}
                          className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/60 font-bold text-xs shadow-xs"
                          title="Clue ready"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </motion.span>
                      ) : (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-900 text-slate-500 border border-slate-700 text-xs" title="Waiting for clue">
                          …
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Vote column with generous space and no cutoff */}
                  <td className="py-3 px-2 sm:px-3 text-right align-middle">
                    <div className="flex items-center justify-end gap-1.5 flex-wrap sm:flex-nowrap">
                      {gamePhase === 'voting' ? (
                        // Voting in progress
                        p.votedForId ? (
                          anonymousVoting ? (
                            <motion.span
                              initial={{ scale: 0.8 }}
                              animate={{ scale: 1 }}
                              className="inline-flex items-center gap-1 bg-purple-950 text-purple-300 border border-purple-700 px-2 py-0.5 rounded text-[11px] font-bold whitespace-nowrap shadow-xs"
                            >
                              <Check className="w-3 h-3 text-purple-400" /> Voted
                            </motion.span>
                          ) : (
                            <motion.span
                              initial={{ scale: 0.8 }}
                              animate={{ scale: 1 }}
                              className="inline-flex items-center gap-1 bg-rose-950/90 text-rose-200 border border-rose-700 px-2 py-0.5 rounded text-[11px] font-bold font-mono whitespace-nowrap shadow-xs"
                              title={`Voted for ${votedTarget?.name || 'Unknown'}`}
                            >
                              👉 {votedTarget?.name.split(' ')[0] || 'Unknown'}
                            </motion.span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-950/40 border border-amber-800/60 px-2 py-0.5 rounded font-medium italic whitespace-nowrap">
                            <Clock className="w-3 h-3 animate-spin text-amber-400 shrink-0" /> Deciding…
                          </span>
                        )
                      ) : isVotingOrResolution ? (
                        p.votedForId ? (
                          <span className="inline-flex items-center gap-1 bg-rose-950/90 text-rose-200 border border-rose-700 px-2 py-0.5 rounded text-[11px] font-bold font-mono whitespace-nowrap shadow-xs">
                            👉 {votedTarget?.name.split(' ')[0] || 'Pass'}
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-500 italic">—</span>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">—</span>
                      )}

                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

          {/* 🧪 POTIONS & ITEMS (1 use per turn) - Quick Panel at bottom of table */}
          {itemsEnabled && (
          <div className="mt-3 pt-3 border-t-2 border-slate-700/80 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="text-base select-none">🧪</span>
                <h3 className="text-xs sm:text-sm font-display font-black uppercase tracking-wider text-purple-200">
                  POTIONS & ITEMS
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  (1 use per turn)
                </span>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono">
                <button
                  onClick={() => setActiveTab('inventory')}
                  className="text-[10px] font-bold text-purple-300 hover:text-purple-100 bg-purple-950/80 border border-purple-600/70 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  title="Open full dedicated Inventory Tab with sorting & descriptions"
                >
                  Inventory Tab ↗
                </button>
                <span className="text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded border border-amber-600/60">
                  🪙 {gold}g
                </span>
                {hasUsedPotionThisTurn ? (
                  <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-600 px-1.5 py-0.5 rounded">
                    Used This Turn ✓
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-600 px-1.5 py-0.5 rounded">
                    Ready
                  </span>
                )}
              </div>
            </div>

            {/* Quick Sort Bar if multiple potions */}
            {compatiblePotions.length > 1 && renderSortToolbar(true)}

            {/* Potion List */}
            {sortedPotions.length > 0 ? (
              <div className="space-y-1.5">
                {sortedPotions.map(({ potion, quantity }) => {
                  const isRoleCompatible = potion.roleTarget === 'all' ||
                    (potion.roleTarget === 'fox' && isImpostor) ||
                    (potion.roleTarget === 'innocent' && !isImpostor);
                  const potionType = POTION_TYPES[potion.id] || {
                    label: 'Item',
                    tagColor: 'text-purple-300 bg-purple-950/80 border-purple-600/60',
                  };

                  return (
                    <div
                      key={potion.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-slate-900/90 border border-purple-500/40 text-xs shadow-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xl select-none shrink-0">{potion.icon}</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-white text-xs truncate">
                              {potion.name}
                            </span>
                            <span className={`text-[9px] font-bold px-1 py-0.2 rounded border font-mono ${potionType.tagColor}`}>
                              {potionType.label}
                            </span>
                            <span className="font-mono text-purple-300 font-black text-[11px] bg-purple-950 px-1.5 py-0.2 rounded border border-purple-700">
                              x{quantity}
                            </span>
                            {!isRoleCompatible && (
                              <span className="text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-600 px-1.5 py-0.5 rounded uppercase tracking-wider">
                                Unavailable ({potion.roleTarget === 'fox' ? 'Infiltrator' : 'Innocent'} Only)
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate">
                            {potion.description}
                          </span>
                        </div>
                      </div>

                      <motion.button
                        disabled={hasUsedPotionThisTurn || !isRoleCompatible}
                        whileTap={!hasUsedPotionThisTurn && isRoleCompatible ? { scale: 0.92 } : undefined}
                        onClick={() => handleUsePotionWithAnimation(potion.id)}
                        className={`ml-2 px-3 py-1.5 rounded-lg text-[11px] font-display font-black uppercase tracking-wider transition-all shrink-0 cursor-pointer ${
                          animatingPotionId === potion.id
                            ? 'bg-purple-400 text-slate-950 ring-4 ring-purple-300 animate-pulse'
                            : hasUsedPotionThisTurn || !isRoleCompatible
                            ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-50'
                            : 'retro-button bg-purple-600 hover:bg-purple-500 active:scale-95 text-white border-purple-400 shadow-xs'
                        }`}
                        title={!isRoleCompatible ? 'Unavailable for your current role' : hasUsedPotionThisTurn ? 'Already used 1 potion this turn' : `Use ${potion.name}`}
                      >
                        {animatingPotionId === potion.id ? 'CASTING… ✨' : !isRoleCompatible ? 'UNAVAILABLE' : 'USE'}
                      </motion.button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-between px-3">
                <span>No role potions in inventory.</span>
                <span className="text-[10px] font-mono text-amber-300 font-bold">
                  Shop opens every 3 rounds! 🛒
                </span>
              </div>
            )}
          </div>
          )}

          {/* Footer Info Pill */}
          <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0">
            <div className="flex items-center gap-1">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
              <span>Each player gives <strong>one clue</strong> (up to 80 chars) related to the coordinate.</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400 font-semibold">
              Clue limit: 80 chars
            </span>
          </div>
        </>
      )}
    </div>
  );
};
