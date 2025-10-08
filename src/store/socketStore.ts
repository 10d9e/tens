import { create } from 'zustand';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from './gameStore';
import toast from 'react-hot-toast';

interface SocketStore {
    socket: Socket | null;
    isConnected: boolean;
    playerId: string | null;

    // Actions
    connect: () => void;
    disconnect: () => void;
    joinLobby: (playerName: string) => void;
    joinTable: (tableId: string, tableName?: string, numBots?: number, password?: string) => void;
    joinAsSpectator: (tableId: string) => void;
    createTable: (tableName: string) => void;
    addBot: (tableId: string, position: number, skill?: string) => void;
    removeBot: (tableId: string, botId: string) => void;
    movePlayer: (tableId: string, newPosition: number) => void;
    startGame: (tableId: string) => void;
    leaveTable: (tableId: string) => void;
    updateTableDeckVariant: (tableId: string, deckVariant: '36' | '40') => void;
    updateTableScoreTarget: (tableId: string, scoreTarget: 200 | 300 | 500 | 1000) => void;
    updateTableKitty: (tableId: string, hasKitty: boolean) => void;
    updateTablePrivacy: (tableId: string, isPrivate: boolean, password?: string) => void;
    deleteTable: (tableId: string) => void;
    makeBid: (gameId: string, points: number, suit?: string) => void;
    playCard: (gameId: string, card: any) => void;
    takeKitty: (gameId: string) => void;
    discardToKitty: (gameId: string, discardedCards: any[], trumpSuit?: string) => void;
    sendChat: (message: string, tableId: string) => void;
    updateTableTimeout: (tableId: string, timeoutDuration: number) => void;
    exitGame: (gameId: string, playerName: string) => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
    socket: null,
    isConnected: false,
    playerId: null,

