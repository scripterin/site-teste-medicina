require('dotenv').config()
const express = require('express')
const session = require('express-session')
const axios = require("axios")
const path = require('path')
const crypto = require('crypto')
const cors = require('cors')

const app = express()

app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(express.static('public'))

// ================= SESSION =================
app.use(session({
    secret: process.env.SESSION_SECRET || "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax' }
}))

const codes = new Map()

// ================= HELPER SHUFFLE =================
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// ================= DISCORD LOGIN =================
app.get('/auth/discord', (req, res) => {
    const url = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify`
    res.redirect(url)
})

app.get('/auth/discord/callback', async (req, res) => {
    const code = req.query.code
    if (!code) return res.redirect('/')
    try {
        const tokenRes = await axios.post('https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: process.env.REDIRECT_URI
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        )
        const userRes = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${tokenRes.data.access_token}` }
        })
        req.session.user = userRes.data
        res.redirect('/dashboard.html')
    } catch (err) {
        console.error("Eroare Discord OAuth:", err.response?.data || err.message)
        res.redirect('/')
    }
})

// ================= DASHBOARD =================
app.get('/dashboard.html', (req, res) => {
    if (!req.session.user) return res.redirect('/')
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
})

app.get('/api/user', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" })
    res.json(req.session.user)
})

// ================= GENERARE COD =================
app.post('/api/generate', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" })
    const { test } = req.body
    if (!test) return res.status(400).json({ error: "Test invalid" })

    const code = crypto.randomBytes(3).toString('hex').toUpperCase()
    const expire = Date.now() + 10 * 60 * 1000
    codes.set(code, { user: req.session.user, test, expire })

    await sendWebhook(req.session.user, test, code)
    res.json({ code })
})

// ================= CLEANUP CODURI =================
setInterval(() => {
    for (let [code, data] of codes) {
        if (Date.now() > data.expire) codes.delete(code)
    }
}, 60000)

// ================= WEBHOOK CERERE =================
async function sendWebhook(user, test, code) {
    const now = new Date()
    const formattedDate = now.toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    const embed = {
        title: "📝 Cerere test generat",
        color: 5814783,
        fields: [
            { name: "Utilizator", value: `<@${user.id}>`, inline: true },
            { name: "Test", value: `**${test}**`, inline: true },
            { name: "Cod generat", value: `\`${code}\``, inline: false }
        ],
        footer: { text: `Eclipse Medical Tower  - ${formattedDate}` }
    }
    try {
        await axios.post(process.env.WEBHOOK_URL, { embeds: [embed] }, { headers: { 'Content-Type': 'application/json' } })
    } catch (err) {
        console.error("Eroare webhook cerere:", err.response?.data || err.message)
    }
}

// ================= API VERIFY CODE =================
app.post('/api/verify-code', (req, res) => {
    const { code, test } = req.body
    if (!code || !test) return res.status(400).json({ success: false, message: "Cod sau test invalid" })

    const codeData = codes.get(code)
    if (!codeData) return res.status(404).json({ success: false, message: "Cod invalid sau expirat" })
    if (codeData.test !== test) return res.status(400).json({ success: false, message: "Codul nu corespunde testului" })
    if (codeData.used) return res.status(400).json({ success: false, message: "Codul a fost deja folosit" })

    codeData.used = true
    codes.set(code, codeData)
    res.json({ success: true })
})

