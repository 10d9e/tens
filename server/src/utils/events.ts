import { io } from "../index";
import { Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger';
import {
    getCardValue, getCardRank, create3BotTables, reservePlayerName,
    releasePlayerName, getRandomHumanName, createDeck, getNextPlayerByPosition,
    calculateRoundScores, isGameEnded, getWinningTeam, createGame, startGame,
    ensurePlayersWhoHavePassedIsSet, handleBotTurn, checkBiddingCompletion, validateKittyState,
    notifyLobbyMembers, cleanupGameRoom, resetTableAfterGameCompletion
} from './gameLogic';
import { AcadienBotAI, SimpleBotAI } from './bots';
import { createBigBubTable, createAcadieTable, createAcadienTestTable } from './misc';
import { debugPrintAllPlayerCards, debugKittyState } from './debug';
import { games, lobbies, players, defaultLobby } from './state';
import { resetPlayerTimeouts } from './timeouts';
import { LobbyTable, Player, GameState, Card } from "../types/game";

/* socket handlers */
// Socket.io connection handling

export function setupSocketEvents(): void {
    io.on('connection', (socket: Socket) => {
        logger.debug('Player connected:', socket.id);

        socket.on('join_lobby', (data: { playerName: string; lobbyId?: string }) => {
            try {
                logger.debug('join_lobby received:', data);
                const { playerName, lobbyId = 'default' } = data;

                // Check if this is a rejoin with the same name (same socket ID)
                const existingPlayer = players.get(socket.id);
                if (existingPlayer && existingPlayer.name === playerName) {
                    logger.debug(`Player "${playerName}" rejoining lobby with same name`);
                    // Allow rejoin with same name
                } else {
                    // Check if the name is already taken by a different player
                    if (!reservePlayerName(playerName)) {
                        logger.warn(`Name "${playerName}" is already taken`);
                    }
                }

                const player = {
                    id: socket.id,
                    name: playerName,
                    isBot: false,
                    position: 0 as 0 | 1 | 2 | 3, // Will be set when joining a table
                    cards: [],
                    score: 0,
                    isReady: false
                };

                players.set(socket.id, player);
                socket.join(lobbyId);

                const lobby = lobbies.get(lobbyId);
                logger.debug('Lobby found:', lobby);
                if (lobby) {
                    // Convert Map to Array for the lobby tables
                    const tablesArray = lobby.tables ? Array.from(lobby.tables.values()) : [];
                    logger.debug('Sending lobby_joined with tables:', tablesArray);
                    socket.emit('lobby_joined', { lobby: { ...lobby, tables: tablesArray }, player });
                    socket.to(lobbyId).emit('player_joined', { player });
                } else {
                    logger.debug('Lobby not found for ID:', lobbyId);
                }
            } catch (error) {
                handleSocketError(socket, error);
            }
        });

        socket.on('create_table', (data: { tableId: string; lobbyId?: string; tableName: string; timeoutDuration?: number; deckVariant?: '36' | '40'; scoreTarget?: 200 | 300 | 500 | 1000; hasKitty?: boolean }) => {
            try {
                logger.debug('create_table received:', data);
                const { tableId, lobbyId = 'default', tableName, timeoutDuration = 30000, deckVariant = '36', scoreTarget = 200, hasKitty = false } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const lobby = lobbies.get(lobbyId);
                if (!lobby) {
                    logger.debug('Lobby not found:', lobbyId);
                    throw new Error('Lobby not found');
                }

                // Check if table already exists
                if (lobby.tables.has(tableId)) {
                    logger.debug('Table already exists:', tableId);
                    throw new Error('Table already exists');
                }

                logger.debug('Creating new table:', tableId, 'with name:', tableName, 'deckVariant:', deckVariant, 'hasKitty:', hasKitty);
                const table: LobbyTable = {
                    id: tableId,
                    name: tableName || `Table ${tableId}`,
                    players: [],
                    gameState: undefined,
                    maxPlayers: 4,
                    isPrivate: false, // Default to public table
                    creator: player.name,
                    timeoutDuration: timeoutDuration,
                    deckVariant: deckVariant,
                    scoreTarget: scoreTarget,
                    hasKitty: hasKitty
                };

                // Add the creator as the first player
                player.position = 0;
                table.players.push(player);
                logger.debug(`Added creator ${player.name} to new table`);

                lobby.tables.set(tableId, table);
                logger.debug('Table created successfully');

                // Add creator to table socket room
                socket.join(`table-${tableId}`);

                // Notify all lobby members about the new table
                const tablesArray = Array.from(lobby.tables.values());
                io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                // Send table_joined event to redirect creator to waiting room
                socket.emit('table_joined', { table, player });

                // Send confirmation to creator
                socket.emit('table_created', { table, success: true });
            } catch (error) {
                handleSocketError(socket, error);
            }
        });

        socket.on('add_bot', (data: { tableId: string; position: number; skill?: 'easy' | 'medium' | 'hard' | 'acadien' }) => {
            try {
                logger.debug('add_bot received:', data);
                const { tableId, position, skill = 'medium' } = data;

                // Validate skill level
                const validSkills = ['easy', 'medium', 'hard', 'acadien'];
                if (!validSkills.includes(skill)) {
                    throw new Error('Invalid bot skill level');
                }
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const lobby = lobbies.get('default');
                if (!lobby) {
                    logger.debug('Lobby not found');
                    throw new Error('Lobby not found');
                }

                const table = lobby.tables.get(tableId);
                if (!table) {
                    logger.debug('Table not found:', tableId);
                    throw new Error('Table not found');
                }

                // Check if user is the table creator
                if (table.creator !== player.name) {
                    logger.debug('Only table creator can add bots');
                    socket.emit('error', { message: 'Only the table creator can add bots' });
                    throw new Error('Only the table creator can add bots');
                }

                // Check if position is already occupied
                if (table.players.some(p => p.position === position)) {
                    logger.debug('Position already occupied:', position);
                    socket.emit('error', { message: 'Position already occupied' });
                    throw new Error('Position already occupied');
                }

                // Create bot player
                const botId = `bot-${uuidv4()}`;
                const botName = getRandomHumanName();
                const bot: Player = {
                    id: botId,
                    name: botName,
                    isBot: true,
                    botSkill: skill,
                    position: position as 0 | 1 | 2 | 3,
                    cards: [],
                    score: 0,
                    isReady: true
                };

                table.players.push(bot);
                logger.debug(`Added bot ${bot.name} at position ${position}`);

                // Notify all table members about the updated table
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Notify all lobby members about the updated lobby
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                handleSocketError(socket, error);
            }
        });

        socket.on('remove_bot', (data: { tableId: string; botId: string }) => {
            try {
                logger.debug('remove_bot received:', data);
                const { tableId, botId } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const lobby = lobbies.get('default');
                if (!lobby) {
                    logger.debug('Lobby not found');
                    throw new Error('Lobby not found');
                }

                const table = lobby.tables.get(tableId);
                if (!table) {
                    logger.debug('Table not found:', tableId);
                    throw new Error('Table not found');
                }

                // Check if user is the table creator
                if (table.creator !== player.name) {
                    logger.debug('Only table creator can remove bots');
                    throw new Error('Only the table creator can remove bots');
                }

                // Find and remove the bot
                const botIndex = table.players.findIndex(p => p.id === botId && p.isBot);
                if (botIndex === -1) {
                    logger.debug('Bot not found:', botId);
                    throw new Error('Bot not found');
                }

                const removedBot = table.players.splice(botIndex, 1)[0];
                if (!removedBot) {
                    logger.error('Failed to remove bot');
                    return;
                }
                logger.debug(`Removed bot ${removedBot.name} from position ${removedBot.position}`);

                // Notify all table members about the updated table
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Notify all lobby members about the updated lobby
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                handleSocketError(socket, error);
            }
        });

        socket.on('move_player', (data: { tableId: string; newPosition: number }) => {
            try {
                logger.debug('move_player received:', data);
                const { tableId, newPosition } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const lobby = lobbies.get('default');
                if (!lobby) {
                    logger.debug('Lobby not found');
                    throw new Error('Lobby not found');
                }

                const table = lobby.tables.get(tableId);
                if (!table) {
                    logger.debug('Table not found:', tableId);
                    throw new Error('Table not found');
                }

                // Check if the position is valid (0-3)
                if (newPosition < 0 || newPosition >= table.maxPlayers) {
                    logger.debug('Invalid position:', newPosition);
                    throw new Error('Invalid position');
                }

                // Check if the new position is already occupied
                const positionOccupied = table.players.some(p => p.position === newPosition);
                if (positionOccupied) {
                    logger.debug('Position already occupied:', newPosition);
                    throw new Error('Position already occupied');
                }

                // Find the player in the table
                const playerIndex = table.players.findIndex(p => p.id === socket.id);
                if (playerIndex === -1) {
                    logger.debug('Player not found in table');
                    throw new Error('Player not found in table');
                }

                // Update the player's position
                const tablePlayer = table.players[playerIndex];
                if (!tablePlayer) {
                    logger.error('Player not found at index');
                    return;
                }
                const oldPosition = tablePlayer.position;
                tablePlayer.position = newPosition as 0 | 1 | 2 | 3;
                logger.debug(`Moved player ${tablePlayer.name} from position ${oldPosition} to position ${newPosition}`);

                // Notify all table members about the updated table
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Notify all lobby members about the updated lobby
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                handleSocketError(socket, error);
            }
        });

        socket.on('start_game', async (data: { tableId: string }) => {
            try {
                logger.debug('start_game received:', data);
                const { tableId } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const lobby = lobbies.get('default');
                if (!lobby) {
                    logger.debug('Lobby not found');
                    throw new Error('Lobby not found');
                }

                const table = lobby.tables.get(tableId);
                if (!table) {
                    logger.debug('Table not found:', tableId);
                    throw new Error('Table not found');
                }

                // Check if user is the table creator
                if (table.creator !== player.name) {
                    logger.debug('Only table creator can start the game');
                    throw new Error('Only the table creator can start the game');
                }

                // Check if table has exactly 4 players
                if (table.players.length !== 4) {
                    logger.debug('Table must have exactly 4 players to start');
                    throw new Error('Table must have exactly 4 players to start');
                }

                // Check if game is already started
                if (table.gameState) {
                    logger.debug('Game already started');
                    throw new Error('Game already started');
                }

                logger.debug('Starting game manually for table:', tableId);
                const game = createGame(tableId, games, table.timeoutDuration, table.deckVariant || '36', table.scoreTarget || 200);
                table.gameState = startGame(game);
                games.set(game.id, game);

                // Add all players to the game-specific socket room
                table.players.forEach(player => {
                    const playerSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === player.id);
                    if (playerSocket) {
                        playerSocket.join(`game-${game.id}`);
                    }
                });

                // Add all spectators to the game-specific socket room
                if (table.spectators) {
                    table.spectators.forEach(spectator => {
                        const spectatorSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === spectator.id);
                        if (spectatorSocket) {
                            spectatorSocket.join(`game-${game.id}`);
                        }
                    });
                }

                logger.debug('Emitting game_started event');
                io.to(`game-${game.id}`).emit('game_started', { game: table.gameState });

                // Notify lobby members that the table now has an active game
                const tablesArray = Array.from(lobby.tables.values());
                io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                // Start bot turn if first player is a bot
                if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                    logger.debug('First player is a bot, starting bot turn handling');
                    await handleBotTurn(game);
                }
            } catch (error) {
                handleSocketError(socket, error);
            }
        });

        socket.on('leave_table', (data: { tableId: string; lobbyId?: string }) => {
            try {
                logger.debug('leave_table received:', data);
                const { tableId, lobbyId = 'default' } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const lobby = lobbies.get(lobbyId);
                if (!lobby) {
                    logger.debug('Lobby not found:', lobbyId);
                    throw new Error('Lobby not found');
                }

                const table = lobby.tables.get(tableId);
                if (!table) {
                    logger.debug('Table not found:', tableId);
                    throw new Error('Table not found');
                }

                // Remove player from table
                const playerIndex = table.players.findIndex(p => p.id === player.id);
                if (playerIndex !== -1) {
                    logger.debug(`Removing player ${player.name} from table ${tableId}`);
                    table.players.splice(playerIndex, 1);

                    // Don't reset positions - preserve original bot positions
                    // This allows bots to maintain their strategic team positions (NS vs WE)

                    // Remove from socket room
                    socket.leave(`table-${tableId}`);

                    // Notify other players in the table
                    socket.to(`table-${tableId}`).emit('player_left_table', { table, player });

                    // Notify all lobby members about the updated lobby
                    const tablesArray = Array.from(lobby.tables.values());
                    io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                    // Send confirmation to player who left
                    socket.emit('table_left', { success: true });

                    logger.debug(`Player ${player.name} left table ${tableId}. Remaining players: ${table.players.length}`);
                } else {
                    // Check if player is a spectator
                    const spectatorIndex = table.spectators?.findIndex(s => s.id === player.id) ?? -1;
                    if (spectatorIndex !== -1 && table.spectators) {
                        logger.debug(`Removing spectator ${player.name} from table ${tableId}`);
                        table.spectators.splice(spectatorIndex, 1);

                        // Remove from socket rooms
                        socket.leave(`table-${tableId}`);
                        socket.leave(`spectator-${tableId}`);

                        // Notify other players and spectators in the table
                        socket.to(`table-${tableId}`).emit('spectator_left_table', { table, spectator: player });

                        // Notify all lobby members about the updated lobby
                        const tablesArray = Array.from(lobby.tables.values());
                        io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                        // Send confirmation to spectator who left
                        socket.emit('table_left', { success: true });

                        logger.debug(`Spectator ${player.name} left table ${tableId}. Remaining spectators: ${table.spectators ? table.spectators.length : 0}`);
                    } else {
                        logger.debug(`Player ${player.name} not found in table ${tableId} as player or spectator`);
                    }
                }
            } catch (error) {
                logger.error('Error leaving table:', error);
                socket.emit('error', { message: 'Error leaving table' });
            }
        });

        socket.on('join_table', async (data: { tableId: string; lobbyId?: string; tableName?: string; numBots?: number; password?: string }) => {
            try {
                logger.debug('join_table received:', data);
                const { tableId, lobbyId = 'default', tableName, numBots = 0, password } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                // Check if player is already in an active game
                for (const [gameId, game] of games) {
                    if (game.players.some(p => p.id === player.id) && game.phase !== 'finished') {
                        logger.debug(`Player ${player.name} is already in an active game (${gameId}). Cannot join another table.`);
                        throw new Error('You are already in an active game. Please finish your current game before joining another table.');
                    }
                }

                const lobby = lobbies.get(lobbyId);
                if (!lobby) {
                    logger.debug('Lobby not found:', lobbyId);
                    throw new Error('Lobby not found');
                }

                const table = lobby.tables.get(tableId);
                if (!table) {
                    logger.debug('Table not found:', tableId);
                    throw new Error('Table not found');
                }

                // Check if table is private and validate password
                if (table.isPrivate && table.password) {
                    if (!password || password !== table.password) {
                        logger.debug(`Player ${player.name} attempted to join private table ${tableId} with incorrect password`);
                        throw new Error('Incorrect password for private table');
                    }
                }

                if (table.players.length < table.maxPlayers) {
                    // Find the first available position (0, 1, 2, 3) to ensure proper rotation
                    const occupiedPositions = table.players.map(p => p.position);
                    let availablePosition: 0 | 1 | 2 | 3 = 0;
                    while (occupiedPositions.includes(availablePosition) && availablePosition < table.maxPlayers) {
                        availablePosition = (availablePosition + 1) as 0 | 1 | 2 | 3;
                    }
                    player.position = availablePosition as 0 | 1 | 2 | 3;
                    table.players.push(player);
                    socket.join(`table-${tableId}`);

                    socket.emit('table_joined', { table, player });
                    socket.to(`table-${tableId}`).emit('player_joined_table', { table, player });

                    // Notify all lobby members about the updated lobby
                    const tablesArray = Array.from(lobby.tables.values());
                    logger.debug(`Emitting lobby_updated for table ${tableId} with ${table.players.length} players`);
                    io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                    // Only auto-start game if table is completely full (4 players)
                    logger.debug('Checking auto-start conditions:');
                    logger.debug('- Table players length:', table.players.length);
                    logger.debug('- Table ID:', tableId);
                    logger.debug('- Has human player:', table.players.some(p => !p.isBot));
                    logger.debug('- Has bots:', table.players.some(p => p.isBot));

                    if (table.players.length === 4) {
                        logger.debug('Table is full - auto-starting game...');
                        const game = createGame(tableId, games, table.timeoutDuration, table.deckVariant || '36', table.scoreTarget || 200);
                        table.gameState = startGame(game);
                        games.set(game.id, game);

                        // Add all players to the game-specific socket room
                        table.players.forEach(player => {
                            const playerSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === player.id);
                            if (playerSocket) {
                                playerSocket.join(`game-${game.id}`);
                            }
                        });

                        // Add all spectators to the game-specific socket room
                        if (table.spectators) {
                            table.spectators.forEach(spectator => {
                                const spectatorSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === spectator.id);
                                if (spectatorSocket) {
                                    spectatorSocket.join(`game-${game.id}`);
                                }
                            });
                        }

                        logger.debug('Emitting game_started event');
                        io.to(`game-${game.id}`).emit('game_started', { game: table.gameState });

                        // Notify lobby members that the table now has an active game
                        const tablesArray = Array.from(lobby.tables.values());
                        io.to('default').emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                        // Start bot turn if first player is a bot
                        if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                            logger.debug('First player is a bot, starting bot turn handling');
                            await handleBotTurn(game);
                        }
                    } else {
                        logger.debug('Table not full - staying in waiting room.');
                    }
                }
            } catch (error) {
                logger.error('Error joining table:', error);
                socket.emit('error', { message: 'Error joining table' });
            }
        });

        socket.on('join_as_spectator', async (data) => {
            try {
                logger.debug('join_as_spectator received:', data);
                const { tableId, lobbyId = 'default' } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const lobby = lobbies.get(lobbyId);
                if (!lobby) {
                    logger.debug('Lobby not found:', lobbyId);
                    throw new Error('Lobby not found');
                }

                const table = lobby.tables.get(tableId);
                if (!table) {
                    logger.debug('Table not found:', tableId);
                    throw new Error('Table not found');
                }

                // Check if table is private - spectators cannot join private tables
                if (table.isPrivate) {
                    logger.debug(`Player ${player.name} attempted to spectate private table ${tableId}`);
                    throw new Error('Cannot spectate private tables');
                }

                // Check if there's an active game to spectate
                if (!table.gameState) {
                    logger.debug(`Player ${player.name} attempted to spectate table ${tableId} with no active game`);
                    throw new Error('Cannot spectate a table with no active game');
                }

                // Check if player is already in this table as a player
                if (table.players.some(p => p.id === player.id)) {
                    logger.debug(`Player ${player.name} is already in table ${tableId} as a player`);
                    throw new Error('You are already in this table as a player');
                }

                // Check if player is already spectating this table
                if (table.spectators && table.spectators.some(s => s.id === player.id)) {
                    logger.debug(`Player ${player.name} is already spectating table ${tableId}`);
                    throw new Error('You are already spectating this table');
                }

                // Initialize spectators array if it doesn't exist
                if (!table.spectators) {
                    table.spectators = [];
                }

                // Add player as spectator
                const spectator = {
                    ...player,
                    isSpectator: true,
                    position: 0 as 0 | 1 | 2 | 3 // Spectators don't have real positions, use 0 as placeholder
                };

                table.spectators.push(spectator);
                socket.join(`table-${tableId}`);
                socket.join(`spectator-${tableId}`);

                // Send spectator the current game state if the game is in progress
                const game = games.get(table.gameState?.id);
                if (game) {
                    socket.emit('spectator_joined', { table, spectator, game });
                    // Also add spectator to the game room immediately
                    socket.join(`game-${game.id}`);
                } else {
                    socket.emit('spectator_joined', { table, spectator });
                }
                socket.to(`table-${tableId}`).emit('spectator_joined_table', { table, spectator });

                // Notify all lobby members about the updated lobby
                const tablesArray = Array.from(lobby.tables.values());
                io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });

                logger.debug(`Player ${player.name} joined table ${tableId} as spectator`);
            } catch (error) {
                logger.error('Error joining as spectator:', error);
                socket.emit('error', { message: 'Error joining as spectator' });
            }
        });

        socket.on('make_bid', async (data) => {
            try {
                const { gameId, points, suit } = data;
                const game = games.get(gameId);
                if (!game) throw new Error('Game not found');

                // Ensure playersWhoHavePassed is always a Set
                ensurePlayersWhoHavePassedIsSet(game);

                const player = game.players.find(p => p.id === socket.id);
                if (!player || player.id !== game.currentPlayer) throw new Error('Player not found or not current player');

                // Check if player has already passed during this bidding round
                if (game.playersWhoHavePassed && game.playersWhoHavePassed.has(socket.id) && points > 0) {
                    throw new Error('Player has already passed and cannot make a bid');
                }

                if (points === 0) {
                    // Player passed - they cannot bid again until new round
                    game.playersWhoHavePassed?.add(socket.id);
                    game.biddingPasses = (game.biddingPasses || 0) + 1;
                    logger.debug(`Player ${player.name} passed. Total passes: ${game.biddingPasses}`);
                } else {
                    // Player made a bid - remove them from passed list if they were there
                    game.playersWhoHavePassed?.delete(socket.id);
                    game.currentBid = { playerId: socket.id, points, suit };
                    game.biddingPasses = 0; // Reset pass counter when someone bids
                    logger.debug(`Player ${player.name} bid ${points} points with ${suit} as trump`);
                }

                // Reset timeout for current player since they just made a move
                if (game.playerTurnStartTime) {
                    game.playerTurnStartTime[socket.id] = Date.now();
                }

                // Move to next player
                const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
                game.currentPlayer = nextPlayer;
                if (game.playerTurnStartTime) {
                    game.playerTurnStartTime[nextPlayer] = Date.now();
                }

                emitGameEvent(game, 'bid_made', { game });

                // Check if bidding should end
                await checkBiddingCompletion(game);

                // Handle bot players if bidding continues
                if (game.phase === 'bidding' && game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                    await handleBotTurn(game);
                } else if (game.phase === 'bidding' && game.players.find(p => p.id === game.currentPlayer)?.isBot && game.playersWhoHavePassed?.has(game.currentPlayer)) {
                    // Bot has already passed, move to next player
                    const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
                    game.currentPlayer = nextPlayer;
                    if (game.playerTurnStartTime) {
                        game.playerTurnStartTime[nextPlayer] = Date.now();
                    }

                    // Check if bidding should end if we've gone through all players
                    const nonPassedPlayers = game.players.filter(p => !game.playersWhoHavePassed?.has(p.id));
                    if (nonPassedPlayers.length === 1 && game.currentBid) {
                        // Only the bidder remains - bidding ends
                        logger.debug(`Only bidder remains - bidding ends with ${game.currentBid.points} points`);

                        // Check if we need to go to kitty phase
                        logger.debug(`Kitty phase check: hasKitty=${game.hasKitty}, kittyPhaseCompleted=${game.kittyPhaseCompleted}, kitty exists=${!!game.kitty}, kitty length=${game.kitty?.length || 0}, deckVariant=${game.deckVariant}, round=${game.round}`);
                        debugKittyState(game, 'Before kitty phase decision');
                        validateKittyState(game, 'Before kitty phase decision');
                        // Enhanced kitty phase logic with safeguards
                        const shouldTriggerKitty = game.hasKitty &&
                            game.deckVariant === '40' &&
                            game.kitty &&
                            game.kitty.length > 0 &&
                            !game.kittyPhaseCompleted;

                        if (shouldTriggerKitty) {
                            if (!game.currentBid) {
                                logger.error('Current bid is undefined');
                                return;
                            }
                            logger.debug(`✅ KITTY PHASE TRIGGERED: Bid winner ${game.currentBid.playerId} enters kitty phase for round ${game.round}`);
                            debugKittyState(game, 'Kitty phase triggered');
                            game.phase = 'kitty';
                            game.currentPlayer = game.currentBid.playerId;
                        } else {
                            logger.debug(`❌ SKIPPING KITTY PHASE - hasKitty: ${game.hasKitty}, kittyPhaseCompleted: ${game.kittyPhaseCompleted}, kitty exists: ${!!game.kitty}, kitty length: ${game.kitty?.length || 0}, deckVariant: ${game.deckVariant}`);
                            debugKittyState(game, 'Kitty phase skipped');

                            // Additional validation: if kitty should exist but doesn't, log warning
                            if (game.hasKitty && game.deckVariant === '40' && (!game.kitty || game.kitty.length === 0)) {
                                logger.debug(`⚠️  WARNING: Kitty should exist but is missing or empty! Round: ${game.round}`);
                                validateKittyState(game, 'Kitty missing when it should exist');
                            }
                            game.phase = 'playing';
                            if (!game.currentBid) {
                                logger.error('Current bid is undefined');
                                return;
                            }
                            game.trumpSuit = game.currentBid.suit;
                            const contractor = game.players.find(p => p.id === game.currentBid?.playerId);
                            if (!contractor) {
                                logger.error('Contractor not found');
                                return;
                            }
                            game.contractorTeam = contractor.position % 2 === 0 ? 'team1' : 'team2';
                            game.currentPlayer = game.currentBid.playerId;
                            logger.debug(`Bid winner ${game.currentBid.playerId} will lead the first trick`);
                        }

                        logger.debug(`Emitting game_updated - phase: ${game.phase}, currentPlayer: ${game.currentPlayer}, kitty length: ${game.kitty?.length || 0}`);
                        emitGameEvent(game, 'game_updated', { game });

                        // Start the first bot turn if current player is a bot (handles both kitty and playing phases)
                        const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
                        if (currentPlayer?.isBot) {
                            logger.debug(`Starting first bot turn in ${game.phase} phase`);
                            await handleBotTurn(game);
                        }
                    }
                }
            } catch (error) {
                logger.error('Error making bid:', error);
                socket.emit('error', { message: 'Error making bid' });
            }
        });

        socket.on('take_kitty', async (data) => {
            try {
                logger.debug('take_kitty received:', data);
                const { gameId } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const game = games.get(gameId);
                if (!game) {
                    logger.debug('Game not found:', gameId);
                    throw new Error('Game not found');
                }

                if (!game.hasKitty) {
                    throw new Error('Kitty is not enabled for this game');
                }

                // Check if it's the kitty phase and this player is the bid winner
                if (game.phase !== 'kitty') {
                    throw new Error('Not in kitty phase');
                }

                if (game.currentPlayer !== player.id) {
                    throw new Error('Not your turn to take kitty');
                }

                if (!game.kitty || game.kitty.length === 0) {
                    throw new Error('No kitty available');
                }

                // Add kitty cards to player's hand
                const bidWinner = game.players.find(p => p.id === player.id);
                if (bidWinner) {
                    bidWinner.cards.push(...game.kitty);
                    game.kitty = [];
                    logger.debug(`Player ${player.name} took kitty, now has ${bidWinner.cards.length} cards`);

                    // Emit game update
                    emitGameEvent(game, 'game_updated', { game });
                }
            } catch (error) {
                logger.error('Error taking kitty:', error);
                socket.emit('error', { message: 'Error taking kitty' });
            }
        });

        socket.on('discard_to_kitty', async (data) => {
            try {
                logger.debug('discard_to_kitty received:', data);
                const { gameId, discardedCards, trumpSuit } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const game = games.get(gameId);
                if (!game) {
                    logger.debug('Game not found:', gameId);
                    throw new Error('Game not found');
                }

                if (!game.hasKitty) {
                    throw new Error('Kitty is not enabled for this game');
                }

                // Check if it's the kitty phase and this player is the bid winner
                if (game.phase !== 'kitty') {
                    throw new Error('Not in kitty phase');
                }

                if (game.currentPlayer !== player.id) {
                    throw new Error('Not your turn to discard');
                }

                if (!discardedCards || discardedCards.length !== 4) {
                    throw new Error('Must discard exactly 4 cards');
                }

                // Find the bid winner
                const bidWinner = game.players.find(p => p.id === player.id);
                if (!bidWinner) {
                    throw new Error('Player not found in game');
                }

                // Validate that all discarded cards are in the player's hand
                const discardedCardIds = discardedCards.map((card: Card) => card.id);
                const playerCardIds = bidWinner.cards.map((card: Card) => card.id);
                const allCardsValid = discardedCardIds.every((id: string) => playerCardIds.includes(id));

                if (!allCardsValid) {
                    throw new Error('Invalid cards selected for discard');
                }

                // Remove discarded cards from player's hand and add to kitty discards
                bidWinner.cards = bidWinner.cards.filter(card => !discardedCardIds.includes(card.id));
                game.kittyDiscards = discardedCards;
                logger.debug(`Player ${player.name} discarded 4 cards to kitty`);

                // Move to playing phase and set trump
                game.phase = 'playing';
                if (!game.currentBid) {
                    logger.error('Current bid is undefined');
                    return;
                }
                game.trumpSuit = trumpSuit || game.currentBid.suit;
                game.contractorTeam = bidWinner.position % 2 === 0 ? 'team1' : 'team2';
                game.kittyPhaseCompleted = true; // Mark kitty phase as completed for this round
                logger.debug(`Trump suit set to ${game.trumpSuit}, contractor team: ${game.contractorTeam}`);
                debugKittyState(game, 'Kitty phase completed by human player');

                // Emit game update
                emitGameEvent(game, 'game_updated', { game });

                // Start the first bot turn in playing phase if current player is a bot
                const currentPlayer = game.players.find(p => p.id === game.currentPlayer);
                if (currentPlayer?.isBot) {
                    logger.debug('Starting first bot turn in playing phase');
                    await handleBotTurn(game);
                }
            } catch (error) {
                logger.error('Error discarding to kitty:', error);
                socket.emit('error', { message: 'Error discarding to kitty' });
            }
        });

        socket.on('play_card', async (data) => {
            try {
                const { gameId, card } = data;
                const game = games.get(gameId);
                if (!game) throw new Error('Game not found');

                const player = game.players.find(p => p.id === socket.id);
                if (!player || player.id !== game.currentPlayer) throw new Error('Player not found or not current player');

                // Check if player has any cards left
                if (player.cards.length === 0) {
                    logger.debug(`Player ${player.name} has no cards left, cannot play`);
                    throw new Error('Player has no cards left');
                }

                // Remove card from player's hand
                logger.debug(`Human player cards before: ${player.cards.length}, after: ${player.cards.length - 1}`);
                player.cards = player.cards.filter(c => c.id !== card.id);

                // Add card to current trick
                game.currentTrick.cards.push({ card, playerId: socket.id });
                logger.debug(`Trick now has ${game.currentTrick.cards.length} cards`);

                // Reset timeout for current player since they just played a card
                if (game.playerTurnStartTime) {
                    game.playerTurnStartTime[socket.id] = Date.now();
                }

                // Move to next player
                const nextPlayer = getNextPlayerByPosition(game.currentPlayer, game.players);
                game.currentPlayer = nextPlayer;
                if (game.playerTurnStartTime) {
                    game.playerTurnStartTime[nextPlayer] = Date.now();
                }

                emitGameEvent(game, 'card_played', { game, card, playerId: socket.id });

                // Check if trick is complete
                if (game.currentTrick.cards.length === 4) {
                    // Calculate trick winner and points
                    const trickPoints = game.currentTrick.cards.reduce((total, { card }) =>
                        total + getCardValue(card), 0);
                    game.currentTrick.points = trickPoints;

                    // Proper trick winner logic (highest trump, then highest lead suit)
                    const firstCard = game.currentTrick.cards[0];
                    if (!firstCard) {
                        logger.error('No cards in current trick, skipping winner determination');
                        return;
                    }
                    const leadSuit = firstCard.card.suit;
                    let winner = firstCard;

                    for (const { card, playerId } of game.currentTrick.cards) {
                        if (card.suit === game.trumpSuit && winner.card.suit !== game.trumpSuit) {
                            // Trump beats non-trump
                            winner = { card, playerId };
                        } else if (card.suit === game.trumpSuit && winner.card.suit === game.trumpSuit) {
                            // Compare trump cards by rank
                            if (getCardRank(card.rank) > getCardRank(winner.card.rank)) {
                                winner = { card, playerId };
                            }
                        } else if (card.suit === leadSuit && winner.card.suit === leadSuit) {
                            // Compare lead suit cards by rank
                            if (getCardRank(card.rank) > getCardRank(winner.card.rank)) {
                                winner = { card, playerId };
                            }
                        }
                    }

                    game.currentTrick.winner = winner.playerId;
                    game.lastTrick = { ...game.currentTrick };

                    // Update round scores (not total team scores)
                    const winnerPlayer = game.players.find(p => p.id === winner.playerId);
                    if (!winnerPlayer) {
                        logger.error('Winner player not found');
                        return;
                    }
                    const winnerTeam = winnerPlayer.position % 2 === 0 ? 'team1' : 'team2';
                    game.roundScores[winnerTeam] += trickPoints;

                    // Log trick details for debugging
                    logger.debug(`Trick completed! Winner: ${winnerPlayer.name} (${winner.playerId}), Card: ${winner.card.rank} of ${winner.card.suit}, Points: ${trickPoints}, Trump: ${game.trumpSuit}, Lead: ${leadSuit}`);

                    // Debug: Print all players' cards after trick completion
                    debugPrintAllPlayerCards(game, `After Trick Won by ${winnerPlayer?.name}`);

                    // Add delay to let players see the final card before completing trick
                    // Variable pause to show final card (1.5-2.5 seconds)
                    const finalCardDelay = 2000; // 2 seconds
                    logger.debug(`Pausing ${Math.round(finalCardDelay)}ms to show final card...`);
                    await new Promise(resolve => setTimeout(resolve, finalCardDelay));

                    // Emit trick completed event with the completed trick
                    emitGameEvent(game, 'trick_completed', { game });
                    // Clear the trick immediately
                    // Check if all players have run out of cards (end of round)
                    const allCardsPlayed = game.players.every(p => p.cards.length === 0);
                    if (allCardsPlayed) {
                        logger.debug('All cards have been played! Round complete.');

                        // Debug: Print final card state (should all be 0 cards)
                        debugPrintAllPlayerCards(game, 'Round Complete - All Cards Played');

                        // Calculate round scores using proper scoring system
                        if (game.contractorTeam && game.currentBid) {
                            const contractorCardPoints = game.roundScores[game.contractorTeam];
                            const opposingTeam = game.contractorTeam === 'team1' ? 'team2' : 'team1';
                            const opposingCardPoints = game.roundScores[opposingTeam];

                            // Use proper scoring calculation including kitty discard points
                            const scoringResult = calculateRoundScores(game, game.contractorTeam, contractorCardPoints, opposingCardPoints, game.opposingTeamBid || 0);

                            // Update team scores with proper calculation
                            game.teamScores.team1 = scoringResult.team1Score;
                            game.teamScores.team2 = scoringResult.team2Score;

                            // Calculate kitty discard points for logging
                            let kittyDiscardPoints = 0;
                            if (game.hasKitty && game.kittyDiscards && game.kittyDiscards.length > 0) {
                                kittyDiscardPoints = game.kittyDiscards.reduce((total, card) => total + getCardValue(card), 0);
                            }

                            logger.debug(`Round scoring: Contractor (${game.contractorTeam}) ${contractorCardPoints} points, Opposing (${opposingTeam}) ${opposingCardPoints} points`);
                            if (kittyDiscardPoints > 0) {
                                logger.debug(`Kitty discards: ${kittyDiscardPoints} points awarded to defending team (${opposingTeam})`);
                            }
                            logger.debug(`New scores: Team1 ${game.teamScores.team1}, Team2 ${game.teamScores.team2}`);
                        }

                        // Check for game end before starting a new round
                        if (isGameEnded(game)) {
                            game.phase = 'finished';

                            // Determine winning team and create detailed game end info
                            const winningTeamInfo = getWinningTeam(game);
                            if (!winningTeamInfo) {
                                logger.error('Failed to determine winning team');
                                return;
                            }
                            const winningTeam = winningTeamInfo.team;
                            const winningTeamName = winningTeamInfo.name;

                            const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                            const gameEndInfo = {
                                game,
                                winningTeam,
                                winningTeamName,
                                winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                                finalScores: game.teamScores
                            };

                            logger.debug(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                            emitGameEvent(game, 'game_ended', gameEndInfo);

                            // Clean up game room and reset table state after game completion
                            cleanupGameRoom(game);
                            if (!process.env.INTEGRATION_TEST) {
                                setTimeout(() => {
                                    resetTableAfterGameCompletion(game.tableId);
                                }, 3000); // Give players 3 seconds to see the game end message
                            } else {
                                resetTableAfterGameCompletion(game.tableId);
                            }

                            return;
                        }

                        // Start a new round
                        game.round++;
                        game.deck = createDeck(game.deckVariant || '36');
                        logger.debug(`Starting new round ${game.round} - hasKitty: ${game.hasKitty}, deckVariant: ${game.deckVariant}`);
                        debugKittyState(game, 'Before new round setup');

                        // Clear existing cards and deal new ones
                        game.players.forEach(player => {
                            player.cards = [];
                        });

                        // Deal cards to players - handle kitty if enabled
                        if (game.hasKitty && game.deckVariant === '40') {
                            // Kitty dealing: 3-2-3-2-3 pattern
                            // Each player gets 3 cards, then 2 to kitty, then 3 more, then 2 more to kitty, then 3 more
                            game.kitty = [];
                            let cardIndex = 0;

                            // First packet: 3 cards to each player
                            for (let i = 0; i < 3; i++) {
                                game.players.forEach(player => {
                                    if (game.deck && cardIndex < game.deck.length) {
                                        const card = game.deck[cardIndex++];
                                        if (card) player.cards.push(card);
                                    }
                                });
                            }

                            // First kitty: 2 cards
                            for (let i = 0; i < 2; i++) {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) game.kitty.push(card);
                                }
                            }

                            // Second packet: 3 more cards to each player
                            for (let i = 0; i < 3; i++) {
                                game.players.forEach(player => {
                                    if (game.deck && cardIndex < game.deck.length) {
                                        const card = game.deck[cardIndex++];
                                        if (card) player.cards.push(card);
                                    }
                                });
                            }

                            // Second kitty: 2 more cards
                            for (let i = 0; i < 2; i++) {
                                if (game.deck && cardIndex < game.deck.length) {
                                    const card = game.deck[cardIndex++];
                                    if (card) game.kitty.push(card);
                                }
                            }

                            // Final packet: 3 more cards to each player
                            for (let i = 0; i < 3; i++) {
                                game.players.forEach(player => {
                                    if (game.deck && cardIndex < game.deck.length) {
                                        const card = game.deck[cardIndex++];
                                        if (card) player.cards.push(card);
                                    }
                                });
                            }

                            logger.debug(`Kitty recreated with ${game.kitty.length} cards for round ${game.round}`);
                            debugKittyState(game, 'After kitty recreation');
                        } else {
                            // Standard dealing: 9 cards for both 36-card and 40-card decks (kitty handled separately)
                            if (!game.deck) {
                                logger.error('Game deck is undefined');
                                return;
                            }
                            const cardsPerPlayer = 9; // Always 9 cards per player, kitty logic is handled elsewhere
                            logger.debug(`🔍 DEBUG: Deck size: ${game.deck.length}, Players: ${game.players.length}, Cards per player: ${cardsPerPlayer}`);
                            let cardIndex = 0;
                            for (let i = 0; i < cardsPerPlayer; i++) {
                                game.players.forEach(player => {
                                    if (game.deck && cardIndex < game.deck.length) {
                                        const card = game.deck[cardIndex++];
                                        if (card) player.cards.push(card);
                                    } else {
                                        logger.debug(`⚠️  WARNING: Not enough cards in deck! Player ${player.name} only got ${player.cards.length} cards`);
                                    }
                                });
                            }
                            logger.debug(`🔍 DEBUG: After dealing - Player card counts:`, game.players.map(p => `${p.name}: ${p.cards.length}`));
                        }

                        // Reset for new round - clear all bid-related state
                        game.phase = 'bidding';
                        game.currentBid = undefined;
                        game.trumpSuit = undefined;
                        game.currentTrick = { cards: [], winner: undefined, points: 0 };
                        game.lastTrick = undefined; // Clear last trick for new round
                        game.kittyDiscards = undefined; // Clear kitty discards for new round
                        game.kittyPhaseCompleted = false; // Reset kitty phase completion for new round
                        game.currentPlayer = getNextPlayerByPosition(game.dealer, game.players);
                        game.dealer = game.currentPlayer;
                        game.playerTurnStartTime = { [game.currentPlayer]: Date.now() };
                        game.contractorTeam = undefined; // Reset contractor team
                        game.opposingTeamBid = 0; // Reset opposing team bid flag
                        game.roundScores = { team1: 0, team2: 0 }; // Reset round scores
                        game.biddingPasses = 0; // Reset bidding passes
                        if (game.playersWhoHavePassed) {
                            if (game.playersWhoHavePassed) {
                                game.playersWhoHavePassed.clear();
                            } // Reset the set for new round
                        }

                        logger.debug('Round reset complete - all bid parameters cleared for new round');
                        debugKittyState(game, 'After round reset');
                        validateKittyState(game, 'After round reset');

                        emitGameEvent(game, 'round_completed', { game });

                        // Pause for 3 seconds to let players see the round results in the notepad
                        // jcl
                        //console.log('Pausing for 3 seconds to let players review round results...');
                        //await new Promise(resolve => setTimeout(resolve, 3000));

                        // Start bot turn handling for new bidding phase if current player is a bot
                        if (game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                            logger.debug('Starting bot turn for new round bidding phase');
                            await handleBotTurn(game);
                        }
                        return;
                    }

                    // Start new trick - clear the trick area
                    game.currentTrick = { cards: [], winner: undefined, points: 0 };
                    game.currentPlayer = winner.playerId;
                    const nextPlayer = game.players.find(p => p.id === winner.playerId);
                    logger.debug('Trick area cleared, starting new trick. Next player:', nextPlayer ? { name: nextPlayer.name, isBot: nextPlayer.isBot } : 'NOT FOUND');

                    // Emit game update to show cleared trick area
                    emitGameEvent(game, 'game_updated', { game });

                    // Handle next bot player if applicable
                    if (nextPlayer?.isBot) {
                        logger.debug('Next player is a bot, starting bot turn');
                        await handleBotTurn(game);
                    }

                    // Check for game end
                    if (isGameEnded(game)) {
                        game.phase = 'finished';

                        // Determine winning team and create detailed game end info
                        const winningTeamInfo = getWinningTeam(game);
                        if (!winningTeamInfo) {
                            logger.error('Failed to determine winning team');
                            return;
                        }
                        const winningTeam = winningTeamInfo.team;
                        const winningTeamName = winningTeamInfo.name;

                        const winningPlayers = game.players.filter(p => (p.position % 2 === 0) === (winningTeam === 'team1'));

                        const gameEndInfo = {
                            game,
                            winningTeam,
                            winningTeamName,
                            winningPlayers: winningPlayers.map(p => ({ name: p.name, isBot: p.isBot })),
                            finalScores: game.teamScores
                        };

                        logger.info(`Game ended! ${winningTeamName} wins with ${game.teamScores[winningTeam]} points`);
                        io.to(`table-${game.tableId}`).emit('game_ended', gameEndInfo);

                        // Reset table state after game completion
                        if (!process.env.INTEGRATION_TEST) {
                            setTimeout(() => {
                                resetTableAfterGameCompletion(game.tableId);
                            }, 3000); // Give players 3 seconds to see the game end message
                        } else {
                            resetTableAfterGameCompletion(game.tableId);
                        }
                    }
                }

                // Handle bot players - but only if we're not in the middle of a trick completion
                if (game.currentTrick.cards.length < 4 && game.players.find(p => p.id === game.currentPlayer)?.isBot) {
                    await handleBotTurn(game);
                }
            } catch (error) {
                logger.error('Error playing card:', error);
                socket.emit('error', { message: 'Error playing card' });
            }
        });

        socket.on('send_chat', (data) => {
            try {
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
            } catch (error) {
                logger.error('Error sending chat message:', error);
                socket.emit('error', { message: 'Error sending chat message' });
            }
        });

        socket.on('update_table_timeout', (data) => {
            try {
                const { tableId, timeoutDuration } = data;
                const player = players.get(socket.id);
                if (!player) throw new Error('Player not found for socket');

                const lobby = lobbies.get('default');
                if (!lobby) throw new Error('Lobby not found');
                const table = lobby.tables.get(tableId);
                if (!table) throw new Error('Table not found');

                // Check if player is the table creator
                if (table.creator !== player.name) {
                    throw new Error('Only the table creator can update timeout settings');
                }

                // Update timeout duration
                table.timeoutDuration = timeoutDuration;
                logger.debug(`Table ${tableId} timeout updated to ${timeoutDuration}ms by ${player.name}`);

                // Notify all players in the table about the update
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Also update lobby for players not in the table
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                logger.error('Error updating table timeout:', error);
                socket.emit('error', { message: 'Error updating table timeout' });
            }
        });

        socket.on('update_table_deck_variant', (data) => {
            try {
                const { tableId, deckVariant } = data;
                const player = players.get(socket.id);
                if (!player) throw new Error('Player not found for socket');

                const lobby = lobbies.get('default');
                if (!lobby) throw new Error('Lobby not found');
                const table = lobby.tables.get(tableId);
                if (!table) throw new Error('Table not found');

                // Check if player is the table creator
                if (table.creator !== player.name) {
                    throw new Error('Only the table creator can update deck variant settings');
                }

                // Check if game has already started
                if (table.gameState) {
                    throw new Error('Cannot change deck variant after game has started');
                }

                // Update deck variant
                table.deckVariant = deckVariant;
                logger.debug(`Table ${tableId} deck variant updated to ${deckVariant} by ${player.name}`);

                // Notify all players in the table about the update
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Also update lobby for players not in the table
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                logger.error('Error updating table deck variant:', error);
                socket.emit('error', { message: 'Error updating table deck variant' });
            }
        });

        socket.on('update_table_score_target', (data) => {
            try {
                const { tableId, scoreTarget } = data;
                const player = players.get(socket.id);
                if (!player) throw new Error('Player not found for socket');

                const lobby = lobbies.get('default');
                if (!lobby) throw new Error('Lobby not found');
                const table = lobby.tables.get(tableId);
                if (!table) throw new Error('Table not found');

                // Check if player is the table creator
                if (table.creator !== player.name) {
                    throw new Error('Only the table creator can update score target settings');
                }

                // Check if game has already started
                if (table.gameState) {
                    throw new Error('Cannot change score target after game has started');
                }

                // Update score target
                table.scoreTarget = scoreTarget;
                logger.debug(`Table ${tableId} score target updated to ${scoreTarget} by ${player.name}`);

                // Notify all players in the table about the update
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Also update lobby for players not in the table
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                logger.error('Error updating table score target:', error);
                socket.emit('error', { message: 'Error updating table score target' });
            }
        });

        socket.on('update_table_kitty', (data) => {
            try {
                const { tableId, hasKitty } = data;
                const player = players.get(socket.id);
                if (!player) throw new Error('Player not found for socket');

                const lobby = lobbies.get('default');
                if (!lobby) throw new Error('Lobby not found');
                const table = lobby.tables.get(tableId);
                if (!table) throw new Error('Table not found');

                // Check if player is the table creator
                if (table.creator !== player.name) {
                    throw new Error('Only the table creator can update kitty settings');
                }

                // Check if game has already started
                if (table.gameState) {
                    throw new Error('Cannot change kitty settings after game has started');
                }

                // Check if kitty is only available with 40-card deck
                if (hasKitty && table.deckVariant !== '40') {
                    throw new Error('Kitty is only available with 40-card deck');
                }

                // Update kitty setting
                table.hasKitty = hasKitty;
                logger.debug(`Table ${tableId} kitty setting updated to ${hasKitty} by ${player.name}`);

                // Notify all players in the table about the update
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Also update lobby for players not in the table
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                logger.error('Error updating table kitty:', error);
                socket.emit('error', { message: 'Error updating table kitty' });
            }
        });

        socket.on('update_table_privacy', (data) => {
            try {
                const { tableId, isPrivate, password } = data;
                const player = players.get(socket.id);
                if (!player) throw new Error('Player not found for socket');

                const lobby = lobbies.get('default');
                if (!lobby) throw new Error('Lobby not found');
                const table = lobby.tables.get(tableId);
                if (!table) throw new Error('Table not found');

                // Check if player is the table creator
                if (table.creator !== player.name) {
                    throw new Error('Only the table creator can update privacy settings');
                }

                // Check if game has already started
                if (table.gameState) {
                    throw new Error('Cannot change privacy settings after game has started');
                }

                // Update privacy settings
                table.isPrivate = isPrivate;
                table.password = isPrivate ? password : undefined;
                logger.debug(`Table ${tableId} privacy setting updated to ${isPrivate} by ${player.name}`);

                // Notify all players in the table about the update
                io.to(`table-${tableId}`).emit('table_updated', { table });

                // Also update lobby for players not in the table
                notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
            } catch (error) {
                logger.error('Error updating table privacy:', error);
                socket.emit('error', { message: 'Error updating table privacy' });
            }
        });

        socket.on('delete_table', (data) => {
            try {
                const { tableId, lobbyId = 'default' } = data;
                const player = players.get(socket.id);
                if (!player) throw new Error('Player not found for socket');

                const lobby = lobbies.get(lobbyId);
                if (!lobby) throw new Error('Lobby not found');

                const table = lobby.tables.get(tableId);
                if (!table) throw new Error('Table not found');

                // Only allow the creator to delete the table
                if (table.creator !== player.name) {
                    throw new Error('Only the table creator can delete this table');
                }

                // Don't allow deleting tables with active games
                if (table.gameState) {
                    throw new Error('Cannot delete table with an active game');
                }

                // Remove all players from the table's socket room
                io.to(`table-${tableId}`).emit('table_deleted', { tableId });

                // Remove the table
                lobby.tables.delete(tableId);
                logger.debug(`Table ${tableId} deleted by ${player.name}`);

                // Notify all lobby members about the updated lobby
                const tablesArray = Array.from(lobby.tables.values());
                io.to(lobbyId).emit('lobby_updated', { lobby: { ...lobby, tables: tablesArray } });
            } catch (error) {
                logger.error('Error deleting table:', error);
                socket.emit('error', { message: 'Error deleting table' });
            }
        });

        socket.on('exit_game', (data) => {
            try {
                logger.debug('exit_game received:', data);
                const { gameId, playerName } = data;
                const player = players.get(socket.id);
                if (!player) {
                    logger.debug('Player not found for socket:', socket.id);
                    throw new Error('Player not found for socket');
                }

                const game = games.get(gameId);
                if (!game) {
                    logger.warn('Game not found on [exit_game]:', gameId);
                    return;
                    // throw new Error('Game not found');
                }

                // Verify the player is in this game
                const gamePlayer = game.players.find(p => p.id === player.id);
                if (!gamePlayer) {
                    logger.debug('Player not in game:', player.name);
                    throw new Error('You are not in this game');
                }

                logger.debug(`Player ${player.name} is exiting game ${gameId}`);

                // Reset all player timeouts before cleanup
                resetPlayerTimeouts(game);

                // End the game for all players
                game.phase = 'finished';
                cleanupGameRoom(game);

                // Get the lobby and table
                const lobby = lobbies.get('default');
                const table = lobby?.tables.get(game.tableId);

                // Remove the game from memory
                games.delete(gameId);

                if (lobby && table) {
                    // Remove all spectators and notify them
                    if (table.spectators && table.spectators.length > 0) {
                        logger.info(`Removing ${table.spectators.length} spectators from table ${game.tableId} due to player exit`);

                        table.spectators.forEach(spectator => {
                            // Notify spectator that the game ended due to player exit
                            const spectatorSocket = Array.from(io.sockets.sockets.values()).find(s => s.id === spectator.id);
                            if (spectatorSocket) {
                                spectatorSocket.leave(`table-${game.tableId}`);
                                spectatorSocket.leave(`spectator-${game.tableId}`);
                                spectatorSocket.emit('game_ended_for_spectator', {
                                    message: `${playerName} has exited the game. Returning to lobby.`,
                                    reason: 'Player exited'
                                });

                                // Return spectator to lobby
                                spectatorSocket.emit('lobby_joined', {
                                    lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                                    player: spectator
                                });
                            }
                        });

                        // Clear spectators array
                        table.spectators = [];
                    }

                    // Keep only AI players on the table, remove human players
                    const botPlayers = game.players.filter(player => player.isBot);
                    table.players = botPlayers;
                    table.gameState = undefined;

                    // Notify all table members about the updated table
                    io.to(`table-${game.tableId}`).emit('table_updated', { table });

                    // Force all human players back to lobby with exit message
                    const humanPlayers = game.players.filter(p => !p.isBot);
                    humanPlayers.forEach(humanPlayer => {
                        // For human players, emit to their socket
                        io.to(humanPlayer.id).emit('player_exited_game', {
                            message: `${playerName} has exited the game. Returning to lobby.`,
                            exitedPlayerName: playerName
                        });
                        io.to(humanPlayer.id).emit('lobby_joined', {
                            lobby: { ...lobby, tables: Array.from(lobby.tables.values()) },
                            player: humanPlayer
                        });
                    });

                    // Update lobby for all players
                    notifyLobbyMembers('default', 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
                }

                logger.debug(`Game ${gameId} ended due to player exit by ${player.name}`);
            } catch (error) {
                handleSocketError(socket, error);
            }
        });

        socket.on('disconnect', () => {
            try {
                logger.debug('Player disconnected:', socket.id);
                const player = players.get(socket.id);
                if (player && player.name) {
                    releasePlayerName(player.name);
                    logger.debug(`Released name "${player.name}"`);

                    // Remove player from any tables and games
                    const affectedLobbies = new Set<string>();
                    for (const [lobbyId, lobby] of lobbies) {
                        for (const [tableId, table] of lobby.tables) {
                            const playerIndex = table.players.findIndex(p => p.id === player.id);
                            if (playerIndex !== -1) {
                                logger.debug(`Removing disconnected player ${player.name} from table ${tableId}`);
                                table.players.splice(playerIndex, 1);
                                affectedLobbies.add(lobbyId);

                                // Notify table members about the change
                                socket.to(`table-${tableId}`).emit('player_left_table', { table, player });
                            }

                            // Also check if player was a spectator
                            if (table.spectators) {
                                const spectatorIndex = table.spectators.findIndex(s => s.id === player.id);
                                if (spectatorIndex !== -1) {
                                    logger.debug(`Removing disconnected spectator ${player.name} from table ${tableId}`);
                                    table.spectators.splice(spectatorIndex, 1);
                                    affectedLobbies.add(lobbyId);

                                    // Notify table members about spectator leaving
                                    socket.to(`table-${tableId}`).emit('spectator_left_table', { table, spectator: player });
                                }
                            }
                        }
                    }

                    // Only notify affected lobbies once
                    affectedLobbies.forEach((lobbyId: string) => {
                        const lobby = lobbies.get(lobbyId);
                        if (lobby) {
                            notifyLobbyMembers(lobbyId, 'lobby_updated', { lobby: { ...lobby, tables: Array.from(lobby.tables.values()) } });
                        }
                    });
                }

                // Remove player from any active games
                if (player) {
                    for (const [gameId, game] of games) {
                        const playerIndex = game.players.findIndex(p => p.id === player.id);
                        if (playerIndex !== -1) {
                            logger.debug(`Removing disconnected player ${player.name} from game ${gameId}`);
                            game.players.splice(playerIndex, 1);

                            // If game becomes invalid (less than 4 players), end it
                            if (game.players.length < 4 && game.phase !== 'finished') {
                                logger.debug(`Game ${gameId} has insufficient players (${game.players.length}), ending game`);

                                // Reset all player timeouts before cleanup
                                if (game.playerTurnStartTime) {
                                    logger.debug(`Resetting player timeouts for game ${gameId} due to player disconnect`);
                                    game.playerTurnStartTime = {};
                                }

                                game.phase = 'finished';
                                cleanupGameRoom(game);

                                // Notify remaining players that the game ended due to player disconnect
                                emitGameEvent(game, 'game_ended', {
                                    game,
                                    reason: 'Player disconnected',
                                    disconnectedPlayer: player.name
                                });

                                // Reset table state after game ends due to disconnect
                                if (!process.env.INTEGRATION_TEST) {
                                    setTimeout(() => {
                                        resetTableAfterGameCompletion(game.tableId);
                                    }, 3000); // Give players 3 seconds to see the game end message
                                } else {
                                    resetTableAfterGameCompletion(game.tableId);
                                }
                            }
                        }
                    }
                }

                players.delete(socket.id);
            } catch (error) {
                handleSocketError(socket, error);
            }
        });
    });
}

function handleSocketError(socket: Socket, error: any): void {
    logger.error('Error:', error);
    socket.emit('error', { message: 'Error' });
}

// Helper function to emit game events to the correct room (game-specific if active, table-specific if not)
export function emitGameEvent(game: GameState | null, event: string, data: any): void {
    // Ensure playersWhoHavePassed is a Set before processing
    if (data && data.game) {
        ensurePlayersWhoHavePassedIsSet(data.game);
    }

    // Create a deep copy of the data to avoid modifying the original game object
    const serializedData = JSON.parse(JSON.stringify(data, (key, value) => {
        // Convert Set to Array for JSON serialization
        if (value instanceof Set) {
            return Array.from(value);
        }
        return value;
    }));

    if (game && game.id && game.phase !== 'finished') {
        // Game is active, use game-specific room
        io.to(`game-${game.id}`).emit(event, serializedData);
        // Also emit to spectator room if it exists
        io.to(`spectator-${game.tableId}`).emit(event, serializedData);
    } else if (game && game.tableId) {
        // Game is finished or not active, use table room
        io.to(`table-${game.tableId}`).emit(event, serializedData);
    }
}