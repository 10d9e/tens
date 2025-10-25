import { Lobby, Table } from "../types/game";
import { v4 as uuidv4 } from 'uuid';
import { getRandomHumanName } from './gameLogic';
import { Player } from "../types/game";
import logger from '../logger';
import { defaultLobby } from './state';

// Create multiple default tables with 3 bot players each
export function createStandardTables(numTables = 1): void {
    if (!defaultLobby) {
        throw new Error('Default lobby not found');
    }

    for (let tableNum = 1; tableNum <= numTables; tableNum++) {
        const tableId = tableNum === 1 ? 'standard-table' : `standard-table-${tableNum}`;
        const tableName = tableNum === 1 ? 'Standard Table' : `Standard Table ${tableNum}`;

        const table: Table = {
            id: tableId,
            name: tableName,
            players: [],
            maxPlayers: 4,
            isPrivate: false,
            deckVariant: '36', // Default to 36-card deck
            scoreTarget: 200, // Default to 200 points
            hasKitty: false, // Default to no kitty
            enforceOpposingTeamBidRule: true // Default to enforcing the rule
        };

        // Add 3 bot players
        // Position them sequentially (0, 1, 2) leaving position 3 for human player
        const botSkills = ['acadien', 'acadien', 'acadien'];
        for (let i = 0; i < 3; i++) {
            const botId = `bot-${uuidv4()}`;
            const botName = getRandomHumanName();
            const bot: Player = {
                id: botId,
                name: botName,
                isBot: true,
                botSkill: botSkills[i] as 'easy' | 'medium' | 'hard' | 'acadien',
                position: i as 0 | 1 | 2 | 3, // Sequential positions: 0, 1, 2
                cards: [],
                score: 0,
                isReady: true
            };
            table.players.push(bot);
        }

        defaultLobby.tables.set(tableId, table);
        logger.info(`Created standard table "${tableName}" with 3 acadien bots`);
    }
}

// create kitty tables
export function createKittyTables(numTables = 1): void {
    if (!defaultLobby) {
        throw new Error('Default lobby not found');
    }

    for (let tableNum = 1; tableNum <= numTables; tableNum++) {
        const tableId = tableNum === 1 ? 'kitty-table' : `kitty-table-${tableNum}`;
        const tableName = tableNum === 1 ? 'Kitty Table' : `Kitty Table ${tableNum}`;

        const table: Table = {
            id: tableId,
            name: tableName,
            players: [],
            maxPlayers: 4,
            isPrivate: false,
            deckVariant: '40',
            scoreTarget: 200,
            hasKitty: true,
            allowPointCardDiscards: false, // Default to not allowing point card discards
            timeoutDuration: 300000,
            enforceOpposingTeamBidRule: true // Default to enforcing the rule
        }

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
        logger.info(`Created kitty table "${tableName}" with kitty enabled`);
    }
}