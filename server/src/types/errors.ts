import { Game } from './game';

/**
 * Custom error class that includes an optional Game reference.
 * This allows you to attach game context to errors for better debugging
 * and error handling in socket event handlers.
 */
export class GameError extends Error {
    public game?: Game;
    public code?: string;

    constructor(message: string, game?: Game, code?: string) {
        super(message);
        this.name = 'GameError';

        if (game !== undefined) {
            this.game = game;
        }

        if (code !== undefined) {
            this.code = code;
        }

        // Maintains proper stack trace for where our error was thrown (only available on V8)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, GameError);
        }
    }
}

