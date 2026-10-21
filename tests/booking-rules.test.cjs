const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const rulesSource = fs.readFileSync('js/booking-rules.js', 'utf8');
const rules = vm.runInNewContext(rulesSource + '\nBookingRules', { Date });
const now = new Date('2026-10-20T03:00:00Z');
const minStart = '2026-10-23T09:00:00';
const item = { ID:'one', Category:'instrument', ItemName:'UV-Vis Spectrophotometer', MaxQuantity:5 };

test('three business days excludes weekends, holidays, and uses Bangkok midnight', () => {
  assert.equal(rules.minDate([], now), '2026-10-23');
  assert.equal(rules.minDate(['2026-10-23'], now), '2026-10-26');
  assert.equal(rules.minDate(['2026-10-26'], new Date('2026-10-23T03:00:00Z')), '2026-10-29');
  assert.equal(rules.today(new Date('2026-10-19T18:00:00Z')), '2026-10-20');
});

test('all requested equipment supports custom dates and times; unrelated instruments do not', () => {
  for (const name of ['เตาเผา', 'เตาอบ', 'Muffle furnace', 'Drying oven', 'HPLC', 'GC', 'Gas Chromatograph'])
    assert(rules.allowsDateTime({ItemName:name,Category:'instrument'}), name);
  for (const category of ['glassware','scientific','เครื่องแก้ว','อุปกรณ์วิทยาศาสตร์'])
    assert(rules.allowsDateTime({Category:category,ItemName:'Example'}), category);
  assert.equal(rules.allowsDateTime(item), false);
  assert.equal(rules.allowsDateTime({Category:'chemical',ItemName:'Acetone'}), false);
});

test('every category enforces lead time, dates, time order, and quantity', () => {
  for (const Category of ['instrument','glassware','scientific','chemical']) {
    assert.equal(rules.validate({...item,Category}, '2026-10-22T09:00:00','2026-10-22T12:00:00',1,[],now), 'advance');
    assert.equal(rules.validate({...item,Category},minStart,'2026-10-23T12:00:00',1,[],now),'');
  }
  assert.equal(rules.validate(item,minStart,'2026-10-23T08:00:00',1,[],now),'time');
  assert.equal(rules.validate(item,minStart,minStart,1,[],now),'range');
  assert.equal(rules.validate(item,minStart,'2026-10-23T12:00:00',6,[],now),'quantity');
  assert.equal(rules.validate(item,minStart,'2026-10-23T12:00:00',1.5,[],now),'quantity');
  assert.equal(rules.validate(item,'2026-11-31T09:00:00','2026-11-31T12:00:00',1,[],now),'date');
  assert.equal(rules.validate(item,'2026-99-23T09:00:00','2026-99-23T12:00:00',1,[],now),'date');
  assert.equal(rules.validate(item,'2026-10-24T09:00:00','2026-10-24T12:00:00',1,[],now),'date');
  assert.equal(rules.validate(item,minStart,'2026-10-23T12:00:00',1,['2026-10-23'],now),'advance');
});

test('all items support 1/2/3 hours; only eligible items support longer or multi-day ranges', () => {
  for (const hours of [1,2,3]) assert.equal(rules.validate(item,minStart,`2026-10-23T${9+hours}:00:00`,1,[],now),'');
  assert.equal(rules.validate(item,minStart,'2026-10-23T13:00:00',1,[],now),'duration');
  assert.equal(rules.validate({...item,ItemName:'HPLC'},minStart,'2026-10-26T16:00:00',1,[],now),'');
});

test('invalid or missing inventory quantities cannot become bookable', () => {
  for (const MaxQuantity of [0,undefined,'unknown',-1,1.5])
    assert.equal(rules.validate({...item,MaxQuantity},minStart,'2026-10-23T12:00:00',1,[],now),'quantity');
});

