import React from 'react';
import { motion } from 'framer-motion';

interface RulesProps {
    onClose: () => void;
}

const Rules: React.FC<RulesProps> = ({ onClose }) => {
    return (
        <div className="min-h-screen bg-gradient-to-br from-green-900 via-green-800 to-green-900">
            {/* Fixed Logo */}
            <img
                src="/header-logo.png"
                alt="200 Logo"
                className="header-logo"
            />

            {/* Header */}
            <div className="flex justify-between items-center p-3 bg-white/10 backdrop-blur-md border-b border-white/20">
                <div className="flex items-center gap-6 header-content">
                    <h2 className="text-white text-xl font-bold">Game Rules</h2>
                </div>
                <div className="flex items-center gap-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-400/30 text-green-300 hover:text-green-200 transition-all text-sm font-medium rounded"
                    >
                        ← Back to Lobby
                    </button>
                </div>
            </div>

            {/* Rules Content */}
            <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-6 py-8">
                <motion.div
                    className="max-w-4xl w-full"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    <div className="bg-white/10 backdrop-blur-md p-8 shadow-2xl rounded-lg">
                        <div className="prose prose-invert max-w-none text-white/90">
                            <h2 className="text-3xl font-bold text-white mb-6">How to Play 200 Card Game</h2>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Getting Started</h3>
                            <p>
                                Welcome to the 200 Card Game! This is a partnership trick-taking game for 4 players where North and South play against East and West.
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li><strong>Create or Join a Table:</strong> Use the lobby to create a new table or join an existing one</li>
                                <li><strong>Table Settings:</strong> Choose between 36-card (standard) or 40-card (with kitty) decks</li>
                                <li><strong>Score Targets:</strong> Set your game to 200, 300, 500, or 1000 points</li>
                                <li><strong>Private Tables:</strong> Create password-protected tables for private games</li>
                                <li><strong>Bot Players:</strong> Add AI bots to fill empty seats with different skill levels</li>
                            </ul>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Card Values and Ranking</h3>
                            <p>
                                The game uses either a 36-card deck (A-K-Q-J-10-9-8-7-5) or 40-card deck (A-K-Q-J-10-9-8-7-6-5) depending on your table settings.
                            </p>
                            <p className="mt-4">Card point values:</p>
                            <ul className="list-disc pl-6 space-y-1">
                                <li>each ace: <strong>10 points</strong></li>
                                <li>each ten: <strong>10 points</strong></li>
                                <li>each five: <strong>5 points</strong></li>
                                <li>each six (40-card deck only): <strong>5 points</strong></li>
                                <li>other cards: <strong>0 points</strong></li>
                            </ul>
                            <p className="mt-2">Total points in deck: <strong>100 points (36-card) or 120 points (40-card)</strong></p>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Game Flow</h3>
                            <p>
                                The game is fully automated in this interface. The system handles all dealing, shuffling, and turn management automatically.
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li><strong>Automatic Dealing:</strong> Cards are dealt automatically to all players</li>
                                <li><strong>Turn Indicators:</strong> The interface shows whose turn it is with visual cues</li>
                                <li><strong>Timer System:</strong> Each player has a time limit for their turn (configurable when creating tables)</li>
                                <li><strong>Card Animation:</strong> Watch cards being played with smooth animations</li>
                                <li><strong>Real-time Updates:</strong> See all game actions as they happen</li>
                            </ul>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Bidding Interface</h3>
                            <p>
                                When it's your turn to bid, you'll see a bidding interface with the following options:
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li><strong>Bid Amount:</strong> Use the slider or buttons to select your bid (50-100 points)</li>
                                <li><strong>Trump Suit:</strong> Choose hearts ♥, diamonds ♦, clubs ♣, or spades ♠</li>
                                <li><strong>Pass Button:</strong> Click "Pass" if you don't want to bid</li>
                                <li><strong>Visual Feedback:</strong> See current bids and who has passed</li>
                                <li><strong>Timer:</strong> Watch the countdown timer for your turn</li>
                            </ul>
                            <p className="mt-4">
                                <strong>Bidding Rules:</strong> Minimum bid is 50, all bids must be multiples of 5, and each bid must be higher than the last.
                                Once you pass, you cannot bid again in that round.
                            </p>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Playing Cards</h3>
                            <p>
                                When it's your turn to play a card, you'll see your hand at the bottom of the screen. Here's how to play:
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li><strong>Click to Play:</strong> Click on any card in your hand to play it</li>
                                <li><strong>Follow Suit:</strong> You must play a card of the same suit as the lead card if you have one</li>
                                <li><strong>Trump or Discard:</strong> If you can't follow suit, you can play any card (trump or discard)</li>
                                <li><strong>Visual Cues:</strong> The interface highlights valid plays and shows the current trick</li>
                                <li><strong>Card Values:</strong> Focus on winning tricks with Aces, 10s, 5s, and 6s (in 40-card games)</li>
                            </ul>
                            <p className="mt-4">
                                <strong>Strategy Tip:</strong> Try to win tricks containing point cards while avoiding giving away valuable cards to opponents.
                            </p>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Scoring and Game Interface</h3>
                            <p>
                                The game interface automatically tracks all scores and displays them in real-time. You can see:
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li><strong>Team Scores:</strong> Current cumulative scores for both teams</li>
                                <li><strong>Round Scores:</strong> Points earned in the current round</li>
                                <li><strong>Bid Status:</strong> Whether the contractor made their bid</li>
                                <li><strong>Card Points:</strong> Value of cards won in each trick</li>
                                <li><strong>Game Progress:</strong> How close each team is to the target score</li>
                            </ul>
                            <p className="mt-4">
                                <strong>Scoring Rules:</strong> If the contractor's team makes their bid, they add their card points to their score.
                                If they fail, they subtract the bid amount. The defending team always adds their card points to their score.
                            </p>

                            <div className="bg-white/5 border border-white/10 rounded-lg p-4 my-6">
                                <p className="font-semibold mb-2">Example: Scores are NS:120, EW:100. NS bid 75.</p>
                                <ul className="space-y-2 text-sm">
                                    <li>• If NS take 85 card points, their new score is 205 and they win the game.</li>
                                    <li>• If NS take 75 card points, their new score is 195. If East or West bid they score their 25 points for a cumulative score of 125;
                                        if they both just passed their score stays at 100.</li>
                                    <li>• If NS take 70 card points they lose the 75 they bid and their score is now 45. EW can score their 30 points provided that one of them bid
                                        for a total of 130; if both just passed their score stays at 100.</li>
                                </ul>
                            </div>

                            <p>
                                A team's cumulative score can be negative. On the score sheet this is usually shown by drawing a box around the number - for example minus 95 is written as ⬜95⬜.
                                The team is said to be "in the box", or sometimes "in the hole" (shown by a circle rather than a box around the score). Failing in a contract is sometimes known as being "boxed".
                            </p>
                            <p>
                                The first team to achieve a score of <strong>200 points or more wins the game</strong>. If both teams reach 200 or more on the same deal then the bidding team wins.
                            </p>
                            <p>
                                The game also ends if one team reaches a negative score of 200 or worse while the other team's score is positive or zero. In that case the team with minus 200 or worse loses the game.
                            </p>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Kitty Feature (40-Card Games)</h3>
                            <p>
                                When you create a table with the 40-card deck option, you can enable the Kitty feature for an exciting variant of the game.
                            </p>
                            <ul className="list-disc pl-6 space-y-2">
                                <li>
                                    <strong>Kitty Cards:</strong> 4 cards are dealt face-down in the center of the table
                                </li>
                                <li>
                                    <strong>Kitty Interface:</strong> When you win the bid, you'll see a special kitty interface
                                </li>
                                <li>
                                    <strong>Take Kitty:</strong> Click "Take Kitty" to add the 4 kitty cards to your hand
                                </li>
                                <li>
                                    <strong>Discard Cards:</strong> Select 4 cards from your hand to discard back to the kitty
                                </li>
                                <li>
                                    <strong>Kitty Points:</strong> Any point cards in the discarded kitty go to the defending team
                                </li>
                            </ul>
                            <p className="mt-4">
                                <strong>Strategy:</strong> The kitty adds an extra layer of strategy - you might get valuable cards, but you must discard 4 cards back,
                                and any points in those discarded cards help your opponents!
                            </p>

                            <h3 className="text-2xl font-bold text-white mt-8 mb-4">Additional Features</h3>
                            <ul className="list-disc pl-6 space-y-2">
                                <li><strong>Chat System:</strong> Communicate with other players during the game</li>
                                <li><strong>Game Replays:</strong> View past games in the lobby's replay section</li>
                                <li><strong>Spectator Mode:</strong> Watch ongoing games without playing</li>
                                <li><strong>Bot Difficulty:</strong> Choose from Easy, Medium, Hard, or Acadien bot skill levels</li>
                                <li><strong>Real-time Updates:</strong> See all game actions as they happen with smooth animations</li>
                            </ul>
                        </div>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Rules;
