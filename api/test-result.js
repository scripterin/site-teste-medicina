export default async function handler(req, res) {

    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" })
    }

    const {
        username,
        testType,
        score,
        total,
        passed,
        remainingTime,
        transcript
    } = req.body

    const WEBHOOK_REZULTATE = "https://discord.com/api/webhooks/"
    const WEBHOOK_CONDUCERE = "https://discord.com/api/webhooks/"

    // Embed public
    const embedPublic = {
        title: "📋 Rezultat Test Medical",
        color: passed ? 5763719 : 15548997,
        fields: [
            {
                name: "👤 Utilizator",
                value: `<@${username}>`,
                inline: true
            },
            {
                name: "🧪 Test",
                value: testType,
                inline: true
            },
            {
                name: "📊 Scor",
                value: `${score}/${total}`,
                inline: true
            },
            {
                name: "⏱ Timp rămas",
                value: `${remainingTime}s`,
                inline: true
            },
            {
                name: "📌 Rezultat",
                value: passed ? "✅ ADMIS" : "❌ RESPINS",
                inline: true
            }
        ],
        timestamp: new Date().toISOString()
    }

    // Construim lista de greșeli
    let wrongText = "Nicio greșeală."

    if (transcript && transcript.length > 0) {
        wrongText = transcript.map((q, i) => {
            return `**${i+1}. ${q.question}**
❌ Răspunsul tău: ${q.selected}
✅ Corect: ${q.correct}`
        }).join("\n\n")
    }

    // Embed conducere
    const embedStaff = {
        title: "📑 Detalii Test",
        color: 3447003,
        fields: [
            {
                name: "👤 Utilizator",
                value: `<@${username}>`
            },
            {
                name: "📊 Scor",
                value: `${score}/${total}`
            },
            {
                name: "❗ Greșeli",
                value: wrongText.substring(0, 1024)
            }
        ],
        timestamp: new Date().toISOString()
    }

    // trimite public
    await fetch(WEBHOOK_REZULTATE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embedPublic] })
    })

    // trimite conducere
    await fetch(WEBHOOK_CONDUCERE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embedStaff] })
    })

    res.status(200).json({ success: true })
}