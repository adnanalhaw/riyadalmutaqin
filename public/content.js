// مساعد العميل: جلب المحتوى من الـ API وعرضه، وإدارة مكتبة الحفظ.
window.RM = (function () {
  "use strict";

  function ar(n) {
    return String(n).replace(/[0-9]/g, function (d) { return "٠١٢٣٤٥٦٧٨٩"[+d]; });
  }
  function fmtDur(sec) {
    if (!sec) return "";
    var m = Math.floor(sec / 60), s = sec % 60;
    return ar(m) + ":" + ar(s < 10 ? "0" + s : s);
  }
  function ytThumb(id) {
    return id ? "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg" : null;
  }
  // يُهرّب لكلٍّ من سياق النصّ والسمات (يشمل علامتَي الاقتباس لمنع كسر السمات/XSS).
  var ESC_MAP = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  }
  function ytWatch(id) {
    return id ? "https://www.youtube.com/watch?v=" + encodeURIComponent(id) : "#";
  }
  // يسمح بمسارٍ نسبيّ (/...) أو http(s) فقط؛ يمنع javascript:/data: ونحوها.
  function safeUrl(u) {
    u = String(u == null ? "" : u);
    return /^(https?:\/\/|\/(?!\/))/i.test(u) ? u : "#";
  }

  var meP;
  function getMe() {
    if (!meP) {
      meP = fetch("/api/auth/me", { headers: { accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) { return (d && d.user) || null; })
        .catch(function () { return null; });
    }
    return meP;
  }

  // تسجيل حدث محتوى (مشاهدة/تحميل مقطع) — لا يُعطّل العميل عند الفشل.
  function trackClip(clipId, kind) {
    try {
      fetch("/api/clip-event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clip_id: clipId, kind: kind }),
        keepalive: true,
      });
    } catch (e) { /* تجاهل */ }
  }

  // سطر بيانات المقطع: اسم المُلقي/المُنشئ + عدد المشاهدين.
  function clipMeta(item) {
    var by = item.author_name && item.author_name !== item.doctor_name
      ? '<span class="muted"> · ' + esc(item.author_name) + "</span>" : "";
    var views = (item.views != null)
      ? '<span class="muted" style="font-size:.82rem">👁 ' + ar(item.views) + " مشاهدة</span>" : "";
    return (
      (item.doctor_name ? '<div class="vdoc">' + esc(item.doctor_name) + by + "</div>" : "") +
      (views ? '<div style="margin-top:.2rem">' + views + "</div>" : "")
    );
  }

  // بطاقة فيديو (درس/مقطع)
  function videoCard(item, opts) {
    opts = opts || {};
    // مقطع بفيديو مُستضاف (ناتج المونتاج): يُشغَّل داخل الصفحة بدل رابط يوتيوب.
    if (item.video_url && !item.youtube_id) {
      var vurl = safeUrl(item.video_url);
      var d0 = item.duration ? '<span class="badge" style="flex:none">' + fmtDur(item.duration) + "</span>" : "";
      var dl = opts.clip
        ? '<a class="btn btn-ghost rm-download" data-id="' + item.id + '" href="' + esc(vurl) +
          '" download style="margin-top:.5rem;padding:.35rem .9rem;font-size:.85rem">⤓ تنزيل</a>'
        : "";
      return (
        '<div' + (opts.clip ? ' data-clip-id="' + item.id + '"' : "") + ">" +
        '<video src="' + esc(vurl) + '" controls preload="metadata"' +
        (opts.clip ? ' class="rm-clipvid" data-id="' + item.id + '"' : "") +
        ' style="width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;display:block"></video>' +
        '<div class="vmeta">' +
        '<div class="vtitle">' + esc(item.title) + "</div>" +
        (opts.clip ? clipMeta(item) : (item.doctor_name ? '<div class="vdoc">' + esc(item.doctor_name) + "</div>" : "")) +
        d0 + dl +
        "</div></div>"
      );
    }
    var thumb = ytThumb(item.youtube_id) || item.thumbnail;
    var bg = thumb
      ? 'style="background-image:url(' + esc(thumb) + ');background-size:cover;background-position:center"'
      : "";
    var dur = item.duration ? '<span class="badge" style="position:absolute;bottom:.6rem;inset-inline-end:.6rem">' + fmtDur(item.duration) + "</span>" : "";
    var link = ytWatch(item.youtube_id);
    var action = "";
    if (opts.save) {
      action = '<button class="btn btn-ghost rm-save" data-id="' + item.id + '" style="margin-top:.5rem;padding:.35rem .9rem;font-size:.85rem">＋ حفظ</button>';
    } else if (opts.remove) {
      action = '<button class="btn btn-ghost rm-remove" data-id="' + item.id + '" style="margin-top:.5rem;padding:.35rem .9rem;font-size:.85rem">إزالة</button>';
    }
    return (
      "<div>" +
      '<a href="' + link + '" target="_blank" rel="noopener" class="vthumb' + (opts.clip ? " rm-cliplink" : "") + '" ' +
      (opts.clip ? 'data-id="' + item.id + '" ' : "") + bg + ">" +
      '<div class="play">▶</div>' + dur +
      "</a>" +
      '<div class="vmeta">' +
      '<div class="vtitle">' + esc(item.title) + "</div>" +
      (opts.clip ? clipMeta(item) : (item.doctor_name ? '<div class="vdoc">' + esc(item.doctor_name) + "</div>" : "")) +
      action +
      "</div></div>"
    );
  }

  // ربط تتبّع المقاطع داخل حاوية: مشاهدة عند التشغيل/النقر، وتحميل عند الزرّ.
  function bindClips(container) {
    var viewed = {};
    function view(id) { if (id && !viewed[id]) { viewed[id] = 1; trackClip(id, "view"); } }
    container.addEventListener("play", function (e) {
      var v = e.target;
      if (v && v.classList && v.classList.contains("rm-clipvid")) view(+v.getAttribute("data-id"));
    }, true);
    container.addEventListener("click", function (e) {
      var lnk = e.target.closest(".rm-cliplink");
      if (lnk) { view(+lnk.getAttribute("data-id")); return; }
      var dl = e.target.closest(".rm-download");
      if (dl) trackClip(+dl.getAttribute("data-id"), "download");
    });
  }

  function setHTML(sel, html) {
    var el = typeof sel === "string" ? document.querySelector(sel) : sel;
    if (el) el.innerHTML = html;
    return el;
  }

  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (d) { return { status: r.status, ok: r.ok, d: d }; });
    });
  }

  // ربط أزرار الحفظ داخل حاوية
  function bindSave(container) {
    container.addEventListener("click", function (e) {
      var btn = e.target.closest(".rm-save");
      if (!btn) return;
      e.preventDefault();
      getMe().then(function (user) {
        if (!user) { location.href = "/login"; return; }
        api("/api/library", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lesson_id: +btn.getAttribute("data-id") }),
        }).then(function () {
          btn.textContent = "✓ محفوظ";
          btn.disabled = true;
          btn.style.opacity = ".7";
        });
      });
    });
  }

  return {
    ar: ar, fmtDur: fmtDur, ytThumb: ytThumb, esc: esc, getMe: getMe, api: api,
    videoCard: videoCard, setHTML: setHTML, bindSave: bindSave,
    trackClip: trackClip, bindClips: bindClips,

    // المقاطع
    loadClips: function (sel) {
      api("/api/clips").then(function (res) {
        var list = (res.d && res.d.clips) || [];
        var el = setHTML(sel, list.length
          ? list.map(function (c) { return videoCard(c, { clip: true }); }).join("")
          : '<p class="muted">لا توجد مقاطع بعد.</p>');
        if (el && list.length) bindClips(el);
      });
    },

    // الصوتيات
    loadAudio: function (sel) {
      api("/api/audio").then(function (res) {
        var list = (res.d && res.d.audio) || [];
        if (!list.length) { setHTML(sel, '<p class="muted">لا توجد موادّ صوتية بعد.</p>'); return; }
        setHTML(sel, list.map(function (a) {
          return (
            '<div class="card" style="display:flex;align-items:center;gap:1rem">' +
            '<div class="play" style="width:48px;height:48px;flex:none;border-radius:50%;background:var(--gold);color:#2a1f04;display:grid;place-items:center;font-size:1.2rem">▶</div>' +
            '<div style="flex:1;min-width:0">' +
            '<div class="vtitle" style="font-weight:700">' + esc(a.title) + "</div>" +
            (a.doctor_name ? '<div class="vdoc gold" style="font-size:.88rem">' + esc(a.doctor_name) + "</div>" : "") +
            '<audio controls src="' + esc(a.audio_url || "#") + '" style="width:100%;margin-top:.5rem"></audio>' +
            "</div>" +
            (a.duration ? '<span class="badge" style="flex:none">' + fmtDur(a.duration) + "</span>" : "") +
            "</div>"
          );
        }).join(""));
      });
    },

    // الدروس المسجّلة (recorded/youtube) مع زرّ حفظ
    loadRecorded: function (sel) {
      var el = document.querySelector(sel);
      api("/api/lessons").then(function (res) {
        var list = ((res.d && res.d.lessons) || []).filter(function (l) { return l.status === "published"; });
        if (!list.length) { setHTML(el, '<p class="muted">لا توجد دروس مسجّلة بعد.</p>'); return; }
        setHTML(el, list.map(function (l) { return videoCard(l, { save: true }); }).join(""));
        bindSave(el);
      });
    },

    // البثّ الحالي والدروس القادمة
    // noticeSel اختياري: عنصر لرسائل الحالة (لا بث / بث بلا يوتيوب)
    loadLive: function (playerSel, metaSel, upcomingSel, noticeSel) {
      api("/api/lessons").then(function (res) {
        var list = (res.d && res.d.lessons) || [];
        var live = list.filter(function (l) { return l.status === "live"; })[0];
        var player = document.querySelector(playerSel);
        var meta = document.querySelector(metaSel);
        var notice = noticeSel ? document.querySelector(noticeSel) : null;

        if (live) {
          if (player) {
            if (live.youtube_id) {
              player.innerHTML =
                '<span class="badge live" style="position:absolute;top:1rem;inset-inline-start:1rem;z-index:2">● مباشر الآن</span>' +
                '<iframe src="https://www.youtube.com/embed/' + esc(live.youtube_id) +
                '?autoplay=1&mute=1" title="' + esc(live.title) +
                '" style="width:100%;height:100%;border:0;border-radius:12px" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>';
              if (notice) { notice.hidden = true; notice.textContent = ""; }
            } else {
              player.innerHTML =
                '<span class="badge live" style="position:absolute;top:1rem;inset-inline-start:1rem">● مباشر الآن</span><div class="play">▶</div>';
              if (notice) {
                notice.hidden = false;
                notice.textContent = "البثّ معلَن، وينتظر ربط معرّف يوتيوب لايف من لوحة المعلّم لعرضه هنا.";
              }
            }
          }
          if (meta) meta.innerHTML = '<div class="vtitle">' + esc(live.title) + "</div>" +
            '<div class="vdoc">الدكتور: ' + esc(live.doctor_name || "—") + "</div>";
        } else {
          if (player) {
            player.innerHTML =
              '<span class="badge soon" style="position:absolute;top:1rem;inset-inline-start:1rem">● لا يوجد بثٌّ حالياً</span><div class="play">▶</div>';
          }
          if (meta) meta.innerHTML = '<div class="vtitle">لا بثّ مباشر الآن</div><div class="vdoc">راجِع الدروس القادمة أو المسجّلة أدناه.</div>';
          if (notice) { notice.hidden = true; notice.textContent = ""; }
        }

        var upcoming = list.filter(function (l) { return l.status === "scheduled"; });
        var tbody = document.querySelector(upcomingSel);
        if (tbody) {
          if (!upcoming.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="muted">لا توجد دروس مجدولة حالياً.</td></tr>';
          } else {
            tbody.innerHTML = upcoming.map(function (l) {
              return "<tr><td>" + esc(l.title) + "</td><td>" + esc(l.doctor_name || "—") +
                "</td><td>" + esc(l.scheduled_at || "—") + '</td><td><span class="badge soon">قريباً</span></td></tr>';
            }).join("");
          }
        }
      });
    },

    // مكتبة الحفظ
    loadLibrary: function (sel, noticeSel) {
      var el = document.querySelector(sel);
      var notice = noticeSel ? document.querySelector(noticeSel) : null;
      getMe().then(function (user) {
        if (!user) {
          if (notice) {
            notice.hidden = false;
            notice.innerHTML = 'مكتبة الحفظ تتطلّب تسجيل الدخول. <a class="gold" href="/login">سجّل الدخول</a> لعرض موادّك المحفوظة.';
          }
          setHTML(el, "");
          return;
        }
        api("/api/library").then(function (res) {
          var list = (res.d && res.d.items) || [];
          if (notice) notice.hidden = true;
          if (!list.length) { setHTML(el, '<p class="muted">لم تحفظ أيّ درس بعد. تصفّح <a class="gold" href="/live">الدروس</a> واحفظ ما يعجبك.</p>'); return; }
          setHTML(el, list.map(function (l) { return videoCard(l, { remove: true }); }).join(""));
          el.addEventListener("click", function (e) {
            var btn = e.target.closest(".rm-remove");
            if (!btn) return;
            e.preventDefault();
            api("/api/library/remove", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ lesson_id: +btn.getAttribute("data-id") }),
            }).then(function () {
              var card = btn.closest("div").parentNode;
              if (card) card.remove();
            });
          });
        });
      });
    },
  };
})();
