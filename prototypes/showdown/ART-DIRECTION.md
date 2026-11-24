# Art direction

One look for every card and place in Showdown, written so an image generator can follow it. It continues the eight card paintings and the title art already in `assets/`: the Cowboys own the sunset, the Wizards own the night.

This page is generated from `art.js`. To change a description, edit that file and run `node prototypes/showdown/export-art.mjs`. Nothing here has been generated as an image: these are words to use, change or throw out.

## How to use it

1. Start one new chat for the whole set. Attach two existing cards as references, one from each side: `assets/cards/sheriff-card.webp` and `assets/cards/dragon-card.webp`.
2. Paste the style block in section 1 and say it applies to every image in the chat.
3. For each card, paste its block from section 3. Ask for one image at a time.
4. Keep going in the same chat. A new chat forgets the style: paste section 1 again and re-attach the references.
5. When a picture drifts, name what drifted ("the sky should be sunset, not night") instead of starting over.
6. For a 3D model, use section 5 with the same subject text.

The pictures carry no words, numbers or borders. The game draws the frame, the name, the stars and the orbs on top, so a card's kind is always read from its frame, whatever the art shows.

## 1. The style: paste this first

```text
Art direction for every image in this set: "Cowboys vs. Wizards", a haunted-Western fantasy card game.
One world, one evening: a frontier ghost town that ends where a wizards' graveyard begins. The Cowboys own the last light of sunset; the Wizards own the night that follows it.
Rendering: a stylized 3D look, like a hand-painted collectible figurine lit on a miniature film set. Sculpted, chunky forms with a bold silhouette you could recognise as a black shape. Slightly exaggerated proportions: large hands, big hats, heavy boots, strong jaws. Hand-painted textures with visible brushwork on leather, cloth, bone and wood. Rich detail on the subject, softer detail behind it. Not photorealistic, not anime, not pixel art, not flat vector.
Cowboy palette: lantern amber, rust red, saddle brown, dusty cream, worn brass, one teal accent. Sky behind Cowboys: burnt-orange sunset bleeding upward into purple, dust hanging in the air.
Wizard palette: deep violet, indigo, bone white, tarnished iron, and green witch-fire as the only bright colour. Sky behind Wizards: moonlit purple night, one large pale full moon, low mist, bare black trees.
The two palettes always touch: a Cowboy image has a violet edge and a hint of the coming night; a Wizard image has one small warm lantern or ember somewhere in it.
Lighting: one strong key light from the subject's faction (warm lantern light from below-left for Cowboys, green witch-fire or violet glow from below-right for Wizards), plus a cool violet rim light from the moon along the opposite edge. Deep plum shadows, never pure black.
Recurring objects: brass sheriff stars, horseshoes, oil lanterns, cartridge belts and weathered timber for the Cowboys; rune-carved stone, wrought-iron lanterns with green flame, cracked headstones, gold-embroidered violet cloth and old bone for the Wizards. Magic is violet with green sparks. Gunfire is gold.
Never include: any text, letters, numbers, signs with writing, card borders, frames, logos, watermarks, user-interface elements, modern objects, or more than the subject described.
```

## 2. Framing: one line per kind of picture

Each card block in section 3 already starts with the right one.

| Picture | Framing |
| --- | --- |
| Troop | Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there. |
| Spell | Card illustration, portrait 5:7. A spell is a moment, not a person: show the effect itself in motion as the subject, with at most a hand or a weapon entering from the edge of the picture. No faces. Keep the top sixth and bottom third calm, because the game lays the name and the rules text there. |
| Trap | Card illustration, portrait 5:7. A trap is an object lying in wait: show it from a low angle close to the ground, half hidden, with the feeling that something is about to step on it. No characters. Keep the top sixth and bottom third calm. |
| Gear | Card illustration, portrait 5:7. Gear is a single object: show it alone as a hero prop, resting or displayed, lit like a treasure, large in the picture. No characters. Keep the top sixth and bottom third calm. |
| Location | Card illustration, portrait 5:7. A location is a place: a wide establishing view with depth, no characters, the main building or landmark in the middle distance and a clear path leading to it. Keep the top sixth and bottom third calm. |
| Place | Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it. |
| 3D model sheet | Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent. |

## 3. The cards

Each entry gives what the card does, then its visual direction as a block to paste after the style.

### Cowboys

#### 보안관

