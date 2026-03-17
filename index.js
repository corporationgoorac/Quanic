import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

// 1. Initialize Firebase Admin securely
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Groq API settings
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = "llama-3.3-70b-versatile"; 

console.log("[Quan AI Backend] Worker started. Listening for incoming messages...");

// 2. Global Listener for new messages requiring AI response
db.collectionGroup('messages')
  .where('needs_ai_reply', '==', true)
  .onSnapshot(async (snapshot) => {
    
    for (const change of snapshot.docChanges()) {
      if (change.type === 'added') {
        const messageDoc = change.doc;
        const messageData = messageDoc.data();
        const messageRef = messageDoc.ref;
        
        const uid = messageRef.path.split('/')[1];
        const chatId = messageRef.path.split('/')[3];

        console.log(`[Quan AI] Intercepted new request in chat: ${chatId} from user: ${uid}`);

        try {
            // Step A: Immediately lock the message
            await messageRef.update({ needs_ai_reply: false });

            // Step B: Fetch User's Core Memory
            const userRef = db.collection('users').doc(uid);
            const userSnap = await userRef.get();
            const memory = userSnap.exists ? (userSnap.data().memory || "") : "";
            const userName = userSnap.exists ? (userSnap.data().name || "User") : "User";

            // Step C: Fetch chat history
            const chatHistorySnap = await db.collection(`users/${uid}/chats/${chatId}/messages`)
                .orderBy('timestamp', 'desc')
                .limit(5)
                .get();
            
            // Step D: Construct Payload with the AUTO-MEMORY DIRECTIVE
            let messagesPayload = [
                {
                    role: "system",
                    content: `You are Quan AI, an infinite intelligence built by Goorac Corporation. You are talking to ${userName}. 
                    
CURRENT MEMORY FILE: 
"""
${memory}
"""
You MUST use this memory to personalize your responses. Always be concise, highly professional, and deeply helpful. Do not mention you are an AI model created by Meta or Groq. You belong to Goorac Corporation.

CRITICAL DIRECTIVE - AUTO-MEMORY:
If the user tells you a new, permanent personal fact (e.g., "I like red", "I am a developer", "I have a dog named Max"), you MUST append this exact tag to the VERY END of your response:
<UPDATE_MEMORY>User likes red.</UPDATE_MEMORY>
Do not use this tag for normal conversation, only for permanent facts.`
                }
            ];

            let hasImageInHistory = false;

            chatHistorySnap.docs.reverse().forEach(doc => {
                const data = doc.data();
                let messageContent = data.text; 
                
                if (data.role === 'user' && data.imageUrl) {
                    hasImageInHistory = true;
                    messageContent = [
                        { type: "text", text: data.text || "Please analyze this image." },
                        { type: "image_url", image_url: { url: data.imageUrl } } 
                    ];
                }

                messagesPayload.push({
                    role: data.role === 'user' ? 'user' : 'assistant',
                    content: messageContent
                });
            });

            const ACTIVE_MODEL = hasImageInHistory ? "meta-llama/llama-4-scout-17b-16e-instruct" : GROQ_MODEL;

            // Step E: Call GROQ API 
            const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
                headers: {
                    "Authorization": `Bearer ${GROQ_API_KEY}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({
                    model: ACTIVE_MODEL,
                    messages: messagesPayload,
                    max_tokens: 500,
                    temperature: 0.7
                })
            });

            if (!response.ok) {
                const errorDetails = await response.text();
                throw new Error(`Groq API Error: ${response.status} - ${errorDetails}`);
            }
            
            const result = await response.json();
            let aiReply = result.choices[0].message.content.trim();
            let newFactToSave = null;

            // NEW: Intercept the Auto-Memory Tag!
            const memoryRegex = /<UPDATE_MEMORY>(.*?)<\/UPDATE_MEMORY>/is;
            const memoryMatch = aiReply.match(memoryRegex);

            if (memoryMatch) {
                newFactToSave = memoryMatch[1].trim();
                // Strip the tag so the frontend never sees it
                aiReply = aiReply.replace(memoryRegex, '').trim(); 
            }

            // Step F: Write the clean AI's response back to the chat room
            await db.collection(`users/${uid}/chats/${chatId}/messages`).add({
                text: aiReply,
                role: "ai",
                timestamp: FieldValue.serverTimestamp(),
                needs_ai_reply: false
            });

            // NEW Step F.2: Save the extracted memory to the user's profile
            if (newFactToSave) {
                console.log(`[Quan AI] 🧠 Learned a new fact: ${newFactToSave}`);
                
                // Append the new fact to the old memory, separated by a pipe or newline
                const updatedMemory = memory ? `${memory} | ${newFactToSave}` : newFactToSave;
                
                await db.collection('users').doc(uid).set({
                    memory: updatedMemory
                }, { merge: true });
            }

            // Step G: Update the parent chat room's updatedAt timestamp
            await db.collection(`users/${uid}/chats`).doc(chatId).set({
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`[Quan AI] Successfully replied to chat: ${chatId}`);

        } catch (error) {
            console.error(`[Quan AI] Error processing message ${messageDoc.id}:`, error);
            
            await db.collection(`users/${uid}/chats/${chatId}/messages`).add({
                text: "I am experiencing a temporary connection issue with the Goorac servers. Please try again in a moment.",
                role: "ai",
                timestamp: FieldValue.serverTimestamp(),
                needs_ai_reply: false
            });
        }
      }
    }
});

// 3. Dummy Web Server for Render
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Quan AI Worker is healthy and listening to Firebase.');
}).listen(port, '0.0.0.0', () => {
    console.log(`[Quan AI] Dummy server listening on port ${port}.`);
});
