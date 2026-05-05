/* ═══════════════════════════════════════════════════════
   TradeDesk — app.js  |  Dashboard Logic
   ═══════════════════════════════════════════════════════ */

// ── State ────────────────────────────────────────────────
let isAdmin       = false;
let allTradesData = [];
let currentFilter = "all";
let pendingTradeId   = null;
let pendingStockName = null;

// ── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  checkAdminStatus();
  loadStats();
  loadRunning();
  setInterval(loadStats,   30000); // refresh every 30s
  setInterval(loadRunning, 30000);
});

// ── ADMIN STATUS ─────────────────────────────────────────
async function checkAdminStatus() {
  const res  = await fetch("/api/admin/status");
  const data = await res.json();
  setAdminUI(data.is_admin);
}

function setAdminUI(adminState) {
  isAdmin = adminState;
  document.getElementById("adminBadge").classList.toggle("hidden", !isAdmin);
  document.getElementById("adminBtn").classList.toggle("hidden",  isAdmin);
  document.getElementById("logoutBtn").classList.toggle("hidden", !isAdmin);
  document.getElementById("addTradeSection").style.display = isAdmin ? "block" : "none";
  document.getElementById("actionHeader").classList.toggle("hidden", !isAdmin);
}

// ── STATS ────────────────────────────────────────────────
async function loadStats() {
  try {
    const res  = await fetch("/api/stats");
    const data = await res.json();
    updateStats(data);
  } catch(e) { console.error("Stats load error:", e); }
}

function updateStats(data) {
  // Animated count-up
  animateCount("totalTradesVal", data.total_trades);
  animateCount("targetHitsVal",  data.target_hits);
  animateCount("stopLossVal",    data.stop_losses);

  // Accuracy ring
  const pct  = data.accuracy;
  const circ = 314; // 2 * π * 50
  const offset = circ - (pct / 100) * circ;
  document.getElementById("accuracyRing").style.strokeDashoffset = offset;
  document.getElementById("accuracyValue").textContent = pct.toFixed(1) + "%";

  // Mini bars
  const total = data.total_trades || 1;
  document.getElementById("targetBar").style.width = (data.target_hits / total * 100) + "%";
  document.getElementById("stopBar").style.width   = (data.stop_losses / total * 100) + "%";
}

function animateCount(id, target) {
  const el  = document.getElementById(id);
  const cur = parseInt(el.textContent) || 0;
  if (cur === target) return;
  const step = Math.ceil(Math.abs(target - cur) / 20);
  let  val  = cur;
  const tick = setInterval(() => {
    val = cur < target ? Math.min(val + step, target) : Math.max(val - step, target);
    el.textContent = val;
    if (val === target) clearInterval(tick);
  }, 40);
}

// ── RUNNING TRADES ───────────────────────────────────────
async function loadRunning() {
  try {
    const res   = await fetch("/api/trades/running");
    const trades = await res.json();
    renderRunning(trades);
  } catch(e) { console.error("Running trades error:", e); }
}

function renderRunning(trades) {
  const grid = document.getElementById("runningGrid");
  if (!trades.length) {
    grid.innerHTML = '<div class="empty-state">◌ NO ACTIVE POSITIONS</div>';
    return;
  }
  grid.innerHTML = trades.map((t, i) => `
    <div class="running-card" style="animation-delay:${i * 0.05}s">
      <div class="running-ticker">${escHtml(t.stock_name)}</div>
      <div class="running-id">ID #${t.id} · ${formatDate(t.created_at)}</div>
      <div class="running-status">
        <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--green);box-shadow:0 0 6px var(--green);animation:blink 1.4s infinite"></span>
        ACTIVE
      </div>
    </div>
  `).join("");
}

// ── ALL TRADES MODAL ─────────────────────────────────────
async function showAllTrades() {
  try {
    const res = await fetch("/api/trades/all");
    allTradesData = await res.json();
    currentFilter = "all";
    document.querySelector("[data-filter='all']").click();
    renderTradesTable(allTradesData);
    openModal("allTradesModal");
  } catch(e) { console.error(e); }
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll(".filter-tab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  filterTrades();
}

function filterTrades() {
  const search = document.getElementById("tradeSearch").value.toLowerCase();
  let filtered = allTradesData;
  if (currentFilter !== "all") {
    filtered = filtered.filter(t => t.status === currentFilter);
  }
  if (search) {
    filtered = filtered.filter(t => t.stock_name.toLowerCase().includes(search));
  }
  renderTradesTable(filtered);
}

function renderTradesTable(trades) {
  const tbody = document.getElementById("tradesTableBody");
  if (!trades.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);font-family:var(--mono);font-size:11px;letter-spacing:3px">NO TRADES FOUND</td></tr>`;
    return;
  }
  tbody.innerHTML = trades.map(t => {
    const actionCell = isAdmin && t.status === "running"
      ? `<td>
          <div class="action-btns">
            <button class="action-btn btn-hit"  onclick="openReturnModal(${t.id},'${escAttr(t.stock_name)}')">✅ Target</button>
            <button class="action-btn btn-loss" onclick="markStopLoss(${t.id})">❌ S/L</button>
          </div>
        </td>`
      : `<td>—</td>`;

    const retPct = t.return_percentage != null ? `+${t.return_percentage}%` : "—";

    return `
      <tr>
        <td style="color:var(--text-dim)">#${t.id}</td>
        <td style="font-family:var(--display);font-size:13px;font-weight:600;letter-spacing:1px">${escHtml(t.stock_name)}</td>
        <td><span class="status-pill pill-${t.status}">${statusLabel(t.status)}</span></td>
        <td style="color:var(--green)">${retPct}</td>
        <td style="color:var(--text-muted)">${formatDate(t.created_at)}</td>
        ${actionCell}
      </tr>
    `;
  }).join("");
}

