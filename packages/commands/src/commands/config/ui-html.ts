// Self-contained single-page web UI for managing config profiles. Served as a
// string by `config ui`; no build step, no client dependencies. All fetches
// carry the session token from the page URL.
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>bailian-cli config</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, Segoe UI, Roboto, sans-serif; color: #1f2328; background: #f6f8fa; }
  #app { display: flex; min-height: 100vh; }
  #sidebar { width: 240px; background: #fff; border-right: 1px solid #d0d7de; padding: 16px; }
  #sidebar h1 { font-size: 15px; margin: 0 0 12px; }
  #profileList { list-style: none; margin: 0 0 12px; padding: 0; }
  #profileList li { padding: 8px 10px; border-radius: 6px; cursor: pointer; word-break: break-all; }
  #profileList li:hover { background: #f0f3f6; }
  #profileList li.active { background: #0969da; color: #fff; }
  main { flex: 1; padding: 24px 32px; max-width: 720px; }
  #editorHead { display: flex; align-items: center; justify-content: space-between; }
  h2 { font-size: 18px; margin: 0 0 4px; }
  .row { display: flex; flex-direction: column; margin: 12px 0; }
  .row label { font-weight: 600; margin-bottom: 4px; }
  .inputwrap { display: flex; gap: 6px; }
  input { flex: 1; padding: 7px 9px; border: 1px solid #d0d7de; border-radius: 6px; font: inherit; width: 100%; }
  button { padding: 7px 12px; border: 1px solid #d0d7de; border-radius: 6px; background: #f6f8fa; cursor: pointer; font: inherit; }
  button:hover { background: #eef1f4; }
  #saveBtn { background: #1f883d; color: #fff; border-color: #1f883d; }
  #saveBtn:hover { background: #1a7f37; }
  .danger { color: #cf222e; }
  .toggle { flex: none; }
  .actions { margin-top: 20px; display: flex; align-items: center; gap: 12px; }
  .muted { color: #656d76; font-size: 12px; word-break: break-all; }
  .err { color: #cf222e; font-size: 12px; }
</style>
</head>
<body>
<div id="app">
  <aside id="sidebar">
    <h1>Config Profiles</h1>
    <ul id="profileList"></ul>
    <button id="newBtn">+ New profile</button>
    <p id="cfgFile" class="muted"></p>
  </aside>
  <main id="editor">
    <div id="editorHead">
      <h2 id="currentName"></h2>
      <button id="deleteBtn" class="danger">Delete</button>
    </div>
    <form id="form" onsubmit="return false"></form>
    <div class="actions">
      <button id="saveBtn">Save</button>
      <span id="status" class="muted"></span>
    </div>
  </main>
</div>
<script>
  var token = new URLSearchParams(location.search).get('token') || '';
  var KEYS = [], SECRETS = [], DATA = { default: {}, named: {} }, CURRENT = '';

  function api(path, opts) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(path + sep + 'token=' + encodeURIComponent(token), opts || {});
  }

  function setStatus(msg, isErr) {
    var el = document.getElementById('status');
    el.textContent = msg || '';
    el.className = isErr ? 'err' : 'muted';
  }

  function profileData(name) {
    return name === '' ? DATA.default : (DATA.named[name] || {});
  }

  function load() {
    api('/api/config').then(function (r) { return r.json(); }).then(function (j) {
      KEYS = j.keys || [];
      SECRETS = j.secretKeys || [];
      DATA = { default: j.default || {}, named: j.named || {} };
      document.getElementById('cfgFile').textContent = j.configFile || '';
      CURRENT = (j.activeProfile && DATA.named[j.activeProfile]) ? j.activeProfile : '';
      renderProfiles();
      renderForm();
    }).catch(function (e) { setStatus('Load failed: ' + e, true); });
  }

  function renderProfiles() {
    var ul = document.getElementById('profileList');
    ul.innerHTML = '';
    var names = [''].concat(Object.keys(DATA.named));
    names.forEach(function (name) {
      var li = document.createElement('li');
      li.textContent = name === '' ? 'default' : name;
      if (name === CURRENT) li.className = 'active';
      li.onclick = function () { CURRENT = name; renderProfiles(); renderForm(); setStatus(''); };
      ul.appendChild(li);
    });
  }

  function renderForm() {
    var form = document.getElementById('form');
    form.innerHTML = '';
    document.getElementById('currentName').textContent = CURRENT === '' ? 'default (top-level)' : CURRENT;
    document.getElementById('deleteBtn').style.display = CURRENT === '' ? 'none' : '';
    var data = profileData(CURRENT);
    KEYS.forEach(function (key) {
      var row = document.createElement('div');
      row.className = 'row';
      var label = document.createElement('label');
      label.textContent = key;
      label.htmlFor = 'f_' + key;
      var input = document.createElement('input');
      input.id = 'f_' + key;
      input.name = key;
      var val = data[key];
      input.value = (val === undefined || val === null) ? '' : String(val);
      if (SECRETS.indexOf(key) >= 0) {
        input.type = 'password';
        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toggle';
        toggle.textContent = 'show';
        toggle.onclick = function () {
          if (input.type === 'password') { input.type = 'text'; toggle.textContent = 'hide'; }
          else { input.type = 'password'; toggle.textContent = 'show'; }
        };
        var wrap = document.createElement('div');
        wrap.className = 'inputwrap';
        wrap.appendChild(input);
        wrap.appendChild(toggle);
        row.appendChild(label);
        row.appendChild(wrap);
      } else {
        input.type = 'text';
        row.appendChild(label);
        row.appendChild(input);
      }
      form.appendChild(row);
    });
  }

  function collect() {
    var data = {};
    KEYS.forEach(function (key) {
      var el = document.getElementById('f_' + key);
      data[key] = el ? el.value : '';
    });
    return data;
  }

  function save() {
    var name = CURRENT;
    var body = JSON.stringify({ name: name, data: collect() });
    api('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) { setStatus('Save failed: ' + ((res.j && res.j.error) || 'error'), true); return; }
        var saved = res.j.saved || {};
        if (name === '') DATA.default = saved; else DATA.named[name] = saved;
        renderForm();
        setStatus('Saved.');
      })
      .catch(function (e) { setStatus('Save failed: ' + e, true); });
  }

  function newProfile() {
    var name = prompt('New profile name (letters, numbers, - or _):');
    if (!name) return;
    if (DATA.named[name] === undefined) DATA.named[name] = {};
    CURRENT = name;
    renderProfiles();
    renderForm();
    setStatus('Unsaved new profile. Fill fields and Save.');
  }

  function deleteProfile() {
    if (CURRENT === '') return;
    if (!confirm('Delete profile "' + CURRENT + '"?')) return;
    api('/api/profile?name=' + encodeURIComponent(CURRENT), { method: 'DELETE' })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); });
        return r.json();
      })
      .then(function () {
        delete DATA.named[CURRENT];
        CURRENT = '';
        renderProfiles();
        renderForm();
        setStatus('Deleted.');
      })
      .catch(function (e) { setStatus('Delete failed: ' + e, true); });
  }

  document.getElementById('saveBtn').onclick = save;
  document.getElementById('newBtn').onclick = newProfile;
  document.getElementById('deleteBtn').onclick = deleteProfile;
  load();
</script>
</body>
</html>
`;
