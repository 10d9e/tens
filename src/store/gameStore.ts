import { create } from 'zustand';
import { Game, Player, Table, ChatMessage, Card } from '../types/game';

interface GameStore {
    currentGame: Game | null;
    currentTable: Table | null;
    currentPlayer: Player | null;
    lobby: Table[] | null;
    chatMessages: ChatMessage[];
    lastTrick: any;
    isBidding: boolean;
    selectedCard: string | null;
    bellAnimation: { playerId: string; timestamp: number } | null;
    trickWinnerAnimation: { playerId: string; timestamp: number } | null;
    completedRoundResults: {
        roundScores: { team1: number; team2: number };
        currentBid?: { points: number; suit?: string };
        contractorTeam?: 'team1' | 'team2';
        round: number;
        kittyDiscards?: Card[];
        previousTeamScores?: { team1: number; team2: number };
    } | null;
    showShuffleAnimation: boolean;
    showGlowEffect: boolean;
    gameEndedByExit: boolean;

    // Actions
    setCurrentGame: (game: Game | null) => void;
    setCurrentTable: (table: Table | null) => void;
    setCurrentPlayer: (player: Player | null) => void;
    setLobby: (lobby: Table[]) => void;
    addChatMessage: (message: ChatMessage) => void;
    setLastTrick: (trick: any) => void;
    setIsBidding: (bidding: boolean) => void;
    setSelectedCard: (cardId: string | null) => void;
    updatePlayerCards: (playerId: string, cards: any[]) => void;
    updateGame: (updates: Partial<Game>) => void;
    setBellAnimation: (playerId: string) => void;
    setTrickWinnerAnimation: (playerId: string) => void;
    setCompletedRoundResults: (results: any) => void;
    setShowShuffleAnimation: (show: boolean) => void;
    setShowGlowEffect: (show: boolean) => void;
    setGameEndedByExit: (ended: boolean) => void;
}

export const useGameStore = create<GameStore>((set) => ({
    currentGame: null,
    currentTable: null,
    currentPlayer: null,
    lobby: null,
    chatMessages: [],
    lastTrick: null,
    isBidding: false,
    selectedCard: null,
    bellAnimation: null,
    trickWinnerAnimation: null,
    completedRoundResults: null,
    showShuffleAnimation: false,
    showGlowEffect: false,
    gameEndedByExit: false,

    setCurrentGame: (game) => set({ currentGame: game }),
    setCurrentTable: (table) => set({ currentTable: table }),
    setCurrentPlayer: (player) => set({ currentPlayer: player }),
    setLobby: (lobby) => set({ lobby }),
    addChatMessage: (message) => set((state) => ({
        chatMessages: [...state.chatMessages, message]
    })),
    setLastTrick: (trick) => set({ lastTrick: trick }),
    setIsBidding: (bidding) => set({ isBidding: bidding }),
    setSelectedCard: (cardId) => set({ selectedCard: cardId }),

    updatePlayerCards: (playerId, cards) => set((state) => {
        if (!state.currentGame) return state;

        const updatedGame = {
            ...state.currentGame,
            players: state.currentGame.players.map(p =>
                p.id === playerId ? { ...p, cards } : p
            )
        };

        return { currentGame: updatedGame };
    }),

    updateGame: (updates) => set((state) => {
        if (!state.currentGame) return state;

        return {
            currentGame: { ...state.currentGame, ...updates }
        };
    }),

    setBellAnimation: (playerId) => set({
        bellAnimation: { playerId, timestamp: Date.now() }
    }),

    setTrickWinnerAnimation: (playerId) => set({
        trickWinnerAnimation: { playerId, timestamp: Date.now() }
    }),

    setCompletedRoundResults: (results) => set({ completedRoundResults: results }),

    setShowShuffleAnimation: (show) => set({ showShuffleAnimation: show }),

    setShowGlowEffect: (show) => set({ showGlowEffect: show }),

    setGameEndedByExit: (ended) => set({ gameEndedByExit: ended })
}));
