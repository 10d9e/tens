import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';

const Lobby: React.FC = () => {
    const { lobby, currentPlayer } = useGameStore();
    const { joinTable } = useSocketStore();
    const [newTableName, setNewTableName] = useState('');

    console.log('Lobby component render - lobby:', lobby, 'currentPlayer:', currentPlayer);

    const handleJoinTable = (tableId: string) => {
        joinTable(tableId);
    };

    const handleCreateTable = () => {
        console.log('Create table clicked, name:', newTableName);
        if (newTableName.trim()) {
            const tableId = `table-${Date.now()}`;
            console.log('Creating table with ID:', tableId, 'and name:', newTableName.trim());
            joinTable(tableId, newTableName.trim());
        } else {
            console.log('Table name is empty');
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900 px-8 py-12 sm:px-12 sm:py-16 md:px-16 md:py-20 lg:px-24 lg:py-24 xl:px-32 xl:py-32">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <motion.div
                    className="text-center mb-16"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h1 className="text-5xl font-bold mb-4 text-white drop-shadow-lg">
                        🎴 Two Hundred Lobby
                    </h1>
                    <p className="text-xl text-green-200 font-medium">
                        Welcome, {currentPlayer?.name}!
                    </p>
                </motion.div>

                {/* Create Table Section */}
                <motion.div
                    className="bg-white/10 backdrop-blur-md rounded-2xl p-8 mb-12 border border-white/20 shadow-2xl"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    <h2 className="text-2xl font-bold mb-6 text-white">Create New Table</h2>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <input
                            type="text"
                            placeholder="Enter table name..."
                            value={newTableName}
                            onChange={(e) => setNewTableName(e.target.value)}
                            className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all"
                            maxLength={30}
                        />
                        <button
                            onClick={handleCreateTable}
                            disabled={!newTableName.trim()}
                            className="px-8 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-white transition-all transform hover:scale-105 disabled:hover:scale-100 shadow-lg"
                        >
                            Create Table
                        </button>
                    </div>
                </motion.div>

                {/* Tables List */}
                <motion.div
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                >
                    {lobby && lobby.length > 0 ? (
                        lobby.map((table, index) => (
                            <motion.div
                                key={table.id}
                                className="bg-white/10 backdrop-blur-md rounded-2xl p-6 border border-white/20 hover:border-white/40 transition-all duration-300 shadow-xl hover:shadow-2xl"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5 }}
                                whileHover={{ scale: 1.02, y: -5 }}
                            >
                                <div className="flex justify-between items-start mb-6">
                                    <h3 className="text-xl font-bold text-white">{table.name}</h3>
                                    <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium text-white">
                                        {table.players.length}/{table.maxPlayers}
                                    </span>
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
                                        className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl text-sm font-semibold text-white transition-all transform hover:scale-105 disabled:hover:scale-100 shadow-lg"
                                    >
                                        {table.players.length >= table.maxPlayers ? 'Full' :
                                            table.gameState ? 'In Game' : 'Join'}
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

                {/* Game Rules */}
                <motion.div
                    className="mt-20 bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 shadow-2xl"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <h2 className="text-3xl font-bold mb-8 text-white text-center">How to Play Two Hundred</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h3 className="font-bold text-white mb-2 text-lg">🎯 Objective</h3>
                                <p className="text-white/80">Be the first team to reach 200 points by winning tricks with valuable cards.</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h3 className="font-bold text-white mb-2 text-lg">💰 Scoring Cards</h3>
                                <p className="text-white/80">Aces (10 pts), 10s (10 pts), 5s (5 pts)</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h3 className="font-bold text-white mb-2 text-lg">🎲 Bidding</h3>
                                <p className="text-white/80">Bid on how many points your team will score. Highest bidder chooses trump suit.</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                                <h3 className="font-bold text-white mb-2 text-lg">🃏 Gameplay</h3>
                                <p className="text-white/80">Follow suit if possible. Highest trump wins, otherwise highest card of lead suit.</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Lobby;