// ================================================================
// ================= INTREBARI RADIO =================
// ================================================================
const radioQuestions = [
    { q: "Te afli alături de un coleg într-un echipaj și ai preluat ultimul apel. Cum anunți pe stație?", a: ["M-X +1 10-1", "M-X 10-13", "M-X 10-11", "M-X +1 10-41"], correct: 0 },
    { q: "Ești împreună cu un coleg pe drum spre un apel, dar ați avut un accident și nu mai puteți continua. Cum anunți și soliciți echipaj adițional?", a: ["M-callsign +1, am avut un 10-50 (major/minor), solicit un 10-78, la următorul 10-20.", "M-callsign 10-50, solicit un 10-76.", "M-callsign +1, accident rutier la 10-20.", "M-callsign, avem un 10-13 și solicităm ajutor."], correct: 0 },
    { q: "Te afli în zona Grove, iar două persoane mascate trag focuri de armă în direcția ta, punându-te în pericol. Cum anunți această acțiune pe stație?", a: ["M-callsign 10-0, la 10-20 Grove", "M-callsign 10-13 Grove", "M-callsign Cod 4 Grove", "M-callsign 10-78 la Grove"], correct: 0 },
    { q: "Te prezinți la un apel împreună cu un coleg, dar nu găsiți pe nimeni. Cum anunți această situație pe stație?", a: ["M-callsign +1 10-11 ultimul apel", "M-callsign 10-55", "M-callsign +1 10-1", "M-callsign 10-13"], correct: 0 },
    { q: "Precizează 3 coduri radio care se menționează pe dispecerat.", a: ["10-100 (motiv), 10-41, 10-42.", "10-1, 10-4, 10-20.", "10-13, 10-76, 10-95.", "Cod 0, Cod 4, 10-50."], correct: 0 },
    { q: "Ai mers la un apel, ai preluat pacientul și acum te îndrepți spre spital. Cum anunți această acțiune pe stație?", a: ["M-callsign, am un 10-95 conștient/inconștient, 10-76 către Spital Viceroy", "M-callsign, 10-76 spital", "M-callsign, 10-95 spital", "M-callsign +1, 10-76 către Viceroy"], correct: 0 },
    { q: "Ce semnifică codul 0 respectiv codul 4?", a: ["Cod 0: urgență majoră | Cod 4: un polițist are nevoie de ajutor", "Cod 0: accident | Cod 4: persoană decedată", "Cod 0: jaf în curs | Cod 4: medic în pericol", "Cod 0: regrupare | Cod 4: apel terminat"], correct: 0 },
    { q: "Ce semnifică codul radio 10-13 respectiv codul 10-76?", a: ["10-13: am preluat un BK4 (un caz) | 10-76: în drum spre", "10-13: accident | 10-76: locație", "10-13: ajutor medical | 10-76: pauză", "10-13: pacient preluat | 10-76: regrupare"], correct: 0 },
    { q: "Dacă un coleg solicită pe statie un echipaj adițional pentru a transporta un pacient conștient. Cum anunți pe stație că te îndrepți la solicitare?", a: ["M-callsign, 10-76 ultimul 10-78.", "M-callsign, 10-1 la solicitare.", "M-callsign, 10-76 la coleg.", "M-callsign +1, 10-76 10-78."], correct: 0 },
    { q: "Ce semnifică codul 10-9 respectiv 10-100 (și când se anunță)?", a: ["10-9: repetă | 10-100: închiderea stației (pauză/eveniment)", "10-9: confirm | 10-100: regrupare", "10-9: anulează | 10-100: accident", "10-9: locație | 10-100: pacient nou"], correct: 0 },
    { q: "Cum se anunță o regrupare pe statie/dispecer, având în vedere că aceasta va avea loc pe helipadul spitalului?", a: ["M-callsign, 10-39 10-20 Helipad.", "M-callsign, 10-20 Helipad.", "M-callsign, regrupare Helipad.", "M-callsign, 10-39 la spital."], correct: 0 },
    { q: "Te prezinți împreună cu un coleg la un apel, iar după acordarea primului ajutor pacientul nu dorește transport la spital. Cum anunți soluționarea apelului?", a: ["M-callsign +1, 10-55.", "M-callsign, 10-55.", "M-callsign +1, 10-11.", "M-callsign, apel închis."], correct: 0 }
];

app.get('/api/radio-question/:index', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.shuffledQuestions)
        req.session.shuffledQuestions = shuffleArray([...radioQuestions]);

    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= req.session.shuffledQuestions.length)
        return res.status(400).json({ error: "Index invalid" });

    const q = req.session.shuffledQuestions[idx];

    if (!req.session.shuffledRadioAnswers) req.session.shuffledRadioAnswers = {};
    if (!req.session.shuffledRadioAnswers[idx]) {
        req.session.shuffledRadioAnswers[idx] = shuffleArray(
            q.a.map(a => ({ text: a, isCorrect: q.a[q.correct] === a }))
        );
    }

    res.json({
        question: q.q,
        answers: req.session.shuffledRadioAnswers[idx].map(a => a.text),
        total: req.session.shuffledQuestions.length
    });
});

