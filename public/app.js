'use strict';

// Order matches src/jevClient.js CATEGORIES: best -> worst, mapped onto the
// fixed good -> warning -> serious -> critical status scale (never color alone,
// so each row also carries its label and, on hover, its own icon dot).
const STATUS_COLORS = ['var(--status-good)', 'var(--status-warning)', 'var(--status-serious)', 'var(--status-critical)'];

const metersEl = document.getElementById('meters');
const statusLine = document.getElementById('status-line');
const confidenceFill = document.getElementById('confidence-fill');
const confidenceValue = document.getElementById('confidence-value');
const rawJson = document.getElementById('raw-json');
const form = document.getElementById('qualify-form');
const submitBtn = document.getElementById('submit-btn');
const errorLine = document.getElementById('error-line');

let categories = [];

function renderMeters(probabilities) {
  metersEl.innerHTML = '';
  categories.forEach((category, i) => {
    const pct = probabilities ? Math.round((probabilities[category] || 0) * 100) : 0;
    const color = STATUS_COLORS[i] || 'var(--text-muted)';

    const row = document.createElement('div');
    row.className = 'meter-row';
    row.innerHTML = `
      <div class="meter-label-row">
        <span class="meter-icon" style="background:${color}"></span>
        <span>${category}</span>
        <span class="meter-pct">${pct}%</span>
      </div>
      <div class="meter-track">
        <div class="meter-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    `;
    metersEl.appendChild(row);
  });
}

async function loadCategories() {
  const res = await fetch('/api/categories');
  const data = await res.json();
  categories = data.categories;
  renderMeters(null);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorLine.hidden = true;
  submitBtn.disabled = true;
  statusLine.textContent = 'Klasyfikacja w toku…';

  const formData = new FormData(form);
  const payload = {
    q1: formData.get('q1'),
    q2: formData.get('q2'),
    q3: formData.get('q3'),
  };

  try {
    const res = await fetch('/api/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || 'Klasyfikacja nie powiodła się.');
    }

    renderMeters(result.probabilities);
    statusLine.textContent = `Zaklasyfikowano: ${result.category}`;

    const confidencePct = result.confidence != null ? Math.round(result.confidence * 100) : null;
    confidenceFill.style.width = `${confidencePct ?? 0}%`;
    confidenceValue.textContent = confidencePct != null ? `${confidencePct}%` : 'brak danych';

    rawJson.textContent = JSON.stringify(result.raw, null, 2);
  } catch (err) {
    statusLine.textContent = 'Błąd klasyfikacji';
    errorLine.textContent = err.message;
    errorLine.hidden = false;
  } finally {
    submitBtn.disabled = false;
  }
});

loadCategories();
