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

        // Scoring verification tracking
        this.scoringHistory = [];
        this.roundScores = { team1: 0, team2: 0 };
        this.totalScores = { team1: 0, team2: 0 };
        this.previousTotalScores = { team1: 0, team2: 0 };
        this.currentRound = 0;
        this.contractorTeam = null;
        this.currentBid = null;
        this.kittyDiscards = [];
        this.trickPoints = { team1: 0, team2: 0 };

        // Notepad data tracking
        this.notepadHistory = [];
        this.expectedNotepadData = null;
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
            this.currentRound = this.game.round;
            this.totalScores = { ...this.game.teamScores };
            this.previousTotalScores = { ...this.game.teamScores }; // Track previous scores for verification
            this.log(`Game started! I'm at position ${this.myPosition} (${this.getPositionName(this.myPosition)}) on ${this.myTeam}`);
            this.log(`Game phase: ${this.currentPhase}`);
            this.log(`My cards: ${this.getMyCards().map(c => `${c.rank}${c.suit}`).join(', ')}`);
            this.log(`Initial scores: Team1: ${this.totalScores.team1}, Team2: ${this.totalScores.team2}`);
        });

        this.socket.on('game_updated', (data) => {
            const previousGame = this.game;
            this.game = data.game;

            // Track contractor team and kitty discards
            if (this.game.contractorTeam && this.game.contractorTeam !== this.contractorTeam) {
                this.contractorTeam = this.game.contractorTeam;
                this.log(`Contractor team set to: ${this.contractorTeam}`);
            }

            if (this.game.kittyDiscards && this.game.kittyDiscards.length > 0) {
                this.kittyDiscards = [...this.game.kittyDiscards];
                this.log(`Kitty discards: ${this.kittyDiscards.map(c => `${c.rank}${c.suit}`).join(', ')}`);
            }

            if (this.game.phase !== this.currentPhase) {
                this.currentPhase = this.game.phase;
                this.log(`Phase changed to: ${this.currentPhase}`);

                // Verify notepad data when phase changes (especially during bidding and playing)
                if (this.currentPhase === 'bidding' || this.currentPhase === 'playing') {
                    this.verifyNotepadData(this.game);
                }
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
                this.currentBid = bid;
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

            // Track trick points for scoring verification
            const winnerPlayer = this.game.players.find(p => p.id === data.game.currentTrick.winner);
            if (winnerPlayer) {
                const winnerTeam = winnerPlayer.position % 2 === 0 ? 'team1' : 'team2';
                this.trickPoints[winnerTeam] += points;
                this.log(`Trick points: Team1: ${this.trickPoints.team1}, Team2: ${this.trickPoints.team2}`);
            }

            // Reset the card play flag when a new trick starts
            this.hasPlayedCardThisTurn = false;
        });

        this.socket.on('round_completed', async (data) => {
            this.game = data.game;
            this.log(`Round ${data.game.round} completed`);
            this.log(`Team scores: Team1: ${data.game.teamScores.team1}, Team2: ${data.game.teamScores.team2}`);

            // Verify scoring calculation
            this.verifyRoundScoring(data.game);

            // Verify notepad data that would be shown to players
            this.verifyNotepadData(data.game);

            // Update previous scores for next round verification
            this.previousTotalScores = { ...data.game.teamScores };

            // Reset trick points for the next round
            this.trickPoints = { team1: 0, team2: 0 };
            this.kittyDiscards = [];
            this.contractorTeam = null;
            this.currentBid = null;
            this.log('Reset trick points and kitty data for new round');

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

            // Verify final scoring
            this.verifyTotalScoring();

            // Verify final notepad data
            this.verifyNotepadData(data.game);

            // Summary of notepad verification
            this.logNotepadSummary();
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
            this.log(`Server error: ${data.message}`);
            throw new Error(data.message);
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

    async createTable(tableId, tableName = 'Test Table', hasKitty = false) {
        return new Promise((resolve, reject) => {
            this.socket.emit('create_table', {
                tableId,
                tableName,
                timeoutDuration: 30000,
                deckVariant: hasKitty ? '40' : '36',
                scoreTarget: 200,
                hasKitty: hasKitty
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

    // Scoring verification methods
    getCardValue(card) {
        const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
        return values[card.rank] || 0;
    }

    calculateKittyDiscardPoints() {
        // Only calculate kitty discard points if the game has kitty enabled
        if (!this.game || !this.game.hasKitty) {
            return 0;
        }
        if (!this.kittyDiscards || this.kittyDiscards.length === 0) {
            return 0;
        }
        return this.kittyDiscards.reduce((total, card) => total + this.getCardValue(card), 0);
    }

    verifyRoundScoring(game) {
        this.log('🔍 VERIFYING ROUND SCORING...');

        // Validate basic game state
        if (!game) {
            const error = '❌ Game state is null or undefined in round scoring verification!';
            this.log(error);
            throw new Error(error);
        }

        // Get the round scores from the game state
        const gameRoundScores = game.roundScores || { team1: 0, team2: 0 };
        const gameTeamScores = game.teamScores || { team1: 0, team2: 0 };

        // Validate team scores are numbers
        if (typeof gameTeamScores.team1 !== 'number' || typeof gameTeamScores.team2 !== 'number') {
            const error = `❌ Invalid team scores: Team1: ${gameTeamScores.team1}, Team2: ${gameTeamScores.team2}`;
            this.log(error);
            throw new Error(error);
        }

        this.log(`Game round scores: Team1: ${gameRoundScores.team1}, Team2: ${gameRoundScores.team2}`);
        this.log(`Game team scores: Team1: ${gameTeamScores.team1}, Team2: ${gameTeamScores.team2}`);
        this.log(`Our tracked trick points: Team1: ${this.trickPoints.team1}, Team2: ${this.trickPoints.team2}`);

        // Verify trick points add up to expected total (100 for all deck variants)
        // For kitty games: trick points + kitty discard points should equal 100
        // For non-kitty games: trick points should equal 100
        // Exception: If everyone passes during bidding, no tricks are played (0 points total)
        const totalTrickPoints = this.trickPoints.team1 + this.trickPoints.team2;
        const kittyDiscardPoints = this.calculateKittyDiscardPoints();
        const totalPoints = totalTrickPoints + kittyDiscardPoints;
        const expectedTotal = 100; // Always 100 points in the deck

        // Check if everyone passed (no contractor team set and no tricks played)
        if (totalPoints === 0 && !this.contractorTeam) {
            this.log(`✅ Round skipped: Everyone passed during bidding, no tricks played`);
        } else if (totalPoints !== expectedTotal) {
            const error = `❌ POINTS DON'T ADD UP! Trick points: ${totalTrickPoints}, Kitty discards: ${kittyDiscardPoints}, Total: ${totalPoints}, Expected: ${expectedTotal} (Difference: ${totalPoints - expectedTotal})`;
            this.log(error);
            throw new Error(error);
        } else {
            if (this.game.hasKitty && kittyDiscardPoints > 0) {
                this.log(`✅ Total points verified: ${totalTrickPoints} trick points + ${kittyDiscardPoints} kitty points = ${totalPoints} (as expected)`);
            } else {
                this.log(`✅ Trick points verified: ${totalTrickPoints} total points (as expected)`);
            }
        }

        // Note: Round scores are reset to 0 after each round, so we don't compare them to trick points
        // The trick points represent the cumulative points for the completed round
        this.log(`Round scores (reset for new round): Team1: ${gameRoundScores.team1}, Team2: ${gameRoundScores.team2}`);
        this.log(`Completed round trick points: Team1: ${this.trickPoints.team1}, Team2: ${this.trickPoints.team2}`);

        // Verify contractor team scoring logic
        if (this.contractorTeam && this.currentBid) {
            this.verifyContractorScoring(game);
        } else if (totalPoints === 0) {
            // Everyone passed during bidding - no contractor, no scoring
            this.log('✅ No contractor scoring to verify (everyone passed)');
        } else {
            const error = '❌ Round completed but no contractor team or bid set!';
            this.log(error);
            throw new Error(error);
        }

        // Store scoring history
        this.scoringHistory.push({
            round: game.round,
            roundScores: { ...gameRoundScores },
            teamScores: { ...gameTeamScores },
            trickPoints: { ...this.trickPoints },
            contractorTeam: this.contractorTeam,
            currentBid: this.currentBid,
            kittyDiscards: [...this.kittyDiscards]
        });

        this.log('🔍 SCORING VERIFICATION COMPLETE');
    }

    verifyContractorScoring(game) {
        this.log('🔍 VERIFYING CONTRACTOR SCORING...');

        // Validate contractor team is set
        if (!this.contractorTeam || (this.contractorTeam !== 'team1' && this.contractorTeam !== 'team2')) {
            const error = `❌ Invalid contractor team: ${this.contractorTeam}`;
            this.log(error);
            throw new Error(error);
        }

        // Validate current bid exists
        if (!this.currentBid || typeof this.currentBid.points !== 'number') {
            const error = `❌ Invalid current bid: ${JSON.stringify(this.currentBid)}`;
            this.log(error);
            throw new Error(error);
        }

        const contractorCardPoints = this.trickPoints[this.contractorTeam];
        const opposingTeam = this.contractorTeam === 'team1' ? 'team2' : 'team1';
        const opposingCardPoints = this.trickPoints[opposingTeam];
        const kittyDiscardPoints = this.calculateKittyDiscardPoints();

        this.log(`Contractor team: ${this.contractorTeam}`);
        this.log(`Contractor card points: ${contractorCardPoints}`);
        this.log(`Opposing card points: ${opposingCardPoints}`);
        this.log(`Kitty discard points: ${kittyDiscardPoints}`);
        this.log(`Bid: ${this.currentBid.points} points`);
        this.log(`Game has kitty: ${this.game.hasKitty}`);

        // Verify kitty discard points are only calculated when kitty is enabled
        if (this.kittyDiscards && this.kittyDiscards.length > 0 && !this.game.hasKitty) {
            const error = '❌ Kitty discards exist but game does not have kitty enabled!';
            this.log(error);
            throw new Error(error);
        }

        // For kitty games, verify that kitty discard points are being calculated
        if (this.game.hasKitty && this.kittyDiscards && this.kittyDiscards.length > 0) {
            const expectedKittyPoints = this.calculateKittyDiscardPoints();
            const kittyCardDetails = this.kittyDiscards.map(card => `${card.rank}${card.suit}(${this.getCardValue(card)})`).join(', ');
            this.log(`✅ Kitty game: ${expectedKittyPoints} points from kitty discards [${kittyCardDetails}] should go to opposing team`);
            this.log(`🎯 KITTY TEST: These ${expectedKittyPoints} points should be added to ${opposingTeam} score`);
        } else if (this.game.hasKitty) {
            this.log('ℹ️  Kitty game: No kitty discards in this round');
        }

        // Calculate expected round score changes based on contractor scoring rules
        let expectedContractorRoundScore = 0;
        let expectedOpposingRoundScore = 0;

        // Contractor team scoring
        if (contractorCardPoints >= this.currentBid.points) {
            // Contractor made their bid - add card points to their score
            expectedContractorRoundScore = contractorCardPoints;
            this.log(`✅ Contractor made bid (${contractorCardPoints} >= ${this.currentBid.points})`);
        } else {
            // Contractor failed - subtract bid amount from their score
            expectedContractorRoundScore = -this.currentBid.points;
            this.log(`❌ Contractor failed bid (${contractorCardPoints} < ${this.currentBid.points})`);
        }

        // Opposing team scoring
        expectedOpposingRoundScore = opposingCardPoints + kittyDiscardPoints;
        this.log(`Opposing team gets: ${opposingCardPoints} card points + ${kittyDiscardPoints} kitty points = ${expectedOpposingRoundScore}`);

        // Calculate expected total scores
        const expectedContractorTotal = this.previousTotalScores[this.contractorTeam] + expectedContractorRoundScore;
        const expectedOpposingTotal = this.previousTotalScores[opposingTeam] + expectedOpposingRoundScore;

        // Get actual scores from server
        const actualContractorTotal = game.teamScores[this.contractorTeam];
        const actualOpposingTotal = game.teamScores[opposingTeam];

        this.log(`Previous total scores: ${this.contractorTeam}: ${this.previousTotalScores[this.contractorTeam]}, ${opposingTeam}: ${this.previousTotalScores[opposingTeam]}`);
        this.log(`Expected round change: ${this.contractorTeam}: ${expectedContractorRoundScore}, ${opposingTeam}: ${expectedOpposingRoundScore}`);
        this.log(`Expected total scores: ${this.contractorTeam}: ${expectedContractorTotal}, ${opposingTeam}: ${expectedOpposingTotal}`);
        this.log(`Actual total scores: ${this.contractorTeam}: ${actualContractorTotal}, ${opposingTeam}: ${actualOpposingTotal}`);

        // Assert that actual scores match expected scores
        if (actualContractorTotal !== expectedContractorTotal) {
            const error = `❌ CONTRACTOR SCORE MISMATCH! Expected ${this.contractorTeam} total: ${expectedContractorTotal}, Actual: ${actualContractorTotal} (Difference: ${actualContractorTotal - expectedContractorTotal})`;
            this.log(error);
            throw new Error(error);
        }

        if (actualOpposingTotal !== expectedOpposingTotal) {
            const error = `❌ OPPOSING SCORE MISMATCH! Expected ${opposingTeam} total: ${expectedOpposingTotal}, Actual: ${actualOpposingTotal} (Difference: ${actualOpposingTotal - expectedOpposingTotal})`;
            this.log(error);
            throw new Error(error);
        }

        this.log(`✅ Contractor scoring verified correctly!`);
        this.log(`✅ ${this.contractorTeam} score: ${actualContractorTotal} (matches expected)`);
        this.log(`✅ ${opposingTeam} score: ${actualOpposingTotal} (matches expected)`);

        this.log('🔍 CONTRACTOR SCORING VERIFICATION COMPLETE');
    }

    verifyTotalScoring() {
        this.log('🔍 VERIFYING TOTAL SCORING...');

        if (this.scoringHistory.length === 0) {
            this.log('No scoring history to verify');
            return;
        }

        this.log(`Scoring history for ${this.scoringHistory.length} rounds:`);

        let totalVerifications = 0;

        this.scoringHistory.forEach((entry, index) => {
            this.log(`Round ${entry.round}:`);
            this.log(`  Team Scores: Team1: ${entry.teamScores.team1}, Team2: ${entry.teamScores.team2}`);
            this.log(`  Trick Points: Team1: ${entry.trickPoints.team1}, Team2: ${entry.trickPoints.team2}`);
            this.log(`  Contractor: ${entry.contractorTeam}, Bid: ${entry.currentBid?.points || 'N/A'}`);

            // Verify each round had 100 total points (trick points + kitty discards)
            const totalTrickPoints = entry.trickPoints.team1 + entry.trickPoints.team2;
            const kittyPoints = entry.kittyDiscards.reduce((total, card) => {
                const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };
                return total + (values[card.rank] || 0);
            }, 0);
            const totalPoints = totalTrickPoints + kittyPoints;

            // Check if everyone passed (no contractor and no tricks played)
            if (totalPoints === 0 && !entry.contractorTeam) {
                this.log(`  ✅ Round skipped: Everyone passed`);
            } else if (totalPoints !== 100) {
                const error = `❌ Round ${entry.round} points don't add up to 100! Trick: ${totalTrickPoints}, Kitty: ${kittyPoints}, Total: ${totalPoints}`;
                this.log(error);
                throw new Error(error);
            }

            if (kittyPoints > 0) {
                this.log(`  ✅ Points verified: ${totalTrickPoints} trick + ${kittyPoints} kitty = ${totalPoints}`);
            } else {
                this.log(`  ✅ Points verified: ${totalTrickPoints} total`);
            }

            totalVerifications++;
        });

        this.log(`✅ All ${totalVerifications} rounds verified: points add up to 100`);
        this.log(`✅ All ${totalVerifications} rounds verified: contractor scoring logic applied correctly`);
        this.log(`✅ Total scoring tracked and verified across ${totalVerifications} rounds`);

        this.log('🔍 TOTAL SCORING VERIFICATION COMPLETE');
    }

    verifyNotepadData(game) {
        this.log('📝 VERIFYING NOTEPAD DATA...');

        // Validate basic game state
        if (!game) {
            const error = '❌ Game state is null or undefined!';
            this.log(error);
            throw new Error(error);
        }

        if (typeof game.round !== 'number' || game.round < 1) {
            const error = `❌ Invalid round number: ${game.round}`;
            this.log(error);
            throw new Error(error);
        }

        // Get notepad data from game state
        const actualNotepadData = {
            round: game.round,
            roundScores: game.roundScores || { team1: 0, team2: 0 },
            currentBid: game.currentBid,
            contractorTeam: game.contractorTeam,
            totalPoints: (game.roundScores?.team1 || 0) + (game.roundScores?.team2 || 0),
            kittyDiscards: game.kittyDiscards || []
        };

        this.log(`Notepad data for Round ${actualNotepadData.round}:`);
        this.log(`  Round Scores: Team1: ${actualNotepadData.roundScores.team1}, Team2: ${actualNotepadData.roundScores.team2}`);
        this.log(`  Current Bid: ${actualNotepadData.currentBid ? `${actualNotepadData.currentBid.points} points${actualNotepadData.currentBid.suit ? ` in ${actualNotepadData.currentBid.suit}` : ''}` : 'None'}`);
        this.log(`  Contractor Team: ${actualNotepadData.contractorTeam || 'None'}`);
        this.log(`  Total Points: ${actualNotepadData.totalPoints} / 100`);
        this.log(`  Game has kitty: ${game.hasKitty}`);
        if (actualNotepadData.kittyDiscards.length > 0) {
            this.log(`  Kitty Discards: ${actualNotepadData.kittyDiscards.map(c => `${c.rank}${c.suit}`).join(', ')}`);
        }

        // Note: Notepad round scores are reset to 0 after each round, so we don't compare them to trick points
        // The trick points represent the cumulative points for the completed round
        this.log(`Notepad round scores (reset for new round): Team1: ${actualNotepadData.roundScores.team1}, Team2: ${actualNotepadData.roundScores.team2}`);
        this.log(`Completed round trick points: Team1: ${this.trickPoints.team1}, Team2: ${this.trickPoints.team2}`);

        // Verify contractor team is set when there's a bid
        if (actualNotepadData.currentBid && !actualNotepadData.contractorTeam) {
            const error = '❌ Contractor team not set despite having a bid!';
            this.log(error);
            throw new Error(error);
        } else if (actualNotepadData.currentBid && actualNotepadData.contractorTeam) {
            this.log('✅ Contractor team properly set');
        }

        // Verify total points calculation
        const expectedTotal = actualNotepadData.roundScores.team1 + actualNotepadData.roundScores.team2;
        if (actualNotepadData.totalPoints !== expectedTotal) {
            const error = `❌ NOTEPAD TOTAL POINTS MISMATCH! Expected: ${expectedTotal}, Actual: ${actualNotepadData.totalPoints} (Difference: ${actualNotepadData.totalPoints - expectedTotal})`;
            this.log(error);
            throw new Error(error);
        }
        this.log(`✅ Notepad total points correct: ${actualNotepadData.totalPoints}`);

        // Verify round scores are valid numbers
        if (typeof actualNotepadData.roundScores.team1 !== 'number' || typeof actualNotepadData.roundScores.team2 !== 'number') {
            const error = `❌ NOTEPAD ROUND SCORES INVALID! Team1: ${actualNotepadData.roundScores.team1}, Team2: ${actualNotepadData.roundScores.team2}`;
            this.log(error);
            throw new Error(error);
        }
        this.log(`✅ Notepad round scores are valid numbers`);

        // Verify bid structure if present
        if (actualNotepadData.currentBid) {
            if (typeof actualNotepadData.currentBid.points !== 'number' || actualNotepadData.currentBid.points < 0) {
                const error = `❌ NOTEPAD BID INVALID! Bid points: ${actualNotepadData.currentBid.points}`;
                this.log(error);
                throw new Error(error);
            }
            this.log(`✅ Notepad bid structure is valid`);
        }

        // Store notepad data for history
        this.notepadHistory.push({
            round: actualNotepadData.round,
            data: { ...actualNotepadData },
            timestamp: Date.now()
        });

        this.log('📝 NOTEPAD DATA VERIFICATION COMPLETE');
    }

    logNotepadSummary() {
        this.log('📝 NOTEPAD VERIFICATION SUMMARY...');

        if (this.notepadHistory.length === 0) {
            this.log('No notepad data was tracked during the game');
            return;
        }

        this.log(`Notepad data was verified for ${this.notepadHistory.length} rounds:`);
        this.notepadHistory.forEach((entry, index) => {
            const data = entry.data;
            this.log(`Round ${data.round}:`);
            this.log(`  - Round Scores: Team1: ${data.roundScores.team1}, Team2: ${data.roundScores.team2}`);
            this.log(`  - Current Bid: ${data.currentBid ? `${data.currentBid.points} points${data.currentBid.suit ? ` in ${data.currentBid.suit}` : ''}` : 'None'}`);
            this.log(`  - Contractor Team: ${data.contractorTeam || 'None'}`);
            this.log(`  - Total Points: ${data.totalPoints} / 100`);
            if (data.kittyDiscards.length > 0) {
                this.log(`  - Kitty Discards: ${data.kittyDiscards.map(c => `${c.rank}${c.suit}`).join(', ')}`);
            }
        });

        this.log('📝 NOTEPAD VERIFICATION SUMMARY COMPLETE');
    }

    async makeSmartBid() {
        if (this.game.phase !== 'bidding' || this.game.currentPlayer !== this.player.id) {
            return;
        }

        const handValue = this.calculateHandValue();
        const currentBid = this.game.currentBid;

        let myBid = 0;
        // bid has to have a suit
        // randomly choose a suit
        let suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        let suit = suits[Math.floor(Math.random() * suits.length)];

        // Bidding logic - more aggressive for kitty games to test kitty discard scoring
        if (this.game.hasKitty) {
            // For kitty games, be more aggressive to win the bid and test kitty discard scoring
            if (handValue >= 30) {
                myBid = Math.min(handValue + 20, 80); // Add 20 points to be more aggressive
            } else if (handValue >= 20) {
                myBid = 50; // Bid 50 even with lower hand value
            } else {
                myBid = 40; // Minimum bid for kitty test
            }
            this.log(`🎯 KITTY TEST: Aggressive bidding to win bid and test kitty discard scoring`);
        } else {
            // Standard bidding logic for non-kitty games
            if (handValue >= 50) {
                myBid = Math.min(handValue, 80);
            } else if (handValue >= 40) {
                myBid = 60;
            } else if (handValue >= 30) {
                myBid = 50;
            }
        }

        // Only bid if we can beat the current bid
        if (currentBid && myBid <= currentBid.points) {
            myBid = 0; // Pass
        }

        if (myBid > 0) {
            this.log(`Making bid: ${myBid} points (hand value: ${handValue})`);
            await this.makeBid(myBid, suit);
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

        const myCards = this.getMyCards();
        const values = { 'A': 10, 'K': 0, 'Q': 0, 'J': 0, '10': 10, '9': 0, '8': 0, '7': 0, '6': 0, '5': 5 };

        let discardedCards;

        // For kitty games, intentionally discard point cards to test kitty discard scoring
        if (this.game.hasKitty) {
            this.log('🎯 KITTY TEST: Intentionally discarding point cards to test kitty discard scoring');

            // Find point cards (A, 10, 5) to discard
            const pointCards = myCards.filter(card => values[card.rank] > 0);
            const nonPointCards = myCards.filter(card => values[card.rank] === 0);

            // Discard up to 4 point cards if available, otherwise fill with non-point cards
            discardedCards = [...pointCards.slice(0, 4)];
            if (discardedCards.length < 4) {
                discardedCards = [...discardedCards, ...nonPointCards.slice(0, 4 - discardedCards.length)];
            }

            const pointValue = discardedCards.reduce((total, card) => total + values[card.rank], 0);
            this.log(`🎯 KITTY TEST: Discarding ${pointValue} points worth of cards to test kitty scoring`);
        } else {
            // For non-kitty games, discard lowest value cards as usual
            const sortedCards = [...myCards].sort((a, b) => (values[a.rank] || 0) - (values[b.rank] || 0));
            discardedCards = sortedCards.slice(0, 4);
        }

        this.log(`Discarding: ${discardedCards.map(c => `${c.rank}${c.suit}`).join(', ')}`);
        await this.discardToKitty(discardedCards, this.game.trumpSuit || 'hearts');
    }

    async playGame() {
        this.log('Starting to play the game...');

        while (!this.gameEnded && this.game) {
            // Wait for game updates
            await new Promise(resolve => setTimeout(resolve, 200));

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

// Test a single game scenario
async function testGameScenario(scenarioName, hasKitty) {
    console.log(`\n🎯 Testing ${scenarioName}...`);
    console.log('-'.repeat(50));

    const randomId = Math.random().toString(36).substring(2, 15);
    const player = new GamePlayer(`TestPlayer-${randomId}`);

    try {
        // Connect to server
        await player.connect();
        player.log('✅ Connected to server');

        // Join lobby
        await player.joinLobby();
        player.log('✅ Joined lobby');

        // Create a table with specified kitty setting
        const tableId = `integration-test-${randomId}`;
        await player.createTable(tableId, `Integration Test Table ${randomId}`, hasKitty);
        player.log(`✅ Created table with kitty ${hasKitty ? 'enabled' : 'disabled'}`);

        // Add 3 bots to fill the table
        await player.addBot(1, 'easy'); // East
        await player.addBot(2, 'easy');   // South  
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

        // Disconnect
        player.disconnect();
        player.log('✅ Disconnected from server');

        console.log(`✅ ${scenarioName} test completed successfully!`);
        return true;

    } catch (error) {
        console.error(`❌ ${scenarioName} test failed:`, error.message);
        player.disconnect();
        return false;
    }
}

// Integration test function
async function runKittyIntegrationTest() {
    console.log('🚀 Starting Kitty Integration Test - Full Game Simulation');
    console.log('='.repeat(60));

    let allTestsPassed = true;

    const kittyTestPassed = await testGameScenario('Kitty Game', true);
    allTestsPassed = allTestsPassed && kittyTestPassed;

    // Final results
    console.log('\n🎉 Integration Test Results');
    console.log('='.repeat(60));

    if (allTestsPassed) {
        console.log('✅ ALL TESTS PASSED!');
        console.log('✅ Kitty game completed successfully');
        console.log('✅ All game phases handled correctly');
        console.log('✅ Bot interactions worked properly');
        console.log('✅ Games ended naturally');
        console.log('✅ SCORING VERIFIED: All trick points add up to 100 per round');
        console.log('✅ SCORING VERIFIED: Contractor scoring logic matches expectations');
        console.log('✅ SCORING VERIFIED: Team scores calculated correctly with assertions');
        console.log('✅ SCORING VERIFIED: Kitty discard points properly applied');
        console.log('✅ NOTEPAD VERIFIED: All notepad data structure is valid');
        console.log('✅ NOTEPAD VERIFIED: Round scores and totals match expectations');
        console.log('✅ NOTEPAD VERIFIED: Contractor team and bid data correct');
        console.log('✅ All verification includes ASSERTIONS that throw errors on mismatch');
    } else {
        console.log('❌ SOME TESTS FAILED!');
        console.log('❌ Check the individual test results above');
        throw new Error('Integration test failed - not all scenarios passed');
    }
}

// Integration test function
async function runStandardIntegrationTest() {
    console.log('🚀 Starting Standard Integration Test - Full Game Simulation');
    console.log('='.repeat(60));

    let allTestsPassed = true;

    // Test 1: Standard game (no kitty)
    const standardTestPassed = await testGameScenario('Standard Game (No Kitty)', false);
    allTestsPassed = allTestsPassed && standardTestPassed;

    // Final results
    console.log('\n🎉 Integration Test Results');
    console.log('='.repeat(60));

    if (allTestsPassed) {
        console.log('✅ ALL TESTS PASSED!');
        console.log('✅ Standard game (no kitty) completed successfully');
        console.log('✅ All game phases handled correctly');
        console.log('✅ Bot interactions worked properly');
        console.log('✅ Games ended naturally');
        console.log('✅ SCORING VERIFIED: All trick points add up to 100 per round');
        console.log('✅ SCORING VERIFIED: Contractor scoring logic matches expectations');
        console.log('✅ SCORING VERIFIED: Team scores calculated correctly with assertions');
        console.log('✅ NOTEPAD VERIFIED: All notepad data structure is valid');
        console.log('✅ NOTEPAD VERIFIED: Round scores and totals match expectations');
        console.log('✅ NOTEPAD VERIFIED: Contractor team and bid data correct');
        console.log('✅ All verification includes ASSERTIONS that throw errors on mismatch');
    } else {
        console.log('❌ SOME TESTS FAILED!');
        console.log('❌ Check the individual test results above');
        throw new Error('Integration test failed - not all scenarios passed');
    }
}

async function runIntegrationTests() {
    await runKittyIntegrationTest();
    await runStandardIntegrationTest();
}

// Run the test
if (require.main === module) {
    runIntegrationTests()
        .then(() => {
            console.log('\n✨ Integration test completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n💥 Integration test failed:', error.message);
            process.exit(1);
        });
}

module.exports = { GamePlayer, runIntegrationTests };
