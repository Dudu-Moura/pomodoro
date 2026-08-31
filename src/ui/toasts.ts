const host = (): HTMLElement => document.getElementById('toasts') as HTMLElement;

export function toast(icon: string, title: string, desc = '', ms = 5200): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div class="toast-icon"></div><div><div class="toast-title"></div>${desc ? '<div class="toast-desc"></div>' : ''}</div>`;
  (el.querySelector('.toast-icon') as HTMLElement).textContent = icon;
  (el.querySelector('.toast-title') as HTMLElement).textContent = title;
  if (desc) (el.querySelector('.toast-desc') as HTMLElement).textContent = desc;
  host().appendChild(el);
  window.setTimeout(() => {
    el.classList.add('out');
    window.setTimeout(() => el.remove(), 400);
  }, ms);
}