test('repeated StaffConfig rows preserve all assigned roles and members', () => {
  const data=[['Role','Emails','Names'],['ADVISORS','DUAL@kmitl.ac.th','Teacher'],['HEAD_DEPT','dual@kmitl.ac.th','Head'],['ADVISORS','second@kmitl.ac.th','Second Teacher']];
  const config=vm.runInNewContext(fs.readFileSync('code.gs','utf8')+'\ngetStaffConfig()',{
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>({getDataRange:()=>({getValues:()=>data})})})}
  });
  assert.equal(config.ADVISORS.length,2);
  assert.deepEqual(Array.from(rules.rolesFor('dual@kmitl.ac.th',config)),['ADVISORS','HEAD_DEPT']);
});

test('availability counts quantities at peak overlap, ignores rejected and adjacent bookings', () => {
  const booking = (start,end,Quantity,Status='อนุมัติแล้ว') => ({ItemID:'one',Start:`2026-10-23T${start}:00:00`,End:`2026-10-23T${end}:00:00`,Quantity,Status});
  assert.equal(rules.availableQuantity('one',minStart,'2026-10-23T12:00:00',[booking('09','10',3),booking('10','11',3)],5),2);
  assert.equal(rules.availableQuantity('one',minStart,'2026-10-23T12:00:00',[booking('09','11',3),booking('10','12',2)],5),0);
  assert.equal(rules.availableQuantity('one',minStart,'2026-10-23T12:00:00',[booking('12','14',5),booking('09','12',5,'ปฏิเสธ')],5),5);
});

function backend() {
  const headers = ['Timestamp','BookingID','Email','Name','Category','ItemName','ItemID','Course','Quantity','Start','End','Note','AdvisorEmail','Status','CurrentApproverName','StudentID','EducationLevel'];
  const rows = [headers.slice()];
  const metrics = { reads: 0, writes: 0, tokenChecks: 0, tokenChecksUnderLock: 0, initReads: 0 };
  let locks = 0, releases = 0, uuid = 0;
  const cache = new Map();
  const sheet = {
    getDataRange: () => ({getValues:()=>{metrics.reads++;return rows.map(row=>row.slice());}}),
    getRange: (r,c,rs=1,cs=1) => ({
      getValues:()=>Array.from({length:rs},(_,i)=>Array.from({length:cs},(_,j)=>rows[r+i-1]?.[c+j-1] ?? '')),
      getValue:()=>rows[r-1]?.[c-1] ?? '',
      setValue:value=>{metrics.writes++;rows[r-1] ||= [];rows[r-1][c-1]=value;},
      setValues:values=>{metrics.writes++;values.forEach((row,i)=>row.forEach((value,j)=>{rows[r+i-1] ||= [];rows[r+i-1][c+j-1]=value;}));}
    }),
    appendRow: row => rows.push(row), getLastRow:()=>rows.length, getLastColumn:()=>rows[0].length
  };
  const config = {
    ADVISORS:[{email:'dual@kmitl.ac.th',name:'Advisor'}],
    HEAD_DEPT:[{email:'dual@kmitl.ac.th',name:'Head'}],
    STAFF_FLOOR_1:[{email:'staff@kmitl.ac.th',name:'Staff'}],
    STAFF_PROJECT_2:[{email:'tp2@kmitl.ac.th',name:'TP2 Staff'}],
    VIEWERS:[{email:'viewer@kmitl.ac.th',name:'Viewer'}]
  };
  class FixedDate extends Date {
    constructor(...args) {super(...(args.length?args:[now.getTime()]));}
    static now() {return now.getTime();}
  }
  const context = vm.createContext({
    Date:FixedDate, console,
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet}),flush:()=>{}},
    LockService:{getScriptLock:()=>({waitLock:()=>locks++,releaseLock:()=>releases++})},
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,value)})},
    Utilities:{getUuid:()=>(++uuid).toString(16).padStart(8,'0')+'-0000-4000-8000-000000000000',formatDate:d=>new Date(d.getTime()+7*3600000).toISOString().slice(0,19)},
    UrlFetchApp:{fetch:url=>{metrics.tokenChecks++;if(locks>releases)metrics.tokenChecksUnderLock++;return {getResponseCode:()=>url.endsWith('invalid')?401:200,getContentText:()=>JSON.stringify({
      email:decodeURIComponent(url.split('=').pop()), aud:'334956664737-s7e0dirg9bfni63lr19qaogoc6cqmhum.apps.googleusercontent.com',
      iss:'https://accounts.google.com',email_verified:'true',exp:2000000000
    })};}}
  });
  vm.runInContext(rulesSource + '\n' + fs.readFileSync('code.gs','utf8'), context);
  context.getStaffConfig = () => config;
  context.getInventory = () => {metrics.initReads++;return [item,{...item,ID:'glass',Category:'glassware',ItemName:'Beaker'}];};
  context.getHolidays = () => [];
  context.applyRowFormat_ = () => {};
  const addBooking = overrides => {
    const obj = {BookingID:'BK1',Email:'student@kmitl.ac.th',AdvisorEmail:'dual@kmitl.ac.th',Status:'รอที่ปรึกษาอนุมัติ',ItemID:'one',Quantity:1,Start:minStart,End:'2026-10-23T12:00:00',...overrides};
    rows.push(headers.map(key=>obj[key]??''));
    return obj;
  };
  const action = (email,activeRole) => ({bookingId:'BK1',idToken:email,activeRole,staffEmail:'spoof@kmitl.ac.th'});
  return {context,rows,config,addBooking,action,metrics,cache,lockCounts:()=>[locks,releases]};
}

