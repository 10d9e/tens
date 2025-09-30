#!/usr/bin/env node

const readline = require('readline');
const { v4: uuidv4 } = require('uuid');

// Game logic functions (standalone for CLI)
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

function canPlayCard(card, leadSuit, trumpSuit, playerCards) {
    if (!leadSuit) return true;

    const hasLeadSuit = playerCards.some(c => c.suit === leadSuit);
    if (hasLeadSuit) {
        return card.suit === leadSuit;
    }

    return true;
}

function getCardRank(rank) {
    const ranks = { 'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10, '9': 9, '8': 8, '7': 7, '5': 5 };
    return ranks[rank];
}

function getTrickWinner(trick, trumpSuit) {
    if (trick.cards.length === 0) return '';

    const leadSuit = trick.cards[0].card.suit;
    let winningCard = trick.cards[0];

    for (const { card, playerId } of trick.cards) {
        if (card.suit === trumpSuit && winningCard.card.suit !== trumpSuit) {
            winningCard = { card, playerId };
        } else if (card.suit === trumpSuit && winningCard.card.suit === trumpSuit) {
            if (getCardRank(card.rank) > getCardRank(winningCard.card.rank)) {
                winningCard = { card, playerId };
            }
        } else if (card.suit === leadSuit && winningCard.card.suit === leadSuit) {
            if (getCardRank(card.rank) > getCardRank(winningCard.card.rank)) {
                winningCard = { card, playerId };
            }
        }
    }

    return winningCard.playerId;
}

function calculateTrickPoints(trick) {
    return trick.cards.reduce((total, { card }) => total + getCardValue(card), 0);
}

function getPlayerTeam(playerId, players) {
    const player = players.find(p => p.id === playerId);
    if (!player) return 'team1';
    return player.position % 2 === 0 ? 'team1' : 'team2';
}

function isGameOver(game) {
    return game.teamScores.team1 >= 200 || game.teamScores.team2 >= 200;
}

function getWinningTeam(game) {
    if (game.teamScores.team1 >= 200) return 'team1';
    if (game.teamScores.team2 >= 200) return 'team2';
    return null;
}

// Simple bot AI for CLI
class CLIBotAI {
    constructor(skill = 'medium', name = 'Bot') {
        this.skill = skill;
        this.name = name;
    }

    makeBid(handValue, currentBid = 0) {
        let bid = 0;

        switch (this.skill) {
            case 'easy':
                if (handValue >= 40) bid = Math.max(30, currentBid + 5);
                else if (handValue >= 30) bid = Math.max(20, currentBid + 5);
                else if (handValue >= 20) bid = Math.max(15, currentBid + 5);
                break;
            case 'medium':
                if (handValue >= 35) bid = Math.max(25, currentBid + 5);
                else if (handValue >= 25) bid = Math.max(20, currentBid + 5);
                else if (handValue >= 15) bid = Math.max(10, currentBid + 5);
                break;
            case 'hard':
                if (handValue >= 30) bid = Math.max(20, currentBid + 5);
                else if (handValue >= 20) bid = Math.max(15, currentBid + 5);
                else if (handValue >= 10) bid = Math.max(10, currentBid + 5);
                break;
        }

        return bid > currentBid ? bid : 0;
    }

    selectTrump(cards) {
        const suitCounts = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
        cards.forEach(card => suitCounts[card.suit]++);

        return Object.entries(suitCounts)
            .sort(([, a], [, b]) => b - a)[0][0];
    }

    async playCard(playableCards, leadSuit, trumpSuit, trickCards) {
        // Add 1 second delay
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (playableCards.length === 0) return null;

        // Simple strategy: play highest value card
        return playableCards.reduce((best, current) =>
            getCardValue(current) > getCardValue(best) ? current : best
        );
    }
}

// Game state
class CLIGame {
    constructor() {
        this.players = [];
        this.currentPlayer = 0;
        this.phase = 'setup';
        this.trumpSuit = null;
        this.currentBid = null;
        this.currentTrick = { cards: [], winner: null, points: 0 };
        this.lastTrick = null;
        this.round = 0;
        this.teamScores = { team1: 0, team2: 0 };
        this.dealer = 0;
        this.deck = [];
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async start() {
        console.log('🎴 Welcome to Two Hundred Card Game!');
        console.log('=====================================\n');

        await this.setupPlayers();
        this.dealCards();
        this.phase = 'bidding';
        await this.biddingPhase();

        if (this.phase === 'playing') {
            await this.playingPhase();
        }

        this.rl.close();
    }

    async setupPlayers() {
        console.log('Setting up players...\n');

        // Add human player
        this.players.push({
            id: 'human',
            name: 'You',
            isBot: false,
            position: 0,
            cards: [],
            score: 0,
            isReady: true
        });

        // Add 3 bot players
        const botSkills = ['easy', 'medium', 'hard'];
        for (let i = 1; i < 4; i++) {
            this.players.push({
                id: `bot-${i}`,
                name: `Bot (${botSkills[i - 1]})`,
                isBot: true,
                botSkill: botSkills[i - 1],
                position: i,
                cards: [],
                score: 0,
                isReady: true,
                ai: new CLIBotAI(botSkills[i - 1], `Bot (${botSkills[i - 1]})`)
            });
        }

        console.log('Players:');
        this.players.forEach((player, index) => {
            console.log(`${index}: ${player.name} ${player.isBot ? '(Bot)' : '(Human)'}`);
        });
        console.log('');
    }

    dealCards() {
        console.log('Dealing cards...\n');
        this.deck = createDeck();
        this.players = dealCards(this.deck, this.players.map(p => ({ ...p, cards: [] })));

        // Show human player's cards
        console.log('Your cards:');
        this.displayCards(this.players[0].cards);
        console.log('');
    }

    displayCards(cards) {
        cards.forEach((card, index) => {
            const value = getCardValue(card);
            const pointText = value > 0 ? ` (${value} pts)` : '';
            console.log(`${index + 1}. ${card.rank} of ${card.suit}${pointText}`);
        });
    }

    async biddingPhase() {
        console.log('🎯 BIDDING PHASE');
        console.log('================\n');

        let biddingComplete = false;
        let passCount = 0;

        while (!biddingComplete) {
            const player = this.players[this.currentPlayer];
            console.log(`Current bid: ${this.currentBid ? this.currentBid.points : 'None'}`);
            console.log(`Trump suit: ${this.trumpSuit || 'Not selected'}\n`);

            if (player.isBot) {
                const handValue = player.cards.reduce((total, card) => total + getCardValue(card), 0);
                const bid = player.ai.makeBid(handValue, this.currentBid?.points || 0);

                if (bid > 0) {
                    console.log(`${player.name} bids ${bid} points`);
                    this.currentBid = { playerId: player.id, points: bid };
                    passCount = 0;

                    if (bid >= 30 && !this.trumpSuit) {
                        this.trumpSuit = player.ai.selectTrump(player.cards);
                        console.log(`${player.name} selects ${this.trumpSuit} as trump suit`);
                    }
                } else {
                    console.log(`${player.name} passes`);
                    passCount++;
                }
            } else {
                const bid = await this.getHumanBid();
                if (bid > 0) {
                    console.log(`You bid ${bid} points`);
                    this.currentBid = { playerId: player.id, points: bid };
                    passCount = 0;

                    if (bid >= 30 && !this.trumpSuit) {
                        this.trumpSuit = await this.getHumanTrump();
                        console.log(`You select ${this.trumpSuit} as trump suit`);
                    }
                } else {
                    console.log('You pass');
                    passCount++;
                }
            }

            this.currentPlayer = (this.currentPlayer + 1) % 4;

            if (passCount >= 3 || (this.currentBid && this.trumpSuit)) {
                biddingComplete = true;
            }
        }

        if (this.currentBid && this.trumpSuit) {
            console.log(`\n✅ Contract: ${this.currentBid.points} points, Trump: ${this.trumpSuit}`);
            this.phase = 'playing';
        } else {
            console.log('\n❌ No contract made. Game ends.');
        }
    }

    async getHumanBid() {
        return new Promise((resolve) => {
            this.rl.question('Enter your bid (0 to pass): ', (answer) => {
                const bid = parseInt(answer);
                if (isNaN(bid) || bid < 0) {
                    console.log('Invalid bid. Please enter a number >= 0');
                    this.getHumanBid().then(resolve);
                } else {
                    resolve(bid);
                }
            });
        });
    }

    async getHumanTrump() {
        return new Promise((resolve) => {
            console.log('Select trump suit:');
            console.log('1. Hearts');
            console.log('2. Diamonds');
            console.log('3. Clubs');
            console.log('4. Spades');

            this.rl.question('Enter choice (1-4): ', (answer) => {
                const choice = parseInt(answer);
                const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
                if (choice >= 1 && choice <= 4) {
                    resolve(suits[choice - 1]);
                } else {
                    console.log('Invalid choice. Please enter 1-4');
                    this.getHumanTrump().then(resolve);
                }
            });
        });
    }

    async playingPhase() {
        console.log('\n🎮 PLAYING PHASE');
        console.log('================\n');

        // Find the bidder to start
        const bidderIndex = this.players.findIndex(p => p.id === this.currentBid.playerId);
        this.currentPlayer = bidderIndex;

        while (!isGameOver(this)) {
            // Check if all players have played all their cards
            const allCardsPlayed = this.players.every(p => p.cards.length === 0);
            if (allCardsPlayed) {
                console.log('\n🎯 All cards have been played! Round complete.');
                break;
            }

            await this.playTrick();

            if (isGameOver(this)) {
                break;
            }

            // Start new trick
            this.currentTrick = { cards: [], winner: null, points: 0 };
        }

        this.endGame();
    }

    async playTrick() {
        console.log(`\n--- Trick ${this.currentTrick.cards.length + 1} ---`);
        console.log(`Team 1: ${this.teamScores.team1} points | Team 2: ${this.teamScores.team2} points\n`);

        for (let i = 0; i < 4; i++) {
            const player = this.players[this.currentPlayer];

            // Check if player has cards
            if (player.cards.length === 0) {
                console.log(`${player.name} has no cards left.`);
                this.currentPlayer = (this.currentPlayer + 1) % 4;
                continue;
            }

            const leadSuit = this.currentTrick.cards.length > 0 ? this.currentTrick.cards[0].card.suit : null;

            let card;
            if (player.isBot) {
                const playableCards = player.cards.filter(c =>
                    canPlayCard(c, leadSuit, this.trumpSuit, player.cards)
                );
                if (playableCards.length === 0) {
                    // Fallback: play any card if no valid cards
                    card = player.cards[0];
                } else {
                    card = await player.ai.playCard(playableCards, leadSuit, this.trumpSuit, this.currentTrick.cards);
                }
            } else {
                card = await this.getHumanCard(leadSuit);
            }

            // Remove card from player's hand
            player.cards = player.cards.filter(c => c.id !== card.id);
            this.currentTrick.cards.push({ card, playerId: player.id });

            console.log(`${player.name} plays: ${card.rank} of ${card.suit}`);

            this.currentPlayer = (this.currentPlayer + 1) % 4;
        }

        // Determine trick winner
        const winner = getTrickWinner(this.currentTrick, this.trumpSuit);
        const winnerPlayer = this.players.find(p => p.id === winner);
        const trickPoints = calculateTrickPoints(this.currentTrick);

        console.log(`\n${winnerPlayer.name} wins the trick! (+${trickPoints} points)`);

        // Update scores
        const winnerTeam = getPlayerTeam(winner, this.players);
        this.teamScores[winnerTeam] += trickPoints;

        this.lastTrick = { ...this.currentTrick };
        this.currentPlayer = this.players.findIndex(p => p.id === winner);
    }

    async getHumanCard(leadSuit) {
        const player = this.players[0]; // Human player
        const playableCards = player.cards.filter(card =>
            canPlayCard(card, leadSuit, this.trumpSuit, player.cards)
        );

        // If no playable cards, show all cards
        const cardsToShow = playableCards.length > 0 ? playableCards : player.cards;

        console.log('\nYour playable cards:');
        cardsToShow.forEach((card, index) => {
            const value = getCardValue(card);
            const pointText = value > 0 ? ` (${value} pts)` : '';
            console.log(`${index + 1}. ${card.rank} of ${card.suit}${pointText}`);
        });

        return new Promise((resolve) => {
            this.rl.question(`Select card (1-${cardsToShow.length}): `, (answer) => {
                const choice = parseInt(answer);
                if (choice >= 1 && choice <= cardsToShow.length) {
                    resolve(cardsToShow[choice - 1]);
                } else {
                    console.log('Invalid choice. Please try again.');
                    this.getHumanCard(leadSuit).then(resolve);
                }
            });
        });
    }

    endGame() {
        console.log('\n🏆 GAME OVER!');
        console.log('==============\n');

        const winningTeam = getWinningTeam(this);
        console.log(`Final Scores:`);
        console.log(`Team 1: ${this.teamScores.team1} points`);
        console.log(`Team 2: ${this.teamScores.team2} points\n`);

        if (winningTeam) {
            console.log(`🎉 ${winningTeam === 'team1' ? 'Team 1' : 'Team 2'} wins!`);
        } else {
            console.log('🤝 It\'s a tie!');
        }
    }
}

// Start the game
if (require.main === module) {
    const game = new CLIGame();
    game.start().catch(console.error);
}

module.exports = { CLIGame, CLIBotAI };
