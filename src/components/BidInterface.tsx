import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Suit } from '../types/game';

interface BidInterfaceProps {
    isOpen: boolean;
    onClose: () => void;
    onBid: (points: number, suit?: Suit) => void;
    currentBid?: number;
    playerCards: any[];
}

const BidInterface: React.FC<BidInterfaceProps> = ({
    isOpen,
    onClose,
    onBid,
    currentBid = 0,
    playerCards
}) => {
    const [selectedPoints, setSelectedPoints] = useState<number>(0);
    const [selectedSuit, setSelectedSuit] = useState<Suit | null>(null);
    const [showSuitSelection, setShowSuitSelection] = useState(false);

    const bidOptions = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

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

    const evaluateHand = () => {
        const values: Record<string, number> = {
            'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10,
            '9': 0, '8': 0, '7': 0, '5': 5
        };

        return playerCards.reduce((total, card) => total + (values[card.rank] || 0), 0);
    };

    const handValue = evaluateHand();
    const suggestedBid = Math.max(10, Math.min(handValue, 100));

    const handleBidSubmit = () => {
        if (selectedPoints > currentBid) {
            if (selectedPoints >= 30 && !selectedSuit) {
                setShowSuitSelection(true);
            } else {
                onBid(selectedPoints, selectedSuit || undefined);
                onClose();
            }
        }
    };

    const handlePass = () => {
        onBid(0);
        onClose();
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
                    className="bid-interface"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <h3>Make Your Bid</h3>

                    <div className="mb-4 p-3 bg-blue-900 bg-opacity-30 rounded-lg">
                        <div className="text-sm text-blue-200">Hand Value: {handValue} points</div>
                        <div className="text-sm text-blue-200">Suggested Bid: {suggestedBid} points</div>
                        {currentBid > 0 && (
                            <div className="text-sm text-yellow-200">Current Bid: {currentBid} points</div>
                        )}
                    </div>

                    {!showSuitSelection ? (
                        <>
                            <div className="bid-options">
                                {bidOptions.map(points => (
                                    <button
                                        key={points}
                                        className={`bid-option ${selectedPoints === points ? 'selected' : ''} ${points <= currentBid ? 'opacity-50 cursor-not-allowed' : ''
                                            }`}
                                        onClick={() => points > currentBid && setSelectedPoints(points)}
                                        disabled={points <= currentBid}
                                    >
                                        {points}
                                    </button>
                                ))}
                            </div>

                            <div className="flex gap-2 justify-center mt-4">
                                <button
                                    className="control-button"
                                    onClick={handlePass}
                                >
                                    Pass
                                </button>
                                <button
                                    className="control-button primary"
                                    onClick={handleBidSubmit}
                                    disabled={selectedPoints <= currentBid}
                                >
                                    Bid {selectedPoints}
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <h4 className="text-center mb-4">Select Trump Suit</h4>
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

                            <div className="flex gap-2 justify-center mt-4">
                                <button
                                    className="control-button"
                                    onClick={() => setShowSuitSelection(false)}
                                >
                                    Back
                                </button>
                                <button
                                    className="control-button primary"
                                    onClick={() => {
                                        onBid(selectedPoints, selectedSuit!);
                                        onClose();
                                    }}
                                    disabled={!selectedSuit}
                                >
                                    Bid {selectedPoints} - {getSuitSymbol(selectedSuit!)}
                                </button>
                            </div>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default BidInterface;
