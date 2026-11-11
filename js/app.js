// ===== TOP BAR + LCD DATE =====
function stampDate() {
  const d = new Date();
  const top = document.getElementById('top-date');
  if (top) top.textContent = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
  const long = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
  document.querySelectorAll('.lcd-date').forEach(el => { el.textContent = long; });
}
stampDate();
setInterval(stampDate, 60000);

// ===== TAB SWITCHING =====
const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

function showPage(name) {
  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.page === name));
  localStorage.setItem('byd_last_page', name);   // remembers your last tab
  stampDate();
  document.dispatchEvent(new CustomEvent('pagechange', { detail: name }));
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// Open the last tab you used (or Workout the first time)
showPage(localStorage.getItem('byd_last_page') || 'workout');