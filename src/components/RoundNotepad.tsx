import React from 'react';
import { motion } from 'framer-motion';

interface RoundNotepadProps {
    roundScores: { team1: number; team2: number };
    currentBid?: { points: number; suit?: string };
    contractorTeam?: 'team1' | 'team2';
    round: number;
}

const RoundNotepad: React.FC<RoundNotepadProps> = ({
    roundScores,
    currentBid,
    contractorTeam,
    round
}) => {
    const getSuitSymbol = (suit: string) => {
        switch (suit) {
            case 'hearts': return '♥';
            case 'diamonds': return '♦';
            case 'clubs': return '♣';
            case 'spades': return '♠';
            default: return suit;
        }
    };

    const getSuitColor = (suit: string) => {
        return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-800';
    };

    return (
        <motion.div
            className="round-notepad"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="notepad-header">
                <h3>Round {round} Notepad</h3>
                {currentBid && (
                    <div className="current-bid">
                        <span className="bid-label">Current Bid:</span>
                        <span className="bid-amount">{currentBid.points}</span>
                        {currentBid.suit && (
                            <span className={`bid-suit ${getSuitColor(currentBid.suit)}`}>
                                {getSuitSymbol(currentBid.suit)}
                            </span>
                        )}
                    </div>
                )}
            </div>

            <div className="round-scores">
                <div className="score-row">
                    <div className="team-label">
                        Team 1
                        {contractorTeam === 'team1' && (
                            <span className="contractor-badge">Contractor</span>
                        )}
                    </div>
                    <div className="score-value">{roundScores.team1}</div>
                </div>

                <div className="score-row">
                    <div className="team-label">
                        Team 2
                        {contractorTeam === 'team2' && (
                            <span className="contractor-badge">Contractor</span>
                        )}
                    </div>
                    <div className="score-value">{roundScores.team2}</div>
                </div>
            </div>

            <div className="notepad-footer">
                <div className="total-points">
                    Total Points: {roundScores.team1 + roundScores.team2} / 100
                </div>
            </div>
        </motion.div>
    );
};

export default RoundNotepad;
