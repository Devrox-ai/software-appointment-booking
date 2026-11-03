/**
 * Admin Panel JavaScript
 * Admin sidebar navigation, dynamic calendar with appointment indicators,
 * day detail panel, date blocking/unblocking, and modal helpers.
 */

document.addEventListener('DOMContentLoaded', function() {
  // ─── 1. Mobile Sidebar Toggle ──────────────────────────────────────────────────
  const sidebarToggle = document.getElementById('sidebarToggle');
  const adminSidebar = document.getElementById('adminSidebar');

  if (sidebarToggle && adminSidebar) {
    sidebarToggle.addEventListener('click', function() {
      adminSidebar.classList.toggle('show');
    });

    // Close when clicking outside on mobile
    document.addEventListener('click', function(e) {
      if (!adminSidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        adminSidebar.classList.remove('show');
      }
    });
  }

  // ─── 2. Global Modal Helpers ───────────────────────────────────────────────────
  window.openModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('show');
  };

  window.closeModal = function(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('show');
  };

  // ─── 3. Admin Calendar Implementation ──────────────────────────────────────────
  const calendarGrid = document.getElementById('adminCalendarGrid');
  const monthYearLabel = document.getElementById('calendarMonthYear');
  const prevBtn = document.getElementById('calendarPrev');
  const nextBtn = document.getElementById('calendarNext');

  if (calendarGrid && monthYearLabel) {
    const today = new Date();
    let currentCalMonth = today.getMonth(); // 0-11
    let currentCalYear = today.getFullYear();

    let calendarBookings = [];
    let calendarBlockedDates = [];

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    function loadCalendarData(year, month) {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      monthYearLabel.textContent = `${monthNames[month]} ${year}`;

      calendarGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem;">
          <p class="text-muted">Loading appointments...</p>
        </div>`;

      fetch(`/api/admin/calendar-data?month=${monthStr}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            calendarBookings = data.bookings || [];
            calendarBlockedDates = data.blockedDates || [];
            renderAdminCalendar(year, month);
          } else {
            calendarGrid.innerHTML = '<p class="alert alert-error">Failed to load calendar data.</p>';
          }
        })
        .catch(err => {
          console.error('Calendar data error:', err);
          calendarGrid.innerHTML = '<p class="alert alert-error">Network error loading calendar.</p>';
        });
    }

    function renderAdminCalendar(year, month) {
      const firstDayIndex = new Date(year, month, 1).getDay();
      const totalDays = new Date(year, month + 1, 0).getDate();

      let html = '';

      // Weekday Header
      weekdays.forEach(day => {
        html += `<div class="admin-cal-header-day">${day}</div>`;
      });

      // Blank slots before first day
      for (let i = 0; i < firstDayIndex; i++) {
        html += `<div class="admin-cal-day" style="opacity: 0.15; pointer-events: none;"></div>`;
      }

      // Day cells
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayBookings = calendarBookings.filter(b => b.appointmentDate === dateStr);
        const isBlocked = calendarBlockedDates.includes(dateStr);

        const pendingCount = dayBookings.filter(b => b.status === 'pending').length;
        const acceptedCount = dayBookings.filter(b => b.status === 'accepted').length;

        let dayClasses = ['admin-cal-day'];
        if (isBlocked) dayClasses.push('blocked-day');

        html += `
          <div class="${dayClasses.join(' ')}" data-date="${dateStr}">
            <span class="admin-day-number">${day}</span>
            <div class="admin-day-badges">
              ${isBlocked ? '<span class="admin-day-badge badge-dot-blocked">Blocked</span>' : ''}
              ${acceptedCount > 0 ? `<span class="admin-day-badge badge-dot-accepted">${acceptedCount} Accepted</span>` : ''}
              ${pendingCount > 0 ? `<span class="admin-day-badge badge-dot-pending">${pendingCount} Pending</span>` : ''}
            </div>
          </div>`;
      }

      calendarGrid.innerHTML = html;

      // Click on day to inspect
      calendarGrid.querySelectorAll('.admin-cal-day[data-date]').forEach(dayEl => {
        dayEl.addEventListener('click', function() {
          calendarGrid.querySelectorAll('.admin-cal-day').forEach(d => d.classList.remove('selected'));
          this.classList.add('selected');
          const clickedDate = this.getAttribute('data-date');
          openDayDetail(clickedDate);
        });
      });
    }

    function openDayDetail(dateStr) {
      const dayPanel = document.getElementById('dayDetailPanel');
      const title = document.getElementById('dayDetailTitle');
      const subtitle = document.getElementById('dayDetailSubtitle');
      const content = document.getElementById('dayDetailContent');
      const apptList = document.getElementById('dayAppointmentsList');
      const blockForm = document.getElementById('blockDateForm');
      const unblockForm = document.getElementById('unblockDateForm');
      const blockInput = document.getElementById('blockDateInput');
      const unblockInput = document.getElementById('unblockDateInput');

      if (!dayPanel || !content) return;

      const dayBookings = calendarBookings.filter(b => b.appointmentDate === dateStr);
      const isBlocked = calendarBlockedDates.includes(dateStr);

      const d = new Date(dateStr + 'T00:00:00');
      const formattedDate = d.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });

      title.textContent = formattedDate;
      subtitle.textContent = isBlocked
        ? 'This date is currently blocked for all bookings.'
        : `${dayBookings.length} total appointment(s) scheduled.`;

      content.style.display = 'block';

      // Render appointments
      if (dayBookings.length === 0) {
        apptList.innerHTML = '<p class="text-muted" style="padding: 1rem 0;">No bookings for this date.</p>';
      } else {
        let apptHtml = '';
        dayBookings.forEach(b => {
          const serviceName = b.service ? b.service.name : 'Consultation';
          apptHtml += `
            <div class="day-appointment-item">
              <div>
                <strong>${b.appointmentTime}</strong> — ${escapeHtml(b.customerName)}
                <div style="font-size: 0.8rem; color: #64748b;">${escapeHtml(serviceName)} • SAB-${b.bookingId}</div>
              </div>
              <div>
                <span class="badge badge-${b.status}">${b.status}</span>
                <a href="/admin/bookings/${b._id}" class="btn btn-secondary btn-sm" style="margin-left: 8px;">View</a>
              </div>
            </div>`;
        });
        apptList.innerHTML = apptHtml;
      }

      // Configure Block / Unblock forms
      if (blockInput) blockInput.value = dateStr;
      if (unblockInput) unblockInput.value = dateStr;

      if (isBlocked) {
        if (blockForm) blockForm.style.display = 'none';
        if (unblockForm) unblockForm.style.display = 'block';
      } else {
        if (blockForm) blockForm.style.display = 'block';
        if (unblockForm) unblockForm.style.display = 'none';
      }
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentCalMonth--;
        if (currentCalMonth < 0) {
          currentCalMonth = 11;
          currentCalYear--;
        }
        loadCalendarData(currentCalYear, currentCalMonth);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentCalMonth++;
        if (currentCalMonth > 11) {
          currentCalMonth = 0;
          currentCalYear++;
        }
        loadCalendarData(currentCalYear, currentCalMonth);
      });
    }

    // Initial load
    loadCalendarData(currentCalYear, currentCalMonth);
  }

  function escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
});
