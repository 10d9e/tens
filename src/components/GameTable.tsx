import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore, playBidTurnSound } from '../store/socketStore';
import PlayerHand from './PlayerHand';
import TrickArea from './TrickArea';
import BidInterface from './BidInterface';
import KittyInterface from './KittyInterface';
import RoundNotepad from './RoundNotepad';
import KittyArea from './KittyArea';
import BellAnimation from './BellAnimation';
import ShuffleAnimation from './ShuffleAnimation';
import { Card as CardType } from '../types/game';
import { canPlayCard } from '../utils/gameLogic';

const GameTable: React.FC = () => {
    const {
        currentGame,
        currentTable,
        currentPlayer,
        isBidding,
        selectedCard,
        bellAnimation,
        completedRoundResults,
        showShuffleAnimation,
        showGlowEffect,
        gameEndedByExit,
        setSelectedCard,
        setIsBidding
    } = useGameStore();

    const { makeBid, playCard, exitGame } = useSocketStore();
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [lastPlayedSecond, setLastPlayedSecond] = useState<number | null>(null);
    const [showExitDialog, setShowExitDialog] = useState(false);
    const [showKittyInterface, setShowKittyInterface] = useState(false);

    // Automatically open bid dialog when it's the player's turn to bid
    useEffect(() => {
        if (currentGame && currentPlayer && currentGame.currentPlayer === currentPlayer.id && currentGame.phase === 'bidding' && !isBidding) {
            setIsBidding(true);
            // Play sound effect when it's the player's turn to bid
            playBidTurnSound();
        }
    }, [currentGame, currentPlayer, isBidding, setIsBidding]);

    // Reset kitty interface when phase changes away from kitty
    useEffect(() => {
        if (currentGame && currentGame.phase !== 'kitty' && showKittyInterface) {
            console.log('Resetting kitty interface - phase changed to:', currentGame.phase);
            setShowKittyInterface(false);
        }
    }, [currentGame?.phase, showKittyInterface]);

    // Automatically open kitty interface when it's the player's turn in kitty phase
    useEffect(() => {
        console.log('Kitty phase check:', {
            currentGame: !!currentGame,
            currentPlayer: !!currentPlayer,
            isMyTurn: currentGame?.currentPlayer === currentPlayer?.id,
            phase: currentGame?.phase,
            showKittyInterface,
            hasKitty: currentGame?.hasKitty,
            kittyLength: currentGame?.kitty?.length,
            round: currentGame?.round,
            deckVariant: currentGame?.deckVariant
        });

        if (currentGame && currentPlayer && currentGame.currentPlayer === currentPlayer.id && currentGame.phase === 'kitty' && !showKittyInterface) {
            console.log('Opening kitty interface for player:', currentPlayer.name, 'round:', currentGame.round);
            setShowKittyInterface(true);
        }
    }, [currentGame, currentPlayer, showKittyInterface]);

    // Countdown timer effect
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

                    // Play tick sound for last 5 seconds
                    if (seconds <= 5 && seconds > 0 && seconds !== lastPlayedSecond) {
                        // Create a simple beep sound using Web Audio API
                        try {
                            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                            const oscillator = audioContext.createOscillator();
                            const gainNode = audioContext.createGain();

                            oscillator.connect(gainNode);
                            gainNode.connect(audioContext.destination);

                            oscillator.frequency.setValueAtTime(800, audioContext.currentTime); // Higher pitch for urgency
                            oscillator.type = 'sine';

                            gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
                            gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

                            oscillator.start(audioContext.currentTime);
                            oscillator.stop(audioContext.currentTime + 0.1);

                            setLastPlayedSecond(seconds);
                        } catch (error) {
                            console.log('Audio not available:', error);
                        }
                    }
                } else {
                    setTimeRemaining(null);
                    setLastPlayedSecond(null);
                }
            };

            updateTimer(); // Initial update
            interval = setInterval(updateTimer, 1000); // Update every second
        } else {
            setTimeRemaining(null);
        }

        return () => {
            if (interval) {
                clearInterval(interval);
            }
        };
    }, [currentGame?.currentPlayer, currentGame?.playerTurnStartTime, currentGame?.timeoutDuration]);

    // Early returns after all hooks
    if (!currentGame || !currentPlayer) {
        return <div>Loading game...</div>;
    }

    const isMyTurn = currentPlayer.id === currentGame.currentPlayer;
    const myPlayer = currentGame.players.find(p => p.id === currentPlayer.id);

    // Don't render if we don't have a valid player
    if (!myPlayer) {
        return <div>Loading player data...</div>;
    }

    const handleCardClick = (card: CardType) => {
        if (!isMyTurn || currentGame.phase !== 'playing') return;

        // Check if the human player has already played a card in the current trick
        const hasPlayedInCurrentTrick = currentGame.currentTrick.cards.some(trickCard => trickCard.playerId === currentPlayer.id);
        if (hasPlayedInCurrentTrick) return;

        // Check if the card is playable
        const leadSuit = currentGame.currentTrick.cards.length > 0 ? currentGame.currentTrick.cards[0].card.suit : null;
        const isPlayable = canPlayCard(card, leadSuit as any, currentGame.trumpSuit!, myPlayer?.cards || []);

        if (isPlayable) {
            setSelectedCard(card.id);
        }
    };

    const handlePlayCard = () => {
        if (!selectedCard || !isMyTurn || currentGame.phase !== 'playing') return;

        // Check if the human player has already played a card in the current trick
        const hasPlayedInCurrentTrick = currentGame.currentTrick.cards.some(trickCard => trickCard.playerId === currentPlayer.id);
        if (hasPlayedInCurrentTrick) return;

        const card = myPlayer?.cards.find(c => c.id === selectedCard);
        if (card) {
            playCard(currentGame.id, card);
            setSelectedCard(null);
        }
    };

    const handleCardDoubleClick = (card: CardType) => {
        if (!isMyTurn || currentGame.phase !== 'playing') return;

        // Check if the human player has already played a card in the current trick
        const hasPlayedInCurrentTrick = currentGame.currentTrick.cards.some(trickCard => trickCard.playerId === currentPlayer.id);
        if (hasPlayedInCurrentTrick) return;

        // Check if the card is playable
        const leadSuit = currentGame.currentTrick.cards.length > 0 ? currentGame.currentTrick.cards[0].card.suit : null;
        const isPlayable = canPlayCard(card, leadSuit as any, currentGame.trumpSuit!, myPlayer?.cards || []);

        if (isPlayable) {
            // Play the card immediately
            playCard(currentGame.id, card);
            setSelectedCard(null);
        }
    };

    const handleBid = (points: number, suit?: string) => {
        if (!isMyTurn || currentGame.phase !== 'bidding') return;

        makeBid(currentGame.id, points, suit);
        // Always close the dialog after making a bid (whether bid or pass)
        setIsBidding(false);
    };

    const handleExitGame = () => {
        if (!currentGame || !currentPlayer) return;

        // Show confirmation dialog
        setShowExitDialog(true);
    };

    const confirmExitGame = () => {
        if (!currentGame || !currentPlayer) return;

        exitGame(currentGame.id, currentPlayer.name);
        setShowExitDialog(false);
    };

    const cancelExitGame = () => {
        setShowExitDialog(false);
    };


    const getPlayerPosition = (player: any) => {
        // Map position numbers to position names
        const positionMap: { [key: number]: string } = {
            0: 'north',   // North
            1: 'east',    // East  
            2: 'south',   // South (human player - should not be in otherPlayers)
            3: 'west'     // West
        };
        return positionMap[player.position] || 'north';
    };

    const getVisualPosition = (player: any) => {
        // Always orient from the current player's perspective
        // Current player should always appear at 'bottom'
        const currentPlayerPos = currentPlayer.position;
        const playerPos = player.position;

        // Calculate relative position from current player's perspective
        const relativePos = (playerPos - currentPlayerPos + 4) % 4;

        // Map to visual positions (current player = bottom)
        // Looking at the table from current player's perspective:
        // Current player is at bottom, so relative positions are:
        const visualMap: { [key: number]: string } = {
            0: 'bottom',  // Current player (always bottom)
            1: 'left',    // To the left of current player (counter-clockwise)
            2: 'top',     // Opposite of current player
            3: 'right'    // To the right of current player (clockwise)
        };

        return visualMap[relativePos] || 'bottom';
    };

    const getTeamScore = (team: 'team1' | 'team2') => {
        return currentGame.teamScores[team];
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900">
            {/* Game Header */}
            <div className="flex justify-between items-center p-2 bg-white/10 backdrop-blur-md border-b border-white/20">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <h2 className="text-2xl font-bold text-white">🎴 200</h2>
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
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Username with emoji */}
                    <div className="text-white text-right">
                        🃏 {currentPlayer.name} (position: {getPlayerPosition(currentPlayer)})
                    </div>
                    {/* Exit Game Button */}
                    <button
                        onClick={handleExitGame}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg text-red-300 hover:text-red-200 transition-all text-sm font-medium"
                        title="Exit Game"
                    >
                        🚪 Exit Game
                    </button>

                </div>
            </div>
            <br />
            {/* Table Center */}
            <div className="game-table relative w-full m-6">
                {/* All Players (including human player) */}
                {currentGame.players.map(player => {
                    const position = getPlayerPosition(player);
                    const visualPosition = getVisualPosition(player);

                    // Use inline styles for more reliable positioning based on visual perspective
                    const positionStyles: { [key: string]: any } = {
                        'top': { top: '16px', left: '50%', transform: 'translateX(-50%)' },
                        'right': { right: '16px', top: '50%', transform: 'translateY(-50%)' },
                        'bottom': { bottom: '16px', left: '50%', transform: 'translateX(-50%)' },
                        'left': { left: '16px', top: '50%', transform: 'translateY(-50%)' }
                    };

                    const appliedStyle = positionStyles[visualPosition] || positionStyles['bottom'];

                    const isCurrentPlayer = player.id === currentGame.currentPlayer;
                    const isHumanPlayer = player.id === currentPlayer.id;

                    // Determine team based on position (North & South = Team 1, East & West = Team 2)
                    const isTeam1 = player.position === 0 || player.position === 2; // North or South
                    const teamBgColor = isTeam1 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(59, 130, 246, 0.3)';
                    const teamBorderColor = isTeam1 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(59, 130, 246, 0.8)';
                    const teamGlowColor = isTeam1 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(59, 130, 246, 0.4)';

                    return (
                        <div
                            key={player.id}
                            className="absolute"
                            style={{
                                ...appliedStyle, // Apply position-specific styles
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
                                    {player.name} {player.isBot && '🤖'} {isHumanPlayer && '👤'} ({position})
                                </div>

                                {/* Countdown timer positioned below/above player box */}
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

                                {/* Dealer marker positioned outside the player box */}
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

                            {/* Bell animation for when this player makes a bid */}
                            <BellAnimation
                                isVisible={bellAnimation?.playerId === player.id &&
                                    (Date.now() - bellAnimation.timestamp) < 1000}
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
                    currentPlayerId={currentPlayer.id}
                >
                    <ShuffleAnimation isVisible={showShuffleAnimation} />
                </TrickArea>

                {/* Bid Interface */}
                <BidInterface
                    isOpen={isBidding && isMyTurn && currentGame.phase === 'bidding'}
                    onClose={() => setIsBidding(false)}
                    onBid={handleBid}
                    currentBid={currentGame.currentBid}
                    players={currentGame.players}
                    playerCards={myPlayer?.cards || []}
                />

                {/* Kitty Interface */}
                <KittyInterface
                    isOpen={showKittyInterface && isMyTurn && currentGame.phase === 'kitty'}
                    onClose={() => setShowKittyInterface(false)}
                    gameId={currentGame.id}
                    kitty={currentGame.kitty || []}
                    playerCards={myPlayer?.cards || []}
                    currentPlayer={currentGame.currentPlayer}
                    playerId={currentPlayer?.id || ''}
                    currentBid={currentGame.currentBid}
                    gameState={{
                        timeoutDuration: currentGame.timeoutDuration,
                        playerTurnStartTime: currentGame.playerTurnStartTime,
                        currentPlayer: currentGame.currentPlayer
                    }}
                />

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
                                {currentGame.currentPlayer === currentPlayer?.id
                                    ? "Your turn to handle kitty"
                                    : "Waiting for bid winner to handle kitty"
                                }
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
                                        ? '2px 2px 8px rgba(0, 0, 0, 0.8), 0 0 20px rgba(220, 38, 38, 0.3)' // Shadow for red suits
                                        : '0 0 25px rgba(255, 255, 255, 0.8), 0 0 40px rgba(255, 255, 255, 0.5)' // Glow for black suits
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

            {/* My Hand */}
            <div className="fixed left-0 right-0 p-1">
                <PlayerHand
                    player={myPlayer}
                    currentPlayer={currentGame.currentPlayer}
                    leadSuit={currentGame.currentTrick.cards.length > 0 ? currentGame.currentTrick.cards[0].card.suit : null}
                    trumpSuit={currentGame.trumpSuit!}
                    onCardClick={handleCardClick}
                    onCardDoubleClick={handleCardDoubleClick}
                    selectedCardId={selectedCard}
                    currentTrick={currentGame.currentTrick}
                />

                {/* Game Controls - positioned below the hand, always reserving space */}
                <div className="flex justify-center">
                    {isMyTurn && currentGame.phase === 'playing' && selectedCard && !currentGame.currentTrick.cards.some(trickCard => trickCard.playerId === currentPlayer.id) && (
                        <button
                            className="rounded-sm bg-gradient-to-r text-white font-bold shadow-lg transition-all transform hover:scale-105"
                            onClick={handlePlayCard}
                        >
                            🃏 Play Card
                        </button>
                    )}
                </div>

                {/* Game Information Display - Team Scores */}
                <div className={`team-scores-display ${showGlowEffect ? 'glow-effect' : ''}`}>
                    <div className="team-scores-header">
                        <h3>🏆 Team Scores</h3>
                    </div>

                    <div className="team-scores-content">
                        <div className="team-score-row">
                            <div className="team-score-label" style={{ color: '#ef4444' }}>
                                🔴 Team 1
                                <span className="team-position">North & South</span>
                            </div>
                            <div className="team-score-value" style={{ color: '#ef4444' }}>{getTeamScore('team1')}</div>
                        </div>

                        <div className="team-score-row">
                            <div className="team-score-label" style={{ color: '#3b82f6' }}>
                                🔵 Team 2
                                <span className="team-position">East & West</span>
                            </div>
                            <div className="team-score-value" style={{ color: '#3b82f6' }}>{getTeamScore('team2')}</div>
                        </div>
                    </div>

                    <div className="team-scores-footer">
                        <div className="team-score-status">
                            {getTeamScore('team1') > getTeamScore('team2') ? (
                                <span style={{ color: '#ef4444' }}>🔴 Team 1 leads by {getTeamScore('team1') - getTeamScore('team2')} points</span>
                            ) : getTeamScore('team2') > getTeamScore('team1') ? (
                                <span style={{ color: '#3b82f6' }}>🔵 Team 2 leads by {getTeamScore('team2') - getTeamScore('team1')} points</span>
                            ) : (
                                <span>Teams are tied!</span>
                            )}
                        </div>
                    </div>
                </div>



                {/* Round Notepad - Always visible during the game */}
                <RoundNotepad
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
                    showGlow={showGlowEffect}
                />



            </div>



            {/* Game End Overlay */}
            {currentGame.phase === 'finished' && !gameEndedByExit && (
                <motion.div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
                    style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.9)'
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <motion.div
                        className="bg-gradient-to-br from-green-900 to-green-800 rounded-2xl p-8 border-2 border-green-500 shadow-2xl max-w-md w-full mx-4 text-center"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="text-6xl mb-4">🏆</div>
                        <h2 className="text-3xl font-bold text-white mb-4">Game Over!</h2>

                        {(() => {
                            const winningTeam = currentGame.teamScores.team1 >= 200 ? 'team1' : 'team2';
                            const winningTeamName = winningTeam === 'team1' ? 'Team 1' : 'Team 2';
                            const winningPlayers = currentGame.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));
                            const teamScore = currentGame.teamScores[winningTeam];
                            const otherTeam = winningTeam === 'team1' ? 'team2' : 'team1';
                            const otherTeamScore = currentGame.teamScores[otherTeam];

                            return (
                                <>
                                    <div className="text-2xl font-bold text-green-300 mb-2">
                                        {winningTeamName} Wins!
                                    </div>
                                    <div className="text-lg text-gray-300 mb-4">
                                        Winners: {winningPlayers.map(p => p.name).join(' & ')}
                                    </div>
                                    <div className="text-xl font-semibold text-white mb-6">
                                        Final Score: {teamScore} - {otherTeamScore}
                                    </div>
                                </>
                            );
                        })()}

                        <div className="text-sm text-gray-400 mb-6">
                            Thanks for playing! 🎉
                        </div>

                        <button
                            className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105"
                            onClick={() => {
                                // When game is finished, directly clear the game state instead of trying to leave table
                                // (player might already be removed from table by server)
                                const gameStore = useGameStore.getState();
                                const socketStore = useSocketStore.getState();

                                // Store player name before clearing
                                const playerName = gameStore.currentPlayer?.name;

                                gameStore.setCurrentGame(null);
                                gameStore.setCurrentTable(null);
                                gameStore.setCurrentPlayer(null);

                                // Also clear any bidding state
                                gameStore.setIsBidding(false);
                                gameStore.setSelectedCard(null);

                                // Request fresh lobby data
                                if (socketStore.socket && playerName) {
                                    socketStore.socket.emit('join_lobby', { playerName });
                                }
                            }}
                        >
                            🏠 Exit to Lobby
                        </button>
                    </motion.div>
                </motion.div>
            )}

            {/* Exit Game Confirmation Dialog */}
            {showExitDialog && (
                <motion.div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
                    style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.9)'
                    }}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                >
                    <motion.div
                        className="bg-gradient-to-br from-red-900 to-red-800 rounded-2xl p-8 border-2 border-red-500 shadow-2xl max-w-md w-full mx-4 text-center"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ duration: 0.3 }}
                    >
                        <div className="text-6xl mb-4">⚠️</div>
                        <h2 className="text-3xl font-bold text-white mb-4">Exit Game?</h2>
                        <p className="text-lg text-red-200 mb-6">
                            This will end the game for all players and return everyone to the lobby.
                        </p>
                        <p className="text-sm text-red-300 mb-8">
                            Are you sure you want to exit?
                        </p>

                        <div className="flex gap-4 justify-center">
                            <button
                                onClick={cancelExitGame}
                                className="px-6 py-3 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmExitGame}
                                className="px-6 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105"
                            >
                                Exit Game
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
};

export default GameTable;
