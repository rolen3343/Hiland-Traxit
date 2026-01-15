document.addEventListener('DOMContentLoaded', () => {
  const hoursEntriesEl = document.getElementById('hoursEntries');
  const darkModeToggle = document.getElementById('darkModeToggle');
  const menuToggle = document.getElementById('menuToggle');
  const menuDropdown = document.getElementById('menuDropdown');
  const filterDay = document.getElementById('filterDay');
  const filterWeek = document.getElementById('filterWeek');
  const filterMonth = document.getElementById('filterMonth');
  const filterAll = document.getElementById('filterAll');
  const clearRecords = document.getElementById('clearRecords');
  
  let currentFilter = 'all'; // 'day', 'week', 'month', 'all'

  // Menu toggle
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

  function formatDuration(ms){
    const hours = ms / (1000 * 60 * 60);
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  }

  function filterRecords(records){
    if(currentFilter === 'all') return records;
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return records.filter(rec => {
      const recordDate = new Date(rec.clock_in);
      
      if(currentFilter === 'day'){
        // Same calendar day
        return recordDate >= today;
      } else if(currentFilter === 'week'){
        // Current week (Sunday to Saturday)
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        return recordDate >= weekStart;
      } else if(currentFilter === 'month'){
        // Current month
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        return recordDate >= monthStart;
      }
      
      return true;
    });
  }

  function setActiveFilter(filter){
    currentFilter = filter;
    // Update button states
    [filterDay, filterWeek, filterMonth, filterAll].forEach(btn => {
      if(btn) btn.classList.remove('active');
    });
    
    if(filter === 'day' && filterDay) filterDay.classList.add('active');
    else if(filter === 'week' && filterWeek) filterWeek.classList.add('active');
    else if(filter === 'month' && filterMonth) filterMonth.classList.add('active');
    else if(filter === 'all' && filterAll) filterAll.classList.add('active');
    
    loadHours();
  }


  function loadHours(){
    fetch('/api/hours')
      .then(r => r.json())
      .then(records => {
        if(!Array.isArray(records) || records.length === 0){
          hoursEntriesEl.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">No time records yet</p>';
          return;
        }

        const filtered = filterRecords(records);
        
        if(filtered.length === 0){
          hoursEntriesEl.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">No records for this time period</p>';
          return;
        }

        let totalWorked = 0;
        const html = filtered.map(rec => {
          const clockIn = new Date(rec.clock_in);
          const clockOut = rec.clock_out ? new Date(rec.clock_out) : null;
          const totalMs = rec.total_time_ms || 0;
          const downtimeMs = rec.downtime_ms || 0;
          const workedMs = totalMs - downtimeMs;
          
          if(workedMs > 0) totalWorked += workedMs;

          const status = clockOut ? '✅ Complete' : '⏱️ In Progress';
          const inStr = clockIn.toLocaleString('en-US', {
            month: 'short', day: 'numeric', 
            hour: 'numeric', minute: '2-digit', hour12: true
          });
          const outStr = clockOut ? clockOut.toLocaleString('en-US', {
            hour: 'numeric', minute: '2-digit', hour12: true
          }) : '—';

          return `
            <div class="hours-entry">
              <div class="hours-header">
                <span class="hours-date">${rec.date || 'No date'}</span>
                <span class="hours-status">${status}</span>
              </div>
              <div class="hours-detail">Clock In: ${inStr}</div>
              <div class="hours-detail">Clock Out: ${outStr}</div>
              <div class="hours-detail">Total Time: ${formatDuration(totalMs)}</div>
              <div class="hours-detail">Downtime: ${formatDuration(downtimeMs)}</div>
              <div class="hours-worked">Worked: ${formatDuration(workedMs)}</div>
            </div>
          `;
        }).join('');

        hoursEntriesEl.innerHTML = html + `
          <div class="hours-total">
            <strong>Total Worked Time: ${formatDuration(totalWorked)}</strong>
          </div>
        `;
      })
      .catch(() => {
        hoursEntriesEl.innerHTML = '<p style="color:#e74c3c;">Failed to load hours</p>';
      });
  }

  // Filter button event listeners
  if(filterDay){
    filterDay.addEventListener('click', () => setActiveFilter('day'));
  }
  if(filterWeek){
    filterWeek.addEventListener('click', () => setActiveFilter('week'));
  }
  if(filterMonth){
    filterMonth.addEventListener('click', () => setActiveFilter('month'));
  }
  if(filterAll){
    filterAll.addEventListener('click', () => setActiveFilter('all'));
  }

  // Clear records button
  if(clearRecords){
    clearRecords.addEventListener('click', () => {
      if(!confirm('Delete ALL time records? This cannot be undone!')) return;
      
      fetch('/api/hours/clear', {
        method: 'POST'
      }).then(r => r.json()).then(j => {
        if(j.ok){
          alert('All records cleared');
          loadHours();
        } else {
          alert('Failed to clear records');
        }
      }).catch(() => alert('Network error'));
    });
  }

  loadHours();
  setInterval(loadHours, 10000); // Refresh every 10 seconds
});
