import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { Card as CardType } from '../types/game';

interface TrickAreaProps {
    trick: { cards: { card: CardType; playerId: string }[] };
    players: any[];
    trumpSuit: string;
}

const TrickArea: React.FC<TrickAreaProps> = ({ trick, players, trumpSuit }) => {
    const getPlayerPosition = (playerId: string) => {
        const player = players.find(p => p.id === playerId);
        if (!player) return 0;
        return player.position;
    };

    const getCardPosition = (index: number, playerPosition: number) => {
        const positions = [
            { x: -60, y: -30 }, // North
            { x: 60, y: -30 },  // East
            { x: -60, y: 30 },  // South
            { x: 60, y: 30 }    // West
        ];

        return positions[playerPosition] || { x: 0, y: 0 };
    };

    return (
        <div className="trick-area">
            <AnimatePresence>
                {trick.cards.map(({ card, playerId }, index) => {
                    const playerPosition = getPlayerPosition(playerId);
                    const position = getCardPosition(index, playerPosition);

                    return (
                        <motion.div
                            key={`${card.id}-${index}`}
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

            {trick.cards.length === 0 && (
                <div className="text-center text-gray-400">
                    <div className="text-2xl mb-2">🎴</div>
                    <div className="text-sm">Waiting for cards...</div>
                </div>
            )}
        </div>
    );
};

export default TrickArea;
