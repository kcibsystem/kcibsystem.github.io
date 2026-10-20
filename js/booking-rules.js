// Shared by the website and Apps Script. All booking dates use Bangkok time.
const BookingRules = (() => {
  const pending = ['รอที่ปรึกษาอนุมัติ', 'รออนุมัติขั้นที่ 2'];
  const approved = ['อนุมัติแล้ว', 'รออนุมัติขั้นที่ 3']; // Legacy staff queue: already approved by the head.
  const emailKey = value => String(value || '').trim().toLowerCase();
  const addDays = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
  const today = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
  const businessDay = (date, holidays = []) => {
    const day = new Date(date + 'T00:00:00Z').getUTCDay();
    return day !== 0 && day !== 6 && !Array.from(holidays).includes(date);
  };
  function minDate(holidays = [], now = new Date()) {
    let date = today(now), remaining = 3;
    while (remaining) {
      date = addDays(date, 1);
      if (businessDay(date, holidays)) remaining--;
    }
    return date;
  }
  function allowsDateTime(item) {
    const category = String(item.category || item.Category || '').toLowerCase();
    const name = String(item.name || item.ItemName || item.Name || '');
    return /glass|scientific|เครื่องแก้ว|อุปกรณ์วิทย/.test(category)
      || /เตาเผา|เตาอบ|\bfurnace\b|\boven\b|\bHPLC\b|\bGC\b|gas\s+chromatograph|high[ -]performance\s+liquid\s+chromatograph/i.test(name);
  }
  function timestamp(value) {
    const text = String(value || '');
    return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text) ? text + '+07:00' : text);
  }
  function validate(item, start, end, quantity, holidays = [], now = new Date()) {
    const pattern = /^\d{4}-\d{2}-\d{2}T(?:09|1[0-6]):00:00$/;
    if (!pattern.test(start) || !pattern.test(end)) return 'time';
    const sd = start.slice(0, 10), ed = end.slice(0, 10);
    // Round-trip validation rejects impossible dates such as 31 February.
    if (!Number.isFinite(Date.parse(sd + 'T00:00:00Z')) || !Number.isFinite(Date.parse(ed + 'T00:00:00Z'))
      || addDays(sd, 0) !== sd || addDays(ed, 0) !== ed) return 'date';
    if (sd < minDate(holidays, now)) return 'advance';
    if (ed > addDays(today(now), 180) || !businessDay(sd, holidays) || !businessDay(ed, holidays)) return 'date';
    const duration = (timestamp(end) - timestamp(start)) / 3600000;
    if (duration <= 0) return 'range';
    if (!allowsDateTime(item) && (sd !== ed || ![1, 2, 3].includes(duration))) return 'duration';
    const max = Number(item.maxQty === undefined ? (item.MaxQuantity === undefined ? item.maxQuantity : item.MaxQuantity) : item.maxQty);
    if (!Number.isInteger(max) || max < 1 || !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > max) return 'quantity';
    return '';
  }
  function availableQuantity(itemId, start, end, bookings, maxQty) {
    const from = timestamp(start), to = timestamp(end), events = [];
    bookings.forEach(b => {
      if (String(b.ItemID) !== String(itemId) || !pending.concat(approved).includes(b.Status)) return;
      const a = Math.max(from, timestamp(b.Start)), z = Math.min(to, timestamp(b.End));
      if (a < z) {
        const quantity = Number(b.Quantity) > 0 ? Number(b.Quantity) : 1;
        events.push([a, quantity], [z, -quantity]);
      }
    });
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let current = 0, peak = 0;
    events.forEach(event => { current += event[1]; peak = Math.max(peak, current); });
    return Math.max(0, maxQty - peak);
  }
  const rolesFor = (email, config) => Object.keys(config).filter(role =>
    config[role].some(member => emailKey(member.email) === emailKey(email)));
  function canApprove(booking, email, role, config) {
    if (!rolesFor(email, config).includes(role)) return false;
    return (role === 'ADVISORS' && booking.Status === pending[0] && emailKey(booking.AdvisorEmail) === emailKey(email))
      || (role === 'HEAD_DEPT' && booking.Status === pending[1]);
  }
  function canAcknowledge(booking, email, role, config) {
    const required = /team.?project.?2/i.test(booking.Course || '') ? 'STAFF_PROJECT_2' : 'STAFF_FLOOR_1';
    return role === required && rolesFor(email, config).includes(role)
      && approved.includes(booking.Status) && !booking.StaffAcknowledgedAt;
  }
  return { today, addDays, businessDay, minDate, allowsDateTime, timestamp, validate, availableQuantity, rolesFor, canApprove, canAcknowledge, pending, approved };
})();
