const PushNotifications = require('@pusher/push-notifications-server');
const cron = require('node-cron');

// Initialize Pusher Beams
const beamsClient = new PushNotifications({
  instanceId: '66574b98-4518-443c-9245-7a3bd9ac0ab7',
  secretKey: '99DC07D1A9F9B584F776F46A3353B3C3FC28CB53EFE8B162D57EBAEB37669A6A' 
});

const iconUrl = "https://github.com/corporationgoorac/Goorac/raw/refs/heads/main/images/icon.png";
const clickUrl = "https://www.goorac.biz/home.html";

// --- MESSAGE BANKS (Upgraded to Title/Body format) ---

const morningMessages = [
  // Original 10 adapted
  { title: "Good morning!", body: "What's on your mind? Post a note now." },
  { title: "Rise and shine!", body: "Share your first thought of the day on Quantum." },
  { title: "Good morning!", body: "Set the tone for your day with a new note." },
  { title: "Wakey wakey!", body: "The Quantum network is waiting for your morning vibe." },
  { title: "A fresh day begins!", body: "What are your goals today? Drop a note." },
  { title: "Good morning!", body: "Got any wild dreams to share before you forget them?" },
  { title: "Start your day right.", body: "Post a quick morning update!" },
  { title: "Good morning!", body: "Coffee in hand? Time to check in on Quantum." },
  { title: "New morning, new moment.", body: "What's happening in your world?" },
  { title: "Morning!", body: "The dashboard is empty without your daily note." },
  // 50 New Additions
  { title: "Good morning!", body: "Let's get this day started! Share a quick note." },
  { title: "Happy morning!", body: "Who are you checking in on today? Post a note!" },
  { title: "Good morning!", body: "Another day, another Quantum moment. What's up?" },
  { title: "Rise and grind!", body: "What's the first thing on your checklist today?" },
  { title: "Morning check-in!", body: "Drop a note to let your network know you're awake." },
  { title: "Good morning!", body: "Anything exciting planned for today?" },
  { title: "Hello world!", body: "Start your morning by dropping a thought on Quantum." },
  { title: "Good morning!", body: "Your network is waking up. Say hello!" },
  { title: "Early bird gets the worm!", body: "Post the first note of the day." },
  { title: "Good morning!", body: "What's your morning motivation today?" },
  { title: "Top of the morning!", body: "Share a fresh note to start the day." },
  { title: "Good morning!", body: "Did you sleep well? Drop a quick update." },
  { title: "Sunrise vibes!", body: "Post a picture or note of your morning." },
  { title: "Good morning!", body: "What's the best thing that could happen today?" },
  { title: "Morning magic!", body: "Start the day with a positive note." },
  { title: "Good morning!", body: "Got a morning routine? Share it with the network." },
  { title: "Hey there!", body: "The Quantum timeline awaits your morning post." },
  { title: "Good morning!", body: "Drop a note and kickstart your day!" },
  { title: "Fresh start!", body: "Clear your mind and post a morning note." },
  { title: "Good morning!", body: "What are you having for breakfast? Let us know." },
  { title: "Morning thoughts!", body: "Share your early morning brainstorms." },
  { title: "Good morning!", body: "It's a beautiful day. Post a note about it!" },
  { title: "Awake and online!", body: "Make your presence known on Quantum." },
  { title: "Good morning!", body: "Any big news to share this morning?" },
  { title: "Morning boost!", body: "Send some good vibes to your network." },
  { title: "Good morning!", body: "Take 10 seconds to share your morning mood." },
  { title: "Daybreak!", body: "What's the plan for today? Drop a note." },
  { title: "Good morning!", body: "Your friends haven't heard from you yet today!" },
  { title: "Morning focus!", body: "What's your main priority today? Post it." },
  { title: "Good morning!", body: "Time to shine! Share a Quantum note." },
  { title: "Hello morning!", body: "Drop a note before the busy day begins." },
  { title: "Good morning!", body: "Got a quote of the day? Share it now." },
  { title: "Morning energy!", body: "Let your network feel your morning vibe." },
  { title: "Good morning!", body: "What's the weather like? Post an update." },
  { title: "New dawn!", body: "A new opportunity to post a great note." },
  { title: "Good morning!", body: "Start a conversation on Quantum this morning." },
  { title: "Morning alert!", body: "Time to catch up on what you missed overnight." },
  { title: "Good morning!", body: "Share a thought to inspire your network today." },
  { title: "Ready for the day?", body: "Prove it with a quick Quantum post!" },
  { title: "Good morning!", body: "Don't let the morning pass without a note." },
  { title: "Morning reflections!", body: "What are you grateful for today?" },
  { title: "Good morning!", body: "It's time to log your first moment of the day." },
  { title: "Bright and early!", body: "Drop a note while the world is still quiet." },
  { title: "Good morning!", body: "What's playing in your headphones this morning?" },
  { title: "Morning hustle!", body: "Share your early grind with your network." },
  { title: "Good morning!", body: "Take a deep breath and post a note." },
  { title: "Morning greeting!", body: "Say hi to everyone on Quantum." },
  { title: "Good morning!", body: "Set your intentions for the day with a note." },
  { title: "Morning update!", body: "Keep your friends in the loop right from the start." },
  { title: "Good morning!", body: "Let's make today amazing. Post a note!" }
];

