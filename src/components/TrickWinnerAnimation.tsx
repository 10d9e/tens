import React from 'react';
import { motion } from 'framer-motion';

interface TrickWinnerAnimationProps {
    isVisible: boolean;
    points?: number;
}

const TrickWinnerAnimation: React.FC<TrickWinnerAnimationProps> = ({ isVisible, points }) => {
    if (!isVisible) return null;

    return (
        <motion.div
            className="absolute inset-0 pointer-events-none z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
        >
            {/* Pulsing glow effect */}
            <motion.div
                className="absolute inset-0 rounded-lg"
                style={{
                    background: 'radial-gradient(circle, rgba(251, 191, 36, 0.4) 0%, rgba(251, 191, 36, 0.1) 50%, transparent 100%)',
                    boxShadow: '0 0 30px rgba(251, 191, 36, 0.6), 0 0 60px rgba(251, 191, 36, 0.4), 0 0 90px rgba(251, 191, 36, 0.2)'
                }}
                animate={{
                    scale: [1, 1.1, 1],
                    opacity: [0.6, 1, 0.6]
                }}
                transition={{
                    duration: 1.5,
                    ease: "easeInOut"
                }}
            />

            {/* Sparkle effects */}
            {[...Array(6)].map((_, i) => (
                <motion.div
                    key={i}
                    className="absolute text-yellow-300 text-lg"
                    style={{
                        left: `${20 + (i * 12)}%`,
                        top: `${15 + (i % 2) * 70}%`
                    }}
                    animate={{
                        scale: [0, 1, 0],
                        opacity: [0, 1, 0],
                        rotate: [0, 180, 360]
                    }}
                    transition={{
                        duration: 1.5,
                        delay: i * 0.1,
                        ease: "easeInOut"
                    }}
                >
                    ⭐
                </motion.div>
            ))}

            {/* Victory text */}
            <motion.div
                className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-yellow-300 font-bold text-lg text-center"
                animate={{
                    scale: [0.8, 1.2, 1],
                    opacity: [0, 1, 0]
                }}
                transition={{
                    duration: 1.5,
                    ease: "easeInOut"
                }}
            >
                <div>🏆 WINNER! 🏆</div>
                {points && points > 0 && (
                    <>
                        {/* Center points */}
                        <div className="text-amber-800 text-xl font-bold mt-1">
                            +{points}
                        </div>

                        {/* Animated points moving outward */}
                        {[...Array(5)].map((_, i) => {
                            // Calculate angles for 5 directions (72 degrees apart)
                            const angle = (i * 72) * (Math.PI / 180); // Convert to radians
                            const distance = 60; // Distance to move
                            const x = Math.cos(angle) * distance;
                            const y = Math.sin(angle) * distance;

                            return (
                                <motion.div
                                    key={i}
                                    className="absolute text-amber-800 text-xl font-bold"
                                    style={{
                                        left: '50%',
                                        top: '50%',
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                    animate={{
                                        x: [0, x],
                                        y: [0, y],
                                        opacity: [1, 0],
                                        scale: [1, 0.5]
                                    }}
                                    transition={{
                                        duration: 1.5,
                                        delay: i * 0.1,
                                        ease: "easeOut"
                                    }}
                                >
                                    +{points}
                                </motion.div>
                            );
                        })}
                    </>
                )}
            </motion.div>
        </motion.div>
    );
};

export default TrickWinnerAnimation;
