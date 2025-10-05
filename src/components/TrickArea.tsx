import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { Card as CardType } from '../types/game';

interface TrickAreaProps {
    trick: { cards: { card: CardType; playerId: string }[] };
    players: any[];
    trumpSuit: string;
    currentPlayerId: string;
    children?: React.ReactNode;
    kittyDiscards?: CardType[];
    showKittyDiscards?: boolean;
}

const TrickArea: React.FC<TrickAreaProps> = ({ trick, players, currentPlayerId, children, kittyDiscards, showKittyDiscards }) => {
    // Debug logging
    console.log('TrickArea render - trick.cards:', trick.cards);
    console.log('TrickArea render - trick.cards.length:', trick.cards.length);


    const getCardPosition = (_index: number, playerId: string) => {
        // Find the current player and the card player
        const currentPlayer = players.find(p => p.id === currentPlayerId);
        const cardPlayer = players.find(p => p.id === playerId);

        if (!currentPlayer || !cardPlayer) return { x: 0, y: 0 };

        // Calculate relative position from current player's perspective
        const relativePos = (cardPlayer.position - currentPlayer.position + 4) % 4;

        // Map to visual positions (current player = bottom)
        const positions = [
            { x: 0, y: 120 },     // Current player (bottom)
            { x: -120, y: 0 },    // Left
            { x: 0, y: -120 },    // Top
            { x: 120, y: 0 }      // Right
        ];

        return positions[relativePos] || { x: 0, y: 0 };
    };


    return (
        <div className="trick-area relative">

            <AnimatePresence>
                {trick.cards.map(({ card, playerId }, index) => {
                    const position = getCardPosition(index, playerId);

                    return (
                        <motion.div
                            key={`${card.id}-${playerId}-${index}`}
                            className="trick-card"
                            initial={{
                                opacity: 0,
                                scale: 0.5,
                                x: 0,
                                y: 0
                            }}
                            animate={{
                                opacity: 1,
                                scale: 1,
                                x: position.x,
                                y: position.y
                            }}
                            exit={{
                                opacity: 0,
                                scale: 0.5,
                                x: 0,
                                y: 0
                            }}
                            transition={{
                                duration: 0.5,
                                ease: "easeOut"
                            }}
                            style={{
                                position: 'absolute',
                                zIndex: index + 1
                            }}
                        >
                            <Card
                                card={card}
                                size="medium"
                                className="shadow-lg"
                            />
                        </motion.div>
                    );
                })}
            </AnimatePresence>

            {/* Crest in center of trick area */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                <img
                    src="/crest.png"
                    alt="Crest"
                    className="w-80 h-80 opacity-60"
                />
            </div>

            {/* Kitty Discards Display - shown during round transition */}
            {showKittyDiscards && kittyDiscards && kittyDiscards.length > 0 && (
                <AnimatePresence>
                    <motion.div
                        className="absolute inset-0 flex items-center justify-center"
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="text-center">
                            <div className="text-white/80 text-sm mb-2 font-medium">Discarded to Kitty:</div>
                            <div className="flex justify-center gap-1">
                                {kittyDiscards.map((card, index) => (
                                    <motion.div
                                        key={card.id}
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{
                                            duration: 0.3,
                                            delay: index * 0.1
                                        }}
                                        className="relative"
                                    >
                                        <Card
                                            card={card}
                                            size="small"
                                            className="shadow-lg border-2 border-red-400"
                                        />
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            )}



            {/* Render children (like ShuffleAnimation) */}
            {children}
        </div>
    );
};

export default TrickArea;
