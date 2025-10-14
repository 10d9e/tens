import { Bid, Player, Card, Suit, Rank, Game } from '../types/game';
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

        try {
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
        } catch (error) {
            logger.error('Simple bot error in playCard:', error);
            // Fallback: return first playable card
            const fallbackCard = playableCards[0];
            if (!fallbackCard) throw new Error('No playable cards available after error');
            return fallbackCard;
        }
    }
}

// Advanced Acadien Bot AI - Expert level with card tracking
class AcadienBotAI {
    skill: 'acadien';
    playedCards: Set<string>; // Track all cards that have been played
    knownCards: Set<string>; // Cards we know about (our hand + played cards)
    playedCardsByPlayer: Map<string, Card[]>; // Track which player played which cards
    playerVoids: Map<string, Set<Suit>>; // Track which suits each player is void in
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
    remainingCardsBySuit: Map<Suit, Card[]>; // Track remaining cards by suit
    highCardsRemaining: Map<Suit, string[]>; // Track high cards (A, K, Q) remaining by suit

    constructor() {
        this.skill = 'acadien';
        this.playedCards = new Set(); // Track all cards that have been played
        this.knownCards = new Set(); // Cards we know about (our hand + played cards)
        this.playedCardsByPlayer = new Map(); // NEW: Track cards by player
        this.playerVoids = new Map(); // NEW: Track voids
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
        this.remainingCardsBySuit = new Map(); // NEW: Track remaining cards
        this.highCardsRemaining = new Map(); // NEW: Track high cards
    }

    // Initialize card tracking at start of round
    initializeCardTracking(game: Game, myPlayerId: string): void {
        const myPlayer = game.players.find(p => p.id === myPlayerId);
        if (!myPlayer) return;

        // Reset tracking for new round
        this.playedCards.clear();
        this.knownCards.clear();
        this.cardProbabilities.clear();
        this.playedCardsByPlayer.clear();
        this.playerVoids.clear();
        this.remainingCardsBySuit.clear();
        this.highCardsRemaining.clear();

        // Add our own cards to known cards
        myPlayer.cards.forEach(card => {
            this.knownCards.add(`${card.suit}-${card.rank}`);
        });

        // Initialize card probabilities for all players
        const allCards = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5'];
        const allSuits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];

        // Initialize played cards tracking for each player
        game.players.forEach(player => {
            this.playedCardsByPlayer.set(player.id, []);
            this.playerVoids.set(player.id, new Set());

            this.cardProbabilities.set(player.id, new Map());
            allSuits.forEach(suit => {
                allCards.forEach(rank => {
                    const cardKey = `${suit}-${rank}`;
                    if (!this.knownCards.has(cardKey)) {
                        // Equal probability for unknown cards
                        this.cardProbabilities.get(player.id)!.set(cardKey, 1.0 / (3 * 9)); // 3 other players, 9 cards each
                    } else {
                        this.cardProbabilities.get(player.id)!.set(cardKey, 0); // We have this card
                    }
                });
            });
        });

        // Initialize remaining cards tracking
        allSuits.forEach(suit => {
            const suitCards: Card[] = allCards
                .filter(rank => !this.knownCards.has(`${suit}-${rank}`))
                .map(rank => ({ suit, rank, id: `${suit}-${rank}` } as Card));
            this.remainingCardsBySuit.set(suit, suitCards);

            // Track high cards remaining
            const highRanks = ['A', 'K', 'Q'].filter(rank => !this.knownCards.has(`${suit}-${rank}`));
            this.highCardsRemaining.set(suit, highRanks);
        });

