const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

app.use(cors());
app.use(express.json());

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

// Create a default table with 3 bot players
function createDefaultTable() {
    const tableId = 'robot-fun-table';
    const table = {
        id: tableId,
        name: 'Robot Fun',
        players: [],
        gameState: null,
        maxPlayers: 4,
        isPrivate: false
    };

    // Add 3 bot players (without AI for now, will be added when game starts)
    // Position them at North (0), East (1), and West (3), leaving South (2) for human player
    const botSkills = ['easy', 'medium', 'hard'];
    const botPositions = [0, 1, 3]; // North, East, West
    for (let i = 0; i < 3; i++) {
        const botId = `bot-${uuidv4()}`;
        const bot = {
            id: botId,
            name: `Bot (${botSkills[i]})`,
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
    console.log('Created default table "Robot Fun" with 3 bot players');
}

// Bot AI (simplified for server)
class SimpleBotAI {
    constructor(skill = 'medium') {
        this.skill = skill;
    }

    makeBid(handValue) {
        if (handValue >= 40) return Math.max(30, Math.floor(Math.random() * 20) + 20);
        if (handValue >= 30) return Math.max(20, Math.floor(Math.random() * 15) + 15);
        if (handValue >= 20) return Math.max(15, Math.floor(Math.random() * 10) + 10);
        return 0;
    }

    async playCard(playableCards) {
        // Add 1 second delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (playableCards.length === 0) return null;
        return playableCards[Math.floor(Math.random() * playableCards.length)];
    }
}

// Create the default table after SimpleBotAI is defined
createDefaultTable();

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
    if (!currentPlayer) return players[0].id;

    const nextPosition = (currentPlayer.position + 1) % 4;
    const nextPlayer = players.find(p => p.position === nextPosition);
    return nextPlayer ? nextPlayer.id : players[0].id;
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
        dealer: null,
        spectatorIds: [],
        deck: createDeck()
    };

    games.set(gameId, game);
    return game;
}

function addBotPlayer(game, skill = 'medium') {
    const botId = `bot-${uuidv4()}`;
    const bot = {
        id: botId,
        name: `Bot (${skill})`,
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

    return game;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join_lobby', (data) => {
        console.log('join_lobby received:', data);
        const { playerName, lobbyId = 'default' } = data;
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

    socket.on('join_table', async (data) => {
        console.log('join_table received:', data);
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

        let table = lobby.tables.get(tableId);
        if (!table) {
            console.log('Creating new table:', tableId, 'with name:', tableName);
            table = {
                id: tableId,
                name: tableName || `Table ${tableId}`,
                players: [],
                gameState: null,
                maxPlayers: 4,
                isPrivate: false,
                creator: socket.id // Track who created the table
            };
            lobby.tables.set(tableId, table);
            console.log('Table created successfully');
        }

        if (table.players.length < table.maxPlayers) {
            // For the default robot table, position human player at South (position 2)
            // so their partner (North, position 0) is directly across
            if (tableId === 'robot-fun-table' && !player.isBot) {
                player.position = 2; // South position
            } else {
                player.position = table.players.length;
            }
            table.players.push(player);
            socket.join(`table-${tableId}`);

            socket.emit('table_joined', { table, player });
            socket.to(`table-${tableId}`).emit('player_joined_table', { table, player });

            // Notify all lobby members about the updated lobby
            const tablesArray = Array.from(lobby.tables.values());
            io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

            // Auto-start game if table is full OR if it's the Robot Fun table with a human player
            console.log('Checking auto-start conditions:');
            console.log('- Table players length:', table.players.length);
            console.log('- Table ID:', tableId);
            console.log('- Has human player:', table.players.some(p => !p.isBot));

            if (table.players.length === 4 || (tableId === 'robot-fun-table' && table.players.some(p => !p.isBot))) {
                console.log('Auto-starting game...');
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
                console.log('Game not auto-started. Conditions not met.');
            }
        }
    });

    socket.on('make_bid', async (data) => {
        const { gameId, points, suit } = data;
        const game = games.get(gameId);
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || player.id !== game.currentPlayer) return;

        game.currentBid = { playerId: socket.id, points, suit };

        if (suit) {
            game.trumpSuit = suit;
            game.phase = 'playing';

            // Set the bid winner as the current player (they lead the first trick)
            game.currentPlayer = game.currentBid.playerId;
            console.log(`Human bid winner ${game.currentBid.playerId} will lead the first trick`);

            io.to(`table-${game.tableId}`).emit('game_updated', { game });
            return; // Don't move to next player, bid winner should start
        }

        // Move to next player
        game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);

        io.to(`table-${game.tableId}`).emit('bid_made', { game });

        // Handle bot players
        if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
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

            // Update team scores
            const winnerTeam = game.players.find(p => p.id === winner.playerId).position % 2 === 0 ? 'team1' : 'team2';
            game.teamScores[winnerTeam] += trickPoints;

            // Log trick details for debugging
            const winnerPlayer = game.players.find(p => p.id === winner.playerId);
            console.log(`Trick completed! Winner: ${winnerPlayer?.name} (${winner.playerId}), Card: ${winner.card.rank} of ${winner.card.suit}, Points: ${trickPoints}, Trump: ${game.trumpSuit}, Lead: ${leadSuit}`);

            // Add delay to let players see the final card before completing trick
            console.log('Pausing 1.5 seconds to show final card...');
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Emit trick completed event with the completed trick
            io.to(`table-${game.tableId}`).emit('trick_completed', { game });
            // Clear the trick immediately
            // Check if all players have run out of cards (end of round)
            const allCardsPlayed = game.players.every(p => p.cards.length === 0);
            if (allCardsPlayed) {
                console.log('All cards have been played! Round complete.');
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

                console.log('Round reset complete - all bid parameters cleared for new round');

                io.to(`table-${game.tableId}`).emit('round_completed', { game });

                // Pause for 1 second to let players see the final trick
                console.log('Pausing for 1 second before starting new round...');
                await new Promise(resolve => setTimeout(resolve, 1000));

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
            if (game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200) {
                game.phase = 'finished';

                // Determine winning team and create detailed game end info
                const winningTeam = game.teamScores.team1 >= 200 ? 'team1' : 'team2';
                const winningTeamName = winningTeam === 'team1' ? 'Team 1' : 'Team 2';
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
            }
        }

        // Handle bot players
        if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
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
        if (table.creator !== socket.id) {
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
        players.delete(socket.id);
    });
});

