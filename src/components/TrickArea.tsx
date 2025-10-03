import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { Card as CardType } from '../types/game';

interface TrickAreaProps {
    trick: { cards: { card: CardType; playerId: string }[] };
    players: any[];
    trumpSuit: string;
}

const TrickArea: React.FC<TrickAreaProps> = ({ trick, players }) => {
    // Debug logging
    console.log('TrickArea render - trick.cards:', trick.cards);
    console.log('TrickArea render - trick.cards.length:', trick.cards.length);

    const getPlayerPosition = (playerId: string) => {
        const player = players.find(p => p.id === playerId);
        if (!player) return 0;
        return player.position;
    };

    const getCardPosition = (_index: number, playerPosition: number) => {
        const positions = [
            { x: 0, y: -100 },   // North
            { x: 100, y: 0 },    // East
            { x: 0, y: 100 },    // South
            { x: -100, y: 0 }    // West
        ];

        return positions[playerPosition] || { x: 0, y: 0 };
    };


    return (
        <div className="trick-area relative">

            <AnimatePresence>
                {trick.cards.map(({ card, playerId }, index) => {
                    const playerPosition = getPlayerPosition(playerId);
                    const position = getCardPosition(index, playerPosition);

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

            {trick.cards.length === 0 && (
                <div className="text-center text-white/60">
                    <br /><br /><br />
                    <div className="text-lg font-medium">Waiting for cards...</div>
                </div>
            )}
        </div>
    );
};

export default TrickArea;
