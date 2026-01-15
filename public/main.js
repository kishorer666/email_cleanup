// small helper
const $ = (s) => document.querySelector(s);

window.addEventListener('DOMContentLoaded', () => {
  const connectBtn = $('#connect');
  const logoutBtn = $('#logout');
  const profileDiv = $('#profile');
  const controls = $('#controls');
  const scanBtn = $('#scan');
  const queryInput = $('#query');
  const resultsDiv = $('#results');
  const actionsDiv = $('#actions');
  const deleteBtn = $('#delete');
  const modeSel = $('#mode');

  if (connectBtn) connectBtn.onclick = () => { window.location = '/auth/google' };
  if (logoutBtn) logoutBtn.onclick = async () => {
    await fetch('/api/logout');
    window.location.reload();
  }

  async function checkProfile(){
    try{
      const r = await fetch('/api/profile');
      // only parse JSON when content-type indicates JSON
      const contentType = r.headers.get('content-type') || '';
      if (!r.ok || !contentType.includes('application/json')) throw new Error('not logged in');
      const data = await r.json();
      // show profile and logout nicely
      const authRight = document.querySelector('.auth-right');
      if (authRight) authRight.style.display = 'flex';
      const authLeft = document.querySelector('.auth-left');
      if (authLeft) authLeft.style.display = 'none';
      profileDiv.innerHTML = `<div class="profile">${data.email || data.name}</div>`;
      controls.style.display='block';
    }catch(e){
      profileDiv.textContent = '';
      if (connectBtn) connectBtn.style.display='inline-block';
      if (logoutBtn) logoutBtn.style.display='none';
      if (controls) controls.style.display='none';
    }
  }

  checkProfile();

  // page history stack for prev support
  const pageHistory = [];
  let currentNextToken = null;

  scanBtn.onclick = async () => {
    let q = queryInput.value.trim();
    if (!q) return alert('Enter a query');
    // append date range to query if provided
    const from = $('#date-from').value;
    const to = $('#date-to').value;
    if (from) q += ` after:${from}`;
    if (to) q += ` before:${to}`;
    const fuzzyThreshold = Number($('#fuzzy-threshold').value) / 100.0;
    // update fuzzy value display
    $('#fuzzy-value').textContent = $('#fuzzy-threshold').value + '%';
    resultsDiv.innerHTML = '<div class="snippet">Scanning...</div>';
    const res = await fetch('/api/gmail/search', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q})});
    if (!res.ok) { resultsDiv.textContent = 'Scan failed'; return }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) { resultsDiv.textContent = 'Scan failed (non-json response)'; return }
    const {items, nextPageToken, dedupeSuggestions} = await res.json();
    // persist page tokens
    if (pageHistory.length === 0) pageHistory.push({query:q, token:null});
    currentNextToken = nextPageToken || null;
    if (!items || items.length===0) { resultsDiv.textContent = 'No messages found'; return }
    resultsDiv.innerHTML = '';
    const ul = document.createElement('ul');
    items.forEach(it=>{
      const li = document.createElement('li');
      const subject = (it.headers||[]).find(h=>h.name==='Subject')?.value || '(no subject)';
      const from = (it.headers||[]).find(h=>h.name==='From')?.value || '';
      const id = it.id;
      li.innerHTML = `
        <div style="flex:0 0 28px"><input type="checkbox" data-id="${id}" /></div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center"><strong>${subject}</strong><small class="snippet">${from}</small></div>
          <div class="snippet">${it.snippet || ''}</div>
        </div>
      `;
      ul.appendChild(li);
    });
    resultsDiv.appendChild(ul);
    // show pager if nextPageToken
    const pager = $('#pager');
    if (nextPageToken) {
      pager.style.display = 'flex';
      pager.dataset.next = nextPageToken;
    } else {
      pager.style.display = 'none';
      pager.dataset.next = '';
    }
    // show dedupe suggestions
    const dedupeDiv = $('#dedupe');
    dedupeDiv.innerHTML = '';
    if (dedupeSuggestions && dedupeSuggestions.length) {
      const title = document.createElement('div'); title.textContent = 'Duplicate suggestions'; title.style.marginBottom='8px'; title.style.color='var(--muted)';
      dedupeDiv.appendChild(title);
      dedupeSuggestions.forEach(d=>{
        const el = document.createElement('div'); el.className='dupe-item';
        el.innerHTML = `<div><strong>${d.subject||'(no subject)'}</strong><div class="snippet">${d.from||''}</div></div><div>${d.count} msgs <button class="btn" data-ids='${JSON.stringify(d.ids)}'>Mark</button></div>`;
        dedupeDiv.appendChild(el);
      });
    }

    // show top actions and pager
    $('#actions-top').style.display = 'flex';
    actionsDiv.style.display = 'block';
    // wire select-all
    const selectAll = $('#select-all');
    if (selectAll){ selectAll.checked = false; selectAll.onchange = () => { const boxes = resultsDiv.querySelectorAll('input[type=checkbox]'); boxes.forEach(b => b.checked = selectAll.checked); }; }
    // clicking any checkbox should update select-all
    resultsDiv.addEventListener('change', (e)=>{
      if (e.target && e.target.type === 'checkbox') {
        const boxes = resultsDiv.querySelectorAll('input[type=checkbox]');
        const checked = resultsDiv.querySelectorAll('input[type=checkbox]:checked');
        selectAll.checked = boxes.length === checked.length;
      }
    });
  }

  // pager handlers
  const prevBtn = $('#prev-page');
  const nextBtn = $('#next-page');
  nextBtn.onclick = async () => {
    const next = $('#pager').dataset.next;
    if (!next) return;
    const lastQuery = $('#query').value.trim();
    // push current token to history so prev can work
    pageHistory.push({query:lastQuery, token: next});
    const res = await fetch('/api/gmail/search', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:lastQuery,pageToken:next,pageSize:50,fuzzyThreshold:Number($('#fuzzy-threshold').value)/100})});
    if (!res.ok) return alert('Page load failed');
    const {items, nextPageToken, dedupeSuggestions} = await res.json();
    // render items (simple replace)
    $('#results').innerHTML = '';
    const ul = document.createElement('ul');
    items.forEach(it=>{ const li = document.createElement('li'); const subject = (it.headers||[]).find(h=>h.name==='Subject')?.value || '(no subject)'; const from = (it.headers||[]).find(h=>h.name==='From')?.value || ''; const id = it.id; li.innerHTML = `<div style="flex:0 0 28px"><input type="checkbox" data-id="${id}" /></div><div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><strong>${subject}</strong><small class="snippet">${from}</small></div><div class="snippet">${it.snippet || ''}</div></div>`; ul.appendChild(li); });
    $('#results').appendChild(ul);
    if (nextPageToken) { $('#pager').style.display='flex'; $('#pager').dataset.next = nextPageToken } else { $('#pager').style.display='none'; $('#pager').dataset.next = '' }
  };

  prevBtn.onclick = async () => {
    if (pageHistory.length <= 1) return alert('No previous page');
    // pop current
    pageHistory.pop();
    const prev = pageHistory[pageHistory.length-1];
    const res = await fetch('/api/gmail/search', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:prev.query,pageToken:prev.token,pageSize:50,fuzzyThreshold:Number($('#fuzzy-threshold').value)/100})});
    if (!res.ok) return alert('Prev page load failed');
    const {items, nextPageToken, dedupeSuggestions} = await res.json();
    $('#results').innerHTML=''; const ul=document.createElement('ul'); items.forEach(it=>{ const li=document.createElement('li'); const subject=(it.headers||[]).find(h=>h.name==='Subject')?.value || '(no subject)'; const from=(it.headers||[]).find(h=>h.name==='From')?.value||''; const id=it.id; li.innerHTML=`<div style="flex:0 0 28px"><input type="checkbox" data-id="${id}" /></div><div style="flex:1"><div style="display:flex;justify-content:space-between;align-items:center"><strong>${subject}</strong><small class="snippet">${from}</small></div><div class="snippet">${it.snippet || ''}</div></div>`; ul.appendChild(li); }); $('#results').appendChild(ul);
    if (nextPageToken) { $('#pager').style.display='flex'; $('#pager').dataset.next = nextPageToken } else { $('#pager').style.display='none'; $('#pager').dataset.next = '' }
    // update dedupe and actions
    $('#dedupe').innerHTML=''; if (dedupeSuggestions && dedupeSuggestions.length){ const title=document.createElement('div'); title.textContent='Duplicate suggestions'; title.style.marginBottom='8px'; title.style.color='var(--muted)'; $('#dedupe').appendChild(title); dedupeSuggestions.forEach(d=>{ const el=document.createElement('div'); el.className='dupe-item'; el.innerHTML=`<div><strong>${d.subject||'(no subject)'}</strong><div class="snippet">${d.from||''}</div></div><div>${d.count} msgs <button class="btn" data-ids='${JSON.stringify(d.ids)}'>Mark</button></div>`; $('#dedupe').appendChild(el); }); }
  };

  // dedupe mark buttons
  $('#dedupe').addEventListener('click', (e)=>{
    if (e.target && e.target.tagName==='BUTTON'){
      const ids = JSON.parse(e.target.dataset.ids);
      ids.forEach(id=>{ const cb = document.querySelector(`input[data-id="${id}"]`); if (cb) cb.checked = true; });
    }
  });

  // Delete / confirm flow
  const dryRunChk = $('#dry-run');
  // bind top delete button
  const topDeleteBtn = document.getElementById('delete');
  topDeleteBtn.onclick = async () => {
    const checked = Array.from(resultsDiv.querySelectorAll('input[type=checkbox]:checked')).map(c=>c.dataset.id);
    if (checked.length===0) return alert('Select messages to delete');
    $('#confirm-summary').textContent = `${checked.length} messages selected. Mode: ${$('#mode').value}. Dry-run: ${dryRunChk.checked}`;
    const samplesDiv = $('#confirm-samples'); samplesDiv.innerHTML = '';
    const boxes = Array.from(resultsDiv.querySelectorAll('input[type=checkbox]')).filter(b=>b.checked).slice(0,5);
    boxes.forEach(b=>{ const li = b.closest('li').cloneNode(true); li.style.borderBottom='none'; samplesDiv.appendChild(li); });
    $('#confirm-modal').style.display='flex';
  };

  $('#confirm-cancel').onclick = ()=>{ $('#confirm-modal').style.display='none' };
  $('#confirm-ok').onclick = async ()=>{
    $('#confirm-modal').style.display='none';
    const checked = Array.from(resultsDiv.querySelectorAll('input[type=checkbox]:checked')).map(c=>c.dataset.id);
    deleteBtn.disabled = true;
    const mode = $('#mode').value;
    const dryRun = $('#dry-run').checked;
    if ($('#bg-job').checked && !dryRun) {
      // start background job
      const r = await fetch('/api/gmail/delete-job',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:checked,mode})});
      const {jobId} = await r.json();
      // poll progress
      const poll = setInterval(async ()=>{
        const s = await fetch('/api/jobs/'+jobId).then(r=>r.json());
        console.log('job',s);
        if (s.status==='done' || s.status==='cancelled') { clearInterval(poll); alert('Background job finished: '+s.status); deleteBtn.disabled=false; resultsDiv.innerHTML=''; $('#actions-top').style.display='none'; }
      },1000);
      alert('Background job started: '+jobId);
    } else {
      const res = await fetch('/api/gmail/delete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:checked,mode,dryRun})});
      deleteBtn.disabled = false;
      if (!res.ok) return alert('Delete failed');
      const data = await res.json();
      alert(`Operation complete: ${data.results.length} items processed`);
      resultsDiv.innerHTML=''; $('#actions-top').style.display='none';
    }
  };
  
});
