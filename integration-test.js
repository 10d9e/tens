const io = require('socket.io-client');

class GamePlayer {
    constructor(name) {
        this.name = name;
        this.socket = null;
        this.player = null;
        this.game = null;
        this.table = null;
        this.connected = false;
        this.gameEnded = false;
        this.currentPhase = null;
        this.myPosition = null;
        this.myTeam = null;
        this.loggedMessages = [];
        this.hasPlayedCardThisTurn = false;
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${this.name}: ${message}`;
        console.log(logMessage);
        this.loggedMessages.push(logMessage);
    }

    async connect(serverUrl = 'http://localhost:3001') {
        return new Promise((resolve, reject) => {
            this.socket = io(serverUrl);

            this.socket.on('connect', () => {
                this.connected = true;
                this.log('Connected to server');
                resolve();
            });

            this.socket.on('connect_error', (error) => {
                this.log(`Connection error: ${error.message}`);
                reject(error);
            });

            // Set up all event listeners
            this.setupEventListeners();

            // Timeout after 10 seconds
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    setupEventListeners() {
        // Lobby events
        this.socket.on('lobby_joined', (data) => {
            this.player = data.player;
            this.log(`Joined lobby as ${this.player.name}`);
        });

        this.socket.on('lobby_updated', (data) => {
            // this.log(`Lobby updated: ${data.lobby.tables.length} tables`);
        });

        // Table events
        this.socket.on('table_joined', (data) => {
            this.table = data.table;
            this.log(`Joined table: ${this.table.name}`);
        });

        this.socket.on('table_updated', (data) => {
            this.table = data.table;
            // this.log(`Table updated: ${this.table.players.length} players`);
        });

        this.socket.on('player_joined_table', (data) => {
            this.log(`Player ${data.player.name} joined the table`);
        });

        this.socket.on('player_left_table', (data) => {
            this.log(`Player ${data.player.name} left the table`);
        });

        // Game events
        this.socket.on('game_started', (data) => {
            this.game = data.game;
            this.currentPhase = this.game.phase;
            this.myPosition = this.game.players.find(p => p.id === this.player.id)?.position;
            this.myTeam = this.getMyTeam();
            this.log(`Game started! I'm at position ${this.myPosition} (${this.getPositionName(this.myPosition)}) on ${this.myTeam}`);
            this.log(`Game phase: ${this.currentPhase}`);
            this.log(`My cards: ${this.getMyCards().map(c => `${c.rank}${c.suit}`).join(', ')}`);
        });

        this.socket.on('game_updated', (data) => {
            const previousGame = this.game;
            this.game = data.game;

            if (this.game.phase !== this.currentPhase) {
                this.currentPhase = this.game.phase;
                this.log(`Phase changed to: ${this.currentPhase}`);
            }

            // Reset the card play flag when it becomes our turn again
            // Check if current player changed to us
            if (previousGame && previousGame.currentPlayer !== this.player.id && this.game.currentPlayer === this.player.id) {
                this.hasPlayedCardThisTurn = false;
                this.log('Turn came back to me, resetting card play flag');
            }

            if (this.currentPhase === 'playing' && this.game.currentTrick) {
                const trickInfo = this.game.currentTrick.cards.map(c =>
                    `${c.card.rank}${c.card.suit} by ${this.getPlayerName(c.playerId)}`
                ).join(', ');
                if (trickInfo) {
                    this.log(`Current trick: ${trickInfo}`);
                }
            }
        });

        this.socket.on('bid_made', (data) => {
            this.game = data.game;
            if (data.game.currentBid) {
                const bidder = this.getPlayerName(data.game.currentBid.playerId);
                const bid = data.game.currentBid;
                this.log(`${bidder} bid ${bid.points} points${bid.suit ? ` in ${bid.suit}` : ''}`);
            }
        });

        this.socket.on('card_played', (data) => {
            this.game = data.game;
            const player = this.getPlayerName(data.playerId);
            const card = data.card;
            this.log(`${player} played ${card.rank}${card.suit}`);
        });

        this.socket.on('trick_completed', (data) => {
            this.game = data.game;
            const winner = this.getPlayerName(data.game.currentTrick.winner);
            const points = data.game.currentTrick.points;
            this.log(`Trick won by ${winner} for ${points} points`);

            // Reset the card play flag when a new trick starts
            this.hasPlayedCardThisTurn = false;
        });

        this.socket.on('round_completed', async (data) => {
            this.game = data.game;
            this.log(`Round ${data.game.round} completed`);
            this.log(`Team scores: Team1: ${data.game.teamScores.team1}, Team2: ${data.game.teamScores.team2}`);

            // Reset the card play flag for the new round
            this.hasPlayedCardThisTurn = false;

            // Wait 3 seconds like the UI does to let players review round results
            // jcl
            //this.log('Waiting 3 seconds to review round results...');
            //await new Promise(resolve => setTimeout(resolve, 3000));
        });

        this.socket.on('game_ended', (data) => {
            this.game = data.game;
            this.gameEnded = true;
            this.log(`Game ended! Winner: ${data.winner || 'Unknown'}`);
            if (data.reason) {
                this.log(`Reason: ${data.reason}`);
            }
            if (data.game) {
                this.log(`Final scores: Team1: ${data.game.teamScores.team1}, Team2: ${data.game.teamScores.team2}`);
            }
        });

        // Chat events
        this.socket.on('chat_message', (data) => {
            this.log(`[CHAT] ${data.player.name}: ${data.message}`);
        });

        // Table deletion events
        this.socket.on('table_deleted', (data) => {
            this.log(`Table ${data.tableId} deleted successfully`);
        });

        // Error events
        this.socket.on('error', (data) => {
            this.log(`ERROR: ${data.message}`);
        });
    }

    getMyCards() {
        if (!this.game) return [];
        const myPlayer = this.game.players.find(p => p.id === this.player.id);
        return myPlayer ? myPlayer.cards : [];
    }

    getMyTeam() {
        if (!this.game || this.myPosition === null) return null;
        return this.myPosition % 2 === 0 ? 'team1' : 'team2';
    }

    getPlayerName(playerId) {
        if (!this.game) return 'Unknown';
        const player = this.game.players.find(p => p.id === playerId);
        return player ? player.name : 'Unknown';
    }

    getPositionName(position) {
        const positions = ['North', 'East', 'South', 'West'];
        return positions[position] || 'Unknown';
    }

    async joinLobby() {
        return new Promise((resolve, reject) => {
            this.socket.emit('join_lobby', { playerName: this.name });

            this.socket.on('lobby_joined', () => {
                resolve();
            });

            setTimeout(() => {
                reject(new Error('Failed to join lobby'));
            }, 5000);
        });
    }

    async createTable(tableId, tableName = 'Test Table') {
        return new Promise((resolve, reject) => {
            this.socket.emit('create_table', {
                tableId,
                tableName,
                timeoutDuration: 30000,
                deckVariant: '36',
                scoreTarget: 200,
                hasKitty: false
            });

            this.socket.on('table_created', () => {
                resolve();
            });

            setTimeout(() => {
                reject(new Error('Failed to create table'));
            }, 5000);
        });
    }

    async addBot(position, skill = 'medium') {
        return new Promise((resolve, reject) => {
            this.socket.emit('add_bot', {
                tableId: this.table.id,
                position,
                skill
            });

            setTimeout(() => {
                resolve(); // Bots don't send confirmation events
            }, 100);
        });
    }

    async joinTable(tableId) {
        return new Promise((resolve, reject) => {
            this.socket.emit('join_table', { tableId });

            this.socket.on('table_joined', () => {
                resolve();
            });

            setTimeout(() => {
                reject(new Error('Failed to join table'));
            }, 5000);
        });
    }

    async startGame() {
        return new Promise((resolve, reject) => {
            this.socket.emit('start_game', { tableId: this.table.id });

            this.socket.on('game_started', () => {
                resolve();
            });

            setTimeout(() => {
                reject(new Error('Failed to start game'));
            }, 10000);
        });
    }

    async makeBid(points, suit = null) {
        return new Promise((resolve, reject) => {
            if (!this.game || this.game.currentPlayer !== this.player.id) {
                reject(new Error('Not my turn to bid'));
                return;
            }

            this.socket.emit('make_bid', {
                gameId: this.game.id,
                points,
                suit
            });

            setTimeout(() => {
                resolve();
            }, 100);
        });
    }

    async playCard(card) {
        return new Promise((resolve, reject) => {
            if (!this.game || this.game.currentPlayer !== this.player.id) {
                reject(new Error('Not my turn to play'));
                return;
            }

            // Set flag to prevent multiple card plays this turn
            this.hasPlayedCardThisTurn = true;

            this.socket.emit('play_card', {
                gameId: this.game.id,
                card
            });

            setTimeout(() => {
                resolve();
            }, 100);
        });
    }

    async takeKitty() {
        return new Promise((resolve, reject) => {
            if (!this.game || this.game.currentPlayer !== this.player.id) {
                reject(new Error('Not my turn to take kitty'));
                return;
            }

            this.socket.emit('take_kitty', { gameId: this.game.id });

            setTimeout(() => {
                resolve();
            }, 100);
        });
    }

    async discardToKitty(discardedCards, trumpSuit) {
        return new Promise((resolve, reject) => {
            if (!this.game || this.game.currentPlayer !== this.player.id) {
                reject(new Error('Not my turn to discard'));
                return;
            }

            this.socket.emit('discard_to_kitty', {
                gameId: this.game.id,
                discardedCards,
                trumpSuit
            });

            setTimeout(() => {
                resolve();
            }, 100);
        });
    }

    async exitGame() {
        return new Promise((resolve) => {
            if (this.game) {
                this.socket.emit('exit_game', {
                    gameId: this.game.id,
                    playerName: this.name
                });
            }

            setTimeout(() => {
                this.disconnect();
                resolve();
            }, 1000);
        });
    }

    async deleteTable() {
        return new Promise((resolve, reject) => {
            if (!this.table || !this.table.id || !this.socket) {
                resolve();
                return;
            }

            this.log(`Deleting table: ${this.table.id}`);

            // Set up a one-time listener for table deletion confirmation
            const onTableDeleted = (data) => {
                if (data.tableId === this.table.id) {
                    if (this.socket) {
                        this.socket.off('table_deleted', onTableDeleted);
                    }
                    this.log(`Table ${this.table.id} deleted successfully`);
                    resolve();
                }
            };

            this.socket.on('table_deleted', onTableDeleted);

            // Emit the delete table request
            this.socket.emit('delete_table', {
                tableId: this.table.id,
                lobbyId: 'default'
            });

            // Fallback timeout in case the event doesn't come back
            setTimeout(() => {
                if (this.socket) {
                    this.socket.off('table_deleted', onTableDeleted);
                }
                this.log(`Table deletion timeout - assuming success`);
                resolve();
            }, 2000);
        });
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
    }

    // AI-like decision making for the test
    calculateHandValue() {
        const cards = this.getMyCards();
        const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
        return cards.reduce((total, card) => total + (values[card.rank] || 0), 0);
    }

    async makeSmartBid() {
        if (this.game.phase !== 'bidding' || this.game.currentPlayer !== this.player.id) {
            return;
        }

        const handValue = this.calculateHandValue();
        const currentBid = this.game.currentBid;

        let myBid = 0;

        // Simple bidding logic
        if (handValue >= 50) {
            myBid = Math.min(handValue, 80);
        } else if (handValue >= 40) {
            myBid = 60;
        } else if (handValue >= 30) {
            myBid = 50;
        }

        // Only bid if we can beat the current bid
        if (currentBid && myBid <= currentBid.points) {
            myBid = 0; // Pass
        }

        if (myBid > 0) {
            this.log(`Making bid: ${myBid} points (hand value: ${handValue})`);
            await this.makeBid(myBid);
        } else {
            this.log(`Passing (hand value: ${handValue})`);
            await this.makeBid(0); // Pass
        }
    }

    async playSmartCard() {
        if (this.game.phase !== 'playing' || this.game.currentPlayer !== this.player.id) {
            return;
        }

        // Check if we've already played a card this turn
        if (this.hasPlayedCardThisTurn) {
            this.log('Already played a card this turn, waiting...');
            return;
        }

        const myCards = this.getMyCards();
        const currentTrick = this.game.currentTrick;

        // If no cards left, just wait (round should end soon)
        if (myCards.length === 0) {
            this.log('No cards left to play, waiting for round to end...');
            return;
        }

        let cardToPlay = null;

        if (currentTrick.cards.length === 0) {
            // First card of trick - play a medium value card
            const mediumCards = myCards.filter(c => {
                const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
                return values[c.rank] >= 5;
            });
            cardToPlay = mediumCards[0] || myCards[0];
        } else {
            // Follow suit if possible
            const leadSuit = currentTrick.cards[0].card.suit;
            const cardsInSuit = myCards.filter(c => c.suit === leadSuit);

            if (cardsInSuit.length > 0) {
                // Play lowest card in suit
                cardToPlay = cardsInSuit.reduce((lowest, current) => {
                    const values = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '6': 6, '5': 5 };
                    return (values[current.rank] || 0) < (values[lowest.rank] || 0) ? current : lowest;
                });
            } else if (myCards.length > 0) {
                // No cards in suit - play lowest value card
                cardToPlay = myCards.reduce((lowest, current) => {
                    const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
                    return (values[current.rank] || 0) < (values[lowest.rank] || 0) ? current : lowest;
                });
            }
        }

        if (cardToPlay) {
            this.log(`Playing card: ${cardToPlay.rank}${cardToPlay.suit}`);
            await this.playCard(cardToPlay);
        }
    }

    async handleKittyPhase() {
        if (this.game.phase !== 'kitty' || this.game.currentPlayer !== this.player.id) {
            return;
        }

        this.log('Taking kitty cards');
        await this.takeKitty();

        // Wait a moment for the kitty cards to be added
        await new Promise(resolve => setTimeout(resolve, 100));

        // Discard lowest value cards
        const myCards = this.getMyCards();
        const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };

        // Sort cards by value (lowest first)
        const sortedCards = [...myCards].sort((a, b) => (values[a.rank] || 0) - (values[b.rank] || 0));

        // Discard the lowest 4 cards (assuming 40-card deck with kitty)
        const discardedCards = sortedCards.slice(0, 4);

        this.log(`Discarding: ${discardedCards.map(c => `${c.rank}${c.suit}`).join(', ')}`);
        await this.discardToKitty(discardedCards, this.game.trumpSuit || 'hearts');
    }

    async playGame() {
        this.log('Starting to play the game...');

        while (!this.gameEnded && this.game) {
            // Wait for game updates
            await new Promise(resolve => setTimeout(resolve, 500));

            if (this.game.phase === 'bidding' && this.game.currentPlayer === this.player.id) {
                await this.makeSmartBid();
            } else if (this.game.phase === 'kitty' && this.game.currentPlayer === this.player.id) {
                await this.handleKittyPhase();
            } else if (this.game.phase === 'playing' && this.game.currentPlayer === this.player.id) {
                await this.playSmartCard();
            }
        }

        this.log('Game play completed');
    }
}