const afternoonMessages = [
  // Original 10 adapted
  { title: "Halfway there!", body: "How's your day going? Drop a note." },
  { title: "Lunchtime!", body: "Take a break and share a moment on Quantum." },
  { title: "Good afternoon!", body: "Need a midday reset? Post what's on your mind." },
  { title: "Afternoon check-in!", body: "Keep your network updated." },
  { title: "Hope your day is productive!", body: "Take a second to share a note." },
  { title: "Midday slump?", body: "Wake up your friends with a new Quantum post." },
  { title: "Good afternoon!", body: "What's the highlight of your day so far?" },
  { title: "Take a breather.", body: "What are you up to this afternoon?" },
  { title: "Afternoon vibes!", body: "Share a quick update with the network." },
  { title: "Just checking in!", body: "Drop a midday note for your friends." },
  // 50 New Additions
  { title: "Good afternoon!", body: "How is your schedule looking? Drop a note." },
  { title: "Midday break!", body: "Grab a snack and post a quick update." },
  { title: "Good afternoon!", body: "Still crushing it? Let your network know." },
  { title: "Afternoon thoughts!", body: "What's on your mind right now?" },
  { title: "Good afternoon!", body: "Take 5 minutes to catch up on Quantum." },
  { title: "Lunch break check-in!", body: "What are you eating? Share a note!" },
  { title: "Good afternoon!", body: "Have you drank enough water? Post an update." },
  { title: "Afternoon energy!", body: "Send some motivation to your network." },
  { title: "Good afternoon!", body: "Time for a quick stretch and a Quantum post." },
  { title: "Midday recap!", body: "Summarize your morning in a single note." },
  { title: "Good afternoon!", body: "Is today going as planned? Drop a thought." },
  { title: "Afternoon check!", body: "Who is online? Post a note to find out." },
  { title: "Good afternoon!", body: "Share a random thought from your afternoon." },
  { title: "Midday hustle!", body: "Keep the momentum going with a quick post." },
  { title: "Good afternoon!", body: "What's the most interesting thing that happened today?" },
  { title: "Afternoon reset!", body: "Clear your head and share a moment." },
  { title: "Good afternoon!", body: "Your network misses you. Say hello!" },
  { title: "Lunch hour vibes!", body: "Drop a note before you get back to work." },
  { title: "Good afternoon!", body: "Got any afternoon plans? Let us know." },
  { title: "Midday inspiration!", body: "Share a quote or thought to boost your friends." },
  { title: "Good afternoon!", body: "Take a step back. Post what you're feeling." },
  { title: "Afternoon grind!", body: "Document your hard work on Quantum." },
  { title: "Good afternoon!", body: "Need a distraction? See what's new on the timeline." },
  { title: "Midday mood!", body: "How are you feeling at this exact moment?" },
  { title: "Good afternoon!", body: "It's the perfect time for a quick note." },
  { title: "Afternoon chill!", body: "Taking it easy today? Post an update." },
  { title: "Good afternoon!", body: "What's playing on your afternoon playlist?" },
  { title: "Midday update!", body: "Keep the timeline active with your thoughts." },
  { title: "Good afternoon!", body: "Any surprises today? Share them here." },
  { title: "Afternoon check-up!", body: "Check in on your friends with a new note." },
  { title: "Good afternoon!", body: "What's the weather doing now? Drop a note." },
  { title: "Midday moment!", body: "Snap a pic or write a note about right now." },
  { title: "Good afternoon!", body: "Don't let the afternoon drag. Post something fun!" },
  { title: "Afternoon boost!", body: "Drop a high-energy note for your network." },
  { title: "Good afternoon!", body: "Take a breath. Post a note. Keep going." },
  { title: "Midday check!", body: "Are you staying productive? Let us know." },
  { title: "Good afternoon!", body: "Share a quick win from your day so far." },
  { title: "Afternoon update!", body: "Your friends are waiting for your note." },
  { title: "Good afternoon!", body: "Time flies! Drop a note before the day is over." },
  { title: "Midday magic!", body: "Make someone smile with a positive afternoon note." }
];