test('new bookings use short unique IDs and retry collisions under the booking lock', () => {
  const b = backend();
  b.addBooking({BookingID:'BK-ABCDEF12'});
  const uuids = ['abcdef12-0000-4000-8000-000000000000','12ab34cd-0000-4000-8000-000000000000','ffffffff-0000-4000-8000-000000000000'];
  b.context.Utilities.getUuid = () => uuids.shift();
  const result = b.context.submitBooking({itemId:'one',start:minStart,end:'2026-10-23T12:00:00',quantity:1,advisorEmail:'dual@kmitl.ac.th',studentId:'66010380'});
  assert.equal(result.success,true);
  assert.equal(result.bookingId,'BK-12AB34CD');
  assert.match(result.bookingId,/^BK-[0-9A-F]{8}$/);
  assert.equal(b.rows[1][1],'BK-ABCDEF12');
  assert.equal(b.rows[2][1],result.bookingId);
  assert.equal(b.metrics.reads,1);
  assert.deepEqual(b.lockCounts(),[1,1]);
});

test('an existing long booking ID remains usable and exhausted collisions do not save a booking', () => {
  const b = backend();
  const legacyId = 'BK12345678-1234-4123-8123-123456789abc';
  b.addBooking({BookingID:legacyId});
  assert.equal(b.context.cancelBooking({bookingId:legacyId,email:'student@kmitl.ac.th'}).success,true);
  b.addBooking({BookingID:'BK-ABCDEF12'});
  b.context.Utilities.getUuid = () => 'abcdef12-0000-4000-8000-000000000000';
  const count = b.rows.length;
  assert.throws(()=>b.context.submitBooking({itemId:'one',start:minStart,end:'2026-10-23T12:00:00',quantity:1,advisorEmail:'dual@kmitl.ac.th',studentId:'66010380'}),/สร้างรหัสการจองไม่สำเร็จ/);
  assert.equal(b.rows.length,count);
  assert.deepEqual(b.lockCounts(),[2,2]);
});

test('public calendar includes overlapping active bookings and returns no personal fields', () => {
  const b = backend();
  b.addBooking({Start:'2026-10-22T15:00:00',End:'2026-10-23T10:00:00',Name:'Private name',Note:'Private note'});
  b.addBooking({BookingID:'legacy',Status:'รออนุมัติขั้นที่ 3'});
  b.addBooking({BookingID:'rejected',Status:'ปฏิเสธ'});
  b.addBooking({BookingID:'cancelled',Status:'ยกเลิก'});
  b.addBooking({BookingID:'before',Start:'2026-10-22T09:00:00',End:'2026-10-23T00:00:00'});
  b.addBooking({BookingID:'after',Start:'2026-10-24T00:00:00',End:'2026-10-24T12:00:00'});
  b.context.jsonOut = data => data;
  const data = b.context.doGet({parameter:{func:'getCalendar',from:'2026-10-23',to:'2026-10-24'}});
  assert.equal(data.bookings.length,2);
  assert.equal(data.bookings[1].Status,'อนุมัติแล้ว');
  for (const booking of data.bookings) assert.deepEqual(Object.keys(booking).sort(),['End','ItemID','Quantity','Start','Status']);
  assert.doesNotMatch(JSON.stringify(data),/Private|@|BookingID|StudentID|AdvisorEmail/);
});