    connect: () => {
        // Use the same origin for socket connection in production, localhost:3001 in development
        const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3001'
            : window.location.origin;
        const socket = io(serverUrl);

        socket.on('connect', () => {
            set({ socket, isConnected: true, playerId: socket.id });
            console.log('Connected to server with ID:', socket.id);
        });

        socket.on('disconnect', () => {
            set({ isConnected: false });
            console.log('Disconnected from server');
        });

        socket.on('lobby_joined', (data) => {
            console.log('Lobby joined data:', data);
            const { lobby, player } = data;
            const tablesArray = lobby.tables || [];
            console.log('Tables array:', tablesArray);
            useGameStore.getState().setLobby(tablesArray);
            useGameStore.getState().setCurrentPlayer(player);
        });

        socket.on('game_timeout', (data) => {
            const { message } = data;
            console.log('Game timeout:', message);

            toast.error(message);

            const gameStore = useGameStore.getState();
            gameStore.setCurrentGame(null);
            gameStore.setCurrentTable(null);
            gameStore.setCurrentPlayer(null);
            gameStore.setIsBidding(false);
            gameStore.setSelectedCard(null);
        });

        socket.on('name_taken', (data) => {
            console.log('Name taken error:', data);
            // toast.error(data.message);
            // Don't clear the current player state, just show the error
        });

        socket.on('player_joined', (data) => {
            const { player } = data;
            console.log(`${player.name} joined the lobby`);
            // toast.success(`${player.name} joined the lobby`);
        });

        socket.on('lobby_updated', (data) => {
            console.log('Lobby updated:', data);
            const { lobby } = data;
            const tablesArray = lobby.tables || [];
            console.log('Setting lobby with tables:', tablesArray.map((t: any) => ({ id: t.id, name: t.name, players: t.players.length, gameState: !!t.gameState })));
            useGameStore.getState().setLobby(tablesArray);
        });

        socket.on('table_created', (data) => {
            console.log('Table created:', data);
            /*
            if (data.success) {
                toast.success(`Table "${data.table.name}" created successfully!`);
            }
            */
        });

        socket.on('table_left', (data) => {
            console.log('Left table:', data);
            const gameStore = useGameStore.getState();
            gameStore.setCurrentTable(null);
            gameStore.setCurrentGame(null);
            // Don't clear currentPlayer - keep the player info for the lobby
            gameStore.setIsBidding(false);
            gameStore.setSelectedCard(null);
            // toast.success('Left table successfully');
        });

        socket.on('table_joined', (data) => {
            console.log('Table joined data:', data);
            const { table, player } = data;
            useGameStore.getState().setCurrentTable(table);
            useGameStore.getState().setCurrentPlayer(player);

            // Check if table is full - if not, we'll be in waiting room
            // If full, game will start automatically and we'll get game_started event
            console.log('Table players:', table.players.length, 'Max players:', table.maxPlayers);
        });

        socket.on('spectator_joined', (data) => {
            console.log('Spectator joined data:', data);
            const { table, spectator, game } = data;
            useGameStore.getState().setCurrentTable(table);
            useGameStore.getState().setCurrentPlayer(spectator);

            // If game is provided, set it immediately (game is already in progress)
            if (game) {
                useGameStore.getState().setCurrentGame(game);
                console.log('Spectator joined active game, setting game state immediately');
            }

            // toast.success(`Joined as spectator to "${table.name}"`);
        });

        socket.on('table_updated', (data) => {
            console.log('Table updated:', data);
            const { table } = data;
            useGameStore.getState().setCurrentTable(table);

            // Check if current player is still in the table
            const currentPlayer = useGameStore.getState().currentPlayer;
            if (currentPlayer && !table.players.find((p: any) => p.id === currentPlayer.id)) {
                console.log('Current player no longer in table, clearing game state but preserving player info');
                const gameStore = useGameStore.getState();
                gameStore.setCurrentGame(null);
                gameStore.setCurrentTable(null);
                // Don't clear currentPlayer - keep the player info for the lobby
                gameStore.setIsBidding(false);
                gameStore.setSelectedCard(null);
                // toast('You have been returned to the lobby', { icon: 'ℹ️' });
            }
        });

        socket.on('player_joined_table', (data) => {
            const { table, player } = data;
            useGameStore.getState().setCurrentTable(table);
            console.log(`${player.name} joined the table`);
            // toast.success(`${player.name} joined the table`);
        });

        socket.on('player_left_table', (data) => {
            const { table, player } = data;
            useGameStore.getState().setCurrentTable(table);
            console.log(`${player.name} left the table`);
            // toast(`${player.name} left the table`);
        });

        socket.on('spectator_joined_table', (data) => {
            const { table, spectator } = data;
            useGameStore.getState().setCurrentTable(table);
            console.log(`${spectator.name} is now watching`);
            // toast(`${spectator.name} is now watching`);
        });

        socket.on('spectator_left_table', (data) => {
            const { table, spectator } = data;
            useGameStore.getState().setCurrentTable(table);
            console.log(`${spectator.name} stopped watching`);
            // toast(`${spectator.name} stopped watching`);
        });

        socket.on('game_started', (data) => {
            const { game } = data;
            const gameStore = useGameStore.getState();

            gameStore.setCurrentGame(game);
            gameStore.setIsBidding(true);

            // Update the current player with the correct data from the game state
            const currentPlayerId = gameStore.currentPlayer?.id;
            if (currentPlayerId) {
                const updatedPlayer = game.players.find((p: any) => p.id === currentPlayerId);
                if (updatedPlayer) {
                    gameStore.setCurrentPlayer(updatedPlayer);
                }
            }

            // Show shuffle animation when game starts
            playShuffleSound();
            gameStore.setShowShuffleAnimation(true);

            // Hide shuffle animation after 2.5 seconds
            setTimeout(() => {
                gameStore.setShowShuffleAnimation(false);
            }, 2500);

            // toast.success('Game started!');
        });

        socket.on('bid_made', (data) => {
            const { game } = data;
            const gameStore = useGameStore.getState();
            const previousGame = gameStore.currentGame;

            gameStore.setCurrentGame(game);

            // Play cowbell sound only when a new bid is made (not when just updating the game state)
            if (game.currentBid && game.currentBid.points > 0) {
                // Check if this is a new bid by comparing with previous state
                const isNewBid = !previousGame?.currentBid ||
                    previousGame.currentBid.points !== game.currentBid.points ||
                    previousGame.currentBid.playerId !== game.currentBid.playerId;

                if (isNewBid) {
                    playCowbellSound();
                    // Trigger bell animation for the player who made the bid
                    useGameStore.getState().setBellAnimation(game.currentBid.playerId);
                }
            } else if (game.biddingPasses > (previousGame?.biddingPasses || 0)) {
                // Play tick sound when someone passes (biddingPasses increased)
                playPassTickSound();
            }

            if (game.phase === 'playing') {
                gameStore.setIsBidding(false);
                // toast.success('Bidding complete! Game starting...');
            }
        });

        socket.on('card_played', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);

            // Play sound effect
            playCardSound();
        });

        socket.on('game_updated', (data) => {
            const { game } = data;
            console.log('Received game_updated:', {
                phase: game.phase,
                currentPlayer: game.currentPlayer,
                hasKitty: game.hasKitty,
                kittyLength: game.kitty?.length || 0,
                round: game.round
            });
            useGameStore.getState().setCurrentGame(game);

            if (game.phase === 'playing') {
                useGameStore.getState().setIsBidding(false);
                // toast.success('Game phase updated to playing!');
            }
        });

        socket.on('trick_completed', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);
            useGameStore.getState().setLastTrick(game.lastTrick);

            // Play sound effect
            playTrickSound();

            // Show notification and trigger visual effect
            const winner = game.players.find((p: any) => p.id === game.lastTrick?.winner);
            if (winner) {
                // toast.success(`${winner.name} won the trick! (+${game.lastTrick?.points} points)`);
                // Trigger trick winner animation
                useGameStore.getState().setTrickWinnerAnimation(winner.id);
            }

            // Don't manually clear the trick - let the server's game_updated event handle it
        });

        socket.on('round_completed', (data) => {
            const { game } = data;
            const gameStore = useGameStore.getState();

            // Check if this was an actual play round (has meaningful round scores) or failed bidding
            const previousGame = gameStore.currentGame;
            const hasPlayRoundResults = previousGame?.roundScores &&
                (previousGame.roundScores.team1 > 0 || previousGame.roundScores.team2 > 0);

            // Check if this was a failed bidding round (no one bid)
            const wasFailedBidding = !hasPlayRoundResults && !previousGame?.currentBid;

            // Only preserve and show round results if there was an actual play round
            if (hasPlayRoundResults) {
                // Preserve the completed round results before clearing them
                const completedResults = {
                    roundScores: previousGame.roundScores,
                    currentBid: previousGame.currentBid,
                    contractorTeam: previousGame.contractorTeam,
                    round: game.round - 1, // The round that just completed
                    kittyDiscards: previousGame.kittyDiscards, // Include kitty discards for display
                    previousTeamScores: previousGame.teamScores // Store previous team scores for score change calculation
                };

                // Store the completed round results and show glow effect
                gameStore.setCompletedRoundResults(completedResults);
                gameStore.setShowGlowEffect(true);

                // Clear the completed round results and glow effect after 3.5 seconds (slightly after the server delay)
                setTimeout(() => {
                    gameStore.setCompletedRoundResults(null);
                    gameStore.setShowGlowEffect(false);
                }, 10000);
            } else if (wasFailedBidding) {
                // Show reshuffling message and animation for failed bidding
                playShuffleSound();
                gameStore.setShowShuffleAnimation(true);

                //toast.success('🃏 No one bid! Reshuffling cards for new round...', {
                //    duration: 3000,
                //    icon: '🔀'
                //});


                // Hide shuffle animation after 3 seconds (matching the server delay)
                setTimeout(() => {
                    gameStore.setShowShuffleAnimation(false);
                }, 1000);
            }

            // Update game state for new round
            gameStore.setCurrentGame(game);
            gameStore.setLastTrick(null); // Clear last trick

            // Ensure trick area is cleared for new round
            const updatedGame = { ...game, currentTrick: { cards: [], winner: null, points: 0 } };
            gameStore.setCurrentGame(updatedGame);
        });

        socket.on('game_ended', (data) => {
            const { game, winningTeam, winningTeamName, winningPlayers, finalScores, reason } = data;

            // Check if this is a legitimate game end or due to player exit
            const gameStore = useGameStore.getState();
            const isExit = reason === 'Player disconnected' || gameStore.gameEndedByExit;

            if (!isExit) {
                // Only process legitimate game ends (not exits)
                gameStore.setCurrentGame(game);
                gameStore.setLastTrick(null); // Clear last trick

                // Ensure trick area is cleared when game ends
                const updatedGame = { ...game, currentTrick: { cards: [], winner: null, points: 0 } };
                gameStore.setCurrentGame(updatedGame);

                // Create detailed win notification
                const winningPlayerNames = winningPlayers.map((p: any) => p.name).join(' & ');
                const teamScore = finalScores[winningTeam];
                const otherTeam = winningTeam === 'team1' ? 'team2' : 'team1';
                const otherTeamScore = finalScores[otherTeam];

                console.log('Game end details:', { winningTeam, winningTeamName, teamScore, otherTeam, otherTeamScore });

                // Add system message to chat
                const systemMessage = {
                    id: `game-end-${Date.now()}`,
                    playerId: 'system',
                    playerName: 'System',
                    message: `🏆 Game Over! ${winningTeamName} wins with ${teamScore} points! Winners: ${winningPlayerNames}`,
                    timestamp: Date.now(),
                    type: 'system' as const
                };
                gameStore.addChatMessage(systemMessage);

                // Set a flag to indicate the game has ended
                gameStore.updateGame({ phase: 'finished' });
            } else {
                console.log('Game ended due to exit/disconnect - not showing winning dialog');
            }
        });

        socket.on('chat_message', (message) => {
            useGameStore.getState().addChatMessage(message);
        });

        socket.on('error', (data) => {
            console.error('error:', data.message);
            toast.error(data.message);
        });

        socket.on('table_deleted', (data) => {
            console.log('Table deleted:', data.tableId);
            // toast.success('Table deleted successfully');
            // Clear current table if we were in the deleted table
            const currentTable = useGameStore.getState().currentTable;
            if (currentTable && currentTable.id === data.tableId) {
                useGameStore.getState().setCurrentTable(null);
            }
        });

        socket.on('player_exited_game', (data) => {
            const { message } = data;
            console.log('Player exited game:', message);
            toast(message, { icon: '🚪' });

            // Set flag to indicate game ended by exit (prevents winning dialog from showing)
            const gameStore = useGameStore.getState();
            gameStore.setGameEndedByExit(true);

            // Clear game state and return to lobby
            gameStore.setCurrentGame(null);
            gameStore.setCurrentTable(null);
            gameStore.setCurrentPlayer(null);
            gameStore.setIsBidding(false);
            gameStore.setSelectedCard(null);

            // Reset the flag after clearing game state
            gameStore.setGameEndedByExit(false);
        });

        socket.on('game_ended_for_spectator', (data) => {
            const { message } = data;
            console.log('Game ended for spectator:', message);
            toast(message, { icon: '🏁' });

            // Clear spectator game state and return to lobby
            const gameStore = useGameStore.getState();
            gameStore.setCurrentGame(null);
            gameStore.setCurrentTable(null);
            gameStore.setCurrentPlayer(null);
            gameStore.setIsBidding(false);
            gameStore.setSelectedCard(null);
        });

        set({ socket });
    },

    disconnect: () => {
        const { socket } = get();
        if (socket) {
            socket.disconnect();
            set({ socket: null, isConnected: false, playerId: null });
        }
    },

    joinLobby: (playerName) => {
        const { socket } = get();
        if (socket) {
            socket.emit('join_lobby', { playerName });
        }
    },

    joinTable: (tableId, tableName, numBots, password) => {
        const { socket } = get();
        if (socket) {
            console.log('Joining table:', tableId, 'with name:', tableName, 'bots:', numBots, 'password:', password ? '***' : 'none');
            socket.emit('join_table', { tableId, tableName, numBots, password });
        } else {
            console.log('Socket not connected');
        }
    },

    joinAsSpectator: (tableId) => {
        const { socket } = get();
        if (socket) {
            console.log('Joining as spectator:', tableId);
            socket.emit('join_as_spectator', { tableId });
        } else {
            console.log('Socket not connected');
        }
    },

    createTable: (tableName) => {
        const { socket } = get();
        if (socket) {
            const tableId = `table-${Date.now()}`;
            console.log('Creating table:', tableId, 'with name:', tableName);
            socket.emit('create_table', {
                tableId,
                tableName,
                timeoutDuration: 30000 // Default 30 seconds
            });
        } else {
            console.log('Socket not connected');
        }
    },

    addBot: (tableId, position, skill) => {
        const { socket } = get();
        if (socket) {
            console.log('Adding bot to table:', tableId, 'at position:', position, 'with skill:', skill);
            socket.emit('add_bot', { tableId, position, skill });
        } else {
            console.log('Socket not connected');
        }
    },

    removeBot: (tableId, botId) => {
        const { socket } = get();
        if (socket) {
            console.log('Removing bot from table:', tableId, 'bot ID:', botId);
            socket.emit('remove_bot', { tableId, botId });
        } else {
            console.log('Socket not connected');
        }
    },

    movePlayer: (tableId, newPosition) => {
        const { socket } = get();
        if (socket) {
            console.log('Moving player to position:', tableId, 'new position:', newPosition);
            socket.emit('move_player', { tableId, newPosition });
        } else {
            console.log('Socket not connected');
        }
    },

    startGame: (tableId) => {
        const { socket } = get();
        if (socket) {
            console.log('Starting game for table:', tableId);
            socket.emit('start_game', { tableId });
        } else {
            console.log('Socket not connected');
        }
    },

    leaveTable: (tableId) => {
        const { socket } = get();
        if (socket) {
            console.log('Leaving table:', tableId);
            socket.emit('leave_table', { tableId });
        } else {
            console.log('Socket not connected');
        }
    },

    deleteTable: (tableId) => {
        const { socket } = get();
        if (socket) {
            console.log('Deleting table:', tableId);
            socket.emit('delete_table', { tableId });
        } else {
            console.log('Socket not connected');
        }
    },

    makeBid: (gameId, points, suit) => {
        const { socket } = get();
        if (socket) {
            socket.emit('make_bid', { gameId, points, suit });
        }
    },

    playCard: (gameId, card) => {
        const { socket } = get();
        if (socket) {
            socket.emit('play_card', { gameId, card });
        }
    },

    takeKitty: (gameId) => {
        const { socket } = get();
        if (socket) {
            console.log('Taking kitty for game:', gameId);
            socket.emit('take_kitty', { gameId });
        }
    },

    discardToKitty: (gameId, discardedCards, trumpSuit) => {
        const { socket } = get();
        if (socket) {
            console.log('Discarding to kitty for game:', gameId, 'cards:', discardedCards.length, 'trump:', trumpSuit);
            socket.emit('discard_to_kitty', { gameId, discardedCards, trumpSuit });
        }
    },

    sendChat: (message, tableId) => {
        const { socket } = get();
        if (socket) {
            socket.emit('send_chat', { message, tableId });
        }
    },

    updateTableTimeout: (tableId, timeoutDuration) => {
        const { socket } = get();
        if (socket) {
            console.log('Updating table timeout:', tableId, 'to:', timeoutDuration);
            socket.emit('update_table_timeout', { tableId, timeoutDuration });
        } else {
            console.log('Socket not connected');
        }
    },

    updateTableDeckVariant: (tableId, deckVariant) => {
        const { socket } = get();
        if (socket) {
            console.log('Updating table deck variant:', tableId, 'to:', deckVariant);
            socket.emit('update_table_deck_variant', { tableId, deckVariant });
        } else {
            console.log('Socket not connected');
        }
    },

    updateTableScoreTarget: (tableId, scoreTarget) => {
        const { socket } = get();
        if (socket) {
            console.log('Updating table score target:', tableId, 'to:', scoreTarget);
            socket.emit('update_table_score_target', { tableId, scoreTarget });
        } else {
            console.log('Socket not connected');
        }
    },

    updateTableKitty: (tableId, hasKitty) => {
        const { socket } = get();
        if (socket) {
            console.log('Updating table kitty setting:', tableId, 'to:', hasKitty);
            socket.emit('update_table_kitty', { tableId, hasKitty });
        } else {
            console.log('Socket not connected');
        }
    },

    updateTablePrivacy: (tableId, isPrivate, password) => {
        const { socket } = get();
        if (socket) {
            console.log('Updating table privacy setting:', tableId, 'to:', isPrivate, 'password:', password ? '***' : 'none');
            socket.emit('update_table_privacy', { tableId, isPrivate, password });
        } else {
            console.log('Socket not connected');
        }
    },

    exitGame: (gameId, playerName) => {
        const { socket } = get();
        if (socket) {
            console.log('Exiting game:', gameId, 'by player:', playerName);
            // Set flag immediately to prevent any race conditions
            const gameStore = useGameStore.getState();
            gameStore.setGameEndedByExit(true);
            socket.emit('exit_game', { gameId, playerName });
        } else {
            console.log('Socket not connected');
        }
    }
}));

