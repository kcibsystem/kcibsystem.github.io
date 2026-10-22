// ============================================================
// KCIB Backend — Google Apps Script
// Spreadsheet: 18nu0jZcDyyEJGfylpazITc5lK2gdb0u5rrmESQnPVZ4
// Approval: ADVISORS → HEAD_DEPT. Staff view bookings without taking action.
//
// Deploy: Extensions > Apps Script > Deploy > New deployment
//   Execute as: Me | Who has access: Anyone
// ============================================================

const SHEET_ID      = "18nu0jZcDyyEJGfylpazITc5lK2gdb0u5rrmESQnPVZ4";
const KCIB_SITE_URL = "https://kcibsystem.github.io/";

const SHEETS = {
  BOOKINGS:  "ALlBooking",
  INVENTORY: "Inventory",
  HOLIDAYS:  "Holidays",
  STAFF:     "StaffConfig",
  PROFILES:  "UserProfiles"
};

const STATUS = {
  P1:        "รอที่ปรึกษาอนุมัติ",
  P2:        "รออนุมัติขั้นที่ 2",
  P3:        "รออนุมัติขั้นที่ 3",
  APPROVED:  "อนุมัติแล้ว",
  REJECTED:  "ปฏิเสธ",
  CANCELLED: "ยกเลิก"
};

// ==================== HELPERS ====================
let spreadsheet_;
function ss_()        { return spreadsheet_ || (spreadsheet_ = SpreadsheetApp.openById(SHEET_ID)); }
function sh_(name)    { return ss_().getSheetByName(name); }

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetToObjects(sheetName) {
  const sheet = sh_(sheetName);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  const headers = rows[0].map(function(h) { return String(h).trim(); });
  return rows.slice(1).map(function(row, ri) { return bookingRowObject_(headers, row, ri + 2); });
}

function bookingRowObject_(headers, row, rowNumber) {
  const obj = { _row: rowNumber };
  headers.forEach(function(header, index) {
    obj[header] = row[index] instanceof Date
      ? Utilities.formatDate(row[index], "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ss") : row[index];
  });
  return obj;
}

function getHeaders_(sheetName) {
  const sheet = sh_(sheetName);
  if (!sheet) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(h) { return String(h).trim(); });
}

function colIdx_(headers, name) { return headers.indexOf(name); }

// ==================== ROUTER ====================
function doGet(e) {
  const p = e.parameter || {};
  try {
    switch (p.func) {
      case "init":          return jsonOut(getInitData(p.refresh === "1"));
      case "getMyBookings": return jsonOut(getMyBookings(p.email, p.refresh === "1"));
      case "getAllBookings": return jsonOut(getDisplayBookings_(p.refresh === "1"));
      case "getProfile":    return jsonOut(getProfile(p.email));
      case "getCalendar":   return jsonOut(getCalendar(p.from, p.to, p.refresh === "1"));
      case "getAvailability": return jsonOut(getAvailability(p.itemId, p.from, p.to, p.refresh === "1"));
      default:              return jsonOut({ error: "Invalid function: " + (p.func || "(none)") });
    }
  } catch (err) {
    Logger.log("doGet error: " + err.stack);
    return jsonOut({ error: err.message });
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    switch (data.action) {
      case "submitBooking":  return jsonOut(submitBooking(data));
      case "cancelBooking":  return jsonOut(cancelBooking(data));
      case "approveBooking": return jsonOut(approveBooking(data));
      case "rejectBooking":  return jsonOut(rejectBooking(data));
      case "approveBookings": return jsonOut(changeBookings_(data, false, true));
      case "rejectBookings":  return jsonOut(changeBookings_(data, true, true));
      case "saveProfile":    return jsonOut(saveProfile(data));
      case "getNotifications": return jsonOut(getNotificationSummary(data));
      default:               return jsonOut({ error: "Invalid action: " + data.action });
    }
  } catch (err) {
    Logger.log("doPost error: " + err.stack);
    return jsonOut({ error: err.message });
  }
}

