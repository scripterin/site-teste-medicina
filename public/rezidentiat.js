// ================= STARE TEST =================
let currentQuestionIndex = 0;
let mistakes = 0;
let timerInterval;
let timeLeft = 360;
let testTerminat = false;
let selectedAnswer = null;
let currentSelection = null;
let transcript = [];
let totalQuestions = 0;

// ================= ANTI-CHEAT =================
if (performance.navigation.type === 1) autoFail("RESPINS (Refresh Pagina)");

document.addEventListener('visibilitychange', function () {
    if (document.hidden && !testTerminat) {
        clearInterval(timerInterval);
        failDueToCheating();
    }
});

async function autoFail(reason) {
    testTerminat = true;
    await sendResult(false, reason);
    window.location.href = 'index.html';
}

async function failDueToCheating() {
    testTerminat = true;
    await sendResult(false, "RESPINS (Tab Switch)");
    const container = document.getElementById('quiz-container');
    if (container) {
        container.innerHTML = `
            <div style="padding:20px; border:2px solid #ff3c00; border-radius:15px; text-align:center;">
                <h1 style="color:#ff3c00;">TEST ANULAT</h1>
                <p>Tentativa de fraudă a fost trimisă către conducere.</p>
                <button onclick="window.location.href='index.html'">Înapoi</button>
            </div>`;
    }
}

// ================= TIMER =================
function startTimer() {
    timerInterval = setInterval(() => {
        if (testTerminat) return;
        let min = Math.floor(timeLeft / 60);
        let sec = timeLeft % 60;
        document.getElementById('timer').innerText = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
        if (timeLeft <= 0) { clearInterval(timerInterval); finishTest(false); }
        timeLeft--;
    }, 1000);
}

// ================= FETCH ÎNTREBARE DE PE SERVER =================
async function fetchQuestion(index) {
    const res = await fetch(`/api/rezidentiat-question/${index}`);
    if (!res.ok) return null;
    return await res.json();
}

// ================= INIȚIALIZARE =================
async function initTest() {
    // Aflăm câte întrebări sunt în total
    const res = await fetch('/api/rezidentiat-count');
    const data = await res.json();
    totalQuestions = data.count;
    startTimer();
    await renderQuestion();
}

// ================= RENDER ÎNTREBARE =================
async function renderQuestion() {
    selectedAnswer = null;
    currentSelection = null;
    document.getElementById('btn-next').disabled = true;
    document.getElementById('btn-next').style.opacity = "0.5";
    document.getElementById('btn-revoke').style.display = "none";

    const q = await fetchQuestion(currentQuestionIndex);
    if (!q) return finishTest(false);

    document.getElementById('progress').innerText = `${currentQuestionIndex + 1}/${totalQuestions}`;
    document.getElementById('mistakes').innerText = `${mistakes}/3`;
    document.getElementById('questionBox').innerText = q.question;

    const aBox = document.getElementById('answersBox');
    aBox.innerHTML = '';

    // answers vine deja amestecat de pe server, fără a indica care e corect
    q.answers.forEach((text) => {
        const btn = document.createElement('button');
        btn.className = 'answerBtn';
        btn.innerText = text;
        btn.onclick = () => {
            if (selectedAnswer !== null) return;
            currentSelection = { answerText: text, questionIndex: currentQuestionIndex };
            selectedAnswer = text;
            highlightSelection(btn);
        };
        aBox.appendChild(btn);
    });
}

function highlightSelection(btn) {
    document.querySelectorAll('.answerBtn').forEach(b => b.style.opacity = "0.5");
    btn.style.opacity = "1";
    btn.style.borderColor = "#00c3ff";
    btn.style.background = "rgba(0,195,255,0.1)";
    document.getElementById('btn-next').disabled = false;
    document.getElementById('btn-next').style.opacity = "1";
    document.getElementById('btn-revoke').style.display = "block";
}

window.revokeAnswer = function () {
    selectedAnswer = null;
    currentSelection = null;
    renderQuestion();
}

// ================= CONFIRMARE RĂSPUNS (validare pe server) =================
window.confirmAndNext = async function () {
    if (!currentSelection) return;

    // Trimitem răspunsul la server și primim doar corect/greșit
    const res = await fetch('/api/rezidentiat-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            index: currentSelection.questionIndex,
            answer: currentSelection.answerText
        })
    });

    const result = await res.json();

    transcript.push({
        question: document.getElementById('questionBox').innerText,
        answer: currentSelection.answerText,
        correct: result.correctAnswer || currentSelection.answerText,
        isCorrect: result.correct
    });

    if (!result.correct) mistakes++;
    if (mistakes >= 3) return finishTest(false);

    currentQuestionIndex++;
    if (currentQuestionIndex >= totalQuestions) finishTest(true);
    else await renderQuestion();
}

// ================= TRIMITERE REZULTAT =================
async function sendResult(passed, cheatReason = null) {
    try {
        await fetch('/api/test-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                testType: "Test Rezidentiat",
                passed: cheatReason ? false : passed,
                warning: cheatReason,
                remainingTime: timeLeft,
                totalMistakes: mistakes,
                transcript: transcript
            })
        });
    } catch (e) { console.error(e); }
}

// ================= FINALIZARE =================
async function finishTest(passed) {
    testTerminat = true;
    clearInterval(timerInterval);
    const container = document.getElementById('quiz-container');

    container.innerHTML = passed
        ? `<h1 style="color:#00ff88">ADMIS REZIDENȚIAT</h1><p>Greșeli: ${mistakes}/3</p><button onclick="window.location.href='index.html'">Finalizează</button>`
        : `<h1 style="color:#ff3c00">RESPINS REZIDENȚIAT</h1><p>Greșeli: ${mistakes}/3</p><button onclick="window.location.href='index.html'">Înapoi</button>`;

    await sendResult(passed);
}

initTest();