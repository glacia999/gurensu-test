(function () {
  // 好评有礼弹窗文案，改这里即可
  const GIFT_HTML = '<h3>好评有礼</h3><p>感谢你的测试！</p><p>在店铺给出<b>好评</b>后，请<b>联系客服</b>并发送<b>好评截图</b>，即可获得 <b class="red">1 元返现</b>。</p>';

  const C = window.CONTENT;
  const $ = id => document.getElementById(id);
  const screens = ['home', 'quiz', 'loading', 'result'];
  // 和职场古人塑在同一个网址下，存储的键名都加 tf_ 前缀，避免互相覆盖
  const P = 'tf_';
  const store = {
    get(k, s = localStorage) { try { return JSON.parse(s.getItem(P + k)); } catch (e) { return null; } },
    set(k, v, s = localStorage) { try { s.setItem(P + k, JSON.stringify(v)); } catch (e) {} },
    del(k, s = localStorage) { try { s.removeItem(P + k); } catch (e) {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let quiz = null; // { code, questions, answers, idx }
  let current = null; // 当前展示的结果

  function show(name) {
    screens.forEach(s => { $(s).hidden = s !== name; });
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2200);
  }
  function modal(html) { $('modal').hidden = false; $('modalBody').innerHTML = html; }

  // 首页的 12 个天赋称号
  $('talentChips').innerHTML = Object.values(C.talents).map(t => `<span>${esc(t.title)}</span>`).join('');

  // ---------- 首页 ----------
  async function startWithCode(code) {
    $('codeError').textContent = '';
    const btn = $('startBtn');
    btn.disabled = true; btn.textContent = '验证中…';
    try {
      const r = await API.verify(code);
      store.set('code', code);
      quiz = { code, questions: r.questions, answers: [], idx: 0, remaining: r.remaining };
      saveQuiz();
      API.goHome();
      show('quiz'); renderQuestion();
    } catch (e) {
      show('home');
      $('codeError').textContent = e.message;
    } finally {
      btn.disabled = false; btn.textContent = '开始测试';
    }
  }

  $('codeForm').addEventListener('submit', e => {
    e.preventDefault();
    const code = $('codeInput').value.replace(/[^0-9a-z]/gi, '').toUpperCase();
    if (!code) { $('codeError').textContent = '请输入密码'; return; }
    startWithCode(code);
  });

  // ---------- 答题 ----------
  const saveQuiz = () => store.set('quiz', quiz, sessionStorage);

  // 鼓励语：答完第 n 题后显示 cheers[n-1]；第 5 题后告诉用户目前最突出的是哪一组
  function cheerText() {
    const { questions, idx, answers } = quiz;
    const done = idx === questions.length - 1 && answers[idx] != null ? questions.length : idx;
    if (done === 0) return '凭第一直觉选，每个选项都是一种本事';
    if (done === 5) {
      const cnt = {};
      let best = null;
      for (let i = 0; i < 5; i++) {
        const g = questions[i].g[answers[i]];
        cnt[g] = (cnt[g] || 0) + 1;
        if (!best || cnt[g] >= cnt[best]) best = g;
      }
      return `目前你最突出的是「${C.groups[best]}」类天赋，再答 5 题解锁完整报告`;
    }
    return C.cheers[done - 1];
  }

  function renderQuestion() {
    const { questions, idx, answers } = quiz;
    const q = questions[idx];
    $('qNum').textContent = idx + 1;
    $('qTotal').textContent = questions.length;
    $('qBar').style.width = ((idx + (answers[idx] != null ? 1 : 0)) / questions.length * 100) + '%';
    const cheer = cheerText();
    if ($('qCheer').textContent !== cheer) {
      $('qCheer').textContent = cheer;
      $('qCheer').classList.remove('pop'); void $('qCheer').offsetWidth; $('qCheer').classList.add('pop');
    }
    $('qText').textContent = q.q;
    $('prevBtn').style.visibility = idx > 0 ? 'visible' : 'hidden';
    const letters = 'ABCDEF';
    $('qOptions').innerHTML = q.o.map((t, i) =>
      `<button type="button" class="opt${answers[idx] === i ? ' on' : ''}" data-i="${i}"><span class="opt-l">${letters[i]}</span><span>${esc(t)}</span></button>`
    ).join('');
    const last = idx === questions.length - 1;
    $('submitBtn').hidden = !(last && answers[idx] != null);
  }

  $('qOptions').addEventListener('click', e => {
    const b = e.target.closest('.opt');
    if (!b || quiz.locked) return;
    const i = +b.dataset.i;
    quiz.answers[quiz.idx] = i;
    saveQuiz();
    renderQuestion();
    if (quiz.idx < quiz.questions.length - 1) {
      quiz.locked = true;
      setTimeout(() => { quiz.locked = false; quiz.idx++; saveQuiz(); renderQuestion(); }, 280);
    }
  });

  $('prevBtn').addEventListener('click', () => {
    if (quiz.idx > 0) { quiz.idx--; saveQuiz(); renderQuestion(); }
  });

  const LOADING_STEPS = ['正在分析你的答题偏好…', '正在比对 12 种天赋…', '正在匹配适合你的职业…', '你的天赋报告马上就好…'];
  async function loadingAnimation(ms) {
    for (let i = 0; i < LOADING_STEPS.length; i++) {
      $('loadingText').textContent = LOADING_STEPS[i];
      await new Promise(ok => setTimeout(ok, ms / LOADING_STEPS.length));
    }
  }

  $('submitBtn').addEventListener('click', async () => {
    if (quiz.answers.length !== quiz.questions.length || quiz.answers.some(a => a == null)) {
      const miss = quiz.answers.findIndex(a => a == null);
      quiz.idx = miss < 0 ? quiz.answers.length : miss; renderQuestion();
      return toast('还有题目没有作答');
    }
    show('loading');
    try {
      const [r] = await Promise.all([API.submit(quiz.code, quiz.answers), loadingAnimation(2400)]);
      store.set('remaining', r.remaining);
      const mine = store.get('mine') || [];
      mine.push(r.id); store.set('mine', mine.slice(-20));
      store.del('quiz', sessionStorage);
      quiz = null;
      API.goResult(r.id);
      loadResult(r.id);
    } catch (e) {
      show('quiz');
      toast(e.message);
    }
  });

  // ---------- 结果 ----------
  async function loadResult(id) {
    $('loadingText').textContent = '正在打开天赋报告…';
    show('loading');
    try {
      current = await API.result(id);
    } catch (e) {
      show('home');
      $('codeError').textContent = e.message;
      return;
    }
    renderResult(current);
    show('result');
  }

  // #rrggbb → 很浅的同色背景
  const soft = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    const mix = c => Math.round(c * a + 255 * (1 - a));
    return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
  };

  function renderResult(r) {
    const m = r.main, s = r.sub;
    const mine = (store.get('mine') || []).includes(r.id);
    document.querySelectorAll('.owner-only').forEach(el => { el.hidden = !mine; });
    document.querySelectorAll('.visitor-only').forEach(el => { el.hidden = mine; });
    const remaining = store.get('remaining');
    $('remainHint').textContent = remaining != null ? `当前密码还可以测试 ${remaining} 次` : '';
    const date = new Date(r.at);
    const bars = r.ranking.map(x => `
      <div class="rank${x.tag === '闪光' ? ' hi' : ''}">
        <span class="rank-name">${esc(x.name)}</span>
        <span class="rank-bar"><i style="width:${x.pct}%;background:${x.color}"></i></span>
        <span class="rank-tag">${x.tag}</span>
      </div>`).join('');
    const hcode = r.hcode.map(l => `<div><b>${l}</b><span>${esc(C.holland[l][0])}</span></div>`).join('');
    const jobs = m.jobs.map(([n, why]) => `<div class="job"><div class="job-n">${esc(n)}</div><p>${esc(why)}</p></div>`).join('');
    const also = s.jobs.slice(0, 3).map(j => j[0]).filter(n => !m.jobs.some(j => j[0] === n));
    $('poster').style.setProperty('--c', m.color);
    $('poster').style.setProperty('--c-soft', soft(m.color, 0.12));
    $('poster').innerHTML = `
      <div class="p-head">
        <span>${esc(r.meta.title)}</span><span>${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}</span>
      </div>
      <div class="p-hero">
        <div class="p-you">你的主天赋是</div>
        <div class="badge huge" style="--c:${m.color}">${esc(m.icon)}</div>
        <div class="p-name">${esc(m.name)}</div>
        <div class="p-title">${esc(m.title)}</div>
        <div class="p-quote">「${esc(m.slogan)}」</div>
        <div class="p-combo">天赋组合：<b>${esc(m.title)}</b> × <b>${esc(s.title)}</b></div>
        ${r.total >= 100 ? `<div class="p-rarity">已有 ${r.total} 人测过，主天赋和你相同的占 <b>${(r.same / r.total * 100).toFixed(1)}%</b></div>` : ''}
      </div>
      <div class="p-sec"><h3>你身上的样子</h3><ul class="checks">${m.signs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <div class="p-sec"><h3>为什么这件事对你不费劲</h3><p>${esc(m.desc)}</p></div>
      <div class="p-sec"><h3>你的副天赋</h3>
        <div class="sub">
          <div class="badge sm" style="background:${s.color}">${esc(s.icon)}</div>
          <div><div class="sub-name">${esc(s.name)}<span>${esc(s.title)}</span></div>
          <p>你既${esc(m.verb)}，又${esc(s.verb)}。${esc(s.asSub)}两种天赋叠在一起，就是只属于你的组合优势。</p></div>
        </div>
      </div>
      <div class="p-sec"><h3>12 种天赋全景</h3>${bars}<p class="legend">「待开发」不是短板，只是你还没把精力放在那里。</p></div>
      <div class="p-sec"><h3>理论对照</h3>
        <div class="theory"><div class="theory-t">多元智能：<b>${esc(m.mi)}</b></div><p>${esc(C.theory.mi)}</p></div>
        <div class="theory"><div class="theory-t">你的霍兰德职业兴趣代码</div>
          <div class="hcode">${hcode}</div>
          <p>${r.hcode.map(l => `${l} ${esc(C.holland[l][0])}：${esc(C.holland[l][1])}`).join('；')}。</p>
          <p>${esc(C.theory.holland)}</p></div>
        <div class="theory"><div class="theory-t">为什么只讲优势</div><p>${esc(C.theory.strengths)}</p></div>
      </div>
      <div class="p-sec"><h3>适合你的职业</h3><div class="jobs">${jobs}</div>
        ${also.length ? `<p class="also">结合你的副天赋，也可以看看：${also.map(esc).join('、')}</p>` : ''}</div>
      <div class="p-sec"><h3>天赋使用说明</h3><ul>${m.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <p class="care">小提醒：${esc(m.care)}</p></div>
      <div class="p-end">${esc(C.ending)}</div>
      <div class="p-foot">${esc(r.meta.title)}<br>${esc(r.meta.footer)}</div>`;
  }

  // 保存长图
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
  $('saveBtn').addEventListener('click', async () => {
    const btn = $('saveBtn');
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = '正在生成长图…';
    try {
      const el = $('poster');
      const canvas = await html2canvas(el, {
        scale: Math.min(3, Math.max(2, window.devicePixelRatio || 1)),
        backgroundColor: '#ffffff',
        useCORS: true, logging: false,
        windowWidth: el.scrollWidth,
      });
      const url = canvas.toDataURL('image/png');
      const name = `${current.meta.title}-${current.main.name}.png`;
      if (isMobile || API.imageOverlayOnly) {
        $('imgOut').src = url;
        $('imgDownload').href = url;
        $('imgDownload').download = name;
        $('imgModal').hidden = false;
      } else {
        const blob = await new Promise(ok => canvas.toBlob(ok, 'image/png'));
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast('长图已保存到下载文件夹');
      }
    } catch (e) {
      toast('生成失败，请截图保存');
    } finally {
      btn.disabled = false; btn.textContent = '保存结果长图';
    }
  });
  $('imgClose').addEventListener('click', () => { $('imgModal').hidden = true; });

  // 复制链接
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).catch(() => legacyCopy(text));
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (!ok) throw new Error('copy failed');
  }
  $('copyBtn').addEventListener('click', async () => {
    const m = current.main;
    const link = API.shareUrl(current.id);
    const text = `我在「${current.meta.title}」测出来，主天赋是${m.name}「${m.title}」：${m.slogan} 你的天赋是什么？点开看看 ${link}`;
    try { await copyText(text); toast('链接已复制，快去分享吧'); }
    catch (e) { modal(`<h3>复制结果链接</h3><p>请长按下面的链接手动复制：</p><p class="copy-box">${esc(link)}</p>`); }
  });

  // 再测一次
  $('againBtn').addEventListener('click', () => {
    const code = store.get('code');
    if (code && store.get('remaining') > 0) return startWithCode(code);
    API.goHome();
    show('home');
    $('codeInput').value = '';
    $('codeError').textContent = code ? '这个密码的 3 次机会已用完，请输入新密码' : '';
  });
  $('tryBtn').addEventListener('click', () => { API.goHome(); show('home'); });

  // 好评有礼
  $('giftBtn').addEventListener('click', () => modal(GIFT_HTML));
  $('modalClose').addEventListener('click', () => { $('modal').hidden = true; });
  $('modal').addEventListener('click', e => { if (e.target === $('modal')) $('modal').hidden = true; });

  window.addEventListener('popstate', route);

  // ---------- 启动 ----------
  function route() {
    const id = API.resultIdFromUrl();
    if (id) return loadResult(id);
    const saved = store.get('quiz', sessionStorage);
    if (saved && saved.questions) { quiz = saved; quiz.locked = false; show('quiz'); renderQuestion(); return; }
    show('home');
  }

  API.meta().then(m => {
    document.querySelectorAll('[data-meta]').forEach(el => { if (m[el.dataset.meta]) el.textContent = m[el.dataset.meta]; });
  }).catch(() => {});
  const savedCode = store.get('code');
  if (savedCode) $('codeInput').value = savedCode;
  route();
})();
