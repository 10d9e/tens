import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import logger from './logger';
import { create3BotTables } from './utils/gameLogic';
import { createBigBubTable, createAcadieTable, createAcadienTestTable } from './utils/misc';
import { setupSocketEvents } from './utils/events';
import { startTimeoutCheck } from './utils/timeouts';

const app = express();
const server = createServer(app);

export const io = new SocketIOServer(server, {
    cors: {
        origin: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://192.168.2.15:3000",
            /^http:\/\/192\.168\.\d+\.\d+:3000$/,  // Allow any 192.168.x.x:3000
            process.env.FRONTEND_URL || "https://200.cards"  // Production frontend URL
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors({
    origin: [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://192.168.2.15:3000",
        /^http:\/\/192\.168\.\d+\.\d+:3000$/,  // Allow any 192.168.x.x:3000
        process.env.FRONTEND_URL || "https://200.cards"  // Production frontend URL
    ],
    credentials: true
}));
app.use(express.json());

// Serve static files from the React app build
app.use(express.static('dist'));

// Handle React routing, return all requests to React app
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Start timeout check
startTimeoutCheck();

// Setup socket events
setupSocketEvents();

// Create the default tables after SimpleBotAI is defined
create3BotTables(5);
createBigBubTable();
createAcadieTable();
createAcadienTestTable();

/* start server */
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
});
