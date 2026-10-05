const STORE_KEY = "english-daily-v1";

function today(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return today(new Date(y, m - 1, d + n));
}

function defaultState() {
  return { settings: { newPerDay: 10, rate: 0.8 }, cards: {}, log: {}, lessons: {} };
}

function dayLog(state, day) {
  if (!state.log[day]) state.log[day] = { new: {}, reviews: 0 };
  return state.log[day];
}

function newLearnedToday(state, deck, day) {
  return (state.log[day] && state.log[day].new[deck]) || 0;
}

function buildQueue(state, deck, day, extraNew = 0) {
  const items = DECKS[deck].items;
  const due = items
    .filter((it) => state.cards[it.id] && state.cards[it.id].due <= day)
    .sort((a, b) => (state.cards[a.id].due < state.cards[b.id].due ? -1 : 1));
  const newLeft = DECKS[deck].noFresh ? 0 : Math.max(0, state.settings.newPerDay - newLearnedToday(state, deck, day)) + extraNew;
  const fresh = items.filter((it) => !state.cards[it.id]).slice(0, newLeft);
  return [...due, ...fresh];
}

// grade: 0 不认识, 1 有点难, 2 认识. Returns true if the card should come back this session.
function grade(state, deck, item, g, day) {
  let c = state.cards[item.id];
  const log = dayLog(state, day);
  if (!c) {
    c = { reps: 0, iv: 0, ef: 2.5, due: day, lapses: 0 };
    state.cards[item.id] = c;
    log.new[deck] = (log.new[deck] || 0) + 1;
  } else {
    log.reviews++;
  }
  if (g === 0) {
    c.reps = 0;
    c.iv = 0;
    c.lapses++;
    c.ef = Math.max(1.3, c.ef - 0.2);
    c.due = day;
    return true;
  }
  if (g === 1) {
    c.iv = c.reps === 0 ? 1 : Math.max(c.iv + 1, Math.round(c.iv * 1.2));
    c.ef = Math.max(1.3, c.ef - 0.15);
  } else {
    c.iv = c.reps === 0 ? 1 : c.reps === 1 ? 3 : Math.round(c.iv * c.ef);
  }
  c.reps++;
  c.due = addDays(day, c.iv);
  return false;
}

