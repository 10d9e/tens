import { Bid, Player, Card, Suit, GameState } from '../types/game';
import { getCardValue, getCardRank } from './gameLogic';
import logger from '../logger';

export { SimpleBotAI, AcadienBotAI };

// Bot AI (simplified for server)
class SimpleBotAI {
    skill: 'easy' | 'medium' | 'hard' | 'acadien';

    constructor(skill: 'easy' | 'medium' | 'hard' | 'acadien' = 'medium') {
        this.skill = skill;
    }

    makeBid(handValue: number, currentBid: Bid | null, currentBidderId: string | null, myPlayerId: string, players: Player[]): Bid | null {
        // Calculate theoretical maximum bid based on hand value and skill level
        let theoreticalMax;
        if (this.skill === 'easy') {
            theoreticalMax = Math.min(handValue + 5, 100); // Conservative
        } else if (this.skill === 'hard') {
            theoreticalMax = Math.min(handValue + 15, 100); // Aggressive
        } else {
            theoreticalMax = Math.min(handValue + 10, 100); // Medium
        }

        // If there's a current bid, check if it's from a teammate
        if (currentBid && currentBidderId) {
            const currentBidder = players.find(p => p.id === currentBidderId);
            const myPlayer = players.find(p => p.id === myPlayerId);

            if (currentBidder && myPlayer) {
                // Check if current bidder is on the same team (same position parity)
                const isTeammate = (currentBidder.position % 2) === (myPlayer.position % 2);

                if (isTeammate) {
                    logger.debug(`Bot won't outbid teammate who bid ${currentBid.points}`);
                    return null; // Don't outbid teammate
                }
            }

            // Don't bid if current bid is already at or above theoretical maximum
            if (currentBid.points >= theoreticalMax) {
                logger.debug(`Bot won't bid - current bid ${currentBid.points} >= theoretical max ${theoreticalMax}`);
                return null;
            }
        }

        // Calculate suggested bid based on hand value
        let suggestedBid = 0;
        if (handValue >= 50) {
            suggestedBid = Math.min(handValue, 100);
        } else if (handValue >= 40) {
            suggestedBid = Math.min(handValue + 5, 80);
        } else if (handValue >= 30) {
            suggestedBid = Math.min(handValue + 10, 70);
        } else {
            return null; // Don't bid with less than 30 points
        }

        // Ensure minimum bid is 50
        suggestedBid = Math.max(suggestedBid, 50);

        // If there's a current bid, only bid if we can beat it reasonably
        if (currentBid) {
            const minBidToBeat = currentBid.points + 5;
            if (minBidToBeat > suggestedBid) {
                logger.debug(`Bot won't bid - would need ${minBidToBeat} but only suggests ${suggestedBid}`);
                return null;
            }
            suggestedBid = minBidToBeat;
        }

        // Ensure bid is multiple of 5 and within reasonable limits
        const finalBid = Math.min(Math.floor(suggestedBid / 5) * 5, theoreticalMax);

        // Final safety check - ensure minimum bid is 50
        if (finalBid < 50) {
            logger.debug(`Bot won't bid - final bid ${finalBid} is below minimum of 50`);
            return null;
        }

        logger.debug(`Bot suggests bid: ${finalBid} (hand value: ${handValue}, theoretical max: ${theoreticalMax})`);
        return { playerId: myPlayerId, points: finalBid };
    }

    async playCard(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null): Promise<Card> {
        if (playableCards.length === 0) throw new Error('No playable cards available');

        // Simple strategy: prefer playing high-value cards if we have the lead suit
        // or low-value cards if we don't
        const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };

        if (leadSuit) {
            // If we have the lead suit, try to win with a high card
            const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);
            if (leadSuitCards.length > 0) {
                // Play highest lead suit card
                return leadSuitCards.reduce((highest, current) => {
                    const currentRank = getCardRank(current.rank);
                    const highestRank = getCardRank(highest.rank);
                    return currentRank > highestRank ? current : highest;
                });
            }

            // If we don't have the lead suit, play a low-value card
            return playableCards.reduce((lowest, current) => {
                const currentValue = values[current.rank] || 0;
                const lowestValue = values[lowest.rank] || 0;
                return currentValue < lowestValue ? current : lowest;
            });
        } else {
            // First card of trick - play a medium value card
            const randomIndex = Math.floor(Math.random() * playableCards.length);
            return playableCards[randomIndex]!;
        }
    }
}

