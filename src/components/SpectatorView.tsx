import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';
import TrickArea from './TrickArea';
import KittyArea from './KittyArea';
import BellAnimation from './BellAnimation';
import ShuffleAnimation from './ShuffleAnimation';
import TrickWinnerAnimation from './TrickWinnerAnimation';
import GameInfo from './GameInfo';
import { logger } from '../utils/logging';

// Function to play a random cat sound
function playCatSound() {
    // Check if sound is enabled
    if (!useGameStore.getState().soundEnabled) return;

    // Randomly select one of the 6 cat sounds
    const randomIndex = Math.floor(Math.random() * 6) + 1;
    const audio = new Audio(`/audio/kitty/cat-${randomIndex}.mp3`);
    audio.volume = 0.5; // Set volume to 50% to not be too loud

    // Play the audio and catch any errors
    audio.play().catch(error => {
        logger.error('Failed to play cat sound:', error);
    });
}

const SpectatorView: React.FC = () => {
    const {
        currentGame,
        currentTable,
        currentPlayer,
        bellAnimation,
        trickWinnerAnimation,
        completedRoundResults,
        showShuffleAnimation,
        showGlowEffect,
        soundEnabled,
        setSoundEnabled
    } = useGameStore();

    const { leaveTable } = useSocketStore();
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [lastPlayedSecond, setLastPlayedSecond] = useState<number | null>(null);
    const [showExitDialog, setShowExitDialog] = useState(false);
    const [previousPhase, setPreviousPhase] = useState<string | null>(null);

    // Play cat sound when kitty phase begins (for all spectators)
    useEffect(() => {
        if (currentGame && currentGame.phase === 'kitty' && previousPhase !== 'kitty') {
            logger.debug('Kitty phase started - playing cat sound for spectator');
            playCatSound();
        }
        if (currentGame) {
            setPreviousPhase(currentGame.phase);
        }
    }, [currentGame?.phase, previousPhase]);

    // Countdown timer effect (same as GameTable)
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (currentGame && currentGame.playerTurnStartTime && currentGame.timeoutDuration) {
            const updateTimer = () => {
                const currentPlayerId = currentGame.currentPlayer;
                const turnStartTime = currentGame.playerTurnStartTime?.[currentPlayerId];

                if (turnStartTime && currentGame.timeoutDuration) {
                    const elapsed = Date.now() - turnStartTime;
                    const remaining = Math.max(0, currentGame.timeoutDuration - elapsed);
                    const seconds = Math.ceil(remaining / 1000);
                    setTimeRemaining(seconds);

                    // Play tick sound for last 5 seconds (only if sound is enabled)
                    if (soundEnabled && seconds <= 5 && seconds > 0 && seconds !== lastPlayedSecond) {
                        try {
                            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                            const oscillator = audioContext.createOscillator();
                            const gainNode = audioContext.createGain();

                            oscillator.connect(gainNode);
                            gainNode.connect(audioContext.destination);

                            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                            oscillator.type = 'sine';

                            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

                            oscillator.start(audioContext.currentTime);
                            oscillator.stop(audioContext.currentTime + 0.1);

                            setLastPlayedSecond(seconds);
                        } catch (error) {
                            logger.error('Audio not available:', error);
                        }
                    }
                } else {
                    setTimeRemaining(null);
                    setLastPlayedSecond(null);
                }
            };

            updateTimer();
            interval = setInterval(updateTimer, 1000);
        } else {
            setTimeRemaining(null);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [currentGame?.currentPlayer, currentGame?.playerTurnStartTime, currentGame?.timeoutDuration, soundEnabled, lastPlayedSecond]);

    // Early returns after all hooks
    if (!currentGame || !currentPlayer) {
        return <div>Loading game...</div>;
    }

    const handleExitSpectating = () => {
        setShowExitDialog(true);
    };

    const confirmExitSpectating = () => {
        if (!currentTable || !currentPlayer) return;
        leaveTable(currentTable.id);
        setShowExitDialog(false);
    };

    const cancelExitSpectating = () => {
        setShowExitDialog(false);
    };

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
        // For spectators, we'll use a fixed orientation (North at top)
        const visualMap: { [key: number]: string } = {
            0: 'top',     // North
            1: 'right',   // East
            2: 'bottom',  // South
            3: 'left'     // West
        };
        return visualMap[player.position] || 'top';
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900">
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
                        {currentTable && (
                            <div className="flex items-center gap-4 text-sm text-white/80">
                                <span className="font-medium">{currentTable.name}</span>
                                <span>•</span>
                                <span>{currentGame?.scoreTarget || 200} Points to Win</span>
                                <span>•</span>
                                <span>
                                    {currentGame?.hasKitty ? '🐱 Kitty Play' :
                                        currentGame?.deckVariant === '40' ? '40 Cards (Standard)' : '36 Cards (Standard)'}
                                </span>
                                {currentTable?.spectators && currentTable.spectators.length > 0 && (
                                    <>
                                        <span>•</span>
                                        <span className="text-blue-300">
                                            👁️ {currentTable.spectators.length} {currentTable.spectators.length === 1 ? 'Spectator' : 'Spectators'}
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Sound Toggle Button - rendered in portal */}
                    {createPortal(
                        <button
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            className="fixed top-2 right-44 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all text-sm font-medium"
                            style={{ zIndex: 10001 }}
                            title={soundEnabled ? "Disable Sound" : "Enable Sound"}
                        >
                            {soundEnabled ? '🔊' : '🔇'} Sound
                        </button>,
                        document.body
                    )}

                    {/* Exit Spectating Button */}
                    {createPortal(
                        <button
                            onClick={handleExitSpectating}
                            className="fixed top-2 right-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg text-red-300 hover:text-red-200 transition-all text-sm font-medium"
                            style={{ zIndex: 10001 }}
                            title="Stop Spectating"
                        >
                            👁️ Stop Watching
                        </button>,
                        document.body
                    )}
                </div>
            </div>
            <br />

            {/* Table Center */}
            <div className="game-table relative w-full m-6">
                {/* All Players */}
                {currentGame.players.map(player => {
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

                    // Determine team based on position (North & South = Team 1, East & West = Team 2)
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
                                    {currentGame.phase === 'bidding' && currentGame.playersWhoHavePassed &&
                                        Array.isArray(currentGame.playersWhoHavePassed) &&
                                        currentGame.playersWhoHavePassed.includes(player.id) && (
                                            <span className="text-red-200" title="Passed">
                                                ❌
                                            </span>
                                        )}
                                </div>

                                {/* Countdown timer */}
                                {currentGame.currentPlayer === player.id && timeRemaining !== null && (
                                    <div
                                        className="absolute text-xl font-bold z-20"
                                        style={{
                                            top: '-40px',
                                            left: '50%',
                                            minWidth: '140px',
                                            transform: 'translateX(-50%)',
                                            color: timeRemaining <= 5 ? '#f87171' : timeRemaining <= 10 ? '#fbbf24' : '#4ade80'
                                        }}
                                    >
                                        ⏱️ {timeRemaining}s
                                    </div>
                                )}

                                {/* Dealer marker */}
                                {currentGame.dealer === player.id && currentGame.phase === 'bidding' && (
                                    <div
                                        className="absolute text-4xl text-orange-400 z-20"
                                        style={{
                                            [visualPosition === 'top' ? 'bottom' : visualPosition === 'bottom' ? 'top' : visualPosition === 'right' ? 'left' : 'right']: '-25px',
                                            [visualPosition === 'top' || visualPosition === 'bottom' ? 'left' : 'top']: '50%',
                                            transform: visualPosition === 'top' || visualPosition === 'bottom' ? 'translateX(-50%)' : 'translateY(-50%)'
                                        }}
                                    >
                                        🃏
                                    </div>
                                )}

                                {currentGame.currentBid && currentGame.currentBid.playerId === player.id && (
                                    <div className="text-yellow-300 text-xs font-bold mb-1">
                                        Bid: {currentGame.currentBid.points}
                                    </div>
                                )}
                            </div>

                            {/* Bell animation */}
                            <BellAnimation
                                isVisible={bellAnimation?.playerId === player.id &&
                                    (Date.now() - bellAnimation.timestamp) < 1000}
                            />

                            {/* Trick winner animation */}
                            <TrickWinnerAnimation
                                isVisible={trickWinnerAnimation?.playerId === player.id &&
                                    (Date.now() - trickWinnerAnimation.timestamp) < 3000}
                                points={currentGame.lastTrick?.points}
                            />

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
                    trick={currentGame.currentTrick}
                    players={currentGame.players}
                    trumpSuit={currentGame.trumpSuit!}
                    currentPlayerId={null} // No current player for spectators
                >
                    <ShuffleAnimation isVisible={showShuffleAnimation} />
                </TrickArea>

                {/* Center Phase Display */}
                {currentGame.phase === 'kitty' && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-0">
                        <div className="text-center">
                            <div
                                className="text-[4rem]"
                                style={{
                                    filter: 'drop-shadow(0 0 10px rgba(255, 255, 255, 0.3))'
                                }}
                            >
                                🐱
                            </div>
                            <div className="text-white text-lg font-semibold mt-2">
                                Kitty Phase
                            </div>
                            <div className="text-green-200 text-sm mt-1">
                                Waiting for bid winner to handle kitty
                            </div>
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
                    kittyDiscards={(completedRoundResults as any)?.kittyDiscards || currentGame.kittyDiscards}
                    showKittyDiscards={showGlowEffect && ((completedRoundResults as any)?.kittyDiscards || currentGame.kittyDiscards)}
                    contractorTeam={currentGame.contractorTeam}
                    hasKitty={currentGame.hasKitty}
                />
            </div>

            {/* Combined Game Information Display */}
            <div className="fixed bottom-0 left-0 right-0 p-4">
                <GameInfo
                    teamScores={currentGame.teamScores}
                    completedRoundResults={completedRoundResults}
                    showGlowEffect={showGlowEffect}
                    roundScores={
                        completedRoundResults?.roundScores ||
                        currentGame.roundScores ||
                        { team1: 0, team2: 0 }
                    }
                    currentBid={
                        completedRoundResults?.currentBid ||
                        currentGame.currentBid
                    }
                    contractorTeam={
                        completedRoundResults?.contractorTeam ||
                        currentGame.contractorTeam
                    }
                    round={
                        completedRoundResults?.round ||
                        currentGame.round
                    }
                    gamePhase={currentGame.phase}
                />
            </div>

            {/* Exit Spectating Confirmation Dialog */}
            {showExitDialog && (
                <motion.div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center"
                    style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.9)',
                        zIndex: 10002
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <motion.div
                        className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-8 border-2 border-blue-500 shadow-2xl max-w-md w-full mx-4 text-center"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="text-6xl mb-4">👁️</div>
                        <h2 className="text-3xl font-bold text-white mb-4">Stop Watching?</h2>
                        <p className="text-lg text-blue-200 mb-6">
                            This will return you to the lobby.
                        </p>
                        <p className="text-sm text-blue-300 mb-8">
                            Are you sure you want to stop watching this game?
                        </p>

                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={cancelExitSpectating}
                                className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105"
                            >
                                Continue Watching
                            </button>
                            <button
                                onClick={confirmExitSpectating}
                                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105"
                            >
                                Stop Watching
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
};

export default SpectatorView;
