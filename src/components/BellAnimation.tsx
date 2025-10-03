import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BellAnimationProps {
    isVisible: boolean;
}

const BellAnimation: React.FC<BellAnimationProps> = ({ isVisible }) => {
    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ scale: 0, rotate: -10 }}
                    animate={{
                        scale: [0, 1.2, 1],
                        rotate: [-10, 10, -5, 5, 0]
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{
                        duration: 0.8,
                        times: [0, 0.3, 0.6, 0.8, 1],
                        ease: "easeOut"
                    }}
                    className="absolute -top-2 -right-2 z-20"
                >
                    <div className="text-2xl">
                        🔔
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default BellAnimation;
