const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const PushNotifications = require('@pusher/push-notifications-server');

const app = express();

// --- ADDED: Strict Server Boot Time and Memory Caches to prevent duplicate sends ---
const SERVER_START_TIME = Date.now();
const processedMessages = new Set();
const processedNotifs = new Set();

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
// LISTENER 1: CHATS, GROUP CHATS, AND DIRECT REPLIES
// ============================================================================
function startMessageListener() {
    console.log("🎧 Listening for Chat & Group Messages...");

    db.collectionGroup('messages').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                // --- ADDED: Deduplication Cache to prevent double processing in same session ---
                const docId = change.doc.id;
                if (processedMessages.has(docId)) return;
                processedMessages.add(docId);
                setTimeout(() => processedMessages.delete(docId), 180000); // Clear memory after 3 mins

                const messageData = change.doc.data();
                
                if (!messageData.timestamp) return;
                const msgTime = messageData.timestamp.toMillis ? messageData.timestamp.toMillis() : new Date(messageData.timestamp).getTime();
                if (Date.now() - msgTime > 120000) return; // Ignore old messages on reboot
                
                // --- ADDED: Strict check to ensure we ONLY process messages that arrive AFTER boot ---
                if (msgTime <= SERVER_START_TIME) return; 

                try {
                    const senderUid = messageData.sender;
                    const chatRef = change.doc.ref.parent.parent;
                    const chatDoc = await chatRef.get();
                    if (!chatDoc.exists) return;
                    
                    const chatData = chatDoc.data();
                    const participants = chatData.participants || [];
                    
                    // Get Sender Info
                    const senderDoc = await db.collection('users').doc(senderUid).get();
                    const senderData = senderDoc.data() || {};
                    let senderName = senderData.name || senderData.username || "Someone";
                    const senderPhoto = senderData.photoURL || "https://www.goorac.biz/icon.png";
                    const senderUsername = senderData.username || senderUid;

                    // Group Chat logic: Add group name to title
                    if (chatData.isGroup) {
                        senderName = `${senderName} in ${chatData.groupName || 'Group'}`;
                    }

                    // Format Text
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

                    // Send to all participants EXCEPT the sender
                    participants.forEach(async (targetUid) => {
                        if (targetUid === senderUid) return;

                        await beamsClient.publishToInterests([targetUid], {
                            web: { notification: { title: senderName, body: bodyText, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                            fcm: { notification: { title: senderName, body: bodyText, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                            apns: { aps: { alert: { title: senderName, body: bodyText }, "thread-id": chatDoc.id }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                        });
                        console.log(`✅ Message Push sent to ${targetUid}`);
                    });
                } catch (error) { console.error("❌ Message Push Error:", error); }
            }
        });
    }, (error) => { console.error("❌ Messages listener error:", error); });
}

// ============================================================================
// LISTENER 2: LIKES, COMMENTS, AND DROPS (Notifications Collection)
// ============================================================================
function startNotificationListener() {
    console.log("🎧 Listening for Likes, Comments, and Drops...");

    db.collection('notifications').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                // --- ADDED: Deduplication Cache for notifications ---
                const docId = change.doc.id;
                if (processedNotifs.has(docId)) return;
                processedNotifs.add(docId);
                setTimeout(() => processedNotifs.delete(docId), 180000); // Clear memory after 3 mins

                const notifData = change.doc.data();
                
                if (!notifData.timestamp) return;
                const msgTime = notifData.timestamp.toMillis ? notifData.timestamp.toMillis() : new Date(notifData.timestamp).getTime();
                if (Date.now() - msgTime > 120000) return;
                
                // --- ADDED: Strict check to ensure we ONLY process notifications that arrive AFTER boot ---
                if (msgTime <= SERVER_START_TIME) return;

                const targetUid = notifData.toUid;
                const senderUid = notifData.fromUid;
                if (!targetUid || targetUid === senderUid) return; // Don't notify yourself

                try {
                    const senderName = notifData.senderName || "Someone";
                    const senderPhoto = notifData.senderPfp || "https://www.goorac.biz/icon.png";
                    const deepLink = notifData.link || `https://www.goorac.biz/notifications.html`;

                    // Smart Title Formatting based on the event type
                    let title = "New Notification";
                    let body = notifData.text || notifData.body || "Check your activity feed.";

                    if (notifData.type === 'like' || notifData.type === 'drop_like' || notifData.type === 'like_moment') {
                        title = `New Like ❤️`;
                        if (!notifData.body && !notifData.text) body = `${senderName} liked your post.`;
                    } else if (notifData.type === 'comment_moment') {
                        title = `New Comment 💬`;
                    } else if (notifData.type === 'reply_moment') {
                        title = `New Reply 💬`;
                    }

                    await beamsClient.publishToInterests([targetUid], {
                        web: { notification: { title: title, body: body, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                        fcm: { notification: { title: title, body: body, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title: title, body: body }, "thread-id": "notifications" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
                    console.log(`✅ Event Push (${notifData.type}) sent to ${targetUid}`);

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
