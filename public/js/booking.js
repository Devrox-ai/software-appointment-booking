/**
 * Professional Client-Side Booking Wizard
 * 4-Step Linear Booking Process with Interactive Calendar,
 * Resilient Slot Loader, Country Code Dropdown & Anti-Double-Submit
 */

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  let currentStep = 1;
  let selectedDate = null;
  let selectedTime = null;
  let blockedDates = [];
  let workingDays = [1, 2, 3, 4, 5, 6]; // Monday to Saturday default

  const now = new Date();
  let calendarMonth = now.getMonth();
  let calendarYear = now.getFullYear();

  // DOM Elements
  const wizardContainer = document.getElementById('bookingWizardContainer') || document.getElementById('bookingWizardSection');
  const serviceCards = document.querySelectorAll('.service-selectable');
  const serviceIdInput = document.getElementById('serviceId');
  const appointmentDateInput = document.getElementById('appointmentDate');
  const appointmentTimeInput = document.getElementById('appointmentTime');
  const calendarContainer = document.getElementById('datePickerCalendar');
  const timeSlotsContainer = document.getElementById('timeSlotsContainer');

  // Phone inputs
  const countryCodeSelect = document.getElementById('countryCodeSelect');
  const phoneNumberInput = document.getElementById('phoneNumber');
  const customerPhoneHidden = document.getElementById('customerPhone');

  // Header and Action Bars
  const serviceTopActionBar = document.getElementById('serviceTopActionBar');
  const topSelectedServiceName = document.getElementById('topSelectedServiceName');
  const step1BottomNext = document.getElementById('step1BottomNext');

  // Step Banners
  const step2SelectedServiceName = document.getElementById('step2SelectedServiceName');
  const step3SelectedServiceName = document.getElementById('step3SelectedServiceName');
  const step3CustomerName = document.getElementById('step3CustomerName');
  const selectedDateDisplayBadge = document.getElementById('selectedDateDisplayBadge');

  // Review Elements
  const summaryService = document.getElementById('summaryService');
  const summaryName = document.getElementById('summaryName');
  const summaryEmail = document.getElementById('summaryEmail');
  const summaryPhone = document.getElementById('summaryPhone');
  const summaryCompany = document.getElementById('summaryCompany');
  const summaryDate = document.getElementById('summaryDate');
  const summaryTime = document.getElementById('summaryTime');
  const summaryDescription = document.getElementById('summaryDescription');

  // Global helper for step jump buttons (Change Service / Edit)
  window.bookingWizardGoTo = function(targetStep) {
    if (targetStep < currentStep || validateStep(currentStep)) {
      goToStep(targetStep);
    }
  };

  // Global helper for slot retry
  window.retryLoadSlots = function() {
    if (selectedDate) {
      loadTimeSlots(selectedDate);
    }
  };

  // ─── 1. Phone Number Synchronization & Normalization ─────────────────────────
  function syncPhoneNumber() {
    if (!phoneNumberInput || !customerPhoneHidden) return;

    let countryCode = countryCodeSelect ? countryCodeSelect.value.trim() : '+91';
    if (!countryCode.startsWith('+')) countryCode = '+' + countryCode;

    let raw = phoneNumberInput.value.replace(/[^\d]/g, '');
    const codeDigits = countryCode.replace('+', '');

    // Prevent double country code if customer pasted e.g. +91 9876543210
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
    });
  }

  if (countryCodeSelect) {
    countryCodeSelect.addEventListener('change', function() {
      syncPhoneNumber();
      clearFieldError('customerPhone');
    });
  }

  // Pre-sync on load if server returned values
  syncPhoneNumber();

  // ─── 2. Fetch Blocked Dates & Working Days Config ────────────────────────────
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

  // ─── 3. Service Selection Logic (Step 1) ─────────────────────────────────────
  function selectServiceCard(card) {
    if (!card) return;
    serviceCards.forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');

    const id = card.getAttribute('data-service-id');
    const name = card.getAttribute('data-service-name');
    if (serviceIdInput) serviceIdInput.value = id;

    // Update UI headers
    if (topSelectedServiceName) topSelectedServiceName.textContent = name;
    if (serviceTopActionBar) serviceTopActionBar.style.display = 'flex';
    if (step1BottomNext) {
      step1BottomNext.innerHTML = `Continue with <strong>${name}</strong> &rarr;`;
    }
    if (step2SelectedServiceName) step2SelectedServiceName.textContent = name;
    if (step3SelectedServiceName) step3SelectedServiceName.textContent = name;
    if (summaryService) summaryService.textContent = name;
  }

  serviceCards.forEach(card => {
    card.addEventListener('click', function() {
      selectServiceCard(this);
    });
  });

  // Check pre-selected card (from query string or server validation re-render)
  const initialSelectedCard = document.querySelector('.service-selectable.selected') ||
    (serviceIdInput && serviceIdInput.value ? document.querySelector(`.service-selectable[data-service-id="${serviceIdInput.value}"]`) : null);

  if (initialSelectedCard) {
    selectServiceCard(initialSelectedCard);
  }

  // ─── 4. Step Navigation ──────────────────────────────────────────────────────
  document.querySelectorAll('.btn-next').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const targetStep = parseInt(this.getAttribute('data-next'), 10);
      if (validateStep(currentStep)) {
        goToStep(targetStep);
      }
    });
  });

  document.querySelectorAll('.btn-prev').forEach(btn => {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      const targetStep = parseInt(this.getAttribute('data-prev'), 10);
      goToStep(targetStep);
    });
  });

  function goToStep(stepNumber) {
    // Hide current step
    const currentStepEl = document.getElementById(`step${currentStep}`);
    if (currentStepEl) currentStepEl.style.display = 'none';

    // Update progress bar
    document.querySelectorAll('.progress-step').forEach(p => {
      const pStep = parseInt(p.getAttribute('data-step'), 10);
      if (pStep < stepNumber) {
        p.classList.add('completed');
        p.classList.remove('active');
      } else if (pStep === stepNumber) {
        p.classList.add('active');
        p.classList.remove('completed');
      } else {
        p.classList.remove('active', 'completed');
      }
    });

    // Show target step
    const targetStepEl = document.getElementById(`step${stepNumber}`);
    if (targetStepEl) {
      targetStepEl.style.display = 'block';
    }

    currentStep = stepNumber;

    // Step-specific updates
    if (currentStep === 2) {
      const selectedCard = document.querySelector('.service-selectable.selected');
      if (selectedCard && step2SelectedServiceName) {
        step2SelectedServiceName.textContent = selectedCard.getAttribute('data-service-name');
      }
    }

    if (currentStep === 3) {
      const selectedCard = document.querySelector('.service-selectable.selected');
      const custName = (document.getElementById('customerName')?.value || '').trim();
      if (selectedCard && step3SelectedServiceName) {
        step3SelectedServiceName.textContent = selectedCard.getAttribute('data-service-name');
      }
      if (step3CustomerName) {
        step3CustomerName.textContent = custName || 'Client';
      }
      // Ensure calendar is rendered
      if (!calendarContainer.innerHTML.trim()) {
        renderCalendar(calendarMonth, calendarYear);
      }
    }

    if (currentStep === 4) {
      populateReview();
    }

    // Scroll smoothly to top of wizard
    if (wizardContainer) {
      wizardContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ─── 5. Validation ───────────────────────────────────────────────────────────
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
      });
    }
  });

  function validateStep(step) {
    if (step === 1) {
      if (!serviceIdInput || !serviceIdInput.value) {
        alert('Please select a software service category to continue.');
        return false;
      }
      return true;
    }

    if (step === 2) {
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
        if (isValid) setFieldError('customerEmail', 'Please enter a valid email address (e.g. name@company.com).');
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

    if (step === 3) {
      const errSlot = document.getElementById('errAppointmentSlot');
      if (!appointmentDateInput || !appointmentDateInput.value) {
        if (errSlot) {
          errSlot.textContent = 'Please choose an available appointment date from the calendar.';
          errSlot.style.display = 'block';
        } else {
          alert('Please choose an available appointment date from the calendar.');
        }
        return false;
      }

      if (!appointmentTimeInput || !appointmentTimeInput.value) {
        if (errSlot) {
          errSlot.textContent = 'Please select an available consultation time slot.';
          errSlot.style.display = 'block';
        } else {
          alert('Please select an available consultation time slot.');
        }
        return false;
      }

      if (errSlot) errSlot.style.display = 'none';
      return true;
    }

    return true;
  }

  // ─── 6. Review & Confirm Population (Step 4) ─────────────────────────────────
  function populateReview() {
    const selectedCard = document.querySelector('.service-selectable.selected');
    const serviceName = selectedCard ? selectedCard.getAttribute('data-service-name') : 'Selected Service';
    const name = (document.getElementById('customerName')?.value || '').trim();
    const email = (document.getElementById('customerEmail')?.value || '').trim();
    const company = (document.getElementById('customerCompany')?.value || '').trim();
    const desc = (document.getElementById('projectDescription')?.value || '').trim();

    // Country & phone display
    const selectedOption = countryCodeSelect ? countryCodeSelect.options[countryCodeSelect.selectedIndex] : null;
    const countryFlag = selectedOption ? (selectedOption.getAttribute('data-flag') || '') : '';
    const countryName = selectedOption ? (selectedOption.getAttribute('data-name') || '') : '';
    const countryCode = countryCodeSelect ? countryCodeSelect.value : '+91';
    const phoneDigits = (phoneNumberInput?.value || '').replace(/[^\d]/g, '');

    const displayPhone = phoneDigits
      ? `${countryFlag} ${countryCode} ${phoneDigits} ${countryName ? '(' + countryName + ')' : ''}`
      : (customerPhoneHidden?.value || '—');

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
    }

    if (summaryTime && selectedTime) {
      summaryTime.textContent = `${selectedTime} (Asia/Kolkata IST)`;
    }
  }

  // ─── 7. Interactive Calendar ─────────────────────────────────────────────────
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

        loadTimeSlots(selectedDate);
      });
    });
  }

  // ─── 8. Resilient Time Slot Loader (Root Cause Fix) ──────────────────────────
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

    // Fetch from /api/slots (which is now guaranteed to exist with full JSON support)
    fetch(`/api/slots?date=${encodeURIComponent(dateStr)}`)
      .then(res => {
        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }
        return res.json();
      })
      .then(data => {
        if (!data || !data.success) {
          const errText = data?.error || data?.message || 'Unable to retrieve available slots for this date.';
          timeSlotsContainer.innerHTML = `
            <div class="alert alert-error" style="margin: 0.75rem 0; padding: 1rem;">
              <p style="margin-bottom: 0.5rem;">${errText}</p>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.retryLoadSlots()">&#8635; Retry</button>
            </div>
          `;
          return;
        }

        // Normalize slots array (can be object { time, available } or plain string '10:00')
        const rawSlots = data.slots || data.availableSlots || [];
        const slots = rawSlots.map(s => {
          if (typeof s === 'string') {
            return { time: s, available: true };
          }
          return s;
        });

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

        // Slot click handlers
        timeSlotsContainer.querySelectorAll('.slot-btn.slot-available').forEach(sBtn => {
          sBtn.addEventListener('click', function(e) {
            e.preventDefault();
            timeSlotsContainer.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');

            selectedTime = this.getAttribute('data-time');
            if (appointmentTimeInput) appointmentTimeInput.value = selectedTime;

            const errSlot = document.getElementById('errAppointmentSlot');
            if (errSlot) errSlot.style.display = 'none';
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

  // ─── 9. Form Submission & Anti-Double-Click ──────────────────────────────────
  form.addEventListener('submit', function(e) {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      e.preventDefault();
      return false;
    }

    syncPhoneNumber();

    const btnSubmit = document.getElementById('btnSubmitBooking');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      const btnText = btnSubmit.querySelector('.btn-text');
      const btnSpinner = btnSubmit.querySelector('.btn-spinner');
      if (btnText) btnText.style.display = 'none';
      if (btnSpinner) btnSpinner.style.display = 'inline';
    }
  });
});
