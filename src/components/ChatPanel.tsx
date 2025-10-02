import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';
// import { ChatMessage } from '../types/game';

interface ChatPanelProps {
    onClose: () => void;
    onSendMessage: (message: string) => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ onClose, onSendMessage }) => {
    const { chatMessages } = useGameStore();
    const [message, setMessage] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [chatMessages]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (message.trim()) {
            onSendMessage(message.trim());
            setMessage('');
        }
    };

    const emojis = ['😀', '😂', '😍', '🤔', '😎', '🎉', '👍', '👎', '❤️', '🔥', '💯', '🎯'];

    const handleEmojiClick = (emoji: string) => {
        onSendMessage(emoji);
    };

    return (
        <motion.div
            className="fixed right-4 top-4 w-80 h-96 bg-black bg-opacity-90 rounded-lg border border-green-500 border-opacity-30 backdrop-blur-sm z-50 flex flex-col"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
        >
            {/* Header */}
            <div className="flex justify-between items-center p-3 border-b border-green-500 border-opacity-30">
                <h3 className="font-semibold">Chat</h3>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition-colors"
                >
                    ✕
                </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                <AnimatePresence>
                    {chatMessages.map((msg) => (
                        <motion.div
                            key={msg.id}
                            className={`text-sm ${msg.type === 'system' ? 'text-yellow-400' : 'text-white'
                                }`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                        >
                            {msg.type === 'system' ? (
                                <div className="text-center text-yellow-400 italic">
                                    {msg.message}
                                </div>
                            ) : (
                                <div>
                                    <span className="font-semibold text-green-400">
                                        {msg.playerName}:
                                    </span>{' '}
                                    <span>{msg.message}</span>
                                </div>
                            )}
                        </motion.div>
                    ))}
                </AnimatePresence>
                <div ref={messagesEndRef} />
            </div>

            {/* Emoji Picker */}
            <div className="p-2 border-t border-green-500 border-opacity-30">
                <div className="flex flex-wrap gap-1 mb-2">
                    {emojis.map((emoji) => (
                        <button
                            key={emoji}
                            onClick={() => handleEmojiClick(emoji)}
                            className="w-8 h-8 text-lg hover:bg-white hover:bg-opacity-10 rounded transition-colors"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>

            {/* Message Input */}
            <form onSubmit={handleSubmit} className="p-3 border-t border-green-500 border-opacity-30">
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="flex-1 p-2 bg-white bg-opacity-10 border border-green-500 border-opacity-30 rounded text-white placeholder-green-200 text-sm"
                        maxLength={200}
                    />
                    <button
                        type="submit"
                        disabled={!message.trim()}
                        className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-sm font-semibold transition-colors"
                    >
                        Send
                    </button>
                </div>
            </form>
        </motion.div>
    );
};

export default ChatPanel;
