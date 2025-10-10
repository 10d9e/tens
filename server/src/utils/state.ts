import { Game, Table, Player, Lobby, GameTranscript } from "../types/game";
import logger from '../logger';

// Game state storage
export const lobbies = new Map<string, { id: string; name: string; tables: Map<string, Table> }>();
export const players = new Map<string, Player>();

// Global transcript storage - persists even after games are cleaned up
// Limited to 100 most recent transcripts to conserve memory
export const transcripts = new Map<string, GameTranscript>();
const MAX_TRANSCRIPTS = 100;

// Initialize a default lobby
export const defaultLobby: Lobby = {
    id: 'default',
    name: 'Main Lobby',
    tables: new Map<string, Table>,
    players: new Map(),
    chatMessages: []
};
lobbies.set('default', defaultLobby);

// Helper functions to access games through lobby structure
export function getGameById(gameId: string): Game | undefined {
    for (const [, lobby] of lobbies) {
        for (const [, table] of lobby.tables) {
            if (table.gameState?.id === gameId) {
                return table.gameState;
            }
        }
    }
    return undefined;
}

export function getGameByTableId(tableId: string): Game | undefined {
    for (const [, lobby] of lobbies) {
        const table = lobby.tables.get(tableId);
        if (table?.gameState) {
            return table.gameState;
        }
    }
    return undefined;
}

export function setGameForTable(tableId: string, game: Game): void {
    for (const [, lobby] of lobbies) {
        const table = lobby.tables.get(tableId);
        if (table) {
            table.gameState = game;
            return;
        }
    }
}

export function deleteGame(gameId: string): void {
    for (const [, lobby] of lobbies) {
        for (const [, table] of lobby.tables) {
            if (table.gameState?.id === gameId) {
                table.gameState = undefined;
                return;
            }
        }
    }
}

export function getAllGames(): Game[] {
    const games: Game[] = [];
    for (const [, lobby] of lobbies) {
        for (const [, table] of lobby.tables) {
            if (table.gameState) {
                games.push(table.gameState);
            }
        }
    }
    return games;
}

// Transcript management functions
export function saveTranscript(transcript: GameTranscript): void {
    // If we've reached the maximum, remove the oldest transcript
    if (transcripts.size >= MAX_TRANSCRIPTS && !transcripts.has(transcript.gameId)) {
        // Find the oldest transcript by startTime
        let oldestGameId: string | null = null;
        let oldestTime = Infinity;

        for (const [gameId, t] of transcripts.entries()) {
            if (t.startTime < oldestTime) {
                oldestTime = t.startTime;
                oldestGameId = gameId;
            }
        }

        if (oldestGameId) {
            transcripts.delete(oldestGameId);
            logger.info(`🗑️  Removed oldest transcript ${oldestGameId} to make room (max ${MAX_TRANSCRIPTS} transcripts)`);
        }
    }

    transcripts.set(transcript.gameId, transcript);
    logger.info(`💾 Transcript saved for game ${transcript.gameId}: ${transcript.entries.length} entries. Total transcripts in storage: ${transcripts.size}/${MAX_TRANSCRIPTS}`);
}

export function getTranscript(gameId: string): GameTranscript | undefined {
    return transcripts.get(gameId);
}

export function getAllTranscripts(): GameTranscript[] {
    return Array.from(transcripts.values());
}

export function deleteTranscript(gameId: string): void {
    transcripts.delete(gameId);
}

export function getTranscriptCount(): number {
    return transcripts.size;
}