// Advanced Acadien Bot AI - Expert level with card tracking
class AcadienBotAI {
    skill: 'acadien';
    playedCards: Set<string>; // Track all cards that have been played
    knownCards: Set<string>; // Cards we know about (our hand + played cards)
    partnerBehavior: {
        biddingStyle: 'unknown' | 'conservative' | 'aggressive' | 'balanced';
        playingStyle: 'unknown' | 'cautious' | 'bold' | 'calculated';
        cardSignals: any[];
        tricksWon: number;
        pointsContributed: number;
    };
    gameHistory: {
        rounds: any[];
        teamScores: { team1: number; team2: number };
        biddingHistory: any[];
    };
    cardProbabilities: Map<string, any>; // Track probability of each card being in each player's hand

    constructor() {
        this.skill = 'acadien';
        this.playedCards = new Set(); // Track all cards that have been played
        this.knownCards = new Set(); // Cards we know about (our hand + played cards)
        this.partnerBehavior = {
            biddingStyle: 'unknown', // conservative, aggressive, balanced
            playingStyle: 'unknown', // cautious, bold, calculated
            cardSignals: [], // Track signals partner gives
            tricksWon: 0,
            pointsContributed: 0
        };
        this.gameHistory = {
            rounds: [],
            teamScores: { team1: 0, team2: 0 },
            biddingHistory: []
        };
        this.cardProbabilities = new Map(); // Track probability of each card being in each player's hand
    }

    // Initialize card tracking at start of round
    initializeCardTracking(game: GameState, myPlayerId: string): void {
        const myPlayer = game.players.find(p => p.id === myPlayerId);
        if (!myPlayer) return;

        // Reset tracking for new round
        this.playedCards.clear();
        this.knownCards.clear();
        this.cardProbabilities.clear();

        // Add our own cards to known cards
        myPlayer.cards.forEach(card => {
            this.knownCards.add(`${card.suit}-${card.rank}`);
        });

        // Initialize card probabilities for all players
        const allCards = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5'];
        const allSuits = ['hearts', 'diamonds', 'clubs', 'spades'];

        game.players.forEach(player => {
            this.cardProbabilities.set(player.id, new Map());
            allSuits.forEach(suit => {
                allCards.forEach(rank => {
                    const cardKey = `${suit}-${rank}`;
                    if (!this.knownCards.has(cardKey)) {
                        // Equal probability for unknown cards
                        this.cardProbabilities.get(player.id).set(cardKey, 1.0 / (3 * 9)); // 3 other players, 9 cards each
                    } else {
                        this.cardProbabilities.get(player.id).set(cardKey, 0); // We have this card
                    }
                });
            });
        });
    }

    // Update card tracking when a card is played
    updateCardTracking(playedCard: Card, playerId: string): void {
        const cardKey = `${playedCard.suit}-${playedCard.rank}`;
        this.playedCards.add(cardKey);
        this.knownCards.add(cardKey);

        // Update probabilities - the card is no longer in anyone's hand
        this.cardProbabilities.forEach((playerProbs, pid) => {
            playerProbs.set(cardKey, 0);
        });
    }