// ── TARGET HIT ───────────────────────────────────────────
function openReturnModal(tradeId, stockName) {
  pendingTradeId   = tradeId;
  pendingStockName = stockName;
  document.getElementById("returnStockName").textContent = stockName;
  document.getElementById("returnInput").value = "";
  setFlash("returnMsg", "", "");
  closeModal("allTradesModal");
  openModal("returnModal");
}

async function submitTargetHit() {
  const pct = parseFloat(document.getElementById("returnInput").value);
  if (isNaN(pct) || pct < 0) {
    setFlash("returnMsg", "Enter a valid return percentage.", "err");
    return;
  }
  try {
    const res  = await fetch("/api/trades/target-hit", {
      method:  "POST",
      headers: {"Content-Type": "application/json"},
      body:    JSON.stringify({ trade_id: pendingTradeId, return_percentage: pct })
    });
    const data = await res.json();
    if (data.success) {
      setFlash("returnMsg", data.message, "ok");
      setTimeout(() => {
        closeModal("returnModal");
        refreshAll();
      }, 1000);
    } else {
      setFlash("returnMsg", data.error || "Error.", "err");
    }
  } catch(e) { setFlash("returnMsg", "Network error.", "err"); }
}

// ── STOP LOSS ────────────────────────────────────────────
async function markStopLoss(tradeId) {
  if (!confirm("Mark this trade as Stop Loss?")) return;
  try {
    const res  = await fetch("/api/trades/stop-loss", {
      method:  "POST",
      headers: {"Content-Type": "application/json"},
      body:    JSON.stringify({ trade_id: tradeId })
    });
    const data = await res.json();
    if (data.success) {
      closeModal("allTradesModal");
      refreshAll();
    } else {
      alert(data.error || "Error marking stop loss.");
    }
  } catch(e) { alert("Network error."); }
}

// ── ADD TRADE ────────────────────────────────────────────
async function addTrade() {
  const input = document.getElementById("stockInput");
  const name  = input.value.trim().toUpperCase();
  if (!name) { setFlash("addMsg", "Enter a stock name.", "err"); return; }

  try {
    const res  = await fetch("/api/trades/add", {
      method:  "POST",
      headers: {"Content-Type": "application/json"},
      body:    JSON.stringify({ stock_name: name })
    });
    const data = await res.json();
    if (data.success) {
      setFlash("addMsg", `✓ ${data.message}`, "ok");
      input.value = "";
      refreshAll();
    } else {
      setFlash("addMsg", data.error || "Error.", "err");
    }
  } catch(e) { setFlash("addMsg", "Network error.", "err"); }
}

// ── ADMIN LOGIN ──────────────────────────────────────────
async function adminLogin() {
  const email = document.getElementById("adminEmail").value.trim();
  const pass  = document.getElementById("adminPass").value.trim();
  setFlash("adminMsg", "", "");

  try {
    const res  = await fetch("/api/admin/login", {
      method:  "POST",
      headers: {"Content-Type": "application/json"},
      body:    JSON.stringify({ email, password: pass })
    });
    const data = await res.json();
    if (data.success) {
      setFlash("adminMsg", "✓ Logged in.", "ok");
      setTimeout(() => {
        closeModal("adminModal");
        setAdminUI(true);
      }, 600);
    } else {
      setFlash("adminMsg", data.message || "Invalid credentials.", "err");
    }
  } catch(e) { setFlash("adminMsg", "Network error.", "err"); }
}

async function adminLogout() {
  await fetch("/api/admin/logout", { method: "POST" });
  setAdminUI(false);
}

function showAdminModal() {
  document.getElementById("adminEmail").value = "";
  document.getElementById("adminPass").value  = "";
  setFlash("adminMsg", "", "");
  openModal("adminModal");
}

// ── MODAL HELPERS ────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add("open"); }
function closeModal(id) { document.getElementById(id).classList.remove("open"); }

// ── UTILITY ──────────────────────────────────────────────
function refreshAll() {
  loadStats();
  loadRunning();
}

function setFlash(id, msg, type) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.className   = "flash-msg" + (type ? " " + type : "");
}

function escHtml(str) {
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function escAttr(str) {
  return String(str).replace(/'/g,"\\'");
}

function statusLabel(s) {
  return { running: "RUNNING", target_hit: "TARGET HIT", stop_loss: "STOP LOSS" }[s] || s.toUpperCase();
}

function formatDate(dt) {
  if (!dt) return "—";
  const d = new Date(dt);
  return isNaN(d) ? dt : d.toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"2-digit" });
}
