/**
 * ============================================================================
 * 🚀 GOORAC QUANTUM BITES - ENTERPRISE BACKEND ENGINE
 * Version: 9.0.0 (Ultimate NLP, Time-Decay ML, & 7-Day Memory Release)
 * Architecture: Pool-Based SWR Caching, Staggered Anti-Ban Scraping, Global ML
 * ============================================================================
 */

const ytSearch = require('yt-search');
const crypto = require('crypto');
const EventEmitter = require('events');
const admin = require('firebase-admin'); // Connected to your existing Firebase instance
const nlp = require('compromise'); // NEW: External Open-Source NLP Engine

// ============================================================================
// ⚙️ 1. ENTERPRISE CONFIGURATION
// ============================================================================
const CONFIG = {
    CACHE: {
        TTL_MS: 20 * 60 * 1000,          // 20 mins before pool is considered "stale"
        HARD_EXPIRY_MS: 120 * 60 * 1000, // 2 hours maximum cache life
        MAX_POOL_SIZE: 500,              // Increased: Keep up to 500 videos per topic in RAM
        CLEANUP_INTERVAL: 10 * 60 * 1000,// Sweep dead cache every 10 minutes
        SEVEN_DAYS_MS: 7 * 24 * 60 * 60 * 1000 // NEW: 7-Day strict repetition block
    },
    SCRAPER: {
        MAX_RETRIES: 3,                  // Aggressive retry for network drops
        TIMEOUT_MS: 8500,                // 8.5s timeout (Gives Render server breathing room)
        STAGGER_DELAY_MS: 350,           // 🚀 ANTI-BAN: 350ms delay between concurrent YT scrapes
        CIRCUIT_BREAKER_FAILURES: 5,     // Trip breaker after 5 consecutive YT bans
        CIRCUIT_BREAKER_COOLDOWN: 45000, // 45s cooldown if banned
    },
    FEED: {
        MAX_DURATION_SEC: 66,            // Strict Shorts length enforcement
        ALGO_BATCH_SIZE: 15,             // Optimal payload size for infinite scroll UI
        SEARCH_BATCH_SIZE: 18,           // First page top results for Discover grid
    },
    ML: {
        REFILL_INTERVAL: 30 * 60 * 1000, // Auto-scan network & refill pools every 30 mins
        DECAY_RATE: 0.85                 // NEW: 15% daily interest decay for algorithm ranking
    }
};

// ============================================================================
// 🇮🇳 2. MASSIVE TAMIL & VIRAL KEYWORD MATRIX (SEED DATA)
// ============================================================================
const TREND_MATRIX = {
    STARS: ["thalapathy vijay", "thala ajith", "rajinikanth", "kamal haasan", "dhanush", "suriya", "sivakarthikeyan", "karthi", "vikram", "jayam ravi", "silambarasan tr"],
    MUSIC: ["anirudh bgm", "ar rahman live", "yuvan bgm", "harris jayaraj", "santhosh narayanan", "gvp bgm", "thaman bgm"],
    MOVIES: ["leo movie", "jailer movie", "vidaamuyarchi", "goat movie", "kanguva", "amaran", "raayan", "thangalaan", "indian 2", "viduthalai"],
    COMEDY: ["vadivelu comedy", "santhanam comedy", "yogi babu comedy", "tamil memes", "gopi sudhakar", "parithabangal", "soori comedy", "vivek comedy"],
    STATUS: ["tamil whatsapp status", "tamil bgm status", "tamil love status", "tamil sad status", "tamil mass edit 4k", "tamil motivational status"],
    MODIFIERS: ["viral", "trending", "must watch", "blow up", "million views", "banger", "new", "2026", "update", "latest", "just dropped", "#shorts", "status", "edit", "part 1", "4k edit", "epic"]
};

