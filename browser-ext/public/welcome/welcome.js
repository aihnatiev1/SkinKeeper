let current = 0;
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');

function show(idx) {
  current = idx;
  slides.forEach((s, i) => s.classList.toggle('active', i === idx));
  dots.forEach((d, i) => d.classList.toggle('active', i === idx));
  prevBtn.style.display = idx > 0 ? '' : 'none';
  nextBtn.textContent = idx === slides.length - 1 ? 'Get Started' : 'Next';
}

nextBtn.addEventListener('click', () => {
  if (current < slides.length - 1) show(current + 1);
  else window.close();
});
prevBtn.addEventListener('click', () => { if (current > 0) show(current - 1); });
dots.forEach(d => d.addEventListener('click', () => show(parseInt(d.dataset.dot))));
