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
    joinTable: (tableId: string, tableName?: string, numBots?: number) => void;
    createTable: (tableName: string) => void;
    addBot: (tableId: string, position: number, skill?: string) => void;
    removeBot: (tableId: string, botId: string) => void;
    startGame: (tableId: string) => void;
    leaveTable: (tableId: string) => void;
    deleteTable: (tableId: string) => void;
    makeBid: (gameId: string, points: number, suit?: string) => void;
    playCard: (gameId: string, card: any) => void;
    sendChat: (message: string, tableId: string) => void;
}

export const useSocketStore = create<SocketStore>((set, get) => ({
    socket: null,
    isConnected: false,
    playerId: null,

    connect: () => {
        // Use the same IP as the frontend for the socket connection
        const serverUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3001'
            : `http://${window.location.hostname}:3001`;
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

        socket.on('player_joined', (data) => {
            const { player } = data;
            toast.success(`${player.name} joined the lobby`);
        });

        socket.on('lobby_updated', (data) => {
            console.log('Lobby updated:', data);
            const { lobby } = data;
            const tablesArray = lobby.tables || [];
            useGameStore.getState().setLobby(tablesArray);
        });

        socket.on('table_created', (data) => {
            console.log('Table created:', data);
            if (data.success) {
                toast.success(`Table "${data.table.name}" created successfully!`);
            }
        });

        socket.on('table_left', (data) => {
            console.log('Left table:', data);
            useGameStore.getState().setCurrentTable(null);
            useGameStore.getState().setCurrentGame(null);
            toast.success('Left table successfully');
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

        socket.on('table_updated', (data) => {
            console.log('Table updated:', data);
            const { table } = data;
            useGameStore.getState().setCurrentTable(table);
        });

        socket.on('player_joined_table', (data) => {
            const { table, player } = data;
            useGameStore.getState().setCurrentTable(table);
            toast.success(`${player.name} joined the table`);
        });

        socket.on('player_left_table', (data) => {
            const { table, player } = data;
            useGameStore.getState().setCurrentTable(table);
            toast(`${player.name} left the table`);
        });

        socket.on('game_started', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);
            useGameStore.getState().setIsBidding(true);

            // Update the current player with the correct data from the game state
            const currentPlayerId = useGameStore.getState().currentPlayer?.id;
            if (currentPlayerId) {
                const updatedPlayer = game.players.find((p: any) => p.id === currentPlayerId);
                if (updatedPlayer) {
                    useGameStore.getState().setCurrentPlayer(updatedPlayer);
                }
            }

            toast.success('Game started!');
        });

        socket.on('bid_made', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);

            if (game.phase === 'playing') {
                useGameStore.getState().setIsBidding(false);
                toast.success('Bidding complete! Game starting...');
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

            // Show notification
            const winner = game.players.find((p: any) => p.id === game.lastTrick?.winner);
            if (winner) {
                toast.success(`${winner.name} won the trick! (+${game.lastTrick?.points} points)`);
            }

            // Don't manually clear the trick - let the server's game_updated event handle it
        });

        socket.on('round_completed', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);
            useGameStore.getState().setLastTrick(null); // Clear last trick

            // Ensure trick area is cleared for new round
            const updatedGame = { ...game, currentTrick: { cards: [], winner: null, points: 0 } };
            useGameStore.getState().setCurrentGame(updatedGame);

            // Show notification
            toast.success(`Round ${game.round} complete! New round starting...`);
        });

        socket.on('game_ended', (data) => {
            const { game, winningTeam, winningTeamName, winningPlayers, finalScores } = data;
            useGameStore.getState().setCurrentGame(game);
            useGameStore.getState().setLastTrick(null); // Clear last trick

            // Ensure trick area is cleared when game ends
            const updatedGame = { ...game, currentTrick: { cards: [], winner: null, points: 0 } };
            useGameStore.getState().setCurrentGame(updatedGame);

            // Create detailed win notification
            const winningPlayerNames = winningPlayers.map((p: any) => p.name).join(' & ');
            const teamScore = finalScores[winningTeam];
            const otherTeam = winningTeam === 'team1' ? 'team2' : 'team1';
            const otherTeamScore = finalScores[otherTeam];

            toast.success(
                `🎉 Game Over! ${winningTeamName} wins! 🎉\n` +
                `Winners: ${winningPlayerNames}\n` +
                `Final Score: ${teamScore} - ${otherTeamScore}`,
                {
                    duration: 8000,
                    position: 'top-center',
                    style: {
                        fontSize: '18px',
                        padding: '20px',
                        textAlign: 'center',
                        maxWidth: '500px',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        color: 'white',
                        fontWeight: 'bold',
                        borderRadius: '12px',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
                    }
                }
            );

            // Add system message to chat
            const systemMessage = {
                id: `game-end-${Date.now()}`,
                playerId: 'system',
                playerName: 'System',
                message: `🏆 Game Over! ${winningTeamName} wins with ${teamScore} points! Winners: ${winningPlayerNames}`,
                timestamp: Date.now(),
                type: 'system' as const
            };
            useGameStore.getState().addChatMessage(systemMessage);
        });

        socket.on('chat_message', (message) => {
            useGameStore.getState().addChatMessage(message);
        });

        socket.on('error', (data) => {
            console.error('Socket error:', data.message);
            toast.error(data.message);
        });

        socket.on('table_deleted', (data) => {
            console.log('Table deleted:', data.tableId);
            toast.success('Table deleted successfully');
            // Clear current table if we were in the deleted table
            const currentTable = useGameStore.getState().currentTable;
            if (currentTable && currentTable.id === data.tableId) {
                useGameStore.getState().setCurrentTable(null);
            }
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

    joinTable: (tableId, tableName, numBots) => {
        const { socket } = get();
        if (socket) {
            console.log('Joining table:', tableId, 'with name:', tableName, 'bots:', numBots);
            socket.emit('join_table', { tableId, tableName, numBots });
        } else {
            console.log('Socket not connected');
        }
    },

    createTable: (tableName) => {
        const { socket } = get();
        if (socket) {
            const tableId = `table-${Date.now()}`;
            console.log('Creating table:', tableId, 'with name:', tableName);
            socket.emit('create_table', { tableId, tableName });
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

    sendChat: (message, tableId) => {
        const { socket } = get();
        if (socket) {
            socket.emit('send_chat', { message, tableId });
        }
    }
}));

// Sound effects
function playCardSound() {
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