app.post('/api/radio-answer', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const { index, answer } = req.body;

    if (!req.session.shuffledQuestions || index === undefined || !answer)
        return res.status(400).json({ error: "Parametri invalizi sau sesiune expirata" });

    const q = req.session.shuffledQuestions[index];
    if (!q) return res.status(400).json({ error: "Index invalid" });

    const shuffled = req.session.shuffledRadioAnswers?.[index];
    if (!shuffled) return res.status(400).json({ error: "Sesiune invalida" });

    const correctText = q.a[q.correct];
    const isCorrect = answer === correctText;

    res.json({ correct: isCorrect, correctAnswer: isCorrect ? null : correctText });
});

// ================================================================
// ================= INTREBARI BLS =================
// ================================================================
const blsQuestions = [
    { q: "Cum ar trebui să intervină medicul în cazul unui pacient care prezintă răni superficiale care sângerează?", a: ["Curață rănile cu betadină și le pansează", "Ignoră rănile dacă nu sunt adânci", "Aplică direct ghips", "Administrează morfină"], correct: 0 },
    { q: "Cum acționezi pentru a stabiliza un pacient aflat în stop cardio-respirator?", a: ["Oferă 30 compresii toracice cu 2 ventilații", "Oferă doar ventilații", "Administrează calmante", "Aștepți ambulanța fără intervenție"], correct: 0 },
    { q: "Ce trebuie să facă medicul în cazul arsurilor de gradul 1?", a: ["Aplică folia de arsuri și dermazin", "Aplică ghips", "Taie zona afectată", "Administrează adrenalină"], correct: 0 },
    { q: "Ce procedură efectuezi în caz de șoc anafilactic?", a: ["Administrează hidrocortizon intravenos", "Oferă apă", "Aplică compresii toracice", "Montează atelă"], correct: 0 },
    { q: "Cum procedezi la un pacient cu dureri insuportabile după accident?", a: ["Injectează morfină intravenos", "Îi recomanzi odihnă", "Aplici gheață doar", "Nu intervii"], correct: 0 },
    { q: "Ce administrezi unui pacient înecat aflat în stop cardio-respirator?", a: ["Adrenalină 1 ml", "Paracetamol", "Ser fiziologic simplu", "Nurofen"], correct: 0 },
    { q: "Cum procedezi la accident rutier cu puls stabil?", a: ["Montează guler cervical și verifică rănile", "Îl ridici imediat în picioare", "Îl trimiți acasă", "Îi administrezi morfină"], correct: 0 },
    { q: "Ce faci în cazul unei luxații?", a: ["Montează o atelă ghipsată", "Aplici morfină", "Îl pui să miște membrul", "Ignori problema"], correct: 0 },
    { q: "Ce recomanzi pentru durere de cap din răceală?", a: ["Nurofen răceală și gripă, Parasinus sau Paracetamol", "Adrenalină", "Morfina", "Hidrocortizon"], correct: 0 },
    { q: "Ce pași urmezi pentru verificarea conștienței și respirației?", a: ["Verifică pulsul și respirația prin metoda P.A.S.", "Administrează morfină", "Aplică ghips", "Îl ridici în picioare"], correct: 0 }
];

app.get('/api/bls-count', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.shuffledBls)
        req.session.shuffledBls = shuffleArray([...blsQuestions]);
    res.json({ count: req.session.shuffledBls.length });
});

app.get('/api/bls-question/:index', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.shuffledBls)
        req.session.shuffledBls = shuffleArray([...blsQuestions]);

    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= req.session.shuffledBls.length)
        return res.status(400).json({ error: "Index invalid" });

    const q = req.session.shuffledBls[idx];

    if (!req.session.shuffledBlsAnswers) req.session.shuffledBlsAnswers = {};
    if (!req.session.shuffledBlsAnswers[idx]) {
        req.session.shuffledBlsAnswers[idx] = shuffleArray(
            q.a.map(a => ({ text: a, isCorrect: q.a[q.correct] === a }))
        );
    }

    res.json({
        question: q.q,
        answers: req.session.shuffledBlsAnswers[idx].map(a => a.text)
    });
});

