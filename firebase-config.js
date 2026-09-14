// firebase-config.js
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB56yTog2Hdu44hx1zEeh9ooy9SPYIZ-GA",
  authDomain: "green-life-india-6e253.firebaseapp.com",
  projectId: "green-life-india-6e253",
  storageBucket: "green-life-india-6e253.firebasestorage.app",
  messagingSenderId: "712681280286",
  appId: "1:712681280286:web:afeae2f2070fac23bbaf0f",
  measurementId: "G-V5M07PTHKW"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const ADMIN_EMAIL = "greenlifeindia.nagpur@gmail.com";