// ==================== INIT DATA ====================
function getInitData(refresh) {
  let cache;
  const key = "kcib_init_v2";
  try {
    cache = CacheService.getScriptCache();
    if (!refresh) {
      const saved = cache.get(key);
      if (saved) return JSON.parse(saved);
    }
  } catch (_) {}
  const data = {
    inventory:   getInventory(),
    holidays:    getHolidays(),
    staffConfig: getStaffConfig()
  };
  // Only discovery data is cached. Mutations read inventory, holidays and roles fresh.
  try { if (cache) cache.put(key, JSON.stringify(data), 60); } catch (_) {}
  return data;
}

function getInventory() {
  return sheetToObjects(SHEETS.INVENTORY);
}

function getHolidays() {
  const sheet = sh_(SHEETS.HOLIDAYS);
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return [];
  return rows.slice(1).map(function(row) {
    var raw = row[0];
    var dateStr;
    if (raw instanceof Date) {
      dateStr = Utilities.formatDate(raw, "Asia/Bangkok", "yyyy-MM-dd");
    } else {
      var s = String(raw).trim();
      if (s.indexOf("/") !== -1) {
        var parts = s.split("/");
        if (parts.length === 3) {
          var day   = parts[0].length < 2 ? "0" + parts[0] : parts[0];
          var month = parts[1].length < 2 ? "0" + parts[1] : parts[1];
          var year  = parseInt(parts[2]) > 2400 ? parseInt(parts[2]) - 543 : parseInt(parts[2]);
          dateStr = year + "-" + month + "-" + day;
        } else dateStr = s;
      } else dateStr = s;
    }
    return { date: dateStr, description: String(row[1] || "") };
  });
}

function getStaffConfig() {
  const sheet = sh_(SHEETS.STAFF);
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  if (rows.length < 2) return {};
  var config = {};
  rows.slice(1).forEach(function(row) {
    var role   = String(row[0] || "").trim();
    var emails = String(row[1] || "").split(",").map(function(e) { return e.trim(); }).filter(Boolean);
    var names  = String(row[2] || "").split(",").map(function(n) { return n.trim(); }).filter(Boolean);
    if (!role) return;
    config[role] = (config[role] || []).concat(emails.map(function(email, i) {
      return { email: email.toLowerCase(), name: names[i] || email };
    })).filter(function(member, index, all) {
      return all.findIndex(function(other) { return other.email === member.email; }) === index;
    });
  });
  return config;
}


// ==================== BOOKINGS ====================
function getMyBookings(email, refresh) {
  if (!email) return [];
  return getDisplayBookings_(refresh).filter(function(b) {
    return String(b.Email || "").toLowerCase() === email.toLowerCase();
  });
}

// Public calendar returns only equipment occupancy, never personal booking data.
function getCalendar(from, to, refresh) {
  const validDate = function(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
      && Number.isFinite(Date.parse(value + "T00:00:00Z")) && BookingRules.addDays(value, 0) === value;
  };
  if (!validDate(from) || !validDate(to) || to <= from
      || Date.parse(to) - Date.parse(from) > 42 * 86400000) throw new Error("Invalid calendar date range");
  return { bookings: occupancyBookings_(from, to, refresh) };
}

function getAvailability(itemId, from, to, refresh) {
  if (typeof itemId !== "string" || !itemId.trim()) throw new Error("Invalid availability item ID");
  const validDate = function(value) {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && Number.isFinite(Date.parse(value + "T00:00:00Z")) && BookingRules.addDays(value, 0) === value;
  };
  if (!validDate(from) || !validDate(to) || to <= from
      || Date.parse(to) - Date.parse(from) > 181 * 86400000) throw new Error("Invalid availability date range");
  return { bookings: occupancyBookings_(from, to, refresh, itemId) };
}

