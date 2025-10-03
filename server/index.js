const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://192.168.2.15:3000",
            /^http:\/\/192\.168\.\d+\.\d+:3000$/,  // Allow any 192.168.x.x:3000
            process.env.FRONTEND_URL || "https://tens-game.railway.app"  // Production frontend URL
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
        process.env.FRONTEND_URL || "https://tens-game.railway.app"  // Production frontend URL
    ],
    credentials: true
}));
app.use(express.json());

// Serve static files from the React app build
app.use(express.static('dist'));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Game state storage
const games = new Map();
const lobbies = new Map();
const players = new Map();

// Initialize a default lobby
const defaultLobby = {
    id: 'default',
    name: 'Main Lobby',
    tables: new Map()
};
lobbies.set('default', defaultLobby);

// Create multiple default tables with 3 bot players each
function create3BotTables(numTables = 1) {
    for (let tableNum = 1; tableNum <= numTables; tableNum++) {
        const tableId = tableNum === 1 ? 'robot-fun-table' : `robot-fun-table-${tableNum}`;
        const tableName = tableNum === 1 ? 'Robot Fun' : `Robot Fun ${tableNum}`;

        const table = {
            id: tableId,
            name: tableName,
            players: [],
            gameState: null,
            maxPlayers: 4,
            isPrivate: false
        };

        // Add 3 bot players (without AI for now, will be added when game starts)
        // Position them sequentially (0, 1, 2) leaving position 3 for human player
        const botSkills = ['easy', 'medium', 'hard'];
        for (let i = 0; i < 3; i++) {
            const botId = `bot-${uuidv4()}`;
            const bot = {
                id: botId,
                name: getRandomHumanName(),
                isBot: true,
                botSkill: botSkills[i],
                position: i, // Sequential positions: 0, 1, 2
                cards: [],
                score: 0,
                isReady: true
            };
            table.players.push(bot);
        }

        defaultLobby.tables.set(tableId, table);
        console.log(`Created default table "${tableName}" with 3 bot players`);
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
function getRandomHumanName() {
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
    usedNames.add(selectedName);
    return selectedName;
}

// Function to check if a human name is available and reserve it
function reservePlayerName(playerName) {
    if (usedNames.has(playerName)) {
        console.log(`Name "${playerName}" is already taken`);
        return false; // Name already taken
    }
    usedNames.add(playerName);
    console.log(`Reserved name "${playerName}". Available names: ${usedNames.size} used, ${humanNames.length - usedNames.size} available`);
    return true; // Name reserved successfully
}

// Function to release a name when a player disconnects
function releasePlayerName(playerName) {
    usedNames.delete(playerName);
    console.log(`Released name "${playerName}". Available names: ${usedNames.size} used, ${humanNames.length - usedNames.size} available`);
}

// Function to reset table state after game completion
function resetTableAfterGameCompletion(tableId) {
    const lobby = lobbies.get('default');
    const table = lobby?.tables.get(tableId);

    if (!table) {
        console.log(`Table ${tableId} not found for reset`);
        return;
    }

    console.log(`Resetting table ${tableId} after game completion`);

    // Remove all human players from the table
    /*
    const humanPlayers = table.players.filter(player => !player.isBot);
    humanPlayers.forEach(player => {
        console.log(`Removing human player ${player.name} from table ${tableId}`);
        // Remove player from players map
        players.delete(player.id);
        // Release their name
        releasePlayerName(player.name);
    });
    */

    // Keep only bot players
    table.players = table.players.filter(player => player.isBot);

    // Reset table state
    table.gameState = null;

    // Reset bot player states
    table.players.forEach(player => {
        player.cards = [];
        player.score = 0;
        player.isReady = true;
    });

    console.log(`Table ${tableId} reset complete. Remaining players: ${table.players.length} bots`);

    // Notify lobby about the updated table
    const tablesArray = Array.from(lobby.tables.values());
    io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

    // Notify any remaining table members
    io.to(`table-${tableId}`).emit('table_updated', { table });
}

// Function to debug and print all players' cards
function debugPrintAllPlayerCards(game, context = '') {
    console.log(`\n🃏 DEBUG: All Players' Cards ${context ? `(${context})` : ''}`);
    console.log('='.repeat(50));
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
        console.log(`${index + 1}. ${player.name} (${playerType}) - ${player.cards.length} cards: [${cardsList}]`);
    });
    console.log('='.repeat(50));
    console.log(`Total cards in play: ${game.players.reduce((sum, player) => sum + player.cards.length, 0)}/36\n`);
}

// Bot AI (simplified for server)
class SimpleBotAI {
    constructor(skill = 'medium') {
        this.skill = skill;
    }

