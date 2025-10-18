import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import Card from './Card';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';
import { GameTranscript } from '../types/game';

interface LastRoundViewerProps {
    onClose: () => void;
    timeRemaining?: number | null;
}

interface RoundTrick {
    trickNumber: number;
    cards: { card: any; playerId: string }[];
    winner: string;
    points: number;
    leadSuit?: string;
    trumpSuit?: string;
}

const LastRoundViewer: React.FC<LastRoundViewerProps> = ({ onClose, timeRemaining }) => {
    const { currentGame, currentPlayer } = useGameStore();
    const { getGameTranscript } = useSocketStore();
    const [, setTranscript] = useState<GameTranscript | null>(null);
    const [roundTricks, setRoundTricks] = useState<RoundTrick[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    if (!currentGame) {
        return null;
    }

    const getPlayerName = (playerId: string) => {
        const player = currentGame.players.find(p => p.id === playerId);
        return player ? player.name : 'Unknown';
    };

    // const getPlayerPosition = (playerId: string) => {
    //     const player = currentGame.players.find(p => p.id === playerId);
    //     return player ? player.position : 0;
    // };

    const getPlayerTeam = (playerId: string) => {
        const player = currentGame.players.find(p => p.id === playerId);
        if (!player) return 'team1'; // Default fallback

        // Team assignment: even positions (0,2) are team1, odd positions (1,3) are team2
        const playerTeam = player.position % 2 === 0 ? 'team1' : 'team2';
        return playerTeam;
    };

    // const getCardValue = (card: any) => {
    //     const values: { [key: string]: number } = {
    //         'A': 11, 'K': 4, 'Q': 3, 'J': 2, '10': 10, '9': 0
    //     };
    //     return values[card.rank] || 0;
    // };

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

    // Extract tricks from the previous round
    useEffect(() => {
        if (!currentGame || currentGame.round <= 1) {
            setLoading(false);
            setError('No previous round available');
            return;
        }

        const previousRound = currentGame.round - 1;

        getGameTranscript(currentGame.id, (fetchedTranscript) => {
            if (!fetchedTranscript) {
                setError('Failed to load game transcript');
                setLoading(false);
                return;
            }

            setTranscript(fetchedTranscript);

            // Find all trick_complete entries for the previous round
            const previousRoundTricks: RoundTrick[] = [];
            let foundRoundStart = false;
            let foundNextRoundStart = false;

            // First, try to find tricks using round start markers
            for (const entry of fetchedTranscript.entries) {
                if (entry.type === 'round_start' && entry.data.round === previousRound) {
                    foundRoundStart = true;
                    continue;
                }

                if (entry.type === 'round_start' && entry.data.round === currentGame.round) {
                    foundNextRoundStart = true;
                    break;
                }

                if (foundRoundStart && !foundNextRoundStart && entry.type === 'trick_complete') {
                    const trickData = entry.data;
                    previousRoundTricks.push({
                        trickNumber: trickData.trickNumber || previousRoundTricks.length + 1,
                        cards: trickData.trick.cards,
                        winner: trickData.winnerId,
                        points: trickData.points,
                        leadSuit: trickData.leadSuit,
                        trumpSuit: trickData.trumpSuit
                    });
                }
            }

            // Fallback: If no tricks found using round markers, try to find the last 9 tricks
            if (previousRoundTricks.length === 0) {
                const allTricks = fetchedTranscript.entries
                    .filter((entry: any) => entry.type === 'trick_complete')
                    .map((entry: any) => ({
                        trickNumber: entry.data.trickNumber || 0,
                        cards: entry.data.trick.cards,
                        winner: entry.data.winnerId,
                        points: entry.data.points,
                        leadSuit: entry.data.leadSuit,
                        trumpSuit: entry.data.trumpSuit,
                        timestamp: entry.timestamp
                    }))
                    .sort((a: any, b: any) => b.timestamp - a.timestamp); // Sort by newest first

                // Take the last 9 tricks (most recent complete round)
                const lastRoundTricks = allTricks.slice(0, 9).reverse(); // Reverse to get chronological order

                for (let i = 0; i < lastRoundTricks.length; i++) {
                    const trick = lastRoundTricks[i];
                    previousRoundTricks.push({
                        trickNumber: i + 1,
                        cards: trick.cards,
                        winner: trick.winner,
                        points: trick.points,
                        leadSuit: trick.leadSuit,
                        trumpSuit: trick.trumpSuit
                    });
                }
            }
            setRoundTricks(previousRoundTricks);
            setLoading(false);
        });
    }, [currentGame, getGameTranscript]);

    if (loading) {
        return createPortal(
            <motion.div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div
                    className="bg-gray-900 rounded-lg border border-gray-700 p-8 text-center"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                >
                    <div className="text-white text-lg">Loading last round...</div>
                </motion.div>
            </motion.div>,
            document.body
        );
    }

    if (error || roundTricks.length === 0) {
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
                        {error || 'No previous round data available'}
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

    // Calculate team totals for the round
    const team1Tricks = roundTricks.filter(trick => {
        const winnerTeam = getPlayerTeam(trick.winner);
        return winnerTeam === 'team1';
    });

    const team2Tricks = roundTricks.filter(trick => {
        const winnerTeam = getPlayerTeam(trick.winner);
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
                    <h2 className="text-xl font-bold text-white">Round {currentGame.round - 1} Summary</h2>
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

                {/* Compact Stats */}
                <div className="p-3 border-b border-gray-700">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className="text-sm text-gray-300">
                                <span className="text-gray-400">Round:</span> <span className="font-bold text-white">{currentGame.round - 1}</span>
                            </div>
                            <div className="text-sm text-gray-300">
                                <span className="text-gray-400">Tricks:</span> <span className="font-bold text-white">{roundTricks.length}/9</span>
                            </div>
                            <div className="text-sm text-gray-300">
                                <span className="text-gray-400">Trump:</span> <span className="font-bold text-white">
                                    {roundTricks[0]?.trumpSuit ?
                                        roundTricks[0].trumpSuit.charAt(0).toUpperCase() + roundTricks[0].trumpSuit.slice(1) :
                                        'None'
                                    }
                                </span>
                            </div>
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

                {/* All Tricks */}
                <div className="p-4 pb-6">
                    <div className="grid grid-cols-3 gap-3">
                        {roundTricks.map((trick, index) => {
                            const winnerTeam = getPlayerTeam(trick.winner);

                            return (
                                <motion.div
                                    key={index}
                                    className="p-2 relative"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.05 }}
                                >
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="text-sm font-semibold text-white">
                                            T{trick.trickNumber}
                                        </h4>
                                    </div>

                                    <div className="text-xs text-gray-300 mb-2">
                                        {getPlayerName(trick.winner)}
                                    </div>

                                    <div className="flex justify-center items-center h-14 relative">
                                        {trick.cards.map(({ card, playerId }, cardIndex) => (
                                            <div
                                                key={`${card.id}-${playerId}`}
                                                className="relative"
                                                style={{
                                                    transform: `rotate(${(cardIndex - 1.5) * 8}deg) translateX(${cardIndex * 8}px)`,
                                                    zIndex: cardIndex + 1
                                                }}
                                            >
                                                <Card
                                                    card={card}
                                                    size="tiny"
                                                    className="shadow-sm"
                                                    style={{ boxShadow: getTeamGlow(winnerTeam) }}
                                                />
                                            </div>
                                        ))}
                                    </div>

                                    {/* Points indicator in top right of cell */}
                                    <motion.div
                                        initial={{ opacity: 0, y: -5 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: index * 0.05 + 0.3 }}
                                        className={`absolute text-2xl font-extrabold ${getTeamTextColor(winnerTeam)}`}
                                        style={{
                                            textShadow: '0 0 12px currentColor, 0 0 24px currentColor, 0 2px 4px rgba(0,0,0,0.8)',
                                            top: '8px',
                                            right: '8px',
                                            zIndex: 10
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