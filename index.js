const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables (like GEMINI_API_KEY)
dotenv.config();

// Initialize the Master App
const app = express();

// Global Security & Parsing Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// ============================================================================
// 1. IMPORT YOUR 5 SEPARATE MODULES
// ============================================================================
const aiRoutes = require('./ai');
const visionRoutes = require('./visionScrapper');
const bitesScrapper = require('./bitesScrapper');
const pushNotifications = require('./pushNotifications');
const startScheduledPushes = require('./shedulePush');

// ============================================================================
// 2. MOUNT YOUR ROUTERS
// ============================================================================
// ai.js has '/chat', this makes it accessible at yoursite.com/api/chat
app.use('/api', aiRoutes); 

// VisionScrapper.js has '/feed', this makes it accessible at yoursite.com/api/feed
app.use('/api', visionRoutes);

// ============================================================================
// 3. ATTACH YOUR DIRECT PLUGINS
// ============================================================================
// bitesScrapper automatically handles the /api/reels route
bitesScrapper(app); 

// pushNotifications attaches the /ping route and starts the Firebase Listeners
pushNotifications(app); 

// ============================================================================
// 4. START YOUR BACKGROUND CRON JOBS
// ============================================================================
startScheduledPushes(); 

// ============================================================================
// 5. GLOBAL HEALTH CHECK & SERVER START
// ============================================================================
app.get('/', (req, res) => {
    res.send('🚀 Goorac Master Backend is ONLINE and running all services (AI, Vision, Bites, Push)!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Goorac Master Server is running and listening on port ${PORT}`);
    console.log(`✅ All modules loaded successfully.`);
});