app.post('/api/bls-answer', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const { index, answer } = req.body;

    if (!req.session.shuffledBls || index === undefined || !answer)
        return res.status(400).json({ error: "Parametri invalizi" });

    const q = req.session.shuffledBls[index];
    if (!q) return res.status(400).json({ error: "Index invalid" });

    const correctText = q.a[q.correct];
    const isCorrect = answer === correctText;

    res.json({ correct: isCorrect, correctAnswer: isCorrect ? null : correctText });
});

// ================================================================
// ================= INTREBARI SMULS =================
// ================================================================
const smulsQuestions = [
    { q: "Când se folosește foarfeca hidraulică?", a: ["Foarfeca hidraulică se folosește la taierea unor părți ale caroseriei autovehiculelor (stâlpi, volan, plafon).", "La tăierea bagajelor din portbagaj.", "Doar la ruperea ușilor din lemn.", "La deschiderea capotelor"], correct: 0 },
    { q: "Care e primul pas al procesului de descarcerare propriu-zise?", a: ["Stabilizarea vehiculului", "Deschiderea portierelor", "Verificarea uleiului", "Apelarea poliției"], correct: 0 },
    { q: "Când se folosește gheara mecanică?", a: ["Atunci când este necesară legarea unei părți a caroseriei de un punct fix pentru a o desprinde", "Pentru ridicarea roților", "Doar pentru tragerea autovehiculului", "La deschiderea portbagajului"], correct: 0 },
    { q: "Cum prevenim riscul de incendiu la procesul de descarcerare?", a: ["Deconectăm bateria decuplând cablurile sau tăindu-le", "Stingem lumina", "Deschidem ferestrele", "Apelăm pompierii"], correct: 0 },
    { q: "Ce echipamente trebuie să utilizăm inainte de a extrage victima din mașină?", a: ["Guler Cervical și KED de extracție", "Mască de oxigen", "Stetoscop și tensiometru", "Saltea pliabilă"], correct: 0 },
    { q: "Ce echipament hidraulic este utilizat pentru a deschide o ușă blocată sau deformată în urma unui accident?", a: ["Cleștele hidraulic", "Foarfeca hidraulică", "Gheara mecanică", "Fierăstrăul pneumatic"], correct: 0 },
    { q: "Ce este esențial pentru echipa de descarcerare înainte de a începe operațiunea?", a: ["Să stabilească un plan clar de acțiune pentru extragere", "Să verifice bagajele victimei", "Să facă fotografii", "Să sune la familie"], correct: 0 },
    { q: "Ce trebuie să faci dacă pacientul prezintă dificultăți de respirație în timpul descarcerării?", a: ["Sa îi oferi oxigen printr-o mască de oxigen", "Îl scoți imediat afară", "Îi dai apă", "Îi scoți centura"], correct: 0 },
    { q: "Ce medicament este utilizat pentru prevenirea șocului anafilactic în cazul reacțiilor alergice severe în timpul intervenției?", a: ["Hidrocortizon injectabil sau adrenalină", "Aspirină", "Paracetamol", "Antibiotic"], correct: 0 },
    { q: "Pentru ce tip de situație este utilizată adrenalina în contextul descarcerării?", a: ["Stop Cardiorespirator", "Durere de cap", "Fractură minoră", "Lovitură ușoară"], correct: 0 },
    { q: "Ce echipament utilizăm pentru a stabiliza capul victimei?", a: ["Guler Cervical", "Tensiometru", "Brățară identificare", "Pătura de prim ajutor"], correct: 0 },
    { q: "Care este primul parametru vital verificat la o victimă?", a: ["Starea de conștiență", "Tensiunea arterială", "Pulsul", "Respirația"], correct: 0 },
    { q: "Care este scopul principal al triunghiurilor de blocare și unde se amplasează?", a: ["Se pun sub roți pentru imobilizarea vehiculului", "Se pun pe capotă", "Se pun lângă victimă", "Se pun pe plafon"], correct: 0 },
    { q: "Cum acționați dacă, odată ajuns la apel, victima prezintă arsuri pe corp din pricina unui incendiu?", a: ["Aplic Dermazin (crema) sau Regen agen (crema) și folie pentru arsuri", "Îl răcorești cu apă rece", "Îl pui într-un loc sigur", "Îi dai apă și pansament simplu"], correct: 0 },
    { q: "Când se folosește fierăstrăul pneumatic și de ce alt echipament este acționat?", a: ["Se folosește la tăierea parbrizului sau a lunetei și este acționat de către compresorul din autospecială", "La tăierea cablurilor", "Doar pentru lemn", "Doar la portbagaj"], correct: 0 }
];

