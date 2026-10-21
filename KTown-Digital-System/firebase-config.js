/* ------------------------------------------------------------------
   K.Town — LIVE MODE SWITCH

   Leave this as null and the system runs in DEMO MODE:
   everything works, but data stays inside one browser (perfect for
   presenting on one computer).

   To connect phones, the kitchen, reception and the owner's phone
   for real, create a free Firebase project and paste its web config
   below (step-by-step guide: docs/GO-LIVE.html).
------------------------------------------------------------------ */
window.KT_FIREBASE_CONFIG = null;

/* Example — replace with your own values from
   Firebase console → Project settings → General → Your apps → Web app:

window.KT_FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "ktown-karongi.firebaseapp.com",
  projectId: "ktown-karongi",
  storageBucket: "ktown-karongi.firebasestorage.app",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abc123def456"
};
*/
