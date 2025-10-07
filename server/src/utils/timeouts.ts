import logger from "../logger";
import { games } from "./state";
import { GameState } from "../types/game";
import { io } from "../index";
import { lobbies } from "./state";

export function startTimeoutCheck(): void {
    // Periodic timeout check for all active games
    setInterval(() => {
        games.forEach((game, gameId) => {
            if (checkPlayerTimeout(game)) {
                logger.info(`Game ${gameId} was cleaned up due to timeout`);
            }
        });
    }, 1000); // Check every second
}

function checkPlayerTimeout(game: GameState): boolean {
    const currentPlayerId = game.currentPlayer;
    const turnStartTime = game.playerTurnStartTime?.[currentPlayerId];

    if (!turnStartTime || !game.timeoutDuration) return false;

    const elapsed = Date.now() - turnStartTime;
    const timeRemaining = game.timeoutDuration - elapsed;

    if (timeRemaining <= 0) {
        // Player has timed out
        const currentPlayer = game.players.find(p => p.id === currentPlayerId);

        // If we can't find the current player, don't clean up the game - just log the error
        if (!currentPlayer) {
            logger.error(`Timeout triggered for unknown player ${currentPlayerId} in game ${game.id}. Skipping cleanup to prevent disrupting game.`);
            return false;
        }

        const playerName = currentPlayer.name;
        logger.info(`Player ${playerName} (${currentPlayerId}) timed out after ${game.timeoutDuration}ms`);

        // Clean up game and force all players back to lobby
        cleanupGameDueToTimeout(game, playerName);
        return true;
    }

    return false;
}

function cleanupGameDueToTimeout(game: GameState, timeoutPlayerName: string): void {
    // Get all players in this game
    const gamePlayers = [...game.players];

    // Remove game from memory
    games.delete(game.id);

    // Get the lobby and table
    const lobby = lobbies.get('default');
    const table = lobby?.tables.get(game.tableId);

    if (lobby && table) {
        // Keep only AI players on the table, remove human players
        const botPlayers = gamePlayers.filter(player => player.isBot);
        table.players = botPlayers;
        table.gameState = undefined;

        // Notify all table members about the updated table
        io.to(`table-${game.tableId}`).emit('table_updated', { table });

        // Force only human players back to lobby with timeout message
        gamePlayers.forEach(player => {
            if (!player.isBot) {
                // For human players, emit to their socket
                io.to(player.id).emit('game_timeout', {
                    message: `Game ended due to ${timeoutPlayerName} timing out. Returning to lobby.`
                });
                io.to(player.id).emit('lobby_joined', {
                    lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                    player: player
                });
            }
        });
    }
}
