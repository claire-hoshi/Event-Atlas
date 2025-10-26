// Firebase Messaging service worker
// Uses compat build for service worker environment
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyB3utZ1a7AgboBIpSwekCCjw7tnaANl4bc",
  authDomain: "sample-depauweventmap.firebaseapp.com",
  projectId: "sample-depauweventmap",
  storageBucket: "sample-depauweventmap.firebasestorage.app",
  messagingSenderId: "787823402182",
  appId: "1:787823402182:web:f1d2c7f3b1ca2275488bc7",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Event update';
  const options = {
    body: payload.notification?.body || '',
    icon: '/favicon.ico',
    data: payload.data || {}
  };
  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || '/';
  event.waitUntil(clients.openWindow(url));
});
