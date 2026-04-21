/* ═════════════════════════════════════════════════
   AURES Competence Model — Firebase Auth
   Email/password, no roles, logs updatedBy on writes.
   ═════════════════════════════════════════════════ */

const loginOverlay = () => document.getElementById("loginOverlay");
const loginBtn = () => document.getElementById("loginBtn");
const logoutBtn = () => document.getElementById("logoutBtn");
const loginError = () => document.getElementById("loginError");

function setLoginError(message) {
    const el = loginError();
    if (!el) return;
    el.textContent = message;
    el.style.display = "block";
}

function clearLoginError() {
    const el = loginError();
    if (el) el.style.display = "none";
}

function setAuthUiState({ loginLoading = false, showLogout = false } = {}) {
    const lb = loginBtn();
    if (lb) {
        lb.textContent = loginLoading ? "Ověřuji…" : "Přihlásit se";
        lb.disabled = loginLoading;
    }
    const out = logoutBtn();
    if (out) out.classList.toggle("hidden", !showLogout);
}

function showLoginOverlay(message) {
    const o = loginOverlay();
    if (!o) return;
    o.style.display = "flex";
    setAuthUiState({ showLogout: false });
    if (message) setLoginError(message); else clearLoginError();
}

function hideLoginOverlay() {
    const o = loginOverlay();
    if (!o) return;
    o.style.display = "none";
    clearLoginError();
    setAuthUiState({ showLogout: true });
}

function handleLogin() {
    if (!FIREBASE_ENABLED) {
        setLoginError("Firebase není nakonfigurován — viz docs/firebase-setup.md.");
        return;
    }
    const email = (document.getElementById("loginEmail").value || "").trim();
    const password = document.getElementById("loginPassword").value || "";

    clearLoginError();

    if (!email || !password) {
        setLoginError("Vyplňte e-mail i heslo.");
        return;
    }
    if (password.length < 6) {
        setLoginError("Heslo musí mít alespoň 6 znaků.");
        return;
    }

    setAuthUiState({ loginLoading: true });

    firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => {
            // onAuthStateChanged takes over.
        })
        .catch(error => {
            let message = "Přihlášení se nezdařilo. Zkuste to znovu.";
            const code = error && error.code;
            if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-login-credentials") {
                message = "Neplatný e-mail nebo heslo.";
            } else if (code === "auth/too-many-requests") {
                message = "Příliš mnoho neúspěšných pokusů. Zkuste to později.";
            } else if (code === "auth/invalid-email") {
                message = "E-mail má špatný formát.";
            } else if (code === "auth/network-request-failed") {
                message = "Nelze se připojit k Firebase. Zkontrolujte síť.";
            }
            setLoginError(message);
            setAuthUiState();
        });
}

function handleLogout() {
    if (!FIREBASE_ENABLED) return;
    stopFirebaseListeners();
    firebase.auth().signOut().finally(() => {
        State.currentUser = null;
        showLoginOverlay();
    });
}

window.addEventListener("load", () => {
    if (!FIREBASE_ENABLED) {
        return;
    }
    firebase.auth().onAuthStateChanged(user => {
        if (user) {
            State.currentUser = user;
            hideLoginOverlay();
            startFirebaseListeners();
        } else {
            State.currentUser = null;
            stopFirebaseListeners();
            showLoginOverlay();
        }
    });
});
