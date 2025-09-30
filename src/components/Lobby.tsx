import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';

const Lobby: React.FC = () => {
    const { lobby, currentPlayer } = useGameStore();
    const { joinTable } = useSocketStore();
    const [newTableName, setNewTableName] = useState('');

    const handleJoinTable = (tableId: string) => {
        joinTable(tableId);
    };

    const handleCreateTable = () => {
        if (newTableName.trim()) {
            const tableId = `table-${Date.now()}`;
            joinTable(tableId);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 p-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <motion.div
                    className="text-center mb-8"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-4xl font-bold mb-2">🎴 Two Hundred Lobby</h1>
                    <p className="text-green-200">Welcome, {currentPlayer?.name}!</p>
                </motion.div>

                {/* Create Table Section */}
                <motion.div
                    className="bg-black bg-opacity-30 rounded-lg p-6 mb-6 backdrop-blur-sm border border-green-500 border-opacity-30"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, delay: 0.1 }}
                >
                    <h2 className="text-xl font-semibold mb-4">Create New Table</h2>
                    <div className="flex gap-4">
                        <input
                            type="text"
                            placeholder="Table name"
                            value={newTableName}
                            onChange={(e) => setNewTableName(e.target.value)}
                            className="flex-1 p-3 rounded-lg bg-white bg-opacity-10 border border-green-500 border-opacity-30 text-white placeholder-green-200"
                            maxLength={30}
                        />
                        <button
                            onClick={handleCreateTable}
                            disabled={!newTableName.trim()}
                            className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg font-semibold transition-colors"
                        >
                            Create Table
                        </button>
                    </div>
                </motion.div>

                {/* Tables List */}
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                >
                    {lobby && lobby.length > 0 ? (
                        lobby.map((table, index) => (
                            <motion.div
                                key={table.id}
                                className="bg-black bg-opacity-30 rounded-lg p-6 backdrop-blur-sm border border-green-500 border-opacity-30 hover:border-opacity-60 transition-all"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: 0.1 * index }}
                                whileHover={{ scale: 1.02 }}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-lg font-semibold">{table.name}</h3>
                                    <span className="text-sm text-green-300">
                                        {table.players.length}/{table.maxPlayers}
                                    </span>
                                </div>

                                <div className="mb-4">
                                    <div className="text-sm text-green-200 mb-2">Players:</div>
                                    <div className="flex flex-wrap gap-2">
                                        {table.players.map(player => (
                                            <span
                                                key={player.id}
                                                className="px-2 py-1 bg-green-600 bg-opacity-30 rounded text-xs"
                                            >
                                                {player.name} {player.isBot && '🤖'}
                                            </span>
                                        ))}
                                        {table.players.length === 0 && (
                                            <span className="text-gray-400 text-sm">No players</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex justify-between items-center">
                                    <div className="text-sm text-green-200">
                                        {table.gameState ? (
                                            <span className="text-yellow-400">Game in Progress</span>
                                        ) : (
                                            <span>Waiting for Players</span>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => handleJoinTable(table.id)}
                                        disabled={table.players.length >= table.maxPlayers || table.gameState}
                                        className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg text-sm font-semibold transition-colors"
                                    >
                                        {table.players.length >= table.maxPlayers ? 'Full' :
                                            table.gameState ? 'In Game' : 'Join'}
                                    </button>
                                </div>
                            </motion.div>
                        ))
                    ) : (
                        <div className="col-span-full text-center py-12">
                            <div className="text-6xl mb-4">🎴</div>
                            <h3 className="text-xl font-semibold mb-2">No Tables Available</h3>
                            <p className="text-green-200">Create a new table to start playing!</p>
                        </div>
                    )}
                </motion.div>

                {/* Game Rules */}
                <motion.div
                    className="mt-12 bg-black bg-opacity-30 rounded-lg p-6 backdrop-blur-sm border border-green-500 border-opacity-30"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                >
                    <h2 className="text-xl font-semibold mb-4">How to Play Two Hundred</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-green-200">
                        <div>
                            <h3 className="font-semibold text-white mb-2">Objective</h3>
                            <p>Be the first team to reach 200 points by winning tricks with valuable cards.</p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white mb-2">Scoring Cards</h3>
                            <p>Aces (10 pts), 10s (10 pts), 5s (5 pts)</p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white mb-2">Bidding</h3>
                            <p>Bid on how many points your team will score. Highest bidder chooses trump suit.</p>
                        </div>
                        <div>
                            <h3 className="font-semibold text-white mb-2">Gameplay</h3>
                            <p>Follow suit if possible. Highest trump wins, otherwise highest card of lead suit.</p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Lobby;
