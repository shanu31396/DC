import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  addDoc,
  collection,
  onSnapshot, 
  increment, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// =====================================================
// 1. APNA FIREBASE CONFIG YAHAN PASTE KAREIN
// =====================================================
  const firebaseConfig = {
    apiKey: "AIzaSyA9XkZ8iRyjKETR0sCQ9pFtYjc1aIpszBE",
    authDomain: "tictac-1st.firebaseapp.com",
    projectId: "tictac-1st",
    storageBucket: "tictac-1st.firebasestorage.app",
    messagingSenderId: "621934319150",
    appId: "1:621934319150:web:9c1dfa0a00d5ee99d731bf",
    measurementId: "G-QBQH1QPZ18"
  };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// DOM Elements
const loginScreen = document.getElementById("login-screen");
const appScreen = document.getElementById("app-screen");
const googleLoginBtn = document.getElementById("google-login-btn");
const logoutBtn = document.getElementById("logout-btn");
const userNameEl = document.getElementById("user-name");
const walletBalanceEl = document.getElementById("wallet-balance");
const modalBalanceEl = document.getElementById("modal-balance");

const taskLevelBadge = document.getElementById("task-level-badge");
const taskProgressText = document.getElementById("task-progress-text");
const taskProgressFill = document.getElementById("task-progress-fill");
const claimRewardBtn = document.getElementById("claim-reward-btn");

const cells = document.querySelectorAll(".cell");
const gameStatusEl = document.getElementById("game-status");
const startMatchBtn = document.getElementById("start-match-btn");

const adModal = document.getElementById("ad-modal");
const adTimerBadge = document.getElementById("ad-timer-badge");
const skipAdBtn = document.getElementById("skip-ad-btn");

const withdrawModal = document.getElementById("withdraw-modal");
const openWithdrawBtn = document.getElementById("open-withdraw-btn");
const closeWithdrawBtn = document.getElementById("close-withdraw-btn");
const submitWithdrawBtn = document.getElementById("submit-withdraw-btn");
const upiInput = document.getElementById("upi-input");
const saveUpiBtn = document.getElementById("save-upi-btn");
const upiSavedStatus = document.getElementById("upi-saved-status");
const withdrawAmountInput = document.getElementById("withdraw-amount-input");
const toastEl = document.getElementById("toast");

let currentUser = null;
let userData = null;
let unsubscribeUser = null;

let boardState = Array(9).fill(null);
let isGameActive = false;
let isPlayerTurn = false;
let matchStartTime = 0;
let movesCount = 0;

const WIN_PATTERNS = [
  [0,1,2], [3,4,5], [6,7,8],
  [0,3,6], [1,4,7], [2,5,8],
  [0,4,8], [2,4,6]
];

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove("hidden");
  setTimeout(() => toastEl.classList.add("hidden"), 3000);
}

// =====================================================
// 2. AUTHENTICATION & REALTIME DATABASE SYNC
// =====================================================
googleLoginBtn.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    showToast("Login failed: " + err.message);
  }
});

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    loginScreen.classList.add("hidden");
    appScreen.classList.remove("hidden");
    userNameEl.textContent = user.displayName || "Player";

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      await setDoc(userRef, {
        name: user.displayName || "Player",
        email: user.email || "",
        walletBalance: 0,
        currentTaskMatches: 0,
        totalMatches: 0,
        tasksCompleted: 0,
        savedUpiId: "",
        lastActionAt: serverTimestamp()
      });
    }

    if (unsubscribeUser) unsubscribeUser();
    unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        userData = docSnap.data();
        updateDashboardUI();
      }
    });
  } else {
    currentUser = null;
    userData = null;
    if (unsubscribeUser) unsubscribeUser();
    appScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
  }
});

function updateDashboardUI() {
  if (!userData) return;

  const balance = userData.walletBalance || 0;
  const progress = userData.currentTaskMatches || 0;
  const level = (userData.tasksCompleted || 0) + 1;

  walletBalanceEl.textContent = balance;
  modalBalanceEl.textContent = balance;
  taskLevelBadge.textContent = `Task #${level}`;
  taskProgressText.textContent = Math.min(progress, 100);

  const percentage = Math.min((progress / 100) * 100, 100);
  taskProgressFill.style.width = `${percentage}%`;

  if (userData.savedUpiId) {
    if (!upiInput.value) upiInput.value = userData.savedUpiId;
    upiSavedStatus.textContent = `Saved UPI: ${userData.savedUpiId}`;
  } else {
    upiSavedStatus.textContent = "";
  }

  if (progress >= 100) {
    claimRewardBtn.disabled = false;
    claimRewardBtn.textContent = "Claim ₹5 Reward Now!";
  } else {
    claimRewardBtn.disabled = true;
    claimRewardBtn.textContent = `Play ${100 - progress} More Matches to Claim ₹5`;
  }
}

