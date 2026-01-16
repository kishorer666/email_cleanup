// small helper
const $ = (s) => document.querySelector(s);

// Search history management (keep only last 5)
const MAX_HISTORY = 5;

function loadSearchHistory() {
  const stored = localStorage.getItem('searchHistory');
  return stored ? JSON.parse(stored) : [];
}

function saveSearchHistory(history) {
  localStorage.setItem('searchHistory', JSON.stringify(history.slice(-MAX_HISTORY)));
}

function addToHistory(query) {
  const history = loadSearchHistory();
  // Remove duplicate if exists
  const filtered = history.filter(h => h !== query);
  filtered.push(query);
  // Keep only last 5
  if (filtered.length > MAX_HISTORY) {
    filtered.shift();
  }
  saveSearchHistory(filtered);
  displayHistory();
}

function displayHistory() {
  const history = loadSearchHistory();
  const historyDiv = $('#search-history');
  const historyList = $('#history-list');

  if (!historyDiv || !historyList) return;

  if (history.length === 0) {
    historyDiv.style.display = 'none';
    return;
  }

  historyDiv.style.display = 'block';
  historyList.innerHTML = '';

  history.forEach(item => {
    const tag = document.createElement('button');
    tag.className = 'history-tag';
    tag.type = 'button';
    tag.textContent = item;
    tag.title = item;
    tag.onclick = (e) => {
      e.preventDefault();
      const queryInput = $('#query');
      if (queryInput) {
        queryInput.value = item;
        queryInput.focus();
      }
    };
    historyList.appendChild(tag);
  });
}

// Refresh duplicate suggestions based on remaining results
function refreshDedupeFromResults() {
  const resultsDiv = $('#results');
  const dedupeDiv = $('#dedupe');
  if (!resultsDiv || !dedupeDiv) return;

  // Get all remaining items
  const items = Array.from(resultsDiv.querySelectorAll('li'));
  if (items.length === 0) {
    dedupeDiv.innerHTML = '';
    return;
  }

  // Extract data for similarity checking
  const messages = items.map(li => ({
    id: li.dataset.id,
    subject: li.querySelector('.snippet')?.textContent || '',
    from: li.textContent.split('\n')[1]?.trim() || ''
  }));

  // Simple deduplication based on matching subject and from
  const dupeMap = {};
  messages.forEach(msg => {
    const key = `${msg.subject}|${msg.from}`;
    if (!dupeMap[key]) {
      dupeMap[key] = [];
    }
    dupeMap[key].push(msg);
  });

  // Build dedupe suggestions for items with dupes
  const suggestions = [];
  Object.values(dupeMap).forEach(group => {
    if (group.length > 1) {
      suggestions.push({
        subject: group[0].subject,
        from: group[0].from,
        count: group.length,
        ids: group.map(m => m.id)
      });
    }
  });

  // Render suggestions
  dedupeDiv.innerHTML = '';
  if (suggestions.length > 0) {
    const title = document.createElement('div');
    title.textContent = 'Duplicate suggestions';
    title.style.marginBottom = '8px';
    title.style.color = 'var(--muted)';
    dedupeDiv.appendChild(title);

    suggestions.forEach(d => {
      const el = document.createElement('div');
      el.className = 'dupe-item';
      el.innerHTML = `<div><strong>${d.subject || '(no subject)'}</strong><div class="snippet">${d.from || ''}</div></div><div>${d.count} msgs <button class="btn" data-ids='${JSON.stringify(d.ids)}'>Mark</button></div>`;
      dedupeDiv.appendChild(el);
    });
  }
}

// Modal utility function to replace traditional alerts
function showModal(title, message) {
  const titleEl = $('#info-modal-title');
  const messageEl = $('#info-modal-message');
  if (titleEl) titleEl.textContent = title;
  if (messageEl) messageEl.textContent = message;
  const infoModal = $('#info-modal');
  if (infoModal) infoModal.style.display = 'flex';
}

