import React from 'react';
import { motion } from 'framer-motion';
import Card from './Card';
import { Card as CardType } from '../types/game';

interface KittyAreaProps {
    kittyDiscards?: CardType[];
    showKittyDiscards?: boolean;
    contractorTeam?: 'team1' | 'team2';
    hasKitty?: boolean;
}

const KittyArea: React.FC<KittyAreaProps> = ({
    kittyDiscards,
    showKittyDiscards,
    contractorTeam,
    hasKitty = false
}) => {
    // Check if a card is a point card (A, 10, 5)
    const isPointCard = (card: CardType) => {
        return card.rank === 'A' || card.rank === '10' || card.rank === '5';
    };

    // Get point value for a card
    const getCardPoints = (card: CardType): number => {
        if (card.rank === 'A') return 10;
        if (card.rank === '10') return 10;
        if (card.rank === '5') return 5;
        return 0;
    };

    // Get the defending team (who receives the kitty points)
    const getDefendingTeam = () => {
        if (!contractorTeam) return 'team1';
        return contractorTeam === 'team1' ? 'team2' : 'team1';
    };

    // Get the text color for the defending team
    const getDefendingTeamColor = () => {
        const defendingTeam = getDefendingTeam();
        // Team 1 = red/pink, Team 2 = blue
        return defendingTeam === 'team1' ? 'text-red-400' : 'text-blue-400';
    };

    // Determine which team gets the kitty discard points and get glow color
    // Kitty discards always go to the defending team (the team that didn't win the bid)
    const getKittyDiscardTeamGlow = () => {
        if (!contractorTeam) return '0 0 30px rgba(239, 68, 68, 1), 0 0 60px rgba(239, 68, 68, 0.8), 0 0 90px rgba(239, 68, 68, 0.6)'; // Default red glow

        // The defending team is the opposite of the contractor team
        const defendingTeam = getDefendingTeam();

        // Team 1 = red glow, Team 2 = blue glow - Multiple layers for more prominent glow
        return defendingTeam === 'team1'
            ? '0 0 30px rgba(239, 68, 68, 1), 0 0 60px rgba(239, 68, 68, 0.8), 0 0 90px rgba(239, 68, 68, 0.6)' // Red glow
            : '0 0 30px rgba(59, 130, 246, 1), 0 0 60px rgba(59, 130, 246, 0.8), 0 0 90px rgba(59, 130, 246, 0.6)'; // Blue glow
    };

    // Don't render if no kitty
    if (!hasKitty) return null;

    return (
        <div className="kitty-area">
            <div>

                <div className="flex justify-center gap-1" style={{ zIndex: showKittyDiscards && kittyDiscards && kittyDiscards.length > 0 ? 40 : 0 }}>
                    {showKittyDiscards && kittyDiscards && kittyDiscards.length > 0 ? (
                        // Show actual discarded cards
                        kittyDiscards.map((card, index) => {
                            const isPoint = isPointCard(card);
                            const points = getCardPoints(card);

                            return (
                                <div key={card.id} className="flex flex-col items-center">
                                    <motion.div
                                        initial={{ opacity: 0, y: 20, rotateY: 180 }}
                                        animate={{
                                            opacity: 1,
                                            y: isPoint ? -8 : 0, // Raise point cards slightly
                                            rotateY: 0
                                        }}
                                        transition={{
                                            duration: 0.6,
                                            delay: index * 0.1,
                                            ease: "easeOut"
                                        }}
                                        className={`relative ${isPoint ? 'z-50' : 'z-40'}`}
                                    >
                                        <Card
                                            card={card}
                                            size="small"
                                            className="shadow-lg kitty-card"
                                            style={isPoint ? { boxShadow: getKittyDiscardTeamGlow() } : undefined}
                                        />
                                    </motion.div>
                                    {isPoint && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -5 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{
                                                duration: 0.4,
                                                delay: index * 0.1 + 0.3
                                            }}
                                            className={`text-lg font-extrabold mt-1 ${getDefendingTeamColor()}`}
                                            style={{
                                                textShadow: '0 0 12px currentColor, 0 0 24px currentColor, 0 2px 4px rgba(0,0,0,0.8)'
                                            }}
                                        >
                                            +{points}
                                        </motion.div>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        // Show face-down cards
                        Array.from({ length: 4 }, (_, index) => (
                            <motion.div
                                key={`face-down-${index}`}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.3,
                                    delay: index * 0.1
                                }}
                                className="relative z-30"
                            >
                                <div className="shuffle-card">
                                    <div className="card-back">🂠</div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default KittyArea;
