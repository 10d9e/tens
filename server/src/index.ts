import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import logger from './logger';

// Import types from client
import type {
    Card,
    Player,
    Bid,
    Trick,
    GameState,
    LobbyTable,
    ChatMessage,
    GameEvent,
    Suit,
    Rank
} from './types/game';

const app = express();
const server = createServer(app);

const io = new SocketIOServer(server, {
    cors: {
        origin: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://192.168.2.15:3000",
            /^http:\/\/192\.168\.\d+\.\d+:3000$/,  // Allow any 192.168.x.x:3000
            process.env.FRONTEND_URL || "https://200.cards"  // Production frontend URL
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.2.15:3000",
        /^http:\/\/192\.168\.\d+\.\d+:3000$/,  // Allow any 192.168.x.x:3000
        process.env.FRONTEND_URL || "https://200.cards"  // Production frontend URL
    ],
    credentials: true
}));
app.use(express.json());

// Serve static files from the React app build
app.use(express.static('dist'));

// Handle React routing, return all requests to React app
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Game state storage
const games = new Map<string, GameState>();
const lobbies = new Map<string, { id: string; name: string; tables: Map<string, LobbyTable> }>();
const players = new Map<string, Player>();

// Initialize a default lobby
const defaultLobby = {
    id: 'default',
    name: 'Main Lobby',
    tables: new Map()
};
lobbies.set('default', defaultLobby);


/* game helpers */

// Create multiple default tables with 3 bot players each
function create3BotTables(numTables = 1) {
    for (let tableNum = 1; tableNum <= numTables; tableNum++) {
        const tableId = tableNum === 1 ? 'robot-fun-table' : `robot-fun-table-${tableNum}`;
        const tableName = tableNum === 1 ? 'Robot Fun' : `Robot Fun ${tableNum}`;

        const table: LobbyTable = {
            id: tableId,
            name: tableName,
            players: [],
            maxPlayers: 4,
            isPrivate: false,
            deckVariant: '36', // Default to 36-card deck
            scoreTarget: 200, // Default to 200 points
            hasKitty: false // Default to no kitty
        };

        // Add 3 bot players (without AI for now, will be added when game starts)
        // Position them sequentially (0, 1, 2) leaving position 3 for human player
        const botSkills = ['easy', 'medium', 'hard', 'acadien'];
        for (let i = 0; i < 3; i++) {
            const botId = `bot-${uuidv4()}`;
            const botName = getRandomHumanName();
            const bot: Player = {
                id: botId,
                name: botName,
                isBot: true,
                botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
                position: i as 0 | 1 | 2 | 3, // Sequential positions: 0, 1, 2
                cards: [],
                score: 0,
                isReady: true
            };
            table.players.push(bot);
        }

        defaultLobby.tables.set(tableId, table);
        logger.info(`Created default table "${tableName}" with 3 bot players`);
    }
}

// Human names for bots
const humanNames = [
    'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry',
    'Ivy', 'Jack', 'Kate', 'Liam', 'Maya', 'Noah', 'Olivia', 'Paul',
    'Quinn', 'Ruby', 'Sam', 'Tara', 'Uma', 'Victor', 'Wendy', 'Xavier',
    'Yara', 'Zoe', 'Alex', 'Blake', 'Casey', 'Drew', 'Emery', 'Finley',
    'Gabriel', 'Harper', 'Isaac', 'Jordan', 'Kai', 'Luna', 'Max', 'Nora',
    'Owen', 'Piper', 'Quentin', 'Riley', 'Sage', 'Taylor', 'Val', 'Willow'
];

// Global set to track used names across all players (human and bot)
const usedNames = new Set();

// Function to get a unique random human name for bots
function getRandomHumanName(): string {
    // Filter out already used names
    const availableNames = humanNames.filter(name => !usedNames.has(name));

    if (availableNames.length === 0) {
        // If all names are used, append a number to make it unique
        const baseName = humanNames[Math.floor(Math.random() * humanNames.length)];
        let counter = 1;
        let uniqueName = `${baseName}${counter}`;
        while (usedNames.has(uniqueName)) {
            counter++;
            uniqueName = `${baseName}${counter}`;
        }
        usedNames.add(uniqueName);
        return uniqueName;
    }

    // Pick a random available name
    const selectedName = availableNames[Math.floor(Math.random() * availableNames.length)];
    if (!selectedName) {
        // Fallback if somehow no name is selected
        const fallbackName = `Player${Date.now()}`;
        usedNames.add(fallbackName);
        return fallbackName;
    }
    usedNames.add(selectedName);
    return selectedName;
}

// Function to check if a human name is available and reserve it
function reservePlayerName(playerName: string): boolean {
    if (usedNames.has(playerName)) {
        logger.warn(`Name "${playerName}" is already taken`);
        return false; // Name already taken
    }
    usedNames.add(playerName);
    logger.info(`Reserved name "${playerName}". Available names: ${usedNames.size} used, ${humanNames.length - usedNames.size} available`);
    return true; // Name reserved successfully
}

// Function to release a name when a player disconnects
function releasePlayerName(playerName: string): void {
    usedNames.delete(playerName);
    logger.info(`Released name "${playerName}". Available names: ${usedNames.size} used, ${humanNames.length - usedNames.size} available`);
}

// Helper function to notify only lobby members (not players in active games)
function notifyLobbyMembers(lobbyId: string, event: string, data: any): void {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;

    const tablesArray = Array.from(lobby.tables.values());
    const lobbyData = { ...lobby, tables: tablesArray };

    // Get all sockets in the lobby room
    const lobbySockets = io.sockets.adapter.rooms.get(lobbyId);
    if (!lobbySockets) return;

    // Only notify sockets that are in the lobby but not in any active game
    lobbySockets.forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
            // Check if this socket is in any table room (indicating active game)
            let inActiveGame = false;
            for (const [tableId, table] of lobby.tables) {
                if (socket.rooms.has(`table-${tableId}`) && table.gameState && table.gameState.phase !== 'finished') {
                    inActiveGame = true;
                    break;
                }
            }

            // Only notify if not in an active game
            if (!inActiveGame) {
                socket.emit(event, data);
            }
        }
    });
}

// Helper function to ensure playersWhoHavePassed is always a Set
function ensurePlayersWhoHavePassedIsSet(game: GameState): void {
    if (game.playersWhoHavePassed && !(game.playersWhoHavePassed instanceof Set)) {
        logger.info('Converting playersWhoHavePassed from', typeof game.playersWhoHavePassed, 'to Set');
        game.playersWhoHavePassed = new Set(game.playersWhoHavePassed);
    }
}

// Helper function to emit game events to the correct room (game-specific if active, table-specific if not)
function emitGameEvent(game: GameState | null, event: string, data: any): void {
    // Ensure playersWhoHavePassed is a Set before processing
    if (data && data.game) {
        ensurePlayersWhoHavePassedIsSet(data.game);
    }

    // Create a deep copy of the data to avoid modifying the original game object
    const serializedData = JSON.parse(JSON.stringify(data, (key, value) => {
        // Convert Set to Array for JSON serialization
        if (value instanceof Set) {
            return Array.from(value);
        }
        return value;
    }));

    if (game && game.id && game.phase !== 'finished') {
        // Game is active, use game-specific room
        io.to(`game-${game.id}`).emit(event, serializedData);
        // Also emit to spectator room if it exists
        io.to(`spectator-${game.tableId}`).emit(event, serializedData);
    } else if (game && game.tableId) {
        // Game is finished or not active, use table room
        io.to(`table-${game.tableId}`).emit(event, serializedData);
    }
}

// Helper function to clean up game-specific socket rooms when game ends
function cleanupGameRoom(game: GameState): void {
    if (game && game.id) {
        // Remove all players from the game-specific room
        const gameRoom = io.sockets.adapter.rooms.get(`game-${game.id}`);
        if (gameRoom) {
            gameRoom.forEach(socketId => {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    socket.leave(`game-${game.id}`);
                }
            });
        }
        logger.info(`Cleaned up game room: game-${game.id}`);
    }
}

// Function to reset table state after game completion
function resetTableAfterGameCompletion(tableId: string): void {
    const lobby = lobbies.get('default');
    const table = lobby?.tables.get(tableId);

    if (!table) {
        logger.warn(`Table ${tableId} not found for reset`);
        return;
    }

    logger.info(`Resetting table ${tableId} after game completion`);

    // Remove all human players from the table
    /*
    const humanPlayers = table.players.filter(player => !player.isBot);
    humanPlayers.forEach(player => {
        logger.info(`Removing human player ${player.name} from table ${tableId}`);
        // Remove player from players map
        players.delete(player.id);
        // Release their name
        releasePlayerName(player.name);
    });
    */

    // Remove all spectators and notify them
    if (table.spectators && table.spectators.length > 0) {
        logger.info(`Removing ${table.spectators.length} spectators from table ${tableId}`);

        table.spectators.forEach(spectator => {
            // Notify spectator that the game ended
            const spectatorSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === spectator.id);
            if (spectatorSocket) {
                spectatorSocket.leave(`table-${tableId}`);
                spectatorSocket.leave(`spectator-${tableId}`);
                spectatorSocket.emit('game_ended_for_spectator', {
                    message: 'The game has ended. Returning to lobby.',
                    reason: 'Game ended'
                });

                // Return spectator to lobby
                if (lobby) {
                    spectatorSocket.emit('lobby_joined', {
                        lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                        player: spectator
                    });
                }
            }
        });

        // Clear spectators array
        table.spectators = [];
    }

    // Keep only bot players
    table.players = table.players.filter(player => player.isBot);

    // Reset table state
    table.gameState = undefined;

    // Reset bot player states
    table.players.forEach(player => {
        player.cards = [];
        player.score = 0;
        player.isReady = true;
    });

    logger.info(`Table ${tableId} reset complete. Remaining players: ${table.players.length} bots`);

    // Notify lobby about the updated table
    if (lobby) {
        notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
    }

    // Notify any remaining table members
    io.to(`table-${tableId}`).emit('table_updated', { table });
}

// Function to debug and print all players' cards
function debugPrintAllPlayerCards(game: GameState, context: string = ''): void {
    logger.debug(`\n🃏 DEBUG: All Players' Cards ${context ? `(${context})` : ''}`);
    logger.debug('='.repeat(50));
    game.players.forEach((player, index) => {
        const playerType = player.isBot ? '🤖 BOT' : '👤 HUMAN';
        const cardsList = player.cards.map(card => {
            const suitSymbols = {
                'hearts': '❤️',
                'diamonds': '♦️',
                'clubs': '♣️',
                'spades': '♠️'
            };
            return `${card.rank}${suitSymbols[card.suit] || card.suit}`;
        }).join(', ');
        logger.debug(`${index + 1}. ${player.name} (${playerType}) - ${player.cards.length} cards: [${cardsList}]`);
    });
    logger.debug('='.repeat(50));
    logger.debug(`Total cards in play: ${game.players.reduce((sum, player) => sum + player.cards.length, 0)}/36\n`);

    // if the card count in everyone's hand is not equal, throw an error
    const cardCounts = game.players.map(player => player.cards.length);
    if (cardCounts.some(count => count !== cardCounts[0])) {
        logger.error('🚨🚨🚨🚨 ERROR: Card counts are not equal');
        throw new Error('🚨🚨🚨🚨 ERROR: Card counts are not equal');
    }
}

// Function to debug kitty state
function debugKittyState(game: GameState, context: string = ''): void {
    logger.debug(`\n🐱 DEBUG: Kitty State ${context ? `(${context})` : ''}`);
    logger.debug('='.repeat(50));
    logger.debug(`Round: ${game.round}`);
    logger.debug(`HasKitty: ${game.hasKitty}`);
    logger.debug(`KittyPhaseCompleted: ${game.kittyPhaseCompleted}`);
    logger.debug(`DeckVariant: ${game.deckVariant}`);
    logger.debug(`Kitty exists: ${!!game.kitty}`);
    logger.debug(`Kitty length: ${game.kitty?.length || 0}`);
    logger.debug(`Kitty cards: ${game.kitty?.map(c => `${c.rank}${c.suit}`).join(', ') || 'None'}`);
    logger.debug(`Phase: ${game.phase}`);
    logger.debug(`Current Player: ${game.currentPlayer}`);
    logger.debug('='.repeat(50));
}

