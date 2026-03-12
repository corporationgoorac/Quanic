const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const PushNotifications = require('@pusher/push-notifications-server');

const app = express();

// --- THE ULTIMATE ANTI-SPAM CLOCK ---
const SERVER_START_TIME = Date.now(); 

const processedMessages = new Set();
const processedNotifs = new Set();
const reactionThrottle = new Set(); 
const contentThrottle = new Set(); // 🔥 ADDED: Global text deduplication to prevent double-pushes

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
// /send-push API ROUTE COMPLETELY REMOVED AS REQUESTED
// ============================================================================

// ============================================================================
// LISTENER 1: CHATS, GROUP CHATS, DIRECT REPLIES, AND REACTIONS
// ============================================================================
function startMessageListener() {
    console.log("🎧 Listening for Chat Messages, Group Chats & Reactions...");

    db.collectionGroup('messages').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            
            const messageData = change.doc.data();
            const docId = change.doc.id;
            
            // -----------------------------------------------------------------
            // A. STRICTLY NEW MESSAGES
            // -----------------------------------------------------------------
            if (change.type === 'added') {
                
                const msgCreateTime = change.doc.createTime ? change.doc.createTime.toMillis() : Date.now();
                
                // STRICT ANTI-SPAM: If the message is older than 60 seconds, ignore it instantly. 
                if (Date.now() - msgCreateTime > 60000) return; 
                if (msgCreateTime <= SERVER_START_TIME) return; 
                
                if (processedMessages.has(docId)) return;
                processedMessages.add(docId);
                setTimeout(() => processedMessages.delete(docId), 86400000); // 24-hour permanent cache lock

                setTimeout(async () => {
                    try {
                        const senderUid = String(messageData.sender || "").trim();
                        if (!senderUid) return; 

                        const chatRef = change.doc.ref.parent.parent;
                        const chatDocId = chatRef.id;
                        const chatDoc = await chatRef.get();
                        
                        const chatData = chatDoc.exists ? chatDoc.data() : {};
                        const isGroup = chatData.isGroup === true;
                        
                        let targetUids = [];
                        if (isGroup) {
                            targetUids = (chatData.participants || []).filter(uid => String(uid).trim() !== senderUid);
                        } else {
                            const extractedUids = chatDocId.split('_');
                            if (extractedUids.length === 2) {
                                targetUids = [extractedUids[0] === senderUid ? extractedUids[1] : extractedUids[0]];
                            } else {
                                targetUids = (chatData.participants || []).filter(uid => String(uid).trim() !== senderUid);
                            }
                        }

                        // GUARANTEE NO DOUBLE SENDING TO THE SAME USER
                        targetUids = [...new Set(targetUids.filter(uid => String(uid).trim() !== senderUid))];
                        if (targetUids.length === 0) return; 
                        
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
                            try {
                                const targetDoc = await db.collection('users').doc(targetUid).get();
                                const targetActiveChat = targetDoc.data()?.activeChat;
                                if (targetActiveChat === senderUid || targetActiveChat === senderUsername || targetActiveChat === chatDocId) {
                                    console.log(`🔇 Muting: ${targetUid} is actively in this chat.`);
                                    return;
                                }

                                // 🔥 ADDED: Double-Push Prevention Check
                                const throttleKey = `${targetUid}_${bodyText}`;
                                if (contentThrottle.has(throttleKey)) return;
                                contentThrottle.add(throttleKey);
                                setTimeout(() => contentThrottle.delete(throttleKey), 10000); // Locks this exact text for 10 seconds

                                await beamsClient.publishToInterests([targetUid], {
                                    web: { notification: { title: senderName, body: bodyText, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: false }, time_to_live: 3600 },
                                    fcm: { notification: { title: senderName, body: bodyText, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                                    apns: { aps: { alert: { title: senderName, body: bodyText }, "thread-id": chatDocId }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                                });
                            } catch(e) { console.error("Push Error", e); }
                        });
                    } catch (error) { console.error("❌ Message Push Error:", error); }
                }, 1500); 
            }

            // -----------------------------------------------------------------
            // B. STRICTLY MESSAGE REACTIONS
            // -----------------------------------------------------------------
            if (change.type === 'modified' && messageData.reactions) {
                try {
                    const messageOwner = String(messageData.sender || "").trim(); 
                    if (!messageOwner) return;

                    for (const [reactorUid, reactionData] of Object.entries(messageData.reactions)) {
                        
                        const safeReactorUid = String(reactorUid).trim();
                        if (safeReactorUid === messageOwner) continue; 

                        // STRICT ANTI-SPAM: Kills old reactions that trigger during a read-receipt modified event!
                        if (!reactionData.timestamp) continue;
                        if (Date.now() - reactionData.timestamp > 60000) continue; 

                        const reactionCacheKey = `reaction_${docId}_${safeReactorUid}_${reactionData.emoji}`;
                        if (processedMessages.has(reactionCacheKey)) continue;
                        
                        processedMessages.add(reactionCacheKey);
                        setTimeout(() => processedMessages.delete(reactionCacheKey), 86400000); // 24-hour cache lock

                        const chatRef = change.doc.ref.parent.parent;
                        const chatDocId = chatRef.id;
                        
                        const ownerDoc = await db.collection('users').doc(messageOwner).get();
                        const ownerActiveChat = ownerDoc.data()?.activeChat;
                        if (ownerActiveChat === safeReactorUid || ownerActiveChat === chatDocId) continue;

                        const reactorDoc = await db.collection('users').doc(safeReactorUid).get();
                        const reactorInfo = reactorDoc.data() || {};
                        let reactorName = reactorInfo.name || reactorInfo.username || "Someone";
                        const reactorPhoto = reactorInfo.photoURL || "https://www.goorac.biz/icon.png";
                        const reactorUsername = reactorInfo.username || safeReactorUid;

                        const chatDoc = await chatRef.get();
                        const chatData = chatDoc.exists ? chatDoc.data() : {};
                        if (chatData.isGroup) reactorName = `${reactorName} in ${chatData.groupName || 'Group'}`;

                        const title = chatData.isGroup ? reactorName : `New Reaction`;
                        const body = `${chatData.isGroup ? reactorName.split(' ')[0] : reactorName} reacted ${reactionData.emoji} to your message.`;

                        const deepLink = chatData.isGroup 
                            ? `https://www.goorac.biz/groupChat.html?id=${chatDocId}` 
                            : `https://www.goorac.biz/chat.html?user=${reactorUsername}`;

                        await beamsClient.publishToInterests([messageOwner], {
                            web: { notification: { title: title, body: body, icon: reactorPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: false }, time_to_live: 3600 },
                            fcm: { notification: { title: title, body: body, icon: reactorPhoto }, data: { click_action: deepLink }, priority: "high" },
                            apns: { aps: { alert: { title: title, body: body }, "thread-id": chatDocId }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                        });
                    }
                } catch (err) { console.error("❌ Reaction Push Error:", err); }
            }
        });
    }, (error) => { console.error("❌ Messages listener error:", error); });
}