app.get('/api/smuls-count', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.shuffledSmuls)
        req.session.shuffledSmuls = shuffleArray([...smulsQuestions]);
    res.json({ count: req.session.shuffledSmuls.length });
});

app.get('/api/smuls-question/:index', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.shuffledSmuls)
        req.session.shuffledSmuls = shuffleArray([...smulsQuestions]);

    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= req.session.shuffledSmuls.length)
        return res.status(400).json({ error: "Index invalid" });

    const q = req.session.shuffledSmuls[idx];

    if (!req.session.shuffledSmulsAnswers) req.session.shuffledSmulsAnswers = {};
    if (!req.session.shuffledSmulsAnswers[idx]) {
        req.session.shuffledSmulsAnswers[idx] = shuffleArray(
            q.a.map(a => ({ text: a, isCorrect: q.a[q.correct] === a }))
        );
    }

    res.json({
        question: q.q,
        answers: req.session.shuffledSmulsAnswers[idx].map(a => a.text)
    });
});

app.post('/api/smuls-answer', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const { index, answer } = req.body;

    if (!req.session.shuffledSmuls || index === undefined || !answer)
        return res.status(400).json({ error: "Parametri invalizi" });

    const q = req.session.shuffledSmuls[index];
    if (!q) return res.status(400).json({ error: "Index invalid" });

    const correctText = q.a[q.correct];
    const isCorrect = answer === correctText;

    res.json({ correct: isCorrect, correctAnswer: isCorrect ? null : correctText });
});

