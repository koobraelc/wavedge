// Admin Dashboard — client-side logic
(function () {
  const token = localStorage.getItem("wavedge_token");
  if (!token) {
    window.location.href = "/login";
    return;
  }

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  async function fetchStats() {
    const res = await fetch("/api/admin/stats", {
      headers: { Authorization: "Bearer " + token },
    });
    if (res.status === 401) {
      window.location.href = "/login";
      return null;
    }
    if (res.status === 403) {
      document.querySelector(".admin-content").innerHTML =
        '<div class="admin-denied"><h2>Access Denied</h2><p>You do not have admin access.</p><a href="/dashboard" class="btn-primary">Back to Dashboard</a></div>';
      return null;
    }
    return res.json();
  }

  function fmtNum(n) {
    if (n == null) return "—";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(1) + "K";
    return n.toLocaleString();
  }

  function fmtMoney(n) {
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function timeAgo(ts) {
    if (!ts) return "Never";
    const diff = Date.now() - new Date(ts + (ts.includes("Z") ? "" : "Z")).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h ago";
    return Math.floor(hrs / 24) + "d ago";
  }

  function renderSparkline(container, data, color) {
    if (!data || data.length === 0) {
      container.textContent = "No data";
      return;
    }
    const values = data.map((d) => d.count);
    const max = Math.max(...values, 1);
    const w = container.clientWidth || 200;
    const h = 40;
    const barW = Math.max(4, Math.floor(w / values.length) - 2);

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);

    values.forEach((v, i) => {
      const barH = Math.max(2, (v / max) * (h - 4));
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", i * (barW + 2));
      rect.setAttribute("y", h - barH);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", barH);
      rect.setAttribute("rx", 2);
      rect.setAttribute("fill", color);
      rect.setAttribute("opacity", "0.8");

      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = data[i].day + ": " + v;
      rect.appendChild(title);
      svg.appendChild(rect);
    });

    container.innerHTML = "";
    container.appendChild(svg);
  }

  function renderBreakdown(container, items, colorFn) {
    if (!items || items.length === 0) {
      container.innerHTML = '<span class="text-muted">No data</span>';
      return;
    }
    const total = items.reduce((s, i) => s + i.count, 0);
    container.innerHTML = items
      .map((item, idx) => {
        const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : 0;
        const label = item.category || item.source || item.name || "Unknown";
        return `<div class="breakdown-row">
          <span class="breakdown-label">${label}</span>
          <div class="breakdown-bar-track">
            <div class="breakdown-bar-fill" style="width:${pct}%;background:${colorFn(idx)}"></div>
          </div>
          <span class="breakdown-value">${item.count} <span class="text-muted">(${pct}%)</span></span>
        </div>`;
      })
      .join("");
  }

  const COLORS = ["#1f6feb", "#3fb950", "#d29922", "#f85149", "#a371f7", "#79c0ff", "#f0883e", "#56d364"];
  function colorAt(i) {
    return COLORS[i % COLORS.length];
  }

  async function init() {
    const data = await fetchStats();
    if (!data) return;

    // Hero stats
    $("#stat-total-users").textContent = fmtNum(data.users.total);
    $("#stat-pro-users").textContent = fmtNum(data.users.pro);
    $("#stat-mrr").textContent = fmtMoney(data.revenue.mrr);
    $("#stat-articles-today").textContent = fmtNum(data.news.articlesToday);
    $("#stat-alerts-today").textContent = fmtNum(data.alerts.today);
    $("#stat-errors-today").textContent = fmtNum(data.system.errorsToday);

    // Sub-stats
    $("#stat-signups-today").textContent = "+" + data.users.signupsToday + " today";
    $("#stat-signups-week").textContent = "+" + data.users.signupsWeek + " this week";
    $("#stat-free-users").textContent = data.users.free + " free";
    $("#stat-active-subs").textContent = data.revenue.activeSubscriptions + " active subs";
    $("#stat-articles-week").textContent = data.news.articlesWeek + " this week";
    $("#stat-alerts-week").textContent = data.alerts.week + " this week";
    $("#stat-missed-today").textContent = data.alerts.missedToday + " missed";
    $("#stat-errors-week").textContent = data.system.errorsWeek + " this week";

    // Sparklines
    renderSparkline($("#spark-signups"), data.users.dailySignups, "#1f6feb");
    renderSparkline($("#spark-articles"), data.news.dailyArticles, "#3fb950");
    renderSparkline($("#spark-alerts"), data.alerts.dailyAlerts, "#d29922");

    // Category breakdown
    renderBreakdown($("#category-breakdown"), data.news.categoryBreakdown, colorAt);

    // Source breakdown
    renderBreakdown($("#source-breakdown"), data.news.sourceBreakdown, colorAt);

    // Channel breakdown
    const channelItems = Object.entries(data.alerts.channelBreakdown).map(([name, count]) => ({
      name,
      count,
    }));
    renderBreakdown($("#channel-breakdown"), channelItems, colorAt);

    // System health
    const healthRows = [
      { label: "Price Data", ts: data.system.lastPriceFetch, interval: 5 },
      { label: "News Ingestion", ts: data.system.lastNewsFetch, interval: 15 },
      { label: "Alert Check", ts: data.system.lastAlertCheck, interval: 5 },
      { label: "Daily Digest", ts: data.system.lastDigest, interval: 1440 },
    ];

    $("#health-table").innerHTML = healthRows
      .map((h) => {
        const ago = timeAgo(h.ts);
        const ageMin = h.ts
          ? Math.floor((Date.now() - new Date(h.ts + (h.ts.includes("Z") ? "" : "Z")).getTime()) / 60000)
          : 99999;
        const status =
          ageMin <= h.interval * 1.5 ? "healthy" : ageMin <= h.interval * 3 ? "warning" : "error";
        return `<tr>
          <td><span class="health-dot health-${status}"></span>${h.label}</td>
          <td>${ago}</td>
          <td class="text-muted">${h.ts || "—"}</td>
        </tr>`;
      })
      .join("");

    // Subscribers
    $("#stat-digest-subs").textContent = fmtNum(data.subscribers.digest);
    $("#stat-push-subs").textContent = fmtNum(data.subscribers.push);

    // Recent errors
    if (data.system.recentErrors.length === 0) {
      $("#errors-list").innerHTML = '<div class="text-muted" style="padding:1rem">No recent errors</div>';
    } else {
      $("#errors-list").innerHTML = data.system.recentErrors
        .map(
          (e) => `<div class="error-row">
            <div class="error-meta"><span class="error-task">${e.task_name}</span> <span class="text-muted">${timeAgo(e.created_at)}</span></div>
            <div class="error-msg">${e.error_message}</div>
          </div>`
        )
        .join("");
    }

    // Remove loading states
    $$(".admin-loading").forEach((el) => el.remove());
    $$(".admin-panel").forEach((el) => (el.style.opacity = "1"));
  }

  // Auto-refresh every 60s
  init();
  setInterval(init, 60000);
})();