Cowboy · Troop, Lawman · 기본. 1 attack, 3 orbs. No keyword.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A stocky, barrel-chested lawman in his fifties with a huge walrus moustache, heavy brows and a weathered scowl. A wide, battered tan hat with a curled brim; a rust-red paisley bandana; a brown leather vest with brass buttons over a cream shirt with rolled sleeves; a five-point brass star on the chest; a cartridge belt with an oval brass buckle; dark wool trousers. One hand rests on a holstered revolver.
Scene: He stands on the saloon porch with his other hand on a swinging door. A glowing oil lantern hangs above his shoulder. Behind him the street falls away to a burnt-orange horizon turning purple.
The picture must show: Plain and dependable: feet planted, nothing fancy. He is the card every other Cowboy is measured against.
```

#### 빌리

Cowboy · Troop, Outlaw · 기본. 2 attack, 4 orbs. No keyword.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A lean young gunslinger of about nineteen with wavy dark-brown hair and a cocky half-smile. A tan hat pushed back on his head; a teal neckerchief, the one teal note in the Cowboy palette; a rust leather vest with long tails over a cream shirt; a low-slung gun belt; scuffed boots. He holds a long-barrelled revolver up beside his head, barrel to the sky.
Scene: The middle of the main street at sunset, the saloon front soft in the distance, dust curling around his boots.
The picture must show: Young, quick and sure of himself: weight on one hip, mid-stride, the opposite of the Sheriff's planted stance.
```

#### 말 탄 빌리

Cowboy · Troop, Outlaw · 희귀. 3 attack, 5 orbs. 돌파: 수호를 가진 적이 없다면 적 부대를 지나쳐 기지에 오브 1개 피해를 줄 수 있습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: The same young gunslinger as Billy, same teal neckerchief and rust vest, now riding a chestnut horse with a white blaze and a dark mane. The horse rears mid-gallop; he leans forward in the saddle with the revolver raised and the reins in his other hand. Tooled brown saddle, brass tack.
Scene: Open ground at the edge of town, a sunset sky behind, a long cloud of kicked-up dust trailing off one side of the picture.
The picture must show: Ride: horse and rider are one diagonal streak of motion, hooves off the ground, dust stretched into speed lines.
```

#### 명사수

Cowboy · Spell · 일반. 적 부대 하나에서 오브 1개를 제거합니다.

```text
Card illustration, portrait 5:7. A spell is a moment, not a person: show the effect itself in motion as the subject, with at most a hand or a weapon entering from the edge of the picture. No faces. Keep the top sixth and bottom third calm, because the game lays the name and the rules text there.
Subject: A heavy engraved revolver enters from the left edge, held in a gloved hand, a curl of smoke at the muzzle. A single bullet hangs in mid-flight down the centre of the picture, leaving a spiralling ring of gold light behind it.
Scene: The empty main street at sunset, seen straight down its length, timber fronts on both sides, a far-off target lost in the glare.
The picture must show: One shot, one orb: a single clean gold line through an otherwise still picture.
```

#### 생포한 용

Cowboy · Troop, Beast · 전설. 4 attack, 2 orbs. 휩쓸기: 부대를 공격하면 나머지 적 부대가 모두 오브 1개를 잃습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: The Graveyard Dragon, tamed: the same great horned beast with dark purple scales and a ridged neck, now in Cowboy colours. A heavy harness of brown leather and brass studs crosses its chest; a rust-red bandana is knotted around one horn; a brass star tag hangs from the collar. Its throat and belly glow amber instead of green, and the fire in its jaws is gold.
Scene: A timber corral at the edge of town at sunset, split rails splintered where it leans on them, the purple of the graveyard hills far behind.
The picture must show: Sweep: its head swings across the picture with a wide fan of gold fire that covers the whole width of the frame.
```

#### 생포한 망령

Cowboy · Troop, Undead · 전설. 2 attack, 2 orbs. 유령화: 주문의 대상이 될 수 없습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: The Lantern Wraith, bound: a tall hooded phantom in a tattered grey-violet shroud with no face, only two points of light in the dark of the hood. It rises out of a brass railroad lantern like smoke from a bottle, and loops of pale rope hold its wrists. Its light has turned from green to warm amber.
Scene: A hitching rail on the main street at dusk, the brass lantern hanging from the rail, the sunset behind it showing faintly through its body.
The picture must show: Ghostly: from the waist down it thins to mist and the street shows through it, so a bullet-shaped spell would pass straight through.
```

#### 포장마차

Cowboy · Troop, Rig · 일반. 1 attack, 4 orbs. 수호: 적은 다른 부대나 기지보다 이 부대를 먼저 공격해야 합니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A prairie schooner turned into a barricade: a patched cream canvas bonnet over curved hoops, heavy timber sides reinforced with riveted iron plates and a row of plank shields, tall iron-rimmed wheels chocked with stones. A driver in a slouch hat crouches behind the seat with a shotgun, only his hat and the barrels showing.
Scene: Parked broadside across the main street at sunset so nothing can pass, lanterns hung along its side, dust settling.
The picture must show: Guard: it fills the picture from edge to edge like a wall. Wide, low and heavy, the opposite of a rider.
```

