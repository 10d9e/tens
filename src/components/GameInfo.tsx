import React from 'react';
import { motion } from 'framer-motion';

interface GameInfoProps {
    // Team Scores props
    teamScores: { team1: number; team2: number };
    completedRoundResults?: {
        roundScores: { team1: number; team2: number };
        currentBid?: { points: number; suit?: string };
        contractorTeam?: 'team1' | 'team2';
        round: number;
        kittyDiscards?: any[];
        previousTeamScores?: { team1: number; team2: number };
    } | null;
    showGlowEffect?: boolean;

    // Round Notepad props
    roundScores: { team1: number; team2: number };
    currentBid?: { points: number; suit?: string };
    contractorTeam?: 'team1' | 'team2';
    round: number;
    gamePhase?: string;
}

const GameInfo: React.FC<GameInfoProps> = ({
    teamScores,
    completedRoundResults,
    showGlowEffect = false,
    roundScores,
    currentBid,
    contractorTeam,
    round,
    gamePhase
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
        return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-white';
    };

    const getTeamScore = (team: 'team1' | 'team2') => {
        return teamScores[team];
    };

    const getPreviousTeamScore = (team: 'team1' | 'team2') => {
        if (!completedRoundResults) return teamScores[team];
        // Use the stored previous team scores if available
        if (completedRoundResults.previousTeamScores) {
            return completedRoundResults.previousTeamScores[team];
        }
        // Fallback to current score if no previous scores stored
        return teamScores[team];
    };

    const getScoreChange = (team: 'team1' | 'team2') => {
        if (!completedRoundResults) return 0;

        // Calculate the actual score change by comparing current vs previous scores
        const currentScore = teamScores[team];
        const previousScore = getPreviousTeamScore(team);
        return currentScore - previousScore;
    };

    return (
        <motion.div
            className={`game-info-display ${showGlowEffect ? 'glow-effect' : ''}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            {/* Header with Round Info */}
            <div className="game-info-header">
                <h4>Round {round}</h4>

                <div className="current-bid">
                    <span className="bid-label">Current Bid:</span>
                    {currentBid && (
                        <div>
                            <span className="bid-amount">{currentBid.points}</span>
                            {currentBid.suit && gamePhase === 'playing' && (
                                <span className={`bid-suit ${getSuitColor(currentBid.suit)}`}>
                                    {getSuitSymbol(currentBid.suit)}
                                </span>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* Combined Scores Section */}
            <div className="combined-scores-section">
                <div className="score-row">
                    <div className="team-score-label" style={{ color: '#ef4444' }}>
                        🔴 Team 1
                        <span className="team-position">North & South</span>
                    </div>
                    <div className="round-score-value" style={{ color: '#ef4444' }}>

                        {contractorTeam === 'team1' && (
                            <span>⭐</span>
                        )}
                        {roundScores.team1}
                    </div>
                    <div className="team-score-value-container">
                        {completedRoundResults ? (
                            <div className="score-breakdown" style={{ color: '#ef4444' }}>
                                <div className="score-line">
                                    <span className="previous-score">{getPreviousTeamScore('team1')}</span>
                                    <span className={`score-change ${getScoreChange('team1') >= 0 ? 'positive' : 'negative'}`}>
                                        {getScoreChange('team1') >= 0 ? '+' : ''}{getScoreChange('team1')}
                                    </span>
                                    <span className="final-score">{getTeamScore('team1')}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="team-score-value" style={{ color: '#ef4444' }}>{getTeamScore('team1')}</div>
                        )}
                    </div>
                </div>

                <div className="score-row">
                    <div className="team-score-label" style={{ color: '#3b82f6' }}>
                        🔵 Team 2
                        <span className="team-position">East & West</span>
                    </div>
                    <div className="round-score-value" style={{ color: '#3b82f6' }}>

                        {contractorTeam === 'team2' && (
                            <span>⭐</span>
                        )}
                        {roundScores.team2}
                    </div>
                    <div className="team-score-value-container">
                        {completedRoundResults ? (
                            <div className="score-breakdown" style={{ color: '#3b82f6' }}>
                                <div className="score-line">
                                    <span className="previous-score">{getPreviousTeamScore('team2')}</span>
                                    <span className={`score-change ${getScoreChange('team2') >= 0 ? 'positive' : 'negative'}`}>
                                        {getScoreChange('team2') >= 0 ? '+' : ''}{getScoreChange('team2')}
                                    </span>
                                    <span className="final-score">{getTeamScore('team2')}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="team-score-value" style={{ color: '#3b82f6' }}>{getTeamScore('team2')}</div>
                        )}
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="game-info-footer">
                <div className="total-points">
                    Round Points: {roundScores.team1 + roundScores.team2} / 100
                </div>
                <div className="team-score-status">
                    {getTeamScore('team1') > getTeamScore('team2') ? (
                        <span style={{ color: '#ef4444' }}>🔴 Team 1 leads by {getTeamScore('team1') - getTeamScore('team2')} points</span>
                    ) : getTeamScore('team2') > getTeamScore('team1') ? (
                        <span style={{ color: '#3b82f6' }}>🔵 Team 2 leads by {getTeamScore('team2') - getTeamScore('team1')} points</span>
                    ) : (
                        <span>Teams are tied!</span>
                    )}
                </div>
            </div>
        </motion.div>
    );
};

export default GameInfo;
