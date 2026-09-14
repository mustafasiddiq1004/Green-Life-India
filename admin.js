// admin.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";
import { firebaseConfig, ADMIN_EMAIL } from "./firebase-config.js";


// ---------- Startup diagnostics ----------
console.log("========================================");
console.log("🔧 Admin Panel Diagnostics");
console.log("========================================");
console.log("API Key:", firebaseConfig.apiKey?.slice(0, 12) + "...");
console.log("Project ID:", firebaseConfig.projectId);
console.log("Auth Domain:", firebaseConfig.authDomain);
console.log("Expected admin email:", ADMIN_EMAIL);
console.log("Current URL:", window.location.href);
console.log("Hostname:", window.location.hostname);
console.log("========================================");

// Warn if config still has placeholder values
if (firebaseConfig.apiKey.includes("XXXX") || firebaseConfig.appId.includes("abcdef")) {
  console.error("❌ FIREBASE CONFIG STILL HAS PLACEHOLDER VALUES!");
  console.error("   Open firebase-config.js and replace with real keys.");
}

let app, auth, db, storage;
try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  console.log("✅ Firebase initialized");
} catch (err) {
  console.error("❌ Firebase init failed:", err);
}

// ---------- DOM ----------
const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const userEmail = document.getElementById("userEmail");
const logoutBtn = document.getElementById("logoutBtn");
const uploadForm = document.getElementById("uploadForm");
const uploadBtn = document.getElementById("uploadBtn");
const uploadBtnText = document.getElementById("uploadBtnText");
const uploadMsg = document.getElementById("uploadMsg");
const projectsList = document.getElementById("projectsList");
const projectCount = document.getElementById("projectCount");
const preview = document.getElementById("preview");

// ---------- Login ----------
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "Signing in…";
  loginError.style.color = "#617066";

  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;

  console.log("🔐 Attempting login for:", email);
  console.log("   (email length:", email.length, ", password length:", password.length, ")");

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    console.log("✅ Login success:", cred.user.email);

    if (cred.user.email !== ADMIN_EMAIL) {
      console.warn("⚠️ Logged in, but email does not match ADMIN_EMAIL.");
      console.warn("   Logged in as:", cred.user.email);
      console.warn("   Expected:   ", ADMIN_EMAIL);
      await signOut(auth);
      loginError.textContent = `This account is not the admin. Expected ${ADMIN_EMAIL}, got ${cred.user.email}.`;
      loginError.style.color = "#c0392b";
    }
  } catch (err) {
    console.error("❌ Login error code:", err.code);
    console.error("❌ Login error msg: ", err.message);
    loginError.textContent = explainError(err.code, err.message);
    loginError.style.color = "#c0392b";
  }
});

function explainError(code, message) {
  const map = {
    "auth/invalid-api-key":
      "❌ Firebase API key is invalid. Your firebase-config.js still has placeholder values. Replace with real keys.",
    "auth/unauthorized-domain":
      "❌ This domain is not authorized. Add '" + window.location.hostname + "' in Firebase Console → Authentication → Settings → Authorized domains.",
    "auth/invalid-credential":
      "❌ Wrong email or password. Verify the user exists in Firebase Auth → Users, and re-type the password.",
    "auth/wrong-password":
      "❌ Wrong password. Reset it in Firebase Console → Authentication → Users → click user → Reset password.",
    "auth/user-not-found":
      "❌ No user with this email. Create it in Firebase Console → Authentication → Users → Add user.",
    "auth/operation-not-allowed":
      "❌ Email/Password sign-in is disabled. Enable it in Firebase Console → Authentication → Sign-in method.",
    "auth/too-many-requests":
      "❌ Too many failed attempts. Wait 5 minutes, then try again.",
    "auth/network-request-failed":
      "❌ Network blocked. Disable ad blockers, VPN, or try another browser.",
    "auth/invalid-email":
      "❌ Email format is invalid. Double-check for typos."
  };
  return map[code] || `Login failed: [${code}] ${message}`;
}

