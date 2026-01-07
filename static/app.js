document.addEventListener('DOMContentLoaded', () => {
  const rowsEl = document.getElementById('rows');
  const addRowBtn = document.getElementById('addRow');
  const submitBtn = document.getElementById('submit');
  const entriesEl = document.getElementById('entries');
  const dateInput = document.getElementById('date');

  let BRANDS = [];

  fetch('/api/brands')
    .then(r => r.json())
    .then(b => { BRANDS = b; addRow(); refreshEntries(); })
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

  submitBtn.addEventListener('click', ()=>{
    const items = Array.from(rowsEl.querySelectorAll('.row')).map(r=>({
      brand: r.querySelector('.brand').value,
      subtype: r.querySelector('.subtype').value,
      size: r.querySelector('.size').value,
      quantity: Math.max(0, parseInt(r.querySelector('.quantity').value||0)),
      exclude: !!r.querySelector('.excludeBox').checked
    }));
    const payload = { date: dateInput.value || null, items };
    fetch('/api/entries', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    }).then(r=>r.json()).then(j=>{
      if(j.ok){ alert('Saved'); refreshEntries(); }
      else alert('Error: '+(j.error||'unknown'));
    }).catch(e=>alert('Network error'));
  });

  function refreshEntries(){
    fetch('/api/entries').then(r=>r.json()).then(j=>{
      if(!Array.isArray(j)){ entriesEl.textContent = 'Failed to load'; return; }
      const visible = j.filter(row=>row.on_run_sheet==null || row.on_run_sheet==1);
      if(visible.length===0){ entriesEl.textContent = 'No run-sheet entries'; return; }
      // take the most recent 50 entries (server returns newest first),
      // then reverse so oldest appear first and newest is at the bottom
      const recent = visible.slice(0,50).reverse();
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
        return `<div class="entry ${cls}" data-id="${row.id}">
                  <label class="doneLabel"><input type="checkbox" class="doneBox" data-id="${row.id}"> Done</label>
                  ${row.date} — ${row.brand} ${row.subtype} ${row.size} × ${row.quantity}
                  <br><small>${crates} crates · ${s6} · ${s7}</small>
                </div>`;
      }).join('');
      entriesEl.innerHTML = html;
      // attach change handler via event delegation - ensure boxes are unchecked by default
      Array.from(entriesEl.querySelectorAll('.doneBox')).forEach(cb=> cb.checked = false);
    }).catch(()=>{ entriesEl.textContent = 'Failed to load entries'; });
  }

  // Clear all button
  const clearBtn = document.getElementById('clear');
  clearBtn.addEventListener('click', ()=>{
    if(!confirm('Are you sure you want to clear ALL entries? This cannot be undone.')) return;
    fetch('/clear', {method:'POST'}).then(r=>r.json()).then(j=>{
      if(j.ok){ alert('Cleared'); refreshEntries(); }
      else alert('Clear failed');
    }).catch(()=>alert('Network error'));
  });

  // Delegate change events for done checkboxes
  entriesEl.addEventListener('change', (e)=>{
    const t = e.target;
    if(!t.classList.contains('doneBox')) return;
    const id = t.dataset.id;
    const on_run = t.checked ? 0 : 1; // checked => mark done (remove from run sheet)
    fetch(`/api/entries/${id}`, {
      method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({on_run_sheet: on_run})
    }).then(r=>r.json()).then(j=>{
      if(j.ok){
        // remove the entry from the visible run sheet
        const el = entriesEl.querySelector(`.entry[data-id='${id}']`);
        if(el) el.remove();
      } else {
        alert('Update failed');
      }
    }).catch(()=> alert('Network error'));
  });

});