function occupancyBookings_(from, to, refresh, itemId) {
  const start = BookingRules.timestamp(from + "T00:00:00"), end = BookingRules.timestamp(to + "T00:00:00");
  const statuses = BookingRules.pending.concat(BookingRules.approved);
  return getDisplayBookings_(refresh).filter(function(booking) {
    return (itemId === undefined || String(booking.ItemID) === itemId)
      && statuses.includes(booking.Status) && BookingRules.timestamp(booking.Start) < end
      && BookingRules.timestamp(booking.End) > start;
  }).map(function(booking) {
    return { ItemID: String(booking.ItemID), Start: booking.Start, End: booking.End,
      Quantity: Number(booking.Quantity) > 0 ? Number(booking.Quantity) : 1,
      Status: BookingRules.approved.includes(booking.Status) ? STATUS.APPROVED : STATUS.P1 };
  });
}

function getNotificationSummary(data) {
  const actor = verifiedActor_(data), role = actor.role || "STUDENT";
  const config = role === "STUDENT" ? {} : getStaffConfig();
  if (role !== "STUDENT" && !BookingRules.rolesFor(actor.email, config).includes(role)) {
    throw new Error("บทบาทนี้ไม่มีสิทธิ์ดูการแจ้งเตือน");
  }
  const bookings = getDisplayBookings_(false);
  const readState = Object.create(null);
  let relevant, count;
  if (role === "STUDENT") {
    const seen = data.seen && typeof data.seen === "object" && !Array.isArray(data.seen) ? data.seen : {};
    const statuses = BookingRules.approved.concat(STATUS.REJECTED);
    relevant = bookings.filter(function(booking) {
      return String(booking.Email || "").toLowerCase().trim() === actor.email
        && booking.BookingID && statuses.includes(booking.Status);
    });
    relevant.forEach(function(booking) { readState[booking.BookingID] = booking.Status; });
    relevant = relevant.filter(function(booking) { return seen[booking.BookingID] !== booking.Status; });
    count = relevant.length;
  } else if (["ADVISORS", "HEAD_DEPT"].includes(role)) {
    relevant = bookings.filter(function(booking) { return BookingRules.canApprove(booking, actor.email, role, config); });
    count = relevant.length;
  } else {
    relevant = bookings.slice().reverse();
    count = 0;
  }
  const items = relevant.slice(0, 10).map(function(booking) {
    const item = { BookingID: booking.BookingID, ItemName: booking.ItemName || "", Status: booking.Status };
    if (role !== "STUDENT") item.Name = booking.Name || "";
    return item;
  });
  return { count: count, items: items, readState: readState };
}

function getAllBookings() {
  return sheetToObjects(SHEETS.BOOKINGS).map(function(b) {
    // Normalize old staff-queue rows for display without modifying stored history.
    if (BookingRules.approved.includes(b.Status)) {
      b.Status = STATUS.APPROVED;
      b.CurrentApproverName = STATUS.APPROVED;
    }
    return b;
  });
}

function getDisplayBookings_(refresh) {
  let cache, key;
  try {
    cache = CacheService.getScriptCache();
    key = "kcib_bookings_v1_" + (cache.get("kcib_bookings_revision") || "initial");
    if (!refresh) {
      const saved = cache.get(key);
      if (saved) return JSON.parse(saved);
    }
  } catch (_) {}
  const bookings = getAllBookings();
  try { if (cache && key) cache.put(key, JSON.stringify(bookings), 10); } catch (_) {}
  return bookings;
}

function invalidateBookingCache_() {
  // A new key also prevents an older in-flight read from repopulating the current cache.
  try { CacheService.getScriptCache().put("kcib_bookings_revision", Utilities.getUuid(), 21600); } catch (_) {}
}

// ==================== BOOKING VALIDATION ====================
function withBookingLock_(operation) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return operation(); }
  finally {
    try { SpreadsheetApp.flush(); }
    finally { invalidateBookingCache_(); lock.releaseLock(); }
  }
}

function inventoryCategory_(item) {
  const category = String(item.Category || item.category || "").toLowerCase();
  if (/glass|แก้ว/.test(category)) return "glassware";
  if (/chemical|สารเคมี/.test(category)) return "chemical";
  if (/scientific|วิทยาศาสตร์|อุปกรณ์/.test(category)) return "scientific";
  return "instrument";
}

