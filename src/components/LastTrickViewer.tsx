import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Card from './Card';
import { Trick, Player } from '../types/game';

interface LastTrickViewerProps {
    trick: Trick;
    players: Player[];
    onClose: () => void;
}

const LastTrickViewer: React.FC<LastTrickViewerProps> = ({ trick, players, onClose }) => {
    const getPlayerName = (playerId: string) => {
        const player = players.find(p => p.id === playerId);
        return player ? player.name : 'Unknown';
    };

    const getPlayerPosition = (playerId: string) => {
        const player = players.find(p => p.id === playerId);
        return player ? player.position : 0;
    };

    const getCardPosition = (index: number, playerPosition: number) => {
        const positions = [
            { x: -40, y: -20 }, // North
            { x: 40, y: -20 },  // East
            { x: -40, y: 20 },  // South
            { x: 40, y: 20 }    // West
        ];

        return positions[playerPosition] || { x: 0, y: 0 };
    };

    const winner = trick.winner ? getPlayerName(trick.winner) : 'Unknown';

    return (
        <motion.div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
        >
            <motion.div
                className="bg-black bg-opacity-90 rounded-lg p-6 border border-green-500 border-opacity-30 backdrop-blur-sm max-w-md w-full mx-4"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Last Trick</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition-colors"
                    >
                        ✕
                    </button>
                </div>

                <div className="text-center mb-4">
                    <div className="text-sm text-gray-300 mb-1">Winner: {winner}</div>
                    <div className="text-lg font-bold text-green-400">+{trick.points} points</div>
                </div>

                <div className="relative h-32 bg-green-900 bg-opacity-30 rounded-lg border border-green-500 border-opacity-30 flex items-center justify-center">
                    <AnimatePresence>
                        {trick.cards.map(({ card, playerId }, index) => {
                            const playerPosition = getPlayerPosition(playerId);
                            const position = getCardPosition(index, playerPosition);

                            return (
                                <motion.div
                                    key={`${card.id}-${index}`}
                                    className="absolute"
                                    initial={{
                                        opacity: 0,
                                        scale: 0.5,
                                        x: 0,
                                        y: 0
                                    }}
                                    animate={{
                                        opacity: 1,
                                        scale: 0.8,
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
                                        zIndex: index + 1
                                    }}
                                >
                                    <Card
                                        card={card}
                                        size="small"
                                        className="shadow-lg"
                                    />
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>

                    {trick.cards.length === 0 && (
                        <div className="text-center text-gray-400">
                            <div className="text-sm">No cards played</div>
                        </div>
                    )}
                </div>

                <div className="mt-4 text-sm text-gray-300">
                    <div className="flex justify-between">
                        <span>Cards played:</span>
                        <span>{trick.cards.length}/4</span>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default LastTrickViewer;