test('calendar rejects invalid, reversed, missing and oversized date ranges', () => {
  const b = backend();
  for (const [from,to] of [[undefined,'2026-11-01'],['2026-02-30','2026-03-01'],['2026-10-23','2026-10-23'],['2026-10-24','2026-10-23'],['2026-10-01','2026-11-13']]) {
    assert.throws(()=>b.context.getCalendar(from,to),/Invalid calendar date range/);
  }
  assert.equal(b.context.getCalendar('2026-10-01','2026-11-12').bookings.length,0);
});

test('backend validates canonical inventory and rejects forged schedules, lead-time and oversubscription', () => {
  const b = backend();
  const data = {itemId:'one',start:minStart,end:'2026-10-23T12:00:00',quantity:1,advisorEmail:'dual@kmitl.ac.th',studentId:'66010380'};
  assert.equal(b.context.submitBooking({...data,start:'2026-10-22T09:00:00',end:'2026-10-22T12:00:00'}).success,false);
  assert.equal(b.context.submitBooking({...data,itemName:'HPLC',category:'glassware',end:'2026-10-26T12:00:00'}).success,false);
  assert.equal(b.context.submitBooking({...data,quantity:6}).success,false);
  assert.equal(b.context.submitBooking({...data,itemId:'glass',start:'2026-10-20T09:00:00'}).success,false);
  assert.equal(b.rows.length,1);
  assert.equal(b.context.submitBooking({...data,quantity:4}).success,true);
  assert.equal(b.context.submitBooking({...data,quantity:2}).success,false);
  assert.equal(b.context.submitBooking({...data,start:'2026-10-23T12:00:00',end:'2026-10-23T15:00:00',quantity:5}).success,true);
  assert.deepEqual(b.lockCounts(),[7,7]);
});

test('booking and profile requests reject missing or whitespace-only student IDs before any writes', () => {
  const b = backend();
  for (const studentId of [undefined,null,'',' \t\n ',{},[]]) {
    const result = b.context.submitBooking({itemId:'one',start:minStart,end:'2026-10-23T12:00:00',quantity:1,advisorEmail:'dual@kmitl.ac.th',studentId});
    assert.equal(result.success,false);
    assert.match(result.error,/กรุณากรอกรหัสนักศึกษา/);
    const profile = b.context.saveProfile({email:'student@kmitl.ac.th',studentId});
    assert.equal(profile.success,false);
    assert.match(profile.error,/กรุณากรอกรหัสนักศึกษา/);
  }
  assert.equal(b.rows.length,1);
  assert.equal(b.metrics.writes,0);
  assert.equal(b.metrics.reads,0);
  assert.deepEqual(b.lockCounts(),[0,0]);
  const result = b.context.submitBooking({itemId:'one',start:minStart,end:'2026-10-23T12:00:00',quantity:1,advisorEmail:'dual@kmitl.ac.th',studentId:' 66010380 '});
  assert.equal(result.success,true);
  assert.equal(b.rows[1][b.rows[0].indexOf('StudentID')],'66010380');
});

