// 网页与 Supabase 的接口：所有读写都通过数据库函数（rpc）完成，函数名都以 tf_ 开头，和职场古人塑的数据分开。
window.API = (function () {
  const C = window.CONTENT;
  const { SUPABASE_URL, SUPABASE_KEY } = window.SITE_CONFIG;
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_KEY };
  if (/^eyJ/.test(SUPABASE_KEY)) headers.Authorization = 'Bearer ' + SUPABASE_KEY;

  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(SUPABASE_URL.replace(/\/$/, '') + '/rest/v1/rpc/' + fn, { method: 'POST', headers, body: JSON.stringify(args) });
    } catch (e) {
      throw new Error('网络开小差了，请检查网络后再试');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.message) || '服务器繁忙，请稍后再试');
    return data;
  }

  // 把数据库返回的分数整理成结果页要用的数据
  function buildResult(r) {
    const keys = Object.keys(C.talents);
    const top = Math.max(1, ...keys.map(k => r.scores[k] || 0));
    const order = [r.main, r.sub, ...keys.filter(k => k !== r.main && k !== r.sub).sort((a, b) => (r.scores[b] || 0) - (r.scores[a] || 0))];
    const ranking = order.map((k, i) => ({
      key: k, ...C.talents[k], score: r.scores[k] || 0,
      pct: Math.round(30 + 70 * (r.scores[k] || 0) / top),
      tag: i < 3 ? '闪光' : i >= order.length - 3 ? '待开发' : '',
    }));
    // 霍兰德代码：同一类型的天赋分数相加，取前三
    const h = {};
    keys.forEach((k, i) => { const l = C.talents[k].h; h[l] = (h[l] || 0) + (r.scores[k] || 0) * 100 - i; });
    const hcode = Object.keys(h).sort((a, b) => h[b] - h[a]).slice(0, 3);
    return { main: { key: r.main, ...C.talents[r.main] }, sub: { key: r.sub, ...C.talents[r.sub] }, ranking, hcode, at: r.at, total: r.total, same: r.same };
  }

  const meta = { title: C.title, subtitle: C.subtitle, intro: C.intro, footer: C.footer, total: C.questions.length };
  const base = () => location.origin + location.pathname;

  return {
    meta: () => Promise.resolve(meta),
    verify: code => rpc('tf_verify_code', { p_code: code }).then(r => ({ remaining: r.remaining, questions: C.questions })),
    submit: (code, answers) => rpc('tf_submit_test', { p_code: code, p_answers: answers }),
    result: id => rpc('tf_get_result', { p_id: id }).then(r => {
      if (!C.talents[r.main] || !C.talents[r.sub]) throw new Error('这个结果已经失效啦，重新测一次吧');
      return { id, ...buildResult(r), meta };
    }),
    shareUrl: id => base() + '?r=' + encodeURIComponent(id),
    resultIdFromUrl: () => new URLSearchParams(location.search).get('r'),
    goHome: () => history.pushState(null, '', base()),
    goResult: id => history.pushState(null, '', base() + '?r=' + encodeURIComponent(id)),
    admin: {
      create: (key, count, note) => rpc('tf_admin_create_codes', { p_key: key, p_count: +count, p_note: note || '' }),
      list: key => rpc('tf_admin_list_codes', { p_key: key }),
      reset: (key, code) => rpc('tf_admin_reset_code', { p_key: key, p_code: code }),
    },
  };
})();