// Sound effects
function playCardSound() {
    // Check if sound is enabled
    if (!useGameStore.getState().soundEnabled) return;

    // Create a simple beep sound
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playTrickSound() {
    // Check if sound is enabled
    if (!useGameStore.getState().soundEnabled) return;

    // Create a different sound for trick completion
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.1);
    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
}

function playBidTurnSound() {
    // Check if sound is enabled
    if (!useGameStore.getState().soundEnabled) return;

    // Create a gentle notification sound for bid turn
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Gentle ascending tone
    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
    oscillator.frequency.setValueAtTime(500, audioContext.currentTime + 0.1);

    oscillator.type = 'sine';

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

function playCowbellSound() {
    // Check if sound is enabled
    if (!useGameStore.getState().soundEnabled) return;

    // Create a cowbell-like sound for bids
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Create multiple oscillators for a richer cowbell sound
    const oscillators = [];
    const gainNodes = [];

    // Main cowbell frequencies
    const frequencies = [800, 1200, 1600];

    for (let i = 0; i < frequencies.length; i++) {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(frequencies[i], audioContext.currentTime);
        oscillator.type = 'square'; // Square wave for more percussive sound

        // Quick attack, longer decay for cowbell effect
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.3);

        oscillators.push(oscillator);
        gainNodes.push(gainNode);
    }
}

function playPassTickSound() {
    // Check if sound is enabled
    if (!useGameStore.getState().soundEnabled) return;

    // Create a subtle tick sound for when players pass
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Short, high-pitched tick
    oscillator.frequency.setValueAtTime(1000, audioContext.currentTime);
    oscillator.type = 'sine';

    // Very quick, subtle sound
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.05, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.05);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.05);
}

function playShuffleSound() {
    // Check if sound is enabled
    if (!useGameStore.getState().soundEnabled) return;

    // Create a simple single shuffle sound effect
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Single frequency shuffle sound
    oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
    oscillator.type = 'square'; // Square wave for percussive sound

    // Quick attack and decay
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

// Export sound functions for use in components
export { playBidTurnSound, playCowbellSound, playPassTickSound, playShuffleSound };
