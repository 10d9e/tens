import React from 'react';
import { motion } from 'framer-motion';
import Card from './Card';
import { Card as CardType, Player, Trick } from '../types/game';
import { canPlayCard } from '../utils/gameLogic';

interface PlayerHandProps {
    player: Player;
    currentPlayer: string;
    leadSuit: string | null;
    trumpSuit: string;
    onCardClick: (card: CardType) => void;
    onCardDoubleClick?: (card: CardType) => void;
    selectedCardId: string | null;
    currentTrick: Trick;
}

const PlayerHand: React.FC<PlayerHandProps> = ({
    player,
    currentPlayer,
    leadSuit,
    trumpSuit,
    onCardClick,
    onCardDoubleClick,
    selectedCardId,
    currentTrick
}) => {
    const isMyTurn = player.id === currentPlayer;

    // Check if the human player has already played a card in the current trick
    const hasPlayedInCurrentTrick = currentTrick.cards.some(trickCard => trickCard.playerId === player.id);

    console.log('PlayerHand render - player:', player);
    console.log('PlayerHand render - player.cards:', player?.cards);
    console.log('PlayerHand render - isMyTurn:', isMyTurn);
    console.log('PlayerHand render - hasPlayedInCurrentTrick:', hasPlayedInCurrentTrick);

    const getPlayableCards = () => {
        if (!isMyTurn || hasPlayedInCurrentTrick) return [];
        return player.cards.filter(card =>
            canPlayCard(card, leadSuit as any, trumpSuit as any, player.cards)
        );
    };

    const playableCards = getPlayableCards();
    const playableCardIds = new Set(playableCards.map(c => c.id));

    // Sort cards by suit first, then by face value (5, 6, 7, 8, 9, 10, J, Q, K, A)
    const sortedCards = [...player.cards].sort((a, b) => {
        // Define suit order (hearts, clubs, diamonds, spades)
        const suitOrder = { hearts: 0, clubs: 1, diamonds: 2, spades: 3 };
        const suitA = suitOrder[a.suit as keyof typeof suitOrder];
        const suitB = suitOrder[b.suit as keyof typeof suitOrder];

        if (suitA !== suitB) {
            return suitA - suitB;
        }

        // Within same suit, sort by face value (5, 6, 7, 8, 9, 10, J, Q, K, A)
        const rankOrder = { '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
        const rankA = rankOrder[a.rank as keyof typeof rankOrder];
        const rankB = rankOrder[b.rank as keyof typeof rankOrder];

        return rankA - rankB;
    });

    if (!player || !player.cards || player.cards.length === 0) {
        return (
            <div className="player-hand" style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%'
            }}>
                <div className="text-white text-center p-4">
                    <div className="text-sm">Waiting for cards...</div>
                </div>
            </div>
        );
    }

    return (
        <motion.div
            className="player-hand"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            {sortedCards.map((card, index) => {
                const isPlayable = playableCardIds.has(card.id);
                const isSelected = selectedCardId === card.id;

                return (
                    <motion.div
                        key={card.id}
                        className={`relative ${!isPlayable ? 'no-hover' : ''}`}
                        style={{
                            zIndex: isSelected ? 10 : index
                        }}
                        whileHover={isPlayable ? {
                            rotate: 0,
                            y: -7,
                            zIndex: 20,
                            transition: { duration: 0.2 }
                        } : undefined}
                    >
                        <Card
                            card={card}
                            onClick={() => isPlayable && onCardClick(card)}
                            onDoubleClick={() => isPlayable && onCardDoubleClick?.(card)}
                            isSelected={isSelected}
                            isPlayable={isPlayable}
                            size="medium"
                        />
                    </motion.div>
                );
            })}
        </motion.div>
    );
};

export default PlayerHand;
