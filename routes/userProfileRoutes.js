const express = require("express");
const router = express.Router();
const UserProfile = require("../models/UserProfile");

// GET by email: /api/user-profiles/by-email/:email
router.get("/by-email/:email", async (req, res) => {
  try {
    const email = String(req.params.email).trim().toLowerCase();

    const doc = await UserProfile.findOne({ email });
    if (!doc) return res.status(404).json({ message: "Profile not found" });

    return res.status(200).json({ data: doc });
  } catch (err) {
    return res.status(500).json({ message: "Fetch failed", error: err.message });
  }
});

module.exports = router;
