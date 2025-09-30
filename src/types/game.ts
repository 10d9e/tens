export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | 'K' | 'Q' | 'J' | '10' | '9' | '8' | '7' | '5';

export interface Card {
    suit: Suit;
    rank: Rank;
    id: string;
}

export interface Player {
    id: string;
    name: string;
    isBot: boolean;
    botSkill?: 'easy' | 'medium' | 'hard';
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
    phase: 'waiting' | 'bidding' | 'playing' | 'finished';
    trumpSuit?: Suit;
    currentBid?: Bid;
    currentTrick: Trick;
    lastTrick?: Trick;
    round: number;
    teamScores: { team1: number; team2: number };
    dealer: string;
    spectatorIds: string[];
}

export interface LobbyTable {
    id: string;
    name: string;
    players: Player[];
    gameState?: GameState;
    maxPlayers: number;
    isPrivate: boolean;
    password?: string;
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
