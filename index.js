const express = require('express');
const cors = require('cors');
const PushNotifications = require('@pusher/push-notifications-server');
// --- ADDED: Import the push listener from your push.js file ---
const { startPushListener } = require('./push.js');

const app = express();

// Allows your Goorac frontend to talk to this server without CORS errors
app.use(cors()); 
app.use(express.json());

// --- HEALTH CHECK ROUTES FOR UPTIME MONITORS ---
// A simple home route to check if the server is alive
app.get('/', (req, res) => {
  res.send('Goorac Push Server is Online and Permanent!');
});

// A dedicated ping route for cron-job.org to hit every 10 minutes to prevent Render sleep
app.get('/ping', (req, res) => {
  res.status(200).send('Pong! Server is awake.');
});

// Initialize Pusher Beams with your specific Goorac keys
const beamsClient = new PushNotifications({
  instanceId: '66574b98-4518-443c-9245-7a3bd9ac0ab7',
  secretKey: '99DC07D1A9F9B584F776F46A3353B3C3FC28CB53EFE8B162D57EBAEB37669A6A' 
});

// The endpoint your chat app will call to trigger an ultra-fast notification
app.post('/send-push', (req, res) => {
  const { targetUid, senderUid, title, body, icon, click_action } = req.body;
  const deepLink = click_action || "https://www.goorac.biz";

  // 🚀 SPEED HACK: Instantly respond to the frontend in ~5ms so the chat UI never hangs
  res.status(200).json({ success: true, message: "Push request accepted, processing extremely fast in background" });

  beamsClient.publishToInterests([targetUid], {
    
    // 1. Web Payload (For Chrome/Safari Desktop & PWA)
    web: {
      notification: {
        title: title,
        body: body,
        icon: icon,
        deep_link: deepLink,
        hide_notification_if_site_has_focus: true
      },
      time_to_live: 3600 // Drops notification if user is offline for >1 hour
    },

    // 2. Android Payload (FCM) - FORCES ULTRA-FAST DELIVERY
    fcm: {
      notification: {
        title: title,
        body: body,
        icon: icon
      },
      data: {
        click_action: deepLink
      },
      priority: "high" // <-- Wakes up Android immediately. Note: Removed "tag" so it stacks normally instead of replacing!
    },

    // 3. iOS Payload (APNs) - FORCES ULTRA-FAST DELIVERY
    apns: {
      aps: {
        alert: {
          title: title,
          body: body
        },
        "thread-id": senderUid // <-- iOS GROUPING: Stacks messages from the same sender cleanly
      },
      headers: {
        "apns-priority": "10", // <-- Wakes up iPhones immediately
        "apns-push-type": "alert"
      }
    }
    
  })
  .then((publishResponse) => {
    console.log('Successfully sent HIGH PRIORITY notification to:', targetUid, '| ID:', publishResponse.publishId);
  })
  .catch((error) => {
    console.error('Error sending notification in background:', error);
  });
});

// Render and other services provide the PORT automatically
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Goorac push server is live and listening on port ${port}`);
  
  // --- ADDED: Start the Firebase background listener when the server boots ---
  startPushListener();
});

require('./server.js');