// Function to validate kitty state and log warnings
function validateKittyState(game: GameState, context: string = ''): boolean {
    const issues = [];

    if (game.hasKitty && game.deckVariant !== '40') {
        issues.push('hasKitty is true but deckVariant is not 40');
    }

    if (game.hasKitty && !game.kitty) {
        issues.push('hasKitty is true but kitty array is missing');
    }

    if (game.hasKitty && game.kitty && game.kitty.length === 0 && !game.kittyPhaseCompleted) {
        issues.push('hasKitty is true but kitty is empty and phase not completed');
    }

    if (game.kittyPhaseCompleted && game.hasKitty && game.kitty && game.kitty.length > 0) {
        issues.push('kittyPhaseCompleted is true but kitty still has cards');
    }

    if (issues.length > 0) {
        logger.warn(`\n⚠️  KITTY STATE VALIDATION ISSUES ${context ? `(${context})` : ''}:`);
        logger.debug('='.repeat(60));
        issues.forEach(issue => logger.warn(`- ${issue}`));
        logger.debug('='.repeat(60));
        debugKittyState(game, context);
    }

    return issues.length === 0;
}

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
        // Add variable delay based on skill level to simulate thinking time
        /*
        let delay;
        switch (this.skill) {
            case 'easy':
                delay = Math.random() * 6000 + 2000; // Random delay between 2000-8000ms (2-8 seconds)
                break;
            case 'medium':
                delay = Math.random() * 3000 + 1000; // Random delay between 1000-4000ms (1-4 seconds)
                break;
            case 'hard':
                delay = Math.random() * 1000 + 1000; // Random delay between 1000-2000ms (1-2 seconds)
                break;
            default:
                delay = Math.random() * 2000 + 1000; // Default fallback
        }
        const delay = 1000;
        logger.debug(`${this.skill} bot thinking for ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        */

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
        } else {
            return null; // Don't bid with less than 35 points
        }

        // Adjust based on game state
        if (gameStateAnalysis.teamBehind) {
            suggestedBid += 5; // Be more aggressive if behind
        }
        if (gameStateAnalysis.lateInGame) {
            suggestedBid -= 5; // Be more conservative if late in game
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
            criticalStage: Math.max(Math.abs(myScore), Math.abs(opponentScore)) > target * 0.8
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

// Create a Big Bub table with 2 bot players
function createBigBubTable(): LobbyTable {
    const tableId = 'big-bub-table';
    const table: LobbyTable = {
        id: tableId,
        name: 'Big Bub',
        players: [],
        gameState: undefined,
        maxPlayers: 4,
        isPrivate: false,
        deckVariant: '36' as '36' | '40', // Default to 36-card deck
        scoreTarget: 200, // Default to 200 points
        hasKitty: false // Default to no kitty
    };

    // Add 2 bot players at North (0) and South (2), leaving East (1) and West (3) for human players
    const botSkills = ['medium', 'hard'];
    const botPositions = [0, 2]; // North and South
    for (let i = 0; i < 2; i++) {
        const botId = `bot-${uuidv4()}`;
        const botName = getRandomHumanName();
        const bot: Player = {
            id: botId,
            name: botName,
            isBot: true,
            botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
            position: botPositions[i] as 0 | 1 | 2 | 3,
            cards: [],
            score: 0,
            isReady: true
        };
        table.players.push(bot);
    }

    defaultLobby.tables.set(tableId, table);
    logger.info('Created Big Bub table with 2 bot players');
    return table;
}

// Create Acadie test table with kitty enabled
function createAcadieTable() {
    const tableId = 'acadie-table';

    const table: LobbyTable = {
        id: tableId,
        name: 'Acadie',
        players: [],
        gameState: undefined,
        maxPlayers: 4,
        isPrivate: false,
        deckVariant: '40' as '36' | '40', // 40-card variant
        scoreTarget: 200,
        hasKitty: true, // Kitty enabled
        timeoutDuration: 300000 // 5 minutes (300,000 ms)
    };

    // Add 3 hard bot players
    const botSkills = ['hard', 'hard', 'hard'];
    for (let i = 0; i < 3; i++) {
        const botId = `bot-${uuidv4()}`;
        const botName = getRandomHumanName();
        const bot: Player = {
            id: botId,
            name: botName,
            isBot: true,
            botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
            position: i as 0 | 1 | 2 | 3,
            cards: [],
            score: 0,
            isReady: true
        };
        table.players.push(bot);
    }

    defaultLobby.tables.set(tableId, table);
    logger.info('Created Acadie test table with 3 hard bots, 40-card deck, kitty enabled');
}

// Create an Acadien test table with advanced bots
function createAcadienTestTable() {
    const tableId = 'acadien-test-table';
    const table: LobbyTable = {
        id: tableId,
        name: 'Acadien Test Table',
        players: [],
        gameState: undefined,
        maxPlayers: 4,
        isPrivate: false,
        deckVariant: '36' as '36' | '40', // 36-card variant
        scoreTarget: 200,
        hasKitty: false,
        timeoutDuration: 300000 // 5 minutes
    };

    // Add 3 acadien bot players
    const botSkills = ['acadien', 'acadien', 'acadien'];
    for (let i = 0; i < 3; i++) {
        const botId = `bot-${uuidv4()}`;
        const botName = getRandomHumanName();
        const bot: Player = {
            id: botId,
            name: botName,
            isBot: true,
            botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
            position: i as 0 | 1 | 2 | 3,
            cards: [],
            score: 0,
            isReady: true
        };
        table.players.push(bot);
    }

    defaultLobby.tables.set(tableId, table);
    logger.info('Created Acadien test table with 3 acadien bots');
}

// Game logic functions
function createDeck(deckVariant: '36' | '40' = '36'): Card[] {
    const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks: Rank[] = deckVariant === '40'
        ? ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5']  // 40 cards with 6s
        : ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '5'];      // 36 cards standard
    const deck: Card[] = [];

    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push({ suit, rank, id: `${suit}-${rank}` });
        });
    });

    return shuffleDeck(deck);
}

function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = temp;
    }
    return shuffled;
}

function dealCards(deck: Card[], players: Player[], deckVariant: '36' | '40' = '36'): Player[] {
    const updatedPlayers = [...players];
    let cardIndex = 0;

    // For 40-card deck with kitty: deal 9 cards per player (36 total, 4 for kitty)
    // For 36-card deck: deal 9 cards per player (36 total, no kitty)
    // For 40-card deck without kitty: deal 10 cards per player (40 total, no kitty)
    const cardsPerPlayer = deckVariant === '40' ? 9 : 9; // Always 9 for now, kitty logic handled separately

    for (let i = 0; i < cardsPerPlayer; i++) {
        updatedPlayers.forEach(player => {
            if (cardIndex < deck.length) {
                const card = deck[cardIndex++];
                if (card) {
                    player.cards.push(card);
                }
            }
        });
    }

    return updatedPlayers;
}

function getCardValue(card: Card): number {
    const values: { [key in Rank]: number } = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
    return values[card.rank] || 0;
}

function getCardRank(rank: Rank): number {
    const ranks: { [key in Rank]: number } = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5 };
    return ranks[rank] || 0;
}

function getNextPlayerByPosition(currentPlayerId: string, players: Player[]): string {
    const currentPlayer = players.find(p => p.id === currentPlayerId);
    if (!currentPlayer) {
        logger.error('ERROR: Current player not found:', currentPlayerId);
        if (players.length > 0 && players[0]) {
            return players[0].id;
        }
        throw new Error('No players available');
    }

    const nextPosition = (currentPlayer.position + 1) % 4;
    const nextPlayer = players.find(p => p.position === nextPosition);

    return nextPlayer ? nextPlayer.id : (players[0] ? players[0].id : '');
}

function calculateRoundScores(game: GameState, contractorTeam: 'team1' | 'team2', contractorCardPoints: number, opposingCardPoints: number, opposingTeamBid: number): { team1Score: number; team2Score: number } {
    const currentBid = game.currentBid;
    if (!currentBid) return { team1Score: 0, team2Score: 0 };

    const contractorScore = game.teamScores[contractorTeam];
    const opposingScore = game.teamScores[contractorTeam === 'team1' ? 'team2' : 'team1'];

    let newContractorScore = contractorScore;
    let newOpposingScore = opposingScore;

    // Calculate kitty discards points (go to defending team)
    let kittyDiscardPoints = 0;
    if (game.kittyDiscards && game.kittyDiscards.length > 0) {
        kittyDiscardPoints = game.kittyDiscards.reduce((total, card) => total + getCardValue(card), 0);
        logger.info(`Kitty discards worth ${kittyDiscardPoints} points going to defending team`);
    }

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

    // Add kitty discard points to opposing team (defending team)
    newOpposingScore += kittyDiscardPoints;

    return {
        team1Score: contractorTeam === 'team1' ? newContractorScore : newOpposingScore,
        team2Score: contractorTeam === 'team2' ? newContractorScore : newOpposingScore
    };
}

// Helper function to check if game has ended
function isGameEnded(game: GameState): boolean {
    const target = game.scoreTarget || 200;
    return game.teamScores.team1 >= target || game.teamScores.team2 >= target ||
        game.teamScores.team1 <= -target || game.teamScores.team2 <= -target;
}

// Helper function to determine winning team
function getWinningTeam(game: GameState): { team: 'team1' | 'team2'; name: string } | null {
    const target = game.scoreTarget || 200;
    if (game.teamScores.team1 >= target) return { team: 'team1', name: 'Team 1' };
    if (game.teamScores.team2 >= target) return { team: 'team2', name: 'Team 2' };
    if (game.teamScores.team1 <= -target) return { team: 'team2', name: 'Team 2' }; // team1 loses
    if (game.teamScores.team2 <= -target) return { team: 'team1', name: 'Team 1' }; // team2 loses
    return null;
}

function createGame(tableId: string, timeoutDuration: number = 30000, deckVariant: '36' | '40' = '36', scoreTarget: 200 | 300 | 500 | 1000 = 200): GameState {
    const gameId = uuidv4();

    // Get the table to copy players from
    const lobby = lobbies.get('default');
    const table = lobby?.tables.get(tableId);

    const game: GameState = {
        id: gameId,
        tableId,
        players: table ? [...table.players] : [], // Copy players from table
        currentPlayer: '', // Will be set when game starts
        phase: 'waiting',
        trumpSuit: undefined,
        currentBid: undefined,
        currentTrick: { cards: [], winner: undefined, points: 0 },
        lastTrick: undefined,
        round: 0,
        teamScores: { team1: 0, team2: 0 },
        roundScores: { team1: 0, team2: 0 }, // Points accumulated during current round
        dealer: '', // Will be set when game starts
        spectatorIds: [],
        deck: createDeck(deckVariant),
        deckVariant: deckVariant, // Store the deck variant in the game
        scoreTarget: scoreTarget, // Store the score target in the game
        hasKitty: table?.hasKitty || false, // Copy kitty setting from table
        kittyPhaseCompleted: false, // Track if kitty phase has been completed for current round
        contractorTeam: undefined, // Track which team is the contractor
        opposingTeamBid: 0, // Track if opposing team made any bid
        biddingPasses: 0, // Track number of consecutive passes
        playersWhoHavePassed: new Set(), // Track which players have passed and cannot bid again
        playerTurnStartTime: {}, // Track when each player's turn started: {playerId: timestamp}
        timeoutDuration: timeoutDuration // Custom timeout duration in milliseconds
    };

    games.set(gameId, game);
    return game;
}

function addBotPlayer(game: GameState, skill: 'easy' | 'medium' | 'hard' | 'acadien' = 'medium'): Player {
    const botId = `bot-${uuidv4()}`;
    const botName = getRandomHumanName();
    const bot: Player = {
        id: botId,
        name: botName,
        isBot: true,
        botSkill: skill,
        position: game.players.length as 0 | 1 | 2 | 3,
        cards: [],
        score: 0,
        isReady: true,
        ai: skill === 'acadien' ? new AcadienBotAI() : new SimpleBotAI(skill)
    };

    game.players.push(bot);
    return bot;
}

function addAItoExistingBots(game: GameState): void {
    // Add AI to existing bot players
    game.players.forEach(player => {
        if (player.isBot && !player.ai) {
            if (player.botSkill === 'acadien') {
                player.ai = new AcadienBotAI();
            } else {
                player.ai = new SimpleBotAI(player.botSkill);
            }
        }
    });
}

function startGame(game: GameState): GameState {
    logger.info('Starting game with players:', game.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })));

    // Add AI to existing bot players
    addAItoExistingBots(game);

    if (game.players.length < 4) {
        logger.info('Adding bots to fill table. Current players:', game.players.length);
        // Add bots to fill the table
        while (game.players.length < 4) {
            const skills: ('easy' | 'medium' | 'hard' | 'acadien')[] = ['easy', 'medium', 'hard', 'acadien'];
            const skill = skills[Math.floor(Math.random() * skills.length)];
            addBotPlayer(game, skill);
        }
    }

    game.deck = createDeck(game.deckVariant || '36');

    // Clear existing cards and deal new ones
    game.players.forEach(player => {
        player.cards = [];
    });

    // Deal cards to players - handle kitty if enabled
    if (game.hasKitty && game.deckVariant === '40') {
        // Kitty dealing: 3-2-3-2-3 pattern
        // Each player gets 3 cards, then 2 to kitty, then 3 more, then 2 more to kitty, then 3 more
        game.kitty = [];
        let cardIndex = 0;

        // First packet: 3 cards to each player
        for (let i = 0; i < 3; i++) {
            game.players.forEach(player => {
                if (game.deck && cardIndex < game.deck.length) {
                    const card = game.deck[cardIndex++];
                    if (card) {
                        player.cards.push(card);
                    }
                }
            });
        }

        // First kitty: 2 cards
        for (let i = 0; i < 2; i++) {
            if (game.deck && cardIndex < game.deck.length) {
                const card = game.deck[cardIndex++];
                if (card) {
                    game.kitty.push(card);
                }
            }
        }

        // Second packet: 3 more cards to each player
        for (let i = 0; i < 3; i++) {
            game.players.forEach(player => {
                if (game.deck && cardIndex < game.deck.length) {
                    const card = game.deck[cardIndex++];
                    if (card) {
                        player.cards.push(card);
                    }
                }
            });
        }

        // Second kitty: 2 more cards
        for (let i = 0; i < 2; i++) {
            if (game.deck && cardIndex < game.deck.length) {
                const card = game.deck[cardIndex++];
                if (card) {
                    game.kitty.push(card);
                }
            }
        }

        // Final packet: 3 more cards to each player
        for (let i = 0; i < 3; i++) {
            game.players.forEach(player => {
                if (game.deck && cardIndex < game.deck.length) {
                    const card = game.deck[cardIndex++];
                    if (card) {
                        player.cards.push(card);
                    }
                }
            });
        }

        logger.info(`Kitty created with ${game.kitty.length} cards`);
    } else {
        // Standard dealing: 9 cards for 36-card deck, 9 cards for 40-card deck (kitty handled separately)
        const cardsPerPlayer = 9; // Always 9 cards per player, kitty logic is handled elsewhere
        logger.debug(`🔍 DEBUG: Initial deal - Deck size: ${game.deck?.length || 0}, Players: ${game.players.length}, Cards per player: ${cardsPerPlayer}`);
        let cardIndex = 0;
        for (let i = 0; i < cardsPerPlayer; i++) {
            game.players.forEach(player => {
                if (game.deck && cardIndex < game.deck.length) {
                    const card = game.deck[cardIndex++];
                    if (card) {
                        player.cards.push(card);
                    }
                } else {
                    logger.warn(`⚠️  WARNING: Not enough cards in deck! Player ${player.name} only got ${player.cards.length} cards`);
                }
            });
        }
        logger.debug(`🔍 DEBUG: After initial dealing - Player card counts:`, game.players.map(p => `${p.name}: ${p.cards.length}`));
    }

    game.phase = 'bidding';
    const firstPlayer = game.players[0];
    if (firstPlayer) {
        game.currentPlayer = firstPlayer.id;
        game.dealer = firstPlayer.id;
        game.round = 1;
        game.playerTurnStartTime = { [firstPlayer.id]: Date.now() };
    }

    logger.info('Game started successfully. Players with cards:', game.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.cards.length
    })));

    // Debug: Print all players' cards at game start
    debugPrintAllPlayerCards(game, 'Game Start - Initial Deal');

    return game;
}


// Periodic timeout check for all active games
setInterval(() => {
    games.forEach((game, gameId) => {
        if (checkPlayerTimeout(game)) {
            logger.info(`Game ${gameId} was cleaned up due to timeout`);
        }
    });
}, 1000); // Check every second

function checkPlayerTimeout(game: GameState): boolean {
    const currentPlayerId = game.currentPlayer;
    const turnStartTime = game.playerTurnStartTime?.[currentPlayerId];

    if (!turnStartTime || !game.timeoutDuration) return false;

    const elapsed = Date.now() - turnStartTime;
    const timeRemaining = game.timeoutDuration - elapsed;

    if (timeRemaining <= 0) {
        // Player has timed out
        const currentPlayer = game.players.find(p => p.id === currentPlayerId);
        const playerName = currentPlayer ? currentPlayer.name : 'Unknown player';

        logger.info(`Player ${playerName} (${currentPlayerId}) timed out after ${game.timeoutDuration}ms`);

        // Clean up game and force all players back to lobby
        cleanupGameDueToTimeout(game, playerName);
        return true;
    }

    return false;
}

function cleanupGameDueToTimeout(game: GameState, timeoutPlayerName: string): void {
    // Get all players in this game
    const gamePlayers = [...game.players];

    // Remove game from memory
    games.delete(game.id);

    // Get the lobby and table
    const lobby = lobbies.get('default');
    const table = lobby?.tables.get(game.tableId);

    if (lobby && table) {
        // Keep only AI players on the table, remove human players
        const botPlayers = gamePlayers.filter(player => player.isBot);
        table.players = botPlayers;
        table.gameState = undefined;

        // Notify all table members about the updated table
        io.to(`table-${game.tableId}`).emit('table_updated', { table });

        // Force only human players back to lobby with timeout message
        gamePlayers.forEach(player => {
            if (!player.isBot) {
                // For human players, emit to their socket
                io.to(player.id).emit('game_timeout', {
                    message: `Game ended due to ${timeoutPlayerName} timing out. Returning to lobby.`
                });
                io.to(player.id).emit('lobby_joined', {
                    lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                    player: player
                });
            }
        });
    }
}

