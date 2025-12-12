const jwt = require("jsonwebtoken");
const config = require("../config"); // ✅ MUST be the same config module used in /login

const JWT_SECRET = config.jwtSecret; // or process.env.JWT_SECRET (but then use same in /login)

function extractToken(req) {
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7).trim(); // ✅ trim important

  // optional: if you ever want cookie fallback (you set cookie "token" in login)
  if (req.cookies?.token) return String(req.cookies.token).trim();

  return "";
}

module.exports = function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: "No token" });

    const decoded = jwt.verify(token, JWT_SECRET); // ✅ same secret as login
    req.auth = decoded; // { userId: ... }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token", error: err.message });
  }
};
