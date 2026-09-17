import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Feather, AlertCircle, Check, X, Sparkles, User, Bot, HelpCircle } from 'lucide-react';
import { Player } from '../types';

interface ClueForgeryModalProps {
  isOpen: boolean;
  players: Player[];
  activePlayerId: string;
  onConfirmForgery: (targetPlayerId: string, newClue: string) => void;
  onClose: () => void;
}

export const ClueForgeryModal: React.FC<ClueForgeryModalProps> = ({
  isOpen,
  players,
  activePlayerId,
  onConfirmForgery,
  onClose,
}) => {
  // Targetable candidates: all players except active player (the Infiltrator)
  const candidatePlayers = players.filter((p) => p.id !== activePlayerId);
  const [selectedTargetId, setSelectedTargetId] = useState<string>(candidatePlayers[0]?.id || '');
  const [forgedClue, setForgedClue] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const defaultTarget = candidatePlayers[0]?.id || '';
      setSelectedTargetId(defaultTarget);
      setForgedClue('');
    }
  }, [isOpen]);

  const handleSelectTarget = (targetId: string) => {
    setSelectedTargetId(targetId);
  };

  if (!isOpen) return null;

  const targetPlayer = candidatePlayers.find((p) => p.id === selectedTargetId);
  const isValid = selectedTargetId !== '' && forgedClue.trim().length > 0 && forgedClue.length <= 80;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirmForgery(selectedTargetId, forgedClue.trim());
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative z-10 w-full max-w-lg bg-[#111726] border-2 border-purple-500/80 rounded-2xl shadow-2xl shadow-purple-950/70 text-slate-100 overflow-hidden my-auto"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-950 via-slate-900 to-purple-950 p-4 sm:p-5 border-b-2 border-purple-500/50 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl select-none">✒️</span>
              <div>
                <h3 className="text-lg sm:text-xl font-display font-black uppercase tracking-wider text-purple-300 flex items-center gap-2">
                  <span>INK OF DECEIT</span>
                  <span className="text-[10px] font-mono font-bold bg-purple-900/90 text-purple-200 border border-purple-400 px-2 py-0.5 rounded">
                    Sneaky Forgery
                  </span>
                </h3>
                <p className="text-xs text-purple-200/80 font-mono">
                  Secretly rewrite another player's submitted clue
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-4 sm:p-6 space-y-5">
            {/* Step 1: Select Player */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-300 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span>1. Select Victim to Frame</span>
                <span className="text-purple-400 text-[11px] font-normal lowercase">(only other players)</span>
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                {candidatePlayers.map((p) => {
                  const isSelected = p.id === selectedTargetId;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectTarget(p.id)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-purple-950/80 border-purple-400 ring-2 ring-purple-400/80 shadow-md'
                          : 'bg-slate-900/80 border-slate-700 hover:border-slate-500 text-slate-300'
                      }`}
                    >
                      <span className="text-xl select-none shrink-0">{p.avatar}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs sm:text-sm text-white truncate flex items-center gap-1">
                          <span>{p.name}</span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-purple-400 stroke-[3]" />}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate font-mono mt-0.5">
                          {p.hasSubmittedClue ? '✓ Clue submitted' : '⏳ Awaiting clue...'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Edit Clue */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-mono font-bold text-slate-300 uppercase tracking-wide">
                  2. Altered / Forged Clue
                </label>
                <span className={`text-[11px] font-mono ${forgedClue.length > 70 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                  {forgedClue.length}/80 chars
                </span>
              </div>

              <div className="relative">
                <input
                  type="text"
                  maxLength={80}
                  value={forgedClue}
                  onChange={(e) => setForgedClue(e.target.value)}
                  placeholder="Enter forged clue (e.g. suspicious or off-topic hint)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border-2 border-purple-500/60 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/40 text-white font-mono text-sm shadow-inner placeholder:text-slate-600 outline-none"
                />
              </div>

              <p className="mt-1.5 text-[11px] text-slate-400 flex items-center gap-1">
                <HelpCircle className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                Make it sound suspicious or off-topic to cast doubt on this player!
              </p>
            </div>

            {/* Stealth Notice Banner */}
            <div className="p-3 bg-slate-900/90 border border-purple-500/30 rounded-xl text-xs text-purple-200/90 flex items-start gap-2.5">
              <span className="text-base select-none mt-0.5">🤫</span>
              <div className="space-y-1">
                <strong className="text-purple-300 font-bold block">Sneaky Execution:</strong>
                <p className="text-[11px] leading-relaxed text-slate-300">
                  The target player will continue to see their own entered clue during clue submission so they don't get tipped off. Once voting begins, your forged clue takes effect and replaces theirs for everyone!
                </p>
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-slate-950/90 px-4 py-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-mono font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              disabled={!isValid}
              onClick={handleConfirm}
              className={`px-5 py-2.5 rounded-xl text-xs font-display font-black uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                isValid
                  ? 'retro-button bg-purple-600 hover:bg-purple-500 text-white border-purple-400 shadow-md shadow-purple-950/60 active:scale-95'
                  : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
              }`}
            >
              <span>Confirm Forgery ✒️</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
