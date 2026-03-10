const express = require('express');
const cors = require('cors');
const PushNotifications = require('@pusher/push-notifications-server');

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
  const { targetUid, title, body, icon, click_action } = req.body;
  const deepLink = click_action || "https://www.goorac.biz";

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
      priority: "high" // <-- Wakes up Android immediately
    },

    // 3. iOS Payload (APNs) - FORCES ULTRA-FAST DELIVERY
    apns: {
      aps: {
        alert: {
          title: title,
          body: body
        }
      },
      headers: {
        "apns-priority": "10", // <-- Wakes up iPhones immediately
        "apns-push-type": "alert"
      }
    }
    
  })
  .then((publishResponse) => {
    console.log('Successfully sent HIGH PRIORITY notification to:', targetUid);
    res.json({ success: true, publishResponse });
  })
  .catch((error) => {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: error.message });
  });
});

// Render and other services provide the PORT automatically
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Goorac push server is live and listening on port ${port}`);
});
require('./server.js');
