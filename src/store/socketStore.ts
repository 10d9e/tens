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
    joinTable: (tableId: string) => void;
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
            console.log('Connected to server');
        });

        socket.on('disconnect', () => {
            set({ isConnected: false });
            console.log('Disconnected from server');
        });

        socket.on('lobby_joined', (data) => {
            const { lobby, player } = data;
            useGameStore.getState().setLobby(lobby.tables ? Array.from(lobby.tables.values()) : []);
            useGameStore.getState().setCurrentPlayer(player);
        });

        socket.on('player_joined', (data) => {
            const { player } = data;
            toast.success(`${player.name} joined the lobby`);
        });

        socket.on('table_joined', (data) => {
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
        });

        socket.on('game_ended', (data) => {
            const { game } = data;
            useGameStore.getState().setCurrentGame(game);

            // Determine winner
            const winningTeam = game.teamScores.team1 >= 200 ? 'Team 1' : 'Team 2';
            toast.success(`Game Over! ${winningTeam} wins!`);
        });

        socket.on('chat_message', (message) => {
            useGameStore.getState().addChatMessage(message);
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

    joinTable: (tableId) => {
        const { socket } = get();
        if (socket) {
            socket.emit('join_table', { tableId });
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
