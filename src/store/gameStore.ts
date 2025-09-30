import { create } from 'zustand';
import { GameState, Player, LobbyTable, ChatMessage } from '../types/game';

interface GameStore {
    currentGame: GameState | null;
    currentTable: LobbyTable | null;
    currentPlayer: Player | null;
    lobby: LobbyTable[] | null;
    chatMessages: ChatMessage[];
    lastTrick: any;
    isBidding: boolean;
    selectedCard: string | null;

    // Actions
    setCurrentGame: (game: GameState | null) => void;
    setCurrentTable: (table: LobbyTable | null) => void;
    setCurrentPlayer: (player: Player | null) => void;
    setLobby: (lobby: LobbyTable[]) => void;
    addChatMessage: (message: ChatMessage) => void;
    setLastTrick: (trick: any) => void;
    setIsBidding: (bidding: boolean) => void;
    setSelectedCard: (cardId: string | null) => void;
    updatePlayerCards: (playerId: string, cards: any[]) => void;
    updateGameState: (updates: Partial<GameState>) => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
    currentGame: null,
    currentTable: null,
    currentPlayer: null,
    lobby: null,
    chatMessages: [],
    lastTrick: null,
    isBidding: false,
    selectedCard: null,

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

    updateGameState: (updates) => set((state) => {
        if (!state.currentGame) return state;

        return {
            currentGame: { ...state.currentGame, ...updates }
        };
    })
}));
