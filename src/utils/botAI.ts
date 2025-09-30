import { Card, Suit, Rank, Player, Bid, Trick, GameState } from '../types/game';
import {
    getCardValue,
    canPlayCard,
    getTrickWinner,
    calculateTrickPoints,
    isValidBid,
    getCardRank
} from './gameLogic';

export interface BotDecision {
    type: 'bid' | 'play_card' | 'select_trump';
    data: any;
}

export class BotAI {
    private skill: 'easy' | 'medium' | 'hard';

    constructor(skill: 'easy' | 'medium' | 'hard') {
        this.skill = skill;
    }

    makeBid(gameState: GameState, playerId: string): BotDecision {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) throw new Error('Player not found');

        const handValue = this.evaluateHand(player.cards);
        const currentBid = gameState.currentBid;

        let bidPoints = 0;

        switch (this.skill) {
            case 'easy':
                bidPoints = this.easyBid(handValue, currentBid);
                break;
            case 'medium':
                bidPoints = this.mediumBid(handValue, currentBid, gameState);
                break;
            case 'hard':
                bidPoints = this.hardBid(handValue, currentBid, gameState);
                break;
        }

        if (bidPoints > 0 && isValidBid({ playerId, points: bidPoints }, currentBid)) {
            return {
                type: 'bid',
                data: { points: bidPoints }
            };
        }

        return { type: 'bid', data: { points: 0 } }; // Pass
    }

    selectTrump(gameState: GameState, playerId: string): BotDecision {
        const player = gameState.players.find(p => p.id === playerId);
        if (!player) throw new Error('Player not found');

        const suitCounts = this.countSuits(player.cards);
        const bestSuit = Object.entries(suitCounts)
            .sort(([, a], [, b]) => b - a)[0][0] as Suit;

        return {
            type: 'select_trump',
            data: { suit: bestSuit }
        };
    }

    async playCard(gameState: GameState, playerId: string): Promise<BotDecision> {
        // add a delay of 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));

        const player = gameState.players.find(p => p.id === playerId);
        if (!player) throw new Error('Player not found');

        const leadSuit = gameState.currentTrick.cards.length > 0
            ? gameState.currentTrick.cards[0].card.suit
            : null;

        const playableCards = player.cards.filter(card =>
            canPlayCard(card, leadSuit, gameState.trumpSuit!, player.cards)
        );

        let selectedCard: Card;

        switch (this.skill) {
            case 'easy':
                selectedCard = this.easyCardSelection(playableCards, leadSuit, gameState.trumpSuit!);
                break;
            case 'medium':
                selectedCard = this.mediumCardSelection(playableCards, leadSuit, gameState);
                break;
            case 'hard':
                selectedCard = this.hardCardSelection(playableCards, leadSuit, gameState);
                break;
        }

        return {
            type: 'play_card',
            data: { card: selectedCard }
        };
    }

    private evaluateHand(cards: Card[]): number {
        return cards.reduce((total, card) => total + getCardValue(card), 0);
    }

    private countSuits(cards: Card[]): Record<Suit, number> {
        const counts: Record<Suit, number> = {
            hearts: 0,
            diamonds: 0,
            clubs: 0,
            spades: 0
        };

        cards.forEach(card => {
            counts[card.suit]++;
        });

        return counts;
    }

    private easyBid(handValue: number, currentBid?: Bid): number {
        // Simple bidding based on hand value
        if (handValue >= 40) return Math.max(30, (currentBid?.points || 0) + 5);
        if (handValue >= 30) return Math.max(20, (currentBid?.points || 0) + 5);
        if (handValue >= 20) return Math.max(15, (currentBid?.points || 0) + 5);
        return 0;
    }

    private mediumBid(handValue: number, currentBid?: Bid, gameState?: GameState): number {
        // More sophisticated bidding considering position and game state
        const baseBid = this.easyBid(handValue, currentBid);

        // Adjust based on position (later bidders can be more conservative)
        const playerIndex = gameState?.players.findIndex(p => p.id === gameState.currentPlayer) || 0;
        const positionAdjustment = playerIndex > 1 ? -5 : 0;

        return Math.max(0, baseBid + positionAdjustment);
    }

    private hardBid(handValue: number, currentBid?: Bid, gameState?: GameState): number {
        // Advanced bidding with bluffing and game theory
        const baseBid = this.mediumBid(handValue, currentBid, gameState);

        // Add some randomness for bluffing
        const bluffFactor = Math.random() < 0.3 ? (Math.random() - 0.5) * 10 : 0;

        return Math.max(0, Math.round(baseBid + bluffFactor));
    }

    private easyCardSelection(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit): Card {
        // Play highest value card
        return playableCards.reduce((best, current) =>
            getCardValue(current) > getCardValue(best) ? current : best
        );
    }

    private mediumCardSelection(playableCards: Card[], leadSuit: Suit | null, gameState: GameState): Card {
        // Consider trick-winning potential
        if (leadSuit) {
            const trumpCards = playableCards.filter(c => c.suit === gameState.trumpSuit);
            const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);

            if (trumpCards.length > 0) {
                // Play lowest trump if we can win
                return trumpCards.reduce((lowest, current) =>
                    getCardRank(current.rank) < getCardRank(lowest.rank) ? current : lowest
                );
            }

            if (leadSuitCards.length > 0) {
                // Play highest lead suit card
                return leadSuitCards.reduce((highest, current) =>
                    getCardRank(current.rank) > getCardRank(highest.rank) ? current : highest
                );
            }
        }

        // Play lowest value card if we can't win
        return playableCards.reduce((lowest, current) =>
            getCardValue(current) < getCardValue(lowest) ? current : lowest
        );
    }

    private hardCardSelection(playableCards: Card[], leadSuit: Suit | null, gameState: GameState): Card {
        // Advanced card selection considering game state, remaining cards, etc.
        const trick = gameState.currentTrick;

        // If we're last to play, try to win if beneficial
        if (trick.cards.length === 3) {
            const currentWinner = getTrickWinner(trick, gameState.trumpSuit!);
            const currentPoints = calculateTrickPoints(trick);

            // Try to win if trick has good points
            if (currentPoints >= 15) {
                const winningCard = this.findWinningCard(playableCards, leadSuit, gameState.trumpSuit!);
                if (winningCard) return winningCard;
            }
        }

        // Otherwise use medium strategy
        return this.mediumCardSelection(playableCards, leadSuit, gameState);
    }

    private findWinningCard(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit): Card | null {
        if (!leadSuit) return null;

        const trumpCards = playableCards.filter(c => c.suit === trumpSuit);
        const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);

        if (trumpCards.length > 0) {
            return trumpCards.reduce((highest, current) =>
                getCardRank(current.rank) > getCardRank(highest.rank) ? current : highest
            );
        }

        if (leadSuitCards.length > 0) {
            return leadSuitCards.reduce((highest, current) =>
                getCardRank(current.rank) > getCardRank(highest.rank) ? current : highest
            );
        }

        return null;
    }
}