test('student ID exemption uses verified identity and current StaffConfig, regardless of selected role', () => {
  const b = backend();
  for (const email of ['dual@kmitl.ac.th','staff@kmitl.ac.th','tp2@kmitl.ac.th','viewer@kmitl.ac.th']) {
    assert.equal(b.context.studentIdOptional_({email:email.toUpperCase(),idToken:email,activeRole:'STUDENT'}),true);
  }
  assert.equal(b.context.studentIdOptional_({email:'student@kmitl.ac.th',idToken:'student@kmitl.ac.th',activeRole:'ADVISORS'}),false);
  assert.equal(b.context.studentIdOptional_({email:'dual@kmitl.ac.th',idToken:'student@kmitl.ac.th',activeRole:'ADVISORS'}),false);
  assert.equal(b.context.studentIdOptional_({email:'dual@kmitl.ac.th',activeRole:'ADVISORS'}),false);
  assert.throws(()=>b.context.studentIdOptional_({email:'dual@kmitl.ac.th',idToken:'invalid'}));
  b.context.getInitData();
  b.config.STAFF_FLOOR_1 = [];
  assert.equal(b.context.studentIdOptional_({email:'staff@kmitl.ac.th',idToken:'staff@kmitl.ac.th'}),false);
});

test('listed staff can book and save profiles without a student ID; spoofed claims cannot', () => {
  const b = backend();
  const data = {itemId:'one',start:minStart,end:'2026-10-23T12:00:00',quantity:1,advisorEmail:'dual@kmitl.ac.th',studentId:' ',email:'dual@kmitl.ac.th',idToken:'dual@kmitl.ac.th',activeRole:'STUDENT'};
  assert.equal(b.context.submitBooking(data).success,true);
  assert.equal(b.rows[1][b.rows[0].indexOf('StudentID')],'');
  assert.equal(b.metrics.tokenChecksUnderLock,0);
  assert.equal(b.context.submitBooking({...data,idToken:'student@kmitl.ac.th'}).success,false);
  assert.equal(b.context.submitBooking({...data,email:'student@kmitl.ac.th',idToken:'student@kmitl.ac.th',activeRole:'HEAD_DEPT'}).success,false);
  assert.equal(b.rows.length,2);
  const profiles = [['Email','StudentID','EducationLevel','UpdatedAt']];
  b.context.sh_ = () => ({getDataRange:()=>({getValues:()=>profiles}),appendRow:row=>profiles.push(row),getLastRow:()=>profiles.length});
  assert.equal(b.context.saveProfile({email:data.email,idToken:data.idToken,studentId:''}).success,true);
  assert.equal(profiles.length,2);
  assert.equal(profiles[1][1],'');
  assert.equal(b.context.saveProfile({email:data.email,idToken:'student@kmitl.ac.th',studentId:''}).success,false);
  assert.equal(profiles.length,2);
});

test('dual-role teacher selects existing role; advisor then head approve without a staff approval step', () => {
  const b = backend(); b.addBooking({});
  assert.deepEqual(Array.from(rules.rolesFor('DUAL@kmitl.ac.th',b.config)),['ADVISORS','HEAD_DEPT']);
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','HEAD_DEPT')).success,false);
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','ADVISORS')).success,true);
  assert.equal(b.rows[1][13],'รออนุมัติขั้นที่ 2');
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','HEAD_DEPT')).success,true);
  assert.equal(b.rows[1][13],'อนุมัติแล้ว');
  assert.equal(b.rows[1][14],'อนุมัติแล้ว');
});

test('staff view bookings without approve, reject, or acknowledgement mutations', () => {
  for (const status of ['รอที่ปรึกษาอนุมัติ','รออนุมัติขั้นที่ 2','อนุมัติแล้ว','รออนุมัติขั้นที่ 3']) {
    const b = backend(); b.addBooking({Status:status});
    const before = JSON.stringify(b.rows);
    for (const [email,role] of [['staff@kmitl.ac.th','STAFF_FLOOR_1'],['tp2@kmitl.ac.th','STAFF_PROJECT_2']]) {
      assert.equal(b.context.approveBooking(b.action(email,role)).success,false);
      assert.equal(b.context.rejectBooking(b.action(email,role)).success,false);
      assert.equal(b.context.rejectBooking(b.action(email,'ADVISORS')).success,false);
    }
    b.context.jsonOut = value => value;
    assert.match(b.context.doPost({postData:{contents:JSON.stringify({action:'acknowledgeBooking',bookingId:'BK1'})}}).error,/Invalid action/);
    assert.equal(JSON.stringify(b.rows),before);
  }
});