    makeBid(handValue, currentBid, currentBidderId, myPlayerId, players) {
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
                    console.log(`Bot won't outbid teammate who bid ${currentBid.points}`);
                    return 0; // Don't outbid teammate
                }
            }

            // Don't bid if current bid is already at or above theoretical maximum
            if (currentBid.points >= theoreticalMax) {
                console.log(`Bot won't bid - current bid ${currentBid.points} >= theoretical max ${theoreticalMax}`);
                return 0;
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
            return 0; // Don't bid with less than 30 points
        }

        // Ensure minimum bid is 50
        suggestedBid = Math.max(suggestedBid, 50);

        // If there's a current bid, only bid if we can beat it reasonably
        if (currentBid) {
            const minBidToBeat = currentBid.points + 5;
            if (minBidToBeat > suggestedBid) {
                console.log(`Bot won't bid - would need ${minBidToBeat} but only suggests ${suggestedBid}`);
                return 0;
            }
            suggestedBid = minBidToBeat;
        }

        // Ensure bid is multiple of 5 and within reasonable limits
        const finalBid = Math.min(Math.floor(suggestedBid / 5) * 5, theoreticalMax);

        // Final safety check - ensure minimum bid is 50
        if (finalBid < 50) {
            console.log(`Bot won't bid - final bid ${finalBid} is below minimum of 50`);
            return 0;
        }

        console.log(`Bot suggests bid: ${finalBid} (hand value: ${handValue}, theoretical max: ${theoreticalMax})`);
        return finalBid;
    }

    async playCard(playableCards, leadSuit, trumpSuit) {
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
        console.log(`${this.skill} bot thinking for ${Math.round(delay)}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        */

        if (playableCards.length === 0) return null;

        // Simple strategy: prefer playing high-value cards if we have the lead suit
        // or low-value cards if we don't
        const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '5': 5 };

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
            return playableCards[Math.floor(Math.random() * playableCards.length)];
        }
    }
}

// Create a Big Bub table with 2 bot players
function createBigBubTable() {
    const tableId = 'big-bub-table';
    const table = {
        id: tableId,
        name: 'Big Bub',
        players: [],
        gameState: null,
        maxPlayers: 4,
        isPrivate: false
    };

    // Add 2 bot players at North (0) and South (2), leaving East (1) and West (3) for human players
    const botSkills = ['medium', 'hard'];
    const botPositions = [0, 2]; // North and South
    for (let i = 0; i < 2; i++) {
        const botId = `bot-${uuidv4()}`;
        const bot = {
            id: botId,
            name: getRandomHumanName(),
            isBot: true,
            botSkill: botSkills[i],
            position: botPositions[i],
            cards: [],
            score: 0,
            isReady: true
        };
        table.players.push(bot);
    }

    defaultLobby.tables.set(tableId, table);
    console.log('Created Big Bub table with 2 bot players');
}

// Create the default tables after SimpleBotAI is defined
create3BotTables(5); // Create 2 default tables with 3 bots each
createBigBubTable();

// Game logic functions
function createDeck() {
    const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
    const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '5'];
    const deck = [];

    suits.forEach(suit => {
        ranks.forEach(rank => {
            deck.push({ suit, rank, id: `${suit}-${rank}` });
        });
    });

    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function dealCards(deck, players) {
    const updatedPlayers = [...players];
    let cardIndex = 0;

    for (let i = 0; i < 9; i++) {
        updatedPlayers.forEach(player => {
            if (cardIndex < deck.length) {
                player.cards.push(deck[cardIndex++]);
            }
        });
    }

    return updatedPlayers;
}

function getCardValue(card) {
    const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '5': 5 };
    return values[card.rank] || 0;
}

function getCardRank(rank) {
    const ranks = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '5': 5 };
    return ranks[rank] || 0;
}

function getNextPlayerByPosition(currentPlayerId, players) {
    const currentPlayer = players.find(p => p.id === currentPlayerId);
    if (!currentPlayer) {
        console.log('ERROR: Current player not found:', currentPlayerId);
        return players[0].id;
    }

    const nextPosition = (currentPlayer.position + 1) % 4;
    const nextPlayer = players.find(p => p.position === nextPosition);

    return nextPlayer ? nextPlayer.id : players[0].id;
}

function calculateRoundScores(game, contractorTeam, contractorCardPoints, opposingCardPoints, opposingTeamBid) {
    const currentBid = game.currentBid;
    if (!currentBid) return { team1Score: 0, team2Score: 0 };

    const contractorScore = game.teamScores[contractorTeam];
    const opposingScore = game.teamScores[contractorTeam === 'team1' ? 'team2' : 'team1'];

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

function createGame(tableId) {
    const gameId = uuidv4();

    // Get the table to copy players from
    const lobby = lobbies.get('default');
    const table = lobby?.tables.get(tableId);

    const game = {
        id: gameId,
        tableId,
        players: table ? [...table.players] : [], // Copy players from table
        currentPlayer: null,
        phase: 'waiting',
        trumpSuit: null,
        currentBid: null,
        currentTrick: { cards: [], winner: null, points: 0 },
        lastTrick: null,
        round: 0,
        teamScores: { team1: 0, team2: 0 },
        roundScores: { team1: 0, team2: 0 }, // Points accumulated during current round
        dealer: null,
        spectatorIds: [],
        deck: createDeck(),
        contractorTeam: null, // Track which team is the contractor
        opposingTeamBid: false, // Track if opposing team made any bid
        biddingPasses: 0, // Track number of consecutive passes
        biddingRound: 0 // Track which round of bidding we're in
    };

    games.set(gameId, game);
    return game;
}

function addBotPlayer(game, skill = 'medium') {
    const botId = `bot-${uuidv4()}`;
    const bot = {
        id: botId,
        name: getRandomHumanName(),
        isBot: true,
        botSkill: skill,
        position: game.players.length,
        cards: [],
        score: 0,
        isReady: true,
        ai: new SimpleBotAI(skill)
    };

    game.players.push(bot);
    return bot;
}

function addAItoExistingBots(game) {
    // Add AI to existing bot players
    game.players.forEach(player => {
        if (player.isBot && !player.ai) {
            player.ai = new SimpleBotAI(player.botSkill);
        }
    });
}

function startGame(game) {
    console.log('Starting game with players:', game.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })));

    // Add AI to existing bot players
    addAItoExistingBots(game);

    if (game.players.length < 4) {
        console.log('Adding bots to fill table. Current players:', game.players.length);
        // Add bots to fill the table
        while (game.players.length < 4) {
            const skills = ['easy', 'medium', 'hard'];
            const skill = skills[Math.floor(Math.random() * skills.length)];
            addBotPlayer(game, skill);
        }
    }

    game.deck = createDeck();

    // Clear existing cards and deal new ones
    game.players.forEach(player => {
        player.cards = [];
    });

    // Deal cards to players
    let cardIndex = 0;
    for (let i = 0; i < 9; i++) {
        game.players.forEach(player => {
            if (cardIndex < game.deck.length) {
                player.cards.push(game.deck[cardIndex++]);
            }
        });
    }

    game.phase = 'bidding';
    game.currentPlayer = game.players[0].id;
    game.dealer = game.players[0].id;
    game.round = 1;

    console.log('Game started successfully. Players with cards:', game.players.map(p => ({
        id: p.id,
        name: p.name,
        cardCount: p.cards.length
    })));

    // Debug: Print all players' cards at game start
    debugPrintAllPlayerCards(game, 'Game Start - Initial Deal');

    return game;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join_lobby', (data) => {
        console.log('join_lobby received:', data);
        const { playerName, lobbyId = 'default' } = data;

        // Check if this is a rejoin with the same name (same socket ID)
        const existingPlayer = players.get(socket.id);
        if (existingPlayer && existingPlayer.name === playerName) {
            console.log(`Player "${playerName}" rejoining lobby with same name`);
            // Allow rejoin with same name
        } else {
            // Check if the name is already taken by a different player
            if (!reservePlayerName(playerName)) {
                console.log(`Name "${playerName}" is already taken`);
                socket.emit('name_taken', { message: `The name "${playerName}" is already taken. Please choose a different name.` });
                return;
            }
        }

        const player = {
            id: socket.id,
            name: playerName,
            isBot: false,
            position: null,
            cards: [],
            score: 0,
            isReady: false
        };

        players.set(socket.id, player);
        socket.join(lobbyId);

        const lobby = lobbies.get(lobbyId);
        console.log('Lobby found:', lobby);
        if (lobby) {
            // Convert Map to Array for the lobby tables
            const tablesArray = lobby.tables ? Array.from(lobby.tables.values()) : [];
            console.log('Sending lobby_joined with tables:', tablesArray);
            socket.emit('lobby_joined', { lobby: { ...lobby, tables: tablesArray }, player });
            socket.to(lobbyId).emit('player_joined', { player });
        } else {
            console.log('Lobby not found for ID:', lobbyId);
        }
    });

    socket.on('create_table', (data) => {
        console.log('create_table received:', data);
        const { tableId, lobbyId = 'default', tableName } = data;
        const player = players.get(socket.id);
        if (!player) {
            console.log('Player not found for socket:', socket.id);
            return;
        }

        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            console.log('Lobby not found:', lobbyId);
            return;
        }

        // Check if table already exists
        if (lobby.tables.has(tableId)) {
            console.log('Table already exists:', tableId);
            return;
        }

        console.log('Creating new table:', tableId, 'with name:', tableName);
        const table = {
            id: tableId,
            name: tableName || `Table ${tableId}`,
            players: [],
            gameState: null,
            maxPlayers: 4,
            isPrivate: false,
            creator: player.name
        };

        // Add the creator as the first player
        player.position = 0;
        table.players.push(player);
        console.log(`Added creator ${player.name} to new table`);

        lobby.tables.set(tableId, table);
        console.log('Table created successfully');

        // Add creator to table socket room
        socket.join(`table-${tableId}`);

        // Notify all lobby members about the new table
        const tablesArray = Array.from(lobby.tables.values());
        io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

        // Send table_joined event to redirect creator to waiting room
        socket.emit('table_joined', { table, player });

        // Send confirmation to creator
        socket.emit('table_created', { table, success: true });
    });

    socket.on('add_bot', (data) => {
        console.log('add_bot received:', data);
        const { tableId, position, skill = 'medium' } = data;
        const player = players.get(socket.id);
        if (!player) {
            console.log('Player not found for socket:', socket.id);
            return;
        }

        const lobby = lobbies.get('default');
        if (!lobby) {
            console.log('Lobby not found');
            return;
        }

        const table = lobby.tables.get(tableId);
        if (!table) {
            console.log('Table not found:', tableId);
            return;
        }

        // Check if user is the table creator
        if (table.creator !== player.name) {
            console.log('Only table creator can add bots');
            socket.emit('error', { message: 'Only the table creator can add bots' });
            return;
        }

        // Check if position is already occupied
        if (table.players.some(p => p.position === position)) {
            console.log('Position already occupied:', position);
            socket.emit('error', { message: 'Position already occupied' });
            return;
        }

        // Create bot player
        const botId = `bot-${uuidv4()}`;
        const bot = {
            id: botId,
            name: getRandomHumanName(),
            isBot: true,
            botSkill: skill,
            position: position,
            cards: [],
            score: 0,
            isReady: true
        };

        table.players.push(bot);
        console.log(`Added bot ${bot.name} at position ${position}`);

        // Notify all table members about the updated table
        io.to(`table-${tableId}`).emit('table_updated', { table });

        // Notify all lobby members about the updated lobby
        const tablesArray = Array.from(lobby.tables.values());
        io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });
    });

    socket.on('remove_bot', (data) => {
        console.log('remove_bot received:', data);
        const { tableId, botId } = data;
        const player = players.get(socket.id);
        if (!player) {
            console.log('Player not found for socket:', socket.id);
            return;
        }

        const lobby = lobbies.get('default');
        if (!lobby) {
            console.log('Lobby not found');
            return;
        }

        const table = lobby.tables.get(tableId);
        if (!table) {
            console.log('Table not found:', tableId);
            return;
        }

        // Check if user is the table creator
        if (table.creator !== player.name) {
            console.log('Only table creator can remove bots');
            socket.emit('error', { message: 'Only the table creator can remove bots' });
            return;
        }

        // Find and remove the bot
        const botIndex = table.players.findIndex(p => p.id === botId && p.isBot);
        if (botIndex === -1) {
            console.log('Bot not found:', botId);
            socket.emit('error', { message: 'Bot not found' });
            return;
        }

        const removedBot = table.players.splice(botIndex, 1)[0];
        console.log(`Removed bot ${removedBot.name} from position ${removedBot.position}`);

        // Notify all table members about the updated table
        io.to(`table-${tableId}`).emit('table_updated', { table });

        // Notify all lobby members about the updated lobby
        const tablesArray = Array.from(lobby.tables.values());
        io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });
    });

    socket.on('move_player', (data) => {
        console.log('move_player received:', data);
        const { tableId, newPosition } = data;
        const player = players.get(socket.id);
        if (!player) {
            console.log('Player not found for socket:', socket.id);
            return;
        }

        const lobby = lobbies.get('default');
        if (!lobby) {
            console.log('Lobby not found');
            return;
        }

        const table = lobby.tables.get(tableId);
        if (!table) {
            console.log('Table not found:', tableId);
            return;
        }

        // Check if the position is valid (0-3)
        if (newPosition < 0 || newPosition >= table.maxPlayers) {
            console.log('Invalid position:', newPosition);
            socket.emit('error', { message: 'Invalid position' });
            return;
        }

        // Check if the new position is already occupied
        const positionOccupied = table.players.some(p => p.position === newPosition);
        if (positionOccupied) {
            console.log('Position already occupied:', newPosition);
            socket.emit('error', { message: 'Position already occupied' });
            return;
        }

        // Find the player in the table
        const playerIndex = table.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) {
            console.log('Player not found in table');
            socket.emit('error', { message: 'Player not found in table' });
            return;
        }

        // Update the player's position
        const oldPosition = table.players[playerIndex].position;
        table.players[playerIndex].position = newPosition;
        console.log(`Moved player ${player.name} from position ${oldPosition} to position ${newPosition}`);

        // Notify all table members about the updated table
        io.to(`table-${tableId}`).emit('table_updated', { table });

        // Notify all lobby members about the updated lobby
        const tablesArray = Array.from(lobby.tables.values());
        io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });
    });

    socket.on('start_game', async (data) => {
        console.log('start_game received:', data);
        const { tableId } = data;
        const player = players.get(socket.id);
        if (!player) {
            console.log('Player not found for socket:', socket.id);
            return;
        }

        const lobby = lobbies.get('default');
        if (!lobby) {
            console.log('Lobby not found');
            return;
        }

        const table = lobby.tables.get(tableId);
        if (!table) {
            console.log('Table not found:', tableId);
            return;
        }

        // Check if user is the table creator
        if (table.creator !== player.name) {
            console.log('Only table creator can start the game');
            socket.emit('error', { message: 'Only the table creator can start the game' });
            return;
        }

        // Check if table has exactly 4 players
        if (table.players.length !== 4) {
            console.log('Table must have exactly 4 players to start');
            socket.emit('error', { message: 'Table must have exactly 4 players to start' });
            return;
        }

        // Check if game is already started
        if (table.gameState) {
            console.log('Game already started');
            socket.emit('error', { message: 'Game already started' });
            return;
        }

        console.log('Starting game manually for table:', tableId);
        const game = createGame(tableId);
        table.gameState = startGame(game);
        games.set(game.id, game);

        console.log('Emitting game_started event');
        io.to(`table-${tableId}`).emit('game_started', { game: table.gameState });

        // Start bot turn if first player is a bot
        if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
            console.log('First player is a bot, starting bot turn handling');
            await handleBotTurn(game);
        }
    });

    socket.on('leave_table', (data) => {
        console.log('leave_table received:', data);
        const { tableId, lobbyId = 'default' } = data;
        const player = players.get(socket.id);
        if (!player) {
            console.log('Player not found for socket:', socket.id);
            return;
        }

        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            console.log('Lobby not found:', lobbyId);
            return;
        }

        const table = lobby.tables.get(tableId);
        if (!table) {
            console.log('Table not found:', tableId);
            return;
        }

        // Remove player from table
        const playerIndex = table.players.findIndex(p => p.id === player.id);
        if (playerIndex !== -1) {
            console.log(`Removing player ${player.name} from table ${tableId}`);
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

            console.log(`Player ${player.name} left table ${tableId}. Remaining players: ${table.players.length}`);
        } else {
            console.log(`Player ${player.name} not found in table ${tableId}`);
        }
    });

    socket.on('join_table', async (data) => {
        console.log('join_table received:', data);
        const { tableId, lobbyId = 'default', tableName, numBots = 0 } = data;
        const player = players.get(socket.id);
        if (!player) {
            console.log('Player not found for socket:', socket.id);
            return;
        }

        // Check if player is already in an active game
        for (const [gameId, game] of games) {
            if (game.players.some(p => p.id === player.id) && game.phase !== 'finished') {
                console.log(`Player ${player.name} is already in an active game (${gameId}). Cannot join another table.`);
                socket.emit('error', { message: 'You are already in an active game. Please finish your current game before joining another table.' });
                return;
            }
        }

        const lobby = lobbies.get(lobbyId);
        if (!lobby) {
            console.log('Lobby not found:', lobbyId);
            return;
        }

        const table = lobby.tables.get(tableId);
        if (!table) {
            console.log('Table not found:', tableId);
            socket.emit('error', { message: 'Table not found' });
            return;
        }

        if (table.players.length < table.maxPlayers) {
            // Find the first available position (0, 1, 2, 3) to ensure proper rotation
            const occupiedPositions = table.players.map(p => p.position);
            let availablePosition = 0;
            while (occupiedPositions.includes(availablePosition) && availablePosition < table.maxPlayers) {
                availablePosition++;
            }
            player.position = availablePosition;
            table.players.push(player);
            socket.join(`table-${tableId}`);

            socket.emit('table_joined', { table, player });
            socket.to(`table-${tableId}`).emit('player_joined_table', { table, player });

            // Notify all lobby members about the updated lobby
            const tablesArray = Array.from(lobby.tables.values());
            io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

            // Only auto-start game if table is completely full (4 players)
            console.log('Checking auto-start conditions:');
            console.log('- Table players length:', table.players.length);
            console.log('- Table ID:', tableId);
            console.log('- Has human player:', table.players.some(p => !p.isBot));
            console.log('- Has bots:', table.players.some(p => p.isBot));

            if (table.players.length === 4) {
                console.log('Table is full - auto-starting game...');
                const game = createGame(tableId);
                table.gameState = startGame(game);
                games.set(game.id, game);

                console.log('Emitting game_started event');
                io.to(`table-${tableId}`).emit('game_started', { game: table.gameState });

                // Start bot turn if first player is a bot
                if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                    console.log('First player is a bot, starting bot turn handling');
                    await handleBotTurn(game);
                }
            } else {
                console.log('Table not full - staying in waiting room.');
            }
        }
    });

    socket.on('make_bid', async (data) => {
        const { gameId, points, suit } = data;
        const game = games.get(gameId);
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || player.id !== game.currentPlayer) return;

        if (points === 0) {
            // Player passed
            game.biddingPasses++;
            console.log(`Player ${player.name} passed. Total passes: ${game.biddingPasses}`);
        } else {
            // Player made a bid
            game.currentBid = { playerId: socket.id, points, suit };
            game.biddingPasses = 0; // Reset pass counter when someone bids
            console.log(`Player ${player.name} bid ${points} points with ${suit} as trump`);
        }

        // Move to next player
        game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);

        io.to(`table-${game.tableId}`).emit('bid_made', { game });

        // Check if bidding should end
        await checkBiddingCompletion(game);

        // Handle bot players if bidding continues
        if (game.phase === 'bidding' && game.players.find(p => p.id === game.currentPlayer)?.isBot) {
            await handleBotTurn(game);
        }
    });

    socket.on('play_card', async (data) => {
        const { gameId, card } = data;
        const game = games.get(gameId);
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || player.id !== game.currentPlayer) return;

        // Remove card from player's hand
        console.log(`Human player cards before: ${player.cards.length}, after: ${player.cards.length - 1}`);
        player.cards = player.cards.filter(c => c.id !== card.id);

        // Add card to current trick
        game.currentTrick.cards.push({ card, playerId: socket.id });
        console.log(`Trick now has ${game.currentTrick.cards.length} cards`);

        // Move to next player
        game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);

        io.to(`table-${game.tableId}`).emit('card_played', { game, card, playerId: socket.id });

        // Check if trick is complete
        if (game.currentTrick.cards.length === 4) {
            // Calculate trick winner and points
            const trickPoints = game.currentTrick.cards.reduce((total, { card }) =>
                total + getCardValue(card), 0);
            game.currentTrick.points = trickPoints;

            // Proper trick winner logic (highest trump, then highest lead suit)
            const leadSuit = game.currentTrick.cards[0].card.suit;
            let winner = game.currentTrick.cards[0];

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
            const winnerTeam = game.players.find(p => p.id === winner.playerId).position % 2 === 0 ? 'team1' : 'team2';
            game.roundScores[winnerTeam] += trickPoints;

            // Log trick details for debugging
            const winnerPlayer = game.players.find(p => p.id === winner.playerId);
            console.log(`Trick completed! Winner: ${winnerPlayer?.name} (${winner.playerId}), Card: ${winner.card.rank} of ${winner.card.suit}, Points: ${trickPoints}, Trump: ${game.trumpSuit}, Lead: ${leadSuit}`);

            // Debug: Print all players' cards after trick completion
            debugPrintAllPlayerCards(game, `After Trick Won by ${winnerPlayer?.name}`);

            // Add delay to let players see the final card before completing trick
            // Variable pause to show final card (1.5-2.5 seconds)
            const finalCardDelay = Math.random() * 1000 + 1500; // Random delay between 1500-2500ms
            console.log(`Pausing ${Math.round(finalCardDelay)}ms to show final card...`);
            await new Promise(resolve => setTimeout(resolve, finalCardDelay));

            // Emit trick completed event with the completed trick
            io.to(`table-${game.tableId}`).emit('trick_completed', { game });
            // Clear the trick immediately
            // Check if all players have run out of cards (end of round)
            const allCardsPlayed = game.players.every(p => p.cards.length === 0);
            if (allCardsPlayed) {
                console.log('All cards have been played! Round complete.');

                // Debug: Print final card state (should all be 0 cards)
                debugPrintAllPlayerCards(game, 'Round Complete - All Cards Played');

                // Calculate round scores using proper scoring system
                if (game.contractorTeam && game.currentBid) {
                    const contractorCardPoints = game.roundScores[game.contractorTeam];
                    const opposingTeam = game.contractorTeam === 'team1' ? 'team2' : 'team1';
                    const opposingCardPoints = game.roundScores[opposingTeam];

                    // Reset team scores to calculate proper round scores
                    const contractorScore = game.teamScores[game.contractorTeam];
                    const opposingScore = game.teamScores[opposingTeam];

                    // Apply proper scoring rules
                    let newContractorScore = contractorScore;
                    let newOpposingScore = opposingScore;

                    if (contractorCardPoints >= game.currentBid.points) {
                        // Contractor made their bid - add card points to their score
                        newContractorScore += contractorCardPoints;
                    } else {
                        // Contractor failed - subtract bid amount from their score
                        newContractorScore -= game.currentBid.points;
                    }

                    // Opposing team scoring (simplified - assume they can always score for now)
                    newOpposingScore += opposingCardPoints;

                    // Update team scores
                    game.teamScores[game.contractorTeam] = newContractorScore;
                    game.teamScores[opposingTeam] = newOpposingScore;

                    console.log(`Round scoring: Contractor (${game.contractorTeam}) ${contractorCardPoints} points, Opposing (${opposingTeam}) ${opposingCardPoints} points`);
                    console.log(`New scores: Team1 ${game.teamScores.team1}, Team2 ${game.teamScores.team2}`);
                }

                // Check for game end before starting a new round
                if (game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200 ||
                    game.teamScores.team1 <= -200 || game.teamScores.team2 <= -200) {
                    game.phase = 'finished';

                    // Determine winning team and create detailed game end info
                    let winningTeam, winningTeamName;
                    if (game.teamScores.team1 >= 200) {
                        winningTeam = 'team1';
                        winningTeamName = 'Team 1';
                    } else if (game.teamScores.team2 >= 200) {
                        winningTeam = 'team2';
                        winningTeamName = 'Team 2';
                    } else if (game.teamScores.team1 <= -200) {
                        winningTeam = 'team2'; // team1 loses
                        winningTeamName = 'Team 2';
                    } else if (game.teamScores.team2 <= -200) {
                        winningTeam = 'team1'; // team2 loses
                        winningTeamName = 'Team 1';
                    }

                    const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                    const gameEndInfo = {
                        game,
                        winningTeam,
                        winningTeamName,
                        winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                        finalScores: game.teamScores
                    };

                    console.log(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                    io.to(`table-${game.tableId}`).emit('game_ended', gameEndInfo);

                    // Reset table state after game completion
                    setTimeout(() => {
                        resetTableAfterGameCompletion(game.tableId);
                    }, 3000); // Give players 3 seconds to see the game end message

                    return;
                }

                // Start a new round
                game.round++;
                game.deck = createDeck();

                // Clear existing cards and deal new ones
                game.players.forEach(player => {
                    player.cards = [];
                });

                // Deal cards to players
                let cardIndex = 0;
                for (let i = 0; i < 9; i++) {
                    game.players.forEach(player => {
                        if (cardIndex < game.deck.length) {
                            player.cards.push(game.deck[cardIndex++]);
                        }
                    });
                }

                // Reset for new round - clear all bid-related state
                game.phase = 'bidding';
                game.currentBid = null;
                game.trumpSuit = null;
                game.currentTrick = { cards: [], winner: null, points: 0 };
                game.lastTrick = null; // Clear last trick for new round
                game.currentPlayer = getNextPlayerByPosition(game.dealer, game.players);
                game.dealer = game.currentPlayer;
                game.contractorTeam = null; // Reset contractor team
                game.opposingTeamBid = false; // Reset opposing team bid flag
                game.roundScores = { team1: 0, team2: 0 }; // Reset round scores
                game.biddingPasses = 0; // Reset bidding passes
                game.biddingRound = 0; // Reset bidding round

                console.log('Round reset complete - all bid parameters cleared for new round');

                io.to(`table-${game.tableId}`).emit('round_completed', { game });

                // Pause for a variable time (1-2 seconds) to let players see the final trick
                const pauseDelay = Math.random() * 1000 + 1000; // Random delay between 1000-2000ms
                console.log(`Pausing for ${Math.round(pauseDelay)}ms before starting new round...`);
                await new Promise(resolve => setTimeout(resolve, pauseDelay));

                // Start bot turn handling for new bidding phase if current player is a bot
                if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                    console.log('Starting bot turn for new round bidding phase');
                    await handleBotTurn(game);
                }
                return;
            }

            // Start new trick - clear the trick area
            game.currentTrick = { cards: [], winner: null, points: 0 };
            game.currentPlayer = winner.playerId;
            const nextPlayer = game.players.find(p => p.id === winner.playerId);
            console.log('Trick area cleared, starting new trick. Next player:', nextPlayer ? { name: nextPlayer.name, isBot: nextPlayer.isBot } : 'NOT FOUND');

            // Emit game update to show cleared trick area
            io.to(`table-${game.tableId}`).emit('game_updated', { game });

            // Handle next bot player if applicable
            if (nextPlayer?.isBot) {
                console.log('Next player is a bot, starting bot turn');
                await handleBotTurn(game);
            }

            // Check for game end
            if (game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200 ||
                game.teamScores.team1 <= -200 || game.teamScores.team2 <= -200) {
                game.phase = 'finished';

                // Determine winning team and create detailed game end info
                let winningTeam, winningTeamName;
                if (game.teamScores.team1 >= 200) {
                    winningTeam = 'team1';
                    winningTeamName = 'Team 1';
                } else if (game.teamScores.team2 >= 200) {
                    winningTeam = 'team2';
                    winningTeamName = 'Team 2';
                } else if (game.teamScores.team1 <= -200) {
                    winningTeam = 'team2'; // team1 loses
                    winningTeamName = 'Team 2';
                } else if (game.teamScores.team2 <= -200) {
                    winningTeam = 'team1'; // team2 loses
                    winningTeamName = 'Team 1';
                }

                const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                const gameEndInfo = {
                    game,
                    winningTeam,
                    winningTeamName,
                    winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                    finalScores: game.teamScores
                };

                console.log(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
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
    });

    socket.on('send_chat', (data) => {
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
    });

    socket.on('delete_table', (data) => {
        const { tableId, lobbyId = 'default' } = data;
        const player = players.get(socket.id);
        if (!player) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        const table = lobby.tables.get(tableId);
        if (!table) return;

        // Only allow the creator to delete the table
        if (table.creator !== player.name) {
            socket.emit('error', { message: 'Only the table creator can delete this table' });
            return;
        }

        // Don't allow deleting tables with active games
        if (table.gameState) {
            socket.emit('error', { message: 'Cannot delete table with an active game' });
            return;
        }

        // Remove all players from the table's socket room
        io.to(`table-${tableId}`).emit('table_deleted', { tableId });

        // Remove the table
        lobby.tables.delete(tableId);
        console.log(`Table ${tableId} deleted by ${player.name}`);

        // Notify all lobby members about the updated lobby
        const tablesArray = Array.from(lobby.tables.values());
        io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });
    });

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        const player = players.get(socket.id);
        if (player && player.name) {
            releasePlayerName(player.name);
            console.log(`Released name "${player.name}"`);

            // Remove player from any tables and games
            for (const [lobbyId, lobby] of lobbies) {
                for (const [tableId, table] of lobby.tables) {
                    const playerIndex = table.players.findIndex(p => p.id === player.id);
                    if (playerIndex !== -1) {
                        console.log(`Removing disconnected player ${player.name} from table ${tableId}`);
                        table.players.splice(playerIndex, 1);

                        // Update lobby for remaining players
                        const tablesArray = Array.from(lobby.tables.values());
                        io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });
                    }
                }
            }

            // Remove player from any active games
            for (const [gameId, game] of games) {
                const playerIndex = game.players.findIndex(p => p.id === player.id);
                if (playerIndex !== -1) {
                    console.log(`Removing disconnected player ${player.name} from game ${gameId}`);
                    game.players.splice(playerIndex, 1);

                    // If game becomes invalid (less than 4 players), end it
                    if (game.players.length < 4 && game.phase !== 'finished') {
                        console.log(`Game ${gameId} has insufficient players (${game.players.length}), ending game`);
                        game.phase = 'finished';

                        // Notify remaining players that the game ended due to player disconnect
                        io.to(`table-${game.tableId}`).emit('game_ended', {
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
    });
});

async function checkBiddingCompletion(game) {
    // Check if bidding should end based on the rules:
    // 1. If someone bids 100 (highest possible bid)
    // 2. If 3 players have passed

    // If someone has bid 100, bidding ends immediately
    if (game.currentBid && game.currentBid.points >= 100) {
        console.log(`Bid of ${game.currentBid.points} points - bidding ends, moving to playing phase`);
        game.phase = 'playing';
        game.trumpSuit = game.currentBid.suit;
        game.contractorTeam = game.players.find(p => p.id === game.currentBid.playerId).position % 2 === 0 ? 'team1' : 'team2';
        game.currentPlayer = game.currentBid.playerId;
        console.log(`Bid winner ${game.currentBid.playerId} will lead the first trick`);

        io.to(`table-${game.tableId}`).emit('game_updated', { game });

        // Start the first bot turn in playing phase if current player is a bot
        const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
        if (currentPlayer?.isBot) {
            console.log('Starting first bot turn in playing phase');
            await handleBotTurn(game);
        }
        return;
    }

    // If 3 players have passed, bidding ends
    if (game.biddingPasses >= 3) {
        if (game.currentBid) {
            console.log(`3 players passed - bidding ends with current bid of ${game.currentBid.points} points`);
            game.phase = 'playing';
            game.trumpSuit = game.currentBid.suit;
            game.contractorTeam = game.players.find(p => p.id === game.currentBid.playerId).position % 2 === 0 ? 'team1' : 'team2';
            game.currentPlayer = game.currentBid.playerId;
            console.log(`Bid winner ${game.currentBid.playerId} will lead the first trick`);

            io.to(`table-${game.tableId}`).emit('game_updated', { game });

            // Start the first bot turn in playing phase if current player is a bot
            const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
            if (currentPlayer?.isBot) {
                console.log('Starting first bot turn in playing phase');
                await handleBotTurn(game);
            }
        } else {
            console.log('All players passed - no bid made, starting new round');
            // All players passed, start a new round
            game.round++;
            game.deck = createDeck();

            // Clear existing cards and deal new ones
            game.players.forEach(player => {
                player.cards = [];
            });

            // Deal cards to players
            let cardIndex = 0;
            for (let i = 0; i < 9; i++) {
                game.players.forEach(player => {
                    if (cardIndex < game.deck.length) {
                        player.cards.push(game.deck[cardIndex++]);
                    }
                });
            }

            // Reset for new round
            game.currentBid = null;
            game.trumpSuit = null;
            game.currentTrick = { cards: [], winner: null, points: 0 };
            game.currentPlayer = getNextPlayerByPosition(game.dealer, game.players);
            game.dealer = game.currentPlayer;
            game.contractorTeam = null;
            game.opposingTeamBid = false;
            game.roundScores = { team1: 0, team2: 0 };
            game.biddingPasses = 0;
            game.biddingRound = 0;

            io.to(`table-${game.tableId}`).emit('round_completed', { game });

            // Start bot turn handling for new bidding phase if current player is a bot
            if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                console.log('Starting bot turn for new round bidding phase');
                await handleBotTurn(game);
            }
        }
        return;
    }

    console.log(`Bidding continues - passes: ${game.biddingPasses}, current bid: ${game.currentBid ? game.currentBid.points : 'none'}`);
}

async function handleBotTurn(game) {
    console.log('handleBotTurn called for game:', game.id);
    console.log('Current player ID:', game.currentPlayer);
    console.log('Game phase:', game.phase);

    const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
    console.log('Current player found:', currentPlayer ? { id: currentPlayer.id, name: currentPlayer.name, isBot: currentPlayer.isBot, hasAI: !!currentPlayer.ai, cardCount: currentPlayer.cards.length } : 'NOT FOUND');

    if (!currentPlayer || !currentPlayer.isBot) {
        console.log('Exiting handleBotTurn - not a bot or player not found');
        return;
    }

    if (game.phase === 'bidding') {
        // Add 1 second delay for bot bidding to make it feel more natural
        await new Promise(resolve => setTimeout(resolve, 1000));

        const handValue = currentPlayer.cards.reduce((total, card) => total + getCardValue(card), 0);
        const bidPoints = currentPlayer.ai.makeBid(
            handValue,
            game.currentBid,
            game.currentBid?.playerId,
            currentPlayer.id,
            game.players
        );

        console.log(`Bot ${currentPlayer.name} (${currentPlayer.botSkill}) making bid: ${bidPoints} points`);

        if (bidPoints > 0) {
            // Trump suit selection is required for any bid
            const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
            const suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };

            // Count cards in each suit
            currentPlayer.cards.forEach(card => {
                suitCounts[card.suit]++;
            });

            // Select the suit with the most cards
            const bestSuit = Object.entries(suitCounts)
                .sort(([, a], [, b]) => b - a)[0][0];

            game.currentBid = { playerId: currentPlayer.id, points: bidPoints, suit: bestSuit };
            game.biddingPasses = 0; // Reset pass counter when someone bids

            console.log(`Bot ${currentPlayer.name} bid ${bidPoints} points with ${bestSuit} as trump suit`);
        } else {
            // Bot passed
            game.biddingPasses++;
            console.log(`Bot ${currentPlayer.name} passed. Total passes: ${game.biddingPasses}`);
        }

        // Always move to next player after bot makes decision (bid or pass)
        game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);

        io.to(`table-${game.tableId}`).emit('bid_made', { game });

        // Check if bidding should end
        await checkBiddingCompletion(game);

        // Handle next bot player if applicable
        if (game.players.find(p => p.id === game.currentPlayer)?.isBot && game.phase === 'bidding') {
            await handleBotTurn(game);
        }
    } else if (game.phase === 'playing') {
        // Add 1 second delay for bot card playing to make it feel more natural
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Determine lead suit from current trick
        const leadSuit = game.currentTrick.cards.length > 0
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

        console.log(`Bot ${currentPlayer.name} has ${currentPlayer.cards.length} total cards, ${playableCards.length} playable cards`);
        console.log(`Lead suit: ${leadSuit}, Trump suit: ${game.trumpSuit}`);
        const card = await currentPlayer.ai.playCard(playableCards, leadSuit, game.trumpSuit);

        if (card) {
            console.log(`Bot ${currentPlayer.name} playing card: ${card.rank} of ${card.suit}`);
            console.log(`Bot ${currentPlayer.name} cards before: ${currentPlayer.cards.length}, after: ${currentPlayer.cards.length - 1}`);
            currentPlayer.cards = currentPlayer.cards.filter(c => c.id !== card.id);
            game.currentTrick.cards.push({ card, playerId: currentPlayer.id });
            console.log(`Trick now has ${game.currentTrick.cards.length} cards`);

            // Move to next player
            game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);

            io.to(`table-${game.tableId}`).emit('card_played', { game, card, playerId: currentPlayer.id });

            // Check if trick is complete (same logic as human player)
            if (game.currentTrick.cards.length === 4) {
                // Calculate trick winner and points
                const trickPoints = game.currentTrick.cards.reduce((total, { card }) =>
                    total + getCardValue(card), 0);
                game.currentTrick.points = trickPoints;

                // Proper trick winner logic (highest trump, then highest lead suit)
                const leadSuit = game.currentTrick.cards[0].card.suit;
                let winner = game.currentTrick.cards[0];

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
                const winnerTeam = game.players.find(p => p.id === winner.playerId).position % 2 === 0 ? 'team1' : 'team2';
                game.roundScores[winnerTeam] += trickPoints;

                // Log trick details for debugging
                const winnerPlayer = game.players.find(p => p.id === winner.playerId);
                console.log(`Trick completed! Winner: ${winnerPlayer?.name} (${winner.playerId}), Card: ${winner.card.rank} of ${winner.card.suit}, Points: ${trickPoints}, Trump: ${game.trumpSuit}, Lead: ${leadSuit}`);

                // Debug: Print all players' cards after trick completion
                debugPrintAllPlayerCards(game, `After Trick Won by ${winnerPlayer?.name}`);

                // Add delay to let players see the final card before completing trick
                // Variable pause to show final card (1.5-2.5 seconds)
                const finalCardDelay = Math.random() * 1000 + 1500; // Random delay between 1500-2500ms
                console.log(`Pausing ${Math.round(finalCardDelay)}ms to show final card...`);
                await new Promise(resolve => setTimeout(resolve, finalCardDelay));

                // Emit trick completed event with the completed trick
                io.to(`table-${game.tableId}`).emit('trick_completed', { game });
                // Clear the trick immediately
                // Check if all players have run out of cards (end of round)
                const allCardsPlayed = game.players.every(p => p.cards.length === 0);
                if (allCardsPlayed) {
                    console.log('All cards have been played! Round complete.');

                    // Debug: Print final card state (should all be 0 cards)
                    debugPrintAllPlayerCards(game, 'Round Complete - All Cards Played');

                    // Calculate round scores using proper scoring system
                    if (game.contractorTeam && game.currentBid) {
                        const contractorCardPoints = game.roundScores[game.contractorTeam];
                        const opposingTeam = game.contractorTeam === 'team1' ? 'team2' : 'team1';
                        const opposingCardPoints = game.roundScores[opposingTeam];

                        // Reset team scores to calculate proper round scores
                        const contractorScore = game.teamScores[game.contractorTeam];
                        const opposingScore = game.teamScores[opposingTeam];

                        // Apply proper scoring rules
                        let newContractorScore = contractorScore;
                        let newOpposingScore = opposingScore;

                        if (contractorCardPoints >= game.currentBid.points) {
                            // Contractor made their bid - add card points to their score
                            newContractorScore += contractorCardPoints;
                        } else {
                            // Contractor failed - subtract bid amount from their score
                            newContractorScore -= game.currentBid.points;
                        }

                        // Opposing team scoring (simplified - assume they can always score for now)
                        newOpposingScore += opposingCardPoints;

                        // Update team scores
                        game.teamScores[game.contractorTeam] = newContractorScore;
                        game.teamScores[opposingTeam] = newOpposingScore;

                        console.log(`Round scoring: Contractor (${game.contractorTeam}) ${contractorCardPoints} points, Opposing (${opposingTeam}) ${opposingCardPoints} points`);
                        console.log(`New scores: Team1 ${game.teamScores.team1}, Team2 ${game.teamScores.team2}`);
                    }

                    // Check for game end before starting a new round
                    if (game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200 ||
                        game.teamScores.team1 <= -200 || game.teamScores.team2 <= -200) {
                        game.phase = 'finished';

                        // Determine winning team and create detailed game end info
                        let winningTeam, winningTeamName;
                        if (game.teamScores.team1 >= 200) {
                            winningTeam = 'team1';
                            winningTeamName = 'Team 1';
                        } else if (game.teamScores.team2 >= 200) {
                            winningTeam = 'team2';
                            winningTeamName = 'Team 2';
                        } else if (game.teamScores.team1 <= -200) {
                            winningTeam = 'team2'; // team1 loses
                            winningTeamName = 'Team 2';
                        } else if (game.teamScores.team2 <= -200) {
                            winningTeam = 'team1'; // team2 loses
                            winningTeamName = 'Team 1';
                        }

                        const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                        const gameEndInfo = {
                            game,
                            winningTeam,
                            winningTeamName,
                            winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                            finalScores: game.teamScores
                        };

                        console.log(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                        io.to(`table-${game.tableId}`).emit('game_ended', gameEndInfo);

                        // Reset table state after game completion
                        setTimeout(() => {
                            resetTableAfterGameCompletion(game.tableId);
                        }, 3000); // Give players 3 seconds to see the game end message

                        return;
                    }

                    // Start a new round
                    game.round++;
                    game.deck = createDeck();

                    // Clear existing cards and deal new ones
                    game.players.forEach(player => {
                        player.cards = [];
                    });

                    // Deal cards to players
                    let cardIndex = 0;
                    for (let i = 0; i < 9; i++) {
                        game.players.forEach(player => {
                            if (cardIndex < game.deck.length) {
                                player.cards.push(game.deck[cardIndex++]);
                            }
                        });
                    }

                    // Reset for new round
                    game.phase = 'bidding';
                    game.currentBid = null;
                    game.trumpSuit = null;
                    game.currentTrick = { cards: [], winner: null, points: 0 };
                    game.currentPlayer = getNextPlayerByPosition(game.dealer, game.players);
                    game.dealer = game.currentPlayer;
                    game.contractorTeam = null; // Reset contractor team
                    game.opposingTeamBid = false; // Reset opposing team bid flag
                    game.roundScores = { team1: 0, team2: 0 }; // Reset round scores

                    io.to(`table-${game.tableId}`).emit('round_completed', { game });

                    // Start bot turn handling for new bidding phase if current player is a bot
                    if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                        console.log('Starting bot turn for new round bidding phase');
                        await handleBotTurn(game);
                    }
                    return;
                }

                // Start new trick - clear the trick area
                game.currentTrick = { cards: [], winner: null, points: 0 };
                game.currentPlayer = winner.playerId;
                const nextPlayer = game.players.find(p => p.id === winner.playerId);
                console.log('Trick area cleared, starting new trick. Next player:', nextPlayer ? { name: nextPlayer.name, isBot: nextPlayer.isBot } : 'NOT FOUND');

                // Emit game update to show cleared trick area
                io.to(`table-${game.tableId}`).emit('game_updated', { game });

                // Handle next bot player if applicable
                if (nextPlayer?.isBot) {
                    console.log('Next player is a bot, starting bot turn');
                    await handleBotTurn(game);
                }

                // Check for game end
                if (game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200 ||
                    game.teamScores.team1 <= -200 || game.teamScores.team2 <= -200) {
                    game.phase = 'finished';

                    // Determine winning team and create detailed game end info
                    let winningTeam, winningTeamName;
                    if (game.teamScores.team1 >= 200) {
                        winningTeam = 'team1';
                        winningTeamName = 'Team 1';
                    } else if (game.teamScores.team2 >= 200) {
                        winningTeam = 'team2';
                        winningTeamName = 'Team 2';
                    } else if (game.teamScores.team1 <= -200) {
                        winningTeam = 'team2'; // team1 loses
                        winningTeamName = 'Team 2';
                    } else if (game.teamScores.team2 <= -200) {
                        winningTeam = 'team1'; // team2 loses
                        winningTeamName = 'Team 1';
                    }

                    const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                    const gameEndInfo = {
                        game,
                        winningTeam,
                        winningTeamName,
                        winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                        finalScores: game.teamScores
                    };

                    console.log(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                    io.to(`table-${game.tableId}`).emit('game_ended', gameEndInfo);

                    // Reset table state after game completion
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
            console.log(`Bot ${currentPlayer.name} could not play a card - this should not happen!`);

            // Check if all players have 0 cards - if so, end the round
            const allCardsPlayed = game.players.every(p => p.cards.length === 0);
            if (allCardsPlayed) {
                console.log('All players have 0 cards - ending round');

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

                    console.log(`Round ${game.round} completed:`);
                    console.log(`Contractor team (${game.contractorTeam}): ${contractorCardPoints} card points + ${contractorBonus} bonus = ${contractorCardPoints + contractorBonus}`);
                    console.log(`Opposing team (${opposingTeam}): ${opposingCardPoints} card points + ${opposingBonus} bonus = ${opposingCardPoints + opposingBonus}`);
                    console.log(`New team scores: Team1: ${game.teamScores.team1}, Team2: ${game.teamScores.team2}`);
                }

                // Move to next round
                game.round++;
                game.phase = 'bidding';
                game.currentBid = null;
                game.contractorTeam = null;
                game.trumpSuit = null;
                game.opposingTeamBid = false; // Reset opposing team bid flag
                game.roundScores = { team1: 0, team2: 0 }; // Reset round scores

                io.to(`table-${game.tableId}`).emit('round_completed', { game });

                // Start bot turn handling for new bidding phase if current player is a bot
                if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                    console.log('Starting bot turn for new round bidding phase');
                    await handleBotTurn(game);
                }
                return;
            }

            // If bot can't play a card, move to next player but don't recurse infinitely
            game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
            io.to(`table-${game.tableId}`).emit('game_updated', { game });

            // Only handle next bot turn if we're not in a loop situation
            const nextPlayer = game.players.find(p => p.id === game.currentPlayer);
            if (nextPlayer?.isBot && nextPlayer.cards.length > 0) {
                console.log('Moving to next bot with cards:', nextPlayer.name);
                await handleBotTurn(game);
            } else {
                console.log('No more bots with cards to play, waiting for human player or round completion');
            }
        }
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
