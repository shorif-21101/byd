// ===== TAB SWITCHING =====
const navButtons = document.querySelectorAll('.nav-btn');
const pages = document.querySelectorAll('.page');

function showPage(name) {
  pages.forEach(p => p.classList.toggle('active', p.id === 'page-' + name));
  navButtons.forEach(b => b.classList.toggle('active', b.dataset.page === name));
  localStorage.setItem('byd_last_page', name);   // remembers your last tab
  document.dispatchEvent(new CustomEvent('pagechange', { detail: name }));   // NEW LINE
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// Open the last tab you used (or Workout the first time)
showPage(localStorage.getItem('byd_last_page') || 'workout');