function streak(state, day) {
  const active = (d) => {
    const l = state.log[d];
    return l && (l.reviews > 0 || Object.values(l.new).some((n) => n > 0));
  };
  let d = active(day) ? day : addDays(day, -1);
  let n = 0;
  while (active(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

function normWords(s) {
  return s
    .toLowerCase()
    .replace(/[’'-]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

// Longest-common-subsequence match: which target words were spoken, in order.
function matchSpeech(target, spoken) {
  const t = normWords(target);
  const s = normWords(spoken);
  const dp = Array.from({ length: t.length + 1 }, () => new Array(s.length + 1).fill(0));
  for (let i = t.length - 1; i >= 0; i--)
    for (let j = s.length - 1; j >= 0; j--)
      dp[i][j] = t[i] === s[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const hit = new Array(t.length).fill(false);
  let i = 0, j = 0;
  while (i < t.length && j < s.length) {
    if (t[i] === s[j]) { hit[i] = true; i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const score = t.length ? Math.round((dp[0][0] / t.length) * 100) : 0;
  return { words: t, hit, score };
}

if (typeof document !== "undefined") {
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        return { ...defaultState(), ...s, settings: { ...defaultState().settings, ...s.settings } };
      }
    } catch (e) {}
    return defaultState();
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  let state = load();
  let deck = "words";
  try { deck = localStorage.getItem(STORE_KEY + ":deck") || "words"; } catch (e) {}
  if (!DECKS[deck]) deck = "words";

  // ---------- speech ----------
  let voice = null;
  let voice2 = null;
  function pickVoice() {
    const vs = speechSynthesis.getVoices().filter((v) => v.lang && v.lang.replace("_", "-").startsWith("en"));
    const us = (v) => /en-US/i.test(v.lang.replace("_", "-"));
    voice = vs.find((v) => us(v) && /Samantha|Ava|Allison|Susan/i.test(v.name)) || vs.find(us) || vs[0] || null;
    voice2 =
      vs.find((v) => v !== voice && us(v) && /Fred|Aaron|Alex|Tom|Nathan|Evan/i.test(v.name)) ||
      vs.find((v) => v !== voice && /Daniel|Arthur/i.test(v.name)) ||
      vs.find((v) => v !== voice && us(v)) || null;
  }
  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }
  function speak(text, rate, opts = {}) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    if (opts.voice || voice) u.voice = opts.voice || voice;
    u.rate = rate || state.settings.rate;
    if (opts.onend) u.onend = opts.onend;
    speechSynthesis.speak(u);
  }
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  // ---------- views ----------
  const app = $("#app");

  function renderHome() {
    const day = today();
    app.replaceChildren();
    const wrap = el("div", "home");

    const head = el("header", "home-head");
    head.append(el("h1", null, "每日英语"), el("p", "muted", day));
    wrap.append(head);

    const stats = el("div", "stats");
    const learned = Object.keys(state.cards).length;
    const mastered = Object.values(state.cards).filter((c) => c.iv >= 21).length;
    [[streak(state, day), "连续打卡(天)"], [learned, "已学"], [mastered, "已牢记"]].forEach(([n, label]) => {
      const s = el("div", "stat");
      s.append(el("b", null, String(n)), el("span", null, label));
      stats.append(s);
    });
    wrap.append(stats);

    const tabs = el("div", "tabs");
    Object.entries(DECKS).forEach(([key, d]) => {
      const b = el("button", "tab" + (key === deck ? " on" : ""));
      const left = buildQueue(state, key, day).length;
      let label = left ? `今日 ${left}` : "已完成";
      if (key === "lessons" && !left && nextLesson() >= 0) label = `第 ${nextLesson() + 1} 课`;
      b.append(el("span", null, d.title), el("small", null, label));
      b.onclick = () => {
        deck = key;
        try { localStorage.setItem(STORE_KEY + ":deck", key); } catch (e) {}
        renderHome();
      };
      tabs.append(b);
    });
    wrap.append(tabs);

    if (deck === "lessons") {
      wrap.append(renderLessonsPanel(day), renderSettings(), renderHelp());
      app.append(wrap);
      return;
    }

    const q = buildQueue(state, deck, day);
    const dueN = q.filter((it) => state.cards[it.id]).length;
    const newN = q.length - dueN;
    const total = DECKS[deck].items.length;
    const seen = DECKS[deck].items.filter((it) => state.cards[it.id]).length;

    const card = el("div", "panel today");
    const nums = el("div", "nums");
    [[dueN, "待复习"], [newN, "新内容"]].forEach(([n, label]) => {
      const s = el("div");
      s.append(el("b", null, String(n)), el("span", null, label));
      nums.append(s);
    });
    card.append(nums);
    const bar = el("div", "bar");
    const fill = el("i");
    fill.style.width = (total ? (seen / total) * 100 : 0) + "%";
    bar.append(fill);
    card.append(bar, el("p", "muted small", `本词库进度 ${seen} / ${total}`));

    if (q.length) {
      const start = el("button", "btn primary big", "开始学习");
      start.onclick = () => startSession(q);
      card.append(start);
    } else {
      card.append(el("p", "done-msg", seen >= total ? "这个词库已经全部学过了，坚持复习就好。" : "今天的任务完成啦！"));
      if (seen < total) {
        const more = el("button", "btn big", "再学 5 个新的");
        more.onclick = () => startSession(buildQueue(state, deck, day, 5));
        card.append(more);
      }
    }
    wrap.append(card);

    wrap.append(renderSettings());
    wrap.append(renderHelp());
    app.append(wrap);
  }

  function renderSettings() {
    const box = el("details", "panel");
    box.append(el("summary", null, "设置"));

    const row1 = el("label", "row");
    row1.append(el("span", null, "每天新学数量"));
    const sel = el("select");
    [5, 10, 15, 20, 30].forEach((n) => {
      const o = el("option", null, String(n));
      o.value = n;
      if (n === state.settings.newPerDay) o.selected = true;
      sel.append(o);
    });
    sel.onchange = () => { state.settings.newPerDay = Number(sel.value); save(); renderHome(); };
    row1.append(sel);

    const row2 = el("label", "row");
    row2.append(el("span", null, "发音语速"));
    const sel2 = el("select");
    [[0.6, "很慢"], [0.8, "慢"], [1, "正常"]].forEach(([v, t]) => {
      const o = el("option", null, t);
      o.value = v;
      if (v === state.settings.rate) o.selected = true;
      sel2.append(o);
    });
    sel2.onchange = () => { state.settings.rate = Number(sel2.value); save(); };
    row2.append(sel2);

    const row3 = el("div", "row");
    const exp = el("button", "btn", "备份进度");
    exp.onclick = async () => {
      const text = JSON.stringify(state);
      try {
        await navigator.clipboard.writeText(text);
        alert("进度已复制。粘贴到备忘录里保存好。");
      } catch (e) {
        prompt("复制下面的内容保存好：", text);
      }
    };
    const imp = el("button", "btn", "恢复进度");
    imp.onclick = () => {
      const text = prompt("粘贴之前备份的内容：");
      if (!text) return;
      try {
        const s = JSON.parse(text);
        if (!s.cards || !s.log) throw new Error();
        state = { ...defaultState(), ...s, settings: { ...defaultState().settings, ...s.settings } };
        save();
        renderHome();
        alert("恢复成功！");
      } catch (e) {
        alert("内容不对，恢复失败。");
      }
    };
    row3.append(exp, imp);

    box.append(row1, row2, row3);
    return box;
  }

  function renderHelp() {
    const box = el("details", "panel");
    box.append(el("summary", null, "怎么设置每天提醒"));
    const ol = el("ol", "help");
    [
      "打开 iPhone 自带的「提醒事项」App，新建一条提醒，标题写「背英语」。",
      "点右边的 ⓘ，打开「日期」和「时间」，选一个每天固定的时间，比如 20:00。",
      "「重复」选「每天」，点完成。",
      "以后每天到点手机会提醒你，点主屏幕上的「每日英语」图标开始学习。",
    ].forEach((t) => ol.append(el("li", null, t)));
    box.append(ol);
    box.append(el("p", "muted small", "学习方法：每天先完成「待复习」，再学新内容。每张卡片都先听发音、跟着大声读，再判断认不认识。"));
    return box;
  }

  // ---------- lessons ----------
  function lessonDone(i) { return !!(state.lessons && state.lessons[i]); }
  function nextLesson() { return LESSONS.findIndex((_, i) => !lessonDone(i)); }

  function renderLessonsPanel(day) {
    const box = el("div");
    const q = buildQueue(state, "lessons", day);
    const done = LESSONS.filter((_, i) => lessonDone(i)).length;
    const nx = nextLesson();

    const card = el("div", "panel today");
    const nums = el("div", "nums");
    [[q.length, "待复习"], [`${done}/${LESSONS.length}`, "已学课文"]].forEach(([n, label]) => {
      const s = el("div");
      s.append(el("b", null, String(n)), el("span", null, label));
      nums.append(s);
    });
    card.append(nums);
    if (q.length) {
      const rb = el("button", "btn big", `复习学过的句子和单词（${q.length}）`);
      rb.onclick = () => startSession(q);
      card.append(rb);
    }
    if (nx >= 0) {
      const lb = el("button", "btn primary big", `学习第 ${nx + 1} 课：${LESSONS[nx].title}`);
      lb.onclick = () => renderLesson(nx);
      card.append(lb);
    } else {
      card.append(el("p", "done-msg", "全部课文都学完了！坚持复习。"));
    }
    box.append(card);

    const LEVELS = { 1: "第一阶段 · 入门对话", 2: "第二阶段 · 短文故事" };
    const list = el("div", "panel lesson-list");
    let lvl = 0;
    LESSONS.forEach((L, i) => {
      if (L.level !== lvl) { lvl = L.level; list.append(el("div", "lvl", LEVELS[lvl] || "")); }
      const row = el("button", "lesson-row");
      const t = el("div");
      t.append(el("b", null, `${i + 1}. ${L.title}`), el("div", "muted small", L.cn));
      row.append(t, el("span", "small " + (lessonDone(i) ? "ok" : "muted"), lessonDone(i) ? "已学" : i === nx ? "下一课" : ""));
      row.onclick = () => renderLesson(i);
      list.append(row);
    });
    box.append(list);
    return box;
  }

  let playToken = 0;
  let onStop = null;
  function stopPlay() {
    playToken++;
    if (onStop) { onStop(); onStop = null; }
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  function renderLesson(i) {
    stopPlay();
    stopRecording();
    const L = LESSONS[i];
    const speakers = [...new Set(L.lines.map((l) => l[0]).filter(Boolean))];
    const voiceOf = (spk) => (voice2 && speakers.indexOf(spk) % 2 === 1 ? voice2 : voice);
    app.replaceChildren();
    if (window.scrollTo) window.scrollTo(0, 0);

    const top = el("div", "topbar");
    const back = el("button", "link", "‹ 返回");
    back.onclick = () => { stopPlay(); stopRecording(); renderHome(); };
    top.append(back, el("span", "muted", `第 ${i + 1} 课 / 共 ${LESSONS.length} 课`));
    app.append(top);

    const head = el("div", "lesson-head");
    head.append(el("h2", null, L.title), el("p", "muted", L.cn));
    app.append(head);

    let showCn = true;
    try { showCn = localStorage.getItem(STORE_KEY + ":cn") !== "0"; } catch (e) {}
    const ctrl = el("div", "row");
    const playBtn = el("button", "btn primary", "播放全文");
    const cnBtn = el("button", "btn", showCn ? "隐藏中文" : "显示中文");
    ctrl.append(playBtn, cnBtn);
    app.append(ctrl);

    const text = el("div", "panel lesson-text" + (showCn ? "" : " no-cn"));
    const rows = L.lines.map(([spk, en, cn]) => {
      const row = el("div", "line");
      if (spk) row.append(el("div", "spk", spk));
      row.append(el("div", "line-en", en), el("div", "line-cn", cn));
      const btns = el("div", "line-btns");
      const listen = el("button", "btn small", "听");
      listen.onclick = () => { stopPlay(); speak(en, null, { voice: voiceOf(spk) }); };
      const practiceBtn = el("button", "btn small", "跟读");
      let practice = null;
      practiceBtn.onclick = () => {
        if (practice) { stopRecording(); practice.remove(); practice = null; return; }
        practice = renderPractice(en);
        row.append(practice);
      };
      btns.append(listen, practiceBtn);
      row.append(btns);
      text.append(row);
      return row;
    });
    app.append(text);

    cnBtn.onclick = () => {
      showCn = !showCn;
      if (showCn) text.classList.remove("no-cn"); else text.classList.add("no-cn");
      cnBtn.textContent = showCn ? "隐藏中文" : "显示中文";
      try { localStorage.setItem(STORE_KEY + ":cn", showCn ? "1" : "0"); } catch (e) {}
    };

    const resetPlay = () => {
      playBtn.textContent = "播放全文";
      rows.forEach((r) => r.classList.remove("playing"));
    };
    playBtn.onclick = () => {
      if (onStop === resetPlay) { stopPlay(); return; }
      stopPlay();
      const token = playToken;
      onStop = resetPlay;
      playBtn.textContent = "停止";
      const step = (j) => {
        if (token !== playToken) return;
        rows.forEach((r) => r.classList.remove("playing"));
        if (j >= L.lines.length) { resetPlay(); onStop = null; return; }
        rows[j].classList.add("playing");
        const [spk, en] = L.lines[j];
        speak(en, null, { voice: voiceOf(spk), onend: () => setTimeout(() => step(j + 1), 400) });
      };
      step(0);
    };

    const wp = el("div", "panel");
    wp.append(el("div", "practice-title", "生词"));
    L.words.forEach(([w, ipa, cn]) => {
      const r = el("div", "word-row");
      const t = el("div");
      t.append(el("b", null, w), el("span", "muted small", "  " + ipa), el("div", "small", cn));
      const p = el("button", "btn small", "发音");
      p.onclick = () => { stopPlay(); speak(w); };
      r.append(t, p);
      wp.append(r);
    });
    app.append(wp);

    const pp = el("div", "panel");
    pp.append(el("div", "practice-title", "学习要点"), el("p", null, L.point));
    app.append(pp);

    const actions = el("div", "lesson-actions");
    if (!lessonDone(i)) {
      const fin = el("button", "btn primary big", "学完了，加入复习");
      fin.onclick = () => { finishLesson(i); renderLesson(i); };
      actions.append(fin, el("p", "muted small", "建议：先听全文，再逐句跟读，最后关掉中文也能读懂，再点这里。"));
    } else {
      actions.append(el("p", "done-msg", "本课已学完，句子和生词会按计划复习。"));
    }
    if (i + 1 < LESSONS.length) {
      const nb = el("button", "btn big", "下一课 ›");
      nb.onclick = () => renderLesson(i + 1);
      actions.append(nb);
    }
    app.append(actions);
  }

  function finishLesson(i) {
    const day = today();
    const prefix = "l" + (i + 1) + ":";
    let n = 0;
    DECKS.lessons.items.forEach((it) => {
      if (it.id.startsWith(prefix) && !state.cards[it.id]) {
        state.cards[it.id] = { reps: 1, iv: 1, ef: 2.5, due: addDays(day, 1), lapses: 0 };
        n++;
      }
    });
    const log = dayLog(state, day);
    log.new.lessons = (log.new.lessons || 0) + n;
    if (!state.lessons) state.lessons = {};
    state.lessons[i] = day;
    save();
  }

  // ---------- session ----------
  let queue = [];
  let doneCount = 0;

  function startSession(q) {
    queue = q.slice();
    doneCount = 0;
    renderCard();
  }

  function renderCard() {
    if (!queue.length) return renderFinish();
    const item = queue[0];
    const isWord = item.kind !== "sentence";
    const isRoot = item.kind === "root";
    app.replaceChildren();

    const top = el("div", "topbar");
    const back = el("button", "link", "‹ 返回");
    back.onclick = () => { stopRecording(); if (window.speechSynthesis) speechSynthesis.cancel(); renderHome(); };
    top.append(back, el("span", "muted", `已完成 ${doneCount} · 剩余 ${queue.length}`));
    app.append(top);

    const card = el("div", "card");
    const isNew = !state.cards[item.id];
    if (isNew) card.append(el("span", "badge", "新"));
    card.append(el("div", isWord ? (item.front.length > 11 ? "front word long" : "front word") : "front sentence", item.front));
    if (item.ipa) card.append(el("div", "ipa", item.ipa));

    if (isRoot) {
      card.append(el("p", "muted small", "想一想这个词根是什么意思，能想到哪些单词？"));
    } else {
      const play = el("div", "row center");
      const b1 = el("button", "btn round", "发音");
      b1.onclick = () => speak(item.front);
      const b2 = el("button", "btn round", "慢速");
      b2.onclick = () => speak(item.front, 0.5);
      play.append(b1, b2);
      card.append(play);
    }

    const back2 = el("div", "back hidden");
    back2.append(el("div", "cn", item.cn));
    if (item.ex) {
      const ex = el("div", "ex");
      const exText = el("div", "ex-en", item.ex);
      const exPlay = el("button", "btn small", "听例句");
      exPlay.onclick = () => speak(item.ex);
      ex.append(exText, el("div", "ex-cn muted", item.exCn), exPlay);
      back2.append(ex);
    }
    if (item.parts) {
      const list = el("div", "parts");
      item.parts.forEach(([w, how, cn]) => {
        const row = el("div", "part");
        const txt = el("div");
        txt.append(el("b", null, w), el("span", "muted", "  " + cn), el("div", "how", how));
        const p = el("button", "btn small", "发音");
        p.onclick = () => speak(w);
        row.append(txt, p);
        list.append(row);
      });
      back2.append(list);
    }
    back2.append(renderPractice(item.ex || item.say || item.front));
    card.append(back2);
    app.append(card);

    const actions = el("div", "actions");
    const reveal = el("button", "btn primary big", "显示答案");
    reveal.onclick = () => {
      back2.classList.remove("hidden");
      actions.replaceChildren(...gradeButtons(item));
    };
    actions.append(reveal);
    app.append(actions);

    if (!isRoot) speak(item.front);
  }

  function gradeButtons(item) {
    return [[0, "不认识", "bad"], [1, "有点难", "mid"], [2, "认识", "good"]].map(([g, t, cls]) => {
      const b = el("button", "btn grade " + cls, t);
      b.onclick = () => {
        stopRecording();
        const again = grade(state, deck, item, g, today());
        save();
        queue.shift();
        if (again) queue.splice(Math.min(3, queue.length), 0, item);
        else doneCount++;
        renderCard();
      };
      return b;
    });
  }

  // ---------- speaking practice ----------
  let recorder = null;
  let recStream = null;

  function stopRecording() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
    if (recStream) recStream.getTracks().forEach((t) => t.stop());
    recorder = null;
    recStream = null;
  }

  function renderPractice(text) {
    const box = el("div", "practice");
    box.append(el("div", "practice-title", "跟读练习"));
    const tip = el("p", "muted small", "先听一遍，再大声跟着读。");
    const result = el("div", "result");
    const row = el("div", "row center");

    if (navigator.mediaDevices && window.MediaRecorder) {
      const rec = el("button", "btn", "录音");
      const playMine = el("button", "btn hidden", "听我的录音");
      const audio = new Audio();
      rec.onclick = async () => {
        if (recorder) { stopRecording(); return; }
        try {
          recStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const chunks = [];
          recorder = new MediaRecorder(recStream);
          recorder.ondataavailable = (e) => chunks.push(e.data);
          recorder.onstop = () => {
            audio.src = URL.createObjectURL(new Blob(chunks, { type: chunks[0] ? chunks[0].type : "audio/mp4" }));
            playMine.classList.remove("hidden");
            rec.textContent = "重新录音";
            rec.classList.remove("recording");
          };
          recorder.start();
          rec.textContent = "停止录音";
          rec.classList.add("recording");
        } catch (e) {
          tip.textContent = "没有麦克风权限。可以在 iPhone 设置里允许后再试。";
        }
      };
      playMine.onclick = () => audio.play();
      row.append(rec, playMine);
    }

    if (Recognition) {
      const scoreBtn = el("button", "btn", "跟读打分");
      scoreBtn.onclick = () => {
        stopRecording();
        const r = new Recognition();
        r.lang = "en-US";
        r.interimResults = false;
        r.maxAlternatives = 3;
        scoreBtn.textContent = "请说…";
        scoreBtn.disabled = true;
        r.onresult = (e) => {
          const alts = Array.from(e.results[0]).map((a) => a.transcript);
          const best = alts.map((a) => matchSpeech(text, a)).sort((a, b) => b.score - a.score)[0];
          showScore(result, best, alts[0]);
        };
        r.onerror = () => { result.replaceChildren(el("p", "muted small", "没听清，再试一次。")); };
        r.onend = () => { scoreBtn.textContent = "跟读打分"; scoreBtn.disabled = false; };
        r.start();
      };
      row.append(scoreBtn);
    }

    box.append(tip, row, result);
    return box;
  }

  function showScore(result, m, heard) {
    result.replaceChildren();
    const s = el("div", "score " + (m.score >= 80 ? "good" : m.score >= 50 ? "mid" : "bad"), m.score + " 分");
    const line = el("div", "words");
    m.words.forEach((w, i) => line.append(el("span", m.hit[i] ? "hit" : "miss", w), " "));
    result.append(s, line, el("p", "muted small", "听到的是：" + heard));
  }

  function renderFinish() {
    app.replaceChildren();
    const box = el("div", "panel finish");
    box.append(el("h2", null, "太棒了！"));
    box.append(el("p", null, `这一轮完成了 ${doneCount} 个。`));
    box.append(el("p", "muted", `已连续打卡 ${streak(state, today())} 天，明天继续！`));
    const home = el("button", "btn primary big", "回到首页");
    home.onclick = renderHome;
    box.append(home);
    app.append(box);
  }

  renderHome();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}