    // Advanced bidding logic based on hand analysis and game state
    makeBid(handValue: number, currentBid: Bid | null, currentBidderId: string | null, myPlayerId: string, players: Player[], game: GameState): Bid | null {
        const myPlayer = players.find(p => p.id === myPlayerId);
        if (!myPlayer) return null;

        // Initialize card tracking if not done yet
        if (this.knownCards.size === 0) {
            this.initializeCardTracking(game, myPlayerId);
        }

        // Advanced hand evaluation
        const handAnalysis = this.analyzeHand(myPlayer.cards, game.trumpSuit || null);
        const adjustedHandValue = handAnalysis.totalValue + handAnalysis.trumpValue + handAnalysis.positionBonus;

        // Team dynamics analysis
        const teamAnalysis = this.analyzeTeamSituation(game, myPlayer, players);

        // Game state analysis
        const gameStateAnalysis = this.analyzeGameState(game, myPlayer);

        // Calculate theoretical maximum based on comprehensive analysis
        let theoreticalMax = Math.min(adjustedHandValue + 20, 100); // More aggressive than simple bots

        // If there's a current bid, check if it's from a teammate
        if (currentBid && currentBidderId) {
            const currentBidder = players.find(p => p.id === currentBidderId);
            if (!currentBidder) return null;
            const isTeammate = (currentBidder.position % 2) === (myPlayer.position % 2);

            if (isTeammate) {
                // Analyze if we should support partner's bid or let them handle it
                const shouldSupport = this.shouldSupportPartner(currentBid, handAnalysis, teamAnalysis);
                if (!shouldSupport) {
                    logger.debug(`Acadien bot won't outbid teammate - partner can handle it`);
                    return null;
                }
                // If supporting, be more conservative in our bid
                theoreticalMax = Math.min(currentBid.points + 10, theoreticalMax);
            }

            // Don't bid if current bid is already at or above theoretical maximum
            if (currentBid.points >= theoreticalMax) {
                logger.debug(`Acadien bot won't bid - current bid ${currentBid.points} >= theoretical max ${theoreticalMax}`);
                return null;
            }
        }

        // Calculate suggested bid based on comprehensive analysis
        let suggestedBid = 0;

        if (adjustedHandValue >= 60) {
            suggestedBid = Math.min(adjustedHandValue, 100);
        } else if (adjustedHandValue >= 50) {
            suggestedBid = Math.min(adjustedHandValue + 5, 90);
        } else if (adjustedHandValue >= 40) {
            suggestedBid = Math.min(adjustedHandValue + 10, 80);
        } else if (adjustedHandValue >= 35) {
            suggestedBid = Math.min(adjustedHandValue + 15, 70);
        } else if (adjustedHandValue >= 30) {
            // Lower threshold - don't automatically pass on 30-35 point hands
            suggestedBid = Math.min(adjustedHandValue + 20, 70);
        } else {
            return null; // Don't bid with less than 30 points
        }

        // Adjust based on game state
        if (gameStateAnalysis.teamBehind) {
            suggestedBid += 5; // Be more aggressive if behind
        }
        if (gameStateAnalysis.lateInGame) {
            suggestedBid -= 5; // Be more conservative if late in game
        }

        // CRITICAL: 100+ point rule - be much more aggressive
        // If my team is at 100+, we MUST bid or we score NOTHING this round
        if (gameStateAnalysis.myTeamAbove100) {
            logger.debug(`Acadien bot team is at 100+ (critical threshold) - increasing aggression`);
            suggestedBid += 15; // Significantly more aggressive
            theoreticalMax += 15; // Raise theoretical max too

            // Lower the minimum hand value threshold when at 100+
            if (adjustedHandValue >= 25 && suggestedBid === 0) {
                suggestedBid = 50; // Make minimum bid even with weaker hand
                logger.debug(`Acadien bot making minimum bid to avoid 100+ penalty`);
            }
        }

        // If opponent is at 100+ and there's no bid yet, bidding prevents them from scoring
        // This is a strategic advantage - be more aggressive
        if (gameStateAnalysis.opponentTeamAbove100 && !currentBid) {
            logger.debug(`Acadien bot: opponents at 100+ with no bid yet - increasing aggression to pressure them`);
            suggestedBid += 10; // More aggressive to force them to either outbid or score nothing
            theoreticalMax += 10;
        }

        // If opponent is at 100+ and HAS bid, outbidding them can deny them points
        // Be more willing to take the risk
        if (gameStateAnalysis.opponentTeamAbove100 && currentBid && currentBidderId) {
            const currentBidder = players.find(p => p.id === currentBidderId);
            if (currentBidder) {
                const bidderTeam = currentBidder.position % 2 === 0 ? 'team1' : 'team2';
                const opponentTeam = myPlayer.position % 2 === 0 ? 'team2' : 'team1';

                // Check if the current bidder is on the opponent team
                if (bidderTeam === opponentTeam && game.teamScores[opponentTeam] >= 100) {
                    logger.debug(`Acadien bot: opponent at 100+ already bid - worth being more aggressive to deny them`);
                    suggestedBid += 5; // Moderately more aggressive
                    theoreticalMax += 5;
                }
            }
        }

        // Ensure minimum bid is 50
        suggestedBid = Math.max(suggestedBid, 50);

        // If there's a current bid, only bid if we can beat it reasonably
        if (currentBid) {
            const minBidToBeat = currentBid.points + 5;
            if (minBidToBeat > suggestedBid) {
                logger.debug(`Acadien bot won't bid - would need ${minBidToBeat} but only suggests ${suggestedBid}`);
                return null;
            }
            suggestedBid = minBidToBeat;
        }

        // Ensure bid is multiple of 5 and within reasonable limits
        const finalBid = Math.min(Math.floor(suggestedBid / 5) * 5, theoreticalMax);

        // Final safety check
        if (finalBid < 50) {
            logger.debug(`Acadien bot won't bid - final bid ${finalBid} is below minimum of 50`);
            return null;
        }

        logger.debug(`Acadien bot suggests bid: ${finalBid} (hand value: ${adjustedHandValue}, theoretical max: ${theoreticalMax})`);
        return { playerId: myPlayerId, points: finalBid };
    }

