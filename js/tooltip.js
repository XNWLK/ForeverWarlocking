// Tooltips: a box that appears at once next to what the pointer is on, as in the game.
// setTip(element, provide) gives an element a tooltip of its own; provide() returns
//   { title, right, rows: [[left, right], ...], text, notes: [string | { text, yours }] }  or null for none.
// Anything else with a plain hint (a title attribute) gets the same box with just that text.
const providers = new WeakMap();
let box = null, owner = null, shown = '', stamp = 0;

export function setTip(element, provide) {
  providers.set(element, provide);
  element.removeAttribute('title');
}

function find(node) {
  for (let n = node; n && n.nodeType === 1 && n !== document.body; n = n.parentElement) {
    if (n.getAttribute('title')) { n.dataset.tip = n.getAttribute('title'); n.removeAttribute('title'); }
    if (providers.has(n) || n.dataset.tip) return n;
  }
  return null;
}

function line(className, text) {
  const node = document.createElement('div');
  node.className = className;
  node.textContent = text;
  return node;
}

function pair(className, left, right) {
  const node = document.createElement('div'), a = document.createElement('b'), b = document.createElement('span');
  node.className = className;
  a.textContent = left || ''; b.textContent = right || '';
  if (className === 'tip-row') a.style.fontWeight = '400';
  node.append(a, b);
  return node;
}

function hide() {
  owner = null; shown = '';
  if (box) box.hidden = true;
}

function update() {
  if (!owner) return;
  const provide = providers.get(owner), data = provide ? provide() : { plain: owner.dataset.tip };
  if (!data) { box.hidden = true; shown = ''; return; }
  const id = JSON.stringify(data);
  if (id !== shown) {
    shown = id;
    box.textContent = '';
    if (data.plain) box.appendChild(line('tip-plain', data.plain));
    if (data.title) box.appendChild(pair('tip-title', data.title, data.right));
    (data.rows || []).forEach(function (r) { if (r[0] || r[1]) box.appendChild(pair('tip-row', r[0], r[1])); });
    if (data.text) box.appendChild(line('tip-text', data.text));
    (data.notes || []).forEach(function (n) {
      if (!n) return;
      box.appendChild(line('tip-note' + (n.yours ? ' yours' : ''), typeof n === 'string' ? n : n.text));
    });
  }
  box.hidden = false;
  // Above what it belongs to when there is room, otherwise below; never off the screen.
  const r = owner.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
  const x = Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2));
  const y = r.top - h - 8 >= 8 ? r.top - h - 8 : Math.min(window.innerHeight - h - 8, r.bottom + 8);
  box.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
}

export function initTips() {
  box = document.getElementById('tip');
  document.addEventListener('pointerover', function (e) {
    const next = e.buttons ? null : find(e.target);       // not while a mouse button is held (steering, dragging)
    if (next === owner) return;
    if (!next) { hide(); return; }
    owner = next; shown = '';
    update();
  });
  document.addEventListener('pointerdown', function () { if (owner && !providers.has(owner)) hide(); });   // a plain hint goes away on a click
  document.documentElement.addEventListener('pointerleave', hide);
  window.addEventListener('blur', hide);
}

// Called every picture: keeps the numbers in an open tooltip fresh, and closes it when its owner is gone.
export function refreshTips(now) {
  if (!owner) return;
  if (!owner.isConnected) { hide(); return; }
  if (now - stamp < 0.2) return;
  stamp = now;
  update();
}
