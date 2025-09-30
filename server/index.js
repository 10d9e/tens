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

    playCard(playableCards) {
        if (playableCards.length === 0) return null;
        return playableCards[Math.floor(Math.random() * playableCards.length)];
    }
}

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

function createGame(tableId) {
    const gameId = uuidv4();
    const game = {
        id: gameId,
        tableId,
        players: [],
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

function startGame(game) {
    if (game.players.length < 4) {
        // Add bots to fill the table
        while (game.players.length < 4) {
            const skills = ['easy', 'medium', 'hard'];
            const skill = skills[Math.floor(Math.random() * skills.length)];
            addBotPlayer(game, skill);
        }
    }

    game.deck = createDeck();
    game.players = dealCards(game.deck, game.players.map(p => ({ ...p, cards: [] })));
    game.phase = 'bidding';
    game.currentPlayer = game.players[0].id;
    game.dealer = game.players[0].id;
    game.round = 1;

    return game;
}

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log('Player connected:', socket.id);

    socket.on('join_lobby', (data) => {
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
        if (lobby) {
            socket.emit('lobby_joined', { lobby, player });
            socket.to(lobbyId).emit('player_joined', { player });
        }
    });

    socket.on('join_table', (data) => {
        const { tableId, lobbyId = 'default' } = data;
        const player = players.get(socket.id);
        if (!player) return;

        const lobby = lobbies.get(lobbyId);
        if (!lobby) return;

        let table = lobby.tables.get(tableId);
        if (!table) {
            table = {
                id: tableId,
                name: `Table ${tableId}`,
                players: [],
                gameState: null,
                maxPlayers: 4,
                isPrivate: false
            };
            lobby.tables.set(tableId, table);
        }

        if (table.players.length < table.maxPlayers) {
            player.position = table.players.length;
            table.players.push(player);
            socket.join(`table-${tableId}`);

            socket.emit('table_joined', { table, player });
            socket.to(`table-${tableId}`).emit('player_joined_table', { table, player });

            // Auto-start game if table is full
            if (table.players.length === 4) {
                const game = createGame(tableId);
                table.gameState = startGame(game);
                games.set(game.id, game);

                io.to(`table-${tableId}`).emit('game_started', { game: table.gameState });
            }
        }
    });

    socket.on('make_bid', (data) => {
        const { gameId, points, suit } = data;
        const game = games.get(gameId);
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || player.id !== game.currentPlayer) return;

        game.currentBid = { playerId: socket.id, points, suit };

        if (suit) {
            game.trumpSuit = suit;
            game.phase = 'playing';
        }

        // Move to next player
        const currentIndex = game.players.findIndex(p => p.id === game.currentPlayer);
        game.currentPlayer = game.players[(currentIndex + 1) % game.players.length].id;

        io.to(`table-${game.tableId}`).emit('bid_made', { game });

        // Handle bot players
        if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
            setTimeout(() => {
                handleBotTurn(game);
            }, 1000);
        }
    });

    socket.on('play_card', (data) => {
        const { gameId, card } = data;
        const game = games.get(gameId);
        if (!game) return;

        const player = game.players.find(p => p.id === socket.id);
        if (!player || player.id !== game.currentPlayer) return;

        // Remove card from player's hand
        player.cards = player.cards.filter(c => c.id !== card.id);

        // Add card to current trick
        game.currentTrick.cards.push({ card, playerId: socket.id });

        // Move to next player
        const currentIndex = game.players.findIndex(p => p.id === game.currentPlayer);
        game.currentPlayer = game.players[(currentIndex + 1) % game.players.length].id;

        io.to(`table-${game.tableId}`).emit('card_played', { game, card, playerId: socket.id });

        // Check if trick is complete
        if (game.currentTrick.cards.length === 4) {
            // Calculate trick winner and points
            const trickPoints = game.currentTrick.cards.reduce((total, { card }) =>
                total + getCardValue(card), 0);
            game.currentTrick.points = trickPoints;

            // Simple trick winner logic (highest trump, then highest lead suit)
            const leadSuit = game.currentTrick.cards[0].card.suit;
            let winner = game.currentTrick.cards[0];

            for (const { card, playerId } of game.currentTrick.cards) {
                if (card.suit === game.trumpSuit && winner.card.suit !== game.trumpSuit) {
                    winner = { card, playerId };
                } else if (card.suit === game.trumpSuit && winner.card.suit === game.trumpSuit) {
                    // Compare ranks (simplified)
                    if (card.rank === 'A' || (card.rank === 'K' && winner.card.rank !== 'A')) {
                        winner = { card, playerId };
                    }
                }
            }

            game.currentTrick.winner = winner.playerId;
            game.lastTrick = { ...game.currentTrick };

            // Update team scores
            const winnerTeam = game.players.find(p => p.id === winner.playerId).position % 2 === 0 ? 'team1' : 'team2';
            game.teamScores[winnerTeam] += trickPoints;

            // Start new trick
            game.currentTrick = { cards: [], winner: null, points: 0 };
            game.currentPlayer = winner.playerId;

            io.to(`table-${game.tableId}`).emit('trick_completed', { game });

            // Check for game end
            if (game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200) {
                game.phase = 'finished';
                io.to(`table-${game.tableId}`).emit('game_ended', { game });
            }
        }

        // Handle bot players
        if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
            setTimeout(() => {
                handleBotTurn(game);
            }, 1000);
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

    socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        players.delete(socket.id);
    });
});

function handleBotTurn(game) {
    const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
    if (!currentPlayer || !currentPlayer.isBot) return;

    if (game.phase === 'bidding') {
        const handValue = currentPlayer.cards.reduce((total, card) => total + getCardValue(card), 0);
        const bidPoints = currentPlayer.ai.makeBid(handValue);

        if (bidPoints > 0) {
            game.currentBid = { playerId: currentPlayer.id, points: bidPoints };

            // Move to next player
            const currentIndex = game.players.findIndex(p => p.id === game.currentPlayer);
            game.currentPlayer = game.players[(currentIndex + 1) % game.players.length].id;

            io.to(`table-${game.tableId}`).emit('bid_made', { game });
        }
    } else if (game.phase === 'playing') {
        const playableCards = currentPlayer.cards; // Simplified - should check lead suit
        const card = currentPlayer.ai.playCard(playableCards);

        if (card) {
            currentPlayer.cards = currentPlayer.cards.filter(c => c.id !== card.id);
            game.currentTrick.cards.push({ card, playerId: currentPlayer.id });

            // Move to next player
            const currentIndex = game.players.findIndex(p => p.id === game.currentPlayer);
            game.currentPlayer = game.players[(currentIndex + 1) % game.players.length].id;

            io.to(`table-${game.tableId}`).emit('card_played', { game, card, playerId: currentPlayer.id });
        }
    }
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
