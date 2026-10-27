import { matchLocale } from './locales.js';

if (document.body.hasAttribute('data-language-entry')) {
  const locale = matchLocale(navigator.languages ?? [navigator.language]);
  const target = new URL(`${locale}/index.html`, window.location.href);
  target.hash = window.location.hash;
  window.location.replace(target.href);
}

const tabList = document.querySelector('[data-tabs]');
if (tabList) {
  const buttons = [...tabList.querySelectorAll('button')];
  const panels = [...document.querySelectorAll('[data-panel]')];
  function select(index, focus = false) {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (focus) buttons[index].focus();
  }
  tabList.setAttribute('role', 'tablist');
  buttons.forEach((button, index) => {
    button.setAttribute('role', 'tab');
    panels[index].setAttribute('role', 'tabpanel');
    panels[index].setAttribute('aria-labelledby', button.id);
    panels[index].tabIndex = 0;
    button.addEventListener('click', () => select(index));
    button.addEventListener('keydown', event => {
      const direction = document.documentElement.dir === 'rtl' ? -1 : 1;
      const step = event.key === 'ArrowRight' ? direction : event.key === 'ArrowLeft' ? -direction : 0;
      if (step || event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        select(event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
          (index + step + buttons.length) % buttons.length, true);
      }
    });
  });
  select(0);
  tabList.hidden = false;
}

const languageMenu = document.querySelector('.language-menu');
if (languageMenu) {
  document.addEventListener('click', event => {
    if (!languageMenu.contains(event.target)) languageMenu.open = false;
  });
  languageMenu.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      languageMenu.open = false;
      languageMenu.querySelector('summary').focus();
    }
  });
}

const audioPlayers = [...document.querySelectorAll('audio')];
for (const audio of audioPlayers) {
  const container = audio.closest('[data-audio-player]');
  const card = audio.closest('.voice-card');
  audio.addEventListener('play', () => {
    for (const other of audioPlayers) if (other !== audio) other.pause();
    container.querySelector('[data-audio-error]').hidden = true;
  });
  audio.addEventListener('playing', () => { if (card) card.dataset.playing = 'true'; });
  for (const event of ['pause', 'ended', 'emptied']) {
    audio.addEventListener(event, () => { if (card) delete card.dataset.playing; });
  }
  audio.addEventListener('error', () => {
    container.querySelector('[data-audio-error]').hidden = false;
    if (card) delete card.dataset.playing;
  });
}
window.addEventListener('pagehide', () => { for (const audio of audioPlayers) audio.pause(); });

if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const audio = entry.target;
      if (audio.preload === 'none' && audio.paused) {
        audio.preload = 'metadata';
        audio.load();
      }
      observer.unobserve(audio);
    }
  }, { rootMargin: '150px' });
  for (const audio of audioPlayers) observer.observe(audio);
}

const voiceSelect = document.querySelector('[data-voice-select]');
if (voiceSelect) {
  const cards = [...document.querySelectorAll('[data-voice-language]')];
  const filter = () => {
    for (const card of cards) card.hidden = card.dataset.voiceLanguage !== voiceSelect.value;
  };
  voiceSelect.addEventListener('change', () => {
    for (const audio of audioPlayers) audio.pause();
    filter();
  });
  filter();
  document.querySelector('[data-voice-filter]').hidden = false;
}

const demoAudio = document.querySelector('[data-demo-audio]');
if (demoAudio) {
  const demo = demoAudio.closest('[data-rhythm-demo]');
  const cues = [...demo.querySelectorAll('[data-cue]')];
  const sources = [...demo.querySelectorAll('[data-source-cue]')];
  const update = () => {
    const time = demoAudio.currentTime;
    const active = demoAudio.ended ? -1 : cues.findIndex(cue =>
      time >= Number(cue.dataset.start) && time < Number(cue.dataset.end));
    cues.forEach((cue, index) => {
      if (index === active) cue.setAttribute('aria-current', 'step');
      else cue.removeAttribute('aria-current');
      const marker = cue.querySelector('[data-pause-marker]');
      if (marker) {
        const next = cues[index + 1];
        marker.classList.toggle('is-current', !demoAudio.ended && Boolean(next) &&
          time >= Number(cue.dataset.end) && time < Number(next.dataset.start));
      }
    });
    for (const source of sources) {
      source.classList.toggle('is-current', Number(source.dataset.sourceCue) === active);
    }
  };
  for (const event of ['timeupdate', 'seeking', 'seeked', 'ended', 'emptied']) demoAudio.addEventListener(event, update);
}
