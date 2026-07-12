// pibarm docs — demo simulations. Everything here is fake/local; no agent runs.
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

  /* ---------------- task widget demo ---------------- */

  const TW_TODOS = ["inspect auth flow", "add rate limiter", "update docs"];
  const TW_AGENTS = [
    { label: "matrix scout", session: "matrix-myapp" },
    { label: "sub reviewer", session: "haiku" },
    { label: "watch pr-42", session: "sonnet" },
  ];

  const tw = {
    todos: [],
    agents: [],
    el: { pills: $("tw-pills"), status: $("tw-status"), transcript: $("tw-transcript") },
  };

  function twRender() {
    if (!tw.el.pills) return;
    const pills = [];
    tw.todos.forEach((t, i) => {
      const icon = t.done ? '<span class="ic-done">✓</span>' : '<span class="ic-todo">○</span>';
      pills.push(`<span class="tw-pill">${icon} ${i + 1} · ${esc(t.text)}</span>`);
    });
    tw.agents.forEach((a) => {
      const icon = a.status === "running" ? '<span class="ic-run">●</span>'
        : a.status === "failed" ? '<span class="ic-fail">!</span>'
        : '<span class="ic-done">✓</span>';
      pills.push(`<span class="tw-pill">${icon} ${esc(a.label)} · ${esc(a.session)}</span>`);
    });
    tw.el.pills.innerHTML = pills.join("");

    const done = tw.todos.filter((t) => t.done).length;
    const running = tw.agents.filter((a) => a.status === "running").length;
    const parts = [];
    if (tw.todos.length) parts.push(`todo ${done}/${tw.todos.length}`);
    if (running) parts.push(`agents ${running}`);
    tw.el.status.textContent = parts.join(" · ");
  }

  function twSay(text) {
    if (tw.el.transcript) tw.el.transcript.innerHTML = `<span class="t-blue">tool</span> ${esc(text)}`;
  }

  $("tw-set")?.addEventListener("click", () => {
    tw.todos = TW_TODOS.map((text) => ({ text, done: false }));
    twSay(`todo_list(action=set, items=[${TW_TODOS.map((t) => `"${t}"`).join(", ")}])`);
    twRender();
  });
  $("tw-done")?.addEventListener("click", () => {
    const next = tw.todos.findIndex((t) => !t.done);
    if (next === -1) return twSay("todo_list(action=done) — nothing left to mark");
    tw.todos[next].done = true;
    twSay(`todo_list(action=done, index=${next + 1})`);
    twRender();
  });
  $("tw-agent")?.addEventListener("click", () => {
    const spec = TW_AGENTS[tw.agents.length % TW_AGENTS.length];
    tw.agents.push({ ...spec, status: "running" });
    twSay(`spawned ${spec.label} — appears as a running pill`);
    twRender();
  });
  $("tw-finish")?.addEventListener("click", () => {
    const running = tw.agents.find((a) => a.status === "running");
    if (!running) return twSay("no running agents");
    running.status = Math.random() < 0.8 ? "done" : "failed";
    twSay(`${running.label} finished (${running.status})`);
    twRender();
  });
  $("tw-clear")?.addEventListener("click", () => {
    tw.todos = [];
    tw.agents = [];
    twSay("todo_list(action=clear)");
    twRender();
  });

  /* ---------------- statusline demo ---------------- */

  const sl = { pr: "open", ci: "pass", dirty: true, think: 2 };
  const THINK = ["off", "low", "medium", "high"];

  function slRender() {
    const el = $("sl-line");
    if (!el) return;
    const dot = '<span class="t-dim"> · </span>';

    const left = [
      '<span class="t-accent"> myapp</span>',
      '<span class="t-muted">󰚩 anthropic/sonnet-4-5</span>',
      '<span class="t-yellow">󰯌 ctx 37%</span>',
      THINK[sl.think] !== "off" ? `<span class="t-accent">󰌵 think ${THINK[sl.think]}</span>` : "",
    ].filter(Boolean).join(dot);

    const branch = sl.dirty
      ? '<span class="t-yellow"> main</span>' + dot + '<span class="t-yellow">▰▰▰▰ +42 −7</span>'
      : '<span class="t-green"> main</span>';

    const prMap = {
      none: "",
      open: '<span class="t-green"> #12</span>',
      draft: '<span class="t-muted"> #12 draft</span>',
      merged: '<span class="t-accent"> #12</span>',
      closed: '<span class="t-red"> #12</span>',
    };
    const ciMap = {
      pass: '<span class="t-green"> CI</span>',
      run: '<span class="t-yellow"> CI</span>',
      fail: '<span class="t-red"> CI</span>',
      none: '<span class="t-muted"> CI</span>',
    };

    const right = ['<span class="t-accent">APP-123</span>', branch, prMap[sl.pr], ciMap[sl.ci]]
      .filter(Boolean).join(dot);

    el.innerHTML = `<span>${left}</span><span>${right}</span>`;
  }

  $("sl-pr")?.addEventListener("change", (e) => { sl.pr = e.target.value; slRender(); });
  $("sl-ci")?.addEventListener("change", (e) => { sl.ci = e.target.value; slRender(); });
  $("sl-dirty")?.addEventListener("click", () => { sl.dirty = !sl.dirty; slRender(); });
  $("sl-think")?.addEventListener("click", () => { sl.think = (sl.think + 1) % THINK.length; slRender(); });
  slRender();

  /* ---------------- typewriter helper ---------------- */

  function play(el, lines, opts = {}) {
    const delay = opts.delay ?? 260;
    el.innerHTML = "";
    let i = 0;
    return new Promise((resolve) => {
      (function step() {
        if (i >= lines.length) return resolve();
        const div = document.createElement("div");
        div.innerHTML = lines[i++];
        el.appendChild(div);
        setTimeout(step, delay);
      })();
    });
  }

  /* ---------------- matrix demo ---------------- */

  const MX_SCOUT = [
    '<span class="t-accent">[matrix scout started]</span>',
    '<span class="t-dim">model: anthropic/haiku · log: .pi/matrix/scout-….log</span>',
    'reading test/flaky_spec.rb…',
    'reading ci logs for retry markers…',
    '<span class="t-muted">found: 3 tests retried in last 20 runs,</span>',
    '<span class="t-muted">all touch redis-backed session cache</span>',
    '<span class="t-green">[matrix scout exited 0]</span>',
  ];
  const MX_PLANNER = [
    '<span class="t-accent">[matrix planner started]</span>',
    '<span class="t-dim">model: anthropic/sonnet · log: .pi/matrix/planner-….log</span>',
    'waiting on scout context…',
    'plan: 1. freeze clock in cache TTL specs',
    '      2. isolate redis db per worker',
    '      3. re-run 50× to confirm',
    '<span class="t-muted">risk: low · worktree recommended: no</span>',
    '<span class="t-green">[matrix planner exited 0]</span>',
  ];
  const MX_PARENT = [
    '<span class="t-prompt">›</span> /matrix investigate flaky tests',
    '<span class="t-dim">spawned scout (pane 1), planner (pane 2) in workspace matrix-myapp-a1b2c3d4</span>',
    '<span class="t-prompt">›</span> /matrix-join',
    '<span class="t-dim">waiting for 2 agents…</span>',
    '<span class="t-green">✓ scout exited 0</span> <span class="t-dim">· log captured (200 lines)</span>',
    '<span class="t-green">✓ planner exited 0</span> <span class="t-dim">· log captured · panes cleaned up</span>',
    '<span class="t-muted">summary: flakiness caused by shared redis db + real clock in TTL specs; 3-step fix proposed.</span>',
  ];

  const mxRun = $("mx-run"), mxReset = $("mx-reset");
  mxRun?.addEventListener("click", async () => {
    mxRun.disabled = true;
    await play($("mx-parent"), MX_PARENT.slice(0, 2), { delay: 350 });
    await Promise.all([
      play($("mx-scout"), MX_SCOUT, { delay: 420 }),
      play($("mx-planner"), MX_PLANNER, { delay: 520 }),
    ]);
    await play($("mx-parent"), MX_PARENT, { delay: 300 });
    mxReset.disabled = false;
  });
  mxReset?.addEventListener("click", () => {
    $("mx-scout").innerHTML = '<span class="t-dim">(empty)</span>';
    $("mx-planner").innerHTML = '<span class="t-dim">(empty)</span>';
    $("mx-parent").innerHTML = '<span class="t-prompt">›</span> <span class="t-dim">waiting…</span>';
    mxReset.disabled = true;
    mxRun.disabled = false;
  });

  /* ---------------- plan flow demo ---------------- */

  const PL = [
    '<span class="t-prompt">›</span> /plan add rate limiting to the API client',
    '<span class="t-dim">plan mode: edit/write disabled, bash restricted to read-only</span>',
    '<span class="t-blue">?</span> Scope — which endpoints? <span class="t-muted">[all] [mutations only] [custom]</span>',
    '<span class="t-dim">you: mutations only</span>',
    '<span class="t-accent">Plan:</span> 1. add TokenBucket to client core',
    '        2. wrap POST/PUT/DELETE with limiter',
    '        3. config knob + docs   <span class="t-muted">validation: unit tests + one live smoke</span>',
    '<span class="t-blue">?</span> approve → <span class="t-muted">[worktree] [active checkout] [refine] [keep for later]</span>',
    '<span class="t-prompt">›</span> /approve-plan worktree rate-limit',
    '<span class="t-green">✓</span> worktree <span class="t-accent">.pi/wt/rate-limit</span> · branch <span class="t-accent">pibarm/rate-limit</span>',
    '<span class="t-dim">executing in the worktree — your checkout is untouched…</span>',
    '<span class="t-green">✓ done</span> <span class="t-muted">+184 −12 across 6 files · review with /worktree-diff</span>',
  ];

  const plRun = $("pl-run"), plReset = $("pl-reset");
  plRun?.addEventListener("click", async () => {
    plRun.disabled = true;
    await play($("pl-out"), PL, { delay: 420 });
    plReset.disabled = false;
  });
  plReset?.addEventListener("click", () => {
    $("pl-out").innerHTML = '<span class="t-prompt">›</span> <span class="t-dim">press run…</span>';
    plReset.disabled = true;
    plRun.disabled = false;
  });
})();
