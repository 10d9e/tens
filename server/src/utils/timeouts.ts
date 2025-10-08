import logger from "../logger";
import { getAllGames, deleteGame } from "./state";
import { Game } from "../types/game";
import { io } from "../index";
import { lobbies } from "./state";

export function startTimeoutCheck(): void {
    // Periodic timeout check for all active games
    setInterval(() => {
        const games = getAllGames();
        games.forEach((game) => {
            logger.debug(`Checking player timeout for game ${game.id}`);
            if (checkPlayerTimeout(game)) {
                logger.warn(`Game ${game.id} was cleaned up due to timeout`);
            } else {
                logger.debug(`Game ${game.id} is not timed out`);
            }
        });
    }, 1000); // Check every second
}

function checkPlayerTimeout(game: Game): boolean {
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
            logger.warn(`Timeout triggered for unknown player in game ${game.id}. Skipping cleanup to prevent disrupting game.`);
        }

        const playerName = currentPlayer?.name || 'Unknown player';
        logger.warn(`Player ${playerName} (${currentPlayerId}) timed out after ${game.timeoutDuration}ms`);

        // Clean up game and force all players back to lobby
        cleanupGameDueToTimeout(game, playerName);
        return true;
    }

    return false;
}

export function resetPlayerTimeouts(game: Game): void {
    if (game.playerTurnStartTime) {
        logger.info(`Resetting player timeouts for game ${game.id}`);
        game.playerTurnStartTime = {};
    }
}

function cleanupGameDueToTimeout(game: Game, timeoutPlayerName: string): void {
    // Get all players in this game
    const gamePlayers = [...game.players];

    // Reset all player timeouts before cleanup
    resetPlayerTimeouts(game);

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
        // Only send to players who are actually still in this game room
        gamePlayers.forEach(player => {
            if (!player.isBot) {
                // Check if the socket is still in the game room
                const socket = io.sockets.sockets.get(player.id);
                const gameRoom = `game-${game.id}`;

                // Only send timeout messages if the player is still in this game's room
                if (socket && socket.rooms.has(gameRoom)) {
                    logger.debug(`Sending timeout notification to ${player.name} who is still in ${gameRoom}`);
                    // For human players, emit to their socket
                    io.to(player.id).emit('game_timeout', {
                        message: `Game ended due to ${timeoutPlayerName} timing out. Returning to lobby.`
                    });
                    io.to(player.id).emit('lobby_joined', {
                        lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                        player: player
                    });
                } else {
                    logger.debug(`Skipping timeout notification for ${player.name} - not in ${gameRoom} anymore`);
                }
            }
        });
    }

    // Remove game from memory
    deleteGame(game.id);
}