// ============================================================================
// 🛠️ 3. ENTERPRISE TELEMETRY & LOGGING ENGINE
// ============================================================================
class Logger {
    static _getMemoryUsage() {
        const stats = process.memoryUsage();
        return `${Math.round(stats.heapUsed / 1024 / 1024)}MB`;
    }
    static info(msg, data = "") {
        console.log(`[${new Date().toISOString()}] 🟢 [INFO] [RAM:${this._getMemoryUsage()}] ${msg}`, data);
    }
    static warn(msg, data = "") {
        console.warn(`[${new Date().toISOString()}] 🟠 [WARN] [RAM:${this._getMemoryUsage()}] ${msg}`, data);
    }
    static error(msg, err = "") {
        console.error(`[${new Date().toISOString()}] 🔴 [ERROR] [RAM:${this._getMemoryUsage()}] ${msg}`, err);
    }
    static performance(action, ms) {
        console.log(`[${new Date().toISOString()}] ⚡ [PERF] ${action} executed in ${ms}ms`);
    }
}

// ============================================================================
// 🧬 4. ADVANCED NATURAL LANGUAGE PROCESSING (SEMANTIC ENGINE)
// ============================================================================
class NLPProcessor {
    // Massive Neural Dictionary: Maps highly specific regional/global words to core concepts
    static semanticSynonyms = {
        // Sports & Cricket
        "dhoni": "cricket", "kohli": "cricket", "ipl": "cricket", "rohit": "cricket", "bcci": "cricket", "csk": "cricket", "rcb": "cricket", "sachin": "cricket", "world cup": "cricket",
        "football": "sports", "messi": "sports", "ronaldo": "sports", "neymar": "sports", "fifa": "sports", "kabaddi": "sports",
        
        // Tamil Music & Global Audio
        "vaayavmoodi": "song", "anirudh": "song", "arr": "song", "bgm": "song", "music": "song", "kadalalle": "song", "melody": "song", "kuthu": "song", "gaana": "song",
        "rahman": "song", "yuvan": "song", "harris": "song", "ilayaraja": "song", "spb": "song", "spotify": "music", "concert": "music", "bass": "music", "beats": "music",
        
        // Colors & Visuals
        "red": "color", "read": "color", "black": "color", "blue": "color", "white": "color", "green": "color", "yellow": "color", "art": "art", "drawing": "art", "painting": "art",
        
        // Nature & Locations (Tamil Nadu Focus)
        "flower": "nature", "rose": "flower", "tree": "nature", "sunset": "nature", "rain": "nature", "waterfall": "nature", "mountain": "travel", 
        "madurai": "location", "chennai": "location", "coimbatore": "location", "trichy": "location", "salem": "location", "tirunelveli": "location", "kanyakumari": "location",
        
        // Technology & Code
        "coding": "tech", "developer": "tech", "javascript": "tech", "python": "tech", "ai": "tech", "software": "tech", "programming": "tech", "react": "tech", "node": "tech",
        "firebase": "tech", "apple": "tech", "iphone": "tech", "android": "tech", "google": "tech", "cyber": "tech", "hacker": "tech",
        
        // Cinema, Actors & Directors
        "thalapathy": "actor", "vijay": "actor", "thala": "actor", "ajith": "actor", "cinema": "movies", "film": "movies", "rajini": "actor", "kamal": "actor", "suriya": "actor",
        "dhanush": "actor", "karthi": "actor", "sk": "actor", "sivakarthikeyan": "actor", "nayanthara": "actress", "trisha": "actress", "samantha": "actress", 
        "lokesh": "director", "nelson": "director", "atlee": "director", "shankar": "director", "vetrimaaran": "director", "kollywood": "movies", "bollywood": "movies",
        
        // Food & Lifestyle
        "biryani": "food", "chicken": "food", "cooking": "food", "recipe": "food", "street food": "food", "mutton": "food", "shawarma": "food", "parotta": "food",
        "peppa foodie": "food", "irfan view": "food", "madan gowri": "infotainment", "tasty": "food", "spicy": "food", "vlog": "lifestyle",
        
        // Emotions
        "love": "emotion", "kadhal": "emotion", "sad": "emotion", "sogam": "emotion", "happy": "emotion", "santhosham": "emotion", "angry": "emotion", "mass": "hype", "goosebumps": "hype", "verithanam": "hype"
    };

    static stopWords = new Set(["and", "the", "is", "in", "to", "of", "a", "for", "with", "on", "naan", "oru", "athu", "ithu", "endru", "shorts", "video", "youtube", "channel", "subscribe", "like", "share"]);

