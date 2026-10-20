// ============================================================
// KCIB Backend — Google Apps Script
// Spreadsheet: 18nu0jZcDyyEJGfylpazITc5lK2gdb0u5rrmESQnPVZ4
// Approval: ADVISORS → HEAD_DEPT. Staff acknowledge approved bookings.
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
function ss_()        { return SpreadsheetApp.openById(SHEET_ID); }
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
  return rows.slice(1).map(function(row, ri) {
    var obj = { _row: ri + 2 };
    headers.forEach(function(h, i) {
      obj[h] = row[i] instanceof Date
        ? Utilities.formatDate(row[i], "Asia/Bangkok", "yyyy-MM-dd'T'HH:mm:ss")
        : row[i];
    });
    return obj;
  });
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
      case "init":          return jsonOut(getInitData());
      case "getMyBookings": return jsonOut(getMyBookings(p.email));
      case "getAllBookings": return jsonOut(getAllBookings());
      case "getProfile":    return jsonOut(getProfile(p.email));
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
      case "acknowledgeBooking": return jsonOut(acknowledgeBooking(data));
      case "saveProfile":    return jsonOut(saveProfile(data));
      default:               return jsonOut({ error: "Invalid action: " + data.action });
    }
  } catch (err) {
    Logger.log("doPost error: " + err.stack);
    return jsonOut({ error: err.message });
  }
}

// ==================== INIT DATA ====================
function getInitData() {
  return {
    inventory:   getInventory(),
    holidays:    getHolidays(),
    staffConfig: getStaffConfig()
  };
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
function getMyBookings(email) {
  if (!email) return [];
  return sheetToObjects(SHEETS.BOOKINGS).filter(function(b) {
    return String(b.Email || "").toLowerCase() === email.toLowerCase();
  });
}

function getAllBookings() {
  return sheetToObjects(SHEETS.BOOKINGS);
}

// ==================== BOOKING VALIDATION ====================
function withBookingLock_(operation) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return operation(); } finally { lock.releaseLock(); }
}

function inventoryCategory_(item) {
  const category = String(item.Category || item.category || "").toLowerCase();
  if (/glass|แก้ว/.test(category)) return "glassware";
  if (/chemical|สารเคมี/.test(category)) return "chemical";
  if (/scientific|วิทยาศาสตร์|อุปกรณ์/.test(category)) return "scientific";
  return "instrument";
}

function submitBooking(data) {
  return withBookingLock_(function() {
    const sheet = sh_(SHEETS.BOOKINGS);
    if (!sheet) throw new Error("Sheet 'ALlBooking' not found");
    const item = getInventory().find(function(item) {
      return String(item.ID || item.Id || item.id || item.ItemID || item._row) === String(data.itemId);
    });
    if (!item) return { success: false, error: "ไม่พบอุปกรณ์ในคลัง" };
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
    const remaining = BookingRules.availableQuantity(data.itemId, data.start, data.end,
      getAllBookings(), Number(item.MaxQuantity || item.maxQty));
    if (quantity > remaining) return { success: false, error: "อุปกรณ์ว่างไม่พอในช่วงเวลานี้ เหลือ " + remaining };
    const advisor = (getStaffConfig().ADVISORS || []).find(function(person) {
      return person.email.toLowerCase() === String(data.advisorEmail || "").trim().toLowerCase();
    });
    if (!advisor) return { success: false, error: "กรุณาเลือกอาจารย์ที่ปรึกษาจากรายการ" };
    const bookingId = "BK" + Utilities.getUuid();
    sheet.appendRow([
      new Date(), bookingId, data.email || "", data.name || "", inventoryCategory_(item),
      item.ItemName || item.Name || item.name || "", String(data.itemId), data.course || "", quantity,
      new Date(BookingRules.timestamp(data.start)), new Date(BookingRules.timestamp(data.end)), data.note || "",
      advisor.email, STATUS.P1, advisor.name, data.studentId || "", data.educationLevel || ""
    ]);
    applyRowFormat_(sheet, sheet.getLastRow());
    return { success: true, bookingId: bookingId };
  });
}

// ==================== CANCEL BOOKING ====================
function cancelBooking(data) {
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
}

// ==================== APPROVAL / STAFF ACKNOWLEDGEMENT ====================
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

function bookingActionContext_(data) {
  const actor = verifiedActor_(data);
  const booking = getAllBookings().find(function(row) { return String(row.BookingID) === String(data.bookingId); });
  if (!booking) throw new Error("ไม่พบรายการจอง");
  return { actor: actor, booking: booking, config: getStaffConfig(), sheet: sh_(SHEETS.BOOKINGS) };
}

