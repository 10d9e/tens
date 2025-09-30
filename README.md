# Two Hundred Card Game

A modern web implementation of the classic New Brunswick card game "Two Hundred" (also known as "Deux Cents"). Play online with friends or AI bots in a beautiful, animated interface.

## Features

- 🎴 **Authentic Gameplay**: Faithful implementation of the traditional Two Hundred rules
- 🤖 **AI Bots**: Three difficulty levels (Easy, Medium, Hard) to fill tables
- 🎨 **Rich UI**: Beautiful card animations, fan layouts, and smooth transitions
- 📱 **Mobile Support**: Touch-optimized interface for mobile devices
- 💬 **In-Game Chat**: Chat with emojis and real-time messaging
- 🔊 **Sound Effects**: Audio feedback for card plays and game events
- 👥 **Multiplayer**: Real-time multiplayer with WebSocket support
- 🏆 **Spectator Mode**: Watch games in progress
- 📊 **Last Trick Viewer**: Review the previous trick
- 🎯 **Multiple Tables**: Lobby system supporting multiple concurrent games

## Game Rules

Two Hundred is a trick-taking card game for 4 players in 2 partnerships:

### Objective
Be the first team to reach 200 points by winning tricks containing valuable cards.

### Deck
- Modified 52-card deck (removes 2s, 3s, 4s, and 6s)
- 36 cards total, 9 cards per player
- Card ranking: A, K, Q, J, 10, 9, 8, 7, 5

### Scoring Cards
- **Aces**: 10 points each
- **10s**: 10 points each  
- **5s**: 5 points each
- Total: 100 points available per round

### Gameplay
1. **Bidding**: Players bid on how many points their team will score
2. **Trump Selection**: Highest bidder chooses the trump suit
3. **Trick-Taking**: Players must follow suit if possible
4. **Winning**: Highest trump wins, otherwise highest card of lead suit
5. **Scoring**: Teams accumulate points from won tricks

## Installation

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Setup
1. Clone the repository:
```bash
git clone <repository-url>
cd tens
```

2. Install dependencies:
```bash
npm install
```

3. Start the development servers:
```bash
npm run dev:full
```

This will start both the frontend (port 3000) and backend (port 3001) servers.

### Production Build
```bash
npm run build
npm run server
```

### Command Line Game (for testing and debugging)
```bash
npm run cli
```

The CLI version allows you to play against 3 AI bots to test game logic without the web interface. Perfect for debugging and understanding the game mechanics.

## Features

### 🎨 Modern UI Design
- **Tailwind CSS** - Beautiful, responsive design with glassmorphism effects
- **Smooth Animations** - Framer Motion powered transitions and micro-interactions
- **Mobile Responsive** - Optimized for all screen sizes
- **Dark Theme** - Elegant green card table aesthetic

### 🎮 Game Features
- **Real-time Multiplayer** - Play with friends online
- **AI Bot Players** - Three difficulty levels (Easy, Medium, Hard)
- **Lobby System** - Create and join tables
- **In-game Chat** - Communicate with other players
- **Last Trick Viewer** - Review previous tricks
- **Spectator Mode** - Watch games in progress

## Project Structure

```
tens/
├── src/
│   ├── components/          # React components
│   │   ├── Card.tsx        # Card component with animations
│   │   ├── GameTable.tsx   # Main game interface
│   │   ├── Lobby.tsx       # Lobby and table selection
│   │   ├── PlayerHand.tsx  # Player's card hand
│   │   ├── TrickArea.tsx   # Center trick area
│   │   ├── BidInterface.tsx # Bidding interface
│   │   ├── ChatPanel.tsx   # In-game chat
│   │   └── LastTrickViewer.tsx # Previous trick viewer
│   ├── store/              # Zustand state management
│   │   ├── gameStore.ts    # Game state
│   │   └── socketStore.ts  # WebSocket connection
│   ├── types/              # TypeScript type definitions
│   │   └── game.ts         # Game-related types
│   ├── utils/              # Utility functions
│   │   ├── gameLogic.ts    # Core game logic
│   │   └── botAI.ts        # AI bot implementation
│   ├── App.tsx             # Main app component
│   └── main.tsx            # App entry point
├── server/                 # Backend server
│   └── index.js            # Express + Socket.io server
├── cli-game.js             # Command line game for testing
├── test-cli.js             # CLI game test script
└── package.json            # Dependencies and scripts
```

## Technology Stack

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework for modern styling
- **Framer Motion** - Animations
- **Zustand** - State management
- **Socket.io Client** - Real-time communication
- **React Hot Toast** - Notifications

### Backend
- **Node.js** - Runtime
- **Express** - Web framework
- **Socket.io** - WebSocket server
- **CORS** - Cross-origin resource sharing

## AI Bot Implementation

The game includes three AI difficulty levels:

- **Easy**: Simple bidding based on hand value, plays highest value cards
- **Medium**: Considers position and trick-winning potential
- **Hard**: Advanced strategy with bluffing and game theory

## Mobile Support

The game is fully responsive and includes:
- Touch-optimized card interactions
- Mobile-friendly UI layouts
- Gesture support for card selection
- Responsive design for all screen sizes

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is open source and available under the MIT License.

## Acknowledgments

- Based on the traditional New Brunswick card game "Two Hundred"
- Inspired by the rich history of Canadian card games
- Thanks to the community for preserving this cultural game
