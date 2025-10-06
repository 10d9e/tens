import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { storeUsername, clearStoredUsername } from '../utils/cookieUtils';

interface UsernameEditorProps {
    currentUsername: string;
    onUsernameUpdate: (newUsername: string) => void;
    onClearUsername: () => void;
}

const UsernameEditor: React.FC<UsernameEditorProps> = ({ currentUsername, onUsernameUpdate, onClearUsername }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [newUsername, setNewUsername] = useState(currentUsername);

    const handleSave = () => {
        if (newUsername.trim() && newUsername.trim() !== currentUsername) {
            storeUsername(newUsername.trim());
            onUsernameUpdate(newUsername.trim());
            setIsEditing(false);
        } else if (newUsername.trim() === currentUsername) {
            setIsEditing(false);
        }
    };

    const handleCancel = () => {
        setNewUsername(currentUsername);
        setIsEditing(false);
    };

    const handleClearUsername = () => {
        clearStoredUsername();
        setIsEditing(false);
        onClearUsername(); // Call the callback to reset app state
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    if (isEditing) {
        return (
            <AnimatePresence>
                <motion.div
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2 }}
                >
                    <input
                        type="text"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        onKeyDown={handleKeyPress}
                        className="px-2 py-1 text-sm bg-white/20 border border-white/30 rounded text-white placeholder-white/60 focus:outline-none focus:ring-1 focus:ring-green-400 focus:border-transparent"
                        placeholder="Enter new username"
                        maxLength={20}
                        autoFocus
                    />
                    <button
                        onClick={handleSave}
                        className="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                        title="Save (Enter)"
                    >
                        ✓
                    </button>
                    <button
                        onClick={handleCancel}
                        className="px-2 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded transition-colors"
                        title="Cancel (Esc)"
                    >
                        ✕
                    </button>
                    <button
                        onClick={handleClearUsername}
                        className="px-2 py-1 text-xs bg-orange-500 hover:bg-orange-600 text-white rounded transition-colors"
                        title="Clear stored username"
                    >
                        🗑️
                    </button>
                </motion.div>
            </AnimatePresence>
        );
    }

    return (
        <div className="flex items-center gap-2 relative">
            <span className="text-sm text-white/80">Welcome, {currentUsername}!</span>
            <button
                onClick={() => setIsEditing(true)}
                className="px-2 py-1 text-xs bg-blue-500/20 hover:bg-blue-500/40 border border-blue-400/30 hover:border-blue-400/50 rounded text-blue-300 hover:text-blue-200 transition-all"
                title="Edit username"
            >
                ✏️
            </button>
        </div>
    );
};

export default UsernameEditor;
