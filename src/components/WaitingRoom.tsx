import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';

const WaitingRoom: React.FC = () => {
    const { currentTable, currentPlayer } = useGameStore();
    const { leaveTable, addBot, removeBot, movePlayer, startGame } = useSocketStore();
    const [selectedSkill, setSelectedSkill] = useState<'easy' | 'medium' | 'hard' | 'acadien'>('medium');

    if (!currentTable || !currentPlayer) {
        return <div>Loading...</div>;
    }

    const isCreator = currentTable.creator === currentPlayer.name;
    const playersNeeded = currentTable.maxPlayers - currentTable.players.length;
    const canStartGame = currentTable.players.length === currentTable.maxPlayers;

    const handleLeaveTable = () => {
        leaveTable(currentTable.id);
    };

    const handleAddBot = (position: number) => {
        if (currentTable) {
            addBot(currentTable.id, position, selectedSkill);
        }
    };

    const handleRemoveBot = (botId: string) => {
        if (currentTable) {
            removeBot(currentTable.id, botId);
        }
    };

    const handleMovePlayer = (newPosition: number) => {
        if (currentTable) {
            movePlayer(currentTable.id, newPosition);
        }
    };

    const handleStartGame = () => {
        if (currentTable) {
            startGame(currentTable.id);
        }
    };

    const getPlayerPosition = (position: number) => {
        const positions = ['North', 'East', 'South', 'West'];
        return positions[position] || 'Unknown';
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900">
            {/* Fixed Logo */}
            <img
                src="/header-logo.png"
                alt="200 Logo"
                className="header-logo"
            />

            {/* Header */}
            <div className="flex justify-between items-center p-2 bg-white/10 backdrop-blur-md border-b border-white/20 relative">
                <div className="flex items-center gap-6 header-content">
                    <h1 className="text-2xl font-bold text-white">Waiting Room</h1>
                </div>
                <div className="text-white text-right">
                    🃏 {currentPlayer.name}
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-6 py-8 flex justify-center">
                <motion.div
                    className="bg-white/10 backdrop-blur-md rounded p-8 border border-white/20 shadow-2xl max-w-4xl w-full"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="text-center mb-8">
                        <h2 className="text-3xl font-bold text-white mb-4">
                            {currentTable.name}
                        </h2>
                        <div className="text-green-200 text-lg">
                            {canStartGame ? (
                                <span className="text-green-400 font-semibold">Ready to start!</span>
                            ) : (
                                <span>Waiting for {playersNeeded} more player{playersNeeded !== 1 ? 's' : ''}...</span>
                            )}
                        </div>
                    </div>

                    {/* Bot Configuration for Creator */}
                    {isCreator && (
                        <div className="bg-white/5 rounded-xl p-6 mb-6">
                            <h3 className="text-xl font-bold text-white mb-4">🤖 Bot Configuration</h3>
                            <div className="flex items-center gap-4 mb-4">
                                <label className="text-white font-medium">Bot Skill Level:</label>
                                <select
                                    value={selectedSkill}
                                    onChange={(e) => setSelectedSkill(e.target.value as 'easy' | 'medium' | 'hard' | 'acadien')}
                                    className="px-3 py-2 rounded-lg bg-white/10 border border-white/30 text-white focus:outline-none focus:ring-2 focus:ring-green-400"
                                >
                                    <option value="easy">Easy 🤖</option>
                                    <option value="medium">Medium 🤖🤖</option>
                                    <option value="hard">Hard 🤖🤖🤖</option>
                                    <option value="acadien">Acadien 🧠</option>
                                </select>
                            </div>
                            <p className="text-white/70 text-sm">
                                Click on empty slots below to add bots, or click on existing bots to remove them.
                            </p>
                        </div>
                    )}

                    {/* Players Diamond Layout - 3x3 Grid */}
                    <div className="flex justify-center mb-8">
                        <div className="grid grid-cols-3 gap-4 w-96">
                            {/* Row 1 */}
                            <div></div> {/* Empty top-left */}
                            <div className="flex justify-center">
                                {(() => {
                                    const index = 0; // North
                                    const player = currentTable.players.find(p => p.position === index);
                                    const position = getPlayerPosition(index);
                                    return (
                                        <motion.div
                                            key={index}
                                            className={`p-2 rounded-xl border-2 transition-all duration-300 w-32 h-24 ${player
                                                ? 'bg-green-500/20 border-green-400 text-white'
                                                : 'bg-slate-500 border-slate-400 text-white'
                                                } ${(isCreator || !player) ? 'cursor-pointer' : ''}`}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.3, delay: index * 0.1 }}
                                            onClick={() => {
                                                if (isCreator) {
                                                    if (player) {
                                                        if (player.isBot) {
                                                            handleRemoveBot(player.id);
                                                        }
                                                    } else {
                                                        handleAddBot(index);
                                                    }
                                                } else if (!player) {
                                                    handleMovePlayer(index);
                                                }
                                            }}
                                        >
                                            <div className="text-center">
                                                <div className="text-xs font-bold mb-1">{position}</div>
                                                <div className="text-xs mb-1">
                                                    <span className="text-blue-300">Team 1</span>
                                                </div>
                                                {player ? (
                                                    <div>
                                                        <div className="text-xs font-semibold">
                                                            {player.name} {player.isBot && '🤖'}
                                                        </div>
                                                        <div className="text-xs opacity-75">
                                                            {player.isBot ? player.botSkill : 'Human'}
                                                        </div>
                                                        {player.id === currentPlayer.id && (
                                                            <div className="text-xs text-blue-300">(You)</div>
                                                        )}
                                                        {isCreator && player.isBot && (
                                                            <div className="text-xs text-red-300">Click to remove</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="text-xs">Empty</div>
                                                        {isCreator && (
                                                            <div className="text-xs text-green-300">Click to add bot</div>
                                                        )}
                                                        {!isCreator && (
                                                            <div className="text-xs text-blue-300">Click to move here</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })()}
                            </div>
                            <div></div> {/* Empty top-right */}

                            {/* Row 2 */}
                            <div className="flex justify-center">
                                {(() => {
                                    const index = 3; // West
                                    const player = currentTable.players.find(p => p.position === index);
                                    const position = getPlayerPosition(index);
                                    return (
                                        <motion.div
                                            key={index}
                                            className={`p-2 rounded-xl border-2 transition-all duration-300 w-32 h-24 ${player
                                                ? 'bg-green-500/20 border-green-400 text-white'
                                                : 'bg-slate-500 border-slate-400 text-white'
                                                } ${(isCreator || !player) ? 'cursor-pointer' : ''}`}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.3, delay: index * 0.1 }}
                                            onClick={() => {
                                                if (isCreator) {
                                                    if (player) {
                                                        if (player.isBot) {
                                                            handleRemoveBot(player.id);
                                                        }
                                                    } else {
                                                        handleAddBot(index);
                                                    }
                                                } else if (!player) {
                                                    handleMovePlayer(index);
                                                }
                                            }}
                                        >
                                            <div className="text-center">
                                                <div className="text-xs font-bold mb-1">{position}</div>
                                                <div className="text-xs mb-1">
                                                    <span className="text-red-300">Team 2</span>
                                                </div>
                                                {player ? (
                                                    <div>
                                                        <div className="text-xs font-semibold">
                                                            {player.name} {player.isBot && '🤖'}
                                                        </div>
                                                        <div className="text-xs opacity-75">
                                                            {player.isBot ? player.botSkill : 'Human'}
                                                        </div>
                                                        {player.id === currentPlayer.id && (
                                                            <div className="text-xs text-blue-300">(You)</div>
                                                        )}
                                                        {isCreator && player.isBot && (
                                                            <div className="text-xs text-red-300">Click to remove</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="text-xs">Empty</div>
                                                        {isCreator && (
                                                            <div className="text-xs text-green-300">Click to add bot</div>
                                                        )}
                                                        {!isCreator && (
                                                            <div className="text-xs text-blue-300">Click to move here</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })()}
                            </div>
                            <div className="flex items-center justify-center">
                                <div className="text-white/40 text-sm">Table</div>
                            </div>
                            <div className="flex justify-center">
                                {(() => {
                                    const index = 1; // East
                                    const player = currentTable.players.find(p => p.position === index);
                                    const position = getPlayerPosition(index);
                                    return (
                                        <motion.div
                                            key={index}
                                            className={`p-2 rounded-xl border-2 transition-all duration-300 w-32 h-24 ${player
                                                ? 'bg-green-500/20 border-green-400 text-white'
                                                : 'bg-slate-500 border-slate-400 text-white'
                                                } ${(isCreator || !player) ? 'cursor-pointer' : ''}`}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.3, delay: index * 0.1 }}
                                            onClick={() => {
                                                if (isCreator) {
                                                    if (player) {
                                                        if (player.isBot) {
                                                            handleRemoveBot(player.id);
                                                        }
                                                    } else {
                                                        handleAddBot(index);
                                                    }
                                                } else if (!player) {
                                                    handleMovePlayer(index);
                                                }
                                            }}
                                        >
                                            <div className="text-center">
                                                <div className="text-xs font-bold mb-1">{position}</div>
                                                <div className="text-xs mb-1">
                                                    <span className="text-red-300">Team 2</span>
                                                </div>
                                                {player ? (
                                                    <div>
                                                        <div className="text-xs font-semibold">
                                                            {player.name} {player.isBot && '🤖'}
                                                        </div>
                                                        <div className="text-xs opacity-75">
                                                            {player.isBot ? player.botSkill : 'Human'}
                                                        </div>
                                                        {player.id === currentPlayer.id && (
                                                            <div className="text-xs text-blue-300">(You)</div>
                                                        )}
                                                        {isCreator && player.isBot && (
                                                            <div className="text-xs text-red-300">Click to remove</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="text-xs">Empty</div>
                                                        {isCreator && (
                                                            <div className="text-xs text-green-300">Click to add bot</div>
                                                        )}
                                                        {!isCreator && (
                                                            <div className="text-xs text-blue-300">Click to move here</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })()}
                            </div>

                            {/* Row 3 */}
                            <div></div> {/* Empty bottom-left */}
                            <div className="flex justify-center">
                                {(() => {
                                    const index = 2; // South
                                    const player = currentTable.players.find(p => p.position === index);
                                    const position = getPlayerPosition(index);
                                    return (
                                        <motion.div
                                            key={index}
                                            className={`p-2 rounded-xl border-2 transition-all duration-300 w-32 h-24 ${player
                                                ? 'bg-green-500/20 border-green-400 text-white'
                                                : 'bg-slate-500 border-slate-400 text-white'
                                                } ${(isCreator || !player) ? 'cursor-pointer' : ''}`}
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            transition={{ duration: 0.3, delay: index * 0.1 }}
                                            onClick={() => {
                                                if (isCreator) {
                                                    if (player) {
                                                        if (player.isBot) {
                                                            handleRemoveBot(player.id);
                                                        }
                                                    } else {
                                                        handleAddBot(index);
                                                    }
                                                } else if (!player) {
                                                    handleMovePlayer(index);
                                                }
                                            }}
                                        >
                                            <div className="text-center">
                                                <div className="text-xs font-bold mb-1">{position}</div>
                                                <div className="text-xs mb-1">
                                                    <span className="text-blue-300">Team 1</span>
                                                </div>
                                                {player ? (
                                                    <div>
                                                        <div className="text-xs font-semibold">
                                                            {player.name} {player.isBot && '🤖'}
                                                        </div>
                                                        <div className="text-xs opacity-75">
                                                            {player.isBot ? player.botSkill : 'Human'}
                                                        </div>
                                                        {player.id === currentPlayer.id && (
                                                            <div className="text-xs text-blue-300">(You)</div>
                                                        )}
                                                        {isCreator && player.isBot && (
                                                            <div className="text-xs text-red-300">Click to remove</div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div>
                                                        <div className="text-xs">Empty</div>
                                                        {isCreator && (
                                                            <div className="text-xs text-green-300">Click to add bot</div>
                                                        )}
                                                        {!isCreator && (
                                                            <div className="text-xs text-blue-300">Click to move here</div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })()}
                            </div>
                            <div></div> {/* Empty bottom-right */}
                        </div>
                    </div>

                    {/* Game Info */}
                    <div className="bg-white/5 rounded-xl p-6 mb-8">
                        <h3 className="text-xl font-bold text-white mb-4">Game Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-white/80">
                            <div>
                                <strong>Players:</strong> {currentTable.players.length}/{currentTable.maxPlayers}
                            </div>
                            <div>
                                <strong>Table Type:</strong> {currentTable.isPrivate ? 'Private' : 'Public'}
                            </div>
                            <div>
                                <strong>Bots:</strong> {currentTable.players.filter(p => p.isBot).length}
                            </div>
                            <div>
                                <strong>Humans:</strong> {currentTable.players.filter(p => !p.isBot).length}
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4 justify-center">
                        {isCreator && (
                            <button
                                onClick={handleStartGame}
                                disabled={!canStartGame}
                                className="px-8 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-xl font-semibold text-white transition-all transform hover:scale-105 disabled:hover:scale-100 shadow-lg"
                            >
                                {canStartGame ? '🚀 Start Game' : '⏳ Waiting for Players'}
                            </button>
                        )}

                        <button
                            onClick={handleLeaveTable}
                            className="px-8 py-3 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl font-semibold text-white transition-all transform hover:scale-105 shadow-lg"
                        >
                            🚪 Leave Table
                        </button>
                    </div>

                    {/* Waiting Animation */}
                    {!canStartGame && (
                        <div className="text-center mt-8">
                            <div className="inline-flex items-center space-x-2 text-white/60">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Waiting for more players to join...</span>
                            </div>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default WaitingRoom;
