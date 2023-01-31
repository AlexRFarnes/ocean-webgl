const scrollable = document.querySelector('.scrollable');

let current = 0;
let target = 0;
let ease = 0.075;

// linear interpolation used for smooth scrolling and image offset uniform adjustment
function lerp(start, end, t) {
  return start * (1 - t) + end * t;
}

export function init() {
  document.body.style.height = `${scrollable.getBoundingClientRect().height}px`;
}

export function smoothScroll() {
  target = window.scrollY;
  current = lerp(current, target, ease);
  scrollable.style.transform = `translate3d(0, ${-current}px, 0)`;
  requestAnimationFrame(smoothScroll);
  return current;
}