window.addEventListener('DOMContentLoaded', () => {
  // Setup info modal button
  const infoModalOk = $('#info-modal-ok');
  if (infoModalOk) {
    infoModalOk.onclick = () => {
      const infoModal = $('#info-modal');
      if (infoModal) infoModal.style.display = 'none';
    };
  }

  const connectBtn = $('#connect');
  const logoutBtn = $('#logout');
  const profileDiv = $('#profile');
  const controls = $('#controls');
  const scanBtn = $('#scan');
  const queryInput = $('#query');
  const resultsDiv = $('#results');
  const actionsDiv = $('#actions-top');
  const deleteBtn = $('#delete');
  const modeSel = $('#mode');

  // Ensure "To" and "From" date cannot be set in the future by setting their max to today
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dateFromInput = $('#date-from');
  if (dateFromInput) {
    dateFromInput.max = today;
    if (dateFromInput.value && dateFromInput.value > today) dateFromInput.value = today;
    // Ensure calendar picker opens on click anywhere on the field
    dateFromInput.addEventListener('click', () => {
      dateFromInput.showPicker?.();
    });
    dateFromInput.addEventListener('focus', () => {
      dateFromInput.showPicker?.();
    });
  }
  const dateToInput = $('#date-to');
  if (dateToInput) {
    dateToInput.max = today;
    if (dateToInput.value && dateToInput.value > today) dateToInput.value = today;
    // Ensure calendar picker opens on click anywhere on the field
    dateToInput.addEventListener('click', () => {
      dateToInput.showPicker?.();
    });
    dateToInput.addEventListener('focus', () => {
      dateToInput.showPicker?.();
    });
  }

  if (connectBtn) connectBtn.onclick = () => { window.location = '/auth/google' };
  if (logoutBtn) logoutBtn.onclick = async () => {
    await fetch('/api/logout');
    window.location.reload();
  }

  async function checkProfile() {
    try {
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
      controls.style.display = 'block';
      displayHistory();
    } catch (e) {
      profileDiv.textContent = '';
      if (connectBtn) connectBtn.style.display = 'inline-block';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (controls) controls.style.display = 'none';
    }
  }

  checkProfile();

  // ...existing code...
  // page cache for efficient pagination
  const pageCache = {};
  let currentPageIndex = 0;
  let currentQuery = null;
  let currentFuzzyThreshold = 0;
  // ...existing code...

  // ensure fuzzy value display initializes
  const fuzzyInput = $('#fuzzy-threshold');
  const fuzzyValue = $('#fuzzy-value');
  if (fuzzyInput && fuzzyValue) fuzzyValue.textContent = fuzzyInput.value + '%';
  fuzzyInput?.addEventListener('input', () => { if (fuzzyValue) fuzzyValue.textContent = fuzzyInput.value + '%'; });

  // Pagination settings
  const PAGE_SIZE = 15;

  scanBtn.onclick = async () => {
    let q = queryInput.value.trim();
    if (!q) {
      queryInput.classList.add('input-error');
      queryInput.focus();
      setTimeout(() => queryInput.classList.remove('input-error'), 3000);
      return;
    }
    // Add to search history
    addToHistory(q);
    // append date range to query if provided
    const from = $('#date-from').value;
    const to = $('#date-to').value;
    if (from) q += ` after:${from}`;
    if (to) q += ` before:${to}`;
    const fuzzyThreshold = Number($('#fuzzy-threshold').value) / 100.0;
    resultsDiv.innerHTML = '<div class="snippet">Scanning...</div>';
    $('#actions-top').style.display = 'none';
    $('#dedupe').innerHTML = '';
    // Reset pagination cache
    Object.keys(pageCache).forEach(key => delete pageCache[key]);
    currentPageIndex = 0;
    currentQuery = q;
    currentFuzzyThreshold = fuzzyThreshold;
    const res = await fetch('/api/gmail/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: q, fuzzyThreshold, pageSize: PAGE_SIZE }) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errorMsg = data.message || 'Search failed';
      resultsDiv.textContent = errorMsg;
      if (data.error === 'auth-expired') {
        showModal('Session Expired', 'Your session has expired. Please log out and log in again.');
        window.location = '/';
      }
      return;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) { resultsDiv.textContent = 'Scan failed (non-json response)'; return }
    const { items, nextPageToken, dedupeSuggestions } = await res.json();
    if (!items || items.length === 0) {
      resultsDiv.textContent = 'No messages found';
      $('#actions-top').style.display = 'none !important';
      $('#pager').style.display = 'none';
      $('#dedupe').innerHTML = '';
      return;
    }
    // Store first page in cache
    pageCache[0] = { items, nextPageToken, dedupeSuggestions };
    renderPage(0, items, dedupeSuggestions);
  };

  function renderPage(pageIndex, items, dedupeSuggestions) {
    resultsDiv.innerHTML = '';
    $('#dedupe').innerHTML = '';
    const ul = document.createElement('ul');
    items.forEach(it => {
      const li = document.createElement('li');
      const subject = (it.headers || []).find(h => h.name === 'Subject')?.value || '(no subject)';
      const from = (it.headers || []).find(h => h.name === 'From')?.value || '';
      const id = it.id;
      li.dataset.id = id;
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

    // show pager controls
    const pager = $('#pager');
    const hasNextPage = pageCache[pageIndex] && pageCache[pageIndex].nextPageToken;
    const hasPrevPage = pageIndex > 0;
    if (hasNextPage || hasPrevPage) {
      pager.style.display = 'flex';
    } else {
      pager.style.display = 'none';
    }

    // show dedupe suggestions
    const dedupeDiv = $('#dedupe');
    if (dedupeSuggestions && dedupeSuggestions.length) {
      const title = document.createElement('div'); title.textContent = 'Duplicate suggestions'; title.style.marginBottom = '8px'; title.style.color = 'var(--muted)';
      dedupeDiv.appendChild(title);
      dedupeSuggestions.forEach(d => {
        const el = document.createElement('div'); el.className = 'dupe-item';
        el.innerHTML = `<div><strong>${d.subject || '(no subject)'}</strong><div class="snippet">${d.from || ''}</div></div><div>${d.count} msgs <button class="btn" data-ids='${JSON.stringify(d.ids)}'>Mark</button></div>`;
        dedupeDiv.appendChild(el);
      });
    }

    // show top actions
    $('#actions-top').style.display = 'flex';
    if (actionsDiv) actionsDiv.style.display = 'flex';

    // wire select-all
    const selectAll = $('#select-all');
    if (selectAll) { selectAll.checked = false; selectAll.onchange = () => { const boxes = resultsDiv.querySelectorAll('input[type=checkbox]'); boxes.forEach(b => b.checked = selectAll.checked); }; }

    // ensure we only add one change listener
    if (!resultsDiv._hasChangeListener) {
      resultsDiv.addEventListener('change', (e) => {
        if (e.target && e.target.type === 'checkbox') {
          const boxes = resultsDiv.querySelectorAll('input[type=checkbox]');
          const checked = resultsDiv.querySelectorAll('input[type=checkbox]:checked');
          selectAll.checked = boxes.length === checked.length;
        }
      });
      resultsDiv._hasChangeListener = true;
    }
  }

  // pager handlers
  const prevBtn = $('#prev-page');
  const nextBtn = $('#next-page');
  nextBtn.onclick = async () => {
    const nextPageIndex = currentPageIndex + 1;
    if (!pageCache[currentPageIndex] || !pageCache[currentPageIndex].nextPageToken) return;

    // Check if next page is already cached
    if (pageCache[nextPageIndex]) {
      currentPageIndex = nextPageIndex;
      renderPage(currentPageIndex, pageCache[nextPageIndex].items, pageCache[nextPageIndex].dedupeSuggestions);
      return;
    }

    // Fetch next page from server
    const nextToken = pageCache[currentPageIndex].nextPageToken;
    const res = await fetch('/api/gmail/search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: currentQuery, pageToken: nextToken, pageSize: PAGE_SIZE, fuzzyThreshold: currentFuzzyThreshold }) });
    if (!res.ok) {
      showModal('Load Failed', 'Failed to load next page. Please try again.');
      return;
    }
    const { items, nextPageToken, dedupeSuggestions } = await res.json();

    // Cache the new page
    pageCache[nextPageIndex] = { items, nextPageToken, dedupeSuggestions };
    currentPageIndex = nextPageIndex;
    renderPage(currentPageIndex, items, dedupeSuggestions);
  };

  prevBtn.onclick = async () => {
    if (currentPageIndex <= 0) {
      showModal('No Previous Page', 'You are already on the first page.');
      return;
    }
    currentPageIndex--;
    const page = pageCache[currentPageIndex];
    if (page) {
      renderPage(currentPageIndex, page.items, page.dedupeSuggestions);
    }
  };

  // dedupe mark buttons
  $('#dedupe').addEventListener('click', (e) => {
    if (e.target && e.target.tagName === 'BUTTON') {
      const ids = JSON.parse(e.target.dataset.ids);
      ids.forEach(id => { const cb = document.querySelector(`input[data-id="${id}"]`); if (cb) cb.checked = true; });
    }
  });

  // Delete / confirm flow
  const dryRunChk = $('#dry-run');
  // bind top delete button
  const topDeleteBtn = document.getElementById('delete');
  topDeleteBtn.onclick = async () => {
    const checked = Array.from(resultsDiv.querySelectorAll('input[type=checkbox]:checked')).map(c => c.dataset.id);
    if (checked.length === 0) {
      showModal('No Selection', 'Please select at least one message to delete.');
      return;
    }
    const dryRun = dryRunChk.checked;
    let summary = `${checked.length} messages selected. Mode: ${$('#mode').value}.`;
    if (dryRun) summary += ' This is a test run (dry-run): no emails will be deleted.';
    $('#confirm-summary').textContent = summary;
    const samplesDiv = $('#confirm-samples'); samplesDiv.innerHTML = '';
    const boxes = Array.from(resultsDiv.querySelectorAll('input[type=checkbox]')).filter(b => b.checked).slice(0, 5);
    boxes.forEach(b => { const li = b.closest('li').cloneNode(true); li.style.borderBottom = 'none'; samplesDiv.appendChild(li); });
    $('#confirm-modal').style.display = 'flex';
  };

  $('#confirm-cancel').onclick = () => { $('#confirm-modal').style.display = 'none' };
  $('#confirm-ok').onclick = async () => {
    $('#confirm-modal').style.display = 'none';
    const checked = Array.from(resultsDiv.querySelectorAll('input[type=checkbox]:checked')).map(c => c.dataset.id);
    deleteBtn.disabled = true;
    const mode = $('#mode').value;
    const dryRun = $('#dry-run').checked;
    if (checked.length === 0) {
      showModal('No Selection', 'Please select at least one message to delete.');
      deleteBtn.disabled = false;
      return;
    }
    if (dryRun) {
      // Simulate dry-run result
      const results = checked.map(id => ({ id, status: 'dry-run' }));
      showModal('Dry-Run Complete', `Test run complete: ${results.length} items would be processed. No emails were deleted.`);
      deleteBtn.disabled = false;
      return;
    }
    if ($('#bg-job').checked && !dryRun) {
      // start background job
      const r = await fetch('/api/gmail/delete-job', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: checked, mode }) });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        const errorMsg = data.message || 'Failed to start background job';
        showModal('Error', errorMsg);
        if (data.error === 'auth-expired') window.location = '/';
        deleteBtn.disabled = false;
        return;
      }
      const { jobId } = await r.json();
      // poll progress
      const poll = setInterval(async () => {
        const s = await fetch('/api/jobs/' + jobId).then(r => r.json());
        console.log('job', s);
        if (s.status === 'done' || s.status === 'cancelled') {
          clearInterval(poll);
          showModal('Job Complete', 'Background job finished: ' + s.status);
          deleteBtn.disabled = false;
          // Remove deleted items from results
          checked.forEach(id => {
            const li = resultsDiv.querySelector(`li[data-id="${id}"]`);
            if (li) li.remove();
          });
          // Refresh duplicate suggestions
          const remainingIds = Array.from(resultsDiv.querySelectorAll('li')).map(li => li.dataset.id);
          if (remainingIds.length === 0) {
            resultsDiv.innerHTML = '';
            $('#actions-top').style.display = 'none';
            $('#dedupe').innerHTML = '';
          } else {
            refreshDedupeFromResults();
          }
        }
      }, 1000);
      showModal('Job Started', 'Background job started: ' + jobId + '. Processing will continue in the background.');
    } else {
      const res = await fetch('/api/gmail/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: checked, mode, dryRun }) });
      deleteBtn.disabled = false;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorMsg = data.message || 'Delete failed';
        showModal('Error', errorMsg);
        if (data.error === 'auth-expired') window.location = '/';
        return;
      }
      const data = await res.json();
      showModal('Success', `Operation complete: ${data.results.length} items processed`);

      // Remove deleted items from results
      checked.forEach(id => {
        const li = resultsDiv.querySelector(`li[data-id="${id}"]`);
        if (li) li.remove();
      });

      // Refresh duplicate suggestions based on remaining items
      const remainingItems = Array.from(resultsDiv.querySelectorAll('li'));
      if (remainingItems.length === 0) {
        resultsDiv.innerHTML = '';
        $('#actions-top').style.display = 'none';
        $('#dedupe').innerHTML = '';
      } else {
        refreshDedupeFromResults();
      }
    }
  };

});