// ================================================================
// ================= INTREBARI REZIDENTIAT =================
// ================================================================
const rezidentiatQuestions = [
    { q: "Ce aparat folosim pentru operația de scoatere a unui tatuaj?", a: ["Laser", "Bisturiu", "Camera video în miniatură", "Pensa chirurgicală"], correct: 0 },
    { q: "Ce substanță este utilizată pentru anestezia locală în operația de scoatere a glonțului?", a: ["Propofol", "Xilina", "Ketamina", "Morfina"], correct: 1 },
    { q: "Cum se tratează o coastă ruptă în timpul unei intervenții chirurgicale?", a: ["Umplem fisurile cu oseina", "Montăm plăcuța de titan"], correct: 1 },
    { q: "Ce instrument este folosit pentru a observa meniscul în timpul operației de ruptură a meniscului?", a: ["Raze X", "RMN", "o cameră video mică", "Poze cu telefonul"], correct: 2 },
    { q: "Ce substanță este utilizată pentru anestezia totală în operația de hernie de disc la nivelul vertebrei L4?", a: ["Propofol", "Xilina", "Atropina", "Paracetamol"], correct: 0 },
    { q: "Ce instrument folosim pentru a ajunge la fisura de pe o coastă în timpul unei operații chirurgicale?", a: ["Port ac și fir de sutură", "2 departatoare", "Tija metalică", "Nimic"], correct: 1 },
    { q: "Care anestezie se folosește în cazul unei operații de îndepărtare a tatuajelor?", a: ["Nu se folosește", "Anestezie locală", "Anestezie rahială", "Anestezie totală"], correct: 0 },
    { q: "Ce substanță este injectată în coloana vertebrală pentru anestezia rahianestezică în operația de apendicită?", a: ["Morfină", "Calciu în perfuzie", "Tetracaină"], correct: 2 },
    { q: "Cum se tratează un tendon fisurat în timpul unei intervenții chirurgicale la nivelul umărului?", a: ["Suturăm tendonul cu ajutorul unui port-ac și fir de sutură", "Capsator medicinal", "Lampa UV"], correct: 0 },
    { q: "La nivelul cărei vertebre se face incizia în cazul unei operații pentru hernia de disc?", a: ["Vertebra C1", "Vertebra L4", "Vertebra X2", "Vertebra L3"], correct: 1 },
    { q: "Ce instrument medical se folosește pentru a extrage glonțul în cazul unei plăgi împușcate?", a: ["Pensa chirurgicală", "Port ac și fir de sutură", "Foarfecă", "Cu mâna"], correct: 0 },
    { q: "Ce se folosește pentru a cuprinde cele două capete rupte în cazul unei coaste rupte?", a: ["Tija", "Atelă gipsată", "Bandaj steril", "2 departatoare"], correct: 0 },
    { q: "În cazul unei operații de apendicită, ce trebuie să așteptăm după ce bandajăm și finalizăm operația?", a: ["Administrăm morfină", "Îi punem perfuzie", "Să se trezească pacientul", "Îi dăm două palme"], correct: 2 },
    { q: "În cazul oricărei operații care are loc sub anestezie totală, ce este important să îi montăm pacientului?", a: ["Mască de oxigen", "Mască cu dioxid de carbon", "Tuburi cu apă"], correct: 0 },
    { q: "În cazul unei fracturi, ce aparatură medicală folosim pentru a diagnostica pacientul?", a: ["Radiografie", "Ecografie", "Endoscopie", "RMN"], correct: 0 },
    { q: "În cazul carei intervenții chirurgicale folosești anestezia locală?", a: ["Ruptură de menisc", "Hernie de disc", "Fisuri osoase"], correct: 0 },
    { q: "În cazul carei intervenții chirurgicale folosești anestezia generală?", a: ["Coasta ruptă", "Tendon fisurat", "Ruptură de menisc"], correct: 0 },
    { q: "Unde este situată apendicita?", a: ["În zona spatelui", "În zona pieptului", "În zona abdomenului"], correct: 2 },
    { q: "Ce antibiotice se prescriu post-operator?", a: ["Tetraciclină", "Voltaren", "Maltofer"], correct: 0 },
    { q: "Cu ce dezinfectezi rănile?", a: ["Comprese nesterile", "Betadină și apă oxigenată", "Apă distilată"], correct: 1 },
    { q: "Ce se oferă pentru dureri de spate?", a: ["No-Spa", "Diclofenac Sodic", "Paracetamol"], correct: 1 },
    { q: "Cu ce aparat se face Radiografia?", a: ["Aparat cu raze UV", "Aparat cu raze X", "Aparat cu UR"], correct: 1 },
    { q: "Cum se numește procedura de scanare a organelor cu ajutorul undelor radio?", a: ["Radiografie", "RMN", "EKG"], correct: 1 },
    { q: "Pentru ce folosești garoul?", a: ["Pentru strângerea antebrațului", "Pentru imobilizarea spatelui", "Pentru imobilizarea gâtului"], correct: 0 },
    { q: "Cum faci stază pe rană?", a: ["Folosești comprese sterile și apeși tare pe rană", "Folosești comprese sterile și apeși încet pe rană", "Folosești apă oxigenată"], correct: 0 }
];

app.get('/api/rezidentiat-count', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.shuffledRezidentiat)
        req.session.shuffledRezidentiat = shuffleArray([...rezidentiatQuestions]);
    res.json({ count: req.session.shuffledRezidentiat.length });
});

app.get('/api/rezidentiat-question/:index', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    if (!req.session.shuffledRezidentiat)
        req.session.shuffledRezidentiat = shuffleArray([...rezidentiatQuestions]);

    const idx = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= req.session.shuffledRezidentiat.length)
        return res.status(400).json({ error: "Index invalid" });

    const q = req.session.shuffledRezidentiat[idx];

    if (!req.session.shuffledRezidentiatAnswers) req.session.shuffledRezidentiatAnswers = {};
    if (!req.session.shuffledRezidentiatAnswers[idx]) {
        req.session.shuffledRezidentiatAnswers[idx] = shuffleArray(
            q.a.map(a => ({ text: a, isCorrect: q.a[q.correct] === a }))
        );
    }

    res.json({
        question: q.q,
        answers: req.session.shuffledRezidentiatAnswers[idx].map(a => a.text)
    });
});