#### 아웃라이더

Cowboy · Troop, Lawman · 일반. 1 attack, 3 orbs. 돌파: 수호를 가진 적이 없다면 적 부대를 지나쳐 기지에 오브 1개 피해를 줄 수 있습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A lean deputy scout riding low over the neck of a slim grey pinto horse at a flat gallop. A long tan duster streams behind; a rust-red bandana is pulled up over the nose; a small brass deputy star is pinned to the duster; a carbine sits in a saddle scabbard. Light tack, no baggage.
Scene: The dry flat outside town at sunset, fence posts blurring past, the horse's shadow stretched long in front of it.
The picture must show: Ride: everything leans forward. A lighter, faster shape than Mounted Billy: thin horse, long coat, one clean line of speed.
```

#### 다이너마이터

Cowboy · Troop, Outlaw · 고급. 3 attack, 1 orb. 최후의 저항: 전투에서 쓰러지면 싸운 부대가 오브 1개를 잃습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A wiry, grinning miner turned outlaw with a soot-smudged face, a singed ginger beard and a dented bowler hat. A bandolier of red dynamite sticks crosses his chest; more are tucked in his belt. He holds one stick high with its fuse spitting sparks, and shields his eyes from it with a scorched leather glove.
Scene: The mouth of a timber-framed mine cut at dusk, the lit fuse the brightest thing in the picture, its sparks throwing hard warm light up under his hat.
The picture must show: Last Stand: the burning fuse is the whole story. Whoever takes him down is standing too close.
```

#### 레인저

Cowboy · Troop, Lawman · 고급. 2 attack, 4 orbs. 정찰: 등장하면 카드를 한 장 뽑습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A tall, weathered tracker with a long dark braid and a calm, narrowed gaze. A wide flat-brimmed hat with a small brass star on the band; a long olive-brown duster; a rifle slung across the back; a brass spyglass raised to one eye; a coiled rope and a canteen at the hip.
Scene: A rock outcrop above the town at sunset, wind pulling the duster sideways, the valley and both ends of the street tiny and far below.
The picture must show: Scout: the spyglass and the high vantage. This is the Cowboy who sees what is coming and draws a card for it.
```

#### 개틀링 포대

Cowboy · Troop, Rig · 희귀. 4 attack, 4 orbs. 휩쓸기: 부대를 공격하면 나머지 적 부대가 모두 오브 1개를 잃습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A brass multi-barrelled Gatling gun on a two-wheeled timber carriage, crewed by two Cowboys: a broad gunner in a leather apron cranking the handle with his teeth bared, and a wiry loader feeding a tall brass magazine. Barrels blurred with spin, brass casings tumbling out.
Scene: Dug in behind a low barricade of sandbags and barrels on the main street at sunset, gun smoke rolling off to one side.
The picture must show: Sweep: a fan of gold tracer lines spreads from the muzzle across the whole width of the picture, hitting everything in front of it at once.
```

#### 올가미

Cowboy · Spell · 고급. 적 부대 하나를 기절시킵니다. 다음 턴에 공격할 수 없습니다.

```text
Card illustration, portrait 5:7. A spell is a moment, not a person: show the effect itself in motion as the subject, with at most a hand or a weapon entering from the edge of the picture. No faces. Keep the top sixth and bottom third calm, because the game lays the name and the rules text there.
Subject: A spinning rope loop hangs wide open in the centre of the picture, faintly gold along its edge, the rope spiralling back to a gloved hand at the lower corner. Inside the loop, a twist of violet mist is caught and pulled tight.
Scene: Dusty open ground at sunset, seen from low down so the loop is ringed by sky.
The picture must show: Stun: the loop has already closed around the violet shape and stopped it mid-motion. Nothing is hurt; it is held.
```

#### 곰 덫

Cowboy · Trap · 고급. 함정. 적 부대가 공격하면 먼저 오브 2개를 잃습니다. 그로 인해 쓰러지면 공격은 이루어지지 않습니다.

```text
Card illustration, portrait 5:7. A trap is an object lying in wait: show it from a low angle close to the ground, half hidden, with the feeling that something is about to step on it. No characters. Keep the top sixth and bottom third calm.
Subject: A heavy rusted iron bear trap with toothed jaws wide open, brass rivets at the hinge and a thick chain staked into the ground. Dust and dry grass are scattered over it so only the teeth catch the light.
Scene: The dirt of the main street at dusk, seen from ground level. In the soft distance a faint violet glow approaches, and one glowing footprint is already near the jaws.
The picture must show: It bites first: the open jaws wait in the foreground between the viewer and whatever is coming.
```

