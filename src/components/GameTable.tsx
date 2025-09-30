import React from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';
import PlayerHand from './PlayerHand';
import TrickArea from './TrickArea';
import BidInterface from './BidInterface';
import RoundNotepad from './RoundNotepad';
import { Card as CardType } from '../types/game';
import { canPlayCard } from '../utils/gameLogic';

const GameTable: React.FC = () => {
    const {
        currentGame,
        currentPlayer,
        isBidding,
        selectedCard,
        setSelectedCard,
        setIsBidding
    } = useGameStore();

    const { makeBid, playCard } = useSocketStore();

    if (!currentGame || !currentPlayer) {
        return <div>Loading game...</div>;
    }

    const isMyTurn = currentPlayer.id === currentGame.currentPlayer;
    const myPlayer = currentGame.players.find(p => p.id === currentPlayer.id);
    const otherPlayers = currentGame.players.filter(p => p.id !== currentPlayer.id);

    // Don't render if we don't have a valid player
    if (!myPlayer) {
        return <div>Loading player data...</div>;
    }

    const handleCardClick = (card: CardType) => {
        if (!isMyTurn || currentGame.phase !== 'playing') return;

        // Check if the card is playable
        const leadSuit = currentGame.currentTrick.cards.length > 0 ? currentGame.currentTrick.cards[0].card.suit : null;
        const isPlayable = canPlayCard(card, leadSuit as any, currentGame.trumpSuit!, myPlayer?.cards || []);

        if (isPlayable) {
            setSelectedCard(card.id);
        }
    };

    const handlePlayCard = () => {
        if (!selectedCard || !isMyTurn || currentGame.phase !== 'playing') return;

        const card = myPlayer?.cards.find(c => c.id === selectedCard);
        if (card) {
            playCard(currentGame.id, card);
            setSelectedCard(null);
        }
    };

    const handleBid = (points: number, suit?: string) => {
        if (!isMyTurn || currentGame.phase !== 'bidding') return;

        makeBid(currentGame.id, points, suit);
        if (points === 0) {
            setIsBidding(false);
        }
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

    const getTeamScore = (team: 'team1' | 'team2') => {
        return currentGame.teamScores[team];
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900">
            {/* Game Header */}
            <div className="flex justify-between items-center p-6 bg-white/10 backdrop-blur-md border-b border-white/20">
                <div className="flex items-center gap-6">
                    <h2 className="text-2xl font-bold text-white">🎴 Two Hundred</h2>
                    <div className="flex gap-6 text-sm">
                        <span className="px-3 py-1 bg-blue-500/30 rounded-lg text-white font-medium">
                            Team 1: {getTeamScore('team1')} points
                        </span>
                        <span className="px-3 py-1 bg-red-500/30 rounded-lg text-white font-medium">
                            Team 2: {getTeamScore('team2')} points
                        </span>
                    </div>
                </div>

            </div>

            {/* Table Center */}
            <div className="game-table relative w-full m-6">
                {/* Other Players */}
                {otherPlayers.map(player => {
                    const position = getPlayerPosition(player);
                    // Use inline styles for more reliable positioning
                    const positionStyles: { [key: string]: any } = {
                        'north': { top: '16px', left: '50%', transform: 'translateX(-50%)' },
                        'east': { right: '16px', top: '50%', transform: 'translateY(-50%)' },
                        'south': { bottom: '16px', left: '50%', transform: 'translateX(-50%)' },
                        'west': { left: '16px', top: '50%', transform: 'translateY(-50%)' }
                    };

                    const appliedStyle = positionStyles[position] || positionStyles['north'];

                    const isCurrentPlayer = player.id === currentGame.currentPlayer;

                    return (
                        <div
                            key={player.id}
                            className="absolute"
                            style={{
                                ...appliedStyle, // Apply position-specific styles
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                border: isCurrentPlayer ? '2px solid rgba(251, 191, 36, 0.8)' : '1px solid rgba(255, 255, 255, 0.2)',
                                zIndex: 10,
                                minWidth: '120px',
                                padding: '8px',
                                borderRadius: '8px',
                                backdropFilter: 'blur(4px)',
                                boxShadow: isCurrentPlayer ? '0 0 20px rgba(251, 191, 36, 0.4), 0 0 40px rgba(251, 191, 36, 0.2)' : 'none',
                                transition: 'all 0.3s ease'
                            }}
                            data-position={position}
                            data-player-id={player.id}
                        >
                            <div className={`player-info ${position}`}>
                                <div className="text-white font-medium mb-1">
                                    {player.name} {player.isBot && '🤖'} (pos: {player.position})
                                </div>
                                <div className="text-white/80 text-sm mb-1">
                                    {player.cards.length} cards
                                </div>
                                {currentGame.currentBid && currentGame.currentBid.playerId === player.id && (
                                    <div className="text-yellow-300 text-xs font-bold mb-1">
                                        Bid: {currentGame.currentBid.points}
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-center mt-2 gap-1">
                                {player.cards.map((_, index) => (
                                    <div
                                        key={index}
                                        className="w-3 h-4 bg-white/20 rounded border border-white/30"
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
                />

                {/* Center Trump Suit Display */}
                {currentGame.trumpSuit && currentGame.phase === 'playing' && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                        <div className="text-center">
                            <div
                                className="text-[2rem]"
                                style={{
                                    color: currentGame.trumpSuit === 'hearts' || currentGame.trumpSuit === 'diamonds' ? '#dc2626' : '#1f2937'
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

                {/* Game Information Display */}
                <div className="absolute top-4 left-4 right-4 flex justify-between gap-4">
                    {/* Trump Suit Display */}
                    {currentGame.trumpSuit && (
                        <div className="game-info bg-yellow-500/20 border-yellow-400/50">
                            <div className={`text-4xl ${currentGame.trumpSuit === 'hearts' || currentGame.trumpSuit === 'diamonds' ? 'text-red-600' : 'text-black'}`}>
                                {currentGame.trumpSuit === 'hearts' && '♥'}
                                {currentGame.trumpSuit === 'diamonds' && '♦'}
                                {currentGame.trumpSuit === 'clubs' && '♣'}
                                {currentGame.trumpSuit === 'spades' && '♠'}
                            </div>
                        </div>
                    )}

                    {/* Current Bid Display */}
                    {currentGame.currentBid && (
                        <div className="game-info">
                            <div className="text-xs text-white/80 mb-1">Current Bid</div>
                            <div className="text-xl font-bold text-white">
                                {currentGame.currentBid.points} points
                            </div>
                            {currentGame.currentBid.suit && (
                                <div className="text-xs text-white/80">
                                    Trump: {currentGame.currentBid.suit}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* My Hand */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-green-900/90 to-transparent backdrop-blur-sm">
                <PlayerHand
                    player={myPlayer}
                    currentPlayer={currentGame.currentPlayer}
                    leadSuit={currentGame.currentTrick.cards.length > 0 ? currentGame.currentTrick.cards[0].card.suit : null}
                    trumpSuit={currentGame.trumpSuit!}
                    onCardClick={handleCardClick}
                    selectedCardId={selectedCard}
                    isCurrentPlayer={isMyTurn}
                />
            </div>

            {/* Game Controls */}
            {isMyTurn && (
                <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-10">
                    {currentGame.phase === 'bidding' && (
                        <button
                            className="px-8 py-3 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105"
                            onClick={() => setIsBidding(true)}
                        >
                            🎲 Make Bid
                        </button>
                    )}

                    {currentGame.phase === 'playing' && selectedCard && (
                        <button
                            className="px-8 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-bold rounded-xl shadow-lg transition-all transform hover:scale-105"
                            onClick={handlePlayCard}
                        >
                            🃏 Play Card
                        </button>
                    )}
                </div>
            )}

            {/* Bid Interface */}
            <BidInterface
                isOpen={isBidding && isMyTurn && currentGame.phase === 'bidding'}
                onClose={() => setIsBidding(false)}
                onBid={handleBid}
                currentBid={currentGame.currentBid?.points}
                playerCards={myPlayer?.cards || []}
            />


            {/* Round Notepad */}
            {currentGame.phase === 'playing' && (
                <RoundNotepad
                    roundScores={currentGame.roundScores || { team1: 0, team2: 0 }}
                    currentBid={currentGame.currentBid}
                    contractorTeam={currentGame.contractorTeam}
                    round={currentGame.round}
                />
            )}

            {/* Game End Overlay */}
            {currentGame.phase === 'finished' && (
                <motion.div
                    className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
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

                        <div className="text-sm text-gray-400">
                            Thanks for playing! 🎉
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </div>
    );
};

export default GameTable;