    static extractHashtags(text) {
        if (!text || typeof text !== 'string') return [];
        const cleanStr = text.toLowerCase();
        let extracted = new Set();
        
        // 1. Match explicit hashtags first
        const hashMatches = cleanStr.match(/#[\p{L}\p{N}_]+/gu); 
        if (hashMatches) hashMatches.forEach(t => extracted.add(t.replace('#', '').trim()));
        
        // 2. EXTERNAL NLP INTEGRATION: Use compromise.js to extract real-world nouns/entities
        try {
            let doc = nlp(text);
            let entities = doc.topics().out('array');
            let organizations = doc.organizations().out('array');
            let places = doc.places().out('array');
            
            const nlpTags = [...entities, ...organizations, ...places].map(e => e.toLowerCase().trim());
            nlpTags.forEach(tag => {
                if (tag.length > 3 && !this.stopWords.has(tag)) extracted.add(tag.replace(/\s+/g, '_'));
            });
        } catch(e) {
            Logger.warn("External NLP Parsing Skipped", e.message);
        }

        // 3. Deep Semantic Scanning (Tamil Native Matrix)
        const words = cleanStr.replace(/[^\w\s]/g, '').split(/\s+/);
        words.forEach(word => {
            if (word.length > 2) {
                if (word.length > 4 && !this.stopWords.has(word)) extracted.add(word); // Keep strong unique words
                
                // If the word matches our NLP Dictionary, map it to the core concept
                if (this.semanticSynonyms[word]) {
                    extracted.add(this.semanticSynonyms[word]);
                    // Double linkage (e.g. rose -> flower -> nature)
                    if (this.semanticSynonyms[this.semanticSynonyms[word]]) {
                        extracted.add(this.semanticSynonyms[this.semanticSynonyms[word]]);
                    }
                }
            }
        });
        return Array.from(extracted).slice(0, 12); // Max 12 deep tags per video to balance RAM & precision
    }

    static sanitizeTitle(title) {
        if (!title) return "Bite Video";
        return title.replace(/[\r\n\t]/g, ' ').trim();
    }
}

// ============================================================================
// 🧮 5. MATHEMATICAL ENGAGEMENT SIMULATOR
// ============================================================================
class EngagementEngine {
    static simulate(actualViews) {
        const baseViews = actualViews > 1000 ? actualViews : Math.floor(Math.random() * 900000) + 15000;
        const likeRatio = (Math.random() * 0.05) + 0.03;      
        const commentRatio = (Math.random() * 0.004) + 0.001; 
        const shareRatio = (Math.random() * 0.015) + 0.005;   

        return {
            views: baseViews,
            likes: Math.floor(baseViews * likeRatio),
            comments: Math.floor(baseViews * commentRatio),
            shares: Math.floor(baseViews * shareRatio)
        };
    }
}

// ============================================================================
// 🎯 6. RELEVANCY, SHUFFLING & DEDUPLICATION ALGORITHMS
// ============================================================================
class AlgorithmEngine {
    static cryptoShuffle(array) {
        let arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const randomByte = crypto.randomBytes(1)[0];
            const j = Math.floor((randomByte / 256) * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    static enforceUniqueness(videos) {
        const map = new Map();
        for (const v of videos) {
            if (v && v.videoId && !map.has(v.videoId)) map.set(v.videoId, v);
        }
        return Array.from(map.values());
    }

    static rankSearchRelevancy(videos, exactQuery) {
        const queryTokens = exactQuery.toLowerCase().replace('#shorts', '').trim().split(/\s+/);
        return videos.map(video => {
            let score = 0;
            const title = video.title ? video.title.toLowerCase() : "";
            const views = video.views || 0;
            
            score += Math.log10(views + 1) * 20; 
            let matchCount = 0;
            queryTokens.forEach(word => { if (title.includes(word)) matchCount++; });
            score += (matchCount * 150); 
            if (title.includes('#shorts') || title.includes('shorts')) score += 80;
            if (video.ago) {
                if (video.ago.includes('minute')) score += 60;
                if (video.ago.includes('hour')) score += 40;
                if (video.ago.includes('day')) score += 20;
            }
            return { ...video, relevancyScore: score };
        }).sort((a, b) => b.relevancyScore - a.relevancyScore); 
    }

    // Dynamic Query Builder based on ML Input
    static buildDynamicQueries(baseTopic) {
        const queries = [];
        const isTamil = baseTopic.includes('tamil');
        const mods = TREND_MATRIX.MODIFIERS;
        
        // 1. Exact Topic + Trending
        queries.push(`${baseTopic} shorts ${mods[Math.floor(Math.random() * mods.length)]}`);
        
        // 2. Synonymous Search (If NLP finds a match)
        let mapped = NLPProcessor.semanticSynonyms[baseTopic.toLowerCase()];
        if (mapped) queries.push(`${mapped} shorts ${mods[Math.floor(Math.random() * mods.length)]}`);
        else queries.push(`${baseTopic} shorts viral`);

        // 3. Fallback Mix
        if (isTamil) {
            queries.push(`${TREND_MATRIX.STARS[Math.floor(Math.random() * TREND_MATRIX.STARS.length)]} shorts viral`);
        }

        return queries;
    }
}

// ============================================================================
// 🧠 7. ENTERPRISE CACHE & 7-DAY STRICT DEDUPLICATION HISTORY
// ============================================================================
const BackgroundEventBus = new EventEmitter();

class EnterpriseCache {
    constructor() {
        this.store = new Map();
        this.globalSeenHistory = new Set(); 
        
        // 🚀 NEW: Advanced Multi-Day Memory Tracker
        // Stores { videoId: timestamp } to ensure strict 7-day non-repetition
        this.longTermSeenHistory = new Map(); 
        
        setInterval(() => this.sweep(), CONFIG.CACHE.CLEANUP_INTERVAL);
    }

    generateKey(baseTopic, type) { return `${type}_${baseTopic.toLowerCase().trim()}`; }

    get(key) {
        const record = this.store.get(key);
        if (!record) return { data: null, isStale: false };

        const age = Date.now() - record.timestamp;
        if (age > CONFIG.CACHE.HARD_EXPIRY_MS) {
            this.store.delete(key);
            return { data: null, isStale: false };
        }
        return { data: record.data, isStale: age > CONFIG.CACHE.TTL_MS };
    }

    set(key, data) {
        const now = Date.now();
        // Automatically inject all new videos into the permanent Global History
        data.forEach(v => {
            this.globalSeenHistory.add(v.videoId);
            this.longTermSeenHistory.set(v.videoId, now); // Lock it in for 7 days
        });
        this.store.set(key, { data, timestamp: now });
    }

    sweep() {
        let sweptPools = 0;
        let sweptHistory = 0;
        const now = Date.now();
        
        // Sweep dead RAM pools
        for (const [key, record] of this.store.entries()) {
            if (now - record.timestamp > CONFIG.CACHE.HARD_EXPIRY_MS) {
                this.store.delete(key);
                sweptPools++;
            }
        }
        
        // 🚀 NEW: Sweep 7-Day History Memory
        for (const [videoId, timestamp] of this.longTermSeenHistory.entries()) {
            if (now - timestamp > CONFIG.CACHE.SEVEN_DAYS_MS) {
                this.longTermSeenHistory.delete(videoId);
                this.globalSeenHistory.delete(videoId); // Release back to circulation after 7 days
                sweptHistory++;
            }
        }
        
        if (sweptPools > 0 || sweptHistory > 0) {
            Logger.info(`🗑️ Swept ${sweptPools} cache pools. Released ${sweptHistory} videos from 7-Day Lock. Active Locks: ${this.longTermSeenHistory.size}`);
        }
    }
}

const GlobalCache = new EnterpriseCache();

// ============================================================================
// 🛡️ 8. CIRCUIT BREAKER & ANTI-BAN SCRAPER
// ============================================================================
class ScraperService {
    constructor() { this.failures = 0; this.breakerTrippedUntil = 0; }

    isBreakerOpen() {
        if (this.failures >= CONFIG.SCRAPER.CIRCUIT_BREAKER_FAILURES) {
            if (Date.now() > this.breakerTrippedUntil) { this.failures = 0; return false; }
            return true;
        }
        return false;
    }

    recordFailure() {
        this.failures++;
        if (this.failures >= CONFIG.SCRAPER.CIRCUIT_BREAKER_FAILURES) {
            this.breakerTrippedUntil = Date.now() + CONFIG.SCRAPER.CIRCUIT_BREAKER_COOLDOWN;
            Logger.error(`⚡ YT BLOCKED IP! Circuit Breaker active for ${CONFIG.SCRAPER.CIRCUIT_BREAKER_COOLDOWN}ms`);
        }
    }

    async safeSearch(query, attempt = 1) {
        if (this.isBreakerOpen()) throw new Error("CIRCUIT_BREAKER_OPEN");
        try {
            const result = await Promise.race([
                ytSearch(query),
                new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), CONFIG.SCRAPER.TIMEOUT_MS))
            ]);
            this.failures = 0; 
            return result.videos || [];
        } catch (error) {
            if (error.message === 'TIMEOUT' && attempt <= CONFIG.SCRAPER.MAX_RETRIES) {
                await new Promise(res => setTimeout(res, 600 * attempt)); 
                return this.safeSearch(query, attempt + 1);
            }
            this.recordFailure();
            return []; 
        }
    }
}