const eveningMessages = [
  // Original 10 adapted
  { title: "Good evening!", body: "How was your day? Post a note." },
  { title: "Winding down?", body: "Share your final thoughts of the day on Quantum." },
  { title: "Good evening!", body: "Time to reflect—drop a note about your day." },
  { title: "The day is almost over.", body: "What was your best moment?" },
  { title: "Evening check-in!", body: "Let your network know how today went." },
  { title: "Relax and unwind.", body: "Share a chill evening note." },
  { title: "Good evening!", body: "Got any late-night thoughts to post?" },
  { title: "Wrapping up the day?", body: "Leave a note for your friends to wake up to." },
  { title: "Sunset vibes.", body: "What's on your mind tonight?" },
  { title: "Good evening!", body: "Summarize your day in a single Quantum note." },
  // 50 New Additions
  { title: "Good evening!", body: "What's for dinner? Drop a tasty update." },
  { title: "Nighttime vibes!", body: "Share your evening mood with your network." },
  { title: "Good evening!", body: "Did you accomplish everything today? Post a note." },
  { title: "Evening chill!", body: "What are you watching or reading tonight?" },
  { title: "Good evening!", body: "End your day on a high note. Literally!" },
  { title: "Night owl?", body: "The network is still awake. Post a thought!" },
  { title: "Good evening!", body: "Take a moment to decompress on Quantum." },
  { title: "Evening reflections!", body: "What did you learn today? Share it." },
  { title: "Good evening!", body: "Time to log off soon? Drop one last note." },
  { title: "Late-night thoughts!", body: "Share those deep evening brainstorms." },
  { title: "Good evening!", body: "How are you spending your night? Let us know." },
  { title: "Evening unwind!", body: "Post a note and let the day's stress go." },
  { title: "Good evening!", body: "Got any fun plans for tonight? Drop an update." },
  { title: "Night check-in!", body: "See who else is up late on Quantum." },
  { title: "Good evening!", body: "Share a cozy moment from your night." },
  { title: "Evening review!", body: "Rate your day from 1 to 10 in a note." },
  { title: "Good evening!", body: "Your daily dashboard is waiting for an evening update." },
  { title: "Sunset thoughts!", body: "Post a picture of your evening." },
  { title: "Good evening!", body: "What are you looking forward to tomorrow?" },
  { title: "Evening peace!", body: "Drop a calming note for your friends." },
  { title: "Good evening!", body: "Did anything funny happen today? Share it!" },
  { title: "Nightcap!", body: "Finish strong with a final Quantum post." },
  { title: "Good evening!", body: "Catch up on what you missed today." },
  { title: "Evening calm!", body: "Take a deep breath and share your thoughts." },
  { title: "Good evening!", body: "Before you sleep, drop a note for the timeline." },
  { title: "Nightly check!", body: "Make sure you left your mark on today." },
  { title: "Good evening!", body: "What's your favorite part of the night? Post it." },
  { title: "Evening wrap-up!", body: "Close out the day with your network." },
  { title: "Good evening!", body: "Got a song stuck in your head tonight? Share it." },
  { title: "Nighttime updates!", body: "Keep the timeline fresh before bed." },
  { title: "Good evening!", body: "How was the weather today? Drop a final note." },
  { title: "Evening relaxation!", body: "Put your feet up and post a moment." },
  { title: "Good evening!", body: "Did you talk to someone special today? Share a hint!" },
  { title: "Late-night inspiration!", body: "Leave a thought for the early birds tomorrow." },
  { title: "Good evening!", body: "It's quiet time. What's on your mind?" },
  { title: "Evening recap!", body: "What was the highlight of your afternoon?" },
  { title: "Good evening!", body: "Time for a final check of the Quantum network." },
  { title: "Nightly thoughts!", body: "Share a random thought before you sleep." },
  { title: "Good evening!", body: "Hope you had a great day! Post a note to celebrate." },
  { title: "Signing off?", body: "Drop a 'goodnight' note for your friends." }
];

