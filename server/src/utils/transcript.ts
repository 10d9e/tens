import { Game, GameTranscript, TranscriptEntry, Card, Bid } from "../types/game";
import logger from '../logger';
import { saveTranscript, getTranscript } from './state';

/**
 * Initialize a game transcript
 */
export function initializeTranscript(game: Game): GameTranscript {
    const metadata = {
        deckVariant: game.deckVariant || '36',
        scoreTarget: game.scoreTarget || 200,
        hasKitty: game.hasKitty || false,
        playerNames: {} as { [playerId: string]: string },
        playerPositions: {} as { [playerId: string]: number }
    };

    // Populate player metadata
    game.players.forEach(player => {
        metadata.playerNames[player.id] = player.name;
        metadata.playerPositions[player.id] = player.position;
    });

    // Get table name from lobby
    const { defaultLobby } = require('./state');
    const table = defaultLobby?.tables.get(game.tableId);
    const tableName = table?.name || 'Unknown Table';

    return {
        gameId: game.id,
        tableId: game.tableId,
        tableName,
        startTime: Date.now(),
        entries: [],
        metadata
    };
}

/**
 * Create a game state snapshot for the transcript
 * NOTE: This includes ALL player cards for full game replay capability
 */
function createGameStateSnapshot(game: Game): Partial<Game> {
    return {
        phase: game.phase,
        currentPlayer: game.currentPlayer,
        trumpSuit: game.trumpSuit,
        currentBid: game.currentBid ? { ...game.currentBid } : undefined,
        round: game.round,
        teamScores: { ...game.teamScores },
        roundScores: { ...game.roundScores },
        dealer: game.dealer,
        contractorTeam: game.contractorTeam,
        currentTrick: {
            cards: game.currentTrick.cards.map(c => ({
                card: { suit: c.card.suit, rank: c.card.rank, id: c.card.id },
                playerId: c.playerId
            })),
            winner: game.currentTrick.winner,
            points: game.currentTrick.points
        },
        lastTrick: game.lastTrick ? {
            cards: game.lastTrick.cards.map(c => ({
                card: { suit: c.card.suit, rank: c.card.rank, id: c.card.id },
                playerId: c.playerId
            })),
            winner: game.lastTrick.winner,
            points: game.lastTrick.points
        } : undefined,
        // Include ALL player cards for complete game replay
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isBot: p.isBot,
            position: p.position,
            // Deep copy all cards with full card data
            cards: p.cards.map(c => ({ suit: c.suit, rank: c.rank, id: c.id })),
            score: p.score,
            isReady: p.isReady
        })),
        kittyDiscards: game.kittyDiscards ? game.kittyDiscards.map(c => ({ suit: c.suit, rank: c.rank, id: c.id })) : undefined,
        kitty: game.kitty ? game.kitty.map(c => ({ suit: c.suit, rank: c.rank, id: c.id })) : undefined
    };
}

/**
 * Get or create transcript for a game from global storage
 */
function getOrCreateTranscript(game: Game): GameTranscript {
    let transcript = getTranscript(game.id);
    if (!transcript) {
        transcript = initializeTranscript(game);
        saveTranscript(transcript);
    }
    return transcript;
}

/**
 * Add a transcript entry to the game
 */
export function addTranscriptEntry(
    game: Game,
    type: TranscriptEntry['type'],
    data: any
): void {
    const transcript = getOrCreateTranscript(game);

    const entry: TranscriptEntry = {
        timestamp: Date.now(),
        type,
        data,
        gameState: createGameStateSnapshot(game)
    };

    transcript.entries.push(entry);
    logger.info(`📝 Transcript entry added: ${type} (Entry #${transcript.entries.length}) for game ${game.id}`);

    // Save transcript to global storage
    saveTranscript(transcript);
}

/**
 * Record game start
 */
export function recordGameStart(game: Game): void {
    addTranscriptEntry(game, 'game_start', {
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            position: p.position,
            isBot: p.isBot
        })),
        dealer: game.dealer,
        deckVariant: game.deckVariant,
        scoreTarget: game.scoreTarget,
        hasKitty: game.hasKitty
    });
    logger.info(`Initial transcript saved for game ${game.id}`);
}

/**
 * Record round start
 */
export function recordRoundStart(game: Game): void {
    addTranscriptEntry(game, 'round_start', {
        round: game.round,
        dealer: game.dealer,
        teamScores: { ...game.teamScores }
    });
}

/**
 * Record a bid
 */
export function recordBid(game: Game, playerId: string, bid: Bid): void {
    addTranscriptEntry(game, 'bid_made', {
        playerId,
        bid: { ...bid }
    });
}

