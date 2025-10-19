import React from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import Card from './Card';
import { useGameStore } from '../store/gameStore';
import { Round } from '../types/game';

interface LastRoundViewerProps {
    onClose: () => void;
    timeRemaining?: number | null;
}

const LastRoundViewer: React.FC<LastRoundViewerProps> = ({ onClose, timeRemaining }) => {
    const { currentGame, currentPlayer } = useGameStore();

    if (!currentGame) {
        return null;
    }

    // Get the most recent completed round (exclude current round)
    const lastCompletedRound: Round | null = currentGame.rounds.length > 0
        ? currentGame.rounds[currentGame.rounds.length - 1]
        : null;

    if (!lastCompletedRound) {
        return createPortal(
            <motion.div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="bg-gray-900 rounded-lg border border-gray-700 max-w-md w-full p-6 text-center"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="text-white text-lg mb-4">
                        No completed rounds available yet
                    </div>
                    <button
                        onClick={onClose}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                </motion.div>
            </motion.div>,
            document.body
        );
    }

    const getPlayerName = (playerId: string) => {
        const player = currentGame.players.find(p => p.id === playerId);
        return player ? player.name : 'Unknown';
    };

    const getPlayerTeam = (playerId: string) => {
        const player = currentGame.players.find(p => p.id === playerId);
        if (!player) return 'team1'; // Default fallback

        // Team assignment: even positions (0,2) are team1, odd positions (1,3) are team2
        const playerTeam = player.position % 2 === 0 ? 'team1' : 'team2';
        return playerTeam;
    };

    const getTeamColor = (team: string) => {
        if (team === 'team1') {
            return 'border-red-400 bg-red-500/20'; // Team 1 (red)
        } else {
            return 'border-blue-400 bg-blue-500/20'; // Team 2 (blue)
        }
    };

    const getTeamGlow = (team: string) => {
        if (team === 'team1') {
            return '0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(239, 68, 68, 0.6), 0 0 60px rgba(239, 68, 68, 0.4)'; // Red glow
        } else {
            return '0 0 20px rgba(59, 130, 246, 0.8), 0 0 40px rgba(59, 130, 246, 0.6), 0 0 60px rgba(59, 130, 246, 0.4)'; // Blue glow
        }
    };

    const getTeamTextColor = (team: string) => {
        if (team === 'team1') {
            return 'text-red-400'; // Team 1 (red)
        } else {
            return 'text-blue-400'; // Team 2 (blue)
        }
    };

    const getTeamName = (team: string) => {
        if (team === 'team1') {
            return 'Team 1';
        } else {
            return 'Team 2';
        }
    };

    const getCardValue = (card: any) => {
        const values: { [key: string]: number } = {
            'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5
        };
        return values[card.rank] || 0;
    };

    // Calculate team totals for the round
    const team1Tricks = lastCompletedRound.tricks.filter(trick => {
        const winnerTeam = getPlayerTeam(trick.winner || '');
        return winnerTeam === 'team1';
    });

    const team2Tricks = lastCompletedRound.tricks.filter(trick => {
        const winnerTeam = getPlayerTeam(trick.winner || '');
        return winnerTeam === 'team2';
    });

    const team1Points = team1Tricks.reduce((sum, trick) => sum + trick.points, 0);
    const team2Points = team2Tricks.reduce((sum, trick) => sum + trick.points, 0);

    return createPortal(
        <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="bg-gray-900 rounded-lg border border-gray-700 max-w-5xl w-full max-h-[85vh] overflow-y-auto"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-700">
                    <h2 className="text-xl font-bold text-white">Round {lastCompletedRound.roundNumber} Summary</h2>
                    <div className="flex items-center gap-4">
                        {/* Timer display when it's the player's turn */}
                        {currentPlayer && currentGame.currentPlayer === currentPlayer.id && timeRemaining !== null && timeRemaining !== undefined && (
                            <div
                                className="text-xl font-bold px-3 py-1 rounded-lg border"
                                style={{
                                    color: timeRemaining <= 5 ? '#f87171' : timeRemaining <= 10 ? '#fbbf24' : '#4ade80',
                                    borderColor: timeRemaining <= 5 ? '#f87171' : timeRemaining <= 10 ? '#fbbf24' : '#4ade80',
                                    backgroundColor: timeRemaining <= 5 ? '#f8717110' : timeRemaining <= 10 ? '#fbbf2410' : '#4ade8010'
                                }}
                            >
                                ⏱️ {timeRemaining}s
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors text-2xl"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Round Stats */}
                <div className="p-3 border-b border-gray-700">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-gray-300">
                                <span className="text-gray-400">Round:</span> <span className="font-bold text-white">{lastCompletedRound.roundNumber}</span>
                            </div>
                            <div className="text-sm text-gray-300">
                                <span className="text-gray-400">Tricks:</span> <span className="font-bold text-white">{lastCompletedRound.tricks.length}/9</span>
                            </div>
                            <div className="text-sm text-gray-300">
                                <span className="text-gray-400">Trump:</span> <span className="font-bold text-white">
                                    {lastCompletedRound.trumpSuit ?
                                        lastCompletedRound.trumpSuit.charAt(0).toUpperCase() + lastCompletedRound.trumpSuit.slice(1) :
                                        'None'
                                    }
                                </span>
                            </div>
                            {lastCompletedRound.bid && (
                                <div className="text-sm text-gray-300">
                                    <span className="text-gray-400">Bid:</span> <span className="font-bold text-white">{lastCompletedRound.bid.points} by {getPlayerName(lastCompletedRound.bid.playerId)}</span>
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-4">
                            <div className={`px-3 py-1 rounded-lg border ${getTeamColor('team1')}`}>
                                <div className="text-xs font-semibold text-white">
                                    {getTeamName('team1')}: {team1Points} pts ({team1Tricks.length} tricks)
                                </div>
                            </div>
                            <div className={`px-3 py-1 rounded-lg border ${getTeamColor('team2')}`}>
                                <div className="text-xs font-semibold text-white">
                                    {getTeamName('team2')}: {team2Points} pts ({team2Tricks.length} tricks)
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tricks Display - Natural Table Layout */}
                <div className="p-6">
                    <div className="grid grid-cols-3 gap-6">
                        {lastCompletedRound.tricks.map((trick, index) => {
                            const winnerTeam = getPlayerTeam(trick.winner || '');

                            return (
                                <motion.div
                                    key={index}
                                    className={`relative border-2 rounded-lg p-3 ${winnerTeam === 'team1' ? 'border-red-400/30' : 'border-blue-400/30'}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    {/* Trick Header */}
                                    <div className="mb-3">
                                        <h4 className="text-lg font-bold">
                                            <span className={getTeamTextColor(getPlayerTeam(trick.winner || ''))}>Trick {index + 1}</span> <span className="text-sm font-normal text-gray-300">- Won by <span className={`font-bold ${getTeamTextColor(getPlayerTeam(trick.winner || ''))}`}>{getPlayerName(trick.winner || '')}</span></span>
                                        </h4>
                                    </div>

                                    {/* Cards Stack - Natural Table Layout */}
                                    <div className="relative h-28 flex justify-center items-start pt-2">
                                        <div className="relative">
                                            {trick.cards.map(({ card, playerId }, cardIndex) => {
                                                const hasPoints = getCardValue(card) > 0;
                                                const shouldGlow = hasPoints;

                                                return (
                                                    <motion.div
                                                        key={`${card.id}-${playerId}`}
                                                        className="absolute"
                                                        initial={{
                                                            opacity: 0,
                                                            scale: 0.8,
                                                            rotate: (cardIndex - 1.5) * 2,
                                                            x: cardIndex * 36 - 54 - 30,
                                                            y: 8
                                                        }}
                                                        animate={{
                                                            opacity: 1,
                                                            scale: 1,
                                                            rotate: (cardIndex - 1.5) * 2,
                                                            x: cardIndex * 36 - 54 - 30,
                                                            y: shouldGlow ? 0 : 8
                                                        }}
                                                        transition={{
                                                            delay: index * 0.05 + cardIndex * 0.1,
                                                            type: "spring",
                                                            stiffness: 200,
                                                            damping: 15
                                                        }}
                                                        style={{
                                                            zIndex: cardIndex + 1,
                                                            filter: shouldGlow ? 'brightness(1.2)' : 'brightness(0.9)'
                                                        }}
                                                    >
                                                        <Card
                                                            card={card}
                                                            size="tiny"
                                                            className="shadow-lg"
                                                            style={{
                                                                boxShadow: shouldGlow ? getTeamGlow(winnerTeam) : '0 4px 8px rgba(0,0,0,0.3)',
                                                                border: shouldGlow ? `2px solid ${winnerTeam === 'team1' ? '#ef4444' : '#3b82f6'}` : 'none'
                                                            }}
                                                        />
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Points Indicator */}
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.5 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: index * 0.05 + 0.5 }}
                                        className={`absolute -top-2 -right-2 text-2xl font-extrabold ${getTeamTextColor(winnerTeam)}`}
                                        style={{
                                            textShadow: '0 0 12px currentColor, 0 0 24px currentColor, 0 2px 4px rgba(0,0,0,0.8)',
                                            zIndex: 20
                                        }}
                                    >
                                        +{trick.points}
                                    </motion.div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

            </motion.div>
        </motion.div>,
        document.body
    );
};

export default LastRoundViewer;
