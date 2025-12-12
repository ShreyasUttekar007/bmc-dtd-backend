const express = require("express");
const puppeteer = require("puppeteer");
const BoothEntry = require("../models/BoothEntry");
const User = require("../models/User");
const requireAuth = require("../middleware/requireAuth"); // your existing middleware

const router = express.Router();

function isAdminRole(roles = []) {
  return roles.some((r) => String(r).toLowerCase() === "admin");
}

async function ensureAdmin(req, res, next) {
  try {
    const user = await User.findById(req.auth.userId).lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    const roles = Array.isArray(user.roles) ? user.roles : [];
    if (!isAdminRole(roles)) {
      return res.status(403).json({ message: "Admin only" });
    }
    req.authUser = user;
    next();
  } catch (e) {
    return res
      .status(500)
      .json({ message: "Auth check failed", error: e.message });
  }
}

// IST helpers (no extra libs)
function istDateKey(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year").value;
  const m = parts.find((p) => p.type === "month").value;
  const day = parts.find((p) => p.type === "day").value;
  return `${y}-${m}-${day}`;
}

function startOfISTDay(key) {
  // key = YYYY-MM-DD
  return new Date(`${key}T00:00:00.000+05:30`);
}
function nextISTDay(key) {
  const d = startOfISTDay(key);
  d.setDate(d.getDate() + 1);
  return d;
}
function lastNDaysKeys(endKey, n) {
  const out = [];
  const end = startOfISTDay(endKey);
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    out.push(istDateKey(d));
  }
  return out;
}

