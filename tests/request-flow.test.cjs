const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const booking=(id='BK1',Status='รอที่ปรึกษาอนุมัติ')=>({BookingID:id,Status,AdvisorEmail:'advisor@kmitl.ac.th'});
function client(fetch) {
  let now=Date.parse('2026-10-22T03:00:00Z');
  class ClockDate extends Date { constructor(...args) { super(...(args.length?args:[now])); } static now(){return now;} }
  const storage=new Map(),elements=new Map();
  const sandbox={URL,Date:ClockDate,Set,Map,console,fetch,uiIcon:()=>'',t:key=>key,confirm:()=>true,
    SCRIPT_URL:'https://mock.invalid/exec',GSHEET_URL:'https://mock.invalid/sheet',
    document:{getElementById:id=>elements.get(id)||null,querySelector:()=>null,querySelectorAll:()=>[]},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},sessionStorage:{setItem:()=>{}}};
  sandbox.window=sandbox;
  const context=vm.createContext(sandbox);
  const source=fs.readFileSync('js/booking-rules.js','utf8')+'\n'+fs.readFileSync('js/app.js','utf8').replace(/App\.boot\(\);\s*$/,'');
  vm.runInContext(source,context);
  context.showToast=()=>{};
  const app=context.App;
  app.state.user={email:'advisor@kmitl.ac.th',role:'ADVISORS'};
  app.state.staffConfig={ADVISORS:[{email:'advisor@kmitl.ac.th'}]};
  app._renderDashboardData=()=>{};
  return {app,context,elements,storage,advance:ms=>{now+=ms;},now:()=>now};
}
const response=data=>({ok:true,status:200,json:async()=>data});

test('notifications use one authenticated compact summary, cache an empty result and expire after thirty seconds',async()=>{
  const gate=deferred(),calls=[];
  const {app,storage,advance}=client(async(url,options)=>{calls.push({url,options});return response(await gate.promise);});
  storage.set('kcib_token','verified-token');
  storage.set('kcib_notif_seen',JSON.stringify({old:'approved'}));
  const first=app._loadNotifData(),second=app._loadNotifData();
  assert.equal(first,second);assert.equal(calls.length,1);
  const payload=JSON.parse(calls[0].options.body);
  assert.equal(calls[0].options.method,'POST');
  assert.equal(payload.action,'getNotifications');assert.equal(payload.idToken,'verified-token');assert.equal(payload.activeRole,'ADVISORS');
  assert.deepEqual(payload.seen,{old:'approved'});
  gate.resolve({count:0,items:[],readState:{}});await Promise.all([first,second]);
  assert.equal(app._notifCount,0);assert.equal(app.state.bookings.length,0);assert.equal(app._allBookings.length,0);
  await app._loadNotifData();advance(29999);await app._loadNotifData();assert.equal(calls.length,1);
  advance(1);await app._loadNotifData();assert.equal(calls.length,2);
});

test('availability scopes one compact read to an item and day, sharing empty results and their actual fetch time',async()=>{
  const gate=deferred(),calls=[];
  const {app,advance,now}=client(async url=>{calls.push(new URL(url));return response(await gate.promise);});
  const args=['item-A','2026-10-27','2026-10-28'];
  const first=app._fetchAvailability(...args),second=app._fetchAvailability(...args);
  assert.equal(first,second);assert.equal(calls.length,1);
  const params=calls[0].searchParams;
  assert.equal(params.get('func'),'getAvailability');assert.equal(params.get('itemId'),'item-A');
  assert.equal(params.get('from'),args[1]);assert.equal(params.get('to'),args[2]);assert.equal(params.has('refresh'),false);
  advance(100);gate.resolve({bookings:[]});const snapshot=await first;
  assert.equal(snapshot.bookings.length,0);assert.equal(snapshot.fetchedAt,now());
  advance(9999);assert.equal(await app._fetchAvailability(...args),snapshot);assert.equal(calls.length,1);
  advance(1);const fresh=await app._fetchAvailability(...args);assert.equal(calls.length,2);assert.equal(fresh.fetchedAt,now());
});