async function checkBiddingCompletion(game: GameState): Promise<void> {
    // Ensure playersWhoHavePassed is always a Set
    ensurePlayersWhoHavePassedIsSet(game);

    // Check if bidding should end based on the rules:
    // 1. If someone bids 100 (highest possible bid)
    // 2. If 3 players have passed

    // If someone has bid 100, bidding ends immediately
    if (game.currentBid && game.currentBid.points >= 100) {
        logger.info(`Bid of ${game.currentBid.points} points - bidding ends, moving to ${game.hasKitty && !game.kittyPhaseCompleted && game.kitty && game.kitty.length > 0 ? 'kitty' : 'playing'} phase`);

        // Check if we need to go to kitty phase
        // Enhanced kitty phase logic with safeguards
        const shouldTriggerKitty = game.hasKitty &&
            game.deckVariant === '40' &&
            game.kitty &&
            game.kitty.length > 0 &&
            !game.kittyPhaseCompleted;

        if (shouldTriggerKitty) {
            logger.debug(`✅ KITTY PHASE TRIGGERED: Bid winner ${game.currentBid.playerId} enters kitty phase for round ${game.round}`);
            game.phase = 'kitty';
            game.currentPlayer = game.currentBid.playerId;
        } else {
            logger.debug(`❌ SKIPPING KITTY PHASE - hasKitty: ${game.hasKitty}, kittyPhaseCompleted: ${game.kittyPhaseCompleted}, kitty exists: ${!!game.kitty}, kitty length: ${game.kitty?.length || 0}, deckVariant: ${game.deckVariant}`);

            // Additional validation: if kitty should exist but doesn't, log warning
            if (game.hasKitty && game.deckVariant === '40' && (!game.kitty || game.kitty.length === 0)) {
                logger.debug(`⚠️  WARNING: Kitty should exist but is missing or empty! Round: ${game.round}`);
                validateKittyState(game, 'Kitty missing when it should exist');
            }

            game.phase = 'playing';
            if (!game.currentBid) {
                logger.error('Current bid is undefined');
                return;
            }
            game.trumpSuit = game.currentBid.suit;
            const contractor = game.players.find(p => p.id === game.currentBid?.playerId);
            if (!contractor) {
                logger.error('Contractor not found');
                return;
            }
            game.contractorTeam = contractor.position % 2 === 0 ? 'team1' : 'team2';
            game.currentPlayer = game.currentBid.playerId;
            logger.debug(`Bid winner ${game.currentBid.playerId} will lead the first trick`);
        }

        emitGameEvent(game, 'game_updated', { game });

        // Start the first bot turn in playing phase if current player is a bot
        const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
        if (currentPlayer?.isBot) {
            logger.debug('Starting first bot turn in playing phase');
            await handleBotTurn(game);
        }
        return;
    }

    // Check if bidding should end due to no counter-bids
    if (game.currentBid && game.playersWhoHavePassed && game.playersWhoHavePassed.size >= 3) {
        // Someone has bid and all other players have passed - bidding ends
        logger.info(`Bid of ${game.currentBid.points} points stands - all other players passed, bidding ends`);

        // Check if we need to go to kitty phase
        // Enhanced kitty phase logic with safeguards
        const shouldTriggerKitty = game.hasKitty &&
            game.deckVariant === '40' &&
            game.kitty &&
            game.kitty.length > 0 &&
            !game.kittyPhaseCompleted;

        if (shouldTriggerKitty) {
            logger.debug(`✅ KITTY PHASE TRIGGERED: Bid winner ${game.currentBid.playerId} enters kitty phase for round ${game.round}`);
            game.phase = 'kitty';
            game.currentPlayer = game.currentBid.playerId;
        } else {
            logger.debug(`❌ SKIPPING KITTY PHASE - hasKitty: ${game.hasKitty}, kittyPhaseCompleted: ${game.kittyPhaseCompleted}, kitty exists: ${!!game.kitty}, kitty length: ${game.kitty?.length || 0}, deckVariant: ${game.deckVariant}`);

            // Additional validation: if kitty should exist but doesn't, log warning
            if (game.hasKitty && game.deckVariant === '40' && (!game.kitty || game.kitty.length === 0)) {
                logger.debug(`⚠️  WARNING: Kitty should exist but is missing or empty! Round: ${game.round}`);
                validateKittyState(game, 'Kitty missing when it should exist');
            }

            game.phase = 'playing';
            if (!game.currentBid) {
                logger.error('Current bid is undefined');
                return;
            }
            game.trumpSuit = game.currentBid.suit;
            const contractor = game.players.find(p => p.id === game.currentBid?.playerId);
            if (!contractor) {
                logger.error('Contractor not found');
                return;
            }
            game.contractorTeam = contractor.position % 2 === 0 ? 'team1' : 'team2';
            game.currentPlayer = game.currentBid.playerId;
            logger.debug(`Bid winner ${game.currentBid.playerId} will lead the first trick`);
        }

        emitGameEvent(game, 'game_updated', { game });

        // Start the first bot turn in playing phase if current player is a bot
        const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
        if (currentPlayer?.isBot) {
            logger.debug('Starting first bot turn in playing phase');
            await handleBotTurn(game);
        }
        return;
    }

    // Check if only the bidder remains (bidding should end)
    if (game.currentBid) {
        const nonPassedPlayers = game.players.filter(p => !game.playersWhoHavePassed?.has(p.id));
        if (nonPassedPlayers.length === 1 && nonPassedPlayers[0] && nonPassedPlayers[0].id === game.currentBid.playerId) {
            // Only the bidder remains - bidding ends
            logger.info(`Only bidder remains - bidding ends with ${game.currentBid.points} points`);
            game.phase = 'playing';
            if (!game.currentBid) {
                logger.error('Current bid is undefined');
                return;
            }
            game.trumpSuit = game.currentBid.suit;
            const contractor = game.players.find(p => p.id === game.currentBid?.playerId);
            if (!contractor) {
                logger.error('Contractor not found');
                return;
            }
            game.contractorTeam = contractor.position % 2 === 0 ? 'team1' : 'team2';
            game.currentPlayer = game.currentBid.playerId;
            logger.info(`Bid winner ${game.currentBid.playerId} will lead the first trick`);

            emitGameEvent(game, 'game_updated', { game });

            // Start the first bot turn in playing phase if current player is a bot
            const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
            if (currentPlayer?.isBot) {
                logger.debug('Starting first bot turn in playing phase');
                await handleBotTurn(game);
            }
            return;
        }
    }

    // Check if all players have passed (bidding ends)
    if (game.playersWhoHavePassed && game.playersWhoHavePassed.size >= 4) {
        logger.info('All players passed - no bid made, starting new round');
        // All players passed, start a new round
        game.round++;
        game.deck = createDeck(game.deckVariant || '36');
        logger.info(`Starting new round ${game.round} (all passed) - hasKitty: ${game.hasKitty}, deckVariant: ${game.deckVariant}`);

        // Clear existing cards and deal new ones
        game.players.forEach(player => {
            player.cards = [];
        });

        // Deal cards to players - handle kitty if enabled
        if (game.hasKitty && game.deckVariant === '40') {
            // Kitty dealing: 3-2-3-2-3 pattern
            // Each player gets 3 cards, then 2 to kitty, then 3 more, then 2 more to kitty, then 3 more
            if (!game.deck) {
                logger.error('Game deck is undefined');
                return;
            }
            game.kitty = [];
            let cardIndex = 0;

            // First packet: 3 cards to each player
            for (let i = 0; i < 3; i++) {
                game.players.forEach(player => {
                    if (game.deck && cardIndex < game.deck.length) {
                        const card = game.deck[cardIndex++];
                        if (card) player.cards.push(card);
                    }
                });
            }

            // First kitty: 2 cards
            for (let i = 0; i < 2; i++) {
                if (game.deck && cardIndex < game.deck.length) {
                    const card = game.deck[cardIndex++];
                    if (card) game.kitty.push(card);
                }
            }

            // Second packet: 3 more cards to each player
            for (let i = 0; i < 3; i++) {
                game.players.forEach(player => {
                    if (game.deck && cardIndex < game.deck.length) {
                        const card = game.deck[cardIndex++];
                        if (card) player.cards.push(card);
                    }
                });
            }

            // Second kitty: 2 more cards
            for (let i = 0; i < 2; i++) {
                if (game.deck && cardIndex < game.deck.length) {
                    const card = game.deck[cardIndex++];
                    if (card) game.kitty.push(card);
                }
            }

            // Final packet: 3 more cards to each player
            for (let i = 0; i < 3; i++) {
                game.players.forEach(player => {
                    if (game.deck && cardIndex < game.deck.length) {
                        const card = game.deck[cardIndex++];
                        if (card) player.cards.push(card);
                    }
                });
            }

            logger.info(`Kitty recreated with ${game.kitty.length} cards for round ${game.round} (all passed)`);
        } else {
            // Standard dealing: 9 cards for both 36-card and 40-card decks (kitty handled separately)
            if (!game.deck) {
                logger.error('Game deck is undefined');
                return;
            }
            const cardsPerPlayer = 9; // Always 9 cards per player, kitty logic is handled elsewhere
            let cardIndex = 0;
            for (let i = 0; i < cardsPerPlayer; i++) {
                game.players.forEach(player => {
                    if (game.deck && cardIndex < game.deck.length) {
                        const card = game.deck[cardIndex++];
                        if (card) player.cards.push(card);
                    }
                });
            }
        }

        // Reset for new round
        game.currentBid = undefined;
        game.trumpSuit = undefined;
        game.currentTrick = { cards: [], winner: undefined, points: 0 };
        game.kittyDiscards = undefined; // Clear kitty discards for new round
        game.currentPlayer = getNextPlayerByPosition(game.dealer, game.players);
        game.dealer = game.currentPlayer;
        game.playerTurnStartTime = { [game.currentPlayer]: Date.now() };
        game.contractorTeam = undefined;
        game.opposingTeamBid = 0;
        game.roundScores = { team1: 0, team2: 0 };
        game.biddingPasses = 0;
        game.biddingRound = 0;
        game.playersWhoHavePassed?.clear(); // Reset the set for new round

        io.to(`table-${game.tableId}`).emit('round_completed', { game });

        // Pause for 3 seconds to let players see the round results in the notepad
        // jcl
        //console.log('Pausing for 3 seconds to let players review round results...');
        //await new Promise(resolve => setTimeout(resolve, 3000));

        // Start bot turn handling for new bidding phase if current player is a bot and hasn't passed
        const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
        if (currentPlayer?.isBot && !game.playersWhoHavePassed?.has(game.currentPlayer)) {
            logger.debug('Starting bot turn for new round bidding phase');
            await handleBotTurn(game);
        }
        return;
    }

    logger.info(`Bidding continues - passes: ${game.biddingPasses}, current bid: ${game.currentBid ? game.currentBid.points : 'none'}`);
}