        logger.debug(`Card tracking initialized - tracking ${allSuits.length * allCards.length} total cards`);
    }

    // Update card tracking when a card is played
    updateCardTracking(playedCard: Card, playerId: string, leadSuit?: Suit | null): void {
        const cardKey = `${playedCard.suit}-${playedCard.rank}`;
        this.playedCards.add(cardKey);
        this.knownCards.add(cardKey);

        // Track which player played this card
        const playerCards = this.playedCardsByPlayer.get(playerId) || [];
        playerCards.push(playedCard);
        this.playedCardsByPlayer.set(playerId, playerCards);

        // VOID DETECTION: If there's a lead suit and player didn't follow, they're void
        if (leadSuit && playedCard.suit !== leadSuit) {
            const playerVoids = this.playerVoids.get(playerId);
            if (playerVoids) {
                playerVoids.add(leadSuit);
                logger.debug(`Detected void: Player ${playerId} is void in ${leadSuit}`);
            }
        }

        // Update probabilities - the card is no longer in anyone's hand
        this.cardProbabilities.forEach((playerProbs, pid) => {
            playerProbs.set(cardKey, 0);
        });

        // Update remaining cards by suit
        const suitCards = this.remainingCardsBySuit.get(playedCard.suit);
        if (suitCards) {
            const updatedCards = suitCards.filter(c => c.rank !== playedCard.rank);
            this.remainingCardsBySuit.set(playedCard.suit, updatedCards);
        }

        // Update high cards remaining
        if (['A', 'K', 'Q'].includes(playedCard.rank)) {
            const highCards = this.highCardsRemaining.get(playedCard.suit);
            if (highCards) {
                const updatedHighCards = highCards.filter(r => r !== playedCard.rank);
                this.highCardsRemaining.set(playedCard.suit, updatedHighCards);

                if (playedCard.rank === 'A') {
                    logger.debug(`Ace of ${playedCard.suit} has been played - suit control changed`);
                }
            }
        }
    }

    // NEW: Get remaining high cards in a suit
    getRemainingHighCards(suit: Suit): Rank[] {
        return (this.highCardsRemaining.get(suit) || []) as Rank[];
    }

    // NEW: Check if player is likely void in a suit
    isPlayerVoid(playerId: string, suit: Suit): boolean {
        const playerVoids = this.playerVoids.get(playerId);
        return playerVoids ? playerVoids.has(suit) : false;
    }

    // NEW: Count remaining cards in a suit
    countRemainingInSuit(suit: Suit): number {
        const cards = this.remainingCardsBySuit.get(suit);
        return cards ? cards.length : 0;
    }

    // NEW: Get cards played by a specific player
    getCardsPlayedBy(playerId: string): Card[] {
        return this.playedCardsByPlayer.get(playerId) || [];
    }

    // Advanced bidding logic based on hand analysis and game state
    makeBid(handValue: number, currentBid: Bid | null, currentBidderId: string | null, myPlayerId: string, players: Player[], game: Game): Bid | null {
        const myPlayer = players.find(p => p.id === myPlayerId);
        if (!myPlayer) return null;

        try {
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
            const gameStateAnalysis = this.analyzeGame(game, myPlayer);

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
        } catch (error) {
            logger.error(`Acadien bot error in makeBid for player ${myPlayerId}:`, error);
            // Fallback to conservative bidding: only bid if hand is very strong
            if (handValue >= 50) {
                return { playerId: myPlayerId, points: 50 };
            }
            return null; // Pass if error occurs
        }
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
    analyzeTeamSituation(game: Game, myPlayer: Player, players: Player[]): any {
        const myTeam = myPlayer.position % 2 === 0 ? 'team1' : 'team2';
        const partner = players.find(p => p.id !== myPlayer.id && (p.position % 2) === (myPlayer.position % 2));

        return {
            teamScore: game.teamScores[myTeam],
            partnerBid: this.gameHistory.biddingHistory.filter(bid => bid.playerId === partner?.id).pop(),
            teamBehind: game.teamScores[myTeam] < game.teamScores[myTeam === 'team1' ? 'team2' : 'team1']
        };
    }

    // Analyze overall game state
    analyzeGame(game: Game, myPlayer: Player): any {
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
    async playCard(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, game: Game, myPlayerId: string): Promise<Card> {
        if (playableCards.length === 0) throw new Error('No playable cards available');

        const myPlayer = game.players.find(p => p.id === myPlayerId);
        if (!myPlayer) {
            const firstCard = playableCards[0];
            if (!firstCard) throw new Error('No playable cards available');
            return firstCard;
        }

        try {
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
            case 'dump_points_to_partner':
                selectedCard = this.selectCardToDumpPoints(playableCards, leadSuit, trumpSuit, trickAnalysis, myPlayer, game);
                break;
            case 'win_trick':
                selectedCard = this.selectCardToWin(playableCards, leadSuit, trumpSuit, trickAnalysis, myPlayer, game);
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

            // Update card tracking for our selected card
            // Note: Cards already played in trick were tracked in analyzeTrick
            const finalCard = selectedCard || playableCards[0];
            if (finalCard) {
                try {
                    this.updateCardTracking(finalCard, myPlayerId, leadSuit);
                } catch (error) {
                    logger.debug(`Error updating card tracking for ${myPlayerId}:`, error);
                    // Continue anyway - card tracking is for optimization, not critical
                }
            }

            return finalCard || playableCards[0];
        } catch (error) {
            logger.error(`Acadien bot error in playCard for player ${myPlayerId}:`, error);
            // Fallback: return first playable card
            const fallbackCard = playableCards[0];
            if (!fallbackCard) throw new Error('No playable cards available after error');
            logger.debug(`Using fallback card: ${fallbackCard.rank} of ${fallbackCard.suit}`);
            return fallbackCard;
        }
    }

    // Analyze current trick for playing decisions
    analyzeTrick(game: Game, myPlayer: Player): any {
        const currentTrick = game.currentTrick;
        const cardsPlayed = currentTrick.cards || [];
        const myTeam = myPlayer.position % 2 === 0 ? 'team1' : 'team2';
        const isContractorTeam = game.contractorTeam === myTeam;

        let currentWinningCard: { card: Card; playerId: string } | null = null;
        let currentWinningPlayer: string | null = null;
        let pointsInTrick = 0;
        let leadSuit: Suit | null = null;

        if (cardsPlayed.length > 0 && cardsPlayed[0]) {
            leadSuit = cardsPlayed[0].card.suit;
            currentWinningCard = cardsPlayed[0];
            currentWinningPlayer = cardsPlayed[0].playerId;

            cardsPlayed.forEach((play, index) => {
                const card = play.card;
                pointsInTrick += getCardValue(card);

                // Track this card for void detection (if not first card)
                if (index > 0) {
                    this.updateCardTracking(card, play.playerId, leadSuit);
                } else {
                    // First card - no lead suit to check against
                    this.updateCardTracking(card, play.playerId, null);
                }

                // Determine if this card wins the trick so far
                if (currentWinningCard && card.suit === game.trumpSuit && currentWinningCard.card.suit !== game.trumpSuit) {
                    // Trump beats non-trump
                    currentWinningCard = play;
                    currentWinningPlayer = play.playerId;
                } else if (currentWinningCard && card.suit === game.trumpSuit && currentWinningCard.card.suit === game.trumpSuit && getCardRank(card.rank) > getCardRank(currentWinningCard.card.rank)) {
                    // Higher trump beats lower trump
                    currentWinningCard = play;
                    currentWinningPlayer = play.playerId;
                } else if (currentWinningCard && card.suit === leadSuit && currentWinningCard.card.suit === leadSuit && getCardRank(card.rank) > getCardRank(currentWinningCard.card.rank)) {
                    // Higher lead suit beats lower lead suit  
                    currentWinningCard = play;
                    currentWinningPlayer = play.playerId;
                }
            });
        }

        // Determine if partner is currently winning
        let partnerIsWinning = false;
        let partnerPosition = -1;
        if (currentWinningPlayer) {
            const winningPlayer = game.players.find(p => p.id === currentWinningPlayer);
            if (winningPlayer) {
                const isPartner = (winningPlayer.position % 2) === (myPlayer.position % 2) && winningPlayer.id !== myPlayer.id;
                partnerIsWinning = isPartner;
                if (isPartner) {
                    partnerPosition = winningPlayer.position;
                }
            }
        }

        // NEW: Check if opponents can still beat current winning card
        const canOpponentsBeat = this.canOpponentsBeatCard(game, myPlayer, currentWinningCard, leadSuit);

        return {
            cardsPlayed,
            currentWinningCard,
            currentWinningPlayer,
            pointsInTrick,
            leadSuit,
            isContractorTeam,
            trickPosition: cardsPlayed.length, // 0 = first, 1 = second, etc.
            isLastToPlay: cardsPlayed.length === 3,
            partnerIsWinning,
            partnerPosition,
            canOpponentsBeat // NEW: Strategic information
        };
    }

    // NEW: Determine if opponents can potentially beat the current winning card
    canOpponentsBeatCard(game: Game, myPlayer: Player, winningCard: { card: Card; playerId: string } | null, leadSuit: Suit | null): boolean {
        if (!winningCard || !game.trumpSuit) return true;

        const trumpSuit = game.trumpSuit;
        const winningRank = getCardRank(winningCard.card.rank);
        const isWinningTrump = winningCard.card.suit === trumpSuit;

        // Check remaining high cards
        if (isWinningTrump) {
            // Winning with trump - check if higher trump cards remain
            const remainingHighTrump = this.getRemainingHighCards(trumpSuit);
            const higherTrumpRemain = remainingHighTrump.some(rank => getCardRank(rank) > winningRank);
            return higherTrumpRemain;
        } else if (leadSuit) {
            // Winning with lead suit - check if higher lead cards or trump remain
            const remainingHighLeadSuit = this.getRemainingHighCards(leadSuit);
            const higherLeadRemain = remainingHighLeadSuit.some(rank => getCardRank(rank) > winningRank);
            const trumpRemains = this.countRemainingInSuit(trumpSuit) > 0;
            return higherLeadRemain || trumpRemains;
        }

        return true;
    }

    // Determine overall playing strategy
    determinePlayingStrategy(game: Game, myPlayer: Player, trickAnalysis: any): 'default' | 'win_trick' | 'lose_trick' | 'conserve_trump' | 'signal_partner' | 'dump_points_to_partner' {
        const myTeam = myPlayer.position % 2 === 0 ? 'team1' : 'team2';
        const isContractorTeam = game.contractorTeam === myTeam;
        const pointsInTrick = trickAnalysis.pointsInTrick;

        // PRIORITY 1: If partner is winning, dump points to them
        if (trickAnalysis.partnerIsWinning) {
            logger.debug(`Partner is winning the trick - dumping points strategy`);
            return 'dump_points_to_partner';
        }

        // PRIORITY 2: If opponent is winning with points, try to win it
        if (trickAnalysis.currentWinningPlayer && pointsInTrick >= 5) {
            const winningPlayer = game.players.find(p => p.id === trickAnalysis.currentWinningPlayer);
            if (!winningPlayer) {
                return 'default';
            }
            const isOpponent = (winningPlayer.position % 2) !== (myPlayer.position % 2);
            if (isOpponent) {
                logger.debug(`Opponent is winning with ${pointsInTrick} points - trying to win`);
                return 'win_trick';
            }
        }

        // PRIORITY 3: If we're the contractor team and need points
        if (isContractorTeam && game.currentBid) {
            const pointsNeeded = game.currentBid.points - this.getTeamPointsSoFar(game, myTeam);
            if (pointsNeeded > 0 && pointsInTrick >= 10) {
                return 'win_trick';
            }
        }

        // PRIORITY 4: If we're last to play and can't win, try to lose cheaply
        if (trickAnalysis.isLastToPlay && trickAnalysis.pointsInTrick < 10) {
            return 'lose_trick';
        }

        // PRIORITY 5: If we have few trump cards left, conserve them
        const trumpCards = myPlayer.cards.filter(c => c.suit === game.trumpSuit);
        if (trumpCards.length <= 2 && trickAnalysis.leadSuit !== game.trumpSuit) {
            return 'conserve_trump';
        }

        // Default strategy
        return 'default';
    }

    // NEW METHOD: Select card to dump points to partner
    selectCardToDumpPoints(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, trickAnalysis: any, myPlayer: Player, game: Game): Card {
        logger.debug(`Dumping points to partner - cards available: ${playableCards.length}`);

        const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);
        const trumpCards = playableCards.filter(c => c.suit === trumpSuit);

        // CRITICAL: Never cut partner with trump when they're already winning!
        if (leadSuit && leadSuitCards.length === 0 && trumpCards.length > 0) {
            // We don't have lead suit and only have trump - we would cut partner!
            // Instead, play lowest non-trump card (or any low card if all are trump)
            const nonTrumpCards = playableCards.filter(c => c.suit !== trumpSuit);
            if (nonTrumpCards.length > 0) {
                logger.debug(`Avoiding cutting partner - playing non-trump card`);
                // Among non-trump cards, prefer point cards since partner is already winning
                const pointCards = nonTrumpCards.filter(c => getCardValue(c) >= 5);
                if (pointCards.length > 0) {
                    return pointCards.reduce((highest, current) =>
                        getCardValue(current) > getCardValue(highest) ? current : highest
                    );
                }
                return this.selectLowCard(nonTrumpCards, leadSuit, trumpSuit);
            }
            // All cards are trump - play lowest trump to avoid cutting unnecessarily high
            logger.debug(`All cards are trump - playing lowest trump to minimize cut`);
            return this.selectLowCard(trumpCards, leadSuit, trumpSuit);
        }

        // If we have lead suit cards, be smart about what we dump
        if (leadSuitCards.length > 0) {
            // ENHANCED LOGIC: Check if partner's win is secure using card counting
            const partnerWinSecure = trickAnalysis.partnerIsWinning &&
                trickAnalysis.isLastToPlay &&
                !trickAnalysis.canOpponentsBeat;

            // If partner's win is absolutely secure (we're last and no one can beat them)
            if (partnerWinSecure) {
                logger.debug(`Partner's win is SECURE (last to play, opponents can't beat) - conserving high cards`);

                // Priority 1: Play a 5 if we have one (gives partner 5 points without wasting 10 or Ace)
                const fiveCards = leadSuitCards.filter(c => c.rank === '5');
                if (fiveCards.length > 0) {
                    logger.debug(`Playing 5 to give partner 5 points while saving 10s and Aces`);
                    return fiveCards[0]!;
                }

                // Priority 2: If no 5s but we have high point cards (10s, Aces), dump those
                // Better to give partner 10 points than save them when partner is winning
                const highPointCards = leadSuitCards.filter(c => c.rank === '10' || c.rank === 'A');
                if (highPointCards.length > 0) {
                    logger.debug(`No 5s available, but have high point cards - dumping to partner`);
                    // Play highest value (10 over A if both, since both are 10 points but 10-rank is lower)
                    return highPointCards.reduce((highest, current) =>
                        getCardValue(current) >= getCardValue(highest) ? current : highest
                    );
                }

                // Priority 3: No point cards at all - play lowest card
                logger.debug(`No point cards available - playing lowest card`);
                return this.selectLowCard(leadSuitCards, leadSuit, trumpSuit);
            }

            // Partner is winning but win is NOT secure, or we're not last
            // Use moderate dumping - balance between helping partner and conserving
            if (trickAnalysis.partnerIsWinning && !trickAnalysis.isLastToPlay) {
                logger.debug(`Partner winning but not last to play - moderate dump strategy`);

                // Priority 1: Prefer 5s (conserve 10s and Aces for later)
                const fiveCards = leadSuitCards.filter(c => c.rank === '5');
                if (fiveCards.length > 0) {
                    logger.debug(`Dumping 5 to partner (saving 10s for later)`);
                    return fiveCards[0]!;
                }

                // Priority 2: If no 5s but we have high point cards (10s, Aces), dump those
                // Always give points to partner when that's all we have
                const highPointCards = leadSuitCards.filter(c => c.rank === '10' || c.rank === 'A');
                if (highPointCards.length > 0) {
                    logger.debug(`No 5s available, dumping high point cards to partner`);
                    return highPointCards[0]!;
                }
            }

            // Default case: Standard point dumping (original logic for other scenarios)
            const pointCards = leadSuitCards.filter(c => getCardValue(c) >= 5);
            if (pointCards.length > 0) {
                logger.debug(`Standard dump: playing highest point card`);
                return pointCards.reduce((highest, current) =>
                    getCardValue(current) > getCardValue(highest) ? current : highest
                );
            }

            // No point cards in lead suit, play highest non-point card
            logger.debug(`No point cards - playing highest non-point card`);
            return leadSuitCards.reduce((highest, current) =>
                getCardRank(current.rank) > getCardRank(highest.rank) ? current : highest
            );
        }

        // If we don't have lead suit, look for point cards in other suits
        // Since partner is winning, we can safely dump point cards from other suits
        const pointCards = playableCards.filter(c => getCardValue(c) >= 5 && c.suit !== trumpSuit);
        if (pointCards.length > 0) {
            logger.debug(`Playing point card from different suit`);
            return pointCards.reduce((highest, current) =>
                getCardValue(current) > getCardValue(highest) ? current : highest
            );
        }

        // No point cards available, play low card
        logger.debug(`No point cards available - playing low card`);
        return this.selectLowCard(playableCards, leadSuit, trumpSuit);
    }

    // Select card to win the trick
    selectCardToWin(playableCards: Card[], leadSuit: Suit | null, trumpSuit: Suit | null, trickAnalysis: any, myPlayer: Player, game: Game): Card {
        if (!leadSuit) {
            // First to play - play a strong card but not necessarily our strongest
            return this.selectStrongCard(playableCards, trumpSuit);
        }

        const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);
        const trumpCards = playableCards.filter(c => c.suit === trumpSuit);

        // If we have the lead suit, play high card
        if (leadSuitCards.length > 0) {
            const currentWinningRank = trickAnalysis.currentWinningCard ?
                getCardRank(trickAnalysis.currentWinningCard.card.rank) : 0;

            const winningCards = leadSuitCards.filter(c =>
                getCardRank(c.rank) > currentWinningRank
            );

            if (winningCards.length > 0) {
                // Play the lowest winning card (save high cards)
                return winningCards.reduce((lowest, current) =>
                    getCardRank(current.rank) < getCardRank(lowest.rank) ? current : lowest
                );
            }
            // Can't win with lead suit, play lowest lead suit card
            return this.selectLowCard(leadSuitCards, leadSuit, trumpSuit);
        }

        // If we don't have winning lead suit, consider using trump
        if (trumpCards.length > 0 && trickAnalysis.currentWinningCard?.card.suit !== trumpSuit) {
            // Only trump if there are points worth winning (5+)
            if (trickAnalysis.pointsInTrick >= 5) {
                // Use lowest trump to win
                return trumpCards.reduce((lowest, current) =>
                    getCardRank(current.rank) < getCardRank(lowest.rank) ? current : lowest
                );
            }
        }

        // Can't win or not worth it, play low card
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
            // First to play - prefer low to medium cards, avoid high cards and points
            const nonTrumpCards = playableCards.filter(c => c.suit !== trumpSuit);
            const lowToMediumCards = playableCards.filter(c => {
                const rank = getCardRank(c.rank);
                const value = getCardValue(c);
                // Avoid aces, and avoid 10s and 5s (points)
                return rank <= 11 && value === 0; // J or below, no point value
            });

            if (lowToMediumCards.length > 0) {
                // Play a random low-medium card to avoid being predictable
                const randomIndex = Math.floor(Math.random() * lowToMediumCards.length);
                return lowToMediumCards[randomIndex]!;
            }

            // If no low-medium cards, play lowest available non-trump
            if (nonTrumpCards.length > 0) {
                return this.selectLowCard(nonTrumpCards, leadSuit, trumpSuit);
            }
        }

        // Follow suit if possible, play low to save high cards
        const leadSuitCards = playableCards.filter(c => c.suit === leadSuit);
        if (leadSuitCards.length > 0) {
            // Check if we have a realistic chance to win
            if (trickAnalysis.currentWinningCard) {
                const currentWinningRank = getCardRank(trickAnalysis.currentWinningCard.card.rank);
                const canWin = leadSuitCards.some(c => getCardRank(c.rank) > currentWinningRank);

                if (!canWin || trickAnalysis.pointsInTrick < 5) {
                    // Can't win or not worth it - play lowest card
                    return this.selectLowCard(leadSuitCards, leadSuit, trumpSuit);
                }
            }
            // Play lowest card by default
            return this.selectLowCard(leadSuitCards, leadSuit, trumpSuit);
        }

        // Don't have lead suit - avoid playing trump unless necessary
        const nonTrumpCards = playableCards.filter(c => c.suit !== trumpSuit);
        if (nonTrumpCards.length > 0) {
            return this.selectLowCard(nonTrumpCards, leadSuit, trumpSuit);
        }

        return this.selectLowCard(playableCards, leadSuit, trumpSuit);
    }

    // Helper method to get team points so far in current round
    getTeamPointsSoFar(game: Game, team: 'team1' | 'team2'): number {
        // Return the round scores which track points accumulated during current round
        return game.roundScores[team] || 0;
    }
}
