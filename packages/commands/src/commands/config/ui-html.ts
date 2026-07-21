// Self-contained single-page web UI for managing config profiles and viewing
// locally installed agent tooling (skills, MCP servers, coding agents). Served
// as a string by `config ui`; no build step, no client dependencies. All
// fetches carry the session token from the page URL. Visual language mirrors
// the bailian landing design system (Inter / Geist Mono, gradient accents,
// lift-on-hover cards).
export const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Config - 阿里云百炼CLI</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --font: "Inter", "PingFang SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    --mono: "Geist Mono", "SF Mono", "Roboto Mono", monospace;
    --ink: #111111; --muted: #696969; --muted-2: #888888;
    --line: #dddee3; --line-soft: #ededf1; --surface: #ffffff;
    --surface-soft: #f8fafb; --chip: #eff3fa;
    --blue: #4b73ff; --violet: #653aff; --cyan: #49dad1;
    --grad-text: linear-gradient(106deg, #4a7dff 10%, #41ffd3 97%);
    --grad-dot: linear-gradient(135deg, #03ffd9 0%, #0054ff 90%);
    --ok: #1f883d; --ok-soft: #eaf6ee; --warn: #b25c00; --danger: #cf222e;
    --r-card: 18px; --r-btn: 10px; --r-pill: 999px;
    --shadow-card: 0 8px 30px rgba(17,17,17,.06);
    --shadow-lift: 0 16px 48px rgba(40,52,90,.12);
    --t-lift: .3s cubic-bezier(.2,.7,.2,1); --t-fast: .15s ease;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: var(--font); font-size: 14px; line-height: 1.5;
    color: var(--ink); background: #fafafc; -webkit-font-smoothing: antialiased; }
  #app { display: flex; min-height: 100vh; }

  /* Sidebar */
  #sidebar { width: 236px; flex: none; background: var(--surface); border-right: 1px solid var(--line-soft);
    padding: 22px 16px; display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh; }
  .nav-brand { display: flex; align-items: center; gap: 10px; padding: 0 8px 4px; text-decoration: none; }
  .nav-logo { height: 24px; width: auto; display: block; }
  .nav-wordmark { font-weight: 400; font-size: 17px; line-height: 1; letter-spacing: -.3px; color: #1a1a19; white-space: nowrap; }
  .nav { display: flex; flex-direction: column; gap: 2px; margin-top: 22px; }
  .nav-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left;
    padding: 9px 12px; border: 0; background: none; border-radius: var(--r-btn); cursor: pointer;
    font: inherit; font-weight: 500; color: var(--muted); transition: background var(--t-fast), color var(--t-fast); }
  .nav-item:hover { background: rgba(0,0,0,.04); color: var(--ink); }
  .nav-item.is-active { background: var(--chip); color: var(--ink); }
  .nav-item .badge { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--muted-2);
    background: var(--surface-soft); border: 1px solid var(--line-soft); border-radius: var(--r-pill); padding: 1px 7px; min-width: 20px; text-align: center; }
  .nav-item.is-active .badge { color: var(--blue); border-color: transparent; background: #fff; }
  .cfg-path { margin-top: auto; padding: 12px 8px 0; font-family: var(--mono); font-size: 11px;
    color: var(--muted-2); word-break: break-all; line-height: 1.5; }

  /* Main */
  main { flex: 1; padding: 34px 40px 60px; max-width: 1080px; }
  .view { display: none; animation: rise .34s cubic-bezier(.2,.7,.2,1); }
  .view.is-active { display: block; }
  @keyframes rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  .view-head { position: sticky; top: 0; z-index: 20; margin: 0 0 22px; padding: 6px 0 14px;
    background: #fafafc; border-bottom: 1px solid var(--line-soft); }
  .view-title { margin: 0; font-weight: 600; font-size: 26px; letter-spacing: -.8px; }
  .view-title .grad { background: var(--grad-text); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .view-sub { margin: 8px 0 0; font-size: 14px; color: var(--muted); max-width: 620px; }

  /* Buttons */
  .btn-soft, .btn-primary, .btn-danger { padding: 8px 14px; border-radius: var(--r-btn); font: inherit;
    font-weight: 500; cursor: pointer; border: 1px solid var(--line); background: var(--surface); transition: background var(--t-fast), box-shadow var(--t-fast), transform var(--t-fast); }
  .btn-soft:hover { background: var(--surface-soft); }
  .btn-primary { background: var(--ink); color: #fff; border-color: var(--ink); }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(0,0,0,.18); }
  .btn-danger { color: var(--danger); border-color: transparent; background: transparent; padding: 8px 10px; }
  .btn-danger:hover { background: #fdeef0; }
  button:disabled { opacity: .5; cursor: default; box-shadow: none; transform: none; }

  /* Profiles */
  .profile-tile.selected { border-color: #dfe6f5; background: var(--chip); }
  .profile-tile .tile-name { flex: 1; }
  .profile-tile .star { color: var(--blue); font-size: 12px; }
  .profile-tile .chev { color: var(--muted-2); font-size: 15px; }
  .tile-add { align-items: center; justify-content: center; border-style: dashed; color: var(--muted);
    font-weight: 600; cursor: pointer; text-align: center; }
  .tile-add:hover { border-color: var(--blue); color: var(--blue); transform: translateY(-4px);
    box-shadow: var(--shadow-lift); }
  .card { background: var(--surface); border: 1px solid var(--line-soft); border-radius: var(--r-card);
    box-shadow: var(--shadow-card); padding: 22px 24px; }
  .editor-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
  .editor-head h3 { margin: 0; font-size: 17px; font-weight: 600; letter-spacing: -.3px; }
  .row { display: flex; flex-direction: column; margin: 14px 0; }
    .model-cat { margin-top: 8px; }
    .model-cat-hint { font-size: 11px; color: var(--muted); margin-bottom: 6px; }
    .model-chips { display: flex; flex-wrap: wrap; gap: 7px; }
    .mchip { font-family: var(--mono); font-size: 11.5px; color: #33383f; background: var(--surface-soft);
      border: 1px solid var(--line); border-radius: var(--r-pill); padding: 4px 11px; cursor: pointer;
      transition: background .12s, border-color .12s, color .12s; white-space: nowrap; }
    .mchip:hover { border-color: var(--blue); color: var(--blue); }
    .mchip.active { background: var(--blue); border-color: var(--blue); color: #fff; }
  .row label { font-weight: 500; margin-bottom: 5px; font-size: 13px; color: #33383f; font-family: var(--mono); }
  .inputwrap { display: flex; gap: 6px; }
  input { flex: 1; width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--r-btn);
    font: inherit; background: var(--surface-soft); transition: border-color var(--t-fast), background var(--t-fast); }
  input:focus { outline: none; border-color: var(--blue); background: #fff; }
  select.select { width: 100%; padding: 9px 11px; border: 1px solid var(--line); border-radius: var(--r-btn);
    font: inherit; background: var(--surface-soft); cursor: pointer; }
  select.select:focus { outline: none; border-color: var(--blue); background: #fff; }
  .toggle { flex: none; padding: 0 12px; border: 1px solid var(--line); border-radius: var(--r-btn);
    background: var(--surface); cursor: pointer; font: inherit; font-size: 12px; color: var(--muted); }
  .toggle:hover { background: var(--surface-soft); }
  .actions { margin-top: 22px; display: flex; align-items: center; gap: 12px; }
  .muted { color: var(--muted); font-size: 12px; word-break: break-all; }
  .err { color: var(--danger); font-size: 12px; }

  /* Card grids (skills / mcp / agents) */
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 14px; }
  .tile { position: relative; display: flex; flex-direction: column; background: var(--surface);
    border: 1px solid var(--line-soft); border-radius: var(--r-card); padding: 15px 17px; min-height: 96px;
    transition: transform var(--t-lift), box-shadow var(--t-lift), border-color var(--t-lift); }
  .tile:hover { transform: translateY(-4px); box-shadow: var(--shadow-lift); border-color: transparent; }
  .tile-top { display: flex; align-items: center; gap: 10px; }
  .tile-name { font-weight: 600; font-size: 15px; letter-spacing: -.3px; word-break: break-word; }
  .tile-desc { margin: 9px 0 0; font-size: 12.5px; line-height: 1.55; color: var(--muted);
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .tile-foot { margin-top: auto; padding-top: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-family: var(--mono); font-size: 11px; color: var(--muted-2); }
  .tile-path { font-family: var(--mono); font-size: 11px; color: var(--muted-2); word-break: break-all;
    margin-top: 9px; line-height: 1.5; }
  .tile-actions { margin-top: 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .btn-launch { flex: none; padding: 7px 14px; font-size: 12.5px; font-weight: 600; border-radius: var(--r-btn);
    border: 1px solid var(--line); background: var(--surface-soft); cursor: pointer; color: var(--ink);
    transition: border-color var(--t-fast), color var(--t-fast), background var(--t-fast); }
  .btn-launch:hover { border-color: var(--blue); color: var(--blue); background: #fff; }
  .btn-launch:disabled { opacity: .5; cursor: not-allowed; }
  .btn-launch:disabled:hover { border-color: var(--line); color: var(--ink); background: var(--surface-soft); }
  .launch-status { font-size: 11.5px; color: var(--muted); }
  .launch-status.ok { color: #16a34a; }
  .launch-status.err { color: var(--danger); }
  .chip { display: inline-block; font-family: var(--mono); font-size: 11px; color: #242933;
    background: var(--chip); border-radius: 6px; padding: 3px 8px; }
  .chip.blue { color: var(--blue); }
  .pill { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 600; border-radius: var(--r-pill); padding: 3px 10px; white-space: nowrap; }
  .pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .pill.ok { color: var(--ok); background: var(--ok-soft); }
  .pill.neutral { color: var(--blue); background: var(--chip); }
  .pill.off { color: var(--muted-2); background: var(--surface-soft); }
  .ver { margin-left: auto; flex: none; font-family: var(--mono); font-size: 11px; color: var(--violet);
    background: #f1edff; border-radius: var(--r-pill); padding: 2px 9px; }
  .origin { flex: none; font-family: var(--mono); font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: .4px; padding: 2px 8px; border-radius: var(--r-pill); }
  .origin.local { color: var(--muted); background: var(--surface-soft); border: 1px solid var(--line-soft); }
  .origin.remote { color: #fff; background: var(--blue); border: 1px solid transparent; }
  .empty { padding: 44px 24px; text-align: center; color: var(--muted); border: 1px dashed var(--line);
    border-radius: var(--r-card); background: var(--surface-soft); }
  .empty code { font-family: var(--mono); background: var(--chip); padding: 2px 7px; border-radius: 6px; color: #242933; }
  .loading { color: var(--muted); font-size: 13px; padding: 8px 2px; }

  /* Drawer (profile editor) */
  .drawer-overlay { position: fixed; inset: 0; z-index: 50; background: rgba(17,17,17,.28);
    display: flex; justify-content: flex-end; animation: fade .2s ease; }
  .drawer-overlay[hidden] { display: none; }
  @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
  .drawer-panel { width: min(560px, 94vw); height: 100%; background: var(--surface); display: flex;
    flex-direction: column; box-shadow: -20px 0 60px rgba(20,30,60,.18); animation: slidein .28s cubic-bezier(.2,.7,.2,1); }
  @keyframes slidein { from { transform: translateX(36px); opacity: .5; } to { transform: none; opacity: 1; } }
  .drawer-head { flex: none; display: flex; align-items: center; justify-content: space-between;
    padding: 20px 24px; border-bottom: 1px solid var(--line-soft); }
  .drawer-head h3 { margin: 0; font-size: 18px; font-weight: 600; letter-spacing: -.3px; }
  .drawer-head-actions { display: flex; align-items: center; gap: 8px; }
  .drawer-close { border: 0; background: none; font-size: 24px; line-height: 1; cursor: pointer;
    color: var(--muted); padding: 0 4px; border-radius: var(--r-btn); }
  .drawer-close:hover { color: var(--ink); background: var(--surface-soft); }
  .drawer-body { flex: 1; overflow-y: auto; padding: 4px 24px 16px; }
  .drawer-foot { flex: none; margin-top: 0; padding: 16px 24px; border-top: 1px solid var(--line-soft);
    background: var(--surface); }
  .tile.clickable { cursor: pointer; }
  /* Detail drawer sections */
  .detail-sec { margin: 16px 0 0; }
  .detail-label { font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .5px;
    color: var(--muted-2); margin-bottom: 7px; }
  .detail-desc { font-size: 14px; line-height: 1.7; color: var(--ink); }
  .detail-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .detail-path { font-family: var(--mono); font-size: 12px; color: var(--muted); word-break: break-all; line-height: 1.6; }
  .detail-code { font-family: var(--mono); font-size: 12px; line-height: 1.6; background: var(--surface-soft);
    border: 1px solid var(--line-soft); border-radius: var(--r-btn); padding: 14px 16px; white-space: pre-wrap;
    word-break: break-word; color: #242933; margin: 0; }
  .detail-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
  .detail-preview { width: 100%; margin-top: 4px; border-radius: var(--r-card); overflow: hidden;
    background: var(--surface-soft); border: 1px solid var(--line-soft); display: flex;
    align-items: center; justify-content: center; }
  .detail-preview img, .detail-preview video, .detail-preview audio { width: 100%; display: block; }
  .detail-preview .asset-icon-lg { font-size: 64px; padding: 44px 0; }
  /* Rendered Markdown (SKILL.md) */
  .md-body { font-size: 13.5px; line-height: 1.7; color: var(--ink); word-break: break-word; }
  .md-body > :first-child { margin-top: 0; }
  .md-body h1, .md-body h2, .md-body h3, .md-body h4, .md-body h5, .md-body h6 {
    font-weight: 600; line-height: 1.3; margin: 18px 0 8px; letter-spacing: -.2px; }
  .md-body h1 { font-size: 20px; } .md-body h2 { font-size: 17px; }
  .md-body h3 { font-size: 15px; } .md-body h4 { font-size: 14px; }
  .md-body p { margin: 10px 0; }
  .md-body ul, .md-body ol { margin: 10px 0; padding-left: 22px; }
  .md-body li { margin: 4px 0; }
  .md-body code { font-family: var(--mono); font-size: 12px; background: var(--chip); padding: 2px 6px;
    border-radius: 5px; color: #242933; }
  .md-body pre.md-pre { background: var(--surface-soft); border: 1px solid var(--line-soft);
    border-radius: var(--r-btn); padding: 14px 16px; overflow: auto; margin: 12px 0; }
  .md-body pre.md-pre code { background: none; padding: 0; font-size: 12px; line-height: 1.6;
    color: #242933; white-space: pre; }
  .md-body blockquote { margin: 12px 0; padding: 6px 14px; border-left: 3px solid var(--line);
    color: var(--muted); background: var(--surface-soft); border-radius: 0 8px 8px 0; }
  .md-body a { color: var(--blue); text-decoration: none; }
  .md-body a:hover { text-decoration: underline; }
  .md-body hr { border: 0; border-top: 1px solid var(--line-soft); margin: 18px 0; }

  /* Modal (new profile) */
  .modal-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(17,17,17,.32);
    display: flex; align-items: center; justify-content: center; padding: 24px; animation: fade .18s ease; }
  .modal-overlay[hidden] { display: none; }
  .modal-card { width: min(420px, 100%); background: var(--surface); border-radius: var(--r-card);
    box-shadow: 0 24px 70px rgba(20,30,60,.28); padding: 26px 26px 20px;
    animation: pop .22s cubic-bezier(.2,.7,.2,1); }
  @keyframes pop { from { transform: translateY(10px) scale(.98); opacity: .5; } to { transform: none; opacity: 1; } }
  .modal-card h3 { margin: 0; font-size: 19px; font-weight: 600; letter-spacing: -.4px; }
  .modal-sub { margin: 8px 0 18px; font-size: 13px; color: var(--muted); line-height: 1.5; }
  .modal-label { display: block; font-family: var(--mono); font-size: 11px; text-transform: uppercase;
    letter-spacing: .5px; color: var(--muted-2); margin-bottom: 7px; }
  .modal-err { min-height: 16px; margin-top: 8px; font-size: 12px; color: var(--danger); }
  .modal-foot { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }

  /* Assets */
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .filter { padding: 6px 14px; border: 1px solid var(--line); border-radius: var(--r-pill); background: var(--surface);
    font: inherit; font-size: 13px; font-weight: 500; color: var(--muted); cursor: pointer; transition: all var(--t-fast); }
  .filter:hover { background: var(--surface-soft); color: var(--ink); }
  .filter.is-active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .filter .n { margin-left: 6px; font-family: var(--mono); font-size: 11px; opacity: .7; }
  .filter.sort-toggle { margin-left: auto; font-family: var(--mono); font-size: 12px; }
  .asset-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; }
  .asset { position: relative; display: flex; flex-direction: column; background: var(--surface);
    border: 1px solid var(--line-soft); border-radius: var(--r-card); overflow: hidden;
    transition: transform var(--t-lift), box-shadow var(--t-lift), border-color var(--t-lift); }
  .asset:hover { transform: translateY(-5px); box-shadow: var(--shadow-lift); border-color: transparent; }
  .asset-media { aspect-ratio: 4 / 3; background: var(--surface-soft); display: flex; align-items: center;
    justify-content: center; overflow: hidden; border-bottom: 1px solid var(--line-soft); }
  .asset-media img, .asset-media video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .asset-media audio { width: 90%; }
  .asset-icon { font-size: 34px; color: var(--muted-2); }
  .asset-cat { position: absolute; top: 10px; left: 10px; font-family: var(--mono); font-size: 10px;
    font-weight: 600; text-transform: uppercase; letter-spacing: .4px; color: #fff; background: rgba(17,17,17,.66);
    border-radius: var(--r-pill); padding: 3px 9px; backdrop-filter: blur(4px); }
  .asset-del { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; border: 0; border-radius: 50%;
    background: rgba(17,17,17,.6); color: #fff; cursor: pointer; font-size: 15px; line-height: 1; opacity: 0;
    transition: opacity var(--t-fast), background var(--t-fast); }
  .asset:hover .asset-del { opacity: 1; }
  .asset-del:hover { background: var(--danger); }
  .asset-body { padding: 12px 14px; }
  .asset-name { font-size: 13px; font-weight: 500; word-break: break-all; line-height: 1.4; }
  .asset-name.link { cursor: pointer; }
  .asset-name.link:hover { color: var(--blue); text-decoration: underline; }
  .asset-meta { margin-top: 7px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    font-family: var(--mono); font-size: 11px; color: var(--muted-2); }
</style>
</head>
<body>
<div id="app">
  <aside id="sidebar">
    <a class="nav-brand" href="#" aria-label="阿里云百炼 CLI 首页">
      <img class="nav-logo" src="https://img.alicdn.com/imgextra/i1/O1CN01IU2US71Ciicsi3Br3_!!6000000000115-55-tps-357-76.svg" alt="阿里云百炼">
      <span class="nav-wordmark">CLI</span>
    </a>
    <nav class="nav">
      <button class="nav-item is-active" data-view="profiles">Profiles<span class="badge" id="cnt-profiles"></span></button>
      <button class="nav-item" data-view="skills">Skills<span class="badge" id="cnt-skills"></span></button>
      <button class="nav-item" data-view="mcp">MCP Servers<span class="badge" id="cnt-mcp"></span></button>
      <button class="nav-item" data-view="agents">Agents<span class="badge" id="cnt-agents"></span></button>
      <button class="nav-item" data-view="assets">Assets<span class="badge" id="cnt-assets"></span></button>
    </nav>
    <p id="cfgFile" class="cfg-path"></p>
  </aside>
  <main>
    <section id="view-profiles" class="view is-active">
      <div class="view-head">
        <h2 class="view-title">Config <span class="grad">Profiles</span></h2>
        <p class="view-sub">Credentials and default models. The active profile (marked with a star) is used by every bl command. Click a profile to edit its settings.</p>
      </div>
      <div id="profileList" class="grid"></div>
    </section>

    <section id="view-skills" class="view">
      <div class="view-head">
        <h2 class="view-title">Installed <span class="grad">Skills</span></h2>
        <p class="view-sub">Agent skills discovered across every local agent module (~/.agents/skills plus each agent's skills folder). Installed via <code style="font-family:var(--mono)">npx skills add</code>.</p>
      </div>
      <div id="skillsBody"><div class="loading">Loading…</div></div>
    </section>

    <section id="view-mcp" class="view">
      <div class="view-head">
        <h2 class="view-title">MCP <span class="grad">Servers</span></h2>
        <p class="view-sub">Model Context Protocol servers declared in your local coding-agent configs.</p>
      </div>
      <div id="mcpBody"><div class="loading">Loading…</div></div>
    </section>

    <section id="view-agents" class="view">
      <div class="view-head">
        <h2 class="view-title">Coding <span class="grad">Agents</span></h2>
        <p class="view-sub">Frameworks bl can configure. "Connected" means the bailian-cli provider is wired into that agent.</p>
      </div>
      <div id="agentsBody"><div class="loading">Loading…</div></div>
    </section>

    <section id="view-assets" class="view">
      <div class="view-head">
        <h2 class="view-title">Generated <span class="grad">Assets</span></h2>
        <p class="view-sub">Media that bl writes into the output directory (images, videos, speech, omni), tagged by category and generation time. <span id="assetsBase" class="muted"></span></p>
      </div>
      <div id="assetFilters" class="filters"></div>
      <div id="assetsBody"><div class="loading">Loading…</div></div>
    </section>
  </main>
  <div id="drawer" class="drawer-overlay" hidden>
    <aside class="drawer-panel" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3 id="currentName"></h3>
        <div class="drawer-head-actions">
          <button id="deleteBtn" class="btn-danger">Delete</button>
          <button id="closeBtn" class="drawer-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="drawer-body">
        <form id="form" onsubmit="return false"></form>
      </div>
      <div class="drawer-foot actions">
        <button id="saveBtn" class="btn-primary">Save</button>
        <button id="useBtn" class="btn-soft">Save &amp; Activate</button>
        <span id="status" class="muted"></span>
      </div>
    </aside>
  </div>
  <div id="infoDrawer" class="drawer-overlay" hidden>
    <aside class="drawer-panel" role="dialog" aria-modal="true">
      <div class="drawer-head">
        <h3 id="infoTitle"></h3>
        <div class="drawer-head-actions">
          <button id="infoClose" class="drawer-close" aria-label="Close">×</button>
        </div>
      </div>
      <div class="drawer-body" id="infoBody"></div>
    </aside>
  </div>
  <div id="modal" class="modal-overlay" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h3 id="modalTitle">New profile</h3>
      <p class="modal-sub">Create a named profile with its own credentials and default models.</p>
      <label class="modal-label" for="modalInput">Profile name</label>
      <input id="modalInput" type="text" placeholder="e.g. work, intl, test" autocomplete="off" spellcheck="false">
      <div id="modalErr" class="modal-err"></div>
      <div class="modal-foot">
        <button id="modalCancel" class="btn-soft">Cancel</button>
        <button id="modalCreate" class="btn-primary">Create</button>
      </div>
    </div>
  </div>
</div>
<script>
  var token = new URLSearchParams(location.search).get('token') || '';
  var KEYS = [], SECRETS = [], ENUMS = {}, BOOLEANS = [], FIELD_DEFAULTS = {}, MODEL_CATALOG = {}, DATA = { default: {}, named: {} }, CURRENT = '', ACTIVE = 'default';
  var loaded = { skills: false, mcp: false, agents: false, assets: false };
  var ASSETS = [], ASSET_FILTER = 'all', ASSET_SORT = 'new';

  function api(path, opts) {
    var sep = path.indexOf('?') >= 0 ? '&' : '?';
    return fetch(path + sep + 'token=' + encodeURIComponent(token), opts || {});
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function originBadge(origin) {
    var o = origin === 'remote' ? 'remote' : 'local';
    return el('span', 'origin ' + o, o === 'remote' ? 'Remote' : 'Local');
  }
  function setStatus(msg, isErr) {
    var s = document.getElementById('status');
    s.textContent = msg || '';
    s.className = isErr ? 'err' : 'muted';
  }
  function setCount(view, n) {
    var b = document.getElementById('cnt-' + view);
    if (b) b.textContent = n === undefined || n === null ? '' : String(n);
  }

  /* ---------- view switching ---------- */
  function showView(name) {
    var items = document.querySelectorAll('.nav-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-active', items[i].getAttribute('data-view') === name);
    }
    var views = document.querySelectorAll('.view');
    for (var j = 0; j < views.length; j++) {
      views[j].classList.toggle('is-active', views[j].id === 'view-' + name);
    }
    if (name === 'skills' && !loaded.skills) loadSkills();
    if (name === 'mcp' && !loaded.mcp) loadMcp();
    if (name === 'agents' && !loaded.agents) loadAgents();
    if (name === 'assets' && !loaded.assets) loadAssets();
  }

  /* ---------- profiles ---------- */
  function profileData(name) { return name === '' ? DATA.default : (DATA.named[name] || {}); }

  function loadConfig() {
    api('/api/config').then(function (r) { return r.json(); }).then(function (j) {
      KEYS = j.keys || []; SECRETS = j.secretKeys || [];
      ENUMS = j.enums || {}; BOOLEANS = j.booleanKeys || [];
      FIELD_DEFAULTS = j.fieldDefaults || {};
      MODEL_CATALOG = j.modelCatalog || {};
      DATA = { default: j.default || {}, named: j.named || {} };
      ACTIVE = j.activeProfile || 'default';
      document.getElementById('cfgFile').textContent = j.configFile || '';
      CURRENT = ACTIVE === 'default' ? '' : ACTIVE;
      setCount('profiles', 1 + Object.keys(DATA.named).length);
      renderProfiles(); renderForm();
    }).catch(function (e) { setStatus('Load failed: ' + e, true); });
  }

  function renderProfiles() {
    var grid = document.getElementById('profileList');
    grid.innerHTML = '';
    var names = [''].concat(Object.keys(DATA.named));
    names.forEach(function (name) {
      var displayName = name === '' ? 'default' : name;
      var t = el('div', 'tile clickable profile-tile' + (name === CURRENT ? ' selected' : ''));
      var top = el('div', 'tile-top');
      top.appendChild(el('span', 'tile-name', displayName));
      if (displayName === ACTIVE) top.appendChild(el('span', 'star', '★'));
      top.appendChild(el('span', 'chev', '›'));
      t.appendChild(top);
      t.onclick = function () { CURRENT = name; renderProfiles(); renderForm(); setStatus(''); openDrawer(); };
      grid.appendChild(t);
    });
    var add = el('div', 'tile tile-add', '+ New profile');
    add.onclick = newProfile;
    grid.appendChild(add);
  }

  function openDrawer() {
    var d = document.getElementById('drawer');
    d.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    document.getElementById('drawer').hidden = true;
    document.body.style.overflow = '';
    setStatus('');
  }

  /* ---------- read-only detail drawer (skills, ...) ---------- */
  function openInfoDrawer() {
    document.getElementById('infoDrawer').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeInfoDrawer() {
    document.getElementById('infoDrawer').hidden = true;
    document.body.style.overflow = '';
  }
  function detailSection(label, node) {
    var sec = el('div', 'detail-sec');
    sec.appendChild(el('div', 'detail-label', label));
    sec.appendChild(node);
    return sec;
  }

  /* Minimal, XSS-safe Markdown renderer (escape first, then wrap in tags). */
  var BT = String.fromCharCode(96);
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function mdSpans(s) {
    s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    s = s.replace(/\\*([^*]+)\\*/g, '<em>$1</em>');
    s = s.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g, function (m, txt, url) {
      var safe = /^(https?:|mailto:|#|\\/|\\.)/i.test(url) ? url : '#';
      return '<a href="' + safe + '" target="_blank" rel="noopener">' + txt + '</a>';
    });
    return s;
  }
  function mdInline(text) {
    var segs = text.split(BT);
    var out = '';
    for (var k = 0; k < segs.length; k++) {
      if (k % 2 === 1) out += '<code>' + segs[k] + '</code>';
      else out += mdSpans(segs[k]);
    }
    return out;
  }
  function renderMarkdown(md) {
    md = md.replace(/^---\\n[\\s\\S]*?\\n---\\n?/, '');
    var lines = md.split(/\\r?\\n/);
    var html = '';
    var i = 0;
    var listType = null;
    function closeList() { if (listType) { html += '</' + listType + '>'; listType = null; } }
    while (i < lines.length) {
      var line = lines[i];
      if (line.indexOf(BT + BT + BT) === 0) {
        closeList();
        var buf = [];
        i++;
        while (i < lines.length && lines[i].indexOf(BT + BT + BT) !== 0) { buf.push(lines[i]); i++; }
        i++;
        html += '<pre class="md-pre"><code>' + escapeHtml(buf.join('\\n')) + '</code></pre>';
        continue;
      }
      var h = line.match(/^(#{1,6})\\s+(.*)$/);
      if (h) { closeList(); var lvl = h[1].length; html += '<h' + lvl + '>' + mdInline(escapeHtml(h[2])) + '</h' + lvl + '>'; i++; continue; }
      if (/^\\s*(-{3,}|\\*{3,}|_{3,})\\s*$/.test(line)) { closeList(); html += '<hr>'; i++; continue; }
      if (/^>\\s?/.test(line)) {
        closeList();
        var q = [];
        while (i < lines.length && /^>\\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\\s?/, '')); i++; }
        html += '<blockquote>' + mdInline(escapeHtml(q.join(' '))) + '</blockquote>';
        continue;
      }
      var ul = line.match(/^\\s*[-*+]\\s+(.*)$/);
      if (ul) {
        if (listType !== 'ul') { closeList(); html += '<ul>'; listType = 'ul'; }
        html += '<li>' + mdInline(escapeHtml(ul[1])) + '</li>';
        i++; continue;
      }
      var ol = line.match(/^\\s*\\d+\\.\\s+(.*)$/);
      if (ol) {
        if (listType !== 'ol') { closeList(); html += '<ol>'; listType = 'ol'; }
        html += '<li>' + mdInline(escapeHtml(ol[1])) + '</li>';
        i++; continue;
      }
      if (/^\\s*$/.test(line)) { closeList(); i++; continue; }
      closeList();
      var para = [line];
      i++;
      while (i < lines.length && !/^\\s*$/.test(lines[i]) && lines[i].indexOf(BT + BT + BT) !== 0 && !/^(#{1,6}\\s|>|\\s*[-*+]\\s|\\s*\\d+\\.\\s)/.test(lines[i]) && !/^\\s*(-{3,}|\\*{3,}|_{3,})\\s*$/.test(lines[i])) {
        para.push(lines[i]); i++;
      }
      html += '<p>' + mdInline(escapeHtml(para.join(' '))) + '</p>';
    }
    closeList();
    return html;
  }
  function renderMarkdownInto(container, md) {
    if (!md) { container.appendChild(el('div', 'loading', '(empty)')); return; }
    var wrap = el('div', 'md-body');
    wrap.innerHTML = renderMarkdown(md);
    container.appendChild(wrap);
  }

  function openSkillDetail(s) {
    var title = document.getElementById('infoTitle');
    title.textContent = '';
    title.appendChild(el('span', '', s.name));
    if (s.version) title.appendChild(el('span', 'ver', 'v' + s.version));
    title.appendChild(originBadge(s.origin));
    var body = document.getElementById('infoBody');
    body.innerHTML = '';
    if (s.description) body.appendChild(detailSection('Description', el('div', 'detail-desc', s.description)));
    var chips = el('div', 'detail-chips');
    (s.sources || []).forEach(function (src) { chips.appendChild(el('span', 'chip blue', src)); });
    chips.appendChild(el('span', 'chip', s.fileCount + ' files'));
    body.appendChild(detailSection('Installed in', chips));
    body.appendChild(detailSection('Path', el('div', 'detail-path', s.path)));
    var codeSec = detailSection('SKILL.md', el('div', 'loading', 'Loading…'));
    body.appendChild(codeSec);
    openInfoDrawer();
    api('/api/skill?id=' + encodeURIComponent(s.id)).then(function (r) { return r.json(); }).then(function (j) {
      codeSec.removeChild(codeSec.lastChild);
      renderMarkdownInto(codeSec, (j && j.content) || '');
    }).catch(function (e) {
      codeSec.removeChild(codeSec.lastChild);
      codeSec.appendChild(el('div', 'err', 'Failed to load: ' + e));
    });
  }

  function makeSelect(key, options, current) {
    var sel = document.createElement('select');
    sel.id = 'f_' + key; sel.name = key; sel.className = 'select';
    var blank = document.createElement('option'); blank.value = ''; blank.textContent = '(unset)';
    sel.appendChild(blank);
    options.forEach(function (opt) {
      var o = document.createElement('option'); o.value = opt; o.textContent = opt;
      sel.appendChild(o);
    });
    sel.value = current;
    return sel;
  }

  function renderForm() {
    var form = document.getElementById('form');
    form.innerHTML = '';
    document.getElementById('currentName').textContent = CURRENT === '' ? 'default (top-level)' : CURRENT;
    document.getElementById('deleteBtn').style.display = CURRENT === '' ? 'none' : '';
    var selectedName = CURRENT === '' ? 'default' : CURRENT;
    var useBtn = document.getElementById('useBtn');
    useBtn.disabled = selectedName === ACTIVE;
    useBtn.textContent = selectedName === ACTIVE ? 'Active' : 'Save & Activate';
    var data = profileData(CURRENT);
    KEYS.forEach(function (key) {
      var row = el('div', 'row');
      var label = el('label', '', key); label.htmlFor = 'f_' + key;
      var val = data[key];
      var strVal = (val === undefined || val === null) ? '' : String(val);
      if (SECRETS.indexOf(key) >= 0) {
        var input = el('input'); input.id = 'f_' + key; input.name = key; input.value = strVal;
        input.type = 'password';
        var toggle = el('button', 'toggle', 'show'); toggle.type = 'button';
        toggle.onclick = function () {
          if (input.type === 'password') { input.type = 'text'; toggle.textContent = 'hide'; }
          else { input.type = 'password'; toggle.textContent = 'show'; }
        };
        var wrap = el('div', 'inputwrap'); wrap.appendChild(input); wrap.appendChild(toggle);
        row.appendChild(label); row.appendChild(wrap);
      } else if (ENUMS[key]) {
        row.appendChild(label); row.appendChild(makeSelect(key, ENUMS[key], strVal));
      } else if (BOOLEANS.indexOf(key) >= 0) {
        row.appendChild(label); row.appendChild(makeSelect(key, ['true', 'false'], strVal));
      } else {
        var textInput = el('input'); textInput.id = 'f_' + key; textInput.name = key;
        textInput.type = 'text';
        textInput.value = strVal || (FIELD_DEFAULTS[key] || '');
        row.appendChild(label); row.appendChild(textInput);
        if (MODEL_CATALOG[key]) row.appendChild(modelCatalogBlock(key, textInput));
      }
      form.appendChild(row);
    });
  }

  function modelCatLabel(key) {
    return key.replace(/^default_/, '').replace(/_model$/, '');
  }
  function modelCatalogBlock(key, input) {
    var opts = MODEL_CATALOG[key] || [];
    var box = el('div', 'model-cat');
    box.appendChild(el('div', 'model-cat-hint', 'Available ' + modelCatLabel(key) + ' models · click to use'));
    var chips = el('div', 'model-chips');
    function mark() {
      var cur = input.value.trim();
      Array.prototype.forEach.call(chips.children, function (c) {
        c.className = c.getAttribute('data-id') === cur ? 'mchip active' : 'mchip';
      });
    }
    opts.forEach(function (o) {
      var chip = el('button', 'mchip', o.id);
      chip.type = 'button';
      chip.title = o.role;
      chip.setAttribute('data-id', o.id);
      chip.onclick = function () { input.value = o.id; mark(); };
      chips.appendChild(chip);
    });
    input.addEventListener('input', mark);
    box.appendChild(chips);
    setTimeout(mark, 0);
    return box;
  }

  function collect() {
    var data = {};
    KEYS.forEach(function (key) { var e = document.getElementById('f_' + key); data[key] = e ? e.value : ''; });
    return data;
  }

  function saveProfile(name, data) {
    var payload = data === undefined ? collect() : data;
    return api('/api/profile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, data: payload })
    }).then(function (resp) {
      return resp.json().then(function (json) { return { ok: resp.ok, json: json }; });
    }).then(function (result) {
      if (!result.ok) throw new Error((result.json && result.json.error) || 'error');
      var saved = result.json.saved || {};
      if (name === '') DATA.default = saved; else DATA.named[name] = saved;
      return saved;
    });
  }

  function save() {
    saveProfile(CURRENT).then(function () { renderForm(); setStatus('Saved.'); })
      .catch(function (err) { setStatus('Save failed: ' + err.message, true); });
  }

  function newProfile() {
    var input = document.getElementById('modalInput');
    input.value = '';
    setModalErr('');
    document.getElementById('modal').hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(function () { input.focus(); }, 30);
  }

  function closeModal() {
    document.getElementById('modal').hidden = true;
    document.body.style.overflow = '';
  }

  function setModalErr(msg) {
    document.getElementById('modalErr').textContent = msg || '';
  }

  function submitNewProfile() {
    var name = (document.getElementById('modalInput').value || '').trim();
    if (!name) { setModalErr('Please enter a profile name.'); return; }
    if (!/^[A-Za-z0-9_-]+$/.test(name)) { setModalErr('Only letters, numbers, - and _ are allowed.'); return; }
    if (name === 'default') { setModalErr('"default" is reserved for the top-level profile.'); return; }
    if (DATA.named[name] !== undefined) { setModalErr('A profile named "' + name + '" already exists.'); return; }
    var btn = document.getElementById('modalCreate');
    btn.disabled = true; setModalErr('');
    saveProfile(name, {}).then(function () {
      btn.disabled = false;
      CURRENT = name; setCount('profiles', 1 + Object.keys(DATA.named).length);
      renderProfiles(); renderForm(); closeModal(); openDrawer(); setStatus('Profile created and saved.');
    }).catch(function (err) {
      btn.disabled = false;
      setModalErr('Create failed: ' + err.message);
    });
  }

  function saveAndActivateProfile() {
    var name = CURRENT === '' ? 'default' : CURRENT;
    setStatus('Saving…');
    saveProfile(CURRENT).then(function () {
      return api('/api/active', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name })
      });
    }).then(function (resp) {
      return resp.json().then(function (json) { return { ok: resp.ok, json: json }; });
    }).then(function (result) {
      if (!result.ok) throw new Error('Saved, but activation failed: ' + ((result.json && result.json.error) || 'error'));
      ACTIVE = result.json.activeProfile || 'default';
      renderProfiles(); renderForm(); setStatus('Saved and activated.');
    }).catch(function (err) { setStatus(err.message || String(err), true); });
  }

  function deleteProfile() {
    if (CURRENT === '') return;
    if (!confirm('Delete profile "' + CURRENT + '"?')) return;
    api('/api/profile?name=' + encodeURIComponent(CURRENT), { method: 'DELETE' }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); });
      return r.json();
    }).then(function (result) {
      delete DATA.named[CURRENT];
      ACTIVE = result.activeProfile || 'default'; CURRENT = '';
      setCount('profiles', 1 + Object.keys(DATA.named).length);
      renderProfiles(); renderForm(); closeDrawer();
    }).catch(function (e) { setStatus('Delete failed: ' + e, true); });
  }

  /* ---------- inventory views ---------- */
  function renderEmpty(container, msg, hint) {
    container.innerHTML = '';
    var box = el('div', 'empty');
    box.appendChild(el('div', '', msg));
    if (hint) { var p = el('p', 'muted'); p.style.marginTop = '10px'; p.innerHTML = hint; box.appendChild(p); }
    container.appendChild(box);
  }
  function renderError(container, e) { renderEmpty(container, 'Failed to load: ' + e); }

  function loadSkills() {
    loaded.skills = true;
    var body = document.getElementById('skillsBody');
    api('/api/skills').then(function (r) { return r.json(); }).then(function (j) {
      var skills = j.skills || [];
      setCount('skills', skills.length);
      if (!skills.length) { renderEmpty(body, 'No skills installed.', 'Install with <code>npx skills add modelstudioai/cli --all -g</code>'); return; }
      body.innerHTML = '';
      var grid = el('div', 'grid');
      skills.forEach(function (s) {
        var t = el('div', 'tile clickable');
        t.onclick = function () { openSkillDetail(s); };
        var top = el('div', 'tile-top');
        top.appendChild(el('span', 'tile-name', s.name));
        top.appendChild(originBadge(s.origin));
        if (s.version) top.appendChild(el('span', 'ver', 'v' + s.version));
        t.appendChild(top);
        if (s.description) t.appendChild(el('p', 'tile-desc', s.description));
        var srcRow = el('div', 'tile-foot');
        (s.sources || []).forEach(function (src) { srcRow.appendChild(el('span', 'chip blue', src)); });
        srcRow.appendChild(el('span', 'chip', s.fileCount + ' files'));
        t.appendChild(srcRow);
        var path = el('div', 'tile-path', s.path); path.title = s.path;
        t.appendChild(path);
        grid.appendChild(t);
      });
      body.appendChild(grid);
    }).catch(function (e) { renderError(body, e); });
  }

  function loadMcp() {
    loaded.mcp = true;
    var body = document.getElementById('mcpBody');
    api('/api/mcp').then(function (r) { return r.json(); }).then(function (j) {
      var servers = j.servers || [];
      setCount('mcp', servers.length);
      if (!servers.length) { renderEmpty(body, 'No local MCP servers found.', 'MCP servers configured in Claude Code, Codex, Qwen Code or OpenCode will appear here.'); return; }
      body.innerHTML = '';
      var grid = el('div', 'grid');
      servers.forEach(function (m) {
        var t = el('div', 'tile clickable');
        t.onclick = function () { openMcpDetail(m); };
        var top = el('div', 'tile-top');
        top.appendChild(el('span', 'tile-name', m.name));
        top.appendChild(originBadge(m.origin));
        top.appendChild(el('span', 'pill neutral', m.source));
        t.appendChild(top);
        if (m.detail) { var d = el('p', 'tile-desc', m.detail); d.style.fontFamily = 'var(--mono)'; d.style.fontSize = '12px'; t.appendChild(d); }
        var foot = el('div', 'tile-foot');
        foot.appendChild(el('span', 'chip blue', m.transport));
        if (m.scope && m.scope !== 'global') { var sc = el('span', '', m.scope); sc.title = m.scope; foot.appendChild(sc); }
        else foot.appendChild(el('span', '', 'global'));
        t.appendChild(foot);
        grid.appendChild(t);
      });
      body.appendChild(grid);
    }).catch(function (e) { renderError(body, e); });
  }

  function openMcpDetail(m) {
    var title = document.getElementById('infoTitle');
    title.textContent = '';
    title.appendChild(el('span', '', m.name));
    title.appendChild(originBadge(m.origin));
    var body = document.getElementById('infoBody');
    body.innerHTML = '';
    var meta = el('div', 'detail-chips');
    meta.appendChild(el('span', 'chip blue', m.transport));
    meta.appendChild(el('span', 'chip', m.source));
    body.appendChild(detailSection('Transport / Source', meta));
    body.appendChild(detailSection('Scope', el('div', 'detail-path', m.scope || 'global')));
    var label = m.transport === 'stdio' ? 'Command' : 'Endpoint';
    body.appendChild(detailSection(label, el('pre', 'detail-code', m.detail || '(none)')));
    openInfoDrawer();
  }

  function loadAgents() {
    loaded.agents = true;
    var body = document.getElementById('agentsBody');
    api('/api/agents').then(function (r) { return r.json(); }).then(function (j) {
      var agents = j.agents || [];
      var installed = agents.filter(function (a) { return a.installed; }).length;
      setCount('agents', installed);
      body.innerHTML = '';
      var grid = el('div', 'grid');
      agents.forEach(function (a) {
        var t = el('div', 'tile');
        var top = el('div', 'tile-top');
        top.appendChild(el('span', 'tile-name', a.label));
        var pill;
        if (a.installed && a.configured) pill = el('span', 'pill ok', 'Connected');
        else if (a.installed) pill = el('span', 'pill neutral', 'Installed');
        else pill = el('span', 'pill off', 'Not installed');
        top.appendChild(pill);
        t.appendChild(top);
        var foot = el('div', 'tile-foot');
        foot.appendChild(el('span', 'chip', a.id));
        if (a.model) foot.appendChild(el('span', 'chip blue', a.model));
        t.appendChild(foot);
        if (a.paths && a.paths.length) {
          var path = el('div', 'tile-path', a.paths.join('\\n'));
          path.title = a.paths.join('\\n');
          t.appendChild(path);
        }
        var actions = el('div', 'tile-actions');
        var launch = el('button', 'btn-launch', '▶ Quick launch');
        var connected = a.installed && a.configured;
        var st = el('span', 'launch-status');
        if (connected && a.launchable) {
          launch.title = 'Open a new terminal and start this agent';
          launch.onclick = function () { launchAgentCli(a, launch, st); };
        } else {
          launch.disabled = true;
          if (!a.installed) launch.title = 'Install this agent before launching';
          else if (!connected) launch.title = 'Connect this agent to bailian-cli before launching';
          else launch.title = 'The CLI for this agent was not found on your PATH — install it before launching';
        }
        actions.appendChild(launch);
        actions.appendChild(st);
        t.appendChild(actions);
        grid.appendChild(t);
      });
      body.appendChild(grid);
    }).catch(function (e) { renderError(body, e); });
  }
  
  function launchAgentCli(a, btn, st) {
    btn.disabled = true;
    st.textContent = 'Launching…'; st.className = 'launch-status';
    api('/api/agent/launch?id=' + encodeURIComponent(a.id), { method: 'POST' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.disabled = false;
        if (!res.ok) { st.textContent = (res.j && res.j.error) || 'Launch failed'; st.className = 'launch-status err'; return; }
        st.textContent = 'Launched → ' + (res.j.command || a.id); st.className = 'launch-status ok';
      })
      .catch(function (e) { btn.disabled = false; st.textContent = 'Launch failed: ' + e; st.className = 'launch-status err'; });
  }

  /* ---------- assets ---------- */
  function fmtBytes(n) {
    if (!n && n !== 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
    return (n / 1073741824).toFixed(2) + ' GB';
  }
  function fmtTime(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function assetIcon(kind) {
    if (kind === 'audio') return '\uD83C\uDFB5';
    if (kind === 'video') return '\uD83C\uDFAC';
    if (kind === 'image') return '\uD83D\uDDBC';
    return '\uD83D\uDCC4';
  }

  function loadAssets() {
    loaded.assets = true;
    var body = document.getElementById('assetsBody');
    api('/api/assets').then(function (r) { return r.json(); }).then(function (j) {
      ASSETS = j.assets || [];
      setCount('assets', ASSETS.length);
      var baseEl = document.getElementById('assetsBase');
      if (baseEl) baseEl.textContent = j.base ? '— ' + j.base : '';
      renderAssetFilters();
      renderAssets();
    }).catch(function (e) { renderError(body, e); });
  }

  function renderAssetFilters() {
    var bar = document.getElementById('assetFilters');
    bar.innerHTML = '';
    var counts = { all: ASSETS.length };
    ASSETS.forEach(function (a) { counts[a.category] = (counts[a.category] || 0) + 1; });
    var cats = ['all'].concat(['images', 'videos', 'speech', 'omni', 'other'].filter(function (c) { return counts[c]; }));
    cats.forEach(function (cat) {
      var b = el('button', 'filter' + (cat === ASSET_FILTER ? ' is-active' : ''));
      b.appendChild(el('span', '', cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)));
      b.appendChild(el('span', 'n', String(counts[cat] || 0)));
      b.onclick = function () { ASSET_FILTER = cat; renderAssetFilters(); renderAssets(); };
      bar.appendChild(b);
    });
    var sort = el('button', 'filter sort-toggle');
    sort.title = 'Toggle sort by generation time';
    sort.textContent = ASSET_SORT === 'new' ? '↓ Newest first' : '↑ Oldest first';
    sort.onclick = function () { ASSET_SORT = ASSET_SORT === 'new' ? 'old' : 'new'; renderAssetFilters(); renderAssets(); };
    bar.appendChild(sort);
  }

  function renderAssets() {
    var body = document.getElementById('assetsBody');
    var list = ASSET_FILTER === 'all' ? ASSETS : ASSETS.filter(function (a) { return a.category === ASSET_FILTER; });
    list = list.slice().sort(function (a, b) { return ASSET_SORT === 'new' ? b.mtime - a.mtime : a.mtime - b.mtime; });
    if (!ASSETS.length) {
      renderEmpty(body, 'No generated assets yet.', 'Assets from <code>bl image</code>, <code>bl video</code>, <code>bl speech</code> and <code>bl omni</code> will appear here.');
      return;
    }
    body.innerHTML = '';
    var grid = el('div', 'asset-grid');
    list.forEach(function (a) {
      var card = el('div', 'asset');
      var media = el('div', 'asset-media');
      var src = '/api/asset/file?path=' + encodeURIComponent(a.relPath) + '&token=' + encodeURIComponent(token);
      if (a.kind === 'image') {
        var img = el('img'); img.src = src; img.loading = 'lazy'; img.alt = a.name;
        img.style.cursor = 'pointer'; img.title = 'View details';
        img.onclick = function () { openAssetDetail(a); };
        media.appendChild(img);
      } else if (a.kind === 'video') {
        var vid = el('video'); vid.src = src; vid.controls = true; vid.preload = 'metadata'; media.appendChild(vid);
      } else if (a.kind === 'audio') {
        var au = el('audio'); au.src = src; au.controls = true; au.preload = 'none'; media.appendChild(au);
      } else {
        var icon = el('span', 'asset-icon', assetIcon(a.kind));
        icon.style.cursor = 'pointer'; icon.title = 'View details';
        icon.onclick = function () { openAssetDetail(a); };
        media.appendChild(icon);
      }
      card.appendChild(media);
      card.appendChild(el('span', 'asset-cat', a.category));
      var del = el('button', 'asset-del', '×'); del.title = 'Delete';
      del.onclick = function () { deleteAsset(a); };
      card.appendChild(del);
      var b = el('div', 'asset-body');
      var nm = el('div', 'asset-name link', a.name); nm.title = 'View details — ' + a.relPath;
      nm.onclick = function () { openAssetDetail(a); };
      b.appendChild(nm);
      var meta = el('div', 'asset-meta');
      meta.appendChild(el('span', '', fmtTime(a.mtime)));
      if (a.ext) meta.appendChild(el('span', 'chip', a.ext));
      meta.appendChild(el('span', '', fmtBytes(a.size)));
      b.appendChild(meta);
      card.appendChild(b);
      grid.appendChild(card);
    });
    body.appendChild(grid);
  }

  function openAsset(a) {
    api('/api/asset/open?path=' + encodeURIComponent(a.relPath), { method: 'POST' }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); });
    }).catch(function (e) { alert('Open failed: ' + e); });
  }

  function openAssetDetail(a) {
    var title = document.getElementById('infoTitle');
    title.textContent = '';
    title.appendChild(el('span', '', a.name));
    var body = document.getElementById('infoBody');
    body.innerHTML = '';
    var src = '/api/asset/file?path=' + encodeURIComponent(a.relPath) + '&token=' + encodeURIComponent(token);
    var prev = el('div', 'detail-preview');
    if (a.kind === 'image') { var img = el('img'); img.src = src; img.alt = a.name; prev.appendChild(img); }
    else if (a.kind === 'video') { var vid = el('video'); vid.src = src; vid.controls = true; vid.preload = 'metadata'; prev.appendChild(vid); }
    else if (a.kind === 'audio') { var au = el('audio'); au.src = src; au.controls = true; prev.appendChild(au); }
    else { prev.appendChild(el('span', 'asset-icon-lg', assetIcon(a.kind))); }
    body.appendChild(prev);
    var actions = el('div', 'detail-actions');
    var openBtn = el('button', 'btn-primary', 'Open locally');
    openBtn.onclick = function () { openAsset(a); };
    var delBtn = el('button', 'btn-danger', 'Delete');
    delBtn.onclick = function () { deleteAsset(a, true); };
    actions.appendChild(openBtn); actions.appendChild(delBtn);
    body.appendChild(actions);
    body.appendChild(detailSection('Category', el('div', 'detail-desc', a.category)));
    var chips = el('div', 'detail-chips');
    if (a.ext) chips.appendChild(el('span', 'chip', a.ext));
    chips.appendChild(el('span', 'chip', fmtBytes(a.size)));
    chips.appendChild(el('span', 'chip', fmtTime(a.mtime)));
    body.appendChild(detailSection('Type / Size / Modified', chips));
    body.appendChild(detailSection('Path', el('div', 'detail-path', a.relPath)));
    openInfoDrawer();
  }

  function deleteAsset(a, fromDrawer) {
    if (!confirm('Delete asset "' + a.name + '"? This removes the file from disk.')) return;
    api('/api/asset?path=' + encodeURIComponent(a.relPath), { method: 'DELETE' }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || 'error'); });
      return r.json();
    }).then(function () {
      ASSETS = ASSETS.filter(function (x) { return x.relPath !== a.relPath; });
      setCount('assets', ASSETS.length);
      if (fromDrawer) closeInfoDrawer();
      renderAssetFilters();
      renderAssets();
    }).catch(function (e) { alert('Delete failed: ' + e); });
  }

  /* ---------- wiring ---------- */
  var navItems = document.querySelectorAll('.nav-item');
  for (var n = 0; n < navItems.length; n++) {
    navItems[n].onclick = function () { showView(this.getAttribute('data-view')); };
  }
  document.getElementById('saveBtn').onclick = save;
  document.getElementById('useBtn').onclick = saveAndActivateProfile;
  document.getElementById('deleteBtn').onclick = deleteProfile;
  document.getElementById('closeBtn').onclick = closeDrawer;
  document.getElementById('drawer').onclick = function (e) { if (e.target === this) closeDrawer(); };
  document.getElementById('infoClose').onclick = closeInfoDrawer;
  document.getElementById('infoDrawer').onclick = function (e) { if (e.target === this) closeInfoDrawer(); };
  document.getElementById('modalCancel').onclick = closeModal;
  document.getElementById('modalCreate').onclick = submitNewProfile;
  document.getElementById('modal').onclick = function (e) { if (e.target === this) closeModal(); };
  document.getElementById('modalInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); submitNewProfile(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('modal').hidden) closeModal();
    else if (!document.getElementById('infoDrawer').hidden) closeInfoDrawer();
    else if (!document.getElementById('drawer').hidden) closeDrawer();
  });
  loadConfig();
</script>
</body>
</html>
`;
