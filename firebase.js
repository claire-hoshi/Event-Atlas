  // Import the functions you need from the SDKs you need
  import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-analytics.js";
  // TODO: Add SDKs for Firebase products that you want to use
  // https://firebase.google.com/docs/web/setup#available-libraries

  // Your web app's Firebase configuration
  // For Firebase JS SDK v7.20.0 and later, measurementId is optional
  const firebaseConfig = {
    apiKey: "AIzaSyB3utZ1a7AgboBIpSwekCCjw7tnaANl4bc",
    authDomain: "sample-depauweventmap.firebaseapp.com",
    projectId: "sample-depauweventmap",
    storageBucket: "sample-depauweventmap.firebasestorage.app",
    messagingSenderId: "787823402182",
    appId: "1:787823402182:web:f1d2c7f3b1ca2275488bc7",
    measurementId: "G-DNJ670YP59"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);