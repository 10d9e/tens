import { Lobby, Table } from "../types/game";
import { v4 as uuidv4 } from 'uuid';
import { getRandomHumanName } from './gameLogic';
import { Player } from "../types/game";
import logger from '../logger';
import { defaultLobby } from './state';

// Create a Big Bub table with 2 bot players
export function createBigBubTable(): Table {
    const tableId = 'big-bub-table';
    const table: Table = {
        id: tableId,
        name: 'Big Bub',
        players: [],
        gameState: undefined,
        maxPlayers: 4,
        isPrivate: false,
        deckVariant: '36' as '36' | '40', // Default to 36-card deck
        scoreTarget: 200, // Default to 200 points
        hasKitty: false // Default to no kitty
    };

    // Add 2 bot players at North (0) and South (2), leaving East (1) and West (3) for human players
    const botSkills = ['medium', 'hard'];
    const botPositions = [0, 2]; // North and South
    for (let i = 0; i < 2; i++) {
        const botId = `bot-${uuidv4()}`;
        const botName = getRandomHumanName();
        const bot: Player = {
            id: botId,
            name: botName,
            isBot: true,
            botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
            position: botPositions[i] as 0 | 1 | 2 | 3,
            cards: [],
            score: 0,
            isReady: true
        };
        table.players.push(bot);
    }

    defaultLobby.tables.set(tableId, table);
    logger.info('Created Big Bub table with 2 bot players');
    return table;
}

// Create Acadie test table with kitty enabled
export function createAcadieTable(): void {
    const tableId = 'acadie-table';

    const table: Table = {
        id: tableId,
        name: 'Acadie',
        players: [],
        gameState: undefined,
        maxPlayers: 4,
        isPrivate: false,
        deckVariant: '40' as '36' | '40', // 40-card variant
        scoreTarget: 200,
        hasKitty: true, // Kitty enabled
        timeoutDuration: 300000 // 5 minutes (300,000 ms)
    };

    // Add 3 hard bot players
    const botSkills = ['hard', 'hard', 'hard'];
    for (let i = 0; i < 3; i++) {
        const botId = `bot-${uuidv4()}`;
        const botName = getRandomHumanName();
        const bot: Player = {
            id: botId,
            name: botName,
            isBot: true,
            botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
            position: i as 0 | 1 | 2 | 3,
            cards: [],
            score: 0,
            isReady: true
        };
        table.players.push(bot);
    }

    defaultLobby.tables.set(tableId, table);
    logger.info('Created Acadie test table with 3 hard bots, 40-card deck, kitty enabled');
}

// Create an Acadien test table with advanced bots
export function createAcadienTestTable() {
    const tableId = 'acadien-test-table';
    const table: Table = {
        id: tableId,
        name: 'Acadien Test Table',
        players: [],
        gameState: undefined,
        maxPlayers: 4,
        isPrivate: false,
        deckVariant: '36' as '36' | '40', // 36-card variant
        scoreTarget: 200,
        hasKitty: false,
        timeoutDuration: 300000 // 5 minutes
    };

    // Add 3 acadien bot players
    const botSkills = ['acadien', 'acadien', 'acadien'];
    for (let i = 0; i < 3; i++) {
        const botId = `bot-${uuidv4()}`;
        const botName = getRandomHumanName();
        const bot: Player = {
            id: botId,
            name: botName,
            isBot: true,
            botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
            position: i as 0 | 1 | 2 | 3,
            cards: [],
            score: 0,
            isReady: true
        };
        table.players.push(bot);
    }

    defaultLobby.tables.set(tableId, table);
    logger.info('Created Acadien test table with 3 acadien bots');
}
