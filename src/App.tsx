import { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import Lobby from './components/Lobby';
import GameTable from './components/GameTable';
import WaitingRoom from './components/WaitingRoom';
import SpectatorView from './components/SpectatorView';
import Rules from './components/Rules';
import { useGameStore } from './store/gameStore';
import { useSocketStore } from './store/socketStore';
import { getStoredUsername, storeUsername } from './utils/cookieUtils';
import './App.css';

function App() {
    const { currentGame, currentTable, currentPlayer } = useGameStore();
    const { socket, isConnected } = useSocketStore();
    const [playerName, setPlayerName] = useState('');
    const [showNameInput, setShowNameInput] = useState(true);
    const [showRules, setShowRules] = useState(false);

    // Check for stored username on component mount
    useEffect(() => {
        const storedUsername = getStoredUsername();
        if (storedUsername) {
            setPlayerName(storedUsername);
            setShowNameInput(false);
        }
    }, []);

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
        storeUsername(name); // Save username to cookie
        setShowNameInput(false);
    };

    const handleResetUsername = () => {
        setPlayerName('');
        setShowNameInput(true);
        // Clear the current player from the game store
        useGameStore.getState().setCurrentPlayer(null);
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
                            defaultValue={playerName}
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
                {showRules ? (
                    <motion.div
                        key="rules"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Rules onClose={() => setShowRules(false)} />
                    </motion.div>
                ) : currentGame ? (
                    <motion.div
                        key="game"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                    >
                        {currentPlayer?.isSpectator ? (
                            <SpectatorView />
                        ) : (
                            <GameTable />
                        )}
                    </motion.div>
                ) : currentTable ? (
                    <motion.div
                        key="waiting"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                    >
                        <WaitingRoom />
                    </motion.div>
                ) : (
                    <motion.div
                        key="lobby"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                    >
                        <Lobby
                            onResetUsername={handleResetUsername}
                            onShowRules={() => setShowRules(true)}
                        />
                    </motion.div>
                )}
            </AnimatePresence>
            <Toaster position="top-right" />
        </div>
    );
}

export default App;
