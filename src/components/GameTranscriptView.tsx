import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSocketStore } from '../store/socketStore';
import TrickArea from './TrickArea';
import KittyArea from './KittyArea';
import GameInfo from './GameInfo';
import { Game, GameTranscript, TranscriptEntry } from '../types/game';

interface GameTranscriptViewProps {
    gameId: string;
    onClose: () => void;
}

const GameTranscriptView: React.FC<GameTranscriptViewProps> = ({ gameId, onClose }) => {
    const { getGameTranscript } = useSocketStore();
    const [transcript, setTranscript] = useState<GameTranscript | null>(null);
    const [currentEntryIndex, setCurrentEntryIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch transcript on mount
    useEffect(() => {
        getGameTranscript(gameId, (fetchedTranscript) => {
            if (fetchedTranscript) {
                setTranscript(fetchedTranscript);
                setLoading(false);
            } else {
                setError('Failed to load game transcript');
                setLoading(false);
            }
        });
    }, [gameId, getGameTranscript]);

    // Auto-play functionality
    useEffect(() => {
        if (!isPlaying || !transcript) return;

        const interval = setInterval(() => {
            setCurrentEntryIndex(prev => {
                if (prev >= transcript.entries.length - 1) {
                    setIsPlaying(false);
                    return prev;
                }
                return prev + 1;
            });
        }, 1000 / playbackSpeed);

        return () => clearInterval(interval);
    }, [isPlaying, transcript, playbackSpeed]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
                <div className="text-white text-2xl">Loading game transcript...</div>
            </div>
        );
    }

    if (error || !transcript) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
                <div className="text-red-300 text-2xl">{error || 'Transcript not available'}</div>
            </div>
        );
    }

    // Get current game state from transcript entry
    const currentEntry = transcript.entries[currentEntryIndex];
    const currentGame = currentEntry?.gameState as Partial<Game>;

    if (!currentGame || !currentGame.players) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 flex items-center justify-center">
                <div className="text-white text-2xl">Invalid game state</div>
            </div>
        );
    }

    const getPlayerPosition = (player: any) => {
        const positionMap: { [key: number]: string } = {
            0: 'north',
            1: 'east',
            2: 'south',
            3: 'west'
        };
        return positionMap[player.position] || 'north';
    };

    const getVisualPosition = (player: any) => {
        const visualMap: { [key: number]: string } = {
            0: 'top',
            1: 'right',
            2: 'bottom',
            3: 'left'
        };
        return visualMap[player.position] || 'top';
    };

    const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setCurrentEntryIndex(parseInt(e.target.value));
        setIsPlaying(false);
    };

    const togglePlayPause = () => {
        setIsPlaying(!isPlaying);
    };

    const handlePrevious = () => {
        setCurrentEntryIndex(Math.max(0, currentEntryIndex - 1));
        setIsPlaying(false);
    };

    const handleNext = () => {
        setCurrentEntryIndex(Math.min(transcript.entries.length - 1, currentEntryIndex + 1));
        setIsPlaying(false);
    };

    const formatTimestamp = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };

    const getActionDescription = (entry: TranscriptEntry) => {
        const { type, data } = entry;
        const playerName = data.playerId ? transcript.metadata.playerNames[data.playerId] : '';

        switch (type) {
            case 'game_start':
                return 'Game started';
            case 'round_start':
                return `Round ${data.round} started`;
            case 'bid_made':
                return `${playerName} bid ${data.bid.points} points`;
            case 'bid_pass':
                return `${playerName} passed`;
            case 'bidding_complete':
                return 'Bidding complete';
            case 'kitty_pick':
                return `${playerName} picked up the kitty`;
            case 'kitty_discard':
                return `${playerName} discarded to kitty`;
            case 'card_played':
                return `${playerName} played ${data.card.rank} of ${data.card.suit}`;
            case 'trick_complete':
                const winnerName = transcript.metadata.playerNames[data.winnerId];
                const cardsPlayed = data.trick?.cards?.map((c: any) => {
                    const pName = transcript.metadata.playerNames[c.playerId];
                    return `${pName}: ${c.card.rank}${getSuitSymbol(c.card.suit)}`;
                }).join(', ') || '';
                return `Trick won by ${winnerName} (${data.points} pts) - [${cardsPlayed}]`;
            case 'round_complete':
                return `Round ${data.round} complete`;
            case 'game_complete':
                const teamName = data.winningTeamName || data.winningTeam;
                const winners = data.winningPlayers?.map((p: any) => p.name).join(' & ') || 'Unknown';
                const finalScore = data.finalScores ?
                    `(${data.finalScores.team1} - ${data.finalScores.team2})` : '';
                return `🏆 ${teamName} wins! ${winners} ${finalScore} - ${data.totalRounds} rounds played`;
            case 'player_exit':
                return `🚪 ${data.playerName} exited the game - ${data.reason}`;
            default:
                return type;
        }
    };

    const getSuitSymbol = (suit: string) => {
        switch (suit) {
            case 'hearts': return '♥';
            case 'diamonds': return '♦';
            case 'clubs': return '♣';
            case 'spades': return '♠';
            default: return suit;
        }
    };

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-green-900 via-green-800 to-green-900 overflow-auto" style={{ zIndex: 9999 }}>
            {/* Fixed Logo */}
            <img
                src="/header-logo.png"
                alt="200 Logo"
                className="header-logo"
            />

            {/* Game Header */}
            <div className="flex justify-between items-center p-3 bg-white/10 backdrop-blur-md border-b border-white/20 relative">
                <div className="flex items-center gap-6 header-content">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-4 text-sm text-white/80">
                            <span className="font-medium">Game Transcript</span>
                            <span>•</span>
                            <span>{transcript.metadata.scoreTarget} Points to Win</span>
                            <span>•</span>
                            <span>
                                {transcript.metadata.hasKitty ? '🐱 Kitty Play' :
                                    transcript.metadata.deckVariant === '40' ? '40 Cards (Standard)' : '36 Cards (Standard)'}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Back Button */}
                    {createPortal(
                        <button
                            onClick={onClose}
                            className="fixed top-2 right-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all text-sm font-medium"
                            style={{ zIndex: 10001 }}
                            title="Back to Transcript List"
                        >
                            ← Back to List
                        </button>,
                        document.body
                    )}
                </div>
            </div>
            <br />

            {/* Table Center */}
            <div className="game-table relative w-full m-6">
                {/* All Players */}
                {currentGame.players!.map(player => {
                    const position = getPlayerPosition(player);
                    const visualPosition = getVisualPosition(player);

                    const positionStyles: { [key: string]: any } = {
                        'top': { top: '16px', left: '50%', transform: 'translateX(-50%)' },
                        'right': { right: '16px', top: '50%', transform: 'translateY(-50%)' },
                        'bottom': { bottom: '16px', left: '50%', transform: 'translateX(-50%)' },
                        'left': { left: '16px', top: '50%', transform: 'translateY(-50%)' }
                    };

                    const appliedStyle = positionStyles[visualPosition] || positionStyles['top'];
                    const isCurrentPlayer = player.id === currentGame.currentPlayer;

                    const isTeam1 = player.position === 0 || player.position === 2;
                    const teamBgColor = isTeam1 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)';
                    const teamBorderColor = isTeam1 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)';
                    const teamGlowColor = isTeam1 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)';

                    return (
                        <div
                            key={player.id}
                            className="absolute"
                            style={{
                                ...appliedStyle,
                                backgroundColor: isCurrentPlayer ? 'rgba(251, 191, 36, 0.3)' : teamBgColor,
                                border: isCurrentPlayer ? '2px solid rgba(251, 191, 36, 0.8)' : `2px solid ${teamBorderColor}`,
                                zIndex: 10,
                                minWidth: '120px',
                                padding: '8px',
                                borderRadius: '8px',
                                backdropFilter: 'blur(4px)',
                                boxShadow: isCurrentPlayer ? '0 0 20px rgba(251, 191, 36, 0.4), 0 0 40px rgba(251, 191, 36, 0.2)' : `0 0 20px ${teamGlowColor}, 0 0 40px ${teamGlowColor.replace('0.4', '0.2')}`,
                                transition: 'all 0.3s ease'
                            }}
                            data-position={position}
                            data-player-id={player.id}
                        >
                            <div className={`player-info ${position}`}>
                                <div className="text-white font-medium mb-1">
                                    {player.name} {player.isBot && '🤖'} ({position})
                                </div>

                                {currentGame.currentBid && currentGame.currentBid.playerId === player.id && (
                                    <div className="text-yellow-300 text-xs font-bold mb-1">
                                        Bid: {currentGame.currentBid.points}
                                    </div>
                                )}
                            </div>

                            <div style={{ height: '0.5em' }} />

                            <div className="flex justify-center mt-2 gap-1">
                                {player.cards.map((_, index) => (
                                    <div
                                        key={index}
                                        className="w-4 h-6 bg-white/20 rounded border border-white/30"
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}

                {/* Trick Area */}
                <TrickArea
                    trick={currentGame.currentTrick!}
                    players={currentGame.players!}
                    trumpSuit={currentGame.trumpSuit!}
                    currentPlayerId={null}
                >
                    <div />
                </TrickArea>

                {/* Center Phase Display */}
                {currentGame.phase === 'kitty' && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0">
                        <div className="text-center">
                            <div className="text-[4rem]" style={{ filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.3))' }}>
                                🐱
                            </div>
                            <div className="text-white text-lg font-semibold mt-2">Kitty Phase</div>
                        </div>
                    </div>
                )}

                {currentGame.trumpSuit && currentGame.phase === 'playing' && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0">
                        <div className="text-center">
                            <div
                                className="text-[4rem]"
                                style={{
                                    color: currentGame.trumpSuit === 'hearts' || currentGame.trumpSuit === 'diamonds' ? '#dc2626' : '#1f2937',
                                    textShadow: currentGame.trumpSuit === 'hearts' || currentGame.trumpSuit === 'diamonds'
                                        ? '2px 2px 8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(220, 38, 38, 0.3)'
                                        : '0 0 25px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.5)'
                                }}
                            >
                                {currentGame.trumpSuit === 'hearts' && '♥'}
                                {currentGame.trumpSuit === 'diamonds' && '♦'}
                                {currentGame.trumpSuit === 'clubs' && '♣'}
                                {currentGame.trumpSuit === 'spades' && '♠'}
                            </div>
                        </div>
                    </div>
                )}

                {/* Kitty Area */}
                <KittyArea
                    kittyDiscards={currentGame.kittyDiscards}
                    showKittyDiscards={currentGame.kittyDiscards && currentGame.kittyDiscards.length > 0}
                    contractorTeam={currentGame.contractorTeam}
                    hasKitty={transcript.metadata.hasKitty}
                />
            </div>

            {/* Game Information Display */}
            <div className="fixed bottom-20 left-0 right-0 p-4">
                <GameInfo
                    teamScores={currentGame.teamScores!}
                    completedRoundResults={undefined}
                    showGlowEffect={false}
                    roundScores={currentGame.roundScores || { team1: 0, team2: 0 }}
                    currentBid={currentGame.currentBid}
                    contractorTeam={currentGame.contractorTeam}
                    round={currentGame.round!}
                    gamePhase={currentGame.phase!}
                />
            </div>

            {/* Timeline Controls */}
            <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent backdrop-blur-md border-t border-white/20 p-4">
                <div className="max-w-6xl mx-auto">
                    {/* Action Description */}
                    <div className="text-center text-white text-sm mb-2">
                        <div className="font-semibold">{getActionDescription(currentEntry)}</div>
                        <div className="text-white/60 text-xs mt-1">{formatTimestamp(currentEntry.timestamp)}</div>
                    </div>

                    {/* Timeline Slider */}
                    <div className="flex items-center gap-4">
                        <button
                            onClick={handlePrevious}
                            disabled={currentEntryIndex === 0}
                            className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            ⏮
                        </button>

                        <button
                            onClick={togglePlayPause}
                            className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 rounded-lg text-green-300 hover:text-green-200 transition-all font-medium"
                        >
                            {isPlaying ? '⏸ Pause' : '▶ Play'}
                        </button>

                        <button
                            onClick={handleNext}
                            disabled={currentEntryIndex >= transcript.entries.length - 1}
                            className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            ⏭
                        </button>

                        <div className="flex-1 flex items-center gap-2">
                            <span className="text-white/60 text-xs whitespace-nowrap">{currentEntryIndex + 1}</span>
                            <input
                                type="range"
                                min="0"
                                max={transcript.entries.length - 1}
                                value={currentEntryIndex}
                                onChange={handleSliderChange}
                                className="flex-1 h-2 bg-white/20 rounded-lg appearance-none cursor-pointer transcript-slider"
                            />
                            <span className="text-white/60 text-xs whitespace-nowrap">{transcript.entries.length}</span>
                        </div>

                        <select
                            value={playbackSpeed}
                            onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                            className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-white/40"
                        >
                            <option value="0.5">0.5x</option>
                            <option value="1">1x</option>
                            <option value="2">2x</option>
                            <option value="4">4x</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* CSS for custom slider */}
            <style>{`
                .transcript-slider::-webkit-slider-thumb {
                    appearance: none;
                    width: 16px;
                    height: 16px;
                    background: #3b82f6;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
                }

                .transcript-slider::-moz-range-thumb {
                    width: 16px;
                    height: 16px;
                    background: #3b82f6;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 0 10px rgba(59, 130, 246, 0.5);
                    border: none;
                }
            `}</style>
        </div>
    );
};

export default GameTranscriptView;