test('availability keys include item, date window and identity and keep only the latest twenty windows',async()=>{
  let calls=0;
  const {app}=client(async()=>{calls++;return response({bookings:[]});});
  await app._fetchAvailability('item-A','2026-10-27','2026-10-28');
  await app._fetchAvailability('item-A','2026-10-27','2026-10-29');
  app.state.user.role='HEAD_DEPT';await app._fetchAvailability('item-A','2026-10-27','2026-10-28');
  app.state.user.email='other@kmitl.ac.th';await app._fetchAvailability('item-A','2026-10-27','2026-10-28');
  assert.equal(calls,4);
  for(let i=0;i<21;i++)await app._fetchAvailability('item-'+i,'2026-10-27','2026-10-28');
  assert.equal(app._availabilityCache.size,20);
  const before=calls;await app._fetchAvailability('item-0','2026-10-27','2026-10-28');assert.equal(calls,before+1);
});

test('explicit availability refresh wins over an older read and invalidation or user changes discard late data',async()=>{
  const gates=[deferred(),deferred(),deferred(),deferred()],calls=[];
  const {app,context}=client(async url=>{const i=calls.length;calls.push(new URL(url));return response(await gates[i].promise);});
  const args=['item-A','2026-10-27','2026-10-28'];
  const old=app._fetchAvailability(...args),fresh=app._fetchAvailability(...args,true);
  assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get('refresh'),'1');
  assert.equal(app._fetchAvailability(...args),fresh);
  gates[1].resolve({bookings:[{ItemID:'item-A'}]});const snapshot=await fresh;
  gates[0].resolve({bookings:[]});assert.equal(await old,null);assert.equal(await app._fetchAvailability(...args),snapshot);
  let invalidated=0;context.CalendarUI={invalidate(){invalidated++;}};
  const pending=app._fetchAvailability('item-B',args[1],args[2]);app._invalidateReadCaches();
  gates[2].resolve({bookings:[]});assert.equal(await pending,null);assert.equal(app._availabilityCache.size,0);assert.equal(invalidated,1);
  const changed=app._fetchAvailability('item-C',args[1],args[2]);app.state.user.email='other@kmitl.ac.th';
  gates[3].resolve({bookings:[]});assert.equal(await changed,null);assert.equal(app._availabilityCache.size,0);
});

test('a read after invalidation starts a new request even when the same URL was already in flight',async()=>{
  const gates=[deferred(),deferred()];let calls=0;
  const {app}=client(async()=>{const index=calls++;return response(await gates[index].promise);});
  const args=['item-A','2026-10-27','2026-10-28'];
  const old=app._fetchAvailability(...args);app._invalidateReadCaches();const fresh=app._fetchAvailability(...args);
  assert.equal(calls,2);
  gates[0].resolve({bookings:[{ItemID:'stale'}]});assert.equal(await old,null);
  assert.equal(app._fetchAvailability(...args),fresh);
  gates[1].resolve({bookings:[{ItemID:'current'}]});const snapshot=await fresh;
  assert.equal(snapshot.bookings[0].ItemID,'current');assert.equal(await app._fetchAvailability(...args),snapshot);
});

function cartClient(fetch) {
  const result=client(fetch),{app,elements}=result;
  const fields={date:'2026-10-27',duration:'1',qty:'1',end:'2026-10-29',start_time:'09:00',end_time:'16:00'};
  for(const [name,value] of Object.entries(fields))elements.set('ci_0_'+name,{value});
  elements.set('ci_0_slots',{innerHTML:'',querySelector:selector=>selector==='.selected'?null:{},querySelectorAll:()=>[]});
  elements.set('ci_0_slots_group',{style:{}});elements.set('ci_0_availability',{innerHTML:''});
  app.state.cart=[{item:{id:'oven',name:'Oven',category:'instrument',maxQty:4}}];
  return result;
}

test('timed duration and quantity changes reuse a day snapshot, while custom hours reuse the inclusive date window',async()=>{
  const calls=[];
  const {app,elements,advance}=cartClient(async url=>{calls.push(new URL(url));return response({bookings:[]});});
  await app._cartDateChange('ci_0','2026-10-27');const checkedAt=app.state.cart[0].bookingsFetchedAt;
  advance(1500);elements.get('ci_0_duration').value='2';await app._cartDateChange('ci_0','2026-10-27');
  elements.get('ci_0_qty').value='2';await app._cartDateChange('ci_0','2026-10-27');
  assert.equal(calls.length,1);assert.equal(app.state.cart[0].bookingsFetchedAt,checkedAt);
  elements.get('ci_0_duration').value='custom';await app._checkCustomAvailability('ci_0');
  assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get('from'),'2026-10-27');assert.equal(calls[1].searchParams.get('to'),'2026-10-30');
  elements.get('ci_0_start_time').value='10:00';await app._checkCustomAvailability('ci_0');
  assert.equal(calls.length,2);assert.ok(calls.every(url=>url.searchParams.get('func')==='getAvailability'&&!url.searchParams.has('refresh')));
});

