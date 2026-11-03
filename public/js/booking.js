/**
 * Appointment Booking System — Professional Client-Side Wizard
 * Multi-step wizard, interactive calendar, dynamic slot loader & client validation.
 */

document.addEventListener('DOMContentLoaded', function() {
  const form = document.getElementById('bookingForm');
  if (!form) return;

  let currentStep = 1;
  let selectedDate = null;
  let selectedTime = null;
  let blockedDates = [];
  let workingDays = [1, 2, 3, 4, 5, 6]; // Monday-Saturday
  let currentCalDate = new Date();
  let calendarMonth = currentCalDate.getMonth();
  let calendarYear = currentCalDate.getFullYear();

  // DOM Elements
  const wizardContainer = document.getElementById('bookingWizardContainer') || document.getElementById('bookingWizardSection');
  const serviceCards = document.querySelectorAll('.service-selectable');
  const serviceIdInput = document.getElementById('serviceId');
  const appointmentDateInput = document.getElementById('appointmentDate');
  const appointmentTimeInput = document.getElementById('appointmentTime');
  const calendarContainer = document.getElementById('datePickerCalendar');
  const timeSlotsContainer = document.getElementById('timeSlotsContainer');
  const serviceTopActionBar = document.getElementById('serviceTopActionBar');
  const topSelectedServiceName = document.getElementById('topSelectedServiceName');
  const step1BottomNext = document.getElementById('step1BottomNext');

  // Step 2 & 3 summary banners
  const step2SelectedServiceName = document.getElementById('step2SelectedServiceName');
  const step3SelectedServiceName = document.getElementById('step3SelectedServiceName');
  const step3CustomerName = document.getElementById('step3CustomerName');
  const selectedDateDisplayBadge = document.getElementById('selectedDateDisplayBadge');

  // Step 4 Summary Elements
  const summaryService = document.getElementById('summaryService');
  const summaryName = document.getElementById('summaryName');
  const summaryEmail = document.getElementById('summaryEmail');
  const summaryPhone = document.getElementById('summaryPhone');
  const summaryCompany = document.getElementById('summaryCompany');
  const summaryDate = document.getElementById('summaryDate');
  const summaryTime = document.getElementById('summaryTime');
  const summaryDescription = document.getElementById('summaryDescription');

  // Global helper for step jump buttons
  window.bookingWizardGoTo = function(step) {
    if (step < currentStep || validateStep(currentStep)) {
      goToStep(step);
    }
  };

  // ─── 1. Fetch Blocked Dates & Working Days Config ──────────────────────────────
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

  // ─── 2. Service Selection Logic ────────────────────────────────────────────────
  serviceCards.forEach(card => {
    card.addEventListener('click', function() {
      serviceCards.forEach(c => c.classList.remove('selected'));
      this.classList.add('selected');

      const id = this.getAttribute('data-service-id');
      const name = this.getAttribute('data-service-name');
      serviceIdInput.value = id;

      // Update UI feedback immediately
      if (topSelectedServiceName) topSelectedServiceName.textContent = name;
      if (serviceTopActionBar) serviceTopActionBar.style.display = 'flex';
      if (step1BottomNext) step1BottomNext.innerHTML = `Continue with <strong>${name}</strong> &rarr;`;
      if (summaryService) summaryService.textContent = name;
      if (step2SelectedServiceName) step2SelectedServiceName.textContent = name;
      if (step3SelectedServiceName) step3SelectedServiceName.textContent = name;
    });
  });

  // Check if service was preselected (e.g. from /book?service=xxx query)
  const initialSelected = document.querySelector('.service-selectable.selected');
  if (initialSelected) {
    const initName = initialSelected.getAttribute('data-service-name');
    if (topSelectedServiceName) topSelectedServiceName.textContent = initName;
    if (serviceTopActionBar) serviceTopActionBar.style.display = 'flex';
    if (step1BottomNext) step1BottomNext.innerHTML = `Continue with <strong>${initName}</strong> &rarr;`;
    if (summaryService) summaryService.textContent = initName;
    if (step2SelectedServiceName) step2SelectedServiceName.textContent = initName;
    if (step3SelectedServiceName) step3SelectedServiceName.textContent = initName;
  }

  // ─── 3. Navigation Controls ────────────────────────────────────────────────────
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

    // Populate dynamic headers based on current values
    if (currentStep === 2) {
      const selected = document.querySelector('.service-selectable.selected');
      if (selected && step2SelectedServiceName) {
        step2SelectedServiceName.textContent = selected.getAttribute('data-service-name');
      }
    }

    if (currentStep === 3) {
      const selected = document.querySelector('.service-selectable.selected');
      const custName = (document.getElementById('customerName')?.value || '').trim();
      if (selected && step3SelectedServiceName) {
        step3SelectedServiceName.textContent = selected.getAttribute('data-service-name');
      }
      if (step3CustomerName) {
        step3CustomerName.textContent = custName || 'Client';
      }
      // If no calendar rendered yet, render it
      if (!calendarContainer.innerHTML.trim()) {
        renderCalendar(calendarMonth, calendarYear);
      }
    }

    if (currentStep === 4) {
      populateReview();
    }

    // Auto-scroll cleanly to the top of the wizard container
    if (wizardContainer) {
      wizardContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  // ─── 4. Client Validation ──────────────────────────────────────────────────────
  function setFieldError(fieldId, errorMsg) {
    const field = document.getElementById(fieldId);
    const errSpan = document.getElementById(`err${fieldId.charAt(0).toUpperCase() + fieldId.slice(1)}`);
    if (field) {
      field.classList.add('input-error');
      if (errorMsg) field.focus();
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

  // Clear errors on typing
  ['customerName', 'customerEmail', 'customerPhone', 'projectDescription'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => clearFieldError(id));
    }
  });

  function validateStep(step) {
    if (step === 1) {
      if (!serviceIdInput.value) {
        alert('Please select a software service category to continue.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      let isValid = true;
      const name = (document.getElementById('customerName')?.value || '').trim();
      const email = (document.getElementById('customerEmail')?.value || '').trim();
      const phone = (document.getElementById('customerPhone')?.value || '').trim();
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

      if (!phone || phone.length < 7) {
        if (isValid) setFieldError('customerPhone', 'Please enter a valid contact phone number.');
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

      return isValid;
    }

    if (step === 3) {
      const errSlot = document.getElementById('errAppointmentSlot');
      if (!appointmentDateInput.value) {
        if (errSlot) {
          errSlot.textContent = 'Please choose an appointment date from the calendar.';
          errSlot.style.display = 'block';
        } else {
          alert('Please choose an appointment date from the calendar.');
        }
        return false;
      }
      if (!appointmentTimeInput.value) {
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

  // ─── 5. Review & Confirm Population ───────────────────────────────────────────
  function populateReview() {
    const selected = document.querySelector('.service-selectable.selected');
    const serviceName = selected ? selected.getAttribute('data-service-name') : 'Selected Service';
    const name = (document.getElementById('customerName')?.value || '').trim();
    const email = (document.getElementById('customerEmail')?.value || '').trim();
    const phone = (document.getElementById('customerPhone')?.value || '').trim();
    const company = (document.getElementById('customerCompany')?.value || '').trim();
    const desc = (document.getElementById('projectDescription')?.value || '').trim();

    if (summaryService) summaryService.textContent = serviceName;
    if (summaryName) summaryName.textContent = name || '—';
    if (summaryEmail) summaryEmail.textContent = email || '—';
    if (summaryPhone) summaryPhone.textContent = phone || '—';
    if (summaryCompany) summaryCompany.textContent = company || '—';
    if (summaryDescription) summaryDescription.textContent = desc || '—';

    if (summaryDate && selectedDate) {
      try {
        const d = new Date(selectedDate + 'T00:00:00');
        summaryDate.textContent = d.toLocaleDateString('en-US', {
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

  // ─── 6. Interactive Calendar Renderer ─────────────────────────────────────────
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
        <button type="button" class="calendar-nav-btn" id="prevMonthBtn" title="Previous Month">&larr;</button>
        <span class="calendar-month-label"><strong>${monthNames[month]} ${year}</strong></span>
        <button type="button" class="calendar-nav-btn" id="nextMonthBtn" title="Next Month">&rarr;</button>
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
      else if (isNonWorking) titleReason = 'Non-working day';
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

    // Attach Month Navigation
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
        appointmentDateInput.value = selectedDate;

        // Reset selected time when date changes
        selectedTime = null;
        appointmentTimeInput.value = '';

        if (selectedDateDisplayBadge) {
          try {
            const d = new Date(selectedDate + 'T00:00:00');
            selectedDateDisplayBadge.textContent = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
            selectedDateDisplayBadge.style.display = 'inline-block';
          } catch (e) {
            selectedDateDisplayBadge.style.display = 'none';
          }
        }

        loadTimeSlots(selectedDate);
      });
    });
  }

  // ─── 7. Dynamic Time Slots Loader ─────────────────────────────────────────────
  function loadTimeSlots(dateStr) {
    if (!timeSlotsContainer) return;

    timeSlotsContainer.innerHTML = `
      <div class="slots-loading">
        <span class="spinner-small"></span> Checking real-time slot availability for ${dateStr}...
      </div>
    `;

    fetch(`/api/slots?date=${dateStr}`)
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          timeSlotsContainer.innerHTML = `
            <div class="alert alert-error" style="margin: 0.5rem 0;">
              ${data.error || 'Failed to load available slots.'}
            </div>
          `;
          return;
        }

        const slots = data.slots || [];
        if (slots.length === 0) {
          timeSlotsContainer.innerHTML = `
            <div class="time-slots-placeholder">
              <span class="placeholder-icon">&#128683;</span>
              <p>No available consultation slots on this date. Please choose another date on the calendar.</p>
            </div>
          `;
          return;
        }

        let slotsHtml = `<div class="slots-grid">`;
        slots.forEach(slot => {
          const isAvailable = slot.available;
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

        // Attach slot click listeners
        timeSlotsContainer.querySelectorAll('.slot-btn.slot-available').forEach(sBtn => {
          sBtn.addEventListener('click', function(e) {
            e.preventDefault();
            timeSlotsContainer.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');

            selectedTime = this.getAttribute('data-time');
            appointmentTimeInput.value = selectedTime;

            const errSlot = document.getElementById('errAppointmentSlot');
            if (errSlot) errSlot.style.display = 'none';
          });
        });
      })
      .catch(err => {
        console.error('Failed to load slots:', err);
        timeSlotsContainer.innerHTML = `
          <div class="alert alert-error" style="margin: 0.5rem 0;">
            Unable to connect to slot booking service. Please try again.
          </div>
        `;
      });
  }

  // ─── 8. Form Submission & Anti-Double-Click ───────────────────────────────────
  form.addEventListener('submit', function(e) {
    if (!validateStep(1) || !validateStep(2) || !validateStep(3)) {
      e.preventDefault();
      return false;
    }

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
