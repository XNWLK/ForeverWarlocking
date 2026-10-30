// The spellbook: every spell you can cast, to drag onto the action bar (Xn, 2026-10-30: "have a spellbook option that
// opens a board with all spells so you can drag them into your bars").
// - Drag a spell from the book onto a slot: it goes there (what was in that slot leaves the bar; a spell that was
//   already on the bar moves and the two trade places).
// - Drag a slot onto another slot: they trade places. Drag a slot anywhere else: it leaves the bar.
// - Without dragging: click a spell, then click a slot.
// Works with the mouse and with a finger (pointer events). While the book is open the bar is in its edit mode, so
// clicking two slots still swaps them and a slot plus a key still gives it that key.
//
// h: { icon(key), name(key), tip(key), bar() -> the bar's keys, onPlace(key, slot), onMove(from, to), onRemove(slot),
//      onClose() }
import { setTip } from './tooltip.js';

export function createSpellbook(WL, h) {
  const box = document.getElementById('spellbook'), list = document.getElementById('spellbookList');
  const barEl = document.getElementById('actionBar');
  let isOpen = false, keys = [], picked = null, drag = null, swallowClick = false;

  function slotIndex(el) {
    const slot = el && el.closest ? el.closest('#actionBar .slot') : null;
    return slot ? Array.prototype.indexOf.call(barEl.children, slot) : -1;
  }

  function fill() {
    list.textContent = '';
    const onBar = h.bar();
    keys.forEach(function (key) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'book-spell' + (onBar.indexOf(key) >= 0 ? ' on-bar' : '') + (picked === key ? ' picked' : '');
      const img = document.createElement('img');
      img.src = h.icon(key) || '';
      img.alt = '';
      img.draggable = false;
      const name = document.createElement('span');
      name.textContent = h.name(key);
      item.append(img, name);
      setTip(item, function () { return h.tip(key); });
      item.addEventListener('pointerdown', function (e) { start(e, key, -1); });
      item.addEventListener('click', function () {
        item.blur();
        if (swallowClick) return;
        picked = picked === key ? null : key;
        fill();
      });
      list.appendChild(item);
    });
  }

  // ---------- dragging ----------
  function start(e, key, from) {
    if (!isOpen || (e.pointerType === 'mouse' && e.button !== 0)) return;
    drag = { key: key, from: from, x: e.clientX, y: e.clientY, moved: false, ghost: null };
  }
  window.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
      drag.moved = true;
      const ghost = document.createElement('img');
      ghost.className = 'book-ghost';
      ghost.src = h.icon(drag.key) || '';
      document.body.appendChild(ghost);
      document.body.classList.add('book-dragging');
      drag.ghost = ghost;
    }
    drag.ghost.style.left = e.clientX + 'px';
    drag.ghost.style.top = e.clientY + 'px';
    const over = slotIndex(document.elementFromPoint(e.clientX, e.clientY));
    Array.prototype.forEach.call(barEl.children, function (s, i) { s.classList.toggle('drop', i === over); });
    e.preventDefault();
  }, { passive: false });
  function finish(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.moved) return;
    if (d.ghost) d.ghost.remove();
    document.body.classList.remove('book-dragging');
    Array.prototype.forEach.call(barEl.children, function (s) { s.classList.remove('drop'); });
    swallowClick = true;                                   // the click that follows the drop is not a click
    window.setTimeout(function () { swallowClick = false; }, 0);
    if (cancelled) return;
    const to = slotIndex(document.elementFromPoint(e.clientX, e.clientY));
    picked = null;
    if (to >= 0) { if (d.from >= 0) { if (d.from !== to) h.onMove(d.from, to); } else h.onPlace(d.key, to); }
    else if (d.from >= 0) h.onRemove(d.from);              // a slot dragged off the bar
  }
  window.addEventListener('pointerup', function (e) { finish(e, false); });
  window.addEventListener('pointercancel', function (e) { finish(e, true); });
  // A slot can be picked up while the book is open.
  barEl.addEventListener('pointerdown', function (e) {
    if (!isOpen) return;
    const i = slotIndex(e.target), key = i >= 0 ? h.bar()[i] : null;
    if (key) start(e, key, i);
  });
  // Clicks on the bar: swallowed after a drop; with a spell picked in the book, the click puts it there.
  barEl.addEventListener('click', function (e) {
    if (!isOpen) return;
    const i = slotIndex(e.target);
    if (swallowClick || (picked && i >= 0)) { e.stopImmediatePropagation(); e.preventDefault(); }
    if (!swallowClick && picked && i >= 0) { const key = picked; picked = null; h.onPlace(key, i); }
  }, true);
  barEl.addEventListener('dragstart', function (e) { if (isOpen) e.preventDefault(); });   // no picture drag of the icons
  document.getElementById('spellbookClose').addEventListener('click', function () { h.onClose(); });

  function show(on) {
    if (isOpen === on) return;
    isOpen = on;
    box.hidden = !on;
    picked = null;
    if (on) fill();
  }
  return {
    open: function () { show(true); },
    close: function () { show(false); },
    isOpen: function () { return isOpen; },
    // The spells to show (in order) for the character that is set up now; the book is drawn again if it is open.
    setSpells: function (list) { keys = list.slice(); if (isOpen) fill(); }
  };
}