async function handleBotTurn(game: GameState): Promise<void> {
    // Ensure playersWhoHavePassed is always a Set
    ensurePlayersWhoHavePassedIsSet(game);

    logger.debug('handleBotTurn called for game:', game.id);
    logger.debug('Current player ID:', game.currentPlayer);
    logger.debug('Game phase:', game.phase);

    const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
    logger.debug('Current player found:', currentPlayer ? { id: currentPlayer.id, name: currentPlayer.name, isBot: currentPlayer.isBot, hasAI: !!currentPlayer.ai, cardCount: currentPlayer.cards.length } : 'NOT FOUND');

    if (!currentPlayer || !currentPlayer.isBot) {
        logger.debug('Exiting handleBotTurn - not a bot or player not found');
        return;
    }

    if (game.phase === 'kitty') {
        // Add 1 second delay for bot kitty handling to make it feel more natural
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Bot takes kitty cards
        if (game.kitty && game.kitty.length > 0) {
            currentPlayer.cards.push(...game.kitty);
            game.kitty = [];
            logger.debug(`Bot ${currentPlayer.name} took kitty, now has ${currentPlayer.cards.length} cards`);
        }

        // Bot discards 4 cards (simple strategy: discard lowest value cards)
        const sortedCards = [...currentPlayer.cards].sort((a, b) => getCardValue(a) - getCardValue(b));
        const discardedCards = sortedCards.slice(0, 4);

        // Remove discarded cards from hand
        currentPlayer.cards = currentPlayer.cards.filter(card =>
            !discardedCards.some(discarded => discarded.id === card.id)
        );

        game.kittyDiscards = discardedCards;
        logger.debug(`Bot ${currentPlayer.name} discarded 4 cards to kitty`);

        // Move to playing phase and set trump (bot can change trump suit if beneficial)
        game.phase = 'playing';
        // Bot keeps the original trump suit for now, but could implement logic to change it
        if (!game.currentBid) {
            logger.error('Current bid is undefined');
            return;
        }
        game.trumpSuit = game.currentBid.suit;
        game.contractorTeam = currentPlayer.position % 2 === 0 ? 'team1' : 'team2';
        game.kittyPhaseCompleted = true; // Mark kitty phase as completed for this round
        logger.debug(`Trump suit set to ${game.trumpSuit}, contractor team: ${game.contractorTeam}`);
        debugKittyState(game, 'Kitty phase completed by bot player');

        // Emit game update
        emitGameEvent(game, 'game_updated', { game });

        // Start the first bot turn in playing phase
        logger.debug('Starting first bot turn in playing phase');
        await handleBotTurn(game);
    } else if (game.phase === 'bidding') {
        // Add 1 second delay for bot bidding to make it feel more natural
        await new Promise(resolve => setTimeout(resolve, 1000));

        const handValue = currentPlayer.cards.reduce((total, card) => total + getCardValue(card), 0);
        const bidPoints = currentPlayer.botSkill === 'acadien'
            ? currentPlayer.ai.makeBid(handValue, game.currentBid, game.currentBid?.playerId, currentPlayer.id, game.players, game)
            : currentPlayer.ai.makeBid(handValue, game.currentBid, game.currentBid?.playerId, currentPlayer.id, game.players);

        logger.debug(`Bot ${currentPlayer.name} (${currentPlayer.botSkill}) making bid: ${bidPoints} points`);

        if (bidPoints > 0) {
            // Trump suit selection is required for any bid
            const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
            const suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };

            // Count cards in each suit
            currentPlayer.cards.forEach(card => {
                suitCounts[card.suit]++;
            });

            // Select the suit with the most cards
            const bestSuitEntry = Object.entries(suitCounts)
                .sort(([, a], [, b]) => b - a)[0];
            const bestSuit = (bestSuitEntry ? bestSuitEntry[0] : 'hearts') as Suit;

            // Bot made a bid - remove them from passed list if they were there
            game.playersWhoHavePassed?.delete(currentPlayer.id);
            game.currentBid = { playerId: currentPlayer.id, points: bidPoints, suit: bestSuit };
            game.biddingPasses = 0; // Reset pass counter when someone bids

            logger.debug(`Bot ${currentPlayer.name} bid ${bidPoints} points with ${bestSuit} as trump suit`);
        } else {
            // Bot passed - they cannot bid again until new round
            game.playersWhoHavePassed?.add(currentPlayer.id);
            game.biddingPasses = (game.biddingPasses || 0) + 1;
            logger.debug(`Bot ${currentPlayer.name} passed. Total passes: ${game.biddingPasses}`);
        }

        // Reset timeout for current bot since they just made a move
        if (game.playerTurnStartTime) {
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[currentPlayer.id] = Date.now();
            }
        }

        // Always move to next player after bot makes decision (bid or pass)
        const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
        game.currentPlayer = nextPlayer;
        if (game.playerTurnStartTime) {
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[nextPlayer] = Date.now();
            }
        }

        emitGameEvent(game, 'bid_made', { game });

        // Check if bidding should end
        await checkBiddingCompletion(game);

        // Handle next bot player if applicable and they haven't passed
        const currentPlayerForBot = game.players.find(p => p.id === game.currentPlayer);
        if (currentPlayerForBot?.isBot && game.phase === 'bidding' && !game.playersWhoHavePassed?.has(game.currentPlayer)) {
            await handleBotTurn(game);
        } else if (currentPlayerForBot?.isBot && game.phase === 'bidding' && game.playersWhoHavePassed?.has(game.currentPlayer)) {
            // Bot has already passed, move to next player
            const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
            game.currentPlayer = nextPlayer;
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[nextPlayer] = Date.now();
            }

            // Check if bidding should end if we've gone through all players
            const nonPassedPlayers = game.players.filter(p => !game.playersWhoHavePassed?.has(p.id));
            if (nonPassedPlayers.length === 1 && game.currentBid) {
                // Only the bidder remains - bidding ends
                logger.debug(`Only bidder remains - bidding ends with ${game.currentBid.points} points`);

                // Check if we need to go to kitty phase
                logger.debug(`Kitty phase check: hasKitty=${game.hasKitty}, kittyPhaseCompleted=${game.kittyPhaseCompleted}, kitty exists=${!!game.kitty}, kitty length=${game.kitty?.length || 0}, deckVariant=${game.deckVariant}, round=${game.round}`);
                debugKittyState(game, 'Before kitty phase decision');
                validateKittyState(game, 'Before kitty phase decision');
                // Enhanced kitty phase logic with safeguards
                const shouldTriggerKitty = game.hasKitty &&
                    game.deckVariant === '40' &&
                    game.kitty &&
                    game.kitty.length > 0 &&
                    !game.kittyPhaseCompleted;

                if (shouldTriggerKitty) {
                    logger.debug(`✅ KITTY PHASE TRIGGERED: Bid winner ${game.currentBid.playerId} enters kitty phase for round ${game.round}`);
                    debugKittyState(game, 'Kitty phase triggered');
                    game.phase = 'kitty';
                    game.currentPlayer = game.currentBid.playerId;
                } else {
                    logger.debug(`❌ SKIPPING KITTY PHASE - hasKitty: ${game.hasKitty}, kittyPhaseCompleted: ${game.kittyPhaseCompleted}, kitty exists: ${!!game.kitty}, kitty length: ${game.kitty?.length || 0}, deckVariant: ${game.deckVariant}`);
                    debugKittyState(game, 'Kitty phase skipped');

                    // Additional validation: if kitty should exist but doesn't, log warning
                    if (game.hasKitty && game.deckVariant === '40' && (!game.kitty || game.kitty.length === 0)) {
                        logger.debug(`⚠️  WARNING: Kitty should exist but is missing or empty! Round: ${game.round}`);
                        validateKittyState(game, 'Kitty missing when it should exist');
                    }
                    game.phase = 'playing';
                    if (!game.currentBid) {
                        logger.error('Current bid is undefined');
                        return;
                    }
                    game.trumpSuit = game.currentBid.suit;
                    const contractor = game.players.find(p => p.id === game.currentBid?.playerId);
                    if (!contractor) {
                        logger.error('Contractor not found');
                        return;
                    }
                    game.contractorTeam = contractor.position % 2 === 0 ? 'team1' : 'team2';
                    game.currentPlayer = game.currentBid.playerId;
                    logger.debug(`Bid winner ${game.currentBid.playerId} will lead the first trick`);
                }

                logger.debug(`Emitting game_updated - phase: ${game.phase}, currentPlayer: ${game.currentPlayer}, kitty length: ${game.kitty?.length || 0}`);
                emitGameEvent(game, 'game_updated', { game });

                // Start the first bot turn if current player is a bot (handles both kitty and playing phases)
                const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
                if (currentPlayer?.isBot) {
                    logger.debug(`Starting first bot turn in ${game.phase} phase`);
                    await handleBotTurn(game);
                }
            } else if (currentPlayerForBot?.isBot && game.phase === 'bidding') {
                // Continue with next bot
                await handleBotTurn(game);
            }
        }
    } else if (game.phase === 'playing') {
        // Add 1 second delay for bot card playing to make it feel more natural
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Determine lead suit from current trick
        const leadSuit = game.currentTrick.cards.length > 0 && game.currentTrick.cards[0]
            ? game.currentTrick.cards[0].card.suit
            : null;

        // Filter playable cards based on leading suit rule
        const playableCards = currentPlayer.cards.filter(card => {
            if (!leadSuit) return true; // First card of trick

            // Must follow suit if possible
            const hasLeadSuit = currentPlayer.cards.some(c => c.suit === leadSuit);
            if (hasLeadSuit) {
                return card.suit === leadSuit;
            }

            return true; // Can play any card if can't follow suit
        });

        logger.debug(`Bot ${currentPlayer.name} has ${currentPlayer.cards.length} total cards, ${playableCards.length} playable cards`);
        logger.debug(`Lead suit: ${leadSuit}, Trump suit: ${game.trumpSuit}`);
        const card = currentPlayer.botSkill === 'acadien'
            ? await currentPlayer.ai.playCard(playableCards, leadSuit, game.trumpSuit, game, currentPlayer.id)
            : await currentPlayer.ai.playCard(playableCards, leadSuit, game.trumpSuit);

        if (card) {
            // Check if bot has any cards left
            if (currentPlayer.cards.length === 0) {
                logger.debug(`Bot ${currentPlayer.name} has no cards left, cannot play`);
                return;
            }

            logger.debug(`Bot ${currentPlayer.name} playing card: ${card.rank} of ${card.suit}`);
            logger.debug(`Bot ${currentPlayer.name} cards before: ${currentPlayer.cards.length}, after: ${currentPlayer.cards.length - 1}`);
            currentPlayer.cards = currentPlayer.cards.filter(c => c.id !== card.id);
            game.currentTrick.cards.push({ card, playerId: currentPlayer.id });
            logger.debug(`Trick now has ${game.currentTrick.cards.length} cards`);

            // Reset timeout for current bot since they just played a card
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[currentPlayer.id] = Date.now();
            }

            // Move to next player
            const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
            game.currentPlayer = nextPlayer;
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[nextPlayer] = Date.now();
            }

            emitGameEvent(game, 'card_played', { game, card, playerId: currentPlayer.id });

            // Check if trick is complete (same logic as human player)
            if (game.currentTrick.cards.length === 4) {
                // Calculate trick winner and points
                const trickPoints = game.currentTrick.cards.reduce((total, { card }) =>
                    total + getCardValue(card), 0);
                game.currentTrick.points = trickPoints;

                // Proper trick winner logic (highest trump, then highest lead suit)
                const firstCard = game.currentTrick.cards[0];
                if (!firstCard) {
                    logger.error('No cards in current trick, skipping winner determination');
                    return;
                }
                const leadSuit = firstCard.card.suit;
                let winner = firstCard;

                for (const { card, playerId } of game.currentTrick.cards) {
                    if (card.suit === game.trumpSuit && winner.card.suit !== game.trumpSuit) {
                        // Trump beats non-trump
                        winner = { card, playerId };
                    } else if (card.suit === game.trumpSuit && winner.card.suit === game.trumpSuit) {
                        // Compare trump cards by rank
                        if (getCardRank(card.rank) > getCardRank(winner.card.rank)) {
                            winner = { card, playerId };
                        }
                    } else if (card.suit === leadSuit && winner.card.suit === leadSuit) {
                        // Compare lead suit cards by rank
                        if (getCardRank(card.rank) > getCardRank(winner.card.rank)) {
                            winner = { card, playerId };
                        }
                    }
                }

                game.currentTrick.winner = winner.playerId;
                game.lastTrick = { ...game.currentTrick };

                // Update round scores (not total team scores)
                // fixes scoring issue
                const winnerPlayer = game.players.find(p => p.id === winner.playerId);
                if (!winnerPlayer) {
                    logger.error('Winner player not found');
                    return;
                }
                const winnerTeam = winnerPlayer.position % 2 === 0 ? 'team1' : 'team2';
                game.roundScores[winnerTeam] += trickPoints;

                // Log trick details for debugging
                logger.debug(`Trick completed! Winner: ${winnerPlayer.name} (${winner.playerId}), Card: ${winner.card.rank} of ${winner.card.suit}, Points: ${trickPoints}, Trump: ${game.trumpSuit}, Lead: ${leadSuit}`);

                // Debug: Print all players' cards after trick completion
                debugPrintAllPlayerCards(game, `After Trick Won by ${winnerPlayer?.name}`);

                // Add delay to let players see the final card before completing trick
                // Variable pause to show final card (1.5-2.5 seconds)
                // jcl
                //const finalCardDelay = Math.random() * 1000 + 1500; // Random delay between 1500-2500ms

                const finalCardDelay = 2000; // 2 seconds
                logger.debug(`Pausing ${Math.round(finalCardDelay)}ms to show final card...`);
                await new Promise(resolve => setTimeout(resolve, finalCardDelay));

                // Emit trick completed event with the completed trick
                emitGameEvent(game, 'trick_completed', { game });
                // Clear the trick immediately
                // Check if all players have run out of cards (end of round)
                const allCardsPlayed = game.players.every(p => p.cards.length === 0);
                if (allCardsPlayed) {
                    logger.debug('All cards have been played! Round complete.');

                    // Debug: Print final card state (should all be 0 cards)
                    debugPrintAllPlayerCards(game, 'Round Complete - All Cards Played');

                    // Calculate round scores using proper scoring system
                    if (game.contractorTeam && game.currentBid) {
                        const contractorCardPoints = game.roundScores[game.contractorTeam];
                        const opposingTeam = game.contractorTeam === 'team1' ? 'team2' : 'team1';
                        const opposingCardPoints = game.roundScores[opposingTeam];

                        // Use proper scoring calculation including kitty discard points
                        const scoringResult = calculateRoundScores(game, game.contractorTeam, contractorCardPoints, opposingCardPoints, game.opposingTeamBid || 0);

                        // Update team scores with proper calculation
                        game.teamScores.team1 = scoringResult.team1Score;
                        game.teamScores.team2 = scoringResult.team2Score;

                        // Calculate kitty discard points for logging
                        let kittyDiscardPoints = 0;
                        if (game.kittyDiscards && game.kittyDiscards.length > 0) {
                            kittyDiscardPoints = game.kittyDiscards.reduce((total, card) => total + getCardValue(card), 0);
                        }

                        logger.debug(`Round scoring: Contractor (${game.contractorTeam}) ${contractorCardPoints} points, Opposing (${opposingTeam}) ${opposingCardPoints} points`);
                        if (kittyDiscardPoints > 0) {
                            logger.debug(`Kitty discards: ${kittyDiscardPoints} points awarded to defending team (${opposingTeam})`);
                        }
                        logger.debug(`New scores: Team1 ${game.teamScores.team1}, Team2 ${game.teamScores.team2}`);
                    }

                    // Check for game end before starting a new round
                    if (isGameEnded(game)) {
                        game.phase = 'finished';

                        // Determine winning team and create detailed game end info
                        const winningTeamInfo = getWinningTeam(game);
                        if (!winningTeamInfo) {
                            logger.error('Failed to determine winning team');
                            return;
                        }
                        const winningTeam = winningTeamInfo.team;
                        const winningTeamName = winningTeamInfo.name;

                        const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                        const gameEndInfo = {
                            game,
                            winningTeam,
                            winningTeamName,
                            winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                            finalScores: game.teamScores
                        };

                        logger.debug(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                        emitGameEvent(game, 'game_ended', gameEndInfo);

                        // Reset table state after game completion
                        setTimeout(() => {
                            resetTableAfterGameCompletion(game.tableId);
                        }, 3000); // Give players 3 seconds to see the game end message

                        return;
                    }

                    // Start a new round
                    game.round++;
                    game.deck = createDeck(game.deckVariant || '36');
                    logger.debug(`Starting new round ${game.round} - hasKitty: ${game.hasKitty}, deckVariant: ${game.deckVariant}`);
                    debugKittyState(game, 'Before new round setup (handleBotTurn)');

                    // Clear existing cards and deal new ones
                    game.players.forEach(player => {
                        player.cards = [];
                    });

                    // Deal cards to players - handle kitty if enabled
                    if (game.hasKitty && game.deckVariant === '40') {
                        // Kitty dealing: 3-2-3-2-3 pattern
                        // Each player gets 3 cards, then 2 to kitty, then 3 more, then 2 more to kitty, then 3 more
                        game.kitty = [];
                        let cardIndex = 0;

                        // First packet: 3 cards to each player
                        for (let i = 0; i < 3; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                }
                            });
                        }

                        // First kitty: 2 cards
                        for (let i = 0; i < 2; i++) {
                            if (game.deck && cardIndex < game.deck.length) {
                                const card = game.deck[cardIndex++];
                                if (card) game.kitty.push(card);
                            }
                        }

                        // Second packet: 3 more cards to each player
                        for (let i = 0; i < 3; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                }
                            });
                        }

                        // Second kitty: 2 more cards
                        for (let i = 0; i < 2; i++) {
                            if (game.deck && cardIndex < game.deck.length) {
                                const card = game.deck[cardIndex++];
                                if (card) game.kitty.push(card);
                            }
                        }

                        // Final packet: 3 more cards to each player
                        for (let i = 0; i < 3; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                }
                            });
                        }

                        logger.debug(`Kitty recreated with ${game.kitty.length} cards for round ${game.round} (handleBotTurn)`);
                        debugKittyState(game, 'After kitty recreation (handleBotTurn)');
                    } else {
                        // Standard dealing: 9 cards for both 36-card and 40-card decks (kitty handled separately)
                        const cardsPerPlayer = 9; // Always 9 cards per player, kitty logic is handled elsewhere
                        let cardIndex = 0;
                        for (let i = 0; i < cardsPerPlayer; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                }
                            });
                        }
                    }

                    // Reset for new round
                    game.phase = 'bidding';
                    game.currentBid = undefined;
                    game.trumpSuit = undefined;
                    game.currentTrick = { cards: [], winner: undefined, points: 0 };
                    game.lastTrick = undefined; // Clear last trick for new round
                    game.kittyDiscards = undefined; // Clear kitty discards for new round
                    game.kittyPhaseCompleted = false; // Reset kitty phase completion for new round
                    game.currentPlayer = getNextPlayerByPosition(game.dealer, game.players);
                    game.dealer = game.currentPlayer;
                    game.playerTurnStartTime = { [game.currentPlayer]: Date.now() };
                    game.contractorTeam = undefined; // Reset contractor team
                    game.opposingTeamBid = 0; // Reset opposing team bid flag
                    game.roundScores = { team1: 0, team2: 0 }; // Reset round scores
                    game.biddingPasses = 0; // Reset bidding passes
                    game.biddingRound = 0; // Reset bidding round
                    if (game.playersWhoHavePassed) {
                        game.playersWhoHavePassed.clear();
                    } // Reset passed players for new round

                    logger.debug('Round reset complete - all bid parameters cleared for new round (handleBotTurn)');
                    debugKittyState(game, 'After round reset (handleBotTurn)');
                    validateKittyState(game, 'After round reset (handleBotTurn)');

                    emitGameEvent(game, 'round_completed', { game });

                    // Pause for 3 seconds to let players see the round results in the notepad
                    // jcl
                    //console.log('Pausing for 3 seconds to let players review round results...');
                    //await new Promise(resolve => setTimeout(resolve, 3000));

                    // Start bot turn handling for new bidding phase if current player is a bot and hasn't passed
                    const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
                    if (currentPlayer?.isBot && !game.playersWhoHavePassed?.has(game.currentPlayer)) {
                        logger.debug('Starting bot turn for new round bidding phase');
                        await handleBotTurn(game);
                    }
                    return;
                }

                // Start new trick - clear the trick area
                game.currentTrick = { cards: [], winner: undefined, points: 0 };
                game.currentPlayer = winner.playerId;
                const nextPlayer = game.players.find(p => p.id === winner.playerId);
                logger.debug('Trick area cleared, starting new trick. Next player:', nextPlayer ? { name: nextPlayer.name, isBot: nextPlayer.isBot } : 'NOT FOUND');

                // Emit game update to show cleared trick area
                logger.debug(`Emitting game_updated - phase: ${game.phase}, currentPlayer: ${game.currentPlayer}, kitty length: ${game.kitty?.length || 0}`);
                emitGameEvent(game, 'game_updated', { game });

                // Handle next bot player if applicable
                if (nextPlayer?.isBot) {
                    logger.debug('Next player is a bot, starting bot turn');
                    await handleBotTurn(game);
                }

                // Check for game end
                if (isGameEnded(game)) {
                    game.phase = 'finished';

                    // Determine winning team and create detailed game end info
                    const winningTeamInfo = getWinningTeam(game);
                    if (!winningTeamInfo) {
                        logger.error('Failed to determine winning team');
                        return;
                    }
                    const winningTeam = winningTeamInfo.team;
                    const winningTeamName = winningTeamInfo.name;

                    const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                    const gameEndInfo = {
                        game,
                        winningTeam,
                        winningTeamName,
                        winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                        finalScores: game.teamScores
                    };

                    logger.debug(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                    emitGameEvent(game, 'game_ended', gameEndInfo);

                    // Clean up game room and reset table state after game completion
                    cleanupGameRoom(game);
                    setTimeout(() => {
                        resetTableAfterGameCompletion(game.tableId);
                    }, 3000); // Give players 3 seconds to see the game end message

                    return;
                }
            }

            // Handle next bot player if applicable - but only if we're not in the middle of a trick completion
            const nextBotPlayer = game.players.find(p => p.id === game.currentPlayer);
            if (game.currentTrick.cards.length < 4 && nextBotPlayer?.isBot && nextBotPlayer.cards.length > 0) {
                await handleBotTurn(game);
            }
        } else {
            logger.debug(`Bot ${currentPlayer.name} could not play a card - this should not happen!`);

            // Check if all players have 0 cards - if so, end the round
            const allCardsPlayed = game.players.every(p => p.cards.length === 0);
            if (allCardsPlayed) {
                logger.debug('All players have 0 cards - ending round');

                // Debug: Print final card state (should all be 0 cards)
                debugPrintAllPlayerCards(game, 'Round Complete - All Cards Played');

                // Calculate round scores using proper scoring system
                if (game.contractorTeam && game.currentBid) {
                    const contractorCardPoints = game.roundScores[game.contractorTeam];
                    const opposingTeam = game.contractorTeam === 'team1' ? 'team2' : 'team1';
                    const opposingCardPoints = game.roundScores[opposingTeam];

                    // Calculate bonus points
                    const contractorBonus = contractorCardPoints >= game.currentBid.points ? 100 : -100;
                    const opposingBonus = contractorBonus === 100 ? 100 : 0;

                    // Update team scores
                    game.teamScores[game.contractorTeam] += contractorCardPoints + contractorBonus;
                    game.teamScores[opposingTeam] += opposingCardPoints + opposingBonus;

                    logger.debug(`Round ${game.round} completed:`);
                    logger.debug(`Contractor team (${game.contractorTeam}): ${contractorCardPoints} card points + ${contractorBonus} bonus = ${contractorCardPoints + contractorBonus}`);
                    logger.debug(`Opposing team (${opposingTeam}): ${opposingCardPoints} card points + ${opposingBonus} bonus = ${opposingCardPoints + opposingBonus}`);
                    logger.debug(`New team scores: Team1: ${game.teamScores.team1}, Team2: ${game.teamScores.team2}`);
                }

                // Move to next round
                game.round++;
                game.phase = 'bidding';
                game.currentBid = undefined;
                game.contractorTeam = undefined;
                game.trumpSuit = undefined;
                game.opposingTeamBid = 0; // Reset opposing team bid flag
                game.roundScores = { team1: 0, team2: 0 }; // Reset round scores
                game.biddingPasses = 0; // Reset bidding passes
                game.biddingRound = 0; // Reset bidding round
                if (game.playersWhoHavePassed) {
                    game.playersWhoHavePassed.clear();
                } // Reset passed players for new round
                game.playerTurnStartTime = { [game.currentPlayer]: Date.now() };

                emitGameEvent(game, 'round_completed', { game });

                // Pause for 3 seconds to let players see the round results in the notepad
                // jcl
                //console.log('Pausing for 3 seconds to let players review round results...');
                //await new Promise(resolve => setTimeout(resolve, 3000));

                // Start bot turn handling for new bidding phase if current player is a bot and hasn't passed
                const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
                if (currentPlayer?.isBot && !game.playersWhoHavePassed?.has(game.currentPlayer)) {
                    logger.debug('Starting bot turn for new round bidding phase');
                    await handleBotTurn(game);
                }
                return;
            }

            // If bot can't play a card, move to next player but don't recurse infinitely
            game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
            emitGameEvent(game, 'game_updated', { game });

            // Only handle next bot turn if we're not in a loop situation
            const nextPlayer = game.players.find(p => p.id === game.currentPlayer);
            if (nextPlayer?.isBot && nextPlayer.cards.length > 0) {
                logger.debug('Moving to next bot with cards:', nextPlayer.name);
                await handleBotTurn(game);
            } else {
                logger.debug('No more bots with cards to play, waiting for human player or round completion');
            }
        }
    }
}

