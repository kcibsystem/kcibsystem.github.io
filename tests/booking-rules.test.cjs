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
  const sheet = {
    getDataRange: () => ({getValues:()=>rows.map(row=>row.slice())}),
    getRange: (r,c,rs=1,cs=1) => ({
      getValues:()=>Array.from({length:rs},(_,i)=>Array.from({length:cs},(_,j)=>rows[r+i-1]?.[c+j-1] ?? '')),
      getValue:()=>rows[r-1]?.[c-1] ?? '',
      setValue:value=>{rows[r-1] ||= [];rows[r-1][c-1]=value;}
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
  let locks = 0, releases = 0;
  const context = vm.createContext({
    Date:FixedDate, console,
    SpreadsheetApp:{openById:()=>({getSheetByName:()=>sheet})},
    LockService:{getScriptLock:()=>({waitLock:()=>locks++,releaseLock:()=>releases++})},
    Utilities:{getUuid:()=>String(rows.length),formatDate:d=>new Date(d.getTime()+7*3600000).toISOString().slice(0,19)},
    UrlFetchApp:{fetch:url=>({getResponseCode:()=>url.endsWith('invalid')?401:200,getContentText:()=>JSON.stringify({
      email:decodeURIComponent(url.split('=').pop()), aud:'334956664737-s7e0dirg9bfni63lr19qaogoc6cqmhum.apps.googleusercontent.com',
      iss:'https://accounts.google.com',email_verified:'true',exp:2000000000
    })})}
  });
  vm.runInContext(rulesSource + '\n' + fs.readFileSync('code.gs','utf8'), context);
  context.getStaffConfig = () => config;
  context.getInventory = () => [item,{...item,ID:'glass',Category:'glassware',ItemName:'Beaker'}];
  context.getHolidays = () => [];
  context.applyRowFormat_ = () => {};
  const addBooking = overrides => {
    const obj = {BookingID:'BK1',Email:'student@kmitl.ac.th',AdvisorEmail:'dual@kmitl.ac.th',Status:'รอที่ปรึกษาอนุมัติ',ItemID:'one',Quantity:1,Start:minStart,End:'2026-10-23T12:00:00',...overrides};
    rows.push(headers.map(key=>obj[key]??''));
    return obj;
  };
  const action = (email,activeRole) => ({bookingId:'BK1',idToken:email,activeRole,staffEmail:'spoof@kmitl.ac.th'});
  return {context,rows,config,addBooking,action,lockCounts:()=>[locks,releases]};
}

test('backend validates canonical inventory and rejects forged schedules, lead-time and oversubscription', () => {
  const b = backend();
  const data = {itemId:'one',start:minStart,end:'2026-10-23T12:00:00',quantity:1,advisorEmail:'dual@kmitl.ac.th'};
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

test('dual-role teacher selects existing role; advisor then head approve without a staff approval step', () => {
  const b = backend(); b.addBooking({});
  assert.deepEqual(Array.from(rules.rolesFor('DUAL@kmitl.ac.th',b.config)),['ADVISORS','HEAD_DEPT']);
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','HEAD_DEPT')).success,false);
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','ADVISORS')).success,true);
  assert.equal(b.rows[1][13],'รออนุมัติขั้นที่ 2');
  assert.equal(b.context.approveBooking(b.action('dual@kmitl.ac.th','HEAD_DEPT')).success,true);
  assert.equal(b.rows[1][13],'อนุมัติแล้ว');
});

test('staff can only acknowledge, with correct course role and audit data; duplicate ack is rejected', () => {
  const b = backend(); b.addBooking({Status:'อนุมัติแล้ว'});
  assert.equal(b.context.approveBooking(b.action('staff@kmitl.ac.th','STAFF_FLOOR_1')).success,false);
  assert.equal(b.context.rejectBooking(b.action('staff@kmitl.ac.th','STAFF_FLOOR_1')).success,false);
  assert.equal(b.context.rejectBooking(b.action('staff@kmitl.ac.th','ADVISORS')).success,false);
  assert.equal(b.context.acknowledgeBooking(b.action('tp2@kmitl.ac.th','STAFF_PROJECT_2')).success,false);
  assert.equal(b.context.acknowledgeBooking(b.action('staff@kmitl.ac.th','STAFF_FLOOR_1')).success,true);
  assert.equal(b.rows[1][b.rows[0].indexOf('StaffAcknowledgedBy')],'staff@kmitl.ac.th');
  assert(b.rows[1][b.rows[0].indexOf('StaffAcknowledgedAt')]);
  assert.equal(b.context.acknowledgeBooking(b.action('staff@kmitl.ac.th','STAFF_FLOOR_1')).success,false);
});

test('legacy staff queue remains approved and supports acknowledgement; token verification cannot be bypassed', () => {
  const b = backend(); b.addBooking({Status:'รออนุมัติขั้นที่ 3',Course:'TEAM PROJECT 2'});
  assert.throws(()=>b.context.approveBooking({bookingId:'BK1',staffEmail:'dual@kmitl.ac.th',activeRole:'HEAD_DEPT'}));
  assert.throws(()=>b.context.acknowledgeBooking(b.action('invalid','STAFF_PROJECT_2')));
  assert.equal(b.context.acknowledgeBooking(b.action('viewer@kmitl.ac.th','VIEWERS')).success,false);
  assert.equal(b.context.acknowledgeBooking(b.action('tp2@kmitl.ac.th','STAFF_PROJECT_2')).success,true);
  assert.equal(b.rows[1][13],'อนุมัติแล้ว');
});
