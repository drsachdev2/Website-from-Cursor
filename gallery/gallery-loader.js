(function () {
  'use strict';

  var JSON_PATH = 'gallery/gallery.json';

  function resolveSrc(src) {
    if (!src || typeof src !== 'string') return '';
    var t = src.trim();
    if (/^https?:\/\//i.test(t)) return t;
    if (t.startsWith('//')) return 'https:' + t;
    return 'gallery/' + t.replace(/^\/+/, '');
  }

  function renderError(mount, msg) {
    mount.innerHTML =
      '<p class="gallery-load-error" style="text-align:center;padding:2rem;color:var(--gray);max-width:480px;margin:0 auto">' +
      (msg || 'Gallery could not be loaded.') +
      ' If you are opening the file directly from disk, use a local server (e.g. <code style="font-size:.85em">npx serve</code>) so <code>gallery/gallery.json</code> can load.</p>';
  }

  function renderGallery(mount, data) {
    if (!data || !Array.isArray(data.sections)) {
      renderError(mount, 'Invalid gallery data.');
      return;
    }
    var hasAny = data.sections.some(function (sec) {
      return (sec.items || []).length > 0;
    });
    if (!hasAny) {
      mount.innerHTML =
        '<p class="gallery-load-error" style="text-align:center;padding:2rem;color:var(--gray)">No gallery photos yet. Use <code>gallery/admin.html</code> to build <code>gallery.json</code>.</p>';
      return;
    }
    var html = '';
    data.sections.forEach(function (sec) {
      var heading = sec.heading || 'Gallery';
      var items = sec.items || [];
      if (items.length === 0) return;
      html += '<h3 class="gallery-subhead fade-up visible">' + escapeHtml(heading) + '</h3>';
      html += '<div class="gallery-grid">';
      items.forEach(function (item) {
        var src = resolveSrc(item.src);
        var alt = item.alt || 'Smile gallery photo';
        var cap = item.caption || '';
        var w = item.width || 800;
        var h = item.height || 600;
        html +=
          '<figure class="gallery-item fade-up visible">' +
          '<img src="' +
          escapeAttr(src) +
          '" alt="' +
          escapeAttr(alt) +
          '" width="' +
          w +
          '" height="' +
          h +
          '" loading="lazy" decoding="async" />' +
          '<figcaption class="gallery-caption">' +
          escapeHtml(cap) +
          '</figcaption>' +
          '</figure>';
      });
      html += '</div>';
    });
    mount.innerHTML = html;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;');
  }

  window.loadSmileGallery = function () {
    var mount = document.getElementById('gallery-mount');
    if (!mount) return Promise.resolve();

    return fetch(JSON_PATH, { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        renderGallery(mount, data);
        return data;
      })
      .catch(function () {
        renderError(mount);
        return null;
      });
  };
})();