function setBookingValue_(sheet, row, name, value) {
  const headers = getHeaders_(SHEETS.BOOKINGS);
  let column = headers.indexOf(name) + 1;
  if (!column) {
    column = headers.length + 1;
    sheet.getRange(1, column).setValue(name);
  }
  sheet.getRange(row, column).setValue(value);
}

function approveBooking(data) {
  return withBookingLock_(function() {
    const context = bookingActionContext_(data);
    const b = context.booking, actor = context.actor;
    if (!BookingRules.canApprove(b, actor.email, actor.role, context.config)) {
      return { success: false, error: "บทบาทนี้ไม่มีสิทธิ์อนุมัติรายการนี้" };
    }
    const next = b.Status === STATUS.P1 ? STATUS.P2 : STATUS.APPROVED;
    const name = next === STATUS.P2
      ? (context.config.HEAD_DEPT || []).map(function(person) { return person.name; }).join(", ") || "หัวหน้าภาควิชา"
      : "อนุมัติแล้ว รอเจ้าหน้าที่รับทราบ";
    setBookingValue_(context.sheet, b._row, "Status", next);
    setBookingValue_(context.sheet, b._row, "CurrentApproverName", name);
    return { success: true };
  });
}

function acknowledgeBooking(data) {
  return withBookingLock_(function() {
    const context = bookingActionContext_(data);
    const b = context.booking, actor = context.actor;
    if (!BookingRules.canAcknowledge(b, actor.email, actor.role, context.config)) {
      return { success: false, error: "ไม่สามารถรับทราบรายการนี้ได้ หรือรับทราบแล้ว" };
    }
    setBookingValue_(context.sheet, b._row, "StaffAcknowledgedAt", new Date());
    setBookingValue_(context.sheet, b._row, "StaffAcknowledgedBy", actor.email);
    setBookingValue_(context.sheet, b._row, "Status", STATUS.APPROVED);
    setBookingValue_(context.sheet, b._row, "CurrentApproverName", "เจ้าหน้าที่รับทราบแล้ว");
    return { success: true };
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
      sheet.getRange(i + 1, 2).setValue(data.studentId      || "");
      sheet.getRange(i + 1, 3).setValue(data.educationLevel || "");
      sheet.getRange(i + 1, 4).setValue(now);
      applyRowFormat_(sheet, i + 1);
      return { success: true };
    }
  }
  sheet.appendRow([lc, data.studentId || "", data.educationLevel || "", now]);
  applyRowFormat_(sheet, sheet.getLastRow());
  return { success: true };
}

// ==================== LINE NOTIFICATION ====================

// Status label map for LINE message
const STATUS_LABEL = {
  "รอที่ปรึกษาอนุมัติ": "รออาจารย์ที่ปรึกษาอนุมัติ",
  "รออนุมัติขั้นที่ 2":  "รอหัวหน้าภาควิชาอนุมัติ",
  "รออนุมัติขั้นที่ 3":  "รอเจ้าหน้าที่รับทราบ"
};

// Order for grouping in message
const STATUS_ORDER = [
  STATUS.P1,
  STATUS.P2,
  STATUS.P3
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
  var lines  = [" KCIB — รายการจองรอดำเนินการ (" + today + ")\n"];

  STATUS_ORDER.forEach(function(s) {
    var items = groups[s];
    if (items.length === 0) return;
    var label = STATUS_LABEL[s] || s;
    lines.push(label + " (" + items.length + " รายการ)");
    items.forEach(function(b) {
      var qty      = b.Quantity && b.Quantity > 1 ? " ×" + b.Quantity : "";
      var approver = s === STATUS.P1 ? " (" + (b.CurrentApproverName || b.AdvisorEmail || "") + ")" : "";
      lines.push("• [" + b.BookingID + "] " + (b.ItemName || "") + qty + " — " + (b.Name || b.Email || "") + approver);
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
  return withBookingLock_(function() {
    const context = bookingActionContext_(data);
    const b = context.booking, actor = context.actor;
    if (!BookingRules.canApprove(b, actor.email, actor.role, context.config)) {
      return { success: false, error: "บทบาทนี้ไม่มีสิทธิ์ปฏิเสธรายการนี้" };
    }
    setBookingValue_(context.sheet, b._row, "Status", STATUS.REJECTED);
    setBookingValue_(context.sheet, b._row, "CurrentApproverName", "ปฏิเสธ");
    return { success: true };
  });
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

