import React from 'react';
import { motion } from 'framer-motion';
import Card from './Card';
import { Card as CardType, Player } from '../types/game';
import { canPlayCard } from '../utils/gameLogic';

interface PlayerHandProps {
    player: Player;
    currentPlayer: string;
    leadSuit: string | null;
    trumpSuit: string;
    onCardClick: (card: CardType) => void;
    selectedCardId: string | null;
    isCurrentPlayer: boolean;
}

const PlayerHand: React.FC<PlayerHandProps> = ({
    player,
    currentPlayer,
    leadSuit,
    trumpSuit,
    onCardClick,
    selectedCardId,
    isCurrentPlayer
}) => {
    const isMyTurn = player.id === currentPlayer;

    console.log('PlayerHand render - player:', player);
    console.log('PlayerHand render - player.cards:', player?.cards);
    console.log('PlayerHand render - isMyTurn:', isMyTurn);

    const getPlayableCards = () => {
        if (!isMyTurn) return [];
        return player.cards.filter(card =>
            canPlayCard(card, leadSuit as any, trumpSuit, player.cards)
        );
    };

    const playableCards = getPlayableCards();
    const playableCardIds = new Set(playableCards.map(c => c.id));

    if (!player || !player.cards || player.cards.length === 0) {
        return (
            <div className="player-hand">
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
            {player.cards.map((card, index) => {
                const isPlayable = playableCardIds.has(card.id);
                const isSelected = selectedCardId === card.id;

                return (
                    <motion.div
                        key={card.id}
                        className="relative"
                        style={{
                            transform: `rotate(${(index - (player.cards.length - 1) / 2) * 6}deg) translateY(${Math.abs(index - (player.cards.length - 1) / 2) * -3}px)`,
                            zIndex: isSelected ? 10 : index
                        }}
                        whileHover={isPlayable ? {
                            rotate: 0,
                            y: -25,
                            zIndex: 20,
                            transition: { duration: 0.2 }
                        } : {}}
                    >
                        <Card
                            card={card}
                            onClick={() => isPlayable && onCardClick(card)}
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