// =====================================================
// 3. AD SYSTEM & NEW MATCH START
// =====================================================
startMatchBtn.addEventListener("click", () => {
  if (isGameActive) return;

  if (userData && userData.currentTaskMatches >= 100) {
    showToast("Pehle apna ₹5 Task Reward claim karein!");
    return;
  }

  openAdBeforeMatch();
});

function openAdBeforeMatch() {
  adModal.classList.remove("hidden");
  skipAdBtn.disabled = true;
  let timeLeft = 5;
  adTimerBadge.textContent = `Wait ${timeLeft}s...`;
  skipAdBtn.textContent = `Starting Match in ${timeLeft}s...`;

  const timer = setInterval(() => {
    timeLeft--;
    if (timeLeft > 0) {
      adTimerBadge.textContent = `Wait ${timeLeft}s...`;
      skipAdBtn.textContent = `Starting Match in ${timeLeft}s...`;
    } else {
      clearInterval(timer);
      adTimerBadge.textContent = "Ad Completed";
      skipAdBtn.disabled = false;
      skipAdBtn.textContent = "Continue to Match";
    }
  }, 1000);
}

skipAdBtn.addEventListener("click", () => {
  adModal.classList.add("hidden");
  beginTicTacToeMatch();
});

// =====================================================
// 4. TIC TAC TOE ENGINE
// =====================================================
function beginTicTacToeMatch() {
  boardState = Array(9).fill(null);
  isGameActive = true;
  isPlayerTurn = true;
  movesCount = 0;
  matchStartTime = Date.now();

  cells.forEach(cell => {
    cell.textContent = "";
    cell.className = "cell";
  });

  startMatchBtn.disabled = true;
  gameStatusEl.textContent = "Your Turn (X)";
}

cells.forEach(cell => {
  cell.addEventListener("click", () => {
    const idx = Number(cell.dataset.index);
    if (!isGameActive || !isPlayerTurn || boardState[idx] !== null) return;

    makeMove(idx, "X");
    if (checkGameOver("X")) return;

    isPlayerTurn = false;
    gameStatusEl.textContent = "Bot is thinking (O)...";

    setTimeout(() => {
      if (!isGameActive) return;
      const botIdx = getSmartBotMove();
      if (botIdx !== null) {
        makeMove(botIdx, "O");
        if (checkGameOver("O")) return;
      }
      isPlayerTurn = true;
      gameStatusEl.textContent = "Your Turn (X)";
    }, 450);
  });
});

function makeMove(index, symbol) {
  boardState[index] = symbol;
  movesCount++;
  const cell = cells[index];
  cell.textContent = symbol;
  cell.classList.add(symbol.toLowerCase());
}

function getSmartBotMove() {
  const emptyIndices = boardState
    .map((val, idx) => (val === null ? idx : null))
    .filter(v => v !== null);

  if (emptyIndices.length === 0) return null;

  for (let i of emptyIndices) {
    boardState[i] = "O";
    if (isWinner("O")) { boardState[i] = null; return i; }
    boardState[i] = null;
  }

  if (Math.random() < 0.7) {
    for (let i of emptyIndices) {
      boardState[i] = "X";
      if (isWinner("X")) { boardState[i] = null; return i; }
      boardState[i] = null;
    }
  }

  return emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
}

function isWinner(symbol) {
  return WIN_PATTERNS.some(([a, b, c]) => 
    boardState[a] === symbol && boardState[b] === symbol && boardState[c] === symbol
  );
}

function checkGameOver(lastSymbol) {
  if (isWinner(lastSymbol)) {
    const msg = lastSymbol === "X" ? "You Won! Match Completed." : "Bot Won! Match Completed.";
    finishMatch(msg);
    return true;
  }

  if (boardState.every(cell => cell !== null)) {
    finishMatch("It's a Draw! Match Completed.");
    return true;
  }

  return false;
}

