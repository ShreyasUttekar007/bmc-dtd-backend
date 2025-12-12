const express = require("express");
const router = express.Router();
const BoothEntry = require("../models/BoothEntry");
const User = require("../models/User"); // adjust path if needed
const requireAuth = require("../middleware/requireAuth");

// CREATE (POST) - /api/booth-entries
router.post("/new-entry", async (req, res) => {
  try {
    const doc = await BoothEntry.create(req.body);
    return res.status(201).json({ message: "Created", data: doc });
  } catch (err) {
    return res.status(400).json({ message: "Create failed", error: err.message });
  }
});

// READ ALL (GET) - /api/booth-entries
function extractWardRoles(roles = []) {
  const wards = new Set();
  for (const r of roles) {
    const raw = String(r || "").trim().toLowerCase();
    if (!raw || raw === "admin") continue;

    // accepts: "Ward 184", "184", "w184"
    let w = raw.replace(/^ward\s*/i, "").replace(/^w\s*/i, "").trim();
    if (w) wards.add(w);
  }
  return [...wards];
}

router.get("/all", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId).lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isAdmin = roles.some((r) => String(r).toLowerCase() === "admin");

    const q = {};
    if (req.query.email) q.email = String(req.query.email).trim().toLowerCase();
    if (req.query.booth) q.booth = String(req.query.booth).trim();

    if (isAdmin) {
      if (req.query.ward) q.ward = String(req.query.ward).trim();
    } else {
      const allowed = extractWardRoles(roles); // e.g. ["184","227"]
      if (!allowed.length) return res.status(403).json({ message: "No ward access in roles" });

      // allow exact stored forms (recommended: store ward as "184" consistently)
      q.ward = { $in: allowed.map(String) };

      // if user tries ?ward=xxx, enforce allowed
      if (req.query.ward) {
        const asked = String(req.query.ward).trim().toLowerCase().replace(/^ward\s*/i, "");
        if (!allowed.includes(asked)) return res.status(403).json({ message: "Ward not allowed" });
        q.ward = asked;
      }
    }

    const docs = await BoothEntry.find(q).sort({ createdAt: -1 });
    return res.status(200).json({ data: docs });
  } catch (err) {
    return res.status(500).json({ message: "Fetch failed", error: err.message });
  }
});

// GET /booth-entries/all-admin
router.get("/all-admin", requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.auth.userId).lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    const roles = Array.isArray(user.roles) ? user.roles : [];
    const isAdmin = roles.some((r) => String(r).toLowerCase() === "admin");

    if (!isAdmin) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const q = {};
    if (req.query.email) q.email = String(req.query.email).trim().toLowerCase();
    if (req.query.ward) q.ward = String(req.query.ward).trim();
    if (req.query.booth) q.booth = String(req.query.booth).trim();

    const docs = await BoothEntry.find(q).sort({ createdAt: -1 });
    return res.status(200).json({ data: docs });
  } catch (err) {
    return res.status(500).json({ message: "Fetch failed", error: err.message });
  }
});


// UPDATE STATUS (PATCH) - /api/booth-entries/:id/status
router.patch("/:id/status", async (req, res) => {
  try {
    const status = String(req.body.status || "").trim();

    if (!["Verified", "Not Verified"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    const doc = await BoothEntry.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!doc) return res.status(404).json({ message: "Not found" });

    return res.status(200).json({ message: "Status updated", data: doc });
  } catch (err) {
    return res.status(400).json({ message: "Update failed", error: err.message });
  }
});


// READ ONE (GET) - /api/booth-entries/:id
router.get("/:id", async (req, res) => {
  try {
    const doc = await BoothEntry.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.status(200).json({ data: doc });
  } catch (err) {
    return res.status(400).json({ message: "Invalid id", error: err.message });
  }
});

// UPDATE (PUT) - /api/booth-entries/:id
router.put("/:id", async (req, res) => {
  try {
    // normalize email if present
    if (req.body.email) req.body.email = String(req.body.email).trim().toLowerCase();

    const doc = await BoothEntry.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.status(200).json({ message: "Updated", data: doc });
  } catch (err) {
    return res.status(400).json({ message: "Update failed", error: err.message });
  }
});

// DELETE (DELETE) - /api/booth-entries/:id
router.delete("/:id", async (req, res) => {
  try {
    const doc = await BoothEntry.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: "Not found" });
    return res.status(200).json({ message: "Deleted", data: doc });
  } catch (err) {
    return res.status(400).json({ message: "Delete failed", error: err.message });
  }
});

module.exports = router;