function newBookingId_(bookings) {
  const existingIds = new Set(bookings.map(function(booking) { return String(booking.BookingID || "").toUpperCase(); }));
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = "BK-" + Utilities.getUuid().replace(/-/g, "").slice(0, 8).toUpperCase();
    if (!existingIds.has(id)) return id;
  }
  throw new Error("สร้างรหัสการจองไม่สำเร็จ กรุณาลองอีกครั้ง");
}

function submitBooking(data) {
  const studentId = typeof data.studentId === "string" ? data.studentId.trim() : "";
  if (!studentId && !studentIdOptional_(data)) return { success: false, error: "กรุณากรอกรหัสนักศึกษา" };
  return withBookingLock_(function() {
    const sheet = sh_(SHEETS.BOOKINGS);
    if (!sheet) throw new Error("Sheet 'ALlBooking' not found");
    const item = getInventory().find(function(item) {
      return String(item.ID || item.Id || item.id || item.ItemID || item._row) === String(data.itemId);
    });
    if (!item) return { success: false, error: "ไม่พบรายการในคลัง" };
    const quantity = data.quantity === "" || data.quantity == null ? 1 : Number(data.quantity);
    const holidays = getHolidays().map(function(day) { return day.date; });
    const invalid = BookingRules.validate(item, data.start || "", data.end || "", quantity, holidays);
    const messages = {
      advance: "ต้องจองล่วงหน้าอย่างน้อย 3 วันทำการทุกหมวด โดยไม่นับเสาร์ อาทิตย์ และวันหยุด",
      date: "กรุณาเลือกวันทำการภายใน 180 วัน",
      time: "กรุณาเลือกเวลารายชั่วโมงระหว่าง 09:00–16:00 น.",
      range: "วันและเวลาสิ้นสุดต้องอยู่หลังวันและเวลาเริ่ม",
      duration: "รายการนี้เลือกได้เฉพาะช่วงเวลา 1, 2 หรือ 3 ชั่วโมงในวันเดียวกัน",
      quantity: "จำนวนที่ขอจองต้องเป็นจำนวนเต็มตั้งแต่ 1 และไม่เกินจำนวนในคลัง"
    };
    if (invalid) return { success: false, error: messages[invalid] };
    const bookings = getAllBookings();
    const remaining = BookingRules.availableQuantity(data.itemId, data.start, data.end,
      bookings, Number(item.MaxQuantity || item.maxQty));
    if (quantity > remaining) return { success: false, error: "จำนวนว่างของรายการไม่พอในช่วงเวลานี้ เหลือ " + remaining };
    const advisor = (getStaffConfig().ADVISORS || []).find(function(person) {
      return person.email.toLowerCase() === String(data.advisorEmail || "").trim().toLowerCase();
    });
    if (!advisor) return { success: false, error: "กรุณาเลือกอาจารย์ที่ปรึกษาจากรายการ" };
    const bookingId = newBookingId_(bookings);
    sheet.appendRow([
      new Date(), bookingId, data.email || "", data.name || "", inventoryCategory_(item),
      item.ItemName || item.Name || item.name || "", String(data.itemId), data.course || "", quantity,
      new Date(BookingRules.timestamp(data.start)), new Date(BookingRules.timestamp(data.end)), data.note || "",
      advisor.email, STATUS.P1, advisor.name, studentId, data.educationLevel || ""
    ]);
    applyRowFormat_(sheet, sheet.getLastRow());
    return { success: true, bookingId: bookingId };
  });
}

// ==================== CANCEL BOOKING ====================
function cancelBooking(data) {
  return withBookingLock_(function() {
    const sheet = sh_(SHEETS.BOOKINGS);
    if (!sheet) return { success: false, error: "Sheet not found" };

    const headers  = getHeaders_(SHEETS.BOOKINGS);
    const allData  = sheet.getDataRange().getValues();
    const bidCol   = colIdx_(headers, "BookingID");
    const emCol    = colIdx_(headers, "Email");
    const stCol    = colIdx_(headers, "Status") + 1;
    const caCol    = colIdx_(headers, "CurrentApproverName") + 1;

    var rowNo = -1;
    for (var i = 1; i < allData.length; i++) {
      if (
        String(allData[i][bidCol]) === data.bookingId &&
        String(allData[i][emCol]).toLowerCase() === (data.email || "").toLowerCase()
      ) { rowNo = i + 1; break; }
    }
    if (rowNo === -1) return { success: false, error: "Booking not found" };

    sheet.getRange(rowNo, stCol).setValue(STATUS.CANCELLED);
    sheet.getRange(rowNo, caCol).setValue("ยกเลิกโดยผู้จอง");
    return { success: true };
  });
}

