import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, CheckCircle2, AlertOctagon, RotateCcw, Trophy, Sparkles, Clock, ArrowRight, Eye, EyeOff, Edit3, X, MessageSquare, VolumeX, Lock, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { Player, GamePhase, RoundResolution, GameSettings, DiscussionMessage } from '../types';
import { sound } from '../utils/sound';

interface ActionTrayProps {
  gamePhase: GamePhase;
  activePlayer: Player;
  players: Player[];
  settings: GameSettings;
  timeLeft: number;
  voteRound?: number;
  suddenDeath?: boolean;
  // Clue Entry
  clueInput: string;
  onChangeClueInput: (val: string) => void;
  onSubmitClue: () => void;
  onStartEditClue?: () => void;
  isEditingClue?: boolean;
  onCancelEditClue?: () => void;
  // Discussion & Mute
  silencedPlayerIds?: string[];
  discussionMessages?: DiscussionMessage[];
  onSendDiscussionMessage?: (message: string) => void;
  // Voting
  selectedVoteTargetId: string | null;
  onSelectVoteTarget: (id: string) => void;
  onSubmitVote: () => void;
  hasCurrentPlayerVoted: boolean;
  // Fox Guess
  selectedGuessWord: string | null;
  onSubmitFoxGuess: () => void;
  isCurrentPlayerTheCaughtFox: boolean;
  caughtFoxPlayer: Player | null;
  // Resolution
  roundResolution: RoundResolution | null;
  onNextRound: () => void;
  onOpenResolutionModal?: () => void;
  roundNumber?: number;
  isHost?: boolean;
  gameMode?: string;
  forgedTargetPlayerId?: string | null;
}

