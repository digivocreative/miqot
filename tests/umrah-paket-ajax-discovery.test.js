import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as cheerio from 'cheerio';
import { extractJsHandlers } from '../laporan-api.js';

const BASE = 'http://115.124.86.220/aiw/staff/pages/route/data_umrah';

// Legacy register form since ±22 Sep 2026: every AJAX call goes through loadAjaxData()
// and the jadwal select is named `jadwal` (was `vjadwal`).
const LOAD_AJAX_DATA_FORM = `
<form><select name="jadwal" id="jadwal" onchange="otb(this.value);"><option value="">-</option></select>
<div id="otb"></div></form>
<script>
function loadAjaxData(url, data, targetSelector, successCallback) {
    $.ajax({
        url: url,
        type: 'POST',
        data: data,
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        success: function(response) {
            if (targetSelector) {
                $(targetSelector).html(response);
            }
        }
    });
}
function ojd(val) {
    loadAjaxData('${BASE}/_jdaftar.php', { jdaftar: val }, '#ojd');
}
function otb(val) {
    document.getElementById("hpaket").disabled = true;
    loadAjaxData('${BASE}/_otb.php', { jadwal: val }, '#otb');
}
function pkt(val) {
    var j = document.getElementById("jadwal").value;
    var p = document.getElementById("paket").value;
    loadAjaxData('${BASE}/_pkt.php', { pkt: val, detail_paket: j + "." + p }, '#pkt');
}
</script>`;

// Legacy register form before ±22 Sep 2026: inline $.ajax / $.post calls.
const INLINE_AJAX_FORM = `
<form><select name="vjadwal" id="jadwal"><option value="">-</option></select></form>
<script>
function otb(val) {
  $.post('${BASE}/_otb.php', { jadwal: val }, function(data){ $("#otb").html(data); });
}
function pkt(val) {
  $.ajax({
    url: '${BASE}/_pkt.php',
    type: 'POST',
    data: { pkt: val },
    success: function(data){
      $("#pkt").html(data);
    }
  });
}
</script>`;

const extract = (html) => extractJsHandlers(cheerio.load(html), html);

test('finds the paket AJAX URL behind the loadAjaxData() wrapper', () => {
  const h = extract(LOAD_AJAX_DATA_FORM);
  assert.equal(h.jadwalOnchange, 'otb(this.value);');
  assert.equal(h.paketAjaxUrl, `${BASE}/_otb.php`);
  assert.equal(h.paketAjaxMethod, 'POST');
  assert.equal(h.paketAjaxParam, 'jadwal');
  assert.equal(h.paketAjaxSource, 'jadwal onchange → otb()');
});

test('catalogs wrapper calls so fallbacks see _otb/_pkt/_jdaftar', () => {
  const urls = extract(LOAD_AJAX_DATA_FORM).ajaxCalls.map(c => `${c.method} ${c.url.replace(BASE, '')}`);
  assert.deepEqual(urls.sort(), ['POST /_jdaftar.php', 'POST /_otb.php', 'POST /_pkt.php']);
});

test('otb() lookup works without the onchange attribute (idb-bound form)', () => {
  const html = LOAD_AJAX_DATA_FORM.replace(' onchange="otb(this.value);"', '');
  const h = extract(html);
  assert.equal(h.jadwalOnchange, null);
  assert.equal(h.paketAjaxUrl, `${BASE}/_otb.php`);
  assert.equal(h.paketAjaxSource, 'otb() function body');
});

test('still finds the paket AJAX URL in the older inline $.post form', () => {
  const h = extract(INLINE_AJAX_FORM);
  assert.equal(h.paketAjaxUrl, `${BASE}/_otb.php`);
  assert.equal(h.paketAjaxMethod, 'POST');
  assert.equal(h.paketAjaxParam, 'jadwal');
  assert.equal(h.paketAjaxSource, 'otb() function body');
});