// ---------- Auth state ----------
onAuthStateChanged(auth, (user) => {
  console.log("👤 Auth state changed. User:", user ? user.email : "none");
  if (user && user.email === ADMIN_EMAIL) {
    loginScreen.style.display = "none";
    dashboard.style.display = "block";
    userEmail.textContent = user.email;
    loadProjects();
  } else if (user) {
    console.warn("⚠️ Logged in but not admin. Signing out.");
    signOut(auth);
  } else {
    loginScreen.style.display = "grid";
    dashboard.style.display = "none";
  }
});

logoutBtn?.addEventListener("click", () => signOut(auth));

// ---------- Image preview ----------
document.getElementById("pImage")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) { preview.innerHTML = ""; return; }
  preview.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Preview">`;
});

// ---------- Upload ----------
uploadForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  uploadMsg.textContent = "";
  uploadMsg.className = "status-msg";

  const title = document.getElementById("pTitle").value.trim();
  const category = document.getElementById("pCategory").value;
  const size = document.getElementById("pSize").value.trim();
  const type = document.getElementById("pType").value.trim();
  const location = document.getElementById("pLocation").value.trim();
  const description = document.getElementById("pDescription").value.trim();
  const videoUrl = document.getElementById("pVideo").value.trim();
  const imageFile = document.getElementById("pImage").files[0];

  if (!imageFile) return showMsg("Please select an image.", "error");
  if (imageFile.size > 5 * 1024 * 1024) return showMsg("Image exceeds 5 MB.", "error");

  setUploading(true);
  try {
    const ext = imageFile.name.split(".").pop().toLowerCase();
    const filename = `projects/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const storageRef = ref(storage, filename);

    console.log("📤 Uploading image:", filename);
    await uploadBytes(storageRef, imageFile);
    const imageUrl = await getDownloadURL(storageRef);
    console.log("✅ Image uploaded:", imageUrl);

    await addDoc(collection(db, "projects"), {
      title, category, size, type, location, description,
      imageUrl, imagePath: filename,
      videoUrl: videoUrl || null,
      createdAt: serverTimestamp()
    });

    showMsg("✓ Project published!", "success");
    uploadForm.reset();
    preview.innerHTML = "";
    loadProjects();
  } catch (err) {
    console.error("❌ Upload failed:", err);
    showMsg("Upload failed: " + err.message, "error");
  } finally {
    setUploading(false);
  }
});

function setUploading(on) {
  uploadBtn.disabled = on;
  uploadBtnText.textContent = on ? "Uploading…" : "Publish to Gallery →";
}
function showMsg(msg, type) {
  uploadMsg.textContent = msg;
  uploadMsg.className = "status-msg " + type;
}

// ---------- Projects list ----------
async function loadProjects() {
  projectsList.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    projectCount.textContent = `(${items.length})`;

    if (!items.length) {
      projectsList.innerHTML = '<div class="empty-state">No projects yet.</div>';
      return;
    }

    projectsList.innerHTML = items.map(p => `
      <div class="admin-project-row">
        <img src="${p.imageUrl}" alt="">
        <div>
          <h4>${escapeHtml(p.title)}</h4>
          <p>${escapeHtml(p.category)} • ${escapeHtml(p.size)} • ${escapeHtml(p.location)}</p>
        </div>
        <button class="btn-delete" data-id="${p.id}" data-path="${escapeAttr(p.imagePath)}">Delete</button>
      </div>
    `).join("");

    projectsList.querySelectorAll(".btn-delete").forEach(btn => {
      btn.addEventListener("click", () => deleteProject(btn.dataset.id, btn.dataset.path));
    });
  } catch (err) {
    console.error("❌ Load failed:", err);
    projectsList.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

async function deleteProject(id, imagePath) {
  if (!confirm("Delete this project permanently?")) return;
  try {
    if (imagePath) {
      try { await deleteObject(ref(storage, imagePath)); } catch (_) {}
    }
    await deleteDoc(doc(db, "projects", id));
    loadProjects();
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function escapeAttr(str = "") { return escapeHtml(str); }
