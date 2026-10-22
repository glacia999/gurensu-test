// 网页与 Supabase 的接口：所有读写都通过数据库函数（rpc）完成。
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

  const meta = {
    title: C.title, subtitle: C.subtitle, intro: C.intro, footer: C.footer, total: C.questions.length,
    cast: ['zgl', 'lb', 'wuzetian', 'ss', 'cc', 'wangyangming', 'lqz', 'xiangyu'].filter(k => C.types[k]).map(k => C.types[k].name).join(' · ') + ` 等 ${Object.keys(C.types).length} 位古人`,
  };
  const base = () => location.origin + location.pathname;

  return {
    meta: () => Promise.resolve(meta),
    verify: code => rpc('verify_code', { p_code: code }).then(r => ({ remaining: r.remaining, questions: C.questions })),
    submit: (code, answers) => rpc('submit_test', { p_code: code, p_answers: answers }),
    result: id => rpc('get_result', { p_id: id }).then(r => {
      if (!C.types[r.type]) throw new Error('这个结果来自旧版测评，已经失效啦，重新测一次吧');
      return { id, ...buildResult(C, r), meta };
    }),
    shareUrl: id => base() + '?r=' + encodeURIComponent(id),
    resultIdFromUrl: () => new URLSearchParams(location.search).get('r'),
    goHome: () => history.pushState(null, '', base()),
    goResult: id => history.pushState(null, '', base() + '?r=' + encodeURIComponent(id)),
    admin: {
      create: (key, count, note) => rpc('admin_create_codes', { p_key: key, p_count: +count, p_note: note || '' }),
      list: key => rpc('admin_list_codes', { p_key: key }),
      reset: (key, code) => rpc('admin_reset_code', { p_key: key, p_code: code }),
    },
  };
})();
