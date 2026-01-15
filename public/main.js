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
      profileDiv.textContent = `Connected: ${data.email || data.name}`;
      connectBtn.style.display='none';
      logoutBtn.style.display='inline-block';
      controls.style.display='block';
    }catch(e){
      profileDiv.textContent = '';
      if (connectBtn) connectBtn.style.display='inline-block';
      if (logoutBtn) logoutBtn.style.display='none';
      if (controls) controls.style.display='none';
    }
  }

  checkProfile();

  scanBtn.onclick = async () => {
    const q = queryInput.value.trim();
    if (!q) return alert('Enter a query');
    resultsDiv.innerHTML = 'Scanning...';
    const res = await fetch('/api/gmail/search', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query:q})});
    if (!res.ok) { resultsDiv.textContent = 'Scan failed'; return }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) { resultsDiv.textContent = 'Scan failed (non-json response)'; return }
    const {items} = await res.json();
    if (!items || items.length===0) { resultsDiv.textContent = 'No messages found'; return }
    resultsDiv.innerHTML = '';
    const ul = document.createElement('ul');
    items.forEach(it=>{
      const li = document.createElement('li');
      const subject = (it.headers||[]).find(h=>h.name==='Subject')?.value || '(no subject)';
      const from = (it.headers||[]).find(h=>h.name==='From')?.value || '';
      li.innerHTML = `<input type="checkbox" data-id="${it.id}" /> <strong>${subject}</strong> — ${from} <br/><small>${it.snippet || ''}</small>`;
      ul.appendChild(li);
    });
    resultsDiv.appendChild(ul);
    actionsDiv.style.display = 'block';
  }

  deleteBtn.onclick = async () => {
    const checked = Array.from(resultsDiv.querySelectorAll('input[type=checkbox]:checked')).map(c=>c.dataset.id);
    if (checked.length===0) return alert('Select messages to delete');
    if (!confirm(`Really delete ${checked.length} messages?`)) return;
    deleteBtn.disabled = true;
    const mode = modeSel.value;
    const res = await fetch('/api/gmail/delete', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ids:checked,mode})});
    deleteBtn.disabled = false;
    if (!res.ok) return alert('Delete failed');
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return alert('Delete failed (non-json response)');
    const data = await res.json();
    alert('Operation complete');
    checkProfile();
    resultsDiv.innerHTML = '';
    actionsDiv.style.display='none';
  }
});