async function finishMatch(statusText) {
  isGameActive = false;
  startMatchBtn.disabled = false;
  gameStatusEl.textContent = statusText + " Updating progress...";

  const durationMs = Date.now() - matchStartTime;
  if (movesCount < 5 || durationMs < 1500) {
    showToast("Invalid match speed detected!");
    return;
  }

  try {
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      currentTaskMatches: increment(1),
      totalMatches: increment(1),
      lastActionAt: serverTimestamp()
    });
    gameStatusEl.textContent = statusText + " (+1 Match Added!)";
  } catch (err) {
    console.error(err);
    showToast("Wait a few seconds before finishing another match.");
  }
}

// =====================================================
// 5. TASK REWARD CLAIM & INSTANT RESET
// =====================================================
claimRewardBtn.addEventListener("click", async () => {
  if (!userData || userData.currentTaskMatches < 100) return;

  claimRewardBtn.disabled = true;
  claimRewardBtn.textContent = "Claiming ₹5...";

  try {
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      walletBalance: increment(5),
      currentTaskMatches: 0,
      tasksCompleted: increment(1),
      lastActionAt: serverTimestamp()
    });

    showToast("🎉 ₹5 Added to Wallet! New Task Started (0/100)");
  } catch (err) {
    console.error(err);
    showToast("Claim blocked by security check.");
  }
});

// =====================================================
// 6. SAVE UPI ID & CUSTOM AMOUNT WITHDRAWAL
// =====================================================
openWithdrawBtn.addEventListener("click", () => {
  if (userData && userData.savedUpiId) {
    upiInput.value = userData.savedUpiId;
  }
  withdrawAmountInput.value = userData && userData.walletBalance >= 10 ? userData.walletBalance : "";
  withdrawModal.classList.remove("hidden");
});

closeWithdrawBtn.addEventListener("click", () => {
  withdrawModal.classList.add("hidden");
});

// Save UPI Button Logic
saveUpiBtn.addEventListener("click", async () => {
  const upiId = upiInput.value.trim();
  if (!upiId.includes("@") || upiId.length < 5) {
    showToast("Please enter a valid UPI ID (e.g. name@upi)");
    return;
  }

  saveUpiBtn.disabled = true;
  saveUpiBtn.textContent = "Saving...";

  try {
    const userRef = doc(db, "users", currentUser.uid);
    await updateDoc(userRef, {
      savedUpiId: upiId,
      lastActionAt: serverTimestamp()
    });
    showToast("UPI ID Saved Successfully!");
  } catch (err) {
    console.error(err);
    showToast("Could not save UPI ID.");
  } finally {
    saveUpiBtn.disabled = false;
    saveUpiBtn.textContent = "Save";
  }
});

// Submit Withdrawal Logic
submitWithdrawBtn.addEventListener("click", async () => {
  if (!userData) return;
  const upiId = upiInput.value.trim();
  const balance = userData.walletBalance || 0;
  const withdrawAmount = Number(withdrawAmountInput.value);

  if (!upiId.includes("@") || upiId.length < 5) {
    showToast("Please enter a valid UPI ID!");
    return;
  }

  if (!withdrawAmount || withdrawAmount < 10) {
    showToast("Minimum withdrawal amount is ₹10!");
    return;
  }

  if (withdrawAmount > balance) {
    showToast(`Insufficient balance! You only have ₹${balance}.`);
    return;
  }

  if (!Number.isInteger(withdrawAmount)) {
    showToast("Please enter a whole amount (e.g. 10, 15, 20).");
    return;
  }

  submitWithdrawBtn.disabled = true;
  submitWithdrawBtn.textContent = "Processing...";

  try {
    const userRef = doc(db, "users", currentUser.uid);

    // 1. Create a withdrawal request document
    await addDoc(collection(db, "withdrawals"), {
      uid: currentUser.uid,
      name: userData.name || "Player",
      email: currentUser.email,
      upiId: upiId,
      amount: withdrawAmount,
      totalMatchesPlayed: userData.totalMatches,
      tasksCompleted: userData.tasksCompleted,
      status: "pending",
      requestedAt: serverTimestamp()
    });

    // 2. Deduct only the requested amount & save UPI ID
    await updateDoc(userRef, {
      walletBalance: increment(-withdrawAmount),
      savedUpiId: upiId,
      lastActionAt: serverTimestamp()
    });

    withdrawAmountInput.value = "";
    withdrawModal.classList.add("hidden");
    showToast(`Withdrawal request of ₹${withdrawAmount} submitted!`);
  } catch (err) {
    console.error(err);
    showToast("Withdrawal failed: " + err.message);
  } finally {
    submitWithdrawBtn.disabled = false;
    submitWithdrawBtn.textContent = "Withdraw Now";
  }
});