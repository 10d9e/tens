import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { Card as CardType } from '../types/game';
import { logger } from '../utils/logging';

interface TrickAreaProps {
    trick: { cards: { card: CardType; playerId: string }[] };
    players: any[];
    trumpSuit: string;
    currentPlayerId: string | null;
    children?: React.ReactNode;
}

const TrickArea: React.FC<TrickAreaProps> = ({ trick, players, currentPlayerId, children }) => {
    // Debug logging
    logger.debug('TrickArea render - trick.cards:', trick.cards);
    logger.debug('TrickArea render - trick.cards.length:', trick.cards.length);

    const getCardPosition = (_index: number, playerId: string) => {
        // Find the card player
        const cardPlayer = players.find(p => p.id === playerId);
        if (!cardPlayer) return { x: 0, y: 0 };

        // If currentPlayerId is null (spectator mode), use fixed orientation
        if (!currentPlayerId) {
            // Fixed spectator orientation: North at top, East at right, South at bottom, West at left
            const positions = [
                { x: 0, y: -120 },    // North (position 0)
                { x: 120, y: 0 },     // East (position 1)
                { x: 0, y: 120 },     // South (position 2)
                { x: -120, y: 0 }     // West (position 3)
            ];
            return positions[cardPlayer.position] || { x: 0, y: 0 };
        }

        // Find the current player for normal game mode
        const currentPlayer = players.find(p => p.id === currentPlayerId);
        if (!currentPlayer) return { x: 0, y: 0 };

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




            {/* Render children (like ShuffleAnimation) */}
            {children}
        </div>
    );
};

export default TrickArea;
