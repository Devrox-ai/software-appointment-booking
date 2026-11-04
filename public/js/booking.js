/**
 * ONE CONTINUOUS SINGLE-PAGE APPOINTMENT BOOKING EXPERIENCE
 *
 * Specific Flow:
 * - If customer visits /book?service=SERVICE_ID (e.g. clicked Book on Home/Services):
 *   1. Service selection cards are HIDDEN.
 *   2. The first visible content is the SELECTED SERVICE BANNER with the actual service name.
 *   3. Followed DIRECTLY by the CUSTOMER DETAILS FORM (Full Name, Email, Country Code, Phone, Company, Requirements).
 *   4. Customer NEVER sees the service selection screen unless they click "Change Service".
 * - If customer visits /book without service ID:
 *   1. Service cards are shown at top.
 *   2. Clicking a service immediately sets the banner, hides/collapses the service cards, and reveals Customer Details directly below.
 * - Customer continues on the SAME page to Date & Time, picks a slot, reviews, and submits without page reloads or repeating selections.
 */

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  let selectedDate = null;
  let selectedTime = null;
  let blockedDates = [];
  let workingDays = [1, 2, 3, 4, 5, 6]; // Monday to Saturday default

  const now = new Date();
  let calendarMonth = now.getMonth();
  let calendarYear = now.getFullYear();

  // DOM Sections
  const sectionService = document.getElementById('sectionServiceSelection');
  const sectionCustomerDetails = document.getElementById('sectionCustomerDetails');
  const sectionDateTime = document.getElementById('sectionDateTime');
  const sectionReview = document.getElementById('sectionReview');

  // Top Banner
  const selectedServiceTopBanner = document.getElementById('selectedServiceTopBanner');
  const topBannerServiceName = document.getElementById('topBannerServiceName');
  const topBannerServiceDesc = document.getElementById('topBannerServiceDesc');
  const topBannerServiceIcon = document.getElementById('topBannerServiceIcon');
  const btnToggleChangeService = document.getElementById('btnToggleChangeService');

  // Form Inputs
  const serviceCards = document.querySelectorAll('.service-selectable');
  const serviceIdInput = document.getElementById('serviceId');
  const appointmentDateInput = document.getElementById('appointmentDate');
  const appointmentTimeInput = document.getElementById('appointmentTime');
  const countryCodeSelect = document.getElementById('countryCodeSelect');
  const phoneNumberInput = document.getElementById('phoneNumber');
  const customerPhoneHidden = document.getElementById('customerPhone');

  // Schedule Containers
  const calendarContainer = document.getElementById('datePickerCalendar');
  const timeSlotsContainer = document.getElementById('timeSlotsContainer');
  const selectedDateDisplayBadge = document.getElementById('selectedDateDisplayBadge');
  const slotStatusHint = document.getElementById('slotStatusHint');

  // Buttons
  const btnContinueToDateTime = document.getElementById('btnContinueToDateTime');
  const btnSubmitBooking = document.getElementById('btnSubmitBooking');
  const btnEditService = document.getElementById('btnEditService');
  const btnEditDetails = document.getElementById('btnEditDetails');
  const btnEditSchedule = document.getElementById('btnEditSchedule');

  // Review Summary Elements
  const summaryService = document.getElementById('summaryService');
  const summaryName = document.getElementById('summaryName');
  const summaryEmail = document.getElementById('summaryEmail');
  const summaryPhone = document.getElementById('summaryPhone');
  const summaryCompany = document.getElementById('summaryCompany');
  const summaryDate = document.getElementById('summaryDate');
  const summaryTime = document.getElementById('summaryTime');
  const summaryDescription = document.getElementById('summaryDescription');

  // Global helper for slot retry
  window.retryLoadSlots = function() {
    if (selectedDate) {
      loadTimeSlots(selectedDate);
    }
  };

  // ─── 1. Phone Number Synchronization ─────────────────────────────────────────
  function syncPhoneNumber() {
    if (!phoneNumberInput || !customerPhoneHidden) return;

    let countryCode = countryCodeSelect ? countryCodeSelect.value.trim() : '+91';
    if (!countryCode.startsWith('+')) countryCode = '+' + countryCode;

    let raw = phoneNumberInput.value.replace(/[^\d]/g, '');
    const codeDigits = countryCode.replace('+', '');

    // Prevent double country code prefix if customer pasted full number
    if (raw.startsWith(codeDigits) && raw.length > codeDigits.length + 6) {
      raw = raw.slice(codeDigits.length);
      phoneNumberInput.value = raw;
    }
    // Remove accidental leading 0
    if (raw.startsWith('0') && raw.length > 7) {
      raw = raw.slice(1);
      phoneNumberInput.value = raw;
    }

    if (raw) {
      customerPhoneHidden.value = `${countryCode}${raw}`;
    } else {
      customerPhoneHidden.value = '';
    }
  }

  if (phoneNumberInput) {
    phoneNumberInput.addEventListener('input', function() {
      syncPhoneNumber();
      clearFieldError('customerPhone');
      updateReviewSummary();
    });
  }

  if (countryCodeSelect) {
    countryCodeSelect.addEventListener('change', function() {
      syncPhoneNumber();
      clearFieldError('customerPhone');
      updateReviewSummary();
    });
  }

  // Pre-sync phone on load
  syncPhoneNumber();

  // ─── 2. Fetch Blocked Dates & Working Days ───────────────────────────────────
  fetch('/api/blocked-dates')
    .then(res => res.json())
    .then(data => {
      if (data && data.success) {
        blockedDates = data.blockedDates || [];
        if (data.workingDays) workingDays = data.workingDays;
        renderCalendar(calendarMonth, calendarYear);
      }
    })
    .catch(err => {
      console.warn('Could not load blocked dates dynamically:', err);
      renderCalendar(calendarMonth, calendarYear);
    });

  // ─── 3. Handle Service Selection & Preselected State ─────────────────────────
  function applyServiceSelection(serviceId, serviceName, serviceDesc, serviceIcon, shouldScroll = true) {
    if (serviceIdInput) serviceIdInput.value = serviceId;

    // Highlight matching card in the grid
    serviceCards.forEach(card => {
      if (card.getAttribute('data-service-id') === serviceId) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });

    // Update Top Banner
    if (selectedServiceTopBanner) {
      selectedServiceTopBanner.style.display = 'block';
    }
    if (topBannerServiceName) topBannerServiceName.textContent = serviceName;
    if (topBannerServiceDesc) topBannerServiceDesc.textContent = serviceDesc || '';
    if (topBannerServiceIcon && serviceIcon) topBannerServiceIcon.innerHTML = serviceIcon;
    if (btnToggleChangeService) btnToggleChangeService.innerHTML = '&#9998; Change Service';

    // Hide the service cards grid so customer directly sees the details form
    if (sectionService) {
      sectionService.style.display = 'none';
    }

    // Immediately display the Customer Details Form directly underneath
    if (sectionCustomerDetails) {
      sectionCustomerDetails.style.display = 'block';
      if (shouldScroll) {
        setTimeout(() => {
          sectionCustomerDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    }

    if (summaryService) summaryService.textContent = serviceName;

    const errServ = document.getElementById('errServiceSelection');
    if (errServ) errServ.style.display = 'none';

    updateReviewSummary();
  }

  // Attach click listener to each service card
  serviceCards.forEach(card => {
    card.addEventListener('click', function() {
      const id = this.getAttribute('data-service-id');
      const name = this.getAttribute('data-service-name');
      const desc = this.getAttribute('data-service-desc') || '';
      const icon = this.getAttribute('data-service-icon') || '&#128736;';
      applyServiceSelection(id, name, desc, icon, true);
    });
  });

  // Toggle "Change Service" button in banner
  if (btnToggleChangeService) {
    btnToggleChangeService.addEventListener('click', function(e) {
      e.preventDefault();
      if (!sectionService) return;

      const isHidden = sectionService.style.display === 'none' || getComputedStyle(sectionService).display === 'none';
      if (isHidden) {
        sectionService.style.display = 'block';
        btnToggleChangeService.innerHTML = '&#10005; Close Services';
        setTimeout(() => {
          sectionService.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      } else {
        sectionService.style.display = 'none';
        btnToggleChangeService.innerHTML = '&#9998; Change Service';
        setTimeout(() => {
          sectionCustomerDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }
    });
  }

  // Check pre-selected service on page load (e.g. /book?service=ID)
  const currentServiceId = serviceIdInput ? serviceIdInput.value : '';
  if (currentServiceId) {
    const matchingCard = document.querySelector(`.service-selectable[data-service-id="${currentServiceId}"]`);
    const name = matchingCard ? matchingCard.getAttribute('data-service-name') : (topBannerServiceName ? topBannerServiceName.textContent.trim() : 'Selected Service');
    const desc = matchingCard ? matchingCard.getAttribute('data-service-desc') : (topBannerServiceDesc ? topBannerServiceDesc.textContent.trim() : '');
    const icon = matchingCard ? matchingCard.getAttribute('data-service-icon') : '';

    // Apply without smooth scroll on page load so customer directly sees form at the top
    applyServiceSelection(currentServiceId, name, desc, icon, false);
  }

  // ─── 4. Customer Details Validation & Continue to Schedule ───────────────────
  function setFieldError(fieldId, errorMsg) {
    const field = document.getElementById(fieldId);
    const errSpan = document.getElementById(`err${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)}`);
    if (field) {
      field.classList.add('input-error');
      field.focus();
    }
    if (errSpan) {
      errSpan.textContent = errorMsg;
      errSpan.style.display = errorMsg ? 'block' : 'none';
    }
  }

  function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errSpan = document.getElementById(`err${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)}`);
    if (field) field.classList.remove('input-error');
    if (errSpan) {
      errSpan.textContent = '';
      errSpan.style.display = 'none';
    }
  }

  ['customerName', 'customerEmail', 'phoneNumber', 'projectDescription'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        if (id === 'phoneNumber') {
          clearFieldError('customerPhone');
        } else {
          clearFieldError(id);
        }
        updateReviewSummary();
      });
    }
  });

  function validateCustomerDetails() {
    let isValid = true;
    const name = (document.getElementById('customerName')?.value || '').trim();
    const email = (document.getElementById('customerEmail')?.value || '').trim();
    const phoneDigits = (phoneNumberInput?.value || '').replace(/[^\d]/g, '');
    const desc = (document.getElementById('projectDescription')?.value || '').trim();

    if (!name || name.length < 2) {
      setFieldError('customerName', 'Please enter your full name (minimum 2 characters).');
      isValid = false;
    } else {
      clearFieldError('customerName');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      if (isValid) setFieldError('customerEmail', 'Please enter a valid email address (e.g. john@example.com).');
      isValid = false;
    } else {
      clearFieldError('customerEmail');
    }

    if (!phoneDigits || phoneDigits.length < 7 || phoneDigits.length > 15) {
      if (isValid) setFieldError('customerPhone', 'Please enter a valid contact phone number (7 to 15 digits).');
      isValid = false;
    } else {
      clearFieldError('customerPhone');
    }

    if (!desc || desc.length < 10) {
      if (isValid) setFieldError('projectDescription', 'Please describe your project requirements in at least 10 characters.');
      isValid = false;
    } else {
      clearFieldError('projectDescription');
    }

    syncPhoneNumber();
    return isValid;
  }

  if (btnContinueToDateTime) {
    btnContinueToDateTime.addEventListener('click', function(e) {
      e.preventDefault();
      if (!serviceIdInput || !serviceIdInput.value) {
        alert('Please select a software service first.');
        sectionService.style.display = 'block';
        sectionService.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (validateCustomerDetails()) {
        // Reveal Section 3 (Date & Time) on THE SAME PAGE directly below
        if (sectionDateTime) {
          sectionDateTime.style.display = 'block';
          if (!calendarContainer.innerHTML.trim()) {
            renderCalendar(calendarMonth, calendarYear);
          }
          setTimeout(() => {
            sectionDateTime.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }

        updateReviewSummary();
      }
    });
  }

  // If customer details were already pre-filled from server render, reveal DateTime
  const preName = (document.getElementById('customerName')?.value || '').trim();
  if (preName && serviceIdInput && serviceIdInput.value) {
    if (sectionDateTime) {
      sectionDateTime.style.display = 'block';
      renderCalendar(calendarMonth, calendarYear);
    }
  }

  // ─── 5. Interactive Calendar ─────────────────────────────────────────────────
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function renderCalendar(month, year) {
    if (!calendarContainer) return;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = `
      <div class="calendar-header-bar">
        <button type="button" class="calendar-nav-btn" id="prevMonthBtn" title="Previous Month" aria-label="Previous Month">&larr;</button>
        <span class="calendar-month-label"><strong>${monthNames[month]} ${year}</strong></span>
        <button type="button" class="calendar-nav-btn" id="nextMonthBtn" title="Next Month" aria-label="Next Month">&rarr;</button>
      </div>
      <div class="calendar-weekdays-row">
        <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
      </div>
      <div class="calendar-days-grid">
    `;

    // Empty cells before first day
    for (let i = 0; i < firstDay; i++) {
      html += `<div class="calendar-cell cell-empty"></div>`;
    }

    // Days in current month
    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      cellDate.setHours(0, 0, 0, 0);

      const yyyy = year;
      const mm = String(month + 1).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;

      const dayOfWeek = cellDate.getDay();
      const isPast = cellDate < today;
      const isNonWorking = !workingDays.includes(dayOfWeek);
      const isBlocked = blockedDates.includes(dateStr);
      const isUnavailable = isPast || isNonWorking || isBlocked;
      const isSelected = selectedDate === dateStr;
      const isToday = cellDate.getTime() === today.getTime();

      let cellClasses = ['calendar-cell', 'cell-day'];
      if (isUnavailable) cellClasses.push('cell-disabled');
      if (isSelected) cellClasses.push('cell-selected');
      if (isToday) cellClasses.push('cell-today');

      let titleReason = '';
      if (isPast) titleReason = 'Past date';
      else if (isNonWorking) titleReason = 'Sunday / Non-working day';
      else if (isBlocked) titleReason = 'Date unavailable / booked';

      html += `
        <button type="button"
                class="${cellClasses.join(' ')}"
                data-date="${dateStr}"
                title="${titleReason}"
                ${isUnavailable ? 'disabled' : ''}>
          ${day}
        </button>
      `;
    }

    html += `</div>`;
    calendarContainer.innerHTML = html;

    // Month Navigation
    const prevBtn = document.getElementById('prevMonthBtn');
    const nextBtn = document.getElementById('nextMonthBtn');

    if (prevBtn) {
      prevBtn.addEventListener('click', function(e) {
        e.preventDefault();
        calendarMonth--;
        if (calendarMonth < 0) {
          calendarMonth = 11;
          calendarYear--;
        }
        renderCalendar(calendarMonth, calendarYear);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function(e) {
        e.preventDefault();
        calendarMonth++;
        if (calendarMonth > 11) {
          calendarMonth = 0;
          calendarYear++;
        }
        renderCalendar(calendarMonth, calendarYear);
      });
    }

    // Attach Day Click Handlers
    calendarContainer.querySelectorAll('.cell-day:not(.cell-disabled)').forEach(dayBtn => {
      dayBtn.addEventListener('click', function(e) {
        e.preventDefault();
        calendarContainer.querySelectorAll('.cell-day').forEach(b => b.classList.remove('cell-selected'));
        this.classList.add('cell-selected');

        selectedDate = this.getAttribute('data-date');
        if (appointmentDateInput) appointmentDateInput.value = selectedDate;

        // Reset selected time when date changes
        selectedTime = null;
        if (appointmentTimeInput) appointmentTimeInput.value = '';

        if (selectedDateDisplayBadge) {
          try {
            const [y, m, d] = selectedDate.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            selectedDateDisplayBadge.textContent = dateObj.toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', weekday: 'short'
            });
            selectedDateDisplayBadge.style.display = 'inline-block';
          } catch (e) {
            selectedDateDisplayBadge.style.display = 'none';
          }
        }

        if (slotStatusHint) {
          slotStatusHint.textContent = `Showing slots for ${selectedDate}`;
        }

        loadTimeSlots(selectedDate);
      });
    });
  }

  // ─── 6. Slot Availability Loader ─────────────────────────────────────────────
  function loadTimeSlots(dateStr) {
    if (!timeSlotsContainer) return;

    let friendlyDate = dateStr;
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      friendlyDate = new Date(y, m - 1, d).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', weekday: 'short'
      });
    } catch (e) {}

    timeSlotsContainer.innerHTML = `
      <div class="slots-loading" style="padding: 2.5rem 1rem; text-align: center; color: var(--navy);">
        <div class="spinner-small" style="display: inline-block; width: 22px; height: 22px; border: 3px solid #e2e8f0; border-top-color: #2563eb; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; margin-right: 8px;"></div>
        <span>Checking real-time slot availability for <strong>${friendlyDate}</strong>...</span>
      </div>
    `;

    fetch(`/api/slots?date=${encodeURIComponent(dateStr)}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!data || !data.success) {
          const errText = data?.error || data?.message || 'Unable to load slots.';
          timeSlotsContainer.innerHTML = `
            <div class="alert alert-error" style="margin: 0.75rem 0; padding: 1rem;">
              <p style="margin-bottom: 0.5rem;">${errText}</p>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.retryLoadSlots()">&#8635; Retry</button>
            </div>
          `;
          return;
        }

        const rawSlots = data.slots || data.availableSlots || [];
        const slots = rawSlots.map(s => (typeof s === 'string' ? { time: s, available: true } : s));

        if (slots.length === 0) {
          const emptyMsg = data.message || `No available consultation slots on ${friendlyDate}. Please choose another date on the calendar.`;
          timeSlotsContainer.innerHTML = `
            <div class="time-slots-placeholder" style="padding: 2.5rem 1rem; text-align: center;">
              <span class="placeholder-icon" style="font-size: 2.2rem; display: block; margin-bottom: 0.5rem;">&#128683;</span>
              <p style="color: var(--text-muted); max-width: 320px; margin: 0 auto;">${emptyMsg}</p>
            </div>
          `;
          return;
        }

        let slotsHtml = `<div class="slots-grid">`;
        slots.forEach(slot => {
          const isAvailable = Boolean(slot.available);
          const isSelected = selectedTime === slot.time;
          slotsHtml += `
            <button type="button"
                    class="slot-btn ${isAvailable ? 'slot-available' : 'slot-booked'} ${isSelected ? 'selected' : ''}"
                    data-time="${slot.time}"
                    ${!isAvailable ? 'disabled title="Slot already reserved"' : ''}>
              <span class="slot-time-text">${slot.time}</span>
              ${!isAvailable ? '<span class="slot-badge-booked">Booked</span>' : '<span class="slot-badge-avail">&#10003;</span>'}
            </button>
          `;
        });
        slotsHtml += `</div>`;

        timeSlotsContainer.innerHTML = slotsHtml;

        // Slot click handlers -> REVEALS Section 4 (Review) on THE SAME PAGE
        timeSlotsContainer.querySelectorAll('.slot-btn.slot-available').forEach(sBtn => {
          sBtn.addEventListener('click', function(e) {
            e.preventDefault();
            timeSlotsContainer.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');

            selectedTime = this.getAttribute('data-time');
            if (appointmentTimeInput) appointmentTimeInput.value = selectedTime;

            const errSlot = document.getElementById('errAppointmentSlot');
            if (errSlot) errSlot.style.display = 'none';

            // REVEAL Step 4 (Review) directly below on THE SAME PAGE
            if (sectionReview) {
              sectionReview.style.display = 'block';
              updateReviewSummary();
              setTimeout(() => {
                sectionReview.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }, 80);
            }
          });
        });
      })
      .catch(err => {
        console.error('Failed to load slots:', err);
        timeSlotsContainer.innerHTML = `
          <div class="alert alert-error" style="margin: 0.75rem 0; padding: 1rem;">
            <p style="margin-bottom: 0.5rem;">Unable to connect to slot booking service. Please try again.</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.retryLoadSlots()">&#8635; Try Again</button>
          </div>
        `;
      });
  }

  // ─── 7. Live Review Summary Updater ──────────────────────────────────────────
  function updateReviewSummary() {
    const selectedCard = document.querySelector('.service-selectable.selected');
    const serviceName = selectedCard ? selectedCard.getAttribute('data-service-name') : (topBannerServiceName ? topBannerServiceName.textContent.trim() : (serviceIdInput?.value ? 'Selected Service' : '—'));
    const name = (document.getElementById('customerName')?.value || '').trim();
    const email = (document.getElementById('customerEmail')?.value || '').trim();
    const company = (document.getElementById('customerCompany')?.value || '').trim();
    const desc = (document.getElementById('projectDescription')?.value || '').trim();

    const selectedOption = countryCodeSelect ? countryCodeSelect.options[countryCodeSelect.selectedIndex] : null;
    const countryFlag = selectedOption ? (selectedOption.getAttribute('data-flag') || '') : '';
    const countryName = selectedOption ? (selectedOption.getAttribute('data-name') || '') : '';
    const countryCode = countryCodeSelect ? countryCodeSelect.value : '+91';
    const phoneDigits = (phoneNumberInput?.value || '').replace(/[^\d]/g, '');

    const displayPhone = phoneDigits
      ? `${countryFlag} ${countryCode} ${phoneDigits} ${countryName ? '(' + countryName + ')' : ''}`
      : '—';

    if (summaryService) summaryService.textContent = serviceName;
    if (summaryName) summaryName.textContent = name || '—';
    if (summaryEmail) summaryEmail.textContent = email || '—';
    if (summaryPhone) summaryPhone.textContent = displayPhone;
    if (summaryCompany) summaryCompany.textContent = company || 'Individual / Startup';
    if (summaryDescription) summaryDescription.textContent = desc || '—';

    if (summaryDate && selectedDate) {
      try {
        const [y, m, d] = selectedDate.split('-').map(Number);
        const dateObj = new Date(y, m - 1, d);
        summaryDate.textContent = dateObj.toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
      } catch (e) {
        summaryDate.textContent = selectedDate;
      }
    } else if (summaryDate) {
      summaryDate.textContent = '—';
    }

    if (summaryTime && selectedTime) {
      summaryTime.textContent = `${selectedTime} (Asia/Kolkata IST)`;
    } else if (summaryTime) {
      summaryTime.textContent = '—';
    }
  }

  // ─── 8. Edit / Smooth Scroll Buttons ─────────────────────────────────────────
  if (btnEditService) {
    btnEditService.addEventListener('click', function(e) {
      e.preventDefault();
      if (sectionService) {
        sectionService.style.display = 'block';
        if (btnToggleChangeService) btnToggleChangeService.innerHTML = '&#10005; Close Services';
        sectionService.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  if (btnEditDetails) {
    btnEditDetails.addEventListener('click', function(e) {
      e.preventDefault();
      if (sectionCustomerDetails) {
        sectionCustomerDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  if (btnEditSchedule) {
    btnEditSchedule.addEventListener('click', function(e) {
      e.preventDefault();
      if (sectionDateTime) {
        sectionDateTime.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  // ─── 9. Form Submission & Anti-Double-Click ──────────────────────────────────
  form.addEventListener('submit', function(e) {
    // 1. Check Service
    if (!serviceIdInput || !serviceIdInput.value) {
      e.preventDefault();
      const errServ = document.getElementById('errServiceSelection');
      if (errServ) {
        errServ.textContent = 'Please choose a software service from Section 1 above.';
        errServ.style.display = 'block';
      }
      if (sectionService) {
        sectionService.style.display = 'block';
        sectionService.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return false;
    }

    // 2. Check Customer Details
    if (!validateCustomerDetails()) {
      e.preventDefault();
      if (sectionCustomerDetails) {
        sectionCustomerDetails.style.display = 'block';
        sectionCustomerDetails.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return false;
    }

    // 3. Check Date & Time
    const errSlot = document.getElementById('errAppointmentSlot');
    if (!appointmentDateInput || !appointmentDateInput.value) {
      e.preventDefault();
      if (sectionDateTime) {
        sectionDateTime.style.display = 'block';
        if (errSlot) {
          errSlot.textContent = 'Please select an appointment date from the calendar.';
          errSlot.style.display = 'block';
        }
        sectionDateTime.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return false;
    }

    if (!appointmentTimeInput || !appointmentTimeInput.value) {
      e.preventDefault();
      if (sectionDateTime) {
        sectionDateTime.style.display = 'block';
        if (errSlot) {
          errSlot.textContent = 'Please select an available consultation time slot.';
          errSlot.style.display = 'block';
        }
        sectionDateTime.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return false;
    }

    syncPhoneNumber();

    // Disable submit button & show spinner (anti-double-click)
    if (btnSubmitBooking) {
      btnSubmitBooking.disabled = true;
      const btnText = btnSubmitBooking.querySelector('.btn-text');
      const btnSpinner = btnSubmitBooking.querySelector('.btn-spinner');
      if (btnText) btnText.style.display = 'none';
      if (btnSpinner) btnSpinner.style.display = 'inline';
    }
  });
});
