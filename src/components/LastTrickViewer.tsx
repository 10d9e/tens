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

    const getCardPosition = (playerPosition: number) => {
        // Create proper diamond layout for NESW positions with more spacing
        const positions = [
            { x: 0, y: -35 },   // North (position 0)
            { x: 35, y: 0 },    // East (position 1) 
            { x: 0, y: 35 },    // South (position 2)
            { x: -35, y: 0 }    // West (position 3)
        ];

        return positions[playerPosition] || { x: 0, y: 0 };
    };

    const winner = trick.winner ? getPlayerName(trick.winner) : 'Unknown';

    return (
        <motion.div
            className="absolute top-4 right-4 z-50"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
        >
            <motion.div
                className="bg-black bg-opacity-90 rounded-lg p-4 border border-green-500 border-opacity-30 backdrop-blur-sm max-w-xs w-full shadow-2xl"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
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
                            const position = getCardPosition(playerPosition);
                            // const isWinningCard = trick.winningCard?.id === card.id;

                            return (
                                <motion.div
                                    key={`${card.id}-${playerId}`}
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
                                    <div className="relative">
                                        <Card
                                            card={card}
                                            size="small"
                                            className="shadow-lg transition-all duration-300 opacity-80"
                                        />
                                        {/* {isWinningCard && (
                                            <div className="absolute -top-3 -right-3 bg-gradient-to-r from-yellow-400 to-yellow-500 text-black text-sm font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg border-2 border-white">
                                                ★
                                            </div>
                                        )} */}
                                    </div>
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
