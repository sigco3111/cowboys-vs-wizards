# Showdown rulebook

The complete rules of the Showdown fight, as the prototype plays them. Where this page and `rules.js` disagree, the code is what runs and this page is wrong: fix it. Every card is in [cards.csv](cards.csv).

## 1. What you need to win

Each side has a **Base** with 5 orbs. A Base with no orbs loses. You bring a deck of 16 cards.

## 2. The cards

| Kind | Mark | What it is | Where it goes |
| --- | --- | --- | --- |
| Troop | ● | A fighter with attack, orbs, a type and sometimes keywords | The board, until defeated |
| Spell | ✦ | A one-time effect | The graveyard, once it resolves |
| Trap | ▲ | A card set face down that springs on an enemy attack | Face down, then the graveyard |
| Gear | ◆ | A card one of your troops carries | On that troop, and to the graveyard with it |
| Location | ■ | A place that changes the whole table | In play until another location replaces it |

**Orbs** are a troop's life. A troop with no orbs is defeated and goes to its owner's graveyard.

**Stars** set a troop's cost. 1 to 4 stars are free. 5 and 6 cost one **tribute**: one of your own troops, sent to the graveyard. 7 and up cost two.

**Type.** Every troop has one type: Lawman, Outlaw, Rig, Beast, Undead, Mage or Fiend. Some cards read it.

**Rarity** limits copies in a deck and its side deck together: 기본 any number, 일반 4, 고급 3, 희귀 2, 전설 1.

## 3. Setting up

1. Shuffle both decks. Each side draws 4 cards.
2. One side goes first. The side that goes second draws 1 more card.
3. Each side's board has 3 troop slots and 2 trap slots. There is one location slot for the whole table.

## 4. A turn

1. **Stand up.** Your troops that acted last turn can act again, and any that took cover leave it.
2. **Draw** one card. On turn 1 the first player does not draw.
   - If your deck is empty, your Base loses 1 orb instead.
   - If you already hold 6 cards, the card you draw is discarded.
3. **Play cards**, in any order, each at most once a turn:
   - one troop;
   - one other card: a spell, a piece of gear or a location;
   - one trap, set face down.
4. **Act** with each troop once: it attacks or it takes cover. Once any troop acts, you cannot play more cards this turn.
5. **End the turn.** Your stunned troops recover.

Nobody attacks on turn 1.

## 5. Attacking

Pick one of your troops, then what it attacks.

- **Resting.** A troop that was free cannot attack on the turn it arrives. A troop paid for with a tribute can.
- **Target.** You choose any enemy troop. If the enemy has a troop with Guard, you must choose a Guard troop.
- **The Base.** You may attack the Base directly only when the enemy has no troops. A direct attack removes orbs equal to your troop's attack.
- **Damage.** The target loses orbs equal to your troop's attack. Damage beyond its last orb hits its owner's Base.
- **Hitting back.** A target that survives deals its own attack to your troop. A defeated target does not hit back.

## 6. Taking cover

Instead of attacking, a troop may take cover, even on the turn it arrives. Until your next turn:

- damage beyond its last orb does not reach your Base;
- it does not hit back.

## 7. Traps

- You may hold 2 traps face down. Your opponent sees how many, not which.
- When an enemy troop attacks, your oldest face-down trap springs before the attack lands. One trap springs per attack.
- A trap springs on any attack, including one on your Base.
- An attack that a trap cancels, or whose attacker a trap defeats, is still that troop's action for the turn.

## 8. Gear and locations

- **Gear** goes on one of your troops and stays. A troop may carry any number. Gear that adds orbs can lift a troop above the orbs printed on its card.
- **Locations.** Only one location is in play. Playing one sends the location in play to its owner's graveyard, whoever played it. A location affects both sides: every troop of the type it names.
- You cannot play a location that has the same name as the one in play.

## 9. Keywords