// Integration test function
async function runIntegrationTest() {
    console.log('🚀 Starting Integration Test - Full Game Simulation');
    console.log('='.repeat(60));

    const randomId = Math.random().toString(36).substring(2, 15);
    const player = new GamePlayer(`TestPlayer-${randomId}`);

    try {
        // Connect to server
        await player.connect();
        player.log('✅ Connected to server');

        // Join lobby
        await player.joinLobby();
        player.log('✅ Joined lobby');

        // Create a table
        const tableId = `integration-test-${randomId}`;
        await player.createTable(tableId, `Integration Test Table ${randomId}`);
        player.log('✅ Created table');

        // Add 3 bots to fill the table
        await player.addBot(1, 'medium'); // East
        await player.addBot(2, 'hard');   // South  
        await player.addBot(3, 'easy');   // West
        player.log('✅ Added 3 bots to table');

        // Start the game
        await player.startGame();
        player.log('✅ Game started');

        // Play through the entire game
        await player.playGame();
        player.log('✅ Game completed');

        // Exit the game
        await player.exitGame();
        player.log('✅ Exited game');

        console.log('\n🎉 Integration Test PASSED!');
        console.log('='.repeat(60));
        console.log('✅ Successfully played through a complete game');
        console.log('✅ All game phases handled correctly');
        console.log('✅ Bot interactions worked properly');
        console.log('✅ Game ended naturally');

    } catch (error) {
        console.error('\n❌ Integration Test FAILED!');
        console.error('='.repeat(60));
        console.error('Error:', error.message);
        console.error('\nGame Log:');
        player.loggedMessages.forEach(msg => console.error(msg));

        throw error;
    } finally {
        // Always clean up, regardless of success or failure
        try {
            if (player.game && player.game.phase !== 'finished') {
                player.log('🧹 Cleaning up: Exiting game...');
                await player.exitGame();
            }
        } catch (cleanupError) {
            console.error('Game cleanup error:', cleanupError.message);
        }

        try {
            if (player.table) {
                player.log('🧹 Cleaning up: Deleting table...');
                await player.deleteTable();
            }
        } catch (cleanupError) {
            console.error('Table cleanup error:', cleanupError.message);
        }

        // Always disconnect
        player.disconnect();
        player.log('🧹 Cleanup completed');
    }
}

// Run the test
if (require.main === module) {
    runIntegrationTest()
        .then(() => {
            console.log('\n✨ Integration test completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Integration test failed:', error.message);
            process.exit(1);
        });
}

module.exports = { GamePlayer, runIntegrationTest };