// ==================== APPROVAL ====================
function verifiedActor_(data) {
  if (!data.idToken) throw new Error("กรุณาเข้าสู่ระบบอีกครั้ง");
  let response;
  try {
    response = UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(data.idToken), { muteHttpExceptions: true });
  } catch (_) {
    throw new Error("ไม่สามารถยืนยันบัญชี Google ได้ กรุณาลองอีกครั้ง");
  }
  if (response.getResponseCode() !== 200) throw new Error("ไม่สามารถยืนยันบัญชี Google ได้ กรุณาเข้าสู่ระบบอีกครั้ง");
  const identity = JSON.parse(response.getContentText());
  const clientId = "334956664737-s7e0dirg9bfni63lr19qaogoc6cqmhum.apps.googleusercontent.com";
  if (identity.aud !== clientId || !["accounts.google.com", "https://accounts.google.com"].includes(identity.iss)
      || Number(identity.exp) * 1000 <= Date.now() || String(identity.email_verified) !== "true" || !identity.email) {
    throw new Error("บัญชี Google ไม่ถูกต้องหรือหมดอายุ");
  }
  return { email: identity.email.toLowerCase().trim(), role: data.activeRole };
}

function studentIdOptional_(data) {
  if (!data.idToken) return false;
  const actor = verifiedActor_(data);
  return actor.email === String(data.email || "").toLowerCase().trim()
    && BookingRules.rolesFor(actor.email, getStaffConfig()).length > 0;
}

function approveBooking(data) {
  return changeBookings_(data, false, false);
}

function changeBookings_(data, reject, bulk) {
  // Remote token verification must not hold the spreadsheet mutation lock.
  const actor = verifiedActor_(data);
  const ids = bulk ? data.bookingIds : [data.bookingId];
  if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== "string" || !id)) {
    return { success: false, error: "กรุณาระบุรายการจองไม่เกิน 200 รายการ" };
  }
  return withBookingLock_(function() {
    const sheet = sh_(SHEETS.BOOKINGS);
    const rows = sheet.getDataRange().getValues();
    const headers = rows[0].map(header => String(header).trim());
    const idColumn = headers.indexOf("BookingID"), statusColumn = headers.indexOf("Status"), nameColumn = headers.indexOf("CurrentApproverName");
    if ([idColumn, statusColumn, nameColumn].some(index => index < 0)) throw new Error("โครงสร้างชีตการจองไม่ครบ");
    const config = getStaffConfig();
    const bookings = [], errors = [];
    Array.from(new Set(ids)).forEach(function(id) {
      const rowIndex = rows.findIndex((row, index) => index > 0 && String(row[idColumn]) === id);
      if (rowIndex < 0) { errors.push({ bookingId: id, error: "ไม่พบรายการจอง" }); return; }
      const row = rows[rowIndex], booking = bookingRowObject_(headers, row, rowIndex + 1);
      const expected = bulk ? (data.expectedStatuses || {})[id] : data.expectedStatus;
      if (expected && expected !== booking.Status) {
        errors.push({ bookingId: id, error: "สถานะเปลี่ยนแล้ว กรุณารีเฟรชรายการ" }); return;
      }
      if (!BookingRules.canApprove(booking, actor.email, actor.role, config)) {
        errors.push({ bookingId: id, error: "บทบาทนี้ไม่มีสิทธิ์ดำเนินการกับรายการนี้" }); return;
      }
      const status = reject ? STATUS.REJECTED : booking.Status === STATUS.P1 ? STATUS.P2 : STATUS.APPROVED;
      const name = status === STATUS.P2
        ? (config.HEAD_DEPT || []).map(person => person.name).join(", ") || "หัวหน้าภาควิชา" : status;
      // The normal schema has adjacent state columns: one write, no extra header reads.
      if (Math.abs(statusColumn - nameColumn) === 1) {
        sheet.getRange(rowIndex + 1, Math.min(statusColumn, nameColumn) + 1, 1, 2)
          .setValues([statusColumn < nameColumn ? [status, name] : [name, status]]);
      } else {
        sheet.getRange(rowIndex + 1, statusColumn + 1).setValue(status);
        sheet.getRange(rowIndex + 1, nameColumn + 1).setValue(name);
      }
      row[statusColumn] = booking.Status = status;
      row[nameColumn] = booking.CurrentApproverName = name;
      bookings.push(booking);
    });
    if (bulk) return { success: true, bookings: bookings, errors: errors };
    return bookings.length ? { success: true, booking: bookings[0] } : { success: false, error: errors[0].error };
  });
}

