const admin = require('firebase-admin');
const PushNotifications = require('@pusher/push-notifications-server');

// 1. Initialize Firebase Admin SDK (To LISTEN to the database)
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("✅ Firebase Admin initialized successfully in push.js");
    } catch (error) {
        console.error("❌ Failed to initialize Firebase Admin. Check FIREBASE_SERVICE_ACCOUNT env var.", error);
    }
}

const db = admin.firestore();

// 2. Initialize Pusher Beams (To SEND the notifications)
// Using your exact Goorac instance keys
const beamsClient = new PushNotifications({
  instanceId: '66574b98-4518-443c-9245-7a3bd9ac0ab7',
  secretKey: '99DC07D1A9F9B584F776F46A3353B3C3FC28CB53EFE8B162D57EBAEB37669A6A' 
});

// 3. The Main Background Listener
function startPushListener() {
    console.log("🎧 Quantum Push Listener activated (Pusher Beams Edition)...");

    // Listen to ALL 'messages' subcollections globally
    db.collectionGroup('messages').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            
            // We only care about BRAND NEW messages
            if (change.type === 'added') {
                const messageData = change.doc.data();
                
                // --- SAFETY CHECKS ---
                if (!messageData.timestamp) return;
                
                // Prevent spam on server reboot: If message is older than 2 mins, ignore it.
                const msgTime = messageData.timestamp.toMillis ? messageData.timestamp.toMillis() : new Date(messageData.timestamp).getTime();
                if (Date.now() - msgTime > 120000) return;

                try {
                    const senderUid = messageData.sender;
                    
                    // --- FIND THE RECIPIENT ---
                    const chatRef = change.doc.ref.parent.parent;
                    const chatDoc = await chatRef.get();
                    if (!chatDoc.exists) return;
                    
                    const chatData = chatDoc.data();
                    const participants = chatData.participants || [];
                    
                    // Identify the Target (The person who is NOT the sender)
                    const targetUid = participants.find(uid => uid !== senderUid);
                    if (!targetUid) return;

                    // --- FETCH SENDER INFO FOR UI ---
                    const senderDoc = await db.collection('users').doc(senderUid).get();
                    const senderData = senderDoc.data() || {};
                    const senderName = senderData.name || senderData.username || "Someone";
                    const senderPhoto = senderData.photoURL || "https://www.goorac.biz/icon.png";
                    const senderUsername = senderData.username || senderUid;

                    // --- FORMAT THE TEXT ---
                    let bodyText = messageData.text || "New message";
                    if (messageData.isBite) bodyText = "🎬 Sent a Bite video";
                    else if (messageData.isGif) bodyText = "🎞️ Sent a GIF";
                    else if (messageData.imageUrl) bodyText = "📷 Sent an image";
                    else if (messageData.fileMeta && messageData.fileMeta.type && messageData.fileMeta.type.includes('audio')) bodyText = "🎵 Sent a voice message";
                    else if (messageData.fileUrl) bodyText = "📎 Sent an attachment";

                    const deepLink = `https://www.goorac.biz/chat.html?user=${senderUsername}`;

                    // --- SEND USING PUSHER BEAMS ---
                    await beamsClient.publishToInterests([targetUid], {
                        
                        // 1. Web Payload (Chrome/Safari/PWA)
                        web: {
                          notification: {
                            title: senderName,
                            body: bodyText,
                            icon: senderPhoto,
                            deep_link: deepLink,
                            hide_notification_if_site_has_focus: true
                          },
                          time_to_live: 3600 
                        },
                        
                        // 2. Android Payload (FCM High Priority)
                        fcm: {
                          notification: { 
                              title: senderName, 
                              body: bodyText, 
                              icon: senderPhoto 
                          },
                          data: { 
                              click_action: deepLink 
                          },
                          priority: "high" 
                        },
                        
                        // 3. iOS Payload (APNs Alert)
                        apns: {
                          aps: {
                            alert: { 
                                title: senderName, 
                                body: bodyText 
                            },
                            "thread-id": senderUid // Groups messages by sender on iOS lock screen
                          },
                          headers: { 
                              "apns-priority": "10", 
                              "apns-push-type": "alert" 
                          }
                        }
                    });

                    console.log(`✅ Pusher notification instantly sent to ${targetUid} from ${senderName}`);

                } catch (error) {
                    console.error("❌ Error processing Pusher notification:", error);
                }
            }
        });
    }, (error) => {
        console.error("❌ Firestore listener critical error:", error);
    });
}

module.exports = { startPushListener };