    // Analyze hand for advanced bidding decisions
    analyzeHand(cards: Card[], trumpSuit: Suit | null): any {
        const suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
        const suitValues = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
        let totalValue = 0;
        let trumpValue = 0;
        let positionBonus = 0;

        cards.forEach(card => {
            suitCounts[card.suit]++;
            const value = getCardValue(card);
            suitValues[card.suit] += value;
            totalValue += value;

            if (card.suit === trumpSuit) {
                trumpValue += value;
                // Bonus for trump cards
                if (['A', 'K', 'Q'].includes(card.rank)) {
                    trumpValue += 5;
                }
            }
        });

        // Position bonus based on suit distribution
        const maxSuitCount = Math.max(...Object.values(suitCounts));
        const maxSuitValue = Math.max(...Object.values(suitValues));

        if (maxSuitCount >= 4) {
            positionBonus += 10; // Strong suit
        }
        if (maxSuitValue >= 20) {
            positionBonus += 5; // High-value suit
        }

        return {
            totalValue,
            trumpValue,
            positionBonus,
            suitCounts,
            suitValues,
            maxSuitCount,
            maxSuitValue
        };
    }

    // Analyze team situation for bidding decisions
    analyzeTeamSituation(game: GameState, myPlayer: Player, players: Player[]): any {
        const myTeam = myPlayer.position % 2 === 0 ? 'team1' : 'team2';
        const partner = players.find(p => p.id !== myPlayer.id && (p.position % 2) === (myPlayer.position % 2));

        return {
            teamScore: game.teamScores[myTeam],
            partnerBid: this.gameHistory.biddingHistory.filter(bid => bid.playerId === partner?.id).pop(),
            teamBehind: game.teamScores[myTeam] < game.teamScores[myTeam === 'team1' ? 'team2' : 'team1']
        };
    }

    // Analyze overall game state
    analyzeGameState(game: GameState, myPlayer: Player): any {
        const target = game.scoreTarget || 200;
        const myTeam = myPlayer.position % 2 === 0 ? 'team1' : 'team2';
        const myScore = game.teamScores[myTeam];
        const opponentScore = game.teamScores[myTeam === 'team1' ? 'team2' : 'team1'];

        return {
            teamBehind: myScore < opponentScore,
            lateInGame: Math.max(myScore, opponentScore) > target * 0.7,
            criticalStage: Math.max(Math.abs(myScore), Math.abs(opponentScore)) > target * 0.8,
            myTeamAbove100: myScore >= 100,
            opponentTeamAbove100: opponentScore >= 100
        };
    }

    // Determine if we should support partner's bid
    shouldSupportPartner(currentBid: Bid, handAnalysis: any, teamAnalysis: any): boolean {
        // Don't support if partner's bid is already very high
        if (currentBid.points >= 85) {
            return false;
        }

        // Support if we have a strong hand and team is behind
        if (handAnalysis.totalValue >= 40 && teamAnalysis.teamBehind) {
            return true;
        }

        // Support if we have strong trump support
        if (handAnalysis.trumpValue >= 15) {
            return true;
        }

        return false;
    }

    // Advanced card playing strategy
    async playCard(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, game: GameState, myPlayerId: string): Promise<Card> {
        if (playableCards.length === 0) throw new Error('No playable cards available');

        const myPlayer = game.players.find(p => p.id === myPlayerId);
        if (!myPlayer) {
            const firstCard = playableCards[0];
            if (!firstCard) throw new Error('No playable cards available');
            return firstCard;
        }

        // Initialize tracking if needed
        if (this.knownCards.size === 0) {
            this.initializeCardTracking(game, myPlayerId);
        }

        // Analyze current trick situation
        const trickAnalysis = this.analyzeTrick(game, myPlayer);

        // Determine playing strategy based on game state
        const strategy = this.determinePlayingStrategy(game, myPlayer, trickAnalysis);

        let selectedCard;

        switch (strategy) {
            case 'win_trick':
                selectedCard = this.selectCardToWin(playableCards, leadSuit, trumpSuit, trickAnalysis);
                break;
            case 'lose_trick':
                selectedCard = this.selectCardToLose(playableCards, leadSuit, trumpSuit, trickAnalysis);
                break;
            case 'signal_partner':
                selectedCard = this.selectCardToSignal(playableCards, leadSuit, trumpSuit, trickAnalysis);
                break;
            case 'conserve_trump':
                selectedCard = this.selectCardToConserveTrump(playableCards, leadSuit, trumpSuit, trickAnalysis);
                break;
            default:
                selectedCard = this.selectCardDefault(playableCards, leadSuit, trumpSuit, trickAnalysis);
        }

        // Update card tracking
        if (selectedCard) {
            this.updateCardTracking(selectedCard, myPlayerId);
        }

        return selectedCard || playableCards[0];
    }

