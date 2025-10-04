import React from 'react';
import { motion } from 'framer-motion';

interface ShuffleAnimationProps {
    isVisible: boolean;
}

const ShuffleAnimation: React.FC<ShuffleAnimationProps> = ({ isVisible }) => {
    if (!isVisible) return null;

    return (
        <motion.div
            className="shuffle-animation"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="shuffle-cards">
                {/* Card 1 */}
                <motion.div
                    className="shuffle-card"
                    animate={{
                        x: [0, -20, 20, -15, 15, 0],
                        y: [0, -10, 10, -8, 8, 0],
                        rotate: [0, -5, 5, -3, 3, 0],
                    }}
                    transition={{
                        duration: 0.8,
                        repeat: 3,
                        ease: "easeInOut"
                    }}
                >
                    <div className="card-back">🂠</div>
                </motion.div>

                {/* Card 2 */}
                <motion.div
                    className="shuffle-card"
                    animate={{
                        x: [0, 15, -15, 20, -20, 0],
                        y: [0, 8, -8, 12, -12, 0],
                        rotate: [0, 3, -3, 5, -5, 0],
                    }}
                    transition={{
                        duration: 0.8,
                        repeat: 3,
                        ease: "easeInOut",
                        delay: 0.1
                    }}
                >
                    <div className="card-back">🂠</div>
                </motion.div>

                {/* Card 3 */}
                <motion.div
                    className="shuffle-card"
                    animate={{
                        x: [0, -25, 25, -18, 18, 0],
                        y: [0, -12, 12, -6, 6, 0],
                        rotate: [0, -8, 8, -4, 4, 0],
                    }}
                    transition={{
                        duration: 0.8,
                        repeat: 3,
                        ease: "easeInOut",
                        delay: 0.2
                    }}
                >
                    <div className="card-back">🂠</div>
                </motion.div>

                {/* Card 4 */}
                <motion.div
                    className="shuffle-card"
                    animate={{
                        x: [0, 18, -18, 25, -25, 0],
                        y: [0, 6, -6, 10, -10, 0],
                        rotate: [0, 4, -4, 6, -6, 0],
                    }}
                    transition={{
                        duration: 0.8,
                        repeat: 3,
                        ease: "easeInOut",
                        delay: 0.3
                    }}
                >
                    <div className="card-back">🂠</div>
                </motion.div>

                {/* Card 5 */}
                <motion.div
                    className="shuffle-card"
                    animate={{
                        x: [0, -12, 12, -22, 22, 0],
                        y: [0, -8, 8, -14, 14, 0],
                        rotate: [0, -6, 6, -2, 2, 0],
                    }}
                    transition={{
                        duration: 0.8,
                        repeat: 3,
                        ease: "easeInOut",
                        delay: 0.4
                    }}
                >
                    <div className="card-back">🂠</div>
                </motion.div>
            </div>

            {/* Shuffle text */}
            <motion.div
                className="shuffle-text"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5, delay: 0.2 }}
            >
            </motion.div>
        </motion.div>
    );
};

export default ShuffleAnimation;
