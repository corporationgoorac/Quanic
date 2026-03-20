import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBcqRDG1k2zqQrfLGJa1qbz83B_IlffbtU",
  authDomain: "quanic-goorac.firebaseapp.com",
  projectId: "quanic-goorac",
  storageBucket: "quanic-goorac.firebasestorage.app",
  messagingSenderId: "897545048675",
  appId: "1:897545048675:web:d4c3e639cc0f0035435e56",
  measurementId: "G-SE4ZTDFE1L"
};

// Initialize Services
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider(); // For easy Google Login

// ImgBB API Key for Image Uploads
const IMGBB_API_KEY = "Ec521beb5111f54fc727ee473dea38be";

export { db, auth, googleProvider, IMGBB_API_KEY };