test('an availability retry explicitly bypasses caches instead of downloading booking history',async()=>{
  const calls=[];
  const {app,context,elements}=cartClient(async url=>{calls.push(new URL(url));if(calls.length===1)throw new Error('Offline');return response({bookings:[]});});
  await app._cartDateChange('ci_0','2026-10-27');
  const handler=elements.get('ci_0_availability').innerHTML.match(/onclick="([^"]+)"/)[1];
  await vm.runInContext(handler,context);
  assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get('refresh'),'1');assert.equal(calls[1].searchParams.get('func'),'getAvailability');
});

test('notification identity changes and invalidation prevent old summaries from changing the badge',async()=>{
  const gates=[deferred(),deferred(),deferred()],calls=[];
  const {app}=client(async(url,options)=>{const i=calls.length;calls.push(JSON.parse(options.body));return response(await gates[i].promise);});
  const old=app._loadNotifData();app.state.user.role='HEAD_DEPT';const current=app._loadNotifData();
  gates[1].resolve({count:2,items:[{BookingID:'current'}],readState:{}});await current;
  gates[0].resolve({count:99,items:[{BookingID:'old'}],readState:{}});assert.equal(await old,null);assert.equal(app._notifCount,2);
  assert.equal(calls[0].activeRole,'ADVISORS');assert.equal(calls[1].activeRole,'HEAD_DEPT');
  const late=app._loadNotifData(true);app._invalidateReadCaches();gates[2].resolve({count:99,items:[],readState:{}});assert.equal(await late,null);assert.equal(app._notifCount,2);assert.equal(app._notifSummary,null);
});

test('marking student notifications read merges every summary status and preserves unrelated seen history',async()=>{
  let calls=0;
  const {app,storage}=client(async()=>{calls++;return response({count:12,items:[{BookingID:'visible'}],readState:{visible:'approved',outsideTopTen:'rejected'}});});
  app.state.user={email:'student@kmitl.ac.th',role:'STUDENT'};
  storage.set('kcib_notif_seen',JSON.stringify({older:'approved'}));
  await app._loadNotifData();app._markNotifsRead();
  assert.deepEqual(JSON.parse(storage.get('kcib_notif_seen')),{older:'approved',visible:'approved',outsideTopTen:'rejected'});
  assert.equal(app._notifCount,0);assert.equal(app._notifSummary.items.length,0);await app._loadNotifData();assert.equal(calls,1);assert.equal(app._notifCount,0);
  app.state.user.role='ADVISORS';await app._loadNotifData();app._markNotifsRead();assert.equal(app._notifSummary.items.length,1);assert.equal(app._notifCount,0);
});

test('a summary refresh cannot resurrect notifications after marking the visible summary read',async()=>{
  const gate=deferred();let calls=0;
  const {app}=client(async()=>{calls++;return response(calls===1?{count:1,items:[{BookingID:'one'}],readState:{one:'approved'}}:await gate.promise);});
  app.state.user.role='STUDENT';await app._loadNotifData();const pending=app._loadNotifData(true);app._markNotifsRead();
  gate.resolve({count:1,items:[{BookingID:'one'}],readState:{one:'approved'}});assert.equal(await pending,null);
  assert.equal(app._notifCount,0);assert.equal(app._notifSummary.items.length,0);await app._loadNotifData();assert.equal(calls,2);
});

test('notification dropdown renders only compact summary items and never reads full history',async()=>{
  const calls=[];
  const {app,context,elements}=client(async(url,options)=>{calls.push(JSON.parse(options.body).action);return response({count:1,items:[{BookingID:'summary',ItemName:'Summary item',Name:'Requester',Status:'pending'}],readState:{}});});
  app._allBookings=[{ItemName:'Full history item'}];app.state.bookings=[{ItemName:'Personal history item'}];
  context.document.createElement=()=>({style:{},remove(){elements.delete(this.id);}});
  context.document.body={appendChild:el=>elements.set(el.id,el)};context.document.addEventListener=()=>{};context.setTimeout=fn=>fn();
  await app._toggleNotifDropdown({stopPropagation(){}});
  assert.deepEqual(calls,['getNotifications']);
  const html=elements.get('notif-dropdown').innerHTML;assert.match(html,/Summary item/);assert.doesNotMatch(html,/Full history item|Personal history item/);
  assert.match(html,/notif-mark-read/);
  await app._toggleNotifDropdown({stopPropagation(){}});
  app.state.user.role='VIEWERS';await app._toggleNotifDropdown({stopPropagation(){}});
  const recent=elements.get('notif-dropdown').innerHTML;assert.match(recent,/notif.recentBookings/);assert.doesNotMatch(recent,/notif-mark-read|notif-item unread/);
});

