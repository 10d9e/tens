import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';
import PlayerHand from './PlayerHand';
import TrickArea from './TrickArea';
import BidInterface from './BidInterface';
import ChatPanel from './ChatPanel';
import LastTrickViewer from './LastTrickViewer';
import { Card as CardType } from '../types/game';

const GameTable: React.FC = () => {
    const {
        currentGame,
        currentPlayer,
        isBidding,
        selectedCard,
        setSelectedCard,
        setIsBidding
    } = useGameStore();

    const { makeBid, playCard, sendChat } = useSocketStore();
    const [showChat, setShowChat] = useState(false);
    const [showLastTrick, setShowLastTrick] = useState(false);

    if (!currentGame || !currentPlayer) {
        return <div>Loading game...</div>;
    }

    const isMyTurn = currentPlayer.id === currentGame.currentPlayer;
    const myPlayer = currentGame.players.find(p => p.id === currentPlayer.id);
    const otherPlayers = currentGame.players.filter(p => p.id !== currentPlayer.id);

    const handleCardClick = (card: CardType) => {
        if (!isMyTurn || currentGame.phase !== 'playing') return;

        setSelectedCard(card.id);
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
        const positions = ['north', 'east', 'south', 'west'];
        return positions[player.position] || 'north';
    };

    const getTeamScore = (team: 'team1' | 'team2') => {
        return currentGame.teamScores[team];
    };

    return (
        <div className="game-table">
            {/* Game Header */}
            <div className="flex justify-between items-center p-4 bg-black bg-opacity-20">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold">Two Hundred</h2>
                    <div className="flex gap-4 text-sm">
                        <span>Team 1: {getTeamScore('team1')} points</span>
                        <span>Team 2: {getTeamScore('team2')} points</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        className="control-button"
                        onClick={() => setShowLastTrick(!showLastTrick)}
                    >
                        Last Trick
                    </button>
                    <button
                        className="control-button"
                        onClick={() => setShowChat(!showChat)}
                    >
                        Chat
                    </button>
                </div>
            </div>

            {/* Table Center */}
            <div className="table-center">
                {/* Other Players */}
                {otherPlayers.map(player => (
                    <div
                        key={player.id}
                        className={`player-area ${getPlayerPosition(player)}`}
                    >
                        <div className="player-info">
                            <div className="player-name">
                                {player.name} {player.isBot && '🤖'}
                            </div>
                            <div className="player-score">
                                {player.cards.length} cards
                            </div>
                            {player.id === currentGame.currentPlayer && (
                                <div className="text-yellow-400 text-xs">Current Turn</div>
                            )}
                        </div>

                        <div className="player-cards">
                            {player.cards.map((_, index) => (
                                <div
                                    key={index}
                                    className="w-6 h-8 bg-gray-700 rounded border border-gray-600"
                                />
                            ))}
                        </div>
                    </div>
                ))}

                {/* Trick Area */}
                <TrickArea
                    trick={currentGame.currentTrick}
                    players={currentGame.players}
                    trumpSuit={currentGame.trumpSuit!}
                />

                {/* Trump Suit Display */}
                {currentGame.trumpSuit && (
                    <div className="absolute top-4 left-4 bg-black bg-opacity-50 p-2 rounded-lg">
                        <div className="text-sm text-gray-300">Trump:</div>
                        <div className="text-2xl">
                            {currentGame.trumpSuit === 'hearts' && '♥'}
                            {currentGame.trumpSuit === 'diamonds' && '♦'}
                            {currentGame.trumpSuit === 'clubs' && '♣'}
                            {currentGame.trumpSuit === 'spades' && '♠'}
                        </div>
                    </div>
                )}

                {/* Current Bid Display */}
                {currentGame.currentBid && (
                    <div className="absolute top-4 right-4 bg-black bg-opacity-50 p-2 rounded-lg">
                        <div className="text-sm text-gray-300">Current Bid:</div>
                        <div className="text-lg font-bold">
                            {currentGame.currentBid.points} points
                        </div>
                        {currentGame.currentBid.suit && (
                            <div className="text-sm">
                                Trump: {currentGame.currentBid.suit}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* My Hand */}
            <div className="fixed bottom-0 left-0 right-0 p-4">
                <PlayerHand
                    player={myPlayer!}
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
                <div className="game-controls">
                    {currentGame.phase === 'bidding' && (
                        <button
                            className="control-button primary"
                            onClick={() => setIsBidding(true)}
                        >
                            Make Bid
                        </button>
                    )}

                    {currentGame.phase === 'playing' && selectedCard && (
                        <button
                            className="control-button primary"
                            onClick={handlePlayCard}
                        >
                            Play Card
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

            {/* Chat Panel */}
            {showChat && (
                <ChatPanel
                    onClose={() => setShowChat(false)}
                    onSendMessage={(message) => sendChat(message, currentGame.id)}
                />
            )}

            {/* Last Trick Viewer */}
            {showLastTrick && currentGame.lastTrick && (
                <LastTrickViewer
                    trick={currentGame.lastTrick}
                    players={currentGame.players}
                    onClose={() => setShowLastTrick(false)}
                />
            )}
        </div>
    );
};

export default GameTable;
