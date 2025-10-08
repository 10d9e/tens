import { Game, Table, Player, Lobby } from "../types/game";

// Game state storage
export const lobbies = new Map<string, { id: string; name: string; tables: Map<string, Table> }>();
export const players = new Map<string, Player>();

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
