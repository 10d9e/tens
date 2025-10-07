import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Suit } from '../types/game';

interface BidInterfaceProps {
    isOpen: boolean;
    onClose: () => void;
    onBid: (points: number, suit?: Suit) => void;
    currentBid?: {
        points: number;
        playerId: string;
        suit?: Suit;
    };
    players: any[];
    playerCards: any[];
    playersWhoHavePassed?: string[];
    gameState?: {
        timeoutDuration?: number;
        playerTurnStartTime?: { [playerId: string]: number };
        currentPlayer?: string;
    };
    currentPlayerId?: string;
}

const BidInterface: React.FC<BidInterfaceProps> = ({
    isOpen,
    onClose,
    onBid,
    currentBid,
    players,
    playerCards,
    playersWhoHavePassed = [],
    gameState,
    currentPlayerId
}) => {
    const [selectedPoints, setSelectedPoints] = useState<number>(0);
    const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

    // Initialize selected points to the minimum valid bid
    useEffect(() => {
        if (isOpen) {
            const currentBidPoints = currentBid?.points || 0;
            const minBid = Math.max(50, currentBidPoints + 5);
            setSelectedPoints(minBid);
            setSelectedSuit(null);
        }
    }, [isOpen, currentBid]);

    // Countdown timer effect - similar to KittyInterface implementation
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isOpen && currentPlayerId) {
            const updateTimer = () => {
                const activePlayerId = gameState?.currentPlayer || currentPlayerId;
                const turnStartTime = gameState?.playerTurnStartTime?.[activePlayerId];
                const timeoutDuration = gameState?.timeoutDuration;

                if (turnStartTime && timeoutDuration) {
                    const elapsed = Date.now() - turnStartTime;
                    const remaining = Math.max(0, timeoutDuration - elapsed);
                    const seconds = Math.ceil(remaining / 1000);
                    setTimeRemaining(seconds);

                    if (seconds <= 0) {
                        clearInterval(interval);
                        setTimeRemaining(null);
                    }
                } else {
                    // Fallback to default 30 seconds if no game state data
                    const defaultTimeout = 30000;
                    const defaultStartTime = Date.now() - 1000; // Start 1 second ago
                    const elapsed = Date.now() - defaultStartTime;
                    const remaining = Math.max(0, defaultTimeout - elapsed);
                    const seconds = Math.ceil(remaining / 1000);
                    setTimeRemaining(seconds);

                    if (seconds <= 0) {
                        clearInterval(interval);
                        setTimeRemaining(null);
                    }
                }
            };

            // Start the timer immediately
            updateTimer();
            interval = setInterval(updateTimer, 1000);

            return () => {
                if (interval) {
                    clearInterval(interval);
                }
            };
        }
    }, [isOpen, currentPlayerId, gameState?.timeoutDuration, gameState?.playerTurnStartTime, gameState?.currentPlayer]);

    const getSuitSymbol = (suit: Suit) => {
        switch (suit) {
            case 'hearts': return '♥';
            case 'diamonds': return '♦';
            case 'clubs': return '♣';
            case 'spades': return '♠';
        }
    };

    const getSuitColor = (suit: Suit) => {
        return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-white';
    };

    const getBidderInfo = () => {
        if (!currentBid) return null;

        const bidder = players.find(p => p.id === currentBid.playerId);
        if (!bidder) return null;

        const team = bidder.position % 2 === 0 ? 'Team 1' : 'Team 2';
        const playerName = bidder.name;

        return { team, playerName };
    };

    const hasPlayerPassed = (playerId: string) => {
        return playersWhoHavePassed.includes(playerId);
    };

    const getPassedPlayers = () => {
        return players.filter(player => hasPlayerPassed(player.id));
    };

    const evaluateHand = () => {
        const values: Record<string, number> = {
            'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10,
            '9': 0, '8': 0, '7': 0, '5': 5
        };

        return playerCards.reduce((total, card) => total + (values[card.rank] || 0), 0);
    };

    const handValue = evaluateHand();
    const suggestedBid = Math.max(50, Math.min(handValue, 100));

    const handleBidSubmit = () => {
        const currentBidPoints = currentBid?.points || 0;
        if (selectedPoints > currentBidPoints) {
            // Trump suit selection is required for any bid
            if (!selectedSuit) {
                return; // Don't submit if no suit selected
            }
            onBid(selectedPoints, selectedSuit);
            onClose();
        }
    };

    const handlePass = () => {
        onBid(0);
        onClose();
    };

    const handleSliderChange = (value: number) => {
        setSelectedPoints(value);
        // Trump suit selection is always required, so don't clear it
    };

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 bg-opacity-50 flex items-center justify-center"
                style={{
                    zIndex: 50,
                    pointerEvents: 'auto'
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => {
                    // Only close if clicking on the overlay itself, not on higher z-index elements
                    if (e.target === e.currentTarget) {
                        onClose();
                    }
                }}
            >
                <motion.div
                    className="bid-interface combined relative"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Countdown Timer - Top Right Corner */}
                    {timeRemaining !== null && (
                        <div className="absolute top-4 right-4 z-10">
                            <div
                                className="flex items-center px-3 py-2 rounded-lg border-2 font-bold text-lg shadow-lg"
                                style={{
                                    color: timeRemaining <= 5 ? '#f87171' : timeRemaining <= 10 ? '#fbbf24' : '#4ade80',
                                    borderColor: timeRemaining <= 5 ? '#f87171' : timeRemaining <= 10 ? '#fbbf24' : '#4ade80',
                                    backgroundColor: timeRemaining <= 5 ? '#f8717110' : timeRemaining <= 10 ? '#fbbf2410' : '#4ade8010'
                                }}
                            >
                                ⏱️ {timeRemaining}s
                            </div>
                        </div>
                    )}

                    <h3>Make Your Bid</h3>

                    <div className="mb-4 p-3 bg-opacity-30 rounded-lg">
                        <div className="text-sm">Hand Value: {handValue} points</div>
                        <div className="text-sm">Suggested Bid: {suggestedBid} points</div>
                        {currentBid && currentBid.points > 0 && (() => {
                            const bidderInfo = getBidderInfo();
                            return (
                                <div className="text-sm text-yellow-200">
                                    Current Bid: {currentBid.points} points
                                    {bidderInfo && (
                                        <span className="text-xs text-yellow-300 ml-2">
                                            ({bidderInfo.team} - {bidderInfo.playerName})
                                        </span>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Show passed players */}
                        {getPassedPlayers().length > 0 && (
                            <div className="mt-2 text-sm text-red-200">
                                <span className="inline-flex items-center gap-1">
                                    ❌ Passed: {getPassedPlayers().map(p => p.name).join(', ')}
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Bid Amount Slider */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-white mb-2">
                            Bid Amount: {selectedPoints} points
                        </label>
                        <div className="slider-container">
                            {(() => {
                                const minBid = Math.max(50, (currentBid?.points || 0) + 5);
                                return (
                                    <>
                                        <input
                                            type="range"
                                            min={minBid}
                                            max="100"
                                            step="5"
                                            value={selectedPoints}
                                            onChange={(e) => handleSliderChange(parseInt(e.target.value))}
                                            className="bid-slider"
                                        />
                                        <div className="slider-labels">
                                            <span>{minBid}</span>
                                            <span>100</span>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>

                    {/* Trump Suit Selection - Required for all bids */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-white mb-3">
                            Select Trump Suit (Required)
                        </label>
                        <div className="suit-options">
                            {suits.map(suit => (
                                <button
                                    key={suit}
                                    className={`suit-option ${selectedSuit === suit ? 'selected' : ''} ${getSuitColor(suit)}`}
                                    onClick={() => setSelectedSuit(suit)}
                                >
                                    {getSuitSymbol(suit)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 justify-center">
                        <button
                            className="control-button"
                            onClick={handlePass}
                        >
                            Pass
                        </button>
                        <button
                            className="control-button primary"
                            onClick={handleBidSubmit}
                            disabled={selectedPoints <= (currentBid?.points || 0) || !selectedSuit}
                        >
                            {selectedSuit
                                ? `Bid ${selectedPoints} - ${getSuitSymbol(selectedSuit)}`
                                : `Bid ${selectedPoints}`
                            }
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default BidInterface;
