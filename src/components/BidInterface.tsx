import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
}

const BidInterface: React.FC<BidInterfaceProps> = ({
    isOpen,
    onClose,
    onBid,
    currentBid,
    players,
    playerCards
}) => {
    const [selectedPoints, setSelectedPoints] = useState<number>(0);
    const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);

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

    const getSuitSymbol = (suit: Suit) => {
        switch (suit) {
            case 'hearts': return '♥';
            case 'diamonds': return '♦';
            case 'clubs': return '♣';
            case 'spades': return '♠';
        }
    };

    const getSuitColor = (suit: Suit) => {
        return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-800';
    };

    const getBidderInfo = () => {
        if (!currentBid) return null;

        const bidder = players.find(p => p.id === currentBid.playerId);
        if (!bidder) return null;

        const team = bidder.position % 2 === 0 ? 'Team 1' : 'Team 2';
        const playerName = bidder.isBot ? `Bot (${bidder.botSkill})` : bidder.name;

        return { team, playerName };
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

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
            >
                <motion.div
                    className="bid-interface combined"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3>Make Your Bid</h3>

                    <div className="mb-4 p-3 bg-blue-900 bg-opacity-30 rounded-lg">
                        <div className="text-sm text-blue-200">Hand Value: {handValue} points</div>
                        <div className="text-sm text-blue-200">Suggested Bid: {suggestedBid} points</div>
                        {currentBid && currentBid.points > 0 && (() => {
                            const bidderInfo = getBidderInfo();
                            return (
                                <div className="text-sm text-yellow-200">
                                    Current Bid: {currentBid.points} points
                                    {bidderInfo && (
                                        <span className="text-xs text-yellow-300 ml-2">
                                            ({bidderInfo.team} - {bidderInfo.playerName}
                                            {currentBid.suit && (
                                                <span className={`ml-1 ${getSuitColor(currentBid.suit)}`}>
                                                    {getSuitSymbol(currentBid.suit)}
                                                </span>
                                            )})
                                        </span>
                                    )}
                                </div>
                            );
                        })()}
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
        </AnimatePresence>
    );
};

export default BidInterface;