export const ActionTray: React.FC<ActionTrayProps> = ({
  gamePhase,
  activePlayer,
  players,
  settings,
  timeLeft,
  voteRound = 1,
  suddenDeath = false,
  clueInput,
  onChangeClueInput,
  onSubmitClue,
  onStartEditClue,
  isEditingClue = false,
  onCancelEditClue,
  silencedPlayerIds = [],
  discussionMessages = [],
  onSendDiscussionMessage,
  selectedVoteTargetId,
  onSubmitVote,
  onSelectVoteTarget,
  hasCurrentPlayerVoted,
  selectedGuessWord,
  onSubmitFoxGuess,
  isCurrentPlayerTheCaughtFox,
  caughtFoxPlayer,
  roundResolution,
  onNextRound,
  onOpenResolutionModal,
  roundNumber,
  isHost = true,
  gameMode = 'solo',
  forgedTargetPlayerId,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [discussionInput, setDiscussionInput] = React.useState('');
  const [isDiscussionOpen, setIsDiscussionOpen] = React.useState(false);
  const [isVotingTrayMinimized, setIsVotingTrayMinimized] = React.useState(false);
  const [isSubmittingClue, setIsSubmittingClue] = React.useState(false);

  const isCurrentPlayerSilenced = silencedPlayerIds.includes(activePlayer.id);

  // Reset states on gamePhase / player submission changes
  React.useEffect(() => {
    setIsSubmittingClue(false);
    setIsVotingTrayMinimized(false);
  }, [gamePhase, activePlayer.hasSubmittedClue]);

  const handleSendDiscussion = (presetText?: string) => {
    const text = (presetText || discussionInput).trim();
    if (!text || !onSendDiscussionMessage) return;
    if (isCurrentPlayerSilenced) return;
    onSendDiscussionMessage(text);
    setDiscussionInput('');
  };

  React.useEffect(() => {
    if (gamePhase === 'clue_submission' && !activePlayer.hasSubmittedClue) {
      inputRef.current?.focus();
    }
  }, [gamePhase, activePlayer.hasSubmittedClue]);

  const handleFormSubmitClue = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!clueInput.trim() || isSubmittingClue) return;
    setIsSubmittingClue(true);
    onSubmitClue();
    setTimeout(() => {
      setIsSubmittingClue(false);
    }, 600);
  };

  return (
    <section className="retro-card rounded-xl p-3 sm:p-4 bg-[#131B2E] border-2 border-slate-700 text-slate-100 shadow-xl">
      {/* Turn Timer Bar (if enabled in settings) */}
      {(settings.turnTimer || (gamePhase === 'voting' && suddenDeath)) && (gamePhase === 'clue_submission' || gamePhase === 'voting') && (
        <div className="mb-3">
          <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-300 mb-1">
            <span className="flex items-center gap-1">
              <Clock className={`w-3.5 h-3.5 ${timeLeft <= 10 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`} />
              {suddenDeath ? `Sudden-death revote (${voteRound}/2): ${timeLeft}s` : `Timer: ${timeLeft}s remaining`}
            </span>
            <span className="text-[11px] text-slate-400">{suddenDeath ? '20s limit' : `${settings.turnTimerSeconds || 60}s turn limit`}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-1000 ${
                timeLeft <= 10 ? 'bg-rose-500' : 'bg-amber-400'
              }`}
              style={{ width: `${Math.max(0, (timeLeft / (suddenDeath ? 20 : settings.turnTimerSeconds || 60)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Animated Game Phase Container */}
      <AnimatePresence mode="wait">
        <motion.div
          key={gamePhase}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* PHASE 1: CLUE ENTRY */}
          {gamePhase === 'clue_submission' && (() => {
            const cluesSubmittedCount = players.filter((p) => p.hasSubmittedClue).length;
            const totalPlayers = players.length;
            const waitingCluePlayers = players.filter((p) => !p.hasSubmittedClue);
            const allCluesSubmitted = cluesSubmittedCount === totalPlayers;

            return (
              <div>
                {!activePlayer.hasSubmittedClue || isEditingClue ? (
                  <form
                    onSubmit={handleFormSubmitClue}
                    className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3"
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-display font-extrabold uppercase text-white flex items-center gap-1.5">
                            {isEditingClue ? (
                              <>
                                <Edit3 className="w-4 h-4 text-amber-400" />
                                <span>Editing Your Clue</span>
                              </>
                            ) : (
                              <span>Your Turn: Enter Your Clue</span>
                            )}
                          </span>
                          <span className="text-xs text-slate-400">
                            {isEditingClue
                              ? '(You can revise your hint before the last person submits)'
                              : '(Give a subtle hint without revealing secret to Infiltrator)'}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700 px-2 py-0.5 rounded">
                          Clues: {cluesSubmittedCount} / {totalPlayers} In
                        </span>
                      </div>

                      <div className="relative flex items-center">
                        <input
                          ref={inputRef}
                          type="text"
                          value={clueInput}
                          onChange={(e) => onChangeClueInput(e.target.value)}
                          placeholder="e.g. Cleats, John Lennon, Serengeti National Park, Bohemian Rhapsody..."
                          maxLength={30}
                          className="w-full px-3.5 py-2.5 bg-slate-900 border-2 border-slate-700 rounded-lg text-sm sm:text-base font-medium text-white placeholder:text-slate-500 focus:outline-hidden focus:ring-2 focus:ring-amber-400 shadow-xs pr-16"
                        />
                        <span className="absolute right-3 text-[11px] font-mono font-bold text-slate-400">
                          {clueInput.length}/30
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto">
                      {isEditingClue && onCancelEditClue && (
                        <button
                          type="button"
                          onClick={onCancelEditClue}
                          className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-display font-black uppercase tracking-wider text-xs flex items-center gap-1 cursor-pointer transition-colors border border-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Cancel</span>
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={!clueInput.trim() || isSubmittingClue}
                        className="retro-button px-5 py-2.5 bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:pointer-events-none rounded-lg font-display font-black text-slate-950 uppercase tracking-wider text-xs sm:text-sm flex items-center gap-2 shadow-md cursor-pointer"
                      >
                        {isSubmittingClue ? (
                          <RotateCcw className="w-4 h-4 animate-spin" />
                        ) : isEditingClue ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <Send className="w-4 h-4" />
                        )}
                        <span>
                          {isSubmittingClue
                            ? 'Submitting...'
                            : isEditingClue
                            ? 'Update Clue'
                            : 'Submit Clue'}
                        </span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 bg-emerald-950/70 border-2 border-emerald-500/80 rounded-xl text-emerald-100 shadow-md">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                        <span className="font-bold text-sm text-emerald-300">Your clue is locked in: </span>
                        <span className="font-mono font-black text-sm sm:text-base bg-emerald-900/90 px-2.5 py-0.5 rounded border border-emerald-500 text-yellow-300">
                          "{gamePhase === 'clue_submission' && activePlayer.originalClue ? activePlayer.originalClue : activePlayer.clue}"
                        </span>
                        {!allCluesSubmitted && onStartEditClue && (
                          <button
                            type="button"
                            onClick={onStartEditClue}
                            className="ml-2 px-3 py-1 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg font-display font-black text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-xs cursor-pointer transition-all active:scale-95"
                            title="Edit your clue before the last person submits"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit Clue</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2 self-start sm:self-auto">
                        <span className="text-xs font-mono font-bold bg-slate-900/90 text-amber-300 border border-emerald-500/50 px-2.5 py-1 rounded-md">
                          Clues: {cluesSubmittedCount} / {totalPlayers} In
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-900/80 h-2 rounded-full overflow-hidden my-2 border border-emerald-500/30">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-500"
                        style={{ width: `${Math.round((cluesSubmittedCount / totalPlayers) * 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-emerald-300/90 flex-wrap gap-1">
                      {allCluesSubmitted ? (
                        <span className="font-bold text-emerald-200 animate-pulse flex items-center gap-1.5">
                          <Sparkles className="w-4 h-4 text-yellow-300" />
                          Everyone has input their clue! Starting the voting section…
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                          <span>Waiting for remaining clues before voting...</span>
                          <span className="text-slate-300 font-medium">
                            (Waiting on: {waitingCluePlayers.map((p) => p.name).join(', ')})
                          </span>
                          <span className="text-amber-300/90 text-[11px] ml-1">
                            • You can edit your clue until the last player submits!
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

      {/* PHASE 2: VOTING PHASE */}
      {gamePhase === 'voting' && (() => {
        const votesCastCount = players.filter((p) => Boolean(p.votedForId)).length;
        const totalPlayers = players.length;
        const waitingVotePlayers = players.filter((p) => !p.votedForId);
        const allVotesSubmitted = votesCastCount === totalPlayers;
        const votedTarget = players.find((p) => p.id === activePlayer.votedForId);
        const selectedPlayer = players.find((p) => p.id === selectedVoteTargetId);

        if (isVotingTrayMinimized) {
          return (
            <div className="flex items-center justify-between gap-2 py-0.5">
              <div className="flex items-center gap-2 min-w-0">
                <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0 animate-pulse" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-display font-black text-xs sm:text-sm text-white uppercase tracking-wider">
                      Voting Phase Active
                    </span>
                    <span className="text-[10px] sm:text-[11px] font-mono font-bold bg-slate-900 text-rose-300 border border-rose-500/50 px-2 py-0.5 rounded">
                      {votesCastCount}/{totalPlayers} Votes
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 truncate">
                    {hasCurrentPlayerVoted
                      ? `Your vote is locked for ${votedTarget?.name || 'Selected'}`
                      : selectedPlayer
                      ? `Selected suspect: ${selectedPlayer.name}`
                      : 'Review the 4x4 board and clues above, then open to vote'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {!hasCurrentPlayerVoted && selectedPlayer && (
                  <button
                    type="button"
                    onClick={() => {
                      onSubmitVote();
                      sound.voteCast();
                    }}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-display font-black text-xs uppercase tracking-wider rounded-lg shadow-md cursor-pointer transition-transform active:scale-95 flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Cast Vote: </span>
                    <span>{selectedPlayer.name}</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsVotingTrayMinimized(false)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-display font-black text-xs uppercase tracking-wider rounded-lg shadow-md flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                >
                  <ChevronUp className="w-4 h-4" />
                  <span>Open Vote Panel</span>
                </button>
              </div>
            </div>
          );
        }

        return (
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-700/60">
              <div>
                <h3 className="font-display font-black text-sm sm:text-base uppercase tracking-tight text-white flex items-center gap-2">
                  <AlertOctagon className="w-4 h-4 sm:w-5 sm:h-5 text-rose-400" />
                  Who's The Infiltrator? Vote.
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400">
                  Review everyone's clue against the 4x4 matrix. Cast your vote for the player blending in!
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                <span className="text-[11px] sm:text-xs font-mono font-bold bg-slate-900/90 text-rose-300 border border-rose-500/50 px-2.5 py-1 rounded-md">
                  Votes: {votesCastCount} / {totalPlayers} In
                </span>
                {hasCurrentPlayerVoted && (
                  <span className="text-[11px] font-bold text-emerald-300 bg-emerald-950 border border-emerald-600 px-2.5 py-1 rounded-md flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Voted
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setIsVotingTrayMinimized(true)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-md border border-slate-600 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                  title="Minimize voting drawer so you can inspect the 4x4 board and clues"
                >
                  <ChevronDown className="w-3.5 h-3.5 text-amber-400" />
                  <span>View Board</span>
                </button>
              </div>
            </div>

            {/* Scrollable Voting Body: Keeps board visible above */}
            <div className="max-h-[38vh] sm:max-h-[30vh] overflow-y-auto pr-1 space-y-2.5">

            {/* Waiting for everyone banner if current player voted */}
            {hasCurrentPlayerVoted && (
              <div className="p-3.5 bg-purple-950/70 border-2 border-purple-500/80 rounded-xl text-purple-100 shadow-md mb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CheckCircle2 className="w-4 h-4 text-purple-300 shrink-0" />
                    <div>
                      <span className="font-bold text-xs sm:text-sm text-purple-200">Your current vote: </span>
                      <span className="font-mono font-black text-xs sm:text-sm bg-purple-900/90 px-2 py-0.5 rounded border border-purple-400 text-yellow-300">
                        👉 {votedTarget?.name || 'Selected'}
                      </span>
                    </div>
                    {!allVotesSubmitted && (
                      <span className="text-[11px] bg-slate-900/80 text-purple-300 border border-purple-600/50 px-2 py-0.5 rounded font-medium">
                        💡 You can change your vote below until the final person casts theirs
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-purple-300 font-semibold shrink-0">
                    {votesCastCount} of {totalPlayers} votes recorded
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-900/80 h-2 rounded-full overflow-hidden my-2 border border-purple-500/30">
                  <div
                    className="h-full bg-purple-400 transition-all duration-500"
                    style={{ width: `${Math.round((votesCastCount / totalPlayers) * 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-purple-200/90 flex-wrap gap-1">
                  {allVotesSubmitted ? (
                    <span className="font-bold text-yellow-300 animate-pulse flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-yellow-300" />
                      All {totalPlayers} votes are in! Tallying accusations and revealing results…
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
                      <span>Waiting for everyone to put in their vote before showing the results...</span>
                      <span className="text-slate-300 font-medium">
                        (Waiting on: {waitingVotePlayers.map((p) => p.name).join(', ')})
                      </span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Round Discussion & Accusations Feed */}
            <div className="mb-3.5 bg-slate-900/90 border border-slate-700/80 rounded-xl overflow-hidden shadow-md">
              <div
                onClick={() => setIsDiscussionOpen((prev) => !prev)}
                className="px-3 py-2 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-emerald-400" />
                  <span className="font-display font-black text-xs uppercase tracking-wider text-slate-200">
                    Round Discussion & Debate
                  </span>
                  {isCurrentPlayerSilenced ? (
                    <span className="text-[10px] font-mono font-bold bg-rose-950 text-rose-300 border border-rose-600 px-1.5 py-0.2 rounded flex items-center gap-1 animate-pulse">
                      <VolumeX className="w-2.5 h-2.5" /> Silenced (Can't Speak)
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/80 border border-emerald-600/50 px-1.5 py-0.2 rounded">
                      {discussionMessages.length} Messages
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-slate-400 text-xs">
                  <span className="text-[11px]">{isDiscussionOpen ? 'Hide' : 'Show'}</span>
                  {isDiscussionOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </div>

              {isDiscussionOpen && (
                <div className="p-3 space-y-2.5">
                  {/* Messages Feed */}
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {discussionMessages.length === 0 ? (
                      <div className="text-center py-2 text-slate-400 italic text-[11px]">
                        No accusations yet! Point out suspicious clues or defend yourself below.
                      </div>
                    ) : (
                      discussionMessages.map((msg) => {
                        const isSelf = msg.playerId === activePlayer.id;
                        const wasSilenced = msg.isSilencedAttempt;
                        return (
                          <div
                            key={msg.id}
                            className={`p-2 rounded-lg flex items-start gap-2 border ${
                              wasSilenced
                                ? 'bg-rose-950/40 border-rose-700/50 text-rose-200'
                                : isSelf
                                ? 'bg-purple-950/50 border-purple-600/40 text-purple-100'
                                : 'bg-slate-800/70 border-slate-700 text-slate-200'
                            }`}
                          >
                            <span className="text-base select-none shrink-0">{msg.playerAvatar}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 mb-0.5">
                                <span className="font-bold text-[11px] text-white">
                                  {msg.playerName}
                                </span>
                                {isSelf && (
                                  <span className="text-[9px] bg-purple-900 text-purple-200 px-1 rounded font-bold">
                                    YOU
                                  </span>
                                )}
                                {wasSilenced && (
                                  <span className="text-[9px] bg-rose-900 text-rose-200 px-1 rounded font-mono font-bold flex items-center gap-0.5">
                                    <VolumeX className="w-2.5 h-2.5" /> MUTED
                                  </span>
                                )}
                              </div>
                              <p className="text-xs leading-relaxed break-words font-sans">
                                {msg.message}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Input / Silenced Barrier */}
                  {isCurrentPlayerSilenced ? (
                    <div className="p-2.5 bg-rose-950/60 border border-rose-500/60 rounded-lg text-xs text-rose-200 flex items-center gap-2">
                      <VolumeX className="w-4 h-4 text-rose-400 shrink-0" />
                      <div>
                        <strong className="font-bold text-rose-300">You are silenced! </strong>
                        <span>The Infiltrator's Elixir of Silence prevents you from speaking or debating. Your clue is still shown above!</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2 pt-1 border-t border-slate-800">
                      {/* Quick Debate Reactions */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] scrollbar-none">
                        {[
                          "My clue connects directly! 🎯",
                          "That clue is way too vague! 🤨",
                          "Look at the board coordinates! 🗺️",
                          "I'm 100% innocent! 😇",
                          "Suspect the quiet ones! 🕵️",
                        ].map((chip) => (
                          <button
                            key={chip}
                            type="button"
                            onClick={() => handleSendDiscussion(chip)}
                            className="shrink-0 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md border border-slate-700 cursor-pointer transition-colors"
                          >
                            {chip}
                          </button>
                        ))}
                      </div>

                      {/* Text input and send */}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={discussionInput}
                          onChange={(e) => setDiscussionInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSendDiscussion();
                            }
                          }}
                          placeholder="Type your defense or call out a suspect..."
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                        />
                        <button
                          type="button"
                          disabled={!discussionInput.trim()}
                          onClick={() => handleSendDiscussion()}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Send</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Clickable Player Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
              {players
                .filter((p) => p.id !== activePlayer.id)
                .map((p) => {
                  const isSelected = selectedVoteTargetId === p.id;
                  const isMyVotedTarget = activePlayer.votedForId === p.id;
                  const isTargetSilenced = silencedPlayerIds.includes(p.id);
                  return (
                    <motion.button
                      key={p.id}
                      type="button"
                      disabled={allVotesSubmitted}
                      whileHover={!allVotesSubmitted ? { scale: 1.03 } : undefined}
                      whileTap={!allVotesSubmitted ? { scale: 0.96 } : undefined}
                      onClick={() => {
                        onSelectVoteTarget(p.id);
                        sound.click();
                      }}
                      className={`relative p-2.5 rounded-lg border-2 text-left transition-all flex items-center gap-2 ${
                        isMyVotedTarget
                          ? 'bg-purple-900 border-purple-400 text-white shadow-md ring-2 ring-purple-300'
                          : isSelected
                          ? 'bg-rose-600 border-rose-400 text-white shadow-md'
                          : 'bg-slate-800 hover:bg-slate-700/80 border-slate-700 text-white shadow-xs'
                      } ${allVotesSubmitted ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <span className="text-xl shrink-0">{p.avatar}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="font-bold text-xs break-words [overflow-wrap:anywhere] max-w-[110px] leading-tight">
                            {p.name}
                          </span>
                          {isMyVotedTarget && (
                            <motion.span
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className="text-[9px] bg-purple-950 text-yellow-300 font-bold px-1 rounded flex items-center gap-0.5"
                            >
                              ✓ Voted
                            </motion.span>
                          )}
                          {isTargetSilenced && (
                            <span className="text-[9px] bg-rose-950 text-rose-300 border border-rose-600 font-bold px-1 rounded flex items-center gap-0.5" title="Muted by Infiltrator">
                              🤐 Muted
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[11px] font-mono font-bold truncate mt-0.5 ${
                            isMyVotedTarget
                              ? 'text-yellow-200'
                              : isSelected
                              ? 'text-rose-100'
                              : 'text-amber-300'
                          }`}
                          title={p.clue ? `Clue: "${p.clue}"` : undefined}
                        >
                          {p.clue ? (
                            <span className="break-words truncate max-w-[200px] inline-flex items-center gap-1 align-bottom">
                              <span>"{p.clue}"</span>
                              {activePlayer.role === 'fox' && (p.id === forgedTargetPlayerId || p.forgedBy === activePlayer.id) && (
                                <span className="text-[9px] font-sans font-extrabold uppercase tracking-wider text-purple-300 bg-purple-950/90 border border-purple-500/60 px-1 py-0.2 rounded shrink-0">
                                  ✒️ Forged
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-500 italic font-sans font-normal text-[10px]">No clue</span>
                          )}
                        </div>
                      </div>

                      {/* Animated Target Crosshair badge if selected */}
                      {isSelected && !isMyVotedTarget && (
                        <motion.div
                          initial={{ scale: 0, rotate: -45 }}
                          animate={{ scale: 1, rotate: 0 }}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 rounded-full border-2 border-white flex items-center justify-center shadow-md"
                        >
                          <Target className="w-3 h-3 text-white" />
                        </motion.div>
                      )}
                    </motion.button>
                  );
                })}
            </div>
          </div>

            {/* Confirm or Change Vote Button */}
            {!allVotesSubmitted && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <div className="text-xs text-slate-300">
                  {selectedVoteTargetId && selectedVoteTargetId !== activePlayer.votedForId ? (
                    <span className="flex items-center gap-1.5">
                      <Target className="w-3.5 h-3.5 text-rose-400" />
                      Target selected:{' '}
                      <strong className="text-rose-400 font-bold">
                        <span className="break-words [overflow-wrap:anywhere] max-w-[140px] inline-block align-bottom">
                          {players.find((p) => p.id === selectedVoteTargetId)?.name}
                        </span>
                      </strong>
                    </span>
                  ) : hasCurrentPlayerVoted ? (
                    <span className="text-purple-300 text-[11px]">
                      Click any player card above to change your accusation before the round locks.
                    </span>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  {hasCurrentPlayerVoted ? (
                    selectedVoteTargetId && selectedVoteTargetId !== activePlayer.votedForId ? (
                      <button
                        onClick={() => {
                          onSubmitVote();
                          sound.voteCast();
                        }}
                        className="retro-button px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer active:scale-95 transition-transform"
                      >
                        <AlertOctagon className="w-4 h-4" />
                        <span>Update Vote Accusation</span>
                      </button>
                    ) : null
                  ) : (
                    <button
                      onClick={() => {
                        onSubmitVote();
                        sound.voteCast();
                      }}
                      disabled={!selectedVoteTargetId}
                      className="retro-button px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white disabled:opacity-50 disabled:pointer-events-none rounded-lg font-display font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 shadow-md cursor-pointer active:scale-95 transition-transform"
                    >
                      <AlertOctagon className="w-4 h-4" />
                      <span>Cast Vote Accusation</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* PHASE 3: INFILTRATOR ESCAPE GUESS */}
      {gamePhase === 'fox_guess' && (
        <div className="p-4 bg-amber-950/40 border-2 border-amber-600/70 rounded-lg text-slate-100 space-y-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🕵️</span>
                <div>
                  <h3 className="font-display font-black text-base uppercase text-yellow-300">
                    Infiltrator's Last Stand: {caughtFoxPlayer?.name || 'The Infiltrator'} is Caught!
                  </h3>
                  <p className="text-xs text-slate-300">
                    {isCurrentPlayerTheCaughtFox
                      ? 'You were caught! Select the secret tile on the 4x4 matrix above to steal the round (+2 pts)!'
                      : `${caughtFoxPlayer?.name} was voted as The Infiltrator! They are reviewing everyone's hints to guess the secret word...`}
                  </p>
                </div>
              </div>
            </div>

            {isCurrentPlayerTheCaughtFox && (
              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={onSubmitFoxGuess}
                  disabled={!selectedGuessWord}
                  className="retro-button px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-50 disabled:pointer-events-none rounded-lg font-display font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-slate-950" />
                  <span>Lock In Escape Guess</span>
                </button>
              </div>
            )}
          </div>

          {/* Revealed hints reminder for the Infiltrator's escape */}
          <div className="pt-2 border-t border-amber-800/80">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-300 block mb-1.5">
              Player Clues / Hints Given This Round:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {players.filter(p => p.clue).map(p => (
                <div key={p.id} className="inline-flex items-center gap-1 bg-slate-900 border border-slate-700 px-2.5 py-1 rounded-md text-xs">
                  <span className="text-sm">{p.avatar}</span>
                  <span className="font-bold text-slate-300 text-[11px] break-words [overflow-wrap:anywhere] max-w-[120px]">{p.name}:</span>
                  <span className="font-mono font-bold text-amber-300">"{p.clue}"</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PHASE 4: ROUND RESOLUTION */}
      {gamePhase === 'round_resolution' && roundResolution && (
        <div className="space-y-3">
          {/* Winner Banner */}
          <div
            className={`p-4 rounded-xl border-2 ${
              roundResolution.winner === 'innocents'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-100'
                : 'bg-amber-950/90 border-amber-500 text-amber-100'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">
                  {roundResolution.winner === 'innocents' ? '🏆' : '🕵️'}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-extrabold uppercase tracking-widest px-2 py-0.5 rounded bg-slate-900 text-white border border-slate-700">
                      {roundResolution.winner === 'innocents' ? 'INNOCENTS WIN' : 'INFILTRATOR WINS'}
                    </span>
                    <span className="text-xs text-slate-300 font-semibold">
                      {roundResolution.reason === 'innocents_caught_fox' && 'Infiltrator caught & missed secret word!'}
                      {roundResolution.reason === 'fox_stole_win' && 'Infiltrator was caught, but correctly stole the word!'}
                      {roundResolution.reason === 'fox_escaped_undetected' && 'Infiltrator slipped through undetected!'}
                      {roundResolution.reason === 'fox_won_sudden_death' && 'Infiltrator wins the sudden-death vote!'}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-3 flex-wrap text-sm">
                    <span>
                      The Infiltrator was: <strong className="font-display underline text-yellow-300">{roundResolution.foxPlayerName}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Secret Word: <strong className="font-mono text-emerald-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{roundResolution.targetWord} ({roundResolution.targetCoordinate})</strong>
                    </span>
                    {roundResolution.foxGuessWord && (
                      <>
                        <span>•</span>
                        <span>
                          Infiltrator Guessed: <strong className="font-mono text-amber-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">{roundResolution.foxGuessWord}</strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons: Summary & Next Round */}
              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                {onOpenResolutionModal && (
                  <button
                    onClick={onOpenResolutionModal}
                    className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg font-display font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Reopen full results modal"
                  >
                    <Eye className="w-3.5 h-3.5 text-amber-400" />
                    <span>Summary</span>
                  </button>
                )}

                {gameMode === 'room' && !isHost ? (
                  <div className="px-3.5 py-2.5 bg-slate-900/90 border border-slate-700/80 rounded-lg font-display text-xs text-amber-300 flex items-center gap-2 font-bold shadow-inner">
                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-ping shrink-0" />
                    <span>
                      {roundNumber && roundNumber % 3 === 0
                        ? 'Waiting for Host to proceed to Shop 🛒...'
                        : 'Waiting for Host...'}
                    </span>
                  </div>
                ) : roundNumber && roundNumber % 3 === 0 ? (
                  <button
                    onClick={onNextRound}
                    className="retro-button px-5 py-2.5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 rounded-lg font-display font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-950/40 border-2 border-amber-300 active:scale-95 transition-transform animate-pulse"
                  >
                    <span>Proceed to Shop 🛒</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={onNextRound}
                    className="retro-button px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg font-display font-black text-xs sm:text-sm uppercase tracking-wider flex items-center gap-2 cursor-pointer shadow-md active:scale-95 transition-transform"
                  >
                    <span>Next Round</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Points Breakdown */}
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(roundResolution.pointsAwarded).map(([pId, data]) => {
              const info = data as { points: number; explanation: string };
              const p = players.find(player => player.id === pId);
              if (!p) return null;
              return (
                <div
                  key={pId}
                  className="flex items-center gap-1.5 bg-slate-800/90 border border-slate-700 px-2.5 py-1 rounded-md text-slate-200"
                >
                  <span className="font-bold text-white">{p.name}:</span>
                  <span className="font-mono font-black text-emerald-400">+{info.points} pts</span>
                  <span className="text-[10px] text-slate-400">({info.explanation})</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
};