// ==================== USER PROFILES ====================
function getProfile(email) {
  if (!email) return { studentId: "", educationLevel: "" };
  const lc = email.toLowerCase().trim();
  const sheet = sh_(SHEETS.PROFILES);
  if (!sheet) return { studentId: "", educationLevel: "" };
  const rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").toLowerCase().trim() === lc) {
      return { studentId: String(rows[i][1] || ""), educationLevel: String(rows[i][2] || "") };
    }
  }
  return { studentId: "", educationLevel: "" };
}

function saveProfile(data) {
  if (!data.email) return { success: false, error: "email required" };
  const studentId = typeof data.studentId === "string" ? data.studentId.trim() : "";
  if (!studentId && !studentIdOptional_(data)) return { success: false, error: "กรุณากรอกรหัสนักศึกษา" };
  const lc = data.email.toLowerCase().trim();
  var sheet = sh_(SHEETS.PROFILES);
  if (!sheet) {
    sheet = ss_().insertSheet(SHEETS.PROFILES);
    sheet.appendRow(["Email", "StudentID", "EducationLevel", "UpdatedAt"]);
  }

  const rows  = sheet.getDataRange().getValues();
  const now   = new Date();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0] || "").toLowerCase().trim() === lc) {
      sheet.getRange(i + 1, 2).setValue(studentId);
      sheet.getRange(i + 1, 3).setValue(data.educationLevel || "");
      sheet.getRange(i + 1, 4).setValue(now);
      applyRowFormat_(sheet, i + 1);
      return { success: true };
    }
  }
  sheet.appendRow([lc, studentId, data.educationLevel || "", now]);
  applyRowFormat_(sheet, sheet.getLastRow());
  return { success: true };
}

// ==================== LINE NOTIFICATION ====================

// Status label map for LINE message
const STATUS_LABEL = {
  "รอที่ปรึกษาอนุมัติ": "รออาจารย์ที่ปรึกษาอนุมัติ",
  "รออนุมัติขั้นที่ 2":  "รอหัวหน้าภาควิชาอนุมัติ"
};

// Order for grouping in message
const STATUS_ORDER = [
  STATUS.P1,
  STATUS.P2
];