const CoreScraper = new ScraperService();

// ============================================================================
// 🌐 9. MACHINE LEARNING GLOBAL INTEREST AGGREGATOR (TIME-DECAY ALGORITHM)
// ============================================================================
class GlobalMachineLearningEngine {
    static async analyzeNetworkAndRefill() {
        if (!admin.apps.length) return; // Abort if Firebase isn't initialized yet
        Logger.info("🤖 Starting ML Global Network Analysis with Time-Decay...");

        try {
            const db = admin.firestore();
            const usersSnap = await db.collection('users').get();
            let networkScores = {};

            // 1. Analyze every single user's dataset
            usersSnap.forEach(doc => {
                const data = doc.data();
                if (data.interests) {
                    
                    // 🚀 NEW: Fetch User's Last Interest Timestamp for Decay Math
                    const lastSync = data.lastInterestSyncTS || Date.now();
                    const daysOld = Math.floor((Date.now() - lastSync) / (1000 * 60 * 60 * 24));
                    
                    for (let [topic, rawScore] of Object.entries(data.interests)) {
                        
                        // Apply Time-Decay Algorithm: Reduces score if user hasn't interacted recently
                        let processedScore = rawScore;
                        if (daysOld > 0) {
                            processedScore = rawScore * Math.pow(CONFIG.ML.DECAY_RATE, daysOld);
                        }

                        if (processedScore < 1) continue; // Ignore dead interests

                        // Pass through NLP Semantic Engine to normalize words
                        let mappedTopic = topic.toLowerCase().trim();
                        for (const [key, category] of Object.entries(NLPProcessor.semanticSynonyms)) {
                            if (mappedTopic.includes(key)) { mappedTopic = category; break; }
                        }
                        
                        networkScores[mappedTopic] = (networkScores[mappedTopic] || 0) + processedScore;
                    }
                }
            });

            // 2. Rank the absolute top trends mathematically
            const topGlobalInterests = Object.entries(networkScores)
                .sort((a, b) => b[1] - a[1])
                .map(e => e[0])
                .slice(0, 10); // Take the top 10 most viral network-wide concepts

            if (topGlobalInterests.length === 0) topGlobalInterests.push("tamil", "comedy", "tech");

            Logger.info(`🔥 Network Top Interests Ranked (Post-Decay): [${topGlobalInterests.join(', ')}]`);

            // 3. Automatically Pre-Warm / Refill the Server Caches with NEW videos only
            for (const interest of topGlobalInterests) {
                const cacheKey = GlobalCache.generateKey(interest, 'ALGO_POOL');
                BackgroundEventBus.emit('refresh_algo_pool', { baseTopic: interest, cacheKey });
                await new Promise(r => setTimeout(r, 2000)); // Stagger massive background work
            }

        } catch (error) {
            Logger.error("ML Network Analysis Failed", error);
        }
    }
}