| Keyword | Rule |
| --- | --- |
| 수호 | 적은 다른 부대나 기지보다 이 부대를 먼저 공격해야 합니다. |
| 속사 | 제물 없이 소환해도 등장한 턴에 공격할 수 있습니다. |
| 돌파 | 수호를 가진 적이 없다면 적 부대를 지나쳐 기지에 오브 1개 피해를 줄 수 있습니다. |
| 정찰 | 등장하면 카드를 한 장 뽑습니다. |
| 소생 | 등장하면 묘지에 있는 마지막 언데드 부대가 오브 1개로 돌아옵니다. |
| 휩쓸기 | 부대를 공격하면 나머지 적 부대가 모두 오브 1개를 잃습니다. |
| 최후의 저항 | 전투에서 쓰러지면 싸운 부대가 오브 1개를 잃습니다. |
| 유령화 | 주문의 대상이 될 수 없습니다. |

**Stunned** is a status, not a keyword: a stunned troop cannot attack on its owner's next turn. It can still take cover.

## 10. Rulings

- **Ride and Guard.** A rider cannot ride past a Guard troop. Riding past is always 1 orb, whatever the rider's attack. With no enemy troops a rider strikes the Base for its full attack like any troop.
- **Ride and traps.** A ride-past is an attack, so it springs a trap.
- **Raise and tributes.** Tributes go to the graveyard before the troop arrives, so a Wizard paid for with a Skeleton brings that Skeleton back. Raise does nothing when your board is full or no Undead troop is in your graveyard. The returning troop rests, whatever it cost, unless it has Quickdraw.
- **Scout.** If your deck is empty, Scout draws nothing and your Base loses nothing. If your hand is full, the card is discarded.
- **Sweep.** The other troops lose their orb after the fight is settled, and they do not hit back. Sweep does not fire on a direct attack on the Base. Damage from Sweep never reaches a Base.
- **Last Stand** fires in a fight, whether its troop attacked or was attacked. It does not fire for a tribute, a spell, a trap or Sweep. If both troops fall, it does nothing.
- **Ghostly** stops spells that choose a target. Hellfire chooses none, so it still burns a Ghostly troop. Traps and attacks are not spells.
- **Cover and Last Stand.** A troop in cover that is defeated still makes its Last Stand.
- **Bear Trap and gear.** A troop the trap defeats takes its gear to the graveyard.
- **Stun.** Stunning a troop that is already stunned is not allowed.
- **Zero attack.** A troop with no attack cannot attack. A location or gear that gives it attack lets it.
- **A full hand.** The limit is checked only when you draw.
- **Running out of turns.** A game still going after turn 80 goes to the side whose Base has more orbs.

## 11. Formats

- **Single duel.** One game.
- **Best of three.** First to win two games. The loser of a game goes first in the next. Between games you may swap cards between your deck and your side deck, one for one.
- **Side deck.** Up to 4 cards. Rarity limits count the deck and the side deck together.
- **Two players.** One screen, passed between turns. Each side plays the even-match deck for its faction.

## 12. Earning cards

- **The Trail.** Six duels, each a little harder, against opponents below full strength. The first win of each pays a new card, and finishing the Trail pays a pack.
- **Every win** offers a choice of two cards; you keep one. The choice has to be made before the next duel. When fewer than two cards are left to earn, nothing is offered.
- **Rivals.** Four, met in order after the Trail. The first win against each pays a pack (the last pays two), and two of them pay a new kind of card. Those two cards cannot be earned anywhere else until their rival is beaten.
- **Bounties.** A Wanted boss must be beaten five times. The fifth win captures its card, which is Legendary. The Lantern Wraith stands on the board from the start. The Graveyard Dragon lands by itself at the start of the Wizards' second turn, or the first turn after with a free slot, and rests the turn it lands. Each hunt gives the boss more orbs.
- **The even match** pays a pack every third win.
- **Packs** hold three cards, at least one of them Uncommon or better while one is left to earn. Packs are won, never bought.
- **A lost duel** on the Trail, against a rival or on a bounty gives your Base one more orb in the rematch, twice at most.

## 13. How card text is written

- A keyword always means the same thing. A new effect gets a new keyword or its own sentence, never a changed keyword.
- "Arrives" means a troop is put on the board, from the hand or the graveyard. "Defeated" means it lost its last orb.
- "A fight" is one troop attacking another. A direct attack on a Base is an attack but not a fight.
- Numbers are written as digits when they are orbs, attack or cards.
