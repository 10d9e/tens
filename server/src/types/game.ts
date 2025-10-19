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
    isSpectator?: boolean; // New field to identify spectators
    ai?: any; // AI instance for bot players
}

export interface Bid {
    playerId: string;
    points: number;
    suit?: Suit;
}

export interface Trick {
    cards: { card: Card; playerId: string }[];
    winner?: string | undefined;
    points: number;
}

export interface Round {
    tricks: Trick[];
    roundNumber: number;
    contractorTeam?: 'team1' | 'team2' | undefined;
    trumpSuit?: Suit | undefined;
    bid?: Bid | undefined;
    roundScores: { team1: number; team2: number };
}

export interface Game {
    id: string;
    tableId: string; // Add tableId property
    players: Player[];
    currentPlayer: string;
    phase: 'waiting' | 'bidding' | 'kitty' | 'playing' | 'finished';
    trumpSuit?: Suit | undefined;
    currentBid?: Bid | undefined;
    currentTrick: Trick;
    lastTrick?: Trick | undefined;
    round: number;
    teamScores: { team1: number; team2: number };
    roundScores: { team1: number; team2: number }; // Points accumulated during current round
    dealer: string;
    spectatorIds: string[];
    contractorTeam?: 'team1' | 'team2' | undefined; // Track which team is the contractor
    biddingPasses?: number; // Track number of consecutive passes
    biddingRound?: number; // Track which round of bidding we're in
    playersWhoHavePassed?: Set<string>; // Track which players have passed during current bidding round
    playerTurnStartTime?: { [playerId: string]: number }; // Track when each player's turn started
    timeoutDuration?: number; // Timeout duration in milliseconds
    deckVariant?: '36' | '40'; // Track which deck variant is being used
    scoreTarget?: 200 | 300 | 500 | 1000; // Track the score target for winning
    // Kitty-related fields
    hasKitty?: boolean; // Whether this game uses kitty
    kitty?: Card[] | undefined; // The kitty cards
    kittyDiscards?: Card[] | undefined; // Cards discarded to kitty by winning bidder
    kittyPhaseCompleted?: boolean; // Track if kitty phase is completed
    // Additional game properties
    deck?: Card[]; // The game deck
    opposingTeamBid?: number; // Track opposing team's bid
    // Round tracking
    rounds: Round[]; // Completed rounds
    currentRound?: Round | undefined; // Current round being played
}

export interface Table {
    id: string;
    name: string;
    players: Player[];
    gameState?: Game | undefined;
    maxPlayers: number;
    isPrivate: boolean;
    password?: string;
    creator?: string;
    timeoutDuration?: number;
    deckVariant?: '36' | '40';
    scoreTarget?: 200 | 300 | 500 | 1000;
    hasKitty?: boolean; // Whether this table uses kitty (only available with 40-card deck)
    spectators?: Player[]; // New field to track spectators
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

export interface TranscriptEntry {
    timestamp: number;
    type: 'game_start' | 'round_start' | 'bid_made' | 'bid_pass' | 'bidding_complete' | 'kitty_pick' | 'kitty_discard' | 'card_played' | 'trick_complete' | 'round_complete' | 'game_complete' | 'player_exit';
    data: any; // Will contain relevant data for each action type
    gameState: Partial<Game>; // Snapshot of relevant game state at this point
}

export interface GameTranscript {
    gameId: string;
    tableId: string;
    tableName?: string;
    startTime: number;
    endTime?: number;
    entries: TranscriptEntry[];
    metadata: {
        deckVariant: '36' | '40';
        scoreTarget: number;
        hasKitty: boolean;
        playerNames: { [playerId: string]: string };
        playerPositions: { [playerId: string]: number };
    };
}

export interface Lobby {
    id: string;
    name: string;
    tables: Map<string, Table>;
    players: Map<string, Player>;
    chatMessages: ChatMessage[];
}