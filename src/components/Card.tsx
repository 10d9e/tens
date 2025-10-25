import React from 'react';
import { motion } from 'framer-motion';
import { Card as CardType } from '../types/game';

interface CardProps {
    card: CardType;
    onClick?: () => void;
    onDoubleClick?: () => void;
    isSelected?: boolean;
    isPlayable?: boolean;
    size?: 'tiny' | 'small' | 'medium' | 'large';
    className?: string;
    style?: React.CSSProperties;
}

const Card: React.FC<CardProps> = ({
    card,
    onClick,
    onDoubleClick,
    isSelected = false,
    isPlayable = true,
    size = 'medium',
    className = '',
    style
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
            case 'tiny':
                return 'w-3 h-4 text-[6px]';
            case 'small':
                return 'w-12 h-16 text-lg';
            case 'large':
                return 'w-24 h-33 text-xl';
            default:
                return 'w-21 h-30 text-lg';
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
        relative
      `}
            style={{
                filter: !isPlayable ? 'grayscale(80%) brightness(0.6)' : undefined,
                opacity: !isPlayable ? 0.7 : undefined,
                boxShadow: isPointCard ? '0 0 12px rgba(255, 193, 7, 0.8), 0 0 15px rgba(255, 193, 7, 0.9), 0 0 1px rgba(255, 193, 7, 1)' : undefined,
                border: isPointCard ? '2px solid rgba(255, 193, 7, 0.8)' : undefined,
                ...style
            }}
            onClick={isPlayable ? onClick : undefined}
            onDoubleClick={isPlayable ? onDoubleClick : undefined}
            whileHover={isPlayable ? { scale: 1.05, y: -4 } : { scale: 1, y: 0 }}
            whileTap={isPlayable ? { scale: 0.95 } : {}}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
        >
            <div className="card-rank flex items-center justify-start">
                <span>{card.rank}</span>
            </div>

            <div className="card-suit flex-1 flex items-center justify-center">
                {getSuitSymbol(card.suit)}
            </div>

            <div className="card-rank-bottom flex items-center justify-start">
                <span>{card.rank}</span>
            </div>


        </motion.div>
    );
};

export default Card;
