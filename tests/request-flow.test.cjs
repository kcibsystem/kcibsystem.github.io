const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const booking=(id='BK1',Status='รอที่ปรึกษาอนุมัติ')=>({BookingID:id,Status,AdvisorEmail:'advisor@kmitl.ac.th'});
function client(fetch) {
  const sandbox={URL,Date,Set,Map,console,fetch,uiIcon:()=>'',t:key=>key,confirm:()=>true,
    SCRIPT_URL:'https://mock.invalid/exec',GSHEET_URL:'https://mock.invalid/sheet',
    document:{getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[]},
    localStorage:{getItem:()=>null},sessionStorage:{setItem:()=>{}}};
  sandbox.window=sandbox;
  const context=vm.createContext(sandbox);
  const source=fs.readFileSync('js/booking-rules.js','utf8')+'\n'+fs.readFileSync('js/app.js','utf8').replace(/App\.boot\(\);\s*$/,'');
  vm.runInContext(source,context);
  context.showToast=()=>{};
  const app=context.App;
  app.state.user={email:'advisor@kmitl.ac.th',role:'ADVISORS'};
  app.state.staffConfig={ADVISORS:[{email:'advisor@kmitl.ac.th'}]};
  app._renderDashboardData=()=>{};
  return {app,context};
}
const response=data=>({ok:true,status:200,json:async()=>data});

test('dashboard and notification reads share an in-flight request, including an empty result',async()=>{
  const gate=deferred();let calls=0;
  const {app}=client(async()=>{calls++;return response(await gate.promise);});
  const dashboard=app._fetchAllBookings(),notification=app._loadNotifData();
  assert.equal(calls,1);gate.resolve([]);await Promise.all([dashboard,notification]);
  assert.equal(app._bookingsRequest,null);
  // A later explicit read is fresh rather than reusing a completed promise forever.
  await app._fetchAllBookings();assert.equal(calls,2);
});

test('a forced read bypasses an older display request and late reads cannot undo a confirmed mutation',async()=>{
  const old=deferred(),fresh=deferred();let calls=0;
  const {app}=client(async url=>{calls++;return response(await (new URL(url).searchParams.get('refresh')==='1'?fresh.promise:old.promise));});
  const oldRead=app._fetchAllBookings(),newRead=app._fetchAllBookings(true);
  assert.equal(calls,2);fresh.resolve([booking('BK1','รออนุมัติขั้นที่ 2')]);await newRead;
  old.resolve([booking()]);await oldRead;assert.equal(app._allBookings[0].Status,'รออนุมัติขั้นที่ 2');
  const late=deferred();
  const another=client(async()=>response(await late.promise)).app;
  another._allBookings=[booking()];const lateRead=another._fetchAllBookings();
  another._applyBookingUpdate(booking('BK1','รออนุมัติขั้นที่ 2'));late.resolve([booking()]);await lateRead;
  assert.equal(another._allBookings[0].Status,'รออนุมัติขั้นที่ 2');
});

test('approval blocks duplicate submissions, updates only after confirmation, and makes no follow-up GET',async()=>{
  const gate=deferred(),calls=[];
  const {app,context}=client(async(url,options)=>{calls.push(options);return response(await gate.promise);});
  app._allBookings=[booking()];const first=app._approveBooking('BK1');await app._approveBooking('BK1');
  assert.equal(calls.length,1);assert.equal(app._allBookings[0].Status,'รอที่ปรึกษาอนุมัติ');assert(app._bookingAction);
  gate.resolve({success:true,booking:booking('BK1','รออนุมัติขั้นที่ 2')});await first;
  assert.equal(calls.length,1);assert.equal(calls[0].method,'POST');assert.equal(app._allBookings[0].Status,'รออนุมัติขั้นที่ 2');assert.equal(app._bookingAction,null);
  context.fetch=async()=>({ok:false,status:503});app._allBookings=[booking()];await app._approveBooking('BK1');
  assert.equal(app._allBookings[0].Status,'รอที่ปรึกษาอนุมัติ');assert.equal(app._bookingAction,null);
});

test('bulk approval uses one POST and preserves failed rows while applying confirmed successes',async()=>{
  const calls=[];
  const {app}=client(async(url,options)=>{calls.push(JSON.parse(options.body));return response({success:true,bookings:[booking('BK1','รออนุมัติขั้นที่ 2')],errors:[{bookingId:'BK2',error:'Status changed'}]});});
  app._allBookings=[booking(),booking('BK2')];await app._approveAllPending();
  assert.equal(calls.length,1);assert.equal(calls[0].action,'approveBookings');assert.deepEqual(calls[0].bookingIds,['BK1','BK2']);
  assert.equal(app._allBookings[0].Status,'รออนุมัติขั้นที่ 2');assert.equal(app._allBookings[1].Status,'รอที่ปรึกษาอนุมัติ');assert.equal(app._bookingAction,null);
});
