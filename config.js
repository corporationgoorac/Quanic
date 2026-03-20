// Import the functions you need from the SDKs
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";

// Add the Auth and Firestore SDKs needed for Quanic
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBcqRDG1k2zqQrfLGJa1qbz83B_IlffbtU",
  authDomain: "quanic-goorac.firebaseapp.com",
  projectId: "quanic-goorac",
  storageBucket: "quanic-goorac.firebasestorage.app",
  messagingSenderId: "897545048675",
  appId: "1:897545048675:web:d4c3e639cc0f0035435e56",
  measurementId: "G-SE4ZTDFE1L"
};

// 1. Initialize Firebase App
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// 2. Initialize Firebase Authentication
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

// 3. Initialize Cloud Firestore (Database)
const db = getFirestore(app);

// 4. Export these tools so your other HTML pages can use them
export { app, auth, googleProvider, db, analytics };
