export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { code, test } = req.body;
  if (!code || !test) return res.status(400).json({ success: false, message: "Cod sau test invalid" });

  const codeData = global.codes?.get(code);
  if (!codeData) return res.status(404).json({ success: false, message: "Cod invalid sau expirat" });
  if (codeData.test !== test) return res.status(400).json({ success: false, message: "Codul nu corespunde testului" });
  if (codeData.used) return res.status(400).json({ success: false, message: "Codul a fost deja folosit" });

  codeData.used = true;
  global.codes.set(code, codeData);
  res.json({ success: true });
}