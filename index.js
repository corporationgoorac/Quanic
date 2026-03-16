import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import dotenv from 'dotenv';
import http from 'http'; // ADDED: Built-in Node module for the dummy server

dotenv.config();

// 1. Initialize Firebase Admin securely using the Render Environment Variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

// Hugging Face API settings
const HF_API_KEY = process.env.HF_API_KEY;
const HF_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"; // Highly capable, fast model

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
        
        // Extract routing data from the document reference path
        // Path structure: users/{uid}/chats/{chatId}/messages/{messageId}
        const uid = messageRef.path.split('/')[1];
        const chatId = messageRef.path.split('/')[3];

        console.log(`[Quan AI] Intercepted new request in chat: ${chatId} from user: ${uid}`);

        try {
            // Step A: Immediately lock the message so we don't process it twice
            await messageRef.update({ needs_ai_reply: false });

            // Step B: Fetch User's Core Memory from their profile
            const userRef = db.collection('users').doc(uid);
            const userSnap = await userRef.get();
            const memory = userSnap.exists ? (userSnap.data().memory || "") : "";
            const userName = userSnap.exists ? (userSnap.data().name || "User") : "User";

            // Step C: Fetch the last 5 messages for conversation context
            const chatHistorySnap = await db.collection(`users/${uid}/chats/${chatId}/messages`)
                .orderBy('timestamp', 'desc')
                .limit(5)
                .get();
            
            let conversationHistory = "";
            // Reverse so they are in chronological order
            chatHistorySnap.docs.reverse().forEach(doc => {
                const data = doc.data();
                conversationHistory += `${data.role === 'user' ? userName : 'Quan'}: ${data.text}\n`;
            });

            // Step D: Construct the System Prompt
            const prompt = `<s>[INST] You are Quan AI, an infinite intelligence built by Goorac Corporation.
You are talking to ${userName}.
User's Core Memory/Background: ${memory}

Always be concise, highly professional, and deeply helpful. Do not mention you are an AI model created by Mistral or Hugging Face. You belong to Goorac Corporation.

Conversation Context:
${conversationHistory}
Quan: [/INST]`;

            // Step E: Call Hugging Face API (UPDATED TO THE NEW ROUTER ENDPOINT)
            const response = await fetch(`https://router.huggingface.co/hf-inference/models/${HF_MODEL}`, {
                headers: {
                    "Authorization": `Bearer ${HF_API_KEY}`,
                    "Content-Type": "application/json"
                },
                method: "POST",
                body: JSON.stringify({
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 500,
                        temperature: 0.7,
                        return_full_text: false
                    }
                })
            });

            if (!response.ok) throw new Error(`Hugging Face API Error: ${response.statusText}`);
            
            const result = await response.json();
            const aiReply = result[0].generated_text.trim();

            // Step F: Write the AI's response back to the chat room
            await db.collection(`users/${uid}/chats/${chatId}/messages`).add({
                text: aiReply,
                role: "ai",
                timestamp: FieldValue.serverTimestamp(),
                needs_ai_reply: false
            });

            // Step G: Update the parent chat room's updatedAt timestamp to bump it in the sidebar
            await db.collection(`users/${uid}/chats`).doc(chatId).set({
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`[Quan AI] Successfully replied to chat: ${chatId}`);

        } catch (error) {
            console.error(`[Quan AI] Error processing message ${messageDoc.id}:`, error);
            
            // Fallback error message to the user
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

// 3. ADDED: Dummy Web Server to satisfy Render's port scanner
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Quan AI Worker is healthy and listening to Firebase.');
}).listen(port, '0.0.0.0', () => {
    console.log(`[Quan AI] Dummy server listening on port ${port} to keep Render happy.`);
});