#### 6연발 권총

Cowboy · Gear · 고급. 장비. 장착한 부대의 공격력이 +1 됩니다.

```text
Card illustration, portrait 5:7. Gear is a single object: show it alone as a hero prop, resting or displayed, lit like a treasure, large in the picture. No characters. Keep the top sixth and bottom third calm.
Subject: An ornate revolver lying on a folded rust-red bandana: a long engraved steel barrel, a brass frame scrolled with vines, an ivory grip inlaid with a small brass star. Six brass cartridges stand in a row beside it.
Scene: A scarred timber table by a window at sunset, an oil lantern just out of frame throwing warm light across the metal.
The picture must show: Gear: a treasure handed to one troop. Lit like a prize, alone, nothing else on the table.
```

#### 보안관 사무소

Cowboy · Location · 희귀. 장소. 보안관(Lawman) 부대의 공격력이 +1 됩니다.

```text
Card illustration, portrait 5:7. A location is a place: a wide establishing view with depth, no characters, the main building or landmark in the middle distance and a clear path leading to it. Keep the top sixth and bottom third calm.
Subject: A square timber jailhouse at the head of the street: a covered porch, a barred window glowing amber, a large brass star mounted above the door, a hitching rail, a rack of rifles just visible through the open doorway, and a wall of weathered poster boards with blank sheets.
Scene: Sunset behind the roofline, lanterns lit along the porch, long shadows of the hitching rail across the dust.
The picture must show: A place that makes every Lawman stronger: the star above the door is the brightest thing in the picture.
```

### Wizards

#### 해골

Wizard · Troop, Undead · 기본. 1 attack, 3 orbs. No keyword.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A walking skeleton with a cracked skull and a loose jaw, wrapped in a tattered hooded cloak of faded violet. One rusted iron pauldron is strapped across a shoulder with rotten leather; a notched, rust-eaten dagger hangs in bony fingers.
Scene: Climbing over a broken tomb wall in the graveyard at night, the full moon behind its shoulder, a wrought-iron lantern with a green flame on the rune gateway beyond.
The picture must show: Plain and endless: the Wizards' basic troop, the one their other cards raise, pay and replace.
```

#### 마법사

Wizard · Troop, Mage · 고급. 2 attack, 4 orbs. 소생: 등장하면 묘지에 있는 마지막 언데드 부대가 오브 1개로 돌아옵니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: An old wizard with a long tangled white beard and sharp, amused eyes under a crooked wide-brimmed pointed hat set with a green gem. Layered violet robes edged with gold embroidery, a satchel of scrolls on a belt, a gnarled wooden staff topped with a caged green crystal. A small violet vortex turns above his open palm.
Scene: The graveyard path before the rune gateway at night, green lanterns on the stones, mist around the hem of his robe.
The picture must show: Raise: threads of green light run from the staff down into the earth at his feet, where a bony hand is pushing up out of the soil.
```

#### 용

Wizard · Troop, Beast · 전설. 3 attack, 5 orbs. 휩쓸기: 부대를 공격하면 나머지 적 부대가 모두 오브 1개를 잃습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A colossal horned dragon with dark purple scales, a ridged crest down a long neck, torn bat wings and a glowing green throat and belly. Its jaws are open and green fire spills between the teeth.
Scene: Coiled across jagged purple crags above the graveyard at night, the full moon behind its horns, the rune gateway small below it.
The picture must show: Sweep: the fire leaves its mouth as a wide curving arc that crosses the whole picture, not a single jet.
```

#### 특이점

Wizard · Spell · 일반. 적 부대 하나에서 오브 1개를 제거합니다.

```text
Card illustration, portrait 5:7. A spell is a moment, not a person: show the effect itself in motion as the subject, with at most a hand or a weapon entering from the edge of the picture. No faces. Keep the top sixth and bottom third calm, because the game lays the name and the rules text there.
Subject: A whirlpool of violet light with a pure black centre, tearing a hole in the air a hand's height above the ground. Green sparks spiral into it, and flagstones lift and crack toward it.
Scene: The graveyard at night, headstones leaning toward the pull, the moon and the rune gateway bent slightly at the edges of the picture.
The picture must show: One orb gone: everything in the picture leans inward to one point.
```

#### 랜턴 망령

Wizard · Troop, Undead · 전설. 2 attack, 4 orbs. 유령화: 주문의 대상이 될 수 없습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A tall, thin phantom in a long tattered shroud of grey-violet, its hood holding only darkness and two green points of light. One skeletal hand lifts a wrought-iron lantern on a chain, and the green flame inside is the brightest thing in the picture. It has no legs: the shroud frays into mist.
Scene: A crossroads on a bare hill outside the graveyard at night, a crooked signpost with blank boards, fog pooled in the hollows, the moon small and high.
The picture must show: Ghostly: the fence and the hill show through its body. A Wanted boss: it stands dead centre and looks straight at the viewer.
```

