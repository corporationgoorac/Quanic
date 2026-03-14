const express = require('express'); 
const cors = require('cors');
const dotenv = require('dotenv');

// Load environment variables
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
const startScheduledPushes = require('./scheduledPush'); 

// ============================================================================
// 2. MOUNT YOUR ROUTERS
// ============================================================================
app.use('/api', aiRoutes); 
app.use('/api', visionRoutes);

// ============================================================================
// 3. ATTACH YOUR DIRECT PLUGINS
// ============================================================================
bitesScrapper(app); 
pushNotifications(app); 

// ============================================================================
// 4. START YOUR BACKGROUND CRON JOBS
// ============================================================================
startScheduledPushes(); 

// ============================================================================
// 5. GLOBAL HEALTH CHECK & SERVER START
// ============================================================================
app.get('/', (req, res) => {
    res.send('🚀 Quantum Master Backend is ONLINE and running all services (AI, Vision, Bites, Push)!');
});

// Render dynamically injects process.env.PORT. The 10000 fallback is standard for Render.
const PORT = process.env.PORT || 10000; 

app.listen(PORT, () => {
    console.log(`🚀 Quantum Master Server is running and listening on port ${PORT}`);
    console.log(`✅ All modules loaded successfully.`);
});