function sendDailyLineReport() {
  const props      = PropertiesService.getScriptProperties();
  const token      = props.getProperty("LINE_TOKEN");
  const groupId    = props.getProperty("LINE_GROUP_ID");
  if (!token || !groupId) {
    Logger.log("LINE_TOKEN or LINE_GROUP_ID not set in Script Properties");
    return;
  }

  const pending = sheetToObjects(SHEETS.BOOKINGS).filter(function(b) {
    return STATUS_ORDER.indexOf(String(b.Status || "").trim()) !== -1;
  });

  if (pending.length === 0) return; // ไม่มีรายการค้าง ไม่ส่ง

  // Group by status
  var groups = {};
  STATUS_ORDER.forEach(function(s) { groups[s] = []; });
  pending.forEach(function(b) {
    var s = String(b.Status || "").trim();
    if (groups[s]) groups[s].push(b);
  });

  var today = Utilities.formatDate(new Date(), "Asia/Bangkok", "d MMM");
  var lines  = [" KCIB - รายการจองรอดำเนินการ (" + today + ")\n"];

  STATUS_ORDER.forEach(function(s) {
    var items = groups[s];
    if (items.length === 0) return;
    var label = STATUS_LABEL[s] || s;
    lines.push(label + " (" + items.length + " รายการ)");
    items.forEach(function(b) {
      var qty      = b.Quantity && b.Quantity > 1 ? " ×" + b.Quantity : "";
      var approver = s === STATUS.P1 ? " (" + (b.CurrentApproverName || b.AdvisorEmail || "") + ")" : "";
      lines.push("• " + (b.ItemName || "") + qty + " - " + (b.Name || b.Email || "") + approver);
    });
    lines.push(""); // blank line between groups
  });

  lines.push(" " + KCIB_SITE_URL);

  var message = lines.join("\n").trim();

  var payload = JSON.stringify({
    to: groupId,
    messages: [{ type: "text", text: message }]
  });

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    contentType: "application/json",
    headers: { "Authorization": "Bearer " + token },
    payload: payload,
    muteHttpExceptions: true
  });
}

// Run this once manually to verify token + group ID are set correctly
function testLineReport() {
  sendDailyLineReport();
}

// ==================== REJECT BOOKING ====================
function rejectBooking(data) {
  return changeBookings_(data, true, false);
}

// ==================== SHEET FORMATTING ====================

const CATEGORY_OPTIONS = [
  "เครื่องแก้ว",
  "อุปกรณ์วิทยาศาสตร์",
  "เครื่องมือ",
  "เครื่องมือวิเคราะห์",
  "สารเคมี"
];

const THEME = {
  headerBg:    "#e65100",
  headerFg:    "#ffffff",
  row1Bg:      "#ffffff",
  row2Bg:      "#fff3e0",
  borderColor: "#ffcc80",
  font:        "Google Sans"
};

const DATE_FORMAT = "dd/MM/yyyy HH:mm";
const DATE_COLS   = ["Timestamp", "Start", "End", "UpdatedAt", "StaffAcknowledgedAt"];

function formatAllSheets() {
  formatSheet_(SHEETS.BOOKINGS,  { statusCol: "Status" });
  formatSheet_(SHEETS.INVENTORY, { categoryCol: "Category" });
  formatSheet_(SHEETS.HOLIDAYS,  {});
  formatSheet_(SHEETS.STAFF,     {});
  formatSheet_(SHEETS.PROFILES,  {});
}

