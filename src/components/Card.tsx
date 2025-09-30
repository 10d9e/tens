import React from 'react';
import { motion } from 'framer-motion';
import { Card as CardType } from '../types/game';

interface CardProps {
    card: CardType;
    onClick?: () => void;
    isSelected?: boolean;
    isPlayable?: boolean;
    size?: 'small' | 'medium' | 'large';
    className?: string;
}

const Card: React.FC<CardProps> = ({
    card,
    onClick,
    isSelected = false,
    isPlayable = true,
    size = 'medium',
    className = ''
}) => {
    const getSuitSymbol = (suit: string) => {
        switch (suit) {
            case 'hearts': return '♥';
            case 'diamonds': return '♦';
            case 'clubs': return '♣';
            case 'spades': return '♠';
            default: return '';
        }
    };

    const getSizeClasses = () => {
        switch (size) {
            case 'small':
                return 'w-8 h-11 text-xs';
            case 'large':
                return 'w-16 h-22 text-sm';
            default:
                return 'w-14 h-20 text-sm';
        }
    };

    const getCardValue = (rank: string) => {
        const values: Record<string, number> = {
            'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10,
            '9': 0, '8': 0, '7': 0, '5': 5
        };
        return values[rank] || 0;
    };

    const cardValue = getCardValue(card.rank);
    const isPointCard = cardValue > 0;

    return (
        <motion.div
            className={`
        card ${card.suit} ${getSizeClasses()} ${className}
        ${isSelected ? 'selected' : ''}
        ${!isPlayable ? 'cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
        ${isPointCard ? 'ring-2 ring-yellow-400 ring-opacity-50' : ''}
        relative
      `}
            style={{
                filter: !isPlayable ? 'grayscale(80%) brightness(0.6)' : undefined,
                opacity: !isPlayable ? 0.7 : undefined
            }}
            onClick={isPlayable ? onClick : undefined}
            whileHover={isPlayable ? { scale: 1.05, y: -4 } : { scale: 1, y: 0 }}
            whileTap={isPlayable ? { scale: 0.95 } : {}}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="card-rank flex items-center justify-between">
                <span>{card.rank}</span>
                {isPointCard && (
                    <span className="text-yellow-500 text-xs font-bold">
                        ({cardValue})
                    </span>
                )}
            </div>

            <div className="card-suit flex-1 flex items-center justify-center">
                {getSuitSymbol(card.suit)}
            </div>

            <div className="card-rank-bottom flex items-center justify-between">
                <span>{card.rank}</span>
                {isPointCard && (
                    <span className="text-yellow-500 text-xs font-bold">
                        ({cardValue})
                    </span>
                )}
            </div>

            {/* Unplayable overlay */}
            {!isPlayable && (
                <div
                    className="absolute inset-0 bg-red-500/80 rounded-lg z-50"
                    style={{ backgroundColor: 'rgba(255, 0, 0, 0.8)' }}
                ></div>
            )}
        </motion.div>
    );
};

export default Card;