#### 임프

Wizard · Troop, Fiend · 고급. 3 attack, 1 orb. 속사: 제물 없이 소환해도 등장한 턴에 공격할 수 있습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A small wiry imp with magenta-violet skin, bat ears, two stubby horns, a barbed tail and a grin full of needle teeth. Ember-green eyes. It is caught mid-leap with both clawed hands stretched forward, trailing green sparks.
Scene: Bursting out of a crack in a tomb lid at night, splinters of stone still in the air, the moon behind it.
The picture must show: Quickdraw: it is already in the air and coming at the viewer. No wind-up, no waiting a turn.
```

#### 뼈 방벽

Wizard · Troop, Undead · 일반. 0 attack, 4 orbs. 수호: 적은 다른 부대나 기지보다 이 부대를 먼저 공격해야 합니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A wall built of stacked skulls, ribs and thigh bones, bound with rusted iron bands and lit from within by a faint violet glow in the gaps. Skeletal arms reach out of it holding broken tomb slabs as shields.
Scene: Risen straight out of the graveyard earth at night, soil still falling from it, blocking the path to the rune gateway from edge to edge.
The picture must show: Guard: a wall, wide and flat, filling the picture side to side. It has no weapon of its own.
```

#### 까마귀 사역마

Wizard · Troop, Beast · 일반. 1 attack, 1 orb. 정찰: 등장하면 카드를 한 장 뽑습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A large raven with glossy black feathers that shine violet at the edges, one eye glowing green. A thin silver ring etched with a rune circles one leg, and a small rolled scroll tied with violet thread is held in its beak.
Scene: Perched on a tilted headstone at night, wings half open as if it has just landed, the full moon directly behind it.
The picture must show: Scout: it has come back with something. The scroll in its beak is the card it draws.
```

#### 목 없는 기수

Wizard · Troop, Undead · 희귀. 2 attack, 3 orbs. 돌파: 수호를 가진 적이 없다면 적 부대를 지나쳐 기지에 오브 1개 피해를 줄 수 있습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A rider in a high-collared black-violet greatcoat with tarnished silver buttons and no head: green witch-fire flares up out of the empty collar. One gauntlet holds a curved cavalry sabre. The horse is black and skeletal at the ribs, with green flame for eyes and green fire around its hooves.
Scene: Galloping along the graveyard wall at night, mist torn apart by its passing, bare trees whipping by.
The picture must show: Ride: the Wizards' rider. The same forward-leaning streak as the Cowboy riders, in night colours, hooves off the ground.
```

#### 잭오랜턴

Wizard · Troop, Fiend · 일반. 1 attack, 1 orb. 최후의 저항: 전투에서 쓰러지면 싸운 부대가 오브 1개를 잃습니다.

```text
Card illustration, portrait 5:7. One character, three-quarter view from slightly below eye level, shown from about the knees up, filling the middle of the picture. Keep the top sixth and bottom fifth free of anything important, because the game lays the name and the numbers there.
Subject: A knee-high scarecrow creature with a carved pumpkin for a head, lit from inside by green fire through a jagged grin and triangle eyes. A ragged burlap body stuffed with straw, twig arms and legs, and a curling stem on top that burns like a fuse.
Scene: Standing on a mound of fresh grave earth at night, its own green light the only light on the ground around it.
The picture must show: Last Stand: the burning stem is a fuse, the mirror of the Dynamiter's. It is small, it will fall, and it will take an orb with it.
```

#### 지옥불

Wizard · Spell · 고급. 모든 적 부대에서 오브 1개씩 제거합니다.

```text
Card illustration, portrait 5:7. A spell is a moment, not a person: show the effect itself in motion as the subject, with at most a hand or a weapon entering from the edge of the picture. No faces. Keep the top sixth and bottom third calm, because the game lays the name and the rules text there.
Subject: Columns of green and violet fire falling from a split in the night sky and bursting where they land, a dozen at once across the whole width of the picture.
Scene: The main street seen from the Wizard end at night, fence posts and a wagon wheel in black silhouette against the flames, embers drifting.
The picture must show: Every troop at once: the fire is spread evenly from edge to edge, with no single target.
```

#### 저주

Wizard · Trap · 고급. 함정. 적 부대가 공격하면 그 공격이 취소됩니다.

