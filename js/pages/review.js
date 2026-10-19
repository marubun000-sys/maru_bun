import { state, saveSettings } from '../state.js';
import { $, esc, toast, ico, errMsg } from '../utils.js';

export async function render(root) {
  const link = () => state.settings.review_link || '';
  root.innerHTML = `<div class="page-head"><h1>Google Review</h1></div>
    <div class="card" style="max-width:640px">
      <p class="muted" style="margin-top:0">Paste your shop's Google review link here. It is added at the bottom of every bill sent on WhatsApp so customers can rate you. Printed bills do not show it.</p>
      <label>Google review link<input id="lnk" type="url" placeholder="https://g.page/r/XXXXXXXX/review" value="${esc(link())}"></label>
      <div class="row wrap">
        <button class="btn" id="save">Save link</button>
        <button class="btn ghost" id="test">Open link</button>
        <button class="btn ghost" id="copy">Copy</button>
        <button class="btn ghost" id="clear">Remove</button>
      </div>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <h2>How to get the link</h2>
      <ol class="muted" style="padding-left:18px;margin:0">
        <li>Open Google Maps and find your business profile (or open the Google Business Profile app).</li>
        <li>Tap Share review form / Get more reviews.</li>
        <li>Copy the link (it looks like https://g.page/r/…/review) and paste it above.</li>
      </ol>
      <hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
      <h2>Preview of the WhatsApp bill ending</h2>
      <div id="pv" style="background:#0f2a1c;border-radius:12px;padding:12px;white-space:pre-wrap;font-size:13px"></div>
    </div>`;
  const pv = () => { const l = $('#lnk', root).value.trim(); $('#pv', root).textContent = (l ? `⭐ Enjoyed it? Rate us on Google:\n${l}\n\n` : '') + (state.settings.bill_footer || 'Thank you!'); };
  pv();
  $('#lnk', root).oninput = pv;
  $('#save', root).onclick = async () => {
    const v = $('#lnk', root).value.trim();
    if (v && !/^https?:\/\//i.test(v)) return toast('Link must start with https://', 'err');
    try { await saveSettings({ review_link: v }); toast('Review link saved'); } catch (e) { toast(errMsg(e), 'err'); }
  };
  $('#test', root).onclick = () => { const v = $('#lnk', root).value.trim(); if (!v) return toast('Enter the link first', 'err'); window.open(v, '_blank', 'noopener'); };
  $('#copy', root).onclick = async () => { try { await navigator.clipboard.writeText($('#lnk', root).value.trim()); toast('Copied'); } catch { toast('Could not copy', 'err'); } };
  $('#clear', root).onclick = async () => { $('#lnk', root).value = ''; try { await saveSettings({ review_link: '' }); toast('Removed'); pv(); } catch (e) { toast(errMsg(e), 'err'); } };
}