function formatSheet_(sheetName, options) {
  var sheet = sh_(sheetName);
  if (!sheet) return;

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0 || lastRow === 0) return;

  // Freeze header row
  sheet.setFrozenRows(1);

  // Remove existing bandings
  sheet.getBandings().forEach(function(b) { b.remove(); });

  // Apply banding (alternating row colors)
  var fullRange = sheet.getRange(1, 1, lastRow, lastCol);
  fullRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false)
    .setHeaderRowColor(THEME.headerBg)
    .setFirstRowColor(THEME.row1Bg)
    .setSecondRowColor(THEME.row2Bg);

  // Font: Google Sans for all cells
  fullRange.setFontFamily(THEME.font);

  // Header styling
  var header = sheet.getRange(1, 1, 1, lastCol);
  header
    .setFontColor(THEME.headerFg)
    .setFontWeight("bold")
    .setFontSize(10)
    .setHorizontalAlignment("center")
    .setVerticalAlignment("middle")
    .setWrap(true);
  sheet.setRowHeight(1, 40);

  // Data rows: consistent height + vertical alignment
  if (lastRow > 1) {
    var dataRows = sheet.getRange(2, 1, lastRow - 1, lastCol);
    dataRows.setVerticalAlignment("middle");
    for (var r = 2; r <= lastRow; r++) sheet.setRowHeight(r, 28);
  }

  // Borders
  fullRange.setBorder(
    true, true, true, true, true, true,
    THEME.borderColor, SpreadsheetApp.BorderStyle.SOLID
  );

  // Auto-resize columns (capped 60–280 px)
  for (var c = 1; c <= lastCol; c++) {
    sheet.autoResizeColumn(c);
    var w = sheet.getColumnWidth(c);
    if (w > 280) sheet.setColumnWidth(c, 280);
    if (w < 60)  sheet.setColumnWidth(c, 60);
  }

  // Date column formatting
  if (lastRow > 1) {
    var allHdrs = getHeaders_(sheetName);
    DATE_COLS.forEach(function(colName) {
      var dIdx = allHdrs.indexOf(colName);
      if (dIdx !== -1) {
        sheet.getRange(2, dIdx + 1, lastRow - 1, 1).setNumberFormat(DATE_FORMAT);
      }
    });
  }

  // Conditional formatting by Status (ALlBooking only)
  if (options.statusCol && lastRow > 1) {
    var headers  = getHeaders_(sheetName);
    var sIdx     = headers.indexOf(options.statusCol);
    if (sIdx === -1) return;
    var colLetter = columnLetter_(sIdx + 1);
    var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);

    var conditions = [
      { value: STATUS.APPROVED,  bg: "#c6efce", fg: "#276221" },
      { value: STATUS.P1,        bg: "#ffeb9c", fg: "#7d5a00" },
      { value: STATUS.P2,        bg: "#ffe0b2", fg: "#7f3f00" },
      { value: STATUS.P3,        bg: "#fff9c4", fg: "#615400" },
      { value: STATUS.REJECTED,  bg: "#ffc7ce", fg: "#9c0006" },
      { value: STATUS.CANCELLED, bg: "#ededed", fg: "#636363" }
    ];

    var rules = conditions.map(function(cond) {
      return SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=$' + colLetter + '2="' + cond.value + '"')
        .setBackground(cond.bg)
        .setFontColor(cond.fg)
        .setRanges([dataRange])
        .build();
    });

    sheet.setConditionalFormatRules(rules);
  }

  // Category dropdown validation (Inventory only)
  if (options.categoryCol && lastRow > 1) {
    var allHeaders = getHeaders_(sheetName);
    var cIdx = allHeaders.indexOf(options.categoryCol);
    if (cIdx !== -1) {
      var catRange = sheet.getRange(2, cIdx + 1, Math.max(lastRow - 1, 500), 1);
      var rule = SpreadsheetApp.newDataValidation()
        .requireValueInList(CATEGORY_OPTIONS, true)
        .setAllowInvalid(false)
        .setHelpText("เลือกหมวดหมู่จากรายการ")
        .build();
      catRange.setDataValidation(rule);
    }
  }
}

function columnLetter_(col) {
  var letter = '';
  while (col > 0) {
    var rem = (col - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    col = Math.floor((col - 1) / 26);
  }
  return letter;
}

// Apply theme styling + date format to a single data row
function applyRowFormat_(sheet, rowNo) {
  var lastCol = sheet.getLastColumn();
  if (rowNo < 2 || lastCol < 1) return;
  var range = sheet.getRange(rowNo, 1, 1, lastCol);
  var bg = (rowNo % 2 === 0) ? THEME.row1Bg : THEME.row2Bg;
  range
    .setBackground(bg)
    .setFontFamily(THEME.font)
    .setVerticalAlignment("middle")
    .setBorder(true, true, true, true, true, true,
      THEME.borderColor, SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeight(rowNo, 28);

  // Date formats
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  DATE_COLS.forEach(function(colName) {
    var idx = headers.indexOf(colName);
    if (idx !== -1) sheet.getRange(rowNo, idx + 1).setNumberFormat(DATE_FORMAT);
  });
}

// ==================== TRIGGERS ====================

// Run once manually from Apps Script editor to install the onEdit trigger
function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === "onEditInstallable") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditInstallable")
    .forSpreadsheet(ss_())
    .onEdit()
    .create();
}

// Fires when a user manually edits any cell in the spreadsheet
function onEditInstallable(e) {
  if (!e || !e.range) return;
  var rowNo = e.range.getRow();
  if (rowNo < 2) return;
  applyRowFormat_(e.range.getSheet(), rowNo);
}

