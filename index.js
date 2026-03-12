const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const PushNotifications = require('@pusher/push-notifications-server');

const app = express();

// --- STRICT CACHES to prevent duplicate sends and reaction spam ---
// FIXED: Set to 0. Phone clock drift was causing users with slow clocks to be permanently blocked by this check!
const SERVER_START_TIME = 0; 
const processedMessages = new Set();
const processedNotifs = new Set();
const reactionThrottle = new Set(); // Specifically limits reaction spam

// --- NEW FIX: Boot Phase Lock ---
// Prevents downloading and processing thousands of historical messages on server restart
let isBooting = true;
setTimeout(() => { 
    isBooting = false; 
    console.log("🚀 Quantum Boot Phase Complete. Live Listening Active."); 
}, 10000); // 10-second lock

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
// LISTENER 1: CHATS, GROUP CHATS, DIRECT REPLIES, AND REACTIONS
// ============================================================================
function startMessageListener() {
    console.log("🎧 Listening for Chat Messages, Group Chats & Reactions...");

    db.collectionGroup('messages').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            
            // STRICT FIX: Ignore all historical snapshot data during the first 10 seconds
            if (isBooting) return;

            // Handle both new messages AND modified messages (for reactions)
            if (change.type === 'added' || change.type === 'modified') {
                const messageData = change.doc.data();
                const docId = change.doc.id;
                
                // RELIABLE TIMESTAMP: Uses Firestore's un-hackable create/update time
                let msgTime = SERVER_START_TIME;
                if (change.doc.createTime) msgTime = change.doc.createTime.toMillis();
                if (change.doc.updateTime && change.type === 'modified') msgTime = change.doc.updateTime.toMillis();

                // FIXED: Increased to 24 hours (86400000ms) to completely fix the "stops working after a while" bug caused by phone clock drift
                if (Date.now() - msgTime > 86400000) return;
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
                        if (!senderUid) return; // Safety check to prevent server crashes

                        const chatRef = change.doc.ref.parent.parent;
                        const chatDocId = chatRef.id;
                        const chatDoc = await chatRef.get();
                        
                        // RACE CONDITION FIX: Do not rely solely on the document existing. 
                        // It might not be fully written yet by the frontend!
                        const chatData = chatDoc.exists ? chatDoc.data() : {};
                        const isGroup = chatData.isGroup === true;
                        
                        let targetUids = [];
                        
                        if (isGroup) {
                            // Group chats must read from participants array
                            targetUids = (chatData.participants || []).filter(uid => uid !== senderUid);
                        } else {
                            // 1-on-1 chats mathematically extract the target from the ID string instantly!
                            const extractedUids = chatDocId.split('_');
                            if (extractedUids.length === 2) {
                                targetUids = [extractedUids[0] === senderUid ? extractedUids[1] : extractedUids[0]];
                            } else {
                                targetUids = (chatData.participants || []).filter(uid => uid !== senderUid);
                            }
                        }

                        if (targetUids.length === 0) return; // Abort if no target found
                        
                        const senderDoc = await db.collection('users').doc(senderUid).get();
                        const senderData = senderDoc.data() || {};
                        let senderName = senderData.name || senderData.username || "Someone";
                        const senderPhoto = senderData.photoURL || "https://www.goorac.biz/icon.png";
                        const senderUsername = senderData.username || senderUid;

                        if (isGroup) senderName = `${senderName} in ${chatData.groupName || 'Group'}`;

                        let bodyText = messageData.text || "New message";
                        if (messageData.isHtml || messageData.isDropReply || messageData.replyToNote) bodyText = "💬 Replied to your post";
                        else if (messageData.isBite) bodyText = "🎬 Sent a Bite video";
                        else if (messageData.isGif) bodyText = "🎞️ Sent a GIF";
                        else if (messageData.imageUrl) bodyText = "📷 Sent an image";
                        else if (messageData.fileMeta?.type?.includes('audio')) bodyText = "🎵 Sent a voice message";
                        else if (messageData.fileUrl) bodyText = "📎 Sent an attachment";

                        const deepLink = isGroup 
                            ? `https://www.goorac.biz/groupChat.html?id=${chatDocId}` 
                            : `https://www.goorac.biz/chat.html?user=${senderUsername}`;

                        targetUids.forEach(async (targetUid) => {
                            await beamsClient.publishToInterests([targetUid], {
                                web: { notification: { title: senderName, body: bodyText, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                                fcm: { notification: { title: senderName, body: bodyText, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                                apns: { aps: { alert: { title: senderName, body: bodyText }, "thread-id": chatDocId }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
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
                        if (!messageOwner) return;

                        for (const [reactorUid, reactionData] of Object.entries(messageData.reactions)) {
                            
                            if (reactorUid === messageOwner) continue; // Don't notify self
                            if (!reactorUid) continue;

                            // STRICT THROTTLE: Prevents the "multiple notifications" bug
                            // Only allows 1 reaction notification per user, per message, every 10 seconds
                            const throttleKey = `throttle_${docId}_${reactorUid}`;
                            if (reactionThrottle.has(throttleKey)) continue;
                            
                            reactionThrottle.add(throttleKey);
                            setTimeout(() => reactionThrottle.delete(throttleKey), 10000); 

                            // FIXED: Increased drift tolerance to 24 hours to stop bugs on mobile
                            if (Date.now() - reactionData.timestamp > 86400000) continue;
                            if (reactionData.timestamp <= SERVER_START_TIME) continue;

                            // Cache key to permanently log this specific emoji reaction in memory
                            const reactionCacheKey = `reaction_${docId}_${reactorUid}_${reactionData.emoji}`;
                            if (processedMessages.has(reactionCacheKey)) continue;
                            processedMessages.add(reactionCacheKey);
                            setTimeout(() => processedMessages.delete(reactionCacheKey), 180000);

                            const chatRef = change.doc.ref.parent.parent;
                            const chatDocId = chatRef.id;
                            const chatDoc = await chatRef.get();
                            
                            // Safe fetching of group data
                            const chatData = chatDoc.exists ? chatDoc.data() : {};
                            const isGroup = chatData.isGroup === true;

                            const reactorDoc = await db.collection('users').doc(reactorUid).get();
                            const reactorInfo = reactorDoc.data() || {};
                            let reactorName = reactorInfo.name || reactorInfo.username || "Someone";
                            const reactorPhoto = reactorInfo.photoURL || "https://www.goorac.biz/icon.png";
                            const reactorUsername = reactorInfo.username || reactorUid;

                            if (isGroup) reactorName = `${reactorName} in ${chatData.groupName || 'Group'}`;

                            const title = isGroup ? reactorName : `New Reaction`;
                            const body = `${isGroup ? reactorName.split(' ')[0] : reactorName} reacted ${reactionData.emoji} to your message.`;

                            const deepLink = isGroup 
                                ? `https://www.goorac.biz/groupChat.html?id=${chatDocId}` 
                                : `https://www.goorac.biz/chat.html?user=${reactorUsername}`;

                            await beamsClient.publishToInterests([messageOwner], {
                                web: { notification: { title: title, body: body, icon: reactorPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                                fcm: { notification: { title: title, body: body, icon: reactorPhoto }, data: { click_action: deepLink }, priority: "high" },
                                apns: { aps: { alert: { title: title, body: body }, "thread-id": chatDocId }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                            });
                        }
                    } catch (err) { console.error("❌ Reaction Push Error:", err); }
                }
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
            
            // STRICT FIX: Ignore all historical snapshot data during the first 10 seconds
            if (isBooting) return;

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

                // FIXED: Increased tolerance to 24 hours to prevent dropped notifications due to client drift
                if (Date.now() - msgTime > 86400000) return;
                if (msgTime <= SERVER_START_TIME) return;

                // BULLETPROOF ID CHECKER: Catch fields no matter what they are named in the frontend
                const targetUid = notifData.toUid || notifData.targetUid || notifData.receiverId || notifData.ownerId;
                const senderUid = notifData.fromUid || notifData.senderUid || notifData.userId || notifData.sender;
                
                if (!targetUid || targetUid === senderUid) return; 

                try {
                    // NEW FIX: ALWAYS fetch exact user profile to guarantee Names and PFPs are correct
                    const senderDoc = await db.collection('users').doc(senderUid).get();
                    const senderData = senderDoc.data() || {};
                    const senderName = senderData.name || senderData.username || notifData.senderName || notifData.fromName || "Someone";
                    const senderPhoto = senderData.photoURL || notifData.senderPfp || notifData.fromPfp || "https://www.goorac.biz/icon.png";
                    
                    const deepLink = notifData.link || notifData.targetUrl || `https://www.goorac.biz/notifications.html`;

                    let title = "New Notification";
                    let body = ""; 

                    // Get whatever text the user sent, checking all possible frontend variables
                    const textContent = notifData.text || notifData.body || notifData.message || notifData.comment || "";
                    
                    // SMART WORDING: Detects exact feature based on type or URL
                    const type = (notifData.type || "").toLowerCase();
                    const linkString = deepLink.toLowerCase();

                    // --- 1. HANDLE LIKES ---
                    if (type.includes('like')) {
                        title = `New Like ❤️`;
                        if (type === 'note_like' || linkString.includes('note')) body = `${senderName} liked your Note.`;
                        else if (type === 'drop_like' || linkString.includes('drop')) body = `${senderName} liked your Drop.`;
                        else if (type === 'like_moment' || linkString.includes('moment')) body = `${senderName} liked your Moment.`;
                        else body = `${senderName} liked your post.`;
                    } 
                    // --- 2. HANDLE REPLIES & COMMENTS ---
                    else if (type.includes('reply') || type.includes('comment')) {
                        title = `New Reply 💬`;
                        if (type === 'drop_reply' || linkString.includes('drop')) {
                             body = textContent ? `${senderName} replied to your Drop: "${textContent}"` : `${senderName} replied to your Drop.`;
                        } else if (type === 'note_reply' || linkString.includes('note')) {
                             body = textContent ? `${senderName} replied to your Note: "${textContent}"` : `${senderName} replied to your Note.`;
                        } else {
                             body = textContent ? `${senderName} commented: "${textContent}"` : `${senderName} commented on your post.`;
                        }
                    } 
                    // --- 3. FALLBACK ---
                    else {
                        body = textContent || "Check your activity feed.";
                    }

                    await beamsClient.publishToInterests([targetUid], {
                        web: { notification: { title: title, body: body, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                        fcm: { notification: { title: title, body: body, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title: title, body: body }, "thread-id": "notifications" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
                    console.log(`✅ Event Push sent to ${targetUid} for type: ${type}`);

                } catch (error) { console.error("❌ Notification Push Error:", error); }
            }
        });
    }, (error) => { console.error("❌ Notifications listener error:", error); });
}

// ============================================================================
// LISTENER 3: AUDIO AND VIDEO CALLS
// ============================================================================
function startCallListener() {
    console.log("🎧 Listening for Incoming and Missed Calls...");

    // 1. INCOMING CALLS (Watches the 'calls' signaling collection)
    db.collection('calls').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            
            if (isBooting) return;

            if (change.type === 'added' || change.type === 'modified') {
                const callData = change.doc.data();
                if (callData.status !== 'calling') return; // Only notify if currently ringing

                const targetUid = change.doc.id; // Receiver's UID is the Document ID
                const callerUid = callData.callerId;
                if (!targetUid || !callerUid) return;

                // Throttle calls to prevent ringing them 50 times during ICE candidate exchange
                const throttleKey = `call_${targetUid}_${callerUid}`;
                if (processedNotifs.has(throttleKey)) return;
                processedNotifs.add(throttleKey);
                setTimeout(() => processedNotifs.delete(throttleKey), 45000); 

                try {
                    const callerDoc = await db.collection('users').doc(callerUid).get();
                    const callerInfo = callerDoc.data() || {};
                    const callerName = callerInfo.name || callerInfo.username || callData.callerName || "Someone";
                    const callerPhoto = callerInfo.photoURL || callData.callerPfp || "https://www.goorac.biz/icon.png";
                    
                    const isVideo = callData.type === 'video';

                    const title = isVideo ? "Incoming Video Call 🎥" : "Incoming Audio Call 📞";
                    const body = `${callerName} is calling you... Tap to answer.`;
                    const deepLink = `https://www.goorac.biz/calls.html`;

                    await beamsClient.publishToInterests([targetUid], {
                        web: { notification: { title, body, icon: callerPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 60 }, // Expires quickly
                        fcm: { notification: { title, body, icon: callerPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title, body }, "thread-id": "calls" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
                    console.log(`✅ Incoming Call Push sent to ${targetUid}`);
                } catch (e) { console.error("❌ Call Push Error:", e); }
            }
        });
    }, (error) => { console.error("❌ Calls listener error:", error); });

    // 2. MISSED CALLS (Watches the 'call_logs' collection)
    db.collection('call_logs').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            
            let msgTime = SERVER_START_TIME;
            if (change.doc.createTime) msgTime = change.doc.createTime.toMillis();

            // STRICT FIX: Ignore historical data on boot, BUT allow missed calls from the last 10 minutes
            if (isBooting && (Date.now() - msgTime > 600000)) return;

            if (change.type === 'added') {
                const logData = change.doc.data();
                if (logData.status !== 'missed') return; // Only notify if missed

                const targetUid = logData.receiverId;
                const callerUid = logData.callerId;
                if (!targetUid || targetUid === callerUid) return;

                const docId = change.doc.id;
                if (processedNotifs.has(docId)) return;
                processedNotifs.add(docId);
                setTimeout(() => processedNotifs.delete(docId), 180000);

                try {
                    const callerDoc = await db.collection('users').doc(callerUid).get();
                    const callerInfo = callerDoc.data() || {};
                    const callerName = callerInfo.name || callerInfo.username || logData.callerName || "Someone";
                    const callerPhoto = callerInfo.photoURL || logData.callerPfp || "https://www.goorac.biz/icon.png";
                    
                    const isVideo = logData.type === 'video';

                    const title = "Missed Call 📵";
                    const body = `You missed a ${isVideo ? 'video' : 'voice'} call from ${callerName}.`;
                    const deepLink = `https://www.goorac.biz/calls.html`;

                    await beamsClient.publishToInterests([targetUid], {
                        web: { notification: { title, body, icon: callerPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: true }, time_to_live: 3600 },
                        fcm: { notification: { title, body, icon: callerPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title, body }, "thread-id": "calls" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
                    console.log(`✅ Missed Call Push sent to ${targetUid}`);
                } catch (e) { console.error("❌ Missed Call Push Error:", e); }
            }
        });
    }, (error) => { console.error("❌ Call Logs listener error:", error); });
}

// Export all listeners wrapped in a single starter function
function startPushListener() {
    startMessageListener();
    startNotificationListener();
    startCallListener(); // <-- Starts the new Call Listeners
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
