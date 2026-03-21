const express = require('express');
const cron = require('node-cron');
const admin = require('firebase-admin');

// 1. Initialize Firebase securely via Environment Variables
// We parse the JSON string that we will save in Hugging Face Secrets
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("FATAL ERROR: FIREBASE_SERVICE_ACCOUNT secret is missing!");
    process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 2. The Core Logic (Trending & Cleanup)
async function updateTrendingAndCleanup() {
    console.log(`[${new Date().toISOString()}] Starting Trending Calculation & Cleanup...`);
    const now = Date.now();
    const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now - 48 * 60 * 60 * 1000);
    
    try {
        // --- PART 1: TRENDING (Last 24 Hours) ---
        const recentPlaysSnap = await db.collection('play_events')
            .where('playedAt', '>=', twentyFourHoursAgo)
            .get();

        if (!recentPlaysSnap.empty) {
            const songScores = {};
            const songMetadata = {};

            recentPlaysSnap.forEach(doc => {
                const data = doc.data();
                const id = data.songId;
                songScores[id] = (songScores[id] || 0) + 1;
                
                if (!songMetadata[id]) {
                    songMetadata[id] = {
                        id: id, title: data.title, artist: data.artist, 
                        imgUrl: data.imgUrl, audioUrl: data.audioUrl
                    };
                }
            });

            const top15Ids = Object.keys(songScores)
                .sort((a, b) => songScores[b] - songScores[a])
                .slice(0, 15);
                
            const trendingTracks = top15Ids.map(id => songMetadata[id]);

            await db.collection('public_feeds').doc('trending').set({
                tracks: trendingTracks,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp()
            });
            console.log(`✅ Top 15 Trending updated!`);
        }

        // --- PART 2: CLEANUP (Older than 48 Hours) ---
        let totalDeleted = 0;
        while (true) {
            const oldEventsSnap = await db.collection('play_events')
                .where('playedAt', '<', fortyEightHoursAgo)
                .limit(500)
                .get();

            if (oldEventsSnap.empty) break;

            const batch = db.batch();
            oldEventsSnap.docs.forEach((doc) => batch.delete(doc.ref));
            await batch.commit();
            totalDeleted += oldEventsSnap.size;
        }
        console.log(`✅ Cleanup complete. Deleted: ${totalDeleted} records.`);

    } catch (error) {
        console.error("❌ Error during background job:", error);
    }
}

// 3. Schedule the Cron Job (Runs at minute 0 of every hour)
cron.schedule('0 * * * *', () => {
    updateTrendingAndCleanup();
});

// Run it once immediately on startup
updateTrendingAndCleanup();

// 4. Start the Express Server for Hugging Face (Mandatory Port 7860)
const app = express();
app.get('/', (req, res) => {
    res.send('Quanic Trending Aggregator is running successfully in the background! 🎵');
});

const PORT = 7860;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
