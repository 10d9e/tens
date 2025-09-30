import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import { useGameStore } from './store/gameStore';
import { useSocketStore } from './store/socketStore';
import './App.css';

function App() {
    const { currentGame } = useGameStore();
    const { socket, isConnected } = useSocketStore();
    const [playerName, setPlayerName] = useState('');
    const [showNameInput, setShowNameInput] = useState(true);

    useEffect(() => {
        // Initialize socket connection
        if (!socket) {
            console.log('Initializing socket connection...');
            useSocketStore.getState().connect();
        } else {
            console.log('Socket already connected:', socket.id);
        }
    }, [socket]);

    useEffect(() => {
        if (socket && isConnected && playerName) {
            socket.emit('join_lobby', { playerName });
        }
    }, [socket, isConnected, playerName]);

    const handleNameSubmit = (name: string) => {
        setPlayerName(name);
        setShowNameInput(false);
    };

    if (showNameInput) {
        return (
            <div className="app">
                <motion.div
                    className="name-input-container"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1>🎴 Two Hundred Card Game</h1>
                    <p>Enter your name to join the game</p>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const formData = new FormData(e.currentTarget);
                        const name = formData.get('name') as string;
                        if (name.trim()) {
                            handleNameSubmit(name.trim());
                        }
                    }}>
                        <input
                            type="text"
                            name="name"
                            placeholder="Your name"
                            maxLength={20}
                            required
                            autoFocus
                        />
                        <button type="submit">Join Game</button>
                    </form>
                </motion.div>
                <Toaster position="top-right" />
            </div>
        );
    }

    return (
        <div className="app">
            <AnimatePresence mode="wait">
                {currentGame ? (
                    <motion.div
                        key="game"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                    >
                        <GameTable />
                    </motion.div>
                ) : (
                    <motion.div
                        key="lobby"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Lobby />
                    </motion.div>
                )}
            </AnimatePresence>
            <Toaster position="top-right" />
        </div>
    );
}

export default App;
