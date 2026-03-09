import crypto from "crypto";
import jwt from "jsonwebtoken";

// Stocare temporară coduri în memoria globală
const codes = new Map();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: "Unauthorized" });

  const token = authHeader.split(" ")[1];
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }

  const { test } = req.body;
  if (!test) return res.status(400).json({ error: "Test invalid" });

  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const expire = Date.now() + 10 * 60 * 1000;
  codes.set(code, { user, test, expire });

  res.json({ code });
}

// Cleanup coduri expirate
setInterval(() => {
  for (let [code, data] of codes) {
    if (Date.now() > data.expire) codes.delete(code);
  }
}, 60000);