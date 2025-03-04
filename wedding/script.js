document.addEventListener('DOMContentLoaded', function() {
  const accessForm = document.getElementById('access-form');
  const accessPasswordInput = document.getElementById('access-password');
  const accessError = document.getElementById('access-error');

  // Shared function to process password submission
  function handleAccessSubmit() {
    const enteredPassword = accessPasswordInput.value.trim();
    if (enteredPassword === 'lasvegas2025') {
      document.getElementById('access-lock').style.display = 'none';
      document.getElementById('main-content').style.display = 'block';
    } else {
      accessError.textContent = 'Incorrect password. Please try again.';
    }
  }

  // Listen for form submission (triggers on Enter or button click)
  accessForm.addEventListener('submit', function(e) {
    e.preventDefault();
    handleAccessSubmit();
  });

  // ICS Calendar button functionality
  const calendarButtons = document.querySelectorAll('.add-calendar-btn');
  calendarButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      const eventData = getEventData(button);
      downloadICS(eventData);
    });
  });
  
  // Google Calendar button functionality
  const googleButtons = document.querySelectorAll('.google-calendar-btn');
  googleButtons.forEach(function(button) {
    button.addEventListener('click', function() {
      const eventData = getEventData(button);
      const gcalURL = buildGoogleCalendarURL(eventData);
      window.open(gcalURL, '_blank');
    });
  });
});

// Helper function to extract event data from button attributes
function getEventData(button) {
  return {
    title: button.getAttribute('data-title'),
    location: button.getAttribute('data-location'),
    start: button.getAttribute('data-start'),
    end: button.getAttribute('data-end'),
    description: button.getAttribute('data-description'),
    reservation: button.getAttribute('data-reservation')
  };
}

// Function to create and download an ICS file for the event
function downloadICS(eventData) {
  let icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "SUMMARY:" + eventData.title,
    "DTSTART:" + eventData.start,
    "DTEND:" + eventData.end,
    "LOCATION:" + eventData.location,
    "DESCRIPTION:" + eventData.description
  ];
  
  // Include the reservation link if provided
  if (eventData.reservation) {
    icsLines.push("URL:" + eventData.reservation);
  }
  
  icsLines.push("END:VEVENT", "END:VCALENDAR");
  
  let icsContent = icsLines.join("\r\n");
  let blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  let url = URL.createObjectURL(blob);
  let link = document.createElement('a');
  link.href = url;
  link.download = eventData.title.replace(/\s+/g, '_') + ".ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Function to build a Google Calendar event URL with prefilled details
function buildGoogleCalendarURL(eventData) {
  const baseURL = "https://calendar.google.com/calendar/r/eventedit";
  const params = new URLSearchParams();
  params.set('text', eventData.title);
  params.set('dates', eventData.start + "/" + eventData.end);
  params.set('details', eventData.description);
  params.set('location', eventData.location);
  // Include reservation link in details if available
  if (eventData.reservation) {
    const detailsWithRes = eventData.description + "\nReservation Link: " + eventData.reservation;
    params.set('details', detailsWithRes);
  }
  return baseURL + "?" + params.toString();
}