test('legacy staff queue displays approved without changing history or entering action reminders', () => {
  const b = backend(); b.addBooking({Status:'รออนุมัติขั้นที่ 3',Course:'TEAM PROJECT 2',CurrentApproverName:'รอเจ้าหน้าที่รับทราบ'});
  const before = JSON.stringify(b.rows);
  const read = b.context.getAllBookings()[0];
  assert.equal(read.Status,'อนุมัติแล้ว');
  assert.equal(read.CurrentApproverName,'อนุมัติแล้ว');
  assert.equal(b.context.getMyBookings('student@kmitl.ac.th')[0].Status,'อนุมัติแล้ว');
  assert.equal(JSON.stringify(b.rows),before);
  assert.equal(rules.availableQuantity('one',minStart,'2026-10-23T12:00:00',[{...read,Status:'รออนุมัติขั้นที่ 3'}],1),0);
  assert.deepEqual(Array.from(vm.runInContext('STATUS_ORDER',b.context)),['รอที่ปรึกษาอนุมัติ','รออนุมัติขั้นที่ 2']);
  assert.throws(()=>b.context.approveBooking({bookingId:'BK1',staffEmail:'dual@kmitl.ac.th',activeRole:'HEAD_DEPT'}));
  assert.throws(()=>b.context.approveBooking(b.action('invalid','HEAD_DEPT')));
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','HEAD_DEPT')).success,false);
  assert.equal(JSON.stringify(b.rows),before);
});

test('approval returns the committed row with one booking read/write and verifies identity outside the lock', () => {
  const b = backend();b.addBooking({Note:'Keep note',Course:'Research'});
  const result = b.context.approveBooking({...b.action('dual@kmitl.ac.th','ADVISORS'),expectedStatus:'รอที่ปรึกษาอนุมัติ'});
  assert.equal(result.success,true);
  assert.equal(result.booking.Status,'รออนุมัติขั้นที่ 2');
  assert.equal(result.booking.CurrentApproverName,'Head');
  assert.equal(result.booking.Note,'Keep note');
  assert.deepEqual([b.metrics.reads,b.metrics.writes,b.metrics.tokenChecks,b.metrics.tokenChecksUnderLock],[1,1,1,0]);
  const before = JSON.stringify(b.rows);
  assert.equal(b.context.approveBooking({...b.action('dual@kmitl.ac.th','HEAD_DEPT'),expectedStatus:'รอที่ปรึกษาอนุมัติ'}).success,false);
  assert.equal(JSON.stringify(b.rows),before);
  const rejected = b.context.rejectBooking({...b.action('dual@kmitl.ac.th','HEAD_DEPT'),expectedStatus:'รออนุมัติขั้นที่ 2'});
  assert.equal(rejected.booking.Status,'ปฏิเสธ');
  assert.deepEqual(b.lockCounts(),[3,3]);
  const locksBefore=b.lockCounts();
  assert.throws(()=>b.context.approveBooking(b.action('invalid','ADVISORS')));
  assert.deepEqual(b.lockCounts(),locksBefore);
});

test('bulk approval verifies once, shares one booking read, and reports missing, stale and forbidden rows', () => {
  const b=backend();
  b.addBooking({});b.addBooking({BookingID:'BK2'});b.addBooking({BookingID:'BK3',AdvisorEmail:'other@kmitl.ac.th'});b.addBooking({BookingID:'BK4'});
  const result=b.context.changeBookings_({...b.action('dual@kmitl.ac.th','ADVISORS'),bookingIds:['BK1','BK2','BK1','BK3','BK4','missing'],expectedStatuses:{BK4:'รออนุมัติขั้นที่ 2'}},false,true);
  assert.equal(result.success,true);assert.deepEqual(Array.from(result.bookings,b=>b.BookingID),['BK1','BK2']);assert.equal(result.errors.length,3);
  assert.deepEqual([b.metrics.reads,b.metrics.writes,b.metrics.tokenChecks,b.metrics.tokenChecksUnderLock],[1,2,1,0]);
  assert.equal(b.rows[3][13],'รอที่ปรึกษาอนุมัติ');assert.equal(b.rows[4][13],'รอที่ปรึกษาอนุมัติ');
  assert.deepEqual(b.lockCounts(),[1,1]);
  assert.equal(b.context.changeBookings_({...b.action('dual@kmitl.ac.th','ADVISORS'),bookingIds:Array(201).fill('BK1')},false,true).success,false);
});