    // Analyze current trick for playing decisions
    analyzeTrick(game: GameState, myPlayer: Player): any {
        const currentTrick = game.currentTrick;
        const cardsPlayed = currentTrick.cards || [];
        const myTeam = myPlayer.position % 2 === 0 ? 'team1' : 'team2';
        const isContractorTeam = game.contractorTeam === myTeam;

        let currentWinningCard: { card: Card; playerId: string } | null = null;
        let currentWinningPlayer: string | null = null;
        let pointsInTrick = 0;

        if (cardsPlayed.length > 0 && cardsPlayed[0]) {
            const leadSuit = cardsPlayed[0].card.suit;
            currentWinningCard = cardsPlayed[0];
            currentWinningPlayer = cardsPlayed[0].playerId;

            cardsPlayed.forEach(play => {
                const card = play.card;
                pointsInTrick += getCardValue(card);

                // Determine if this card wins the trick so far
                if (currentWinningCard && card.suit === leadSuit && getCardRank(card.rank) > getCardRank(currentWinningCard.card.rank)) {
                    currentWinningCard = play;
                    currentWinningPlayer = play.playerId;
                } else if (currentWinningCard && card.suit === game.trumpSuit && currentWinningCard.card.suit !== game.trumpSuit) {
                    currentWinningCard = play;
                    currentWinningPlayer = play.playerId;
                }
            });
        }

        return {
            cardsPlayed,
            currentWinningCard,
            currentWinningPlayer,
            pointsInTrick,
            leadSuit: cardsPlayed.length > 0 && cardsPlayed[0] ? cardsPlayed[0].card.suit : null,
            isContractorTeam,
            trickPosition: cardsPlayed.length, // 0 = first, 1 = second, etc.
            isLastToPlay: cardsPlayed.length === 3
        };
    }

    // Determine overall playing strategy
    determinePlayingStrategy(game: GameState, myPlayer: Player, trickAnalysis: any): 'default' | 'win_trick' | 'lose_trick' | 'conserve_trump' | 'signal_partner' {
        const myTeam = myPlayer.position % 2 === 0 ? 'team1' : 'team2';
        const isContractorTeam = game.contractorTeam === myTeam;
        const pointsInTrick = trickAnalysis.pointsInTrick;

        // If we're the contractor team and need points
        if (isContractorTeam && game.currentBid) {
            const pointsNeeded = game.currentBid.points - this.getTeamPointsSoFar(game, myTeam);
            if (pointsNeeded > 0 && pointsInTrick >= 10) {
                return 'win_trick';
            }
        }

        // If opponent is winning with high-value cards, try to win
        if (trickAnalysis.currentWinningPlayer && pointsInTrick >= 15) {
            const winningPlayer = game.players.find(p => p.id === trickAnalysis.currentWinningPlayer);
            if (!winningPlayer) {
                return 'default';
            }
            const isOpponent = (winningPlayer.position % 2) !== (myPlayer.position % 2);
            if (isOpponent) {
                return 'win_trick';
            }
        }

        // If we're last to play and can't win, try to lose cheaply
        if (trickAnalysis.isLastToPlay && trickAnalysis.pointsInTrick < 10) {
            return 'lose_trick';
        }

        // If we have few trump cards left, conserve them
        const trumpCards = myPlayer.cards.filter(c => c.suit === game.trumpSuit);
        if (trumpCards.length <= 2 && trickAnalysis.leadSuit !== game.trumpSuit) {
            return 'conserve_trump';
        }

        // Default strategy
        return 'default';
    }

