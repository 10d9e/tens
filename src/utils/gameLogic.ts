import { Card, Suit, Rank, Player, Bid, Trick, GameState } from '../types/game';

// Card values for scoring
export const CARD_VALUES: Record<Rank, number> = {
    'A': 10,
    'K': 0,
    'Q': 0,
    'J': 0,
    '10': 10,
    '9': 0,
    '8': 0,
    '7': 0,
    '6': 0,
    '5': 5
};

// Create the modified deck (removing 2s, 3s, 4s)
export function createDeck(): Card[] {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '5'];

    const deck: Card[] = [];
    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push({
                suit,
                rank,
                id: `${suit}-${rank}`
            });
        });
    });

    return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export function dealCards(deck: Card[], players: Player[]): Player[] {
    const updatedPlayers = [...players];
    let cardIndex = 0;

    // Deal 9 cards to each player (36 cards total)
    for (let i = 0; i < 9; i++) {
        updatedPlayers.forEach(player => {
            if (cardIndex < deck.length) {
                player.cards.push(deck[cardIndex++]);
            }
        });
    }

    return updatedPlayers;
}

export function getCardValue(card: Card): number {
    return CARD_VALUES[card.rank];
}

export function canPlayCard(card: Card, leadSuit: Suit | null, _trumpSuit: Suit, playerCards: Card[]): boolean {
    if (!leadSuit) return true; // First card of trick

    // Must follow suit if possible
    const hasLeadSuit = playerCards.some(c => c.suit === leadSuit);
    if (hasLeadSuit) {
        return card.suit === leadSuit;
    }

    return true; // Can play any card if can't follow suit
}

export function getTrickWinner(trick: Trick, trumpSuit: Suit): string {
    if (trick.cards.length === 0) return '';

    const leadSuit = trick.cards[0].card.suit;
    let winningCard = trick.cards[0];

    for (const { card, playerId } of trick.cards) {
        if (card.suit === trumpSuit && winningCard.card.suit !== trumpSuit) {
            winningCard = { card, playerId };
        } else if (card.suit === trumpSuit && winningCard.card.suit === trumpSuit) {
            if (getCardRank(card.rank) > getCardRank(winningCard.card.rank)) {
                winningCard = { card, playerId };
            }
        } else if (card.suit === leadSuit && winningCard.card.suit === leadSuit) {
            if (getCardRank(card.rank) > getCardRank(winningCard.card.rank)) {
                winningCard = { card, playerId };
            }
        }
    }

    return winningCard.playerId;
}

export function getCardRank(rank: Rank): number {
    const ranks: Record<Rank, number> = {
        'A': 14,
        'K': 13,
        'Q': 12,
        'J': 11,
        '10': 10,
        '9': 9,
        '8': 8,
        '7': 7,
        '6': 6,
        '5': 5
    };
    return ranks[rank];
}

export function calculateTrickPoints(trick: Trick): number {
    return trick.cards.reduce((total, { card }) => total + getCardValue(card), 0);
}

export function isValidBid(bid: Bid, currentBid?: Bid): boolean {
    // Minimum bid is 50, all bids must be multiples of 5
    if (bid.points < 50 || bid.points % 5 !== 0) return false;
    if (!currentBid) return true;
    return bid.points > currentBid.points;
}

export function getNextPlayer(currentPlayerId: string, players: Player[]): string {
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    const nextIndex = (currentIndex + 1) % players.length;
    return players[nextIndex].id;
}

export function getPlayerTeam(playerId: string, players: Player[]): 'team1' | 'team2' {
    const player = players.find(p => p.id === playerId);
    if (!player) return 'team1';
    return player.position % 2 === 0 ? 'team1' : 'team2';
}

export function isGameOver(gameState: GameState): boolean {
    const target = gameState.scoreTarget || 200;
    return gameState.teamScores.team1 >= target || gameState.teamScores.team2 >= target ||
        gameState.teamScores.team1 <= -target || gameState.teamScores.team2 <= -target;
}

export function getWinningTeam(gameState: GameState): 'team1' | 'team2' | null {
    const target = gameState.scoreTarget || 200;
    if (gameState.teamScores.team1 >= target) return 'team1';
    if (gameState.teamScores.team2 >= target) return 'team2';
    if (gameState.teamScores.team1 <= -target) return 'team2'; // team1 loses
    if (gameState.teamScores.team2 <= -target) return 'team1'; // team2 loses
    return null;
}

export function calculateRoundScores(
    gameState: GameState,
    contractorTeam: 'team1' | 'team2',
    contractorCardPoints: number,
    opposingCardPoints: number,
    opposingTeamBid: boolean
): { team1Score: number; team2Score: number } {
    const currentBid = gameState.currentBid;
    if (!currentBid) return { team1Score: 0, team2Score: 0 };

    const contractorScore = gameState.teamScores[contractorTeam];
    const opposingScore = gameState.teamScores[contractorTeam === 'team1' ? 'team2' : 'team1'];

    let newContractorScore = contractorScore;
    let newOpposingScore = opposingScore;

    // Contractor team scoring
    if (contractorCardPoints >= currentBid.points) {
        // Contractor made their bid - add card points to their score
        newContractorScore += contractorCardPoints;
    } else {
        // Contractor failed - subtract bid amount from their score
        newContractorScore -= currentBid.points;
    }

    // Opposing team scoring
    if (opposingScore >= 100 && !opposingTeamBid) {
        // Opposing team has 100+ points and didn't bid - they score nothing
        newOpposingScore += 0;
    } else {
        // Opposing team gets their card points
        newOpposingScore += opposingCardPoints;
    }

    return {
        team1Score: contractorTeam === 'team1' ? newContractorScore : newOpposingScore,
        team2Score: contractorTeam === 'team2' ? newContractorScore : newOpposingScore
    };
}