// --- BROADCAST FUNCTION ---
function sendBroadcast(msgData) {
  beamsClient.publishToInterests(['hello'], {
    web: {
      notification: {
        title: msgData.title,
        body: msgData.body,
        icon: iconUrl,
        deep_link: clickUrl,
        hide_notification_if_site_has_focus: false
      }
    },
    fcm: {
      notification: {
        title: msgData.title,
        body: msgData.body,
        icon: iconUrl
      },
      data: {
        click_action: clickUrl
      },
      priority: "high"
    },
    apns: {
      aps: {
        alert: {
          title: msgData.title,
          body: msgData.body
        }
      },
      headers: {
        "apns-priority": "10",
        "apns-push-type": "alert"
      }
    }
  })
  .then((publishResponse) => {
    console.log(`✅ Scheduled Broadcast Sent: "${msgData.title} - ${msgData.body}" | ID: ${publishResponse.publishId}`);
  })
  .catch((error) => {
    console.error('❌ Error sending scheduled notification:', error);
  });
}

// Wrap the schedules so they can be triggered from the master server
module.exports = function startScheduledPushes() {
  // --- SCHEDULES ---
  // The timezone parameter ensures it fires exactly at your local time, regardless of Render's server location.

  // 1. Morning Schedule (6:45 AM)
  cron.schedule('45 6 * * *', () => {
    const randomMsg = morningMessages[Math.floor(Math.random() * morningMessages.length)];
    sendBroadcast(randomMsg);
  }, { timezone: "Asia/Kolkata" });

  // 2. Afternoon Schedule (12:30 PM)
  cron.schedule('30 12 * * *', () => {
    const randomMsg = afternoonMessages[Math.floor(Math.random() * afternoonMessages.length)];
    sendBroadcast(randomMsg);
  }, { timezone: "Asia/Kolkata" });

  // 3. Evening Schedule (7:30 PM / 19:30)
  cron.schedule('30 19 * * *', () => {
    const randomMsg = eveningMessages[Math.floor(Math.random() * eveningMessages.length)];
    sendBroadcast(randomMsg);
  }, { timezone: "Asia/Kolkata" });

  console.log('⏳ Goorac Quantum Scheduled Notification Service is running...');
};