    // Select card to win the trick
    selectCardToWin(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, trickAnalysis: any): Card {
        if (!leadSuit) {
            // First to play - play a strong card but not necessarily our strongest
            return this.selectStrongCard(playableCards, trumpSuit);
        }

        const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);
        const trumpCards = playableCards.filter(c => c.suit === trumpSuit);

        // If we have the lead suit, play high card
        if (leadSuitCards.length > 0) {
            const currentWinningRank = trickAnalysis.currentWinningCard ?
                getCardRank(trickAnalysis.currentWinningCard.rank) : 0;

            const winningCards = leadSuitCards.filter(c =>
                getCardRank(c.rank) > currentWinningRank
            );

            if (winningCards.length > 0) {
                // Play the lowest winning card
                return winningCards.reduce((lowest, current) =>
                    getCardRank(current.rank) < getCardRank(lowest.rank) ? current : lowest
                );
            }
        }

        // If we don't have winning lead suit, use trump if available and beneficial
        if (trumpCards.length > 0 && trickAnalysis.currentWinningCard?.suit !== trumpSuit) {
            return trumpCards.reduce((lowest, current) =>
                getCardRank(current.rank) < getCardRank(lowest.rank) ? current : lowest
            );
        }

        // Can't win, play low card
        return this.selectLowCard(playableCards, leadSuit, trumpSuit);
    }

    // Select card to lose the trick cheaply
    selectCardToLose(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, trickAnalysis: any): Card {
        const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);

        if (leadSuitCards.length > 0) {
            // Play lowest lead suit card
            return leadSuitCards.reduce((lowest, current) =>
                getCardValue(current) < getCardValue(lowest) ? current : lowest
            );
        }

        // Play lowest value card
        return playableCards.reduce((lowest, current) =>
            getCardValue(current) < getCardValue(lowest) ? current : lowest
        );
    }

    // Select card to signal partner
    selectCardToSignal(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, trickAnalysis: any): Card {
        // For now, use default selection but could implement signaling logic
        return this.selectCardDefault(playableCards, leadSuit, trumpSuit, trickAnalysis);
    }

    // Select card to conserve trump
    selectCardToConserveTrump(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, trickAnalysis: any): Card {
        // Avoid playing trump cards unless absolutely necessary
        const nonTrumpCards = playableCards.filter(c => c.suit !== trumpSuit);
        if (nonTrumpCards.length > 0) {
            return this.selectLowCard(nonTrumpCards, leadSuit, trumpSuit);
        }

        // Must play trump, play lowest trump
        const trumpCards = playableCards.filter(c => c.suit === trumpSuit);
        return trumpCards.reduce((lowest, current) =>
            getCardValue(current) < getCardValue(lowest) ? current : lowest
        );
    }

    // Select strong card for opening
    selectStrongCard(playableCards: Card[], trumpSuit: Suit | null): Card {
        // Prefer high-value non-trump cards for opening
        const nonTrumpCards = playableCards.filter(c => c.suit !== trumpSuit);
        if (nonTrumpCards.length > 0) {
            return nonTrumpCards.reduce((strongest, current) =>
                getCardValue(current) > getCardValue(strongest) ? current : strongest
            );
        }

        // Fallback to any strong card
        return playableCards.reduce((strongest, current) =>
            getCardValue(current) > getCardValue(strongest) ? current : strongest
        );
    }

    // Select low-value card
    selectLowCard(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null): Card {
        return playableCards.reduce((lowest, current) =>
            getCardValue(current) < getCardValue(lowest) ? current : lowest
        );
    }

    // Default card selection
    selectCardDefault(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, trickAnalysis: any): Card {
        if (!leadSuit) {
            // First to play - play medium value card
            const mediumCards = playableCards.filter(c => getCardValue(c) >= 5 && getCardValue(c) <= 15);
            if (mediumCards.length > 0) {
                const randomIndex = Math.floor(Math.random() * mediumCards.length);
                return mediumCards[randomIndex]!;
            }
        }

        // Follow suit if possible, otherwise play low
        const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);
        if (leadSuitCards.length > 0) {
            return this.selectLowCard(leadSuitCards, leadSuit, trumpSuit);
        }

        return this.selectLowCard(playableCards, leadSuit, trumpSuit);
    }

    // Helper method to get team points so far in current round
    getTeamPointsSoFar(game: GameState, team: 'team1' | 'team2'): number {
        // This would need to be implemented based on how points are tracked during the round
        // For now, return 0 as a placeholder
        return 0;
    }
}