// ============================================================================
// LISTENER 2: LIKES, COMMENTS, DROPS, AND NOTES 
// ============================================================================
function startNotificationListener() {
    console.log("🎧 Listening for Likes, Comments, Drops, and Notes...");

    db.collection('notifications').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            
            if (change.type === 'added') {
                const notifData = change.doc.data();
                const docId = change.doc.id;
                
                let msgCreateTime = SERVER_START_TIME;
                if (change.doc.createTime) msgCreateTime = change.doc.createTime.toMillis();
                else if (notifData.timestamp && notifData.timestamp.toMillis) msgCreateTime = notifData.timestamp.toMillis();
                else if (notifData.timestamp) msgCreateTime = new Date(notifData.timestamp).getTime();

                // STRICT ANTI-SPAM: Must be within 60 seconds
                if (Date.now() - msgCreateTime > 60000) return;
                if (msgCreateTime <= SERVER_START_TIME) return;

                if (processedNotifs.has(docId)) return;
                processedNotifs.add(docId);
                setTimeout(() => processedNotifs.delete(docId), 86400000); // 24-hour cache lock

                // 🔥 ADDED: Added fallback to `notifData.uid` for Drop likes just in case
                let targetUid = String(notifData.toUid || notifData.targetUid || notifData.receiverId || notifData.ownerId || notifData.uid).trim();
                const senderUid = String(notifData.fromUid || notifData.senderUid || notifData.userId || notifData.sender).trim();
                
                // 🔥 ADDED: Hard block for the "undefined" Javascript bug that causes Drops likes to silently fail
                if (targetUid === "undefined") targetUid = "";
                
                if (!targetUid || targetUid === senderUid) return; 

                try {
                    const senderDoc = await db.collection('users').doc(senderUid).get();
                    const senderData = senderDoc.data() || {};
                    const senderName = senderData.name || senderData.username || notifData.senderName || notifData.fromName || "Someone";
                    const senderPhoto = senderData.photoURL || notifData.senderPfp || notifData.fromPfp || "https://www.goorac.biz/icon.png";
                    
                    const deepLink = notifData.link || notifData.targetUrl || `https://www.goorac.biz/notifications.html`;

                    let title = "New Notification";
                    let body = ""; 

                    const textContent = notifData.text || notifData.body || notifData.message || notifData.comment || "";
                    const type = (notifData.type || "").toLowerCase();
                    const linkString = deepLink.toLowerCase();

                    if (type.includes('like')) {
                        title = `New Like ❤️`;
                        if (type === 'note_like' || linkString.includes('note')) body = `${senderName} liked your Note.`;
                        else if (type === 'drop_like' || linkString.includes('drop')) body = `${senderName} liked your Drop.`;
                        else if (type === 'like_moment' || linkString.includes('moment')) body = `${senderName} liked your Moment.`;
                        else body = `${senderName} liked your post.`;
                    } 
                    else if (type.includes('reply') || type.includes('comment')) {
                        title = `New Reply 💬`;
                        if (type === 'drop_reply' || linkString.includes('drop')) body = textContent ? `${senderName} replied to your Drop: "${textContent}"` : `${senderName} replied to your Drop.`;
                        else if (type === 'note_reply' || linkString.includes('note')) body = textContent ? `${senderName} replied to your Note: "${textContent}"` : `${senderName} replied to your Note.`;
                        else body = textContent ? `${senderName} commented: "${textContent}"` : `${senderName} commented on your post.`;
                    } 
                    else body = textContent || "Check your activity feed.";

                    // 🔥 ADDED: Double-Push Prevention Check
                    const throttleKey = `${targetUid}_${body}`;
                    if (contentThrottle.has(throttleKey)) return;
                    contentThrottle.add(throttleKey);
                    setTimeout(() => contentThrottle.delete(throttleKey), 10000); // Locks this exact text for 10 seconds

                    await beamsClient.publishToInterests([targetUid], {
                        web: { notification: { title: title, body: body, icon: senderPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: false }, time_to_live: 3600 },
                        fcm: { notification: { title: title, body: body, icon: senderPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title: title, body: body }, "thread-id": "notifications" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
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

    // 1. INCOMING CALLS
    db.collection('calls').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added' || change.type === 'modified') {
                const callData = change.doc.data();
                if (callData.status !== 'calling') return; 

                const msgUpdateTime = change.doc.updateTime ? change.doc.updateTime.toMillis() : Date.now();
                // STRICT ANTI-SPAM: Must be within 60 seconds
                if (Date.now() - msgUpdateTime > 60000) return;
                if (msgUpdateTime <= SERVER_START_TIME) return;

                const targetUid = String(change.doc.id).trim(); 
                const callerUid = String(callData.callerId).trim();
                if (!targetUid || !callerUid || targetUid === callerUid) return;

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
                        web: { notification: { title, body, icon: callerPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: false }, time_to_live: 60 }, 
                        fcm: { notification: { title, body, icon: callerPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title, body }, "thread-id": "calls" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
                } catch (e) { console.error("❌ Call Push Error:", e); }
            }
        });
    }, (error) => { console.error("❌ Calls listener error:", error); });

    // 2. MISSED CALLS
    db.collection('call_logs').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const logData = change.doc.data();
                if (logData.status !== 'missed') return; 

                const msgCreateTime = change.doc.createTime ? change.doc.createTime.toMillis() : Date.now();
                // STRICT ANTI-SPAM: Must be within 60 seconds
                if (Date.now() - msgCreateTime > 60000) return;
                if (msgCreateTime <= SERVER_START_TIME) return;

                const targetUid = String(logData.receiverId).trim();
                const callerUid = String(logData.callerId).trim();
                if (!targetUid || !callerUid || targetUid === callerUid) return;

                const docId = change.doc.id;
                if (processedNotifs.has(docId)) return;
                processedNotifs.add(docId);
                setTimeout(() => processedNotifs.delete(docId), 86400000);

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
                        web: { notification: { title, body, icon: callerPhoto, deep_link: deepLink, hide_notification_if_site_has_focus: false }, time_to_live: 3600 },
                        fcm: { notification: { title, body, icon: callerPhoto }, data: { click_action: deepLink }, priority: "high" },
                        apns: { aps: { alert: { title, body }, "thread-id": "calls" }, headers: { "apns-priority": "10", "apns-push-type": "alert" } }
                    });
                } catch (e) { console.error("❌ Missed Call Push Error:", e); }
            }
        });
    }, (error) => { console.error("❌ Call Logs listener error:", error); });
}

// Export all listeners wrapped in a single starter function
function startPushListener() {
    startMessageListener();
    startNotificationListener();
    startCallListener(); 
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