```text
Card illustration, portrait 5:7. A trap is an object lying in wait: show it from a low angle close to the ground, half hidden, with the feeling that something is about to step on it. No characters. Keep the top sixth and bottom third calm.
Subject: A circle of runes drawn on the ground in chalk and small bones, glowing faint violet under a skin of mist. At its centre sits a small stitched cloth doll stuck with three iron pins. Black candles gutter at the edge of the circle.
Scene: A patch of bare earth between headstones at night, seen from ground level, the circle almost invisible until the eye finds the doll.
The picture must show: The attack never lands: the trap is quiet, patient and nearly hidden, the opposite of the Bear Trap's teeth.
```

#### 뼈 갑옷

Wizard · Gear · 고급. 장비. 장착한 부대가 오브 2개를 얻습니다.

```text
Card illustration, portrait 5:7. Gear is a single object: show it alone as a hero prop, resting or displayed, lit like a treasure, large in the picture. No characters. Keep the top sixth and bottom third calm.
Subject: A breastplate made of ribs and a spine laced together with violet leather, shoulder guards cut from shoulder blades, a collar of small vertebrae, and tarnished iron buckles. It hangs on a wooden stand.
Scene: A stone alcove in a crypt, green candles on the ledge beside it, cobwebs in the corners, cold moonlight through a slit window.
The picture must show: Gear: two more orbs for whoever wears it. Displayed like a relic, alone.
```

#### 뼈 묘지터

Wizard · Location · 희귀. 장소. 언데드(Undead) 부대의 공격력이 +1 됩니다.

```text
Card illustration, portrait 5:7. A location is a place: a wide establishing view with depth, no characters, the main building or landmark in the middle distance and a clear path leading to it. Keep the top sixth and bottom third calm.
Subject: A wide graveyard on a slope: crooked headstones, a leaning iron fence, open graves with fresh earth beside them, a dead black tree, and wrought-iron lanterns with green flames along a winding path that leads up to a rune-carved stone gateway.
Scene: Deep night under a large full moon, mist lying in the hollows, the gateway glowing violet at the top of the hill.
The picture must show: A place that makes every Undead stronger: the open graves are the detail to notice.
```

## 4. The places

Paste after the style. Every place is one corner of the same map: the town at one end of the street, the graveyard at the other.

### The Showdown street (the board)

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
One long dirt main street seen from a high three-quarter angle, running from the bottom of the picture to the top. The near end is the Cowboy end: timber store fronts, a saloon porch, hitching rails, oil lanterns, sunset light and long warm shadows. The far end is the Wizard end: the street turns to cracked flagstones, then headstones, and ends at a rune-carved stone gateway under a full moon with green lanterns. In the middle the amber light and the violet night meet in a visible line across the ground. Three clear standing spots on each side of that line.
```

### The Saloon (the Cowboy Base)

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A two-storey timber saloon with a covered porch, swinging doors, warm light pouring from every window, a longhorn skull above the door and an oil lantern on a bracket. Sunset behind it. It should look like the thing worth defending.
```

### The Rune Gateway (the Wizard Base)

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A tall freestanding stone arch carved with glowing green runes, a slow violet vortex turning inside it, wrought-iron lanterns with green flame on either side, broken graveyard wall running off from both edges. Full moon above.
```

### The Camp

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A campfire at dusk on a rise between the two worlds: bedrolls, a coffee pot, a saddle on a log and a leaning signpost with blank boards. To one side the lit town at sunset; to the other the graveyard hill under the rising moon. Warm and safe: the place a player returns to between duels.
```

### Boot Hill

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A small, shallow graveyard on a dry hill just outside town at sunset: plain wooden crosses, a few boots left on the mounds, one hand of bone just breaking the soil. The gentlest, brightest Wizard place: most of the sky is still orange.
```

### Raven Roost

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A dead, many-branched tree on a rocky knoll at dusk, every branch crowded with ravens, nests of twigs and stolen trinkets, a few carved pumpkins among the roots. The sky is half orange, half violet.
```

### The Bone Fence

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A long fence of bones and iron crossing a field at nightfall, taller than a rider, with one barred gate in the middle. Beyond it the first real headstones. Last trace of orange on the horizon.
```

### Imp Hollow

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A narrow rocky hollow at night, its walls full of cracks and small burrows glowing green from inside, scorch marks on the stone, tiny clawed footprints in the dust.
```

### The Hexed Mile

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A straight sunken road at night between two rows of standing stones, each scratched with a rune that glows faintly violet. Chalk circles half hidden on the ground. Nothing moves. The danger is what cannot be seen.
```

### Dragon's Roost

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
Jagged purple crags above the graveyard at night, a ledge strewn with charred bones and melted iron, claw marks in the rock, green firelight flickering from a cave mouth. The full moon is huge.
```

