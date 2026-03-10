// ================= STARE TEST =================
let currentQuestionIndex = 0;
let mistakes = 0;
let timerInterval;
let timeLeft = 180;
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
    await sendResult(false, "RESPINS (Tab Switch/Minimizare)");
    const container = document.querySelector('.quiz-container');
    if (container) {
        container.innerHTML = `
            <div class="quiz-header">
                <span class="quiz-title">🚑 SMULS Teoretic</span>
            </div>
            <div style="padding: 40px 48px; text-align: center;">
                <h1 class="error-msg" style="font-size: 2rem; margin-bottom: 12px;">✖ TEST ANULAT</h1>
                <p style="color: rgba(255,255,255,0.6); margin-bottom: 28px;">Ai părăsit pagina sau ai minimizat browserul.</p>
                <div class="quiz-actions">
                    <button class="btn-revoke" onclick="window.location.href='index.html'">Înapoi</button>
                </div>
            </div>`;
    }
}

// ================= TIMER =================
function startTimer() {
    timerInterval = setInterval(() => {
        if (testTerminat) return;
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        const timerEl = document.getElementById('timer');
        if (timerEl) timerEl.innerText = `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}`;
        if (timeLeft <= 0) { clearInterval(timerInterval); finishTest(false); }
        timeLeft--;
    }, 1000);
}

// ================= FETCH INTREBARE =================
async function fetchQuestion(index) {
    const res = await fetch(`/api/smuls-question/${index}`);
    if (!res.ok) return null;
    return await res.json();
}

// ================= INITIALIZARE =================
async function initTest() {
    try {
        const res = await fetch('/api/smuls-count');
        if (!res.ok) throw new Error("Server error: " + res.status);
        const data = await res.json();
        totalQuestions = data.count;
        startTimer();
        await renderQuestion();
    } catch (err) {
        console.error("initTest failed:", err);
        const qBox = document.getElementById('questionBox');
        if (qBox) qBox.innerText = "Eroare la conectarea cu serverul: " + err.message;
    }
}

// ================= RENDER INTREBARE =================
async function renderQuestion() {
    selectedAnswer = null;
    currentSelection = null;

    const btnNext = document.getElementById('btn-next');
    const btnRevoke = document.getElementById('btn-revoke');
    if (btnNext) { btnNext.disabled = true; }
    if (btnRevoke) btnRevoke.style.display = "none";

    const qBox = document.getElementById('questionBox');
    const aBox = document.getElementById('answersBox');

    try {
        const q = await fetchQuestion(currentQuestionIndex);
        if (!q) throw new Error("Eroare server");

        qBox.innerText = q.question;
        aBox.innerHTML = '';

        document.getElementById('progress').innerText = `${currentQuestionIndex + 1}/${totalQuestions}`;

        const mistakesEl = document.getElementById('mistakes');
        if (mistakesEl) mistakesEl.innerText = `${mistakes}/3`;

        q.answers.forEach((text, idx) => {
            const btn = document.createElement('button');
            btn.className = 'answerBtn';
            btn.innerText = text;
            btn.onclick = () => selectOption(idx, text);
            aBox.appendChild(btn);
        });

    } catch (err) {
        console.error(err);
        if (qBox) qBox.innerText = "Eroare la incarcarea intrebarii.";
    }
}

// ================= SELECT OPTION =================
function selectOption(index, answerText) {
    if (selectedAnswer !== null) return;

    selectedAnswer = answerText;
    currentSelection = { answerText, questionIndex: currentQuestionIndex };

    document.querySelectorAll('.answerBtn').forEach(btn => {
        btn.classList.remove('selected');
        btn.style.opacity = "0.5";
        btn.style.cursor = "not-allowed";
        btn.style.pointerEvents = "none";
    });

    const selectedBtn = document.querySelectorAll('.answerBtn')[index];
    selectedBtn.classList.add('selected');
    selectedBtn.style.opacity = "1";

    const btnNext = document.getElementById('btn-next');
    btnNext.disabled = false;
    document.getElementById('btn-revoke').style.display = "block";
}

// ================= REVOKE =================
window.revokeAnswer = function () {
    selectedAnswer = null;
    currentSelection = null;

    document.querySelectorAll('.answerBtn').forEach(btn => {
        btn.classList.remove('selected');
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.style.pointerEvents = "auto";
    });

    const btnNext = document.getElementById('btn-next');
    btnNext.disabled = true;
    document.getElementById('btn-revoke').style.display = "none";
}

// ================= CONFIRM AND NEXT =================
window.confirmAndNext = async function () {
    if (!currentSelection) return;

    const btnNext = document.getElementById('btn-next');
    btnNext.disabled = true;
    document.getElementById('btn-revoke').style.display = "none";

    const res = await fetch('/api/smuls-answer', {
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

    if (!result.correct) {
        mistakes++;

        const mistakesEl = document.getElementById('mistakes');
        if (mistakesEl) mistakesEl.innerText = `${mistakes}/3`;

        if (mistakes >= 2) return finishTest(false);
    }

    currentQuestionIndex++;
    if (currentQuestionIndex >= totalQuestions) finishTest(true);
    else await renderQuestion();
}

// ================= SEND RESULT =================
async function sendResult(passed, cheatReason = null) {
    try {
        await fetch('/api/test-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                testType: "SMULS",
                passed: cheatReason ? false : passed,
                warning: cheatReason,
                remainingTime: timeLeft,
                totalMistakes: mistakes,
                transcript: transcript
            })
        });
    } catch (e) {
        console.error("Eroare la trimiterea rezultatelor.", e);
    }
}

// ================= FINISH TEST =================
async function finishTest(passed) {
    testTerminat = true;
    clearInterval(timerInterval);

    const container = document.querySelector('.quiz-container');
    const finalTime = document.getElementById('timer')?.innerText || "00:00";

    container.innerHTML = passed
        ? `<div class="result-screen">
                <div class="result-icon result-icon--passed">✓</div>
                <h1 class="result-title result-title--passed">AI TRECUT TESTUL!</h1>
                <div class="result-stats">
                    <div class="result-stat">
                        <span class="stat-label">Greșeli</span>
                        <span class="stat-value">${mistakes}/3</span>
                    </div>
                    <div class="result-stat">
                        <span class="stat-label">Timp rămas</span>
                        <span class="stat-value">${finalTime}</span>
                    </div>
                </div>
                <button class="btn-confirm" onclick="window.location.href='index.html'">Finalizează</button>
           </div>`
        : `<div class="result-screen">
                <div class="result-icon result-icon--failed">✕</div>
                <h1 class="result-title result-title--failed">DIN PĂCATE AI PICAT</h1>
                <div class="result-stats">
                    <div class="result-stat">
                        <span class="stat-label">Greșeli</span>
                        <span class="stat-value">${mistakes}/3</span>
                    </div>
                    <div class="result-stat">
                        <span class="stat-label">Timp rămas</span>
                        <span class="stat-value">${finalTime}</span>
                    </div>
                </div>
                <button class="btn-confirm btn-confirm--muted" onclick="window.location.href='index.html'">Am înțeles</button>
           </div>`;

    await sendResult(passed);
}
// ================= START =================
initTest();