async function checkBiddingCompletion(game) {
    // Check if we've completed a full round of bidding (all 4 players have had a turn)
    // and either someone has bid 30+ points or everyone has passed

    if (!game.currentBid || game.currentBid.points === 0) {
        // No current bid, check if we need to end bidding
        // For now, let's implement a simple rule: if we've gone through all players once
        // and no one has bid, end the bidding phase
        console.log('No current bid - checking if bidding should end');
        return;
    }

    // If someone has bid 30+ points, they need to select trump suit
    if (game.currentBid.points >= 30 && !game.trumpSuit) {
        console.log(`Bid of ${game.currentBid.points} points requires trump suit selection`);
        return;
    }

    // If trump suit is selected, move to playing phase
    if (game.trumpSuit) {
        console.log(`Trump suit ${game.trumpSuit} selected, moving to playing phase`);
        game.phase = 'playing';

        // Set the bid winner as the current player (they lead the first trick)
        game.currentPlayer = game.currentBid.playerId;
        console.log(`Bid winner ${game.currentBid.playerId} will lead the first trick`);

        io.to(`table-${game.tableId}`).emit('game_updated', { game });

        // Start the first bot turn in playing phase if current player is a bot
        const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
        console.log('Playing phase started. Current player:', currentPlayer ? { name: currentPlayer.name, isBot: currentPlayer.isBot } : 'NOT FOUND');
        if (currentPlayer?.isBot) {
            console.log('Starting first bot turn in playing phase');
            await handleBotTurn(game);
        } else {
            console.log('Current player is human, waiting for human to play card');
        }
    }
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
        const handValue = currentPlayer.cards.reduce((total, card) => total + getCardValue(card), 0);
        const bidPoints = currentPlayer.ai.makeBid(handValue);

        console.log(`Bot ${currentPlayer.name} (${currentPlayer.botSkill}) making bid: ${bidPoints} points`);

        if (bidPoints > 0) {
            game.currentBid = { playerId: currentPlayer.id, points: bidPoints };
            console.log(`Bot ${currentPlayer.name} bid ${bidPoints} points`);

            // If bot bid 30+ points, automatically select trump suit
            if (bidPoints >= 30 && !game.trumpSuit) {
                const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
                const suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };

                // Count cards in each suit
                currentPlayer.cards.forEach(card => {
                    suitCounts[card.suit]++;
                });

                // Select the suit with the most cards
                const bestSuit = Object.entries(suitCounts)
                    .sort(([, a], [, b]) => b - a)[0][0];

                game.trumpSuit = bestSuit;
                console.log(`Bot ${currentPlayer.name} selected ${bestSuit} as trump suit`);
            }
        } else {
            console.log(`Bot ${currentPlayer.name} passed`);
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
        const playableCards = currentPlayer.cards; // Simplified - should check lead suit
        console.log(`Bot ${currentPlayer.name} has ${playableCards.length} cards to play`);
        const card = await currentPlayer.ai.playCard(playableCards);

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

                // Update team scores
                const winnerTeam = game.players.find(p => p.id === winner.playerId).position % 2 === 0 ? 'team1' : 'team2';
                game.teamScores[winnerTeam] += trickPoints;

                // Log trick details for debugging
                const winnerPlayer = game.players.find(p => p.id === winner.playerId);
                console.log(`Trick completed! Winner: ${winnerPlayer?.name} (${winner.playerId}), Card: ${winner.card.rank} of ${winner.card.suit}, Points: ${trickPoints}, Trump: ${game.trumpSuit}, Lead: ${leadSuit}`);

                // Add delay to let players see the final card before completing trick
                console.log('Pausing 1.5 seconds to show final card...');
                await new Promise(resolve => setTimeout(resolve, 1500));

                // Emit trick completed event with the completed trick
                io.to(`table-${game.tableId}`).emit('trick_completed', { game });
                // Clear the trick immediately
                // Check if all players have run out of cards (end of round)
                const allCardsPlayed = game.players.every(p => p.cards.length === 0);
                if (allCardsPlayed) {
                    console.log('All cards have been played! Round complete.');
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
                if (game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200) {
                    game.phase = 'finished';

                    // Determine winning team and create detailed game end info
                    const winningTeam = game.teamScores.team1 >= 200 ? 'team1' : 'team2';
                    const winningTeamName = winningTeam === 'team1' ? 'Team 1' : 'Team 2';
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
                    return;
                }
            }

            // Handle next bot player if applicable
            if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                await handleBotTurn(game);
            }
        } else {
            console.log(`Bot ${currentPlayer.name} could not play a card - this should not happen!`);
            // If bot can't play a card, something is wrong - move to next player anyway
            game.currentPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
            io.to(`table-${game.tableId}`).emit('game_updated', { game });

            // Handle next bot player if applicable
            if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                await handleBotTurn(game);
            }
        }
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