/**
 * Record a pass
 */
export function recordPass(game: Game, playerId: string): void {
    addTranscriptEntry(game, 'bid_pass', {
        playerId
    });
}

/**
 * Record bidding completion
 */
export function recordBiddingComplete(game: Game): void {
    addTranscriptEntry(game, 'bidding_complete', {
        winningBid: game.currentBid ? { ...game.currentBid } : undefined,
        contractorTeam: game.contractorTeam
    });
}

/**
 * Record kitty pick
 */
export function recordKittyPick(game: Game, playerId: string, kitty: Card[]): void {
    addTranscriptEntry(game, 'kitty_pick', {
        playerId,
        kittyCards: kitty.map(c => ({ ...c }))
    });
}

/**
 * Record kitty discard
 */
export function recordKittyDiscard(game: Game, playerId: string, discards: Card[], trumpSuit: string): void {
    addTranscriptEntry(game, 'kitty_discard', {
        playerId,
        discardedCards: discards.map(c => ({ ...c })),
        trumpSuit
    });
}

/**
 * Record a card played
 */
export function recordCardPlayed(game: Game, playerId: string, card: Card): void {
    addTranscriptEntry(game, 'card_played', {
        playerId,
        card: { ...card }
    });
}

/**
 * Record trick completion
 * Captures all 4 cards played in the trick with complete details
 */
export function recordTrickComplete(game: Game, winnerId: string, points: number, trick: any): void {
    addTranscriptEntry(game, 'trick_complete', {
        winnerId,
        points,
        trick: {
            // Capture all 4 cards with full details
            cards: trick.cards.map((c: any) => ({
                card: {
                    suit: c.card.suit,
                    rank: c.card.rank,
                    id: c.card.id
                },
                playerId: c.playerId
            })),
            winner: trick.winner,
            points: trick.points
        },
        // Additional context
        trumpSuit: game.trumpSuit,
        leadSuit: trick.cards.length > 0 ? trick.cards[0].card.suit : undefined,
        trickNumber: game.players[0] ? (9 - game.players[0].cards.length) : 0 // Which trick in the round (1-9)
    });
}

/**
 * Record round completion
 */
export function recordRoundComplete(game: Game, roundScores: { team1: number; team2: number }): void {
    addTranscriptEntry(game, 'round_complete', {
        round: game.round,
        roundScores: { ...roundScores },
        teamScores: { ...game.teamScores },
        contractorTeam: game.contractorTeam,
        currentBid: game.currentBid ? { ...game.currentBid } : undefined,
        kittyDiscards: game.kittyDiscards ? game.kittyDiscards.map(c => ({ ...c })) : undefined
    });
}

/**
 * Record game completion
 */
export function recordGameComplete(game: Game, winningTeam: 'team1' | 'team2', winningPlayers?: any[]): void {
    logger.info(`🏁 recordGameComplete called for game ${game.id}, winningTeam: ${winningTeam}`);

    // Get winning team players
    const winners = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

    const gameCompleteData = {
        winningTeam,
        winningTeamName: winningTeam === 'team1' ? 'Team 1 (North/South)' : 'Team 2 (East/West)',
        winningPlayers: winningPlayers || winners.map(p => ({
            id: p.id,
            name: p.name,
            isBot: p.isBot,
            position: p.position
        })),
        finalScores: { ...game.teamScores },
        totalRounds: game.round,
        gameEndReason: 'score_target_reached'
    };

    logger.info(`🏁 Adding game_complete entry with data:`, JSON.stringify(gameCompleteData));
    addTranscriptEntry(game, 'game_complete', gameCompleteData);

    // Set end time and save transcript after adding the final entry
    const transcript = getOrCreateTranscript(game);
    transcript.endTime = Date.now();
    saveTranscript(transcript);

    logger.info(`✅ Game transcript completed and saved for game ${game.id}: ${winningTeam} wins with ${game.teamScores[winningTeam]} points (${transcript.entries.length} total entries)`);
}

/**
 * Record player exit
 */
export function recordPlayerExit(game: Game, playerId: string, playerName: string, reason?: string): void {
    addTranscriptEntry(game, 'player_exit', {
        playerId,
        playerName,
        reason: reason || 'Player exited',
        phase: game.phase,
        round: game.round
    });

    // Mark transcript as ended if not already
    const transcript = getOrCreateTranscript(game);
    if (!transcript.endTime) {
        transcript.endTime = Date.now();
    }

    logger.info(`Player exit recorded in transcript for game ${game.id}: ${playerName}`);
}

