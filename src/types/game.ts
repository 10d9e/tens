export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '6' | '5';

export interface Card {
    suit: Suit;
    rank: Rank;
    id: string;
}

export interface Player {
    id: string;
    name: string;
    isBot: boolean;
    botSkill?: 'easy' | 'medium' | 'hard' | 'acadien';
    position: 0 | 1 | 2 | 3; // 0=North, 1=East, 2=South, 3=West
    cards: Card[];
    score: number;
    isReady: boolean;
}

export interface Bid {
    playerId: string;
    points: number;
    suit?: Suit;
}

export interface Trick {
    cards: { card: Card; playerId: string }[];
    winner?: string;
    points: number;
}

export interface GameState {
    id: string;
    players: Player[];
    currentPlayer: string;
    phase: 'waiting' | 'bidding' | 'kitty' | 'playing' | 'finished';
    trumpSuit?: Suit;
    currentBid?: Bid;
    currentTrick: Trick;
    lastTrick?: Trick;
    round: number;
    teamScores: { team1: number; team2: number };
    roundScores: { team1: number; team2: number }; // Points accumulated during current round
    dealer: string;
    spectatorIds: string[];
    contractorTeam?: 'team1' | 'team2'; // Track which team is the contractor
    biddingPasses?: number; // Track number of consecutive passes
    playersWhoHavePassed?: string[]; // Track which players have passed during current bidding round
    playerTurnStartTime?: { [playerId: string]: number }; // Track when each player's turn started
    timeoutDuration?: number; // Timeout duration in milliseconds
    deckVariant?: '36' | '40'; // Track which deck variant is being used
    scoreTarget?: 200 | 300 | 500 | 1000; // Track the score target for winning
    // Kitty-related fields
    hasKitty?: boolean; // Whether this game uses kitty
    kitty?: Card[]; // The kitty cards
    kittyDiscards?: Card[]; // Cards discarded to kitty by winning bidder
}

export interface LobbyTable {
    id: string;
    name: string;
    players: Player[];
    gameState?: GameState;
    maxPlayers: number;
    isPrivate: boolean;
    password?: string;
    creator?: string;
    timeoutDuration?: number;
    deckVariant?: '36' | '40';
    scoreTarget?: 200 | 300 | 500 | 1000;
    hasKitty?: boolean; // Whether this table uses kitty (only available with 40-card deck)
}

export interface ChatMessage {
    id: string;
    playerId: string;
    playerName: string;
    message: string;
    timestamp: number;
    type: 'chat' | 'system' | 'emoji';
}

export interface GameEvent {
    type: 'card_played' | 'trick_won' | 'bid_made' | 'game_started' | 'game_ended';
    data: any;
    timestamp: number;
}
