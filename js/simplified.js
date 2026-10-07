// Reorganizes the existing controls only in the opt-in layout. Combat and the review remain shared.
import { simplified } from './layout-mode.js';
import { getSetting, setSetting, parseHealth } from './settings.js';
const byId = id => document.getElementById(id);
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function button(text, fn) { const b = el('button', text); b.type = 'button'; b.addEventListener('click', fn); return b; }

export function prepareSimplified() {
  if (!simplified) return;
  document.documentElement.classList.add('simplified');
  const style = el('link'); style.rel = 'stylesheet';
  style.href = new URL('../css/simplified.css', import.meta.url).href + new URL(import.meta.url).search;
  document.head.appendChild(style);
}

export function createSimplified(handlers) {
  if (!simplified) return null;
  const dialog = el('dialog', null, 'review sheet organizer'); dialog.id = 'organizer';
  dialog.setAttribute('aria-labelledby', 'organizerTitle');
  const title = el('h2', 'Character'); title.id = 'organizerTitle';
  const heading = el('div', null, 'organizer-heading');
  const characterLabel = el('p', null, 'hint'); characterLabel.appendChild(byId('buildLabel'));
  const subtitle = el('p', null, 'hint'); heading.append(title, characterLabel, subtitle);
  const backToCharacter = button('Back to character', () => byId('btnSheet').click());
  const headerActions = el('div', null, 'buttons'); headerActions.append(backToCharacter, button('Close', close));
  const header = el('header'); header.append(heading, headerActions); dialog.appendChild(header);
  const pages = {}, contents = {}, leaves = {};
  let opener = null;
  ['character', 'challenges'].forEach(key => {
    pages[key] = el('section', null, 'organizer-page organizer-' + key);
    contents[key] = el('div', null, 'organizer-content');
    pages[key].appendChild(contents[key]); dialog.appendChild(pages[key]);
  });
  const bin = el('div'); bin.hidden = true; document.body.append(bin, dialog);
  const toolbar = byId('topBar').querySelector('.toolbar');
  const oldGroups = Array.from(toolbar.children);
  const dummyGroup = toolbar.querySelector('[data-dummies]').closest('.group');
  const controls = el('div', null, 'group');
  const characterButton = button('Character', () => byId('btnSheet').click()); characterButton.id = 'btnCharacter';
  const settingsButton = button('Settings', () => toggleSettings()); settingsButton.id = 'btnSettings';
  controls.append(byId('btnBuild'), byId('btnRace'), characterButton, byId('btnFight'), settingsButton, byId('btnReset'));
  toolbar.replaceChildren(dummyGroup, controls);
  oldGroups.filter(g => g !== dummyGroup).forEach(g => bin.appendChild(g));
  // Reparent, rather than duplicate, so existing handlers and state are reused.
  ['sheet', 'importPanel'].forEach(id => {
    leaves[id] = byId(id); contents.character.appendChild(leaves[id]);
  });
  const sheet = byId('sheet'), sheetScroll = el('div', null, 'sheet-scroll');
  const sheetActions = el('div', null, 'buttons sheet-actions');
  byId('btnImport').textContent = 'Import / export';
  sheetActions.append(byId('sheetSim'), byId('btnImport'));
  sheetScroll.append(byId('sheetNote'), sheetActions, byId('sheetBody')); sheet.appendChild(sheetScroll);
  ['btnSheet', 'btnTalents', 'btnBuffs'].forEach(id => {
    bin.appendChild(byId(id)); byId(id).addEventListener('click', () => open('character', 'sheet'));
  });
  ['tabCharacter', 'tabTalents', 'tabBuffs'].forEach(id => byId(id).addEventListener('click', () => {
    sheetScroll.scrollTop = 0; syncSheetTabs(); byId(id).focus({ preventScroll: true });
  }));
  function syncSheetTabs() {
    ['tabCharacter', 'tabTalents', 'tabBuffs'].forEach(id => byId(id).setAttribute('aria-pressed', String(byId(id).classList.contains('on'))));
  }
  byId('sheetClose').addEventListener('click', close);
  byId('btnImport').addEventListener('click', () => open('character', 'importPanel'));
  ['buildPanel', 'racePanel'].forEach(id => {
    const pane = byId(id), heading = el('header', null, 'quick-picker-header');
    heading.append(pane.querySelector('h2'), button('Close', () => handlers.closePanels())); pane.prepend(heading);
    pane.appendChild(el('p', 'Applies immediately and restarts the fight. This menu stays open.', 'hint'));
  });
  byId('importApply').textContent = 'Apply and restart';
  byId('importClear').textContent = 'Reset imported build, gear & buffs';
  const importHelp = el('p', 'Create your build, gear and buffs in WarlockSIM, then paste its export codes here. Applying blank codes restores the defaults. Fight settings are configured under Fight.', 'hint');
  byId('importPanel').insertBefore(importHelp, byId('importPanel').children[1]);
  const copyCode = button('Copy current settings code', () => handlers.copy(getSetting('settingsCode') || handlers.defaultCode(), copyCode));
  byId('importPanel').querySelector('.buttons').appendChild(copyCode);

  // Fight setup: one draft and one Apply. Challenge-owned rules require explicitly returning to custom play.
  const fightPanel = byId('fightPanel'), fightHeader = el('header', null, 'quick-picker-header');
  fightHeader.append(fightPanel.querySelector('h2'), button('Close', () => { handlers.closePanels(); byId('btnFight').focus(); }));
  fightPanel.prepend(fightHeader);
  const notice = el('div', null, 'organizer-notice'), noticeText = el('p');
  notice.append(noticeText, button('Return to custom fight', () => byId('challengeEnd').click()));
  const custom = el('fieldset'); custom.className = 'organizer-fight-fields';
  const form = byId('fightForm');
  bin.appendChild(byId('pullSeconds').closest('label'));
  custom.append(form); fightPanel.append(notice, custom);
  const health = el('input'); health.id = 'simpleHealth'; health.type = 'text'; health.inputMode = 'decimal';
  const healthLabel = el('label', 'Health per dummy '); healthLabel.appendChild(health);
  const error = el('p', '', 'hint bad'); error.id = 'simpleFightError'; error.setAttribute('role', 'status');
  const advanced = el('details', null, 'organizer-advanced'); advanced.appendChild(el('summary', 'Advanced: movement, hits & latency'));
  [byId('moveEvery').closest('label'), byId('hitEvery').closest('label'), byId('latency').closest('label')].forEach(label => advanced.appendChild(label));
  advanced.appendChild(form.querySelector('.hint'));
  const submit = form.querySelector('[type="submit"]');
  form.insertBefore(healthLabel, submit);
  form.insertBefore(advanced, submit); form.insertBefore(error, submit);
  const presetSection = el('section', null, 'organizer-presets');
  const presetTitle = el('h3', 'Quick presets'); presetTitle.id = 'quickPresetsTitle';
  presetSection.setAttribute('aria-labelledby', presetTitle.id);
  byId('presets').querySelectorAll('button').forEach(b => {
    const split = b.textContent.indexOf(', '), name = b.textContent;
    if (split < 0) return;
    b.replaceChildren(el('span', name.slice(0, split)), el('small', name.slice(split + 2)));
  });
  presetSection.append(presetTitle, byId('presets'), el('p', 'Presets apply immediately and restart the fight.', 'hint'));
  custom.prepend(presetSection, el('p', 'Or adjust the settings below, then Apply and restart.', 'hint'));
  const pullNote = el('p', 'To precast, choose a Pull timer in the toolbar, then Start pull. Precast runs are ungraded; combat starts on the first hostile hit.', 'hint');
  fightPanel.appendChild(pullNote);
  form.addEventListener('change', updateHealth);
  fightPanel.addEventListener('keydown', e => {
    if (e.code === 'Escape') { handlers.closePanels(); byId('btnFight').focus(); }
    e.stopPropagation();
  });
  function updateHealth() { healthLabel.hidden = form.elements.mode.value === 'timed'; }

  // Settings reveals XN's existing toolbar buttons; their original handlers still own each action.
  const settingsRow = el('div', null, 'toolbar simple-settings'); settingsRow.id = 'simpleSettings'; settingsRow.hidden = true;
  settingsRow.setAttribute('role', 'group'); settingsRow.setAttribute('aria-label', 'Settings controls');
  const moreButton = button('More', () => {
    const show = morePanel.hidden; handlers.closePanels(); setMore(show);
  }); moreButton.setAttribute('aria-controls', 'simpleSettingsMore'); moreButton.setAttribute('aria-expanded', 'false');
  settingsRow.append(byId('btnKeys'), byId('btnEdit'), byId('btnRings'), byId('btnSound'), moreButton);
  toolbar.after(settingsRow);
  settingsButton.setAttribute('aria-controls', settingsRow.id); settingsButton.setAttribute('aria-expanded', 'false');
  const morePanel = el('section', null, 'panel picker simple-settings-more'); morePanel.id = 'simpleSettingsMore'; morePanel.hidden = true;
  const moreHeader = el('header', null, 'quick-picker-header');
  moreHeader.append(el('h2', 'Sound, links & log'), button('Close', () => { setMore(false); moreButton.focus(); }));
  const sharing = el('div', null, 'stack'); sharing.append(byId('btnShare'), byId('btnCopyLog'));
  morePanel.append(moreHeader, byId('volume').closest('label'), sharing, el('h3', 'XN’s projects'), byId('links'));
  const back = el('a', 'Back to current version'); back.href = window.location.pathname; back.className = 'layout-return';
  morePanel.append(el('p', 'This preview saves your setup separately from the current version.', 'hint'), back);
  byId('topBar').appendChild(morePanel);
  function setMore(show) { morePanel.hidden = !show; moreButton.classList.toggle('on', show); moreButton.setAttribute('aria-expanded', String(show)); }
  function toggleSettings() {
    const show = settingsRow.hidden; handlers.closePanels(); setMore(false);
    settingsRow.hidden = !show; settingsButton.classList.toggle('on', show); settingsButton.setAttribute('aria-expanded', String(show));
  }
  ['btnBuild', 'btnRace', 'btnFight', 'btnKeys', 'btnEdit'].forEach(id => byId(id).addEventListener('click', () => setMore(false)));
  byId('btnEdit').addEventListener('click', () => { handlers.closePanels(); byId('touchMenu').hidden = true; });
  morePanel.addEventListener('keydown', e => {
    if (e.code === 'Escape') { setMore(false); moreButton.focus(); }
    e.stopPropagation();
  });

  const aidGroup = byId('swRotation').closest('details'); aidGroup.querySelector('summary').textContent = 'Practice aids';
  aidGroup.open = true;
  const guidanceNote = el('p', 'The sim’s next cast follows XN’s priority list. Mana guidance is an estimate for planning your taps.', 'hint'); aidGroup.appendChild(guidanceNote);
  byId('side').replaceChildren(aidGroup);

  const status = el('button', '', 'simple-status'); status.id = 'simpleStatus'; status.type = 'button'; status.addEventListener('click', () => byId('btnFight').click());
  const pullGroup = byId('challengeBar').querySelector('.group');
  const pullDuration = el('select'); pullDuration.id = 'simplePullDuration';
  pullDuration.setAttribute('aria-label', 'Pull timer');
  for (let seconds = 0; seconds <= 30; seconds++) {
    const option = el('option', seconds ? seconds + 's' : 'None'); option.value = seconds; pullDuration.appendChild(option);
  }
  pullDuration.value = getSetting('pullEnabled') ? String(Math.max(1, Math.min(30, Math.round(Number(getSetting('pullSeconds'))) || 5))) : '0';
  const pullLabel = el('label', 'Pull timer ', 'simple-pull-label'); pullLabel.appendChild(pullDuration);
  pullLabel.title = 'Choose a countdown, then click Start pull to precast. None turns it off. Countdown runs are ungraded practice.';
  pullDuration.addEventListener('change', () => {
    const seconds = Number(pullDuration.value);
    if (seconds) setSetting('pullSeconds', seconds);
    setSetting('pullEnabled', seconds > 0); pullDuration.blur();
  });
  // Native select navigation must not trigger movement or spells.
  pullDuration.addEventListener('keydown', e => e.stopPropagation());
  pullDuration.addEventListener('mousedown', e => e.stopPropagation());
  const touchReview = document.documentElement.classList.contains('touch') ? [byId('btnReview')] : [];
  pullGroup.replaceChildren(byId('btnChallenges'), pullLabel, byId('btnPull'), ...touchReview);
  byId('challengeBar').appendChild(status);
  // Existing target-health editing now leads to the same Fight form.
  byId('targetHealth').title = 'Open Fight setup';
  byId('targetHealth').addEventListener('click', e => {
    e.stopImmediatePropagation();
    if (document.documentElement.classList.contains('touch') && byId('touchMenu').hidden) byId('btnMenu').click();
    if (fightPanel.hidden) byId('btnFight').click();
  }, true);
  byId('btnFight').addEventListener('click', () => { if (!fightPanel.hidden) { refreshFight(); fightPanel.scrollTop = 0; } });
  leaves.challenges = byId('challenges'); contents.challenges.appendChild(leaves.challenges);
  byId('challengesClose').hidden = true;
  byId('btnChallenges').addEventListener('click', () => open('challenges', 'challenges'));

  function open(page, pane) {
    opener = dialog.open ? opener : document.activeElement;
    handlers.release(); byId('touchMenu').hidden = true;
    setMore(false);
    ['Build', 'Race', 'Fight', 'Keys'].forEach(key => { byId(key.toLowerCase() + 'Panel').hidden = true; byId('btn' + key).classList.remove('on'); byId('btn' + key).setAttribute('aria-expanded', 'false'); });
    byId('review').hidden = true; byId('challenges').hidden = true;
    for (const [key, p] of Object.entries(pages)) p.hidden = key !== page;
    for (const [key, p] of Object.entries(leaves)) p.hidden = key !== pane;
    byId('btnImport').classList.toggle('on', pane === 'importPanel');
    byId('btnImport').setAttribute('aria-expanded', String(pane === 'importPanel'));
    title.textContent = page === 'character' ? 'Import / export' : 'Challenges';
    characterLabel.hidden = page !== 'character'; subtitle.hidden = page === 'character';
    subtitle.textContent = page === 'challenges' ? 'Drills, encounters and seeded fights' : '';
    header.hidden = pane === 'sheet'; backToCharacter.hidden = page !== 'character';
    dialog.setAttribute('aria-labelledby', pane === 'sheet' ? 'sheetTitle' : 'organizerTitle');
    dialog.dataset.page = page; dialog.dataset.pane = pane;
    if (pane === 'sheet') { syncSheetTabs(); sheetScroll.scrollTop = 0; }
    dialog.appendChild(byId('tip')); // keep existing talent/buff tooltips above the native dialog
    if (!dialog.open) dialog.showModal();
    contents[page].scrollTop = 0;
  }
  function close() { if (dialog.open) dialog.close(); }
  dialog.addEventListener('close', () => {
    handlers.closePanels(); const tip = byId('tip'); tip.hidden = true; document.body.appendChild(tip);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  });
  // Binding capture still reaches the existing handler; ordinary menu keys never cast or move the player.
  dialog.addEventListener('keydown', e => { if (!handlers.capturingKey()) e.stopPropagation(); });
  dialog.addEventListener('mousedown', e => { if (!handlers.capturingKey()) e.stopPropagation(); });
  function refreshFight() {
    const s = handlers.state();
    notice.hidden = !s.challenge; custom.disabled = !!s.challenge;
    noticeText.textContent = s.challenge ? s.challenge.name + ' controls the targets and fight rules. Character changes restart this challenge; return to custom play to edit its fight rules.' : '';
    form.elements.mode.value = s.fight.timed ? 'timed' : 'health';
    for (const [id, key] of [['fightSeconds', 'seconds'], ['moveEvery', 'moveEvery'], ['moveDuration', 'moveDuration'], ['hitEvery', 'hitEvery']]) byId(id).value = s.fight[key];
    health.value = String(getSetting('dummyHealth'));
    dummyGroup.querySelectorAll('[data-dummies]').forEach(b => {
      const count = Number(b.dataset.dummies);
      b.setAttribute('aria-pressed', String(count === s.targets));
      b.title = (s.challenge ? 'Return to custom play with ' : 'Use ') + count + (count === 1 ? ' dummy' : ' dummies');
    });
    byId('pullSeconds').value = String(getSetting('pullSeconds'));
    byId('latency').value = String(getSetting('latency') || 0);
    error.textContent = ''; updateHealth();
  }
  function refresh() { refreshFight(); render(); }
  function render() {
    const s = handlers.state(); if (!s.character) return;
    const f = s.fight, name = s.challenge ? s.challenge.name : 'Custom fight';
    const end = f.timed ? f.seconds + 's' : Number(getSetting('dummyHealth')).toLocaleString('en-US') + ' health each';
    const value = name + ' · ' + s.targets + (s.targets === 1 ? ' dummy' : ' dummies') + ' · ' + end;
    if (status.textContent !== value) status.textContent = value;
    status.title = value + ' · Open Fight setup';
    byId('btnBuild').title = 'Build: ' + s.character.build.short;
  }
  function fightDraft() {
    const parsed = parseHealth(health.value);
    if (form.elements.mode.value === 'health' && parsed === null) { error.textContent = 'Enter health from 100 to 100,000,000 (50k and 1.5m work too).'; health.focus(); return null; }
    return { dummyHealth: parsed ?? getSetting('dummyHealth'),
      latency: Math.max(0, Math.min(1000, Math.round(Number(byId('latency').value)) || 0)) };
  }
  return { open, close, refresh, render, fightDraft };
}
