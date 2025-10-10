import { Rank, Card, Table, Player, Lobby, Suit, Game } from "../types/game";
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger';
import { debugPrintAllPlayerCards, debugKittyState } from './debug';
import { AcadienBotAI, SimpleBotAI } from './bots';
import { emitGameEvent } from './events';
import { io } from '../index';
import { defaultLobby, lobbies, deleteGame } from './state';
import { resetPlayerTimeouts } from "./timeouts";
import { initializeTranscript, recordGameStart, recordRoundStart, recordTrickComplete, recordCardPlayed, recordBid, recordPass, recordGameComplete, recordRoundComplete } from './transcript';

export function getCardValue(card: Card): number {
    const values: { [key in Rank]: number } = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
    return values[card.rank] || 0;
}

export function getCardRank(rank: Rank): number {
    const ranks: { [key in Rank]: number } = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5 };
    return ranks[rank] || 0;
}

// Function to validate kitty state and log warnings
export function validateKittyState(game: Game, context: string = ''): boolean {
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
export function getRandomHumanName(): string {
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
export function reservePlayerName(playerName: string): boolean {
    if (usedNames.has(playerName)) {
        logger.warn(`Name "${playerName}" is already taken`);
        return false; // Name already taken
    }
    usedNames.add(playerName);
    logger.debug(`Reserved name "${playerName}". Available names: ${usedNames.size} used, ${humanNames.length - usedNames.size} available`);
    return true; // Name reserved successfully
}

// Function to release a name when a player disconnects
export function releasePlayerName(playerName: string): void {
    usedNames.delete(playerName);
    logger.debug(`Released name "${playerName}". Available names: ${usedNames.size} used, ${humanNames.length - usedNames.size} available`);
}

// Game logic functions
export function createDeck(deckVariant: '36' | '40' = '36'): Card[] {
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

export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = shuffled[i]!;
        shuffled[i] = shuffled[j]!;
        shuffled[j] = temp;
    }
    return shuffled;
}

export function dealCards(deck: Card[], players: Player[], deckVariant: '36' | '40' = '36'): Player[] {
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

export function getNextPlayerByPosition(currentPlayerId: string, players: Player[]): string {
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

export function calculateRoundScores(game: Game, contractorTeam: 'team1' | 'team2', contractorCardPoints: number, opposingCardPoints: number, opposingTeamBid: number): { team1Score: number; team2Score: number } {
    const currentBid = game.currentBid;
    if (!currentBid) return { team1Score: 0, team2Score: 0 };

    const contractorScore = game.teamScores[contractorTeam];
    const opposingScore = game.teamScores[contractorTeam === 'team1' ? 'team2' : 'team1'];

    let newContractorScore = contractorScore;
    let newOpposingScore = opposingScore;

    // Calculate kitty discards points (go to defending team)
    // Only award kitty discard points if the game has kitty enabled
    let kittyDiscardPoints = 0;
    if (game.hasKitty && game.kittyDiscards && game.kittyDiscards.length > 0) {
        kittyDiscardPoints = game.kittyDiscards.reduce((total, card) => total + getCardValue(card), 0);
        logger.debug(`Kitty discards worth ${kittyDiscardPoints} points going to defending team`);
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
    // TODO: Implement proper tracking of opposing team bids per RULES2.md line 45
    // Rule: If opposing team has 100+ points and didn't bid, they score nothing
    // Currently opposingTeamBid is never tracked, so this rule is disabled
    // For now, opposing team always gets their card points
    newOpposingScore += opposingCardPoints;

    // Add kitty discard points to opposing team (defending team)
    newOpposingScore += kittyDiscardPoints;

    return {
        team1Score: contractorTeam === 'team1' ? newContractorScore : newOpposingScore,
        team2Score: contractorTeam === 'team2' ? newContractorScore : newOpposingScore
    };
}

// Helper function to check if game has ended
export function isGameEnded(game: Game): boolean {
    const target = game.scoreTarget || 200;
    return game.teamScores.team1 >= target || game.teamScores.team2 >= target ||
        game.teamScores.team1 <= -target || game.teamScores.team2 <= -target;
}

// Helper function to determine winning team
export function getWinningTeam(game: Game): { team: 'team1' | 'team2'; name: string } | null {
    const target = game.scoreTarget || 200;
    if (game.teamScores.team1 >= target) return { team: 'team1', name: 'Team 1' };
    if (game.teamScores.team2 >= target) return { team: 'team2', name: 'Team 2' };
    if (game.teamScores.team1 <= -target) return { team: 'team2', name: 'Team 2' }; // team1 loses
    if (game.teamScores.team2 <= -target) return { team: 'team1', name: 'Team 1' }; // team2 loses
    return null;
}

export function createGame(tableId: string, timeoutDuration: number = 30000, deckVariant: '36' | '40' = '36', scoreTarget: 200 | 300 | 500 | 1000 = 200): Game {
    const gameId = uuidv4();

    // Get the table to copy players from
    const lobby = defaultLobby;
    const table = lobby?.tables.get(tableId);

    const game: Game = {
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

    return game;
}

export function addBotPlayer(game: Game, skill: 'easy' | 'medium' | 'hard' | 'acadien' = 'medium'): Player {
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

export function addAItoExistingBots(game: Game): void {
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

export function startGame(game: Game): Game {
    logger.debug('Starting game: ', game.id);

    // Reset all player timeouts at the start of a new game to prevent bleeding from previous games
    if (game.playerTurnStartTime) {
        logger.debug(`Resetting player timeouts at start of game ${game.id}`);
        game.playerTurnStartTime = {};
    }

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

    // Initialize and record game start in global transcript storage
    recordGameStart(game);
    recordRoundStart(game);

    logger.info("Game started successfully.");

    // Debug: Print all players' cards at game start
    debugPrintAllPlayerCards(game, 'Game Start - Initial Deal');

    return game;
}


// Helper function to ensure playersWhoHavePassed is always a Set
export function ensurePlayersWhoHavePassedIsSet(game: Game): void {
    if (game.playersWhoHavePassed && !(game.playersWhoHavePassed instanceof Set)) {
        logger.info('Converting playersWhoHavePassed from', typeof game.playersWhoHavePassed, 'to Set');
        game.playersWhoHavePassed = new Set(game.playersWhoHavePassed);
    }
}


export async function checkBiddingCompletion(game: Game): Promise<void> {
    // Ensure playersWhoHavePassed is always a Set
    ensurePlayersWhoHavePassedIsSet(game);

    // Check if bidding should end based on the rules:
    // 1. If someone bids 100 (highest possible bid)
    // 2. If 3 players have passed

    // If someone has bid 100, bidding ends immediately
    if (game.currentBid && game.currentBid.points >= 100) {
        logger.debug(`Bid of ${game.currentBid.points} points - bidding ends, moving to ${game.hasKitty && !game.kittyPhaseCompleted && game.kitty && game.kitty.length > 0 ? 'kitty' : 'playing'} phase`);

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
        logger.debug(`Bid of ${game.currentBid.points} points stands - all other players passed, bidding ends`);

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
            logger.debug(`Only bidder remains - bidding ends with ${game.currentBid.points} points`);
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
        logger.debug('All players passed - no bid made, starting new round');
        // All players passed, start a new round
        game.round++;
        game.deck = createDeck(game.deckVariant || '36');
        logger.debug(`Starting new round ${game.round} (all passed) - hasKitty: ${game.hasKitty}, deckVariant: ${game.deckVariant}`);

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

            logger.debug(`Kitty recreated with ${game.kitty.length} cards for round ${game.round} (all passed)`);
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
        // console.log('Pausing for 10 seconds to let players review round results...');
        // await new Promise(resolve => setTimeout(resolve, 10000));

        // Start bot turn handling for new bidding phase if current player is a bot and hasn't passed
        const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
        if (currentPlayer?.isBot && !game.playersWhoHavePassed?.has(game.currentPlayer)) {
            logger.debug('Starting bot turn for new round bidding phase');
            await handleBotTurn(game);
        }
        return;
    }

    logger.debug(`Bidding continues - passes: ${game.biddingPasses}, current bid: ${game.currentBid ? game.currentBid.points : 'none'}`);
}


export async function handleBotTurn(game: Game): Promise<void> {
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
        if (!process.env.INTEGRATION_TEST) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

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
        if (!process.env.INTEGRATION_TEST) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const handValue = currentPlayer.cards.reduce((total, card) => total + getCardValue(card), 0);
        const bidResult = currentPlayer.botSkill === 'acadien'
            ? currentPlayer.ai.makeBid(handValue, game.currentBid, game.currentBid?.playerId, currentPlayer.id, game.players, game)
            : currentPlayer.ai.makeBid(handValue, game.currentBid, game.currentBid?.playerId, currentPlayer.id, game.players);

        logger.debug(`Bot ${currentPlayer.name} (${currentPlayer.botSkill}) making bid decision: ${bidResult ? bidResult.points + ' points' : 'pass'}`);

        if (bidResult && bidResult.points > 0) {
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
            game.currentBid = { playerId: currentPlayer.id, points: bidResult.points, suit: bestSuit };
            game.biddingPasses = 0; // Reset pass counter when someone bids

            logger.debug(`Bot ${currentPlayer.name} bid ${bidResult.points} points with ${bestSuit} as trump suit`);

            // Record bot bid in transcript
            recordBid(game, currentPlayer.id, game.currentBid);
        } else {
            // Bot passed - they cannot bid again until new round
            game.playersWhoHavePassed?.add(currentPlayer.id);
            game.biddingPasses = (game.biddingPasses || 0) + 1;
            logger.debug(`Bot ${currentPlayer.name} passed. Total passes: ${game.biddingPasses}`);

            // Record bot pass in transcript
            recordPass(game, currentPlayer.id);
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
        // Safety check: if bot has no cards, don't try to play
        if (currentPlayer.cards.length === 0) {
            logger.warn(`Bot ${currentPlayer.name} has no cards left, cannot play. Game may be in inconsistent state.`);
            return;
        }

        // Add 1 second delay for bot card playing to make it feel more natural
        if (!process.env.INTEGRATION_TEST) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

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

            // Record card played in transcript (for bot plays)
            recordCardPlayed(game, currentPlayer.id, card);

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

                // Record trick complete in transcript (for bot tricks)
                recordTrickComplete(game, winner.playerId, trickPoints, game.currentTrick);

                // Debug: Print all players' cards after trick completion
                debugPrintAllPlayerCards(game, `After Trick Won by ${winnerPlayer?.name}`);

                // Add delay to let players see the final card before completing trick
                // Variable pause to show final card (1.5-2.5 seconds)
                // jcl
                //const finalCardDelay = Math.random() * 1000 + 1500; // Random delay between 1500-2500ms

                // jcl
                if (!process.env.INTEGRATION_TEST) {
                    const finalCardDelay = 2000; // 2 seconds
                    logger.debug(`Pausing ${Math.round(finalCardDelay)}ms to show final card...`);
                    await new Promise(resolve => setTimeout(resolve, finalCardDelay));
                }

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
                        if (game.hasKitty && game.kittyDiscards && game.kittyDiscards.length > 0) {
                            kittyDiscardPoints = game.kittyDiscards.reduce((total, card) => total + getCardValue(card), 0);
                        }

                        logger.debug(`Round scoring: Contractor (${game.contractorTeam}) ${contractorCardPoints} points, Opposing (${opposingTeam}) ${opposingCardPoints} points`);
                        if (kittyDiscardPoints > 0) {
                            logger.debug(`Kitty discards: ${kittyDiscardPoints} points awarded to defending team (${opposingTeam})`);
                        }
                        logger.debug(`New scores: Team1 ${game.teamScores.team1}, Team2 ${game.teamScores.team2}`);
                    }

                    // Record round complete in transcript (for bot-completed rounds)
                    recordRoundComplete(game, game.roundScores);

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

                        // Record game complete in transcript (for bot-completed games)
                        recordGameComplete(game, winningTeam, winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })));

                        emitGameEvent(game, 'game_ended', gameEndInfo);

                        // Reset table state after game completion
                        if (!process.env.INTEGRATION_TEST) {
                            setTimeout(() => {
                                resetTableAfterGameCompletion(game.tableId);
                            }, 3000); // Give players 3 seconds to see the game end message
                        } else {
                            resetTableAfterGameCompletion(game.tableId);
                        }

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

                    // Record game complete in transcript (from bot turn handler)
                    recordGameComplete(game, winningTeam, winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })));

                    emitGameEvent(game, 'game_ended', gameEndInfo);

                    // Clean up game room and reset table state after game completion
                    cleanupGameRoom(game);
                    if (!process.env.INTEGRATION_TEST) {
                        setTimeout(() => {
                            resetTableAfterGameCompletion(game.tableId);
                        }, 3000); // Give players 3 seconds to see the game end message
                    } else {
                        resetTableAfterGameCompletion(game.tableId);
                    }

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

                    // Use proper scoring calculation including kitty discard points
                    const scoringResult = calculateRoundScores(game, game.contractorTeam, contractorCardPoints, opposingCardPoints, game.opposingTeamBid || 0);

                    // Update team scores with proper calculation
                    game.teamScores.team1 = scoringResult.team1Score;
                    game.teamScores.team2 = scoringResult.team2Score;

                    // Calculate kitty discard points for logging
                    let kittyDiscardPoints = 0;
                    if (game.hasKitty && game.kittyDiscards && game.kittyDiscards.length > 0) {
                        kittyDiscardPoints = game.kittyDiscards.reduce((total, card) => total + getCardValue(card), 0);
                    }

                    logger.debug(`Round scoring: Contractor (${game.contractorTeam}) ${contractorCardPoints} points, Opposing (${opposingTeam}) ${opposingCardPoints} points`);
                    if (kittyDiscardPoints > 0) {
                        logger.debug(`Kitty discards: ${kittyDiscardPoints} points awarded to defending team (${opposingTeam})`);
                    }
                    logger.debug(`New scores: Team1 ${game.teamScores.team1}, Team2 ${game.teamScores.team2}`);
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

// Function to reset table state after game completion
export function resetTableAfterGameCompletion(tableId: string,): void {
    const lobby = defaultLobby;
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

/* game helpers */
// Helper function to notify only lobby members (not players in active games)
export function notifyLobbyMembers(lobbyId: string, event: string, data: any): void {
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


// Helper function to clean up game-specific socket rooms when game ends
export function cleanupGameRoom(game: Game): void {
    if (game && game.id) {
        // Note: Transcript is already in global storage, no need to save here
        logger.debug(`Cleaning up game room for game ${game.id} (transcript remains in global storage)`);

        // Reset all player timeouts to prevent bleeding into next game
        resetPlayerTimeouts(game);

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
        deleteGame(game.id);
        logger.info(`Cleaned up game room: game-${game.id}`);
    }
}
