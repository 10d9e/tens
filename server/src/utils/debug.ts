import logger from "../logger";
import { GameError } from "../types/errors";
import { Card, Player, Game } from "../types/game";

// Function to debug and print all players' cards
export function debugPrintAllPlayerCards(game: Game, context: string = ''): void {
    logger.debug(`\n🃏 DEBUG: All Players' Cards ${context ? `(${context})` : ''}`);
    logger.debug('='.repeat(50));
    game.players.forEach((player: Player, index: number) => {
        const playerType = player.isBot ? '🤖 BOT' : '👤 HUMAN';
        const cardsList = player.cards.map(card => {
            const suitSymbols = {
                'hearts': '❤️',
                'diamonds': '♦️',
                'clubs': '♣️',
                'spades': '♠️'
            };
            return `${card.rank}${suitSymbols[card.suit] || card.suit}`;
        }).join(', ');
        logger.debug(`${index + 1}. ${player.name} (${playerType}) - ${player.cards.length} cards: [${cardsList}]`);
    });
    logger.debug('='.repeat(50));
    logger.debug(`Total cards in play: ${game.players.reduce((sum: number, player: Player) => sum + player.cards.length, 0)}/36\n`);

    // if the card count in everyone's hand is not equal, throw an error
    const cardCounts = game.players.map(player => player.cards.length);
    if (cardCounts.some(count => count !== cardCounts[0])) {
        logger.error('🚨🚨🚨🚨 ERROR: Card counts are not equal');
        throw new GameError('🚨🚨🚨🚨 ERROR: Card counts are not equal', game);
    }
}

// Function to debug kitty state
export function debugKittyState(game: Game, context: string = ''): void {
    logger.debug(`\n🐱 DEBUG: Kitty State ${context ? `(${context})` : ''}`);
    logger.debug('='.repeat(50));
    logger.debug(`Round: ${game.round}`);
    logger.debug(`HasKitty: ${game.hasKitty}`);
    logger.debug(`KittyPhaseCompleted: ${game.kittyPhaseCompleted}`);
    logger.debug(`DeckVariant: ${game.deckVariant}`);
    logger.debug(`Kitty exists: ${!!game.kitty}`);
    logger.debug(`Kitty length: ${game.kitty?.length || 0}`);
    logger.debug(`Kitty cards: ${game.kitty?.map((c: Card) => `${c.rank}${c.suit}`).join(', ') || 'None'}`);
    logger.debug(`Phase: ${game.phase}`);
    logger.debug(`Current Player: ${game.currentPlayer}`);
    logger.debug('='.repeat(50));
}