function escapeHtml(s = "") {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

router.get(
  "/admin/daily-report.pdf",
  requireAuth,
  ensureAdmin,
  async (req, res) => {
    try {
      const days = Math.max(
        1,
        Math.min(30, parseInt(req.query.days || "7", 10))
      );
      const target = Math.max(
        1,
        Math.min(200, parseInt(req.query.target || "30", 10))
      );

      // Report end date in IST (default: today IST)
      const reportDateKey =
        (req.query.date && String(req.query.date)) || istDateKey(new Date());
      const dayKeys = lastNDaysKeys(reportDateKey, days);

      const rangeStart = startOfISTDay(dayKeys[0]);
      const rangeEnd = nextISTDay(reportDateKey);

      // Pull only range entries (faster for report)
      const rangeEntries = await BoothEntry.find({
        createdAt: { $gte: rangeStart, $lt: rangeEnd },
      }).lean();

      // Aggregations
      const byDay = new Map(dayKeys.map((k) => [k, 0]));
      const byEmail = new Map();

      for (const e of rangeEntries) {
        const k = istDateKey(new Date(e.createdAt));
        if (byDay.has(k)) byDay.set(k, byDay.get(k) + 1);

        const email = (e.email || "").toLowerCase().trim();
        if (!email) continue;

        if (!byEmail.has(email)) {
          byEmail.set(email, {
            email,
            name: e.name || "—",
            daily: Object.fromEntries(dayKeys.map((dk) => [dk, 0])),
            total: 0,
            lastTs: 0,
          });
        }

        const row = byEmail.get(email);
        row.daily[k] = (row.daily[k] || 0) + 1;
        row.total += 1;
        const ts = new Date(e.createdAt).getTime();
        if (ts > row.lastTs) {
          row.lastTs = ts;
          row.name = e.name || row.name;
        }
      }

      const entriesByDay = dayKeys.map((k) => byDay.get(k) || 0);
      const rangeTotal = entriesByDay.reduce((a, b) => a + b, 0);
      const activeUsers = byEmail.size;
      const avgPerDay = Math.round((rangeTotal / days) * 10) / 10;

      const overallDenom = activeUsers * days * target;
      const overallCompletion = overallDenom
        ? Math.round((rangeTotal / overallDenom) * 1000) / 10
        : 0;

      // table rows sorted
      const rows = Array.from(byEmail.values())
        .map((r) => {
          const denom = days * target;
          const pct = denom ? (r.total / denom) * 100 : 0;
          return { ...r, cumulativePct: Math.round(pct * 10) / 10 };
        })
        .sort((a, b) => b.total - a.total || b.lastTs - a.lastTs);

      const dayLabels = dayKeys.map((k) => {
        const [y, m, d] = k.split("-");
        return `${d}/${m}/${y.slice(2)}`;
      });

      const maxDay = Math.max(1, ...entriesByDay);

      const landscape = days > 10; // wide table for 14/30

      // HTML template
      const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Booth Entry Daily Report</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#fff;color:#0f172a}
    .wrap{padding:24px}
    .top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
    h1{margin:0;font-size:22px;letter-spacing:-0.02em}
    .sub{margin-top:6px;color:#475569;font-size:12px}
    .pill{display:inline-block;padding:6px 10px;border-radius:999px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:800;font-size:11px;color:#0f172a}
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:14px}
    .kpi{border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;padding:12px}
    .kpiT{font-size:11px;font-weight:900;color:#334155}
    .kpiV{margin-top:6px;font-size:22px;font-weight:950}
    .kpiH{margin-top:6px;font-size:11px;color:#64748b;font-weight:800}
    .section{margin-top:14px;border:1px solid #e2e8f0;border-radius:14px;padding:12px}
    .title{font-weight:950;font-size:14px}
    .bars{margin-top:10px;display:flex;gap:8px;align-items:flex-end;height:140px}
    .bar{flex:1;border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;display:flex;align-items:flex-end;justify-content:center;overflow:hidden;position:relative}
    .barFill{width:100%;background:rgba(37,99,235,0.25)}
    .barVal{position:absolute;top:6px;left:0;right:0;text-align:center;font-size:11px;font-weight:900;color:#0f172a}
    .barLab{margin-top:6px;text-align:center;font-size:10px;font-weight:800;color:#64748b}
    table{width:100%;border-collapse:separate;border-spacing:0;margin-top:10px;font-size:11px}
    thead th{background:#f8fafc;border-bottom:1px solid #e2e8f0;padding:10px;text-align:left;white-space:nowrap;font-weight:950}
    tbody td{border-bottom:1px solid #f1f5f9;padding:10px;vertical-align:top}
    .user{font-weight:950}
    .email{color:#64748b;font-weight:800;font-size:10px;margin-top:2px}
    .cellPill{display:inline-block;padding:5px 9px;border-radius:999px;border:1px solid #e2e8f0;background:#fff;font-weight:950}
    .good{background:#ecfdf5;border-color:#d1fae5;color:#047857}
    .mid{background:#eff6ff;border-color:#dbeafe;color:#1d4ed8}
    .bad{background:#fef2f2;border-color:#fee2e2;color:#b91c1c}
    .right{text-align:right}
    .foot{margin-top:10px;color:#64748b;font-size:10px;font-weight:800}
    @media print{ .wrap{padding:0} }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <h1>Booth Entry Daily Report</h1>
        <div class="sub">Period: <span class="pill">${escapeHtml(
          dayLabels[0]
        )}</span> → <span class="pill">${escapeHtml(
        dayLabels[dayLabels.length - 1]
      )}</span>
        &nbsp;&nbsp; Target: <span class="pill">${target}/day</span></div>
      </div>
      <div class="sub">Generated (IST): <span class="pill">${escapeHtml(
        istDateKey(new Date())
      )}</span></div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpiT">Entries (${days} days)</div><div class="kpiV">${rangeTotal}</div><div class="kpiH">Avg/day: ${avgPerDay}</div></div>
      <div class="kpi"><div class="kpiT">Active Users</div><div class="kpiV">${activeUsers}</div><div class="kpiH">Unique emails in period</div></div>
      <div class="kpi"><div class="kpiT">Overall Completion</div><div class="kpiV">${overallCompletion}%</div><div class="kpiH">Entries / (Users × Days × ${target})</div></div>
      <div class="kpi"><div class="kpiT">Report End Date</div><div class="kpiV">${escapeHtml(
        dayLabels[dayLabels.length - 1]
      )}</div><div class="kpiH">IST</div></div>
    </div>

    <div class="section">
      <div class="title">Trend (daily entries)</div>
      <div class="bars">
        ${entriesByDay
          .map((v, i) => {
            const h = Math.round((v / maxDay) * 100);
            return `
              <div style="flex:1">
                <div class="bar">
                  <div class="barVal">${v}</div>
                  <div class="barFill" style="height:${h}%"></div>
                </div>
                <div class="barLab">${escapeHtml(dayLabels[i])}</div>
              </div>`;
          })
          .join("")}
      </div>
    </div>

    <div class="section">
      <div class="title">User Performance (daily filled)</div>
      <div class="sub">Cells show <b>x / ${target}</b> • Cumulative % = total / (${days}×${target})</div>

      <table>
        <thead>
          <tr>
            <th>User</th>
            ${dayLabels.map((d) => `<th>${escapeHtml(d)}</th>`).join("")}
            <th class="right">Cumulative %</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map((r) => {
                    const cells = dayKeys
                      .map((k) => {
                        const cnt = r.daily[k] || 0;
                        const cls =
                          cnt >= target
                            ? "good"
                            : cnt >= Math.ceil(target * 0.6)
                            ? "mid"
                            : "bad";
                        return `<td><span class="cellPill ${cls}">${cnt} / ${target}</span></td>`;
                      })
                      .join("");

                    return `
                      <tr>
                        <td>
                          <div class="user">${escapeHtml(r.name || "—")}</div>
                          <div class="email">${escapeHtml(r.email)}</div>
                        </td>
                        ${cells}
                        <td class="right">
                          <div class="user">${r.cumulativePct}%</div>
                          <div class="email">${r.total} / ${days * target}</div>
                        </td>
                      </tr>
                    `;
                  })
                  .join("")
              : `<tr><td colspan="${
                  dayLabels.length + 2
                }">No data found.</td></tr>`
          }
        </tbody>
      </table>

      <div class="foot">
        Note: Times are grouped by IST day boundaries (Asia/Kolkata). This report is admin-only.
      </div>
    </div>
  </div>
</body>
</html>`;

      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdf = await page.pdf({
        format: "A4",
        landscape,
        printBackground: true,
        margin: { top: "14mm", right: "10mm", bottom: "14mm", left: "10mm" },
      });

      const filename = `booth_daily_report_${reportDateKey}_last${days}d.pdf`;
      res.status(200);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );
      res.setHeader("Content-Length", pdf.length);
      return res.end(pdf);
    } catch (err) {
      console.error("PDF generation failed:", err);
      return res
        .status(500)
        .json({ message: "PDF generation failed", error: err.message });
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
);

module.exports = router;