### The Stargazer's observatory

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A ruined round tower with a broken dome open to the night sky, a great brass telescope, star charts and floating points of violet light. Brass is the warm note here.
```

### The Imp's den

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A cave lit by a pit of green embers, piled with stolen Cowboy things: hats, spurs, lanterns, a cracked mirror. Mischief, not menace.
```

### The Bonewright's workshop

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A crypt turned workshop: racks of sorted bones, half-built skeletons on frames, iron tools, violet lamp light, a workbench with a ribcage breastplate on it.
```

### The Graveyard Coven

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A circle of tall standing stones on the hilltop behind the rune gateway at midnight, a green bonfire at its centre, the whole graveyard and the lit town far below.
```

### A Wanted poster

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A sheet of torn, yellowed paper nailed to weathered timber by a single iron nail, with a wide blank band at the top, a large empty portrait area in the middle framed by a rough inked border, and a blank band at the bottom. Lantern light from one side. No writing anywhere: the game adds the words.
```

### The card back

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A deep plum field with a worn gold filigree border, a brass horseshoe at the centre holding a violet diamond-cut gem, a small sheriff star above and a small wizard's hat below. Symmetrical top to bottom so it reads the same either way up. No lettering.
```

### A card pack

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A flat pack wrapped in waxed brown paper and tied with twine, sealed with a wax stamp showing a horseshoe around a violet gem, a faint violet glow leaking from one torn corner. On a timber table in lantern light.
```

### A life orb

```text
Environment painting, landscape 16:9. A wide establishing view with no characters and no creatures, a clear empty ground in the foreground where game pieces could stand, and depth behind it.
A single polished teal glass orb the size of a marble, with a soft inner glow and one bright highlight, set in a small worn brass claw. The one teal object in the game's interface: it must look the same on every card.
```

## 5. Model sheets for 3D

A model generator needs the whole figure, a plain background and flat light, so a model sheet keeps a card's subject and drops its scene. These are the 13 troops with no model yet, in the order to make them: the order a new player meets them. Paste each after the style. [3D-DAY.md](3D-DAY.md) has the steps from picture to a model on the board.

Subjects that are see-through or made of light on their card (the two Wraiths, the witch-fire on the Headless Horseman) are drawn solid and pale here. The glow and the mist are added in the game.

**1. 포장마차**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A prairie schooner turned into a barricade: a patched cream canvas bonnet over curved hoops, heavy timber sides reinforced with riveted iron plates and a row of plank shields, tall iron-rimmed wheels chocked with stones. A driver in a slouch hat crouches behind the seat with a shotgun, only his hat and the barrels showing.
```

**2. 까마귀 사역마**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A large raven with glossy black feathers that shine violet at the edges, one eye glowing green. A thin silver ring etched with a rune circles one leg, and a small rolled scroll tied with violet thread is held in its beak.
```

**3. 잭오랜턴**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A knee-high scarecrow creature with a carved pumpkin for a head, lit from inside by green fire through a jagged grin and triangle eyes. A ragged burlap body stuffed with straw, twig arms and legs, and a curling stem on top that burns like a fuse.
```

**4. 아웃라이더**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A lean deputy scout riding low over the neck of a slim grey pinto horse at a flat gallop. A long tan duster streams behind; a rust-red bandana is pulled up over the nose; a small brass deputy star is pinned to the duster; a carbine sits in a saddle scabbard. Light tack, no baggage.
```

**5. 뼈 방벽**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A wall built of stacked skulls, ribs and thigh bones, bound with rusted iron bands and lit from within by a faint violet glow in the gaps. Skeletal arms reach out of it holding broken tomb slabs as shields.
```

**6. 레인저**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A tall, weathered tracker with a long dark braid and a calm, narrowed gaze. A wide flat-brimmed hat with a small brass star on the band; a long olive-brown duster; a rifle slung across the back; a brass spyglass raised to one eye; a coiled rope and a canteen at the hip.
```

**7. 임프**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A small wiry imp with magenta-violet skin, bat ears, two stubby horns, a barbed tail and a grin full of needle teeth. Ember-green eyes. It is caught mid-leap with both clawed hands stretched forward, trailing green sparks.
```

**8. 다이너마이터**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A wiry, grinning miner turned outlaw with a soot-smudged face, a singed ginger beard and a dented bowler hat. A bandolier of red dynamite sticks crosses his chest; more are tucked in his belt. He holds one stick high with its fuse spitting sparks, and shields his eyes from it with a scorched leather glove.
```

**9. 목 없는 기수**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A rider in a high-collared black-violet greatcoat with tarnished silver buttons and no head: green witch-fire flares up out of the empty collar. One gauntlet holds a curved cavalry sabre. The horse is black and skeletal at the ribs, with green flame for eyes and green fire around its hooves.
```

