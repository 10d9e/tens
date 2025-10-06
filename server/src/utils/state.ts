import { GameState, LobbyTable, Player, Lobby } from "../types/game";

// Game state storage
export const games = new Map<string, GameState>();
export const lobbies = new Map<string, { id: string; name: string; tables: Map<string, LobbyTable> }>();
export const players = new Map<string, Player>();

// Initialize a default lobby
export const defaultLobby: Lobby = {
    id: 'default',
    name: 'Main Lobby',
    tables: new Map(),
    players: new Map(),
    chatMessages: []
};
lobbies.set('default', defaultLobby);
