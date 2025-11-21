import { prisma } from './lib/prisma';

// Image generation prompts for each event
const imagePrompts: Record<string, string> = {
    "Will BTC break $100k before 2025?": "Bitcoin cryptocurrency coin breaking through 100k barrier, golden coin, charts going up, purple and orange neon lights, futuristic digital art",
    "Will ETH flip BTC by Q2 2025?": "Ethereum logo overtaking Bitcoin, race concept, blue and orange digital artwork, cryptocurrency competition theme",
    "Solana to reach $500 this year?": "Solana cryptocurrency logo with upward trajectory, purple gradient, modern tech aesthetic, $500 price target visualization",
    "Dogecoin to $1 in 2025?": "Dogecoin meme cryptocurrency, shiba inu dog, $1 coin, playful but professional crypto art with moon background",
    "Will Cardano launch smart contracts v2?": "Cardano blockchain network nodes, technical blueprint style, blue tones, smart contract visualization",
    "Bitcoin halving impact positive?": "Bitcoin halving event visualization, coin splitting in half, bullish chart patterns, orange and gold colors",
    "New altcoin season incoming?": "Multiple cryptocurrency coins floating upward, rainbow colors, bull market energy, dynamic composition",
    "Ripple SEC case resolved?": "Legal gavel with Ripple XRP logo, courtroom justice theme, professional legal imagery with blue accents",
    "Stablecoin regulation passed?": "Government building with stablecoin symbols, regulatory documentation, professional policy theme with green tones",
    "DeFi TVL to hit $200B?": "Decentralized finance network visualization, $200 billion in digital assets, interconnected nodes, purple cyber aesthetic",

    "Lakers to win NBA Championship?": "LA Lakers jersey and championship trophy, purple and gold colors, NBA basketball court, dramatic stadium lighting",
    "Ronaldo to score 30+ goals?": "Cristiano Ronaldo in action pose scoring goal, soccer ball, dynamic sports photography, red jersey",
    "Warriors back to playoffs?": "Golden State Warriors logo and basketball, blue and gold theme, playoff intensity, San Francisco arena",
    "Messi wins another Ballon d'Or?": "Lionel Messi with golden ball trophy, Argentine colors, prestigious award ceremony aesthetic",
    "NFL: Chiefs repeat Super Bowl?": "Kansas City Chiefs helmet and Super Bowl trophy, red and gold, American football stadium atmosphere",
    "Ferrari wins F1 Constructor's?": "Ferrari Formula 1 race car in motion, Italian racing red, championship podium, speed and victory theme",
    "Nadal wins French Open?": "Rafael Nadal playing tennis on clay court, French Open Roland Garros, orange clay, champion energy",
    "Man City treble repeat?": "Manchester City holding three trophies, sky blue theme, historic treble achievement visualization",
    "LeBron plays until 42?": "LeBron James basketball action shot, age 42 jersey number, longevity theme, Lakers purple and gold",
    "Olympics: USA tops medal count?": "USA flag with Olympic gold medals, podium ceremony, red white and blue, patriotic Olympic theme",

    "US Government shutdown in 2025?": "US Capitol building with warning signs, political tension visualization, red alert theme, American flag colors",
    "UK to rejoin EU by 2030?": "UK and EU flags merging, Brexit reversal concept, blue and yellow colors, diplomatic handshake imagery",
    "Fed cuts rates 3+ times?": "Federal Reserve building, interest rate charts declining, economic policy visualization, green downward arrows",
    "New climate accord signed?": "Globe with green energy symbols, world leaders signing document, environmental agreement theme",
    "AI regulation bill passes?": "AI robot with legal documents, congressional building, technology regulation theme, blue and silver",
    "Student debt forgiveness?": "Graduation cap with broken chains, student loan documents being forgiven, educational freedom theme",
    "Universal basic income trial?": "Money being distributed to diverse group of people, UBI concept art, economic equality visualization",
    "Space Force budget increase?": "US Space Force logo with satellites, military space theme, American flag, futuristic defense imagery",
    "Cannabis federal legalization?": "Cannabis leaf with gavel and US Capitol, legalization theme, green and gold professional imagery",
    "UN Security Council reform?": "United Nations building and council chamber, reform symbols, international diplomacy blue theme",

    "Will GTA 6 release in 2025?": "Grand Theft Auto 6 game logo, Miami Vice aesthetic, neon purple and pink, palm trees, gaming excitement",
    "Taylor Swift tour highest-grossing?": "Taylor Swift concert stage with massive crowd, Eras Tour theme, sparkles and stadium lights",
    "Marvel announces X-Men reboot?": "X-Men logo with MCU style, superhero team silhouettes, Marvel Studios branding, action movie aesthetic",
    "Stranger Things final season?": "Stranger Things logo upside down world theme, 80s nostalgia, red lighting, Netflix series finale",
    "New Star Wars trilogy announced?": "Star Wars logo with lightsabers, space background, galaxy far far away theme, epic cinematic feel",
    "Avatar 3 breaks box office?": "Avatar movie Pandora world, blue Na'vi, bioluminescent forest, box office record theme",
    "Beyoncé surprise album drop?": "Beyoncé in spotlight on stage golden theme, surprise announcement energy, music industry icon",
    "Nintendo Switch 2 reveal?": "Nintendo Switch 2 console mockup, red and blue joy-cons, gaming reveal presentation style",
    "The Winds of Winter released?": "Game of Thrones book cover, winter theme, ice and fire, George R.R. Martin's masterpiece aesthetic",
    "Minecraft movie success?": "Minecraft blocky world, Steve character, box office success theme, pixelated gaming aesthetic",

    "Apple Vision Pro mass adoption?": "Apple Vision Pro headset being worn, futuristic AR/VR visualization, Apple minimal design aesthetic",
    "SpaceX Mars mission?": "SpaceX rocket launching to Mars red planet, Elon Musk space exploration theme, dramatic space imagery",
    "Quantum computing breakthrough?": "Quantum computer with qubits visualization, scientific breakthrough theme, blue glowing technology",
    "Housing market crash?": "Housing prices declining chart, real estate crash visualization, red downward trend, economic concern",
    "Gold hits $3000/oz?": "Gold bars reaching $3000 price tag, bullion wealth imagery, luxury golden aesthetic",
    "Tesla $1 trillion valuation?": "Tesla logo with $1 trillion valuation, stock charts soaring, electric car company success",
    "TikTok US ban enforced?": "TikTok app icon with ban symbol, US flag background, social media regulatory theme",
    "World Cup qualifier upsets?": "Soccer World Cup trophy with underdog team celebration, upset victory theme, international football",
    "Esports Olympics debut?": "Esports gaming setup with Olympic rings, competitive gaming professional arena, modern sports evolution",
    "Box office recovery complete?": "Movie theater with packed audience, Hollywood comeback theme, cinema industry recovery visualization"
};

async function main() {
    console.log('📝 Event titles and image prompts ready');
    console.log('To generate images, use the following prompts with an image generation tool:');
    console.log('');

    const events = await prisma.event.findMany({
        select: {
            id: true,
            title: true,
        },
        orderBy: {
            createdAt: 'asc',
        },
    });

    events.forEach((event, index) => {
        const prompt = imagePrompts[event.title];
        if (prompt) {
            console.log(`${index + 1}. ${event.title}`);
            console.log(`   ID: ${event.id}`);
            console.log(`   Prompt: ${prompt}`);
            console.log('');
        }
    });
}

main()
    .catch((e) => {
        console.error('❌ Failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
