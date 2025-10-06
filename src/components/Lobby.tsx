import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';
import UsernameEditor from './UsernameEditor';

interface LobbyProps {
    onResetUsername: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ onResetUsername }) => {
    const { lobby, currentPlayer } = useGameStore();
    const { joinTable, createTable, deleteTable, socket } = useSocketStore();
    const [newTableName, setNewTableName] = useState('');
    const [passwordPrompt, setPasswordPrompt] = useState<{ tableId: string; tableName: string } | null>(null);
    const [joinPassword, setJoinPassword] = useState('');

    console.log('Lobby component render - lobby:', lobby, 'currentPlayer:', currentPlayer);

    // If lobby data is not available, request it from the server
    React.useEffect(() => {
        if (socket && !lobby && currentPlayer?.name) {
            console.log('Requesting lobby data from server');
            socket.emit('join_lobby', { playerName: currentPlayer.name });
        }
    }, [socket, lobby, currentPlayer]);

    const handleJoinTable = (tableId: string) => {
        const table = lobby?.find(t => t.id === tableId);
        if (table?.isPrivate) {
            // Show password prompt for private tables
            setPasswordPrompt({ tableId, tableName: table.name });
        } else {
            // Join public table directly
            joinTable(tableId);
        }
    };

    const handleJoinWithPassword = () => {
        if (passwordPrompt) {
            joinTable(passwordPrompt.tableId, undefined, undefined, joinPassword);
            setPasswordPrompt(null);
            setJoinPassword('');
        }
    };

    const cancelPasswordPrompt = () => {
        setPasswordPrompt(null);
        setJoinPassword('');
    };

    const handleCreateTable = () => {
        console.log('Create table clicked, name:', newTableName);
        if (newTableName.trim()) {
            console.log('Creating table with name:', newTableName.trim());
            createTable(newTableName.trim());
            // Clear the form after creating
            setNewTableName('');
        } else {
            console.log('Table name is empty');
        }
    };

    const handleDeleteTable = (tableId: string) => {
        //if (window.confirm('Are you sure you want to delete this table? This action cannot be undone.')) {
        deleteTable(tableId);
        //}
    };

    // Show loading state if lobby data is not available
    if (!lobby) {
        return (
            <div style={{ padding: '20px' }}>
                <div className="text-center">
                    <div className="text-white text-xl">Loading lobby...</div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900">
            {/* Header */}
            <div className="flex justify-between items-center p-4 bg-white/10 backdrop-blur-md border-b border-white/20">
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4">
                        <h2 className="text-2xl font-bold text-white">🎴 200 Lobby</h2>
                        <div className="flex items-center gap-4 text-sm text-white/80">
                            {currentPlayer?.name ? (
                                <UsernameEditor
                                    currentUsername={currentPlayer.name}
                                    onUsernameUpdate={(newUsername) => {
                                        // Update the current player in the store
                                        useGameStore.getState().setCurrentPlayer({
                                            ...currentPlayer,
                                            name: newUsername
                                        });
                                        // Re-emit join_lobby with the new username
                                        if (socket) {
                                            socket.emit('join_lobby', { playerName: newUsername });
                                        }
                                    }}
                                    onClearUsername={onResetUsername}
                                />
                            ) : (
                                <span>Welcome, Player!</span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-white text-right">
                        🏠 Main Lobby
                    </div>
                </div>
            </div>

            <div style={{ padding: '20px' }}>
                <div>

                    {/* Create Table Section */}
                    <motion.div
                        className="bg-white/10 backdrop-blur-md rounded p-10 mb-12 border border-white/20 shadow-2xl"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="text-2xl font-bold mb-6 text-white">Create New Table</h2>
                        <div className="space-y-4">
                            <input
                                type="text"
                                placeholder="Enter table name..."
                                value={newTableName}
                                onChange={(e) => setNewTableName(e.target.value)}
                                className="w-full px-4 py-3 rounded bg-white/10 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all"
                                maxLength={30}
                            />

                            <button
                                onClick={handleCreateTable}
                                disabled={!newTableName.trim()}
                                className="w-full px-8 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded font-semibold text-white transition-all transform hover:scale-105 disabled:hover:scale-100 shadow-lg"
                            >
                                Create Table
                            </button>
                        </div>
                    </motion.div>

                    <br />

                    {/* Tables List */}
                    <motion.div
                        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        {lobby && lobby.length > 0 ? (
                            lobby.map((table) => (
                                <motion.div
                                    key={table.id}
                                    className="bg-white/10 backdrop-blur-md rounded p-8 border border-white/20 hover:border-white/40 transition-all duration-300 shadow-xl hover:shadow-2xl"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xl font-bold text-white">{table.name}</h3>
                                                {table.isPrivate && (
                                                    <span className="px-2 py-1 bg-red-500/20 border border-red-400/30 rounded text-xs font-medium text-red-300">
                                                        🔒 Private
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-white/70 mt-1">
                                                🃏 {table.deckVariant === '40' ? '40 Cards (with 6s)' : '36 Cards (Standard)'} • 🎯 {table.scoreTarget || 200} Points{table.hasKitty && ' • 🐱 Kitty'}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
                                                {table.players.length}/{table.maxPlayers}
                                            </span>
                                            {currentPlayer && table.creator === currentPlayer.name && !table.gameState && (
                                                <button
                                                    onClick={() => handleDeleteTable(table.id)}
                                                    className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg text-red-300 hover:text-red-200 transition-all text-sm"
                                                    title="Delete table"
                                                >
                                                    🗑️
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mb-6">
                                        <div className="text-sm font-medium text-white/80 mb-3">Players:</div>
                                        <div className="flex flex-wrap gap-2">
                                            {table.players.map(player => (
                                                <span
                                                    key={player.id}
                                                    className="px-3 py-1 bg-green-500/30 rounded-lg text-sm font-medium text-white border border-green-400/30"
                                                >
                                                    {player.name} {player.isBot && '🤖'}
                                                </span>
                                            ))}
                                            {table.players.length === 0 && (
                                                <span className="text-white/60 text-sm italic">No players yet</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <div className="text-sm">
                                            {table.gameState ? (
                                                <span className="text-yellow-400 font-medium">🎮 Game in Progress</span>
                                            ) : (
                                                <span className="text-white/80 font-medium">⏳ Waiting for Players</span>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => handleJoinTable(table.id)}
                                            disabled={table.players.length >= table.maxPlayers || !!table.gameState}
                                            className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded text-sm font-semibold text-white transition-all transform hover:scale-105 disabled:hover:scale-100 shadow-lg"
                                            style={{ backgroundColor: 'green', color: 'white', border: 'none', padding: '5px' }}
                                        >
                                            {table.players.length >= table.maxPlayers ? 'Full' :
                                                table.gameState ? 'In Game' : 'Join Table'}
                                        </button>
                                    </div>
                                </motion.div>
                            ))
                        ) : (
                            <div className="col-span-full text-center py-16">
                                <h3 className="text-2xl font-bold mb-4 text-white">No Tables Available</h3>
                                <p className="text-white/80 text-lg">Create a new table to start playing!</p>
                            </div>
                        )}
                    </motion.div>

                    <br />

                    {/* Game Rules */}
                    <motion.div
                        className="mt-20 bg-white/10 backdrop-blur-md rounded p-8 border border-white/20 shadow-2xl"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5 }}
                    >
                        <h2 className="text-3xl font-bold mb-8 text-white text-center">How to Play 200</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-4">
                                <div>
                                    <h3 className="font-bold text-white mb-2 text-lg">🎯 Objective</h3>
                                    <p className="text-white/80">Be the first team to reach 200 points by winning tricks with valuable cards.</p>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white mb-2 text-lg">💰 Scoring Cards</h3>
                                    <p className="text-white/80">Aces (10 pts), 10s (10 pts), 5s (5 pts)</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <h3 className="font-bold text-white mb-2 text-lg">🎲 Bidding</h3>
                                    <p className="text-white/80">Bid on how many points your team will score. Highest bidder chooses trump suit.</p>
                                </div>
                                <div>
                                    <h3 className="font-bold text-white mb-2 text-lg">🃏 Gameplay</h3>
                                    <p className="text-white/80">Follow suit if possible. Highest trump wins, otherwise highest card of lead suit.</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>

            {/* Password Prompt Modal */}
            {passwordPrompt && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
                    <motion.div
                        className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20 shadow-2xl max-w-md w-full mx-4"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                    >
                        <h3 className="text-xl font-bold text-white mb-4">
                            🔒 Join Private Table
                        </h3>
                        <p className="text-white/80 mb-4">
                            Enter the password for "{passwordPrompt.tableName}":
                        </p>
                        <input
                            type="password"
                            placeholder="Enter password..."
                            value={joinPassword}
                            onChange={(e) => setJoinPassword(e.target.value)}
                            className="w-full px-4 py-3 rounded bg-white/10 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all mb-6"
                            onKeyPress={(e) => {
                                if (e.key === 'Enter') {
                                    handleJoinWithPassword();
                                }
                            }}
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={handleJoinWithPassword}
                                disabled={!joinPassword.trim()}
                                className="flex-1 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded font-semibold text-white transition-all transform hover:scale-105 disabled:hover:scale-100"
                            >
                                Join Table
                            </button>
                            <button
                                onClick={cancelPasswordPrompt}
                                className="px-4 py-3 bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 rounded font-semibold text-white transition-all transform hover:scale-105"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default Lobby;