test('batch writes honor reordered columns and preserve unrelated values', () => {
  for(const adjacent of [true,false]) {
    const b=backend();b.addBooking({Note:'Preserve note',StudentID:'123'});
    // Move the approver column to either side of Status, or to the end.
    for(const row of b.rows) {
      const value=row.splice(14,1)[0];row.splice(adjacent?13:row.length,0,value);
    }
    const result=b.context.approveBooking(b.action('dual@kmitl.ac.th','ADVISORS'));
    assert.equal(result.booking.Status,'รออนุมัติขั้นที่ 2');assert.equal(result.booking.CurrentApproverName,'Head');
    const stored=b.context.getAllBookings()[0];assert.equal(stored.Note,'Preserve note');assert.equal(stored.StudentID,'123');
    assert.equal(b.metrics.writes,adjacent?1:2);
  }
});

test('init caches discovery reads, manual refresh bypasses it, and cached roles never authorize mutations', () => {
  const b=backend();
  b.context.getInitData();b.context.getInitData();assert.equal(b.metrics.initReads,1);
  b.context.getInitData(true);assert.equal(b.metrics.initReads,2);
  b.cache.set('kcib_init_v2','invalid json');b.context.getInitData();assert.equal(b.metrics.initReads,3);
  b.addBooking({});b.config.ADVISORS=[];
  assert.equal(b.context.getInitData().staffConfig.ADVISORS.length,1);
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','ADVISORS')).success,false);
  assert.equal(b.metrics.writes,0);
  b.context.CacheService.getScriptCache=()=>{throw new Error('Cache unavailable');};
  assert.equal(b.context.getInitData().inventory.length,2);
});

test('pending writes flush before releasing the lock, including on an interrupted batch', () => {
  const b=backend(),events=[];
  b.context.LockService.getScriptLock=()=>({waitLock:()=>events.push('lock'),releaseLock:()=>events.push('unlock')});
  b.context.SpreadsheetApp.flush=()=>events.push('flush');
  assert.throws(()=>b.context.withBookingLock_(()=>{throw new Error('write failed');}),/write failed/);
  assert.deepEqual(events,['lock','flush','unlock']);
});

test('display cache is bypassed by refresh and old reads cannot refill the cache after a mutation', () => {
  const b=backend();b.addBooking({});
  const old=b.context.getDisplayBookings_(false);b.context.getDisplayBookings_(false);assert.equal(b.metrics.reads,1);
  const oldKey=Array.from(b.cache.keys()).find(key=>key.startsWith('kcib_bookings_v1_'));
  b.context.approveBooking(b.action('dual@kmitl.ac.th','ADVISORS'));
  b.cache.set(oldKey,JSON.stringify(old)); // Simulate a delayed response storing an old snapshot.
  assert.equal(b.context.getDisplayBookings_(false)[0].Status,'รออนุมัติขั้นที่ 2');
  b.rows[1][13]='ปฏิเสธ';
  assert.equal(b.context.getDisplayBookings_(false)[0].Status,'รออนุมัติขั้นที่ 2');
  assert.equal(b.context.getDisplayBookings_(true)[0].Status,'ปฏิเสธ');
});

test('cancellation shares the mutation lock and invalidates the display cache', () => {
  const b=backend();b.addBooking({});b.context.getDisplayBookings_(false);
  assert.equal(b.context.cancelBooking({bookingId:'BK1',email:'student@kmitl.ac.th'}).success,true);
  assert.deepEqual(b.lockCounts(),[1,1]);assert.equal(b.context.getDisplayBookings_(false)[0].Status,'ยกเลิก');
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','ADVISORS')).success,false);
});
