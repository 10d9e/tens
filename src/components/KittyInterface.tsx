import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSocketStore } from '../store/socketStore';
import { Card as CardType } from '../types/game';
import Card from './Card';

interface KittyInterfaceProps {
    isOpen: boolean;
    onClose: () => void;
    gameId: string;
    kitty: CardType[];
    playerCards: CardType[];
    currentPlayer: string;
    playerId: string;
    currentBid?: { points: number; suit?: string };
    gameState?: {
        timeoutDuration?: number;
        playerTurnStartTime?: { [playerId: string]: number };
        currentPlayer?: string;
    };
}

const KittyInterface: React.FC<KittyInterfaceProps> = ({
    isOpen,
    onClose,
    gameId,
    kitty,
    playerCards,
    currentPlayer,
    playerId,
    currentBid,
    gameState
}) => {
    const { takeKitty, discardToKitty } = useSocketStore();
    const [hasTakenKitty, setHasTakenKitty] = useState(false);
    const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
    const [allCards, setAllCards] = useState<CardType[]>([]);
    const [selectedTrump, setSelectedTrump] = useState<string>(currentBid?.suit || '');
    const [kittyCardIds, setKittyCardIds] = useState<Set<string>>(new Set());
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

    useEffect(() => {
        console.log('KittyInterface effect:', {
            isOpen,
            hasTakenKitty,
            kittyLength: kitty.length,
            playerCardsLength: playerCards.length,
            gameId,
            currentPlayer,
            playerId
        });

        if (isOpen && !hasTakenKitty && kitty.length > 0) {
            console.log('Auto-taking kitty for player:', playerId);
            // Auto-take kitty when interface opens
            takeKitty(gameId);
            setHasTakenKitty(true);
            setAllCards([...playerCards, ...kitty]);
            setKittyCardIds(new Set(kitty.map(card => card.id)));
        }
    }, [isOpen, hasTakenKitty, kitty, playerCards, gameId, takeKitty]);

    // Reset state when interface closes
    useEffect(() => {
        if (!isOpen) {
            console.log('KittyInterface closed - resetting state');
            setHasTakenKitty(false);
            setSelectedCards([]);
            setAllCards([]);
            setKittyCardIds(new Set());
        }
    }, [isOpen]);

    useEffect(() => {
        if (currentBid?.suit) {
            setSelectedTrump(currentBid.suit);
        }
    }, [currentBid?.suit]);

    useEffect(() => {
        if (isOpen && hasTakenKitty) {
            setAllCards([...playerCards, ...kitty]);
        }
    }, [isOpen, hasTakenKitty, playerCards, kitty]);

    // Countdown timer effect - similar to GameTable implementation
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isOpen && currentPlayer === playerId) {
            const updateTimer = () => {
                const currentPlayerId = gameState?.currentPlayer || playerId;
                const turnStartTime = gameState?.playerTurnStartTime?.[currentPlayerId];
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
    }, [isOpen, currentPlayer, playerId, gameState?.timeoutDuration, gameState?.playerTurnStartTime, gameState?.currentPlayer]);

    const handleCardSelect = (card: CardType) => {
        if (selectedCards.length >= 4) {
            if (selectedCards.some(c => c.id === card.id)) {
                // Deselect card
                setSelectedCards(selectedCards.filter(c => c.id !== card.id));
            }
            return;
        }

        if (selectedCards.some(c => c.id === card.id)) {
            // Deselect card
            setSelectedCards(selectedCards.filter(c => c.id !== card.id));
        } else {
            // Select card
            setSelectedCards([...selectedCards, card]);
        }
    };

    const handleDiscard = () => {
        if (selectedCards.length === 4 && selectedTrump) {
            discardToKitty(gameId, selectedCards, selectedTrump);
            onClose();
        }
    };

    const getSuitSymbol = (suit: string) => {
        const symbols = {
            'hearts': '♥',
            'diamonds': '♦',
            'clubs': '♣',
            'spades': '♠'
        };
        return symbols[suit as keyof typeof symbols] || suit;
    };

    const getSuitColor = (suit: string) => {
        return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-black';
    };

    const getCardValue = (card: CardType) => {
        const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
        return values[card.rank as keyof typeof values] || 0;
    };

    // Organize cards by suit into 4 rows, each ordered by face value (5,6,7,8,9,10,J,Q,K,A)
    const organizeCardsBySuit = (cards: CardType[]) => {
        const suits = ['hearts', 'clubs', 'diamonds', 'spades'] as const;

        // Group cards by suit
        const cardsBySuit: { [key: string]: CardType[] } = {};
        suits.forEach(suit => {
            cardsBySuit[suit] = cards.filter(card => card.suit === suit);
        });

        // Sort each suit by face value in order: 5,6,7,8,9,10,J,Q,K,A
        suits.forEach(suit => {
            cardsBySuit[suit].sort((a, b) => {
                const faceOrder = { '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
                const rankA = faceOrder[a.rank as keyof typeof faceOrder];
                const rankB = faceOrder[b.rank as keyof typeof faceOrder];

                return rankA - rankB;
            });
        });

        // Return array of suit arrays in order
        return suits.map(suit => cardsBySuit[suit]);
    };

    // Legacy sort function for kitty display (keep existing behavior)
    const sortCards = (cards: CardType[]) => {
        return [...cards].sort((a, b) => {
            // Define suit order (hearts, clubs, diamonds, spades)
            const suitOrder = { hearts: 0, clubs: 1, diamonds: 2, spades: 3 };
            const suitA = suitOrder[a.suit as keyof typeof suitOrder];
            const suitB = suitOrder[b.suit as keyof typeof suitOrder];

            if (suitA !== suitB) {
                return suitA - suitB;
            }

            // Within same suit, sort by rank
            const rankOrder = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '5': 5 };
            const rankA = rankOrder[a.rank as keyof typeof rankOrder];
            const rankB = rankOrder[b.rank as keyof typeof rankOrder];

            return rankA - rankB;
        });
    };

    if (!isOpen || currentPlayer !== playerId) return null;

    return (
        <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
        >
            <motion.div
                className="bg-gradient-to-br from-green-900 via-green-800 to-green-900 rounded-xl p-8 border border-green-400 shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto relative"
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
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

                <div className="text-center mb-6">
                    <h2 className="text-3xl font-bold text-white mb-2">🐱 Kitty Phase</h2>
                    <p className="text-green-200">
                        {!hasTakenKitty
                            ? "Take the kitty cards and then discard 4 cards back to the kitty."
                            : "Select 4 cards to discard to the kitty. These cards' points will go to the defending team."
                        }
                    </p>
                </div>

                {!hasTakenKitty && (
                    <div className="text-center mb-6">
                        <div className="text-white text-lg mb-4">Kitty Cards:</div>
                        <div className="flex justify-center gap-2 mb-4">
                            {sortCards(kitty).map((card) => (
                                <Card
                                    key={card.id}
                                    card={card}
                                    size="tiny"
                                    isPlayable={false}
                                />
                            ))}
                        </div>
                        <p className="text-green-200 text-sm">
                            Click "Take Kitty" to add these cards to your hand
                        </p>
                    </div>
                )}

                {hasTakenKitty && (
                    <div className="space-y-6">
                        <div className="text-center">
                            <div className="text-white text-lg mb-4">Your Hand - Select 4 Cards to Discard:</div>
                            <div className="text-green-200 text-sm mb-4">
                                Selected: {selectedCards.length}/4 cards
                            </div>
                        </div>

                        <div className="flex flex-col gap-3 justify-center max-w-4xl mx-auto">
                            {organizeCardsBySuit(allCards).map((suitCards) => {
                                if (suitCards.length === 0) return null;

                                return (
                                    <div key={suitCards[0].suit} className="flex justify-center gap-2 flex-wrap">
                                        {suitCards.map((card) => {
                                            const isSelected = selectedCards.some(c => c.id === card.id);
                                            const isFromKitty = kittyCardIds.has(card.id);

                                            return (
                                                <motion.div
                                                    key={card.id}
                                                    className={`relative ${isSelected ? 'z-10' : 'z-0'}`}
                                                    onClick={() => handleCardSelect(card)}
                                                    whileHover={{ scale: 1.05, y: -4 }}
                                                    whileTap={{ scale: 0.95 }}
                                                >
                                                    <Card
                                                        card={card}
                                                        size="tiny"
                                                        isPlayable={true}
                                                        className={`
                                                            ${isSelected ? 'ring-2 ring-red-500 ring-opacity-75' : ''}
                                                            ${isFromKitty ? 'ring-1 ring-blue-400 ring-opacity-60' : ''}
                                                        `}
                                                    />
                                                    {isSelected && (
                                                        <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-sm rounded-full flex items-center justify-center font-bold shadow-lg">
                                                            ✕
                                                        </div>
                                                    )}
                                                    {isFromKitty && !isSelected && (
                                                        <div className="absolute -top-1 -right-1 w-7 h-7 bg-blue-400 text-white text-sm rounded-full flex items-center justify-center font-bold shadow-lg">
                                                            🐱
                                                        </div>
                                                    )}
                                                </motion.div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>



                        <div className="text-center space-y-4">

                            <div className="text-green-200 text-sm">
                                {selectedCards.length === 4 ? (
                                    <span className="text-green-400 font-semibold">
                                        Ready to discard! The discarded cards' points will go to the defending team.
                                    </span>
                                ) : (
                                    <span>
                                        Select {4 - selectedCards.length} more card{4 - selectedCards.length !== 1 ? 's' : ''} to discard
                                    </span>
                                )}
                            </div>

                            {/* Trump Suit Selection */}
                            <div className="p-1">
                                <div className="text-white text-lg">Choose Trump Suit:</div>
                                <div className="suit-options">
                                    {['hearts', 'diamonds', 'clubs', 'spades'].map(suit => (
                                        <button
                                            key={suit}
                                            onClick={() => setSelectedTrump(suit)}
                                            className={`suit-option ${selectedTrump === suit ? 'selected' : ''} ${getSuitColor(suit)}`}
                                        >
                                            {getSuitSymbol(suit)}
                                        </button>
                                    ))}
                                </div>
                            </div>



                            <div className="flex justify-center">
                                <button
                                    onClick={handleDiscard}
                                    disabled={selectedCards.length !== 4 || !selectedTrump}
                                    className="control-button"
                                >
                                    Discard 4 Cards & Set Trump
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </motion.div>
        </motion.div>
    );
};

export default KittyInterface;
