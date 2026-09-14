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

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// ---------- DOM refs ----------
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

// ---------- Auth ----------
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    loginError.textContent = friendlyAuthError(err.code);
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (user && user.email === ADMIN_EMAIL) {
    loginScreen.style.display = "none";
    dashboard.style.display = "block";
    userEmail.textContent = user.email;
    loadProjects();
  } else if (user) {
    // Wrong user — sign them out
    signOut(auth);
    loginError.textContent = "This account is not authorized as admin.";
  } else {
    loginScreen.style.display = "grid";
    dashboard.style.display = "none";
  }
});

function friendlyAuthError(code) {
  switch (code) {
    case "auth/invalid-email": return "Invalid email address.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "Incorrect email or password.";
    case "auth/too-many-requests": return "Too many attempts. Try again later.";
    default: return "Login failed. Please try again.";
  }
}

// ---------- Image preview ----------
document.getElementById("pImage").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) { preview.innerHTML = ""; return; }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `<img src="${url}" alt="Preview">`;
});

// ---------- Upload new project ----------
uploadForm.addEventListener("submit", async (e) => {
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
  if (imageFile.size > 5 * 1024 * 1024) return showMsg("Image is larger than 5 MB.", "error");

  setUploading(true);
  try {
    // 1. Upload image to Storage
    const ext = imageFile.name.split(".").pop().toLowerCase();
    const filename = `projects/${Date.now()}-${crypto.randomUUID()}.${ext}`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, imageFile);
    const imageUrl = await getDownloadURL(storageRef);

    // 2. Extract storage path so we can delete later
    const imagePath = filename;

    // 3. Save metadata to Firestore
    await addDoc(collection(db, "projects"), {
      title, category, size, type, location, description,
      imageUrl, imagePath,
      videoUrl: videoUrl || null,
      createdAt: serverTimestamp()
    });

    showMsg("✓ Project published to gallery!", "success");
    uploadForm.reset();
    preview.innerHTML = "";
    loadProjects();
  } catch (err) {
    console.error(err);
    showMsg("Upload failed: " + err.message, "error");
  } finally {
    setUploading(false);
  }
});

function setUploading(isUploading) {
  uploadBtn.disabled = isUploading;
  uploadBtnText.textContent = isUploading ? "Uploading..." : "Publish to Gallery →";
}

function showMsg(msg, type) {
  uploadMsg.textContent = msg;
  uploadMsg.className = "status-msg " + type;
}

// ---------- Load & render existing projects ----------
async function loadProjects() {
  projectsList.innerHTML = '<div class="empty-state">Loading…</div>';
  try {
    const q = query(collection(db, "projects"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    projectCount.textContent = `(${items.length})`;

    if (!items.length) {
      projectsList.innerHTML = '<div class="empty-state">No projects yet. Add your first one above.</div>';
      return;
    }

    projectsList.innerHTML = items.map(p => `
      <div class="admin-project-row">
        <img src="${p.imageUrl}" alt="${escapeAttr(p.title)}">
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
    console.error(err);
    projectsList.innerHTML = `<div class="empty-state">Failed to load: ${escapeHtml(err.message)}</div>`;
  }
}

async function deleteProject(id, imagePath) {
  if (!confirm("Delete this project permanently?")) return;
  try {
    if (imagePath) {
      try { await deleteObject(ref(storage, imagePath)); } catch (_) { /* already gone */ }
    }
    await deleteDoc(doc(db, "projects", id));
    loadProjects();
  } catch (err) {
    alert("Delete failed: " + err.message);
  }
}

// ---------- Utils ----------
function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
function escapeAttr(str = "") { return escapeHtml(str); }