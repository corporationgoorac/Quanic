const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const PushNotifications = require('@pusher/push-notifications-server');

const app = express();

// --- STRICT CACHES to prevent duplicate sends and reaction spam ---
const SERVER_START_TIME = Date.now();
const processedMessages = new Set();
const processedNotifs = new Set();
const reactionThrottle = new Set(); // Specifically limits reaction spam

// Allows your monitors to ping this server without CORS errors
app.use(cors()); 
app.use(express.json());

// --- HEALTH CHECK ROUTES FOR UPTIME MONITORS ---
app.get('/', (req, res) => {
  res.send('Goorac Push Server is Online and Permanent!');
});

app.get('/ping', (req, res) => {
  res.status(200).send('Pong! Server is awake.');
});

// 1. Initialize Firebase Admin SDK
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin initialized successfully");
    } catch (error) {
        console.error("❌ Failed to initialize Firebase Admin.", error);
    }
}

const db = admin.firestore();

// 2. Initialize Pusher Beams
const beamsClient = new PushNotifications({
  instanceId: '66574b98-4518-443c-9245-7a3bd9ac0ab7',
  secretKey: '99DC07D1A9F9B584F776F46A3353B3C3FC28CB53EFE8B162D57EBAEB37669A6A' 
});

// ============================================================================
// SAFETY NET: RESTORED FETCH ENDPOINT
// Just in case any frontend code still uses fetch('/send-push')
// ============================================================================
app.post('/send-push', (req, res) => {
    const { targetUid, senderUid, title, body, icon, click_action } = req.body;
    const deepLink = click_action || "https://www.goorac.biz";
  
    res.status(200).json({ success: true, message: "Push accepted via API route" });
  
    beamsClient.publishToInterests([targetUid], {
      web: { notification: { title, body, icon, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
      fcm: { notification: { title, body, icon }, data: { click_action: deepLink }, priority: "high" },
      apns: { aps: { alert: { title, body }, "thread-id": senderUid || "api-push" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
    }).catch(e => console.error('API Push Error:', e));
});

// ============================================================================
// LISTENER 1: CHATS, GROUP CHATS, DIRECT REPLIES, AND REACTIONS
// ============================================================================
function startMessageListener() {
    console.log("🎧 Listening for Chat Messages, Group Chats & Reactions...");

    db.collectionGroup('messages').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            
            const messageData = change.doc.data();
            const docId = change.doc.id;
            
            // RELIABLE TIMESTAMP: Uses Firestore's un-hackable create/update time
            let msgTime = SERVER_START_TIME;
            if (change.doc.createTime) msgTime = change.doc.createTime.toMillis();
            if (change.doc.updateTime && change.type === 'modified') msgTime = change.doc.updateTime.toMillis();

            // Ignore historical data floods on server reboot
            if (Date.now() - msgTime > 120000) return;
            if (msgTime <= SERVER_START_TIME) return; 

            // -----------------------------------------------------------------
            // A. HANDLE BRAND NEW MESSAGES
            // -----------------------------------------------------------------
            if (change.type === 'added') {
                if (processedMessages.has(docId)) return;
                processedMessages.add(docId);
                setTimeout(() => processedMessages.delete(docId), 180000); 

                try {
                    const senderUid = messageData.sender;
                    const chatRef = change.doc.ref.parent.parent;
                    const chatDoc = await chatRef.get();
                    if (!chatDoc.exists) return;
                    
                    const chatData = chatDoc.data();
                    const participants = chatData.participants || [];
                    
                    const senderDoc = await db.collection('users').doc(senderUid).get();
                    const senderData = senderDoc.data() || {};
                    let senderName = senderData.name || senderData.username || "Someone";
                    const senderPhoto = senderData.photoURL || "https://www.goorac.biz/icon.png";
                    const senderUsername = senderData.username || senderUid;

                    if (chatData.isGroup) senderName = `${senderName} in ${chatData.groupName || 'Group'}`;

                    let bodyText = messageData.text || "New message";
                    if (messageData.isHtml || messageData.isDropReply || messageData.replyToNote) bodyText = "💬 Replied to your post";
                    else if (messageData.isBite) bodyText = "🎬 Sent a Bite video";
                    else if (messageData.isGif) bodyText = "🎞️ Sent a GIF";
                    else if (messageData.imageUrl) bodyText = "📷 Sent an image";
                    else if (messageData.fileMeta?.type?.includes('audio')) bodyText = "🎵 Sent a voice message";
                    else if (messageData.fileUrl) bodyText = "📎 Sent an attachment";

                    const deepLink = chatData.isGroup 
                        ? `https://www.goorac.biz/groupChat.html?id=${chatDoc.id}` 
                        : `https://www.goorac.biz/chat.html?user=${senderUsername}`;

                    participants.forEach(async (targetUid) => {
                        if (targetUid === senderUid) return;

                        await beamsClient.publishToInterests([targetUid], {
                            web: { notification: { title: senderName, body: bodyText, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                            fcm: { notification: { title: senderName, body: bodyText, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                            apns: { aps: { alert: { title: senderName, body: bodyText }, "thread-id": chatDoc.id }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                        });
                    });
                } catch (error) { console.error("❌ Message Push Error:", error); }
            }

            // -----------------------------------------------------------------
            // B. HANDLE MESSAGE REACTIONS (THROTTLED TO PREVENT SPAM)
            // -----------------------------------------------------------------
            if (change.type === 'modified' && messageData.reactions) {
                try {
                    const messageOwner = messageData.sender; 
                    
                    for (const [reactorUid, reactionData] of Object.entries(messageData.reactions)) {
                        
                        if (reactorUid === messageOwner) continue; // Don't notify self

                        // STRICT THROTTLE: Prevents the "multiple notifications" bug
                        // Only allows 1 reaction notification per user, per message, every 10 seconds
                        const throttleKey = `throttle_${docId}_${reactorUid}`;
                        if (reactionThrottle.has(throttleKey)) continue;
                        
                        reactionThrottle.add(throttleKey);
                        setTimeout(() => reactionThrottle.delete(throttleKey), 10000); 

                        // Cache key to permanently log this specific emoji reaction in memory
                        const reactionCacheKey = `reaction_${docId}_${reactorUid}_${reactionData.emoji}`;
                        if (processedMessages.has(reactionCacheKey)) continue;
                        processedMessages.add(reactionCacheKey);
                        setTimeout(() => processedMessages.delete(reactionCacheKey), 180000);

                        const chatRef = change.doc.ref.parent.parent;
                        const chatDoc = await chatRef.get();
                        if (!chatDoc.exists) continue;
                        const chatData = chatDoc.data();

                        const reactorDoc = await db.collection('users').doc(reactorUid).get();
                        const reactorInfo = reactorDoc.data() || {};
                        let reactorName = reactorInfo.name || reactorInfo.username || "Someone";
                        const reactorPhoto = reactorInfo.photoURL || "https://www.goorac.biz/icon.png";
                        const reactorUsername = reactorInfo.username || reactorUid;

                        if (chatData.isGroup) reactorName = `${reactorName} in ${chatData.groupName || 'Group'}`;

                        const title = chatData.isGroup ? reactorName : `New Reaction`;
                        const body = `${chatData.isGroup ? reactorName.split(' ')[0] : reactorName} reacted ${reactionData.emoji} to your message.`;

                        const deepLink = chatData.isGroup 
                            ? `https://www.goorac.biz/groupChat.html?id=${chatDoc.id}` 
                            : `https://www.goorac.biz/chat.html?user=${reactorUsername}`;

                        await beamsClient.publishToInterests([messageOwner], {
                            web: { notification: { title: title, body: body, icon: reactorPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                            fcm: { notification: { title: title, body: body, icon: reactorPhoto }, data: { click_action: deepLink }, priority: "high" },
                            apns: { aps: { alert: { title: title, body: body }, "thread-id": chatDoc.id }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                        });
                    }
                } catch (err) { console.error("❌ Reaction Push Error:", err); }
            }
        });
    }, (error) => { console.error("❌ Messages listener error:", error); });
}

// ============================================================================
// LISTENER 2: LIKES, COMMENTS, DROPS, AND NOTES (Notifications Collection)
// ============================================================================
function startNotificationListener() {
    console.log("🎧 Listening for Likes, Comments, Drops, and Notes...");

    db.collection('notifications').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const docId = change.doc.id;
                if (processedNotifs.has(docId)) return;
                processedNotifs.add(docId);
                setTimeout(() => processedNotifs.delete(docId), 180000); 

                const notifData = change.doc.data();
                
                // BULLETPROOF TIMESTAMP: Uses Firestore creation time if payload timestamp is missing/broken
                let msgTime = SERVER_START_TIME;
                if (change.doc.createTime) msgTime = change.doc.createTime.toMillis();
                else if (notifData.timestamp && notifData.timestamp.toMillis) msgTime = notifData.timestamp.toMillis();
                else if (notifData.timestamp) msgTime = new Date(notifData.timestamp).getTime();

                if (Date.now() - msgTime > 120000) return;
                if (msgTime <= SERVER_START_TIME) return;

                // BULLETPROOF ID CHECKER: Catch fields no matter what they are named
                const targetUid = notifData.toUid || notifData.targetUid || notifData.receiverId || notifData.ownerId;
                const senderUid = notifData.fromUid || notifData.senderUid || notifData.userId || notifData.sender;
                
                if (!targetUid || targetUid === senderUid) return; 

                try {
                    const senderName = notifData.senderName || "Someone";
                    const senderPhoto = notifData.senderPfp || "https://www.goorac.biz/icon.png";
                    const deepLink = notifData.link || notifData.targetUrl || `https://www.goorac.biz/notifications.html`;

                    let title = "New Notification";
                    let body = notifData.text || notifData.body; 

                    // SMART WORDING: Detects exact feature based on type or URL
                    const linkString = deepLink.toLowerCase();

                    if (notifData.type === 'like' || notifData.type === 'note_like' || notifData.type === 'drop_like' || notifData.type === 'like_moment') {
                        title = `New Like ❤️`;
                        if (!body) {
                            if (linkString.includes('note')) body = `${senderName} liked your Note.`;
                            else if (linkString.includes('drop')) body = `${senderName} liked your Drop.`;
                            else if (linkString.includes('moment')) body = `${senderName} liked your Moment.`;
                            else body = `${senderName} liked your post.`;
                        }
                    } else if (notifData.type?.includes('comment') || notifData.type?.includes('reply')) {
                        title = `New Reply 💬`;
                        if (!body) body = `${senderName} replied to you.`;
                    } else {
                        if (!body) body = "Check your activity feed.";
                    }

                    await beamsClient.publishToInterests([targetUid], {
                        web: { notification: { title: title, body: body, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                        fcm: { notification: { title: title, body: body, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title: title, body: body }, "thread-id": "notifications" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
                    console.log(`✅ Event Push sent to ${targetUid}`);

                } catch (error) { console.error("❌ Notification Push Error:", error); }
            }
        });
    }, (error) => { console.error("❌ Notifications listener error:", error); });
}

// Export both listeners wrapped in a single starter function
function startPushListener() {
    startMessageListener();
    startNotificationListener();
}

// Render and other services provide the PORT automatically
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Goorac push server is live and listening on port ${port}`);
  
  // Start the Firebase background listeners when the server boots
  startPushListener();
});

// Require and start the external server logic
require('./server.js');
