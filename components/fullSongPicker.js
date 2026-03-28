class FullSongPicker extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        // SPEED: Controller to kill network requests instantly
        this.fetchController = null; 
        // NEW: Track original theme color for mobile top bar
        this.originalThemeColor = null; 
    }

    connectedCallback() {
        this.render();
        this.initLogic();
        // We do NOT trigger background update here anymore.
        // We wait for open() to ensure no background data usage.
    }

    render() {
        this.shadowRoot.innerHTML = `
        <style>
            /* --- 1. RESET & CORE STYLES --- */
            :host {
                --bg-color: #000000;
                --surface-glass: rgba(20, 20, 20, 0.95); /* High opacity for performance */
                --surface-highlight: #2c2c2e;
                --accent-color: #0a84ff;
                --accent-gradient: linear-gradient(135deg, #0a84ff, #5ac8fa);
                --text-primary: #ffffff;
                --text-secondary: #a1a1a6;
                --border-color: rgba(255, 255, 255, 0.1);
                --safe-area-top: env(safe-area-inset-top, 20px);
                --safe-area-bottom: env(safe-area-inset-bottom, 20px);
            }

            * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif; -webkit-tap-highlight-color: transparent; }
            
            :host {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                z-index: 9999; pointer-events: none; display: flex; flex-direction: column; justify-content: flex-end;
                color: var(--text-primary); font-size: 14px;
            }
            
            :host(.active) { 
                pointer-events: auto; 
                background-color: rgba(0,0,0,0.6); 
                backdrop-filter: blur(5px);
                transition: opacity 0.3s ease;
            }

            .picker-container {
                background-color: var(--bg-color); 
                height: 100%; width: 100%;
                margin: 0 auto;
                border-radius: 0;
                overflow: hidden; display: flex; flex-direction: column;
                transform: translateY(100%); transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
                position: relative;
                box-shadow: 0 -10px 40px rgba(0,0,0,0.5);
                will-change: transform; /* GPU Acceleration */
            }
            
            @media (min-width: 600px) {
                .picker-container { max-width: 500px; border-left: 1px solid var(--border-color); border-right: 1px solid var(--border-color); }
            }

            :host(.active) .picker-container { transform: translateY(0); }

            /* --- 2. HEADER SECTION --- */
            .header-area { 
                padding: calc(20px + var(--safe-area-top)) 20px 16px 20px;
                background: var(--surface-glass);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                z-index: 40; 
                border-bottom: 1px solid var(--border-color); 
                position: relative; 
                flex-shrink: 0;
            }
            
            .drag-handle-area { width: 100%; display: flex; justify-content: center; padding-bottom: 20px; cursor: pointer; }
            .drag-handle { width: 40px; height: 5px; background: rgba(255,255,255,0.3); border-radius: 10px; }

            /* Modern iOS Style Search */
            .search-box { 
                background-color: rgba(118, 118, 128, 0.24); border-radius: 12px; padding: 10px 14px; 
                display: flex; align-items: center; margin-bottom: 16px;
                border: 1px solid transparent; transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            }
            .search-box:focus-within { 
                background-color: #1c1c1e; 
                border-color: var(--accent-color); 
                box-shadow: 0 0 0 2px rgba(10, 132, 255, 0.3);
            }
            
            .search-input { 
                background: transparent; border: none; outline: none; color: white; 
                width: 100%; font-size: 16px; margin-left: 10px; font-weight: 400;
                letter-spacing: 0.3px;
            }
            .search-input::placeholder { color: #8e8e93; }

            /* Tabs */
            .tabs { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: none; }
            .tabs::-webkit-scrollbar { display: none; }
            
            .pill-tab { 
                background: transparent; border: 1px solid var(--border-color); 
                border-radius: 20px; padding: 8px 16px; 
                font-weight: 600; font-size: 13px; color: var(--text-secondary); 
                transition: all 0.3s; white-space: nowrap; cursor: pointer; flex-shrink: 0;
            }
            .pill-tab.active { 
                background: var(--text-primary); 
                color: #000; 
                border-color: var(--text-primary);
                transform: scale(1.02);
            }

            /* --- 3. SONG LIST --- */
            .scroll-container { 
                flex: 1; overflow-y: auto; 
                padding: 10px 20px calc(100px + var(--safe-area-bottom)) 20px; 
                scrollbar-width: none; 
                contain: content; /* Rendering Optimization */
            }
            .scroll-container::-webkit-scrollbar { display: none; }

            .section-title {
                font-size: 20px; font-weight: 700; color: var(--text-primary);
                margin: 20px 0 10px 0; letter-spacing: 0.5px;
            }

            .song-row { 
                display: flex; justify-content: space-between; align-items: center; 
                padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; 
                transition: background 0.2s, transform 0.1s;
                border-radius: 8px;
            }
            .song-row:hover { background: rgba(255,255,255,0.03); }
            .song-row:active { transform: scale(0.98); opacity: 0.8; }

            .song-info { display: flex; align-items: center; gap: 16px; overflow: hidden; flex: 1; }
            .song-art { 
                width: 56px; height: 56px; border-radius: 8px; object-fit: cover; 
                background: #1c1c1e; flex-shrink: 0; box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            }
            .song-text { display: flex; flex-direction: column; overflow: hidden; gap: 4px; }
            .song-title { font-size: 16px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary); }
            .song-artist { font-size: 14px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

            .bookmark-btn { 
                background: none; border: none; padding: 12px; cursor: pointer; 
                display: flex; align-items: center; transition: transform 0.2s; opacity: 0.7;
            }
            .bookmark-btn:active { transform: scale(1.2); }
            .song-row:hover .bookmark-btn { opacity: 1; }

            /* --- 4. MINI PLAYER --- */
            .mini-player {
                position: absolute; bottom: 0; left: 0; right: 0; z-index: 50;
                background: var(--surface-glass);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-top: 1px solid var(--border-color); 
                padding: 12px 20px calc(16px + var(--safe-area-bottom)) 20px;
                display: flex; align-items: center; justify-content: space-between;
                transform: translateY(110%); transition: transform 0.5s cubic-bezier(0.19, 1, 0.22, 1);
                box-shadow: 0 -5px 20px rgba(0,0,0,0.5);
            }
            .mini-player.show { transform: translateY(0); }

            .controls { display: flex; align-items: center; gap: 24px; }
            
            .icon-btn { 
                background: none; border: none; cursor: pointer; display: flex; align-items: center; 
                padding: 8px; color: white; transition: opacity 0.2s;
            }
            .icon-btn:active { opacity: 0.5; }
            
            .select-btn {
                width: 44px; height: 44px; background: var(--text-primary); border-radius: 50%; border: none;
                display: flex; align-items: center; justify-content: center; cursor: pointer;
                box-shadow: 0 4px 15px rgba(255, 255, 255, 0.2); transition: transform 0.2s;
            }
            .select-btn:active { transform: scale(0.9); }

            /* --- 5. LOADING SKELETON --- */
            .loading-skeleton { display: flex; align-items: center; gap: 14px; padding: 12px 0; }
            .sk-img { width: 54px; height: 54px; border-radius: 8px; background: #1c1c1e; animation: pulse 1.5s infinite; }
            .sk-text-col { flex: 1; display: flex; flex-direction: column; gap: 8px; }
            .sk-line { height: 12px; border-radius: 4px; background: #1c1c1e; animation: pulse 1.5s infinite; }
            
            @keyframes pulse { 0% { opacity: 0.3; } 50% { opacity: 0.6; } 100% { opacity: 0.3; } }

            svg { fill: currentColor; width: 24px; height: 24px; }
            .text-gray svg { fill: #8e8e93; width: 20px; height: 20px; }
            .select-btn svg { fill: black; width: 22px; height: 22px; }
            
            .text-center { text-align: center; color: var(--text-secondary); padding: 60px 20px; font-size: 15px; font-weight: 500; }
            
            .greeting { font-size: 13px; color: var(--accent-color); font-weight: 600; margin-bottom: 4px; letter-spacing: 0.5px; text-transform: uppercase; }
        </style>

        <div class="picker-container" id="mainContainer">
            <div class="header-area">
                <div class="drag-handle-area" id="closeDragBtn">
                    <div class="drag-handle"></div>
                </div>

                <div class="search-box">
                    <span class="text-gray">
                        <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                    </span>
                    <input type="search" id="searchInput" class="search-input" placeholder="Search artists, songs, lyrics..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="search" name="search_query_no_autofill">
                </div>

                <div class="tabs">
                    <button id="tabForYou" class="pill-tab active">For You</button>
                    <button id="tabTrending" class="pill-tab">Charts</button>
                    <button id="tabSaved" class="pill-tab">Library</button>
                </div>
            </div>

            <div class="scroll-container" id="songList">
                <div id="statusMsg" class="text-center">Start typing to search...</div>
            </div>

            <div id="miniPlayer" class="mini-player">
                <div class="song-info" id="miniInfoArea">
                    <img id="mImg" src="" class="song-art">
                    <div class="song-text">
                        <span id="mTitle" class="song-title">Song Title</span>
                        <span id="mArtist" class="song-artist">Artist Name</span>
                    </div>
                </div>
                <div class="controls">
                    <button id="miniPlayBtn" class="icon-btn">
                        <svg id="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                        <svg id="pauseIcon" viewBox="0 0 24 24" style="display:none;"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    </button>
                    
                    <button id="confirmSelectionBtn" class="select-btn">
                        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </button>
                </div>
            </div>
        </div>

        <audio id="player"></audio>
        `;
    }

    initLogic() {
        const root = this.shadowRoot;
        
        // --- CONFIGURATION ---
        this.API_URL = "https://saavn.sumit.co/api/search/songs"; // Updated to JioSaavn API
        this.PAGE_SIZE = 20; 
        this.MAX_LIMIT = 50; // Requested: 50 Songs
        // FIXED: Try Direct fetching first (iTunes API supports CORS natively), then fallback to proxies
        this.PROXIES = [
            "DIRECT",
            "https://api.allorigins.win/raw?url=",
            "https://api.codetabs.com/v1/proxy?quest=",
            "https://corsproxy.io/?"
        ];
        
        // --- STATE VARIABLES ---
        this.allFetchedSongs = []; 
        this.renderedCount = 0; 
        this.isLoadingMore = false; 
        
        this.DB = {
            getSaved: () => JSON.parse(localStorage.getItem('full_insta_saved')) || [],
            setSaved: (data) => localStorage.setItem('full_insta_saved', JSON.stringify(data)),
            getCache: (key) => JSON.parse(localStorage.getItem('full_picker_cache_' + key)) || null,
            setCache: (key, data) => localStorage.setItem('full_picker_cache_' + key, JSON.stringify(data)),
            getNextCache: () => JSON.parse(localStorage.getItem('full_picker_cache_next_foryou')) || null,
            setNextCache: (data) => localStorage.setItem('full_picker_cache_next_foryou', JSON.stringify(data)),
            globalCache: {}, 
            addToGlobal: (songs) => songs.forEach(s => this.DB.globalCache[s.trackId] = s),
            getHistory: () => JSON.parse(localStorage.getItem('full_picker_history')) || [],
            addToHistory: (song) => {
                let history = this.DB.getHistory();
                history = history.filter(s => s.trackId !== song.trackId);
                history.unshift(song);
                localStorage.setItem('full_picker_history', JSON.stringify(history.slice(0, 50)));
            },
            saveSession: (tab, list, scroll, query, header) => {
                const session = { 
                    tab, list: list.slice(0, 50), scroll, query, header, timestamp: Date.now() 
                };
                localStorage.setItem('full_picker_last_session', JSON.stringify(session));
            },
            getLastSession: () => JSON.parse(localStorage.getItem('full_picker_last_session')),
            
            // SPEED: Preload Audio for Instant Playback
            preloadAssets: (songs) => {
                if(!songs || songs.length === 0) return;
                // Preload just the FIRST song's audio for speed
                const first = songs[0];
                if(first && first.previewUrl) {
                    const audio = new Audio();
                    audio.src = first.previewUrl;
                    audio.preload = "auto";
                }
            },

            getUserProfile: () => JSON.parse(localStorage.getItem('full_picker_user_profile_v5')) || { artists: {}, genres: {}, timeContext: {}, explicitPref: false },
            setUserProfile: (data) => localStorage.setItem('full_picker_user_profile_v5', JSON.stringify(data)),

            trackInteraction: (song, weight) => {
                if(!song) return;
                const profile = this.DB.getUserProfile();
                const currentHour = new Date().getHours();
                const artistName = song.artistName ? song.artistName.split(',')[0].trim() : null;
                if (artistName) profile.artists[artistName] = (profile.artists[artistName] || 0) + weight;
                const genre = song.primaryGenreName;
                if (genre) {
                    profile.genres[genre] = (profile.genres[genre] || 0) + weight;
                    if(!profile.timeContext[currentHour]) profile.timeContext[currentHour] = {};
                    profile.timeContext[currentHour][genre] = (profile.timeContext[currentHour][genre] || 0) + weight;
                }
                // --- NEW ML: Day of week and keyword tracking ---
                const dayOfWeek = new Date().getDay();
                profile.days = profile.days || {};
                profile.days[dayOfWeek] = profile.days[dayOfWeek] || {};
                if (genre) {
                    profile.days[dayOfWeek][genre] = (profile.days[dayOfWeek][genre] || 0) + weight;
                }
                profile.keywords = profile.keywords || {};
                if (song.trackName) {
                    const words = song.trackName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                    words.forEach(w => profile.keywords[w] = (profile.keywords[w] || 0) + (weight * 0.5));
                }
                // --- END NEW ML ---
                this.DB.setUserProfile(profile);
            },

            getRecommendationQuery: () => {
                const profile = this.DB.getUserProfile();
                const history = this.DB.getHistory();
                const currentHour = new Date().getHours();
                const getTop = (obj) => Object.entries(obj).sort(([,a], [,b]) => b - a).map(([k]) => k);
                const topArtists = getTop(profile.artists);
                const timeSpecificGenres = profile.timeContext[currentHour] ? getTop(profile.timeContext[currentHour]) : [];
                
                // --- NEW ML: Expanded contextual inference ---
                const dayOfWeek = new Date().getDay();
                const daySpecificGenres = profile.days && profile.days[dayOfWeek] ? getTop(profile.days[dayOfWeek]) : [];
                const topKeywords = profile.keywords ? getTop(profile.keywords) : [];
                const dice = Math.random();
                let query = "";
                let reason = "Top Hits";

                if (dice < 0.2 && daySpecificGenres.length > 0) {
                    query = daySpecificGenres[0] + " hits";
                    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    reason = dayNames[dayOfWeek] + " Vibes • " + daySpecificGenres[0];
                } 
                else if (dice < 0.35 && topKeywords.length > 0) {
                    const kw = topKeywords[Math.floor(Math.random() * Math.min(topKeywords.length, 3))];
                    query = kw + " music";
                    reason = "Curated For You • " + kw.charAt(0).toUpperCase() + kw.slice(1);
                }
                // --- END NEW ML ---
                else if (dice < 0.5 && timeSpecificGenres.length > 0) {
                    query = timeSpecificGenres[0] + " hits";
                    reason = getTimeGreeting() + " • " + timeSpecificGenres[0];
                } 
                else if (dice < 0.8 && topArtists.length > 0) {
                    const artist = topArtists[Math.floor(Math.random() * Math.min(topArtists.length, 3))];
                    query = "Best of " + artist;
                    reason = "Because you like " + artist;
                } 
                else if (history.length > 0) {
                    const hIndex = history.length > 2 && Math.random() > 0.5 ? 1 : 0;
                    query = history[hIndex].artistName;
                    reason = "Jump back in";
                } 
                else {
                    query = "Global Top 100";
                    reason = "Global Trends";
                }
                return { query, reason };
            }
        };

        const getTimeGreeting = () => {
            const h = new Date().getHours();
            if (h < 12) return "Good Morning";
            if (h < 18) return "Good Afternoon";
            return "Good Evening";
        };

        this.currentView = [];
        this.activeTab = 'For You';
        this.currentSongData = null; 
        this.currentHeaderTitle = "";

        this.player = root.getElementById('player');
        this.list = root.getElementById('songList');
        this.status = root.getElementById('statusMsg');
        this.searchInput = root.getElementById('searchInput');

        this.list.addEventListener('scroll', () => {
            const { scrollTop, scrollHeight, clientHeight } = this.list;
            if (scrollTop + clientHeight >= scrollHeight - 50) this.loadMoreItems();
        });

        let searchTimer;
        this.searchInput.addEventListener('input', (e) => {
            // SPEED: Abort any pending requests immediately
            if (this.fetchController) this.fetchController.abort();
            
            clearTimeout(searchTimer);
            let val = e.target.value.trim();
            val = val.replace(/\s+/g, ' ').replace(/[^\w\s]/gi, '');

            if (val.length > 1) { 
                this.renderSkeletonLoading();
                // SMART TYPING: Increased delay to 700ms to ensure typing finished
                searchTimer = setTimeout(() => {
                    this.loadData(val, false, 'search', false);
                }, 700); 
            } else if(val.length === 0) {
                this.switchTab('For You', root.getElementById('tabForYou'));
            }
        });

        root.getElementById('tabForYou').onclick = (e) => this.switchTab('For You', e.target);
        root.getElementById('tabTrending').onclick = (e) => this.switchTab('Trending', e.target);
        root.getElementById('tabSaved').onclick = (e) => this.switchTab('Saved', e.target);

        root.getElementById('miniPlayBtn').onclick = () => this.togglePlayState();
        root.getElementById('closeDragBtn').onclick = () => this.close();
        root.getElementById('confirmSelectionBtn').onclick = () => this.confirmSelection();

        this.player.onended = () => this.updateIcons(false);

        window.addEventListener('popstate', () => {
            if (this.classList.contains('active')) this.close();
        });
    }

    restoreState() {
        const lastSession = this.DB.getLastSession();
        // NOTE: We only restore session if it was recent AND not "For You"
        // If it was "For You", we prefer the fresh 'already loaded' batch
        
        // --- NEW: Do NOT restore if the last session had a query. This ensures 0ms own suggestions. ---
        // --- CHANGED: Added "false && " to force it to NEVER restore previous state ---
        if (false && lastSession && (Date.now() - lastSession.timestamp < 86400000) && !lastSession.query) {
            
            // If the last session was 'For You', we allow restoring if it has content
            // This is crucial for "load fastly" on re-open.
            this.activeTab = lastSession.tab;
            this.shadowRoot.querySelectorAll('.pill-tab').forEach(b => {
                b.classList.toggle('active', b.innerText === lastSession.tab || (lastSession.tab === 'Charts' && b.id === 'tabTrending'));
            });
            this.allFetchedSongs = lastSession.list;
            // CHECK: Restoring session query
            this.searchInput.value = lastSession.query || "";
            this.currentHeaderTitle = lastSession.header;
            this.renderInitialList(this.allFetchedSongs, lastSession.header);
            setTimeout(() => { if(this.list) this.list.scrollTop = lastSession.scroll; }, 0);
            return true;
        }
        return false;
    }

    // UPDATED: Added force flag to allow running on close
    async runBackgroundUpdate(force = false) {
        if (!force && !this.classList.contains('active')) return;

        const rec = this.DB.getRecommendationQuery();
        // If we are forcing (on close), we ignore current header check
        if (!force && this.currentHeaderTitle && this.currentHeaderTitle.includes(rec.query)) return;

        // "FOR YOU": FETCH 50 SONGS IN BACKGROUND
        const targetUrl = `${this.API_URL}?query=${encodeURIComponent(rec.query)}&limit=50`; // JioSaavn formatting
        
        try {
            // FIXED: Try Direct fetch first, then fallback
             const fetchRaw = async () => {
                try {
                    const res = await fetch(targetUrl);
                    if (res.ok) {
                        let json = await res.json();
                        let mappedResults = [];
                        if (json.data && json.data.results) {
                            mappedResults = json.data.results.map(song => ({
                                trackId: song.id,
                                trackName: song.name ? song.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : 'Unknown',
                                artistName: song.artists?.primary?.map(a => a.name).join(', ') || song.primaryArtists || 'Unknown Artist',
                                artworkUrl100: song.image && song.image.length > 0 ? song.image[song.image.length - 1].url : '',
                                previewUrl: Array.isArray(song.downloadUrl) ? song.downloadUrl[song.downloadUrl.length - 1].url : song.downloadUrl,
                                primaryGenreName: song.language || 'Music'
                            }));
                        }
                        return { results: mappedResults };
                    }
                } catch (e) {
                    // Ignore direct fail and hit fallback proxy
                }
                const res = await fetch(this.PROXIES[1] + encodeURIComponent(targetUrl));
                let json = await res.json();
                let mappedResults = [];
                if (json.data && json.data.results) {
                    mappedResults = json.data.results.map(song => ({
                        trackId: song.id,
                        trackName: song.name ? song.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : 'Unknown',
                        artistName: song.artists?.primary?.map(a => a.name).join(', ') || song.primaryArtists || 'Unknown Artist',
                        artworkUrl100: song.image && song.image.length > 0 ? song.image[song.image.length - 1].url : '',
                        previewUrl: Array.isArray(song.downloadUrl) ? song.downloadUrl[song.downloadUrl.length - 1].url : song.downloadUrl,
                        primaryGenreName: song.language || 'Music'
                    }));
                }
                return { results: mappedResults };
             }
             const data = await fetchRaw();
             
             if(data.results && data.results.length > 0) {
                const savedIds = this.DB.getSaved().map(s => s.trackId);
                let results = data.results.filter(s => !savedIds.includes(s.trackId));
                results = results.sort(() => Math.random() - 0.5);
                const cacheData = { songs: results, header: rec.reason };
                this.DB.setNextCache(cacheData);
            }
        } catch (e) {}
    }

    open() {
        // --- NEW: Inject Mobile Theme Color on Open ---
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            this.originalThemeColor = metaTheme.getAttribute('content');
            metaTheme.setAttribute('content', '#000000');
        } else {
            this.originalThemeColor = null;
            const newMeta = document.createElement('meta');
            newMeta.name = 'theme-color';
            newMeta.content = '#000000';
            newMeta.id = 'injected-theme-color-song-picker';
            document.head.appendChild(newMeta);
        }
        // --- END NEW ---

        this.classList.add('active');
        history.pushState({ modalOpen: true }, "", "");
        
        // --- NEW: Force clean input to avoid past suggestions ---
        this.searchInput.value = '';
        
        const restored = this.restoreState();
        // If NOT restored (cache expired or empty), switchTab will trigger fetch
        if (!restored) {
            this.switchTab('For You', this.shadowRoot.getElementById('tabForYou'));
        }
    }

    close() {
        // SPEED: KILL ALL NETWORK ACTIVITY INSTANTLY
        if (this.fetchController) {
            this.fetchController.abort();
            this.fetchController = null;
        }

        // --- NEW: Restore Mobile Theme Color on Close ---
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (this.originalThemeColor !== null && metaTheme) {
            metaTheme.setAttribute('content', this.originalThemeColor);
        } else if (metaTheme && metaTheme.id === 'injected-theme-color-song-picker') {
            metaTheme.remove();
        }
        // --- END NEW ---

        // Save session state explicitly so "open" can be fast next time
        this.DB.saveSession(
            this.activeTab, 
            this.allFetchedSongs, 
            this.list.scrollTop, 
            "", // Save empty string so next restore is clean
            this.currentHeaderTitle
        );
        
        // REQUESTED: REMOVE INPUT TEXT ONLY
        this.searchInput.value = '';

        this.classList.remove('active');
        this.player.pause();
        this.updateIcons(false);
        if (history.state && history.state.modalOpen) history.back();
        
        // --- NEW: Automatically start pre-fetching 0ms suggestions for next open ---
        this.runBackgroundUpdate(true);
    }

    confirmSelection() {
        if (this.currentSongData) {
            // SPEED: KILL NETWORK INSTANTLY ON TICK
            if (this.fetchController) {
                this.fetchController.abort();
                this.fetchController = null;
            }

            this.DB.trackInteraction(this.currentSongData, 15); 
            this.dispatchEvent(new CustomEvent('song-selected', { 
                detail: this.currentSongData,
                bubbles: true,
                composed: true
            }));
            this.close();
        }
    }

    async switchTab(name, btn) {
        // SPEED: Kill previous tab requests
        if (this.fetchController) this.fetchController.abort();

        this.activeTab = name;
        this.shadowRoot.querySelectorAll('.pill-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.searchInput.value = ''; 

        if (name === 'Saved') {
            const s = this.DB.getSaved();
            this.DB.addToGlobal(s);
            if(s.length === 0) this.list.innerHTML = `<div class="text-center">No bookmarks found.<br>Save songs to see them here.</div>`;
            else {
                this.allFetchedSongs = s;
                this.currentHeaderTitle = "Your Library";
                this.renderInitialList(s, "Your Library");
            }
            return;
        }

        let query = "Global Top 100";
        let cacheKey = 'trending';
        let subHeading = "Trending Now";

        if (name === 'For You') {
            // CHECK LOCAL CACHE FIRST (Fast Load Requirement)
            const nextCache = this.DB.getNextCache();
            if (nextCache && nextCache.songs.length > 0) {
                this.allFetchedSongs = nextCache.songs;
                this.currentHeaderTitle = nextCache.header;
                this.renderInitialList(nextCache.songs, nextCache.header);
                
                // We consume the cache
                this.DB.setNextCache(null);
                return;
            }
            cacheKey = 'foryou';
            const rec = this.DB.getRecommendationQuery();
            query = rec.query;
            subHeading = rec.reason;
        }

        const cachedData = this.DB.getCache(cacheKey);
        
        if (cachedData && cachedData.length > 0 && name !== 'For You') { 
            this.allFetchedSongs = cachedData;
            this.currentHeaderTitle = subHeading;
            this.renderInitialList(cachedData, subHeading); 
        } else {
            this.renderSkeletonLoading();
            this.loadData(query, false, cacheKey, name === 'For You', subHeading);
        }
    }

    renderSkeletonLoading() {
        let html = '';
        for(let i=0; i<6; i++) {
            html += `
            <div class="loading-skeleton">
                <div class="sk-img"></div>
                <div class="sk-text-col">
                    <div class="sk-line" style="width: 60%"></div>
                    <div class="sk-line" style="width: 35%"></div>
                </div>
            </div>`;
        }
        this.list.innerHTML = html;
    }

    // --- SPEED OPTIMIZED DATA LOADING ---
    async loadData(query, silent = false, cacheKey = null, isRecommendation = false, subHeadingTitle = "") {
        if (this.fetchController) this.fetchController.abort();
        this.fetchController = new AbortController();
        const signal = this.fetchController.signal;

        // WATERFALL STRATEGY: 4 -> 10 -> 16 -> 35 -> 50
        // This ensures smooth loading and fast feedback
        
        // Helper to fetch with timeout
        const fetchBatch = async (limit) => {
            const targetUrl = `${this.API_URL}?query=${encodeURIComponent(query)}&limit=${limit}`; // JioSaavn formatting
            
            const fetchWithProxy = async (proxyUrl) => {
                const controller = new AbortController();
                // FIXED: Increased timeout to 4000ms to allow mobile networks time to resolve
                const id = setTimeout(() => controller.abort(), 4000); 
                
                try {
                    const combinedSignal = anySignal([signal, controller.signal]);
                    // FIXED: Allow direct connection for Apple APIs, build URL safely
                    const finalUrl = proxyUrl === "DIRECT" ? targetUrl : proxyUrl + encodeURIComponent(targetUrl);
                    
                    const res = await fetch(finalUrl, { signal: combinedSignal });
                    clearTimeout(id);
                    if (!res.ok) throw new Error('Fetch failed');
                    
                    // NEW: Seamless mapping to bridge JioSaavn JSON into the exact iTunes format we expect
                    let json = await res.json();
                    let mappedResults = [];
                    if (json.data && json.data.results) {
                        mappedResults = json.data.results.map(song => {
                            return {
                                trackId: song.id,
                                trackName: song.name ? song.name.replace(/&quot;/g, '"').replace(/&#039;/g, "'") : 'Unknown',
                                artistName: song.artists?.primary?.map(a => a.name).join(', ') || song.primaryArtists || 'Unknown Artist',
                                artworkUrl100: song.image && song.image.length > 0 ? song.image[song.image.length - 1].url : '',
                                previewUrl: Array.isArray(song.downloadUrl) ? song.downloadUrl[song.downloadUrl.length - 1].url : song.downloadUrl,
                                primaryGenreName: song.language || 'Music'
                            };
                        });
                    }
                    return { results: mappedResults.slice(0, limit) };

                } catch (e) {
                    clearTimeout(id);
                    throw e;
                }
            };
            
            return Promise.any(this.PROXIES.map(p => fetchWithProxy(p)));
        };

        function anySignal(signals) {
            const controller = new AbortController();
            for (const signal of signals) {
                if (signal.aborted) {
                    controller.abort();
                    return signal;
                }
                signal.addEventListener("abort", () => controller.abort(), { once: true });
            }
            return controller.signal;
        }

        try {
            // STEP 1: TINY BATCH (4 Songs)
            let data = await fetchBatch(4);
            if (signal.aborted) return;

            if(data.results && data.results.length > 0) {
                let results = data.results;
                this.DB.addToGlobal(results);
                if (isRecommendation) {
                    const savedIds = this.DB.getSaved().map(s => s.trackId);
                    results = results.filter(s => !savedIds.includes(s.trackId));
                }
                
                // Show first 4
                this.allFetchedSongs = results;
                this.currentHeaderTitle = subHeadingTitle;
                this.renderInitialList(results, subHeadingTitle);
                
                // Preload #1 Audio Immediately
                this.DB.preloadAssets(results);

                // Helper to Append Fresh Items only
                const processAndAppend = (newResults) => {
                    const existingIds = this.allFetchedSongs.map(s => s.trackId);
                    const fresh = newResults.filter(s => !existingIds.includes(s.trackId));
                    this.allFetchedSongs = [...this.allFetchedSongs, ...fresh];
                    this.loadMoreItems(); 
                };

                // STEP 2: BATCH 10
                if (!signal.aborted) {
                    data = await fetchBatch(10);
                    if (data.results && !signal.aborted) {
                        processAndAppend(data.results);
                        
                        // STEP 3: BATCH 16
                        if (!signal.aborted) {
                             data = await fetchBatch(16);
                             if (data.results && !signal.aborted) {
                                 processAndAppend(data.results);

                                 // STEP 4: BATCH 35
                                 if (!signal.aborted) {
                                     data = await fetchBatch(35);
                                     if (data.results && !signal.aborted) {
                                         processAndAppend(data.results);

                                         // STEP 5: FINAL BATCH 50
                                         if (!signal.aborted) {
                                             data = await fetchBatch(50);
                                             if (data.results && !signal.aborted) {
                                                 processAndAppend(data.results);
                                                 // Cache Full List
                                                 if (cacheKey && cacheKey !== 'search' && !isRecommendation) {
                                                    this.DB.setCache(cacheKey, this.allFetchedSongs);
                                                 }
                                             }
                                         }
                                     }
                                 }
                             }
                        }
                    }
                }
            } else {
                if(!silent) this.list.innerHTML = `<div class="text-center">No results found.</div>`;
            }
        } catch (error) {
            if (signal.aborted) return;
            if (!silent) this.list.innerHTML = `<div class="text-center" style="color: #ff453a;">Weak connection. Retrying...</div>`;
        }
    }

    renderInitialList(songs, title) {
        this.list.innerHTML = ''; 
        
        if(title) {
            const header = document.createElement('div');
            header.innerHTML = `
                <div class="greeting">${title.split('•')[0]}</div>
                <div class="section-title">${title.includes('•') ? title.split('•')[1] : title}</div>
            `;
            this.list.appendChild(header);
        }

        this.renderedCount = 0;
        this.isLoadingMore = false;
        this.appendBatch();
    }

    loadMoreItems() {
        if (this.isLoadingMore || this.renderedCount >= this.allFetchedSongs.length) return;
        this.isLoadingMore = true;
        
        requestAnimationFrame(() => {
            this.appendBatch();
            this.isLoadingMore = false;
        });
    }

    appendBatch() {
        const batch = this.allFetchedSongs.slice(this.renderedCount, this.renderedCount + this.PAGE_SIZE);
        if (batch.length === 0) return;

        this.renderItemsToDOM(batch);
        this.renderedCount += batch.length;
    }

    renderItemsToDOM(songs) {
        const savedIds = this.DB.getSaved().map(s => s.trackId);
        const fragment = document.createDocumentFragment();

        songs.forEach(song => {
            const isSaved = savedIds.includes(song.trackId);
            const art = song.artworkUrl100 ? song.artworkUrl100.replace('100x100bb', '300x300bb') : ''; // Safety fallback
            
            const item = document.createElement('div');
            item.className = 'song-row';
            
            const bookmarkIcon = isSaved 
                ? `<svg viewBox="0 0 24 24" style="fill: #0a84ff"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>` 
                : `<svg viewBox="0 0 24 24" style="fill:none; stroke:rgba(255,255,255,0.6); stroke-width:2;"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;

            item.innerHTML = `
                <div class="song-info">
                    <img src="${art}" class="song-art" loading="lazy" decoding="async">
                    <div class="song-text">
                        <span class="song-title">${song.trackName}</span>
                        <span class="song-artist">${song.artistName}</span>
                    </div>
                </div>
                <button class="bookmark-btn" data-id="${song.trackId}">${bookmarkIcon}</button>
            `;
            
            item.querySelector('.song-info').onclick = () => this.playTrack(song);
            item.querySelector('.bookmark-btn').onclick = (e) => this.toggleSave(song.trackId, e, item);
            fragment.appendChild(item);
        });
        
        this.list.appendChild(fragment);
    }

    toggleSave(id, e, row) {
        e.stopPropagation();
        let saved = this.DB.getSaved();
        const index = saved.findIndex(s => s.trackId === id);
        
        if (index > -1) {
            saved.splice(index, 1);
        } else {
            const song = this.DB.globalCache[id] || this.allFetchedSongs.find(s => s.trackId === id);
            if(song) {
                saved.push(song);
                this.DB.trackInteraction(song, 10);
            }
        }
        
        this.DB.setSaved(saved);
        if (this.activeTab === 'Saved') {
            this.allFetchedSongs = saved; 
            this.renderInitialList(saved, "Your Library");
        }
        else {
            const btn = row.querySelector('.bookmark-btn');
            btn.innerHTML = index === -1 
                ? `<svg viewBox="0 0 24 24" style="fill: #0a84ff"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`
                : `<svg viewBox="0 0 24 24" style="fill:none; stroke:rgba(255,255,255,0.6); stroke-width:2;"><path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>`;
        }
    }

    playTrack(song) {
        this.currentSongData = song;
        const art = song.artworkUrl100 ? song.artworkUrl100.replace('100x100bb', '600x600bb') : '';
        const root = this.shadowRoot;

        root.getElementById('mImg').src = art;
        root.getElementById('mTitle').innerText = song.trackName;
        root.getElementById('mArtist').innerText = song.artistName;
        
        this.DB.trackInteraction(song, 3);
        this.DB.addToHistory(song); 
        
        // --- NEW: Instant audio fetching priority override ---
        this.player.preload = "auto";
        this.player.src = song.previewUrl;
        this.player.load(); // Force immediate network priority for the audio track
        
        const playPromise = this.player.play();
        if (playPromise !== undefined) {
            playPromise.catch(e => console.warn("Playback Error: Instant play prevented by browser restrictions", e));
        }
        // --- END NEW ---
        
        root.getElementById('miniPlayer').classList.add('show');
        this.updateIcons(true);
    }

    togglePlayState() {
        if (this.player.paused) { this.player.play(); this.updateIcons(true); } 
        else { this.player.pause(); this.updateIcons(false); }
    }

    updateIcons(isPlaying) {
        const root = this.shadowRoot;
        root.getElementById('playIcon').style.display = isPlaying ? 'none' : 'block';
        root.getElementById('pauseIcon').style.display = isPlaying ? 'block' : 'none';
    }
}

customElements.define('full-song-picker', FullSongPicker);