**10. 개틀링 포대**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A brass multi-barrelled Gatling gun on a two-wheeled timber carriage, crewed by two Cowboys: a broad gunner in a leather apron cranking the handle with his teeth bared, and a wiry loader feeding a tall brass magazine. Barrels blurred with spin, brass casings tumbling out.
```

**11. 랜턴 망령**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: A tall, thin phantom in a long tattered shroud of grey-violet, its hood holding only darkness and two green points of light. One skeletal hand lifts a wrought-iron lantern on a chain, and the green flame inside is the brightest thing in the picture. It has no legs: the shroud frays into mist.
```

**12. 생포한 망령**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: The Lantern Wraith, bound: a tall hooded phantom in a tattered grey-violet shroud with no face, only two points of light in the dark of the hood. It rises out of a brass railroad lantern like smoke from a bottle, and loops of pale rope hold its wrists. Its light has turned from green to warm amber.
```

**13. 생포한 용**

```text
Model sheet for 3D modelling. The same subject and the same colours and materials, but: the whole figure in frame from head to feet including any weapon or mount, standing in a neutral relaxed pose with arms slightly away from the body, three-quarter front view, alone and centred on a plain flat mid-grey background, soft even lighting from all sides, no cast shadow, no scenery, no smoke, glow, sparks, mist or motion effects, nothing transparent.
Subject: The Graveyard Dragon, tamed: the same great horned beast with dark purple scales and a ridged neck, now in Cowboy colours. A heavy harness of brown leather and brass studs crosses its chest; a rust-red bandana is knotted around one horn; a brass star tag hangs from the collar. Its throat and belly glow amber instead of green, and the fire in its jaws is gold.
```

For any other card, keep its `Subject` line and put the model-sheet framing from section 2 in front of it.

## 6. Card frames

The art has no border; the game draws one. Six frames from one family, so a player can tell a troop from a spell from a trap by the edge alone. These are proposals for Alex to approve. Paste the first block, then one of the others.

```text
Empty card frame template, portrait 5:7, seen straight on, evenly lit. A deep plum field with fine grain; a blank name plate across the top; a large empty dark window for the picture in the upper two-thirds; a blank panel across the bottom for numbers or rules. Everything blank: no writing, no numbers, no symbols in the plates.
```

**Troop**

```text
The frame already on the cards: ornate worn-gold filigree with scrolling corners, a violet diamond-cut gem at the top centre and at each side, a small brass horseshoe at the bottom centre. A plain, continuous gold edge.
```

**Spell**

```text
The same plum field, but the metal is tarnished silver and the edge is a double line. The corner scrolls become thin arcane rings and star points, and the top gem is a round violet crystal with a faint glow. Lighter and finer than the troop frame.
```

**Trap**

```text
The same plum field, but the edge is dark riveted iron, broken into short bars like a chain so it reads as a dashed line. Iron bolt heads at the corners, one small iron jaw motif at the top centre. Heavy and plain.
```

**Gear**

```text
The same plum field, but the edge is stitched saddle leather with brass studs along it, a brass buckle at the top centre and leather corner caps. Warm and hand-made.
```

**Location**

```text
The same plum field, but the edge is weathered timber planks on the left half and rune-carved stone on the right half, meeting at the top centre under a small lantern. Thicker along the bottom, like a foundation.
```

**Boss (Wanted and Captured)**

```text
No plum field: the whole card is a torn, yellowed poster nailed to timber, with a rough inked border, a wide blank band at the top for one word, and a blank band at the bottom. A captured boss uses the same poster with a broken wax seal and a brass star pinned over one corner.
```

## 7. What keeps the set together

- **Two skies.** Sunset behind Cowboys, moonlit night behind Wizards. A card in the wrong sky reads as the wrong faction.
- **One bright colour each.** Gold for gunfire and lantern light; green for witch-fire. Violet is magic for both sides.
- **The same person twice.** Billy and Mounted Billy are one young man. The Dragon and the Captured Dragon are one beast in two liveries, and so are the two Wraiths.
- **Shape says what a card does.** Guard cards are wide walls. Ride cards are forward-leaning streaks. Sweep is a fan across the whole picture. Last Stand is a burning fuse. Scout looks out or brings something back. Ghostly is see-through.
- **Kinds of picture.** Troops are portraits, spells are moments, traps are objects in wait, gear is one object, locations are places.
- **Teal is for life orbs.** The only other teal in the game is Billy's neckerchief.