test('my bookings deduplicate reads and retain an empty loaded result until refresh or identity invalidation',async()=>{
  const gate=deferred(),calls=[];
  const {app,elements}=client(async url=>{calls.push(new URL(url));return response(await gate.promise);});
  elements.set('bookings-list',{innerHTML:''});let renders=0;app._renderBookingsList=()=>{renders++;};
  const first=app._fetchAndRenderMyBookings(),second=app._fetchAndRenderMyBookings();assert.equal(calls.length,1);
  gate.resolve([]);await Promise.all([first,second]);await app._fetchAndRenderMyBookings();assert.equal(calls.length,1);assert.equal(renders,3);
  await app._fetchAndRenderMyBookings(true);assert.equal(calls.length,2);assert.equal(calls[1].searchParams.get('refresh'),'1');
  app.state.user.email='other@kmitl.ac.th';await app._fetchAndRenderMyBookings();assert.equal(calls.length,3);
  app._invalidateReadCaches();await app._fetchAndRenderMyBookings();assert.equal(calls.length,4);
});

test('a personal history response from a previous user cannot populate the current user bookings',async()=>{
  const gate=deferred();
  const {app,elements}=client(async()=>response(await gate.promise));elements.set('bookings-list',{innerHTML:''});
  app._renderBookingsList=()=>{throw new Error('Stale user data must not render');};
  const pending=app._fetchAndRenderMyBookings();app.state.user={email:'other@kmitl.ac.th',role:'STUDENT'};
  gate.resolve([booking()]);await pending;assert.equal(app.state.bookings.length,0);assert.equal(app._myBookingsLoadedFor,undefined);
});

test('fresh student history updates the compact notification summary without another POST or a stale badge overwrite',async()=>{
  const summaryGate=deferred(),calls=[];
  const history=Array.from({length:12},(_,i)=>({BookingID:'unread-'+i,ItemName:'Item '+i,Status:i===0?'ปฏิเสธ':'อนุมัติแล้ว',PrivateField:'excluded'}));
  history.push({BookingID:'seen',ItemName:'Read item',Status:'อนุมัติแล้ว'},
    {BookingID:'cancelled',Status:'ยกเลิก'},{BookingID:'pending',Status:'รอที่ปรึกษาอนุมัติ'});
  const {app,storage,elements,now}=client(async(url,options)=>{
    calls.push(options?.method==='POST'?'summary':new URL(url).searchParams.get('func'));
    return response(options?.method==='POST'?await summaryGate.promise:history);
  });
  app.state.user={email:'student@kmitl.ac.th',role:'STUDENT'};
  storage.set('kcib_notif_seen',JSON.stringify({seen:'อนุมัติแล้ว',older:'ปฏิเสธ'}));
  elements.set('bookings-list',{innerHTML:''});app._renderBookingsList=()=>{};
  const staleSummary=app._loadNotifData();await app._fetchAndRenderMyBookings();
  assert.deepEqual(calls,['summary','getMyBookings']);assert.equal(app._notifCount,12);assert.equal(app._notifSummary.items.length,10);
  assert.equal(Object.keys(app._notifSummary.readState).length,13);assert.equal(app._notifSummary.readState['unread-11'],'อนุมัติแล้ว');
  assert.equal(app._notificationCache.fetchedAt,now());
  assert.deepEqual(Object.keys(app._notifSummary.items[0]).sort(),['BookingID','ItemName','Status']);
  summaryGate.resolve({count:99,items:[],readState:{}});assert.equal(await staleSummary,null);assert.equal(app._notifCount,12);
  await app._loadNotifData();assert.equal(calls.length,2);
  app._markNotifsRead();const seen=JSON.parse(storage.get('kcib_notif_seen'));assert.equal(seen['unread-11'],'อนุมัติแล้ว');assert.equal(seen.older,'ปฏิเสธ');
  assert.equal(app._notifCount,0);assert.equal(app._notifSummary.items.length,0);
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
