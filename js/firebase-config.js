import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyBdjQS6V5cqEIWY7jhDvl9aD9Vx7KOcz8c",
    authDomain: "rescue-68a36.firebaseapp.com",
    projectId: "rescue-68a36",
    storageBucket: "rescue-68a36.firebasestorage.app",
    messagingSenderId: "238746068759",
    appId: "1:238746068759:web:504a97f71d884e7bc4b952",
    measurementId: "G-D35B5HJ27E"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