// Start the ML Auto-Refill Job in the background
setTimeout(() => GlobalMachineLearningEngine.analyzeNetworkAndRefill(), 15000); // 15s after boot
setInterval(() => GlobalMachineLearningEngine.analyzeNetworkAndRefill(), CONFIG.ML.REFILL_INTERVAL);


// ============================================================================
// 👻 10. BACKGROUND WORKERS (SWR & POOL BUILDING)
// ============================================================================
BackgroundEventBus.on('refresh_algo_pool', async ({ baseTopic, cacheKey }) => {
    try {
        Logger.info(`[BACKGROUND] Replenishing Pool for: ${baseTopic}`);
        const queries = AlgorithmEngine.buildDynamicQueries(baseTopic);
        let newVideos = [];
        
        for (const query of queries.slice(0, 3)) {
            const vids = await CoreScraper.safeSearch(query);
            newVideos.push(...vids.map(v => ({ ...v, queriedCategory: baseTopic })));
            await new Promise(r => setTimeout(r, CONFIG.SCRAPER.STAGGER_DELAY_MS));
        }

        // 🚀 STRICT 7-DAY DEDUPLICATION FILTER: Filter against longTermSeenHistory
        const validShorts = newVideos.filter(v => 
            (v.seconds || 0) <= CONFIG.FEED.MAX_DURATION_SEC && 
            !GlobalCache.globalSeenHistory.has(v.videoId) &&
            !GlobalCache.longTermSeenHistory.has(v.videoId)
        );
        
        const { data: existingPool } = GlobalCache.get(cacheKey);
        const combinedPool = existingPool ? [...existingPool, ...validShorts] : validShorts;
        const uniquePool = AlgorithmEngine.enforceUniqueness(combinedPool);
        const finalPool = uniquePool.slice(0, CONFIG.CACHE.MAX_POOL_SIZE);
        
        GlobalCache.set(cacheKey, finalPool);
        Logger.info(`[BACKGROUND] Pool updated. New unique videos found: ${validShorts.length}`);
    } catch (e) {}
});

