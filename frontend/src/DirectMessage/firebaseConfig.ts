import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAK4h0y3kWQ-65JbeG-0ao1RPiuI1lM6jQ",
  authDomain: "corporate-brain-3f8a1.firebaseapp.com",
  projectId: "corporate-brain-3f8a1",
  storageBucket: "corporate-brain-3f8a1.firebasestorage.app",
  messagingSenderId: "147494015773",
  appId: "1:147494015773:web:267538547f685dd16547f4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
