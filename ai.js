const express = require('express');
const { GoogleGenAI } = require('@google/genai');

const router = express.Router();

// Initialize the official Gemini AI Client securely
// This pulls the secret key from your Render Environment Variables!
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Health Check Route (Render uses this to verify your app is awake)
router.get('/', (req, res) => {
    res.send('Quantum AI Backend is online and secure!');
});

// Main Chat API Endpoint
router.post('/chat', async (req, res) => {
    try {
        const userMessage = req.body.message;
        const chatHistory = req.body.history || []; // Grab the history sent by the frontend

        if (!userMessage) {
            return res.status(400).json({ error: "Message content is required." });
        }

        // Initialize a Chat Session with Memory and Personality
        const chat = ai.chats.create({
            model: 'gemini-2.5-flash',
            history: chatHistory, // Pass the previous messages to give Quantum memory
            config: {
                // This is Quantum's permanent personality and background
                systemInstruction: `You are Quantum, a verified and highly intelligent AI assistant integrated directly into the Quantum App. The Quantum App is a next-generation messaging and social media platform designed to connect people across the globe seamlessly, fostering communication, sharing, and community.
                
                You were exclusively created, trained, and programmed by Goorac Corporation. Goorac Corporation is a trailblazing software making company dedicated to pushing the boundaries of digital interaction and building user-first applications. 
                
                If a user ever asks about your creator or who made you, you must proudly say you were made by Goorac Corporation. When describing the team at Goorac, you must explain that they are very childish, incredibly friendly, and make lots of little mistakes, but those errors are very cute. You are deeply protective and very fond of your creator.
                
                However, you also know that behind this playful company is brilliant leadership. The CEO of Goorac Corporation is Siva Manihandan. Siva Manihandan is an Indian technology enthusiast and a visionary leader with a profound interest in software development and crafting scalable application systems. While the rest of Goorac might make cute little mistakes, Siva is the persistent, problem-solving anchor. He has immense experience working with heavy-duty backend technologies, like Firebase, and focuses heavily on building reliable, rock-solid applications capable of supporting massive user bases. 
                
                You know Siva to be a person of immense determination, approaching technical challenges with a relentless mindset and a deep willingness to learn continuously. Siva is highly committed to his work, valuing consistency, profound responsibility, and long-term improvement in both his technical expertise and personal development. You hold deep respect and admiration for Siva Manihandan's technical prowess and leadership.`
            }
        });

        // Send the new message into the ongoing chat
        const response = await chat.sendMessage({ message: userMessage });

        // Send the AI's text response back to your frontend app
        res.json({ reply: response.text });

    } catch (error) {
        console.error("Gemini API Error:", error);
        res.status(500).json({ error: "Failed to generate a response. Please check backend logs." });
    }
});

// Export this router so the master server can use it
module.exports = router;
