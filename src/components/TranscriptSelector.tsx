import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocketStore } from '../store/socketStore';
import { logger } from '../utils/logging';

interface TranscriptMetadata {
    gameId: string;
    tableId: string;
    tableName?: string;
    startTime: number;
    endTime?: number;
    metadata: {
        deckVariant: '36' | '40';
        scoreTarget: number;
        hasKitty: boolean;
        playerNames: { [playerId: string]: string };
        playerPositions: { [playerId: string]: number };
    };
    entryCount: number;
}

interface TranscriptSelectorProps {
    onSelectTranscript: (gameId: string) => void;
    onClose: () => void;
}

const TranscriptSelector: React.FC<TranscriptSelectorProps> = ({ onSelectTranscript, onClose }) => {
    const { getAllTranscripts } = useSocketStore();
    const [transcripts, setTranscripts] = useState<TranscriptMetadata[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
    const [uploadError, setUploadError] = useState<string | null>(null);

    useEffect(() => {
        getAllTranscripts((fetchedTranscripts) => {
            logger.debug('Fetched transcripts:', fetchedTranscripts);
            setTranscripts(fetchedTranscripts);
            setLoading(false);
        });
    }, [getAllTranscripts]);

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleString();
    };

    const formatDuration = (startTime: number, endTime?: number) => {
        if (!endTime) return 'In progress';
        const durationMs = endTime - startTime;
        const minutes = Math.floor(durationMs / 60000);
        const seconds = Math.floor((durationMs % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    };

    const getPlayerNames = (metadata: TranscriptMetadata['metadata']) => {
        return Object.values(metadata.playerNames).join(', ');
    };

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadError(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const transcript = JSON.parse(content);

                // Validate transcript structure
                if (!transcript.gameId || !transcript.entries || !transcript.metadata) {
                    throw new Error('Invalid transcript file format');
                }

                // Store in sessionStorage for the viewer to access
                sessionStorage.setItem(`transcript_${transcript.gameId}`, content);

                logger.debug('Loaded transcript from file:', transcript.gameId);

                // Directly open the uploaded transcript
                onSelectTranscript(transcript.gameId);
            } catch (error) {
                logger.error('Error loading transcript file:', error);
                setUploadError('Invalid transcript file. Please upload a valid JSON transcript.');
            }
        };

        reader.onerror = () => {
            setUploadError('Error reading file. Please try again.');
        };

        reader.readAsText(file);

        // Reset the input
        event.target.value = '';
    };

    const filteredTranscripts = transcripts
        .filter(t => {
            if (!searchTerm) return true;
            const playerNames = getPlayerNames(t.metadata).toLowerCase();
            const tableName = (t.tableName || '').toLowerCase();
            const term = searchTerm.toLowerCase();
            return playerNames.includes(term) ||
                tableName.includes(term) ||
                t.gameId.toLowerCase().includes(term);
        })
        .sort((a, b) => {
            if (sortBy === 'newest') {
                return b.startTime - a.startTime;
            } else {
                return a.startTime - b.startTime;
            }
        });

    return (
        <AnimatePresence>
            <motion.div
                className="fixed inset-0 bg-black/80 flex items-center justify-center"
                style={{ zIndex: 9999 }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <motion.div
                    className="bg-gradient-to-br from-green-900 to-green-800 rounded-2xl p-8 border-2 border-green-500 shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-3xl font-bold text-white mb-2">Game Transcripts</h2>
                            <p className="text-green-200">Select a game to view its replay</p>
                        </div>
                        <div className="flex gap-2">
                            <label className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 rounded-lg text-blue-300 hover:text-blue-200 transition-all text-sm font-medium cursor-pointer">
                                📂 Load File
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleFileUpload}
                                    className="hidden"
                                />
                            </label>
                            <button
                                onClick={onClose}
                                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-lg text-red-300 hover:text-red-200 transition-all text-sm font-medium"
                            >
                                ✕ Close
                            </button>
                        </div>
                    </div>

                    {/* Upload Error Message */}
                    {uploadError && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-400/30 rounded-lg text-red-300 text-sm">
                            {uploadError}
                        </div>
                    )}

                    {/* Search and Sort */}
                    <div className="flex gap-4 mb-4">
                        <input
                            type="text"
                            placeholder="Search by table name, player names, or game ID..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                        />
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'newest' | 'oldest')}
                            className="px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40"
                        >
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                        </select>
                    </div>

                    {/* Transcript List */}
                    <div className="flex-1 overflow-y-auto space-y-3">
                        {loading ? (
                            <div className="text-center text-white py-8">
                                <div className="text-2xl mb-2">Loading transcripts...</div>
                            </div>
                        ) : filteredTranscripts.length === 0 ? (
                            <div className="text-center text-white/60 py-8">
                                {searchTerm ? (
                                    <>
                                        <div className="text-2xl mb-2">No transcripts found</div>
                                        <div className="text-sm">Try adjusting your search</div>
                                    </>
                                ) : (
                                    <>
                                        <div className="text-2xl mb-2">No transcripts available</div>
                                        <div className="text-sm">Complete a game to create a transcript</div>
                                    </>
                                )}
                            </div>
                        ) : (
                            filteredTranscripts.map((transcript) => (
                                <motion.div
                                    key={transcript.gameId}
                                    className="bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 p-4 cursor-pointer transition-all"
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => onSelectTranscript(transcript.gameId)}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className="text-white font-semibold text-lg">
                                                    {transcript.tableName || 'Unknown Table'}
                                                </div>
                                            </div>
                                            <div className="text-white/70 text-xs mb-1">
                                                {formatDate(transcript.startTime)}
                                            </div>
                                            <div className="text-green-200 text-sm">
                                                {getPlayerNames(transcript.metadata)}
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-white/80 text-sm">
                                                {transcript.metadata.scoreTarget} points
                                            </div>
                                            <div className="text-white/60 text-xs">
                                                {transcript.metadata.hasKitty ? '🐱 Kitty' : transcript.metadata.deckVariant + ' cards'}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 text-xs text-white/70">
                                        <div>⏱️ {formatDuration(transcript.startTime, transcript.endTime)}</div>
                                        <div>📝 {transcript.entryCount} actions</div>
                                        <div className="text-white/50">ID: {transcript.gameId.slice(0, 8)}...</div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </div>

                    {/* Footer Stats */}
                    {!loading && filteredTranscripts.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/20 text-center text-white/60 text-sm">
                            Showing {filteredTranscripts.length} of {transcripts.length} {transcripts.length === 1 ? 'transcript' : 'transcripts'}
                        </div>
                    )}
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default TranscriptSelector;

