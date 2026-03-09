import { parse } from 'cookie';

export default function handler(req, res) {
    const cookies = parse(req.headers.cookie || '');
    const session = cookies.user_session;

    if (!session) {
        return res.status(401).json({ error: "Neautorizat" });
    }

    res.status(200).json(JSON.parse(session));
}