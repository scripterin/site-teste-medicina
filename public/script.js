/**
 * =================================================
 * SCRIPT COMPLET FUNCȚIONAL CU REZULTATE DISCORD
 * =================================================
 */


// ================= PROTECȚIE DASHBOARD =================
if (window.location.pathname.includes("dashboard.html")) {
    fetch('/api/user')
    .then(res => {
        if (!res.ok) window.location.href = "dashboard.html";
    })
    .catch(() => {
        window.location.href = "index.html";
    });
}

// ================= SISTEM NOTIFICĂRI =================

function showToast(message, type = 'success') {

    const container = document.getElementById('toast-container');
    if (!container) return;

    // Sunet
    const soundFile = type === 'success' ? 'sound_true.mp3' : 'sound.mp3';
    const audio = new Audio(soundFile);
    audio.volume = 0.6;
    audio.play().catch(() => {}); // catch in caz ca browserul blocheaza autoplay

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    let icon = '✔';
    if (type === 'error') icon = '✖';
    if (type === 'warning') icon = '⚠';

    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
        </div>
        <span class="toast-close">&times;</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    // dispare dupa 5 secunde
    const autoDismiss = setTimeout(() => {
        dismissToast(toast);
    }, 5000);

    toast.querySelector('.toast-close').addEventListener('click', () => {
        clearTimeout(autoDismiss);
        dismissToast(toast);
    });

}

function dismissToast(toast) {

    toast.style.animation = "fadeOut 0.3s forwards";

    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 300);

}

// ================= SELECT TEST =================
let selectedTest = null;

function selectTest(elem) {
    selectedTest = elem.innerText.trim();
    sessionStorage.setItem("selectedTest", selectedTest);

    document.querySelectorAll('.test')
    .forEach(t => t.classList.remove('selected'));

    elem.classList.add('selected');
    showToast(`Ai selectat testul: ${selectedTest}`, 'success');
}

// ================= POPULARE USER =================
fetch('/api/user')
.then(res => {
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
})
.then(user => {
    const userCard = document.getElementById("userCard");
    if (userCard) {
        userCard.innerHTML = `
            <img src="emt.png" class="avatar">
            <div>
                <div>@${user.username}</div>
            </div>
        `;
    }
})
.catch(() => console.warn("Sesiune vizitator."));

// ================= GENERARE COD =================
function generate(test) {
    if (!test) return showToast("Selectează mai întâi un test!", "warning");

    const lastRequest = localStorage.getItem(`lastRequest_${test}`);
    const now = Date.now();
    const cooldown = 10 * 1000;

    if (lastRequest && (now - lastRequest < cooldown)) {
        const remainingSeconds = Math.ceil((cooldown - (now - lastRequest)) / 1000);
        return showToast(`Ai solicitat deja un cod pentru ${test}! Mai așteaptă ${remainingSeconds} secunde.`, "error");
    }

    fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test })
    })
    .then(res => res.json())
    .then(data => {
        if (data.error) {
            showToast("Eroare: " + data.error, "error");
        } else {
            localStorage.setItem(`lastRequest_${test}`, Date.now());
            showToast("Cod generat cu succes! Așteaptă confirmarea unui HR.", "success");
        }
    })
    .catch(() => showToast("Eroare server la generare.", "error"));
}

// ================= START TEST =================
async function startTestWithCode() {
    const codeInput = document.querySelector('.code-box input').value.trim();
    if (!selectedTest) return showToast("Selectează un test!", "warning");
    if (!codeInput) return showToast("Introdu codul!", "warning");

    try {
        const response = await fetch('/api/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code: codeInput,
                test: selectedTest.toUpperCase()
            })
        });
        const data = await response.json();
        if (data.success) {
            proceedToTest(codeInput);
        } else {
            showToast("Eroare: " + (data.message || "Cod invalid sau deja folosit!"), "error");
        }
    } catch (error) {
        console.error("Server fallback activat.");
        const usedCodes = JSON.parse(localStorage.getItem('usedCodes') || "[]");
        if (usedCodes.includes(codeInput)) {
            showToast("Acest cod a fost deja folosit!", "error");
        } else {
            usedCodes.push(codeInput);
            localStorage.setItem('usedCodes', JSON.stringify(usedCodes));
            proceedToTest(codeInput);
        }
    }
}

