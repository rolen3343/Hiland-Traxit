document.addEventListener('DOMContentLoaded', () => {
  const rowsEl = document.getElementById('rows');
  const addRowBtn = document.getElementById('addRow');
  const submitBtn = document.getElementById('submit');
  const entriesEl = document.getElementById('entries');
  const dateInput = document.getElementById('date');
  const runsheetInput = document.getElementById('runsheetImage');
  const scanBtn = document.getElementById('scanRunsheet');
  const ocrStatus = document.getElementById('ocrStatus');
  const imagePreview = document.getElementById('imagePreview');
  const gallonsPerHourInput = document.getElementById('gallonsPerHour');
  const startTimeEl = document.getElementById('startTime');
  const downtimeToggleBtn = document.getElementById('downtimeToggle');
  const downtimeStatusEl = document.getElementById('downtimeStatus');
  const clockInBtn = document.getElementById('clockIn');
  const clockOutBtn = document.getElementById('clockOut');
  
  let isDowntime = false;
  let downtimeStart = null;
  let totalDowntimeMs = 0;
  let shiftStartTime = null;
  let isClockedIn = false;

  let BRANDS = [];

  // Load saved settings
  function loadSettings(){
    const saved = localStorage.getItem('hiland-settings');
    if(saved){
      try{
        const s = JSON.parse(saved);
        if(s.date) dateInput.value = s.date;
        if(s.gallonsPerHour) gallonsPerHourInput.value = s.gallonsPerHour;
        if(s.shiftStartTime) shiftStartTime = new Date(parseInt(s.shiftStartTime));
        if(s.isClockedIn) isClockedIn = s.isClockedIn === 'true';
      }catch(e){}
    }
    updateClockButtons();
  }

  function saveSettings(){
    const settings = {
      date: dateInput.value,
      gallonsPerHour: gallonsPerHourInput.value,
      shiftStartTime: shiftStartTime ? shiftStartTime.getTime().toString() : '',
      isClockedIn: isClockedIn.toString(),
      isDowntime: isDowntime.toString(),
      downtimeStart: downtimeStart ? downtimeStart.getTime().toString() : '',
      totalDowntimeMs: totalDowntimeMs.toString()
    };
    localStorage.setItem('hiland-settings', JSON.stringify(settings));
    // Also save to server for cross-device sync
    return fetch('/api/settings', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(settings)
    }).catch(()=>{});
  }

  function updateClockButtons(){
    if(isClockedIn){
      if(clockInBtn) clockInBtn.style.display = 'none';
      if(clockOutBtn) clockOutBtn.style.display = 'inline-block';
    } else {
      if(clockInBtn) clockInBtn.style.display = 'inline-block';
      if(clockOutBtn) clockOutBtn.style.display = 'none';
    }
  }

  function syncSettings(){
    fetch('/api/settings')
      .then(r=>r.json())
      .then(s=>{
        if(s.date && s.date !== dateInput.value) dateInput.value = s.date;
        if(s.gallonsPerHour && s.gallonsPerHour !== gallonsPerHourInput.value){
          gallonsPerHourInput.value = s.gallonsPerHour;
          refreshEntries();
        }
        if(s.shiftStartTime){
          const serverStart = new Date(parseInt(s.shiftStartTime));
          if(!shiftStartTime || serverStart.getTime() !== shiftStartTime.getTime()){
            shiftStartTime = serverStart;
            refreshEntries();
          }
        }
        if(s.isClockedIn !== undefined){
          const serverClockedIn = s.isClockedIn === 'true';
          if(serverClockedIn !== isClockedIn){
            isClockedIn = serverClockedIn;
            updateClockButtons();
          }
        }
        // Sync downtime state
        if(s.isDowntime !== undefined){
          const serverDowntime = s.isDowntime === 'true';
          if(serverDowntime !== isDowntime){
            isDowntime = serverDowntime;
            if(isDowntime){
              downtimeStart = s.downtimeStart ? new Date(parseInt(s.downtimeStart)) : new Date();
              totalDowntimeMs = parseInt(s.totalDowntimeMs || 0);
              if(downtimeToggleBtn){
                downtimeToggleBtn.textContent = '▶️ End Downtime';
                downtimeToggleBtn.classList.add('downtime-active');
              }
              if(downtimeStatusEl){
                downtimeStatusEl.style.display = 'block';
                downtimeStatusEl.textContent = '⚠️ DOWNTIME - Shift Paused';
              }
            } else {
              downtimeStart = null;
              totalDowntimeMs = parseInt(s.totalDowntimeMs || 0);
              if(downtimeToggleBtn){
                downtimeToggleBtn.textContent = '⏸️ Start Downtime';
                downtimeToggleBtn.classList.remove('downtime-active');
              }
              if(downtimeStatusEl) downtimeStatusEl.style.display = 'none';
            }
            refreshEntries();
          }
        }
      })
      .catch(()=>{});
  }

  loadSettings();

  // Refresh button
  const refreshBtn = document.getElementById('refreshBtn');
  if(refreshBtn){
    refreshBtn.addEventListener('click', ()=>{
      refreshBtn.disabled = true;
      refreshBtn.textContent = '🔄 Refreshing...';
      refreshEntries();
      syncSettings();
      setTimeout(()=>{
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh';
      }, 1000);
    });
  }

  // Menu toggle
  const menuToggle = document.getElementById('menuToggle');
  const menuDropdown = document.getElementById('menuDropdown');
  if(menuToggle && menuDropdown){
    menuToggle.addEventListener('click', ()=>{
      menuDropdown.style.display = menuDropdown.style.display === 'none' ? 'block' : 'none';
    });
    // Close menu when clicking outside
    document.addEventListener('click', (e)=>{
      if(!menuToggle.contains(e.target) && !menuDropdown.contains(e.target)){
        menuDropdown.style.display = 'none';
      }
    });
  }

  // Dark mode toggle
  const darkModeToggle = document.getElementById('darkModeToggle');
  const savedDarkMode = localStorage.getItem('darkMode') === 'true';
  if(savedDarkMode){
    document.body.classList.add('dark-mode');
    if(darkModeToggle) darkModeToggle.textContent = '☀️ Light Mode';
  }
  if(darkModeToggle){
    darkModeToggle.addEventListener('click', ()=>{
      document.body.classList.toggle('dark-mode');
      const isDark = document.body.classList.contains('dark-mode');
      darkModeToggle.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
      localStorage.setItem('darkMode', isDark);
      if(menuDropdown) menuDropdown.style.display = 'none';
    });
  }

  fetch('/api/brands')
    .then(r => r.json())
    .then(b => { BRANDS = b; addRow(); refreshEntries(); syncSettings(); })
    .catch(()=>{ BRANDS = []; addRow(); refreshEntries(); });

  function makeBrandOptions() {
    return BRANDS.map(x => `<option value="${x.name}">${x.name}</option>`).join('');
  }

  function makeSubtypeOptions(brandName){
    const b = BRANDS.find(x=>x.name===brandName);
    if(!b) return '<option></option>';
    return b.sub.map(s=>`<option value="${s}">${s}</option>`).join('');
  }

  function subtypeClass(sub){
    if(!sub) return '';
    const s = sub.toLowerCase();
    if(s.includes('whole')) return 'sub-whole';
    if(s.includes("2%") || s.includes('2%')) return 'sub-2pct';
    if(s.includes("1%") || s.includes('1%')) return 'sub-1pct';
    if(s.includes('skim')) return 'sub-skim';
    return '';
  }

  function addRow(pref){
    const id = Date.now()+Math.random();
    const div = document.createElement('div');
    div.className = 'row';
    div.dataset.id = id;
    div.innerHTML = `
      <select class="brand">${makeBrandOptions()}</select>
      <select class="subtype"></select>
      <select class="size">
        <option>Gallon</option>
        <option>Half Gallon</option>
        <option>Quart</option>
      </select>
      <input class="quantity" type="number" min="0" value="0">
      <label class="exclude"><input type="checkbox" class="excludeBox"> Exclude from run sheet</label>
      <div class="calc"></div>
      <button class="remove">×</button>
    `;
    rowsEl.appendChild(div);
    const brandSel = div.querySelector('.brand');
    const subtypeSel = div.querySelector('.subtype');
    if(pref && pref.brand) brandSel.value = pref.brand;
    subtypeSel.innerHTML = makeSubtypeOptions(brandSel.value);
    if(pref && pref.subtype) subtypeSel.value = pref.subtype;
    if(pref && pref.size) div.querySelector('.size').value = pref.size;
    if(pref && typeof pref.quantity !== 'undefined') div.querySelector('.quantity').value = pref.quantity;
    if(pref && typeof pref.exclude !== 'undefined') div.querySelector('.excludeBox').checked = !!pref.exclude;

    const qtyInput = div.querySelector('.quantity');
    const calcEl = div.querySelector('.calc');
    function updateCalc(){
      const qty = Math.max(0, parseInt(qtyInput.value||0));
        const crates = Math.ceil(qty / 4);
        // stacks are vertical columns of crates
        const stacks6 = Math.ceil(crates / 6);
        const stacks7 = Math.ceil(crates / 7);
        // rows when placing 13 stacks per row
        const rows6 = Math.ceil(stacks6 / 13);
        const rows7 = Math.ceil(stacks7 / 13);
        const full6 = Math.floor(crates / 6);
        const rem6 = crates % 6;
        const full7 = Math.floor(crates / 7);
        const rem7 = crates % 7;
        const s6 = `${stacks6} stacks@6h — ${rows6} rows (13/row)` + (rem6? ` — ${full6} full, 1 partial ${rem6} crates` : ` — ${full6} full`);
        const s7 = `${stacks7} stacks@7h — ${rows7} rows (13/row)` + (rem7? ` — ${full7} full, 1 partial ${rem7} crates` : ` — ${full7} full`);
        calcEl.textContent = `${crates} crates — ${s6} — ${s7}`;
    }
    qtyInput.addEventListener('input', updateCalc);
    updateCalc();

    // apply subtype color class to the whole row and calc area
    function applySubtypeClass(){
      const cls = subtypeClass(subtypeSel.value);
      div.classList.remove('sub-whole','sub-2pct','sub-1pct','sub-skim');
      calcEl.classList.remove('sub-whole','sub-2pct','sub-1pct','sub-skim');
      if(cls){ div.classList.add(cls); calcEl.classList.add(cls); }
    }
    applySubtypeClass();

    brandSel.addEventListener('change', ()=>{
      subtypeSel.innerHTML = makeSubtypeOptions(brandSel.value);
      applySubtypeClass();
    });
    subtypeSel.addEventListener('change', ()=> applySubtypeClass());
    div.querySelector('.remove').addEventListener('click', ()=>div.remove());
  }

  addRowBtn.addEventListener('click', ()=> addRow());

  // Show image preview when file is selected
  if(runsheetInput){
    runsheetInput.addEventListener('change', (e)=>{
      if(imagePreview && e.target.files && e.target.files.length > 0){
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev)=>{
          imagePreview.innerHTML = `<div><img src="${ev.target.result}" style="max-width:100%; max-height:300px; border:1px solid #ccc; border-radius:4px;"><br><small>Selected: ${file.name}</small></div>`;
        };
        reader.readAsDataURL(file);
        if(ocrStatus) ocrStatus.textContent = 'Image ready. Click "Scan & Prefill" to process.';
      } else {
        if(imagePreview) imagePreview.innerHTML = '';
      }
    });
  }

  function prefillFromOCR(items){
    if(!Array.isArray(items) || items.length===0){
      if(ocrStatus) ocrStatus.textContent = 'No items detected.';
      return;
    }
    items.forEach(it=>{
      addRow({
        brand: it.brand,
        subtype: it.subtype,
        size: it.size,
        quantity: it.quantity,
        exclude: !!it.exclude
      });
    });
    if(ocrStatus) ocrStatus.textContent = `Added ${items.length} rows from OCR.`;
  }

  if(scanBtn){
    scanBtn.addEventListener('click', ()=>{
      if(!runsheetInput || !runsheetInput.files || runsheetInput.files.length===0){
        if(ocrStatus) ocrStatus.textContent = 'Please select an image first.';
        return;
      }
      const file = runsheetInput.files[0];
      const fd = new FormData();
      fd.append('image', file);
      if(ocrStatus) ocrStatus.textContent = 'Scanning…';
      fetch('/api/ocr', {
        method: 'POST', body: fd
      }).then(r=>r.json()).then(j=>{
        if(j.ok){
          prefillFromOCR(j.items);
          // Show raw text and debug info
          if(ocrStatus){
            const count = j.detected_count || 0;
            ocrStatus.innerHTML = `Found ${count} entries. <a href="#" id="showRawText" style="color:#2d9cdb;">Show OCR text</a> | <a href="#" id="showDebug" style="color:#2d9cdb;">Show parsing details</a>`;
            document.getElementById('showRawText')?.addEventListener('click', (e)=>{
              e.preventDefault();
              alert('OCR detected text:\\n\\n' + (j.raw_text || 'No text'));
            });
            document.getElementById('showDebug')?.addEventListener('click', (e)=>{
              e.preventDefault();
              alert('Parsing details:\\n\\n' + (j.debug || 'No debug info'));
            });
          }
        } else {
          if(ocrStatus) ocrStatus.textContent = j.message || j.error || 'OCR failed';
        }
      }).catch(()=>{
        if(ocrStatus) ocrStatus.textContent = 'Network error during OCR.';
      });
    });
  }

  

  submitBtn.addEventListener('click', ()=>{
    const items = Array.from(rowsEl.querySelectorAll('.row')).map(r=>({
      brand: r.querySelector('.brand').value,
      subtype: r.querySelector('.subtype').value,
      size: r.querySelector('.size').value,
      quantity: Math.max(0, parseInt(r.querySelector('.quantity').value||0)),
      exclude: !!r.querySelector('.excludeBox').checked
    }));
    
    // Auto clock in if not clocked in
    if(!isClockedIn){
      isClockedIn = true;
      // Set shift start time only if not already set for today
      if(!shiftStartTime){
        shiftStartTime = new Date();
      }
      updateClockButtons();
      saveSettings();
      fetch('/api/clock', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({action: 'in', date: dateInput.value})
      }).catch(()=>{});
    }
    
    const payload = { date: dateInput.value || null, items };
    fetch('/api/entries', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    }).then(r=>r.json()).then(j=>{
      if(j.ok){ 
        alert('Saved');
        // Immediately refresh to update across all devices
        refreshEntries(); 
      }
      else alert('Error: '+(j.error||'unknown'));
    }).catch(e=>alert('Network error'));
  });

  function formatTime(hours){
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  }

  function refreshEntries(){
    fetch('/api/entries').then(r=>r.json()).then(j=>{
      if(!Array.isArray(j)){ entriesEl.textContent = 'Failed to load'; return; }
      // Show all items, including done ones
      const visible = j;
      if(visible.length===0){ 
        entriesEl.textContent = 'No run-sheet entries'; 
        if(startTimeEl) startTimeEl.textContent = '';
        return; 
      }
      // take the most recent 50 entries (server returns newest first),
      // then reverse so oldest appear first and newest is at the bottom
      const recent = visible.slice(0,50).reverse();
      
      // Get production rate and start time
      const gallonsPerHour = parseFloat(gallonsPerHourInput.value) || 1000;
      const now = new Date();
      
      // Use shift start time if set, otherwise use now
      const productionStart = shiftStartTime || now;
      
      // Calculate current total downtime
      let currentTotalDowntime = totalDowntimeMs;
      if(isDowntime && downtimeStart){
        currentTotalDowntime += (now.getTime() - downtimeStart.getTime());
      }
      
      let cumulativeHours = 0;
      
      // Show start time
      if(startTimeEl){
        const startStr = productionStart.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true});
        const downtimeHours = currentTotalDowntime / (1000 * 60 * 60);
        const downtimeStr = downtimeHours > 0 ? ` (${formatTime(downtimeHours)} downtime)` : '';
        startTimeEl.textContent = `Shift started at ${startStr} (${gallonsPerHour} gallons/hour)${downtimeStr}`;
      }
      
      const html = recent.map(row=>{
        const qty = Math.max(0, parseInt(row.quantity||0));
        const crates = Math.ceil(qty / 4);
        // stacks (vertical) and rows (13 stacks per row)
        const stacks6 = Math.ceil(crates / 6);
        const stacks7 = Math.ceil(crates / 7);
        const rows6 = Math.ceil(stacks6 / 13);
        const rows7 = Math.ceil(stacks7 / 13);
        const full6 = Math.floor(crates / 6);
        const rem6 = crates % 6;
        const full7 = Math.floor(crates / 7);
        const rem7 = crates % 7;
        const s6 = `${stacks6} stacks@6h · ${rows6} rows (13/row)` + (rem6? ` · ${full6} full, 1 partial ${rem6} crates` : ` · ${full6} full`);
        const s7 = `${stacks7} stacks@7h · ${rows7} rows (13/row)` + (rem7? ` · ${full7} full, 1 partial ${rem7} crates` : ` · ${full7} full`);
        const cls = subtypeClass(row.subtype);
        
        // Calculate estimated time - add downtime to estimates
        const hoursForThisItem = qty / gallonsPerHour;
        const elapsedTime = productionStart.getTime() + (cumulativeHours * 60 * 60 * 1000) + currentTotalDowntime;
        const estimatedStart = new Date(elapsedTime);
        const estimatedEnd = new Date(elapsedTime + hoursForThisItem * 60 * 60 * 1000);
        cumulativeHours += hoursForThisItem;
        
        const startStr = estimatedStart.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true});
        const endStr = estimatedEnd.toLocaleTimeString('en-US', {hour: 'numeric', minute: '2-digit', hour12: true});
        const duration = formatTime(hoursForThisItem);
        
        // Check if item is marked done - only use server state
        const isDone = row.on_run_sheet == 0;
        const checkedAttr = isDone ? 'checked' : '';
        const doneClass = isDone ? 'entry-done' : '';
        
        return `<div class="entry ${cls} ${doneClass}" data-id="${row.id}">
                  <div class="entry-controls">
                    <label class="doneLabel"><input type="checkbox" class="doneBox" data-id="${row.id}" ${checkedAttr}> Done</label>
                    <button class="deleteBtn" data-id="${row.id}" title="Delete this entry">✕</button>
                  </div>
                  <div class="entry-title">${row.date} — ${row.brand} ${row.subtype} ${row.size} × ${row.quantity}</div>
                  <div class="entry-time">⏱️ Est: ${startStr} - ${endStr} (${duration})</div>
                  <div class="entry-detail">${crates} crates</div>
                  <div class="entry-detail">${s6}</div>
                  <div class="entry-detail">${s7}</div>
                </div>`;
      }).join('');
      entriesEl.innerHTML = html;
    }).catch(()=>{ entriesEl.textContent = 'Failed to load entries'; });
  }

  // Save and sync settings when they change
  if(dateInput){
    dateInput.addEventListener('change', saveSettings);
  }
  if(gallonsPerHourInput){
    gallonsPerHourInput.addEventListener('input', ()=>{
      saveSettings();
      refreshEntries();
    });
  }

  // Auto-refresh entries and sync settings every 5 seconds for live updates
  setInterval(()=>{
    refreshEntries();
    syncSettings();
  }, 5000);

  // Downtime toggle
  if(downtimeToggleBtn){
    downtimeToggleBtn.addEventListener('click', ()=>{
      isDowntime = !isDowntime;
      const now = new Date();
      
      if(isDowntime){
        // Starting downtime
        downtimeStart = now;
        downtimeToggleBtn.textContent = '▶️ End Downtime';
        downtimeToggleBtn.classList.add('downtime-active');
        if(downtimeStatusEl){
          downtimeStatusEl.style.display = 'block';
          downtimeStatusEl.textContent = '⚠️ DOWNTIME - Shift Paused';
        }
      } else {
        // Ending downtime
        if(downtimeStart){
          totalDowntimeMs += (now.getTime() - downtimeStart.getTime());
        }
        downtimeStart = null;
        downtimeToggleBtn.textContent = '⏸️ Start Downtime';
        downtimeToggleBtn.classList.remove('downtime-active');
        if(downtimeStatusEl){
          downtimeStatusEl.style.display = 'none';
        }
      }
      
      saveSettings();
      refreshEntries();
    });
    
    // Update downtime display every second when active
    setInterval(()=>{
      if(isDowntime && downtimeStatusEl && downtimeStart){
        const currentDowntime = new Date().getTime() - downtimeStart.getTime();
        const totalCurrent = totalDowntimeMs + currentDowntime;
        const hours = formatTime(totalCurrent / (1000 * 60 * 60));
        downtimeStatusEl.textContent = `⚠️ DOWNTIME - Shift Paused (${hours} total)`;
        // Don't refresh entries - just update the text
      }
    }, 1000);
  }

  // Clock in/out buttons
  if(clockInBtn){
    clockInBtn.addEventListener('click', ()=>{
      isClockedIn = true;
      shiftStartTime = new Date();
      updateClockButtons();
      // Wait for saveSettings to complete
      saveSettings().then(()=>{
        return fetch('/api/clock', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({action: 'in', date: dateInput.value})
        });
      }).then(r=>r.json()).then(j=>{
        if(j.ok) alert('Clocked In!');
      }).catch(()=>{});
    });
  }

  if(clockOutBtn){
    clockOutBtn.addEventListener('click', ()=>{
      if(!confirm('Clock out and clear all entries?')) return;
      
      // Calculate total worked time
      let workedMessage = '';
      if(shiftStartTime){
        const shiftEnd = new Date();
        const totalMs = shiftEnd.getTime() - shiftStartTime.getTime();
        const totalHours = totalMs / (1000 * 60 * 60);
        const hours = Math.floor(totalHours);
        const minutes = Math.round((totalHours - hours) * 60);
        const downtimeHours = totalDowntimeMs / (1000 * 60 * 60);
        const workHours = totalHours - downtimeHours;
        const wh = Math.floor(workHours);
        const wm = Math.round((workHours - wh) * 60);
        workedMessage = `Shift Complete!\\n\\nTotal time: ${hours}h ${minutes}m\\nDowntime: ${formatTime(downtimeHours)}\\nWorked: ${wh}h ${wm}m`;
      }

      // Clock out
      fetch('/api/clock', {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'out',
          total_time_ms: shiftStartTime ? new Date().getTime() - shiftStartTime.getTime() : 0,
          downtime_ms: totalDowntimeMs
        })
      }).then(r=>r.json()).then(j=>{
        if(j.ok){
          // Clear entries
          return fetch('/clear', {method:'POST'});
        }
      }).then(r=>r.json()).then(j=>{
        if(j.ok){
          // Reset everything
          isClockedIn = false;
          shiftStartTime = null;
          isDowntime = false;
          downtimeStart = null;
          totalDowntimeMs = 0;
          if(downtimeToggleBtn){
            downtimeToggleBtn.textContent = '⏸️ Start Downtime';
            downtimeToggleBtn.classList.remove('downtime-active');
          }
          if(downtimeStatusEl) downtimeStatusEl.style.display = 'none';
          updateClockButtons();
          saveSettings();
          if(workedMessage) alert(workedMessage);
          refreshEntries();
        }
      }).catch(()=>alert('Clock out failed'));
    });
  }

  // Clear all button
  const clearBtn = document.getElementById('clear');
  if(clearBtn){
    clearBtn.addEventListener('click', ()=>{
      if(!confirm('Are you sure you want to clear ALL entries? This cannot be undone.')) return;
      
      // Calculate total worked time
      let workedMessage = '';
      if(shiftStartTime){
      const shiftEnd = new Date();
      const totalMs = shiftEnd.getTime() - shiftStartTime.getTime();
      const totalHours = totalMs / (1000 * 60 * 60);
      const hours = Math.floor(totalHours);
      const minutes = Math.round((totalHours - hours) * 60);
      const downtimeHours = totalDowntimeMs / (1000 * 60 * 60);
      const workHours = totalHours - downtimeHours;
      const wh = Math.floor(workHours);
      const wm = Math.round((workHours - wh) * 60);
      workedMessage = `Shift Complete!\n\nTotal time: ${hours}h ${minutes}m\nDowntime: ${formatTime(downtimeHours)}\nWorked: ${wh}h ${wm}m`;
    }
    
    fetch('/clear', {method:'POST'}).then(r=>r.json()).then(j=>{
      if(j.ok){ 
        // Reset shift start time
        shiftStartTime = null;
        // Reset downtime
        isDowntime = false;
        downtimeStart = null;
        totalDowntimeMs = 0;
        if(downtimeToggleBtn){
          downtimeToggleBtn.textContent = '⏸️ Start Downtime';
          downtimeToggleBtn.classList.remove('downtime-active');
        }
        if(downtimeStatusEl) downtimeStatusEl.style.display = 'none';
        saveSettings();
        if(workedMessage){
          alert(workedMessage);
        } else {
          alert('Cleared');
        }
        refreshEntries(); 
      }
      else alert('Clear failed');
    }).catch(()=>alert('Network error'));
  });
  }

  // Delegate change events for done checkboxes
  entriesEl.addEventListener('change', (e)=>{
    const t = e.target;
    if(!t.classList.contains('doneBox')) return;
    const id = t.dataset.id;
    const on_run = t.checked ? 0 : 1;
    
    // Disable checkbox while updating
    t.disabled = true;
    
    fetch(`/api/entries/${id}`, {
      method: 'PATCH',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({on_run_sheet: on_run})
    }).then(r=>r.json()).then(j=>{
      if(j.ok){
        t.disabled = false;
        // Immediately refresh to update across all devices
        refreshEntries();
      } else {
        alert('Update failed');
        t.disabled = false;
        t.checked = !t.checked;
      }
    }).catch(()=> {
      alert('Network error');
      t.disabled = false;
      t.checked = !t.checked;
    });
  });

  // Delegate click events for delete buttons - TEST with simple alert first
  entriesEl.addEventListener('click', (e)=>{
    const t = e.target;
    
    // Check if it's the delete button or clicked inside it
    if(t.classList.contains('deleteBtn') || t.closest('.deleteBtn')){

      const btn = t.classList.contains('deleteBtn') ? t : t.closest('.deleteBtn');
      const id = btn.dataset.id;
      
      if(!confirm(`Delete entry #${id} permanently?`)) return;
      
      const entryDiv = btn.closest('.entry');
      
      // Optimistically remove from DOM
      entryDiv.style.transition = 'opacity 0.3s';
      entryDiv.style.opacity = '0';
      setTimeout(()=>entryDiv.remove(), 300);
      
      // Delete from server
      fetch(`/api/entries/${id}`, {
        method: 'DELETE'
      }).then(r=>r.json()).then(j=>{
        if(j.ok){
          // Immediately refresh to update across all devices
          refreshEntries();
        } else {
          alert('Delete failed - refreshing');
          refreshEntries();
        }
      }).catch(()=> {
        alert('Network error');
        refreshEntries();
      });
    }
  });

});