/* socket handlers */
// Socket.io connection handling
io.on('connection', (socket: Socket) => {
    logger.debug('Player connected:', socket.id);

    socket.on('join_lobby', (data: { playerName: string; lobbyId?: string }) => {
        try {
            logger.debug('join_lobby received:', data);
            const { playerName, lobbyId = 'default' } = data;

            // Check if this is a rejoin with the same name (same socket ID)
            const existingPlayer = players.get(socket.id);
            if (existingPlayer && existingPlayer.name === playerName) {
                logger.debug(`Player "${playerName}" rejoining lobby with same name`);
                // Allow rejoin with same name
            } else {
                // Check if the name is already taken by a different player
                if (!reservePlayerName(playerName)) {
                    logger.warn(`Name "${playerName}" is already taken`);
                }
            }

            const player = {
                id: socket.id,
                name: playerName,
                isBot: false,
                position: 0 as 0 | 1 | 2 | 3, // Will be set when joining a table
                cards: [],
                score: 0,
                isReady: false
            };

            players.set(socket.id, player);
            socket.join(lobbyId);

            const lobby = lobbies.get(lobbyId);
            logger.debug('Lobby found:', lobby);
            if (lobby) {
                // Convert Map to Array for the lobby tables
                const tablesArray = lobby.tables ? Array.from(lobby.tables.values()) : [];
                logger.debug('Sending lobby_joined with tables:', tablesArray);
                socket.emit('lobby_joined', { lobby: { ...lobby, tables: tablesArray }, player });
                socket.to(lobbyId).emit('player_joined', { player });
            } else {
                logger.debug('Lobby not found for ID:', lobbyId);
            }
        } catch (error) {
            logger.error('Error in join_lobby handler:', error);
            socket.emit('error', { message: error instanceof Error ? error.message : 'Unknown error' });
        }
    });

    socket.on('create_table', (data: { tableId: string; lobbyId?: string; tableName: string; timeoutDuration?: number }) => {
        try {
            logger.debug('create_table received:', data);
            const { tableId, lobbyId = 'default', tableName, timeoutDuration = 30000 } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                logger.debug('Lobby not found:', lobbyId);
                throw new Error('Lobby not found');
            }

            // Check if table already exists
            if (lobby.tables.has(tableId)) {
                logger.debug('Table already exists:', tableId);
                throw new Error('Table already exists');
            }

            logger.debug('Creating new table:', tableId, 'with name:', tableName);
            const table: LobbyTable = {
                id: tableId,
                name: tableName || `Table ${tableId}`,
                players: [],
                gameState: undefined,
                maxPlayers: 4,
                isPrivate: false, // Default to public table
                creator: player.name,
                timeoutDuration: timeoutDuration,
                deckVariant: '36' as '36' | '40', // Default to 36-card deck
                scoreTarget: 200, // Default to 200 points
                hasKitty: false // Default to no kitty
            };

            // Add the creator as the first player
            player.position = 0;
            table.players.push(player);
            logger.debug(`Added creator ${player.name} to new table`);

            lobby.tables.set(tableId, table);
            logger.debug('Table created successfully');

            // Add creator to table socket room
            socket.join(`table-${tableId}`);

            // Notify all lobby members about the new table
            const tablesArray = Array.from(lobby.tables.values());
            io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

            // Send table_joined event to redirect creator to waiting room
            socket.emit('table_joined', { table, player });

            // Send confirmation to creator
            socket.emit('table_created', { table, success: true });
        } catch (error) {
            logger.error('Error creating table:', error);
            socket.emit('error', { message: 'Error creating table' });
        }
    });

    socket.on('add_bot', (data: { tableId: string; position: number; skill?: 'easy' | 'medium' | 'hard' | 'acadien' }) => {
        try {
            logger.debug('add_bot received:', data);
            const { tableId, position, skill = 'medium' } = data;

            // Validate skill level
            const validSkills = ['easy', 'medium', 'hard', 'acadien'];
            if (!validSkills.includes(skill)) {
                throw new Error('Invalid bot skill level');
            }
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const lobby = lobbies.get('default');
            if (!lobby) {
                logger.debug('Lobby not found');
                throw new Error('Lobby not found');
            }

            const table = lobby.tables.get(tableId);
            if (!table) {
                logger.debug('Table not found:', tableId);
                throw new Error('Table not found');
            }

            // Check if user is the table creator
            if (table.creator !== player.name) {
                logger.debug('Only table creator can add bots');
                socket.emit('error', { message: 'Only the table creator can add bots' });
                throw new Error('Only the table creator can add bots');
            }

            // Check if position is already occupied
            if (table.players.some(p => p.position === position)) {
                logger.debug('Position already occupied:', position);
                socket.emit('error', { message: 'Position already occupied' });
                throw new Error('Position already occupied');
            }

            // Create bot player
            const botId = `bot-${uuidv4()}`;
            const botName = getRandomHumanName();
            const bot: Player = {
                id: botId,
                name: botName,
                isBot: true,
                botSkill: skill,
                position: position as 0 | 1 | 2 | 3,
                cards: [],
                score: 0,
                isReady: true
            };

            table.players.push(bot);
            logger.debug(`Added bot ${bot.name} at position ${position}`);

            // Notify all table members about the updated table
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Notify all lobby members about the updated lobby
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error adding bot:', error);
            socket.emit('error', { message: 'Error adding bot' });
        }
    });

    socket.on('remove_bot', (data: { tableId: string; botId: string }) => {
        try {
            logger.debug('remove_bot received:', data);
            const { tableId, botId } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const lobby = lobbies.get('default');
            if (!lobby) {
                logger.debug('Lobby not found');
                throw new Error('Lobby not found');
            }

            const table = lobby.tables.get(tableId);
            if (!table) {
                logger.debug('Table not found:', tableId);
                throw new Error('Table not found');
            }

            // Check if user is the table creator
            if (table.creator !== player.name) {
                logger.debug('Only table creator can remove bots');
                throw new Error('Only the table creator can remove bots');
            }

            // Find and remove the bot
            const botIndex = table.players.findIndex(p => p.id === botId && p.isBot);
            if (botIndex === -1) {
                logger.debug('Bot not found:', botId);
                throw new Error('Bot not found');
            }

            const removedBot = table.players.splice(botIndex, 1)[0];
            if (!removedBot) {
                logger.error('Failed to remove bot');
                return;
            }
            logger.debug(`Removed bot ${removedBot.name} from position ${removedBot.position}`);

            // Notify all table members about the updated table
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Notify all lobby members about the updated lobby
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error removing bot:', error);
            socket.emit('error', { message: 'Error removing bot' });
        }
    });

    socket.on('move_player', (data: { tableId: string; newPosition: number }) => {
        try {
            logger.debug('move_player received:', data);
            const { tableId, newPosition } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const lobby = lobbies.get('default');
            if (!lobby) {
                logger.debug('Lobby not found');
                throw new Error('Lobby not found');
            }

            const table = lobby.tables.get(tableId);
            if (!table) {
                logger.debug('Table not found:', tableId);
                throw new Error('Table not found');
            }

            // Check if the position is valid (0-3)
            if (newPosition < 0 || newPosition >= table.maxPlayers) {
                logger.debug('Invalid position:', newPosition);
                throw new Error('Invalid position');
            }

            // Check if the new position is already occupied
            const positionOccupied = table.players.some(p => p.position === newPosition);
            if (positionOccupied) {
                logger.debug('Position already occupied:', newPosition);
                throw new Error('Position already occupied');
            }

            // Find the player in the table
            const playerIndex = table.players.findIndex(p => p.id === socket.id);
            if (playerIndex === -1) {
                logger.debug('Player not found in table');
                throw new Error('Player not found in table');
            }

            // Update the player's position
            const tablePlayer = table.players[playerIndex];
            if (!tablePlayer) {
                logger.error('Player not found at index');
                return;
            }
            const oldPosition = tablePlayer.position;
            tablePlayer.position = newPosition as 0 | 1 | 2 | 3;
            logger.debug(`Moved player ${tablePlayer.name} from position ${oldPosition} to position ${newPosition}`);

            // Notify all table members about the updated table
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Notify all lobby members about the updated lobby
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error moving player:', error);
            socket.emit('error', { message: 'Error moving player' });
        }
    });

    socket.on('start_game', async (data: { tableId: string }) => {
        try {
            logger.debug('start_game received:', data);
            const { tableId } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const lobby = lobbies.get('default');
            if (!lobby) {
                logger.debug('Lobby not found');
                throw new Error('Lobby not found');
            }

            const table = lobby.tables.get(tableId);
            if (!table) {
                logger.debug('Table not found:', tableId);
                throw new Error('Table not found');
            }

            // Check if user is the table creator
            if (table.creator !== player.name) {
                logger.debug('Only table creator can start the game');
                throw new Error('Only the table creator can start the game');
            }

            // Check if table has exactly 4 players
            if (table.players.length !== 4) {
                logger.debug('Table must have exactly 4 players to start');
                throw new Error('Table must have exactly 4 players to start');
            }

            // Check if game is already started
            if (table.gameState) {
                logger.debug('Game already started');
                throw new Error('Game already started');
            }

            logger.debug('Starting game manually for table:', tableId);
            const game = createGame(tableId, table.timeoutDuration, table.deckVariant || '36', table.scoreTarget || 200);
            table.gameState = startGame(game);
            games.set(game.id, game);

            // Add all players to the game-specific socket room
            table.players.forEach(player => {
                const playerSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === player.id);
                if (playerSocket) {
                    playerSocket.join(`game-${game.id}`);
                }
            });

            // Add all spectators to the game-specific socket room
            if (table.spectators) {
                table.spectators.forEach(spectator => {
                    const spectatorSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === spectator.id);
                    if (spectatorSocket) {
                        spectatorSocket.join(`game-${game.id}`);
                    }
                });
            }

            logger.debug('Emitting game_started event');
            io.to(`game-${game.id}`).emit('game_started', { game: table.gameState });

            // Notify lobby members that the table now has an active game
            const tablesArray = Array.from(lobby.tables.values());
            io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

            // Start bot turn if first player is a bot
            if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                logger.debug('First player is a bot, starting bot turn handling');
                await handleBotTurn(game);
            }
        } catch (error) {
            logger.error('Error starting game:', error);
            socket.emit('error', { message: 'Error starting game' });
        }
    });

    socket.on('leave_table', (data: { tableId: string; lobbyId?: string }) => {
        try {
            logger.debug('leave_table received:', data);
            const { tableId, lobbyId = 'default' } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                logger.debug('Lobby not found:', lobbyId);
                throw new Error('Lobby not found');
            }

            const table = lobby.tables.get(tableId);
            if (!table) {
                logger.debug('Table not found:', tableId);
                throw new Error('Table not found');
            }

            // Remove player from table
            const playerIndex = table.players.findIndex(p => p.id === player.id);
            if (playerIndex !== -1) {
                logger.debug(`Removing player ${player.name} from table ${tableId}`);
                table.players.splice(playerIndex, 1);

                // Don't reset positions - preserve original bot positions
                // This allows bots to maintain their strategic team positions (NS vs WE)

                // Remove from socket room
                socket.leave(`table-${tableId}`);

                // Notify other players in the table
                socket.to(`table-${tableId}`).emit('player_left_table', { table, player });

                // Notify all lobby members about the updated lobby
                const tablesArray = Array.from(lobby.tables.values());
                io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                // Send confirmation to player who left
                socket.emit('table_left', { success: true });

                logger.debug(`Player ${player.name} left table ${tableId}. Remaining players: ${table.players.length}`);
            } else {
                // Check if player is a spectator
                const spectatorIndex = table.spectators?.findIndex(s => s.id === player.id) ?? -1;
                if (spectatorIndex !== -1 && table.spectators) {
                    logger.debug(`Removing spectator ${player.name} from table ${tableId}`);
                    table.spectators.splice(spectatorIndex, 1);

                    // Remove from socket rooms
                    socket.leave(`table-${tableId}`);
                    socket.leave(`spectator-${tableId}`);

                    // Notify other players and spectators in the table
                    socket.to(`table-${tableId}`).emit('spectator_left_table', { table, spectator: player });

                    // Notify all lobby members about the updated lobby
                    const tablesArray = Array.from(lobby.tables.values());
                    io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                    // Send confirmation to spectator who left
                    socket.emit('table_left', { success: true });

                    logger.debug(`Spectator ${player.name} left table ${tableId}. Remaining spectators: ${table.spectators ? table.spectators.length : 0}`);
                } else {
                    logger.debug(`Player ${player.name} not found in table ${tableId} as player or spectator`);
                }
            }
        } catch (error) {
            logger.error('Error leaving table:', error);
            socket.emit('error', { message: 'Error leaving table' });
        }
    });

    socket.on('join_table', async (data: { tableId: string; lobbyId?: string; tableName?: string; numBots?: number; password?: string }) => {
        try {
            logger.debug('join_table received:', data);
            const { tableId, lobbyId = 'default', tableName, numBots = 0, password } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            // Check if player is already in an active game
            for (const [gameId, game] of games) {
                if (game.players.some(p => p.id === player.id) && game.phase !== 'finished') {
                    logger.debug(`Player ${player.name} is already in an active game (${gameId}). Cannot join another table.`);
                    throw new Error('You are already in an active game. Please finish your current game before joining another table.');
                }
            }

            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                logger.debug('Lobby not found:', lobbyId);
                throw new Error('Lobby not found');
            }

            const table = lobby.tables.get(tableId);
            if (!table) {
                logger.debug('Table not found:', tableId);
                throw new Error('Table not found');
            }

            // Check if table is private and validate password
            if (table.isPrivate && table.password) {
                if (!password || password !== table.password) {
                    logger.debug(`Player ${player.name} attempted to join private table ${tableId} with incorrect password`);
                    throw new Error('Incorrect password for private table');
                }
            }

            if (table.players.length < table.maxPlayers) {
                // Find the first available position (0, 1, 2, 3) to ensure proper rotation
                const occupiedPositions = table.players.map(p => p.position);
                let availablePosition: 0 | 1 | 2 | 3 = 0;
                while (occupiedPositions.includes(availablePosition) && availablePosition < table.maxPlayers) {
                    availablePosition = (availablePosition + 1) as 0 | 1 | 2 | 3;
                }
                player.position = availablePosition as 0 | 1 | 2 | 3;
                table.players.push(player);
                socket.join(`table-${tableId}`);

                socket.emit('table_joined', { table, player });
                socket.to(`table-${tableId}`).emit('player_joined_table', { table, player });

                // Notify all lobby members about the updated lobby
                const tablesArray = Array.from(lobby.tables.values());
                logger.debug(`Emitting lobby_updated for table ${tableId} with ${table.players.length} players`);
                io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                // Only auto-start game if table is completely full (4 players)
                logger.debug('Checking auto-start conditions:');
                logger.debug('- Table players length:', table.players.length);
                logger.debug('- Table ID:', tableId);
                logger.debug('- Has human player:', table.players.some(p => !p.isBot));
                logger.debug('- Has bots:', table.players.some(p => p.isBot));

                if (table.players.length === 4) {
                    logger.debug('Table is full - auto-starting game...');
                    const game = createGame(tableId, table.timeoutDuration, table.deckVariant || '36', table.scoreTarget || 200);
                    table.gameState = startGame(game);
                    games.set(game.id, game);

                    // Add all players to the game-specific socket room
                    table.players.forEach(player => {
                        const playerSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === player.id);
                        if (playerSocket) {
                            playerSocket.join(`game-${game.id}`);
                        }
                    });

                    // Add all spectators to the game-specific socket room
                    if (table.spectators) {
                        table.spectators.forEach(spectator => {
                            const spectatorSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === spectator.id);
                            if (spectatorSocket) {
                                spectatorSocket.join(`game-${game.id}`);
                            }
                        });
                    }

                    logger.debug('Emitting game_started event');
                    io.to(`game-${game.id}`).emit('game_started', { game: table.gameState });

                    // Notify lobby members that the table now has an active game
                    const tablesArray = Array.from(lobby.tables.values());
                    io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                    // Start bot turn if first player is a bot
                    if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                        logger.debug('First player is a bot, starting bot turn handling');
                        await handleBotTurn(game);
                    }
                } else {
                    logger.debug('Table not full - staying in waiting room.');
                }
            }
        } catch (error) {
            logger.error('Error joining table:', error);
            socket.emit('error', { message: 'Error joining table' });
        }
    });

    socket.on('join_as_spectator', async (data) => {
        try {
            logger.debug('join_as_spectator received:', data);
            const { tableId, lobbyId = 'default' } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const lobby = lobbies.get(lobbyId);
            if (!lobby) {
                logger.debug('Lobby not found:', lobbyId);
                throw new Error('Lobby not found');
            }

            const table = lobby.tables.get(tableId);
            if (!table) {
                logger.debug('Table not found:', tableId);
                throw new Error('Table not found');
            }

            // Check if table is private - spectators cannot join private tables
            if (table.isPrivate) {
                logger.debug(`Player ${player.name} attempted to spectate private table ${tableId}`);
                throw new Error('Cannot spectate private tables');
            }

            // Check if there's an active game to spectate
            if (!table.gameState) {
                logger.debug(`Player ${player.name} attempted to spectate table ${tableId} with no active game`);
                throw new Error('Cannot spectate a table with no active game');
            }

            // Check if player is already in this table as a player
            if (table.players.some(p => p.id === player.id)) {
                logger.debug(`Player ${player.name} is already in table ${tableId} as a player`);
                throw new Error('You are already in this table as a player');
            }

            // Check if player is already spectating this table
            if (table.spectators && table.spectators.some(s => s.id === player.id)) {
                logger.debug(`Player ${player.name} is already spectating table ${tableId}`);
                throw new Error('You are already spectating this table');
            }

            // Initialize spectators array if it doesn't exist
            if (!table.spectators) {
                table.spectators = [];
            }

            // Add player as spectator
            const spectator = {
                ...player,
                isSpectator: true,
                position: 0 as 0 | 1 | 2 | 3 // Spectators don't have real positions, use 0 as placeholder
            };

            table.spectators.push(spectator);
            socket.join(`table-${tableId}`);
            socket.join(`spectator-${tableId}`);

            // Send spectator the current game state if the game is in progress
            const game = games.get(table.gameState?.id);
            if (game) {
                socket.emit('spectator_joined', { table, spectator, game });
                // Also add spectator to the game room immediately
                socket.join(`game-${game.id}`);
            } else {
                socket.emit('spectator_joined', { table, spectator });
            }
            socket.to(`table-${tableId}`).emit('spectator_joined_table', { table, spectator });

            // Notify all lobby members about the updated lobby
            const tablesArray = Array.from(lobby.tables.values());
            io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

            logger.debug(`Player ${player.name} joined table ${tableId} as spectator`);
        } catch (error) {
            logger.error('Error joining as spectator:', error);
            socket.emit('error', { message: 'Error joining as spectator' });
        }
    });

    socket.on('make_bid', async (data) => {
        try {
            const { gameId, points, suit } = data;
            const game = games.get(gameId);
            if (!game) throw new Error('Game not found');

            // Ensure playersWhoHavePassed is always a Set
            ensurePlayersWhoHavePassedIsSet(game);

            const player = game.players.find(p => p.id === socket.id);
            if (!player || player.id !== game.currentPlayer) throw new Error('Player not found or not current player');

            // Check if player has already passed during this bidding round
            if (game.playersWhoHavePassed && game.playersWhoHavePassed.has(socket.id) && points > 0) {
                throw new Error('Player has already passed and cannot make a bid');
            }

            if (points === 0) {
                // Player passed - they cannot bid again until new round
                game.playersWhoHavePassed?.add(socket.id);
                game.biddingPasses = (game.biddingPasses || 0) + 1;
                logger.debug(`Player ${player.name} passed. Total passes: ${game.biddingPasses}`);
            } else {
                // Player made a bid - remove them from passed list if they were there
                game.playersWhoHavePassed?.delete(socket.id);
                game.currentBid = { playerId: socket.id, points, suit };
                game.biddingPasses = 0; // Reset pass counter when someone bids
                logger.debug(`Player ${player.name} bid ${points} points with ${suit} as trump`);
            }

            // Reset timeout for current player since they just made a move
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[socket.id] = Date.now();
            }

            // Move to next player
            const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
            game.currentPlayer = nextPlayer;
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[nextPlayer] = Date.now();
            }

            emitGameEvent(game, 'bid_made', { game });

            // Check if bidding should end
            await checkBiddingCompletion(game);

            // Handle bot players if bidding continues
            if (game.phase === 'bidding' && game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                await handleBotTurn(game);
            } else if (game.phase === 'bidding' && game.players.find(p => p.id === game.currentPlayer)?.isBot && game.playersWhoHavePassed?.has(game.currentPlayer)) {
                // Bot has already passed, move to next player
                const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
                game.currentPlayer = nextPlayer;
                if (game.playerTurnStartTime) {
                    game.playerTurnStartTime[nextPlayer] = Date.now();
                }

                // Check if bidding should end if we've gone through all players
                const nonPassedPlayers = game.players.filter(p => !game.playersWhoHavePassed?.has(p.id));
                if (nonPassedPlayers.length === 1 && game.currentBid) {
                    // Only the bidder remains - bidding ends
                    logger.debug(`Only bidder remains - bidding ends with ${game.currentBid.points} points`);

                    // Check if we need to go to kitty phase
                    logger.debug(`Kitty phase check: hasKitty=${game.hasKitty}, kittyPhaseCompleted=${game.kittyPhaseCompleted}, kitty exists=${!!game.kitty}, kitty length=${game.kitty?.length || 0}, deckVariant=${game.deckVariant}, round=${game.round}`);
                    debugKittyState(game, 'Before kitty phase decision');
                    validateKittyState(game, 'Before kitty phase decision');
                    // Enhanced kitty phase logic with safeguards
                    const shouldTriggerKitty = game.hasKitty &&
                        game.deckVariant === '40' &&
                        game.kitty &&
                        game.kitty.length > 0 &&
                        !game.kittyPhaseCompleted;

                    if (shouldTriggerKitty) {
                        if (!game.currentBid) {
                            logger.error('Current bid is undefined');
                            return;
                        }
                        logger.debug(`✅ KITTY PHASE TRIGGERED: Bid winner ${game.currentBid.playerId} enters kitty phase for round ${game.round}`);
                        debugKittyState(game, 'Kitty phase triggered');
                        game.phase = 'kitty';
                        game.currentPlayer = game.currentBid.playerId;
                    } else {
                        logger.debug(`❌ SKIPPING KITTY PHASE - hasKitty: ${game.hasKitty}, kittyPhaseCompleted: ${game.kittyPhaseCompleted}, kitty exists: ${!!game.kitty}, kitty length: ${game.kitty?.length || 0}, deckVariant: ${game.deckVariant}`);
                        debugKittyState(game, 'Kitty phase skipped');

                        // Additional validation: if kitty should exist but doesn't, log warning
                        if (game.hasKitty && game.deckVariant === '40' && (!game.kitty || game.kitty.length === 0)) {
                            logger.debug(`⚠️  WARNING: Kitty should exist but is missing or empty! Round: ${game.round}`);
                            validateKittyState(game, 'Kitty missing when it should exist');
                        }
                        game.phase = 'playing';
                        if (!game.currentBid) {
                            logger.error('Current bid is undefined');
                            return;
                        }
                        game.trumpSuit = game.currentBid.suit;
                        const contractor = game.players.find(p => p.id === game.currentBid?.playerId);
                        if (!contractor) {
                            logger.error('Contractor not found');
                            return;
                        }
                        game.contractorTeam = contractor.position % 2 === 0 ? 'team1' : 'team2';
                        game.currentPlayer = game.currentBid.playerId;
                        logger.debug(`Bid winner ${game.currentBid.playerId} will lead the first trick`);
                    }

                    logger.debug(`Emitting game_updated - phase: ${game.phase}, currentPlayer: ${game.currentPlayer}, kitty length: ${game.kitty?.length || 0}`);
                    emitGameEvent(game, 'game_updated', { game });

                    // Start the first bot turn if current player is a bot (handles both kitty and playing phases)
                    const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
                    if (currentPlayer?.isBot) {
                        logger.debug(`Starting first bot turn in ${game.phase} phase`);
                        await handleBotTurn(game);
                    }
                }
            }
        } catch (error) {
            logger.error('Error making bid:', error);
            socket.emit('error', { message: 'Error making bid' });
        }
    });

    socket.on('take_kitty', async (data) => {
        try {
            logger.debug('take_kitty received:', data);
            const { gameId } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const game = games.get(gameId);
            if (!game) {
                logger.debug('Game not found:', gameId);
                throw new Error('Game not found');
            }

            // Check if it's the kitty phase and this player is the bid winner
            if (game.phase !== 'kitty') {
                throw new Error('Not in kitty phase');
            }

            if (game.currentPlayer !== player.id) {
                throw new Error('Not your turn to take kitty');
            }

            if (!game.kitty || game.kitty.length === 0) {
                throw new Error('No kitty available');
            }

            // Add kitty cards to player's hand
            const bidWinner = game.players.find(p => p.id === player.id);
            if (bidWinner) {
                bidWinner.cards.push(...game.kitty);
                game.kitty = [];
                logger.debug(`Player ${player.name} took kitty, now has ${bidWinner.cards.length} cards`);

                // Emit game update
                emitGameEvent(game, 'game_updated', { game });
            }
        } catch (error) {
            logger.error('Error taking kitty:', error);
            socket.emit('error', { message: 'Error taking kitty' });
        }
    });

    socket.on('discard_to_kitty', async (data) => {
        try {
            logger.debug('discard_to_kitty received:', data);
            const { gameId, discardedCards, trumpSuit } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const game = games.get(gameId);
            if (!game) {
                logger.debug('Game not found:', gameId);
                throw new Error('Game not found');
            }

            // Check if it's the kitty phase and this player is the bid winner
            if (game.phase !== 'kitty') {
                throw new Error('Not in kitty phase');
            }

            if (game.currentPlayer !== player.id) {
                throw new Error('Not your turn to discard');
            }

            if (!discardedCards || discardedCards.length !== 4) {
                throw new Error('Must discard exactly 4 cards');
            }

            // Find the bid winner
            const bidWinner = game.players.find(p => p.id === player.id);
            if (!bidWinner) {
                throw new Error('Player not found in game');
            }

            // Validate that all discarded cards are in the player's hand
            const discardedCardIds = discardedCards.map((card: Card) => card.id);
            const playerCardIds = bidWinner.cards.map((card: Card) => card.id);
            const allCardsValid = discardedCardIds.every((id: string) => playerCardIds.includes(id));

            if (!allCardsValid) {
                throw new Error('Invalid cards selected for discard');
            }

            // Remove discarded cards from player's hand and add to kitty discards
            bidWinner.cards = bidWinner.cards.filter(card => !discardedCardIds.includes(card.id));
            game.kittyDiscards = discardedCards;
            logger.debug(`Player ${player.name} discarded 4 cards to kitty`);

            // Move to playing phase and set trump
            game.phase = 'playing';
            if (!game.currentBid) {
                logger.error('Current bid is undefined');
                return;
            }
            game.trumpSuit = trumpSuit || game.currentBid.suit;
            game.contractorTeam = bidWinner.position % 2 === 0 ? 'team1' : 'team2';
            game.kittyPhaseCompleted = true; // Mark kitty phase as completed for this round
            logger.debug(`Trump suit set to ${game.trumpSuit}, contractor team: ${game.contractorTeam}`);
            debugKittyState(game, 'Kitty phase completed by human player');

            // Emit game update
            emitGameEvent(game, 'game_updated', { game });

            // Start the first bot turn in playing phase if current player is a bot
            const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
            if (currentPlayer?.isBot) {
                logger.debug('Starting first bot turn in playing phase');
                await handleBotTurn(game);
            }
        } catch (error) {
            logger.error('Error discarding to kitty:', error);
            socket.emit('error', { message: 'Error discarding to kitty' });
        }
    });

    socket.on('play_card', async (data) => {
        try {
            const { gameId, card } = data;
            const game = games.get(gameId);
            if (!game) throw new Error('Game not found');

            const player = game.players.find(p => p.id === socket.id);
            if (!player || player.id !== game.currentPlayer) throw new Error('Player not found or not current player');

            // Check if player has any cards left
            if (player.cards.length === 0) {
                logger.debug(`Player ${player.name} has no cards left, cannot play`);
                throw new Error('Player has no cards left');
            }

            // Remove card from player's hand
            logger.debug(`Human player cards before: ${player.cards.length}, after: ${player.cards.length - 1}`);
            player.cards = player.cards.filter(c => c.id !== card.id);

            // Add card to current trick
            game.currentTrick.cards.push({ card, playerId: socket.id });
            logger.debug(`Trick now has ${game.currentTrick.cards.length} cards`);

            // Reset timeout for current player since they just played a card
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[socket.id] = Date.now();
            }

            // Move to next player
            const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
            game.currentPlayer = nextPlayer;
            if (game.playerTurnStartTime) {
                game.playerTurnStartTime[nextPlayer] = Date.now();
            }

            emitGameEvent(game, 'card_played', { game, card, playerId: socket.id });

            // Check if trick is complete
            if (game.currentTrick.cards.length === 4) {
                // Calculate trick winner and points
                const trickPoints = game.currentTrick.cards.reduce((total, { card }) =>
                    total + getCardValue(card), 0);
                game.currentTrick.points = trickPoints;

                // Proper trick winner logic (highest trump, then highest lead suit)
                const firstCard = game.currentTrick.cards[0];
                if (!firstCard) {
                    logger.error('No cards in current trick, skipping winner determination');
                    return;
                }
                const leadSuit = firstCard.card.suit;
                let winner = firstCard;

                for (const { card, playerId } of game.currentTrick.cards) {
                    if (card.suit === game.trumpSuit && winner.card.suit !== game.trumpSuit) {
                        // Trump beats non-trump
                        winner = { card, playerId };
                    } else if (card.suit === game.trumpSuit && winner.card.suit === game.trumpSuit) {
                        // Compare trump cards by rank
                        if (getCardRank(card.rank) > getCardRank(winner.card.rank)) {
                            winner = { card, playerId };
                        }
                    } else if (card.suit === leadSuit && winner.card.suit === leadSuit) {
                        // Compare lead suit cards by rank
                        if (getCardRank(card.rank) > getCardRank(winner.card.rank)) {
                            winner = { card, playerId };
                        }
                    }
                }

                game.currentTrick.winner = winner.playerId;
                game.lastTrick = { ...game.currentTrick };

                // Update round scores (not total team scores)
                const winnerPlayer = game.players.find(p => p.id === winner.playerId);
                if (!winnerPlayer) {
                    logger.error('Winner player not found');
                    return;
                }
                const winnerTeam = winnerPlayer.position % 2 === 0 ? 'team1' : 'team2';
                game.roundScores[winnerTeam] += trickPoints;

                // Log trick details for debugging
                logger.debug(`Trick completed! Winner: ${winnerPlayer.name} (${winner.playerId}), Card: ${winner.card.rank} of ${winner.card.suit}, Points: ${trickPoints}, Trump: ${game.trumpSuit}, Lead: ${leadSuit}`);

                // Debug: Print all players' cards after trick completion
                debugPrintAllPlayerCards(game, `After Trick Won by ${winnerPlayer?.name}`);

                // Add delay to let players see the final card before completing trick
                // Variable pause to show final card (1.5-2.5 seconds)
                const finalCardDelay = Math.random() * 1000 + 1500; // Random delay between 1500-2500ms
                logger.debug(`Pausing ${Math.round(finalCardDelay)}ms to show final card...`);
                await new Promise(resolve => setTimeout(resolve, finalCardDelay));

                // Emit trick completed event with the completed trick
                emitGameEvent(game, 'trick_completed', { game });
                // Clear the trick immediately
                // Check if all players have run out of cards (end of round)
                const allCardsPlayed = game.players.every(p => p.cards.length === 0);
                if (allCardsPlayed) {
                    logger.debug('All cards have been played! Round complete.');

                    // Debug: Print final card state (should all be 0 cards)
                    debugPrintAllPlayerCards(game, 'Round Complete - All Cards Played');

                    // Calculate round scores using proper scoring system
                    if (game.contractorTeam && game.currentBid) {
                        const contractorCardPoints = game.roundScores[game.contractorTeam];
                        const opposingTeam = game.contractorTeam === 'team1' ? 'team2' : 'team1';
                        const opposingCardPoints = game.roundScores[opposingTeam];

                        // Use proper scoring calculation including kitty discard points
                        const scoringResult = calculateRoundScores(game, game.contractorTeam, contractorCardPoints, opposingCardPoints, game.opposingTeamBid || 0);

                        // Update team scores with proper calculation
                        game.teamScores.team1 = scoringResult.team1Score;
                        game.teamScores.team2 = scoringResult.team2Score;

                        // Calculate kitty discard points for logging
                        let kittyDiscardPoints = 0;
                        if (game.kittyDiscards && game.kittyDiscards.length > 0) {
                            kittyDiscardPoints = game.kittyDiscards.reduce((total, card) => total + getCardValue(card), 0);
                        }

                        logger.debug(`Round scoring: Contractor (${game.contractorTeam}) ${contractorCardPoints} points, Opposing (${opposingTeam}) ${opposingCardPoints} points`);
                        if (kittyDiscardPoints > 0) {
                            logger.debug(`Kitty discards: ${kittyDiscardPoints} points awarded to defending team (${opposingTeam})`);
                        }
                        logger.debug(`New scores: Team1 ${game.teamScores.team1}, Team2 ${game.teamScores.team2}`);
                    }

                    // Check for game end before starting a new round
                    if (isGameEnded(game)) {
                        game.phase = 'finished';

                        // Determine winning team and create detailed game end info
                        const winningTeamInfo = getWinningTeam(game);
                        if (!winningTeamInfo) {
                            logger.error('Failed to determine winning team');
                            return;
                        }
                        const winningTeam = winningTeamInfo.team;
                        const winningTeamName = winningTeamInfo.name;

                        const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                        const gameEndInfo = {
                            game,
                            winningTeam,
                            winningTeamName,
                            winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                            finalScores: game.teamScores
                        };

                        logger.debug(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                        emitGameEvent(game, 'game_ended', gameEndInfo);

                        // Clean up game room and reset table state after game completion
                        cleanupGameRoom(game);
                        setTimeout(() => {
                            resetTableAfterGameCompletion(game.tableId);
                        }, 3000); // Give players 3 seconds to see the game end message

                        return;
                    }

                    // Start a new round
                    game.round++;
                    game.deck = createDeck(game.deckVariant || '36');
                    logger.debug(`Starting new round ${game.round} - hasKitty: ${game.hasKitty}, deckVariant: ${game.deckVariant}`);
                    debugKittyState(game, 'Before new round setup');

                    // Clear existing cards and deal new ones
                    game.players.forEach(player => {
                        player.cards = [];
                    });

                    // Deal cards to players - handle kitty if enabled
                    if (game.hasKitty && game.deckVariant === '40') {
                        // Kitty dealing: 3-2-3-2-3 pattern
                        // Each player gets 3 cards, then 2 to kitty, then 3 more, then 2 more to kitty, then 3 more
                        game.kitty = [];
                        let cardIndex = 0;

                        // First packet: 3 cards to each player
                        for (let i = 0; i < 3; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                }
                            });
                        }

                        // First kitty: 2 cards
                        for (let i = 0; i < 2; i++) {
                            if (game.deck && cardIndex < game.deck.length) {
                                const card = game.deck[cardIndex++];
                                if (card) game.kitty.push(card);
                            }
                        }

                        // Second packet: 3 more cards to each player
                        for (let i = 0; i < 3; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                }
                            });
                        }

                        // Second kitty: 2 more cards
                        for (let i = 0; i < 2; i++) {
                            if (game.deck && cardIndex < game.deck.length) {
                                const card = game.deck[cardIndex++];
                                if (card) game.kitty.push(card);
                            }
                        }

                        // Final packet: 3 more cards to each player
                        for (let i = 0; i < 3; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                }
                            });
                        }

                        logger.debug(`Kitty recreated with ${game.kitty.length} cards for round ${game.round}`);
                        debugKittyState(game, 'After kitty recreation');
                    } else {
                        // Standard dealing: 9 cards for both 36-card and 40-card decks (kitty handled separately)
                        if (!game.deck) {
                            logger.error('Game deck is undefined');
                            return;
                        }
                        const cardsPerPlayer = 9; // Always 9 cards per player, kitty logic is handled elsewhere
                        logger.debug(`🔍 DEBUG: Deck size: ${game.deck.length}, Players: ${game.players.length}, Cards per player: ${cardsPerPlayer}`);
                        let cardIndex = 0;
                        for (let i = 0; i < cardsPerPlayer; i++) {
                            game.players.forEach(player => {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) player.cards.push(card);
                                } else {
                                    logger.debug(`⚠️  WARNING: Not enough cards in deck! Player ${player.name} only got ${player.cards.length} cards`);
                                }
                            });
                        }
                        logger.debug(`🔍 DEBUG: After dealing - Player card counts:`, game.players.map(p => `${p.name}: ${p.cards.length}`));
                    }

                    // Reset for new round - clear all bid-related state
                    game.phase = 'bidding';
                    game.currentBid = undefined;
                    game.trumpSuit = undefined;
                    game.currentTrick = { cards: [], winner: undefined, points: 0 };
                    game.lastTrick = undefined; // Clear last trick for new round
                    game.kittyDiscards = undefined; // Clear kitty discards for new round
                    game.kittyPhaseCompleted = false; // Reset kitty phase completion for new round
                    game.currentPlayer = getNextPlayerByPosition(game.dealer, game.players);
                    game.dealer = game.currentPlayer;
                    game.playerTurnStartTime = { [game.currentPlayer]: Date.now() };
                    game.contractorTeam = undefined; // Reset contractor team
                    game.opposingTeamBid = 0; // Reset opposing team bid flag
                    game.roundScores = { team1: 0, team2: 0 }; // Reset round scores
                    game.biddingPasses = 0; // Reset bidding passes
                    if (game.playersWhoHavePassed) {
                        if (game.playersWhoHavePassed) {
                            game.playersWhoHavePassed.clear();
                        } // Reset the set for new round
                    }

                    logger.debug('Round reset complete - all bid parameters cleared for new round');
                    debugKittyState(game, 'After round reset');
                    validateKittyState(game, 'After round reset');

                    emitGameEvent(game, 'round_completed', { game });

                    // Pause for 3 seconds to let players see the round results in the notepad
                    // jcl
                    //console.log('Pausing for 3 seconds to let players review round results...');
                    //await new Promise(resolve => setTimeout(resolve, 3000));

                    // Start bot turn handling for new bidding phase if current player is a bot
                    if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                        logger.debug('Starting bot turn for new round bidding phase');
                        await handleBotTurn(game);
                    }
                    return;
                }

                // Start new trick - clear the trick area
                game.currentTrick = { cards: [], winner: undefined, points: 0 };
                game.currentPlayer = winner.playerId;
                const nextPlayer = game.players.find(p => p.id === winner.playerId);
                logger.debug('Trick area cleared, starting new trick. Next player:', nextPlayer ? { name: nextPlayer.name, isBot: nextPlayer.isBot } : 'NOT FOUND');

                // Emit game update to show cleared trick area
                emitGameEvent(game, 'game_updated', { game });

                // Handle next bot player if applicable
                if (nextPlayer?.isBot) {
                    logger.debug('Next player is a bot, starting bot turn');
                    await handleBotTurn(game);
                }

                // Check for game end
                if (isGameEnded(game)) {
                    game.phase = 'finished';

                    // Determine winning team and create detailed game end info
                    const winningTeamInfo = getWinningTeam(game);
                    if (!winningTeamInfo) {
                        logger.error('Failed to determine winning team');
                        return;
                    }
                    const winningTeam = winningTeamInfo.team;
                    const winningTeamName = winningTeamInfo.name;

                    const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                    const gameEndInfo = {
                        game,
                        winningTeam,
                        winningTeamName,
                        winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                        finalScores: game.teamScores
                    };

                    logger.debug(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                    io.to(`table-${game.tableId}`).emit('game_ended', gameEndInfo);

                    // Reset table state after game completion
                    setTimeout(() => {
                        resetTableAfterGameCompletion(game.tableId);
                    }, 3000); // Give players 3 seconds to see the game end message
                }
            }

            // Handle bot players - but only if we're not in the middle of a trick completion
            if (game.currentTrick.cards.length < 4 && game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                await handleBotTurn(game);
            }
        } catch (error) {
            logger.error('Error playing card:', error);
            socket.emit('error', { message: 'Error playing card' });
        }
    });

    socket.on('send_chat', (data) => {
        try {
            const { message, tableId } = data;
            const player = players.get(socket.id);
            if (!player) return;

            const chatMessage = {
                id: uuidv4(),
                playerId: socket.id,
                playerName: player.name,
                message,
                timestamp: Date.now(),
                type: 'chat'
            };

            socket.to(`table-${tableId}`).emit('chat_message', chatMessage);
        } catch (error) {
            logger.error('Error sending chat message:', error);
            socket.emit('error', { message: 'Error sending chat message' });
        }
    });

    socket.on('update_table_timeout', (data) => {
        try {
            const { tableId, timeoutDuration } = data;
            const player = players.get(socket.id);
            if (!player) throw new Error('Player not found for socket');

            const lobby = lobbies.get('default');
            if (!lobby) throw new Error('Lobby not found');
            const table = lobby.tables.get(tableId);
            if (!table) throw new Error('Table not found');

            // Check if player is the table creator
            if (table.creator !== player.name) {
                throw new Error('Only the table creator can update timeout settings');
            }

            // Update timeout duration
            table.timeoutDuration = timeoutDuration;
            logger.debug(`Table ${tableId} timeout updated to ${timeoutDuration}ms by ${player.name}`);

            // Notify all players in the table about the update
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Also update lobby for players not in the table
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error updating table timeout:', error);
            socket.emit('error', { message: 'Error updating table timeout' });
        }
    });

    socket.on('update_table_deck_variant', (data) => {
        try {
            const { tableId, deckVariant } = data;
            const player = players.get(socket.id);
            if (!player) throw new Error('Player not found for socket');

            const lobby = lobbies.get('default');
            if (!lobby) throw new Error('Lobby not found');
            const table = lobby.tables.get(tableId);
            if (!table) throw new Error('Table not found');

            // Check if player is the table creator
            if (table.creator !== player.name) {
                throw new Error('Only the table creator can update deck variant settings');
            }

            // Check if game has already started
            if (table.gameState) {
                throw new Error('Cannot change deck variant after game has started');
            }

            // Update deck variant
            table.deckVariant = deckVariant;
            logger.debug(`Table ${tableId} deck variant updated to ${deckVariant} by ${player.name}`);

            // Notify all players in the table about the update
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Also update lobby for players not in the table
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error updating table deck variant:', error);
            socket.emit('error', { message: 'Error updating table deck variant' });
        }
    });

    socket.on('update_table_score_target', (data) => {
        try {
            const { tableId, scoreTarget } = data;
            const player = players.get(socket.id);
            if (!player) throw new Error('Player not found for socket');

            const lobby = lobbies.get('default');
            if (!lobby) throw new Error('Lobby not found');
            const table = lobby.tables.get(tableId);
            if (!table) throw new Error('Table not found');

            // Check if player is the table creator
            if (table.creator !== player.name) {
                throw new Error('Only the table creator can update score target settings');
            }

            // Check if game has already started
            if (table.gameState) {
                throw new Error('Cannot change score target after game has started');
            }

            // Update score target
            table.scoreTarget = scoreTarget;
            logger.debug(`Table ${tableId} score target updated to ${scoreTarget} by ${player.name}`);

            // Notify all players in the table about the update
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Also update lobby for players not in the table
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error updating table score target:', error);
            socket.emit('error', { message: 'Error updating table score target' });
        }
    });

    socket.on('update_table_kitty', (data) => {
        try {
            const { tableId, hasKitty } = data;
            const player = players.get(socket.id);
            if (!player) throw new Error('Player not found for socket');

            const lobby = lobbies.get('default');
            if (!lobby) throw new Error('Lobby not found');
            const table = lobby.tables.get(tableId);
            if (!table) throw new Error('Table not found');

            // Check if player is the table creator
            if (table.creator !== player.name) {
                throw new Error('Only the table creator can update kitty settings');
            }

            // Check if game has already started
            if (table.gameState) {
                throw new Error('Cannot change kitty settings after game has started');
            }

            // Check if kitty is only available with 40-card deck
            if (hasKitty && table.deckVariant !== '40') {
                throw new Error('Kitty is only available with 40-card deck');
            }

            // Update kitty setting
            table.hasKitty = hasKitty;
            logger.debug(`Table ${tableId} kitty setting updated to ${hasKitty} by ${player.name}`);

            // Notify all players in the table about the update
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Also update lobby for players not in the table
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error updating table kitty:', error);
            socket.emit('error', { message: 'Error updating table kitty' });
        }
    });

    socket.on('update_table_privacy', (data) => {
        try {
            const { tableId, isPrivate, password } = data;
            const player = players.get(socket.id);
            if (!player) throw new Error('Player not found for socket');

            const lobby = lobbies.get('default');
            if (!lobby) throw new Error('Lobby not found');
            const table = lobby.tables.get(tableId);
            if (!table) throw new Error('Table not found');

            // Check if player is the table creator
            if (table.creator !== player.name) {
                throw new Error('Only the table creator can update privacy settings');
            }

            // Check if game has already started
            if (table.gameState) {
                throw new Error('Cannot change privacy settings after game has started');
            }

            // Update privacy settings
            table.isPrivate = isPrivate;
            table.password = isPrivate ? password : undefined;
            logger.debug(`Table ${tableId} privacy setting updated to ${isPrivate} by ${player.name}`);

            // Notify all players in the table about the update
            io.to(`table-${tableId}`).emit('table_updated', { table });

            // Also update lobby for players not in the table
            notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
        } catch (error) {
            logger.error('Error updating table privacy:', error);
            socket.emit('error', { message: 'Error updating table privacy' });
        }
    });

    socket.on('delete_table', (data) => {
        try {
            const { tableId, lobbyId = 'default' } = data;
            const player = players.get(socket.id);
            if (!player) throw new Error('Player not found for socket');

            const lobby = lobbies.get(lobbyId);
            if (!lobby) throw new Error('Lobby not found');

            const table = lobby.tables.get(tableId);
            if (!table) throw new Error('Table not found');

            // Only allow the creator to delete the table
            if (table.creator !== player.name) {
                throw new Error('Only the table creator can delete this table');
            }

            // Don't allow deleting tables with active games
            if (table.gameState) {
                throw new Error('Cannot delete table with an active game');
            }

            // Remove all players from the table's socket room
            io.to(`table-${tableId}`).emit('table_deleted', { tableId });

            // Remove the table
            lobby.tables.delete(tableId);
            logger.debug(`Table ${tableId} deleted by ${player.name}`);

            // Notify all lobby members about the updated lobby
            const tablesArray = Array.from(lobby.tables.values());
            io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });
        } catch (error) {
            logger.error('Error deleting table:', error);
            socket.emit('error', { message: 'Error deleting table' });
        }
    });

    socket.on('exit_game', (data) => {
        try {
            logger.debug('exit_game received:', data);
            const { gameId, playerName } = data;
            const player = players.get(socket.id);
            if (!player) {
                logger.debug('Player not found for socket:', socket.id);
                throw new Error('Player not found for socket');
            }

            const game = games.get(gameId);
            if (!game) {
                logger.debug('Game not found:', gameId);
                throw new Error('Game not found');
            }

            // Verify the player is in this game
            const gamePlayer = game.players.find(p => p.id === player.id);
            if (!gamePlayer) {
                logger.debug('Player not in game:', player.name);
                throw new Error('You are not in this game');
            }

            logger.debug(`Player ${player.name} is exiting game ${gameId}`);

            // End the game for all players
            game.phase = 'finished';
            cleanupGameRoom(game);

            // Get the lobby and table
            const lobby = lobbies.get('default');
            const table = lobby?.tables.get(game.tableId);

            // Remove the game from memory
            games.delete(gameId);

            if (lobby && table) {
                // Remove all spectators and notify them
                if (table.spectators && table.spectators.length > 0) {
                    logger.info(`Removing ${table.spectators.length} spectators from table ${game.tableId} due to player exit`);

                    table.spectators.forEach(spectator => {
                        // Notify spectator that the game ended due to player exit
                        const spectatorSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === spectator.id);
                        if (spectatorSocket) {
                            spectatorSocket.leave(`table-${game.tableId}`);
                            spectatorSocket.leave(`spectator-${game.tableId}`);
                            spectatorSocket.emit('game_ended_for_spectator', {
                                message: `${playerName} has exited the game. Returning to lobby.`,
                                reason: 'Player exited'
                            });

                            // Return spectator to lobby
                            spectatorSocket.emit('lobby_joined', {
                                lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                                player: spectator
                            });
                        }
                    });

                    // Clear spectators array
                    table.spectators = [];
                }

                // Keep only AI players on the table, remove human players
                const botPlayers = game.players.filter(player => player.isBot);
                table.players = botPlayers;
                table.gameState = undefined;

                // Notify all table members about the updated table
                io.to(`table-${game.tableId}`).emit('table_updated', { table });

                // Force all human players back to lobby with exit message
                const humanPlayers = game.players.filter(p => !p.isBot);
                humanPlayers.forEach(humanPlayer => {
                    // For human players, emit to their socket
                    io.to(humanPlayer.id).emit('player_exited_game', {
                        message: `${playerName} has exited the game. Returning to lobby.`,
                        exitedPlayerName: playerName
                    });
                    io.to(humanPlayer.id).emit('lobby_joined', {
                        lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                        player: humanPlayer
                    });
                });

                // Update lobby for all players
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            }

            logger.debug(`Game ${gameId} ended due to player exit by ${player.name}`);
        } catch (error) {
            logger.error('Error exiting game:', error);
            socket.emit('error', { message: 'Error exiting game' });
        }
    });

    socket.on('disconnect', () => {
        try {
            logger.debug('Player disconnected:', socket.id);
            const player = players.get(socket.id);
            if (player && player.name) {
                releasePlayerName(player.name);
                logger.debug(`Released name "${player.name}"`);

                // Remove player from any tables and games
                const affectedLobbies = new Set<string>();
                for (const [lobbyId, lobby] of lobbies) {
                    for (const [tableId, table] of lobby.tables) {
                        const playerIndex = table.players.findIndex(p => p.id === player.id);
                        if (playerIndex !== -1) {
                            logger.debug(`Removing disconnected player ${player.name} from table ${tableId}`);
                            table.players.splice(playerIndex, 1);
                            affectedLobbies.add(lobbyId);

                            // Notify table members about the change
                            socket.to(`table-${tableId}`).emit('player_left_table', { table, player });
                        }

                        // Also check if player was a spectator
                        if (table.spectators) {
                            const spectatorIndex = table.spectators.findIndex(s => s.id === player.id);
                            if (spectatorIndex !== -1) {
                                logger.debug(`Removing disconnected spectator ${player.name} from table ${tableId}`);
                                table.spectators.splice(spectatorIndex, 1);
                                affectedLobbies.add(lobbyId);

                                // Notify table members about spectator leaving
                                socket.to(`table-${tableId}`).emit('spectator_left_table', { table, spectator: player });
                            }
                        }
                    }
                }

                // Only notify affected lobbies once
                affectedLobbies.forEach((lobbyId: string) => {
                    const lobby = lobbies.get(lobbyId);
                    if (lobby) {
                        notifyLobbyMembers(lobbyId, 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
                    }
                });
            }

            // Remove player from any active games
            if (player) {
                for (const [gameId, game] of games) {
                    const playerIndex = game.players.findIndex(p => p.id === player.id);
                    if (playerIndex !== -1) {
                        logger.debug(`Removing disconnected player ${player.name} from game ${gameId}`);
                        game.players.splice(playerIndex, 1);

                        // If game becomes invalid (less than 4 players), end it
                        if (game.players.length < 4 && game.phase !== 'finished') {
                            logger.debug(`Game ${gameId} has insufficient players (${game.players.length}), ending game`);
                            game.phase = 'finished';
                            cleanupGameRoom(game);

                            // Notify remaining players that the game ended due to player disconnect
                            emitGameEvent(game, 'game_ended', {
                                game,
                                reason: 'Player disconnected',
                                disconnectedPlayer: player.name
                            });

                            // Reset table state after game ends due to disconnect
                            setTimeout(() => {
                                resetTableAfterGameCompletion(game.tableId);
                            }, 3000); // Give players 3 seconds to see the game end message
                        }
                    }
                }
            }

            players.delete(socket.id);
        } catch (error) {
            logger.error('Error disconnecting:', error);
            socket.emit('error', { message: 'Error disconnecting' });
        }
    });
});


// Create the default tables after SimpleBotAI is defined
create3BotTables(5); // Create 2 default tables with 3 bots each
createBigBubTable();
createAcadieTable();
createAcadienTestTable();

/* start server */
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});