// ================= REDIRECȚIONARE TEST =================
function proceedToTest(code) {
    sessionStorage.setItem('activeCode', code);

    const pages = {
        "RADIO": "radio.html",
        "BLS": "bls.html",
        "REZIDENȚIAT": "rezidentiat.html",
        "SMULS TEORETIC": "smuls.html"
    };

    const target = pages[selectedTest.toUpperCase()];
    if (target) {
        showToast("Cod validat! Te redirecționăm...", "success");
        setTimeout(() => window.location.href = target, 1000);
    } else {
        showToast("Pagina testului nu a fost găsită.", "error");
    }
}

// ================= TRIMITERE REZULTAT DISCORD =================
// ================= TRIMITERE REZULTATE DISCORD PENTRU AMBELE EMBEDURI =================
async function sendResultToDiscord(userId, username, testName, questionsData, startTime, userAnswers, warning = false) {
    const totalQuestions = questionsData.length;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const testDuration = 15 * 60; // exemplu 15 minute
    const remainingTime = Math.max(0, testDuration - elapsed);

    const mistakes = userAnswers.filter(q => q.answer !== q.correct);
    const totalMistakes = mistakes.length;
    const isPassed = totalMistakes === 0;
    const scorePercent = Math.round(((totalQuestions - totalMistakes) / totalQuestions) * 100);

    // ==== EMBED PUBLIC SIMPLU ====
    const publicEmbed = {
        testType: testName,
        passed: isPassed,
        score: scorePercent,
        total: totalQuestions,
        warning: warning
    };

    try {
        await fetch("/api/test-result", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(publicEmbed)
        });
        console.log("Embed public trimis cu succes");
    } catch (err) {
        console.error("Eroare la trimiterea embedului public:", err);
    }

    // ==== EMBED CONDUCERE / DETALIAT ====
    let mistakesDetails = "";
    mistakes.forEach((item, index) => {
        mistakesDetails += `\n**Întrebarea ${index + 1}:** ${item.question}\nRăspuns corect: ${item.correct}\nRăspunsul tău: ${item.answer}\n`;
    });

    const drivingEmbed = {
        testType: testName,
        passed: isPassed,
        transcript: mistakes,
        totalMistakes: totalMistakes,
        remainingTime: remainingTime,
        warning: warning
    };

    try {
        await fetch("/api/test-result", { // folosim tot /api/test-result
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(drivingEmbed)
        });
        console.log("Embed conducere trimis cu succes");
    } catch (err) {
        console.error("Eroare la trimiterea embedului conducere:", err);
    }
}

// ================= OVERLAY REGULI =================
const progressBar = document.getElementById("timerProgress");
const checkboxContainer = document.getElementById("checkboxContainer");
const acceptCheckbox = document.getElementById("acceptRules");
const accessBtnContainer = document.getElementById("accessBtnContainer");
const rulesOverlay = document.getElementById("rulesOverlay");
const rulesCard = document.getElementById("rulesCard");

if (rulesOverlay) {
    rulesOverlay.classList.add('show');
    if (rulesCard) rulesCard.classList.add('show');

    const totalTime = 8; // secunde - mareste pentru mai lent
    let timeLeft = totalTime;

    // Pornim bara plina
    if (progressBar) progressBar.style.width = "100%";

    const interval = setInterval(() => {
        timeLeft--;
        const percent = (timeLeft / totalTime) * 100;
        if (progressBar) progressBar.style.width = percent + "%";

        if (timeLeft <= 0) {
            clearInterval(interval);
            setTimeout(() => {
                if (checkboxContainer) {
                    checkboxContainer.style.display = "block";
                    checkboxContainer.classList.add('show');
                }
            }, 500);
        }
    }, 1000);
}

if (acceptCheckbox) {
    acceptCheckbox.addEventListener('change', () => {
        if (acceptCheckbox.checked) {
            accessBtnContainer.style.display = "block";
            setTimeout(() => accessBtnContainer.classList.add('show'), 50);
        } else {
            accessBtnContainer.classList.remove('show');
            setTimeout(() => accessBtnContainer.style.display = "none", 300);
        }
    });
}

const accessBtn = document.getElementById("accessBtn");
if (accessBtn) {
    accessBtn.addEventListener('click', () => {
        rulesOverlay.style.transition = 'opacity 0.5s ease';
        rulesOverlay.style.opacity = 0;
        setTimeout(() => rulesOverlay.style.display = "none", 500);
    });
}