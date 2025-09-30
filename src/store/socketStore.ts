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
    joinTable: (tableId: string, tableName?: string) => void;
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
        const socket = io('http://localhost:3001');

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

        socket.on('table_joined', (data) => {
            console.log('Table joined data:', data);
            const { table, player } = data;
            useGameStore.getState().setCurrentTable(table);
            useGameStore.getState().setCurrentPlayer(player);
        });

        socket.on('player_joined_table', (data) => {
            const { table, player } = data;
            useGameStore.getState().setCurrentTable(table);
            toast.success(`${player.name} joined the table`);
        });

        socket.on('game_started', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);
            useGameStore.getState().setIsBidding(true);

            // Update the current player with the correct data from the game state
            const currentPlayerId = useGameStore.getState().currentPlayer?.id;
            if (currentPlayerId) {
                const updatedPlayer = game.players.find(p => p.id === currentPlayerId);
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
            const { game, card, playerId } = data;
            useGameStore.getState().setCurrentGame(game);

            // Play sound effect
            playCardSound();

            // Show notification
            const player = game.players.find(p => p.id === playerId);
            if (player) {
                toast.success(`${player.name} played ${card.rank} of ${card.suit}`);
            }
        });

        socket.on('game_updated', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);

            if (game.phase === 'playing') {
                useGameStore.getState().setIsBidding(false);
                toast.success('Game phase updated to playing!');
            }
        });

        socket.on('trick_completed', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);
            useGameStore.getState().setLastTrick(game.lastTrick);

            // Play sound effect
            playTrickSound();

            // Show notification
            const winner = game.players.find(p => p.id === game.lastTrick?.winner);
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
            const winningPlayerNames = winningPlayers.map(p => p.name).join(' & ');
            const teamScore = finalScores[winningTeam];
            const otherTeam = winningTeam === 'team1' ? 'team2' : 'team1';
            const otherTeamScore = finalScores[otherTeam];

            toast.success(
                `🎉 Game Over! ${winningTeamName} wins! 🎉\n` +
                `Winners: ${winningPlayerNames}\n` +
                `Final Score: ${teamScore} - ${otherTeamScore}`,
                { duration: 8000 }
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

    joinTable: (tableId, tableName) => {
        const { socket } = get();
        if (socket) {
            console.log('Joining table:', tableId, 'with name:', tableName);
            socket.emit('join_table', { tableId, tableName });
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