app.post('/api/rezidentiat-answer', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });
    const { index, answer } = req.body;

    if (!req.session.shuffledRezidentiat || index === undefined || !answer)
        return res.status(400).json({ error: "Parametri invalizi" });

    const q = req.session.shuffledRezidentiat[index];
    if (!q) return res.status(400).json({ error: "Index invalid" });

    const correctText = q.a[q.correct];
    const isCorrect = answer === correctText;

    res.json({ correct: isCorrect, correctAnswer: isCorrect ? null : correctText });
});

// ================================================================
// ================= API TEST RESULT =================
// ================================================================
app.post('/api/test-result', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: "Unauthorized" });

    const { testType, passed, warning = false, totalMistakes = 0, remainingTime = 0, transcript = [] } = req.body;

    const now = new Date();
    const formattedDate = now.toLocaleDateString('ro-RO');

    let cooldownDays = 0;
    const typeUpper = testType.toUpperCase();
    if (typeUpper.includes("RADIO")) cooldownDays = 3;
    else if (typeUpper.includes("BLS")) cooldownDays = 3;
    else if (typeUpper.includes("SMULS")) cooldownDays = 5;
    else if (typeUpper.includes("REZIDENTIAT")) cooldownDays = 5;

    let cooldownDateText = "N/A";
    if (!passed || warning) {
        const cdDate = new Date();
        cdDate.setDate(now.getDate() + cooldownDays);
        cooldownDateText = cdDate.toLocaleDateString('ro-RO');
    }

    const onlyMistakes = transcript.filter(t => t.isCorrect === false);
    let mistakesText = onlyMistakes.length > 0
        ? onlyMistakes.map(t => `**${t.question}**\n\`\`\`yaml\nRăspuns Corect: ${t.correct}\nRăspunsul Tău:  ${t.answer}\n\`\`\``).join("\n")
        : "Nicio greșeală înregistrată. ✅";
    if (mistakesText.length > 1000) mistakesText = mistakesText.slice(0, 1000) + "...";

    const embedConducere = {
        title: warning ? "⚠️ TEST ANULAT (ANTI-CHEAT)" : (passed ? "🟢 Test Admis" : "🔴 Test Respins"),
        color: warning ? 16711680 : (passed ? 3066993 : 15158332),
        description: warning ? `**MOTIV ANULARE: ${warning}**` : "",
        fields: [
            { name: "Utilizator", value: `<@${req.session.user.id}>`, inline: true },
            { name: "Test", value: testType, inline: true },
            { name: "Rezultat", value: warning ? "Anulat (⚠️ ANTI-CHEAT)" : (passed ? "Admis" : "Respins"), inline: false },
            { name: "Cooldown până la", value: `\`${passed ? "Fără CD" : cooldownDateText}\``, inline: true },
            { name: "Greșeli", value: `\`${totalMistakes}/3\``, inline: true },
            { name: "Timp rămas", value: `\`${remainingTime} sec\``, inline: true },
            { name: "Detalii greșeli", value: mistakesText, inline: false }
        ],
        footer: { text: `Eclipse Medical Tower - ${formattedDate}` }
    };

    const embedRezultate = {
        title: "Rezultat Test",
        color: (passed && !warning) ? 3066993 : 15158332,
        fields: [
            { name: "Utilizator", value: `<@${req.session.user.id}>`, inline: true },
            { name: "Test", value: testType, inline: true },
            { name: "Rezultat", value: (passed && !warning) ? "🟢 Admis" : "🔴 Respins", inline: false }
        ],
        footer: { text: `Eclipse Medical Tower  - ${formattedDate}` }
    };

    if (!passed || warning) {
        embedRezultate.fields.push({
            name: "Poți susține testul din nou pe data de:",
            value: `📅 **${cooldownDateText}**`,
            inline: false
        });
    }

    try {
        await axios.post(process.env.WEBHOOK_REZULTATE, { content: `<@${req.session.user.id}>`, embeds: [embedRezultate] });
        await axios.post(process.env.WEBHOOK_CONDUCERE, { content: `<@${req.session.user.id}>`, embeds: [embedConducere] });
        console.log(`Rezultat trimis. Cooldown setat pe: ${cooldownDateText}`);
    } catch (err) {
        console.error("Eroare Webhook:", err.response?.data || err.message);
    }

    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server pornit pe http://localhost:${PORT}`))