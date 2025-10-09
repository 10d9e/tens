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
            <motion.div
                className="max-w-4xl mx-auto"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
            >
                <div className="bg-white/10 backdrop-blur-md p-8 shadow-2xl">
                    <div className="prose prose-invert max-w-none text-white/90">
                        <h2 className="text-3xl font-bold text-white mb-6">Players and Cards</h2>
                        <p>
                            200 is generally agreed to be best for four players in partnerships - North and South play against East and West.
                        </p>
                        <p>
                            For the 4-player game without a kitty, a 36-card pack is created by removing all the 2's, 3's, 4's, 6's from a standard 52-card pack without jokers.
                            The cards in each suit rank from high to low: <strong>A-K-Q-J-10-9-8-7-5</strong>.
                        </p>

                        <p className="mt-4">In all forms of the game, the cards have point values as follows:</p>
                        <ul className="list-disc pl-6 space-y-1">
                            <li>each ace: <strong>10 points</strong></li>
                            <li>each ten: <strong>10 points</strong></li>
                            <li>each five: <strong>5 points</strong></li>
                            <li>other cards: <strong>0 points</strong></li>
                        </ul>
                        <p className="mt-2">So that there are <strong>100 card points</strong> in the deck altogether.</p>

                        <p className="mt-4">The dealing, bidding and play are all clockwise.</p>

                        <h3 className="text-2xl font-bold text-white mt-8 mb-4">Deal</h3>
                        <p>
                            The first dealer is chosen at random. For example, a player can shuffle the deck and deal single cards face up to the players starting with the player on the left.
                            The first player who receives a jack is the first dealer. After each hand, the turn to deal passes to the left. Before each deal, the cards are shuffled by the dealer
                            and cut by the opponent to dealer's right. The dealer then deals 9 cards face down to each player, in batches of three, starting with the player to dealer's left.
                        </p>

                        <h3 className="text-2xl font-bold text-white mt-8 mb-4">Bidding</h3>
                        <p>
                            Players now bid for the right to choose which suit will be trumps, each bid representing the number of points the bidder's partnership contracts to take in tricks if not outbid.
                        </p>
                        <p>
                            The player to the left of the dealer speaks first, and the bidding continues clockwise. The minimum bid is 50, all bids must be multiples of 5, and each bid must be higher than the last.
                            A player who does not wish to bid can pass, but having passed cannot bid again in that auction.
                        </p>
                        <p>
                            If all four players pass, the hands are thrown in without score and the next dealer deals. If there is a bid, the bidding continues for as many circuits as necessary
                            until three players have passed, or until someone bids 100, the highest possible bid.
                        </p>
                        <p>
                            The final (and highest) bidder becomes the contractor, and announces which suit will be trump for that hand.
                        </p>

                        <h3 className="text-2xl font-bold text-white mt-8 mb-4">Play</h3>
                        <p>
                            Having announced the trump suit, the contractor leads to the first trick. Players must follow suit if able to. A player who has no card of the suit led is free to play any card.
                            The trick is won by the highest trump in it, or, if it contains no trumps, by the highest card of the suit that was led. The winner of each trick leads to the next.
                        </p>
                        <p>
                            The objective is to win tricks that contain card points (Aces, 10's and 5's). Tricks without points have no value.
                        </p>
                        <p>
                            If the contractor fails to announce a trump suit before leading to the first trick, the suit of the first card played by the contractor automatically becomes trump.
                        </p>
                        <p>
                            Playing a trump when you have no card of the non-trump suit that was led is known as "cutting", no doubt from the French "couper", which means to trump in a card game,
                            but also literally "to cut". There is no obligation to try to win the trick or to cut when you are unable to follow suit - it is legal to discard from another suit.
                            Indeed if you expect your partner to win the trick you will probably want to discard a ten or five that might otherwise have been lost to the opponents.
                        </p>
                        <p>
                            Completed tricks are stored face down in front of a member of the team that won them and may not be looked at again by anyone until the end of the play.
                        </p>

                        <h3 className="text-2xl font-bold text-white mt-8 mb-4">Scoring</h3>
                        <p>
                            Scores are kept on paper. Each team begins with a score of zero.
                        </p>
                        <p>
                            When all the cards have been played, each team counts the value of the point cards in their tricks. If the contractor's team has at least as many card points as the final bid,
                            the total value of the cards in their tricks is added to their cumulative score. If the number of card points they took is less than the bid, the amount of the bid is subtracted
                            from their cumulative score.
                        </p>
                        <p>
                            The opposing team add whatever card points they took in tricks to their cumulative score, with one exception: if the contractor's opponents currently have a cumulative score of 100 or more,
                            then they can score for points in their tricks only if at least one member of their team bid during the auction. If they both passed at their first opportunity to speak,
                            they score nothing for the points in their tricks.
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

                        <h3 className="text-2xl font-bold text-white mt-8 mb-4">200 with a Kitty</h3>
                        <p>
                            If the standard rules are not followed, 200 With a Kitty (Two-Hundred with a Kitty) is one of the most popular variants of 200 currently adhered to.
                            It slightly increases the normal deck as used for the game 200 by using a 40 card deck. This deck is formed by removing all cards of four and under from a standard deck.
                            The ranking of the cards in this deck, are as follows (from highest to lowest): <strong>Ace, King, Queen, Jack, 10, 9, 8, 7, 6, 5</strong>.
                            Similar to the parent game, 200 With a Kitty is also played by four players playing in two partnerships.
                        </p>

                        <p className="mt-4">This variant is played identically to the standard game of 200 save the following differences:</p>
                        <ul className="list-disc pl-6 space-y-2">
                            <li>
                                <strong>Dealing Method:</strong> The dealer first deals each player a three card packet. After this the dealer deals two cards to the middle of the table
                                for formation of a kitty. The dealer then deals another packet consisting of three cards to each player, and then two more face-down to complete the kitty.
                                After this, the dealer then deals a final three card packet to each player. Each player should thus have nine face-down cards and a four card face-down kitty
                                is in the middle of the table.
                            </li>
                            <li>
                                <strong>Bidding and Kitty:</strong> The bidding is as normal, however the winning high bidder is entitled to take the four cards from the kitty into his hand
                                upon completion of the bidding. The player then selects any four cards from his hand to discard to form a new face-down kitty in the middle of the table.
                                After doing this, he then declares his choice of trump suit for the hand. At the end of the hand any card points found amongst the discarded four card kitty,
                                are awarded to the defending team.
                            </li>
                        </ul>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default Rules;
