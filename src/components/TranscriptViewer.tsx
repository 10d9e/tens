import React, { useState } from 'react';
import TranscriptSelector from './TranscriptSelector';
import GameTranscriptView from './GameTranscriptView';

interface TranscriptViewerProps {
    onClose: () => void;
}

const TranscriptViewer: React.FC<TranscriptViewerProps> = ({ onClose }) => {
    const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

    const handleSelectTranscript = (gameId: string) => {
        setSelectedGameId(gameId);
    };

    const handleBackToSelector = () => {
        setSelectedGameId(null);
    };

    const handleClose = () => {
        setSelectedGameId(null);
        onClose();
    };

    if (selectedGameId) {
        return <GameTranscriptView gameId={selectedGameId} onClose={handleBackToSelector} />;
    }

    return <TranscriptSelector onSelectTranscript={handleSelectTranscript} onClose={handleClose} />;
};

export default TranscriptViewer;