BackgroundEventBus.on('refresh_search_cache', async ({ searchStr, exactQuery, cacheKey }) => {
    try {
        const rawVideos = await CoreScraper.safeSearch(searchStr);
        const validShorts = rawVideos.filter(v => (v.seconds || 0) <= CONFIG.FEED.MAX_DURATION_SEC);
        if (validShorts.length > 0) {
            const rankedShorts = AlgorithmEngine.rankSearchRelevancy(validShorts, exactQuery)
                .map(v => ({ ...v, queriedCategory: exactQuery }));
            GlobalCache.set(cacheKey, rankedShorts);
        }
    } catch (e) {}
});

// ============================================================================
// 🚀 11. MAIN EXPRESS ROUTER CONTROLLER
// ============================================================================
module.exports = function(app) {

    app.get('/api/reels', async (req, res) => {
        const requestStartTime = Date.now();
        const isSearchMode = req.query.search === 'true';
        const rawTopics = req.query.topic || "tamil"; 
        
        try {
            let finalFeed = [];

            if (isSearchMode) {
                // ================================================================
                // 🔍 MODE A: DIRECT DISCOVER SEARCH (Exact Top Results)
                // ================================================================
                let exactQuery = rawTopics.trim().toLowerCase();
                const searchStr = exactQuery.includes('shorts') ? exactQuery : `${exactQuery} #shorts`;
                const cacheKey = GlobalCache.generateKey(searchStr, 'SEARCH');
                
                const { data: cachedData, isStale } = GlobalCache.get(cacheKey);

                if (cachedData && cachedData.length > 0) {
                    finalFeed = cachedData;
                    if (isStale && !CoreScraper.isBreakerOpen()) {
                        BackgroundEventBus.emit('refresh_search_cache', { searchStr, exactQuery, cacheKey });
                    }
                } else {
                    const rawVideos = await CoreScraper.safeSearch(searchStr);
                    const validShorts = rawVideos.filter(v => (v.seconds || 0) <= CONFIG.FEED.MAX_DURATION_SEC);
                    
                    finalFeed = AlgorithmEngine.rankSearchRelevancy(validShorts, exactQuery)
                        .map(v => ({ ...v, queriedCategory: rawTopics }));

                    if (finalFeed.length > 0) GlobalCache.set(cacheKey, finalFeed);
                }

                finalFeed = AlgorithmEngine.cryptoShuffle(finalFeed).slice(0, CONFIG.FEED.SEARCH_BATCH_SIZE);

            } else {
                // ================================================================
                // 🧠 MODE B: MASSIVE POOL ALGORITHM FEED
                // ================================================================
                const baseTopicString = rawTopics.split(',').map(t => t.trim()).join('_');
                const cacheKey = GlobalCache.generateKey(baseTopicString, 'ALGO_POOL');
                
                const { data: poolData, isStale } = GlobalCache.get(cacheKey);

                if (poolData && poolData.length >= CONFIG.FEED.ALGO_BATCH_SIZE) {
                    finalFeed = AlgorithmEngine.cryptoShuffle(poolData).slice(0, CONFIG.FEED.ALGO_BATCH_SIZE);
                    if (isStale && !CoreScraper.isBreakerOpen()) {
                        BackgroundEventBus.emit('refresh_algo_pool', { baseTopic: rawTopics, cacheKey });
                    }
                } else {
                    Logger.warn(`Cold Boot: Building initial Algo Pool for ${baseTopicString}`);
                    const queries = AlgorithmEngine.buildDynamicQueries(rawTopics);
                    let newVideos = [];
                    
                    for (const query of queries.slice(0, 3)) {
                        const vids = await CoreScraper.safeSearch(query);
                        newVideos.push(...vids.map(v => ({ ...v, queriedCategory: rawTopics })));
                        await new Promise(r => setTimeout(r, CONFIG.SCRAPER.STAGGER_DELAY_MS));
                    }

                    // 🚀 STRICT 7-DAY FILTER APPLIED TO COLD BOOT AS WELL
                    const validShorts = newVideos.filter(v => 
                        (v.seconds || 0) <= CONFIG.FEED.MAX_DURATION_SEC && 
                        !GlobalCache.globalSeenHistory.has(v.videoId) &&
                        !GlobalCache.longTermSeenHistory.has(v.videoId)
                    );
                    const uniquePool = AlgorithmEngine.enforceUniqueness(validShorts);
                    
                    if (uniquePool.length > 0) GlobalCache.set(cacheKey, uniquePool);
                    finalFeed = AlgorithmEngine.cryptoShuffle(uniquePool).slice(0, CONFIG.FEED.ALGO_BATCH_SIZE);
                }
            }

            // ================================================================
            // 📦 PAYLOAD COMPILER & DATA ENRICHMENT
            // ================================================================
            if (!finalFeed || finalFeed.length === 0) {
                return res.json({ success: true, bites: [], _sys: { ms: Date.now() - requestStartTime }});
            }

            const clientPayload = finalFeed.map(video => {
                const metrics = EngagementEngine.simulate(video.views);
                
                // Trigger Advanced NLP Analysis on Title & Description
                const extractedHashtags = NLPProcessor.extractHashtags(video.title + " " + (video.author ? video.author.name : "") + " " + (video.description || ""));
                
                return {
                    id: `bite_${video.videoId}_${crypto.randomBytes(4).toString('hex')}`, 
                    category: video.queriedCategory || "trending", 
                    author: video.author ? video.author.name : "Creator",
                    title: NLPProcessor.sanitizeTitle(video.title),
                    hashtags: extractedHashtags, 
                    imgUrl: video.thumbnail || video.image,
                    videoId: video.videoId, 
                    views: metrics.views,
                    likes: metrics.likes, 
                    comments: metrics.comments,
                    shares: metrics.shares,
                    lengthSeconds: video.seconds || 0
                };
            });

            const executionTimeMs = Date.now() - requestStartTime;
            Logger.performance(`API Responded (${isSearchMode ? 'Search' : 'Algo'})`, executionTimeMs);

            res.json({ 
                success: true, 
                bites: clientPayload, 
                _sys: { ms: executionTimeMs, mode: isSearchMode ? 'search' : 'algo' } 
            });

        } catch (error) {
            Logger.error("CRITICAL ROUTE ERROR:", error);
            res.status(500).json({ success: false, bites: [], error: "Engine Failure" });
        }
    });
};
