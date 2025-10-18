import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
import { useSocketStore } from '../store/socketStore';
import UsernameEditor from './UsernameEditor';
import TranscriptViewer from './TranscriptViewer';
import { logger } from '../utils/logging';

interface LobbyProps {
    onResetUsername: () => void;
    onShowRules: () => void;
}

const Lobby: React.FC<LobbyProps> = ({ onResetUsername, onShowRules }) => {
    const { lobby, currentPlayer } = useGameStore();
    const { joinTable, joinAsSpectator, createTable, deleteTable, socket } = useSocketStore();
    const [newTableName, setNewTableName] = useState('');
    const [passwordPrompt, setPasswordPrompt] = useState<{ tableId: string; tableName: string } | null>(null);
    const [joinPassword, setJoinPassword] = useState('');
    const [showCreateTableDialog, setShowCreateTableDialog] = useState(false);
    const [showTranscriptViewer, setShowTranscriptViewer] = useState(false);

    // Table creation options
    const [timeoutDuration, setTimeoutDuration] = useState(30);
    const [deckVariant, setDeckVariant] = useState<'36' | '40'>('36');
    const [scoreTarget, setScoreTarget] = useState<200 | 300 | 500 | 1000>(200);
    const [hasKitty, setHasKitty] = useState(false);
    const [isPrivate, setIsPrivate] = useState(false);
    const [tablePassword, setTablePassword] = useState('');

    logger.debug('Lobby component render - lobby:', lobby, 'currentPlayer:', currentPlayer);

    // If lobby data is not available, request it from the server
    React.useEffect(() => {
        if (socket && !lobby && currentPlayer?.name) {
            logger.debug('Requesting lobby data from server');
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

    const handleWatchGame = (tableId: string) => {
        joinAsSpectator(tableId);
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
        logger.debug('Create table clicked, name:', newTableName);
        if (newTableName.trim()) {
            logger.debug('Creating table with name:', newTableName.trim());
            createTable(
                newTableName.trim(),
                timeoutDuration * 1000, // Convert to milliseconds
                deckVariant,
                scoreTarget,
                hasKitty,
                isPrivate,
                isPrivate ? tablePassword : undefined
            );
            // Reset form and close dialog
            resetCreateTableForm();
        } else {
            logger.debug('Table name is empty');
        }
    };

    const resetCreateTableForm = () => {
        setNewTableName('');
        setTimeoutDuration(30);
        setDeckVariant('36');
        setScoreTarget(200);
        setHasKitty(false);
        setIsPrivate(false);
        setTablePassword('');
        setShowCreateTableDialog(false);
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
            {/* Fixed Logo */}
            <img
                src="/header-logo.png"
                alt="200 Logo"
                className="header-logo"
            />

            {/* Header */}
            <div className="flex justify-between items-center p-3 bg-white/10 backdrop-blur-md border-b border-white/20">
                <div className="flex items-center gap-6 header-content">
                    <div className="flex items-center gap-4">
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
                    <button
                        onClick={() => setShowTranscriptViewer(true)}
                        className="px-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-purple-300 hover:text-purple-200 transition-all text-sm font-medium"
                        title="View Game Replays"
                    >
                        📼 Replays
                    </button>
                    <button
                        onClick={onShowRules}
                        className="px-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 text-blue-300 hover:text-blue-200 transition-all text-sm font-medium"
                        title="View Game Rules"
                    >
                        📖 Rules
                    </button>
                    <button
                        onClick={() => setShowCreateTableDialog(true)}
                        className="px-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-green-300 hover:text-green-200 transition-all text-sm font-medium"
                        title="Create Table"
                    >
                        ➕ Create Table
                    </button>

                </div>
            </div>

            <div style={{ padding: '20px' }}>
                <div>
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
                                    className={`bg-white/10 backdrop-blur-md rounded p-8 border transition-all duration-300 shadow-xl hover:shadow-2xl relative ${table.gameState
                                        ? 'border-yellow-400/40 hover:border-yellow-400/60 bg-gradient-to-br from-yellow-500/5 to-orange-500/5'
                                        : table.isPrivate
                                            ? 'border-red-400/30 hover:border-red-400/50'
                                            : 'border-white/20 hover:border-white/40'
                                        }`}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.5 }}
                                >
                                    {table.isPrivate && (
                                        <div className="absolute top-4 right-4 text-red-400 text-xl animate-pulse">
                                            🔒
                                        </div>
                                    )}
                                    {table.gameState && (
                                        <div className="absolute top-4 right-4 text-yellow-400 text-xl animate-pulse">
                                            🎮
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-xl font-bold text-white">{table.name}</h3>
                                                {table.gameState && (
                                                    <span className="px-2 py-1 bg-yellow-500/20 border border-yellow-400/30 rounded-full text-xs font-medium text-yellow-300 flex items-center gap-1 animate-pulse">
                                                        🎮 Game Active
                                                    </span>
                                                )}
                                                {table.isPrivate && (
                                                    <span className="px-2 py-1 bg-red-500/20 border border-red-400/30 rounded-full text-xs font-medium text-red-300 flex items-center gap-1 animate-pulse">
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
                                            {table.spectators && table.spectators.length > 0 && (
                                                <span className="px-3 py-1 bg-blue-500/20 rounded-full text-sm font-medium text-blue-300 border border-blue-400/30">
                                                    👁️ {table.spectators.length}
                                                </span>
                                            )}
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

                                        {table.spectators && table.spectators.length > 0 && (
                                            <>
                                                <div className="text-sm font-medium text-white/80 mb-3 mt-4">Spectators:</div>
                                                <div className="flex flex-wrap gap-2">
                                                    {table.spectators.map(spectator => (
                                                        <span
                                                            key={spectator.id}
                                                            className="px-3 py-1 bg-blue-500/30 rounded-lg text-sm font-medium text-blue-300 border border-blue-400/30"
                                                        >
                                                            {spectator.name} 👁️
                                                        </span>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <div className="text-sm">
                                            {!table.gameState && (
                                                <span className="text-white/80 font-medium">⏳ Waiting for Players</span>
                                            )}
                                        </div>

                                        <div className="flex gap-2">
                                            {/* Show Watch button if table has an active game and is public */}
                                            {!table.isPrivate && table.gameState && (
                                                <button
                                                    onClick={() => handleWatchGame(table.id)}
                                                    className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 rounded text-sm font-semibold text-white transition-all transform hover:scale-105 shadow-lg"
                                                    title="Watch this game"
                                                >
                                                    👁️ Watch
                                                </button>
                                            )}

                                            {/* Show Join Table button if table is not full and doesn't have an active game */}
                                            {table.players.length < table.maxPlayers && !table.gameState && (
                                                <button
                                                    onClick={() => handleJoinTable(table.id)}
                                                    className="px-6 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded text-sm font-semibold text-white transition-all transform hover:scale-105 shadow-lg"
                                                    style={{ backgroundColor: 'green', color: 'white', border: 'none', padding: '5px' }}
                                                >
                                                    Join Table
                                                </button>
                                            )}
                                        </div>
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

            {/* Create Table Dialog */}
            {showCreateTableDialog && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 overflow-y-auto p-4">
                    <motion.div
                        className="bg-white/10 backdrop-blur-md rounded-xl p-8 border border-white/20 shadow-2xl max-w-2xl w-full my-8"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2 }}
                    >
                        <h3 className="text-2xl font-bold text-white mb-6">
                            ➕ Create New Table
                        </h3>
                        <div className="max-h-[70vh] overflow-y-auto pr-2">
                            {/* Table Name - Full Width */}
                            <div className="mb-6">
                                <label className="block text-white font-medium mb-2">Table Name:</label>
                                <input
                                    type="text"
                                    placeholder="Enter table name..."
                                    value={newTableName}
                                    onChange={(e) => setNewTableName(e.target.value)}
                                    className="w-full px-4 py-3 rounded bg-white/10 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all"
                                    maxLength={30}
                                    autoFocus
                                />
                            </div>

                            {/* Two Column Layout */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                {/* Left Column */}
                                <div className="space-y-6">
                                    {/* Privacy Settings */}
                                    <div className="pb-4">
                                        <h4 className="text-lg font-semibold text-white mb-3">🔒 Privacy Settings</h4>
                                        <div className="space-y-3 pl-4">
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={isPrivate}
                                                    onChange={(e) => setIsPrivate(e.target.checked)}
                                                    className="w-4 h-4 text-green-500 bg-white/10 border-white/30 rounded focus:ring-green-400 focus:ring-2"
                                                />
                                                <span className="text-white font-medium">Make table private</span>
                                            </label>
                                            {isPrivate && (
                                                <div>
                                                    <input
                                                        type="password"
                                                        placeholder="Enter password..."
                                                        value={tablePassword}
                                                        onChange={(e) => setTablePassword(e.target.value)}
                                                        className="w-full px-3 py-2 rounded bg-white/10 border border-white/30 text-white placeholder-white/60 focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-transparent transition-all text-sm"
                                                        maxLength={50}
                                                    />
                                                    <p className="text-white/70 text-xs mt-2">
                                                        Players need this password to join.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Deck Variant */}
                                    <div className="pb-4">
                                        <h4 className="text-lg font-semibold text-white mb-3">🃏 Deck Variant</h4>
                                        <div className="space-y-2 pl-4">
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="deckVariant"
                                                    value="36"
                                                    checked={deckVariant === '36'}
                                                    onChange={(e) => setDeckVariant(e.target.value as '36' | '40')}
                                                    className="w-4 h-4 text-green-500 bg-white/10 border-white/30 focus:ring-green-400"
                                                />
                                                <span className="text-white">36 Cards (Standard)</span>
                                            </label>
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="deckVariant"
                                                    value="40"
                                                    checked={deckVariant === '40'}
                                                    onChange={(e) => setDeckVariant(e.target.value as '36' | '40')}
                                                    className="w-4 h-4 text-green-500 bg-white/10 border-white/30 focus:ring-green-400"
                                                />
                                                <span className="text-white">40 Cards (with 6s)</span>
                                            </label>
                                            <p className="text-white/70 text-xs mt-2">
                                                Standard or with 6s included.
                                            </p>
                                        </div>
                                    </div>

                                    {/* Kitty Feature - Only shown when 40-card deck is selected */}
                                    {deckVariant === '40' && (
                                        <div className="pb-4">
                                            <h4 className="text-lg font-semibold text-white mb-3">🐱 Kitty Feature</h4>
                                            <div className="space-y-2 pl-4">
                                                <label className="flex items-center space-x-2 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={hasKitty}
                                                        onChange={(e) => setHasKitty(e.target.checked)}
                                                        className="w-4 h-4 text-green-500 bg-white/10 border-white/30 focus:ring-green-400 rounded"
                                                    />
                                                    <span className="text-white">Enable Kitty</span>
                                                </label>
                                                <p className="text-white/70 text-xs mt-2">
                                                    Winner takes 4 cards from kitty, discards 4 back. Discards go to defending team.
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right Column */}
                                <div className="space-y-6">
                                    {/* Score Target */}
                                    <div className="pb-4">
                                        <h4 className="text-lg font-semibold text-white mb-3">🎯 Score Target</h4>
                                        <div className="space-y-2 pl-4">
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="scoreTarget"
                                                    value="200"
                                                    checked={scoreTarget === 200}
                                                    onChange={(e) => setScoreTarget(parseInt(e.target.value) as 200 | 300 | 500 | 1000)}
                                                    className="w-4 h-4 text-green-500 bg-white/10 border-white/30 focus:ring-green-400"
                                                />
                                                <span className="text-white">200 Points (Standard)</span>
                                            </label>
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="scoreTarget"
                                                    value="300"
                                                    checked={scoreTarget === 300}
                                                    onChange={(e) => setScoreTarget(parseInt(e.target.value) as 200 | 300 | 500 | 1000)}
                                                    className="w-4 h-4 text-green-500 bg-white/10 border-white/30 focus:ring-green-400"
                                                />
                                                <span className="text-white">300 Points</span>
                                            </label>
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="scoreTarget"
                                                    value="500"
                                                    checked={scoreTarget === 500}
                                                    onChange={(e) => setScoreTarget(parseInt(e.target.value) as 200 | 300 | 500 | 1000)}
                                                    className="w-4 h-4 text-green-500 bg-white/10 border-white/30 focus:ring-green-400"
                                                />
                                                <span className="text-white">500 Points</span>
                                            </label>
                                            <label className="flex items-center space-x-2 cursor-pointer">
                                                <input
                                                    type="radio"
                                                    name="scoreTarget"
                                                    value="1000"
                                                    checked={scoreTarget === 1000}
                                                    onChange={(e) => setScoreTarget(parseInt(e.target.value) as 200 | 300 | 500 | 1000)}
                                                    className="w-4 h-4 text-green-500 bg-white/10 border-white/30 focus:ring-green-400"
                                                />
                                                <span className="text-white">1000 Points</span>
                                            </label>
                                            <p className="text-white/70 text-xs mt-2">
                                                Target score to win the game.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Turn Timeout - Full Width */}
                            <div className="border-t border-white/20 pt-6 pb-4">
                                <h4 className="text-lg font-semibold text-white mb-3">⏱️ Turn Timeout</h4>
                                <div className="space-y-3 pl-4">
                                    <div className="flex items-center justify-between">
                                        <label className="text-white font-medium">
                                            {timeoutDuration} seconds
                                        </label>
                                        <span className="text-white/60 text-sm">
                                            {timeoutDuration <= 60 ? `${timeoutDuration}s` : `${Math.floor(timeoutDuration / 60)}m ${timeoutDuration % 60}s`}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="30"
                                        max="300"
                                        step="10"
                                        value={timeoutDuration}
                                        onChange={(e) => setTimeoutDuration(parseInt(e.target.value))}
                                        className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
                                        style={{
                                            background: `linear-gradient(to right, #4ade80 0%, #4ade80 ${((timeoutDuration - 30) / (300 - 30)) * 100}%, rgba(255,255,255,0.2) ${((timeoutDuration - 30) / (300 - 30)) * 100}%, rgba(255,255,255,0.2) 100%)`
                                        }}
                                    />
                                    <div className="flex justify-between text-xs text-white/60">
                                        <span>30s</span>
                                        <span>1m</span>
                                        <span>2m</span>
                                        <span>3m</span>
                                        <span>4m</span>
                                        <span>5m</span>
                                    </div>
                                    <p className="text-white/70 text-xs mt-2">
                                        Time limit for each turn during bidding and playing.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-4 mt-6 pt-6 border-t border-white/20">
                            <button
                                onClick={handleCreateTable}
                                disabled={!newTableName.trim()}
                                className="flex-1 px-6 py-3.5 bg-white/10 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed rounded-lg font-semibold text-white text-base transition-all transform hover:scale-[1.02] disabled:hover:scale-100 hover:shadow-lg disabled:opacity-50"
                            >
                                ✓ Create Table
                            </button>
                            <button
                                onClick={resetCreateTableForm}
                                className="px-8 py-3.5 bg-white/10 hover:bg-white/20 border-2 border-white/30 hover:border-white/50 rounded-lg font-semibold text-white text-base transition-all transform hover:scale-[1.02] hover:shadow-lg"
                            >
                                Cancel
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Transcript Viewer Modal */}
            {showTranscriptViewer && (
                <TranscriptViewer onClose={() => setShowTranscriptViewer(false)} />
            )}
        </div>
    );
};

export default Lobby;
