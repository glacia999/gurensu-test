(function () {
  // 好评有礼弹窗文案，改这里即可
  const GIFT_HTML = '<h3>好评有礼</h3><p>感谢你的测试！</p><p>在店铺给出<b>好评</b>后，请<b>联系客服</b>并发送<b>好评截图</b>，即可获得 <b class="red">1 元返现</b>。</p>';

  const $ = id => document.getElementById(id);
  const screens = ['home', 'quiz', 'loading', 'result'];
  const store = {
    get(k, s = localStorage) { try { return JSON.parse(s.getItem(k)); } catch (e) { return null; } },
    set(k, v, s = localStorage) { try { s.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k, s = localStorage) { try { s.removeItem(k); } catch (e) {} },
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let quiz = null; // { code, questions, answers, idx }
  let current = null; // 当前展示的结果
  let meta = {};

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
  function modal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }

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

  function renderQuestion() {
    const { questions, idx, answers } = quiz;
    const q = questions[idx];
    $('qNum').textContent = idx + 1;
    $('qTotal').textContent = questions.length;
    $('qBar').style.width = ((idx + (answers[idx] != null ? 1 : 0)) / questions.length * 100) + '%';
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
      setTimeout(() => { quiz.locked = false; quiz.idx++; saveQuiz(); renderQuestion(); }, 260);
    }
  });

  $('prevBtn').addEventListener('click', () => {
    if (quiz.idx > 0) { quiz.idx--; saveQuiz(); renderQuestion(); }
  });

  $('submitBtn').addEventListener('click', async () => {
    if (quiz.answers.length !== quiz.questions.length || quiz.answers.some(a => a == null)) {
      const miss = quiz.answers.findIndex(a => a == null);
      quiz.idx = miss < 0 ? quiz.answers.length : miss; renderQuestion();
      return toast('还有题目没有作答');
    }
    show('loading');
    const started = Date.now();
    try {
      const r = await API.submit(quiz.code, quiz.answers);
      store.set('remaining', r.remaining);
      const mine = store.get('mine') || [];
      mine.push(r.id); store.set('mine', mine.slice(-20));
      store.del('quiz', sessionStorage);
      quiz = null;
      await new Promise(ok => setTimeout(ok, Math.max(0, 1400 - (Date.now() - started))));
      API.goResult(r.id);
      loadResult(r.id);
    } catch (e) {
      show('quiz');
      toast(e.message);
    }
  });

  // ---------- 结果 ----------
  async function loadResult(id) {
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

  function renderResult(r) {
    const t = r.type;
    const mine = (store.get('mine') || []).includes(r.id);
    document.querySelectorAll('.owner-only').forEach(el => { el.hidden = !mine; });
    document.querySelectorAll('.visitor-only').forEach(el => { el.hidden = mine; });
    const remaining = store.get('remaining');
    $('remainHint').textContent = remaining != null ? `当前密码还可以测试 ${remaining} 次` : '';
    const date = new Date(r.at);
    const list = arr => '<ul>' + arr.map(s => `<li>${esc(s)}</li>`).join('') + '</ul>';
    const bars = r.ranking.slice(0, 8).map(x => `
      <div class="rank${x.key === t.key ? ' top' : ''}">
        <span class="rank-name">${esc(x.name)}</span>
        <span class="rank-bar"><i style="width:${x.pct}%;background:${x.color}"></i></span>
        <span class="rank-pct">${x.pct}%</span>
      </div>`).join('');
    const dims = r.dims && r.dims.length ? `<div class="p-sec"><h3>你的四维职场画像</h3>${r.dims.map(d => `
      <div class="dim">
        <div class="dim-top"><span class="dim-name">${esc(d.name)}</span><span class="dim-label">${esc(d.label)}</span></div>
        <div class="dim-bar">${d.parts.filter(p => p.pct > 0).map(p => `<i class="${p.level === d.level ? 'on' : ''}" style="flex:${p.pct}">${p.pct >= 15 ? esc(p.level) + ' ' + p.pct + '%' : ''}</i>`).join('')}</div>
      </div>`).join('')}</div>` : '';
    const rel = (label, p, why) => `
      <div class="rel">
        <div class="seal sm" style="background:${p.color}">${esc(p.seal)}</div>
        <div><div class="rel-label">${label}</div><div class="rel-name">${esc(p.name)}</div><p>${esc(why)}</p></div>
      </div>`;
    $('poster').style.setProperty('--c', t.color);
    $('poster').innerHTML = `
      <div class="p-head">
        <span>${esc(r.meta.title)}</span><span>${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}</span>
      </div>
      <div class="p-hero">
        <div class="p-you">你在古代上班是</div>
        <div class="seal huge">${esc(t.seal)}</div>
        <div class="p-name">${esc(t.name)}</div>
        <div class="p-era">${esc(t.era)}</div>
        <div class="p-title">${esc(t.title)}</div>
        <div class="p-quote">「${esc(t.quote)}」</div>
        <div class="p-tags">${t.tags.map(s => `<span>${esc(s)}</span>`).join('')}</div>
        ${r.total >= 100 ? `<div class="p-rarity">已有 ${r.total} 位打工人测过，<b>${(r.same / r.total * 100).toFixed(1)}%</b> 和你同款</div>` : ''}
      </div>
      <div class="p-sec"><div class="p-summary">“${esc(t.summary)}”</div><p>${esc(t.desc)}</p></div>
      ${t.bio ? `<div class="p-sec"><h3>人物小传 · ${esc(t.name)}</h3><p>${esc(t.bio)}</p></div>` : ''}
      <div class="p-sec"><h3>${esc(t.name)}的名场面</h3>${(t.stories || []).map(x => `<div class="story"><div class="story-t">${esc(x.t)}</div><p>${esc(x.d)}</p></div>`).join('')}</div>
      ${dims}
      <div class="p-sec"><h3>古人匹配度 · 前 8 名</h3>${bars}</div>
      <div class="p-sec two">
        <div><h3>你的职场优势</h3>${list(t.strengths)}</div>
        <div><h3>需要留意的坑</h3>${list(t.pitfalls)}</div>
      </div>
      <div class="p-sec"><h3>职场关系</h3>${rel('最佳搭档', t.partner, t.partnerWhy)}${rel('职场天敌', t.enemy, t.enemyWhy)}</div>
      <div class="p-sec"><h3>${esc(t.name)}给你的职业建议</h3>${list(t.advice)}<p class="p-jobs"><b>适合的方向：</b>${esc(t.jobs)}</p></div>
      <div class="p-foot">${esc(r.meta.title)} · ${esc(r.meta.subtitle)}<br>${esc(r.meta.footer)}</div>`;
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
        backgroundColor: getComputedStyle(el).backgroundColor,
        useCORS: true, logging: false,
        windowWidth: el.scrollWidth,
      });
      const url = canvas.toDataURL('image/png');
      const name = `${current.meta.title}-${current.type.name}.png`;
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
    const t = current.type;
    const link = API.shareUrl(current.id);
    const text = `我在「${current.meta.title}」测出来是${t.name}：${t.title}。你是谁？点开看看 ${link}`;
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
    if (saved && saved.questions) { quiz = saved; show('quiz'); renderQuestion(); return; }
    show('home');
  }

  API.meta().then(m => {
    meta = m;
    document.querySelectorAll('[data-meta]').forEach(el => { if (m[el.dataset.meta]) el.textContent = m[el.dataset.meta]; });
    if (m.title) document.title = `${m.title} · ${m.subtitle}`;
  }).catch(() => {});
  const savedCode = store.get('code');
  if (savedCode) $('codeInput').value = savedCode;
  route();
})();
